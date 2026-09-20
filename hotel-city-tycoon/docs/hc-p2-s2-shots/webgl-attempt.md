# HC-P2-S2 — محاولة التقاط على المسار الافتراضي (SwiftShader WebGL) — ملاحظة بيئة (BL-020)

**التاريخ:** 20-09-2026
**الخطوة:** HC-P2-S2 — النهار/الليل المتصل والإضاءة الداخلية (DEC-018) وتصحيح مسار CI (DEC-019)
**الصفة:** ملاحظة بيئة فقط. لا شيء هنا دليلٌ يُعرض على المالك؛ الدليل البصري لهذه الخطوة هو لقطات مسار Canvas2D
(`--disable-3d-apis`) في هذا المجلد، والحكم النهائي يبقى لجهاز حقيقي (DEC-005/DEC-009).

## ما جُرّب

محاولة واحدة، بسقف 25 ثانية، على Chromium (`/opt/pw-browsers/chromium`) **بلا** `--disable-3d-apis`، عرض 412×915
بكثافة 2×، على خادم Vite تطويري ببناء الاختبار (`VITE_E2E=1`)، الرابط
`/?stress=12&warm=600&debug=1&epoch=1789941600000` (الساعة المحلية 22:00 بتوقيت UTC، الفندق مفتوح).

السكربت: `scratchpad/build/s2-webgl-attempt.mjs` (خارج المستودع)؛ السجل الكامل `webgl-attempt.log` واللقطة
`webgl-attempt.png` في المجلد نفسه، ولم تُنسخ إلى `docs/` عمدًا لأنها ليست دليلًا.

## ما حدث

| الزمن | الحدث |
|---|---|
| 0.9ث | `[hotel-city-tycoon] stress mode: 12 rooms, 600s warm-up` |
| 1.1ث | `Failed to create WebGPU Context Provider` (مرتين) — لا WebGPU في هذه البيئة |
| 1.2ث | `[hotel-city-tycoon] renderer: webgl, resolution 2x` — المحرك أقلع على WebGL |
| 1.7ث | `PixiJS Error: Could not retrieve shader source (WebGL context may be lost).` ×4 و`PixiJS Error: Could not initialize shader.` ×2 |
| 1.8ث | `window.hct.characters().length > 0` (الأشخاص موجودون في المشهد) |
| 4.8ث | `WEBGL_debug_renderer_info`: `ANGLE (Google, Vulkan 1.3.0 (SwiftShader Device (Subzero) (0x0000C0DE)), SwiftShader driver)` |
| 4.8ث | الشارة: `renderer webgl`، `fps 60 · p5 60`، `rooms 9/12 drawn`، `people 0/17 drawn` |
| 4.8ث | قراءة داخلية لقماشة اللعبة (`drawImage` ثم `getImageData` على النصف الأوسط): `opaqueFrac 0`، لون واحد — **شفافة بالكامل** |
| 5.0ث | لقطة Playwright: لا عالم مرسوم؛ خلف نافذة «Daily gift» رمادي مسطح حيث يجب أن تكون السماء والفندق |
| 5.1ث | انتهت المحاولة قبل السقف (لم يُرصد التجمد المعروف عند ~33ث لأن السقف 25ث لم يُبلَغ) |

## القراءة

- المسار الافتراضي على خادم بلا معالج رسوم **يقلع** (سطر الإقلاع يقول `webgl`) لكن Pixi لا يستطيع تهيئة الظلال على SwiftShader
  في هذه البيئة، فالقماشة تبقى شفافة ولقطتها فارغة. الشارة تقول 60fps لأن حلقة rAF تدور فوق قماشة لا تُرسم — رقم بلا معنى.
- هذا يطابق BL-020 وDEC-019 حرفيًا: لقطة SwiftShader بيضاء/فارغة «سواء مُرّر `preserveDrawingBuffer` أم لا»، وليست عيبًا في العارض.
- **لا يُستنتج منه شيء عن الإضاءة (DEC-018):** لا عن تدرج السماء ولا عن بِرك الضوء ولا عن الأداء. الدليل البصري هو
  `phone-noon.png` و`phone-dusk.png` و`phone-night-open.png` و`phone-night-open-lobby.png` و`phone-night-closed.png` و`desktop-night-open.png` و`dusk.webm` على مسار Canvas2D (أُعيد التقاطها كلها 20-09-2026 بعد إصلاح BL-041؛ التقرير §6.1).
- ملاحظة تشغيلية: المحاولتان الأوليان على خادم 5199 (الذي بدأته مرحلة سابقة) فشلتا قبل بلوغ WebGL أصلًا بـ
  `Failed to fetch dynamically imported module .../WebGLRenderer-KSO37NEM.js` (504 «Outdated Optimize Dep»: أعاد Vite تحسين
  الاعتماديات بعد إقلاع ذلك الخادم، ومسار Canvas2D لا يستورد هذه القطعة فلم يتأثر). المحاولة الموثقة أعلاه جرت على خادم
  ثانٍ نظيف (المنفذ 5200، أُوقف بعدها).

## الخلاصة

تبقى عبارة BL-020 كما هي: المسار الافتراضي (SwiftShader WebGL) لا يُنتج لقطة قابلة للحكم في هذه البيئة، ومسار DEC-009
(`--disable-3d-apis` → `CanvasRenderer`) هو مسار الأدلة. ما ينتظر جهازًا حقيقيًا مذكور في `docs/MOBILE-DEVELOPMENT.md`.
