const mongoose = require('mongoose');

const companySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: [true, 'اسم الشركة مطلوب'],
      unique: true,
      trim: true
    },
    description: {
      type: String,
      required: [true, 'وصف الشركة مطلوب']
      // يمكنك إضافة maxlength هنا إذا أردت الحد من طول الوصف
    },
    industry: {
      type: String,
      required: [true, 'مجال الشركة مطلوب (مثال: تكنولوجيا، صحة، إلخ)']
    },
    location: {
      country: {
        type: String,
        required: [true, 'الدولة مطلوبة'],
        trim: true
      },
      city: {
        type: String,
        required: [true, 'المدينة مطلوبة'],
        trim: true
      },
      street: {
        type: String,
        trim: true,
        default: ''
      },
      buildingNumber: {
        type: String,
        trim: true,
        default: ''
      },
      coordinates: {
        type: {
          type: String,
          enum: ['Point'],
          default: 'Point'
        },
        coordinates: {
          type: [Number],
          default: [0, 0],
          index: '2dsphere'
        }
      }
    },
    companySize: {
      type: String,
      enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+'],
      default: '1-10'
    },
    foundedYear: {
      type: Number // إضافة سنة التأسيس
    },
    logo: {
      type: String,
      default: 'default-company-logo.png'
    },
    coverPhoto: {
      type: String,
      default: 'default-company-cover.png' // صورة الغلاف
    },
    website: {
      type: String,
      trim: true
    },
    socialLinks: { // روابط حسابات الشركة
      linkedin: { type: String, trim: true, default: '' },
      twitter: { type: String, trim: true, default: '' }
    },
    contactEmail: { // بريد التواصل العام للشركة (قد يختلف عن بريد المالك)
      type: String,
      trim: true,
      lowercase: true
    },
    isVerified: {
      type: Boolean,
      default: false // يتغير إلى true عندما تتحقق الإدارة من أوراق الشركة
    },
    verificationDocs: [
      {
        type: String // مسارات ملفات التحقق المرفوعة (سجل تجاري، رخصة، ...)
      }
    ],
    rejectionReason: {
      type: String,
      default: ''
    },
    status: {
      type: String,
      enum: ['Pending', 'Approved', 'Rejected'],
      default: 'Pending' // 👈 أي شركة جديدة تكون معلقة تلقائياً وتنتظر فريق الدعم
    },
    owner: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      required: true
    },
    admins: [ // قائمة المدراء الإضافيين (اختياري للمستقبل)
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
      }
    ],
    employees: [ // قائمة موظفي الشركة (يضافون بواسطة المالك/المدير)
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        position: {
          type: String,
          trim: true,
          default: ''
        },
        permissions: {
          canPostJobs: { type: Boolean, default: true },
          canManageApplicants: { type: Boolean, default: true },
          canViewAnalytics: { type: Boolean, default: false }
        },
        addedBy: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        addedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    followers: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        },
        followedAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    followersCount: { // لحل مشكلة الأداء عند عرض عدد المتابعين
      type: Number,
      default: 0
    },
    ratings: [
      {
        user: {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User',
          required: true
        },
        rating: {
          type: Number,
          required: true,
          min: 1,
          max: 5
        },
        review: {
          type: String,
          trim: true,
          default: ''
        },
        createdAt: {
          type: Date,
          default: Date.now
        }
      }
    ],
    averageRating: {
      type: Number,
      default: 0
    }
  },
  { timestamps: true }
);

companySchema.methods.calcAverageRating = function () {
  if (!this.ratings.length) {
    this.averageRating = 0;
    return;
  }
  const total = this.ratings.reduce((sum, r) => sum + r.rating, 0);
  this.averageRating = Math.round((total / this.ratings.length) * 10) / 10;
};

module.exports = mongoose.model('Company', companySchema);