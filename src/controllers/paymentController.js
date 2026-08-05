const PlatformPayment = require('../models/PlatformPayment');
const Project = require('../models/Project');
const Proposal = require('../models/Proposal');
const User = require('../models/User');
const { releasePayment: releaseCore } = require('../services/moneyService');

const isValidId = (id) => /^[0-9a-fA-F]{24}$/.test(id);

// مساعدة: إرسال إشعار لمستخدم محدد (مع حقول إضافية اختيارية)
async function pushNotification(userId, type, message, extra = {}) {
  await User.findByIdAndUpdate(userId, {
    $push: { notifications: { type, message, read: false, ...extra } },
  });
}

// ============================================================
// الدفعات المالية (الحساب الضامن / Escrow)
// ============================================================

// @desc    إيداع دفعة في الحساب الضامن (Escrow)
// @route   POST /api/payments
// @access  Private (صاحب المشروع فقط)
// @body    projectId + (proposalId أو payeeId) + amount + method + note
exports.createDeposit = async (req, res) => {
  try {
    const { projectId, proposalId, payeeId, amount, method, note } = req.body;

    if (!isValidId(projectId)) {
      return res.status(400).json({ success: false, message: 'معرّف المشروع غير صالح' });
    }

    const PAYMENT_METHODS = ['PayPal', 'Visa', 'Mastercard', 'American Express', 'Apple Pay'];
    if (!method || !PAYMENT_METHODS.includes(method)) {
      return res.status(400).json({
        success: false,
        message: `طريقة الدفع غير صالحة — اختر واحدة من: ${PAYMENT_METHODS.join('، ')}`,
      });
    }

    const project = await Project.findById(projectId);
    if (!project) {
      return res.status(404).json({ success: false, message: 'المشروع غير موجود' });
    }

    // فقط صاحب المشروع يدفع
    if (project.client.toString() !== req.user.id) {
      return res.status(403).json({ success: false, message: 'أنت لست صاحب هذا المشروع' });
    }

    if (project.status === 'Completed' || project.status === 'Cancelled') {
      return res.status(400).json({ success: false, message: 'لا يمكن الدفع لمشروع منتهي أو ملغى' });
    }

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'مبلغ الدفعة غير صالح' });
    }

    // ===== تحديد المستلم (payee) =====
    // 1) عبر proposalId: الدفعة تُرسل تلقائياً لصاحب العرض المقبول
    // 2) أو عبر payeeId صريح (يجب أن يكون عضواً في الفريق)
    let payee;
    let proposal = null;

    if (proposalId) {
      if (!isValidId(proposalId)) {
        return res.status(400).json({ success: false, message: 'معرّف العرض غير صالح' });
      }
      proposal = await Proposal.findOne({ _id: proposalId, project: projectId });
      if (!proposal) {
        return res.status(404).json({ success: false, message: 'العرض غير موجود لهذا المشروع' });
      }
      if (proposal.status !== 'Accepted') {
        return res.status(400).json({ success: false, message: 'لا يمكن الدفع إلا لعرض مقبول' });
      }
      payee = proposal.freelancer.toString();
    } else if (payeeId) {
      if (!isValidId(payeeId)) {
        return res.status(400).json({ success: false, message: 'معرّف المستلم غير صالح' });
      }
      payee = payeeId;
    } else {
      return res.status(400).json({
        success: false,
        message: 'يجب تحديد العرض (proposalId) أو المستلم (payeeId)',
      });
    }

    // المستلم يجب أن يكون عضواً في فريق المشروع (وليس مرفوعاً منه)
    const member = project.team.find(
      (t) => t.freelancer.toString() === payee && t.status !== 'Removed'
    );
    if (!member) {
      return res.status(400).json({ success: false, message: 'المستلم يجب أن يكون عضواً في فريق المشروع' });
    }

    const payment = await PlatformPayment.create({
      project: projectId,
      payer: req.user.id,
      payee,
      proposal: proposal ? proposal._id : null,
      amount,
      method,
      note,
      status: 'held',
    });

    await pushNotification(
      payee,
      'payment_deposited',
      `تم إيداع دفعة لك في الحساب الضامن لمشروع «${project.title}»`,
      { paymentId: payment._id, projectId: project._id, projectName: project.title, amount, method }
    );

    res.status(201).json({
      success: true,
      message: 'تم إيداع الدفعة في الحساب الضامن بنجاح',
      data: payment,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إيداع الدفعة' });
  }
};

// @desc    الدفعات المتعلقة بي (مدفوعة أو مستلمة)
// @query   direction=received|sent ، status=held|released|refunded|cancelled
// @route   GET /api/payments
// @access  Private
exports.getMyPayments = async (req, res) => {
  try {
    const { direction, status } = req.query;

    const filter = {};
    if (direction === 'received') {
      filter.payee = req.user.id;            // دفعات وصلت لك (أنت المستلم)
    } else if (direction === 'sent') {
      filter.payer = req.user.id;            // دفعات أرسلتها (أنت الدافع)
    } else {
      filter.$or = [{ payer: req.user.id }, { payee: req.user.id }];
    }
    if (status) filter.status = status;

    const payments = await PlatformPayment.find(filter)
      .populate('project', 'title status')
      .populate('proposal', 'bidAmount deliveryTime status')
      .populate('payer', 'profile.firstName profile.lastName')
      .populate('payee', 'profile.firstName profile.lastName')
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: payments.length, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الدفعات' });
  }
};

// @desc    تحرير دفعة محجوزة إلى محفظة المستلم (اعتماد الإتمام)
// @route   PUT /api/payments/:id/release
// @access  Private (الدافع/العميل أو الأدمن)
exports.releasePayment = async (req, res) => {
  try {
    const payment = await PlatformPayment.findById(req.params.id);
    if (!payment) {
      return res.status(404).json({ success: false, message: 'الدفعة غير موجودة' });
    }

    // فقط الدافع (العميل) أو الأدمن يحرر الدفعة
    if (payment.payer.toString() !== req.user.id && req.user.role !== 'Admin') {
      return res.status(403).json({ success: false, message: 'غير مصرح لك بتحرير هذه الدفعة' });
    }

    const result = await releaseCore(payment._id);
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    await pushNotification(
      result.payment.payee,
      'payment_released',
      `تم تحرير دفعة بمبلغ ${result.payment.amount} إلى محفظتك، تحقق من رصيدك`,
      { paymentId: result.payment._id, projectId: result.payment.project, amount: result.payment.amount, method: result.payment.method }
    );
    await pushNotification(
      result.payment.payer,
      'payment_released',
      'تم تحرير الدفعة من الحساب الضامن إلى محفظة المستلم',
      { paymentId: result.payment._id, projectId: result.payment.project, amount: result.payment.amount, method: result.payment.method }
    );

    res.status(200).json({
      success: true,
      message: 'تم تحرير الدفعة إلى محفظة المستلم',
      data: result,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحرير الدفعة' });
  }
};
