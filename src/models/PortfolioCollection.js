const mongoose = require('mongoose');

const portfolioCollectionSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    name: {
      type: String,
      required: [true, 'اسم المجموعة مطلوب'],
      trim: true,
      maxlength: [100, 'اسم المجموعة طويل جداً'],
    },
    description: {
      type: String,
      trim: true,
      default: '',
      maxlength: [1000, 'الوصف طويل جداً'],
    },
    items: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PortfolioItem',
      },
    ],
    isPublic: {
      type: Boolean,
      default: true,
    },
  },
  { timestamps: true }
);

portfolioCollectionSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model('PortfolioCollection', portfolioCollectionSchema);
