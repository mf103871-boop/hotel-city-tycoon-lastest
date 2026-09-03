# HC-P1-S2 — إصلاح مسار الدقة 2× (BL-016) ومزامنة السجلات

**التاريخ:** 02-09-2026
**الحالة:** `VERIFIED` (03-09-2026 بتشغيل CI #2 — انظر الملحق في آخر التقرير؛ كان `IMPLEMENTED` عند كتابته في 02-09-2026)
**المرحلة:** HC-P1
**الخطوة:** HC-P1-S2
**نوع العمل:** إصلاح تحميل الأصول + حراس فحص + تصحيح سجلات؛ لا فن ولا ميزة جديدة

## فحص المرجع

- **إصدار المرجع:** `HOTEL_CITY_MASTER_REFERENCE_AR.md` v1.2؛ `ART-0_VISUAL_DIRECTION_AR.md` v1.0 (قُرئ لأن الخطوة تمس محمّل الأصول).
- **المرحلة الحالية:** HC-P1 — نظام الديكور الكامل.
- **الخطوة الحالية:** HC-P1-S2.
- **الهدف الواحد لهذه الخطة:** أن تصل كل الأصول الـ241 إلى الهاتف (devicePixelRatio ≥ 2) كما تصل إلى سطح المكتب، وأن يستحيل تكرار العطل بحارس.
- **المشكلة المثبتة التي تعالجها:** BL-016. الدليل من الكود: `manifest.json` كان يعلن `resolutions: [1, 2]` (مكتوبة يدويًا في `tools/gen-asset-manifest.mjs:140`)؛ `resolutionTier` في `src/render/assets.ts` يختار 2 عند dpr ≥ 2؛ `urlFor` يبني `/assets/@2x/<file>`؛ لا يوجد مجلد `public/assets/@2x` (0 من 241 ملفًا)؛ `loadBundle` لا يرجع إلى 1× عند الفشل. النتيجة: على كل هاتف حديث تفشل الأصول كلها ويظهر placeholder — وهذا ما رصده تشغيل S7–S9 في اختباري `the room art actually loads` و`characters are drawn` على مشروع `phone` فقط. كما تبين أن فحص `resolution tiers resolve sensibly` في `tools/selftest/assets.ts` كان يؤكد أن شاشة 2× تأخذ طبقة 2× — أي أنه كرّس العطل بدل كشفه.
- **الاعتماديات المكتملة:** P0 `VERIFIED`؛ HC-P1-S1 موثقة (DEC-010)؛ الأصول 1× كاملة على القرص (241/241).
- **ما يدخل في النطاق:** المولّد، المحمّل، حراس الفحص الذاتي للأصول، manifest المولّد، وتصحيح السجلات البائتة (§13 في المرجع، `PROJECT-STATE.md`, سطر lockfile في `README.md`).
- **ما لا يدخل في النطاق:** أي فن أو placeholder، أي تعديل على state/save/migration، أي تعديل على الاختبارات E2E، أي عمل من P1-S3 (رسم الديكور).
- **شروط القبول:** (1) manifest لا يعلن طبقة دقة إلا إذا كانت شجرتها كاملة على القرص؛ (2) المحمّل يرجع لكل ملف إلى 1× عند غياب ملف في طبقة أعلى، ولا يحتسب «مفقودًا» إلا ما يغيب في 1×؛ (3) حارس يفشل على manifest يعد بطبقة ناقصة — مُثبت بتجربة سلبية؛ (4) لا تغيير في أي مسار 1× ولا في مفاتيح الأصول؛ (5) الدليل النهائي على `phone` من تشغيل CI.
- **الاختبارات والأدلة المطلوبة:** `validate:data:refs`، `selftest/assets` مع تجربة سلبية، سلسلة الفحص الذاتي كاملة، ثم — خارج هذه البيئة — CI: `the room art actually loads` و`characters are drawn` على `phone`.
- **التعارضات أو المعلومات الناقصة:** الأرشيف المسلَّم لا يحتوي `.github/workflows/e2e.yml` ولا `docs/baseline-screens/` رغم أن S2E/S3/S9 تسجلها؛ لم يُعد إنشاؤها هنا كي لا تُستبدل النسخة الفعلية في المستودع (BL-017). بيئة التنفيذ الحالية بلا شبكة: لا `node_modules`، فلا `typecheck` ولا `lint` ولا `vitest` ولا `validate:data:schema` (يحتاج zod) ولا متصفح.

## قالب الخطة

### الهدف

- **النتيجة التي يراها اللاعب:** على الهاتف تظهر الغرف والشخصيات والمؤثرات بفنها الفعلي بدل الأشكال المؤقتة، تمامًا كما على سطح المكتب.
- **خط الأساس الحالي ودليله:** تشغيل CI S8 — فشل اختباري الأصول على `phone` فقط (HC-P0-S9، جدول المؤجل، BL-016)؛ وقراءة الكود أعلاه تحدد السبب بلا فرضية.

### النطاق

- **الملفات المفحوصة:** `src/render/assets.ts`، `src/ui/HotelCanvas.tsx:97-125`، `tools/gen-asset-manifest.mjs`، `tools/selftest/assets.ts`، `tools/selftest/data-coverage.ts:144`، `tools/validate-data/integrity.mjs:304-320`، `tests/e2e/game.spec.ts:68-76,201-215`، `eslint.config.js:36`، `public/assets/manifest.json`.
- **الملفات المعدلة:** `tools/gen-asset-manifest.mjs`، `public/assets/manifest.json` (مولَّد)، `src/render/assets.ts`، `tools/selftest/assets.ts`، `docs/HOTEL_CITY_MASTER_REFERENCE_AR.md` (§11 صف P1، §13)، `PROJECT-STATE.md` (أُعيدت كتابته؛ القديم في `docs/history/PROJECT-STATE-2026-09-02-pre-HC-P1-S2.md`)، `README.md` (فقرتان)، هذا التقرير.
- **التبعيات:** لا شيء خارجي.
- **ما لن يتغير:** المفاتيح والمسارات 1×، `state`/`save`، الاختبارات E2E، `package.json`/`package-lock.json`، أي ملف فني.

### خطوات التنفيذ

1. **المولّد يشتق `resolutions` من القرص.**
   - الأنظمة/الملفات: `tools/gen-asset-manifest.mjs`.
   - النتيجة المتوقعة: `resolutions: [1]` الآن؛ تصبح `[1, 2]` تلقائيًا عند اكتمال `public/assets/@2x/` لكل الـ241.
   - طريقة التحقق: `node tools/gen-asset-manifest.mjs` ثم diff على manifest.
   - شرط التوقف: أي تغيير في manifest غير سطر `resolutions`.
2. **المحمّل يرجع إلى 1× لكل ملف.**
   - الأنظمة/الملفات: `src/render/assets.ts` → `loadBundle`.
   - النتيجة المتوقعة: فشل تحميل ملف في طبقة > 1 يعيد المحاولة على مسار 1× ويسجله في `fellBack`؛ فشل 1× وحده يُعد مفقودًا.
   - طريقة التحقق: قراءة الكود + حارس بنيوي؛ الدليل السلوكي في CI.
   - شرط التوقف: الحاجة لتغيير `texture()`/`hasTexture()` أو أي واجهة يستهلكها `RoomView`.
3. **حراس بدل الفحص الذي كرّس العطل.**
   - الأنظمة/الملفات: `tools/selftest/assets.ts`.
   - النتيجة المتوقعة: ثلاثة فحوص جديدة تحل محل واحد.
   - طريقة التحقق: تشغيل الوحدة، ثم تجربة سلبية بمانيفست يعلن 2× بلا ملفات.
   - شرط التوقف: أي فحص قائم يتغير معناه.
4. **مزامنة السجلات.**
   - الأنظمة/الملفات: المرجع §11/§13، `PROJECT-STATE.md`، `README.md`.
   - النتيجة المتوقعة: لا صف محذوف؛ سجل مؤرخ يشرح المزامنة؛ BL-017/BL-018 جديدان.
   - شرط التوقف: أي حاجة لتعديل الرؤية أو ترتيب المراحل.

### شروط القبول

- manifest: `resolutions` تطابق القرص حرفيًا (فحص «every declared resolution tier has every file on disk»).
- المحمّل: وجود مسار fallback إلى 1× فقط فوق 1× (فحص بنيوي) + اجتياز اختباري الأصول على `phone` في CI.
- diff على manifest = سطر واحد.
- الفحص الذاتي كاملًا أخضر بلا تغيير في معنى أي فحص قائم.

### المخاطر وخطة الرجوع

- **خطر الحفظ أو migration:** لا شيء؛ لم يُلمس state أو save.
- **خطر الأداء:** على هاتف بلا @2x كان الطلب 241 مسارًا فاشلًا ثم placeholders؛ الآن 241 طلبًا ناجحًا عند 1× مباشرة. عند تسليم 2× جزئيًا يضاف طلب واحد لكل ملف غائب فقط. لا قياس قبل/بعد لأن الأداء ليس ادعاء هذه الخطوة.
- **طريقة التراجع بلا فقد بيانات:** إعادة السطر `resolutions: [1, 2]` والدالة القديمة في `loadBundle`؛ لا بيانات لاعب متأثرة.

## مطابقة الخطة مع المرجع

- المرحلة المطابقة: HC-P1 (BL-016 مسند إلى P1 في §13).
- المشكلة المرجعية التي تعالجها: §4G «التخزين السلبي لفشل تحميل الأصل» وBL-016، وشرط بوابة P1 «تعمل الدورة كاملة على سطح المكتب والهاتف» الذي يستحيل بلا أصول على الهاتف.
- البنود التي لن تلمسها الخطة: موضع الديكور ورسمه (S3+)، ART-1، الحفظ، الاقتصاد، E2E.
- هل تسللت أعمال من مرحلة أخرى؟ لا. (تصحيح السجلات عمل P0 توثيقي صرف بلا كود.)
- هل كل الخطوات قابلة للتحقق؟ نعم.
- هل توجد افتراضات غير مثبتة؟ نعم، واحد: أن `Assets.load(url)` ثم `Assets.cache.set(key, texture)` في PixiJS v8 يجعل `Assets.get(key)` يعيد القوام بعد فشل محاولة بالاسم المستعار نفسه. مبني على قراءة سلوك `Cache`/`Resolver`؛ لا يمكن تشغيله هنا. لا يؤثر على الحالة الحالية (`resolutions: [1]` → لا fallback يُستدعى أصلًا)، ويُثبت أول مرة عند تسليم 2× جزئي.
- هل تحقق الخطة شرط خروج الخطوة؟ نعم بالنسبة للكود؛ الإغلاق النهائي لـBL-016 يتطلب دليل CI.
- القرار: صالحة للتنفيذ.

## تقرير التنفيذ

- **معرف المهمة:** HC-P1-S2.
- **ما نُفذ فعلًا:**
  - `tools/gen-asset-manifest.mjs`: `resolutions = [1, ...tiers.filter(tierComplete)]` حيث `tierComplete` تفحص وجود كل الـ241 ملفًا تحت `public/assets/@{t}x/`؛ يطبع الطبقات المعلنة.
  - `public/assets/manifest.json`: أُعيد توليده؛ diff = السطر `2` أُزيل من `resolutions`. لا تغيير في أي entry.
  - `src/render/assets.ts` → `loadBundle`: try/catch لكل entry؛ عند tier > 1 وفشل التحميل يُحمَّل مسار 1× بالـURL ثم يُسجَّل تحت المفتاح في `Assets.cache`؛ يعيد `{ loaded, missing, fellBack }` ويطبع `console.info` بعدد ما خُدم عند 1×. رسائل `warn`/`info` التي يعتمد عليها E2E لم تتغير.
  - `tools/selftest/assets.ts`: حُذف فحص `resolution tiers resolve sensibly for real devices` (كان يؤكد pick(2)=2) وحل محله: «every declared resolution tier has every file on disk»، «a phone never resolves to a tier that is not shipped»، «the loader falls back to 1x when a higher-tier file is absent» (بنيوي).
  - السجلات: المرجع §11 صف P1 → HC-P1-S2 بالدليل؛ §13 سجل مؤرخ + مزامنة حالة BL-006/007/008/009/010/011/012/013/014 مع جدول S9، BL-016 → `IMPLEMENTED`، إضافة BL-017 (ملفات غائبة عن أرشيف التسليم) وBL-018 (`PROJECT-STATE.md` بائت — `CLOSED`)؛ `PROJECT-STATE.md` أُعيد كتابته والقديم أُرشف؛ `README.md`: فقرة المقدمة تشير إلى المرجع، وسطر lockfile يقول `package-lock.json`/npm بدل pnpm.
- **ما لم يُنفذ:** لا تعديل على E2E؛ لم يُعد إنشاء `.github/workflows/e2e.yml` (BL-017)؛ لم تُنتج أي أصول 2×.
- **الملفات المعدلة:** `tools/gen-asset-manifest.mjs`، `public/assets/manifest.json`، `src/render/assets.ts`، `tools/selftest/assets.ts`، `docs/HOTEL_CITY_MASTER_REFERENCE_AR.md`، `PROJECT-STATE.md`، `README.md`، `docs/history/PROJECT-STATE-2026-09-02-pre-HC-P1-S2.md` (جديد)، `docs/HC-P1-S2-REPORT.md` (جديد).
- **الاختبارات التي شُغلت حرفيًا (Node v22.22.2، بلا `node_modules`):**

| الأمر | النتيجة |
|---|---|
| `node tools/gen-asset-manifest.mjs` | 241 entries، `resolutions [1] (no complete @2x tree on disk)` |
| `diff` manifest قبل/بعد | سطر واحد |
| `node tools/validate-data/integrity.mjs` | 0 errors, 0 warnings؛ 241/241 drawn؛ 63/63 required |
| `node --experimental-strip-types tools/selftest/assets.ts` | 22/22 (كانت 20) |
| **تجربة سلبية:** manifest يعلن `[1, 2]` بلا ملفات → `assets.ts` | ✗ «tier @2x is declared but 241 of 241 files are absent» ثم أُعيد التوليد |
| سلسلة الفحص الذاتي كاملة، 28 وحدة | **630/630** — run 29، core-helpers 25، runtime 25، loaders 9، format 8، longevity 8، hotpath 9، vitest-parity 10، render 21، regressions 23، assets 22، panels 23، characters 19، feedback 25، objectives 27، amenities 14، staff 12، upgrades 17، liveops 25، neighbours 16، perf 15، accessibility 13، resilience 31، timeline 133، invariants 12، data-coverage 18، shipping 27، incidents 14 |
| `npm run typecheck` / `lint` / `test:logic` / `validate:data:schema` | `NOT_RUN` — لا `node_modules` في هذه البيئة |
| `npm run test:e2e` | `NOT_RUN` — يُشغَّل في CI |

- **التحقق البصري واللقطات:** لا شيء؛ لا متصفح هنا ولا ادعاء ظهور.
- **أثر التغيير على الحفظ:** لا شيء.
- **أثر التغيير على الأداء:** انظر المخاطر؛ بلا قياس.
- **الانحرافات عن الخطة وأسبابها:** في fallback استُخدم `Assets.load(url)` + `Assets.cache.set(key)` بدل `Assets.load({ alias: key, src })` مجددًا، لتجنب مسار «الاسم المستعار موجود» في resolver الخاص بـPixi.
- **مشكلات جديدة أضيفت للمؤجل:** BL-017، BL-018 (مغلق في الخطوة نفسها).
- **حقيقة جديدة يجب إضافتها للمرجع:** أُضيفت في §11 و§13: طبقات الدقة تُشتق من القرص ولا تُكتب يدويًا.
- **الحالة:** `IMPLEMENTED` عند كتابة التقرير؛ `VERIFIED` منذ 03-09-2026 (الملحق أدناه).
- **الخطوة التالية الوحيدة، من دون تنفيذها:** تشغيل CI (workflow `e2e`) وقراءة نتيجة `the room art actually loads` و`characters are drawn` على مشروع `phone`؛ عند نجاحهما يُغلق BL-016 وتصبح S2 `VERIFIED`. بعدها تبقى P1 بانتظار تسليم ART-1.

## مطابقة التنفيذ مع المرجع

- هل تحقق الهدف الأصلي؟ على مستوى الكود والحراس نعم؛ على مستوى الهاتف الفعلي ينتظر CI.
- هل اجتازت جميع شروط القبول؟ (1)(2)(3)(4) نعم بالدليل أعلاه؛ (5) لا بعد.
- هل تغير شيء غير مصرح به؟ لا. لم يُلمس `src` خارج `assets.ts`، ولا `data`، ولا `tests`، ولا الحزم.
- هل بقي افتراض غير مثبت؟ نعم، سلوك cache/resolver في Pixi عند fallback (غير فعال حاليًا لأن الطبقة المعلنة الوحيدة 1×).
- هل يمكن الانتقال للخطوة التالية؟ لا قبل `VERIFIED` من CI.

## نهاية الجلسة

1. **المرحلة والخطوة الحالية:** HC-P1 — HC-P1-S2.
2. **ما أصبح `VERIFIED` بالدليل:** لا شيء جديد؛ P0 يبقى `VERIFIED`.
3. **ما بقي `IMPLEMENTED` فقط:** HC-P1-S2 (BL-016).
4. **العائق أو القرار الذي ينتظر المالك:** تشغيل CI على هذه النسخة وإرسال نتيجة مشروع `phone`؛ والتأكد من وجود `.github/workflows/e2e.yml` في المستودع (BL-017).
5. **الخطوة التالية الوحيدة:** تحقق CI لـS2؛ لا يبدأ S3 (رسم الديكور) قبل ART-1 وقبل `VERIFIED`.

## ملحق 03-09-2026 — التحقق من CI

تشغيل workflow `e2e` #2 على `main` (`232663d`، أرشيفه في `docs/ci/2026-09-03-run2/`): 82 اختبارًا، 62 ناجحًا، 4 فاشلة، 16 متخطاة في 2.7 دقيقة، و**`the room art actually loads` و`characters are drawn` نجحا على مشروع `phone`** — وهو شرط القبول (5) وشرط إغلاق BL-016. الفشل الأربعة لا علاقة لها بهذه الخطوة (D19 وD13-e من تدقيق 03-09-2026، مصلحان على فرع التدقيق). قيد مسجل: التوكيد الأول في `characters are drawn` كان ميتًا عند ذلك الـcommit (D13-a، أُصلح في الخطوة 9 من التدقيق). بهذا تصبح الحالة `VERIFIED` وBL-016 `CLOSED`؛ الافتراض غير المثبت عن fallback الـresolver يبقى كما هو (غير فعال ما دامت الطبقة المعلنة الوحيدة 1×).
