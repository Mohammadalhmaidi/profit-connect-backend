const mongoose = require('mongoose');

const jobSchema = new mongoose.Schema(
  {
    title: { type: String, required: [true, 'عنوان الوظيفة مطلوب'], trim: true },
    description: { type: String, required: [true, 'وصف الوظيفة مطلوب'] },
    company: { type: mongoose.Schema.Types.ObjectId, ref: 'Company', required: true },
    location: { type: String, required: [true, 'موقع العمل مطلوب'] },
    type: { type: String, enum: ['Full-time', 'Part-time', 'Contract', 'Internship', 'Freelance'], default: 'Full-time' },
    workLevel: { type: String, enum: ['Entry', 'Mid', 'Senior', 'Director', 'VP'], default: 'Entry' },
    workPlace: { type: String, enum: ['On-site', 'Remote', 'Hybrid'], default: 'On-site' },
    salary: { min: Number, max: Number, currency: { type: String, default: 'USD' } },
    requirements: [String],
    responsibilities: [String],
    status: { type: String, enum: ['Open', 'Closed'], default: 'Open' },
    postedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true }
  },
  { timestamps: true }
);

// فهارس لتسريع البحث عن الوظائف
jobSchema.index({ title: 1 });
jobSchema.index({ location: 1 });
jobSchema.index({ status: 1, createdAt: -1 });

module.exports = mongoose.model('Job', jobSchema);