const { translateContent } = require('../services/aiEvaluationService');

const GOOGLE_TRANSLATE_URL = 'https://translate.googleapis.com/translate_a/single';

/**
 * ترجمة مجانية عبر Google Translate (بدون مفتاح)
 * fallback يُستخدم عندما تفشل جميع مزوّدي الذكاء الاصطناعي.
 */
async function googleTranslate(text) {
  const url = new URL(GOOGLE_TRANSLATE_URL);
  url.searchParams.set('client', 'gtx');
  url.searchParams.set('sl', 'en');
  url.searchParams.set('tl', 'ar');
  url.searchParams.set('dt', 't');
  url.searchParams.set('q', text);

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20000) });
  if (!res.ok) throw new Error(`Google translate HTTP ${res.status}`);
  const data = await res.json();
  const segments = data?.[0] ?? [];
  const translated = segments
    .map((seg) => (seg && seg[0] ? seg[0] : ''))
    .join('');
  if (!translated) throw new Error('Google translate returned empty result');
  return translated;
}

exports.translate = async (req, res) => {
  try {
    const { text } = req.body;

    if (!text) {
      return res.status(400).json({ success: false, message: 'النص المطلوب ترجمته مطلوب' });
    }

    let translated;
    try {
      translated = await translateContent(text);
    } catch (aiError) {
      console.warn('AI translate failed, falling back to Google Translate:', aiError.message);
      translated = await googleTranslate(text);
    }

    res.status(200).json({
      success: true,
      data: {
        original: text,
        translated,
      },
    });
  } catch (error) {
    console.error('Translate Error:', error.message);
    res.status(500).json({ success: false, message: 'حدث خطأ أثناء الترجمة' });
  }
};