# HC-P0-S2 — تقرير إزالة عائق Chromium وتشغيل Playwright

**التاريخ:** 1 سبتمبر 2026  
**المرحلة:** `HC-P0`  
**الخطوة:** `HC-P0-S2` فقط  
**الحالة:** `BLOCKED`  
**سبب الحالة:** أزيل عائق المكتبات الديناميكية، لكن Chromium النظامي لا يُكمل مصافحة Playwright/CDP ولا يتيح إنشاء `page`؛ لذلك لم تصل الاختبارات إلى التطبيق ولم يمكن التقاط لقطات حية.

---

## 1. النطاق والقيود

نُفذت هذه الخطوة لإزالة عائق Chromium المثبت في `HC-P0-S1`، وتشغيل اختبارات Playwright فعليًا، ثم التقاط خمس لقطات مرجعية من جلسة متصفح حية إذا أصبح المتصفح متاحًا.

القيود التي حوفظ عليها:

- لم يتغير أي ملف داخل `src/`.
- لم يتغير أي ملف داخل `data/`.
- لم يتغير `package-lock.json`.
- لم يتغير `package.json`.
- لم يتغير أي ملف داخل `tests/e2e/`.
- لم يتغير منطق الاختبارات.
- التعديل البرمجي الوحيد هو الحارس المطلوب داخل `playwright.config.ts`.
- لم تُولد أي صورة أو رسمة أو sprite sheet أو animation.
- لم تُصلح أي ميزة أو منطق اقتصاد أو فشل تطبيقي.

قورنت هذه المسارات مع أرشيف التسليم السابق `hotel-city-tycoon-HC-P0-S1.zip` باستخدام `diff -qr`، ولم يظهر فرق في `src/` أو `data/` أو `tests/e2e/` أو `package-lock.json` أو `package.json` أو ملف `.replit` الخاص بالمشروع.

---

## 2. التشخيص قبل الإصلاح

لم يكن cache الفعلي في `~/.cache/ms-playwright`، بل في:

```text
/home/runner/workspace/.cache/ms-playwright
```

كان Chromium المحمّل من Playwright موجودًا في مجلدي `chromium-1234` و`chromium_headless_shell-1234`.

أظهر `ldd` قبل الإصلاح مكتبتين مفقودتين:

```text
libxkbcommon.so.0 => not found
libgbm.so.1 => not found
```

الأدلة:

- `docs/HC-P0-S2-ldd-before.txt`
- `docs/HC-P0-S2-ldd-before-not-found.txt`

---

## 3. الإجراء المنفذ

ثُبتت حزمة Nix النظامية:

```text
chromium
```

تم ذلك عبر مدير تبعيات Replit. الملف الذي أنشأته/عدلته الأداة هو ملف البيئة في جذر مساحة العمل:

```text
/home/runner/workspace/.replit
```

وأصبح قسم Nix فيه:

```toml
[nix]
channel = "stable-25_05"
packages = ["glib", "nss", "atk", "at-spi2-atk", "gtk3", "alsa-lib", "libdrm", "mesa", "chromium"]
```

لم يتغير `hotel-city-tycoon/.replit` مقارنة بأرشيف HC-P0-S1.

مسار Chromium:

```text
/nix/store/qa9cnw4v5xkxyip6mb9kxqfq1z4x2dx1-chromium-138.0.7204.100/bin/chromium
```

مسار الـbinary الحقيقي:

```text
/nix/store/884ygjschxqkrkpkrhq83bicvzgj7vb8-chromium-unwrapped-138.0.7204.100/libexec/chromium/chromium
```

الإصدار:

```text
Chromium 138.0.7204.100
```

نجح `chromium --version` برمز خروج `0`.

بعد التثبيت لم يُظهر `ldd` على الـbinary الحقيقي أي `not found`. الأدلة:

- `docs/HC-P0-S2-ldd-after.txt`
- `docs/HC-P0-S2-ldd-after-not-found.txt`، وهو فارغ كما يجب.
- `docs/HC-P0-S2-chromium-path.txt`
- `docs/HC-P0-S2-chromium-realpath.txt`
- `docs/HC-P0-S2-chromium-version.txt`

---

## 4. فرق `playwright.config.ts` الكامل

هذا هو الفرق الوحيد مقارنة بأرشيف HC-P0-S1:

```diff
--- HC-P0-S1/playwright.config.ts
+++ HC-P0-S2/playwright.config.ts
@@ -20,6 +20,9 @@
     baseURL: `http://127.0.0.1:${PORT}`,
     trace: 'retain-on-failure',
     screenshot: 'only-on-failure',
+    ...(process.env.PLAYWRIGHT_CHROMIUM_PATH
+      ? { launchOptions: { executablePath: process.env.PLAYWRIGHT_CHROMIUM_PATH } }
+      : {}),
   },
   projects: [
     { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
```

لم يُضف `chromiumSandbox: false`؛ لا توجد رسالة فشل محصورة في sandbox أو zygote أو namespaces، كما أن سجل الإطلاق يثبت أن Playwright مرر `--no-sandbox` أصلًا. إضافته في هذه الحالة لن تعالج العطل وستتجاوز الشرط المحدد للمهمة.

---

## 5. تشغيل Playwright الفعلي

### 5.1 المخطط

نجح أمر القائمة:

```bash
PLAYWRIGHT_CHROMIUM_PATH="$(command -v chromium)" npx playwright test --list
```

والنتيجة:

```text
Total: 82 tests in 2 files
```

التوزيع:

| المشروع | المخطط |
|---|---:|
| `desktop` | 41 |
| `phone` / Pixel 7 | 41 |
| **الإجمالي** | **82** |

القائمة الكاملة محفوظة في `docs/HC-P0-S2-e2e-list.txt`.

### 5.2 الأمر المطلوب

شُغل الأمر المحدد حرفيًا:

```bash
PLAYWRIGHT_CHROMIUM_PATH="$(command -v chromium)" npm run test:e2e
```

بدأ Playwright التنفيذ الفعلي وظهر:

```text
Running 82 tests using 1 worker
```

استمر التشغيل المرصود `47m02s`. لم يُعد الأمر رمز خروج طبيعيًا؛ أُوقف بـ`SIGTERM` ثم `SIGKILL` بعد تكرر العطل نفسه في كل حالة مكتملة، وبعد أن أثبت probe مستقل سبب العائق نفسه. لم يكن استمرار 63 حالة إضافية سيصل إلى التطبيق؛ كل حالة كانت تعيد إنشاء Chromium ثم تنتهي في إعداد fixture قبل `page.goto`.

| المشروع | مخطط | مكتمل ومسجل من reporter | ناجح | فاشل | حالة إضافية متوقفة | لم يبدأ |
|---|---:|---:|---:|---:|---:|---:|
| `desktop` | 41 | 18 | 0 | 18 | 1 | 22 |
| `phone` | 41 | 0 | 0 | 0 | 0 | 41 |
| **الإجمالي** | **82** | **18** | **0** | **18** | **1** | **63** |

الحالة التاسعة عشرة أنشأت `error-context.md` بالعطل نفسه قبل الإيقاف، لكنها لم تصل إلى سطر reporter النهائي؛ لذلك لم تُحسب ضمن الحالات الثماني عشرة المكتملة.

الأدلة:

- `docs/HC-P0-S2-e2e-full.log`
- `docs/HC-P0-S2-e2e-full.meta`
- `test-results/game-the-game-starts-even-when-storage-is-unavailable-desktop/error-context.md`

### 5.3 الحالات الفاشلة المسجلة

كل الحالات الآتية فشلت في إعداد fixture `page` قبل الوصول إلى منطق التطبيق:

1. `the game boots past the loading screen`
2. `a renderer initialises and says which one`
3. `the room art actually loads`
4. `no errors reach the console on a clean boot`
5. `the shift countdown ticks every second`
6. `guests appear once the hotel is open`
7. `the build menu lists every room and explains what is locked`
8. `building a room adds it to the hotel`
9. `tapping a room opens its sheet, and decorating moves the meter`
10. `the objective card appears and advances when claimed`
11. `a facility can be built and staffed`
12. `characters are drawn, not left as placeholder shapes`
13. `the debug badge can be turned on in a deployed build`
14. `switching to Arabic sets the document direction`
15. `the game is operable with reduced motion`
16. `every control can be reached and named`
17. `controls are large enough to hit on a phone`
18. `a render error shows a recovery screen, not a blank page`

الحالة التي كانت جارية عند الإيقاف:

```text
the game starts even when storage is unavailable
```

رسالة الخطأ المتكررة:

```text
Test timeout of 45000ms exceeded while setting up "page".
```

وبعض الحالات أضافت:

```text
Tearing down "context" exceeded the test timeout of 45000ms.
```

لا تُصنف هذه النتائج كعيوب تطبيقية؛ لم يُنشأ `page` ولم تُنفذ `page.goto('/')`.

---

## 6. تشخيص عائق الإطلاق/الاتصال

نفذ probe مستقل `chromium.launch()` بالمسار نفسه وبـ`DEBUG=pw:browser`.

سجل Playwright إنشاء process:

```text
<launched> pid=2482
```

لكنه لم يحصل على قناة المتصفح، وانتهى:

```text
browserType.launch: Timeout 30000ms exceeded.
```

سطر الإطلاق الكامل يثبت وجود:

```text
--no-sandbox
--remote-debugging-pipe
--headless
```

كما أظهر فحص العمليات أثناء التشغيل أن عملية Chromium الرئيسية دخلت حالة انتظار I/O:

```text
D / blk_flush_plug
```

وفشل فحص CLI المباشر أيضًا:

```bash
timeout 30s chromium --headless=new --no-sandbox --disable-gpu \
  --dump-dom http://127.0.0.1:5000/
```

برمز `124` ومن دون DOM.

الأدلة:

- `docs/HC-P0-S2-browser-probe.log`
- `docs/HC-P0-S2-browser-probe-no-audit.log`
- `docs/HC-P0-S2-chromium-cli-stderr.log`

الاستنتاج المحدد: **عائق المكتبات الديناميكية أزيل، لكن Chromium 138 النظامي يعلق قبل إكمال قناة remote-debugging/CDP في بيئة التشغيل الحالية.**

---

## 7. اللقطات المرجعية الحية

لم تُلتقط لقطات ولم يُنشأ `docs/baseline-screens/` لأن Playwright لم يحصل على `Browser`/`Page` صالحين. لذلك كانت النتائج:

| اللقطة المطلوبة | النتيجة | السبب |
|---|---|---|
| الشاشة الرئيسية | غير ملتقطة | فشل `chromium.launch()` في إكمال مصافحة CDP |
| لوحة البناء | غير ملتقطة | لا يوجد `page` للتنقل |
| متجر الديكور | غير ملتقطة | لا يوجد `page` للتنقل |
| لوحة الإدارة | غير ملتقطة | لا يوجد `page` للتنقل |
| Pixel 7 | غير ملتقطة | مشروع `phone` لم يبدأ |

لم يُستخدم أي بديل مولد أو صورة مصطنعة لأن المرجع يشترط أن تأتي اللقطات من جلسة المتصفح الحية.

---

## 8. الأعمال المؤجلة

لم يظهر فشل تطبيقي يمكن إضافته إلى سجل الأعمال المؤجلة؛ جميع الحالات توقفت قبل تحميل التطبيق. لذلك لم يُضف بند عيب تطبيقي جديد إلى الجدول.

عائق البنية نفسه موثق في صف P0 بسجل الحالة الحالي، ولا يُخفى كبند مؤجل.

---

## 9. قرار الحالة

لا يمكن اعتماد HC-P0-S2 كـ`VERIFIED` للأسباب الآتية:

- نعم: أزيلت مكتبات `ldd` المفقودة.
- نعم: ثُبت Chromium النظامي وسُجل مساره وإصداره.
- نعم: بدأ Playwright 82 حالة مخططة وشغّل حالات فعلية.
- لا: لم يُكمل Chromium مصافحة Playwright/CDP.
- لا: لم تصل أي حالة إلى التطبيق.
- لا: لم يبدأ مشروع الهاتف.
- لا: لم تُلتقط اللقطات الخمس الحية.

الحالة الصحيحة: `BLOCKED`.

---

## 10. مطابقة التنفيذ مع المرجع

| شرط المرجع/المهمة | المطابقة |
|---|---|
| تنفيذ HC-P0-S2 فقط | مطابق |
| عدم تعديل `src/` أو `data/` | مطابق؛ لا فرق عن أرشيف HC-P0-S1 |
| عدم تعديل `package-lock.json` | مطابق؛ لا فرق عن أرشيف HC-P0-S1 |
| عدم تعديل منطق `tests/e2e` | مطابق؛ لا فرق عن أرشيف HC-P0-S1 |
| الحارس المحدد فقط في `playwright.config.ts` | مطابق؛ الفرق الكامل موثق |
| عدم إضافة `chromiumSandbox: false` إلا لدليل sandbox/zygote/namespaces | مطابق؛ لم يظهر الدليل وPlaywright استخدم `--no-sandbox` |
| تشغيل Playwright فعليًا | مطابق جزئيًا؛ 18 حالة مكتملة وحالة تاسعة عشرة توقفت، ثم حُجب التنفيذ بعائق CDP/page |
| عدم إصلاح الفشل التطبيقي | مطابق؛ لم يظهر أصلًا فشل تطبيقي قابل للتشخيص |
| لقطات حية فقط | مطابق؛ لم تُنشأ بدائل عند غياب جلسة حية |
| عدم توليد صور أو رسوم أو animations | مطابق |
| `VERIFIED` فقط عند تنفيذ الاختبارات والتقاط اللقطات | مطابق؛ بقيت الحالة `BLOCKED` |

---

## 11. أسطر نهاية الجلسة الخمسة

1. **المرحلة والخطوة الحالية:** `HC-P0 / HC-P0-S2`.
2. **ما أصبح `VERIFIED` بالدليل:** إزالة المكتبات الديناميكية المفقودة فقط؛ `ldd` بعد التثبيت بلا `not found`، و`chromium --version` ناجح.
3. **ما بقي `IMPLEMENTED` فقط:** حارس `PLAYWRIGHT_CHROMIUM_PATH` داخل إعداد Playwright؛ لم يُعتمد بوصفه حلًا كاملًا لأن قناة المتصفح لا تكتمل.
4. **العائق أو القرار الذي ينتظر المالك:** عائق تقني محدد في Chromium/CDP داخل البيئة؛ لا يوجد قرار منتج أو اقتصاد ينتظر المالك.
5. **الخطوة التالية الوحيدة دون تنفيذها:** `HC-P0-S2A — استبدال/مواءمة runtime Chromium مع إصدار Playwright وإثبات إنشاء Page واحد ولقطة حية قبل إعادة المجموعة الكاملة`.