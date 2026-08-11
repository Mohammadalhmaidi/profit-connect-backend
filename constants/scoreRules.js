// أنواع القيود: 
// ONCE: تمنح مرة واحدة فقط في عمر الحساب (مثل رفع الصورة)
// DAILY_LIMIT: لها حد أقصى من النقاط في اليوم الواحد (مثل كتابة المنشورات)
// UNLIMITED: بدون قيود (مثل الخصومات أو العقوبات)

const SCORE_RULES = {
  UPLOAD_AVATAR: { points: 10, type: 'ONCE' },
  COMPLETE_PROFILE: { points: 15, type: 'ONCE' },
  ADD_SKILL: { points: 2, type: 'DAILY_LIMIT', maxDaily: 10 }, // 5 مهارات كحد أقصى يومياً
  CREATE_POST: { points: 5, type: 'DAILY_LIMIT', maxDaily: 20 }, // 4 منشورات تُكافأ يومياً كحد أقصى
  RECEIVE_LIKE: { points: 1, type: 'DAILY_LIMIT', maxDaily: 50 },
  ADD_COMMENT: { points: 2, type: 'DAILY_LIMIT', maxDaily: 20 },
  FOLLOW_COMPANY: { points: 1, type: 'DAILY_LIMIT', maxDaily: 10 },
  ADD_PORTFOLIO_ITEM: { points: 10, type: 'DAILY_LIMIT', maxDaily: 30 },
  RECEIVE_PORTFOLIO_LIKE: { points: 1, type: 'DAILY_LIMIT', maxDaily: 50 },
  PENALTY_VIOLATION: { points: -20, type: 'UNLIMITED' },
  bad_content:        { points: -5,  type: 'UNLIMITED' },

  // جودة الملف الشخصي
  ADD_HEADLINE:          { points: 5, type: 'ONCE' },
  ADD_BIO:               { points: 5, type: 'ONCE' },
  ADD_LOCATION:          { points: 3, type: 'ONCE' },
  ADD_PHONE:             { points: 3, type: 'ONCE' },
  ADD_LINKEDIN:          { points: 5, type: 'ONCE' },
  ADD_GITHUB:            { points: 5, type: 'ONCE' },
  ADD_WEBSITE:           { points: 3, type: 'ONCE' },
  ADD_INDUSTRY:          { points: 5, type: 'ONCE' },
  ADD_EXPERIENCE_YEARS:  { points: 5, type: 'ONCE' },
  BIO_QUALITY_SCORE:      { points: 0, type: 'ONCE' }, // النقاط تأتي من الذكاء ديناميكياً
  HEADLINE_QUALITY_SCORE: { points: 0, type: 'ONCE' },
  SKILLS_QUALITY_SCORE:   { points: 0, type: 'ONCE' },
};

module.exports = SCORE_RULES;