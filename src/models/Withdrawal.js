const mongoose = require('mongoose');

// طلب سحب رصيد من المحفظة — تتم معالجته يدوياً من فريق الدعم
const withdrawalSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    amount: {
      type: Number,
      required: [true, 'مبلغ السحب مطلوب'],
      min: 1,
    },
    method: {
      type: String,
      enum: ['bank_transfer', 'cash', 'other'],
      default: 'bank_transfer',
    },
    accountDetails: {
      bankName: String,
      iban: String,
      accountNumber: String,
      holderName: String,
    },
    status: {
      type: String,
      enum: ['pending', 'processed', 'rejected', 'cancelled'],
      default: 'pending',
    },
    processedAt: Date,
    adminNote: String,
  },
  { timestamps: true }
);

withdrawalSchema.index({ user: 1, status: 1 });
withdrawalSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Withdrawal', withdrawalSchema);
