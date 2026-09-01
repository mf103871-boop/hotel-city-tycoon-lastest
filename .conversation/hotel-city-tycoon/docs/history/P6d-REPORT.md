# Phase 6d — the star bonus, and what a competent player actually experiences

9 files modified. `SCHEMA_VERSION` 12 to 13. No graphics, animation, sound or
asset touched.

---

## 1. A correction to the Phase 6c report

**I told you the operating margin was 63%. Measured against a player who plays
properly, it is 90%.**

The 63% figure came from a harness that built rooms and hired staff and did
nothing else. When the simulated player also buys decor and amenities, revenue
roughly triples — decorated rooms earn more, satisfied guests tip — while upkeep
barely moves, because **upkeep scales with room count and revenue scales with
room quality**. The sink does not track the source.

```
10 min/day, 30 days, competent player
  roomRevenue               1103374  operating
  tips                        83485  operating
  giftReward                  65000
  starBonus                   35500
  objectiveReward             33540
  decorBuy                    -7230
  wages                      -13992  operating
  shiftCost                  -15840  operating
  roomBuild                  -21000
  upkeep                     -88512  operating
```

Revenue 1,186,859 against 118,344 of operating cost. **90% margin.**

The fix is to base upkeep partly on `decorPoints` as well as room count — a
well-appointed room costs more to keep than a bare one, which is both true and
what makes the sink follow the source. I have **not** made that change: it is
another balance tuning round and you have had three of those from me today
without seeing the game run.

---

## 2. Item 6 is answered, and the answer is good news

**A competent player reaches 3 stars on day 1 and holds it.**

| profile | day 1 | day 7 | day 30 | day 180 |
|---|---|---|---|---|
| 2 min/day | **3 stars** | 3 | 3 | 3 |
| 10 min/day | **3 stars** | 3 | 3 | 3 |

The "nobody leaves 2 stars after 180 days" result from 6b was **entirely the
harness playing badly**. It never bought the two things the rating measures —
decor and amenity breadth — so `roomQuality` and `amenityCoverage` sat at zero
by construction. The rating model is fine.

That is worth saying plainly because I reported it as a possible design defect
and it was a measurement defect. A harness that plays badly cannot tell you
whether a game is beatable.

The harness now buys amenity **breadth first** (one per distinct desire beats a
second copy of one you have), then rooms, then staffs every post, then decorates
with **variety** because repeats have diminishing returns.

---

## 3. Item 4 — `dailyBonusCoins` is paid

Every star tier has promised a daily payout since the first data file — 400 at
one star up to 3,500 at five — and nothing ever read the field.

It now settles alongside the gift claim, keyed by the **same period**, so
opening the game twice in a day pays once. A returning player who has missed a
week is paid for today, not for the week.

Booked to its own ledger line, `starBonus`: 35,500 over 30 days.

**Reward share is now 10-11%**, against 61-92% before Phase 6c. The hotel is
comfortably the player's main income, which was the point.

---

## 4. A test caught the double payment

`claiming pays and closes the day` in `liveops` failed immediately:
`got 900, expected 200`. The claim now settles two sources and the check was
measuring the purse. Rewritten to read the ledger, so it checks the gift on its
own and the purse against the sum — which is exactly what the ledger was built
for.

---

## 5. Files modified (9)

**Core (4)** — `state/types.ts`, `state/init.ts`, `save/index.ts`, `commands/index.ts`

**Tests & tools (5)** — `tools/balance-sim/horizon.ts` (the competent player),
`tools/selftest/timeline.ts` (+2), `tools/selftest/liveops.ts`,
`tools/selftest/data-coverage.ts`

---

## 6. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | PASS 16/16 |
| `test:logic` | PASS 33/33 |
| `test:selftest` | PASS **546 checks across 27 modules** (was 544) |
| `typecheck` | PASS, zero real errors |
| `sim:session` / `sim:sessions` / `sim:parity` / `sim:horizon` | PASS |
| `lint` | **not runnable offline** |
| `build` | **not runnable offline** |

---

## 7. What is left

**Item 5, untouched: the 32 empty levels.** Levels 53 to 60 unlock nothing at
all. Author content, add a mastery track, or cut `maxLevel` to 52. Still a
content decision, still yours.

**The upkeep basis**, from section 1. One tuning round, whenever you want it.

**Still open since Phase 0** — `lint` and `build` unverified offline. Nine
phases of work have now gone by without either being run. That is the largest
standing risk in this project and the only one I cannot close from here.

---

**My recommendation: stop taking phases from me and go play it.** The economy
has been retuned three times today against a simulated player, and the last
retune was measured against a bad one. Everything from here benefits more from
you opening it on Replit for twenty minutes than from another round of my
arithmetic.
