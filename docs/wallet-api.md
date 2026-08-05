# نظام المحافظ المالية والحساب الضامن (Escrow) وAPI

نظام حماية مالية متكامل: يدفع العميل للمنصة (حساب ضامن)، وعند إتمام المشروع يُحرَّر المبلغ إلى محفظة المستلم بعد خصم عمولة المنصة.

## نموذج العمل

```
العميل يدفع → الدفعة Held في الحساب الضامن (Escrow)
                    ↓ عند الإتمام + اعتماد (العميل أو الأدمن)
        التحرير → يصل صافي المبلغ لمحفظة المستلم (بعد خصم عمولة المنصة)
                    ↓ طلب سحب من المستلم
   موافقة الأدمن → تحويل بنكي فعلي (خارج النظام) → تحديث الحالة
```

- **محفظة كل مستخدم**: `balance` (متاح للسحب) + `holding` (محجوز لطلب سحب قيد المراجعة) + `totalEarned` + `totalWithdrawn`.
- **سجل الحركات (Ledger)** `MoneyTransaction`: كل تغيير في الرصيد مسجَّل بنوعه ومرجعه.
- **الأمان**: كل عملية تحويل مالي مقترنة بـ *transition* حصري للحالة (`held → released` / `held → refunded` / `pending → processed`) عبر `findOneAndUpdate`، ما يمنع التحرير أو الخصم المزدوج.

---

## المسارات

### 1) المحفظة — `/api/wallet` (محمية)

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/api/wallet` | عرض المحفظة (الرصيد + المحجوز) + آخر 30 حركة |
| POST | `/api/wallet/withdraw` | طلب سحب رصيد |
| GET | `/api/wallet/withdrawals` | طلبات السحب الخاصة بي |
| POST | `/api/wallet/withdrawals/:id/cancel` | إلغاء طلب سحب معلّق (يعيد المبلغ) |

**طلب سحب:**
```json
{
  "amount": 500,
  "method": "bank_transfer",
  "accountDetails": { "bankName": "الراجحي", "iban": "SA000000...", "holderName": "..." }
}
```

### 2) الدفعات (الحساب الضامن) — `/api/payments` (محمية)

| الطريقة | المسار | الوصف |
|---|---|---|
| POST | `/api/payments` | إيداع دفعة في الحساب الضامن (صاحب المشروع فقط) |
| GET | `/api/payments` | الدفعات المتعلقة بي (مدفوعة/مستلمة) |
| PUT | `/api/payments/:id/release` | تحرير الدفعة لمحفظة المستلم (العميل أو الأدمن) |

**إيداع دفعة:**
```json
{
  "projectId": "...",
  "payeeId": "...",
  "amount": 5000,
  "note": "الدفعة الأولى"
}
```
- التحقق: صاحب المشروع فقط يدفع، والمستلم يجب أن يكون عضواً في فريق المشروع.
- التحرير يخصم عمولة المنصة (افتراضياً 10%) ويرسل صافي المبلغ لمحفظة المستلم.

### 3) إدارة الأدمن المالية — `/api/admin/finance/*` (محمية + أدمن فقط)

| الطريقة | المسار | الوصف |
|---|---|---|
| GET | `/api/admin/finance/overview` | نظرة مالية: المحجوز، العمولات، السحوبات المعلقة، الاسترجاعات |
| GET | `/api/admin/finance/withdrawals?status=pending` | قائمة طلبات السحب (فلترة بالحالة) |
| PUT | `/api/admin/finance/withdrawals/:id` | موافقة/رفض طلب سحب |
| GET | `/api/admin/finance/payments?status=held` | قائمة الدفعات (فلترة بالحالة) |
| POST | `/api/admin/finance/payments/:id/release` | تحرير يدوي |
| POST | `/api/admin/finance/payments/:id/refund` | استرجاع الدفعة لمحفظة الدافع (نزاع/إلغاء) |
| PUT | `/api/admin/finance/settings` | ضبط نسبة عمولة المنصة |

**معالجة طلب سحب:**
```json
{ "action": "approve", "note": "تم التحويل" }
```
`approve` → الحالة `processed` (المبلغ يخرج من المحجوز).  
`reject` → الحالة `rejected` (المبلغ يُعاد للرصيد المتاح).

**ضبط العمولة:**
```json
{ "platformFeePercent": 12 }
```

---

## حالات الدفعة (`PlatformPayment.status`)
`held` (محجوزة) → `released` (محررة للمستلم) | `refunded` (مسترجعة للدافع) | `cancelled`

## حالات طلب السحب (`Withdrawal.status`)
`pending` → `processed` | `rejected` | `cancelled`

## أنواع حركات السجل (`MoneyTransaction.type`)
`deposit` · `release` · `fee` · `refund` · `withdraw` · `withdraw_refund` · `withdraw_processed` · `manual`

## إشعارات المستخدم
`payment_deposited` · `payment_released` · `payment_refunded` · `withdrawal_approved` · `withdrawal_rejected`

---

## ملاحظات مهمة
- محفظة قاعدة البيانات هي **دفتر حسابات (Ledger)** وليست خزنة أموال حقيقية — الأموال الفعلية في حساب بنكي/بوابة دفع (يُربط لاحقاً).
- لتطبيق حقيقي: يُنصح بتحويل حركات الأموال إلى `mongoose.transaction` (يتطلب MongoDB Replica Set) لضمان الذرية الكاملة.
- قانونياً: تقديم مدفوعات للغير قد يتطلب رخصة/شركة دفع — استشر مختصاً.
