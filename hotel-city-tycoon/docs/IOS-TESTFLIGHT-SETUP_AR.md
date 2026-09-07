# إعداد تجربة iPhone عبر TestFlight

الحالة في 07-09-2026: عضوية Apple Developer مؤكدة من المالك، ولا يتوفر لديه
Mac. المسار الأساسي الآن **GitHub Actions** على macOS مستضاف؛ إعداد Xcode
Cloud أدناه خيار لاحق. لم يُربط حساب Apple ولم تُرفع نسخة TestFlight.

## المسار الأساسي: GitHub من دون Mac محلي

الخطوة المطلوبة من المالك الآن هي فتح **Apps** في
[App Store Connect](https://appstoreconnect.apple.com/) من متصفح الهاتف وتحديد
ما إذا كان سجل Hotel City موجودًا. نثبت Bundle ID والفريق قبل إنشاء توقيع له.
لا تسجل المعرّف المؤقت تلقائيًا، ولا ترسل كلمات مرور أو مفاتيح خاصة في المحادثة.

بعد تثبيت الهوية وتجهيز مواد Apple، يعمل workflow `ios-testflight` يدويًا
من فرع `main` فقط. يجب دمج PR #17 ثم PR #18 قبل ظهوره للاستخدام في Actions.
يبني ويوقّع ويصدّر IPA، ويتحقق من توقيعها ومن ملفاتها ورقم البناء؛ خيار الرفع
إلى Apple مغلق افتراضيًا. لا يوجد رفع عند فتح PR أو عند كل تعديل للكود.

توضع الإعدادات التالية في **Settings → Secrets and variables → Actions**:

| الاسم | مكان الحفظ | القيمة |
|---|---|---|
| `IOS_TEAM_ID` | Variables | Team ID لحساب Apple، 10 أحرف |
| `IOS_BUNDLE_ID` | Variables | هوية التطبيق الدائمة المطابقة للكود ولسجل Apple |
| `IOS_CERTIFICATE_BASE64` | Secrets | شهادة Apple Distribution بصيغة P12 مشفرة ومحوّلة إلى Base64 |
| `IOS_CERTIFICATE_PASSWORD` | Secrets | كلمة مرور P12 |
| `IOS_PROFILE_BASE64` | Secrets | ملف App Store provisioning بصيغة Base64 للتطبيق والشهادة نفسهما |
| `ASC_KEY_ID` | Variables، للرفع | معرّف مفتاح App Store Connect |
| `ASC_ISSUER_ID` | Variables، للرفع | Issuer ID للمفتاح الجماعي Team Key |
| `ASC_PRIVATE_KEY` | Secrets، للرفع | محتوى ملف `.p8` الخاص بالمفتاح، بنصه وأسطره الأصلية |

لرفع البناء فقط يكفي مفتاح Team Key بصلاحية Developer أو أعلى مع حق الوصول
إلى التطبيق؛ إنشاء الشهادات وملفات provisioning عملية إعداد منفصلة تتم من
حساب المالك. المفتاح API لا يحل وحده محل شهادة التوقيع وملف provisioning.

### تجهيز شهادة Apple دون Mac

يستطيع Codex تشغيل أداة `tools/mobile/signing_request.py` على Linux. تتطلب
OpenSSL وكلمة مرور قوية في متغير بيئة آمن، وتنتج طلب CSR عامًا ومفتاح RSA
خاصًا مشفرًا بكلمة المرور. لا يُرفع المفتاح الخاص إلى Git أو السجلات.

```bash
# IOS_CERTIFICATE_PASSWORD is supplied securely, never pasted into source code.
python3 tools/mobile/signing_request.py request --directory .signing/apple
```

بعدها يُرفع **ملف CSR العام فقط** إلى صفحة Certificates في حساب Apple، ويختار
المالك Apple Distribution وينزّل شهادة `.cer`. هذه الشهادة العامة تعود إلى
الأداة لتجميع P12؛ لا يلزم Keychain Access على جهاز المالك:

```bash
python3 tools/mobile/signing_request.py package --directory .signing/apple \
  --certificate /absolute/path/to/apple-distribution.cer
```

تتحقق الأداة من مطابقة المفتاح للشهادة، وتكتب P12 مشفرًا وملف Base64 داخل
المجلد المحمي. تُنقل قيمة Base64 وكلمة المرور إلى GitHub Secrets عبر قناة
آمنة؛ لا تُطبعان في المحادثة. يجب حفظ نسخة مشفرة خارج مساحة العمل المؤقتة
قبل أي عملية إصدار شهادة. لا توجد شهادة Apple أو مفتاح مستخدم حقيقي جرى
توليده في هذه الخطوة؛ اختبار الأداة يستخدم ملفات محلية مؤقتة فقط.

من حساب Apple يُنشأ ملف تعريف **App Store Connect** للتطبيق الصريح والشهادة
نفسهما، ثم تُحفظ نسخته Base64 في `IOS_PROFILE_BASE64`. ملفات Development
وAd Hoc وEnterprise لا تصلح لهذا المسار. إن لم تتوفر طريقة آمنة لإدخال المواد
في Secrets، نتوقف عند هذه الخطوة ولا ننشرها كملفات أو تعليقات عامة.

### أول تشغيل

1. من Actions افتح **ios-testflight → Run workflow**، واختر `main`.
2. أدخل رقم بناء جديدًا، مثل `1` ثم `2` للبناء التالي، واترك الرفع مغلقًا أول مرة.
3. بعد نجاح التوقيع والتصدير، توجد حزمة `hotel-city-iphone-signed` ضمن Artifacts
   لمدة 14 يومًا. تحتوي IPA موقعة للمتجر، وليست ملف تثبيت مباشر من تطبيق Files.
4. بعد مراجعة سجل التطبيق، يمكن تشغيله مع الرفع مفعّلًا ورقم بناء جديد. يستخدم
   `altool` للتحقق لدى Apple ثم الرفع. لا يضيف مختبرين ولا يقدم اللعبة لمراجعة المتجر.
5. نجاح أمر الرفع يحتاج أن تتبعه معالجة Apple وظهور البناء في TestFlight؛ ثم
   إعداد الاختبار الداخلي واختيار المختبرين وتجربة الهاتف فعلًا.

فاحص التوقيع يرفض الملف المنتهي أو الفريق/التطبيق الخطأ أو الشهادة غير المطابقة.
يجري توقيع App/Release وحده؛ لا يُفرض provisioning على حزم Swift. تُمسح ملفات
التوقيع وkeychain المؤقت بعد العملية، وتُحذف الآلة المستضافة عند انتهاء المهمة.

## خيار لاحق: Xcode Cloud

## ما أصبح موجودًا في المشروع

- مخطط `App` مشترك، مع Archive على إعداد Release.
- `ios/App/ci_scripts/ci_post_clone.sh` يختار Node 22، ويثبت تبعيات lockfile،
  ويبني اللعبة بمسار الهاتف، ثم ينسخ الملفات إلى مشروع iOS. يتوقف عند الفشل.
- GitHub يشغّل السكربت نفسه قبل بناء المحاكي وأرشفة Release لهاتف iPhone
  دون توقيع، ويفحص تطابق ملفات اللعبة. نتيجة التشغيل وروابط الأدلة في PR.
- لا توجد شهادة توزيع أو مفتاح Apple في Git. التوقيع الفعلي يتم عند ربط Apple.

## المعلومات المطلوبة قبل أول توزيع

1. فريق Apple المراد النشر باسمه، وTeam ID الخاص به.
2. Bundle ID الدائم وسجل Hotel City في App Store Connect، إن كانا موجودين.
   `com.hotelcitytycoon.app` حاليًا معرّف تطوير مؤقت؛ لا تسجله اعتمادًا على هذا
   الدليل وحده. يجب تثبيت الهوية في إعدادات Capacitor والمنصتين وفاحص الحزمة معًا.
3. هل سبق تفعيل Xcode Cloud لهذا المشروع؟ إن لم يحدث، يلزم Mac لتفعيل المسار
   أول مرة في Xcode. بعد ذلك يمكن إدارة البناء من App Store Connect.

كلمة مرور Apple ورمز التحقق لا يُرسلان في المحادثة أو يُحفظان بالمستودع.

## التفعيل الأول بعد تثبيت الهوية

على Mac يدعم Xcode 26 أو أحدث، مع حساب المالك وNode 22:

1. استخدم نسخة المستودع التي تتضمن هذه التعديلات؛ لا يكفي فتح فرع أقدم.
2. من مجلد `hotel-city-tycoon` شغّل:

   ```bash
   ios/App/ci_scripts/ci_post_clone.sh
   npm run mobile:ios
   ```

3. اختر Target المسمى `App`، ثم **Signing & Capabilities**، وحدد فريق Apple
   والمعرّف الدائم المؤكد. أبقِ التوقيع التلقائي مفعّلًا. تُحفظ إعدادات المشروع
   المتفق عليها في الفرع قبل أول بناء سحابي.
4. في Report navigator افتح Cloud ثم **Get Started**، واختر منتج `App`.
   اسم التطبيق الظاهر للمستخدم داخل الحزمة هو Hotel City.
5. اسم workflow المقترح: `Hotel City — iPhone beta`. استخدم Xcode 26.3 إن كان
   متاحًا؛ هذا إصدار فحص GitHub الحالي. اختر Archive لـiOS، Scheme: `App`،
   Configuration: `Release`، وتوزيع TestFlight. لا تضف Test action حاليًا:
   اختبارات اللعبة تعمل في GitHub، ولا توجد حزمة XCTest ضمن المشروع.
6. راجع شروط التشغيل والفرع قبل البدء. اسمح لتطبيق Xcode Cloud بالوصول إلى
   مستودع `mf103871-boop/hotel-city-tycoon-lastest` أثناء الإعداد. اتصال Codex
   الحالي لا يمنح Apple الوصول تلقائيًا.
7. اختر سجل التطبيق الموجود، أو أكمل إنشاء سجل بالهوية والاسم المتفق عليهما.
   شغّل أول بناء على الفرع الذي يحتوي التغييرات وإعدادات الفريق.
8. بعد نجاح Archive والتوقيع ومعالجة Apple للبناء، راجع صفحة **TestFlight**.
   أضف postaction للتوزيع على مجموعة اختبار داخلية يحددها المالك، بعد مراجعة
   أي أسئلة تطلبها Apple عن التطبيق. لا تعتبر اكتمال البناء إثباتًا لوصوله
   إلى الهاتف حتى يصبح متاحًا في TestFlight ويثبت عليه.

إذا لم يتوفر Mac ولم يكن Xcode Cloud مفعّلًا، يُستخدم مسار GitHub Actions
الموثق أعلاه. لا يكفي تنزيل حزمة المحاكي لتثبيتها على iPhone.

## ما يبقى بعد التثبيت

اختبار التدوير والحواف الآمنة واللمس والصوت والحفظ والخروج والعودة على iPhone
فعلي. الرسومات والأيقونات الحالية ليست اعتمادًا للهوية البصرية الجديدة، ونجاح
هذه التجربة لا يعني جاهزية نشر اللعبة في المتجر.

المصادر: [إعداد أول workflow لدى Apple](https://developer.apple.com/documentation/xcode/configuring-your-first-xcode-cloud-workflow)،
[سكربتات البناء المخصصة](https://developer.apple.com/documentation/xcode/writing-custom-build-scripts).

مصادر مسار GitHub: [حفظ شهادات Apple واستخدامها على macOS المستضاف](https://docs.github.com/en/actions/how-tos/deploy/deploy-to-third-party-platforms/sign-xcode-applications)،
[رفع البناء إلى Apple](https://developer.apple.com/help/app-store-connect/manage-builds/upload-builds/).
