# مواصفة الأصول الفنية

**263 ملفاً إجمالاً، منها 72 مطلوبة للإطلاق.**

ضع كل ملف في `assets/<المسار>`. اللعبة تعمل الآن بأشكال بديلة، وكل ملف تضيفه
يحلّ محل شكله البديل **تلقائياً** — لا حاجة لتعديل أي كود ولا إعادة بناء.

بعد كل دفعة شغّل:

```bash
npm run validate:data
```

سترى العدّاد يرتفع: `0/72 required present` ← `72/72`.

---

## القواعد الثابتة

| القاعدة | القيمة |
|---|---|
| البلوك الواحد | **128 × 96** بكسل |
| الصيغة | PNG بشفافية |
| الدقة العادية | `assets/<path>` |
| الدقة المضاعفة | `assets/@2x/<path>` بضعف الأبعاد |
| منظور الغرف | أمامي مسطّح، الجدار الرابع مرفوع — **لا isometric** |
| خلفية الشخصيات والديكور | شفافة تماماً |

**@2x اختيارية الآن.** الهواتف تستفيد منها، لكن اللعبة تعمل بالعادية وحدها.

---

## 1. الغرف — 23 ملفاً مطلوباً

الأهم على الإطلاق. كل غرفة بأبعاد بصمتها بالضبط:

| الغرفة | البلوكات | @1x | @2x | الملف |
|---|---|---|---|---|
| arcade | 2×1 | 256×96 | 512×192 | `rooms/arcade_base.png` |
| bar | 2×1 | 256×96 | 512×192 | `rooms/bar_base.png` |
| business | 3×1 | 384×96 | 768×192 | `rooms/business_base.png` |
| cafe | 2×1 | 256×96 | 512×192 | `rooms/cafe_base.png` |
| cinema | 3×1 | 384×96 | 768×192 | `rooms/cinema_base.png` |
| deluxe | 2×1 | 256×96 | 512×192 | `rooms/deluxe_base.png` |
| double | 2×1 | 256×96 | 512×192 | `rooms/double_base.png` |
| economy | 1×1 | 128×96 | 256×192 | `rooms/economy_base.png` |
| executive | 3×1 | 384×96 | 768×192 | `rooms/executive_base.png` |
| family | 2×1 | 256×96 | 512×192 | `rooms/family_base.png` |
| gym | 2×1 | 256×96 | 512×192 | `rooms/gym_base.png` |
| honeymoon | 3×1 | 384×96 | 768×192 | `rooms/honeymoon_base.png` |
| housekeeping | 1×1 | 128×96 | 256×192 | `rooms/housekeeping_base.png` |
| laundry | 2×1 | 256×96 | 512×192 | `rooms/laundry_base.png` |
| lobby | 2×1 | 256×96 | 512×192 | `rooms/lobby_base.png` |
| luxurySuite | 4×1 | 512×96 | 1024×192 | `rooms/luxurySuite_base.png` |
| maintenance | 2×1 | 256×96 | 512×192 | `rooms/maintenance_base.png` |
| pool | 4×1 | 512×96 | 1024×192 | `rooms/pool_base.png` |
| presidential | 3×2 | 384×192 | 768×384 | `rooms/presidential_base.png` |
| restaurant | 3×1 | 384×96 | 768×192 | `rooms/restaurant_base.png` |
| spa | 3×1 | 384×96 | 768×192 | `rooms/spa_base.png` |
| staffRoom | 2×1 | 256×96 | 512×192 | `rooms/staffRoom_base.png` |
| standard | 1×1 | 128×96 | 256×192 | `rooms/standard_base.png` |

### ما يجب أن تحتويه صورة الغرفة

**داخل الغرفة فارغاً من الأثاث المتحرك.** الأسرّة والكراسي والطاولات والإضاءة
تُركَّب فوقها كطبقات ديكور منفصلة — إن رسمتَها داخل الصورة ستتضاعف بصرياً.

ارسم: الجدران، الأرضية، السقف، النافذة، الباب، والتفاصيل المعمارية الثابتة.

**استثناء:** المقهى والمطعم والبار والمسبح والسينما والجيم والسبا والآركيد —
تجهيزاتها الأساسية (طاولة البار، الشاشة، حوض السباحة، الأجهزة) جزء من الغرفة
لا ديكور، فارسمها.

### الأنواع الأربعة الأخرى لكل غرفة — غير مطلوبة الآن

- `_night` نفس الغرفة، المصابيح مضاءة، إضاءة أبرد
- `_dirty` نفس الغرفة مع أوساخ وسرير غير مرتّب
- `_pest` **طبقة شفافة فقط** فيها صراصير، تُركَّب فوق الأساسية
- `_thumb` أيقونة مربعة 96×96 لقائمة البناء

---

## 2. الشخصيات — 20 ملفاً مطلوباً

كلها **48×72** بكسل، إطار واحد، خلفية شفافة، الشخصية تنظر يميناً.

| الشخصية | الملف |
|---|---|
| business | `characters/guest_business_idle.png` |
| celebrity | `characters/guest_celebrity_idle.png` |
| family | `characters/guest_family_idle.png` |
| inspector | `characters/guest_inspector_idle.png` |
| standard | `characters/guest_standard_idle.png` |
| tourist | `characters/guest_tourist_idle.png` |
| vip | `characters/guest_vip_idle.png` |
| attendant | `characters/staff_attendant_idle.png` |
| barista | `characters/staff_barista_idle.png` |
| bartender | `characters/staff_bartender_idle.png` |
| chef | `characters/staff_chef_idle.png` |
| cleaner | `characters/staff_cleaner_idle.png` |
| concierge | `characters/staff_concierge_idle.png` |
| engineer | `characters/staff_engineer_idle.png` |
| launderer | `characters/staff_launderer_idle.png` |
| lifeguard | `characters/staff_lifeguard_idle.png` |
| receptionist | `characters/staff_receptionist_idle.png` |
| therapist | `characters/staff_therapist_idle.png` |
| trainer | `characters/staff_trainer_idle.png` |
| usher | `characters/staff_usher_idle.png` |

لاحقاً ستحتاج `_walk` لكل واحدة: **شريط 6 إطارات أفقياً، 288×72 إجمالاً**.

---

## 3. الواجهة والمؤثرات — 29 ملفاً

| المفتاح | الأبعاد | الملف |
|---|---|---|
| decor.bed.cot | 104×64 | `decor/bed_cot.png` |
| decor.bed.single | 104×64 | `decor/bed_single.png` |
| decor.flooring.carpet | 72×72 | `decor/flooring_carpet.png` |
| decor.flooring.concrete | 72×72 | `decor/flooring_concrete.png` |
| decor.lighting.bulb | 72×48 | `decor/lighting_bulb.png` |
| decor.lighting.lamp | 72×48 | `decor/lighting_lamp.png` |
| decor.plant.fern | 72×72 | `decor/plant_fern.png` |
| decor.plant.succulent | 72×72 | `decor/plant_succulent.png` |
| decor.rug.mat | 72×72 | `decor/rug_mat.png` |
| decor.rug.woolRug | 72×72 | `decor/rug_woolRug.png` |
| decor.seating.armchair | 72×72 | `decor/seating_armchair.png` |
| decor.seating.stool | 72×72 | `decor/seating_stool.png` |
| decor.table.deskWood | 72×72 | `decor/table_deskWood.png` |
| decor.table.sideTable | 72×72 | `decor/table_sideTable.png` |
| decor.wallArt.poster | 96×72 | `decor/wallArt_poster.png` |
| decor.wallArt.print | 96×72 | `decor/wallArt_print.png` |
| decor.wallpaper.plain | 96×72 | `decor/wallpaper_plain.png` |
| decor.wallpaper.striped | 96×72 | `decor/wallpaper_striped.png` |
| event.fire.overlay | 64×64 | `effects/fire.png` |
| event.inspection.icon | 64×64 | `effects/inspection.png` |
| event.pest.overlay | 64×64 | `effects/pest.png` |
| event.vipArrival.icon | 64×64 | `effects/vipArrival.png` |
| ui.currency.coins | 48×48 | `ui/coins.png` |
| ui.currency.gems | 48×48 | `ui/gems.png` |
| ui.shift.12h | 64×64 | `ui/shift_12h.png` |
| ui.shift.24h | 64×64 | `ui/shift_24h.png` |
| ui.shift.2h | 64×64 | `ui/shift_2h.png` |
| ui.shift.48h | 64×64 | `ui/shift_48h.png` |
| ui.shift.6h | 64×64 | `ui/shift_6h.png` |

---

## الترتيب الذي أنصح به

اللعبة تعمل في كل مرحلة، فلا تنتظر الاكتمال:

1. **الغرف الخمس الأولى** — lobby, economy, standard, housekeeping, cafe.
   هذه كل ما يراه اللاعب في أول عشر دقائق
2. **باقي غرف النزلاء** — double حتى presidential
3. **الغرف التجارية** — أكبر أثر بصري لكل ملف
4. **الشخصيات** — الفندق يبدو حياً فجأة
5. **الواجهة والمؤثرات**
6. **الأنواع `_night` و `_dirty` و `_pest`** — تعمّق كثيراً وتكلف قليلاً
7. **@2x** لكل ما سبق

---

## ملاحظة على التوليد بالذكاء الاصطناعي

الأبعاد أعلاه ليست نسباً قياسية للمولّدات. ولّد بنسبة قريبة ثم اقتصص وحجّم.
الحرج هو **النسبة** لا الأبعاد: غرفة 1×1 نسبتها 4:3 أفقية، والجناح الرئاسي
3×2 نسبته 2:1.

ووحدة الأسلوب أهم من جودة أي صورة منفردة. ولّد الغرف الخمس الأولى في جلسة
واحدة بنفس الوصف الأساسي، ثم استعمل واحدة منها مرجعاً بصرياً لكل ما بعدها.
