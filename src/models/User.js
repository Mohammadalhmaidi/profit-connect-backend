const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    email: {
      type: String,
      trim: true,
      required: [true, 'البريد الإلكتروني مطلوب'],
      unique: true,
      match: [/^\w+([\.-]?\w+)*@\w+([\.-]?\w+)*(\.\w{2,3})+$/, 'يرجى إدخال بريد إلكتروني صحيح']
    },
    password: {
      type: String,
      required: [true, 'كلمة المرور مطلوبة'],
      minlength: 6,
      select: false // لعدم إرجاع كلمة المرور عند جلب بيانات المستخدم
    },
    username: {
      type: String,
      trim: true,
      unique: true,
    },
    role: {
      type: String,
      enum: ['Employer', 'JobSeeker', 'Admin', 'FreelanceClient', 'CompanyEmployee'],
      default: 'JobSeeker',
      required: [true, 'يرجى تحديد نوع الحساب (صاحب عمل أو باحث عن عمل)']
    },
    profile: {
      firstName: { type: String, required: true, trim: true },
      lastName: { type: String, required: true, trim: true },
      fullname: String,
      phoneNumber: String,
      headline: String,
      bio: String,
      avatar: {
        type: String,
        default: 'default-avatar.png'
      },
      location: String,
      socialLinks: {
        linkedin: { type: String, trim: true, default: '' },
        github: { type: String, trim: true, default: '' },
        website: { type: String, trim: true, default: '' }
      },
      followers: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      ],
      following: [
        {
          type: mongoose.Schema.Types.ObjectId,
          ref: 'User'
        }
      ],
      followersCount: {
        type: Number,
        default: 0
      },
      followingCount: {
        type: Number,
        default: 0
      },
      postsCount: {
        type: Number,
        default: 0
      },
      portfolioCount: {
        type: Number,
        default: 0
      },
      rScore:{
        type: Number,
        default: 0
      }
    },
    professional: {
      industry: String,
      yearsOfExperience: Number,
      skills: [String]
    },
    // ملف صاحب العمل/صاحب المشروع الحر: بيانات تبني صفحة شركته (لا علاقة لها بالمهارات/الخبرة)
    employerProfile: {
      companyName: { type: String, trim: true },
      companyDescription: { type: String, trim: true },
      industry: { type: String, trim: true },
      companyLocation: {
        country: { type: String, trim: true },
        city: { type: String, trim: true },
        street: { type: String, trim: true },
        buildingNumber: { type: String, trim: true },
        coordinates: {
          type: {
            type: String,
            enum: ['Point'],
            default: 'Point'
          },
          coordinates: {
            type: [Number],
            default: [0, 0]
          }
        }
      },
      website: { type: String, trim: true },
      companySize: {
        type: String,
        enum: ['1-10', '11-50', '51-200', '201-500', '501-1000', '1000+']
      },
      foundedYear: { type: Number }
    },
    // ملف موظف الشركة: يربط الموظف بشركته ويحدد صلاحياته
    companyEmployeeProfile: {
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      position: { type: String, trim: true, default: '' },
      permissions: {
        canPostJobs: { type: Boolean, default: true },
        canManageApplicants: { type: Boolean, default: true },
        canViewAnalytics: { type: Boolean, default: false }
      },
      addedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }
    },
    isActive: {
      type: Boolean,
      default: true
    },
    isVerified: {
      type: Boolean,
      default: true
    },
    // 🌟 تم نقل حقل الحالة إلى المكان الصحيح داخل الحقول 🌟
    status: {
      type: String,
      enum: ['active', 'banned'],
      default: 'active'
    },
    // 🌟 تم نقل مصفوفة التنبيهات الذكية إلى المكان الصحيح 🌟
    settings: {
      language:          { type: String, enum: ['ar', 'en'], default: 'en' },
      theme:             { type: String, enum: ['light', 'dark', 'system'], default: 'system' },
      emailNotifications:{ type: Boolean, default: true },
      pushNotifications: { type: Boolean, default: true },
      profileVisibility: { type: String, enum: ['public', 'connections', 'private'], default: 'public' },
      showEmail:         { type: Boolean, default: false },
      showPhone:         { type: Boolean, default: false },
      animationEnabled:  { type: Boolean, default: true },
    },
    bannedUntil: { type: Date, default: null },
    warnings: [{
      content: { type: String, required: true },
      reason: { type: String, required: true },
      date: { type: Date, default: Date.now }
    }],
    // ===== المحفظة المالية =====
    wallet: {
      balance:    { type: Number, default: 0, min: 0 }, // رصيد متاح للسحب
      holding:    { type: Number, default: 0, min: 0 }, // مبلغ محجوز (طلب سحب قيد المراجعة)
      totalEarned:    { type: Number, default: 0 },     // إجمالي ما كسبه المستخدم
      totalWithdrawn: { type: Number, default: 0 },     // إجمالي ما سحبه المستخدم
    },
    notifications: [{
      type: { type: String, enum: ['proposal_accepted', 'proposal_rejected', 'proposal_received', 'ai_detected', 'company_setup', 'company_status', 'employee_added', 'employee_removed', 'job_application_status', 'connection_request', 'connection_accepted', 'connection_rejected', 'follow', 'payment_deposited', 'payment_released', 'payment_refunded', 'withdrawal_approved', 'withdrawal_rejected'], required: true },
      projectName: { type: String },
      clientName: { type: String },
      projectId: { type: mongoose.Schema.Types.ObjectId, ref: 'Project' },
      proposalStatus: { type: String, enum: ['accepted', 'rejected'] },
      postId: { type: mongoose.Schema.Types.ObjectId, ref: 'Post' },
      companyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Company' },
      senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
      jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job' },
      paymentId: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformPayment' },
      withdrawalId: { type: mongoose.Schema.Types.ObjectId, ref: 'Withdrawal' },
      amount: { type: Number },
      method: { type: String },
      applicationStatus: { type: String, enum: ['Pending', 'Reviewed', 'Shortlisted', 'Rejected', 'Accepted'] },
      aiProbability: { type: Number },
      message: { type: String },
      read: { type: Boolean, default: false },
      createdAt: { type: Date, default: Date.now }
    }],
    savedPosts: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Post' }]
  }, // 👈 هنا تم إغلاق كائن الحقول بالكامل وبشكل صحيح
  { timestamps: true } // 👈 هنا المعامل الثاني (الإعدادات)
);

// تجهيز البيانات وتشفير كلمة المرور قبل الحفظ
userSchema.pre('save', async function () {
  // 1. تحديث الاسم الكامل واسم المستخدم دائماً (إذا توفرت البيانات)
  if (this.profile && this.profile.firstName && this.profile.lastName) {
    this.profile.fullname = `${this.profile.firstName} ${this.profile.lastName}`;
  }

  if (!this.username && this.profile && this.profile.firstName) {
    this.username = `${this.profile.firstName.toLowerCase()}_${Date.now()}`;
  }

  // 2. إذا لم يتم تعديل كلمة المرور، تخطى التشفير واخرج
  if (!this.isModified('password')) {
    return;
  }

  // 3. تشفير كلمة المرور
  const salt = await bcrypt.genSalt(10);
  this.password = await bcrypt.hash(this.password, salt);
});

// دالة لمقارنة كلمة المرور عند تسجيل الدخول
userSchema.methods.matchPassword = async function (enteredPassword) {
  return await bcrypt.compare(enteredPassword, this.password);
};

module.exports = mongoose.model('User', userSchema);