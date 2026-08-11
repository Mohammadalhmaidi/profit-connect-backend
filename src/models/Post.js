const mongoose = require('mongoose');

const postSchema = new mongoose.Schema(
  {
    // ربط المنشور بصاحبه (المؤلف)
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    content: {
      type: String,
      required: [true, 'محتوى المنشور مطلوب'],
      trim: true
    },
    image: {
      type: String,
      default: null
    },
    video: {
      type: String,
      default: null
    },
    visibility: {
      type: String,
      enum: ['public', 'private'],
      default: 'public'
    },
    // مصفوفة تحتوي على معرّفات (IDs) الأشخاص الذين أعجبوا بالمنشور
    likes: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // عدد مرات نسخ رابط المشاركة / إعادة المشاركة
    shareCount: {
      type: Number,
      default: 0,
      min: 0
    },
    // معرّفات المستخدمين الذين شاركوا المنشور (يُعدّ مرة واحدة لكل مستخدم)
    sharedBy: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    // مصفوفة التعليقات (كل تعليق يحتوي على صاحبه، ومحتواه، ووقت كتابته، ومن أعجب به)
    comments: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        content: {
          type: String,
          required: true,
          trim: true
        },
        likes: [
          {
            type: mongoose.Schema.Types.ObjectId,
            ref: 'User'
          }
        ],
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    // نسبة احتمال أن يكون المحتوى مكتوباً بالذكاء الاصطناعي (0-100)، تُحسب عبر الطبقات الدفاعية + النموذج المحلي
    aiProbability: {
      type: Number,
      min: 0,
      max: 100,
      default: null
    },
    // تفاصيل التحليل (الطبقات + لغة النص + قيمة النموذج) لعرض الأسباب في الواجهة
    aiDetails: {
      language: { type: String, enum: ['ar', 'en'] },
      modelProbability: { type: Number },
      layers: {
        phrase: { type: Number },
        structure: { type: Number },
        linguistic: { type: Number },
        vocabulary: { type: Number },
        ruleScore: { type: Number }
      },
      signals: [{ type: String }]
    }
  },
  { timestamps: true }
);

module.exports = mongoose.model('Post', postSchema);