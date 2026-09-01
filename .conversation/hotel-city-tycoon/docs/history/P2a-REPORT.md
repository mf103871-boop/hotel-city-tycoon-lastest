# Phase 2a — decor ownership, the shop, and selling

No graphics, animation, sound or asset was touched. No balance number was
changed. 12 files modified, one added. `SCHEMA_VERSION` 8 → 9, with a migration.

Phase 2 as written covers ownership *and* room moving, storage, staff commands
and expansion. This is **2a** — the ownership half, which is where the money was
actually going missing. **2b** is scoped at the end.

---

## 1. Root cause

**There was nowhere for an owned-but-unplaced item to exist.**

`BUY_SHOP_OFFER` deducted coins or gems, wrote `shopTaken[period:defId] = true`,
pushed an event, and returned. That was the whole command. The record said *an
offer was taken* — it did not say the player got anything, because there was no
field in `GameState` that could hold an item they owned and had not placed.

Everything else followed from that missing field:

| Command | What it did |
|---|---|
| `BUY_SHOP_OFFER` | Charged full price, granted nothing. **The shop was a donation box.** |
| `PLACE_DECOR` | Charged full price *every time*, because it had no ownership to consult. So an item bought in the shop was paid for twice, and the shop discount bought literally nothing. |
| `REMOVE_DECOR` | Sold the piece at 33% and pocketed coins. There was **no way to take a piece down and put it somewhere else** — rearranging a room destroyed its contents. |

And because `REMOVE_DECOR` always refunded in coins, taking down a gem-priced
piece **converted gems into coins** at a third of face value. `refundCurrency`
and `gemPurchasesRefundable` had been sitting in the data since P1 describing the
policy that was supposed to prevent exactly that, and nothing read either one.

---

## 2. The model

```
   shop ──buy──► ownedDecor[defId]++ ──place──► in a room
                        ▲                            │
                        └──────── remove ────────────┘
                        │
                      sell ──► coins or gems, per policy

   place with an empty store ──► direct purchase, charged once, atomically
```

`src/core/systems/inventory.ts` is the only place `state.ownedDecor` is read or
written. One invariant: counts are whole numbers above zero, and a count that
reaches zero leaves the record rather than sitting there as a zero.

**Removal and selling are now separate acts**, as the spec required. Removal
returns the piece. Selling is its own command against the store.

**XP is paid on purchase, not on placement.** Otherwise take-down-and-replace
would be an XP tap.

---

## 3. The gem policy, now actually enforced

```json
"sellback": { "ratio": 0.333, "refundCurrency": "coins", "gemPurchasesRefundable": false }
```

- A coin item refunds in `refundCurrency` at `ratio`.
- A gem item refunds **in gems**, never coins — refunding premium currency as
  soft currency is a laundering route out of the premium economy.
- With `gemPurchasesRefundable: false`, a gem item does not refund at all, and
  `SELL_DECOR` returns `notRefundable`.

The schema now narrows `refundCurrency` to `'coins' | 'gems'` rather than any
string, so a typo in the data fails validation instead of silently paying
nothing.

---

## 4. The dead-data sweep did its job

Making the simulation read `refundCurrency` and `gemPurchasesRefundable` made
`data-coverage` fail — correctly:

```
✗ refundCurrency is on the reserved list but the simulation now reads it
```

That check was added in Phase 0 precisely so the reserved list cannot become a
place fields go to stop being examined. Both fields left the list.

`giftable` moved from Phase 2 to Phase 7: the ownership model it was waiting for
now exists, but gifting still needs a recipient, which is the social scope.

---

## 5. Migration 8 → 9

One field, `ownedDecor`, defaulting to `{}`.

**An existing player is not compensated** for shop purchases that vanished.
`shopTaken` records only that an offer was taken, not what became of it —
reconstructing purchases from it would mean inventing items from a record that
cannot support the claim. If you would rather grant a goodwill package, that is
a product decision and I would rather you made it deliberately than have me
guess at it inside a migration.

`validateState` now rejects a store holding a negative or fractional count.

---

## 6. Files modified (12 + 1 new)

**New** — `src/core/systems/inventory.ts`

**Core (4)** — `state/types.ts`, `state/init.ts`, `data-source.ts`, `commands/index.ts`

**Save (1)** — `save/index.ts`

**Bridge / UI (3)** — `selectors.ts` (`storedDecor`, `owned` on shop slots),
`rejections.ts`, `ui/ShopPanel.tsx`

**Schema & i18n (3)** — `schemas/economy.ts`, `locales/en.json`, `locales/ar.json`

**Tests (1)** — `tools/selftest/timeline.ts` (+9 checks)

---

## 7. New tests — 9 checks, `timeline.ts` now at 36

The shop hands over what it charges for · the full buy → place → remove → own
cycle · placing without owning buys it outright and charges once · selling is
its own act · selling what you do not own is refused and mutates nothing · gems
do not leak out through the sellback · ownership survives a save round trip · a
v8 save migrates into an empty store · a zero count never lingers in the record.

---

## 8. Verification results

Run in an offline container with dependency stubs. **Not authoritative — re-run on Replit.**

| Command | Result |
|---|---|
| `validate:data` (refs + schema) | ✅ 16/16 |
| `test:logic` | ✅ 33/33 |
| `test:selftest` | ✅ **483 checks across 26 modules** (was 474) |
| `typecheck` | ✅ zero real errors |
| `sim:session` / `sim:sessions` | ✅ both hold |
| `lint` | ⚠️ **not runnable offline** |
| `build` | ⚠️ **not runnable offline** |

---

## 9. Effect on the played game

- **The shop works.** It was taking money and giving nothing, every week, for
  every player.
- The weekly discount is now worth something — you buy at the discount and place
  for free, instead of paying full price twice.
- You can rearrange a room without destroying it.
- Gems can no longer be laundered into coins by buying and removing.
- The shop row shows how many you already own.

---

## 10. Risks and deferred work

**The store has a read path but no full player path yet.** `storedDecor()`
exposes it through the bridge and the shop row shows counts, but there is no
inventory screen to place or sell from. The commands are complete and tested;
what is missing is a panel. I kept to the minimum-UI rule rather than designing
a screen inside an engineering phase — say the word and it is a small, contained
job.

**Deferred to 2b** — `MOVE_ROOM`, `STORE_ROOM`, `PLACE_STORED_ROOM`,
`ASSIGN_STAFF`, `UNASSIGN_STAFF`, `FIRE_STAFF`, `EXPAND_PLOT` wiring, and
player-chosen x/y placement. Room storage in particular needs its own rules — an
occupied or infested room must not be storable, and storage must not become a
way to hide a filthy room from the hotel rating.

**Still open from Phase 1** — the offline resolver overestimates by 1.96× and
`offlineEfficiency: 0.5` masks it. Phase 6.

**Still open since Phase 0** — `lint` and `build` unverified offline.

---

**Stopping here. Phase 2b awaits your approval.**
