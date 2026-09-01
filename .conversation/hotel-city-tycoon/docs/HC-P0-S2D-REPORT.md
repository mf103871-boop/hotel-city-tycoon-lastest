# HC-P0-S2D — تقرير التشخيص البروتوكولي وعلاجات Playwright

**التاريخ:** 1 سبتمبر 2026  
**المرحلة:** `HC-P0` — تثبيت خط الأساس  
**الخطوة:** `HC-P0-S2D` فقط  
**الحالة:** `BLOCKED`

## الخلاصة التنفيذية

اكتمل التشخيص المطلوب والعلاجات الثلاثة دون أي تعديل تطبيقي. العطل في runner أعمق من capture أو `webServer` أو proxy:

- runner أطلق Chrome ثم أرسل `Browser.getVersion`، لكنه لم يتلقَّ الرد ولم يصل إلى `Target.createTarget`.
- probe المباشر أطلق نفس Chrome وتلقى رد `Browser.getVersion`، ثم أرسل `Target.createTarget` وتلقى الرد، وظهرت جلسة target.
- عينات `ps` أثناء تجمد runner أظهرت Chrome بحالتي `D` و`Dl`، ولم تظهر `Z`.
- M1 وM2 وM3 جميعها علقت دون نتيجة Playwright خلال 180 ثانية.

لا توجد تركيبة Playwright Test خضراء. لذلك لم تُشغّل مجموعة الـ82 ولم تُنشأ اللقطات الخمس، وتبقى `HC-P0-S1-BL-002` مؤجلة.

> لم يُستخدم `--disable-gpu` في أي تشغيل من S2D.

---

## 1. فحص المرجع

- **إصدار المرجع:** 1.2.
- **المرحلة الحالية:** HC-P0 — تثبيت خط الأساس.
- **الخطوة الحالية:** HC-P0-S2D.
- **الهدف الواحد:** تشخيص تجمد `browserContext.newPage` داخل Playwright Test ومقارنته بالـprobe المباشر، ثم تجربة M1 وM2 وM3 بالتسلسل.
- **الحقائق المعتمدة من S2B/S2C:** سطر إطلاق Chrome متطابق، `channel` مطبق داخل runner، وS2C أثبت أن إزالة capture و`webServer` لا تمنع التجمد.
- **النطاق:** protocol runner، ثلاث عينات عمليات أثناء التجمد، protocol probe، M1، M2، M3.
- **خارج النطاق:** `src/` و`data/` و`package.json` و`package-lock.json` ومنطق `tests/e2e` وأي إصلاح وظيفي.
- **بوابة التقدم:** لا E2E كاملة ولا baseline shots قبل نجاح اختبار الإثبات.
- **القاعدة الملزمة:** لا `--disable-gpu`، ولا خادم يدوي مع الإعداد الرئيسي.

---

## 2. قالب الخطة

### الهدف

تحديد أول رسالة بروتوكولية يتوقف عندها runner، ثم معرفة ما إذا كان `GSETTINGS_BACKEND=memory` أو `--no-proxy-server` يزيل التوقف.

### التعديلات المسموحة

1. حارس `PLAYWRIGHT_EXTRA_ARGS` واحد في `playwright.config.ts`.
2. سجلات التشخيص المطلوبة.
3. لا يُنشأ `tools/baseline-shots.mjs` إلا بعد نجاح الإثبات؛ لم يُنشأ.

### التنفيذ

1. runner مع `DEBUG=pw:protocol,pw:browser*`.
2. ثلاث عينات `ps` بفواصل خمس ثوانٍ أثناء التجمد.
3. probe اللعبة الحية بنفس debug.
4. M1: `GSETTINGS_BACKEND=memory`.
5. M2: `PLAYWRIGHT_EXTRA_ARGS=--no-proxy-server`.
6. M3: المتغيران معًا.
7. عند فشل الثلاثة: `BLOCKED` وخياران مؤجلان للمالك، دون تنفيذ.

### مخاطر الرجوع

- لا توجد تغييرات في التطبيق أو البيانات.
- يمكن إزالة حارس M2 وملفات config/spec التشخيصية إذا قرر المالك ذلك.
- السجلات والتقرير أدلة غير تشغيلية.

---

## 3. مطابقة الخطة مع المرجع

- **المرحلة المطابقة:** HC-P0.
- **المشكلة المطابقة:** عدم وجود إثبات Playwright Test قابل للتكرار.
- **التغييرات الوظيفية:** لا شيء.
- **هل شُغلت المجموعة قبل بوابة النجاح؟** لا.
- **هل أُنشئت لقطات baseline قبل بوابة النجاح؟** لا.
- **هل استُخدم `--disable-gpu`؟** لا.
- **هل شُغل خادم يدوي مع الإعداد الرئيسي؟** لا؛ استُخدم الخادم اليدوي للـprobe المباشر فقط.
- **افتراض يحتاج اختبارًا:** أثر GSettings وproxy على قناة browser transport.
- **القرار:** الخطة مطابقة وقابلة للتحقق.

---

## 4. تشخيص runner البروتوكولي

### الأمر

```bash
env -u PLAYWRIGHT_CHROMIUM_PATH \
  DEBUG=pw:protocol,pw:browser* \
  PLAYWRIGHT_FULL_CHROMIUM=1 \
  PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  PLAYWRIGHT_NO_CAPTURE=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

### السجل

```text
docs/HC-P0-S2D-protocol-runner.log
```

### التسلسل الفعلي

```text
pw:browser <launched> pid=960
pw:protocol SEND ► {"id":1,"method":"Browser.getVersion"}
```

لم يظهر بعد ذلك أي:

```text
pw:protocol ◀ RECV {"id":1,...}
```

ولم يظهر في السجل:

```text
Target.createTarget
Target.targetCreated
targetCreated
```

كما لم يظهر رد `Browser.getVersion`. انتهت العملية الفرعية داخليًا عند timeout أداة التشغيل:

```text
runner_exit_code=124
runner_duration_ms=164874
```

**موضع انقطاع المحادثة بالحرف:**

```text
pw:protocol SEND ► {"id":1,"method":"Browser.getVersion"} +0ms
```

هذه نقطة أسبق من `browserContext.newPage` التي ظهرت في تشخيص S2C ذي debug API؛ في S2D، تفعيل protocol logging جعل التوقف المرئي عند أول طلب Browser transport.

---

## 5. عينات العمليات أثناء التجمد

### السجل

```text
docs/HC-P0-S2D-ps-samples.txt
```

أُخذت ثلاث عينات بفاصل خمس ثوانٍ:

```text
--- sample_1 (after runner freeze) ---
    PID    PPID STAT WCHAN  COMMAND
    960     947 Dsl  wake_b chrome
    962       1 Sl   do_epo chrome_crashpad
    962       1 Sl   timerq chrome_crashpad
    964       1 S    do_epo chrome_crashpad
    967     960 S    poll_s chrome
    968     960 S    poll_s chrome
```

```text
--- sample_2 (five seconds later) ---
    PID    PPID STAT WCHAN  COMMAND
    960     947 Dsl  wake_b chrome
    962       1 Sl   do_epo chrome_crashpad
    962       1 Sl   timerq chrome_crashpad
    964       1 S    do_epo chrome_crashpad
    967     960 S    poll_s chrome
    968     960 S    poll_s chrome
    992     967 Dl   blk_fl chrome
```

```text
--- sample_3 (five seconds later) ---
    PID    PPID STAT WCHAN  COMMAND
```

### التفسير المقيد بالأدلة

- ظهرت عمليات Chrome بحالة `D` في العينة الأولى.
- ظهرت عملية Chrome بحالة `Dl` في العينة الثانية.
- لم تظهر حالة `Z`.
- لم يظهر process مستقل باسم network service، ولم تعرض هذه العينات معرف network service قابلًا للمقارنة أو متبدلًا.
- اختفت عمليات Chrome من العينة الثالثة بعد انتهاء/إيقاف العملية.

---

## 6. probe المباشر للمقارنة

### الأمر

شُغل probe اللعبة الحية كما في S2B مع خادم Vite مؤقت للـprobe فقط، وبلا `--disable-gpu`:

```bash
env -u PLAYWRIGHT_CHROMIUM_PATH \
  DEBUG=pw:protocol,pw:browser* \
  PROBE_CHANNEL=chromium \
  PROBE_URL=http://127.0.0.1:5000 \
  node tools/browser-probe.mjs
```

### السجل

```text
docs/HC-P0-S2D-protocol-probe.log
```

### التسلسل المقابل

```text
pw:protocol SEND ► {"id":1,"method":"Browser.getVersion"}
pw:protocol ◀ RECV {"id":1,...}
pw:protocol SEND ► {"id":2,"method":"Target.setAutoAttach"}
pw:protocol SEND ► {"id":3,"method":"Target.createBrowserContext"}
pw:protocol SEND ► {"id":4,"method":"Browser.setDownloadBehavior"}
pw:protocol SEND ► {"id":5,"method":"Target.createTarget",...}
pw:protocol ◀ RECV {"id":5,"result":...}
```

كما ظهر:

```text
"method":"Target.attachedToTarget"
```

ولم يظهر event حرفي باسم `Target.targetCreated` في هذا السجل؛ البديل البروتوكولي المثبت هو رد `Target.createTarget` ثم `Target.attachedToTarget`.

### نتيجة probe الحالية

وصل probe إلى navigation وأكمل إنشاء target، لكنه فشل لاحقًا في screenshot:

```text
[probe] screenshot: ERROR
page.screenshot: Timeout 30000ms exceeded.
```

ثم أغلق السياق والمتصفح. هذا لا يلغي حقيقة المقارنة عند نقطة browser transport؛ لكنه يعني أن تشغيل S2D الحالي ليس probe أخضر كاملًا. النجاح الأخضر السابق للـprobe الحي موثق في S2B، ولا يُعامل كنجاح Playwright Test.

### المقارنة

| النقطة | runner | probe |
|---|---|---|
| Chrome launch | تم | تم |
| `Browser.getVersion` | أُرسل بلا رد | أُرسل ووصل الرد |
| `Target.createTarget` | لم يُرسل | أُرسل ووصل الرد |
| target event | لا يوجد | `Target.attachedToTarget` |
| navigation | لم يبدأ | بدأ ووصل رد document |
| نهاية التشغيل | تعليق | screenshot timeout ثم إغلاق |

---

## 7. العلاج M1 — GSettings

### الأمر

```bash
env -u PLAYWRIGHT_CHROMIUM_PATH \
  GSETTINGS_BACKEND=memory \
  PLAYWRIGHT_FULL_CHROMIUM=1 \
  PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  PLAYWRIGHT_NO_CAPTURE=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

### السجل والنتيجة

```text
docs/HC-P0-S2D-M1.log
```

```text
Running 1 test using 1 worker

[controller] shell execution timed out after 180000ms; no Playwright completion output was produced
[controller] exit_code=unavailable
```

**M1:** فشل/تعليق. لم تُفتح المجموعة.

---

## 8. العلاج M2 — no proxy

أُضيف في `playwright.config.ts` داخل `use` بعد الحراس الحاليين هذا الحارس فقط، حرفيًا:

```ts
...(process.env.PLAYWRIGHT_EXTRA_ARGS
  ? { launchOptions: { args: ['--disable-dev-shm-usage', ...process.env.PLAYWRIGHT_EXTRA_ARGS.split(' ')] } }
  : {}),
```

### الأمر

```bash
env -u PLAYWRIGHT_CHROMIUM_PATH \
  PLAYWRIGHT_EXTRA_ARGS=--no-proxy-server \
  PLAYWRIGHT_FULL_CHROMIUM=1 \
  PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  PLAYWRIGHT_NO_CAPTURE=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

### السجل والنتيجة

```text
docs/HC-P0-S2D-M2.log
```

```text
Running 1 test using 1 worker

[controller] shell execution timed out after 180000ms; no Playwright completion output was produced
[controller] exit_code=unavailable
```

**M2:** فشل/تعليق. إضافة `--no-proxy-server` لم تُنتج ردًا أو نجاحًا.

---

## 9. العلاج M3 — GSettings وno proxy

### الأمر

```bash
env -u PLAYWRIGHT_CHROMIUM_PATH \
  GSETTINGS_BACKEND=memory \
  PLAYWRIGHT_EXTRA_ARGS=--no-proxy-server \
  PLAYWRIGHT_FULL_CHROMIUM=1 \
  PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  PLAYWRIGHT_NO_CAPTURE=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

### السجل والنتيجة

```text
docs/HC-P0-S2D-M3.log
```

```text
Running 1 test using 1 worker

[controller] shell execution timed out after 180000ms; no Playwright completion output was produced
[controller] exit_code=unavailable
```

**M3:** فشل/تعليق. فشلت العلاجات الثلاثة، ولذلك يتوقف S2D هنا بحالة `BLOCKED`.

---

## 10. E2E واللقطات

لم تُشغّل المجموعة الكاملة لأن اختبار الإثبات لم ينجح:

| المشروع | المخطط | المنفذ | ناجح | فاشل |
|---|---:|---:|---:|---:|
| `desktop` | 41 | 0 | 0 | 0 |
| `phone` | 41 | 0 | 0 | 0 |
| **الإجمالي** | **82** | **0** | **0** | **0** |

لم يُنشأ `tools/baseline-shots.mjs`، ولم تُنشأ `docs/baseline-screens/`، ولم تُولد أي صور أو رسوم أو sprite sheets أو animation.

تبقى `HC-P0-S1-BL-002` مؤجلة.

---

## 11. التغييرات والملفات

### تعديل الكود الوحيد في S2D

```text
playwright.config.ts
```

والإضافة الوحيدة هي حارس `PLAYWRIGHT_EXTRA_ARGS` المبين في القسم 8.

### أدلة S2D

```text
docs/HC-P0-S2D-protocol-runner.log
docs/HC-P0-S2D-ps-samples.txt
docs/HC-P0-S2D-protocol-probe.log
docs/HC-P0-S2D-M1.log
docs/HC-P0-S2D-M2.log
docs/HC-P0-S2D-M3.log
docs/HC-P0-S2D-REPORT.md
```

### المسارات غير المعدلة

```text
src/
data/
package.json
package-lock.json
tests/e2e/
```

---

## 12. القراران المؤجلان للمالك — دون تنفيذ

### الخيار A — نقل E2E إلى GitHub Actions

مخطط workflow مقترح نصًا فقط، ولم يُنشأ أو يُنفذ:

```text
name: Hotel City Tycoon E2E

on:
  workflow_dispatch:
  push:
    branches: [main]

jobs:
  e2e:
    runs-on: ubuntu-24.04
    steps:
      - checkout
      - setup Node.js 24 with npm cache
      - npm ci
      - install Playwright Chromium and Linux dependencies
      - run the proof test for desktop
      - if proof passes, run the full 82-test matrix
      - upload test-results, protocol logs, and baseline screenshots
```

ميزة هذا الخيار: فصل browser transport عن بيئة Replit الحالية مع الاحتفاظ بالإثبات كسجل CI قابل للتكرار.

### الخيار B — HC-P0-S2E

تشخيص أعمق داخل runner، دون إصلاح التطبيق:

- اختبار `browser` fixture فقط بدل `page` fixture.
- إنشاء `context` و`page` يدويًا داخل جسم الاختبار.
- تسجيل lifecycle كامل للعمليات وlaunch arguments.
- مقارنة `browser.newContext()` و`context.newPage()` داخل نفس worker.
- عدم تشغيل E2E الكاملة أو baseline shots قبل نجاح الإثبات.

لم يُنفذ أي من الخيارين؛ هما قراران مؤجلان فقط.

---

## 13. تقرير التنفيذ

- **معرف المهمة:** HC-P0-S2D.
- **ما نُفذ:** فحص المرجع، خطة التنفيذ، مطابقة الخطة، protocol runner، ثلاث عينات عمليات، protocol probe، M1، M2، M3.
- **ما لم يُنفذ:** E2E الكاملة، baseline shots، GitHub Actions، S2E.
- **آخر نقطة runner:** `pw:protocol SEND ► {"id":1,"method":"Browser.getVersion"} +0ms`.
- **هل أرسل runner `Target.createTarget`؟** لا.
- **هل وصل رد أو event target في runner؟** لا.
- **هل أرسل probe `Target.createTarget`؟** نعم.
- **هل وصل رد probe؟** نعم، رد `id=5`.
- **هل ظهر `targetCreated` حرفيًا؟** لا؛ ظهر `Target.attachedToTarget`.
- **حالة العمليات:** `D` في sample 1، و`Dl` في sample 2، لا `Z`، ولا network service process مستقل قابل للتتبع.
- **M1:** timeout خارجي بعد 180000ms.
- **M2:** timeout خارجي بعد 180000ms.
- **M3:** timeout خارجي بعد 180000ms.
- **المجموعة:** مخطط 82، منفذ 0.
- **اللقطات:** 0 من 5.
- **فشل تطبيقي جديد:** لا يوجد.
- **أثر الحفظ:** لا يوجد.
- **أثر الأداء:** لا يوجد تعديل في التطبيق.
- **حالة الخطوة:** `BLOCKED`.

---

## 14. مطابقة التنفيذ مع المرجع

| الشرط | النتيجة |
|---|---|
| قراءة المرجع وتقرير S2C قبل العمل | مطابق |
| تنفيذ S2D وحدها | مطابق |
| runner protocol مرة واحدة | مطابق |
| ثلاث عينات `ps` بفاصل خمس ثوانٍ | مطابق |
| probe protocol للمقارنة | مطابق؛ تقدم بروتوكولي ثم فشل screenshot متأخر |
| تحديد موضع انقطاع البروتوكول بالحرف | مطابق |
| تحديد رد/event target | مطابق |
| تجربة M1 مرة واحدة | مطابق؛ timeout |
| إضافة حارس M2 الحرفي | مطابق |
| تجربة M2 مرة واحدة | مطابق؛ timeout |
| تجربة M3 مرة واحدة | مطابق؛ timeout |
| عدم استخدام `--disable-gpu` | مطابق |
| عدم تشغيل خادم يدوي مع config الرئيسي | مطابق |
| عدم تشغيل المجموعة قبل نجاح الإثبات | مطابق |
| عدم إنشاء baseline shots قبل نجاح الإثبات | مطابق |
| عدم تعديل src/data/package/tests | مطابق |
| التوقف بعد فشل M1/M2/M3 | مطابق |

**هل تحقق الهدف؟** تحقق العزل البروتوكولي، ولم ينجح العلاج.  
**هل تحققت شروط `VERIFIED`؟** لا.  
**هل يوجد تغيير غير مصرح؟** لا.  
**هل توجد مشكلة تطبيقية جديدة؟** لا.  
**ما القرار التالي؟** ينتظر اختيار المالك بين الخيارين المؤجلين؛ لا تُنفذ أي منهما ضمن S2D.

---

## 15. أسطر نهاية الجلسة الخمسة

1. **المرحلة والخطوة الحالية:** `HC-P0 / HC-P0-S2D`.
2. **ما أصبح `VERIFIED` بالدليل:** العزل البروتوكولي فقط: runner يتوقف عند رد `Browser.getVersion` المفقود، بينما probe يصل إلى `Target.createTarget`.
3. **ما بقي `IMPLEMENTED` فقط:** حارس `PLAYWRIGHT_EXTRA_ARGS`؛ لم يثبت أي علاج.
4. **العائق أو القرار الذي ينتظر المالك:** اختيار نقل E2E إلى GitHub Actions أو تنفيذ HC-P0-S2E.
5. **الخطوة التالية الوحيدة دون تنفيذ:** قرار المالك بين الخيارين المؤجلين؛ لا تشغيل E2E أو baseline shots قبل مسار إثبات ناجح.