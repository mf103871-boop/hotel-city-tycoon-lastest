# ASSET_REQUEST-ART-1 — غرفة economy وحزمة ديكور أولية

- **الحالة:** `DELIVERED` — سُلّمت ودُمجت 03-09-2026؛ انظر `docs/ART-1-VERIFY-MERGE-REPORT.md` و`docs/ART-1_METADATA.md`
- **المالك الفني للأصول والأنيميشن:** Codex
- **مالك المواصفة والدمج البرمجي:** Fable
- **المرحلة:** HC-P1-S1
- **مرجع الأسلوب:** `docs/ART-0_VISUAL_DIRECTION_AR.md`
- **قرار الموضع:** `docs/HC-P1-S1-PLACEMENT-DECISION.md`
- **نوع الطلب:** تسليم أصول فقط؛ لا placeholders ولا تعديل كود أو بيانات في هذه الخطوة.

## فحص المرجع

- **الإصدار المرجعي:** `HOTEL_CITY_MASTER_REFERENCE_AR.md` الإصدار 1.2 وART-0
  بحالة `STYLE_DIRECTION_APPROVED`.
- **الهدف الواحد:** إنتاج أول حزمة قابلة للدمج لغرفة `economy` فارغة وعشر قطع
  ديكور تمثل الفئات العشر الحقيقية.
- **خط الأساس:** المحرك يستخدم block فعليًا `128×96` (`src/render/layout.ts:11-13`)
  وmanifest يعلنه في `public/assets/manifest.json:3-6`.
- **المقاس المرجعي:** لوحة ART-0 هي `1536×864`. خلية 1× الحالية تعادل
  اسميًا `1/12` عرض اللوحة و`1/9` ارتفاعها قبل camera zoom.
- **القاعدة التكوينية:** غرفة مقروءة على الهاتف؛ قطعة بطل واحدة؛ 2–5 قطع
  مساندة في المشهد النهائي؛ 25–40% فراغ؛ silhouette واضح؛ دون isometric.
- **ما لا يدخل في الطلب:** تغيير gameplay أو الاقتصاد أو placement code أو
  manifest أو loader أو اختبارات.

## قالب الخطة

### الهدف

- **النتيجة التي يراها اللاعب لاحقًا:** غرفة economy نظيفة ومتسقة مع ART-0،
  ويمكن تركيب القطع فوقها دون خلفيات مزدوجة أو clipping.
- **خط الأساس الحالي:** `room.economy.base` موجود بعقد `128×96` وموصوف بأنه
  interior فارغ يُركّب الديكور فوقه
  (`public/assets/manifest.json:1156-1163`).

### النطاق

- غرفة واحدة: `economy`.
- عشر قطع: قطعة واحدة من كل فئة في `data/decor.json`.
- ملف scene عادي 1× ونسخة 2× لكل أصل.
- thumbnail مستقل 64×64 و128×128 لكل قطعة، لكنه يحتاج entries جديدة وقت الدمج.
- لا ملفات منفصلة لحالتي selected وplacement preview؛ تطبقان برمجيًا فوق أصل scene.

### شروط القبول

- PNG RGBA بخلفية شفافة حيث يطلب الجدول؛ لا لون خلفية مطبوخ داخل sprite.
- أبعاد canvas والاسم والمسار تطابق الجدول حرفيًا.
- 2× هو ضعف 1× في العرض والارتفاع، بنفس الحدود والanchor دون إعادة framing.
- لا تفاصيل نهائية أقل من 2px عند العرض الفعلي.
- edges وsilhouettes مقروءة عند تصغير thumbnail إلى 64×64.
- لا ظلال ثقيلة أو highlights فوتوغرافية؛ soft shadow فقط.
- غرفة economy نفسها فارغة من الأثاث؛ الأثاث طبقات مستقلة.
- لا تضارب بصري مع نقاط interaction أو أبواب الغرفة.

### المخاطر وخطة الرجوع

- التسليم في مسارات `@2x` يسد فجوة حالية حقيقية؛ لا تُحذف نسخ 1× القديمة قبل
  اجتياز المقارنة البصرية.
- thumbnails ليست في manifest الحالي؛ تُسلّم كأصول منفصلة ولا تعتبر قابلة
  للتحميل حتى يضيفها Fable في خطوة دمج لاحقة.
- إذا فشل أصل في المطابقة، يُعاد الأصل وحده دون تغيير أسماء keys أو ids.

## عقد الكثافة والملفات الحالي

`src/render/assets.ts:88-100` يختار أعلى tier معلن لا يتجاوز
`devicePixelRatio`: DPR أقل من 2 يطلب 1×، وDPR يساوي 2 أو أكثر يطلب 2×.
المسار مشتق حرفيًا هكذا:

- 1×: `public/assets/<entry.file>`
- 2×: `public/assets/@2x/<entry.file>`

`src/ui/HotelCanvas.tsx:97-114` يحمّل `rooms` أولًا ثم
`effects/ui/characters/decor` بنفس tier. manifest يعلن `[1,2]`، لكن الفحص
المباشر أثبت أن جميع ملفات 1× الـ241 موجودة وأن جميع مسارات 2× الـ241 مفقودة.
لذلك الهاتف ذو DPR≥2 يطلب حاليًا `@2x` ويعود إلى placeholders. هذا الطلب لا
يعلن إصلاح loader؛ يطلب فقط أصول ART-1 بدقتيها.

## قواعد الحالات المرئية

| الحالة | العقد |
|---|---|
| `normal` | أصل scene المذكور في manifest الحالي |
| `selected` | نفس أصل scene؛ outline كريمي 2px ورفع brightness برمجيًا، بلا ملف إضافي |
| `placement-valid` | نفس الأصل عند opacity 55% + outline أخضر برمجيًا |
| `placement-invalid` | نفس الأصل عند opacity 55% + outline أحمر برمجيًا |
| `shop/build/storage thumbnail` | أصل مستقل 64×64 عند 1× و128×128 عند 2×، centered، safe area 56×56/112×112 |

لا توجد حاليًا entries لحالات selected/preview أو thumbnails في manifest.
لذلك لا تُسمى ملفات selected/preview منفصلة. مسارات thumbnail أدناه هي **عقد
إضافة مطلوب للدمج لاحقًا** وليست ادعاءً بأنها موجودة الآن:

- key مقترح: `<sceneAssetKey>.thumb`
- 1×: `public/assets/decor/thumbs/<defId>.png`
- 2×: `public/assets/@2x/decor/thumbs/<defId>.png`

## غرفة ART-1

| الحقل | المواصفة |
|---|---|
| العائلة/المعرف | `economy` / `room.economy.base` |
| الدور | Hero environment base؛ الغرفة الأساسية الأرخص والمفتوحة عند المستوى 1 |
| scene 1× | `128×96`، `public/assets/rooms/economy_base.png` |
| scene 2× | `256×192`، `public/assets/@2x/rooms/economy_base.png` |
| الشفافية | PNG RGBA؛ خارج جسم الغرفة شفاف؛ داخل الغرفة أرضية/جدار كما في ART-0 |
| anchor | top-left `(0,0)` لمستطيل block |
| visual bounds | كامل `128×96`; لا تجاوز للخلية |
| hitbox | الغرفة نفسها `128×96`; أبواب/ممرات تُسلّم كنقاط metadata لا كبكسل collision |
| الحالة المطلوبة | نهاري مضاء، فارغ من الأثاث، جاهز لتركيب decor؛ لا selected/preview/thumbnail مستقل للغرفة في ART-1 |

## قطع الديكور المطلوبة

كل صف أدناه يطابق `defId` و`assetKey` و`entry.file` الموجودة حاليًا. أبعاد
scene هي أبعاد manifest الحالية حتى لا يمدد العارض الأصل بصورة غير متوقعة.
الأبعاد عند 2× هي ضعف canvas حرفيًا.

| defId / الفئة | assetKey / الدور | scene 1× → 2× والمسار الحرفي | الشفافية والanchor | visual bounds / hitbox عند 1× |
|---|---|---|---|---|
| `wallpaper_plain` / wallpaper | `decor.wallpaper.plain` / Support surface | `96×72 → 192×144`; `decor/wallpaper_plain.png` | RGBA؛ wall-center `(0.5,0.5)` | visual `96×72`; لا movement collision؛ interaction `88×64` |
| `flooring_concrete` / flooring | `decor.flooring.concrete` / Support surface | `72×72 → 144×144`; `decor/flooring_concrete.png` | RGBA؛ floor-center `(0.5,0.5)` | visual `72×72`; لا movement collision؛ interaction `64×64` |
| `bed_single` / bed | `decor.bed.single` / **Hero furniture** | `104×64 → 208×128`; `decor/bed_single.png` | RGBA؛ bottom-center `(0.5,1)` | visual `104×64`; footprint `96×24`; نقاط `sleep`, `standLeft`, `standRight` |
| `seating_armchair` / seating | `decor.seating.armchair` / Support furniture | `72×72 → 144×144`; `decor/seating_armchair.png` | RGBA؛ bottom-center `(0.5,1)` | visual `72×72`; footprint `56×24`; نقاط `sit`, `stand` |
| `table_deskWood` / table | `decor.table.deskWood` / Support furniture | `72×72 → 144×144`; `decor/table_deskWood.png` | RGBA؛ bottom-center `(0.5,1)` | visual `72×72`; footprint `56×22`; نقاط `work`, `stand` |
| `lighting_lamp` / lighting | `decor.lighting.lamp` / Support ceiling accent | `72×48 → 144×96`; `decor/lighting_lamp.png` | RGBA؛ top-center `(0.5,0)` | visual `72×48`; لا movement collision؛ interaction `24×16` |
| `wallArt_poster` / wallArt | `decor.wallArt.poster` / Support wall accent | `96×72 → 192×144`; `decor/wallArt_poster.png` | RGBA؛ wall-center `(0.5,0.5)` | visual `96×72`; لا movement collision؛ interaction `80×56` |
| `plant_fern` / plant | `decor.plant.fern` / Support prop | `72×72 → 144×144`; `decor/plant_fern.png` | RGBA؛ bottom-center `(0.5,1)` | visual `72×72`; footprint `40×20`; نقاط `clean`, `stand` |
| `rug_mat` / rug | `decor.rug.mat` / Support floor accent | `72×72 → 144×144`; `decor/rug_mat.png` | RGBA؛ floor-center `(0.5,0.5)` | visual `72×72`; non-blocking footprint `64×16` |
| `luxury_aquarium` / luxury | `decor.luxury.aquarium` / Aspirational accent | `72×72 → 144×144`; `decor/luxury_aquarium.png` | RGBA؛ bottom-center `(0.5,1)` | visual `72×72`; footprint `64×28`; نقاط `stand`, `effectOrigin` |

المسار الكامل لنسخة 1× هو `public/assets/<entry.file>`، ولنسخة 2× هو
`public/assets/@2x/<entry.file>`. مثال: `decor/bed_single.png` يعني:

- `public/assets/decor/bed_single.png`
- `public/assets/@2x/decor/bed_single.png`

لكل قطعة thumbnail باسم `defId` نفسه:

- 1×: `public/assets/decor/thumbs/<defId>.png` عند `64×64`
- 2×: `public/assets/@2x/decor/thumbs/<defId>.png` عند `128×128`

## قائمة مصادر الاختيار

`data/decor.json` يحتوي 77 عنصرًا موزعة على الفئات الفعلية:

| الفئة | العدد |
|---|---:|
| wallpaper | 9 |
| flooring | 8 |
| bed | 8 |
| seating | 7 |
| table | 7 |
| lighting | 9 |
| wallArt | 7 |
| plant | 7 |
| rug | 7 |
| luxury | 8 |

معرّفات الطلب موثقة في:

- `data/decor.json:25-29`, `:121-125`, `:233-237`, `:329-333`
- `data/decor.json:409-413`, `:489-493`, `:569-573`, `:665-669`
- `data/decor.json:729-733`, `:873-877`

ومفاتيح manifest المقابلة في:

- `public/assets/manifest.json:85`, `:121`, `:220`, `:265`, `:346`
- `public/assets/manifest.json:409`, `:463`, `:535`, `:607`, `:688`

## ملاحظات التنفيذ لـCodex

- حافظ على المنظور الأمامي؛ لا isometric ولا خامات فوتوغرافية.
- الغرفة base فارغة؛ لا ترسم السرير أو السجادة داخل `economy_base`.
- استخدم soft bevel وinner shadow خفيفًا؛ لا glow قوي.
- سمك الحدود النهائي للأصل 3–5px على لوحة ART-0، مع الحفاظ على وضوحها عند
  downscale إلى أبعاد scene.
- bed هو البطل البصري؛ لا تجعل wallpaper/flooring/rug تنافسه.
- لا ترسم state outline داخل الأصل؛ Fable يطبقه برمجيًا.
- سلّم نقطة anchor وvisual bounds وhitbox ونقاط التفاعل كـmetadata نصية مع
  كل أصل؛ الصور وحدها لا تكفي لقبول التسليم.
- لا تنشئ animation sheets في ART-1. إن احتاج aquarium حركة، سلّم
  `effectOrigin` فقط واترك animation لطلب مستقل.

## بوابة التسليم

لا تنتقل الحالة من `REQUESTED` إلى `DELIVERED` إلا عند:

1. وجود ملفات 1× و2× لكل أصل في المسارات الحرفية أعلاه.
2. وجود thumbnails 1× و2× مع قائمة entries المقترحة للدمج.
3. مطابقة الأبعاد والشفافية والanchors والحدود.
4. مراجعة لقطة Desktop `1536×864` وهاتف، دون claiming gameplay integration.
5. تسليم metadata النصية للـbounds/hitboxes/interaction points.

## مطابقة الخطة مع المرجع

- **المرحلة:** HC-P1؛ لا عمل من P2 أو P3.
- **المشكلة:** توفير حزمة صغيرة قابلة للتحقق بدل طلب 77 أصلًا دفعة واحدة.
- **ما لم يتغير:** الكود والبيانات والاختبارات والاقتصاد وworkflow.
- **شرط الخروج:** مواصفة `REQUESTED` دقيقة، لا تسليم فني ولا دمج.
- **الدليل المطلوب لاحقًا:** لقطة فعلية داخل اللعبة بعد دمج Fable؛ صورة منفردة
  أو ملفات PNG لا تكفي لإثبات النجاح.