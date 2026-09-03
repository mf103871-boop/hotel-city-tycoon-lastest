# دليل CI — تشغيل e2e #4 على `main` (03-09-2026): التدقيق كله مدموج وأخضر

**التشغيل:** `https://github.com/mf103871-boop/hotel-city-tycoon-lastest/actions/runs/33738296964` (workflow `e2e`، حدث `push`، 09:20:33Z → 09:23:24Z، النتيجة `success`).
**الـcommit:** `985938b` = دمج PR #2 من الفرع `claude/project-comprehensive-audit-0ujccq` عند `1ee4357`، أي **كل خطوات تدقيق 03-09-2026 (1–9) مع تسجيل تشغيل #2**. هذا أول تشغيل CI يقيس الشجرة بعد التدقيق كاملًا.
**البيئة:** Ubuntu 24.04، Node 22 (كما يعلنه `e2e.yml` المدمج)، Chrome Headless Shell 151.0.7922.34 (chromium-headless-shell v1234)، `--disable-3d-apis` + بلا التقاط (DEC-009).

الملفات هنا نُسخت كما هي من artifact `e2e-results` الذي رفعه المالك (`e2eresults_12.zip`). لا ملفات سياق فشل لأن لا فشل. اللقطات الخمس تبقى في artifact GitHub.

| الملف | ما فيه |
|---|---|
| `ci-npm.log` | `npm ci` نجح: `added 241 packages in 6s` |
| `ci-install.log` | تثبيت اعتماديات Chromium وتنزيل chromium-headless-shell v1234 |
| `ci-run.log` | تقرير Playwright بصيغة line للمشروعين desktop وphone |
| `ci-shots.log` | `tools/baseline-shots.mjs`: اللقطات الخمس `OK`، `completed 5/5 shots` |

## النتيجة

| المنفذ | الناجح | الفاشل | المتخطى | المدة | اللقطات |
|---:|---:|---:|---:|---:|---|
| 82 | 72 | 0 | 10 | 2.0 دقيقة | 5/5 |

مطابقة تمامًا للمتوقع المسجل في PR #2 وفي `PROJECT-STATE.md` من المسار نفسه محليًا (72 / 0 / 10 في 2.1 دقيقة). المتخطاة العشر هي اختبارات القماشة الموسومة `NO_3D` واختبارات التوسعة التي تتخطى نفسها صراحة لفندق مستوى 1.

## ما يثبته هذا التشغيل

- الفشل الأربعة في تشغيل #2 (D19 وD13-e) لم يعودا: `the hotel survives a full reload` و`an expansion that cannot be afforded…` يمران على desktop وphone.
- اختبارا الأصول `the room art actually loads` و`characters are drawn` يمران على `phone` مجددًا، والآن بالتوكيد الحي «declared textures missing» (D13-a مصحح) لا بالتوكيد الميت.
- اللقطات الخمس تُظهر بصريًا إصلاحات الخطوة 5 و9 على `main`: لا زر Upgrades مقصوص (D4، أربعة أزرار داخل الشريط في `05-phone.png`)، زر الهاتف أعلى الشاشة بجوار الترس لا فوق طرف «Open hotel» (D5)، و«NEEDS LEVEL 3» / «Unlocks at level 3» في `04-manage.png` (D13-e).
- الشارة تُظهر «renderer starting… fps 0» في الخمس لأن اللقطة تُلتقط قبل إقلاع Pixi تحت `--disable-3d-apis` (بيئة وفق DEC-009، كما في #2؛ لا عيب).

**ما بقي خارج CI:** مراجعة safe-area (D18) على iPhone مثبت كـPWA، وقرار حذف أرشيفات ZIP (BL-021). بعدهما تبقى P1 بانتظار تسليم ART-1 (P1-S3).
