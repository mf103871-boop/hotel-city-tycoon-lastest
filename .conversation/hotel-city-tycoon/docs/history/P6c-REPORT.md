# Phase 6c — the gift, the shift, the sinks

Your instruction: 1 then 2 then 3. All three done, in that order.

No graphics, animation, sound or asset was touched. 9 files modified.
**No schema version bump.** Every change is a data value or the code that reads
one — no new mechanics.

---

## 1. The gift, cut roughly 8x

**Measured before:** a week of gifts paid 128,500 against 350,682 of room
revenue over 30 days. Gifts were **1.5x the entire hotel's takings**. Your brief
targets 10-25% of daily operating profit.

| day | 1 | 2 | 3 | 4 | 5 | 6 | 7 | week |
|---|---|---|---|---|---|---|---|---|
| before | 1,500 | 3,000 | 6,000 | 10,000 | 18,000 | 30,000 | 60,000 | **128,500** |
| after | 200 | 400 | 750 | 1,250 | 2,250 | 3,750 | 7,500 | **16,100** |

That is about 2,300 a day against a measured ~10,400 of daily operating profit —
roughly **21%**, inside the band.

**One thing I did not intend to touch, and had to.** I said gems would stay put
because what gems are *for* is still an open question. Cutting coins 8x broke
that: at the 1000-coins-per-gem reference the selftest uses, day 3's gem came to
outweigh the whole of day 4, and the ladder stopped climbing. Gems moved from
days 3 and 5 to day 5 only, plus day 7; the weekly total went from 7 to 6. It is
recorded in the data as a consequence, not a decision — their supply still wants
revisiting once you have decided what they buy.

---

## 2. The shift, and what turned out to be true

**Measured before:** every shift was cheaper per hour than the one below it —
12.50, 11.67, 10.83, 10.00, 9.17. The longest was simultaneously the cheapest
per hour *and* the least effort. That is not a trade-off, it is a right answer.

Two levers, both now in the data:

| shift | cost/hour before | cost/hour after | income multiplier |
|---|---|---|---|
| 2h | 12.50 | 12.50 | **1.15** |
| 6h | 11.67 | 13.00 | 1.08 |
| 12h | 10.83 | 13.50 | 1.00 |
| 24h | 10.00 | 14.00 | 0.94 |
| 48h | 9.17 | 14.50 | **0.88** |

Convenience now costs money and earns less per hour.

**But I have to be straight with you about how far this goes.** The long shift's
real advantage was never its price — it is **uptime**. A 48-hour shift covers
every hour you are away; a 2-hour shift covers two. In the runs, profiles that
reach for long shifts still finish ahead. Closing that gap with an income
multiplier would need short shifts to pay something like ten times more, which
would be absurd.

So what the numbers actually support is this: **the two serve different play
patterns, which is what your brief asked for** — "no ideal duration for all
hotels and play styles". A short shift is the efficient choice while you are
sitting there playing; a long one is the correct choice when you are about to
close the app. What is gone is the case where the long shift was better at both.
Anything more would need a different mechanic, not different numbers.

---

## 3. The sinks

**Measured before:** 25,062 of costs against 350,720 of revenue — a **93%
operating margin**. A hotel could not lose money, so no operating decision had a
downside.

Added `economy.upkeep`: charged when a shift opens, for the hours it covers,
per room, scaled by tier. A suite costs more to keep than a bunk.

```
perRoomPerHour: 16
tierMultiplier: 0.35
```

Tuned against `sim:horizon`. Ledger over 30 days at 10 min/day:

```
  roomRevenue                311860  operating
  giftReward                  65000
  objectiveReward             29400
  tips                           12  operating
  wages                      -13860  operating
  shiftCost                  -15019  operating
  roomBuild                  -21000
  upkeep                     -85248  operating
```

**Operating margin: 63%.** Inside the 55-70% target.

---

## 4. Before and after, at D180

| profile | before | after |
|---|---|---|
| 2 min/day | 4,901,899 | **1,198,123** |
| 10 min/day | 4,988,923 | 1,254,000 approx |
| 20 min/day | 3,570,638 | 759,000 approx |
| weekend only | 1,194,874 | 828,367 |
| lapsed, weekly | 350,513 | 254,171 |

**Reward share fell from 61-92% to 23-25%.** The hotel is now the main source of
the player's money, which it was not before.

Offline coin parity also improved as a side effect of the shift multiplier
reaching both paths: mean bias **0.975**, range 0.648-1.145 (was 1.015,
0.627-1.177 at the end of 6b, and 1.181 before 6b).

---

## 5. New tests — 5 checks, `timeline.ts` now at 97

No shift is both cheapest per hour and least effort · a short shift pays more
per guest than a long one · the multiplier reaches the payout · keeping the
hotel open costs something and scales with the hotel · a week of gifts no longer
dwarfs the hotel.

The first of those is a permanent guard: if anyone ever re-tunes shift costs
back into a descending per-hour curve, it fails.

---

## 6. Two tests caught the retune

**`the shift cost is split from its payroll`** — my own check from 6b — failed
the moment upkeep existed, because the ledger lines no longer added up to the
quoted price. Updated to include it.

**`the rewards climb toward the seventh day`** in `liveops` caught the gem
problem described in section 1. I would not have noticed it from the coin
figures alone.

---

## 7. Files modified (9)

**Data (3)** — `data/gifts.json`, `data/shifts.json`, `data/economy.json`

**Schema (2)** — `schemas/index.ts`, `schemas/economy.ts`

**Core (3)** — `data-source.ts`, `systems/economy.ts`, `systems/guests.ts`,
`sim/offline.ts`, `commands/index.ts`

**Tests (2)** — `tools/selftest/timeline.ts`, `tools/selftest/data-coverage.ts`

---

## 8. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | PASS 16/16 |
| `test:logic` | PASS 33/33 |
| `test:selftest` | PASS **544 checks across 27 modules** (was 539) |
| `typecheck` | PASS, zero real errors |
| `sim:session` / `sim:sessions` / `sim:parity` / `sim:horizon` | PASS |
| `lint` | **not runnable offline** |
| `build` | **not runnable offline** |

---

## 9. Still open from section 5 of the 6b report

You picked 1, 2 and 3. These three remain:

**4. `dailyBonusCoins`** — still unpaid. Now that the ledger exists it would slot
in as a `starBonus` source in about an hour. Implement or delete.

**5. The 32 empty levels** — 53 to 60 unlock nothing at all. Author content, add
a mastery track, or cut `maxLevel` to 52.

**6. Nobody reaches 3 stars by building rooms.** Every profile is still at 2
stars after 180 days. The simulated player never buys decor or amenities, so
`roomQuality` and `amenityCoverage` stay at zero. That is partly the harness
being a bad player and partly a real signal.

---

## 10. Risks

**These numbers are one seed and one crude player.** The harness builds rooms
and hires staff; it does not decorate, buy amenities, or clear hazards promptly.
Treat the figures as a floor, not a forecast, and re-run `sim:horizon` after any
change to room revenue.

**Upkeep is a real difficulty increase**, most sharply for a player who expands
faster than their occupancy. That is the intent — a hotel should be able to be
run badly — but it is worth watching in playtest, and `perRoomPerHour` is the
one dial.

**Still open since Phase 0** — `lint` and `build` unverified offline.

---

**Stopping here. Items 4, 5 and 6 await your decision.**
