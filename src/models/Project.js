const mongoose = require('mongoose');

const milestoneSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'عنوان المرحلة مطلوب'],
    trim: true,
  },
  description: String,
  startDate: Date,
  endDate: Date,
  status: {
    type: String,
    enum: ['NotStarted', 'InProgress', 'Completed'],
    default: 'NotStarted',
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
}, { _id: true });

const paymentSchema = new mongoose.Schema({
  title: String,
  amount: {
    type: Number,
    required: [true, 'مبلغ الدفعة مطلوب'],
    min: 0,
  },
  dueDate: Date,
  status: {
    type: String,
    enum: ['Pending', 'Paid', 'Overdue'],
    default: 'Pending',
  },
  paidDate: Date,
  method: {
    type: String,
    enum: ['bank_transfer', 'cash', 'other', 'PayPal', 'Visa', 'Mastercard', 'American Express', 'Apple Pay'],
    default: 'bank_transfer',
  },
  transactionRef: String,
  note: String,
}, { _id: true });

const projectSchema = new mongoose.Schema({
  title: {
    type: String,
    required: [true, 'عنوان المشروع مطلوب'],
    trim: true,
  },
  description: {
    type: String,
    required: [true, 'وصف المشروع مطلوب'],
  },
  category: {
    type: String,
    required: [true, 'التصنيف مطلوب'],
    trim: true,
  },
  skills: [String],
  budget: {
    min: { type: Number, default: 0 },
    max: { type: Number, default: 0 },
    currency: { type: String, default: 'SAR' },
  },
  deadline: Date,
  status: {
    type: String,
    enum: ['Open', 'InProgress', 'Completed', 'Cancelled'],
    default: 'Open',
  },
  client: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  assignedTo: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
  attachments: [String],
  // ===== حقول إدارة المشروع =====
  publishedAt: {
    type: Date,
    default: Date.now,
  },
  startDate: Date,
  endDate: Date,
  progress: {
    type: Number,
    min: 0,
    max: 100,
    default: 0,
  },
  // أعضاء الفريق المقبولين (يُملأ عند قبول العروض أو يدوياً)
  team: [{
    freelancer: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    proposalId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Proposal',
      default: null,
    },
    role: String,
    status: {
      type: String,
      enum: ['Invited', 'Working', 'Completed', 'Removed'],
      default: 'Working',
    },
    joinedAt: {
      type: Date,
      default: Date.now,
    },
  }],
  // المخطط الزمني: مجموعة مراحل
  milestones: [milestoneSchema],
  // الدفعات المالية (تُقسَّم لعدة دفعات يحددها المستخدم)
  payments: [paymentSchema],
  paymentsConfig: {
    twoStage: { type: Boolean, default: true },
    installmentsCount: { type: Number, default: 2 },
    totalAmount: { type: Number, default: 0 },
  },
}, { timestamps: true });

module.exports = mongoose.model('Project', projectSchema);
