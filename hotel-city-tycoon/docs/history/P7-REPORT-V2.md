# Phase 7 — objectives, seasons and the city

No graphics, animation, sound or asset was touched. **No schema version bump** —
nothing about the saved shape changed. 8 files modified.

---

## 1. The 190,000 coin objective that measured the wrong thing

`data/objectives.json` contains an objective with the id **`spotless`**, the
title key `obj.spotless.title`, and a reward of **190,000 coins**. Its condition
was:

```json
{ "kind": "anyRoomFill", "min": 1 }
```

`anyRoomFill` is the **decor meter**. So an objective named for a clean hotel
paid out for a well-furnished one, and scrubbing every room in the building
moved it not at all. It now reads `cleanliness`, and a selftest proves that
cleaning the hotel moves it and furnishing it does not.

---

## 2. An unknown condition used to pay its reward

```js
default:
  // An unrecognised condition is treated as satisfied so that a typo in
  // the data cannot strand every later objective behind it.
  return 1;
```

The reasoning in that comment does not hold: **nothing in the game is gated on
an objective.** An unclaimed one withholds only its own reward. So the only
thing "treat unknown as complete" bought was paying out for conditions nobody
had written — misspell a condition and collect.

Two changes:

- the checker returns **0** for anything it does not recognise
- the schema replaced `kind: z.string()` with an **enum of the eight conditions
  the checker implements**, so a typo now fails `validate:data` at load rather
  than reaching the player

A selftest also walks every objective in the data and asserts the checker
returns a real fraction for each — so the enum and the switch cannot drift
apart.

Three conditions were added while I was in there, because the systems behind
them now exist: `cleanliness`, `reputation`, `amenityCoverage`.

---

## 3. Objectives are grouped, and the grouping is used

Every objective now carries `group`: **tutorial** (2), **milestone** (11), or
**goal** (10).

`currentObjective` — the single next step the HUD shows — used to be "the first
unclaimed one in author order". It now shows tutorial steps while any remain,
then milestones, then goals. A new player is pointed at *open your hotel*, not
at *reach level 30*.

`data-coverage` caught me here: I added `group` to the data and nothing read it,
and the sweep failed on exactly that. A field that promises and does not deliver
is the thing that check exists to find, and it found one of mine.

**Nothing gates anything.** A selftest asserts a fresh hotel with zero claimed
objectives can still open a shift and build a room.

---

## 4. The rank and the list disagreed

The neighbour list sorted by **level, then stars**. `cityRank` counted only
rivals with a **higher level**.

So a rival on your level with more stars appeared above you in the list and was
not counted as ahead of you in the rank. The screen and the number contradicted
each other, and the player was the one left to reconcile them. There is now one
exported comparator, `ahead()`, and both use it.

---

## 5. The rivals are declared to be what they are

`Neighbour` now carries `npc: true`. It is on the type deliberately: these
hotels are generated from the player's own seed, and a city screen that shows
them without saying so tells the player there are other people here when there
are not. If real players ever arrive, this is the flag that separates them.

---

## 6. `season.dailyGems` — implemented, not deleted

Every season has promised 1-2 gems a day since P1 and nothing read the field, so
a season was only ever an income multiplier — the one thing your brief said a
season should not be on its own.

It now settles on the gift claim, keyed by the **same period as the star bonus**,
so it is idempotent for free: the day is already closed by the time it runs.
Claiming twice pays once, and a client insisting the clock has moved does not
reopen it.

---

## 7. Files modified (8)

**Data (1)** — `data/objectives.json` (spotless condition, groups)

**Schema (1)** — `schemas/index.ts` (condition enum, group)

**Core (4)** — `data-source.ts`, `systems/objectives.ts`, `systems/neighbours.ts`,
`commands/index.ts`

**Bridge (1)** — `bridge/objectives.ts`

**Tests (1)** — `tools/selftest/timeline.ts` (+9), `tools/selftest/data-coverage.ts`

---

## 8. New tests — 9 checks, `timeline.ts` now at 108

An unknown condition is not complete · spotless measures cleanliness · every
condition in the data is one the checker implements · a new player is pointed at
a tutorial step · no objective gates any other · the rank and the list agree ·
the rivals are declared NPCs · a visit pays once whatever the client claims the
time is · a season pays its gems once a day.

---

## 9. Verification results

Run in an offline container with dependency stubs, except where noted.

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | PASS 16/16 |
| `test:logic` | PASS 33/33 |
| `test:selftest` | PASS **555 checks across 27 modules** (was 546) |
| `typecheck` | PASS, zero real errors |
| `check:budget` | PASS, every budget met |
| `sim:session` / `sim:sessions` | PASS |

`typecheck`, `lint` and `build` were confirmed against the **real** toolchain on
your machine at the end of Phase 6d. Re-run them on this package.

---

## 10. Effect on the played game

- A 190,000 coin objective now rewards the thing it is named after.
- A typo in the objective data can no longer pay a reward.
- New players are guided rather than shown a level-30 target on day one.
- The city rank matches the city list.
- Seasons give gems, which is what makes a season an event rather than a number.

---

## 11. What is left

**The one open decision:** levels 53 to 60 unlock nothing. Author content, add a
mastery track, or cut `maxLevel` to 52.

**Deferred with a reason:** the upkeep basis. Upkeep scales with room count and
revenue scales with room quality, so a well-decorated hotel runs at a 90% margin
rather than the 63% the sink was tuned for. Basing part of upkeep on
`decorPoints` fixes it. That is a fourth balance tuning round and I would rather
you played it first.

**Real-player social is not started**, deliberately. It needs a backend,
snapshot visits, gifts, assists and transaction ids, and your brief scoped it as
an optional later phase. What this phase guarantees is that nothing currently
claims those rivals are real.

---

**Phase 7 complete. Phase 8 — the final invariants pass — is the last one in
your plan.**
