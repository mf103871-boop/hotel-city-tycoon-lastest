# الطبقة التي لم تُشغَّل منذ خمس عشرة جولة

**فحصت اللحظة التي تكتب فيها `npm run verify`.**

هذا الأمر يشغّل أربعة أشياء، **ثلاثة منها تحتاج `node_modules` ولا تعمل عندي**:
`typecheck` و `lint` و `test:logic`.

الأخير هو ما أقلقني: ثلاثة ملفات vitest بواحد وثلاثين اختباراً، **لم تُنفَّذ
مرة واحدة منذ خمس عشرة جولة** — ومنها معايرة P8 التي غيّرت كل رقم دخل، وكل مدة
إقامة، والرصيد الابتدائي من 50,000 إلى 12,000.

**اختبار واحد يثبّت رقماً قديماً كان سيُفشل `verify` عندك، ولا أعرف.**

---

## شغّلتها بيدي

أعدت كتابة كل مقولاتها مقابل نفس المحمّل. **مرّت كلها.**

والسبب أنها **تقرأ البيانات ولا تثبّتها** — تؤكد أن الدخل يرتفع مع المرتبة، لا
أنه يساوي ثمانية. البنية هي ما أنقذها.

**لكن ذلك حظّ يرتدي ثوب التصميم**، وأنا لم أكن أعرف حتى نظرت.

---

## فأزلت العمى

`tools/selftest/vitest-parity.ts` يعكس مقولاتها ويعمل بلا `node_modules`:

```
✓ guest income rises with every tier
✓ a closed hotel earns nothing while away
✓ offline earning stops when the shift does
✓ the same seed replays identically
✓ stepping in pieces equals stepping all at once
```

**لا يحلّ محلّ vitest** — تلك تبقى على جهاز حقيقي بتغطية حقيقية. يزيل الفجوة
بينهما.

ومعه فحصان يحرسان المرآة نفسها من أن تكذب:

```
✓ the vitest files still exist and still assert something
      31 vitest cases across 3 files
✓ the vitest suite reads its numbers rather than hardcoding them
```

**الأول لأن مرآة تعكس ملفاً محذوفاً تُبلغ عن تغطية لم تعد موجودة.** والثاني
يرفض أي `toBe(50000)` — لأن ذلك بالضبط ما كان سيكسر عندك بصمت.

## وعطل في فحصي أمسكه أول تشغيل

```
✗ every unlock names something that exists
      level 1 unlocks "tourist", which does not exist
```

بنيت قائمة بما يمكن فتحه ونسيت أنواع النزلاء والترقيات. `tourist` **نوع نزيل لا
غرفة**. عيب في الفحص لا في اللعبة — والمُدقّق الحقيقي يغطّي هذا منذ P1.

---

## وحارس على الصنف كلّه

```
✓ nothing in the verify chain runs unchecked here
      5 verify steps, all accounted for
```

يمرّ على كل خطوة في `verify` ويطلب لها إما مرآة تعمل هنا **أو سبباً مكتوباً
لعدم وجودها**. لأن المشكلة لم تكن في vitest بل في أن طبقة كاملة كانت عمياء
ولا شيء يقول ذلك.

---

## الفحوصات

```
440 فحصاً بلا متصفح · 32 سيناريو متصفح
0 أخطاء · 0 تحذيرات
```
