# نظام المعرض (Portfolio) — دليل الفرونت إند

معرض أعمال لكل مستخدم يعرض فيه أعماله (صور/فيديوهات) مثل المنشورات، ويقسمها في مجموعات. جميع الطلبات تحت `/api/portfolio` ومحمية بتوكن `Bearer`.

## التكاملات التلقائية

- **نقاط السمعة (rScore)**: `+10` عند إضافة عمل، `+1` عند استلام إعجاب.
- **مراقبة المحتوى بالذكاء الاصطناعي**: الوصف يُفحص في الخلفية (تحذير للمستخدم عند عدم اللائق — لا يُحذف العمل تلقائياً).
- **عداد أعمال المستخدم**: `profile.portfolioCount` يتحدّث تلقائياً.

---

## بنية البيانات

### PortfolioItem (العمل)

| الحقل | النوع | مطلوب | ملاحظات |
|---|---|---|---|
| `user` | ObjectId | — | صاحب العمل (يُؤخذ من التوكن، لا يُرسل) |
| `title` | String | ✅ | |
| `category` | String | ✅ | مثال: "تطوير", "تصميم", "كتابة" |
| `description` | String | | |
| `tags` | [String] | | يُرسل كـ JSON نصي في FormData |
| `media` | [{ url, type, order }] | | `type`: `image` / `video` |
| `coverImage` | String | | صورة الغلاف |
| `projectUrl` | String | | رابط المعاينة |
| `skills` | [String] | | يُرسل كـ JSON نصي في FormData |
| `client` | String | | اسم العميل |
| `duration` | String | | المدة |
| `role` | String | | دورك في العمل |
| `visibility` | enum | | `public` / `private` (افتراضي public) |
| `isFeatured` | Boolean | | |
| `linkedProject` | ObjectId | | ربط بمشروع داخل المنصة (اختياري) |
| `likes` | [ObjectId] | | |
| `views` | Number | | |

روابط الوسائط: `http://host/uploads/portfolio/<filename>` — يمكن استخدام الجزء النسبي `/uploads/portfolio/...` مباشرة.

### PortfolioCollection (المجموعة)

| الحقل | النوع | مطلوب |
|---|---|---|
| `user` | ObjectId | — |
| `name` | String | ✅ |
| `description` | String | |
| `items` | [ObjectId → PortfolioItem] | |
| `isPublic` | Boolean | افتراضي `true` |

---

## المسارات

### أ) الأعمال (Items)

#### إنشاء عمل — `POST /api/portfolio/items`

**نوع المحتوى: `multipart/form-data`** (إلزامي للرفع)

| الحقل | النوع | مطلوب |
|---|---|---|
| `title` | text | ✅ |
| `category` | text | ✅ |
| `media[]` | ملفات (حتى 12) | ✅ صورة أو فيديو |
| `description` | text | |
| `tags` | JSON نصي | |
| `skills` | JSON نصي | |
| `client` / `duration` / `role` / `projectUrl` | text | |
| `visibility` | text | |
| `linkedProject` | text (ObjectId) | |

⚠️ `tags` و `skills` تُرسلان كسلسلة JSON (لأن الطلب FormData):

```js
const form = new FormData();
form.append('title', 'متجر إلكتروني');
form.append('category', 'تطوير');
form.append('media', imageFile); // imageFile من <input type="file">
form.append('tags', JSON.stringify(['React', 'Node']));
form.append('skills', JSON.stringify(['React', 'Express']));

fetch('/api/portfolio/items', {
  method: 'POST',
  headers: { Authorization: 'Bearer ' + token },
  body: form,
});
```

**الاستجابة 201:**

```json
{
  "success": true,
  "message": "تمت إضافة العمل إلى معرضك",
  "data": {
    "_id": "...",
    "title": "...",
    "media": [{ "url": "/uploads/portfolio/x.png", "type": "image", "order": 0 }],
    "coverImage": "/uploads/portfolio/x.png",
    "views": 0,
    "likes": [],
    "createdAt": "..."
  }
}
```

**سلوك تلقائي**: `coverImage` = أول صورة مرفوعة؛ وإن رُفع فيديو فقط فالغلاف = الفيديو.

---

#### أعمالي — `GET /api/portfolio/items`

معاملات استعلام: `page`, `limit` (12 افتراضياً), `category`, `tag`, `featured=true`

```json
{
  "success": true,
  "count": 1,
  "data": [ { ...item } ],
  "pagination": { "page": 1, "limit": 12, "total": 1, "pages": 1 }
}
```

#### معرض مستخدم — `GET /api/portfolio/users/:userId/items`

يعرض **العام فقط** إلا إذا كان `userId` هو صاحب التوكن (يرى كل شيء). نفس معاملات الترقيم.

#### تفاصيل عمل — `GET /api/portfolio/items/:id`

- يُنقص `views` **فقط إذا لم يكن الزائر صاحب العمل**.
- العمل الخاص لغير المالك يعود **404**.

#### تعديل — `PUT /api/portfolio/items/:id` *(المالك فقط)*

يمكن إرسال **JSON** أو **multipart**. القواعد:

- **إن لم تُرسل وسائط ولم تُرفع ملفات**: تُحفظ الوسائط الحالية كما هي.
- **رفع ملفات جديدة**: تُضاف في نهاية قائمة الوسائط الحالية.
- **`media`** (JSON نصي): إرسال الوسائط الحالية كاملة لإعادة ترتيبها.
- **`removeMedia`** (JSON نصي): مصفوفة روابط لحذفها نهائياً من التخزين.
- **`coverImage`**: إن أُرسل يُستخدم؛ وإلا يُعاد حسابه من أول صورة (إذا تغيّرت الوسائط).

مثال تعديل بسيط (تغيير العنوان فقط بدون إرسال وسائط):

```js
fetch(`/api/portfolio/items/${id}`, {
  method: 'PUT',
  headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
  body: JSON.stringify({ title: 'عنوان جديد' }),
});
```

⚠️ الوسائط لن تُمسح في هذه الحالة.

#### حذف — `DELETE /api/portfolio/items/:id` *(المالك فقط)*

يحذف ملفات الوسائط من السيرفر، يزيل العمل من كل المجموعات، ويُنقص `portfolioCount`.

#### إعجاب — `POST /api/portfolio/items/:id/like`

تبديل (إعجاب/إلغاء):

```json
{ "success": true, "isLiked": true, "likesCount": 5 }
```

---

### ب) المجموعات (Collections)

| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/api/portfolio/collections` | إنشاء `{name, description?, isPublic?}` |
| GET | `/api/portfolio/collections` | مجموعاتي (مع الأعمال المضمّنة) |
| GET | `/api/portfolio/users/:userId/collections` | مجموعات مستخدم (العام فقط لغير المالك) |
| GET | `/api/portfolio/collections/:id` | تفاصيل + الأعمال |
| PUT | `/api/portfolio/collections/:id` | تعديل *(المالك)* |
| DELETE | `/api/portfolio/collections/:id` | حذف *(المالك)* |
| POST | `/api/portfolio/collections/:id/items/:itemId` | إضافة عمل (يجب أن يكون العمل لصاحب المجموعة) |
| DELETE | `/api/portfolio/collections/:id/items/:itemId` | إزالة عمل |

**ملاحظة**: العمل نفسه لا يُحذف عند حذف مجموعة — فقط يُفصل عنها.

---

## الأمان والصلاحيات

- كل المسارات تحتاج `Authorization: Bearer <token>` → **401** بدون توكن.
- التعديل/الحذف للأعمال والمجموعات → **403** لغير المالك.
- الخصوصية: `private` و`isPublic:false` يعملان كـ 404 للغير.
- الحسابات المحظورة (banned) مرفوضة من الـ middleware تلقائياً.

## قواعد الرفع

- الصور: `jpeg, png, webp, jpg, gif` — الفيديو: `mp4, webm, mov, avi`.
- الحد الأقصى: **12 ملفاً** لكل طلب، **50MB** لكل ملف.
- خطأ الرفع يعود **400** مع رسالة عربية.

---

## سيناريوهات الفرونت إند المقترحة

1. **لوحة معرضي**: `GET /api/portfolio/items` مع ترقيم وبحث حسب `category`.
2. **ملف مستخدم عام**: `GET /api/portfolio/users/:id/items` + `GET /api/portfolio/users/:id/collections` لعرض الشبكة.
3. **صفحة تفاصيل عمل**: `GET /api/portfolio/items/:id` مع عرض `media` بترتيب `order` وزر إعجاب.
4. **نموذج إنشاء/تعديل**: FormData بالحقول أعلاه، مع إتاحة اختيار صورة الغلاف (يُرسل `coverImage`).
5. **المجموعات**: ألبومات تحوي أعمالاً، مع إضافة/إزالة سريعة من شاشة العمل نفسه.
