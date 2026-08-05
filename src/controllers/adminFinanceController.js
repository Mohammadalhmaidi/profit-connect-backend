const PlatformPayment = require('../models/PlatformPayment');
const Withdrawal = require('../models/Withdrawal');
const User = require('../models/User');
const MoneyTransaction = require('../models/MoneyTransaction');
const Setting = require('../models/Setting');
const { releasePayment, refundPayment } = require('../services/moneyService');

// مساعدة: إرسال إشعار لمستخدم محدد (مع حقول إضافية اختيارية)
async function pushNotification(userId, type, message, extra = {}) {
  await User.findByIdAndUpdate(userId, {
    $push: { notifications: { type, message, read: false, ...extra } },
  });
}

// ============================================================
// النظام المالي للمنصة (المحافظ والإسكرو والسحوبات)
// ============================================================

// @desc    نظرة عامة مالية (إجمالي المحجوز، العمولات، السحوبات...)
// @route   GET /api/admin/finance/overview
// @access  Private/Admin
exports.getFinanceOverview = async (req, res) => {
  try {
    const [holdingAgg, releasedAgg, pendingWithdrawals, refundedAgg, withdrawalsStats] = await Promise.all([
      PlatformPayment.aggregate([
        { $match: { status: 'held' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      PlatformPayment.aggregate([
        { $match: { status: 'released' } },
        { $group: { _id: null, fees: { $sum: '$fee' }, released: { $sum: '$netAmount' } } },
      ]),
      Withdrawal.aggregate([
        { $match: { status: 'pending' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
      PlatformPayment.aggregate([
        { $match: { status: 'refunded' } },
        { $group: { _id: null, total: { $sum: '$amount' } } },
      ]),
      Withdrawal.aggregate([
        { $match: { status: 'processed' } },
        { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
      ]),
    ]);

    const setting = await Setting.findOne({ key: 'platformFeePercent' });

    res.status(200).json({
      success: true,
      data: {
        platformHolding: holdingAgg[0]?.total || 0,        // أموال محجوزة لدى المنصة (Escrow)
        pendingWithdrawals: pendingWithdrawals[0]?.total || 0,
        pendingWithdrawalsCount: pendingWithdrawals[0]?.count || 0,
        totalFees: releasedAgg[0]?.fees || 0,              // إيراد المنصة من العمولات
        totalReleased: releasedAgg[0]?.released || 0,      // إجمالي ما تم تحريره للمستخدمين
        totalRefunded: refundedAgg[0]?.total || 0,         // إجمالي الاسترجاعات
        totalWithdrawn: withdrawalsStats[0]?.total || 0,   // إجمالي السحوبات المنفذة
        platformFeePercent: setting ? Number(setting.value) : 10,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب النظرة المالية' });
  }
};

// @desc    قائمة طلبات السحب (مع فلترة حسب الحالة)
// @route   GET /api/admin/finance/withdrawals
// @access  Private/Admin
exports.getWithdrawals = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [withdrawals, total] = await Promise.all([
      Withdrawal.find(filter)
        .populate('user', 'email profile.firstName profile.lastName username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      Withdrawal.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, count: withdrawals.length, total, data: withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب طلبات السحب' });
  }
};

// @desc    موافقة أو رفض طلب سحب
// @route   PUT /api/admin/finance/withdrawals/:id
// @access  Private/Admin
exports.reviewWithdrawal = async (req, res) => {
  try {
    const { action, note } = req.body;

    if (!['approve', 'reject'].includes(action)) {
      return res.status(400).json({ success: false, message: 'إجراء غير صالح (approve/reject)' });
    }

    const withdrawal = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      {
        status: action === 'approve' ? 'processed' : 'rejected',
        adminNote: note || '',
        processedAt: new Date(),
      },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(400).json({ success: false, message: 'الطلب غير موجود أو تمت معالجته من قبل' });
    }

    // عند الموافقة: يخرج المبلغ من المحجوز نهائياً (تم السحب الفعلي)
    // عند الرفض: يُعاد المبلغ إلى الرصيد المتاح
    const inc = action === 'approve'
      ? { 'wallet.holding': -withdrawal.amount, 'wallet.totalWithdrawn': withdrawal.amount }
      : { 'wallet.holding': -withdrawal.amount, 'wallet.balance': withdrawal.amount };

    const user = await User.findByIdAndUpdate(withdrawal.user, { $inc: inc }, { new: true });

    await MoneyTransaction.create({
      user: withdrawal.user,
      type: action === 'approve' ? 'withdraw_processed' : 'withdraw_refund',
      amount: action === 'approve' ? 0 : withdrawal.amount,
      balanceAfter: user.wallet.balance,
      withdrawal: withdrawal._id,
      description: action === 'approve' ? 'تم تنفيذ طلب السحب' : 'تم رفض طلب السحب وإعادة المبلغ',
    });

    await pushNotification(
      withdrawal.user,
      action === 'approve' ? 'withdrawal_approved' : 'withdrawal_rejected',
      action === 'approve'
        ? 'تم تنفيذ طلب السحب بنجاح، سيصلك المبلغ على حسابك البنكي'
        : `تم رفض طلب السحب${note ? ` (السبب: ${note})` : ''}، وأُعيد المبلغ لمحفظتك`,
      { withdrawalId: withdrawal._id, amount: withdrawal.amount }
    );

    res.status(200).json({
      success: true,
      message: action === 'approve' ? 'تمت الموافقة على طلب السحب' : 'تم رفض طلب السحب',
      data: withdrawal,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء معالجة طلب السحب' });
  }
};

// @desc    قائمة الدفعات المحجوزة/المحررة (مع فلترة)
// @route   GET /api/admin/finance/payments
// @access  Private/Admin
exports.getPayments = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 20;
    const skip = (page - 1) * limit;

    const filter = {};
    if (req.query.status) filter.status = req.query.status;

    const [payments, total] = await Promise.all([
      PlatformPayment.find(filter)
        .populate('project', 'title status')
        .populate('payer', 'email profile.firstName profile.lastName')
        .populate('payee', 'email profile.firstName profile.lastName')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit),
      PlatformPayment.countDocuments(filter),
    ]);

    res.status(200).json({ success: true, count: payments.length, total, data: payments });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب الدفعات' });
  }
};

// @desc    تحرير دفعة يدوياً من لوحة الأدمن
// @route   POST /api/admin/finance/payments/:id/release
// @access  Private/Admin
exports.forceRelease = async (req, res) => {
  try {
    const result = await releasePayment(req.params.id);
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
      'تم تحرير الدفعة من الحساب الضامن',
      { paymentId: result.payment._id, projectId: result.payment.project, amount: result.payment.amount, method: result.payment.method }
    );

    res.status(200).json({ success: true, message: 'تم تحرير الدفعة', data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحرير الدفعة' });
  }
};

// @desc    استرجاع دفعة (إلغاء/نزاع) — تُعاد لمحفظة الدافع
// @route   POST /api/admin/finance/payments/:id/refund
// @access  Private/Admin
exports.forceRefund = async (req, res) => {
  try {
    const result = await refundPayment(req.params.id);
    if (result.error) {
      return res.status(400).json({ success: false, message: result.error });
    }

    await pushNotification(
      result.payment.payer,
      'payment_refunded',
      `تم استرجاع دفعة بمبلغ ${result.payment.amount} إلى محفظتك`,
      { paymentId: result.payment._id, projectId: result.payment.project, amount: result.payment.amount, method: result.payment.method }
    );
    await pushNotification(
      result.payment.payee,
      'payment_refunded',
      'تم استرجاع دفعة من الحساب الضامن',
      { paymentId: result.payment._id, projectId: result.payment.project, amount: result.payment.amount, method: result.payment.method }
    );

    res.status(200).json({ success: true, message: 'تم استرجاع الدفعة لمحفظة الدافع', data: result });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء استرجاع الدفعة' });
  }
};

// @desc    تحديث إعدادات المنصة المالية (نسبة العمولة)
// @route   PUT /api/admin/finance/settings
// @access  Private/Admin
exports.updateSettings = async (req, res) => {
  try {
    const { platformFeePercent } = req.body;

    if (platformFeePercent === undefined || platformFeePercent < 0 || platformFeePercent > 100) {
      return res.status(400).json({ success: false, message: 'نسبة العمولة يجب أن تكون بين 0 و 100' });
    }

    await Setting.findOneAndUpdate(
      { key: 'platformFeePercent' },
      { value: platformFeePercent },
      { upsert: true }
    );

    res.status(200).json({
      success: true,
      message: 'تم تحديث إعدادات المنصة',
      data: { platformFeePercent },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء تحديث الإعدادات' });
  }
};
