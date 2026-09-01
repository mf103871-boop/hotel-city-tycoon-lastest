# إصلاحات تقرير الفحص

**كل خطأ في تقريرك حقيقي ومُصلَح.** وواحد منها يستحق اعترافاً خاصاً.

---

## نفس العطل للمرة الثانية

```
ReferenceError: ObjectivesSchema is not defined
```

`src/data/index.ts` يستعمل `ObjectivesSchema.parse()` ولا يستورده. السبب أنني
شغّلت استبدالاً نصّياً في P5b باحثاً عن نصّ لم يطابق شيئاً — **فنجح الاستبدال
صفر مرات ولم أتحقق.**

هذا **حرفياً نفس الخطأ** الذي أنتج `pixi.ts` وأوقف تصريف طبقة العرض إصدارين
كاملين. ارتكبته مرتين بنفس الطريقة.

فبنيت له حارساً بدل أن أعد بالانتباه:

```
✓ every schema used to parse data is actually imported
```

يقرأ كل `XSchema.parse(` في الملف ويقارنه بقائمة المستوردات. أي اسم يُستعمل ولا
يُستورد يفشل البناء. ومعه ثلاثة حراس أخرى من نفس الصنف.

## أخطاء TypeScript العشرة

| الملف | الخطأ | الإصلاح |
|---|---|---|
| `src/data/index.ts` | `ObjectivesSchema` غير مستورد | أُضيف |
| `src/bridge/selectors.ts` ×2 | `nameKey` غير موجود في `DecorDef` | أُضيف للنوع — البيانات والمخطط يحملانه أصلاً |
| `src/ui/Hud.tsx` | `dispatch` غير مستعمل | حُذف؛ اللوحات تولّت الإرسال في P4a |
| `src/ui/RoomSheet.tsx` | `subtitle` قد يكون `undefined` | يُحذف الحقل بدل تمرير `undefined` |
| `tools/selftest/amenities.ts` ×5 | `capacity` و `serviceDurationSec` من الاتحاد العام | دالة `commercial()` تضيّق النوع وترمي برسالة واضحة |

## أخطاء ESLint الـ21

**18 منها في `public/sw.js`** — والملف صحيح تماماً. المشكلة أن ESLint لم يكن
يعرف أن هذا الملف يعمل في سياق عامل خدمة، فاعتبر `self` و `caches` و `fetch`
متغيرات غير معرّفة.

**لم أُضعف قاعدة.** أضفت كتلة إعداد تعلن بيئة عامل الخدمة لذلك الملف وحده.

والثلاثة الباقية: `Texture` كان يُستورد كقيمة ويُستعمل كنوع فقط، و`dispatch`
أعلاه، و**مفتاح ترجمة مكرر** `ui.settings` — أضفته في P5b وكان موجوداً منذ
P2.5. المكرر يفوز أو يخسر حسب الترتيب، والخاسر هو الصياغة التي أرادها أحدهم
فعلاً. حارس جديد يرفض التكرار.

## القيدان البيئيان — أصلحتهما أيضاً

لم يكونا خطأ في الكود، لكن كليهما منعك من التحقق، وهذا يكفي:

**`tsx` احتاج قناة IPC في `/tmp`.** حذفت الاعتمادية كلها: `validate:data:schema`
صار يعمل بـ`node --experimental-strip-types` مباشرة. اعتمادية أقل ومشكلة أقل.

**Vite ربط على `0.0.0.0` بلا شرط**، وبعض البيئات لا تستطيع تعداد واجهات الشبكة
فيفشل بخطأ غامض. صار `HOST` متغير بيئة بقيمة `0.0.0.0` افتراضياً — صحيحة
لـReplit — وإعداد Playwright يمرّر `127.0.0.1` لأنه يخاطب الخادم من داخل الجهاز
نفسه.

هذا وحده قد يجعل اختبارات المتصفح تعمل عندك.

## أما Chromium

فشل التنزيل بحجم صفر ميجابايت ومهلات متكررة — مشكلة اتصال ببيئتك لا بالمشروع.
جرّب مرة أخرى، أو:

```bash
PLAYWRIGHT_BROWSERS_PATH=0 npx playwright install --with-deps chromium
```

**اختبارات الـ32 قُرئت وتُعرّفت بنجاح** كما ذكرت — أي أن الملف والإعداد سليمان،
والباقي تنزيل.

## الفحوصات

```
core ✓29   runtime ✓24   render ✓21   regressions ✓21 (+4)
assets ✓15  panels ✓23   characters ✓19  feedback ✓25
objectives ✓16  amenities ✓14  shipping ✓18
                                          ─────
                                           225
data integrity ✓ 0 errors · 72/72 required art
balance sim    ✓ within bounds
budgets        ✓ every budget met
```

## الحراس الأربعة الجديدة

| الحارس | العطل الذي يمنعه |
|---|---|
| `every schema used to parse data is actually imported` | `ObjectivesSchema` المفقود |
| `every data file is parsed through a schema` | ملف بيانات يُضاف ولا يُقرأ |
| `no translation key is defined twice` | `ui.settings` المكرر |
| `the interface palette matches the shipped art` | انحراف اللوحة عن الفن بعد استبداله |

---

## ملاحظة على تغطية العربية

`ar.json` ينقصه 23 مفتاحاً من 225 — **وهذا مقصود لا عطل.** الإنجليزية هي
الاحتياطي المعلن في وثيقة P0، والمفاتيح الناقصة كلها أسماء قطع ديكور مولّدة
آلياً. النظام مُختبَر:

```
✓ Arabic falls back to English rather than showing a raw key
```

إن أردت 100% فأخبرني وأترجم الـ23 يدوياً.

---

## ما زال مجهولاً

**حالة المتصفح.** أخطاء TypeScript وESLint مُغلقة الآن، فـ`npm run verify` يجب
أن يمرّ. لكن الطبقة التي كسرت هذا المشروع مرتين — أسلاك الواجهة — ما زالت
غير مُتحقَّقة، والآن معها **فن جديد بالكامل ولوحة واجهة جديدة**.

```bash
npm install
npm run verify
npx playwright install chromium && npm run test:e2e
```

السيناريو الذي يهمّني: `the room art actually loads`.
