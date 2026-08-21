const User = require('../models/User');
const { sanitizeError } = require('../utils/sanitizeError');
const ScoreHistory = require('../models/ScoreHistory');
const SCORE_RULES = require('../../constants/scoreRules');

/**
 * خدمة R-Score (نظام النقاط والتقييم الذكي)
 * تدير منح النقاط، وتتحقق من القيود (مثل الحد اليومي)، وتمنع الغش.
 */
class RScoreService {
  
  /**
   * إضافة أو خصم نقاط للمستخدم بناءً على الفعل
   * @param {String} userId - معرف المستخدم الذي سيحصل على النقاط
   * @param {String} actionKey - مفتاح الفعل من قاموس القواعد (مثل CREATE_POST)
   * @param {String} description - وصف يوضح سبب الحصول على النقاط (يحفظ في السجل)
   * @param {Number|null} dynamicPoints - نقاط متغيرة قادمة من الذكاء الاصطناعي (اختياري)
   * @returns {Boolean} - يرجع true إذا تمت إضافة النقاط، و false إذا تم الرفض (لتجاوز الحد المسموح)
   */
  static async applyScore(userId, actionKey, description = '', dynamicPoints = null) {
    try {
      // 1. التأكد من وجود القاعدة في النظام
      const rule = SCORE_RULES[actionKey];
      if (!rule) {
        console.warn(`[R-Score Warning]: Action key '${actionKey}' is not defined.`);
        return false;
      }

      // 2. تحديد عدد النقاط (نستخدم نقاط الذكاء الاصطناعي إن وُجدت، وإلا نستخدم النقاط الثابتة)
      const pointsToApply = dynamicPoints !== null ? dynamicPoints : rule.points;

      // 3. التحقق من قيد "المرة الواحدة" (ONCE)
      // مثل رفع صورة شخصية، لا يمكن الحصول على الجائزة مرتين
      if (rule.type === 'ONCE') {
        const hasBeenRewarded = await ScoreHistory.exists({ user: userId, actionKey });
        if (hasBeenRewarded) {
          return false; // المستخدم حصل على هذه المكافأة مسبقاً
        }
      }

      // 4. التحقق من "الحد اليومي" (DAILY_LIMIT)
      // يمنع السبام وتكرار التعليقات لجمع النقاط
      if (rule.type === 'DAILY_LIMIT') {
        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);
        
        // حساب إجمالي النقاط التي حصل عليها المستخدم من هذا الفعل في هذا اليوم تحديداً
        const todaysScores = await ScoreHistory.aggregate([
          { 
            $match: { 
              user: userId, 
              actionKey: actionKey, 
              createdAt: { $gte: startOfDay } 
            } 
          },
          { 
            $group: { 
              _id: null, 
              totalPoints: { $sum: '$points' } 
            } 
          }
        ]);
        
        const currentTotal = todaysScores.length > 0 ? todaysScores[0].totalPoints : 0;
        
        // إذا كانت النقاط الجديدة ستتجاوز الحد اليومي الأقصى، نرفض العملية بصمت
        if (currentTotal + pointsToApply > rule.maxDaily) {
          return false; 
        }
      }

      // 5. التنفيذ الفعلي (حفظ السجل وتحديث الحساب)
      // حفظ الحركة في السجل لضمان الشفافية
      const historyEntry = new ScoreHistory({
        user: userId,
        actionKey: actionKey,
        points: pointsToApply,
        description: description
      });

      await historyEntry.save();

      // استخدام العملية الذرية $inc لتحديث النقاط في حساب المستخدم مباشرة
      // هذا يمنع أي تضارب إذا حصل المستخدم على نقطتين في نفس الجزء من الثانية
      await User.findByIdAndUpdate(
        userId, 
        { $inc: { 'profile.rScore': pointsToApply } }
      );

      return true;
    } catch (error) {
      console.error(`[R-Score Error] Failed to apply score for user ${userId}:`, sanitizeError(error));
      return false; // نرجع false كي لا يتوقف التطبيق بسبب خطأ في النقاط
    }
  }

  /**
   * استرجاع إجمالي نقاط المستخدم ومستواه (مفيدة لعرضها في الواجهة الأمامية)
   * @param {String} userId - معرف المستخدم
   */
  static async getUserScoreDetails(userId) {
    try {
      const user = await User.findById(userId).select('profile.rScore');
      const score = user?.profile?.rScore || 0;
      
      // نظام مستويات ديناميكي بناءً على النقاط (Gamification)
      let level = 'Beginner'; // مبتدئ
      if (score >= 50) level = 'Active'; // نشط
      if (score >= 200) level = 'Pro'; // محترف
      if (score >= 1000) level = 'Expert'; // خبير
      if (score >= 5000) level = 'Thought Leader'; // قائد فكر (أعلى مستوى)

      return { score, level };
    } catch (error) {
      console.error(`[R-Score Error] Failed to fetch score details:`, sanitizeError(error));
      return { score: 0, level: 'Beginner' };
    }
  }
}

module.exports = RScoreService;