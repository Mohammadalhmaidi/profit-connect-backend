const rateLimit = require('express-rate-limit');

// منع المستخدم من إضافة أكثر من 5 تعليقات في الدقيقة الواحدة
exports.commentLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // إطار زمني: دقيقة واحدة
  max: 5, // الحد الأقصى: 5 طلبات في الدقيقة
  message: {
    success: false,
    message: 'لقد قمت بكتابة الكثير من التعليقات بسرعة. يرجى الانتظار قليلاً.'
  }
});

// حماية مسارات المصادقة من هجمات القوة الغاشمة: 20 محاولة لكل 15 دقيقة لكل IP
// يُعطَّل تلقائياً في بيئة الاختبار (jest) عبر قراءة NODE_ENV الحية عند كل طلب
const isTestEnv = () => process.env.NODE_ENV === 'test';

exports.authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 دقيقة
  max: 20, // 20 محاولة
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'محاولات كثيرة. يرجى الانتظار 15 دقيقة قبل إعادة المحاولة.'
  }
});

// حماية التسجيل من إنشاء حسابات جماعية: 10 تسجيلات لكل ساعة لكل IP
exports.signupLimiter = rateLimit({
  windowMs: 60 * 60 * 1000, // ساعة
  max: 10, // 10 تسجيلات
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  skip: isTestEnv,
  message: {
    success: false,
    message: 'لقد تجاوزت عدد محاولات التسجيل المسموحة. يرجى المحاولة لاحقاً.'
  }
});