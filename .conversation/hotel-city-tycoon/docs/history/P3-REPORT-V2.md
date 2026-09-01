# Phase 3 — the guest lifecycle, satisfaction and reviews

No graphics, animation, sound or asset was touched. No existing balance number
was changed; a new `economy.satisfaction` block was added because the mechanic
did not exist. 11 files modified, two added. `SCHEMA_VERSION` 10 → 11.

---

## 1. Root cause

**A guest was a payment with a sprite attached.**

They arrived, occupied a bed for a fixed time, paid a fixed amount and left.
Nothing about the stay changed anything:

- a spotless room and a filthy one paid identically
- a guest who waited fifty-nine seconds and one who walked straight in paid
  identically
- a guest who slept in a room that was **on fire** paid identically
- `desire` was set at spawn and read **only by the renderer**, to draw a thought
  bubble above a guest nobody could act on and whose disappointment cost nothing

So the entire loop of *build an amenity → guests are happier → the hotel is
worth more* had no mechanism behind it. Cleaning was busywork whose only
consequence was the income gate. There was no reason to build a cafe.

---

## 2. The model

```
Satisfaction = clamp(
    base
  + roomQuality   × roomQualityWeight
  + cleanliness   × cleanlinessWeight
  + service       × serviceWeight
  + amenityMetBonus      (if they got what they came for)
  − unmetDesirePenalty   (if they did not)
  − waitRatio     × waitPenaltyMax
  − incidentPenalty      (if their room was burning or infested)
, 0, 100)
```

Every term is in `data/economy.json`. Every change is recorded on the guest with
a **reason code**, so a score can always be read backwards into the stay that
produced it. A selftest asserts the reasons sum to the score.

`src/core/systems/satisfaction.ts` is the only copy of this arithmetic. Online
and offline both route through `checkOut`, so an unwatched stay is judged by the
same yardstick as a watched one.

**Service is now measured, not assumed.** `receptionEfficiency` — built in Phase
1b — writes `lastServiceRating` at check-in, so a gold receptionist produces
visibly better stays and a 0.4 stand-in produces worse ones. That is what makes
staffing the desk a decision with a consequence rather than a wage.

---

## 3. Reputation

An average of reviews inside a **rolling window** (`reviewWindowSec`, 24h)
rather than a decayed constant. "The last day of guests" is something a player
can reason about; a decay constant is not. Bounded by time *and* by a 200-entry
cap, because a save is one copy of the player's hotel and an unbounded list is a
slow failure in it.

Measured over an hour of play: **54 reviews, reputation 80**.

---

## 4. Room choice: deterministic and explicable

It was `rng.pick` across every room of the highest acceptable tier — so the most
expensive room was always chosen, which of them was a coin flip, and **capacity
did not enter into it at all**.

Now, in order: highest acceptable tier → most free beds → cleanest → by id. A
hotel fills evenly instead of cramming one suite while others sit empty, and the
same seed produces the same hotel twice, which a selftest asserts.

---

## 5. Beginners are no longer taunted

`desireChance` runs to 0.55 for families and 0.8 for celebrities. At level 1
with no amenities built, that meant a stream of guests visibly wanting things
the player could not possibly have yet, each one a small penalty for nothing
they could have done.

Below `desireChanceEarlyUntilLevel` the chance is scaled by
`desireChanceEarlyScale` (0.4). A share still asks — that share is the signal
telling the player what to build — but most are simply happy with a bed.

---

## 6. Two bugs found in the tooling

**`core-helpers.ts` is both a helper module and a runnable selftest.** I put the
new guest fixture factory there; importing it executed that suite and called
`process.exit`, which **silently truncated `timeline.ts` from 50 checks to 24**
with no failure reported. A shared factory must not have a side effect, so it
now lives in its own module. Worth knowing about: any future import from
`core-helpers` into another suite will do the same thing.

**Sixteen hand-built guest literals.** Every field added to `GuestInstance` meant
sixteen edits. `testGuest()` takes only what a check is about.

---

## 7. Migration 10 → 11

Reputation starts at the neutral value from the data rather than being inferred
— there is no record of how past guests felt, because nothing ever asked them.
Guests in flight get a blank score sheet and full patience, so the first stay
that completes after the upgrade is judged on its own merits rather than on a
wait nobody measured.

---

## 8. Files modified (11 + 2 new)

**New** — `src/core/systems/satisfaction.ts`, `tools/selftest/guest-factory.ts`

**Data & schema (2)** — `data/economy.json`, `schemas/economy.ts`

**Core (6)** — `data-source.ts`, `state/types.ts`, `state/init.ts`,
`systems/guests.ts`, `sim/tick.ts`, `sim/offline.ts`, `save/index.ts`

**Bridge (1)** — `selectors.ts` (`reputationView`)

**Tests (5)** — `timeline.ts` (+13), `core-helpers.ts`, `characters.ts`,
`amenities.ts`, `objectives.ts`, `staff.ts`

---

## 9. New tests — 13 checks, `timeline.ts` now at 63

Every change carries a reason · the score is the sum of its reasons · a filthy
room scores worse · waiting costs satisfaction · an unmet desire dents without
wiping · an incident is remembered · reputation is the window average · tips are
bounded and threshold-gated · beginners are not taunted · unmet desires are
counted where the player can act · room choice is deterministic · no guest is
left in an unreachable state · a v10 save migrates and validates.

---

## 10. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | ✅ 16/16 |
| `test:logic` | ✅ 33/33 |
| `test:selftest` | ✅ **510 checks across 27 modules** (was 497/26) |
| `typecheck` | ✅ zero real errors |
| `sim:session` / `sim:sessions` | ✅ both hold |
| `lint` | ⚠️ **not runnable offline** |
| `build` | ⚠️ **not runnable offline** |

---

## 11. Effect on the played game

- **Cleaning matters to the player, not just to the income gate.** A dirty room
  produces worse reviews and a worse reputation.
- **Amenities have a reason to exist.** A guest who gets what they came for
  scores higher, tips, and leaves a better review.
- **Reception staffing is visible in outcomes**, not just in throughput.
- The hotel can now tell the player *eleven people wanted a gym this week*
  instead of drawing a sad face nobody could act on.
- Rooms fill evenly instead of cramming the single most expensive one.

---

## 12. Risks and deferred work

**The weights are provisional and I have not tuned them.** `base: 60` with the
current weights produces reputation around 80 in an empty starter hotel, which
is probably generous. Tuning belongs to Phase 6, after the economy is fixed —
tuning satisfaction against a broken offline model would be measuring with a
bent ruler.

**`roomQuality` is interim.** It reads decor fill against the room's target,
which is what exists today. Phase 5 replaces it with themes, variety, slot
compatibility and condition, and `HotelScore` then folds satisfaction in.

**Reputation is tracked but does not yet affect anything** — not stars, not
arrivals, not price. Wiring it in is Phase 5's `HotelScore`, deliberately, so
that the rating has one owner rather than two systems each nudging it.

**No UI yet.** `reputationView()` exposes the score, the review count and the
ranked unmet-desire list through the bridge. There is no panel showing it.

**Still open from Phase 1** — the offline resolver overestimates by 1.96×.
**Still open since Phase 0** — `lint` and `build` unverified offline.

---

**Stopping here. Phase 4 — staff, cleaning, maintenance and incidents — awaits
your approval.**
