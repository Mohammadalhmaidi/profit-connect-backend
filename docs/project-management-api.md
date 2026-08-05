# إدارة المشاريع البرمجية (Project Management API)

توثيق شامل لنظام إدارة المشاريع بعد النشر — التواريخ، التقدم، الفريق، المخطط الزمني (المراحل)، والدفعات المالية.

- **Base URL:** `/api/projects`
- **الحماية:** جميع المسارات `Private` (Bearer token)
- **الصلاحية:** مسارات الإدارة (`overview`، `manage`، `team`، `milestones`، `payments`) متاحة **لصاحب المشروع فقط** (`403` لغير المالك)

---

## 1. نظرة شاملة لإدارة المشروع

### `GET /api/projects/:id/overview`
يرجع **كل شيء** في استجابة واحدة:

```json
{
  "success": true,
  "data": {
    "_id": "...", "title": "...", "description": "...", "category": "...",
    "status": "InProgress",
    "publishedAt": "2026-08-01T00:00:00.000Z",
    "startDate": "2026-08-05T00:00:00.000Z",
    "endDate": "2026-09-15T00:00:00.000Z",
    "deadline": "2026-09-30T00:00:00.000Z",
    "createdAt": "...",
    "updatedAt": "...",
    "progress": 45,
    "durationDays": 41,
    "milestonesCount": 3,
    "teamCount": 2,
    "paymentsCount": 2,
    "client": { "_id": "...", "profile": { "firstName": "أحمد", "lastName": "محمد" } },
    "assignedTo": { "_id": "...", "profile": { ... } },
    "team": [
      {
        "_id": "member_id",
        "freelancer": { "_id": "...", "profile": { "firstName": "Sara", "lastName": "Khaled", "headline": "Backend" } },
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
        "transactionRef": "TXN-123456",
        "note": ""
      }
    ],
    "paymentsConfig": { "twoStage": true, "installmentsCount": 2, "totalAmount": 10000 },
    "paymentsSummary": { "total": 10000, "paid": 5000, "pending": 5000 }
  }
}
```

### ملاحظات الحقول
- `progress`: **يُحسب تلقائياً** كمتوسط تقدم المراحل إن وُجدت (وإلا يستخدم القيمة اليدوية).
- `durationDays`: عدد الأيام بين `startDate` و `endDate`.
- `team/milestones/payments`: subdocuments مدمجة في `Project`.

---

## 2. تحديث بيانات إدارة المشروع

### `PUT /api/projects/:id/manage`
**الجسم (كل الحقول اختيارية):**
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
- `progress` محصورة بين `0-100` تلقائياً.
- `paymentsConfig` يدمج مع الإعدادات الحالية.

---

## 3. إدارة الفريق

### `GET /api/projects/:id/team`
قائمة أعضاء الفريق مع بياناتهم.

### `POST /api/projects/:id/team`
إضافة عضو يدوياً:
```json
{
  "freelancerId": "user_id",
  "role": "مصمم واجهات",
  "status": "Invited"
}
```
يمنع إضافة عضو مكرر.

### `PUT /api/projects/:id/team/:memberId`
تحديث العضو:
```json
{ "role": "قائد فريق", "status": "Working" }
```
`status` من: `Invited` · `Working` · `Completed` · `Removed`

### `DELETE /api/projects/:id/team/:memberId`
إزالة عضو من الفريق.

> **قبول عرض** (`POST /:id/proposals/:proposalId/accept`) يضيف المقبول تلقائياً إلى `team` بحالة `Working` — ويمكن **قبول أكثر من عرض** لأشخاص متعددين وإدارة الجميع هنا.

---

## 4. المخطط الزمني (المراحل)

### `GET /api/projects/:id/milestones`
قائمة المراحل.

### `POST /api/projects/:id/milestones`
إضافة مرحلة:
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
`status` من: `NotStarted` · `InProgress` · `Completed`

### `PUT /api/projects/:id/milestones/:milestoneId`
تحديث المرحلة (نفس الحقول + `progress` محصور 0-100).
> عند أي إضافة/تحديث/حذف مرحلة، يُعاد حساب `project.progress` تلقائياً.

### `DELETE /api/projects/:id/milestones/:milestoneId`
حذف مرحلة.

---

## 5. الدفعات المالية

### `GET /api/projects/:id/payments`
```json
{
  "success": true,
  "count": 2,
  "summary": { "total": 10000, "paid": 5000, "pending": 5000 },
  "data": [ { "payment object..." } ]
}
```

### `POST /api/projects/:id/payments`
إضافة دفعة (تقسيم المشروع لدفعات يحدد عددها المستخدم):
```json
{
  "title": "الدفعة الأولى (عربون)",
  "amount": 5000,
  "dueDate": "2026-08-05T00:00:00.000Z",
  "method": "bank_transfer",
  "note": "تحويل بنكي للعربون"
}
```
- `method`: `bank_transfer` (افتراضي) · `cash` · `other`
- `amount` مطلوب.
- يُحدّث `paymentsConfig.totalAmount` تلقائياً كمجموع الدفعات.

### `PUT /api/projects/:id/payments/:paymentId`
تحديث الدفعة — أهم حالة **تسديد**:
```json
{
  "status": "Paid",
  "transactionRef": "TXN-123456"
}
```
عند `status: "Paid"` يُملأ `paidDate` تلقائياً إن كان فارغاً.

### `DELETE /api/projects/:id/payments/:paymentId`
حذف دفعة.

---

## 6. نموذج دفعة/مرحلة/عضو كامل
```json
// milestone
{
  "_id": "string", "title": "string (required)", "description": "string",
  "startDate": "date | null", "endDate": "date | null",
  "status": "NotStarted | InProgress | Completed",
  "assignedTo": "ObjectId | null", "progress": "0-100"
}
// payment
{
  "_id": "string", "title": "string", "amount": "number (required)",
  "dueDate": "date | null", "status": "Pending | Paid | Overdue",
  "paidDate": "date | null", "method": "bank_transfer | cash | other",
  "transactionRef": "string", "note": "string"
}
// team member
{
  "_id": "string", "freelancer": "ObjectId (populated)",
  "proposalId": "ObjectId | null", "role": "string",
  "status": "Invited | Working | Completed | Removed",
  "joinedAt": "date"
}
```

---

## 7. ملخص المسارات الجديدة

| الطريقة | المسار | الوظيفة |
|---|---|---|
| GET | `/api/projects/:id/overview` | نظرة شاملة (كل البيانات) |
| PUT | `/api/projects/:id/manage` | ضبط التواريخ/التقدم/الدفع |
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
| PUT | `/api/projects/:id/payments/:paymentId` | تحديث/تسديد دفعة |
| DELETE | `/api/projects/:id/payments/:paymentId` | حذف دفعة |

---

## 8. التغييرات على السلوك الحالي
- **قبول عرض** لم يعد يرفض باقي العروض تلقائياً — بل يُقبل كل عرض على حدة ويُضاف صاحبه للفريق (يمكن إدارة عدة أشخاص).
- **إكمال مشروع** (`PATCH /:id/complete`) يضبط `progress: 100`، `endDate`، ويرفع حالة أعضاء الفريق العاملين إلى `Completed`.
- الأخطاء (ValidationError/CastError) تعود للواجهة بحالة `400` مع رسائل الحقول.
