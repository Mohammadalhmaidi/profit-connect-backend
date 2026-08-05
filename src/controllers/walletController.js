const User = require('../models/User');
const Withdrawal = require('../models/Withdrawal');
const MoneyTransaction = require('../models/MoneyTransaction');

// ============================================================
// المحفظة المالية
// ============================================================

// @desc    عرض محفظتي + سجل الحركات الأخيرة
// @route   GET /api/wallet
// @access  Private
exports.getWallet = async (req, res) => {
  try {
    const transactions = await MoneyTransaction.find({ user: req.user.id })
      .sort({ createdAt: -1 })
      .limit(30);

    res.status(200).json({
      success: true,
      data: {
        wallet: req.user.wallet,
        transactions,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب بيانات المحفظة' });
  }
};

// @desc    طلب سحب رصيد من المحفظة
// @route   POST /api/wallet/withdraw
// @access  Private
exports.requestWithdrawal = async (req, res) => {
  try {
    const { amount, method, accountDetails } = req.body;

    if (!amount || amount <= 0) {
      return res.status(400).json({ success: false, message: 'مبلغ السحب غير صالح' });
    }

    // إنشاء الطلب أولاً
    const withdrawal = await Withdrawal.create({
      user: req.user.id,
      amount,
      method: method || 'bank_transfer',
      accountDetails,
    });

    // خصم الرصيد وحجزه — شرط ذري يمنع سحب أكثر من الرصيد المتاح
    const user = await User.findOneAndUpdate(
      { _id: req.user.id, 'wallet.balance': { $gte: amount } },
      { $inc: { 'wallet.balance': -amount, 'wallet.holding': amount } },
      { new: true }
    );

    if (!user) {
      await Withdrawal.findByIdAndUpdate(withdrawal._id, {
        status: 'cancelled',
        adminNote: 'رصيد غير كافٍ',
      });
      return res.status(400).json({ success: false, message: 'رصيدك غير كافٍ لتنفيذ هذا السحب' });
    }

    await MoneyTransaction.create({
      user: req.user.id,
      type: 'withdraw',
      amount: -amount,
      balanceAfter: user.wallet.balance,
      withdrawal: withdrawal._id,
      description: 'طلب سحب رصيد (قيد المراجعة)',
    });

    res.status(201).json({
      success: true,
      message: 'تم إرسال طلب السحب، سيراجعه فريق الدعم',
      data: withdrawal,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إرسال طلب السحب' });
  }
};

// @desc    قائمة طلبات السحب الخاصة بي
// @route   GET /api/wallet/withdrawals
// @access  Private
exports.getMyWithdrawals = async (req, res) => {
  try {
    const withdrawals = await Withdrawal.find({ user: req.user.id })
      .sort({ createdAt: -1 });

    res.status(200).json({ success: true, count: withdrawals.length, data: withdrawals });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء جلب طلبات السحب' });
  }
};

// @desc    إلغاء طلب سحب معلق (يعيد المبلغ للمحفظة)
// @route   POST /api/wallet/withdrawals/:id/cancel
// @access  Private
exports.cancelWithdrawal = async (req, res) => {
  try {
    const withdrawal = await Withdrawal.findOneAndUpdate(
      { _id: req.params.id, user: req.user.id, status: 'pending' },
      { status: 'cancelled', adminNote: 'إلغاء من المستخدم' },
      { new: true }
    );

    if (!withdrawal) {
      return res.status(400).json({ success: false, message: 'لا يمكن إلغاء هذا الطلب' });
    }

    const user = await User.findByIdAndUpdate(
      req.user.id,
      { $inc: { 'wallet.balance': withdrawal.amount, 'wallet.holding': -withdrawal.amount } },
      { new: true }
    );

    await MoneyTransaction.create({
      user: req.user.id,
      type: 'withdraw_refund',
      amount: withdrawal.amount,
      balanceAfter: user.wallet.balance,
      withdrawal: withdrawal._id,
      description: 'إلغاء طلب سحب وإعادة المبلغ للمحفظة',
    });

    res.status(200).json({
      success: true,
      message: 'تم إلغاء الطلب وإعادة المبلغ لمحفظتك',
      data: withdrawal,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء إلغاء طلب السحب' });
  }
};
