# تشغيل E2E عبر GitHub Actions

## لماذا أصبح التشغيل عبر CI؟

ممر E2E يعمل الآن عبر GitHub Actions بدل الاعتماد على تشغيل المتصفح داخل بيئة Replit الحالية. تقارير HC-P0 من S2 حتى S2E وثقت عطل I/O في قناة browser transport: يتجمد Playwright Test داخل Replit قبل الوصول إلى الصفحة، بينما يصل probe المباشر إلى `Target.createTarget`. المحاولة الأخيرة باستخدام `TMPDIR=/dev/shm/pw-tmp` في S2E انتهت بـtimeout بعد 240 ثانية.

هذا لا يثبت فشل التطبيق. بل يحدد أن اعتماد خط الأساس يحتاج بيئة CI مستقلة. لا تُعتبر أرقام الـ82 أو اللقطات الخمس معتمدة قبل أول تشغيل CI ناجح ومراجعة artifact الناتج.

## ما الذي يفعله workflow؟

الملف `.github/workflows/e2e.yml`:

- يعمل تلقائيًا عند push إلى `main`.
- يمكن تشغيله يدويًا عبر `workflow_dispatch`.
- يستخدم Ubuntu 24.04 وNode.js 22 (الإصدار الذي يعلنه `.replit` والذي وُلّد عليه ملف القفل؛ كان CI على 24 حتى تدقيق 03-09-2026).
- ينفذ `npm ci` ثم يثبت Chromium مع اعتمادياته. (بين S8 وتدقيق 03-09-2026 كان CI ينفذ `npm install` لأن `npm ci` كان يفشل بـ`EUSAGE` على قفل لا يسجل تبعيات `@tailwindcss/oxide-wasm32-wasi`؛ أُعيد توليد القفل على Node 22 وعاد `npm ci`.)
- يضبط ثلاثة متغيرات وفق DEC-009: `PLAYWRIGHT_FULL_CHROMIUM=1` و`PLAYWRIGHT_NO_CAPTURE=1` و`PLAYWRIGHT_EXTRA_ARGS=--disable-3d-apis`.
- يشغل Playwright مع تقرير line.
- يشغل `tools/baseline-shots.mjs` دائمًا بعد الاختبارات.
- يرفع artifact باسم `e2e-results` ويضم `test-results/` و`docs/baseline-screens/`.

## دفع الكود من Replit إلى GitHub

يمكن استخدام لوحة Git في Replit لمراجعة الملفات ثم commit وpush. أو من Shell داخل المشروع:

```bash
git add -A
git commit -m "HC-P0-S2E: CI e2e lane"
git push origin main
```

يجب أن يكون remote باسم `origin` مضبوطًا على مستودع GitHub الصحيح، وأن تكون صلاحية الدفع مهيأة في حساب GitHub.

## تشغيل workflow يدويًا

1. افتح مستودع GitHub.
2. انتقل إلى تبويب **Actions**.
3. اختر workflow باسم **e2e**.
4. اضغط **Run workflow**.
5. اختر الفرع المطلوب، وغالبًا `main`.
6. اضغط **Run workflow** مرة أخرى.

بعدها افتح التشغيل الناتج لمراجعة سجل كل خطوة، خصوصًا عدد اختبارات Playwright والمدة والاختبارات الفاشلة.

## تنزيل artifact وإرساله للمراجعة

1. افتح تشغيل workflow المكتمل في تبويب **Actions**.
2. انتقل إلى قسم **Artifacts** أسفل صفحة التشغيل.
3. نزّل `e2e-results`.
4. فك ضغط الملف محليًا.
5. أرسل محتوى `test-results/` و`docs/baseline-screens/`، مع سجل التشغيل، للمراجعة.

يجب أن يتضمن طلب المراجعة عدد الاختبارات المخطط والمنفذ والناجح والفاشل لكل project، مدة التشغيل، وأسماء الفشل إن وجدت. لا تُخفِ فشلًا تطبيقيًا خلف عبارة عامة مثل «الاختبارات فشلت».

## حراس Playwright

حراس `playwright.config.ts` متغيرات بيئة اختيارية. منذ DEC-009 يضبط CI ثلاثة منها (`PLAYWRIGHT_FULL_CHROMIUM=1`، `PLAYWRIGHT_NO_CAPTURE=1`، `PLAYWRIGHT_EXTRA_ARGS=--disable-3d-apis`) ويترك الباقي:

- `PLAYWRIGHT_CHROMIUM_PATH` — مسار Chromium مثبت مسبقًا بدل تنزيل Playwright.
- `PLAYWRIGHT_DISABLE_DEV_SHM` — يضيف `--disable-dev-shm-usage`.
- `PLAYWRIGHT_HEADED` — متصفح مرئي.

منذ تدقيق 03-09-2026 تُدمج كل الحراس في كائن `launchOptions` واحد؛ قبل ذلك كان ضبط `PLAYWRIGHT_EXTRA_ARGS` مع `PLAYWRIGHT_CHROMIUM_PATH` يُسقط مسار المتصفح. لا تُضاف `--disable-gpu`؛ قرار S2B يمنع استخدامها لأنها كسرت التقاط اللقطات.

## تشغيل مسار CI نفسه محليًا على جهاز بلا GPU

المسار الافتراضي (`npm run test:e2e` بلا متغيرات) يعتمد على WebGL؛ على خادم بلا بطاقة رسوم يشغّل Chromium مصيّرًا برمجيًا (SwiftShader) وتتجمد الصفحة بعد سطر `renderer: webgl` حتى انتهاء المهلة (45 ثانية) في معظم الاختبارات — هذه حالة البيئة لا اللعبة، وقد أُثبت في تدقيق 03-09-2026 أن المسار نفسه مع تعطيل 3D يمر بلا توقف واحد. لذلك على جهاز بلا GPU شغّل دائمًا مسار DEC-009:

```bash
PLAYWRIGHT_EXTRA_ARGS=--disable-3d-apis PLAYWRIGHT_NO_CAPTURE=1 npx playwright test
# مع Chromium مثبت مسبقًا (حين يكون تنزيل cdn.playwright.dev محظورًا):
PLAYWRIGHT_CHROMIUM_PATH=/path/to/chromium PLAYWRIGHT_EXTRA_ARGS=--disable-3d-apis PLAYWRIGHT_NO_CAPTURE=1 npx playwright test --project=phone
```

الاختبارات التي تحتاج القماشة تتخطى نفسها في هذا المسار (`NO_3D`)؛ ما عداها يقيس الواجهة والمنطق والحفظ كما في CI. اختبارات النقر على الغرف تسأل المصيّر عن مواضع الغرف عبر `window.hct.roomRects()` (`tests/e2e/rooms.ts`) بدل إحداثيات ثابتة.

**تصحيح مؤرخ 20-09-2026 (DEC-019، HC-P2-S2):** فرضية «المحرك لا يقلع بلا GPU» لم تعد صحيحة على هذا المسار. منذ Pixi 8.16 يتخطى `autoDetectRenderer` WebGPU وWebGL تحت `--disable-3d-apis` ويقلع على `CanvasRenderer` البرمجي (يقلع في ~0.4ث عند ~60fps في مسبار 20-09-2026)، وكان `detectBackend()` يسمّيه `webgl` خطأً. منذ HC-P2-S2 يقول سطر الإقلاع `[hotel-city-tycoon] renderer: canvas` والشارة تلوّنه ورديًا. ما **يثبته** هذا المسار: الواجهة والمنطق والحفظ، رسم Pixi على Canvas2D (sprites وGraphics ثابتة ومزج `normal`/`add`؛ المرشحات والأقنعة وRenderTexture تُتخطّى بصمت)، قراءة بكسلات القماشة من داخل الصفحة (`drawImage` تعمل دائمًا على Canvas2D — اختبار «the world is painted, not left blank»)، ولقطات Playwright للقماشة (`docs/hc-p2-s2-shots/`). ما **لا يثبته** أبدًا: أداء الهاتف (DEC-005). أما المسار الافتراضي (SwiftShader WebGL) فيتجمد بعد ~33ث على خادم بلا GPU (BL-020) ولقطته بيضاء **سواء مُرّر `preserveDrawingBuffer` أم لا** (قيست متطابقة 20-09-2026)؛ العلم يُمرَّر في بناء الاختبار وحده (`VITE_E2E=1`) لتمكين القراءة الداخلية على WebGL حقيقي ولا شيء غير ذلك. الاختباران المتخطيان («tapping a room opens its sheet» و«the people are animated, not standing in one frame»؛ `NO_3D` عند `game.spec.ts:156` و`:317` بعد تعديلات هذه الخطوة ومراجعتها) يبقيان متخطيين على هذا المسار حتى تُقاس سعته في HC-P2-S8.

**سجل مؤرخ 21-09-2026 (DEC-020، HC-P2-S3 — الهيكل الحي):** منذ HC-P2-S3 تُرسم الشخصيات هيكلًا إجرائيًا من أجزاء `Graphics` يُوضَع كل إطار، وعلى هذا المسار (`backend === 'canvas'`) يرسمه العارض بطبقة **`lite`**: كل عيّنة مُكمَّمة على شبكة إطارات المقطع من ملفات `data/animations/`، النوابض والانضغاط مطفأة، **بلا RenderTexture ولا `cacheAsTexture`** (DEC-019 لم يُعدَّل). `?lite=0` يفرض الطبقة `full` (حركة المالك بمعدل الشاشة) على هذا المسار **للدليل والقياس فقط**، و`?lite=1` يفرض `lite` على أي خلفية. ما **تثبته** لقطات هذا المسار عن الهيكل: أن Pixi يرسم الأجزاء المشتركة الـcontext على Canvas2D بالألوان والنِّسَب المطلوبة؛ ما **لا تثبته** عن الهاتف: شكل الحواف (Canvas2D ينعّم الحدود بينما WebGL/WebGPU على الهاتف بلا `antialias` — مقبض `?aa=1` وBL-044) ولا الأداء (fps المسار البرمجي لا يُقارن بشيء، DEC-005). اختبار «characters are drawn, not left as placeholder shapes» يؤكد الآن لكل شخص `source === 'rig'` و`sheetReady` (الأوراق ما زالت تصل — انحدار `assets.ts:408-422`)، ويقصّ بكسلات شخص مرئي واحد من داخل الصفحة (≥ 10 ألوان متميزة مكمَّمة 5 بت و≥ 2% بكسلات داكنة) — وهو **الدليل الوحيد في E2E على أن الهيكل يرسم**؛ «the world is painted» يقيس الحزام لا الشخص. مجموعة التخطي لم تتغير. **تشغيل S3 على هذا المسار (21-09-2026، `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium PLAYWRIGHT_EXTRA_ARGS=--disable-3d-apis PLAYWRIGHT_NO_CAPTURE=1`، خادم `webServer` الخاص على 5000):** 76 ناجحًا / 0 فاشل / 12 متخطاة (38 / 0 / 6 لكل مشروع) في 2.3 دقيقة، والمتخطاة هي الاثنتا عشرة نفسها بالاسم كخط أساس S2 (`game.spec`: «tapping a room opens its sheet…»، «the people are animated…» [`NO_3D`]، «the upgrades panel…»؛ `manage.spec`: «the plot can be expanded…»، «a room can be moved…»، «everything done here survives a full reload»؛ × مشروعين). المدد (سطح المكتب / هاتف): «the game boots» 0.9 / 0.9ث، «the shift countdown ticks» 3.4 / 3.4ث، «guests appear» 1.8 / 1.9ث، «characters are drawn» 8.9 / 8.9ث، «the world is painted» 2.8 / 2.7ث. دورات الإقفال الثلاث على الشجرة نفسها: 75 / 1 / 12 (سباق تنقّل في `manage.spec.ts:135` «the placement preview refuses a square that does not fit»، هاتف: `Execution context was destroyed` عند أول `roomRects` في `rooms.ts:39`؛ مرّ 3/3 منفردًا)، ثم 75 / 2 / 11 في 3.5 دقيقة تحت حمل الآلة (متوسط الحمل ≈3 على 4 أنوية: «characters are drawn» على سطح المكتب وجد `window.hct` غير مركَّب بعد انتظاره الثابت 8ث في `game.spec.ts:258`، و«the plot can be expanded» على الهاتف انتهت مهلته 45ث قبل بلوغ `test.skip` الخاص به؛ «characters are drawn» مرّ 6/6 منفردًا على المشروعين)، ثم **76 / 0 / 12 في 2.3 دقيقة** على آلة خاملة. لا `retries` في الإعداد، فالهشاشة — انتظار ثابت وسباق تنقّل سابقان، لا الهيكل — تُسجَّل هنا لا تُخفى. **ملاحظة بيئة (هذا الصندوق):** Playwright المحلي 1.63.0 يتوقع Chromium بالمراجعة 1243 (153.0.8010.12) بينما المثبت في `/opt/pw-browsers/` هو `chromium-1194` (141.0.7390.37)، فبلا `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium` يفشل كل اختبار عند الإقلاع؛ في CI يثبّت `npx playwright install` المراجعة المطابقة ولا حاجة للمتغير.


**سجل مؤرخ 21-09-2026 (DEC-021، HC-P2-S4 — قناة المؤثرات):** منذ HC-P2-S4 ترسم اللعبة جسيمات وأرقام دخل عائمة وفقاعات one-shot ووميض إطار للغرفة، كلها Sprites من **أطلس يُولَّد وقت التشغيل** (قماشة 2D واحدة خارج الشاشة تُبنى عند أول إشارة، لا ملف مشحون، لا مسار جديد يُخدَم، ولا تعديل في `sw.js` أو قوائم الأصول). على هذا المسار (`backend === 'canvas'`) تُرسم بطبقة **`lite`**: سعة الحقل 48 جسيمًا، 3 أرقام، فقاعتان، 4 نبضات، **والحشو مطفأ** — لا غبار قدم ولا بريق للمنظِّفة، لأن ستّين ماشيًا يملأون الميزانية بالزينة. (علامة نوم القناة أُسقطت في مراجعة 21-09-2026: الهيكل يرسم للنائم علامتَي «z» على الطبقتين أصلًا — وثيقة القرار §9 بند 1.) و`?lite=0` يفرض الطبقة `full` (192 جسيمًا مع الحشو) على هذا المسار **للدليل والقياس فقط**، و`?lite=1` يفرض `lite` على أي خلفية. الرسم في الطبقتين على **ساعة واحدة 12 إطارًا/ث**، فأربعة إطارات من كل خمسة عند 60 إطارًا/ث لا تكتب خاصية واحدة على أي Sprite. وأُضيف مقبضا تشخيص بجوار `hct.rigStats()`: `window.hct.fx(<إشارة>)` يفرض إشارة لحظتها، و`window.hct.fxStats()` يقرأ السعة النافذة والأحياء. **ما تثبته اختبارات هذه الخطوة الثلاثة على هذا المسار:** «المؤثرات تضع بكسلات» = الأطلس يصل فعلًا إلى سياق Canvas2D ويُرسم منه؛ «السماء تبقى داكنة والمؤثرات تعمل» = وضع المزج **لا يتسرّب** بعد دفعة الضوء الجمعية (BL-048 — لولا الحارس لتسلّق متوسط إضاءة مستطيل السماء نحو البياض خلال إطارين)؛ «غرفة تومض وشخص يحتفظ بحدّه» = وميض الإطار لا يأكل حدّ الشخصية في القصّ نفسه وبعتباته نفسها التي يستعملها «characters are drawn». **وما لا تثبته أبدًا:** الهاتف — لا شكل الحواف ولا الأداء (DEC-005)؛ ولا تُقارن أي قراءة هنا بحد p5 ≥ 55. مجموعة التخطي لم تتغير. **تشغيل S4 على هذا المسار (21-09-2026، بعد إصلاحات المراجعة، `PLAYWRIGHT_CHROMIUM_PATH=/opt/pw-browsers/chromium PLAYWRIGHT_EXTRA_ARGS=--disable-3d-apis PLAYWRIGHT_NO_CAPTURE=1`، خادم `webServer` الخاص على 5000؛ السجل `scratchpad/rv3-e2e.log`):** 94 اختبارًا، **82 ناجحًا / 0 فاشل / 12 متخطاة** في 3.0 دقيقة (41 / 0 / 6 لكل مشروع)، والمتخطاة هي الاثنتا عشرة نفسها بالاسم كخط أساس S3. الاختبارات الثلاثة الجديدة خضراء على المشروعين: `game.spec.ts:775` «the night picture stays dark while the effects are running» 4.9ث (سطح المكتب) / 5.0ث (هاتف)، `:846` «the effects put pixels on the canvas» 4.6ث / 4.9ث، `:961` «a room can flash while a character keeps its outline» 8.9ث / 8.9ث. الاثنان الأخيران يثبّتان إطار العرض عند 900×640 لأن الإشارة ترتكز على أول شخص يقع موضعه المُسقَط داخل الإطار، ويؤكّدان أن `hct.fx()` أعاد معرّفًا غير فارغ — أي أن الإشارة وجدت من ترتكز عليه داخل الشاشة لا خلف حشوة صندوق القصّ. لا `retries` في الإعداد. التفصيل في `docs/HC-P2-S4-REPORT.md` §5 و§6.2. **تصحيح مؤرخ 21-09-2026 (رقم سطر، لا قرار):** التصحيح المؤرخ 20-09-2026 أعلاه يسمّي التخطّيين `NO_3D` عند `game.spec.ts:156` و`:317`. الأول صحيح في هذه الشجرة؛ **والثاني عند `:390` لا `:317`** — «the people are animated, not standing in one frame». الانجراف سابق لهذه الخطوة (من تعديلات S3) ولم تُحدثه، والسطر الموقّع يبقى نصًّا كما هو وهذا السطر يصحّحه. أسماء المتخطّيات لم تتغيّر.
## حدود هذه الخطوة

تجهيز CI لا يساوي `VERIFIED`. تبقى حالة P0 `BLOCKED` على Replit إلى أن يدفع المالك الكود، يشغل workflow، ويرسل artifact للمراجعة. عندها فقط تُعتمد أرقام الـ82 واللقطات الخمس بناءً على نتيجة تشغيل فعلية.

**سجل التشغيلات المعتمدة:** S8 (02-09-2026): 60 / 6 / 16. تشغيل #2 (03-09-2026، خط الأساس + إصلاح القفل): 62 / 4 / 16 — `docs/ci/2026-09-03-run2/`. تشغيل #4 (03-09-2026، بعد دمج تدقيق 03-09-2026 كاملًا): 72 / 0 / 10 في 2.0 دقيقة — `docs/ci/2026-09-03-run4/`. **تشغيل #6 (03-09-2026، بعد دمج HC-P1-S3 عبر PR #4، `3c1183b`): 72 / 0 / 10 في 2.1 دقيقة واللقطات الخمس مكتملة — `docs/ci/2026-09-03-run6/`.** المتخطاة العشر هي اختبارات القماشة (`NO_3D`) واختبارات التوسعة التي تتخطى نفسها لفندق مستوى 1.

## بنية المستودع

جذر المستودع هو مساحة العمل، بينما المشروع موجود في المجلد الفرعي `hotel-city-tycoon`. يوجد الـworkflow في `.github` بجذر المستودع، ويعمل بــ`working-directory` موجه إلى المجلد الفرعي `hotel-city-tycoon`. يتم الدفع والربط بـGitHub من لوحة Git في واجهة Replit، ثم يشغّل المالك workflow باسم `e2e` من تبويب **Actions**.