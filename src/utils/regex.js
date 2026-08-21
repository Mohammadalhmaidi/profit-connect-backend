// يهرّب أحرف regex الخاصة قبل استخدام مدخلات المستخدم في استعلامات MongoDB $regex
const escapeRegex = (str) =>
  String(str ?? '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

module.exports = { escapeRegex };