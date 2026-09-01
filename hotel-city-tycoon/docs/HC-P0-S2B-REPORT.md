# HC-P0-S2B — تقرير عزل browser context

**التاريخ:** 1 سبتمبر 2026  
**المرحلة:** `HC-P0`  
**الخطوة:** `HC-P0-S2B` فقط  
**الحالة:** `BLOCKED`

**الخلاصة:** أظهر probe المباشر أن Chrome الكامل `151.0.7922.34` ينجح في دورة `launch → context → page → goto → screenshot → close` على `about:blank` وعلى اللعبة الحية. لكن اختبار Playwright الرسمي بعد تفعيل `channel: 'chromium'` فشل أثناء إعداد `page`. لذلك لا يمكن اعتماد بوابة P0، ولم تُشغل المجموعة الكاملة أو تُلتقط اللقطات الخمس.

---

## 1. فحص المرجع

- **إصدار المرجع:** 1.2.
- **المرحلة الحالية:** HC-P0 — تثبيت خط الأساس.
- **الخطوة الحالية:** HC-P0-S2B.
- **الهدف الواحد:** عزل اختفاء `browser context` خارج مجموعة الاختبارات بمقارنة Headless Shell وChrome الكامل.
- **المشكلة المثبتة التي تعالجها:** S2A أصلحت نقص مكتبات النظام، لكن Playwright الرسمي بقي يفشل عند إعداد `page`.
- **الاعتماديات المكتملة:** قراءة المرجع وتقرير S2A، Playwright 1.62.1، Chromium 151 المرفق، و`ldd` نظيف في S2A.
- **ما يدخل في النطاق:** `ldd` للـHeadless Shell، probe أدنى، مصفوفة ثلاثية على `about:blank`، ثم probe اللعبة بالتركيبة الناجحة.
- **ما لا يدخل في النطاق:** `src/` و`data/` و`package.json` و`package-lock.json` ومنطق `tests/e2e` والاقتصاد والأصول.
- **شروط القبول:** نجاح تركيبة على `about:blank` واللعبة الحية، ثم نجاح اختبار الإثبات؛ ولا تصبح الخطوة `VERIFIED` إلا بعد المجموعة واللقطات.
- **الاختبارات والأدلة المطلوبة:** سجلات المصفوفة، سجل probe اللعبة، لقطة `proof-app.png`، اختبار الإثبات، وتقرير S2B.
- **التعارضات أو المعلومات الناقصة:** كان غير معلوم هل المشكلة في Headless Shell أم Chrome الكامل أم في تكامل Playwright Test؛ حُسم الجزء الأول بالمصفوفة، وبقي الجزء الأخير.

---

## 2. قالب خطة التنفيذ

### الهدف

- **النتيجة المرئية:** إنشاء صفحة والتنقل والتقاط لقطة من اللعبة عبر probe مباشر، ثم إثبات المسار نفسه عبر Playwright Test.
- **خط الأساس:** S2A فشل في إعداد `page` حتى بعد `PLAYWRIGHT_DISABLE_DEV_SHM=1`؛ التقرير السابق هو `docs/HC-P0-S2A-REPORT.md`.

### النطاق

- **الملفات المعدلة:** `tools/browser-probe.mjs`، ثم حارسا `playwright.config.ts` المحددان حرفيًا عند نجاح اللعبة الحية، والتقرير والمرجع.
- **الأدلة الجديدة:** `docs/HC-P0-S2B-ldd-shell.txt`، سجلات probe، `docs/probe-shots/proof-app.png`.
- **التبعيات:** لا حزم Nix إلا إذا فشلت كل تركيبات `about:blank`.
- **ما لن يتغير:** التطبيق، البيانات، الاختبارات، الحزم، والاقتصاد.

### خطوات التنفيذ

1. فحص `ldd` لـ`chrome-headless-shell` وتسجيل `not found`.
2. إنشاء probe بالمراحل `launch → context → page → goto → screenshot → close`.
3. تشغيل Headless Shell، ثم Chrome الكامل، ثم Chrome الكامل مع `--disable-gpu` على `about:blank`.
4. تشغيل أول تركيبة مكتملة النجاح على اللعبة الحية والتقاط `proof-app.png`.
5. إضافة الحارسين المطلوبين وتشغيل اختبار الإثبات.
6. تشغيل المجموعة واللقطات فقط إذا نجح الإثبات.

**شرط التوقف:** عند فشل اختبار الإثبات لا تُشغل المجموعة ولا تُلتقط اللقطات الخمس، وتبقى الحالة `BLOCKED`.

### شروط القبول

- `ldd` بلا `not found`.
- نجاح مراحل probe المطلوبة.
- نجاح اختبار الإثبات.
- نجاح 82 اختبارًا والتقاط خمس لقطات قبل `VERIFIED`.

### المخاطر وخطة الرجوع

- لا يوجد تغيير في الحفظ أو البيانات.
- لا يوجد تغيير في سلوك التطبيق.
- التراجع يقتصر على حذف probe وإزالة الحارسين والتقرير/أدلة الخطوة.

---

## 3. مطابقة الخطة مع المرجع

- **المرحلة المطابقة:** HC-P0.
- **المشكلة المرجعية التي تعالجها:** جعل Playwright قابلًا للتكرار قبل أي عمل وظيفي.
- **البنود التي لن تلمسها الخطة:** التطبيق، البيانات، الاختبارات، الاقتصاد، الديكور، والأصول.
- **هل تسللت أعمال من مرحلة أخرى؟** لا.
- **هل كل الخطوات قابلة للتحقق؟** نعم.
- **هل توجد افتراضات غير مثبتة؟** نعم؛ أي فرق بين probe المباشر وPlaywright Test سيُحسم بالاختبار الفعلي.
- **هل تحقق الخطة شرط خروج الخطوة؟** فقط بعد نجاح الإثبات والمجموعة واللقطات.
- **القرار:** صالحة للتنفيذ.

---

## 4. نتيجة ldd للـHeadless Shell

الملف:

```text
/home/runner/workspace/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
```

الأمر:

```bash
ldd /home/runner/workspace/.cache/ms-playwright/chromium_headless_shell-1234/chrome-headless-shell-linux64/chrome-headless-shell
```

النتيجة:

```text
ldd_exit=0
not_found_count=0
```

الناتج الحرفي الكامل محفوظ في `docs/HC-P0-S2B-ldd-shell.txt`، وقائمة `not found` الفارغة في `docs/HC-P0-S2B-ldd-shell-not-found.txt`.

الناتج الحرفي:

```text
linux-vdso.so.1 (0x00007efff237d000)
libdl.so.2 => /lib/x86_64-linux-gnu/libdl.so.2 (0x00007efff2350000)
libpthread.so.0 => /lib/x86_64-linux-gnu/libpthread.so.0 (0x00007efff234b000)
libglib-2.0.so.0 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libglib-2.0.so.0 (0x00007effe62a0000)
libgobject-2.0.so.0 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libgobject-2.0.so.0 (0x00007efff22e7000)
libnspr4.so => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libnspr4.so (0x00007efff22a3000)
libnss3.so => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libnss3.so (0x00007effe615a000)
libnssutil3.so => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libnssutil3.so (0x00007efff226b000)
libgio-2.0.so.0 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libgio-2.0.so.0 (0x00007effe5f54000)
libatk-1.0.so.0 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libatk-1.0.so.0 (0x00007effe5f2a000)
libatk-bridge-2.0.so.0 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libatk-bridge-2.0.so.0 (0x00007effe5eea000)
libdbus-1.so.3 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libdbus-1.so.3 (0x00007effe5e91000)
libm.so.6 => /lib/x86_64-linux-gnu/libm.so.6 (0x00007effe5da8000)
libX11.so.6 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libX11.so.6 (0x00007effe5c58000)
libXcomposite.so.1 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libXcomposite.so.1 (0x00007efff2264000)
libXdamage.so.1 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libXdamage.so.1 (0x00007effe5c53000)
libXext.so.6 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libXext.so.6 (0x00007effe5c3e000)
libXfixes.so.3 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libXfixes.so.3 (0x00007effe5c36000)
libXrandr.so.2 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libXrandr.so.2 (0x00007effe5c29000)
libgbm.so.1 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libgbm.so.1 (0x00007effe5c22000)
libexpat.so.1 => /lib/x86_64-linux-gnu/libexpat.so.1 (0x00007effe5bf6000)
libxcb.so.1 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libxcb.so.1 (0x00007effe5bc7000)
libxkbcommon.so.0 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libxkbcommon.so.0 (0x00007effe5b77000)
libudev.so.1 => /lib/x86_64-linux-gnu/libudev.so.1 (0x00007effe5b44000)
libasound.so.2 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libasound.so.2 (0x00007effe5a27000)
libatspi.so.0 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libatspi.so.0 (0x00007effe59e7000)
libgcc_s.so.1 => /lib/x86_64-linux-gnu/glibc-hwcaps/x86-64-v4/libgcc_s.so.1 (0x00007effe59b7000)
libc.so.6 => /lib/x86_64-linux-gnu/libc.so.6 (0x00007effe57a5000)
/lib64/ld-linux-x86-64.so.2 (0x00007efff237f000)
libpcre2-8.so.0 => /nix/store/vvp8hlss3d5q6hn0cifq04jrpnp6bini-pcre2-10.44/lib/libpcre2-8.so.0 (0x00007effe5702000)
libffi.so.8 => /nix/store/rnn29mhynsa4ncmk0fkcrdr29n0j20l4-libffi-3.4.8/lib/libffi.so.8 (0x00007effe56f1000)
librt.so.1 => /nix/store/zdpby3l6azi78sl83cpad2qjpfj25aqx-glibc-2.40-66/lib/librt.so.1 (0x00007effe56ea000)
libplds4.so => /nix/store/gpb87pb8s826aggy1s3f352alp40dkj8-nspr-4.36/lib/libplds4.so (0x00007effe56e5000)
libplc4.so => /nix/store/gpb87pb8s826aggy1s3f352alp40dkj8-nspr-4.36/lib/libplc4.so (0x00007effe56de000)
libgmodule-2.0.so.0 => /nix/store/y3nxdc2x8hwivppzgx5hkrhacsh87l21-glib-2.84.3/lib/libgmodule-2.0.so.0 (0x00007effe56d7000)
libz.so.1 => /nix/store/jl19fdc7gdxqz9a1s368r9d15vpirnqy-zlib-1.3.1/lib/libz.so.1 (0x00007effe56b6000)
libmount.so.1 => /nix/store/bcs094l67dlbqf7idxxbljp293zms9mh-util-linux-minimal-2.41-lib/lib/libmount.so.1 (0x00007effe563b000)
libselinux.so.1 => /nix/store/5gml2l2cj28yvyfyzblzjy1laqpxmyzd-libselinux-3.8.1/lib/libselinux.so.1 (0x00007effe5605000)
libsystemd.so.0 => /nix/store/n4kqvn450iwdyj83q80is8ija3lfi2iw-systemd-minimal-257.6/lib/libsystemd.so.0 (0x00007effe54b1000)
libXrender.so.1 => /nix/store/v53v67k3s16wmak41qy0q54pd7dkbcvr-libXrender-0.9.12/lib/libXrender.so.1 (0x00007effe54a2000)
libdrm.so.2 => /nix/store/xpszkfp1gaf8jfmcsll93xg0pb4c0rk7-libdrm-2.4.124/lib/libdrm.so.2 (0x00007effe548a000)
libXau.so.6 => /nix/store/f8kjcizw0kmpyrn1abm1nfsbc007418g-libXau-1.0.12/lib/libXau.so.6 (0x00007effe5485000)
libXdmcp.so.6 => /nix/store/ycvsz2k1zqcg48as18fcb171rzfdn5ll-libXdmcp-1.1.5/lib/libXdmcp.so.6 (0x00007effe547d000)
libcap.so.2 => /lib/x86_64-linux-gnu/libcap.so.2 (0x00007effe546e000)
libXi.so.6 => /nix/store/58dzwlbfldrsnwah1q3cfaqrx98jajpp-libXi.so.6 (0x00007effe545a000)
libblkid.so.1 => /nix/store/bcs094l67dlbqf7idxxbljp293zms9mh-util-linux-minimal-2.41-lib/lib/libblkid.so.1 (0x00007effe53f8000)
```

---

## 5. أداة probe

أُنشئ الملف:

```text
tools/browser-probe.mjs
```

يدعم:

```text
PROBE_CHANNEL
PROBE_HEADED
PROBE_GPU_OFF
PROBE_URL
```

ويستخدم دائمًا:

```text
--disable-dev-shm-usage
```

ويضيف `--disable-gpu` فقط عند `PROBE_GPU_OFF=1`. يطبع نتيجة كل مرحلة ويغلق `context` و`browser` في كل مسار.

---

## 6. مصفوفة about:blank

شُغلت كل تركيبة مع `DEBUG=pw:browser*`. لم تُستخدم `PLAYWRIGHT_CHROMIUM_PATH`.

| التركيبة | launch | context | page | goto | screenshot | close | النتيجة |
|---|---|---|---|---|---|---|---|
| أ — بلا متغيرات، Headless Shell الافتراضي | OK | OK | OK | OK | FAIL | OK | فشل `Page.captureScreenshot` |
| ب — `PROBE_CHANNEL=chromium` | OK | OK | OK | OK | OK | OK | نجاح كامل |
| ج — `PROBE_CHANNEL=chromium PROBE_GPU_OFF=1` | OK | OK | OK | OK | FAIL | OK | فشل `Page.captureScreenshot` |

### التركيبة أ

الأدلة:

```text
docs/HC-P0-S2B-probe-1.log
```

المراحل الناجحة:

```text
[probe] launch: OK
[probe] context: OK
[probe] page: OK
[probe] goto: OK — about:blank
[probe] context.close: OK
[probe] browser.close: OK
```

الفشل:

```text
[probe] screenshot: ERROR
page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot
```

رمز الخروج: `1`.

### التركيبة ب

الأدلة:

```text
docs/HC-P0-S2B-probe-2.log
docs/probe-shots/chromium-headless-gpu-default.png
```

المراحل الحرفية:

```text
[probe] launch: OK
[probe] context: OK
[probe] page: OK
[probe] goto: OK — about:blank
[probe] screenshot: OK — docs/probe-shots/chromium-headless-gpu-default.png
[probe] context.close: OK
[probe] browser.close: OK
exit_code=0
```

### التركيبة ج

الأدلة:

```text
docs/HC-P0-S2B-probe-3.log
```

المراحل الناجحة:

```text
[probe] launch: OK
[probe] context: OK
[probe] page: OK
[probe] goto: OK — about:blank
[probe] context.close: OK
[probe] browser.close: OK
```

الفشل:

```text
[probe] screenshot: ERROR
page.screenshot: Protocol error (Page.captureScreenshot): Unable to capture screenshot
```

رمز الخروج: `1`.

النتيجة التشغيلية: التركيبة ب هي أول تركيبة مكتملة النجاح؛ لذلك لم تُنفذ المرحلة 3 ولم تُثبت حزمة `xvfb-run`.

---

## 7. probe اللعبة الحية

شُغل الخادم بهذه البيئة:

```bash
HOST=127.0.0.1 PORT=5000 VITE_E2E=1 npm run dev
```

ثم شُغلت التركيبة ب:

```bash
PROBE_CHANNEL=chromium \
PROBE_URL=http://127.0.0.1:5000 \
DEBUG=pw:browser* \
node tools/browser-probe.mjs
```

النتيجة الحرفية:

```text
[app-probe] server: READY
[probe] launch: OK
[probe] context: OK
[probe] page: OK
[probe] goto: OK — http://127.0.0.1:5000
[probe] screenshot: OK — docs/probe-shots/proof-app.png
[probe] context.close: OK
[probe] browser.close: OK
exit_code=0
```

السجل الكامل:

```text
docs/HC-P0-S2B-probe-app.log
docs/HC-P0-S2B-server.log
```

اللقطة الحية:

```text
docs/probe-shots/proof-app.png
```

أُوقف خادم اللعبة بعد انتهاء probe.

---

## 8. فرق `playwright.config.ts`

بعد نجاح probe اللعبة الحية أضيف الحارسان المحددان فقط:

```diff
--- HC-P0-S2A/playwright.config.ts
+++ HC-P0-S2B/playwright.config.ts
@@ -26,6 +26,12 @@
     ...(process.env.PLAYWRIGHT_DISABLE_DEV_SHM === '1'
       ? { launchOptions: { args: ['--disable-dev-shm-usage'] } }
       : {}),
+    ...(process.env.PLAYWRIGHT_FULL_CHROMIUM === '1'
+      ? { channel: 'chromium' }
+      : {}),
+    ...(process.env.PLAYWRIGHT_HEADED === '1'
+      ? { headless: false }
+      : {}),
   },
```

بقيت كل الإعدادات السابقة كما هي.

---

## 9. اختبار الإثبات الرسمي

الأمر:

```bash
env -u PLAYWRIGHT_CHROMIUM_PATH \
  PLAYWRIGHT_FULL_CHROMIUM=1 \
  PLAYWRIGHT_DISABLE_DEV_SHM=1 \
  npx playwright test --project=desktop -g "boots past the loading screen"
```

الناتج الحرفي:

```text
Running 1 test using 1 worker

✘  1 [desktop] › tests/e2e/game.spec.ts:38:1 › the game boots past the loading screen (1.5m)

Test timeout of 45000ms exceeded while setting up "page".

Error Context: test-results/game-the-game-boots-past-the-loading-screen-desktop/error-context.md

1 failed
  [desktop] › tests/e2e/game.spec.ts:38:1 › the game boots past the loading screen
```

البيانات:

```text
exit_code=1
duration_ms=116237
```

الأدلة:

```text
docs/HC-P0-S2B-proof.log
docs/HC-P0-S2B-proof.meta
```

هذه هي أقصى تركيبة وصولًا: Chrome الكامل نجح في probe المباشر على اللعبة، لكن Playwright Test فشل في نفس البيئة المنطقية عند إعداد fixture `page`.

---

## 10. E2E الكامل

لم يُشغل الأمر:

```bash
npm run test:e2e
```

السبب: اختبار الإثبات الرسمي فشل، والمرجع يمنع فتح المجموعة قبل نجاحه.

| المشروع | المخطط | المنفذ فعليًا | ناجح | فاشل |
|---|---:|---:|---:|---:|
| `desktop` | 41 | 0 | 0 | 0 |
| `phone` | 41 | 0 | 0 | 0 |
| **الإجمالي** | **82** | **0** | **0** | **0** |

لم يظهر فشل تطبيقي؛ الفشل قبل الوصول إلى اختبار التطبيق نفسه. لذلك لا يُضاف عنصر تطبيقي جديد إلى سجل المؤجل.

---

## 11. اللقطات وHC-P0-S1-BL-002

أُنشئت لقطة probe حية واحدة فقط:

```text
docs/probe-shots/proof-app.png
```

وهذه ليست بديلًا عن اللقطات الخمس المطلوبة لخط الأساس. لم يُنشأ `tools/baseline-shots.mjs` ولم تُنشأ `docs/baseline-screens/` لأن اختبار الإثبات الرسمي فشل.

| اللقطة المطلوبة | النتيجة |
|---|---|
| الشاشة الرئيسية | غير معتمدة كخط أساس |
| لوحة البناء | غير ملتقطة |
| متجر الديكور | غير ملتقطة |
| لوحة الإدارة | غير ملتقطة |
| عرض Pixel 7 | غير ملتقطة |

لذلك يبقى `HC-P0-S1-BL-002` مؤجلًا ولا يُغلق.

لم تُستخدم صور مولدة أو رسوم بديلة؛ اللقطة الوحيدة جاءت من Playwright الحي.

---

## 12. الحزم والتغييرات

لم تُضف حزم Nix في S2B؛ لم تُدخل المرحلة 3 لأن التركيبة ب نجحت على `about:blank`.

بيئة Nix بقيت:

```toml
packages = ["glib", "nss", "atk", "at-spi2-atk", "gtk3", "alsa-lib", "libdrm", "mesa", "chromium", "libgbm", "libxkbcommon"]
```

الملفات الجديدة أو المعدلة في S2B:

```text
tools/browser-probe.mjs
playwright.config.ts
docs/HC-P0-S2B-ldd-shell.txt
docs/HC-P0-S2B-ldd-shell-not-found.txt
docs/HC-P0-S2B-probe-1.log
docs/HC-P0-S2B-probe-2.log
docs/HC-P0-S2B-probe-3.log
docs/HC-P0-S2B-probe-app.log
docs/HC-P0-S2B-server.log
docs/probe-shots/chromium-headless-gpu-default.png
docs/probe-shots/proof-app.png
docs/HC-P0-S2B-proof.log
docs/HC-P0-S2B-proof.meta
docs/HC-P0-S2B-REPORT.md
docs/HOTEL_CITY_MASTER_REFERENCE_AR.md
```

لم تتغير:

```text
src
data
tests/e2e
package.json
package-lock.json
```

---

## 13. قرار الحالة

الحالة الصحيحة هي:

```text
BLOCKED
```

السبب المحدد:

```text
Chrome الكامل المرفق ينجح في browser-probe المباشر على about:blank واللعبة الحية،
لكن Playwright Test يفشل في إعداد page حتى مع PLAYWRIGHT_FULL_CHROMIUM=1
وPLAYWRIGHT_DISABLE_DEV_SHM=1.
```

الاستنتاج الأقرب وصولًا:

```text
الخلل متبقٍ في تكامل Playwright Test/fixture/webServer lifecycle،
وليس نقص مكتبة ldd ولا فشل launch الخام في Chrome الكامل.
```

خيار نقل E2E إلى بيئة تشغيل خارجية مثل GitHub Actions لم يُفعّل في هذه الخطوة؛ لم تفشل كل تركيبات `about:blank`، ولا يزال يلزم عزل الفرق بين probe المباشر وPlaywright Test قبل اتخاذ القرار.

---

## 14. تقرير التنفيذ

- **معرف المهمة:** HC-P0-S2B.
- **ما نُفذ فعلًا:** فحص ldd للـHeadless Shell، إنشاء probe، مصفوفة ثلاثية، probe اللعبة الحية، حارسا الإعداد، واختبار الإثبات الرسمي.
- **ما لم يُنفذ:** `xvfb-run`، E2E الكامل، اختبار الهاتف، `tools/baseline-shots.mjs`، اللقطات الخمس، وإغلاق `HC-P0-S1-BL-002`.
- **الاختبارات التي شُغلت حرفيًا:** ثلاث تركيبات `about:blank`، probe حي واحد، واختبار إثبات desktop واحد.
- **عدد الاختبارات:** probe: تركيبتان فشلتا في screenshot وتركيبة نجحت؛ اختبار الإثبات الرسمي: 1 فشل؛ المجموعة: 82 مخططًا و0 منفذ.
- **التحقق البصري:** `proof-app.png` نجحت كلقطة probe حية، لكنها لا تحقق مجموعة لقطات baseline.
- **أثر الحفظ:** لا يوجد.
- **أثر الأداء:** لا يوجد تغيير في التطبيق.
- **الانحرافات:** لا يوجد؛ توقفت قبل E2E واللقطات لأن الإثبات الرسمي فشل.
- **مشكلات جديدة للمؤجل:** لا يوجد فشل تطبيقي مؤكد؛ عائق Playwright Test بقي في P0.
- **حقيقة جديدة للمرجع:** Chrome الكامل 151 ينجح مع probe مباشر على اللعبة، لكن لا ينجح عبر fixture `page` في Playwright Test.
- **الحالة:** `BLOCKED`.
- **الخطوة التالية الوحيدة دون تنفيذ:** `HC-P0-S2C — عزل الفرق بين browser-probe المباشر وPlaywright Test fixture/webServer lifecycle على channel chromium`.

---

## 15. مطابقة التنفيذ مع المرجع

| الشرط | النتيجة |
|---|---|
| قراءة المرجع وتقرير S2A قبل العمل | مطابق |
| تنفيذ HC-P0-S2B وحدها | مطابق |
| `ldd` للـHeadless Shell وحساب not found | مطابق؛ `not_found_count=0` |
| probe بمراحل launch/context/page/goto/screenshot/close | مطابق |
| ثلاث تركيبات about:blank مع DEBUG | مطابق |
| استخدام Chrome الكامل عند `PROBE_CHANNEL=chromium` | مطابق |
| عدم استخدام `PLAYWRIGHT_CHROMIUM_PATH` | مطابق |
| اختبار اللعبة عند أول تركيبة مكتملة النجاح | مطابق |
| حفظ `proof-app.png` من Playwright حي | مطابق |
| إضافة الحارسين الحرفيين فقط بعد نجاح اللعبة | مطابق |
| اختبار الإثبات قبل E2E | مطابق؛ فشل |
| عدم تشغيل E2E عند فشل الإثبات | مطابق |
| عدم إنشاء baseline shots عند فشل الإثبات | مطابق |
| عدم إضافة `xvfb-run` بعد نجاح تركيبة about:blank | مطابق |
| عدم تعديل src/data/package/اختبارات | مطابق |
| `VERIFIED` فقط بعد المجموعة واللقطات | مطابق؛ الحالة `BLOCKED` |

**هل تحقق الهدف الأصلي؟** تحقق العزل الجزئي: ثبت أن Chrome الكامل الخام يعمل، لكن لم يُفتح طريق Playwright Test الرسمي.  
**هل اجتازت جميع شروط القبول؟** لا.  
**هل تغير شيء غير مصرح به؟** لا.  
**هل بقي افتراض غير مثبت؟** نعم: سبب الفرق بين probe المباشر وfixture Playwright Test.  
**هل يمكن الانتقال للخطوة التالية؟** نعم، إلى S2C التشخيصية فقط؛ لا يمكن الانتقال إلى المجموعة أو مرحلة لاحقة.

---

## 16. أسطر نهاية الجلسة الخمسة

1. **المرحلة والخطوة الحالية:** `HC-P0 / HC-P0-S2B`.
2. **ما أصبح `VERIFIED` بالدليل:** `ldd` للـHeadless Shell بلا `not found`، ونجاح Chrome الكامل في probe على `about:blank` واللعبة الحية مع `proof-app.png`.
3. **ما بقي `IMPLEMENTED` فقط:** `tools/browser-probe.mjs` وحارسا Playwright؛ لم ينجح اختبار الإثبات الرسمي.
4. **العائق أو القرار الذي ينتظر المالك:** عزل lifecycle بين probe المباشر وPlaywright Test؛ خيار GitHub Actions لم يُتخذ.
5. **الخطوة التالية الوحيدة دون تنفيذ:** `HC-P0-S2C — عزل الفرق بين browser-probe المباشر وPlaywright Test fixture/webServer lifecycle على channel chromium`.