# HC-P1-S1 — تقرير قرار موضع الديكور وطلب ART-1

- **الحالة:** `DOCUMENTATION_COMPLETE`
- **التاريخ:** 02-09-2026
- **المرحلة:** HC-P1
- **الخطوة:** HC-P1-S1
- **نوع العمل:** توثيق وتحليل فقط

## فحص المرجع

- قُرئ `docs/HOTEL_CITY_MASTER_REFERENCE_AR.md` كاملًا.
- قُرئ `docs/ART-0_VISUAL_DIRECTION_AR.md` كاملًا؛ حالته
  `STYLE_DIRECTION_APPROVED`.
- حُصر العمل في خطوة واحدة: قرار نموذج موضع الديكور وطلب ART-1 التقني.
- لم يُعدل `src` أو `data` أو الاختبارات أو الحزم أو workflow.
- لم تُولد صور أو sprites أو animations أو placeholders.
- بقيت مسؤولية إنتاج الأصول والأنيميشن لـCodex، ومسؤولية المواصفة والدمج
  البرمجي لـFable.

## قالب الخطة

### الهدف

توثيق عقد تقني واحد يحول الديكور لاحقًا من `slot` غير مرئي إلى موضع محلي
قابل للرسم والحفظ والهجرة، وفتح طلب أصول صغير قابل للمراجعة قبل إنتاج 77 أصلًا.

### النطاق المنفذ

1. تحليل الشبكة والرسم والحفظ والmanifest وloader.
2. تعداد كتالوج الديكور وفئاته.
3. قرار anchors والاتجاه والطبقات والحدود والتصادم.
4. خطة migration نظرية للحفظات القديمة.
5. طلب ART-1 لغرفة economy وعشر قطع فعلية.
6. تحديث حالة P1 في المرجع.

### شروط القبول

- وثيقة قرار غير ملتبسة.
- طلب ART-1 بحالة `REQUESTED` وأسماء ومسارات وأبعاد حرفية.
- لا ادعاء ظهور بصري أو نجاح gameplay.
- فحص typecheck وlint فقط؛ لا E2E ولا متصفح.

## ما فُحص

### renderer والشبكة

- `src/render/layout.ts:11-13,16-30,46-58`
- `src/render/roomView.ts:26-39,41-61,69-138`
- `src/render/scene.ts:36-41,78-102,117-128,178-202`
- `src/render/characterView.ts:108-136`
- `src/ui/HotelCanvas.tsx:21-51,83-114`

### state والحفظ

- `src/core/state/types.ts:35,39-55,140-147,279-295`
- `src/core/data-source.ts:60-64,226-233`
- `src/core/commands/index.ts:160-181,623-680`
- `src/bridge/selectors.ts:415-426,780-811`
- `src/save/index.ts:108-240,401-409,468-505,532-560`

### الأصول والبيانات

- `src/render/assets.ts:20-47,68-100,102-163`
- `public/assets/manifest.json`
- `data/decor.json`
- `data/rooms.json`

## النتائج المثبتة

1. block العالم `128×96`، والغرفة `economy` الأساسية 1×1 وأصلها
   `rooms/economy_base.png` بمقاس `128×96`.
2. `PlacedDecor` يحفظ `id`, `defId`, `slot` فقط. لا موضع محلي ولا اتجاه ولا
   طبقة ولا hitbox.
3. `SceneSnapshot` لا يحتوي decor، و`HotelCanvas.toSnapshot` لا يمرره،
   و`RoomView` لا ينشئ sprites للقطع. تحميل bundle `decor` وحده لا يجعل
   الديكور ظاهرًا.
4. طبقة `decor=50` موجودة اسميًا، لكنها ليست موصولة ولا تنقسم إلى back/front.
5. schema الحالي 17؛ لا migration لموضع الديكور. التخزين والاسترجاع يحافظان
   على قائمة القطع القديمة كما هي.
6. manifest إصدار 1 ويعلن `blockSize=128×96` و`resolutions=[1,2]` و241 entry:
   115 rooms، 77 decor، 36 characters، 6 effects، 7 ui.
7. جميع ملفات 1× المعلنة موجودة. لا يوجد مجلد `public/assets/@2x`، ولذلك
   جميع مسارات 2× الـ241 مفقودة.
8. `resolutionTier` يختار 2 عند `devicePixelRatio >= 2`، ثم `urlFor` يطلب
   `/assets/@2x/<entry.file>`. هذه نتيجة حاسمة تدعم فرضية BL-016 على الهاتف.
9. كتالوج الديكور 77 عنصرًا موزعة: wallpaper 9، flooring 8، bed 8،
   seating 7، table 7، lighting 9، wallArt 7، plant 7، rug 7، luxury 8.

## القرار الناتج

اعتمدت `docs/HC-P1-S1-PLACEMENT-DECISION.md`:

- شبكة anchors محلية للغرفة.
- 16 وحدة لكل block: `8×6px` لكل وحدة عند 1×.
- `flipX` فقط، بلا دوران حر.
- anchors حسب wall/ceiling/floor/bed.
- طبقات back/characters/front/effects/frame.
- visual bounds وhitbox وinteraction points لكل أصل.
- migration إضافية مستقبلية `17→18` تحفظ `slot` وتضيف
  `localX/localY/flipX/zBias` إلى الغرف الحية والمخزنة.

## طلب الأصول الناتج

أنشئ `docs/ASSET_REQUEST-ART-1.md` بحالة `REQUESTED` ويشمل:

- `room.economy.base`.
- عشر قطع تمثل الفئات العشر:
  `wallpaper_plain`, `flooring_concrete`, `bed_single`,
  `seating_armchair`, `table_deskWood`, `lighting_lamp`,
  `wallArt_poster`, `plant_fern`, `rug_mat`, `luxury_aquarium`.
- أبعاد ومسارات 1× و2×.
- شفافية وanchors وحدود وhitboxes.
- حالات normal/selected/placement preview.
- thumbnails للمتجر والبناء والمخزن عند 64×64 و128×128.
- توضيح أن selected/preview يعيدان استخدام texture scene، وأن thumbnails
  تحتاج entries جديدة وقت الدمج لأنها غير موجودة في manifest الحالي.

## الاختبارات

| الفحص | الحالة | الملاحظة |
|---|---|---|
| `npm run typecheck` | `PASS` | `tsc -b --noEmit`، دون أخطاء |
| `npm run lint` | `PASS_WITH_WARNINGS` | 0 أخطاء و4 تحذيرات `no-console` المعروفة في `src/main.tsx` و`src/ui/HotelCanvas.tsx` |
| E2E / متصفح | `NOT_RUN` | ممنوع في HC-P1-S1 ومشكلة بيئة المتصفح معروفة |

## الملفات المتغيرة

- `docs/HC-P1-S1-PLACEMENT-DECISION.md`
- `docs/ASSET_REQUEST-ART-1.md`
- `docs/HC-P1-S1-REPORT.md`
- `docs/HOTEL_CITY_MASTER_REFERENCE_AR.md`

لا توجد تغييرات في `src`, `data`, `tests`, `package.json`,
`playwright.config.*` أو `.github/workflows`.

## مطابقة التنفيذ مع المرجع

- **المرحلة المنفذة:** HC-P1-S1 فقط.
- **الهدف:** تحقق على مستوى التوثيق؛ قرار وطلب أصول، لا ميزة مرئية.
- **نسبة الإنجاز:** كل مخرجات S1 التوثيقية منشأة؛ ART-1 ما زال `REQUESTED`.
- **أعمال متسللة من مراحل أخرى:** لا.
- **ادعاء دليل بصري:** لا؛ لم يُشغل renderer أو متصفح ولم تُنشأ أصول.
- **العائق المتبقي:** Codex لم يسلم ART-1، وdecor غير موصول إلى snapshot أو
  renderer، و2× مفقودة.
- **الخطوة التالية المسموحة:** بعد تسليم ART-1، يدمج Fable عقد الموضع والرسم
  والحفظ ثم يقدم لقطات Desktop/Mobile فعلية.