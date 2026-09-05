import fs from 'node:fs';
import path from 'node:path';
import type { SimData } from '../../src/core/data-source.ts';

const ROOT = path.resolve(import.meta.dirname, '../..');
const read = (f: string) => JSON.parse(fs.readFileSync(path.join(ROOT, 'data', f), 'utf8'));

/**
 * The real balance data, loaded without Zod.
 *
 * Tests run against the shipping numbers on purpose: a suite that passes on a
 * hand-written fixture but fails on the real data is worse than no suite.
 */
export function simData(): SimData {
  return {
    economy: read('economy.json'),
    rooms: read('rooms.json').rooms,
    decor: read('decor.json').items,
    decorCatalogues: read('decor.json').catalogues,
    staffRoles: read('staff.json').roles,
    staffGrades: read('staff.json').grades,
    guestTypes: read('guests.json').types,
    shifts: read('shifts.json').shifts,
    // From the file, like everything else: this was a literal 900 while the
    // shipping value has been 0 since DEC #5, so the suite ran a grace period
    // no player ever gets.
    graceSec: read('shifts.json').graceSec,
    closedHotel: read('shifts.json').closedHotel,
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
