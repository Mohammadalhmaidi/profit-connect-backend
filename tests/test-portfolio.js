// اختبار وظيفي سريع لنظام المعرض (Portfolio)
// يتطلب أن يكون السيرفر شغالاً على المنفذ 5000
const fs = require('fs');
const path = require('path');

const BASE = 'http://localhost:5000';
const EMAIL = `portfolio-test-${Date.now()}@test.com`;
let accessToken = '';
let userId = '';
let itemId = '';
let collectionId = '';

// صورة اختبار PNG صغيرة (1x1)
const tinyPng = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==',
  'base64'
);
const imgPath = path.join(__dirname, 'portfolio-test.png');
fs.writeFileSync(imgPath, tinyPng);

async function req(method, url, { token, body, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let payload;
  if (form) {
    payload = form;
  } else if (body) {
    headers['Content-Type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await fetch(BASE + url, { method, headers, body: payload });
  let data = null;
  try { data = await res.json(); } catch (e) {}
  return { status: res.status, data };
}

(async () => {
  try {
    // 1) تسجيل مستخدم (multipart/form-data — كما يتوقع المسار)
    const signupForm = new FormData();
    signupForm.append('email', EMAIL);
    signupForm.append('password', 'password123');
    signupForm.append('role', 'JobSeeker');
    signupForm.append('firstName', 'بورتفوليو');
    signupForm.append('lastName', 'تست');
    r = await req('POST', '/api/auth/signup', { form: signupForm });
    console.log('1. signup:', r.status, r.data?.success, r.data?.message || '');
    accessToken = r.data?.token;
    if (!accessToken) throw new Error('لا يوجد توكن');

    // 2) جلب المستخدم الحالي
    r = await req('GET', '/api/auth/me', { token: accessToken });
    console.log('2. me:', r.status, r.data?.success);
    userId = r.data?.user?.id || r.data?.data?._id;

    // 3) إنشاء عمل مع رفع صورة
    const form = new FormData();
    form.append('title', 'موقع تجارة إلكترونية');
    form.append('category', 'تطوير واجهات');
    form.append('description', 'تصميم وبرمجة متجر كامل');
    form.append('tags', JSON.stringify(['React', 'Node.js']));
    form.append('skills', JSON.stringify(['React', 'Express']));
    form.append('media', new Blob([tinyPng], { type: 'image/png' }), 'work.png');
    r = await req('POST', '/api/portfolio/items', { token: accessToken, form });
    console.log('3. createItem:', r.status, r.data?.success, '| cover:', !!r.data?.data?.coverImage);
    itemId = r.data?.data?._id;

    // 4) أعمالي
    r = await req('GET', '/api/portfolio/items', { token: accessToken });
    console.log('4. getMyItems:', r.status, '| count:', r.data?.count);

    // 5) معرض المستخدم (عام)
    r = await req('GET', `/api/portfolio/users/${userId}/items`, { token: accessToken });
    console.log('5. getUserItems:', r.status, '| count:', r.data?.count);

    // 6) إعجاب
    r = await req('POST', `/api/portfolio/items/${itemId}/like`, { token: accessToken });
    console.log('6. toggleLike:', r.status, '| likes:', r.data?.likesCount);

    // 7) إنشاء مجموعة وإضافة العمل
    r = await req('POST', '/api/portfolio/collections', { token: accessToken, body: { name: 'مشاريعي' } });
    console.log('7. createCollection:', r.status, r.data?.success);
    collectionId = r.data?.data?._id;
    r = await req('POST', `/api/portfolio/collections/${collectionId}/items/${itemId}`, { token: accessToken });
    console.log('8. addToCollection:', r.status, r.data?.success);

    // 9) مجموعاتي مع الأعمال
    r = await req('GET', '/api/portfolio/collections', { token: accessToken });
    console.log('9. getMyCollections:', r.status, '| items in first:', r.data?.data?.[0]?.items?.length);

    // 10) تعديل العمل
    r = await req('PUT', `/api/portfolio/items/${itemId}`, { token: accessToken, body: { title: 'متجر إلكتروني (معدل)' } });
    console.log('10. updateItem:', r.status, '| new title:', r.data?.data?.title);

    // 11) حذف العمل
    r = await req('DELETE', `/api/portfolio/items/${itemId}`, { token: accessToken });
    console.log('11. deleteItem:', r.status, r.data?.success);

    console.log('\n==== TEST COMPLETE ====');
  } catch (e) {
    console.error('TEST ERROR:', e.message);
  } finally {
    fs.unlinkSync(imgPath);
  }
})();
