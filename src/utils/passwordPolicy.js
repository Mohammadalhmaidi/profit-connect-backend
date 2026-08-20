// سياسة كلمة المرور الموحدة: 8 أحرف على الأقل + حرف كبير + رقم
const MIN_LENGTH = 8;
const HAS_UPPERCASE = /[A-Z]/;
const HAS_DIGIT = /\d/;

exports.MIN_LENGTH = MIN_LENGTH;

/**
 * التحقق من قوة كلمة المرور
 * @param {string} password
 * @returns {{ valid: boolean, message: string }}
 */
exports.validatePassword = (password) => {
  if (typeof password !== 'string' || password.length < MIN_LENGTH) {
    return {
      valid: false,
      message: `كلمة المرور يجب أن تكون ${MIN_LENGTH} أحرف على الأقل`,
    };
  }
  if (!HAS_UPPERCASE.test(password)) {
    return {
      valid: false,
      message: 'كلمة المرور يجب أن تحتوي على حرف كبير واحد على الأقل (A-Z)',
    };
  }
  if (!HAS_DIGIT.test(password)) {
    return {
      valid: false,
      message: 'كلمة المرور يجب أن تحتوي على رقم واحد على الأقل (0-9)',
    };
  }
  return { valid: true, message: '' };
};