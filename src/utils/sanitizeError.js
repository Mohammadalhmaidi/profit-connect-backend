// يزيل مفاتيح API (مثل sk-proj-...) من رسائل الأخطاء قبل طباعتها في السجلات
const API_KEY_PATTERN = /sk-[A-Za-z0-9_-]{8,}/g;

const sanitizeError = (err) => {
  const raw = err && err.message ? err.message : String(err || 'Unknown error');
  return raw.replace(API_KEY_PATTERN, 'sk-***REDACTED***');
};

module.exports = { sanitizeError, API_KEY_PATTERN };