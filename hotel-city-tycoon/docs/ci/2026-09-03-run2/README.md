# دليل CI — تشغيل e2e #2 على `main` (03-09-2026)

**التشغيل:** `https://github.com/mf103871-boop/hotel-city-tycoon-lastest/actions/runs/33727799658` (workflow `e2e`، حدث `push`، 07:22:53Z → 07:26:34Z).
**الـcommit:** `232663d` = دمج PR #1 من الفرع `claude/project-comprehensive-audit-0ujccq` وهو عند `63fa177` (الخطوة 1 من تدقيق 03-09-2026 فقط: إصلاح القفل وإعادة CI إلى `npm ci`). أي أن هذا التشغيل يقيس خط الأساس + الخطوة 1، **لا** الخطوات 2–9.
**البيئة:** Ubuntu 24.04، Node 24 (كما كان `e2e.yml` عند ذلك الـcommit)، Chrome Headless Shell 151.0.7922.34 (chromium-headless-shell v1234)، `--disable-3d-apis` + بلا التقاط (DEC-009).

الملفات هنا نُسخت كما هي من artifact `e2e-results` الذي رفعه المالك (رُفع بالاسم `e2eresults_11.zip`). اللقطات الخمس (`docs/baseline-screens/01-main.png … 05-phone.png`) تبقى في artifact GitHub ولم تُنسخ.

| الملف | ما فيه |
|---|---|
| `ci-npm.log` | `npm ci` نجح: `added 241 packages in 7s` — إغلاق D3 مثبت في CI |
| `ci-install.log` | تثبيت اعتماديات Chromium وتنزيل chromium-headless-shell v1234 |
| `ci-run.log` | تقرير Playwright بصيغة line للمشروعين desktop وphone |
| `ci-shots.log` | `tools/baseline-shots.mjs`: اللقطات الخمس `OK`، `completed 5/5 shots` |
| `reload-desktop.md` / `reload-phone.md` | سياق فشل `the hotel survives a full reload` (Expected «6 rooms» / Received «4 rooms») |
| `expansion-desktop.md` / `expansion-phone.md` | سياق فشل `an expansion that cannot be afforded…` (يتوقع «Not enough coins» والزر يقول «Unlocks at level 3») |

## النتيجة

| المنفذ | الناجح | الفاشل | المتخطى | المدة | اللقطات |
|---:|---:|---:|---:|---:|---|
| 82 | 62 | 4 | 16 | 2.7 دقيقة | 5/5 |

## تصنيف الفشل الأربعة

- **زوج `the hotel survives a full reload`** (desktop + phone) = **D19** من التدقيق: الإجراءات لا تُحفظ إلا بالحفظ التلقائي كل 30 ثانية. أُصلح في الخطوة 4b (`7a2507a` بعد إعادة البناء فوق main) — على الفرع، ليس على `main` عند هذا التشغيل.
- **زوج `an expansion that cannot be afforded explains itself and stays open`** (desktop + phone) = **D13-e**: الاختبار يتوقع «Not enough coins» بينما الحاجز الفعلي لفندق مستوى 1 هو «Unlocks at level 3» (`plots.json`: plot_24 يفتح عند المستوى 3). أُصلح في الخطوة 9 (`b20b005`) — على الفرع كذلك.

## ما يثبته هذا التشغيل

- **BL-016 مغلق:** `the room art actually loads` و`characters are drawn` نجحا على مشروع `phone` (السطران 275 و316 في `ci-run.log`)، وهو شرط الإغلاق الحرفي المكتوب في §13 من المرجع. قيد: عند هذا الـcommit كان التوكيد الأول في `characters are drawn` ميتًا (يبحث عن «missing overall»، D13-a) وصُحح في الخطوة 9؛ التوكيد الثاني (`bundle "characters" … missing`) حي.
- `npm ci` من القفل المولّد على Node 22 ينجح في CI (D3).
- اللقطات الخمس تؤكد بقاء D4 (زر Upgrades مقصوص في `05-phone.png`) وD5 (زر الهاتف فوق طرف «Open hotel») على `main`؛ إصلاحهما في الخطوة 5 على الفرع. الشارة تُظهر «renderer starting… fps 0» في الخمس لأن اللقطة تُلتقط قبل إقلاع Pixi تحت `--disable-3d-apis` (بيئة وفق DEC-009، لا عيب).

**المتوقع من التشغيل نفسه على رأس الفرع (بعد الخطوات 2–9):** 72 ناجحًا / 0 فاشل / 10 متخطاة، كما محليًا في مسار DEC-009 عبر `playwright.config.ts` (03-09-2026).
