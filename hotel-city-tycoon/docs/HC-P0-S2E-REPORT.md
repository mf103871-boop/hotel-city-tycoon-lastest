# HC-P0-S2E — محاولة RAM الأخيرة وتجهيز GitHub Actions

**التاريخ:** 1 سبتمبر 2026  
**المرحلة:** `HC-P0` — تثبيت خط الأساس  
**الخطوة:** `HC-P0-S2E` فقط  
**الحالة:** `BLOCKED`

## الخلاصة

نُفذت محاولة Replit الأخيرة بذاكرة مؤقتة في RAM مرة واحدة وبالسقف المحدد. انتهت بـtimeout. وفق الخطة، لم تُجرَ أي محاولة Replit إضافية، وجُهز ممر GitHub Actions كاملًا بانتظار دفع المالك وتشغيله.

لا يمكن اعتماد P0 أو أرقام الـ82 أو اللقطات الخمس من هذه الجلسة. الاعتماد سيكون من أول تشغيل CI ناجح ومراجعة artifact `e2e-results`.

> لم يُستخدم `--disable-gpu`.

---

## 1. فحص المرجع

- **إصدار المرجع:** 1.2.
- **المرحلة الحالية:** HC-P0 — تثبيت خط الأساس.
- **الخطوة الحالية:** HC-P0-S2E.
- **الهدف الواحد:** محاولة RAM أخيرة، ثم تجهيز GitHub Actions عند الفشل دون محاولات Replit إضافية.
- **المشكلة المثبتة:** عطل browser transport/I/O في Replit موثق في S2B وS2C وS2D.
- **الاعتماديات المكتملة:** قراءة المرجع كاملًا، قراءة S2D كاملًا، وفحص selectors في `game.spec.ts` و`manage.spec.ts`.
- **ما يدخل في النطاق:** ramtmp، workflow، baseline script، دليل CI، والتقرير.
- **ما لا يدخل في النطاق:** التطبيق والبيانات والحزم وconfig Playwright والاختبارات الأصلية والرسومات.
- **شروط القبول:** نجاح ramtmp كان سيفتح E2E واللقطات؛ بعد فشله يبقى P0 `BLOCKED` مع CI جاهز.
- **الأدلة المطلوبة:** سجل ramtmp حرفي، workflow، script، دليل عربي، وتقرير.
- **التعارضات أو المعلومات الناقصة:** لم تُنفذ GitHub Actions بعد، لذلك لا توجد نتيجة CI يمكن اعتمادها.

---

## 2. قالب الخطة

### الهدف

- **النتيجة التي يراها المالك:** ممر خارجي قابل للتشغيل يثبت E2E واللقطات بعيدًا عن عطل Replit.
- **خط الأساس الحالي ودليله:** S2D يثبت توقف runner عند رد `Browser.getVersion`، وS2E يختبر RAM كآخر محاولة.

### النطاق

- **الملفات المفحوصة:** المرجع، S2D، `game.spec.ts`، `manage.spec.ts`، `package.json`.
- **الملفات المنشأة:** `.github/workflows/e2e.yml`، `tools/baseline-shots.mjs`، `docs/CI-E2E.md`، هذا التقرير.
- **ما لن يتغير:** `src/` و`data/` و`package.json` و`package-lock.json` و`playwright.config.ts` و`tests/e2e`.

### خطوات التنفيذ

1. تشغيل ramtmp مرة واحدة بسقف 240 ثانية.
2. عند الفشل، إنشاء workflow بالمحتوى المطلوب.
3. إنشاء script يبدأ خادمًا فرعيًا على 5173، ينتظر 120 ثانية كحد أقصى، ويلتقط اللقطات الخمس.
4. كتابة دليل CI والتقرير وتحديث سجل الحالة.

### شروط القبول

- رمز خروج ramtmp مسجل.
- workflow جاهز للتشغيل.
- baseline script يخرج 0 عند اكتمال الخمس و1 مع اسم وسبب كل لقطة متعذرة.
- P0 يبقى `BLOCKED` حتى تشغيل CI ناجح.

### المخاطر وخطة الرجوع

- لا يوجد خطر حفظ أو migration.
- لا يوجد تغيير أداء في التطبيق.
- يمكن إزالة ملفات CI والتوثيق وscript دون تعديل التطبيق أو الاختبارات الأصلية.

---

## 3. مطابقة الخطة مع المرجع

- **المرحلة المطابقة:** HC-P0.
- **المشكلة المرجعية التي تعالجها:** تثبيت خط أساس متصفح قابل للتكرار.
- **البنود التي لن تلمسها الخطة:** التطبيق، البيانات، الحزم، config Playwright، الاختبارات، الاقتصاد، الديكور، والأصول.
- **هل تسللت أعمال من مرحلة أخرى؟** لا.
- **هل كل الخطوات قابلة للتحقق؟** نعم، عند تشغيل CI.
- **هل توجد افتراضات غير مثبتة؟** نعم؛ نجاح GitHub Actions لم يُنفذ بعد.
- **هل تحقق الخطة شرط خروج الخطوة؟** لا؛ ramtmp فشل، وCI لم يُشغل.
- **القرار:** صالحة للتنفيذ.

---

## 4. نتيجة الرصاصة الأخيرة RAM

### الأمر المنفذ

```bash
mkdir -p /dev/shm/pw-tmp
timeout 240s env -u PLAYWRIGHT_CHROMIUM_PATH TMPDIR=/dev/shm/pw-tmp PLAYWRIGHT_FULL_CHROMIUM=1 PLAYWRIGHT_NO_CAPTURE=1 npx playwright test --project=desktop -g "boots past the loading screen"
```

### السجل

```text
docs/HC-P0-S2E-ramtmp.log
```

### الناتج الحرفي

```text
Running 1 test using 1 worker


exit_code=124
duration_ms=240723
```

**النتيجة:** timeout بعد 240 ثانية، ورمز الخروج `124`. لم تُشغّل المجموعة الكاملة، ولم تُنشأ اللقطات، ولم تُجرَ محاولة Replit أخرى.

---

## 5. مسار GitHub Actions

أُنشئ الملف:

```text
.github/workflows/e2e.yml
```

ومحتواه المرجعي:

```yaml
name: e2e
on:
  workflow_dispatch:
  push:
    branches: [main]
jobs:
  e2e:
    runs-on: ubuntu-24.04
    timeout-minutes: 40
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: 24
          cache: npm
      - run: npm ci
      - run: npx playwright install --with-deps chromium
      - run: npx playwright test --reporter=line
      - if: always()
        run: node tools/baseline-shots.mjs
      - if: always()
        uses: actions/upload-artifact@v4
        with:
          name: e2e-results
          path: |
            test-results/
            docs/baseline-screens/
          if-no-files-found: warn
```

الworkflow لا يُعد نتيجة تحقق حتى يُدفع إلى GitHub ويُشغل فعليًا.

---

## 6. baseline script

أُنشئ:

```text
tools/baseline-shots.mjs
```

مواصفاته المنفذة:

- يبدأ `HOST=127.0.0.1 PORT=5173 VITE_E2E=1 npm run dev` كعملية فرعية.
- ينتظر `http://127.0.0.1:5173` حتى 120 ثانية.
- يستخدم `chromium` من Playwright بالإطلاق الافتراضي.
- إذا وُجد `CHROMIUM_CHANNEL` يمرره كـ`channel`.
- لا يستخدم `--disable-gpu`.
- يلتقط:
  - `01-main.png` بعد ظهور زر Open hotel.
  - `02-build.png` بعد فتح زر `+ build` وظهور heading البناء.
  - `03-decor.png` بعد فتح زر shop وظهور heading المتجر.
  - `04-manage.png` بعد `open-manage` وظهور `manage-tab-plot`.
  - `05-phone.png` للشاشة الرئيسية على viewport `412×915`.
- يعيد تشغيل كل لقطة في context جديد وينهي الخادم في `finally`.
- يطبع `OK` لكل لقطة ناجحة واسم وسبب كل لقطة متعذرة.
- يخرج 0 عند اكتمال الخمس و1 عند أي فشل.

لم يُشغل السكربت في Replit، لأن ذلك سيكون محاولة إضافية خارج الخطة، ولم تُنشأ صور baseline في هذه الجلسة.

---

## 7. دليل CI

أُنشئ:

```text
docs/CI-E2E.md
```

ويشرح بالعربية:

- سبب نقل E2E إلى GitHub Actions بسبب عطل I/O الموثق من S2 إلى S2E.
- الدفع عبر لوحة Git أو:

  ```bash
  git add -A
  git commit -m "HC-P0-S2E: CI e2e lane"
  git push origin main
  ```

- التشغيل اليدوي من Actions عبر Run workflow.
- تنزيل artifact باسم `e2e-results` وإرساله للمراجعة.
- بقاء حراس `playwright.config.ts` خاملة في CI لأن متغيراتها غير مضبوطة هناك.

---

## 8. ما لم يُنفذ

- لم تُشغّل `npm run test:e2e` في Replit؛ السبب فشل ramtmp والقرار الصريح بعدم إجراء محاولات Replit إضافية.
- لم تُشغّل GitHub Actions؛ السبب أنه يحتاج دفع المالك للكود ثم تشغيل workflow.
- لم تُنشأ `docs/baseline-screens/` أو أي PNG؛ السبب عدم وجود تشغيل CI ناجح.
- لم تُعتمد أرقام الـ82 أو نتائج desktop/phone؛ لا يوجد تنفيذ فعلي في CI بعد.
- لم يتغير `src/` أو `data/` أو `package.json` أو `package-lock.json` أو `playwright.config.ts` أو `tests/e2e`.
- لم تُولد أي صور أو رسوم أو sprite sheets أو animation.

---

## 9. سجل الحالة الحالي

تبقى حالة P0:

```text
BLOCKED on Replit
```

مع الملاحظة التالية:

```text
ممر GitHub Actions جاهز بانتظار أول تشغيل يدفعه المالك؛ ستُعتمد أرقام الـ82 واللقطات الخمس من أول تشغيل CI ناجح ومراجعة artifact e2e-results.
```

لا تُرفع الحالة إلى `VERIFIED` من وجود workflow أو script فقط.

---

## 10. تقرير التنفيذ

- **معرف المهمة:** HC-P0-S2E.
- **ما نُفذ فعلًا:** قراءة المرجع والتقرير والاختبارات المرتبطة، تشغيل ramtmp مرة واحدة، إنشاء workflow، إنشاء baseline script، إنشاء دليل CI، وإنشاء هذا التقرير.
- **ما لم يُنفذ:** E2E الكاملة، تشغيل GitHub Actions، اللقطات الخمس، اعتماد أرقام الـ82، و`VERIFIED`.
- **الملفات المنشأة:** `.github/workflows/e2e.yml`، `tools/baseline-shots.mjs`، `docs/CI-E2E.md`، `docs/HC-P0-S2E-REPORT.md`، `docs/HC-P0-S2E-ramtmp.log`.
- **الملفات المعدلة:** `docs/HOTEL_CITY_MASTER_REFERENCE_AR.md` فقط في سجل الحالة.
- **الاختبار المشغل حرفيًا:** اختبار proof واحد على desktop عبر ramtmp.
- **نتيجة ramtmp:** `exit_code=124`، مدة `240723ms`.
- **المجموعة الكاملة:** مخطط 82، منفذ 0، لأن CI لم يُشغل.
- **اللقطات:** 0 من 5 في هذه الجلسة.
- **أثر التغيير على الحفظ:** لا يوجد.
- **أثر التغيير على الأداء:** لا يوجد تغيير في التطبيق.
- **الانحرافات:** لا يوجد؛ بعد timeout تم تنفيذ فرع CI المحدد دون محاولة Replit أخرى.
- **مشكلات جديدة للمؤجل:** لا يوجد فشل تطبيقي جديد؛ اعتماد baseline ينتظر CI.
- **الحقيقة الجديدة للمرجع:** RAM tmp لم يغير عطل Playwright في Replit؛ ممر GitHub Actions جاهز، لكنه غير مُثبت حتى تشغيله.
- **الحالة:** `BLOCKED`.
- **الخطوة التالية الوحيدة، من دون تنفيذها:** دفع المالك للكود وتشغيل workflow ثم إرسال artifact للمراجعة.

---

## 11. مطابقة التنفيذ مع المرجع

- **هل تحقق الهدف الأصلي؟** تحقق تجهيز الممر الخارجي، ولم ينجح إثبات المتصفح داخل Replit.
- **هل اجتازت جميع شروط القبول؟** لا؛ لم يُشغل CI ولم تُلتقط اللقطات.
- **هل تغير شيء غير مصرح به؟** لا.
- **هل بقي افتراض غير مثبت؟** نعم؛ نجاح workflow على GitHub Actions وعدد الـ82 الفعلي.
- **هل يمكن الانتقال للخطوة التالية؟** نعم، فقط بعد قرار/فعل المالك: الدفع ثم تشغيل workflow وإرسال artifact؛ لا تنفيذ تلقائي هنا.

---

## 12. أسطر نهاية الجلسة الخمسة

1. **المرحلة والخطوة الحالية:** `HC-P0 / HC-P0-S2E`.
2. **ما أصبح `VERIFIED` بالدليل:** لا شيء في P0؛ ثبت فقط فشل ramtmp داخل Replit ورمز خروجه `124`.
3. **ما بقي `IMPLEMENTED` فقط:** workflow CI وbaseline script ودليل التشغيل؛ لم تُثبت بتشغيل GitHub Actions.
4. **العائق أو القرار الذي ينتظر المالك:** دفع الكود إلى GitHub، تشغيل workflow، وإرسال artifact `e2e-results`.
5. **الخطوة التالية الوحيدة دون تنفيذها تلقائيًا:** دفع المالك للكود وتشغيل workflow ثم إرسال artifact للمراجعة.