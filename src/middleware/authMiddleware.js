const jwt = require('jsonwebtoken');
const { sanitizeError } = require('../utils/sanitizeError');
const User = require('../models/User');

exports.protect = async (req, res, next) => {
  let token;

  // 1. التأكد من وجود التوكن في الترويسة (Headers) وأنه يبدأ بكلمة Bearer
  if (
    req.headers.authorization &&
    req.headers.authorization.startsWith('Bearer')
  ) {
    try {
      // 2. استخراج التوكن (فصل كلمة Bearer عن التوكن الفعلي)
      token = req.headers.authorization.split(' ')[1];

      // 3. فك تشفير التوكن والتأكد من صحته باستخدام المفتاح السري
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      // منع استخدام ريفرش توكن كتوكن وصول (access token)
      if (decoded.type === 'refresh') {
        return res.status(401).json({
          success: false,
          message: 'هذا توكن تجديد وليس توكن وصول، استخدم POST /api/auth/refresh',
        });
      }

      // 4. البحث عن المستخدم في قاعدة البيانات باستخدام الـ ID الموجود داخل التوكن
      // ونقوم باستبعاد كلمة المرور من النتيجة لزيادة الأمان
      req.user = await User.findById(decoded.id).select('-password');

      // إذا كان المستخدم غير موجود (مثلاً تم حذف حسابه مؤخراً)
      if (!req.user) {
        return res.status(401).json({
          success: false,
          message: 'المستخدم غير موجود، التوكن غير صالح',
        });
      }

      // فحص الحظر الدائم
      if (req.user.status === 'banned') {
        const now = new Date();
        const bannedUntil = req.user.bannedUntil;

        // إذا كان الحظر مؤقتاً وانتهت مدته — نرفع الحظر تلقائياً
        if (bannedUntil && now > bannedUntil) {
          await User.findByIdAndUpdate(req.user._id, { status: 'active', bannedUntil: null });
        } else {
          const message = bannedUntil
            ? `حسابك موقوف مؤقتاً حتى ${bannedUntil.toLocaleString('ar-SA')}`
            : 'حسابك موقوف بشكل دائم بسبب تكرار المخالفات';
          return res.status(403).json({ success: false, message });
        }
      }

      // 5. السماح للطلب بالمرور إلى الـ Controller التالي
      next();
    } catch (error) {
      console.error('Auth Error:', sanitizeError(error));
      return res.status(401).json({
        success: false,
        message: 'غير مصرح لك بالوصول، التوكن غير صالح أو منتهي الصلاحية',
      });
    }
  }

  // إذا لم يتم إرسال توكن من الأساس
  if (!token) {
    return res.status(401).json({
      success: false,
      message: 'غير مصرح لك بالوصول، يرجى تسجيل الدخول أولاً',
    });
  }
};
// حارس بوابة مخصص للمديرين (Admins) فقط
exports.admin = (req, res, next) => {
  // نتأكد أن المستخدم موجود وأن دوره هو 'Admin'
  if (req.user && req.user.role === 'Admin') {
    next(); // تفضل بالدخول
  } else {
    return res.status(403).json({ 
      success: false, 
      message: 'غير مصرح لك! هذا الإجراء مخصص لفريق دعم Profit Connect فقط' 
    });
  }
};

// حارس بوابة لأصحاب العمل (Employer) فقط — مَن يُسمح لهم بإنشاء شركة
exports.employerOnly = (req, res, next) => {
  if (req.user && req.user.role === 'Employer') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'غير مصرح لك! إنشاء الشركات مقتصر على أصحاب العمل (Employer) المعتمدين فقط'
    });
  }
};

// حارس بوابة لموظفي الشركات (CompanyEmployee) فقط
exports.companyEmployeeOnly = (req, res, next) => {
  if (req.user && req.user.role === 'CompanyEmployee') {
    next();
  } else {
    return res.status(403).json({
      success: false,
      message: 'غير مصرح لك! هذا الإجراء مخصص لموظفي الشركات فقط'
    });
  }
};