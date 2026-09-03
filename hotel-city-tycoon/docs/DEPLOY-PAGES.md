# النشر على GitHub Pages — الرابط الذي تُفتح منه اللعبة

## الرابط

**https://mf103871-boop.github.io/hotel-city-tycoon-lastest/**

يُبنى من `main` تلقائيًا عند كل تغيير داخل `hotel-city-tycoon/` عبر `.github/workflows/pages.yml`، ويمكن تشغيله يدويًا من Actions ← **pages** ← Run workflow.

## التفعيل لأول مرة — ما حدث فعلًا (03-09-2026)

`enablement: true` في `actions/configure-pages` **لا تكفي**: فشلت التشغيلات الأربعة الأولى كلها عند تلك الخطوة بالنص نفسه:

```
Get Pages site failed.    Error: Not Found
Create Pages site failed. Error: Resource not accessible by integration
```

`GITHUB_TOKEN` يستطيع النشر إلى موقع Pages قائم، ولا يستطيع **إنشاءه**. الإنشاء بيد المالك مرة واحدة:

1. **Settings ← Pages ← Build and deployment ← Source: `GitHub Actions`** (يُحفظ فور الاختيار، بلا زر Save).
2. Actions ← **pages** ← Run workflow (أو أعد تشغيل أي تشغيل فاشل).

بعدها لا يتكرر الأمر أبدًا. **الدليل:** تشغيل `pages` رقم 5، `workflow_dispatch` على `main` عند `2980e1a`، 23:30–23:31 UTC: الخطوات الثماني كلها ناجحة، ومنها `configure pages` و`deploy-pages`.

إن رُفض تشغيل يدوي على فرع غير `main` برسالة `Branch is not allowed to deploy to github-pages`، فإما الدمج في `main` أو إضافة الفرع في **Settings ← Environments ← github-pages ← Deployment branches**.

## لماذا `BASE_PATH`

موقع المشروع على Pages يُخدَم من `/<اسم المستودع>/` لا من جذر النطاق. `vite.config.ts` يقرأ `BASE_PATH` ويمرره إلى `base`، ومن هناك تشتق كل المسارات: الحزمة، وعامل الخدمة (`src/main.tsx` يسجّل `${BASE_URL}sw.js`)، وكل أصل يطلبه المحمّل (`src/render/assets.ts`). ملف `index.html` و`public/manifest.webmanifest` نسبيان أصلًا (`start_url: "."`، `scope: "."`)، فلا شيء فيهما يحتاج معرفة مكان النشر. لذلك عمل النشر يبني بـ`BASE_PATH="/${{ github.event.repository.name }}/"` ولا شيء غير ذلك.

**دليل تشغيلي (03-09-2026):** بناء بـ`BASE_PATH=/hotel-city-tycoon-lastest/` ثم `vite preview` على البادئة نفسها بملف Pixel 7: اللعبة تقلع، القماشة تُرسم، `[assets] complete: all 241 declared textures available`، عامل الخدمة scope‑ه `/hotel-city-tycoon-lastest/`، و`manifest.webmanifest` والأيقونات الأربع و`sw.js` و`assets/manifest.json` وفن الغرف كلها 200، ولا طلب واحد ≥400.

## التصوير على iPhone لبند safe-area (D18)

هذا البند لا يُعتمد إلا من جهاز حقيقي مثبَّت كتطبيق، لأن `env(safe-area-inset-*)` لا يعطي قيمًا حقيقية إلا في وضع standalone:

1. افتح الرابط في **Safari** على الـiPhone.
2. زر المشاركة ← **إضافة إلى الشاشة الرئيسية** ← أضف.
3. افتح اللعبة من أيقونة الشاشة الرئيسية (لا من Safari) — الشريط العلوي يجب أن يبدأ **أسفل** شريط الحالة والساعة، والشريط السفلي أن ينتهي **فوق** مؤشر Home.
4. صوّر لقطتين: واحدة بالإنجليزية وواحدة بالعربية (⚙ ← العربية)، وكل لقطة تُظهر أعلى الشاشة وأسفلها.

## عناوين مفيدة

| العنوان | ما يفعله |
|---|---|
| `…/?debug=1` | يُظهر شارة التشخيص: المصيّر، fps، عدد الغرف المرسومة، الأشخاص، التقريب، ومعرّف البناء |
| `…/?fresh=1` | يُلغي تسجيل كل عامل خدمة ويمسح كل الكاشات ثم يعيد التحميل — الجواب القاطع على «هل البناء الجديد حي؟» |
| console: `hct.report()` | تقرير نصي عن البناء والأصول المخدومة مقابل المتوقعة |
| console: `hct.perf()` | قياس أداء مقابل ميزانيات المستند |

**تنبيه بعد كل نشر:** عامل الخدمة يخدم الهيكل network-first، فإعادة تحميل واحدة تكفي لالتقاط بناء جديد؛ إن ظهر شيء قديم على جهاز مثبَّت استخدم `?fresh=1` مرة واحدة.

## الحفظ

اللعبة تحفظ في IndexedDB للأصل نفسه (`github.io`)، فالحفظ على الهاتف منفصل تمامًا عن أي حفظ محلي، ويبقى بعد الإغلاق. التصدير والاستيراد من ⚙ الإعدادات.
