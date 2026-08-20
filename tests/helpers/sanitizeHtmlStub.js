// بديل خفيف لمكتبة sanitize-html (وهي ESM-only ولا يُحلّها Jest داخل node_modules).
// يكفي للاختبارات: يمرر النص كما هو ويزيل وسوم <script> فقط.
function simpleInject(raw) {
  return String(raw).replace(/<script[\s\S]*?<\/script>/gi, '');
}

function sanitizeHtml(dirty) {
  if (typeof dirty !== 'string') return dirty;
  return simpleInject(dirty);
}

sanitizeHtml.simpleTransform = (tagName, attribs) => (tag, currentAttribs) => ({
  tagName,
  attribs: { ...(currentAttribs || {}), ...(attribs || {}) },
});

module.exports = sanitizeHtml;