# Phase 1b — reception

No graphics, animation, sound or asset was touched. No existing balance number
was changed; three new ones were added because the mechanic did not exist.
13 files modified. **No schema version bump and no migration** — see §5.

This completes Phase 1. 1a delivered the time and shift foundation; 1b is the
reception depth that was deferred from it.

---

## 1. Root cause

**Checking in was instantaneous, so reception was decoration.**

`data/rooms.json` has declared `"staffRole": "receptionist"` on the lobby since
the first data file. `data/staff.json` has declared three grades at 1.0, 1.2 and
1.45 efficiency since the same file. Nothing read either one at reception.

The consequence: a gold receptionist cost **60% more in wages** and did exactly
as much work as a bronze one. The grade you were randomly dealt was cosmetic,
and the one staffing decision available in the opening hours of the game was a
decision about nothing.

`walkAwayIfNoRoom` was dead in the same way — the behaviour it names was
hardcoded, so turning the flag off changed nothing.

---

## 2. The mechanic

```
  arriving ──► [desk busy?] ──yes──► queued
      │              │
      │              no
      ▼              ▼
   queued ◄─── [room free?] ──no──► queued, or away if the lobby is full
                     │                        (walkAwayIfNoRoom)
                    yes
                     ▼
              checkingIn  ── bed reserved immediately ──► staying
              (checkInSec / receptionEfficiency)
```

**Reception serves one guest at a time.** That is what makes a faster
receptionist worth paying for: they are throughput, not a multiplier.

**The bed is reserved when reception starts, not when it finishes.** Otherwise
two guests are sent to the same bed while the first is still at the desk.

Measured: bronze **60 ticks** (6.0s), gold **41 ticks** (4.1s).

---

## 3. The unstaffed-desk decision

Your spec allowed either: block the shift, or run a weak stand-in behind a
designed flag. I implemented **both**, in data, and set it to the non-blocking
one:

```json
"requireReceptionist": false,
"tempReceptionistEfficiency": 0.4
```

**Why:** blocking is a soft-lock risk. There is no way to hire or reassign staff
until Phase 2, so a player who lost their receptionist would have no route back.
`START_SHIFT` does return `noReceptionist` when the flag is true and the desk is
empty — the gate is built and tested, it is simply switched off.

**Flip it to `true` whenever Phase 2 gives the player a hiring route.** That is a
one-word data change, and it is your call rather than mine.

---

## 4. Found while working, not on the list

**The renderer offered grab handles the simulation would refuse.**
`characterViews` computed `draggable` from its own copy of the rules, which
Phase 1a had changed underneath it — it never learned about the open-hotel
requirement, the cooldown, or `everCheckedIn`. The selftest that holds the two
predicates in step caught it. Both now read the same clauses.

**The offline resolver did not model reception at all.** Beds were a ceiling on
throughput and the desk was not, which is part of why the resolver overestimated
against the tick loop. Adding it moved online/offline parity from **0.958 to
0.980**.

---

## 5. Why no migration

The guest state union gained a value (`checkingIn`); no field was added or
removed and no shape changed. Every existing save is valid at version 8, and no
saved guest can be in the new state. Adding a version bump would force a
rewrite for no benefit.

`checkInSec`, `requireReceptionist` and `tempReceptionistEfficiency` are new
**data** fields with schema entries — data is loaded fresh, never migrated.

---

## 6. Files modified (13)

**Data (1)** — `data/economy.json`

**Core (5)** — `data-source.ts`, `state/types.ts`, `systems/guests.ts`
(`receptionEfficiency`, `checkInTicks`, `completeCheckIn`, `queueOrTurnAway`),
`sim/tick.ts`, `sim/offline.ts`, `commands/index.ts`

**Bridge (2)** — `characters.ts`, `rejections.ts`

**Schema & i18n (3)** — `schemas/economy.ts`, `locales/en.json`, `locales/ar.json`

**Tests (2)** — `tools/selftest/timeline.ts` (+6 checks),
`tools/selftest/characters.ts`, `tools/selftest/data-coverage.ts`

---

## 7. New tests — 6 checks, `timeline.ts` now at 27

A better receptionist checks guests in faster · check-in takes time rather than
happening instantly · reception serves one guest at a time · a guest at the desk
holds the bed they were given · an empty desk slows the hotel rather than
stopping it · a slower desk checks fewer people in.

---

## 8. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | ✅ 16/16 |
| `test:logic` | ✅ 33/33 |
| `test:selftest` | ✅ **474 checks across 26 modules** (was 468) |
| `typecheck` | ✅ zero real errors |
| `sim:session` / `sim:sessions` | ✅ both hold |
| `lint` | ⚠️ **not runnable offline** |
| `build` | ⚠️ **not runnable offline** |

---

## 9. Effect on the played game

- **Staffing reception is now a real decision.** A gold receptionist is 46%
  faster than bronze, which is what the wage premium was always supposed to buy.
- Guests visibly queue at the desk instead of teleporting into rooms.
- Losing your receptionist hurts (0.4× throughput) without ending the run.
- Reception is now a bottleneck you can invest out of — the first genuine
  throughput upgrade in the game.

---

## 10. Risks and deferred work

**Still needs your decision — Phase 6.** The analytic resolver now overestimates
by **1.96×** rather than 1.91× against the tick loop, and `offlineEfficiency:
0.5` still halves it. The accidental agreement got closer (0.980) but it is
still accidental. Being present is worth about 2%, not 50%. Unchanged, as
before: moving either number alone moves offline income by half.

**Risk — reception may be too tight a bottleneck.** At 6 seconds a guest, one
desk serves 600 guests an hour, which is far above current arrival rates but
becomes the binding constraint for a large hotel. The number is provisional and
belongs to the Phase 6 balance pass; the mechanic is what Phase 1b owed you.

**Risk** — `lint` and `build` remain unverified offline, as since Phase 0.

**Deferred** — hiring, firing and reassigning staff (Phase 4), which is also what
would let `requireReceptionist` safely become `true`.

---

**Phase 1 complete. Stopping here. Phase 2 — inventory, shop ownership, room
moving and storage — awaits your approval.**
