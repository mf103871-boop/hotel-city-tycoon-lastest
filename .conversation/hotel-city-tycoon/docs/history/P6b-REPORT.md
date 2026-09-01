# Phase 6b — the ledger, the offline payout, and what the simulations say

No graphics, animation, sound or asset was touched. **No balance number was
changed.** 11 files modified, one added. `SCHEMA_VERSION` 11 to 12.

This phase built the instrument and took the readings. **It deliberately does
not act on them** — the readings say six numbers need moving, and moving six
balance numbers is a decision, not a fix. They are in section 5 with the
evidence.

---

## 1. Root cause: the game could not tell profit from charity

`coinsEarned` and `coinsSpent` were two running totals with no breakdown. They
could not answer the question the whole of Phase 6 turns on: **is the hotel
profitable, or is the player living on gifts?**

There is now a ledger. Every coin in or out is tagged with one of nineteen
categories, and six of them are marked `operating` — the flows that are the
hotel doing its job, as opposed to being given things.

```
OperatingProfit = roomRevenue + amenityRevenue + tips
                - shiftCost - wages - hazardRepair

NetProfit       = OperatingProfit + gifts + objectives + events
                + social + sellbacks - purchases - investment
```

**Zero untagged coin paths remain** in `src/core`, and a selftest proves the
ledger's sum equals the change in the purse.

While tagging, I found level-up coin rewards were credited to the player
**without being added to `coinsEarned` at all** — invisible to every statistic
the game had.

---

## 2. Offline payouts, fixed

Phase 6a left offline coins ranging 0.77x to 1.43x of live while throughput was
correct. The cause: the resolver paid every room a single spawn-weighted
**hotel-wide** average, ignoring that a room only accepts guests inside its own
tier band. A suite was paid the average including backpackers who would never be
sent there; an economy room the average including celebrities it cannot host.
The two errors push in opposite directions and the net depended on which types
happened to be unlocked.

Payouts are now computed per tier band.

| | before | after |
|---|---|---|
| coin bias, mean | 1.181 | **1.015** |
| coin bias, range | 0.765 .. 1.427 | **0.627 .. 1.177** |

---

## 3. The long-horizon runs

`npm run sim:horizon` — six profiles, checkpointed at D1/D7/D30/D90/D180, on a
**neutral date** (11 March 2025). Every earlier run used `epochMs = 0`, which is
1 January 1970 and activates the New Year season, quietly inflating everything.

```
profile                 day |    coins |    level | stars |  operating |        net | reward share
2 min/day               180 |  4901899 |       23 |     2 |    1583399 |    4895899 |          65%
10 min/day              180 |  4988923 |       23 |     2 |    1670423 |    4982923 |          64%
20 min/day              180 |  3570638 |       13 |     2 |     305238 |    3564638 |          91%
casual, short shifts    180 |  3513903 |       12 |     2 |     252383 |    3507903 |          92%
weekend only            180 |  1194874 |       20 |     2 |    1056034 |    1188874 |          12%
lapsed, weekly          180 |   350513 |       13 |     1 |     297113 |     344513 |          18%
```

Full ledger, 10 min/day over 30 days:

```
  giftReward                 518500
  roomRevenue                350682  operating
  objectiveReward             29400
  tips                           38  operating
  shiftCost                  -10806  operating
  wages                      -14256  operating
```

---

## 4. What the numbers say

**No billion-scale inflation.** The old report cited 1.9B at D180. The worst
profile reaches 5.0M. That concern is closed.

**The gift is still the economy.** 518,500 against 350,682 of room revenue —
even after 6a fixed the day-7 repeat, gifts are **1.5x the entire hotel's
takings**. Your brief targets a gift worth 10-25% of daily operating profit. It
is at roughly 150%.

**Playing more earns less.** 2 min/day reaches 4.90M and level 23; 20 min/day
reaches 3.57M and level 13. The active player is 27% poorer and **ten levels
behind**. It is not the activity that does it — it is the shift. The profiles
that reach for long shifts win; the ones that pick short shifts lose, badly.
The long shift dominates exactly as your brief predicted.

**There are almost no sinks.** 25,062 of costs against 350,720 of revenue is a
**93% operating margin**. A hotel cannot lose money, so no operating decision
has a downside.

**Nobody leaves 2 stars.** Every profile is still at 2 stars after 180 days. My
simulated player only builds rooms and hires staff — it never buys decor or
amenities, so `roomQuality` and `amenityCoverage` stay at zero. That is a
limitation of the harness, and it is also a real signal: **a player who only
builds rooms never leaves 2 stars**, however long they play.

---

## 5. Six numbers that need moving — your decision

I have changed none of them. Each is a design choice with knock-on effects.

| # | Finding | Proposal |
|---|---|---|
| 1 | Gifts are 150% of operating profit | Cut the seven-day table by roughly 6x, or scale gifts to the hotel's own daily takings |
| 2 | Long shifts dominate | Give short shifts a presence bonus, or make long shifts cheaper in effort but worse per hour |
| 3 | 93% operating margin | Add real sinks: repairs, upkeep, training. Wages alone are not enough |
| 4 | `dailyBonusCoins` unpaid | Now that the ledger exists: implement it as a `starBonus` source, or delete the field |
| 5 | 32 empty levels, 53-60 unlock nothing | Author content, add mastery, or cut `maxLevel` to 52 |
| 6 | Nobody reaches 3 stars by building rooms | Either the reinvestment loop must push decor, or the score weights need revisiting |

**Say which of these to act on and I will do them as 6c.** I would take them in
the order 1, 2, 3 — the gift, the shift, the sinks — because each of the others
is measured against an economy those three define.

---

## 6. Files modified (11 + 2 new)

**New** — `tools/balance-sim/horizon.ts`, and `offline-parity.ts` from 6a

**Core (7)** — `systems/economy.ts` (the ledger), `state/types.ts`, `state/init.ts`,
`save/index.ts`, `sim/offline.ts`, `systems/events.ts`, `systems/progression.ts`,
`systems/guests.ts`, `commands/index.ts`

**Tests (2)** — `tools/selftest/timeline.ts` (+3), `package.json`

---

## 7. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | PASS 16/16 |
| `test:logic` | PASS 33/33 |
| `test:selftest` | PASS **539 checks across 27 modules** (was 536) |
| `typecheck` | PASS, zero real errors |
| `sim:session` / `sim:sessions` / `sim:parity` / `sim:horizon` | PASS |
| `lint` | **not runnable offline** |
| `build` | **not runnable offline** |

---

## 8. Migration 11 to 12

One field, `ledger`, starting empty. Not reconstructed from `coinsEarned` and
`coinsSpent` — those are two totals with no breakdown, and splitting them into
nineteen categories would mean inventing a history the save does not contain.

---

## 9. Risks

**The harness plays badly on purpose, and that limits what it proves.** It
builds rooms and hires staff; it does not decorate, buy amenities, or clear
hazards promptly. Its numbers are a floor on what a real player achieves, not a
prediction. Reading the 2-star result as "the game is broken" would be
over-reading it; reading it as "building rooms alone is not enough" is fair.

**Still open since Phase 0** — `lint` and `build` unverified offline.

---

**Stopping here. Phase 6c awaits your decision on section 5.**
