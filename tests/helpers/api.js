// أدوات مساعدة للاختبارات: التطبيق، عميل supertest، تسجيل مستخدم، صورة اختبار صغيرة
const request = require('supertest');

const app = require('../../src/index');

const api = () => request(app);

let emailCounter = 0;

// تسجيل مستخدم جديد عبر نقطة المصادقة الفعلية (JSON بدون صورة)
const signup = async (overrides = {}, role = 'JobSeeker') => {
  emailCounter += 1;
  const payload = {
    email: `test_user_${Date.now()}_${emailCounter}@test.com`,
    password: 'Password123',
    role,
    firstName: 'علي',
    lastName: 'أحمد',
    ...overrides,
  };
  const res = await api().post('/api/auth/signup').send(payload);
  if (res.status !== 201 || !res.body.token) {
    throw new Error(`signup failed: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return {
    res,
    token: res.body.token,
    userId: String(res.body.user.id || res.body.user._id),
    payload,
  };
};

const authHeader = (token) => ({ Authorization: `Bearer ${token}` });

// PNG 1x1 صغير لاختبارات رفع الملفات
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);

module.exports = { app, api, signup, authHeader, tinyPng };