const express = require('express');
const { sanitizeError } = require('../utils/sanitizeError');
const router = express.Router();
const { protect } = require('../middleware/authMiddleware');
const { uploadAvatar } = require('../middleware/uploadMiddleware');
const { authLimiter, signupLimiter } = require('../middleware/rateLimiter');
// استدعاء دوال المصادقة
const { signup, login, getCurrentUser, refresh, logout, forgotPassword, resetPassword } = require('../controllers/authController');

const signupAvatarUploadHandler = (req, res, next) => {
  uploadAvatar.single('avatar')(req, res, (error) => {
    if (error) {
      return res.status(400).json({
        success: false,
        message: sanitizeError(error),
      });
    }

    next();
  });
};

// مسار التسجيل: POST /api/auth/signup
router.post('/signup', signupLimiter, signupAvatarUploadHandler, signup);

// مسار تسجيل الدخول: POST /api/auth/login
router.post('/login', authLimiter, login);

// مسار طلب رمز استعادة كلمة المرور: POST /api/auth/forgot-password
router.post('/forgot-password', authLimiter, forgotPassword);

// مسار إعادة تعيين كلمة المرور: POST /api/auth/reset-password
router.post('/reset-password', authLimiter, resetPassword);

// مسار التحقق من التوكن وجلب المستخدم الحالي: GET /api/auth/me
router.get('/me', protect, getCurrentUser);

// مسار تجديد الجلسة: POST /api/auth/refresh
router.post('/refresh', authLimiter, refresh);

// مسار تسجيل الخروج وإبطال الجلسة: POST /api/auth/logout
router.post('/logout', logout);

module.exports = router;
