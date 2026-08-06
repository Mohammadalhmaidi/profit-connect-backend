const mongoose = require('mongoose');

const portfolioMediaSchema = new mongoose.Schema(
  {
    url: {
      type: String,
      required: [true, 'رابط الوسائط مطلوب'],
    },
    type: {
      type: String,
      enum: ['image', 'video'],
      default: 'image',
    },
    order: {
      type: Number,
      default: 0,
    },
  },
  { _id: true }
);

const portfolioItemSchema = new mongoose.Schema(
  {
    // صاحب العمل (المستقل / الباحث عن عمل)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    title: {
      type: String,
      required: [true, 'عنوان العمل مطلوب'],
      trim: true,
      maxlength: [150, 'العنوان طويل جداً'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [5000, 'الوصف طويل جداً'],
    },
    category: {
      type: String,
      required: [true, 'التصنيف مطلوب'],
      trim: true,
    },
    tags: [String],
    // الوسائط: صور و/أو فيديوهات مرتبة
    media: [portfolioMediaSchema],
    // صورة الغلاف (تظهر في الشبكة والبطاقة)
    coverImage: {
      type: String,
      default: null,
    },
    projectUrl: {
      type: String,
      trim: true,
      default: '',
    },
    skills: [String],
    client: {
      type: String,
      trim: true,
      default: '',
    },
    duration: {
      type: String,
      trim: true,
      default: '',
    },
    role: {
      type: String,
      trim: true,
      default: '',
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public',
    },
    isFeatured: {
      type: Boolean,
      default: false,
    },
    // ربط اختياري بعمل منجز داخل المنصة (مشروع)
    linkedProject: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'Project',
      default: null,
    },
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User',
      },
    ],
    views: {
      type: Number,
      default: 0,
    },
  },
  { timestamps: true }
);

portfolioItemSchema.index({ user: 1, createdAt: -1 });
portfolioItemSchema.index({ category: 1, createdAt: -1 });
portfolioItemSchema.index({ tags: 1 });

module.exports = mongoose.model('PortfolioItem', portfolioItemSchema);
