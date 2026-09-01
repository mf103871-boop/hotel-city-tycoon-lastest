# Phase 6a — the offline model, the gift cycle, and the XP curve

No graphics, animation, sound or asset was touched. 10 files modified, one added.
**No schema version bump.**

Phase 6 as written is the largest in the plan: the economy split, shift
trade-offs, XP, ROI targets, gifts, and six player profiles simulated to D180.
This is **6a** — the structural fixes and the measuring instrument, because
every number in 6b would otherwise be measured against a model I had already
shown to be wrong. **6b** is scoped at the end.

---

## 1. First: a correction to what I told you

I reported the offline resolver overestimating live throughput by **1.96x**
three times, in Phases 1a, 1b and 5. **That figure was wrong.** It came from
coins on a single configuration — the two-room starting hotel — and I
generalised from one measurement.

Measured properly, across five hotel sizes and two window lengths:

```
rooms lvl hours | live  away | ratio | undiscounted | coins
    0   1     1 |   61    36 | 0.590 |        1.180 | 1.149
    0   1     4 |  239   144 | 0.603 |        1.205 | 1.150
    2   5     1 |  121    50 | 0.413 |        0.826 | 0.765
    2   5     4 |  457   201 | 0.440 |        0.880 | 0.807
    6  15     1 |  131    79 | 0.603 |        1.206 | 1.245
    6  15     4 |  539   316 | 0.586 |        1.173 | 1.202
   12  25     1 |  195   122 | 0.626 |        1.251 | 1.357
   12  25     4 |  796   489 | 0.614 |        1.229 | 1.326
   20  35     1 |  281   180 | 0.641 |        1.281 | 1.427
   20  35     4 | 1153   720 | 0.624 |        1.249 | 1.386

undiscounted mean 1.148   range 0.827 .. 1.280
```

The real bias is **+15% on average**, and it runs in **both directions** — the
small hotel is *under*estimated at 0.83, the large one overestimated at 1.28. It
was never a uniform doubling.

My first attempt at this measurement was itself broken: I opened a 24-hour shift
at level 5, which has not unlocked it, so two rows served zero guests and the
mean was meaningless. The harness now picks the longest shift the level allows.

---

## 2. Root cause: one number doing two jobs

`offlineEfficiency: 0.5` was presented in the data as a design lever — being
present should be worth something. It was really a fudge factor absorbing the
modelling error above. The lever read 0.5 and delivered about 0.95, and nobody
could tell, because a correction and a design decision were multiplied into one
figure.

They are separate now:

| Field | What it is | How it is set |
|---|---|---|
| `analyticThroughputFactor` | 0.87 | **Measured.** 1 / 1.148, correcting the closed-form model's assumption of perfect packing |
| `offlineEfficiency` | 0.85 | **Chosen.** How much less an unwatched hotel earns, on purpose |

**Delivered throughput now averages 0.849 against a declared 0.85.** The lever
finally means what it says.

`tools/balance-sim/offline-parity.ts` is the harness, wired as `npm run
sim:parity`. Re-run it after any change to arrivals, capacity or reception and
set the factor to `1 / mean`.

---

## 3. The seventh-day gift, paid every day, for ever

```js
const day = Math.min(data.gifts.days.length, state.gift.streak + 1);
```

Once the streak reached 7, `min(7, 8)` pinned it at 7. Day seven pays **60,000
coins and 5 gems**. A player who logged in for a week never had to run a hotel
again — the gift alone dwarfed operating profit indefinitely.

The cycle now wraps: `(streak % days.length) + 1`. Verified over ten
consecutive days:

```
cycle: 1 2 3 4 5 6 7 1 2 3
```

`gifts.resetHours` is also read now, rather than the code assuming 24 hours
regardless. The two agreed; they would not have if anyone had edited the field.

---

## 4. The XP curve has one source of truth

`xpToNext` is authored and `xpTotal` is its running sum. Storing both invites
them to drift, and the drift is invisible: a level table that disagrees with
itself still loads, still looks reasonable, and quietly puts a milestone out of
reach. `validate:data` now fails if the two disagree, and a selftest asserts it
independently.

The `curve.formula` string remains documentation, and remains wrong — it
generates neither column. That was recorded in Phase 0 under your option A
decision and nothing here changes it.

---

## 5. The 32 empty levels, measured

32 of 60 levels unlock nothing. They are not scattered evenly — they clump:

| Run | Length |
|---|---|
| **53 to 60** | **8 levels** |
| 45 to 51 | 7 levels |
| 36 to 42 | 7 levels |

**The last eight levels of the game unlock nothing at all.** A player who
reaches level 52 has seen every room, every staff role, every guest type and
every plot the game contains, and then levels up eight more times for nothing.

I have not filled them. That is content authoring — new rooms, new decor tiers,
a mastery track — and inventing it inside an engineering phase would be me
deciding what your game contains. **The options are: author content for the
tail, add a mastery system, or cut `maxLevel` to 52.** Your call, and it belongs
in 6b alongside the ROI targets.

---

## 6. What I did NOT do, deliberately

**`dailyBonusCoins` is still unpaid.** Every star tier promises 400-3,500 coins
a day. Implementing it is a short job; doing it before the sources-and-sinks
ledger exists would add an income stream to a model I cannot yet audit. It
belongs in 6b with the rest of the economy.

**Shift trade-offs are untouched.** The longest shift is still cheapest per hour
and least effort, so it still dominates. Rebalancing that needs the D1-D180
simulations across player profiles, which is 6b.

---

## 7. Offline coin parity is recorded and still wrong

Throughput is honest now; the money is not. The resolver pays every served guest
a spawn-weighted **average** rate; the tick loop pays each guest their own rate
and pays nothing for guests who leave without a room. So the two disagree on
coins even when they agree on guests, and the direction depends on which guest
types happen to be unlocked. Measured range: **0.77 to 1.43** of live, against a
0.85 lever.

There is now a selftest that says so out loud rather than passing quietly, with
the measured range in its bound. Fixing it means the resolver settling payouts
per guest type — 6b.

---

## 8. Files modified (10 + 1 new)

**New** — `tools/balance-sim/offline-parity.ts`

**Data & schema (3)** — `data/economy.json`, `schemas/economy.ts`, `package.json`

**Core (4)** — `data-source.ts`, `sim/offline.ts`, `systems/liveops.ts`, `commands/index.ts`

**Tests (3)** — `tools/validate-data/integrity.mjs`, `tools/selftest/timeline.ts` (+5),
`tools/selftest/data-coverage.ts`

---

## 9. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | PASS 16/16 |
| `test:logic` | PASS 33/33 |
| `test:selftest` | PASS **536 checks across 27 modules** (was 531) |
| `typecheck` | PASS, zero real errors |
| `sim:session` / `sim:sessions` / `sim:parity` | PASS |
| `lint` | **not runnable offline** |
| `build` | **not runnable offline** |

---

## 10. Effect on the played game

- **The daily gift stops being the whole economy.** This was the single largest
  balance defect in the project: an infinite 60,000-a-day faucet.
- An unwatched hotel now earns 85% of a watched one, because that is what the
  data says it should.
- The level table can no longer drift out of agreement with itself.

---

## 11. Remaining for 6b

1. Sources and sinks ledger — instrument every coin in and out
2. `OperatingProfit` separated from rewards
3. Offline payouts settled per guest type, closing the coin gap
4. Shift trade-offs, so no single duration dominates
5. `dailyBonusCoins` — implement or delete
6. The 32 empty levels — content, mastery, or a shorter game
7. D1/D7/D30/D90/D180 across six player profiles, on a neutral date
8. ROI targets and inflation control

**Still open since Phase 0** — `lint` and `build` unverified offline.

---

**Stopping here. Phase 6b awaits your approval.**
