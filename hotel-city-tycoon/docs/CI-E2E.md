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

## حدود هذه الخطوة

تجهيز CI لا يساوي `VERIFIED`. تبقى حالة P0 `BLOCKED` على Replit إلى أن يدفع المالك الكود، يشغل workflow، ويرسل artifact للمراجعة. عندها فقط تُعتمد أرقام الـ82 واللقطات الخمس بناءً على نتيجة تشغيل فعلية.

**سجل التشغيلات المعتمدة:** S8 (02-09-2026): 60 / 6 / 16. تشغيل #2 (03-09-2026، خط الأساس + إصلاح القفل): 62 / 4 / 16 — `docs/ci/2026-09-03-run2/`. تشغيل #4 (03-09-2026، بعد دمج تدقيق 03-09-2026 كاملًا): 72 / 0 / 10 في 2.0 دقيقة — `docs/ci/2026-09-03-run4/`. **تشغيل #6 (03-09-2026، بعد دمج HC-P1-S3 عبر PR #4، `3c1183b`): 72 / 0 / 10 في 2.1 دقيقة واللقطات الخمس مكتملة — `docs/ci/2026-09-03-run6/`.** المتخطاة العشر هي اختبارات القماشة (`NO_3D`) واختبارات التوسعة التي تتخطى نفسها لفندق مستوى 1.

## بنية المستودع

جذر المستودع هو مساحة العمل، بينما المشروع موجود في المجلد الفرعي `hotel-city-tycoon`. يوجد الـworkflow في `.github` بجذر المستودع، ويعمل بــ`working-directory` موجه إلى المجلد الفرعي `hotel-city-tycoon`. يتم الدفع والربط بـGitHub من لوحة Git في واجهة Replit، ثم يشغّل المالك workflow باسم `e2e` من تبويب **Actions**.