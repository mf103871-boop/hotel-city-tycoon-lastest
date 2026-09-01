# HC-P0-S2A — تقرير مواءمة Chromium المرفق مع Playwright

**التاريخ:** 1 سبتمبر 2026  
**المرحلة:** `HC-P0`  
**الخطوة:** `HC-P0-S2A` فقط  
**الحالة:** `BLOCKED`  
**سبب الحالة:** أزيل نقص المكتبتين من Chromium المرفق، لكن اختبار الإثبات لم ينجح. مع حارس `/dev/shm` وصل التشغيل مرة إلى `page.goto('/')` ثم انتهى بـ`net::ERR_ABORTED`، وأعاد سجل `DEBUG=pw:browser` إظهار timeout أثناء إعداد `page` وفقدان browser context.

---

## 1. فحص المرجع

- **إصدار المرجع:** 1.2.
- **المرحلة الحالية:** HC-P0 — تثبيت خط الأساس.
- **الخطوة الحالية:** HC-P0-S2A.
- **الهدف الواحد:** تشغيل Chromium 151 المرفق مع Playwright 1.62.1 وإثبات الوصول الفعلي للتطبيق قبل المجموعة واللقطات.
- **المشكلة المثبتة:** Chromium المرفق كان يفتقد `libxkbcommon.so.0` و`libgbm.so.1`، وChromium النظامي 138 علق في HC-P0-S2.
- **الاعتماديات المكتملة:** npm والـlockfile والتحققات الرأسية وقياس HC-P0-S2.
- **داخل النطاق:** تبعيات Nix، `ldd`، اختبار إثبات واحد وإعادته المشروطة، حارس `/dev/shm`، التقرير وسجل الحالة.
- **خارج النطاق:** `src/` و`data/` و`package-lock.json` و`package.json` ومنطق الاختبارات والميزات والاقتصاد والأصول البصرية.
- **شروط القبول:** `ldd` بلا `not found`، نجاح اختبار الإثبات، ثم تنفيذ 82 اختبارًا والتقاط خمس لقطات حية.
- **المعلومات الناقصة عند البداية:** توفر اسمي Nix `libgbm` و`libxkbcommon`؛ أثبتت أداة التبعيات توفرهما.

---

## 2. ما نُفذ فعلًا

1. أضيفت حزم Nix `libgbm` و`libxkbcommon` مع إبقاء كل الحزم السابقة.
2. فُحص Chrome التنفيذي داخل `chromium-1234` وحُفظ ناتج `ldd` كاملًا.
3. شُغل اختبار الإثبات بلا `PLAYWRIGHT_CHROMIUM_PATH`.
4. بعد timeout أثناء إعداد `page`، سُجل `df -h /dev/shm`.
5. أضيف حارس `PLAYWRIGHT_DISABLE_DEV_SHM` الحرفي داخل `use`.
6. أُعيد اختبار الإثبات مع `PLAYWRIGHT_DISABLE_DEV_SHM=1`.
7. بعد فشله، أُعيد مرة تشخيصية مع `DEBUG=pw:browser` وحُفظ السجل الكامل.
8. طُبق شرط التوقف؛ لم تُشغل المجموعة الكاملة، ولم يُنشأ سكربت اللقطات، ولم تُلتقط صور.

---

## 3. الحزم المضافة وبيئة Nix النهائية

نجحت أداة تبعيات Replit بالنتيجة:

```text
Successfully installed system dependencies: libgbm, libxkbcommon.
```

الحزمتان اللتان أضيفتا في هذه الخطوة:

```text
libgbm
libxkbcommon
```

لم تكن هناك حاجة إلى البديل `mesa.gbm`.

قسم البيئة النهائي في `/home/runner/workspace/.replit`:

```toml
modules = ["nodejs-24", "python-base-3.13"]

[nix]
channel = "stable-25_05"
packages = ["glib", "nss", "atk", "at-spi2-atk", "gtk3", "alsa-lib", "libdrm", "mesa", "chromium", "libgbm", "libxkbcommon"]
```

إصدارات runtime المثبتة:

```text
Playwright 1.62.1
Google Chrome for Testing 151.0.7922.34
Google Chrome for Testing Headless Shell 151.0.7922.34
```

لم يُستخدم `PLAYWRIGHT_CHROMIUM_PATH` في أي اختبار ضمن HC-P0-S2A.

---

## 4. نتيجة `ldd`

الملف المفحوص:

```text
/home/runner/workspace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
```

الأمر:

```bash
ldd /home/runner/workspace/.cache/ms-playwright/chromium-1234/chrome-linux64/chrome
```

النتيجة:

```text
exit_code=0
not_found_count=0
```

السطور الحاسمة بعد الإصلاح:

```text
libxkbcommon.so.0 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libxkbcommon.so.0
libgbm.so.1 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libgbm.so.1
```

الناتج الحرفي الكامل محفوظ في:

```text
docs/HC-P0-S2A-ldd.txt
```

وقائمة `not found` محفوظة فارغة في:

```text
docs/HC-P0-S2A-ldd-not-found.txt
```

لم تُحتج إعادة فحص ثانية لأن النقص اختفى من المحاولة الأولى.

---

## 5. اختبار الإثبات الأول

تأكدت البيئة أولًا من غياب:

```text
PLAYWRIGHT_CHROMIUM_PATH
PLAYWRIGHT_DISABLE_DEV_SHM
```

الأمر الحرفي:

```bash
npx playwright test --project=desktop -g "boots past the loading screen"
```

النتيجة الحرفية الحاسمة:

```text
Running 1 test using 1 worker

✘  1 [desktop] › tests/e2e/game.spec.ts:38:1 › the game boots past the loading screen (2.5m)

Test timeout of 45000ms exceeded while setting up "page".

1 failed
  [desktop] › tests/e2e/game.spec.ts:38:1 › the game boots past the loading screen
```

بيانات التشغيل:

```text
exit_code=1
duration_ms=165958
```

الأدلة:

```text
docs/HC-P0-S2A-proof-run1.log
docs/HC-P0-S2A-proof-run1.meta
```

لم يصل هذا التشغيل إلى التطبيق.

---

## 6. فحص `/dev/shm`

الأمر:

```bash
df -h /dev/shm
```

الناتج الحرفي:

```text
Filesystem      Size  Used Avail Use% Mounted on
shm             775M     0  775M   0% /dev/shm
```

الدليل:

```text
docs/HC-P0-S2A-dev-shm.txt
```

السعة لم تكن ممتلئة، لكن الحارس أضيف لأن التكليف يشترطه عند تكرر timeout أثناء إعداد `page`.

---

## 7. فرق الإعداد الكامل

الفرق الجديد في `playwright.config.ts` مقارنة بحزمة HC-P0-S2:

```diff
--- HC-P0-S2/playwright.config.ts
+++ HC-P0-S2A/playwright.config.ts
@@ -23,6 +23,9 @@
     ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
       ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
       : {}),
+    ...(process.env.PLAYWRIGHT_DISABLE_DEV_SHM === '1'
+      ? { launchOptions: { args: ['--disable-dev-shm-usage'] } }
+      : {}),
   },
```

بقي حارس `PLAYWRIGHT_CHROMIUM_PATH` السابق كما هو ولم يُحذف.

التعديل المصرح الآخر في `.gitignore`:

```diff
--- HC-P0-S2/.gitignore
+++ HC-P0-S2A/.gitignore
@@ -2,6 +2,8 @@
 dist/
 coverage/
 .vite/
+test-results/
+tsconfig.tsbuildinfo
 *.local
```

---

## 8. اختبار الإثبات مع حارس `/dev/shm`

الأمر الحرفي:

```bash
PLAYWRIGHT_DISABLE_DEV_SHM=1 npx playwright test --project=desktop -g "boots past the loading screen"
```

النتيجة الحرفية الحاسمة:

```text
Running 1 test using 1 worker

✘  1 [desktop] › tests/e2e/game.spec.ts:38:1 › the game boots past the loading screen (1.6m)

Test timeout of 45000ms exceeded.
Tearing down "context" exceeded the test timeout of 45000ms.

Error: page.goto: net::ERR_ABORTED; maybe frame was detached?
Call log:
  - navigating to "http://127.0.0.1:5000/", waiting until "load"

1 failed
  [desktop] › tests/e2e/game.spec.ts:38:1 › the game boots past the loading screen
```

بيانات التشغيل:

```text
exit_code=1
duration_ms=119334
```

الأدلة:

```text
docs/HC-P0-S2A-proof-run2.log
docs/HC-P0-S2A-proof-run2.meta
```

هذا التشغيل تجاوز عائق إنشاء `page` جزئيًا ووصل إلى `page.goto('/')`، لكنه لم يثبت تحميل التطبيق أو ظهور زر `Open hotel`.

---

## 9. سجل `DEBUG=pw:browser`

بعد فشل الإعادة المشروطة شُغل:

```bash
DEBUG=pw:browser PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

أثبت السجل أن Playwright استخدم متصفحه المرفق المطابق، لا Chromium النظامي:

```text
/home/runner/workspace/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
```

السطور الحاسمة:

```text
pw:browser <launched> pid=426

ERROR:dbus/bus.cc:405 Failed to connect to the bus:
Failed to connect to socket /run/dbus/system_bus_socket:
No such file or directory

Test timeout of 45000ms exceeded while setting up "page".
Tearing down "context" exceeded the test timeout of 45000ms.

Error: browserContext.close: Protocol error
(Target.disposeBrowserContext):
Failed to find context with id FD27BEBC551F2BABBCEDCF8AC72DFE0B

1 failed
```

بيانات التشغيل:

```text
exit_code=1
duration_ms=165146
```

السجل الحرفي الكامل:

```text
docs/HC-P0-S2A-probe.log
docs/HC-P0-S2A-probe.meta
```

الاستنتاج المثبت: binary يبدأ ويستجيب بما يكفي لإنشاء قناة Playwright، لكن browser context يختفي أو يصبح غير صالح قبل اكتمال fixture `page`. لا يوجد دليل نجاح وصول إلى التطبيق.

---

## 10. E2E الكامل

لم يُشغل:

```bash
npm run test:e2e
```

سبب عدم التنفيذ: التكليف يربط المجموعة الكاملة بنجاح اختبار الإثبات، ويأمر بالتوقف إذا فشلت إعادة الإثبات مع حارس `/dev/shm`.

| المشروع | المخطط المعروف | المنفذ في المجموعة الكاملة | ناجح | فاشل |
|---|---:|---:|---:|---:|
| `desktop` | 41 | 0 | 0 | 0 |
| `phone` | 41 | 0 | 0 | 0 |
| **الإجمالي** | **82** | **0** | **0** | **0** |

اختبارات الإثبات المنفصلة ليست المجموعة الكاملة: نُفذت ثلاث محاولات لاختبار desktop واحد، وفشلت المحاولات الثلاث.

لم يظهر فشل تطبيقي مؤكد يصلح إضافته إلى سجل المؤجل؛ الفشل حدث في `page`/navigation/browser context قبل إثبات تشغيل التطبيق.

---

## 11. اللقطات وHC-P0-S1-BL-002

لم يُنشأ:

```text
tools/baseline-shots.mjs
```

ولم تُنشأ `docs/baseline-screens/` أو أي صورة، لأن الخطوة 7 مشروطة بنجاح اختبار الإثبات.

| اللقطة المطلوبة | النتيجة |
|---|---|
| الشاشة الرئيسية | غير ملتقطة |
| لوحة البناء | غير ملتقطة |
| متجر الديكور | غير ملتقطة |
| لوحة الإدارة | غير ملتقطة |
| Pixel 7 | غير ملتقطة |

لذلك لا يمكن إغلاق `HC-P0-S1-BL-002`، ويبقى `DEFERRED` حتى يتوفر browser page حي صالح. لم يُستخدم أي مولد صور أو بديل غير حي.

---

## 12. الملفات المعدلة والمنشأة

### تعديلات مصرح بها

- `/home/runner/workspace/.replit`
- `playwright.config.ts`
- `.gitignore`
- `docs/HOTEL_CITY_MASTER_REFERENCE_AR.md`

### أدلة وتقارير جديدة

- `docs/HC-P0-S2A-REPORT.md`
- `docs/HC-P0-S2A-ldd.txt`
- `docs/HC-P0-S2A-ldd-not-found.txt`
- `docs/HC-P0-S2A-dev-shm.txt`
- `docs/HC-P0-S2A-proof-run1.log`
- `docs/HC-P0-S2A-proof-run1.meta`
- `docs/HC-P0-S2A-proof-run2.log`
- `docs/HC-P0-S2A-proof-run2.meta`
- `docs/HC-P0-S2A-probe.log`
- `docs/HC-P0-S2A-probe.meta`

### تحقق القيود

قورنت المسارات مع حزمة HC-P0-S2 وكانت النتيجة:

```text
UNCHANGED src
UNCHANGED data
UNCHANGED tests/e2e
UNCHANGED package-lock.json
UNCHANGED package.json
```

لا يوجد أثر على الحفظ أو الاقتصاد أو الأداء داخل التطبيق؛ لم يتغير كود التطبيق.

---

## 13. قرار الحالة

لا يمكن اعتماد HC-P0-S2A كـ`VERIFIED`:

- نعم: أضيفت المكتبتان المطلوبتان.
- نعم: أصبح `ldd` بلا `not found`.
- نعم: استُخدم Playwright 1.62.1 مع Chromium 151 المرفق.
- نعم: نُفذ اختبار إثبات فعلي ثلاث مرات وفق مسار التوقف.
- لا: لم ينجح اختبار الإثبات.
- لا: لم تُنفذ المجموعة الكاملة.
- لا: لم يبدأ مشروع الهاتف.
- لا: لم تُلتقط اللقطات الخمس.

الحالة الصحيحة: `BLOCKED`.

---

## 14. مطابقة التنفيذ مع المرجع

| شرط المرجع/التكليف | النتيجة |
|---|---|
| تنفيذ HC-P0-S2A وحدها | مطابق |
| إضافة `libgbm` و`libxkbcommon` مع إبقاء الحزم | مطابق |
| `ldd` على Chrome داخل `chromium-1234` | مطابق؛ `not_found_count=0` |
| عدم استخدام `PLAYWRIGHT_CHROMIUM_PATH` | مطابق |
| إبقاء الحارس السابق | مطابق |
| اختبار إثبات واحد قبل المجموعة | مطابق؛ فشل |
| قياس `/dev/shm` ثم إضافة الحارس الحرفي | مطابق |
| إعادة الإثبات مرة واحدة بالحارس | مطابق؛ فشل |
| حفظ `DEBUG=pw:browser` كاملًا بعد الفشل | مطابق |
| التوقف عند فشل الإعادة | مطابق |
| عدم تشغيل المجموعة قبل نجاح الإثبات | مطابق |
| عدم تعديل `src/` أو `data/` أو الحزم أو الاختبارات | مطابق |
| عدم إنشاء صور أو أصول مولدة | مطابق |
| إنشاء سكربت اللقطات بعد نجاح الإثبات فقط | مطابق؛ لم يُنشأ |
| `VERIFIED` فقط بعد المجموعة واللقطات | مطابق؛ الحالة `BLOCKED` |

### تقرير التنفيذ

- **معرف المهمة:** HC-P0-S2A.
- **ما نُفذ فعلًا:** إصلاح ربط المكتبات، ثلاثة تشغيلات إثبات، حارس `/dev/shm`، وسجل debug.
- **ما لم يُنفذ:** E2E الكامل، سكربت اللقطات، اللقطات الخمس، وإغلاق HC-P0-S1-BL-002.
- **الاختبارات الحرفية:** الأوامر الثلاثة موثقة في الأقسام 5 و8 و9.
- **عدد الاختبارات:** اختبار desktop واحد في كل محاولة؛ 0 نجاح و3 فشل. المجموعة 82 لم تُشغل.
- **التحقق البصري:** غير متاح؛ لا توجد لقطة حية.
- **أثر الحفظ:** لا يوجد.
- **أثر الأداء:** لا يوجد تغيير في التطبيق؛ حارس launch اختياري فقط.
- **الانحرافات:** لا يوجد؛ التوقف بعد فشل الإثبات مطلوب صراحة.
- **مشكلات جديدة للمؤجل:** لا يوجد فشل تطبيقي مؤكد؛ عائق البيئة باقٍ في صف P0.
- **حقيقة جديدة للمرجع:** المكتبات لم تعد العائق؛ Chromium 151 يبدأ لكن lifecycle الخاص بـbrowser context/page غير مستقر.
- **الحالة:** `BLOCKED`.
- **الخطوة التالية الوحيدة:** `HC-P0-S2B — عزل اختفاء browser context في Chromium Headless Shell 151 عبر probe أدنى يقارن full Chrome وheadless shell قبل إعادة أي E2E`.

---

## 15. أسطر نهاية الجلسة الخمسة

1. **المرحلة والخطوة الحالية:** `HC-P0 / HC-P0-S2A`.
2. **ما أصبح `VERIFIED` بالدليل:** توفر `libgbm.so.1` و`libxkbcommon.so.0` لـChromium المرفق ونجاح `ldd` بلا `not found`.
3. **ما بقي `IMPLEMENTED` فقط:** حارس `PLAYWRIGHT_DISABLE_DEV_SHM`؛ لم يحقق نجاح اختبار الإثبات.
4. **العائق أو القرار الذي ينتظر المالك:** عائق تقني في lifecycle الخاص بـChromium 151 browser context/page؛ لا يوجد قرار منتج ينتظر المالك.
5. **الخطوة التالية الوحيدة دون تنفيذ:** `HC-P0-S2B — عزل اختفاء browser context في Chromium Headless Shell 151 عبر probe أدنى يقارن full Chrome وheadless shell قبل إعادة أي E2E`.