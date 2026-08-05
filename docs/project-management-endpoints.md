# مرجع endpoints إدارة المشاريع الجديدة

توثيق تفصيلي لكل Endpoint من مجموعة الإدارة الجديدة في `/api/projects` — كلها `Private` (Bearer token) ومتاحة لصاحب المشروع فقط (`403` لغير المالك).

---

## 📊 1. النظرة الشاملة

### `GET /api/projects/:id/overview`
يرجع كل بيانات إدارة المشروع في استجابة واحدة (المشروع + الفريق + المراحل + الدفعات + الملخصات).

**استجابة ناجحة `200`:**
```json
{
  "success": true,
  "data": {
    "_id": "64f...",
    "title": "بناء موقع إلكتروني",
    "description": "...",
    "category": "برمجة",
    "status": "InProgress",
    "publishedAt": "2026-08-01T00:00:00.000Z",
    "startDate": "2026-08-05T00:00:00.000Z",
    "endDate": "2026-09-15T00:00:00.000Z",
    "deadline": "2026-09-30T00:00:00.000Z",
    "progress": 45,
    "durationDays": 41,
    "milestonesCount": 3,
    "teamCount": 2,
    "paymentsCount": 2,
    "client": { "_id": "...", "profile": { "firstName": "أحمد", "lastName": "محمد" } },
    "assignedTo": { "_id": "...", "profile": { "firstName": "Sara", "lastName": "Khaled" } },
    "team": [
      {
        "_id": "member_id",
        "freelancer": { "_id": "...", "profile": { "firstName": "Sara", "lastName": "Khaled", "headline": "Backend", "avatar": "a.png" } },
        "proposalId": "proposal_id",
        "role": "مطور باك إند",
        "status": "Working",
        "joinedAt": "2026-08-05T00:00:00.000Z"
      }
    ],
    "milestones": [
      {
        "_id": "milestone_id",
        "title": "مرحلة التصميم",
        "description": "تصميم الواجهات",
        "startDate": "2026-08-05T00:00:00.000Z",
        "endDate": "2026-08-20T00:00:00.000Z",
        "status": "Completed",
        "assignedTo": { "_id": "...", "profile": { ... } },
        "progress": 100
      }
    ],
    "payments": [
      {
        "_id": "payment_id",
        "title": "الدفعة الأولى",
        "amount": 5000,
        "dueDate": "2026-08-05T00:00:00.000Z",
        "status": "Paid",
        "paidDate": "2026-08-06T00:00:00.000Z",
        "method": "bank_transfer",
        "transactionRef": "TXN-123",
        "note": ""
      }
    ],
    "paymentsConfig": { "twoStage": true, "installmentsCount": 2, "totalAmount": 10000 },
    "paymentsSummary": { "total": 10000, "paid": 5000, "pending": 5000 }
  }
}
```

**أخطاء:** `404` مشروع غير موجود · `403` غير مالك · `400` معرّف غير صالح · `500`

> ملاحظة: `progress` يُحسب تلقائياً كمتوسط تقدم المراحل إن وُجدت.

---

### `PUT /api/projects/:id/manage`
ضبط بيانات الإدارة. **كل الحقول اختيارية** (تُحدَّث المذكورة فقط).

**الجسم:**
```json
{
  "startDate": "2026-08-05T00:00:00.000Z",
  "endDate": "2026-09-15T00:00:00.000Z",
  "publishedAt": "2026-08-01T00:00:00.000Z",
  "status": "InProgress",
  "progress": 40,
  "paymentsConfig": { "twoStage": true, "installmentsCount": 4, "totalAmount": 20000 }
}
```

| الحقل | النوع | ملاحظة |
|---|---|---|
| `startDate` | date | تاريخ بدء العمل |
| `endDate` | date | تاريخ الانتهاء |
| `publishedAt` | date | تاريخ النشر |
| `status` | enum | `Open`·`InProgress`·`Completed`·`Cancelled` |
| `progress` | number | محصور 0–100 تلقائياً |
| `paymentsConfig` | object | يُدمج مع الإعدادات الحالية (`twoStage`, `installmentsCount`, `totalAmount`) |

**استجابة `200`:** كائن المشروع المحدّث.

---

## 👥 2. الفريق

### `GET /api/projects/:id/team`
```json
{
  "success": true,
  "count": 2,
  "data": [
    {
      "_id": "member_id",
      "freelancer": { "_id": "...", "profile": { "firstName": "Sara", "lastName": "Khaled", "headline": "Backend", "avatar": "a.png" } },
      "proposalId": "proposal_id",
      "role": "مطور باك إند",
      "status": "Working",
      "joinedAt": "2026-08-05T00:00:00.000Z"
    }
  ]
}
```

### `POST /api/projects/:id/team`
إضافة عضو يدوياً (دون عرض).

**الجسم:**
```json
{
  "freelancerId": "user_id",
  "role": "مصمم واجهات",
  "status": "Invited"
}
```
- `freelancerId` **مطلوب** — يتحقق أن المستخدم موجود.
- `status` اختياري: `Invited` (افتراضي) · `Working` · `Completed` · `Removed`
- `400` إذا كان العضو مضافاً مسبقاً.

**استجابة `201`:** مصفوفة الفريق كاملة.

### `PUT /api/projects/:id/team/:memberId`
تحديث عضو.

**الجسم:**
```json
{ "role": "قائد فريق", "status": "Working" }
```
الحقول المسموحة: `role`, `status`. **استجابة `200`:** الفريق كاملاً.

### `DELETE /api/projects/:id/team/:memberId`
إزالة عضو.
**استجابة `200`:** `{ "success": true, "message": "تم إزالة العضو من الفريق", "data": [...] }`
**`404`** إذا لم يوجد العضو.

> عند **قبول عرض** (`POST /:id/proposals/:proposalId/accept`) يُضاف المقبول تلقائياً للفريق بحالة `Working`.

---

## 🗓️ 3. المراحل (المخطط الزمني)

### `GET /api/projects/:id/milestones`
```json
{
  "success": true,
  "count": 3,
  "data": [
    {
      "_id": "milestone_id",
      "title": "مرحلة التصميم",
      "description": "تصميم الواجهات",
      "startDate": "2026-08-05T00:00:00.000Z",
      "endDate": "2026-08-20T00:00:00.000Z",
      "status": "Completed",
      "assignedTo": "user_id",
      "progress": 100
    }
  ]
}
```

### `POST /api/projects/:id/milestones`
إضافة مرحلة.

**الجسم:**
```json
{
  "title": "مرحلة التصميم",
  "description": "تصميم الواجهات",
  "startDate": "2026-08-05T00:00:00.000Z",
  "endDate": "2026-08-20T00:00:00.000Z",
  "assignedTo": "user_id",
  "status": "InProgress",
  "progress": 40
}
```
- `title` **مطلوب** (`400` إذا غاب).
- `status`: `NotStarted` (افتراضي) · `InProgress` · `Completed`
- `progress`: 0–100 (محصور)
- **يُعيد حساب `project.progress` تلقائياً.**

### `PUT /api/projects/:id/milestones/:milestoneId`
تحديث مرحلة — نفس الحقول أعلاه (كلها اختيارية). `progress` محصور 0–100.
**`404`** إذا لم توجد المرحلة.

### `DELETE /api/projects/:id/milestones/:milestoneId`
حذف مرحلة — **يُعيد حساب `project.progress`** بعد الحذف.

---

## 💰 4. الدفعات المالية

### `GET /api/projects/:id/payments`
```json
{
  "success": true,
  "count": 2,
  "summary": { "total": 10000, "paid": 5000, "pending": 5000 },
  "data": [
    {
      "_id": "payment_id",
      "title": "الدفعة الأولى",
      "amount": 5000,
      "dueDate": "2026-08-05T00:00:00.000Z",
      "status": "Pending",
      "paidDate": null,
      "method": "bank_transfer",
      "transactionRef": "",
      "note": ""
    }
  ]
}
```

### `POST /api/projects/:id/payments`
إضافة دفعة — لتقسيم المشروع لعدد دفعات يحدده المستخدم.

**الجسم:**
```json
{
  "title": "الدفعة الأولى (عربون)",
  "amount": 5000,
  "dueDate": "2026-08-05T00:00:00.000Z",
  "method": "bank_transfer",
  "note": "تحويل بنكي"
}
```
- `amount` **مطلوب** (`400` إذا غاب).
- `method`: `bank_transfer` (افتراضي) · `cash` · `other`
- يُحدّث `paymentsConfig.totalAmount` = مجموع كل الدفعات تلقائياً.

### `PUT /api/projects/:id/payments/:paymentId`
تحديث / **تسديد** دفعة.

**الجسم (تسديد):**
```json
{
  "status": "Paid",
  "transactionRef": "TXN-123456",
  "note": "تم استلام التحويل"
}
```
| الحقل | الوصف |
|---|---|
| `status` | `Pending`·`Paid`·`Overdue` — عند `Paid` يُملأ `paidDate` تلقائياً |
| `amount` | تعديل المبلغ |
| `dueDate` | تعديل الاستحقاق |
| `method` | طريقة الدفع |
| `paidDate` | تحديد يدوي |
| `transactionRef` | رقم مرجع التحويل البنكي |
| `note` | ملاحظة |

**`404`** إذا لم توجد الدفعة.

### `DELETE /api/projects/:id/payments/:paymentId`
حذف دفعة — يُحدّث `totalAmount` تلقائياً.

---

## ملخص سريع

| الطريقة | المسار | الغرض |
|---|---|---|
| GET | `/api/projects/:id/overview` | كل شيء دفعة واحدة |
| PUT | `/api/projects/:id/manage` | ضبط تواريخ/تقدم/دفع |
| GET | `/api/projects/:id/team` | قائمة الفريق |
| POST | `/api/projects/:id/team` | إضافة عضو |
| PUT | `/api/projects/:id/team/:memberId` | تحديث عضو |
| DELETE | `/api/projects/:id/team/:memberId` | إزالة عضو |
| GET | `/api/projects/:id/milestones` | المراحل |
| POST | `/api/projects/:id/milestones` | إضافة مرحلة |
| PUT | `/api/projects/:id/milestones/:milestoneId` | تحديث مرحلة |
| DELETE | `/api/projects/:id/milestones/:milestoneId` | حذف مرحلة |
| GET | `/api/projects/:id/payments` | الدفعات + ملخص |
| POST | `/api/projects/:id/payments` | إضافة دفعة |
| PUT | `/api/projects/:id/payments/:paymentId` | تحديث/تسديد |
| DELETE | `/api/projects/:id/payments/:paymentId` | حذف دفعة |

## رموز الأخطاء المشتركة
- `400` — معرّف غير صالح / حقل مطلوب ناقص (يرجع `message` + `errors` للحقول)
- `401` — توكن مفقود/غير صالح
- `403` — لست صاحب المشروع
- `404` — المشروع/المرحلة/الدفعة/العضو غير موجود
- `500` — خطأ خادم
