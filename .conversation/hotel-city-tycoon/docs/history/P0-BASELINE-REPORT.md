# Phase 0 — stabilise the project and establish a true baseline

No balance number was changed. No graphics, animation, sound or asset was touched.
24 files modified.

---

## 1. Root cause

`src/data/sim-data.ts` hands the core 18 fields through `as unknown as SimData['x']`.
That cast severs the Zod-validated types from the hand-written `SimData` contract in
`src/core/data-source.ts`, and every contract drift below was hiding behind it.

| Symptom | What was actually true |
|---|---|
| `EconomyDef.simulation` had no `offlineResolution` | `offline.ts:46` **throws** unless it is `'analytic'` |
| `EventDef` missing 4 fields | All four are in `events.json` and were read by string indexing, which the cast made legal |
| `RunStats.shiftsOpened` undeclared | `SCHEMA_VERSION = 7` documents it; migration 6 writes it |
| `GameState.startedAtMs` / `visitedToday` undeclared | Migration 5 writes both |
| `src/data/schemas/*.ts` imported `./common` with no extension | Vite resolves it; Node's ESM loader does not — this is why `validate:data:schema` never started |
| 20 decor items had no `giftable` | Tier 6–8 luxury pieces; the Zod schema requires the field |

A single cast is why a build-breaking syntax error, a throwing contract and a
never-executing validator could all coexist with a green self-test suite.

---

## 2. Defects found that were not on the incoming list

**`src/save/index.ts` — misplaced `else if`.**
`gift.streak` was only ever validated when `startedAtMs` happened to be a number.
A save with a corrupt streak and a valid timestamp loaded silently. `stats.shiftsOpened`
was not validated at all. Both fixed; migrations reordered 5-before-6 so the chain reads
in sequence.

**`src/core/systems/liveops.ts` — `new Date()` inside the core.**
Directly violates the `no-restricted-syntax` rule the project sets on `src/core`, and is
the usual route by which an ambient clock or a local timezone leaks into a simulation that
must replay identically. Replaced with civil-from-days arithmetic.
**Verified equivalent across 95,850 timestamps spanning 1957–2039: zero mismatches.**

**`tools/selftest/data-coverage.ts` was reporting green while measuring nothing.**
It scanned `src/` *and* `tools/`, so a field mentioned only inside its own self-test
counted as "read". It also scanned `interface` blocks, so a field declared on `DecorDef`
counted as its own reader. Both removed. The sweep now scans `src/core` for runtime use
and the rest of `src/` for presentation use, with type declarations stripped.

**19 dead data fields surfaced** — only 4 of which were previously known. Independently
confirmed by grep: zero references outside schemas and type declarations.

**`data/levels.json` `curve.formula` generates neither column.**
`round(120 * 60^2.35, -1)` = 1,810,660, which matches neither `xpToNext` (2,068,142) nor
`xpTotal` (39,021,441) at L60. It is decorative documentation and was wrong.

---

## 3. Data field classification

```
125 runtime-consumed · 7 UI-only · 19 reserved · 40 structural
```

Every reserved field carries a stated reason and the phase that owns it. The sweep now
fails if a reserved field gains a runtime reader without leaving the list, so the list
cannot become a place fields go to stop being checked.

| Phase | Reserved fields |
|---|---|
| 1 — time, shifts, queue | `walkAwayIfNoRoom`, `dragToLobbyCooldownSec` |
| 2 — inventory, shop, building | `giftable`, `refundCurrency`, `gemPurchasesRefundable` |
| 4 — staff, cleaning, incidents | `roomsPerCleaner`, `pestClearCost`, `roomTypes`, `scope`, `blocksIncome`, `clearRewardXp` |
| 5 — room quality, decor, stars | `dailyBonusCoins` |
| 6 — economy, XP, progression | `formula`, `curve`, `xpToNext`, `grantOnGuestCheckout`, `resetHours` |
| 7 — objectives, live-ops | `dailyGems` |
| Deferred | `maxSaveSlots` |

**Duplicate source of truth found:** `economy.cleanliness.pestClearCost` is duplicated by
`events.json` `pest.clearCost`, and the command charges the latter. One of the two must go
in Phase 4.

---

## 4. The XP curve decision (your call: option أ)

The incoming report's "1.9M vs 39M" contradiction resolves as a **misreading, not a
balance defect**: `formula` was read as a cumulative total when the table treats `xpTotal`
as cumulative and `xpToNext` as the per-level step.

Per your decision, documentation and the test assertion were corrected and **no number was
touched** — `levels[]`, `maxLevel` and `formula` are byte-identical to the upload.

The failing assertion was replaced with three that are actually checkable today:

1. `xpTotal[n] === xpTotal[n-1] + xpToNext[n-1]` for all 60 levels — verified, zero violations
2. the curve never flattens or reverses
3. a ceiling of 40,000,000 on the cumulative total

**Recorded openly:** at 39,021,441 the curve is roughly six times *harsher* than Hotel City
(6,280,000 at L52), which is the opposite of the design goal written in `levels.json`.
The ceiling stops further drift; it is not an endorsement. Phase 6 owns rebuilding the
table or changing the goal.

---

## 5. Files modified (24)

**Data (2)** — `data/decor.json` (20 × `giftable: false`), `data/levels.json` (note only)

**Core (4)** — `data-source.ts`, `state/types.ts`, `systems/liveops.ts`, `systems/objectives.ts`

**Schemas (3)** — `schemas/index.ts`, `schemas/economy.ts`, `schemas/rooms.ts`

**Save (1)** — `save/index.ts`

**Render (2)** — `render/characterView.ts`, `render/index.ts`

**UI (8)** — `UpgradesPanel.tsx` (syntax error), `HotelCanvas.tsx`, `Hud.tsx`, `WelcomeBack.tsx`,
`DailyGift.tsx`, `ObjectiveCard.tsx`, `RoomSheet.tsx`, `ShopPanel.tsx`

**Tests & tools (4)** — `tests/unit/data.test.ts`, `tools/selftest/data-coverage.ts`,
`tools/selftest/core-helpers.ts`, `tools/selftest/neighbours.ts`

---

## 6. Save migration

**None required.** `SCHEMA_VERSION` stays at 7. All three newly declared fields
(`shiftsOpened`, `startedAtMs`, `visitedToday`) were already written at runtime by
migrations 5 and 6 — only the TypeScript declarations were missing. No existing save
changes shape.

`validateState` is now stricter (it checks `stats.shiftsOpened` and the `visitedToday`
shape). Any save that fails is quarantined rather than overwritten, as before.

---

## 7. New tests

- level table internal consistency (cumulative = running sum of steps)
- XP curve monotonicity
- XP ceiling with the Phase 6 decision recorded in the comment
- `every reserved field carries a stated reason` — fails if a reserved field gains a
  runtime reader without leaving the list

---

## 8. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data:refs` | ✅ 16 files, 23 rooms, 77 decor, 283 assets, 72/72 required |
| `validate:data:schema` | ✅ 16/16 (previously could not start) |
| `test:logic` | ✅ 33/33 (previously 22 pass, data suite failed) |
| `test:selftest` | ✅ 447 checks across 25 modules |
| `sim:session` / `sim:sessions` | ✅ both hold |
| `typecheck` | ✅ zero real errors; 3 residual are stub artifacts (pixi `Ticker`, React event types) |
| `lint` | ⚠️ **not runnable offline** |
| `build` | ⚠️ **not runnable offline** |

---

## 9. Effect on the played game

Almost none by design, which is the point of this phase.

- The game **compiles at all** — the syntax error blocked every build.
- Walking characters animate: `activity` never reached the renderer, so the walk cycle
  never ran. One field, and the street stops being static.
- Upgrade costs render instead of crashing the panel.
- The "guests served" figure on the Welcome Back screen is locale-formatted.
- Seasons are now timezone-independent. Previously the same save could see a different
  season in Riyadh than in London.
- Corrupt saves are caught rather than loaded.

---

## 10. Risks and deferred work

**Risk — `lint` and `build` are unverified.** The unused-variable class (9 sites) and the
core `new Date` are fixed, which covers most of the reported 25 errors, but
`@typescript-eslint/consistent-type-imports` cannot be checked without ESLint. The 4
warnings are `no-console` in `HotelCanvas.tsx` and `main.tsx` — intentional diagnostics,
left alone.

**Risk — the stub typecheck cannot see pixi or React API misuse.** Anything wrong *inside*
a pixi call or a React event handler is invisible here.

**Deferred by design** — every reserved field, the `pestClearCost` duplication, and the
XP re-tune. None is a Phase 0 concern and each is recorded against its owning phase.

**Untouched, as instructed** — offline progress, the queue, shift end, shop ownership,
inventory, staff lifecycle, satisfaction, stars, economy. Phase 0 changed no game rule.

---

**Stopping here. Phase 1 awaits your approval.**
