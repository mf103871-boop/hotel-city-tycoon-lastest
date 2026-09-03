# Hotel City Tycoon

A 2D hotel management game. Mechanics modelled on Playfish's *Hotel City* (2010);
everything else — code, art, architecture — is new.

**Where the project stands is summarised in `PROJECT-STATE.md`; the governing
reference for every decision and the order of work is
`docs/HOTEL_CITY_MASTER_REFERENCE_AR.md`.** The full game — simulation,
renderer, save system, live-ops — is built and verified headlessly and in CI.
Current phase: P1, the visible decor system. Step reports live under `docs/`
as `HC-P{phase}-S{step}-REPORT.md`.

---

## Play it

**https://mf103871-boop.github.io/hotel-city-tycoon-lastest/** — built from `main`
on every change and installable on a phone. `docs/DEPLOY-PAGES.md` covers the
deploy, the `BASE_PATH` a project site needs, and the `?debug=1` / `?fresh=1`
handles.

## Run it

```bash
npm ci                    # one lockfile, package-lock.json (npm), generated on Node 22
npm run validate:data     # must pass before anything else
npm run dev
```

On Replit: press Run. The dev server reads `PORT` and `BASE_PATH` from the
environment and accepts the proxy hostname, so no configuration is needed.

Replit's package firewall blocks some published versions; `vitest` is pinned to
`^4.0.0` for that reason. The lockfile is `package-lock.json` (npm); CI runs
`npm ci` against it. Do not add a second lockfile.

## Scripts

| Script | What it does |
|---|---|
| `npm run validate:data` | Both validators below. **Runs automatically before `build`.** |
| `npm run validate:data:refs` | Cross-file reference integrity. Zero dependencies — runs on a cold checkout. |
| `npm run validate:data:schema` | Zod shape validation of every `data/*.json`. |
| `npm run typecheck` | `tsc` in strict mode. |
| `npm run lint` | ESLint, including the layer-boundary rules. |
| `npm run test:logic` | Vitest unit tests. |
| `npm run verify` | Data → typecheck → lint → unit tests → the headless self-test suite. |
| `npm run test:e2e` | Playwright, desktop and phone projects. On a machine without a GPU run it the way CI does (see `docs/CI-E2E.md`). |
| `npm run build` | Validate → typecheck → Vite build → stamp the service worker → budget and cheat checks. |

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
src/core/      pure simulation: deterministic, no Pixi, React, DOM or clock
src/data/      Zod schemas + typed access to data/
src/render/    Pixi v8 canvas: camera, culling, pools, gestures, characters
src/bridge/    core ↔ React: engine, store, selectors, notifications
src/ui/        React HUD, sheets, settings
src/save/      IndexedDB + migrations + export/import
src/audio/     WebAudio, one manager
public/assets/ art, audio and manifest.json (regenerate with gen:assets)
tools/         generators, validators, balance simulators, the self-test suite
tests/         unit / determinism / e2e
```

## Asset key convention

Every data record carries the key of the art it loads, and the manifest and
loader resolve it:

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

The validator rejects any malformed key, so the loader can trust every key it reads.
