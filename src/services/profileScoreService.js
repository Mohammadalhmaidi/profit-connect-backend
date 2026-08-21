const RScoreService = require('./rScoreService');
const { evaluateContent, evaluateWithContext } = require('./aiEvaluationService');
const { sanitizeError } = require('../utils/sanitizeError');

const FIELD_ACTIONS = {
  'profile.headline':               'ADD_HEADLINE',
  'profile.bio':                    'ADD_BIO',
  'profile.location':               'ADD_LOCATION',
  'profile.phoneNumber':            'ADD_PHONE',
  'profile.socialLinks.linkedin':   'ADD_LINKEDIN',
  'profile.socialLinks.github':     'ADD_GITHUB',
  'profile.socialLinks.website':    'ADD_WEBSITE',
  'professional.industry':          'ADD_INDUSTRY',
  'professional.yearsOfExperience': 'ADD_EXPERIENCE_YEARS',
};

const PROMPTS = {
  headline: `أنت خبير تقييم ملفات مهنية على منصة مثل LinkedIn. قيّم جملة الـ Headline التالية:
- إذا كانت ركيكة أو فارغة المعنى أو غير مهنية: أجب من 0 إلى 2
- إذا كانت جيدة وتصف التخصص بوضوح: أجب من 3 إلى 4
- إذا كانت احترافية ومميزة وتشمل تخصص + قيمة مضافة: أجب 5
أجب برقم فقط من 0 إلى 5`,

  skills: `أنت خبير تقييم ملفات مهنية. قيّم قائمة المهارات التالية بناءً على:
- العدد (قليلة جداً = أقل، متنوعة = أكثر)
- الصلة المهنية (مهارات عامة = أقل، تقنية أو متخصصة = أكثر)
أجب برقم فقط من 0 إلى 5`,

  bio: `أنت خبير تقييم محتوى مهني. إذا كان النص يحتوي على شتائم أو محتوى غير لائق أجب بـ 0.
إذا كان مقبولاً قيّمه من 1 إلى 5 حسب الاحترافية والوضوح والقيمة المضافة.
أجب برقم فقط من 0 إلى 5`,
};

const getValue = (obj, path) => path.split('.').reduce((o, k) => o?.[k], obj);

const runAiEvaluation = async (userId, actionKey, content, prompt, label) => {
  setImmediate(async () => {
    try {
      const score = await evaluateWithContext(content, prompt);
      if (score > 0) {
        await RScoreService.applyScore(userId, actionKey, `${label}: ${score} نقاط`, score);
      }
    } catch (e) {
      console.error(`[Profile AI Error - ${actionKey}]:`, sanitizeError(e));
    }
  });
};

const evaluateProfileCompletion = async (userId, oldUser, updatedUser) => {
  // نقاط ثابتة للحقول الجديدة
  for (const [fieldPath, actionKey] of Object.entries(FIELD_ACTIONS)) {
    const wasEmpty = !getValue(oldUser, fieldPath);
    const isNowFilled = !!getValue(updatedUser, fieldPath);
    if (wasEmpty && isNowFilled) {
      await RScoreService.applyScore(userId, actionKey, `إكمال الملف الشخصي: ${fieldPath}`);
    }
  }

  // تقييم ذكي للـ bio
  const bioWasEmpty = !getValue(oldUser, 'profile.bio');
  const newBio = getValue(updatedUser, 'profile.bio');
  if (bioWasEmpty && newBio) {
    runAiEvaluation(userId, 'BIO_QUALITY_SCORE', newBio, PROMPTS.bio, 'جودة النبذة الشخصية');
  }

  // تقييم ذكي للـ headline
  const headlineWasEmpty = !getValue(oldUser, 'profile.headline');
  const newHeadline = getValue(updatedUser, 'profile.headline');
  if (headlineWasEmpty && newHeadline) {
    runAiEvaluation(userId, 'HEADLINE_QUALITY_SCORE', newHeadline, PROMPTS.headline, 'جودة الـ Headline');
  }

  // تقييم ذكي للـ skills
  const skillsWereEmpty = !getValue(oldUser, 'professional.skills')?.length;
  const newSkills = getValue(updatedUser, 'professional.skills');
  if (skillsWereEmpty && newSkills?.length) {
    runAiEvaluation(userId, 'SKILLS_QUALITY_SCORE', newSkills.join('، '), PROMPTS.skills, 'جودة المهارات');
  }
};

module.exports = { evaluateProfileCompletion };
