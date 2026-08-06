# Network API Documentation (نظام الشبكة)

نظام الشبكة الاجتماعية في منصة Profit Connect — يشمل **الاتصالات (Connections)**، **المتابعة (Follow)**، و**البحث عن المستخدمين**.

- **Base URL:** `/api/network`
- **الحماية:** جميع المسارات `Private` وتتطلب `Authorization: Bearer <token>`
- **الملفات:** [Connection.js](/src/models/Connection.js) · [networkController.js](/src/controllers/networkController.js) · [networkRoutes.js](/src/routes/networkRoutes.js)

---

## المفاهيم الأساسية

### 1. الاتصالات (Connections)
نظام مستقل مبني على كيان `Connection` يربط شخصين:
- `requester`: مَن أرسل الطلب
- `recipient`: مَن استلم الطلب

حالات الطلب: `pending` → `accepted` | `rejected`

هناك فهرس `unique` على الزوج `requester + recipient`، والكود يمنع أيضاً أي طلب سابق بين الطرفين **في الاتجاهين**.

### 2. المتابعة (Follow)
نظام منفصل مخزّن داخل `User.profile.followers` و `User.profile.following` (قوائم + أعداد). مسارات المتابعة الأصلية تبقى كما هي في `/api/users`، وواجهة الشبكة توفر الوصول المختصر.

### 3. حالة العلاقة (Status)
أي مستخدمين بينهما أحد هذه الحالات:
| الحالة | المعنى |
|---|---|
| `none` | لا يوجد أي رابط |
| `pending_sent` | أرسلت أنت طلباً وهو معلق |
| `pending_received` | وصلتك أنت طلب وهو معلق |
| `connected` | متصلان (accepted) |

---

## 1. إرسال طلب اتصال

**`POST /api/network/connect/:userId`**

| الحقل | النوع | الوصف |
|---|---|---|
| `userId` | string | المستخدم المراد إرسال الطلب له |

- يمنع إرسال طلب لنفسك.
- يمنع التكرار في الاتجاهين (موجود أو متصل بالفعل).

**Success `201`:**
```json
{
  "success": true,
  "message": "تم إرسال طلب الاتصال بنجاح",
  "data": {
    "_id": "connection_id",
    "requester": "current_user_id",
    "recipient": "target_user_id",
    "status": "pending",
    "createdAt": "...",
    "updatedAt": "..."
  }
}
```

**Errors:** `400` (نفسك / موجود) · `404` (مستخدم غير موجود) · `500`

> يُرسل إشعاراً للمستلم من نوع `connection_request`.

---

## 2. قبول طلب اتصال

**`PUT /api/network/accept/:requestId`**

| الحقل | النوع | الوصف |
|---|---|---|
| `requestId` | string | معرّف طلب الاتصال |

- فقط `recipient` الفعلي يمكنه القبول.
- الحالة تصبح `accepted`.

**Success `200`:**
```json
{ "success": true, "message": "تم قبول طلب الاتصال، أنتما الآن متصلان!" }
```

**Errors:** `403` (غير مصرح) · `400` (الطلب ليس معلقاً) · `404` · `500`

> يُرسل إشعاراً للمرسل من نوع `connection_accepted`.

---

## 3. رفض طلب اتصال

**`PUT /api/network/reject/:requestId`**

- فقط `recipient` الفعلي يمكنه الرفض.
- الحالة تصبح `rejected` (لا يُحذف السجل).

**Success `200`:**
```json
{ "success": true, "message": "تم رفض طلب الاتصال" }
```

**Errors:** `403` · `400` · `404` · `500`

---

## 4. إلغاء طلب مرسل (قبل الرد)

**`DELETE /api/network/cancel/:userId`**

| الحقل | النوع | الوصف |
|---|---|---|
| `userId` | string | المستخدم الذي أرسلت له طلباً معلقاً |

- يحذف الطلب المعلق المُرسل فقط.
- `404` إذا لم يوجد طلب معلق مرسل.

**Success `200`:**
```json
{ "success": true, "message": "تم إلغاء طلب الاتصال" }
```

---

## 5. الطلبات الواردة المعلقة

**`GET /api/network/requests`**

يرجع الطلبات التي `recipient = أنا` و `status = pending` مع بيانات المرسل.

**Success `200`:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "connection_id",
      "requester": {
        "_id": "user_id",
        "profile": {
          "firstName": "Ahmad",
          "lastName": "Ali",
          "avatar": "avatar.png",
          "headline": "Frontend Developer"
        }
      },
      "recipient": "current_user_id",
      "status": "pending",
      "createdAt": "...",
      "updatedAt": "..."
    }
  ]
}
```

---

## 6. جهات الاتصال الحالية

**`GET /api/network/connections`**

يرجع العلاقات `accepted` التي أنا طرف فيها، **بيانات الطرف الآخر فقط** (لا كائنات Connection).

**Success `200`:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    { "_id": "user_1", "profile": { "firstName": "Sara", "lastName": "Khaled", "headline": "Backend Developer", "avatar": "avatar1.png" } },
    { "_id": "user_2", "profile": { "firstName": "Omar", "lastName": "Nasser", "headline": "Product Designer", "avatar": "avatar2.png" } }
  ]
}
```

---

## 7. إزالة اتصال حالي

**`DELETE /api/network/remove/:userId`**

| الحقل | النوع | الوصف |
|---|---|---|
| `userId` | string | المستخدم المراد قطع الاتصال معه |

- يبحث عن علاقة `accepted` في الاتجاهين ويحذفها نهائياً.

**Success `200`:**
```json
{ "success": true, "message": "تم إزالة جهة الاتصال بنجاح" }
```

**Errors:** `404` (لا توجد جهة اتصال) · `500`

---

## 8. حالة العلاقة مع مستخدم

**`GET /api/network/status/:userId`**

| الحقل | النوع | الوصف |
|---|---|---|
| `userId` | string | المستخدم المراد فحص العلاقة معه |

**Success `200`:**
```json
{
  "success": true,
  "data": { "status": "connected", "connectionId": "connection_id", "targetId": "user_id" }
}
```

القيم المحتملة لـ `status`: `none` · `pending_sent` · `pending_received` · `connected`

> مثالية لعرض زر الإجراء المناسب في الواجهة (إرسال / انتظار / قبول / متصل / إزالة).

---

## 9. طلباتي المرسلة المعلقة

**`GET /api/network/sent-requests`**

يرجع الطلبات التي `requester = أنا` و `status = pending` مع بيانات المستلم.

**Success `200`:**
```json
{
  "success": true,
  "count": 1,
  "data": [
    {
      "_id": "connection_id",
      "recipient": {
        "_id": "user_id",
        "profile": { "firstName": "Sara", "lastName": "Khaled", "avatar": "avatar1.png", "headline": "Designer" }
      },
      "status": "pending",
      "createdAt": "..."
    }
  ]
}
```

---

## 10. إحصائيات الشبكة

**`GET /api/network/stats`**

ملخص رقمي سريع لصفحة الشبكة.

**Success `200`:**
```json
{
  "success": true,
  "data": {
    "connectionsCount": 12,   // جهات الاتصال المقبولة
    "pendingRequests": 3,     // طلبات واردة بانتظار ردّي
    "sentRequests": 1,        // طلبات أرسلتها بانتظار الرد
    "followersCount": 45,
    "followingCount": 20
  }
}
```

---

## 11. قائمة متابعيني

**`GET /api/network/followers`**

يرجع قائمة المستخدمين الذين يتابعونني مع الأعداد.

**Success `200`:**
```json
{
  "success": true,
  "count": 5,
  "data": [
    { "_id": "user_id", "profile": { "firstName": "Ahmad", "lastName": "Ali", "avatar": "avatar.png", "headline": "Developer" } }
  ]
}
```

---

## 12. قائمة من أتابعهم

**`GET /api/network/following`**

يرجع قائمة المستخدمين الذين أتابعهم مع الأعداد. (نفس شكل استجابة المتابعين)

---

## 13. البحث عن المستخدمين

**`GET /api/network/search?q=&limit=`**

| المفتاح | النوع | الوصف |
|---|---|---|
| `q` | string | نص البحث (مطلوب) — يبحث في الاسم الأول/الأخير/العنوان/اسم المستخدم |
| `limit` | number | عدد النتائج (افتراضي 20) |

**Success `200`:**
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "user_1",
      "username": "ahmad_dev",
      "role": "JobSeeker",
      "profile": { "firstName": "Ahmad", "lastName": "Ali", "avatar": "avatar.png", "headline": "Frontend Developer" },
      "isFollowing": true,
      "connectionStatus": "none"
    }
  ]
}
```

- `isFollowing`: هل أتابع هذا المستخدم؟
- `connectionStatus`: من حالات الاتصال السابقة (مفيد لعرض حالة الزر في نتائج البحث).
- `400` إذا كان `q` فارغاً.

---

## 14. اكتشاف مستخدمين مقترحين (عشوائي)

**`GET /api/network/discover?limit=10&role=JobSeeker&excludeFollowing=false`**

يرجع مستخدمين **عشوائياً** ليختار المستخدم من يتابعهم — مثالي لصفحة "اقتراحات المتابعة".

| المفتاح | النوع | الافتراضي | الوصف |
|---|---|---|---|
| `limit` | number | 10 | عدد النتائج (الحد الأقصى 20) |
| `role` | string | — | فلترة حسب الدور: `Employer` / `JobSeeker` / `FreelanceClient` |
| `excludeFollowing` | boolean | `true` | استبعاد من أتابعهم بالفعل (حوّل إلى `false` لتضمينهم) |

**المميزات:**
- يستبعد نفسك والمستخدمين غير النشطين دائماً.
- يُرجع `isFollowing` لكل نتيجة.
- العشوائية عبر `$sample` في التجميع — تختلف النتائج كل استعلام.

**Success `200`:**
```json
{
  "success": true,
  "count": 10,
  "data": [
    {
      "_id": "user_id",
      "username": "sara_dev",
      "role": "JobSeeker",
      "profile": { "firstName": "Sara", "lastName": "Khaled", "avatar": "avatar.png", "headline": "Backend Developer", "followersCount": 34 },
      "professional": { "industry": "تقنية", "skills": ["Node.js", "MongoDB"], "yearsOfExperience": 5 },
      "isFollowing": false
    }
  ]
}
```

---

## 15. نظام المتابعة (Follow)

نظام منفصل عن الاتصالات: تتابع شخصاً بدون موافقته، مخزّن في `User.profile.followers` و`User.profile.following` (قوائم + عدّادات).

> ⚠️ توجد **مجموعتان متوازيتان** من المسارات (كلاهما يعمل):

### أ) مسارات `/api/users` (الأصلية — مأخوذة من `followController`)
| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/api/users/:userId/follow` | متابعة مستخدم (خطأ 400 إذا كنت تتابعه بالفعل) |
| DELETE | `/api/users/:userId/follow` | إلغاء المتابعة |

### ب) مسارات `/api/user` (مأخوذة من `userController`)
| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/api/user/:userId/follow` | **تبديل (Toggle)** — يتابع إن لم تكن، أو يلغي إن كنت |
| GET | `/api/user/:userId/followers` | متابعو مستخدم محدد (أي مستخدم) |
| GET | `/api/user/:userId/following` | من يتابعهم مستخدم محدد |
| GET | `/api/user/:userId` | الملف الشخصي مع العدّادات (`followersCount`/`followingCount`) |

**Toggle `POST /api/user/:userId/follow`** — الرد:
```json
{ "success": true, "following": true, "message": "تمت المتابعة بنجاح" }
```
أو عند الإلغاء: `"following": false`.

> **توصية للفرونت:** استخدم مسارات `/api/user` (التوغل + القوائم لأي مستخدم)، والردّ `following` في الـ Toggle يعطيك الحالة الجديدة مباشرة بدون استعلام إضافي.

---

## ملخص المسارات

| الطريقة | المسار | الوظيفة |
|---|---|---|
| GET | `/api/network/search?q=&limit=` | البحث عن مستخدمين |
| GET | `/api/network/discover` | مستخدمون مقترحون عشوائياً |
| GET | `/api/network/followers` | متابعيني |
| GET | `/api/network/following` | من أتابعهم |
| GET | `/api/network/connections` | جهات الاتصال المقبولة |
| GET | `/api/network/requests` | طلبات الاتصال الواردة |
| GET | `/api/network/sent-requests` | طلبات الاتصال المرسلة (المعلقة) |
| GET | `/api/network/stats` | إحصائيات الشبكة (عدادات) |
| GET | `/api/network/status/:userId` | حالة العلاقة مع مستخدم |
| POST | `/api/network/connect/:userId` | إرسال طلب اتصال |
| PUT | `/api/network/accept/:requestId` | قبول طلب |
| PUT | `/api/network/reject/:requestId` | رفض طلب |
| DELETE | `/api/network/cancel/:userId` | إلغاء طلب مرسل |
| DELETE | `/api/network/remove/:userId` | إزالة اتصال حالي |

### نظام المتابعة
| الطريقة | المسار | الوظيفة |
|---|---|---|
| POST | `/api/users/:userId/follow` | متابعة مستخدم |
| DELETE | `/api/users/:userId/follow` | إلغاء المتابعة |
| POST | `/api/user/:userId/follow` | تبديل المتابعة (Toggle) |
| GET | `/api/user/:userId/followers` | متابعو مستخدم محدد |
| GET | `/api/user/:userId/following` | من يتابعهم مستخدم محدد |
| GET | `/api/user/:userId` | الملف الشخصي + العدّادات |

---

## رموز الأخطاء
- `400` — معرّف غير صالح / طلب موجود / قيمة مكررة / `q` فارغ
- `401` — توكن مفقود أو غير صالح
- `403` — غير مصرح (لسنا الطرف المطلوب)
- `404` — سجل غير موجود
- `500` — خطأ خادم داخلي

---

## ملاحظات للواجهة الأمامية
- زر "اتصال" في صفحة المستخدم: استخدم `GET /status/:userId` لتقرير النص/الإجراء، ثم نفّذ المسار المناسب.
- صفحة "الطلبات": `GET /requests` (واردة) + أزرار قبول/رفض، و`GET /sent-requests` (مرسلة) + زر إلغاء.
- صفحة "الشبكة": `GET /connections` + `GET /stats` للعدادات.
- صفحة "المتابعون/المتابَعون": `GET /followers` و `GET /following` (لنفسي) أو `GET /api/user/:userId/followers` و`.../following` (لأي مستخدم).
- صفحة البحث: `GET /search?q=` مع عيّنات `isFollowing` و `connectionStatus`.
- الإشعارات: تصل عبر `GET /api/projects/notifications` مع حقل `senderId` (مُرجع من User):
  - `connection_request` → عند إرسال طلب اتصال (للمستلم)
  - `connection_accepted` → عند قبول طلبك (للمرسل)
  - `connection_rejected` → عند رفض طلبك (للمرسل)
  - `follow` → عند متابعة شخص لك (مثال: `"message": "بدأ أحمد علي بمتابعتك"`)
