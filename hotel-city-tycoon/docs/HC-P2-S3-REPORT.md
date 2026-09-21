# HC-P2-S3 — الهيكل الحي: شخصيات تُوضَع كل إطار بمعدل الشاشة

**التاريخ:** 21-09-2026 (قرار المالك «هيكل حي» 20-09-2026)
**الحالة:** `IMPLEMENTED` (لا `VERIFIED`: لا قماشة على جهاز بمعالج رسوم رُوجعت — قيد DEC-005/DEC-009؛
ما يمكن إثباته على مسار canvas أُثبت، §6.3)
**الفرع:** `claude/wonderful-dirac-i1mqlk` (خط الأساس `2b0113b` — HC-P2-S2 مشحونة وخضراء)
**المرجع الحاكم:** `docs/HOTEL_CITY_MASTER_REFERENCE_AR.md` v1.3
**الاتجاه البصري:** `docs/ART-0_VISUAL_DIRECTION_AR.md` §5 (النِّسَب)، §11 (لغة الأنيميشن — ملاحظة مؤرخة للشخصيات)، §17 (عقد الدمج)؛ `docs/HC-VIS-001-SPEC.md` (:20-:23، :65، :66)
**وثيقة القرار:** `docs/HC-P2-S3-RIG-DECISION.md` (DEC-020، الصف #21؛ الملحق §9 لما غيّرته المراجعة)

> كل رقم في هذا التقرير من تشغيل فعلي مسجَّل بتاريخه (السجلات في `scratchpad/build/` خارج المستودع، أسماؤها
> مذكورة عند كل رقم)، لا من الذاكرة ولا من الخطة. أرقام الصندوق تُسمّى أرقام صندوق، وكل لقطة تُسمّي **طبقتها**
> (`full`/`lite`). السجلات المسمّاة: `s3-verify.log`/`s3-build.log`/`s3-e2e.log` (الشحنة الأولى `af55e44`) و`s3r-verify.log`/`s3r-build.log`/`s3r-e2e.log`
> (شجرة العمل بعد المراجعة، 21-09-2026) و`s3f-verify.log`/`s3f-build.log`/`s3f-e2e.log` (التشغيل المؤكِّد عند إقفال هذا التقرير على
> الشجرة نفسها، 21-09-2026)، و`build/s3ev-*.log` للالتقاط؛ ما لم يُقَس يقول التقرير إنه لم يُقَس.

---

## 1. فحص المرجع (قبل أي تعديل)

| ما ينص عليه المرجع | أين | ما فعلته هذه الخطوة |
|---|---|---|
| P2 هدفها ربط كل حالة لعب مهمة بما يراه اللاعب؛ §4.D «الفندق لا يبدو حيًا بما يكفي» | §6 HC-P2 سطر 360-377؛ §4.D سطر 153 | الشخصية هيكل حي يُوضَع كل إطار: خطوة بالمسافة، رأس يتأخر، انضغاط عند التماس، تنفس على شبكة إطارات المقطع |
| ART-0 §11: «8–12 FPS»، «لا يتغير طول الشخصية» (:277)، «لا قفز مستمر» (:280) | ART-0 سطر 260، 273-283 | **تُعدَّل للشخصيات بملاحظة مؤرخة تُلحق** (DEC-020، وثيقة القرار §5)؛ جدول الحالات يبقى مصدر المدد؛ لا سطر حُذف |
| ART-0 §5: رأس 55–65%، طول 58–72% من الداخل | ART-0 سطر 127-128 | تاريخي حيث يتجاوز HC-VIS-001 (ART-0:10)؛ رأس 54% (:22 ✓)، طول 51% من الداخل مسجَّل لـ:23 (BL-043) |
| HC-VIS-001 :22 نسبة الرأس 50–60% | :22 | ✓ «head 54% bare» للتسعة، ومع الغطاء 54.0–59.5% (`s3-verify.log` سطر 619-636)؛ من البكسل ≈ 53% (§6.1: 107/203 و116/219 بكسل جهاز، الحبر أعلى وأسفل الشكل يأكل النقطة) |
| HC-VIS-001 :23 تجربة المقياس «لا يتغير الكود قبل قياس السرير والأبواب ومسار السير معًا» | :23 | **مؤجل — BL-043**: `CHARACTER_ART_SCALE` بقي 0.82؛ لقطات تكبير الغرفة (§6.1) هي القياس؛ الأرقام في وثيقة القرار §4 وسؤال المالك في §9 |
| HC-VIS-001 :65 تثبيت القدم والتوقيت بالمسافة | :65 | **مُحقَّق جزئيًا — انحراف مُعلَن**: الإيقاع بالمسافة ✓، الارتكاز 0px ✓، التثبيت ✗ (انزلاق ≈57px/خطوة عند 128) — فيديو المشية بالمرشحين (§6.1) |
| HC-VIS-001 :66 هوية الوجه والثياب وحجم الرأس | :66 | ✓ قطر الرأس ثابت كل إطار (الرأس يركب الجذع المضغوط) |
| DEC-012: ملف الحركة المصدر الوحيد؛ الورقة مصدر الإطارات | §12 | الشق الأول نافذ (`clipOf`/`progress()`/مدة الرمش من الملف)؛ شق الورقة يُعدَّل بـDEC-020 |
| الصف #19: «الإطارات المرسومة 2–11fps» | `docs/DECISIONS.md` | أُعيد توقيعه صفًا #21؛ «ملف حركة خاص ونقاط تحرك» باقٍ |
| DEC-018 §6: «S3 خبز الهيكل في الأوراق» | `docs/HC-P2-S2-LIGHT-DECISION.md` §6 | حلّ محله الهيكل الحي بقرار المالك؛ §10 مؤرخ هناك |
| DEC-019: بلا Filter ولا mask ولا RenderTexture | §12 | **لم يُعدَّل**: لا `cacheAsTexture`؛ الطبقة `lite` تكميم ونوابض مطفأة فقط (BL-046 لأي اقتراح لاحق) |
| DEC-005/009: لا اعتماد بلا دليل بصري؛ مسار CI لا يقيس الأداء | §12 | السقف `IMPLEMENTED`؛ كل لقطة بطبقتها؛ أرقام الصندوق تُسمّى كذلك |
| DEC-017: الحجم مقاس لا مفروض | §12 | لا ملف جديد في `public/` ولا صورة مُعاد توليدها: `git diff --stat 2b0113b -- public data` = 0 سطر؛ js 348→**358KB** gzip (+10KB للهيكل، مقاس لا مفروض)؛ `docs/hc-p2-s3-shots/` 18MB تُودَع كسابقة S2 |
| قاعدة التعديل §1؛ §7 لا توسيع نطاق صامتًا | §1 سطر 32-37؛ §7 سطر 516-533 | القرار قرار المالك النصي جوابًا على سؤال صريح (وثيقة القرار §1)؛ ما فُتح جانبًا: BL-043…046 |

**حالة المدخلات عند البدء:** P2 `IN_PROGRESS` عند HC-P2-S2 (`IMPLEMENTED`، `2b0113b`). P1 `IN_PROGRESS` عند HC-P1-S4
(BL-034 باقٍ). الشجرة نظيفة عند `2b0113b`. النموذج `prototypes/next-render` موجود ويبقى حتى S6. Pixi في `node_modules`
8.21.0 والقفل 8.20.1 (الدليل يُشغَّل على `npm ci`).

---

## 2. الخطة المنفذة

| # | الcommit | ما فيها |
|---|---|---|
| 1 | `af55e44` (21-09-2026) | الخطوة كلها: الوحدات النقية (`anim/rig.ts`، `anim/cast.ts`، `quality.ts`)، العارض (`characterRig.ts`، `characterView.ts`، `anim/clipPlayer.ts` `progress()`، `scene.ts`، `app.ts`، `index.ts`)، الواجهة (`HotelCanvas.tsx`)، الاختبارات (`tests/unit/rig.test.ts`، مرايا `animations.ts`/`render.ts`/`characters.ts`، `game.spec.ts`)، والحوكمة (وثيقة القرار، DEC-020، الصف #21، ملاحظة ART-0 §11، §11/§13/§17، LIGHT-DECISION §10، هذا التقرير، PROJECT-STATE، README، CI-E2E، MOBILE-DEVELOPMENT) |
| 2 | `ac7e0a0` (21-09-2026 03:04، «review fixes and the evidence captures»؛ 78 ملفًا) | ما غيّرته المراجعة العدائية (§4.9، §4.10، ملحق القرار §9): إعادة الصبغ للعرض المُعاد من المسبح، العدّاد `viewUpdates`، نقل الوزن حركة ثانوية، تعليق `lite`، لفظ «حرفيًا»، أرقام أسطر ART-0، حالة vitest وفحص ذاتي جديدان، إعادة التقاط جدول الصندوق وخط أساس الأوراق، **`docs/hc-p2-s3-shots/` (68 ملفًا) مودَعة**، وملء هذا التقرير وPROJECT-STATE |
| 3 | شجرة العمل فوق `ac7e0a0` (إقفال التقرير، 21-09-2026 — الإيداع على المرحلة التالية) | هذه الوثائق الخمس فقط: هذا التقرير (§2، §4.1 الجدول الحرفي، §4.10 (ب) انحرافات التنفيذ، §5 دورات الإقفال، §6.1 ملاحظات اللقطات، §7 البنود المفتوحة، ART CHECK، §9)، `PROJECT-STATE.md`، `docs/CI-E2E.md`، `docs/MOBILE-DEVELOPMENT.md`، `docs/HC-P2-S3-RIG-DECISION.md` §9 #14؛ لا كود |

**شجرة العمل عند إقفال هذا التقرير** (`git diff --stat 2b0113b -- . ':!docs/hc-p2-s3-shots'` أُعيد تشغيله عند الإقفال 21-09-2026، ثم
`git status --short`؛ لا شيء في `public/` أو `data/` — `git diff --stat 2b0113b -- public data` فارغ):

```
 PROJECT-STATE.md                        |  22 +
 README.md                               |   9 +-
 docs/ART-0_VISUAL_DIRECTION_AR.md       |   2 +
 docs/CI-E2E.md                          |   2 +
 docs/DECISIONS.md                       |   1 +
 docs/HC-P2-S2-LIGHT-DECISION.md         |  17 +
 docs/HC-P2-S3-REPORT.md                 | 434 ++++++
 docs/HC-P2-S3-RIG-DECISION.md           | 364 ++++++
 docs/HOTEL_CITY_MASTER_REFERENCE_AR.md  |   8 +-
 docs/MOBILE-DEVELOPMENT.md              |  23 +-
 src/render/anim/cast.ts                 | 211 ++++
 src/render/anim/clipPlayer.ts           |  21 +
 src/render/anim/rig.ts                  | 677 ++++++
 src/render/app.ts                       |   9 +-
 src/render/characterRig.ts              | 817 ++++++++
 src/render/characterView.ts             | 268 +++-
 src/render/index.ts                     |  14 +
 src/render/quality.ts                   |  62 ++
 src/render/scene.ts                     | 135 ++-
 src/ui/HotelCanvas.tsx                  |  17 +-
 tests/e2e/game.spec.ts                  |  75 +-
 tests/unit/rig.test.ts                  | 702 ++++++
 tools/selftest/animations.ts            | 265 +++-
 tools/selftest/characters.ts            |  11 +
 tools/selftest/render.ts                |  96 +++
 25 files changed, 4292 insertions(+), 54 deletions(-)      ← شجرة العمل عند الإقفال (4041 عند af55e44، 4210 عند ac7e0a0)
 + docs/hc-p2-s3-shots/   (68 ملفًا، 18MB: png/webm/json/log — مودَعة في ac7e0a0 كسابقة S2، DEC-017)
 M  (فوق ac7e0a0، غير مودَعة عند الإقفال) PROJECT-STATE.md, docs/CI-E2E.md, docs/HC-P2-S3-REPORT.md,
    docs/HC-P2-S3-RIG-DECISION.md, docs/MOBILE-DEVELOPMENT.md   ← وثائق فقط، لا كود
```

---

## 3. مطابقة الخطة ↔ المرجع

- **لا رقم توازن تغيّر**: `data/**` لم يُلمس (`git diff --stat 2b0113b -- data` فارغ). لا ملف حركة ولا ورقة.
- **لا migration ولا تغيير في الحفظ**: `SCHEMA_VERSION` بقي **20**؛ لا حقل جديد في `GameState`؛ الطبقة والـantialias وحالة
  الهيكل في العارض وحده.
- **النواة والجسر بقيا كما هما**: `src/core/**` و`src/bridge/**` (بما فيه `stress.ts`) بلا تعديل؛ `SceneSnapshot`/`SceneCharacter`
  بلا حقل جديد.
- **ما نقلته الخطة من النموذج وما رفضته** مطابق لوثيقة القرار §2: IK بعظمتين، الخطوة بالمسافة، نابض الرأس (190/17/2.5)،
  الهبوط 2.1 والانضغاط 0.055؛ رُفض `Math.random` (بذرة `mulberry32`)، والانضغاط على الشكل كله (تحت الرقبة فقط)، و`STRIDE 17`
  (→ 128)، والرأس 43% (→ 54%)، والهبوط متوسط-المركز (→ نزولًا فقط)، والتنفس المستمر (→ على الشبكة).
- **صفوف HC-VIS-001** التي تمسّها الخطوة: :22 ✓ 54%؛ :23 مؤجل BL-043 بالأرقام؛ :65 مُحقَّق جزئيًا بانحراف مُعلَن؛ :66 ✓؛
  الباقي في وثيقة القرار §4.
- **النطاق الذي لم يُفتح**: الجسيمات (S4)، المصعد (S5)، parallax وحياة الشارع (S6)، الحوادث الحية (S7)، رافعة الجودة
  وقراءة الهاتف (S8)، تقاعد الأوراق (BL-045)، BL-023، BL-034، BL-039، BL-042.
- **عمل من مرحلة أخرى تسلل؟** لا: كل ملف في `git diff --stat` أعلاه من كتلة «# FILES» في الخطة. ما زاد أثناء المراجعة (العدّاد `viewUpdates` في `scene.ts`، إعادة الصبغ، بوابة `secondary` على نقل الوزن) تصحيحات لهذه الخطوة نفسها مسجَّلة في §4.9 و§4.10.
- **انحرافات مسجَّلة عن نص الخطة**: §4.n.

---

## 4. ما تغيّر فعلًا

### 4.0 أين يراه اللاعب

| الموضع / الحالة | ما يراه |
|---|---|
| تكبير الغرفة (2.0×) ونزيل يمشي على الرصيف أو في الممر | خطوة تتبع المسافة (دورة لكل كتلة)، رأس يتأخر عند التوقف والدوران، انضغاط خفيف تحت الرقبة عند التماس — `walk-full.webm` (تسجيل 19.3ث كاملًا: الإقلاع والتأطير 0–4.2ث، الماشي على الرصيف 10.3–11.3ث ثم الاستقبال والغرفة والنوم حتى 18.4ث) وإطاراه `walk-full-frame-10.5s.png`/`-10.9s-crop.png`؛ المرشح 64: `walk-stride64.webm` |
| الاستقبال | الموظفة خلف المكتب بقبعة pillbox ولوح (`room-reception-full-phone-crop.png`: المكتب يخفي ما تحت الرقبة، فالنسبة تُقاس من النزيل والمدرّب في §6.1) |
| غرفة نوم | النائم رأسه على الوسادة واللحاف فوق فن السرير، يتنفس على شبكة إطارات المقطع مع انجراف Z — `room-bedroom-full-phone-crop.png` |
| الصالة الرياضية / المطعم | المدرّب بالدمبل (`room-gym-full-phone-crop.png`)، الجالس في المطعم (`room-restaurant-full-desktop-sit-crop.png`)؛ الأدوات تُقرأ عند 2.0×. **لم تُلتقط لقطة بار** (الساقي بالكوب يُرى في لوحة الطاقم فقط) |
| واقفون (خمول) | تنفس على إطارات صف `idle` الأربعة، لا زحف تحت-بكسلي؛ رمش 125ms من الملف |
| تقليل الحركة | الوضعية المحايدة مجمَّدة والموضع يسير — `reduced-a.png`/`reduced-b.png` (`sx` 1047→168 خلال 722ms والوضع نفسه؛ §6.1) |
| مسار CI (`canvas`) والهاتف الضعيف | الطبقة `lite`: الوضع مُكمَّم على إطارات المقطع، النوابض مطفأة؛ نفس الأشكال والألوان |

### 4.1 الرياضيات — `src/render/anim/rig.ts` (جديد، نقي)

نقي (لا Pixi ولا DOM ولا `Math.random`؛ فحص «no presentation module rolls its own dice» يمرّ). ما شُحن: `figureFor(build, height, age)`
(النِّسَب من `hcstyle._figure`: `RIG_TOTAL_PER_HEIGHT 60`، `RIG_HEAD_R 0.27` (`0.29` للطفل)، `RIG_HIP 0.215`، `RIG_BODY_TOP 0.86`،
`RIG_LEG_REACH 1.06`، `SHOULDER` لكل بنية، `HIP_SOCKET 0.26`)، `ik()` بعظمتين، `pose(rs, p, inp)` الدالة الوحيدة التي تكتب `RigState`،
`boundsOf()`/`headExtent()` للحدود، `walkSlidePx()` لرقم :65، `cycle()`/`gridT()` للشبكة، `NEUTRAL_INPUT`، `createRigState`/`resetRigState`
(بذرة `seedUnit`). الثوابت المصدَّرة بقيمها من الملف: `STAND_SPACE_PX 70`، `CELL_HALF_WIDTH_PX 24`، `STRIDE_PX 128`، `STRIDE_AMP 0.068`،
`FOOT_LIFT_MAX 0.05`، `BOB_WALK_MAX 2.1`، `BOB_IDLE_MAX 0.6`، `SQUASH_MAX 0.055`، `SQUASH_IDLE 0.018`، `HEAD_SPRING_K 190`،
`HEAD_SPRING_DAMP 17`، `HEAD_STEP_MAX_S 1/30`، `HEAD_LAG_MAX 2.5`، `HEAD_TILT_WALK 0.06`/`_GLANCE 0.12`/`_SLEEP 0.45`، `LEAN_MAX 1.6`،
`HOP_MAX 2.0`، `STAMP_MAX 0.8`، `SIT_DROP 5`، `SIT_FEET_FORWARD 3.2`، `SHIFT_WEIGHT_PX 1.2`، الجداول `BOB_IDLE`/`BOB_WORK`/`BOB_SIT`/`HOP`/
`STAMP`/`ANGRY_SWING`/`WORK_REACH`/`HAPPY_RAISE`/`SLEEP_BREATH`/`SLEEP_DRIFT`/`SQUASH_BREATH`/`IMPATIENT_SHIFT`/`LEAN_FLINCH`، و`GRID_CLIPS`
= {idle, sit, sleep}. **ما غيّرته المراجعة:** نقل الوزن (`shiftWeight`) صار حركة ثانوية (`secondary`) فلا يعمل على `lite` ولا مع تقليل الحركة
(§4.9 #6).

**الجدول المقيس لكل عضو** — مخرجات `node --experimental-strip-types tools/selftest/animations.ts` كما طُبعت عند الإقفال 21-09-2026 (فحص
«every cast member fits the body the rooms assume and the cell a bake would need»؛ مطابقة لـ`s3r-verify.log` سطر 619-637 و`s3f-verify.log`).
الأعمدة: الطول بالبكسل المنطقي (المعروض عند 0.82)، نسبة الرأس عاريًا / مع الغطاء، الانزلاق لكل خطوة عند `STRIDE_PX` 128 و64، ثم أعلى نقطة / أعرض
نصف مدى لكل مقطع:

```
      idle bob 0.55 p-p, worst head lag 1.44 of 2.5
      2304 combinations, four bone lengths exact in each
      staff.receptionist: 60.0 rig px (49.2 px), head 54% bare / 56.6% dressed, slide 57.3 px/step at 128 and 25.3 at 64
        top/half per clip: idle 64.6/18.1, walk 63.9/17.9, work 64.4/17.9, sleep 44.7/21.2, sit 59.4/17.9, happy 65.4/17.9, angry 64.0/17.9, scared 64.0/17.9
      staff.cleaner: 56.4 rig px (46.2 px), head 54% bare / 59.5% dressed, slide 57.7 px/step at 128 and 25.7 at 64
        top/half per clip: idle 65.1/17.1, walk 64.3/16.9, work 64.9/16.9, sleep 44.7/21.2, sit 59.9/16.9, happy 65.9/16.9, angry 64.5/16.9, scared 64.5/16.9
      staff.trainer: 64.8 rig px (53.1 px), head 54% bare / 54.0% dressed, slide 56.8 px/step at 128 and 24.8 at 64
        top/half per clip: idle 66.1/19.4, walk 65.4/19.2, work 65.9/19.2, sleep 44.7/21.2, sit 60.9/19.2, happy 66.9/19.2, angry 65.5/19.2, scared 65.5/19.2
      staff.chef: 58.8 rig px (48.2 px), head 54% bare / 58.7% dressed, slide 57.4 px/step at 128 and 25.4 at 64
        top/half per clip: idle 66.5/17.7, walk 65.8/17.6, work 66.3/18.2, sleep 44.7/21.2, sit 61.3/17.6, happy 67.4/17.6, angry 65.9/17.6, scared 65.9/17.6
      staff.bartender: 61.2 rig px (50.2 px), head 54% bare / 56.6% dressed, slide 57.2 px/step at 128 and 25.2 at 64
        top/half per clip: idle 65.4/20.7, walk 64.7/20.5, work 65.2/20.5, sleep 44.7/21.2, sit 60.2/20.5, happy 66.3/20.5, angry 64.8/20.5, scared 64.8/20.5
      staff.usher: 55.2 rig px (45.3 px), head 54% bare / 55.2% dressed, slide 57.8 px/step at 128 and 25.8 at 64
        top/half per clip: idle 57.7/17.4, walk 57.0/17.3, work 57.5/17.3, sleep 44.7/21.2, sit 52.5/17.3, happy 58.6/17.3, angry 57.1/17.3, scared 57.1/17.3
      staff.lifeguard: 60.0 rig px (49.2 px), head 54% bare / 54.0% dressed, slide 57.3 px/step at 128 and 25.3 at 64
        top/half per clip: idle 61.3/23.3, walk 60.6/23.2, work 61.1/23.2, sleep 44.7/21.2, sit 56.1/23.2, happy 62.1/23.2, angry 60.7/23.2, scared 60.7/23.2
      guest.standard: 60.0 rig px (49.2 px), head 54% bare / 54.0% dressed, slide 57.3 px/step at 128 and 25.3 at 64
        top/half per clip: idle 61.3/18.1, walk 60.6/17.9, work 61.1/17.9, sleep 44.7/21.2, sit 56.1/17.9, happy 62.1/17.9, angry 60.7/17.9, scared 60.7/17.9
      guest.inspector: 62.4 rig px (51.2 px), head 54% bare / 54.0% dressed, slide 57.0 px/step at 128 and 25.0 at 64
        top/half per clip: idle 63.7/18.7, walk 63.0/18.6, work 63.5/18.6, sleep 44.7/21.2, sit 58.5/18.6, happy 64.5/18.6, angry 63.1/18.6, scared 63.1/18.6
      tallest 67.35 (staff.chef happy) ≤ 70; widest 23.32 (staff.lifeguard idle) ≤ 24
  ✓ every cast member fits the body the rooms assume and the cell a bake would need
```

القيم التي يطبعها الجدول عند 16 طورًا؛ عند 64 طورًا يبلغ الأعرض 23.85 (ذيل حصان المنقذ 1.34r + 0.45 مع `impatient` ونقل الوزن) و`top` الطاهي
67.82 عند t = 0.55 — كلاهما داخل الحدين (24 و70) اللذين تثبتهما `rig.test.ts` (حدود لكل عضو × مقطع × 16 طورًا) و`animations.ts`.

الأعلى 67.35 لا 67.9 (جدول وثيقة القرار §3.1): نابض الرأس يتأخر عن القفزة فلا تبلغ القمة حساب الجدول الخالي من التأخر. الأعرض المنقذ
23.32 لا المدرّب 15.4: ذيل الحصان عند `cx + 1.34r` هو العرض الحاكم (0.68px هيكل تحت الحد، 19.1px معروضًا). الحدان 70 و24 لم يُمسّا؛
الفرق خطأ نقل في جدول الوثيقة مسجَّل في ملحقها §9 #2.

### 4.2 الهوية — `src/render/anim/cast.ts` (جديد، نقي)

`CAST` تسعة صفوف (`Look`: بنية، طول، عمر، جلد، شعر ونمطه، قبعة ونمطها، قميص، سروال، لمسة، مريلة، أداة وأداة عمل، تعبير)، `PALETTE`
باسم كل لون من `hcstyle.P` بالهكس نفسه، `lookFor(assetKey)`، `castIds()`، `PROP_EXTENT` لحدود الأدوات، `shade()`/`lighten()` نحو حبر (10,20,44).
فحص التكافؤ في `tools/selftest/render.ts`: «the cast table is the one the art is drawn from» (**9 أعضاء × 15 حقلًا** ضد `characters.py`
+ `hcstyle.py`)، «every cast colour is a named hcstyle colour with the same hex»، «shade() is hcstyle's shade»، «the rig stands inside the body
the waypoints assume» — 64 فحصًا في الوحدة (كانت 60).

### 4.3 الطبقتان — `src/render/quality.ts` (جديد، نقي)

`MotionTier = 'full' | 'lite'`؛ `tierFor(backend, request)` تعيد `lite` على `canvas` ما لم يُطلب `full`، و`full` على WebGL/WebGPU ما لم يُطلب
`lite`؛ `renderFlags(search)` تقرأ `?lite=0`/`?lite=1` و`?aa=1` بالحرفين `'0'`/`'1'` فقط؛ `setMotionTier`/`motionTier` حالة الوحدة التي
يقرؤها `characterView.ts` و`scene.rigStats()`. `tests/unit/rig.test.ts` يثبت الجدول.

### 4.4 الرسم — `src/render/characterRig.ts` (جديد)

**53 Graphics لكل شخص** (لا ~41+8 كما في نص DEC-020 — ملحق الوثيقة §9 #3): الجذر 2 (الظل، الشعر الخلفي) + تحت الرقبة 21 (فخذان وساقان
وحذاءان، ذراعان خلفيتان ويد، جذع وياقة ومريلة، ذراعان أماميتان ويد، و`PROP_SLOTS` 3 × {أداة، أداة عمل}) + الرأس 14 (جمجمة، شعر،
غرّة، قاعدة القبعة وحزامها، عيون مفتوحة/مغمضة/خائفة، 5 أفواه، حمرة) = **37 واقفًا**، + **16 للنوم** (ظل السرير، وسادة، حدبة، لحاف، طيّة
الملاءة، طيّات، خيمة القدم، الذراع، رأس النائم 6، Z×2). `rigStats().parts` 3233 ÷ 61 = 53 و106 ÷ 2 = 53. الـcontexts مشتركة على مستوى الوحدة
في `SHARED: Map<string, GraphicsContext>` عبر `contextFor(key, draw)` — **`new GraphicsContext(` مرة واحدة في الملف** و`batchMode = 'batch'`
(فحص «the rig never redraws geometry per frame»)؛ الحدود بـ`poly()` قليلة النقاط لا `circle()` (≈112 نقطة). `apply(pose, eyesShut)` مواضع
ودوران ومقياس وألفا فقط: لا `new `، لا `.clear(`/`.fill(`/`.stroke(`، لا `.context =`، لا `.visible =`/`.renderable =` — مثبت نصيًا. التعبير
والأداة والرمش والجلوس والنوم بالألفا؛ `setLook()` يسند الـcontexts مرة عند تغيّر الهوية **ويعيد الآن هل ألبس** (§4.9 #5)؛ `setTints(lit)`
يصبغ بلا لمس هندسة. لا `cacheAsTexture` ولا `RenderTexture` (DEC-019).

### 4.5 عرض الشخصية — `characterView.ts`، `anim/clipPlayer.ts`

مفتاحان: `lookKey = assetGeneration(),assetKey` (يسند الهندسة مرة لكل شخص) و`cheapKey` (اتجاه، رغبة، سحب، شفافية، ليل، غسق، مقطع،
مزاج — صبغة وألفا وفقاعة فقط)؛ و`lightKey` للصبغ وحده. **ما غيّرته المراجعة (§4.9 #5):** عرض مُعاد من المسبح لشخص بالمظهر نفسه كان
يحمل صبغات الضوء السابق (`reset()` ينسى مفاتيح العرض لا `CharacterRig.lookKey`)؛ الآن `if (!dressed && (lookChanged || lightKey !==
this.lightKey)) this.rig.setTints(lit)`. مسار الورقة بايتًا ببايت (`playOnce` line، `clipOf(`/`assetGeneration()`/`framesFor(`/`lookFor(` — فحص
«the sheet path is still there behind the rig»)؛ `progress(player, timing)` في `clipPlayer.ts` يعطي `t` داخل المقطع من الـmanifest (فحص
«the JSON is still the clock»)؛ مدة الرمش من `clipOf(this.lastAssetKey, 'blink')`؛ فقاعة الرغبة تُوضع من `standingTopPx()` (أعلى الشكل مع
الغطاء). على `lite` **الوضع يُحسب كل إطار** (طور المشية يتبع المسافة داخل `pose()`) وما يُتخطى هو `apply()` عند ثبات المفتاح المُكمَّم
(مقطع، إطار، ⌊φ·frames⌋، اتجاه، عينان) — التعليق صُحّح ليقول ذلك (§4.10 #3).

### 4.6 المشهد والتشخيص — `scene.ts`، `app.ts`، `HotelCanvas.tsx`، `index.ts`

`characterDiagnostics()` يضيف `source: 'rig' | 'sheet' | 'none'` و`sx`/`sy` (الشاشة) و`sheetReady`؛ `showCastSheet(spec | null)` لوحة الطاقم
على المسرح (9 صفوف × 11 خلية 48×72 × scale)؛ `rigStats()` = `{ tier, parts, rebuilds, viewUpdates }` — **`viewUpdates` أُضيف في المراجعة**
(§4.9 #4): `rebuilds` = إطارات بدأت و`structureDidChange` مرفوع (تبديل `visible`/`renderable`، إضافة ابن)، `viewUpdates` = إطارات بدأت وفي
`childrenRenderablesToUpdate` تحديث عرض (إسناد context، `clear()`+رسم، تغيير نسيج) — الصنف الذي لا يراه العلم عند نقطة القراءة لأن Pixi
يحوّله إلى العلم داخل `_updateRenderGroups` ويمسحه في النداء نفسه. `app.ts`: `RendererOptions.antialias` من `?aa=1` (BL-044)؛ `index.ts`
يصدّر `MotionTier`/`renderFlags`؛ `HotelCanvas.tsx` يعرض `window.hct.castSheet/castSheetOff/rigStats` على مسار `VITE_E2E` فقط
(`check:cheats` نظيف).

### 4.7 الاختبارات

`tests/unit/rig.test.ts` **36 حالة** (35 عند `af55e44` + «lite: a weight shift is secondary motion, so the hip holds still on the frame grid»)
في 14 مجموعة: النِّسَب، برهان المدى، الرأس من الرقبة المضغوطة، النابض، الشبكة، الطبقتان، تقليل الحركة، البذور، الحدود لكل عضو × مقطع ×
16 طورًا، الانزلاق، `renderFlags`/`tierFor`، `progress()`. `tools/selftest/animations.ts` **34 فحصًا** (كانت 23): «the stride is driven by
distance, not time»، «the stance foot is planted, the leg always reaches, and the pivot never moves»، «secondary motion stays inside the bounds
DEC-020 signs»، «no pose is ever NaN» (2304 تركيبة)، «reduced motion freezes the pose and keeps the transit»، «same seed, same person; different
seeds do not breathe in unison»، «every cast member fits the body the rooms assume and the cell a bake would need»، «the rig never redraws
geometry per frame»، «the sheet path is still there behind the rig»، «a recycled view re-tints the rig it inherits» (**جديد في المراجعة**)،
«the JSON is still the clock»، «no presentation module rolls its own dice or touches the DOM at import». `render.ts` +4 (§4.2)، `characters.ts` +1
«every person on screen has a cast identity for the rig». E2E «characters are drawn, not left as placeholder shapes»: `source === 'rig'` للكل،
`sheetReady` للكل، وقصّ 40×52 css px حول أكثر شخص حبرًا: **≥ 10 ألوان متميزة 5-بت و≥ 2% بكسلات داكنة** (`max(r,g,b) < 0x40`). الاختبار
لا يطبع أرقامه إلا عند الفشل؛ إعادة قياسها بالسكربت نفسه (`e2e-crop-numbers.json`): سطح المكتب s1 **244 لونًا / 3.5% حبر**، الهاتف s1
**354 / 3.9%** (أفضل قصّ؛ s0 خلف المكتب 0–0.1% حبر — لذلك يُقاس الأكثر حبرًا).

### 4.8 ما لم يُمسّ

`src/core/**`، `src/bridge/**`، الحفظ (`SCHEMA_VERSION` 20)، `roomView.ts`، `decorView.ts`، `lightLayer.ts`، `backdrop.ts`،
`anim/sheet.ts`، `anim/motion.ts`، `anim/scheduler.ts`، `assets.ts`، `data/**`، `public/**`، ملفات الحركة والأوراق الـ18،
`gen_chars.py`، صف `shipping.ts`، قوائم السماح، `prototypes/`.

### 4.9 ما غيّرته المراجعة العدائية

| # | الوجدان (21-09-2026) | ما فُعل |
|---|---|---|
| 1 | **حاجز:** الخطوة موقّعة `IMPLEMENTED` والتقرير هيكل بفراغات «يُملأ بعد التحقق» (≈50)، وPROJECT-STATE مثله | مُلئ التقرير كله من السجلات (§2، §4، §5، §6، §8، §9)؛ PROJECT-STATE بالأرقام نفسها |
| 2 | **رئيسي:** عرض مُعاد من المسبح لشخص بالمظهر نفسه يحمل صبغات الضوء السابق (`setLook()` يعود مبكرًا بلا `setTints`) | `setLook()` يعيد هل ألبس؛ العرض يصبغ عند أي تغيّر مفتاح لم تغطِّه الإلباسة؛ فحص ذاتي نصي جديد (`animations.ts`) |
| 3 | **رئيسي:** `rigStats().rebuilds` لا يرى إسناد الـcontext وإعادة رسم Graphics (يصيران علمًا داخل `_updateRenderGroups` ويُمسحان في النداء نفسه) | عدّاد ثانٍ `viewUpdates` من `childrenRenderablesToUpdate.index` عند نقطة القراءة نفسها؛ التعليق يقول ما يثبته كلٌّ؛ جدول الصندوق أُعيد التقاطه بالعدّادين |
| 4 | **رئيسي:** «المُثبت حرفيًا» في #21 وDEC-020 و«السبب» بينما §1 الوثيقة تقول إن الصياغة منقولة بمضمونها | صُحّح اللفظ في الثلاثة إلى «مُثبت بمضمونه وخياريه (الجواب «هيكل حي» حرفي)»؛ ملحق §9 #1 |
| 5 | **رئيسي:** صفوف SwiftShader WebGL لا تحمل كلفة حقيقية (الـshader لم يتهيأ؛ 59.9 fps لحلقة لا ترسم) | §6.2 يقولها كذلك؛ `isBatchable` لم يُقرأ؛ ملحق §9 #7 |
| 6 | **رئيسي:** أرقام الصندوق p5 30 مقابل 59.5 للأوراق و`lite` ≈ `full`، وخط أساس الأوراق لم يُعد تشغيله في اليوم نفسه | أُعيد تشغيله من تصدير `2b0113b` بالسكربت نفسه (59.7/59.5 و59.9/59.9) ولُصق مع قراءة صادقة في §6.2؛ ملحق §9 #8 |
| 7 | **رئيسي:** §3.1 الوثيقة تخالف السجل (67.9→67.35، 15.4 المدرّب→23.32 المنقذ، النِّسَب) | لم يُعدَّل §3.1 (نص قبل الكود)؛ الجدول من السجل في §4.1 هنا وملحق §9 #2؛ الحدود لم تُرخَ |
| 8 | **رئيسي:** صف تقليل الحركة وعد «≈ 0» ولا تشغيل يثبته (القصّ يتبع الماشي فوق خلفية متغيّرة) | الأرقام الحقيقية في §6.1 (خام 43%/19%؛ مدى الحبر صفًا صفًا داخل عمود الشكل 185/203 ≤ 1px مقابل 23/260 للتحكم) ولا «≈ 0» في أي مكان؛ ملحق §9 #9 |
| 9 | **رئيسي:** كتلة `measure` في `room-shots.json` تقيس صندوق القصّ لا الشكل | قياس يدوي بالحبر والجلد من القصّ (§6.1)؛ الكتلة معلَّمة غير صالحة؛ ملحق §9 #10 |
| 10 | **رئيسي:** §11 المرجع وPROJECT-STATE يعلنان `IMPLEMENTED` والتقرير المستشهد به فارغ | التقرير مُلئ قبل أن يبقى الصف؛ السقف `IMPLEMENTED` كما هو |
| 11 | ثانوي: على `lite` يُحسب `pose()` كل إطار والتعليق و§3.3 الوثيقة يدّعيان توفيرًا لا يحدث؛ ونقل الوزن يحرّك الورك على `lite` خارج المفتاح | التعليق صُحّح؛ نقل الوزن حركة ثانوية (بوابة `secondary`) + حالة vitest؛ §4.10 #3 وملحق §9 #6 |
| 12 | ثانوي: `docs/hc-p2-s3-shots/` غير متعقَّبة والجدول §6.1 يسمّي ملفات لا وجود لها | المجلد يُودَع (DEC-017، سابقة S2)؛ الجدول بأسماء الملفات الحقيقية والطبقات؛ المطعم بدل البار |
| 13 | ثانوي: `cast-sheet-1280.png` غير صالحة لـART CHECK و`2560-clean` فوق الليل | `cast-sheet-2560-clean-grid.png` هي صورة ART CHECK بخلفية مسمّاة؛ محاولة نهارية بقيت ليلًا (الفندق يحتاج دفع وردية ليُفتح) فحُذفت |
| 14 | ثانوي: «~41 (+8)» في DEC-020 و53 في الكود | §4.4 بالعدّ من الملف (37 + 16)؛ ملحق §9 #3؛ PROJECT-STATE صُحّح؛ نص DEC-020 لا يُعاد كتابته |
| 15 | ثانوي: أرقام أسطر ART-0 (259→260، 125-127→127-128) | صُحّحت هنا §1 وفي §0 الوثيقة |

### 4.10 انحرافات مسجَّلة عن نص الخطة (كل مرحلة، لا انحراف صامت)

كل بند هنا قُرئ من الملف عند الإقفال لا من مذكرات المراحل؛ الخطة تبقى الحاكمة، وما خالفها مسجَّل بسببه:

| # | نص الخطة | ما شُحن | لماذا | أين |
|---|---|---|---|---|
| 1 | وثيقة القرار §1 صف 3: «السؤال كما وُجّه إلى المالك حرفيًا» | مضمون السؤال وخياراه كما وُجّها والجواب «هيكل حي» حرفيًا؛ الصف #21 وDEC-020 و«السبب» تقول الآن «مُثبت بمضمونه وخياريه» | لم يكن نص السؤال الحرفي في متناول كاتب وثائق هذه الخطوة (لا في المستودع ولا في مخرجات التخطيط)؛ الجواب حرفي | `docs/HC-P2-S3-RIG-DECISION.md` §1، §9 #1 |
| 2 | «# EVIDENCE» (5): زوج تقليل الحركة «فرق قصّ الشخص ≈ 0» | الفرق الخام 43% بكسلات / 19% حبر لأن القصّ يتبع الماشي فوق خلفية متغيّرة؛ ما يخصّ الوضع: مدى الحبر صفًا صفًا 185/203 ≤ 1px (التحكم 23/260)؛ برهان الهوية الحاسم vitest + selftest | القصّ لم يُعزل عن الخلفية في السكربت؛ لم يُكتب «≈ 0» | §6.1 |
| 3 | وثيقة القرار §3.3: «الوضع يُعاد حسابه عند تغيّر المفتاح المُكمَّم فقط» | `pose()` يُحسب كل إطار في الطبقتين؛ `apply()` وحده يُتخطى على `lite` | طور المشية يتقدم بالمسافة داخل `pose()`؛ فصله لم يكن في الخطة والقياس يقول إن كلفة `lite` ≈ `full` على Canvas2D أصلًا | `characterView.ts`، §9 #6 |
| 4 | «# EVIDENCE» (6): قراءتا SwiftShader WebGL عند t≈25ث و`isBatchable` لكل context | لا قراءة كلفة: الـshader لم يتهيأ على SwiftShader؛ `isBatchable` لم يُقرأ | بيئة الصندوق (BL-020)؛ لا صفحة تطوير مُجهَّزة بُنيت | §6.2، §9 #7 |
| 5 | «# EVIDENCE» (1): «البار (الساقي بالكوب)» | المطعم (جالس) بدل البار؛ لا لقطة بار | لم تُلتقط؛ الساقي يُرى في لوحة الطاقم فقط | §6.1 |
| 6 | «# EVIDENCE» (1): نسبة الرأس وطول الشكل «مقيسين من البكسل» في جدول §6.1 لكل غرفة | مقيسان من قصّين فيهما شكل كامل (النزيل الماشي، المدرّب)؛ الاستقبال والمطعم وغرفة النوم لا يُظهران شكلًا واقفًا كاملًا | كتلة `measure` الآلية قاست صندوق القصّ (غير صالحة) | §6.1، §9 #10 |
| 7 | «# EVIDENCE» (4): لوحة الطاقم صورة ART CHECK «مقابل المرجع النهاري» | `cast-sheet-2560-clean-grid.png` فوق سماء الليل | الفندق مغلق عند الإقلاع فالليل مثبَّت (DEC-018)؛ الفتح يحتاج دفع وردية | §6.1، ART CHECK |
| 8 | DEC-020: «~41 جزءًا ثابتًا (+8 للنوم)» | 37 واقفًا + 16 للنوم = 53 | خطأ عدّ في نص القرار قبل الكود | §4.4، §9 #3 |
| 9 | «# VERIFICATION» (7): ملء التقرير قبل الإيداع | أُودع `af55e44` والتقرير هيكل؛ مُلئ في المراجعة | ترتيب المراحل في التنفيذ الأول | §4.9 #1 |

**ب) انحرافات مراحل التنفيذ (الرياضيات النقية، الرسم، المشهد، الدليل) عن نص الخطة** — كل بند قُرئ من الملف عند الإقفال (أرقام الأسطر من
شجرة العمل 21-09-2026)؛ لم يُرخَ حد ولم يُضيَّق نطاق؛ ما خالف الخطة هو خطأ نقل فيها أو حقيقة في hcstyle/Pixi تغلب النص:

| # | نص الخطة | ما شُحن | لماذا | أين |
|---|---|---|---|---|
| 10 | زاوية القدمين في المشي θ = 2πφ + side·π | θL = 2πφ (القدم الخلفية) وθR = 2πφ + π (الأمامية) — `foot(p)`/`foot(p+π)` كما في النموذج | cos(θ+π) = cos(θ−π) فالقدمان تأخذان الزاوية نفسها وتتحركان معًا؛ vitest يثبت أن القدمين نصف دورة متباعدتان | `rig.ts`، `rig.test.ts:235` |
| 11 | الرجلان من نقطة ورك واحدة `hip`؛ الاختبارات تثبت \|knee−hip\| = thigh | مقبسان `hipL`/`hipR` عند ox ± `HIP_SOCKET`·shoulder (0.26 مصدَّر)؛ `hip` يبقى المركز؛ ثوابت أطوال العظام من المقبسين | hcstyle يجذّر كل رجل عند hx = ox ± 0.26·shoulder (`draw_person` ~805)؛ من ورك واحد مع تباعد القدمين 0.26 والرفع الخامل 0.55 تخرج القدم من سماحية 6% لكل بنية (العادي: hypot(2.96, 13.45) = 13.77 > 13.67) ويُقصّ IK؛ الآن لا قصّ في أي مكان (الأسوأ 0.994) | `rig.ts:64`، `rig.test.ts:52-53` |
| 12 | صيغ الوضع تحمل `·facing` (القدمان، الميل، إمالة الرأس، `SIT_FEET_FORWARD`) **و**`characterRig.setFacing` يعكس الحاوية بـscale.x | الوضع في إطار +x القانوني (R = الأمام)؛ مرآة الحاوية وحدها هي الاتجاه؛ `RigInput.facing` يبقى لشيء واحد: نابض الرأس يعمل في فضاء العالم فيُحسّ بالدوران | الاثنان معًا يقلبان مرتين؛ اختبارات «SIT_FEET_FORWARD·facing»/«HEAD_TILT_SLEEP·facing» تثبت القيم القانونية | `rig.ts`، `rig.test.ts:393` |
| 13 | نابض الرأس (الخطة/النموذج): a = (target − (target + lag))·k − vel·damp | ينبض الموضع المطلق: lag += prevTarget − target كل إطار (`RigState.headPrev`، NaN حتى الإطار الأول) ثم تكامل k/damp/step/clamp كما في الخطة | كما كُتب يُقاس التأخر من الهدف الحالي ولا شيء يضيف حركة الهدف فتأخر النموذج صفر دائمًا؛ vitest يثبت أن الخطوة تنتج > 0.05px تأخرًا وأن القصّ يصمد (الأسوأ 1.44 من 2.5) | `rig.ts:191,530-535` |
| 14 | هدف الرأس y = bodyTop·squash + hipDrop − 0.86·headR | الرقبة المضغوطة بدقة: (bodyTop + hipDrop)·squash − 0.86·headR؛ الاختبار ≤ 1e-6 | العارض يضغط الجسم حول القدمين فالرقبة المرسومة عند (bodyTop + hipDrop)·squash؛ حرفية الخطة تفصل الرأس عن الرقبة بـhipDrop·(1−squash) ≤ 0.12px؛ نتيجتها لمرحلة الرسم: `body.position.y` يبقى 0 و`body.scale.y = pose.squash` فقط | `rig.ts`، `rig.test.ts:289` |
| 15 | هبوط الخمول/العمل يرفع الشكل كله؟ / هبوط المشي فقط | idle/work/sit/angry (`BOB_IDLE`/`BOB_WORK`/`BOB_SIT`/`STAMP`) تحرّك الورك والقدمان مغروستان عند y = 0 (الركبتان تنثنيان)؛ القفزة السعيدة وحدها ترفع القدمين (feetY = hipDrop) | hcstyle حرّك الشكل كله بقدميه لكل هبوط؛ الهيكل يحفظ تماس الأرض الذي يعد به :65؛ المدى مُتحقَّق لكل عضو | `rig.ts` |
| 16 | الطبقة `lite`: «النوابض والهبوط والانضغاط والميل صفر» | `lite` تصفّر الحركة الثانوية الخاصة بالهيكل (نابض الرأس، هبوط المشي، انضغاط التماس، تنفس الانضغاط الخامل، ومنذ المراجعة نقل الوزن) وتبقي حركة المقطع المؤلَّفة على الشبكة (الميل، القفزة، الدوس، هبوط الخمول)؛ تقليل الحركة يصفّر الميل كما تقول الخطة | ميل الخوف هو حركة المقطع نفسها من hcstyle (`cycle((0, −1.6))`) والحركة الوحيدة في مقطع الخوف ذي الإطارين؛ تصفيره على `lite` يجعل المقطع ثابتًا | `rig.ts:401-404` |
| 17 | الغضب: «القدم الأمامية x += cycle(ANGRY_SWING)·facing» | الوقفة تتسع على الجانبين: fx = hx + swing·side (متماثل، المحور في المركز) | hcstyle (المصدر المستشهد) يوسّع الجانبين؛ المدى لا يُقصّ (المدرّب إطار 0: 14.74 مقابل 14.77) | `rig.ts` |
| 18 | «الجلوس يضبط hipDrop ≥ SIT_DROP» | hipDrop ∈ [SIT_DROP + min(BOB_SIT), SIT_DROP] = [4.5, 5] | بصيغة الخطة نفسها hipDrop = SIT_DROP + cycle(BOB_SIT) وBOB_SIT = (0, −0.5) | `rig.test.ts` |
| 19 | تقليل الحركة: إمالة رأس المشي | headTilt = sleep ? HEAD_TILT_SLEEP : 0 تحت تقليل الحركة (التنفيذ الأول ترك `HEAD_TILT_WALK`؛ الاختبار كشفه) | نص الخطة نفسه | `rig.test.ts:393` |
| 20 | الحرفية shade(0xffffff, 0.18) = 0xd3d5da | 0xd3d5d9 محسوبة من الصيغة ومثبَّتة في vitest و`render.ts` | مزج Python: blue = round(255 + (44−255)·0.18) = round(217.02) = 217 = 0xd9 | `tools/selftest/render.ts:810` |
| 21 | اختبار الطاقم: «لا موظفان يتشاركان لون القميص (قاعدة characters.py)» | يثبّت تفرّد زوج (قميص، سروال) | ليست قاعدة characters.py: الاستقبال (تونيك مرجاني) والمنقذ (قميص مرجاني) يتشاركان `P['coral']` | `render.ts:909` |
| 22 | أرقام «# PROPORTIONS»: أعرض نصف مدى واقفًا المدرّب 15.4، الطاهي 13.4، اللوح 11.4/10.5، السعيد 11.6؛ قمة الساقي 65.3 | نصف العرض لكل عضو 17.3–23.3 عند 16 طورًا (23.85 عند 64)، النائم 21.2؛ الكل ≤ 24. قمة الساقي واقفًا 64.84؛ القمم idle/hop في الجدول أعلاه (§4.1)؛ الكل ≤ 70 | أرقام الخطة تُغفل الرأس نفسه (r + 0.7 حد = 16.9–18.2 وحده) ومدّ العمل والأداة؛ تجعيدات hcstyle تعبئة بلا حد. الحدان لم يُرخَيا؛ صُحّح النقل | §4.1 |
| 23 | `rig.ts` يستورد «`mulberry32` و`MAX_DT_S` فقط» | يضيف `import type { CapStyle, HairStyle } from './cast.ts'` (نوعي فقط، يُمحى تحت strip-types) | ليستخدم `boundsOf` اتحادات الطاقم بدل تكرارها؛ `cast.ts` نقي | `rig.ts` |
| 24 | `boundsOf(pose, p, { hairStyle, capStyle, propHalfWidth })` | `{ hairStyle, capStyle, propHalfWidth, propAbove }`؛ `cast.ts` يصدّر `PROP_EXTENT` للرقمين. صادرات زائدة عن الخطة: `headExtent()`، `seedUnit()`، `HIP_SOCKET`، `SHIFT_WEIGHT_PX`، `SQUASH_BREATH`، `IMPATIENT_SHIFT`، `LEAN_FLINCH`، الأنواع `HeadExtent`/`RigBounds`/`BoundsLook` | الممسحة ترتفع 11.8px فوق اليد ويجب أن تُحسب في `top` | `rig.ts:575,603,638,665` |
| 25 | `RigInput` بلا `holdT` | `holdT` (0..1 على مدى الإمساك) موجود و`NEUTRAL_INPUT.holdT = 0` | نص الخطة نفسه يطلب «حقل holdT منفصل يُضاف إلى RigInput» | `rig.ts:209,217` |
| 26 | اتجاه ثني المرفق (غير محدد في الخطة) | `bendSign` بحيث يشير المرفق دائمًا بعيدًا عن خط منتصف الجسم (تحت الكتف: −side؛ مرفوعًا فوقه: +side)؛ الركبتان إلى الأمام (−1)؛ موثقان عند موضع النداء | متماثل، لا يعبر الجذع (قبضتا الغضب)، ويُقرأ V في الهتاف | `rig.ts:257-274` |
| 27 | شجرة الأجزاء: `body (Container; position.y = hipDrop; scale.y = pose.squash)` | `body.position.y` يبقى 0؛ `body.scale.y = pose.squash` فقط | المرحلة النقية وضعت الهبوط في المفاصل (hip.y = hipY + hipDrop) وحسبت الرأس من الرقبة المضغوطة؛ وإلا طُبّق الهبوط مرتين وانفصل الرأس (البند 14) | `characterRig.ts` |
| 28 | contexts الأطراف: «كبسولة w 3.2 + حد 0.7» (الرجلان)، «w 2.8 + حد 0.6» (الذراعان) | الكبسولة بعرض (اللون + الحد) — نصف عرض 1.95 / 1.7 — مع خط الحبر المركزي 0.7 / 0.6؛ contexts مفتاحها (النوع، الطول) كما اختارت الخطة | hcstyle.py:808-809/860-861 يرسم خط حبر 4.6/4.0 **تحت** خط لون 3.2/2.8؛ كبسولة 3.2 بحد مركزي 0.7 تعطي 3.9 خارجًا و2.5 لونًا؛ الآن 4.6/4.0 خارجًا و3.2/2.8 لونًا داخلًا — مطابق لـPython | `characterRig.ts:180-194` |
| 29 | كبسولة الساق من الركبة إلى القدم بطولها الكامل | الساق تُرسم أقصر بـ1.8px (`ANKLE`) فيجلس غطاؤها داخل الحذاء (rrect الحذاء عند y −2.4..+0.4 حول مفصل القدم) | خط الرجل في hcstyle ينتهي عند الكاحل 1.8px فوق الأرض (806-810) والحذاء حوله؛ مفصل قدم الهيكل هو تماس الأرض فغطاء دائري بنصف قطر 1.95 يبرز 1.5px تحت الحذاء | `characterRig.ts:180-194` |
| 30 | شجرة الأجزاء تذكر `handF` فقط | جزء `handB` (السياق نفسه `HAND`، صبغة الجلد) خلف الجذع مع الذراع الخلفية؛ 53 Graphics لكل شخص يُبلّغها `partCount()` | hcstyle يرسم يدًا على الذراعين (862) والهتاف/الدوس/الجفلة تُظهر اليدين | `characterRig.ts:484,581,787,808` |
| 31 | قائمة النوم: pillow, hump, quilt, sheetFold, footTent, armOnSheet, zA, zB | تُضاف `quiltFolds` (طيّتان بـshade(top, 0.34) ألفا 0.6) و`sleepShadow` (قطع ناقص 19×2.8 ألفا 0.12)؛ رأس النائم يعيد استخدام contexts الجمجمة/`hairCap('plain')`/الغرّة/العينين المغمضتين/فم النوم/الحمرة عند r 11.4 | hcstyle.py:1108-1110 و1099 و1102-1105 | `characterRig.ts:431-437,509-515,586` |
| 32 | `apply()`: `quilt.scale.y = 1 + quiltBreath/15` | (15 − quiltBreath)/15 = 1 − quiltBreath/15؛ `sheetFold` و`quiltFolds` يتدرجان من ارتفاعي الراحة (13.8، 8.2)؛ حاوية السرير y = −16 + 2·quiltBreath | quilt_h = 15 − breath وbreath ∈ [−0.5, 0] (hcstyle.py:1096)؛ إشارة الخطة تقلّص اللحاف عند الشهيق | `characterRig.ts:770` |
| 33 | مفتاح الطبقة `lite`: النص `clip:frame:⌊phase·frames⌋:facing:eyes` | الخماسية نفسها معبّأة في رقم واحد ((clipIndex·64 + frame)·64 + ⌊phase·frames⌋)·4 + facingBit·2 + eyesBit؛ الدلالة متطابقة | سلسلة قالبية لكل شخص لكل إطار تخصّص ذاكرة في حلقة رسم تبقيها القاعدة بلا تخصيص (BL-037) | `characterView.ts:510` |
| 34 | الظل «مقياس shoulder·0.62 × 0.34 (0.44 جالسًا)» بلا طريقة مسمّاة | `CharacterRig.setSeated(on)` (0.44/0.62 من الكتف، hcstyle.py:794) تُنادى من `update()` بجوار `setLying`/`setProp` | الجلوس حقيقة مقطع تُعرف بمعدل اللقطة | `characterRig.ts:654,738-742` |
| 35 | `scene.render()`: «`this.handle.world.renderGroup?.structureDidChange` (أو parentRenderGroup)» | `world.parentRenderGroup?.structureDidChange` (مجموعة المسرح، التي يعيد Pixi بناءها) في أول `render()` بعد `frames.record` | `world` ابن عادي للمسرح لا مجموعة عرض فـ`world.renderGroup` null في Pixi 8؛ نافذة فحص قصّ الغرف تمنع التخصيص فقط وتمرّ | `scene.ts:283-292` |
| 36 | `showCastSheet`: «تركّب Container على `app.stage` (فضاء الشاشة فوق العالم)» — لا شيء عن طبقة الضوء | `showCastSheet` تجعل `layers.overlays.renderable = false` ما دامت اللوحة مركّبة وتعيدها عند الفكّ؛ مُتحقَّق: اللوحة صحيحة والعالم سليم بعدها | قيس على مسار canvas: مع اللوحة مركّبة رُسم الإطار كله (والعالم) جمعًا (الحبر يختفي، التعبئات بيضاء، السماء سماوية). الجذر في `node_modules` (8.21.0؛ الكود نفسه في 8.20.1): `CanvasBatchAdaptor.mjs:42` يضبط blend الـ2D في مكانه بينما `CanvasGraphicsAdaptor.mjs:196` يضبطه داخل `save()/restore()`، و`CanvasContextSystem.setBlendMode` يخزّن آخر وضع طُلب فقط — فأول Graphics بعد دفعة ضوء `add` تترك الوضع الحقيقي `lighter` لكل ما بعدها في ذلك الإطار والتالي. في اللعب لا شيء يُرسم بعد `layers.overlays` (لا أحد يستخدم `indicators`) فالعالم سليم — هيكل الخطة داخل العالم آمن — لكن اللوحة على مستوى المسرح تُرسم بعد الأضواء. **بند مفتوح ينتظر صف BL** (§7) | `scene.ts:454,466` |
| 37 | `update()`: «فرع الورقة حرفيًا مع rig.visible = false» و`fallback.clear()` لكل لقطة | على مسار الهيكل تُرسم كبسولة placeholder لمن لا مظهر له فقط، و`fallback.clear()` عند تغيّر المظهر لا كل لقطة رخيصة المفتاح؛ فرعا الورقة والكبسولة يبقيان على مسحهما الحالي | `clear()` على Graphics يصدر تحديثًا قد يعلّم مجموعة تعليمات العالم متسخة | `characterView.ts:346,369,373` |
| 38 | `tickAnimation`: `advance()` يبقي سهمه المضمّن `(name) => clipOf(this.lastAssetKey, name)` و`progress()` تُنادى بمعاود توقيت | النداءان يتشاركان حقلًا واحدًا مخصصًا سلفًا `timing`؛ سطر `advance` يتغير فقط بتمرير `this.timing` (لا حرفية مثبَّتة تغطيه) | `progress()` لا تضيف إغلاقًا لكل إطار | `characterView.ts:273,463,486` |
| 39 | قائمة صادرات `index.ts` | تصدّر أيضًا `headExtent`، `walkSlidePx`، `NEUTRAL_INPUT`، `PROP_EXTENT` والنوع `RenderFlags` | المرحلة النقية أضافتها وسكربتات الفحص الذاتي وE2E تستخدمها | `src/render/index.ts` |
| 40 | مسار الهيكل: «if (beat.play === 'blink') … else if (beat.play && clipOf(…)) playOnce(…)» | نُفّذ حرفيًا؛ المجدول لا يصدر إلا `play === 'blink'` ففرع else غير قابل للوصول اليوم ويبقى تكافؤًا مع سطر الورقة (المتطابق بايتًا في الفرع غير الهيكلي كما يطلب الفحص الذاتي) | ملاحظة لا انحراف | `characterView.ts` |
| 41 | نص المهمة: «مسبار دخان … لقطة اللوبي بتكبير 2.0×» | `mouse.wheel` لم يبلغ القماشة (نافذة تغطي الصفحة عند الإقلاع وبعدها لم تُسجَّل الأحداث)؛ التكبير بإرسال `WheelEvent` على عنصر القماشة؛ الفحص في المشهد عند 1.71× على الهاتف (قصّ) وعند 2× بالضبط عبر `hct.castSheet({scale:2})`؛ على سطح المكتب الكاميرا الملائمة تترك الصف الأرضي تحت بطاقة HUD (سابق، ملاحظ في S2) | أداة الالتقاط لا الكود | `scratchpad/build/s3-smoke.mjs`، `s3-zoom.mjs` |

---

## 5. البوابات التي شُغّلت

| البوابة | قبل (`2b0113b`) | بعد (شجرة العمل بعد المراجعة) | ما تثبته |
|---|---|---|---|
| `npm run verify` — vitest | 94 اختبارًا (6 ملفات) | **130 اختبارًا (7 ملفات)** — `s3r-verify.log` = `s3f-verify.log` (الإقفال، exit 0) (129 عند `af55e44`، `s3-verify.log`) | + `tests/unit/rig.test.ts` 36 حالة (35 + 1 من المراجعة) |
| `npm run verify` — selftest | 810 علامة ✓ في مخرجات `verify` كاملة (31 وحدة؛ 782 بطريقة عدّ S2) | **826 علامة ✓ / 798 بمجموع «N checks passed» في 31 وحدة** — `s3r-verify.log` = `s3f-verify.log` (825 / 797 عند `af55e44`؛ `shipping.ts` 28 وحدها بعد تعديل الـspec) | `animations.ts` 23→34 (×11)، `render.ts` 60→64 (×4)، `characters.ts` 33→34 (×1) |
| `npm run lint` | 0 خطأ / 4 تحذيرات no-console سابقة | 0 خطأ / 4 تحذيرات no-console نفسها | لا خطأ جديد |
| `npm run typecheck` | ✓ | ✓ (`tsc -b --noEmit` داخل `verify`) | strict + `exactOptionalPropertyTypes` |
| `npm run build` — الميزانيات (مقاسة، DEC-017) | js 348KB gzip، الأصول 361/361 | **js 358KB gzip** (+10KB: الهيكل والطاقم)، css 7KB، الفن الأولي 251KB، الصوت 118KB، الفن والصوت 7902KB، الأصول **361/361** — `s3r-build.log` | الأحجام مطبوعة لا مفروضة («every budget met») |
| `check:cheats` | ✓ | ✓ «the bundle carries no test handle»، 10 خرائط مصدر أُزيلت | لا `VITE_E2E` ولا `__hct` في `dist` |
| `git diff --stat 2b0113b -- public data` | فارغ | فارغ (0 سطر) | لا ملف مُعاد توليده |
| E2E مسار DEC-009 (`PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium PLAYWRIGHT_EXTRA_ARGS=--disable-3d-apis PLAYWRIGHT_NO_CAPTURE=1`، خادم `webServer` الخاص على 5000، Pixi 8.21.0 محليًا؛ CI يثبّت 8.20.1 من القفل) | 76 ناجحًا / 0 / 12 متخطاة (S2) | **76 ناجحًا / 0 فاشل / 12 متخطاة في 2.3 دقيقة** (38 / 0 / 6 سطح المكتب، 38 / 0 / 6 هاتف) — `s3r-e2e.log` (بعد المراجعة) **و`s3f3-e2e.log` (الإقفال، 76 / 0 / 12 في 2.3 دقيقة)**؛ الشحنة الأولى `s3-e2e.log`: 76 / 0 / 12 في 2.5 دقيقة. **تشغيلان وسيطان عند الإقفال لم يكونا نظيفين ويُسجَّلان:** `s3f-e2e.log` 75 / **1** / 12 في 2.4 دقيقة — `manage.spec.ts:135` «the placement preview refuses a square that does not fit» (هاتف) سقط بـ`Execution context was destroyed` عند أول `roomRects` في `rooms.ts:39` (سباق تنقّل، خارج مسار الهيكل)، مرّ 3/3 عند إعادته منفردًا (`s3f-e2e-rerun.log`)؛ `s3f2-e2e.log` 75 / **2** / **11** في 3.5 دقيقة تحت حمل الآلة (متوسط الحمل ≈3 على 4 أنوية) — «characters are drawn» (سطح المكتب) سقط لأن `window.hct` لم يكن مركَّبًا بعد انتظار الاختبار الثابت 8ث (`game.spec.ts:258`؛ الإقلاع أبطأ من الانتظار الثابت)، و«the plot can be expanded» (هاتف) انتهت مهلته 45ث قبل بلوغ `test.skip` الخاص به (لذلك 11 متخطاة). «characters are drawn» مرّ **6/6** عند إعادته منفردًا على المشروعين (`s3f-e2e-rerun2.log`)، والدورة الكاملة التالية على آلة خاملة نظيفة (`s3f3`). لا `retries` في `playwright.config.ts`؛ الهشاشة في انتظار ثابت وسباق تنقّل سابقين لا في الهيكل | «characters are drawn» يؤكد `source === 'rig'` و`sheetReady` والقصّ؛ مجموعة التخطي = خط الأساس (12، بالاسم: `game.spec` «tapping a room opens its sheet…»، «the people are animated…» [`NO_3D`]، «the upgrades panel…»؛ `manage.spec` «the plot can be expanded…»، «a room can be moved…»، «everything done here survives a full reload»؛ × مشروعين) |
| مدد الاختبارات ذات النوافذ (مقرر القائمة، سطح المكتب / هاتف) | «characters are drawn» 9.0ث / 8.9ث؛ الوسيط 1.9ث (S2) | `s3r-e2e.log`: «the game boots» **924 / 871ms**، «a renderer initialises» 762 / 807ms، «the shift countdown ticks» 3.4 / 3.4ث، «guests appear» 1.8 / 1.9ث، **«characters are drawn» 8.9 / 8.9ث** (9.3 / 9.0 عند `af55e44`)، «the world is painted» 2.8 / 2.7ث. `s3f3-e2e.log` (الإقفال): 900 / 938ms، 765 / 754ms، 3.5 / 3.5ث، 1.8 / 1.8ث، **9.1 / 8.9ث**، 2.7 / 2.8ث | حدود `bootFresh` (20ث/30ث/2.5ث) لم تُمسّ |

فحوص التكافؤ التي يجب أن تبقى بايتًا ببايت — كلها تمر بعد كل تعديل: تكافؤ اللوحة (`render.ts` + `skyLow`)، تكافؤ الليل،
`DESIRE`، تربية `DecorView`، حلقة الشريط الأمامي، سطر `playOnce` على مسار الورقة، `clipOf(`/`assetGeneration()`/`framesFor(`،
مستمعو DOM؛ شُغّلت `render`/`assets`/`regressions`/`characters`/`animations`/`accessibility`/`shipping`/`data-coverage`
منفردةً بعد كل تعديل (`render` 64، `assets` 30، `regressions` 40، `characters` 34، `animations` 34، `accessibility` 19، `shipping` 28،
`data-coverage` 18 — `s3r-verify.log`) ثم السلسلة كاملة.

**كيف يُعدّ الفحص الذاتي:** كما في تقرير S2 §5 — مجموع أسطر «N checks passed» للوحدات الـ31، أو عدّ كل علامة ✓ في مخرجات
`verify` كاملة (810 على خط الأساس)؛ الطريقتان تُذكران معًا.

---

## 6. الدليل

### 6.1 لقطات مسار canvas — `docs/hc-p2-s3-shots/` (Chromium `--disable-3d-apis`، خادم Vite بـ`VITE_E2E=1`، Pixi 8.20.1، سكربتات `scratchpad/build/s3-*.mjs`)

كل صف يُسمّي **طبقته**. الإزاحة الزمنية في الصندوق 0 (UTC)؛ `epoch` كما في تقرير S2. كل لقطة: سطر الإقلاع `renderer: canvas`،
الشارة بعد `resetPerf()` وثانيتين ونصف، `stats()` و`characters()` مقروءة من الصفحة.

| الملف (`docs/hc-p2-s3-shots/`) | الطبقة | الرابط / السكربت | ما يجب أن يظهر | النتيجة (مقروءة من اللقطة والأعداد) |
|---|---|---|---|---|
| `room-reception-{full,lite}-{phone,desktop}.png` (+`-crop`) — 412×915@2x و1280×720، تكبير 2.022 | `full` عبر `?lite=0` / `lite` عبر `?lite=1` | `?stress=12&epoch=1789992000000&debug=1&lite=…`؛ `s3ev-shots.mjs` | الاستقبال: الموظفة خلف المكتب بقبعة pillbox، نزيل بحقيبة | ✓ الهاتف: s0 خلف المكتب رأسها وحده فوقه — قبعة pillbox حمراء، شعر داكن، حمرة، وزاوية اللوح تطلّ يسار المكتب؛ الجمجمة ≈110 بكسل جهاز = 55 css px → 55/2.022/0.82 ≈ 33px هيكل (0.54 × 60 = 32.4 ✓)؛ المنظِّفة s1 في التدبير فوقها ورأسها تحت شارة `?debug=1` التي تغطي جزءًا من الغرفة على الهاتف؛ **لا نزيل بحقيبة في اللوبي لحظة الالتقاط** (s0 وحدها في إطار الهاتف)؛ اللوبي 518×194 css px عند هذا التكبير. سطح المكتب (`-full-desktop`): الصف الأرضي كله — الموظفة (الرأس فقط)، نزيلة `guest.standard` (شعر بني طويل، قميص بنفسجي، **حقيبة** في اليد) تمشي يسارًا على الرصيف (g17 تغادر)، نزيل بحقيبة خامل بجوار placeholder «BED» في الاقتصادية r2، المنظِّفة بالممسحة (كعكة شعر)، الطاهي (طاقية) وجالس في المطعم فوق؛ الشكل الواقف ≈100 css px (60 × 0.82 × 2.022 = 99.5)، الرؤوس ≈54 css px عرضًا؛ الحد خط حبر ≈1px نظيف بلا أوجه مضلعة ظاهرة عند 2×. `rigStats` parts 636 = 12 × 53؛ الأبواب: باب غرفة نوم بحدّه **51 css px = 25.2px عالم** × ≈90 طولًا، مدخل اللوبي بإطاره **80 css px = 39.6px عالم**؛ الغرفة ذات الكتلة 259×194 css px (أرقام BL-043). التوأم `lite` متطابق بكسلًا (الخمول مُعيَّن على الشبكة في الطبقتين) |
| `room-bedroom-{full,lite}-{phone,desktop}.png` (+`-crop`، و`-full-desktop-r5-crop`) | `full` / `lite` | كما فوق | نائم: الرأس على الوسادة، اللحاف فوق فن السرير، Z | ✓ الهاتف: النائم g42 في المزدوجة r6 رأسه على وسادة بيضاء يسارًا، لحاف بنفسجي فاتح على الجسد بنتوء القدمين، وجه مغمض، فقاعة «Zz» تنجرف فوقه؛ اللحاف مرسوم **فوق** فن السرير الحقيقي (`room-bedroom-full-phone-crop.png`)؛ التوأم `lite` متطابق عدا طور انجراف Z. **✗ سطح المكتب (`-full-desktop-r5-crop.png`، قصّ 3×):** نائما r6 ونائم r7 يُرسمون صحيحًا أمام فن سريرهم، **لكن في الغرفة القياسية r5** (الثانية من اليسار، placeholder «BED» 116×68 css px) يُرسم النائم **تحت** الـplaceholder الشفاف للشريط الأمامي: الرأس وZz واللحاف تظهر شبحًا خلال الصندوق البرتقالي ولافتة «BED» فوق النائم؛ في إطارات فيديو المشية يُفرز نائم الاقتصادية r2 (الـplaceholder نفسه) **أمام** صندوقه — فترتيب العمق بين الهيكل الممدد وشريط `DecorView` الأمامي (`bandDepth` بـx/footY) ينقلب من غرفة إلى غرفة. **لم يُصلَح هنا؛ بند مفتوح ينتظر صف BL** (§7) |
| `room-gym-{full,lite}-{phone,desktop}.png` (+`-crop`) | `full` / `lite` | كما فوق | المدرّب بالدمبل | ✓ المدرّب s2: بنية عريضة، شعر قصير داكن، بشرة داكنة، قميص أخضر، سروال داكن، **الدمبل ممسوك منخفضًا عند الورك الأيمن (أداة الخمول)**، واقف عند سلالم الحائط في طرف الصالة الأيمن (آخر غرفة في الفندق). **لم يدخل s2 مقطع `work` خلال انتظار الـ20ث المحدود في أيٍّ من اللقطات الأربع** (لا نزيل في الصالة) فالدمبل لا يظهر مرفوعًا — الوضع المرفوع يُرى في عمود `work` من لوحة الطاقم فقط. قصّ الهاتف مقصوص عند حافته اليمنى (المدرّب عند sx 390 من 412). **القياس اليدوي** من `-full-phone-crop` (بكسل جهاز @2، حبر < 60/70/90): الشكل y43→261 = **219** (المتوقع 53.1×2.022×2 = 214.8 + حدّان)، الرأس إلى حد الذقن **116 → 53.0%**؛ parts 742 = 14 × 53؛ التوأمان `lite` متطابقان بكسلًا |
| `room-restaurant-{full,lite}-{phone,desktop}.png` (+`-crop`، `-full-desktop-sit-crop`) | `full` / `lite` | كما فوق | جالس على مقعد المطعم (`sit`: هبوط 5px والقدمان للأمام) | ✓ **بديل عن «البار»**: مزيج `?stress=12` (اقتصادية، قياسية، مزدوجة، عائلية، فاخرة، مقهى، صالة، مطعم) لا يبني بارًا فلا ساقي فيه؛ الساقي بالكوب في لوحة الطاقم فقط. الطاهي s3 (`work`): طاقية، سترة بيضاء، **صينية** عليها كوب ممدودة في اليد اليسرى، ساقان في منتصف الخطوة، حمرة وابتسامة؛ الجمجمة ≈105 بكسل جهاز (52 css px) → ≈31.6px هيكل. النزيلة الجالسة g33 على الطاولة (`-full-desktop-sit-crop.png`، 3×): `sit` يُقرأ انحناء ركبة خفيفًا مع الحقيبة في اليد وحدّ placeholder «SEAT» خلفها (معتم، مفروز أمام الـplaceholder هنا). التوأمان `lite` متطابقان بكسلًا |
| `walk-full.webm` (1280×720 @1، **19.3ث** — تسجيل السياق كله؛ لا ffmpeg للقصّ) + `walk-full-frame-10.5s.png`/`-crop.png`، `walk-full-frame-10.9s-crop.png` (مستخرجة داخل المتصفح) | `full` عبر `?lite=0` | `s3ev-video.mjs`؛ `walk-videos.log` | تكبير 2.022 مؤطَّر على باب اللوبي والرصيف يمينه، نزيل يصل: الإيقاع بالمسافة، تأخر الرأس، الانضغاط | ✓ الإقلاع والتأطير 0–4.2ث؛ النزيلة الواصلة g45 (`guest.standard`، حقيبة) تدخل من اليمين عند 10.3ث (sx 1255)، تبلغ الباب ≈11.3ث (sx 33)، تقف في الاستقبال 11.8–13.3ث، تمشي إلى غرفتها 13.8–14.3ث وتنام من 14.8ث (عيّنات كل 0.5ث في السجل، حتى 18.4ث). سرعة الرصيف ≈590px عالم/ث (`speedToArrive` في الجسر، سابق) → ≈1190 css px/ث عند 2× فالمشية على الرصيف ≈1ث؛ الإطارات المفردة تُظهر فتحة ساقين واضحة في منتصف الخطوة والحقيبة تتأرجح؛ **إيقاع الخطوة وتأخر الرأس لا يُحلّان من تسجيل 25 إطارًا/ث بهذه السرعة**. الشارة أثناء المقطع «fps 60 · p5 60» عند 13 شخصًا (رقم مسار Canvas2D البرمجي لا هاتف)؛ الانزلاق من الجدول 57.3px/خطوة عند 128 (`walkSlidePx`) |
| `walk-lite.webm` (**15.9ث**) + `walk-lite-frame-11.0s-crop.png` | `lite` عبر `?lite=1` | كما فوق | الشكل المُكمَّم على 8 إطارات المشي | ✓ g45 تدخل عند 10.7ث وتسلك المسار الحتمي نفسه (البذرة وepoch نفسهما)؛ وضع مُكمَّم على شبكة المقطع بالأشكال والألوان نفسها؛ الشارة «fps 60 · p5 30» أثناء المقطع؛ **لا يُميَّز عن `full` في الإطارات المفردة** |
| `walk-stride64.webm` (**19.6ث**) + `walk-stride64-frame-11.1s{,-crop}.png` | `full`، `STRIDE_PX 64` (نسخة خدش من الشجرة في `scratchpad/stride64/` مع `node_modules` مربوطة، خارج المستودع؛ ثابت الشجرة مُتحقَّق 128 بـgrep) | خادم ثانٍ :5231 | المرشح الثاني لـ:65 (≈25px انزلاق) | ✓ ممكن بلا مسّ الشجرة؛ g45 تدخل عند 10.5ث بالمسار نفسه؛ الإيقاع 9.2 دورة/ث عند 590px/ث مقابل 4.6 عند 128 — **كلاهما فوق ما يحلّه فيديو 25 إطارًا/ث**، فعلى المالك مقارنة المقطعين في مشغّل أو على جهاز لا في الإطارات الثابتة (التي تُظهر وضع منتصف الخطوة نفسه)؛ القرار للمالك (§9) |
| `rig-vs-sheet.png` (424×2612) و`cast-walk-0.25{,-tall}{,-grid}.png` | لوحة ثابتة (`full`) | `hct.castSheet({clip:'walk', phase:0.25, scale:2})` عند 1280×720 @2 بجوار إطار المشي 2 (φ0.25) لكل عضو مقصوصًا من `docs/art-preview/cast.png` (خلايا المعاينة zoom-3 عند x=10+7·152+4، y=10+row·244، 144×216 مكبَّرة ×4/3)؛ `s3ev-composite.mjs` | فرق الرأس 54% / 47% | ✓ من صندوق الحبر (بكسل جهاز): شكل الهيكل 231–267 طولًا مع الشعر/القبعة، عرض الرأس 126–155 → رأس/شكل ≈ **0.53–0.56** (جمجمة 130 على جسد 240 بلا قبعة = 54%)؛ شكل الورقة 170–194، الرأس 78–98 → ≈ **0.43–0.46** (الجدول: 47%، `gen_chars.py` 0.235). اللوحة والشعر والقبعات والأدوات نفسها؛ رؤوس الهيكل أكبر بوضوح لكل الأعضاء التسعة وفتحة الساقين في المشي أعرض؛ إطارات الورقة تحمل ظلًا ناعمًا والهيكل قطعًا ناقصًا مسطحًا. عند 1280×720 لا تتسع إلا الصفوف 0–4 (9 × 144 css px = 1296) ويغطي شريط HUD والشارة الصفين 0–1؛ النسخة `-tall` (600×1400، HUD مخفي بـCSS) تحمل أوضاع المشي φ0.25 التسعة كلها: ساقان مفتوحتان، تأرجح ذراع، الأدوات محمولة (لوح، ممسحة، دمبل، صينية، كوب، فشار، صافرة، حقيبة، لوح) |
| **`cast-sheet-2560-clean-grid.png`** (2560×1440 @2 → 1057×1297 css) — **صورة ART CHECK** | لوحة ثابتة، `full` | `hct.castSheet({ scale: 2 })`، HUD مخفي بـCSS؛ `s3ev-composite.mjs` | 9 صفوف × 11 خلية (idle، walk φ 0/¼/½/¾، work، sleep، sit، happy، angry، scared) | ✓ 99 خلية كلها ظاهرة: صور الشعر، القبعات، مجموعات العيون الثلاث، الأفواه، الحاجبان المتقاطعان للغضب، اليدان المرفوعتان للخوف، النائم الممدد بـZz؛ **الخلفية سماء الليل والمدينة** (الفندق مغلق عند الإقلاع فالليل مثبَّت — DEC-018؛ محاولة نهارية بقيت ليلًا لأن الفتح يحتاج دفع وردية، حُذفت). `cast-sheet-1280.png` (الصفوف 0–4 فقط) و`cast-sheet-2560.png` بالـHUD (يغطي الصفين 0 و8): للسجل لا للفحص. الشارة أثناء لوحة الـ99 هيكلًا عند 2560×1440 @2: **fps 5 · p5 10** على مسار canvas — أداة مراجعة لا مسار لعب |
| `reduced-a.png` / `reduced-b.png` (+`reduced-still.png`) و`motion-a/b.png` (تحكم) | `full` + `reducedMotion: 'reduce'` | إطاران بفاصل 722ms؛ `s3ev-reduced2.mjs`، `reduced-and-perf.log` | وضع متطابق، `sx` مختلف | `sx` 1047→168 (x 543→109) ✓. الفرق الخام للقصّ **43% بكسلات / 19% حبر** لأن الخلفية تتغير (باب «B» ثم جدار) — **ليس ≈ 0**؛ ما يخصّ الوضع: مدى الحبر صفًا صفًا داخل عمود الشكل (x 60–175، الصفوف 39–241) **100/203 متطابق بالبكسل و85 ضمن 1px** (الموضع الكسري يزيح الحد المنعَّم بكسلًا) = 185/203 ≤ 1px؛ زوج التحكم بالحركة الكاملة 23/260. بالعين: الوضع نفسه. برهان الهوية الحاسم: `rig.test.ts` + «reduced motion freezes the pose and keeps the transit» |
| `e2e-crop-numbers.json`، `room-shots.json`، `perf-sandbox.json`، `perf-sandbox-sheet-baseline.json`، `walk-videos.log`، `reduced-and-perf.log` | — | `s3ev-e2ecrop.mjs`، `s3ev-shots.mjs`، `s3ev-perf.mjs` | الأعداد التي تقرؤها الجداول | كتلة `measure` في `room-shots.json` **غير صالحة** (تقيس صندوق القصّ: القاع 251/125 دومًا، نسبة 0.15–0.44) وتُهمل؛ بقية الحقول (`tier`، `rig`، `query`) صالحة. `e2e-crop-numbers.json` (قصّ الاختبار نفسه `cropAt` 40×52 css فوق القدمين، مسار canvas): مسار الإقلاع (`bootFresh` → فتح الفندق → ساعات → 8ث) على العرضين: سطح المكتب s1 **244 لونًا / 3.5% حبر** (الأفضل)، s0 خلف المكتب 315 / 0.0%؛ الهاتف s1 **354 / 3.9%**، s0 446 / 0.1% — العتبتان (≥ 10، ≥ 2%) تمرّان على أفضل شخص بهامش حبر 1.5–1.9 نقطة (الإقلاع يقرأ `tier: lite` لأن خلفية canvas تفرض `lite`). `?stress=12` ظهرًا على الهاتف `lite`/`full`: الأفضل s3 **89 لونًا / 13.1%**، النائمون 305–377 / 6.4–9.3%، g44 الماشي 345–366 / 9.3–10.2%. **ملاحظة**: شخصان (g33 عند sx −44، s3 عند sx −8) أُبلغ عنهما `visible: true` وهما خارج الشاشة (عرض القصّ ≤ 24 أو سالب → 0 لون): هامش القصّ الجانبي يعدّ من هم خارج الشاشة مرئيين — لا يؤثر في الاختبار (يختار الأكثر حبرًا) لكنه يُسجَّل |
| `s3ev-webgl-live-full.log` / `-lite.log` | SwiftShader WebGL (المسار الافتراضي بلا `--disable-3d-apis`) على خادم `vite --force` (:5232؛ خادما 5230/5199 كانا يقدّمان قطعة `WebGLRenderer` بـ504 «Outdated Optimize Dep») | `s3ev-webgl-live.mjs` | ملاحظة بيئة BL-020؛ قراءة داخلية لقصّ هيكل إن رُسم قبل التجمد | **لم يُرسم شيء**: يقلع «webgl, resolution 2x» ثم «Could not retrieve shader source (WebGL context may be lost)» ×n، «Could not initialize shader»؛ لا قصّ ولا حقيقة تعرّج على WebGL في هذا الصندوق — `?aa=0/1` على الجهاز (BL-044). القراءة عند t≈1.6→9.6ث لا عند t≈25ث كما خططت الخطة: في إحدى المحاولات الثلاث تعلّق الخيط الرئيسي للصفحة من t≈1ث لمدة 42ث (كل `evaluate` انتهت مهلته) — نافذة الـ33ث ليست موثوقة هنا |

### 6.2 أرقام الصندوق — تُسمّى أرقام صندوق (**ليست** قياس هاتف؛ لا تُقارن بحد p5 ≥ 55)

`window.hct.perf()` و`window.hct.rigStats()` عند `?stress=60&warm=900&debug=1&epoch=<ظهر>` بعد `resetPerf()` ثم 10ث؛ السكربت
`scratchpad/build/s3ev-perf.mjs`، السجلات `s3ev-chain5.log` (الهيكل، بعد المراجعة) و`s3ev-chain4.log` (خط أساس الأوراق) → `perf-sandbox.json`
و`perf-sandbox-sheet-baseline.json`. خط الأساس تصدير `2b0113b` (`git archive`) على خادم Vite ثانٍ بـ`VITE_E2E=1` **في اليوم نفسه** وعلى الآلة
نفسها. التشغيل الأول (`s3ev-chain2.log`، قبل المراجعة) بين قوسين:

| المسار | الطبقة | العرض | fps متوسط | p5 | إطارات متأخرة | ذاكرة | ناس مرسومون / الكل | `rigStats().parts` | `rebuilds` / `viewUpdates` (إطارات في 10ث) |
|---|---|---|---|---|---|---|---|---|---|
| Canvas2D، بلا GPU | `lite` (ما يرسمه CI) | 412×915@2x | 49.5 (52.8) | **29.9** (30.0) | 20.4% (13.6%) | 39MB | 37 / 61 | 3233 | 15 / 36 |
| Canvas2D، بلا GPU | `full` (`?lite=0`) | 412×915@2x | 50.6 (51.8) | **29.9** (29.9) | 18.3% (15.8%) | 44MB | 37 / 61 | 3233 | 16 / 36 |
| Canvas2D، بلا GPU | `lite` | 1280×720 | 37.7 (40.2) | 29.9 | 57.9% (48.6%) | 52MB | 61 / 61 | 3233 | 15 / 100 |
| Canvas2D، بلا GPU | `full` | 1280×720 | 37.9 (39.2) | 29.9 | 56.7% (52.7%) | 42MB | 61 / 61 | 3233 | 15 / 100 |
| Canvas2D، بلا GPU | **خط أساس الأوراق (S2، `2b0113b`) في اليوم نفسه** | 412×915@2x | **59.7** | **59.5** | 0.2% | 33MB | 37 / 61 | — | — |
| Canvas2D، بلا GPU | خط أساس الأوراق في اليوم نفسه | 1280×720 | **59.9** | **59.9** | 0.2% | 39MB | 61 / 61 | — | — |
| SwiftShader WebGL (المسار الافتراضي) | `full` | 412×915@2x | **لم تُقرأ كلفة حقيقية** | — | — | 55MB | 36 / 59 | 3127 | 15 / — |
| SwiftShader WebGL | `lite` | 412×915@2x | **لم تُقرأ كلفة حقيقية** | — | — | 63MB | 36 / 59 | 3127 | 15 / — |

**صفّا WebGL:** السجلان `s3ev-webgl-live-full.log`/`-lite.log` يبدآن بـ«PixiJS Error: Could not retrieve shader source (WebGL context may be
lost)» ×n و«Could not initialize shader» و«gl.getProgramInfoLog() null»، ثم تدور حلقة الإطارات **بلا رسم** (59.9 fps، p5 59.9، late 0.2%) —
فالرقم رقم حلقة فارغة لا كلفة حزم رؤوس، ولا يُعرض هنا رقمًا. للسجل فقط (كلفة JavaScript لوضع وحزم 59 شخصًا — 36 مرئيًا، 5 يمشون — بلا رسم،
نافذة 8ث من t 1.6→9.6ث): `full` 59.9 متوسط / p5 59.9 / أدنى 29.9 / أسوأ إطار 33.4ms / متأخرة 0.2% (1/480) / 55MB؛ `lite` 60.0 / 59.9 / 59.5 / 16.8ms / 0%
(0/481) / 63MB؛ `parts` 3180→3127، `rebuilds` 15 في الطبقتين. `isBatchable` لكل context **لم يُقرأ** (لا صفحة تطوير مُجهَّزة بُنيت).
محاولتا `s3ev-perf.mjs webgl` الأوليان انتهت مهلتهما (`reduced-and-perf.log`). هذا بند بيئة (BL-020).

**العدّادان:** `rebuilds` = إطارات بدأت و`structureDidChange` مرفوع (تبديل `visible`/`renderable`: القصّ عند حركة الكاميرا والناس، إضافة ابن) —
15–16 في 600 إطار على الطبقتين. `viewUpdates` = إطارات بدأت وفي `childrenRenderablesToUpdate` تحديث عرض (إسناد context، `clear()`+رسم
للفقاعة/حلقة السحب، تغيير نسيج) — 36 على الهاتف و100 على سطح المكتب (61 شخصًا مرئيًا: كل لقطة تغيّر `cheapKey` أحدهم فتُعاد فقاعته)؛
**لا يُعدّ العدّادان كلفة الهيكل** بل يثبتان أن الحشد المتحرك لا يعيد بناء التعليمات ولا يبدّل contexts كل إطار (٪ الإطارات ≤ 17% على سطح
المكتب رغم 61 شخصًا × 53 جزءًا يتحركون).

مدد اختبارات E2E ذات النوافذ: **«characters are drawn» 8.9ث / 8.9ث، «the world is painted» 2.8ث / 2.7ث، «the game boots» 0.9ث / 0.9ث (`s3r-e2e.log`)**. أرقام القصّ التي يقيسها اختبار «characters are drawn» (لا يطبعها إلا عند
الفشل؛ أُعيد قياسها بالسكربت نفسه في `e2e-crop-numbers.json`): سطح المكتب s1 **244 لونًا متميزًا / 3.5% حبر**، الهاتف s1 **354 / 3.9%** مقابل
العتبتين 10 / 2%.

**القراءة (بصدق):** على Canvas2D بلا GPU يكلّف الهيكل الحي **p5 30 مقابل 59.5** للأوراق في التشغيل نفسه، والإطارات المتأخرة ×5–40 (0.2% → 18–58%)،
و**`lite` ≈ `full`** (فرق داخل ضجيج الصندوق: 49.5/50.6 و37.7/37.9) — الطبقة تختلف في JavaScript (نوابض، تكميم، تخطي `apply()`) لا في عمليات
المسار: Canvas2D يرسم 53 مسارًا لكل شخص مرئي كل إطار أيًّا كان المفتاح (`CanvasGraphicsAdaptor`)، فالمكسب المتاح على هذا المسار هو خزن
الهيكل نسيجًا (BL-046، مرفوض في S3 بـDEC-019) أو تقليل المسارات. الذاكرة +6–13MB. هذه **أرقام صندوق** لا هاتف؛ ما يقوله WebGL/WebGPU على
جهاز حقيقي — حيث الهيكل حزمة رؤوس واحدة لا 53 مسارًا — مجهول حتى قراءة الهاتف (§6.3)، وهي الحكم على p5 ≥ 55.

### 6.3 لماذا `IMPLEMENTED` وليس `VERIFIED`

ما تعد به هذه الخطوة أن يراه اللاعب — شخصية تمشي بخطوة تتبع المسافة ورأس يتأخر وانضغاط عند التماس — يُرى في لقطات
وفيديو مسار canvas في §6.1 بطبقة `full` عبر `?lite=0`. لكن مسار canvas يثبت أن Pixi يرسم الهيكل على Canvas2D **في صندوق بلا
معالج رسوم** بحواف ناعمة؛ لا يثبت شكل الحواف المتعرجة على WebGL/WebGPU (`antialias:false`) ولا وميضها، ولا أن الصورة على
شاشة هاتف حقيقي مقبولة عند عين المالك، ولا أن p5 ≥ 55fps عند 60 غرفة ونحو 60 شخصًا بالهيكل الحي. المحاولة على WebGL البرمجي
(SwiftShader) تعطي قراءة CPU داخل نافذة التجمد (BL-020) ولا تُعرض دليلًا. الطريق الوحيد إلى `VERIFIED` هو إجراء
`docs/MOBILE-DEVELOPMENT.md` على هاتف مع طراز الجهاز ومعرّف البناء، بالقراءات الثلاث (`?lite=0/1` و`?aa=1`) و`hct.rigStats()`
(DEC-005/DEC-009).

---

## 7. ما لم يُنفذ — سُجّل ولم يُلمس (§7)

| المعرّف | البند | الحالة |
|---|---|---|
| BL-043 | تجربة `CHARACTER_ART_SCALE` 0.85–0.95 بعد قياس S3 للسرير والأبواب والمسار معًا (HC-VIS-001 :23) — الأرقام في وثيقة القرار §4 | جديد، متوسطة — ينتظر المالك (§9) |
| BL-044 | قياس `antialias`/MSAA على الجهاز عبر `?aa=1`؛ الحواف المتعرجة ووميض الحواف عند الخمول | جديد، متوسطة — قراءة هاتف |
| BL-045 | تقاعد الأوراق الـ18 وصور مصغرة من الهيكل | جديد، منخفضة — توقيع مستقل (S9 أو ضمن S8) |
| BL-046 | خزن الهيكل نسيجًا (`cacheAsTexture`) على مسار canvas — مرفوض في S3 (DEC-019) | جديد، منخفضة — لا يُقترح إلا باستثناء مؤرخ |
| BL-036 | المصعد داخل اللوبي | مجدول HC-P2-S5 |
| BL-039 / BL-040 / BL-042 | كما سُجّلت في S2 | `BACKLOG` |
| **BL-047** | **ترتيب عمق النائم مقابل placeholder الشريط الأمامي**: في الغرفة القياسية r5 يُرسم الهيكل الممدد تحت صندوق «BED» الشفاف ولافتته فوقه، وفي الاقتصادية r2 أمامه (`room-bedroom-full-desktop-r5-crop.png` مقابل إطارات `walk-full.webm`) — فرز `bandDepth` بـx/footY ينقلب بين الغرف؛ لا يظهر مع فن السرير الحقيقي (r6/r7) | وُجد في دليل S3 (§6.1)، **لم يُصلَح**؛ يحتاج صف BL عند الإيداع (لم يُرقَّم في هذا التقرير حتى لا يُخترع رقم) |
| **BL-048** | **تسرّب وضع المزج على Canvas2D بعد دفعة الضوء `add`**: `CanvasBatchAdaptor.mjs:42` يضبط blend في مكانه و`CanvasGraphicsAdaptor.mjs:196` داخل `save()/restore()`، و`CanvasContextSystem.setBlendMode` يخزّن آخر وضع مطلوب فقط، فأول Graphics بعد `layers.overlays` يُرسم بـ`lighter` (Pixi 8.21.0 محليًا، الكود نفسه في 8.20.1). في اللعب لا شيء يُرسم بعد الأضواء فالعالم سليم؛ `showCastSheet` تخفي `overlays` ما دامت اللوحة مركّبة (§4.10 #36) | وُجد في مرحلة الرسم؛ التفاف موضعي في أداة المراجعة فقط؛ يحتاج صف BL عند الإيداع (يتعلق بأي رسم مستقبلي فوق `overlays`: S4 الجسيمات) |
| **BL-049** | هامش القصّ يعدّ من هم خارج الشاشة مرئيين (`visible: true` عند sx −44/−8، `e2e-crop-numbers.json`) | ثانوي؛ لا أثر على الاختبار ولا على الرسم (القصّ الحقيقي في العارض يخفيهم)؛ يُسجَّل للتشخيص |

خارج النطاق أيضًا: الجسيمات (S4)، parallax وحياة الشارع (S6)، الحوادث الحية (S7)، رافعة الجودة (S8)، BL-023، BL-034،
ART-REFRESH (HC-VIS-001 بوابة 1).

---

## 8. مطابقة التنفيذ ↔ المرجع

| بند بوابة P2 / شرط قبول | الحالة | الدليل |
|---|---|---|
| الشخصيات هيكل حي يُوضَع كل إطار؛ الخطوة بالمسافة (128px = دورة)؛ الواقف طوره مجمَّد | ✓ | `rig.test.ts`، `animations.ts` «distance-driven stride»؛ `walk-full.webm` |
| رأس 54% (:22)؛ أعلى نقطة ≤ 70 وأعرض نصف مدى ≤ 24 لكل عضو × مقطع × طور | ✓ «head 54% bare» ×9؛ الأعلى 67.35 (chef/happy)، الأعرض 23.32 (lifeguard/idle) — §4.1 | `animations.ts` (الجدول المطبوع لكل عضو)، `rig.test.ts` |
| برهان المدى: الورك الاسمي ≤ الرجل − 0.001 وأقصى مسافة على الدورة ≤ الاسمي | ✓ («the drawn position never passes the end of a leg»، «the stance foot is planted, the leg always reaches…») | `rig.test.ts` |
| الرأس يركب الرقبة المضغوطة (≤ 1e-6)؛ قطر الرأس ثابت (:66) | ✓ | `rig.test.ts` |
| تنفس الوقوف/الجلوس/النوم على شبكة إطارات المقطع في الطبقتين | ✓ (`GRID_CLIPS` = {idle, sit, sleep}؛ idle bob 0.55 p-p) | `rig.test.ts` |
| تقليل الحركة: φ = 0، t = 0 حرفيًا، لا قراءة لحالة الهيكل، بذرتان → وضع متطابق؛ الموضع يسير | ✓ في الاختبارات؛ اللقطتان تؤكدان `sx` يسير والوضع نفسه بالعين ومدى الحبر 185/203 ≤ 1px (**ليس ≈ 0** خامًا: الخلفية تتغير) | `rig.test.ts`، `animations.ts`، `reduced-a/b.png` |
| هوية الطاقم مطابقة لـ`characters.py`/`hcstyle.P` حقلًا حقلًا ولونًا لونًا؛ `shade` نحو (10,20,44) | ✓ 9 × 15 حقلًا + كل لون بالهكس | `render.ts` ×4 |
| `apply()` مواضع/دوران/مقياس/ألفا فقط؛ `new GraphicsContext(` مرة واحدة؛ `batchMode 'batch'`؛ لا `cacheAsTexture`/RenderTexture | ✓ | `animations.ts` (فحص نصي) |
| مسار الورقة بايتًا ببايت (`playOnce` line)، `clipOf`/`assetGeneration`/`framesFor`/`lookFor` | ✓ | `animations.ts`، `assets.ts` |
| كل شخص مرسوم بالهيكل والأوراق وصلت؛ الهيكل يرسم بكسلات على مسار CI | ✓ (244 / 354 لونًا، 3.5% / 3.9% حبر) | `game.spec.ts` «characters are drawn» (`source === 'rig'`، `sheetReady`، القصّ) |
| الأوراق الـ18 بلا تغيير؛ فحوصها الأربعون تمر | ✓ («18 sheets, worst drift 0px»، «3744 colour-in-frame checks across 18 sheets»؛ `assets.ts` 30، `characters.ts` 34) | `assets.ts`، `animations.ts:196-360`، `characters.ts` |
| لا `Math.random` ولا DOM عند الاستيراد في `rig`/`cast`/`quality` | ✓ («8 pure modules, 26 render files») | `animations.ts` فحص النقاء |
| لا تغيير في النواة أو الجسر أو الحفظ؛ لا ملف في `public/` (DEC-017) | ✓ (§2) | `git diff --stat` |
| **الأداء p5 ≥ 55fps عند 60 غرفة ونحو 60 شخصًا بالهيكل الحي** | ⚠️ | يحتاج هاتفًا (§6.3)؛ أرقام الصندوق في §6.2 لا تُقارن به |
| **مراجعة بصرية على جهاز حقيقي** (التعرّج ووميض الحواف عند `?aa=0/1`) | ⚠️ | DEC-005/DEC-009: على المالك بعد النشر (BL-044) |

### ART CHECK

- **هل رُسم فن جديد بيد Fable؟** لا ملف. الهيكل نقل حرفي لأشكال `hcstyle.py` بأرقامها؛ لا placeholder، ولا أصل من خارج
  المستودع، ولا صورة مُعاد توليدها (`git diff --stat 2b0113b -- public data` = 0 سطر).
- **المرجع المعتمد مقابل لوحة الطاقم من الهيكل (`cast-sheet-2560-clean-grid.png`) ولقطات تكبير الغرفة:** ما يُرى: رؤوس كبيرة تقارب
  الجذع (≈ 53% من البكسل)، حدود سوداء بعروض hcstyle على كل جزء، باستيل الثياب من `hcstyle.P` (المرجان، الأزرق، الأخضر، الأبيض، الكحلي،
  البنفسجي، الأحمر، الليلكي، الرمادي)، الأدوات تُقرأ عند 2.0× (ممسحة، دمبل، صينية، كوب، فشار، صافرة، حقيبة، لوح)، النائم رأسه على الوسادة
  واللحاف بلون قميصه، الأفواه الخمسة والعيون الثلاث تُقرأ في الخلايا الصغيرة. **مقابل الأوراق (المرجع المرسوم نفسه، `rig-vs-sheet.png`):**
  اللوحة والشعر والقبعات والأدوات نفسها؛ رأس/شكل من البكسل 0.53–0.56 للهيكل مقابل 0.43–0.46 للأوراق — الرؤوس أكبر بوضوح وفتحة الساقين
  في المشي أعرض؛ الورقة تحمل ظلًا ناعمًا والهيكل قطعًا ناقصًا مسطحًا. **ما لا يطابق بعد (بصدق):** خلفية اللوحة ليل لا نهار كالمرجع (الفندق
  مغلق عند الإقلاع)؛ نائم r5 يُرسم تحت placeholder «BED» (§6.1، بند مفتوح)؛ وضع `work` للمدرّب (الدمبل مرفوعًا) لم يُر في المشهد بل في
  اللوحة فقط؛ `sit` يُقرأ انحناء ركبة خفيفًا لا جلوسًا على مقعد مرسوم؛ لا لقطة بار؛ ولا جسيمات ولا مصعد ولا عمق (S4–S6)، والأوراق ما زالت
  في `public/` (BL-045). الحواف: ناعمة في كل لقطة لأن Canvas2D ينعّم — شكلها على WebGL/WebGPU بلا `antialias` غير مقيس (BL-044).
- **HC-VIS-001 :23 (المقياس):** من اللقطات عند 2.022× (0.398 ملاءمة × 1.1^17): النزيل 203 بكسل جهاز @2 = 101.5 css px (49.2px عالم)، المدرّب
  219 = 109.5 css px؛ باب غرفة النوم 51 css px (25.2px عالم) × ≈90 طولًا، مدخل اللوبي بإطاره 80 css px (39.6px عالم)؛ اللوبي 518×194 css px،
  غرفة الكتلة الواحدة 259×194؛ صندوق placeholder «BED» 116×68 css px؛ **فن السرير الحقيقي (r6/r7) لم يُقَس بالبكسل**. النزيل يساوي بابي
  غرفة نوم عرضًا و1.27× المدخل؛ القرار للمالك (§9).
- **:65 (الانزلاق):** المحسوب من الجدول (`walkSlidePx`) 57.3px/خطوة عند 128 و25.3 عند 64 للنزيل (56.8–57.8 / 24.8–25.8 للطاقم)؛
  الفيديوان يُظهران المرشحين (`walk-full.webm` / `walk-stride64.webm`)؛ لم يُقَس الانزلاق من إطارات الفيديو نفسها؛ القرار للمالك.
- **هل احتُرمت لغة ART-0 §11؟** بملاحظة مؤرخة لا بصمت (وثيقة القرار §5)؛ السعات المقيدة من الفحص الذاتي: idle bob 0.55 p-p ≤ 0.6،
  أسوأ تأخر رأس 1.44 ≤ 2.5، squash ∈ [0.945, 1.018]، القفزة ≤ 2.0 («secondary motion stays inside the bounds DEC-020 signs»).

---

## 9. سطور نهاية الجلسة (§16)

1. **المرحلة والخطوة:** HC-P2 «جعل الفندق حيًا بصريًا» — الخطوة HC-P2-S3 «الهيكل الحي». P1 ما زالت `IN_PROGRESS` (BL-034).
2. **ما أصبح `VERIFIED`:** لا شيء جديد. ما يمكن إثباته في صندوق بلا GPU أُثبت — الرياضيات والحدود والتكافؤ ورسم Pixi على
   Canvas2D ولقطات المسار بطبقتيه — لكن أيًّا منها ليس عين المالك ولا قياس هاتف.
3. **ما بقي `IMPLEMENTED` فقط:** HC-P2-S3 كلها. `npm run verify`: vitest 130 (7 ملفات)، selftest 826 ✓ / 798 في 31 وحدة، lint 0 خطأ؛
   `npm run build`: js 358KB gzip، الأصول 361/361، `check:cheats` نظيف (كلها مؤكَّدة بتشغيل الإقفال `s3f-*.log`)؛ E2E مسار DEC-009: 76 ناجحًا /
   0 فاشل / 12 متخطاة في 2.3 دقيقة (`s3r` و`s3f3`)، مع تشغيلين وسيطين غير نظيفين مسجَّلين في §5 (سباق تنقّل في `manage.spec`، وسقوط
   «characters are drawn» مرة تحت حمل الآلة لأن الإقلاع تجاوز انتظار الاختبار الثابت 8ث — مرّ 6/6 منفردًا). أرقام الصندوق (§6.2): p5 30 للهيكل
   مقابل 59.5 للأوراق على Canvas2D بلا GPU، `lite` ≈ `full` — الهاتف هو الحكم.
4. **ما ينتظر المالك:**
   - **مقياس العرض (BL-043، :23):** بعد رؤية لقطات تكبير الغرفة (شكل 49.2px = 51% من الداخل؛ من البكسل: النزيل 101.5 css px عند 2.022×،
     باب غرفة النوم 51 css px ومدخل اللوبي 80) — هل تجرّب 0.85 (51.0px) أو 0.95 (57.0px) أم يبقى 0.82؟
   - **الانزلاق (:65):** فيديو المشية يعرض `STRIDE_PX` 128 (انزلاق ≈57px/خطوة، 4.6 دورة/ث على الرصيف، `walk-full.webm`) و64 (≈25px،
     9.2 دورة/ث، `walk-stride64.webm`) — الإيقاعان فوق ما يحلّه فيديو 25 إطارًا/ث، فالمقارنة في مشغّل أو على جهاز — أيهما تعتمد؟
   - **بندان مفتوحان بلا رقم (§7):** نائم الغرفة القياسية r5 يُرسم تحت placeholder «BED» (فرز العمق ينقلب بين الغرف)، وتسرّب وضع المزج
     `lighter` على Canvas2D بعد دفعة الضوء (يُخفى في أداة اللوحة فقط) — هل يُفتح لهما صفا BL عند الإيداع، وبأي أولوية؟
   - **كلفة Canvas2D (§6.2):** على المسار بلا GPU p5 30 للهيكل مقابل 59.5 للأوراق؛ إن أكّد الهاتف هبوطًا مشابهًا على WebGL، هل يُفتح BL-046
     (خزن الهيكل نسيجًا باستثناء مؤرخ على DEC-019) أم يُقبل الهبوط على الأجهزة الضعيفة بطبقة `lite`؟
   - **الحواف على الهاتف (BL-044):** عند قراءة الهاتف قارن `?aa=0` و`?aa=1` وقل أيهما تعتمد وهل تلاحظ وميضًا عند المشي أو الخمول.
   - **مصير الأوراق (BL-045):** تقاعد الأوراق وصور مصغرة من الهيكل خطوة S9 مستقلة أم تُضم إلى S8؟
   - **ترتيب السلّم بعد S3:** S4 الجسيمات → S5 المصعد → S6 العمق وحذف النموذج → S7 الحوادث والطقس → S8 رافعة الجودة وقياس
     الهاتف — تأكيد صريح (سؤال تقرير S2 ما زال مفتوحًا).
   - **قراءة الهاتف:** `docs/MOBILE-DEVELOPMENT.md` مع `?stress=60&warm=900&debug=1` ثم `&lite=1` ثم `&aa=1` مع
     `window.hct.perf()` و`window.hct.rigStats()` — من يجريها ومتى؛ هي الطريق الوحيد من `IMPLEMENTED` إلى `VERIFIED`.
5. **الخطوة التالية الوحيدة:** HC-P2-S4 — الجسيمات والدخل العائم وفقاعات one-shot (نطاق «S2» القديم)، صالحة لـCanvas2D
   (DEC-019). لا تُنفَّذ تلقائيًا، وتبدأ بوثيقة قرار (DEC-021).
