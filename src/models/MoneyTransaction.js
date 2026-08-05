const mongoose = require('mongoose');

// سجل الحركات المالية (Ledger) — مصدر الحقيقة لكل تغيير في رصيد المحفظة
// amount يُعبّر عن أثر العملية على رصيد (wallet.balance):
//   موجبة = زيادة في الرصيد المتاح ، سالبة = خصم من الرصيد المتاح
const moneyTransactionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    type: {
      type: String,
      enum: ['deposit', 'release', 'fee', 'refund', 'withdraw', 'withdraw_refund', 'withdraw_processed', 'manual'],
      required: true,
    },
    amount: {
      type: Number,
      required: true,
    },
    balanceAfter: {
      // رصيد (wallet.balance) بعد العملية — لأغراض التدقيق
      type: Number,
      default: 0,
    },
    platformPayment: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'PlatformPayment',
      default: null,
    },
    withdrawal: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Withdrawal',
      default: null,
    },
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    description: String,
  },
  { timestamps: true }
);

moneyTransactionSchema.index({ user: 1, createdAt: -1 });
moneyTransactionSchema.index({ platformPayment: 1 });

module.exports = mongoose.model('MoneyTransaction', moneyTransactionSchema);
