# Phase 1a — time, saving, offline progress, shifts and the queue

No balance number was changed. No graphics, animation, sound or asset was touched.
27 files modified, one added. `SCHEMA_VERSION` 7 → 8, with a migration.

Phase 1 as written was larger than one delivery. This is **1a** — the time and
shift foundation everything else in the plan stands on. **1b** is scoped at the
end and awaits approval.

---

## 1. Root cause

Four separate defects, one shared cause: **the live loop and the offline
resolver each answered "is the hotel open?" for themselves, and answered
differently.**

`isOpen()` was `activeShiftId !== null && tick < endsAtTick` — a boolean with no
room to express *"the shift is over but the guest in the spa paid for that
treatment"*. So each side improvised:

- the tick loop kept admitting and charging guests for as long as somebody watched
- the resolver stopped dead at `endsAtTick`

Which one a player got depended on whether the app happened to be open. Every
divergence below grew out of that gap.

---

## 2. The state machine

```
        START_SHIFT                 endsAtTick              graceEndsAtTick
  Closed ──────────► Active ───────────────► Grace ───────────────► Closed
                       │                       │                       │
        arrivals ✓     │        arrivals ✗     │      arrivals ✗       │
        check-in ✓     │        check-in ✗     │      check-in ✗       │
   new amenity ✓       │   new amenity ✗       │      income ✗         │
       cleaning ✓      │      cleaning ✗       │       decay ✓         │
                              finish current ✓        settle once ✓
```

`shiftPhase(state)` is the single function both sides call. `graceSec` lives in
`data/shifts.json` at 900 seconds.

**Grace settlement policy**, chosen once and tested: a guest accepted while the
hotel was open is served — they finish and pay in full, exactly once, then
leave. Anyone still outside (arriving or queued) was never accepted, so they
walk away and count as lost. Voiding paid-for stays punishes the player for a
shift ending on schedule; letting them run on is an unpaid shift.

---

## 3. Defects fixed

| # | Defect | What actually happened |
|---|---|---|
| 1 | **Cold boot erased the absence** | The constructor set the time baseline to `now`, so the resolver was handed an elapsed time of zero and did its job perfectly. `savedAtMs` existed in the envelope and nothing read it. `start()` erased it a second time. |
| 2 | **The cap truncated the clock** | `elapsedMs` itself was clamped to 14h, then `tick` and `epochMs` advanced by the clamped value. A day away moved the world 14 hours. A 48h shift stayed live for days. Seasons, gift days and every cooldown fell further behind reality on each absence — permanently and cumulatively. |
| 3 | **Offline paid twice** | The resolver paid a lump sum and left every real guest sitting in their room with `finishesAtTick` in the past. The moment the tick loop restarted it checked them all out and paid again. |
| 4 | **Queue duplication** | `tryCheckIn` pushed an id that was already queued, every tick. One guest filled an eight-slot lobby with eight copies of themselves in under a second. Guests who left with the queue full were never removed — the queue also held ids of people who had gone home. |
| 5 | **Check-in past the shift** | Live only. See §1. |
| 6 | **Drag re-paid a paid guest** | `leaving` also covers a guest who has checked out and paid. Re-queuing one had them check in and pay a second time. |
| 7 | **Drag cooldown unread** | `dragToLobbyCooldownSec` had been in the data since P1. The interaction was a button that could be held down. |
| 8 | **Cross-guest accounting** | `DRAG_GUEST` did `state.stats.guestsLost--`. It is a lifetime counter, and the rescued guest was not necessarily the one it counted — a rescue quietly cancelled somebody else's walk-away. |

### Found while working, not on the incoming list

**An unknown command returned `undefined`.** The switch fell through and every
caller does `result.ok`, so a malformed command from a stale client crashed
rather than being refused. Now returns `reject('unknownCommand')`.

---

## 4. Files modified (27 + 1 new)

**Data (1)** — `data/shifts.json` (`graceSec: 900`)

**Core (7)** — `data-source.ts`, `state/types.ts`, `state/init.ts`,
`systems/economy.ts` (the FSM), `systems/guests.ts` (settlement + reconciler),
`sim/tick.ts`, `sim/offline.ts`

**Save (1)** — `save/index.ts` (migration 7→8, `savedAtMs` surfaced, validation)

**Bridge / UI (4)** — `bridge/engine.ts`, `bridge/rejections.ts`, `ui/useGame.ts`,
plus `src/data/sim-data.ts`

**Schema & i18n (3)** — `data/schemas/index.ts`, `i18n/locales/en.json`, `ar.json`

**Tests & tools (11)** — new `tools/selftest/timeline.ts`; updated
`run.ts`, `vitest-parity.ts`, `characters.ts`, `data-coverage.ts`,
`amenities.ts`, `core-helpers.ts`, `objectives.ts`, `staff.ts`,
`balance-sim/load-data.ts`, `tests/support/fixture.ts`,
`tests/unit/simulation.test.ts`, `package.json`

---

## 5. Migration 7 → 8

Three fields, all backfilled conservatively:

- `shift.graceEndsAtTick` ← the shift's own `endsAtTick`. An existing save
  migrates into *no grace remaining*: it never hands a returning player a
  window they did not pay for, and the next shift they open gets full grace.
- `lastDragTick` ← `-1`, so the first drag is never on cooldown.
- `guest.everCheckedIn` ← true for guests holding a room, false for anyone
  mid-walk. At worst one existing passer-by can be rescued once.

`validateState` now checks `graceEndsAtTick`, `lastDragTick`, and that the grace
boundary is not *before* the shift end — a save claiming otherwise would put the
hotel in a phase the machine cannot name.

---

## 6. New tests — `tools/selftest/timeline.ts`, 21 checks

Cold boot after an hour · new game resolves nothing · a save from the future is
not a negative absence · the cap bounds reward not clock · a 48h shift dies
after 49h away · returning twice does not double-pay · absence longer than the
shift · the three phases in order · nobody checks in during grace · grace
settles once and empties the hotel · a closed hotel earns nothing · no duplicate
queue ids · the queue holds under 90 minutes of congestion · guest↔room
bidirectional · a paid guest cannot be dragged · the cooldown holds · a rejected
drag mutates nothing · a v7 save migrates and validates · save round-trip ·
online/offline pay parity · the shift ends at the same tick watched or not.

---

## 7. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | ✅ 16/16 |
| `test:logic` | ✅ 33/33 |
| `test:selftest` | ✅ **468 checks across 26 modules** (was 447/25) |
| `typecheck` | ✅ zero real errors |
| `sim:session` / `sim:sessions` | ✅ both hold |
| `lint` | ⚠️ **not runnable offline** |
| `build` | ⚠️ **not runnable offline** |

Four selftest modules and one unit test asserted the *old* behaviour and were
rewritten to assert the new contract — most importantly the three checks that
claimed `elapsedMs` should be clamped, which is precisely the bug.

---

## 8. Effect on the played game

- **Coming back after a night away now pays.** It previously paid nothing at all
  on a cold start, and the longer you stayed away the further your hotel's clock
  fell behind the real one.
- A 48-hour shift now ends after 48 hours instead of lingering for days.
- Reception no longer fills with eight copies of the same person.
- A shift ending is a wind-down rather than a guillotine: the guest in the spa
  finishes their treatment.
- Dragging someone back to reception can no longer be spammed, and can no longer
  be used to charge the same guest twice.

---

## 9. Risks and deferred work

**Needs a decision — Phase 6.** Measured at 1, 2 and 4 hours, stable to three
decimals: **the analytic resolver pays 1.91× what the tick loop pays**, and
`offlineEfficiency: 0.5` halves it, so the two land at 0.95 by accident. The
number the data presents as a design lever — being present should be worth
something — is really a correction factor for a throughput model that
overestimates by a factor of two. **Being present is currently worth about 4%,
not 50%.** Not touched: changing either one alone moves offline income by half.
The parity test guards the agreement at ≤10% and explicitly does not bless it.

**Risk.** `lint` and `build` remain unverified offline. The stub typecheck cannot
see pixi or React API misuse.

**Deferred to Phase 1b** — check-in duration driven by receptionist efficiency,
the no-receptionist rule, and `walkAwayIfNoRoom`. These need a new `checkingIn`
guest state, which touches the bridge, the renderer and the character views;
folding it into this delivery would have meant shipping it untested.

**Untouched, as instructed** — inventory, shop ownership, room moving, staff
lifecycle, satisfaction, stars, economy re-tuning.

---

**Stopping here. Phase 1b awaits your approval.**
