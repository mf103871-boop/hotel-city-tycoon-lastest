# Phase 2b — moving rooms, storage, staff assignment, expansion

No graphics, animation, sound or asset was touched. No balance number was
changed — the storage rules reuse `economy.cleanliness.incomeGateThreshold` and
`economy.limits.maxRoomsPerHotel` rather than introducing new ones.
7 files modified. `SCHEMA_VERSION` 9 → 10, with a migration.

This completes Phase 2.

---

## 1. Root cause

**A room could be built or sold, and nothing else.**

There was no `MOVE_ROOM`, so a hotel's layout was decided by the order rooms
happened to be built in and could never be revised. There was no `STORE_ROOM`,
so **selling was the only way to take a room down** — and selling was
destructive in three separate ways:

- it liquidated the room's decor at 33%, which for gem-priced pieces meant
  **converting gems into coins**, the exact leak Phase 2a had just closed on
  `REMOVE_DECOR`
- it set the room's staff to `roomId: null` — and with no `ASSIGN_STAFF` and no
  `FIRE_STAFF`, that member of staff was **permanently stranded**: unable to
  work, unable to be moved, unable to be let go
- it replaced the staff objects instead of mutating them, so any reference held
  before the sale silently pointed at stale data

And `EXPAND_PLOT` compared `plot.blocks` — a total, not a shape. A plot with more
blocks can be narrower than the one it replaces, which would leave rooms sitting
outside the buildable area.

---

## 2. Storage rules

A room may be put away only when it is:

- not `required` (the lobby stays)
- empty of guests
- free of fire and pests
- at or above `incomeGateThreshold` cleanliness

**That last rule is the important one.** Storage must not be a broom cupboard
for problems: a filthy room drags the hotel's average down, and letting it be
put away would make cleaning optional and the star rating a lie. The threshold
is the one the income gate already uses, so there is no new number to tune.

A stored room keeps **its identity** — same `id`, same decor with the same
placed-piece ids, same `decorPoints`, same cleanliness, same `builtAtTick`. What
comes back is the room that went in, not a fresh one built from the definition.

**Staff are not stored with the room.** They stay hired at their grade and
become unassigned, because a person is not part of the furniture.

---

## 3. Commands added (6)

| Command | Notes |
|---|---|
| `MOVE_ROOM` | Free. Guests, decor and staff all come along — only the coordinates change. Ignores itself in the collision check, or it would always collide with the space it is standing in. |
| `STORE_ROOM` | Rules above. Releases staff, refreshes stars. |
| `PLACE_STORED_ROOM` | Optional x/y; falls back to auto-placement. Leaves storage and lands in one step, after every check has passed. |
| `ASSIGN_STAFF` | Leaving the old post is part of taking the new one, or a member of staff would stand in two rooms and have their efficiency counted twice. |
| `UNASSIGN_STAFF` | |
| `FIRE_STAFF` | Empties their post on the way out. |

---

## 4. A test caught a real inconsistency

`selling a room releases its staff rather than stranding them` failed on first
run. The cause was not the logic I had just written — it was that `SELL_ROOM`
rebuilt the staff array with `.map()` and fresh objects while every other staff
path mutates in place. Mixing the two is the sort of split-brain that surfaces
later and somewhere else. `SELL_ROOM` now mutates, like everything around it.

---

## 5. Fixes to existing commands

**`SELL_ROOM`** now refunds the room and **returns its decor to the player's
store** rather than liquidating it. Rebuilding elsewhere no longer costs full
price again, and gem-priced decor is no longer converted to coins.

**`roomDetail().sellRefund`** was promising the decor's value too. A selftest
caught the mismatch immediately — `got 2831, expected 2871` — which is the check
doing exactly its job: the number on the sheet has to be the number that
arrives. It now reports the room only, and exposes `canStore` so the UI can tell
the difference between "you may sell this" and "you may put this away".

**`EXPAND_PLOT`** now checks that every existing room fits inside the new
plot's actual rectangle, and emits a `plotExpanded` event it previously
swallowed.

---

## 6. Migration 9 → 10

One field, `storedRooms`, defaulting to `[]`. Nothing to reconstruct: before
this version a room could only be built or sold, so no player has a room in
limbo. `validateState` rejects a stored room without an id, a defId, or a decor
list.

---

## 7. Files modified (7)

**Core (4)** — `state/types.ts`, `state/init.ts`, `commands/index.ts`, `save/index.ts`

**Bridge / i18n (3)** — `selectors.ts`, `rejections.ts`, `locales/en.json`, `locales/ar.json`

**Tests (1)** — `tools/selftest/timeline.ts` (+14 checks)

---

## 8. New tests — 14 checks, `timeline.ts` now at 50

A room moves free of charge and loses nothing · a room cannot be moved onto
another · or off the plot · storing and restoring returns the same room, decor
and condition · a filthy room cannot be hidden in storage · nor an infested or
burning one · nor an occupied one, and never the lobby · storage survives a save
round trip · staff move between rooms and stand in only one · staff cannot take a
role a room does not want · firing empties the post · selling releases staff
rather than stranding them · selling returns decor instead of liquidating it · a
plot that cannot hold the hotel is refused.

---

## 9. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | ✅ 16/16 |
| `test:logic` | ✅ 33/33 |
| `test:selftest` | ✅ **497 checks across 26 modules** (was 483) |
| `typecheck` | ✅ zero real errors |
| `sim:session` / `sim:sessions` | ✅ both hold |
| `lint` | ⚠️ **not runnable offline** |
| `build` | ⚠️ **not runnable offline** |

---

## 10. Effect on the played game

- **The hotel's layout is no longer permanent.** Rooms can be rearranged freely,
  which is most of what makes a building game a building game.
- Taking a room down no longer destroys what is in it.
- Staff can be moved to where they are needed, and let go — before this, hiring
  was irreversible and selling a room stranded a person forever.
- `requireReceptionist` can now safely be set to `true` if you want it, because
  there is finally a route back from losing a receptionist. **That is your call**
  — it is a one-word data change and I have left it off.

---

## 11. Risks and deferred work

**Still no inventory or storage panel.** `storedDecor()` and `canStore` are
exposed through the bridge, but there is no screen to place or sell from, and no
drag-to-move gesture. The commands are complete and tested; what is missing is
UI, which I have kept out of engineering phases per your scope rules.

**Storage is bounded only by `maxRoomsPerHotel`,** shared with placed rooms. That
was the least invented rule available; if storage should have its own limit it
is a data field and a balance decision.

**Still open from Phase 1** — the offline resolver overestimates by 1.96× and
`offlineEfficiency: 0.5` masks it. Phase 6.

**Still open since Phase 0** — `lint` and `build` unverified offline.

---

**Phase 2 complete. Stopping here. Phase 3 — the guest lifecycle, satisfaction
and reviews — awaits your approval.**
