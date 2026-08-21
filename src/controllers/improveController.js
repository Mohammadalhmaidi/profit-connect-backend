const { improveContent } = require('../services/aiEvaluationService');
const { sanitizeError } = require('../utils/sanitizeError');

exports.improve = async (req, res) => {
  try {
    const { text } = req.body;
    if (!text?.trim()) {
      return res.status(400).json({ success: false, message: 'النص مطلوب' });
    }

    const improved = await improveContent(text);

    res.status(200).json({
      success: true,
      data: {
        original: text,
        improved,
      },
    });
  } catch (error) {
    console.error('Improve Error:', sanitizeError(error));
    res.status(500).json({ success: false, message: 'فشل تحسين النص. تحقق من اتصال الذكاء الاصطناعي' });
  }
};
