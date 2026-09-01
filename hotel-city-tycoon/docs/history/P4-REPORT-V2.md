# Phase 4 — staff, cleaning, maintenance and incidents

No graphics, animation, sound or asset was touched. No balance number was
changed. 8 files modified, one added. **No schema version bump** — nothing about
the saved shape changed.

---

## 1. Root cause

**Two of the six functional rooms worked for free.**

Every functional room declares a `staffRole` and a staff slot. Four of them
checked whether anyone was actually employed there; two did not:

| Room | Effect | Needed staff? |
|---|---|---|
| Lobby | reception throughput | ✅ (since Phase 1b) |
| Housekeeping | cleaning capacity | ✅ |
| Laundry | cleaning boost | ✅ |
| Staff room | wage discount | n/a — no staff slot |
| **Maintenance** | halves fire chance | ❌ **bought once, worked forever** |
| **Business** | +12% arrivals, stacking 3× | ❌ **bought once, worked forever** |

Each of them had its own copy of the "is this room contributing" question, and
two copies had simply never asked it. There is now **one** `effectActive()`, and
every functional effect goes through it.

---

## 2. Cleaning had two implementations that disagreed

The tick loop applied `cleanRate × coverage × seconds` to every room and
subtracted an occupancy term. The offline resolver applied a different figure
derived from checkouts, then a separate rot term. Neither was wrong on its own
terms, and they disagreed — so the same hotel came back from an absence at a
different cleanliness than it would have reached being watched.

**The uniform spread was also the wrong model.** Coverage of 0.5 meant every
room cleaned at half rate, so a hotel with too few cleaners had *every* room
drift below the income gate together. Real staff prioritise. Now so does the
simulation:

```
1. rooms below the income gate   — every second here is money not being made
2. empty guest rooms             — about to take an arrival, should be ready
3. dirtiest first
4. by id, so order never depends on array order
```

`src/core/systems/cleaning.ts` is the only implementation. Measured over an
hour: watched **1.000**, away **1.000**.

---

## 3. A test caught me changing balance

While consolidating, I wrote the soiling term as
`dirtRatePerGuestCheckout × 0.02 × seconds × dirtMult × occupants.length`. The
old tick loop charged a **flat** rate for any occupied room. That one added
factor made rooms dirtier, and the objectives selftest failed immediately:

```
✗ every objective is reachable by actually playing
    unreachable after full play: four_stars (75%), five_stars (60%)
```

Reverted. A consolidation phase is not allowed to retune balance, and the check
that noticed is the one that exists to stop exactly this.

---

## 4. Incidents

| Fix | Before |
|---|---|
| **Pest cooldown applied** | `cooldownSec` was in the data since P1; an infestation could recur the instant it was cleared |
| **Cap on simultaneous incidents** | A hotel that slipped below the threshold had **every room infested in the same tick** — not an incident, a wipe. The cap is derived from the data (one per declared hazard, plus one), not invented |
| **`clearRewardXp` paid** | Fire clears promised 30 XP in the data and paid **none** |
| **`blocksIncome` read from the event** | The answer was hardcoded in two places that did not agree with the data. The event file and `economy.cleanliness.pestBlocksIncome` are now **and**-ed, so a contradiction between the two fails closed rather than one silently winning |
| **No escape by selling** | Selling was the one hazard exit that cost nothing: the refund arrived, the incident vanished, and clearing it properly was strictly worse value. `STORE_ROOM` already blocked this; `SELL_ROOM` now does too |

---

## 5. The staff grade lottery, and the floor that ate it

Amenity capacity was `Math.floor(def.capacity × efficiency × upgradeMult)`. A
silver barista at 1.2 efficiency on a four-seat cafe gives 4.8 → **4**. So
silver cost **25% more in wages and delivered nothing at all**, and gold at 1.45
gave 5.8 → 5, one extra seat for 60% more wage.

Efficiency now lands where it can always be felt: **service speed**, the same
place Phase 1b put reception. Seats round rather than floor; the remainder pays
out as faster service. A selftest asserts silver serves faster than bronze.

**On the lottery itself:** `FIRE_STAFF` arrived in Phase 2b, so a bad draw is no
longer permanent — fire and re-hire is a plannable route at the cost of the hire
fee. I have not added a training system on top of that; it would be new content
rather than a fix, and it belongs in a content phase you scope deliberately.

---

## 6. Files modified (8 + 1 new)

**New** — `src/core/systems/cleaning.ts`

**Core (6)** — `systems/cleanliness.ts` (`effectActive`, data-driven income gate),
`systems/events.ts`, `systems/guests.ts`, `sim/tick.ts`, `sim/offline.ts`,
`commands/index.ts`

**Tests (2)** — `tools/selftest/timeline.ts` (+11), `tools/selftest/data-coverage.ts`

---

## 7. Reserved fields retired

`blocksIncome` and `clearRewardXp` left the list — the simulation reads both
now, and `data-coverage` fails if a reserved field gains a reader without
leaving. The store stands at **150 runtime-consumed · 7 UI-only · 15 reserved ·
40 structural**, up from 133 consumed at the end of Phase 2.

Still reserved for Phase 4's own scope: `roomsPerCleaner` and `pestClearCost`
(the latter still duplicates `events.json` `pest.clearCost`; one of them has to
go and that is a data decision), and `roomTypes`.

---

## 8. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | ✅ 16/16 |
| `test:logic` | ✅ 33/33 |
| `test:selftest` | ✅ **521 checks across 27 modules** (was 510) |
| `typecheck` | ✅ zero real errors |
| `sim:session` / `sim:sessions` | ✅ both hold |
| `lint` | ⚠️ **not runnable offline** |
| `build` | ⚠️ **not runnable offline** |

---

## 9. New tests — 11 checks, `timeline.ts` now at 74

No room gets its effect from staff who are not there · maintenance only reduces
fire risk once staffed · business only lifts arrivals once staffed · moving a
cleaner changes capacity immediately · a better grade always buys something ·
cleaners work on the rooms losing money first · online and offline reach the
same cleanliness · a hotel cannot be wiped out by simultaneous incidents ·
clearing pays the promised XP · a hazard cannot be escaped by selling · income
blocking comes from the event data.

---

## 10. Effect on the played game

- **Maintenance and Business now cost wages to work.** They were the two best
  buys in the game precisely because they were free to run.
- Understaffed hotels degrade gracefully: the cleaners hold the line on the
  rooms that earn, instead of everything sinking together.
- A silver or gold hire is finally worth its wage.
- An infestation is an incident, not a wipe.
- Fires pay the XP the data always promised.

---

## 11. Risks and deferred work

**Wages just went up in real terms.** Maintenance and Business now need staff to
function, so a player running both is paying two more salaries for effects they
used to get free. That is the correct behaviour and it is also a balance change
in effect if not in number — **Phase 6 should look at it explicitly.**

**`pestClearCost` still duplicates `events.json`.** The command charges the
event's `clearCost`; the economy field is unread. One of the two should go, and
which one is your call.

**No staff panel.** Assignment, unassignment and firing are commands with no UI
route beyond what already existed.

**Still open from Phase 1** — the offline resolver overestimates by 1.96×.
**Still open since Phase 0** — `lint` and `build` unverified offline.

---

**Stopping here. Phase 5 — room quality, decor and stars — awaits your approval.**
