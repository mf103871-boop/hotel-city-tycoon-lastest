/**
 * Loads data/*.json into the SimData shape, with no Zod and no bundler.
 *
 * The app goes through src/data (Zod-validated). This exists so the headless
 * tools can run on a cold checkout with nothing installed — which is exactly
 * the situation the validator has to work in.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { SimData } from '../../src/core/data-source.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

export function loadSimData(): SimData {
  return {
    economy: read('economy.json'),
    rooms: read('rooms.json').rooms,
    decor: read('decor.json').items,
    staffRoles: read('staff.json').roles,
    staffGrades: read('staff.json').grades,
    guestTypes: read('guests.json').types,
    shifts: read('shifts.json').shifts,
    closedHotel: read('shifts.json').closedHotel,
    graceSec: read('shifts.json').graceSec,
    starTiers: read('stars.json').tiers,
    stars: { score: read('stars.json').score },
    plots: read('plots.json').expansions,
    levels: read('levels.json').levels,
    events: read('events.json').events,
    objectives: read('objectives.json').objectives,
    upgrades: read('upgrades.json').upgrades,
    shop: read('shop.json'),
    neighbours: read('neighbours.json'),
    seasons: read('seasons.json').seasons,
    gifts: read('gifts.json'),
  };
}
