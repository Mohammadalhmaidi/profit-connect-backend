# مخططات UML — Profit Connect Backend

هذا المجلد يحتوي على ملفات [PlantUML](https://plantuml.com) التي توثّق بنية منصة **Profit Connect** (باك-إند Node.js + Express + MongoDB).

## المخططات المتوفرة

| المخطط | الملف | ماذا يغطي |
|---|---|---|
| Use Case | `use-case/use-case.puml` | الأدوار الستة (زائر، باحث، صاحب عمل، عميل مشاريع، موظف شركة، مشرف) وكل الوظائف |
| Class Diagram | `class-diagram/class-diagram.puml` | جميع نماذج Mongoose وعلاقاتها والتعدادات |
| Sequence — Auth | `sequence/auth-sequence.puml` | التسجيل، الدخول، حماية المسارات، تجديد التوكن، الخروج |
| Sequence — Escrow | `sequence/escrow-payment-sequence.puml` | دورة المشروع الحر من العروض حتى الدفع والتحرير |
| Sequence — Withdrawal | `sequence/withdrawal-sequence.puml` | طلب السحب ومراجعته من الإدارة والإلغاء |
| Sequence — AI Moderation | `sequence/ai-moderation-sequence.puml` | فحص المحتوى وكشف النص المولّد بالذكاء الاصطناعي |
| Sequence — Social | `sequence/social-sequence.puml` | الاتصالات والمتابعة والمراسلة |
| ERD | `erd/erd.puml` | علاقات الكيانات والبطاقات والفهارس الفريدة |
| Activity — Post | `activity/post-moderation-activity.puml` | تدفق نشر منشور مع المراقبة والنقاط |
| Activity — Escrow | `activity/escrow-activity.puml` | دورة الإيداع والتحرير والاسترجاع |
| State — Project | `state/project-state.puml` | حالات المشروع |
| State — Financial | `state/financial-state.puml` | حالات الدفعة المحجوزة وطلبات السحب |
| State — User/Company | `state/user-status-state.puml` | حالات المستخدم والشركة والاتصال |
| Component | `component/component.puml` | الطبقات (routes → controllers → services → models) |
| Package | `package/package.puml` | حزم المشروع وفق بنية `src/` |
| Deployment | `deployment/deployment.puml` | النشر: الواجهة، السيرفر، MongoDB، خدمات الذكاء الاصطناعي |

## كيفية التصيير (Rendering)

الخيارات (اختر واحداً):

1. **VS Code**: ثبّت إضافة *PlantUML* ثم `Alt + D` لمعاينة المخطط.
2. **أونلاين**: ارفع الملف في https://www.plantuml.com/plantuml/uml
3. **سطر الأوامر** (يتطلب Java):
   ```bash
   java -jar plantuml.jar UML/**/*.puml -o ../rendered
   ```

## ملاحظات النمذجة

- المخططات مبنية من الكود الفعلي (الملفات في `src/models` و`src/routes` و`src/controllers` و`src/services`).
- النظام المالي يستخدم **الحساب الضامن (Escrow)**: الانتقال `held → released/refunded` حصري عبر `moneyService` لمنع التحرير المزدوج.
- سجل الحركات `MoneyTransaction` هو *دفتر الأستاذ* (Ledger) لكل تغيير في الرصيد.
- تقييم الذكاء الاصطناعي يعتمد نموذجاً محلياً (LM Studio) مع نموذج احتياطي (OpenAI)، والكشف عن المحتوى المولّد يعمل بالنموذج المحلي فقط.
