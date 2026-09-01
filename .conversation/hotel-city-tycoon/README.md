# Hotel City Tycoon

A 2D hotel management game. Mechanics modelled on Playfish's *Hotel City* (2010);
everything else — code, art, architecture — is new.

**Where the project stands lives in one place: `PROJECT-STATE.md`.** The full
game — simulation, renderer, save system, live-ops — is built and verified
headlessly. The current direction is closing the remaining gaps against the
original *Hotel City*; the gap map is `docs/AUDIT-AND-PARITY-REPORT.md`, and
every phase report lives under `docs/`.

---

## Run it

```bash
npm install          # or: pnpm install
npm run validate:data     # must pass before anything else
npm run dev
```

On Replit: press Run. The dev server reads `PORT` and `BASE_PATH` from the
environment and accepts the proxy hostname, so no configuration is needed.

Replit's package firewall blocks some published versions; `vitest` is pinned to
`^4.0.0` for that reason. The workspace uses `pnpm`, so `pnpm-lock.yaml` is the
lockfile to commit — not `package-lock.json`.

## Scripts

| Script | What it does |
|---|---|
| `npm run validate:data` | Both validators below. **Runs automatically before `build`.** |
| `npm run validate:data:refs` | Cross-file reference integrity. Zero dependencies — runs on a cold checkout. |
| `npm run validate:data:schema` | Zod shape validation of every `data/*.json`. |
| `npm run typecheck` | `tsc` in strict mode. |
| `npm run lint` | ESLint, including the layer-boundary rules. |
| `npm run test:logic` | Vitest unit tests. |
| `npm run build` | Validate → typecheck → Vite build. |

---

## The one rule that matters

Balance data lives in `data/*.json`. **No balance number is ever written in a
`.ts` file.** Prices, durations, incomes, unlock levels, star thresholds — all
of it is data, all of it is schema-validated, and all of it can be retuned
without touching code.

The second rule follows from the first: `src/core` is a pure simulation. It may
not import Pixi, React, Zustand, a storage adapter, or an i18n library, and it
may not call `Date.now()` or `Math.random()`. ESLint enforces this as an error,
not a warning.

Time and randomness are injected. That is what makes the simulation
deterministic, testable, replayable, and portable to a server later.

---

## Layout

```
data/          balance data — the source of truth
src/core/      pure simulation (empty until P2)
src/data/      Zod schemas + typed access to data/
src/render/    Pixi canvas (P3)
src/bridge/    core ↔ React (P2/P3)
src/ui/        React HUD
src/save/      IndexedDB + migrations (P6)
tools/         validators and the balance simulator
tests/         unit / determinism / e2e
```

## Asset key convention

Art is wired in at P3, but every data record already carries the key it will
load:

| Kind | Pattern | Example |
|---|---|---|
| Room | `room.<id>.<variant>` | `room.deluxe.base` |
| Guest | `guest.<id>.<variant>` | `guest.vip.idle` |
| Staff | `staff.<roleId>.<variant>` | `staff.chef.work` |
| Decor | `decor.<category>.<name>` | `decor.lighting.chandelier` |
| Event | `event.<id>.<variant>` | `event.fire.overlay` |
| UI | `ui.<group>.<name>` | `ui.currency.coins` |

Room variants: `base`, `night`, `dirty`, `pest`, `thumb`.
Character variants: `idle`, `walk`, `work`/`sleep`, `happy`, `angry`, `thumb`.

The validator rejects any malformed key, so P3 can trust every key it reads.
