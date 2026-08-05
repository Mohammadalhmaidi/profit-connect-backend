const mongoose = require('mongoose');

// دفعة مدفوعة إلى المنصة (حساب ضامن/Escrow) — تُحفظ هنا حتى يُحرَّر المبلغ
const platformPaymentSchema = new mongoose.Schema(
  {
    project: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    payer: {
      // العميل صاحب المشروع الذي دفع
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    payee: {
      // المستلم (المبرمج) الذي سيُحوَّل إليه المبلغ عند التحرير
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    proposal: {
      // العرض الذي بُنيت عليه الدفعة (مَن قدّم عرضاً مقبولاً)
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Proposal',
      default: null,
    },
    amount: {
      type: Number,
      required: [true, 'مبلغ الدفعة مطلوب'],
      min: 1,
    },
    method: {
      // طريقة الدفع التي اختارها العميل عند إرسال الدفعة
      type: String,
      enum: ['PayPal', 'Visa', 'Mastercard', 'American Express', 'Apple Pay'],
      required: [true, 'طريقة الدفع مطلوبة'],
    },
    fee: {
      // عمولة المنصة (تُحتسب لحظة التحرير)
      type: Number,
      default: 0,
    },
    netAmount: {
      // صافي المبلغ بعد خصم العمولة (يُحتسب لحظة التحرير)
      type: Number,
      default: 0,
    },
    status: {
      type: String,
      enum: ['held', 'released', 'refunded', 'cancelled'],
      default: 'held',
    },
    note: String,
    releasedAt: Date,
    refundedAt: Date,
  },
  { timestamps: true }
);

platformPaymentSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('PlatformPayment', platformPaymentSchema);
