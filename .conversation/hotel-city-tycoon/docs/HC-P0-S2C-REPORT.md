# HC-P0-S2C — تقرير عزل Playwright Test عن probe المباشر

**التاريخ:** 1 سبتمبر 2026  
**المرحلة:** `HC-P0`  
**الخطوة:** `HC-P0-S2C` فقط  
**الحالة:** `BLOCKED`

**الخلاصة:** لم تنجح أي تركيبة في اختبار Playwright الرسمي أو المنصة المعزولة. T1 أثبت أن تعطيل capture لا يغير timeout، وT2 عزل أن `webServer` المدمج يرفض الخادم القائم لأن `reuseExistingServer: false`، وT3 أثبت أن إزالة `webServer` لا تزيل العطل، وT4 تحت Xvfb علق بلا نتيجة خلال 180 ثانية. لا توجد تركيبة خضراء رسمية، ولذلك لم تُشغل مجموعة 82 ولم تُنشأ اللقطات الخمس.

> **حقيقة S2B الملزمة:** لم يُستخدم `--disable-gpu` في أي تشغيل من S2C، لأن S2B أثبت أنه يكسر التقاط اللقطات.

---

## 1. فحص المرجع

- **إصدار المرجع:** 1.2.
- **المرحلة الحالية:** HC-P0 — تثبيت خط الأساس.
- **الخطوة الحالية:** HC-P0-S2C.
- **الهدف الواحد:** عزل الفرق بين probe المباشر الناجح وفشل fixture في Playwright Test على `channel: 'chromium'`.
- **المشكلة المثبتة التي تعالجها:** Chrome الكامل ينجح في probe حي، بينما Playwright Test يفشل عند إعداد `page`.
- **الاعتماديات المكتملة:** قراءة المرجع وتقرير S2B، Chromium 151، `ldd` نظيف، وprobe حي ناجح سابقًا.
- **ما يدخل في النطاق:** حارس capture، T1، تشخيص API، T2 بخادم يدوي، T3 بإعداد minimal، ثم T4 تحت Xvfb فقط عند الحاجة.
- **ما لا يدخل في النطاق:** `src/` و`data/` و`package.json` و`package-lock.json` ومنطق `tests/e2e` وأي إصلاح وظيفي.
- **شروط القبول:** نجاح الإثبات الرسمي، ثم تشغيل 82 اختبارًا والتقاط اللقطات الخمس قبل اعتماد `VERIFIED`.
- **الأدلة المطلوبة:** سجلات T1–T4، آخر API متجمد، فرق config، تقرير S2C، ومسارات اللقطات إن وجدت.
- **التعارضات أو المعلومات الناقصة:** probe المباشر ينجح، لكن لم يكن معلومًا هل يختلف عنه capture أو webServer أو Playwright runner؛ صُممت T1–T4 لعزلها بالتتابع.

---

## 2. قالب خطة التنفيذ

### الهدف

- **النتيجة المرئية:** جعل اختبار Playwright الرسمي يصل إلى صفحة اللعبة، لا الاكتفاء بنجاح `browser-probe`.
- **خط الأساس:** `docs/HC-P0-S2B-REPORT.md` يثبت نجاح Chrome الكامل في probe الحي وفشل Playwright Test عند إعداد `page`.

### النطاق

- **الملفات المتوقع تعديلها:** `playwright.config.ts` بالحارس المحدد، وملفا config/spec minimal عند الوصول إلى T3، والتقرير والمرجع.
- **الملفات المتوقع إنشاؤها:** `tools/playwright-diag.config.ts` و`tools/diag-spec/min.spec.ts`.
- **التبعيات:** `xvfb-run` فقط إذا فشل T3.
- **ما لن يتغير:** التطبيق، البيانات، الحزم، الاختبارات الأصلية، والرسومات.

### الخطوات

1. إضافة حارس `PLAYWRIGHT_NO_CAPTURE`.
2. تشغيل T1 ثم API diagnostic مرة واحدة عند الفشل.
3. تشغيل T2 بخادم يدوي.
4. تشغيل T3 بإعداد minimal بلا `webServer`.
5. عند فشل T3، تثبيت `xvfb-run` وتشغيل T4.
6. عند أول نجاح رسمي فقط، تشغيل المجموعة ثم اللقطات.

**شرط التوقف:** فشل T4 أو غياب تركيبة رسمية ناجحة يوقف S2C بحالة `BLOCKED`.

### المخاطر وخطة الرجوع

- لا يوجد تغيير في الحفظ أو البيانات.
- لا يوجد تغيير في سلوك التطبيق.
- التراجع يزيل الحارس وملفات التشخيص والتقرير فقط؛ تبقى سجلات الفشل كأدلة.

---

## 3. مطابقة الخطة مع المرجع

- **المرحلة المطابقة:** HC-P0.
- **المشكلة المرجعية التي تعالجها:** إثبات خط أساس متصفح قابل للتكرار قبل العمل الوظيفي.
- **البنود التي لن تلمسها الخطة:** التطبيق، البيانات، الحزم البرمجية، الاختبارات الأصلية، الاقتصاد، الديكور، والأصول.
- **هل تسللت أعمال من مرحلة أخرى؟** لا.
- **هل كل الخطوات قابلة للتحقق؟** نعم.
- **هل توجد افتراضات غير مثبتة؟** نعم؛ نجاح T4 كان غير مثبت قبل تشغيله.
- **هل تحقق الخطة شرط خروج الخطوة؟** لا، لأن الإثبات الرسمي لم ينجح.
- **القرار:** صالحة للتنفيذ.

---

## 4. الحارس الجديد وفرق الإعداد

أضيف في `playwright.config.ts` بعد `trace` و`screenshot` الحاليين، حرفيًا:

```diff
--- HC-P0-S2B/playwright.config.ts
+++ HC-P0-S2C/playwright.config.ts
@@ -20,6 +20,9 @@
     baseURL: `http://127.0.0.1:${PORT}`,
     trace: 'retain-on-failure',
     screenshot: 'only-on-failure',
+    ...(process.env.PLAYWRIGHT_NO_CAPTURE === '1'
+      ? { trace: 'off', screenshot: 'off', video: 'off' }
+      : {}),
     ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
       ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
       : {}),
```

التعديل لم يُغيّر الحارسين السابقين، ولم يُستخدم `PLAYWRIGHT_CHROMIUM_PATH`.

---

## 5. نتيجة T1 — تعطيل capture

الأمر الحرفي:

```bash
env -u PLAYWRIGHT_CHROMIUM_PATH \
  PLAYWRIGHT_FULL_CHROMIUM=1 \
  PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  PLAYWRIGHT_NO_CAPTURE=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

السجل الكامل:

```text
docs/HC-P0-S2C-T1.log
```

الناتج الحرفي:

```text
Running 1 test using 1 worker

✘  1 [desktop] › tests/e2e/game.spec.ts:38:1 › the game boots past the loading screen (1.5m)

Test timeout of 45000ms exceeded while setting up "page".

1 failed
  [desktop] › tests/e2e/game.spec.ts:38:1 › the game boots past the loading screen

exit_code=1
duration_ms=118385
```

**النتيجة:** فشل T1. تعطيل trace/screenshot/video لم يغيّر العطل.

---

## 6. تشخيص API بعد فشل T1

الأمر الحرفي:

```bash
env -u PLAYWRIGHT_CHROMIUM_PATH \
  DEBUG=pw:api,pw:browser* \
  PLAYWRIGHT_FULL_CHROMIUM=1 \
  PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  PLAYWRIGHT_NO_CAPTURE=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

السجل الكامل:

```text
docs/HC-P0-S2C-api.log
```

النداءات التي اكتملت:

```text
pw:api => browserType.launch started
pw:api <= browserType.launch succeeded
pw:api => browser.newContext started
pw:api <= browser.newContext succeeded
```

**آخر نداء API بدأ ولم يكتمل، بالحرف:**

```text
pw:api => browserContext.newPage started
```

بعده ظهر:

```text
pw:api => browserContext.close started
pw:api <= browserContext.close succeeded
pw:api => browser.close started
pw:api <= browser.close succeeded
```

ونتيجة التشغيل:

```text
exit_code=1
duration_ms=114951
Test timeout of 45000ms exceeded while setting up "page".
```

لم يظهر `browserContext.newPage succeeded`.

---

## 7. نتيجة T2 — عزل webServer

شُغل الخادم يدويًا بهذه البيئة:

```bash
HOST=127.0.0.1 PORT=5000 VITE_E2E=1 npm run dev
```

ثم أُعيد أمر T1 نفسه، مع إبقاء الخادم قائمًا. السجل:

```text
docs/HC-P0-S2C-T2.log
docs/HC-P0-S2C-manual-server.log
```

الناتج الحرفي:

```text
manual_server_ready=1
Error: http://127.0.0.1:5000 is already used, make sure that nothing is running on the port/url or set reuseExistingServer:true in config.webServer.

exit_code=1
duration_ms=4357
```

**النتيجة:** فشل T2 قبل إنشاء browser context. عُزل عائق `webServer`: الإعداد الحالي يرفض إعادة استخدام الخادم القائم بسبب `reuseExistingServer: false`.

---

## 8. نتيجة T3 — المنصة المعزولة

أُنشئا الملفان:

```text
tools/playwright-diag.config.ts
tools/diag-spec/min.spec.ts
```

الإعداد المعزول:

- بلا `webServer`.
- بلا trace.
- بلا screenshot.
- `channel: 'chromium'`.
- `launchOptions.args` تحوي `--disable-dev-shm-usage` فقط.
- اختبار واحد يفتح `http://127.0.0.1:5000` ويتحقق من ظهور `body`.

شُغل الخادم اليدوي ثم:

```bash
npx playwright test --config tools/playwright-diag.config.ts
```

السجلات:

```text
docs/HC-P0-S2C-T3.log
docs/HC-P0-S2C-manual-server-T3.log
```

الناتج الحرفي:

```text
manual_server_ready=1

Running 1 test using 1 worker

✘  1 tools/diag-spec/min.spec.ts:3:1 › opens the manually running game (1.2m)

Test timeout of 45000ms exceeded while setting up "page".

1 failed
  tools/diag-spec/min.spec.ts:3:1 › opens the manually running game

exit_code=1
duration_ms=115194
```

**النتيجة:** فشل T3 بنفس نقطة `page` حتى بعد إزالة `webServer` وcapture؛ لذلك لا يكفي تفسير العطل بأنه `webServer` فقط.

---

## 9. نتيجة T4 — Xvfb

بما أن T3 فشل، ثُبتت حزمة النظام عبر أداة التبعيات:

```text
Successfully installed system dependencies: xvfb-run.
```

أضيفت إلى بيئة Nix:

```text
xvfb-run
```

لم تُستخدم `--disable-gpu` في T4.

الأمر الحرفي:

```bash
xvfb-run -a env -u PLAYWRIGHT_CHROMIUM_PATH \
  PLAYWRIGHT_FULL_CHROMIUM=1 \
  PLAYWRIGHT_HEADED=1 \
  PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  PLAYWRIGHT_NO_CAPTURE=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

السجل:

```text
docs/HC-P0-S2C-T4.log
```

الناتج المتاح:

```text
Running 1 test using 1 worker

[controller] shell execution timed out after 180000ms; no Playwright completion output was produced
[controller] exit_code=unavailable
```

**النتيجة:** فشل T4 بالتعليق الخارجي بعد `180000ms` دون نتيجة Playwright نهائية. لم تبقَ عمليات خادم أو متصفح بعد التوقف.

---

## 10. حقيقة منع `--disable-gpu`

تم احترام قرار S2B في كل تشغيل من S2C:

```text
rg -- '--disable-gpu|PROBE_GPU_OFF' docs/HC-P0-S2C-*.log
→ none
```

لم يُستخدم `PROBE_GPU_OFF` أو `--disable-gpu` في T1 أو التشخيص أو T2 أو T3 أو T4. لا يجوز تفسير فشل S2C بأنه ناتج عن تعطيل GPU.

---

## 11. التركيبة الخضراء النهائية

لا توجد تركيبة خضراء رسمية في S2C:

| المسار | النتيجة |
|---|---|
| T1 — config الرئيسي مع capture off | فشل `browserContext.newPage` |
| T2 — config الرئيسي مع خادم يدوي | رفض `webServer` للخادم القائم |
| T3 — config minimal بلا webServer | فشل `browserContext.newPage` |
| T4 — config الرئيسي تحت Xvfb وheaded | timeout خارجي بلا نتيجة |

النجاح الوحيد المتاح قبل S2C كان probe المباشر من S2B، لكنه لا يُعتمد كنجاح Playwright Test ولا يفتح المجموعة.

---

## 12. E2E الكامل

لم يُشغل:

```bash
npm run test:e2e
```

السبب: لم ينجح اختبار الإثبات الرسمي في أي مسار.

| المشروع | المخطط | المنفذ فعليًا | ناجح | فاشل |
|---|---:|---:|---:|---:|
| `desktop` | 41 | 0 | 0 | 0 |
| `phone` | 41 | 0 | 0 | 0 |
| **الإجمالي** | **82** | **0** | **0** | **0** |

لا توجد أسماء فشل تطبيقي؛ كل الفشل حدث أثناء إعداد `page` أو قبل بدء الاختبار.

لم يُضف فشل تطبيقي جديد إلى سجل المؤجل، لأن لا فشلًا وصل إلى منطق التطبيق.

---

## 13. اللقطات وHC-P0-S1-BL-002

لم يُنشأ:

```text
tools/baseline-shots.mjs
docs/baseline-screens/
```

ولا توجد لقطات baseline خمسية. تبقى `HC-P0-S1-BL-002` مؤجلة.

| اللقطة المطلوبة | النتيجة |
|---|---|
| الشاشة الرئيسية | غير ملتقطة |
| لوحة البناء | غير ملتقطة |
| متجر الديكور | غير ملتقطة |
| لوحة الإدارة | غير ملتقطة |
| عرض Pixel 7 | غير ملتقطة |

لم تُولد أي صورة أو رسوم أو sprite أو animation. كما لم تُستخدم لقطة S2B القديمة كبديل عن لقطات S2C.

---

## 14. الملفات والتغييرات

### ملفات S2C الجديدة

```text
tools/playwright-diag.config.ts
tools/diag-spec/min.spec.ts
docs/HC-P0-S2C-T1.log
docs/HC-P0-S2C-api.log
docs/HC-P0-S2C-T2.log
docs/HC-P0-S2C-T3.log
docs/HC-P0-S2C-T4.log
docs/HC-P0-S2C-manual-server.log
docs/HC-P0-S2C-manual-server-T3.log
docs/HC-P0-S2C-REPORT.md
```

### ملفات S2C المعدلة

```text
playwright.config.ts
docs/HOTEL_CITY_MASTER_REFERENCE_AR.md
```

### الحزمة المضافة

```text
xvfb-run
```

### المسارات التي لم تتغير

```text
src/
data/
tests/e2e/
package.json
package-lock.json
```

---

## 15. تقرير التنفيذ

- **معرف المهمة:** HC-P0-S2C.
- **ما نُفذ فعلًا:** حارس capture، T1، تشخيص API، T2، config/spec minimal، T3، تثبيت `xvfb-run`، وT4.
- **ما لم يُنفذ:** E2E الكامل، اختبار الهاتف ضمن المجموعة، `baseline-shots.mjs`، اللقطات الخمس، وإغلاق `HC-P0-S1-BL-002`.
- **الاختبارات التي شُغلت حرفيًا:** T1 فشل، API diagnostic فشل، T2 فشل عند webServer، T3 فشل عند page setup، T4 علق حتى timeout خارجي.
- **عدد الاختبارات:** اختبار Playwright الرسمي 1 فشل؛ اختبار minimal 1 فشل؛ المجموعة 82 مخططًا و0 منفذ.
- **آخر API متجمد:** `pw:api => browserContext.newPage started`.
- **التركيبة الخضراء:** لا توجد تركيبة رسمية خضراء في S2C.
- **التحقق البصري:** لا توجد لقطات baseline؛ النجاح المرئي السابق من S2B ليس اعتمادًا للمجموعة.
- **أثر الحفظ:** لا يوجد.
- **أثر الأداء:** لا يوجد تغيير في التطبيق.
- **الانحرافات:** لا يوجد؛ التوقف بعد فشل T4 مطلوب.
- **مشكلات جديدة للمؤجل:** لا يوجد فشل تطبيقي مؤكد؛ عائق Playwright Test بقي في P0.
- **حقيقة جديدة للمرجع:** إزالة capture وwebServer لا تمنع timeout عند `newPage`، وheaded تحت Xvfb لم ينتج نتيجة.
- **خيار المالك:** نقل E2E إلى بيئة خارجية مثل GitHub Actions أصبح خيارًا مؤجلًا بعد استنفاد T1–T4، وليس تنفيذًا ضمن هذه الخطوة.
- **الحالة:** `BLOCKED`.
- **الخطوة التالية الوحيدة دون تنفيذ:** `HC-P0-S2D — عزل fixture browser داخل runner باستخدام browser fixture وcontext/page يدويين، مع تسجيل launch args وprocess lifecycle`.

---

## 16. مطابقة التنفيذ مع المرجع

| الشرط | النتيجة |
|---|---|
| قراءة المرجع وتقرير S2B قبل العمل | مطابق |
| تنفيذ HC-P0-S2C وحدها | مطابق |
| إضافة حارس `PLAYWRIGHT_NO_CAPTURE` حرفيًا | مطابق |
| تنفيذ T1 وحفظ السجل | مطابق؛ فشل |
| تنفيذ API diagnostic مرة واحدة | مطابق |
| تحديد آخر نداء API غير مكتمل بالحرف | مطابق؛ `browserContext.newPage started` |
| تنفيذ T2 بخادم يدوي | مطابق؛ فشل بسبب `webServer` |
| إنشاء config/spec minimal لـT3 | مطابق |
| تنفيذ T3 مع خادم يدوي | مطابق؛ فشل عند page setup |
| تثبيت `xvfb-run` فقط بعد فشل T3 | مطابق |
| تنفيذ T4 | مطابق؛ timeout خارجي |
| عدم استخدام `--disable-gpu` | مطابق |
| تشغيل E2E الكامل بعد أول نجاح فقط | مطابق؛ لم توجد تركيبة ناجحة |
| إنشاء baseline shots بعد نجاح الإثبات فقط | مطابق؛ لم تُنشأ |
| عدم تعديل src/data/package/الاختبارات | مطابق |
| `VERIFIED` فقط بعد المجموعة واللقطات | مطابق؛ الحالة `BLOCKED` |

**هل تحقق الهدف الأصلي؟** تحقق العزل التشخيصي جزئيًا، ولم يُفتح طريق Playwright Test الرسمي.  
**هل اجتازت جميع شروط القبول؟** لا.  
**هل تغير شيء غير مصرح به؟** لا.  
**هل بقي افتراض غير مثبت؟** نعم؛ سبب توقف `browserContext.newPage` داخل runner نفسه.  
**هل يمكن الانتقال للخطوة التالية؟** نعم، إلى S2D التشخيصية فقط؛ لا يمكن الانتقال إلى E2E أو مرحلة لاحقة.

---

## 17. أسطر نهاية الجلسة الخمسة

1. **المرحلة والخطوة الحالية:** `HC-P0 / HC-P0-S2C`.
2. **ما أصبح `VERIFIED` بالدليل:** لا توجد تركيبة Playwright Test رسمية؛ فقط تم تثبيت أن T1–T4 لم تحقق بوابة القبول.
3. **ما بقي `IMPLEMENTED` فقط:** حارس capture وملفا المنصة المعزولة؛ لم ينجح `newPage` داخل runner.
4. **العائق أو القرار الذي ينتظر المالك:** عزل browser fixture/process lifecycle؛ خيار GitHub Actions مؤجل ومذكور، ولم يُنفذ.
5. **الخطوة التالية الوحيدة دون تنفيذ:** `HC-P0-S2D — عزل fixture browser داخل runner باستخدام browser fixture وcontext/page يدويين، مع تسجيل launch args وprocess lifecycle`.