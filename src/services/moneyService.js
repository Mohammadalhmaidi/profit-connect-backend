const PlatformPayment = require('../models/PlatformPayment');
const User = require('../models/User');
const MoneyTransaction = require('../models/MoneyTransaction');
const Setting = require('../models/Setting');

const DEFAULT_FEE_PERCENT = 10;

// نسبة عمولة المنصة (قابلة للضبط من لوحة الأدمن)
async function getPlatformFeePercent() {
  const setting = await Setting.findOne({ key: 'platformFeePercent' });
  return setting && Number(setting.value) > 0 ? Number(setting.value) : DEFAULT_FEE_PERCENT;
}

// حساب عمولة بمبلغ معين (تقريب لخانتين عشريتين)
function computeFee(amount, percent) {
  return Math.round((amount * percent) / 100 * 100) / 100;
}

// تسجيل حركة في سجل الحركات (Ledger)
async function recordLedger(entry) {
  return MoneyTransaction.create(entry);
}

// ============================================================
// تحرير دفعة محجوزة لمحفظة المستلم (مع خصم عمولة المنصة)
// الأمان: transition حصري held -> released عبر findOneAndUpdate
// حتى لا يحدث تحرير مزدوج أبداً
// ============================================================
async function releasePayment(paymentId) {
  const payment = await PlatformPayment.findOneAndUpdate(
    { _id: paymentId, status: 'held' },
    { status: 'released', releasedAt: new Date() },
    { new: true }
  );

  if (!payment) {
    return { error: 'الدفعة غير موجودة أو تم التحرير لها من قبل' };
  }

  const feePercent = await getPlatformFeePercent();
  const fee = computeFee(payment.amount, feePercent);
  const net = Math.round((payment.amount - fee) * 100) / 100;

  await PlatformPayment.updateOne({ _id: payment._id }, { fee, netAmount: net });

  const updatedUser = await User.findByIdAndUpdate(
    payment.payee,
    { $inc: { 'wallet.balance': net, 'wallet.totalEarned': net } },
    { new: true }
  );

  await recordLedger({
    user: payment.payee,
    type: 'release',
    amount: net,
    balanceAfter: updatedUser.wallet.balance,
    platformPayment: payment._id,
    project: payment.project,
    description: 'تحرير دفعة من الحساب الضامن إلى محفظتك',
  });

  if (fee > 0) {
    await recordLedger({
      user: payment.payee,
      type: 'fee',
      amount: -fee,
      balanceAfter: updatedUser.wallet.balance,
      platformPayment: payment._id,
      project: payment.project,
      description: `عمولة المنصة (${feePercent}%)`,
    });
  }

  return { payment, net, fee };
}

// ============================================================
// استرجاع دفعة محجوزة إلى محفظة الدافع (إلغاء/نزاع)
// الأمان: transition حصري held -> refunded
// ============================================================
async function refundPayment(paymentId) {
  const payment = await PlatformPayment.findOneAndUpdate(
    { _id: paymentId, status: 'held' },
    { status: 'refunded', refundedAt: new Date() },
    { new: true }
  );

  if (!payment) {
    return { error: 'الدفعة غير موجودة أو تم التعامل معها من قبل' };
  }

  const updatedUser = await User.findByIdAndUpdate(
    payment.payer,
    { $inc: { 'wallet.balance': payment.amount } },
    { new: true }
  );

  await recordLedger({
    user: payment.payer,
    type: 'refund',
    amount: payment.amount,
    balanceAfter: updatedUser.wallet.balance,
    platformPayment: payment._id,
    project: payment.project,
    description: 'استرجاع دفعة إلى محفظتك (إلغاء/نزاع)',
  });

  return { payment };
}

module.exports = {
  getPlatformFeePercent,
  computeFee,
  recordLedger,
  releasePayment,
  refundPayment,
};
