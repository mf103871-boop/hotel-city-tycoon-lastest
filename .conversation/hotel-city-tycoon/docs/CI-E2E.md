# تشغيل E2E عبر GitHub Actions

## لماذا أصبح التشغيل عبر CI؟

ممر E2E يعمل الآن عبر GitHub Actions بدل الاعتماد على تشغيل المتصفح داخل بيئة Replit الحالية. تقارير HC-P0 من S2 حتى S2E وثقت عطل I/O في قناة browser transport: يتجمد Playwright Test داخل Replit قبل الوصول إلى الصفحة، بينما يصل probe المباشر إلى `Target.createTarget`. المحاولة الأخيرة باستخدام `TMPDIR=/dev/shm/pw-tmp` في S2E انتهت بـtimeout بعد 240 ثانية.

هذا لا يثبت فشل التطبيق. بل يحدد أن اعتماد خط الأساس يحتاج بيئة CI مستقلة. لا تُعتبر أرقام الـ82 أو اللقطات الخمس معتمدة قبل أول تشغيل CI ناجح ومراجعة artifact الناتج.

## ما الذي يفعله workflow؟

الملف `.github/workflows/e2e.yml`:

- يعمل تلقائيًا عند push إلى `main`.
- يمكن تشغيله يدويًا عبر `workflow_dispatch`.
- يستخدم Ubuntu 24.04 وNode.js 24.
- ينفذ `npm ci` ثم يثبت Chromium مع اعتمادياته.
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

تبقى حراس `playwright.config.ts` خاملة في CI لأن متغيراتها غير مضبوطة هناك. لذلك لا تُستخدم في GitHub Actions:

- `PLAYWRIGHT_CHROMIUM_PATH`
- `PLAYWRIGHT_DISABLE_DEV_SHM`
- `PLAYWRIGHT_FULL_CHROMIUM`
- `PLAYWRIGHT_HEADED`
- `PLAYWRIGHT_NO_CAPTURE`
- `PLAYWRIGHT_EXTRA_ARGS`

يستخدم CI تثبيت Chromium الخاص به وإعداد Playwright العادي. لا تُضاف `--disable-gpu`؛ قرار S2B يمنع استخدامها لأنها كسرت التقاط اللقطات.

## حدود هذه الخطوة

تجهيز CI لا يساوي `VERIFIED`. تبقى حالة P0 `BLOCKED` على Replit إلى أن يدفع المالك الكود، يشغل workflow، ويرسل artifact للمراجعة. عندها فقط تُعتمد أرقام الـ82 واللقطات الخمس بناءً على نتيجة تشغيل فعلية.

## بنية المستودع

جذر المستودع هو مساحة العمل، بينما المشروع موجود في المجلد الفرعي `hotel-city-tycoon`. يوجد الـworkflow في `.github` بجذر المستودع، ويعمل بــ`working-directory` موجه إلى المجلد الفرعي `hotel-city-tycoon`. يتم الدفع والربط بـGitHub من لوحة Git في واجهة Replit، ثم يشغّل المالك workflow باسم `e2e` من تبويب **Actions**.