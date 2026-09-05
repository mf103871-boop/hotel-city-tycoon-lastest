/**
 * Schema validation for the bundled game data — development only.
 *
 * `src/data/index.ts` used to call `Schema.parse` on every file as it built
 * `GameData`. That guard could not fail in a shipped build: the JSON is baked
 * into the bundle at build time, and `npm run build` runs `validate:data`
 * (the same Zod schemas, plus `tools/validate-data/integrity.mjs`) over those
 * exact bytes before Vite ever sees them. What it did do was ship Zod and
 * every schema to every phone — 20KB gzipped, measured, of a check whose
 * answer was decided minutes earlier on a build machine.
 *
 * So the parse lives here, behind `import.meta.env.DEV`. In development a
 * malformed data file still throws loudly and by name, which is the case that
 * ever mattered: somebody editing `data/*.json` and getting it wrong.
 *
 * This module must therefore never be imported from a production code path —
 * doing so drags Zod back into the bundle. `index.ts` reaches it through a
 * dynamic import inside a `DEV` branch, which Vite folds away entirely.
 */
import {
  EconomySchema, RoomsSchema, ShiftsSchema, StarsSchema, GuestsSchema,
  StaffSchema, EventsSchema, PlotsSchema, DecorSchema, LevelsSchema,
  ObjectivesSchema, UpgradesSchema, ShopSchema, SeasonsSchema, GiftsSchema,
  NeighboursSchema, AnimationSchema,
} from './schemas/index.ts';

/** The shape `index.ts` hands over: the raw files, before any narrowing. */
export interface RawBundle {
  economy: unknown; rooms: unknown; shifts: unknown; stars: unknown;
  guests: unknown; staff: unknown; events: unknown; plots: unknown;
  decor: unknown; levels: unknown; objectives: unknown; upgrades: unknown;
  shop: unknown; neighbours: unknown; seasons: unknown; gifts: unknown;
  animations: readonly unknown[];
}

/**
 * Parse every file through its schema, throwing on the first that fails.
 *
 * The return value is discarded on purpose: nothing here transforms, defaults
 * or coerces (no `.default()`, `.transform()`, `.catch()` or `z.coerce` exists
 * in `src/data/schemas`, and `tools/selftest/regressions.ts` holds that true),
 * so a parsed file and its raw JSON differ only in the documentation keys Zod
 * strips. Which means the game can read the raw object and this can stay a
 * pure check.
 */
export function validateGameData(raw: RawBundle): void {
  EconomySchema.parse(raw.economy);
  RoomsSchema.parse(raw.rooms);
  ShiftsSchema.parse(raw.shifts);
  StarsSchema.parse(raw.stars);
  GuestsSchema.parse(raw.guests);
  StaffSchema.parse(raw.staff);
  EventsSchema.parse(raw.events);
  PlotsSchema.parse(raw.plots);
  DecorSchema.parse(raw.decor);
  LevelsSchema.parse(raw.levels);
  ObjectivesSchema.parse(raw.objectives);
  UpgradesSchema.parse(raw.upgrades);
  ShopSchema.parse(raw.shop);
  NeighboursSchema.parse(raw.neighbours);
  SeasonsSchema.parse(raw.seasons);
  GiftsSchema.parse(raw.gifts);
  for (const anim of raw.animations) AnimationSchema.parse(anim);
}
