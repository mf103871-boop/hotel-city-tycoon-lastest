# مجموعة المتصفح لحقت باللعبة

**فحصت اللحظة التي ستشغّل فيها الاختبارات.**

مجموعة Playwright كُتبت في P6a. ومنذها أضفت المتجر، والمدينة، والترقيات،
والهدية اليومية، والمواسم — **ولم تنمُ المجموعة معها.**

```
شاشات بلا أي سيناريو:   ShopPanel · CityPanel · UpgradesPanel · DailyGift
أوامر لا يلمسها متصفح:  BUY_SHOP_OFFER · VISIT_NEIGHBOUR · BUY_UPGRADE · CLAIM_GIFT
```

**وهذا أخطر من غياب فحص.** مجموعة ناجحة تختبر أقلّ مما تبدو **أسوأ من مجموعة
غائبة، لأنها موثوقة.** كنت ستشغّلها فتمرّ 24 سيناريو وتظنّ اللعبة مغطّاة، ونصف
ما يفتحه اللاعب لم يُفتح مرة.

---

## ثمانية سيناريوهات جديدة

24 → **32**. والأربع شاشات مغطّاة الآن، وتسعة من ستة عشر أمراً يصلها المتصفح.

وليست فتحاً للشاشات فقط، بل تختبر ما يهمّ فيها:

```
✓ the shop offers a discounted shelf that can be bought from
✓ the shop says when its stock changes
✓ the city shows rivals and says plainly what they are
✓ visiting a rival pays once and then stops
✓ the upgrades panel shows what a tier would change
✓ the daily gift is offered without being hunted for
✓ a refusal explains itself instead of doing nothing
✓ every bottom-bar destination opens
```

**سيناريو المدينة يفحص سطر النزاهة نفسه** — أن الشاشة تقول صراحةً إن هذه
الفنادق جزء من اللعبة لا أشخاص. وهذا أهم عندي من أي ميزة فيها.

**وسيناريو الترقيات يفحص أن كل مسار يعرض `×1.36 → ×1.52`** — لأن «السمعة
الرابعة» ليست سبباً للإنفاق، والفرق بينهما هو الشاشة كلها.

**وسيناريو الهدية يفحص أنها تُعرض بلا بحث** — مكافأة يبحث عنها اللاعب ليست سبباً
للعودة.

---

## وحارسان يمنعان تكرار هذا

```
✓ the browser suite covers every screen a player opens
      9 screens, all reached by a scenario
✓ the commands a player can issue are exercised
      9 of 16 commands reachable from a scenario
```

**الأول يفشل البناء إن أُضيفت شاشة بلا سيناريو.** لأن هذا لم يحدث بإهمال بل
بالتراكم: كل ميزة كانت تبدو صغيرة، وثمانٍ منها صارت نصف اللعبة.

---

## الفحوصات

```
430 فحصاً بلا متصفح · 32 سيناريو متصفح
0 أخطاء · 0 تحذيرات · الميزانيات محقَّقة
```

**وحين تشغّلها الآن، ستختبر ما تدّعي.**
