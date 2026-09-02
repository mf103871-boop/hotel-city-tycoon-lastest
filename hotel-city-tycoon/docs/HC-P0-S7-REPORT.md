# HC-P0-S7 — مسار CI حتمي بلا WebGL ومسبار GPU

**التاريخ:** 02-09-2026
**الحالة:** `IMPLEMENTED` — الاعتماد ينتظر تشغيل S7 في CI
**المرحلة:** HC-P0
**الخطوة:** HC-P0-S7

## نتيجة تشغيل S6

| المنفذ | الناجح | الفاشل | المتخطى | المدة | اللقطات الناجحة |
|---:|---:|---:|---:|---:|---:|
| 82 | 29 | 50 | 3 | 37.9 دقيقة | 2 من 5 |

مع Chrome الكامل، بقيت شارة التصحيح تعرض `renderer starting` و`fps 0`، وتكررت
أخطاء PixiJS shader. كما ثبت التجمد المتقطع للصفحة من فشل سكربت اللقطات في إيجاد
أزرار الشريط السفلي داخل browser contexts جديدة.

## قرار فصل المسارين

فُصلت المسؤوليتان بدل جعل فشل WebGL يمنع قياس بقية اللعبة:

1. **مسار E2E الرئيسي:** مسار CI حتمي بلا WebGL باستخدام
   `PLAYWRIGHT_EXTRA_ARGS: --disable-3d-apis`، مع Chrome الكامل وتعطيل trace وscreenshot
   وvideo. هذا المسار يقيس طبقة القوائم والمنطق دون الاعتماد على إقلاع محرك الرسم.
2. **مسار GPU مستقل:** وظيفة `gpu-probe` بمصفوفة لاختبار المحرك وحده بتركيبتين:
   `swiftshader` و`angle`. الفشل لا يمنع الوظيفة من رفع السجل لأن خطوة المسبار
   `continue-on-error: true`.

## قراءة كود إقلاع المحرك

### التسلسل بين WebGPU وWebGL

- في `hotel-city-tycoon/src/render/app.ts:34-35` تُنشأ `Application` جديدة.
- في `hotel-city-tycoon/src/render/app.ts:38-47` تُبنى خيارات مشتركة تشمل canvas
  والحجم والدقة والخلفية و`powerPreference`.
- في `hotel-city-tycoon/src/render/app.ts:49-50` يحاول الكود إقلاع Pixi مع
  `preference: 'webgpu'`.
- إذا رمى هذا الإقلاع استثناءً، ينتقل `catch` في
  `hotel-city-tycoon/src/render/app.ts:51-53` مرة واحدة إلى
  `preference: 'webgl'`.
- بعد ذلك، في `hotel-city-tycoon/src/render/app.ts:55` يُكتشف backend الفعلي عبر
  `detectBackend`. الدالة في الأسطر 99-116 تفحص enum ثم كائن GPU/GL ثم الاسم.

### الاستثناء، غياب النتيجة، والتعافي

- إذا رمى WebGPU استثناءً، فهناك fallback واحد إلى WebGL في
  `app.ts:51-53`.
- إذا رمى WebGL استثناءً أيضًا، لا توجد `catch` أخرى داخل
  `createRenderer`؛ يظل Promise مرفوضًا ويخرج الفشل إلى المستدعي.
- لا توجد مهلة حول أي من استدعائي `app.init` في `app.ts:49-53`. لذلك، إذا لم يُرجع
  الإقلاع نتيجة أبدًا، يمكن أن يبقى Promise معلقًا.
- لا يوجد fallback إلى Canvas 2D في `app.ts` أو في مسار الإقلاع المستدعي.
- لا توجد حلقة retry أو تكرار لمحاولات الإقلاع؛ يوجد تسلسل WebGPU ثم WebGL مرة واحدة
  فقط.
- في `hotel-city-tycoon/src/ui/HotelCanvas.tsx:83-90` يُستدعى
  `createRenderer` داخل async effect، ولا يوجد `try/catch` محلي حوله. لذلك فإن
  استثناءات الإقلاع لا تتحول إلى مسار تعافٍ أو رسالة بديلة في الواجهة.
- في `hotel-city-tycoon/src/ui/DebugBadge.tsx:65-68` تعرض الواجهة كلمة `renderer`
  ثم `starting…` عندما تكون قيمة backend غير موجودة؛ وهذا هو مصدر ظهور شارة
  `renderer starting` أثناء تعليق الإقلاع. الإحصاءات لا تُحدّث إلا بعد نجاح الإقلاع
  وإنشاء المشهد في `HotelCanvas.tsx:155-165`.

## تعديلات S7

- أصبح مسار E2E الرئيسي بمهلة 60 دقيقة وبأعلام `--disable-3d-apis`.
- أضيفت وظيفة `gpu-probe` بمهلة 15 دقيقة ومصفوفة SwiftShader وANGLE، مع سجل مستقل
  وartifact مستقل لكل تركيب.
- بقيت ملفات اللعبة، البيانات، إعدادات Playwright، وتوكيدات الاختبارات دون تعديل.

## التحقق

| الأمر | رمز الخروج | النتيجة |
|---|---:|---|
| `npm run typecheck` | 0 | ناجح |
| `npm run lint` | 0 | ناجح مع 4 تحذيرات `console` معروفة |

لم يُشغّل E2E أو أي متصفح محليًا. لا تنتقل P0 إلى `VERIFIED` قبل تشغيل مسار S7
ومسباري GPU ومراجعة `e2e-results` واللقطات.