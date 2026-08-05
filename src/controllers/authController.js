
const jwt = require('jsonwebtoken');
const crypto = require('crypto');
const User = require('../models/User');
const Post = require('../models/Post');
const RefreshToken = require('../models/RefreshToken');
const { buildAvatarUrl, deleteAvatarFile } = require('../utils/avatarStorage');
const { formatUserResponse } = require('../utils/userResponse');

// دالة مساعدة لإنشاء التوكن
const generateToken = (id) => {
  return jwt.sign({ id }, process.env.JWT_SECRET, {
    expiresIn: process.env.JWT_EXPIRE,
  });
};

// ===== نظام الريفرش توكن =====
const REFRESH_EXPIRE_DAYS = parseInt(process.env.JWT_REFRESH_EXPIRE_DAYS, 10) || 30;

// تجزئة التوكن قبل تخزينه (لا يُخزَّن التوكن الخام في قاعدة البيانات)
const hashToken = (token) => crypto.createHash('sha256').update(token).digest('hex');

// إنشاء ريفرش توكن جديد وتخزينه (مجزأً) في قاعدة البيانات
const createStoredRefreshToken = async (userId, req = {}) => {
  const refreshToken = jwt.sign({ id: userId, type: 'refresh' }, process.env.JWT_SECRET, {
    expiresIn: `${REFRESH_EXPIRE_DAYS}d`,
  });

  await RefreshToken.create({
    user: userId,
    tokenHash: hashToken(refreshToken),
    expiresAt: new Date(Date.now() + REFRESH_EXPIRE_DAYS * 24 * 60 * 60 * 1000),
    userAgent: (req.headers && req.headers['user-agent']) || '',
    ip: req.ip || '',
  });

  return refreshToken;
};

// @desc    إنشاء حساب مستخدم جديد (Signup)
// @route   POST /api/auth/signup
// @access  Public
exports.signup = async (req, res) => {
  try {
    const { firstName, lastName, email, password, role, phoneNumber, industry, yearsOfExperience, skills ,rScore } = req.body;

    // الدور عند التسجيل: يسمح فقط بـ (صاحب عمل / باحث عن عمل / صاحب مشروع حر)،
    // ولا يُسمح بتمرير Admin من التسجيل (يُمنح عبر الإدارة فقط)
    const allowedSignupRoles = ['Employer', 'JobSeeker', 'FreelanceClient'];
    const safeRole = allowedSignupRoles.includes(role) ? role : 'JobSeeker';

    // بناء الملف حسب الدور:
    // - صاحب عمل / صاحب مشروع حر => أسئلة تبني صفحة الشركة (لا مهارات/خبرة)
    // - باحث عن عمل => الملف المهني (مجال/خبرة/مهارات)
    const isEmployerType = safeRole === 'Employer' || safeRole === 'FreelanceClient';

    // بناء كائن الموقع الجديد
    // عند استخدام multipart/form-data يصل companyLocation كنص JSON
    let companyLocation;
    let parsedCompanyLocation = req.body.companyLocation;
    if (typeof parsedCompanyLocation === 'string') {
      try {
        parsedCompanyLocation = JSON.parse(parsedCompanyLocation);
      } catch (e) {
        parsedCompanyLocation = null;
      }
    }
    if (parsedCompanyLocation && typeof parsedCompanyLocation === 'object') {
      const loc = parsedCompanyLocation;
      companyLocation = {
        country: loc.country || '',
        city: loc.city || '',
        street: loc.street || '',
        buildingNumber: loc.buildingNumber || '',
        coordinates: {
          type: 'Point',
          coordinates: [
            Number(loc.coordinates?.x) || Number(loc.coordinates?.coordinates?.[0]) || 0,
            Number(loc.coordinates?.y) || Number(loc.coordinates?.coordinates?.[1]) || 0
          ]
        }
      };
    } else {
      companyLocation = undefined;
    }

    const employerProfile = isEmployerType
      ? {
          companyName: req.body.companyName,
          companyDescription: req.body.companyDescription,
          industry: req.body.companyIndustry,
          companyLocation,
          website: req.body.website,
          companySize: req.body.companySize,
          foundedYear: req.body.foundedYear ? Number(req.body.foundedYear) : undefined,
        }
      : undefined;
    const professional = !isEmployerType
      ? { industry, yearsOfExperience, skills }
      : undefined;

    // 1. التحقق من وجود المستخدم مسبقاً
    let user = await User.findOne({ email });
    if (user) {
      return res.status(400).json({ success: false, message: 'البريد الإلكتروني مسجل بالفعل' });
    }

    // 2. إنشاء المستخدم الجديد
    user = await User.create({
      email,
      password,
      role: safeRole,
      profile: {
        firstName,
        lastName,
        phoneNumber,
        ...(req.file ? { avatar: buildAvatarUrl(req, req.file.filename) } : {}),
      },
      ...(professional ? { professional } : {}),
      ...(employerProfile ? { employerProfile } : {})
    });

    // 2.1 إشعار ترحيبي لصاحب العمل/صاحب المشروع الحر لبدء إعداد صفحة شركته
    if (isEmployerType) {
      user.notifications.push({
        type: 'company_setup',
        message: 'مرحباً! أكمل إعداد صفحة شركتك لنشر وظائفك ومشاريعك بسهولة.',
        read: false
      });
      await user.save();
    }

    // 3. إنشاء التوكن
    const token = generateToken(user._id);
    const refreshToken = await createStoredRefreshToken(user._id, req);

    // 4. إرجاع الاستجابة حسب الهيكلة المطلوبة
    res.status(201).json({
      success: true,
      token,
      refreshToken,
      user: formatUserResponse(user)
    });

  } catch (error) {
    if (req.file) {
      await deleteAvatarFile(buildAvatarUrl(req, req.file.filename));
    }

    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    تسجيل دخول المستخدم (Login)
// @route   POST /api/auth/login
// @access  Public
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    // 1. التحقق من إرسال البريد الإلكتروني وكلمة المرور في الطلب
    if (!email || !password) {
      return res.status(400).json({ 
        success: false, 
        message: 'يرجى إدخال البريد الإلكتروني وكلمة المرور' 
      });
    }

    // 2. البحث عن المستخدم في قاعدة البيانات
    const user = await User.findOne({ email }).select('+password');
    
    if (!user) {
      return res.status(401).json({ 
        success: false, 
        message: 'بيانات الدخول غير صحيحة'
      });
    }

    // 3. التحقق من تطابق كلمة المرور
    const isMatch = await user.matchPassword(password);
    
    if (!isMatch) {
      return res.status(401).json({ 
        success: false, 
        message: 'بيانات الدخول غير صحيحة' 
      });
    }

    // 4. إنشاء التوكن
    const token = generateToken(user._id);
    const refreshToken = await createStoredRefreshToken(user._id, req);

    // 5. إرجاع الاستجابة
    res.status(200).json({
      success: true,
      token,
      refreshToken,
      user: formatUserResponse(user)
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    التحقق من التوكن وإرجاع المستخدم الحالي مع بياناته الكاملة
// @route   GET /api/auth/me
// @access  Private
exports.getCurrentUser = async (req, res) => {
  try {
    const userId = req.user.id;

    // جلب بيانات المستخدم الأساسية والمتابعين والمتابَعين
    const user = await User.findById(userId)
      .populate('profile.followers', 'profile.firstName profile.lastName profile.avatar')
      .populate('profile.following', 'profile.firstName profile.lastName profile.avatar');

    // جلب منشورات المستخدم
    const posts = await Post.find({ user: userId }).sort({ createdAt: -1 });

    if (!user) {
        return res.status(404).json({ success: false, message: 'المستخدم غير موجود' });
    }

    // دمج كل البيانات في استجابة واحدة
    const userProfile = {
      ...formatUserResponse(user),
      posts: posts,
    };

    // جلب بيانات الشركة إن كان المستخدم صاحب عمل/مشروع حر
    const isEmployerType = user.role === 'Employer' || user.role === 'FreelanceClient';
    if (isEmployerType) {
      const Company = require('../models/Company');
      const company = await Company.findOne({ owner: userId })
        .select('name description industry location companySize foundedYear logo coverPhoto website socialLinks contactEmail isVerified status followersCount averageRating createdAt');
      if (company) {
        userProfile.company = company.toObject();
      }
    }

    // جلب بيانات الشركة إن كان المستخدم موظف شركة
    if (user.role === 'CompanyEmployee' && user.companyEmployeeProfile?.companyId) {
      const Company = require('../models/Company');
      const company = await Company.findById(user.companyEmployeeProfile.companyId)
        .select('name description industry location logo coverPhoto status isVerified');
      if (company) {
        userProfile.company = company.toObject();
      }
    }

    res.status(200).json({
      success: true,
      user: userProfile,
    });

  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    تجديد جلسة المستخدم (تناوب الريفرش توكن)
// @route   POST /api/auth/refresh
// @access  Public (يحمل ريفرش توكن صالح)
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'الريفرش توكن مطلوب' });
    }

    const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
    if (!stored || stored.revokedAt) {
      return res.status(401).json({ success: false, message: 'الريفرش توكن غير صالح أو تم إلغاؤه' });
    }

    if (stored.expiresAt < new Date()) {
      await stored.deleteOne();
      return res.status(401).json({ success: false, message: 'انتهت صلاحية الريفرش توكن، يرجى تسجيل الدخول مجدداً' });
    }

    let payload;
    try {
      payload = jwt.verify(refreshToken, process.env.JWT_SECRET);
    } catch (e) {
      return res.status(401).json({ success: false, message: 'الريفرش توكن غير صالح' });
    }

    const user = await User.findById(payload.id);
    if (!user) {
      return res.status(401).json({ success: false, message: 'المستخدم غير موجود' });
    }

    // التناوب: إصدار توكن وصول جديد + ريفرش جديد، وإبطال القديم
    const token = generateToken(user._id);
    const newRefreshToken = await createStoredRefreshToken(user._id, req);

    stored.revokedAt = new Date();
    stored.replacedBy = hashToken(newRefreshToken);
    await stored.save();

    res.status(200).json({
      success: true,
      token,
      refreshToken: newRefreshToken,
      user: formatUserResponse(user),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// @desc    تسجيل الخروج وإبطال الريفرش توكن من الخادم
// @route   POST /api/auth/logout
// @access  Public (يحمل ريفرش توكن)
exports.logout = async (req, res) => {
  try {
    const { refreshToken } = req.body;
    if (!refreshToken) {
      return res.status(400).json({ success: false, message: 'الريفرش توكن مطلوب' });
    }

    const stored = await RefreshToken.findOne({ tokenHash: hashToken(refreshToken) });
    if (stored && !stored.revokedAt) {
      stored.revokedAt = new Date();
      await stored.save();
    }

    res.status(200).json({ success: true, message: 'تم تسجيل الخروج وإبطال الجلسة بنجاح' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
