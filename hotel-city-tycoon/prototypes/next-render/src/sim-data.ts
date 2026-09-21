/**
 * SimData for the prototype, assembled straight from `data/*.json`.
 *
 * The point of this file is what it does NOT import. The shipped game reaches
 * the same object through `src/data/index.ts`, which pulls in Zod, sixteen
 * schemas and a Vite-only `import.meta.glob`. None of that is the simulation's
 * business, and the core's own rules say so (`eslint.config.js`). So the
 * prototype rebuilds the shape by hand and proves the claim behind it: the
 * 7,000 lines in `src/core` travel with nothing but their data.
 */
import type { SimData } from '../../../src/core/data-source.ts';

import economy from '../../../data/economy.json';
import rooms from '../../../data/rooms.json';
import shifts from '../../../data/shifts.json';
import stars from '../../../data/stars.json';
import guests from '../../../data/guests.json';
import staff from '../../../data/staff.json';
import events from '../../../data/events.json';
import plots from '../../../data/plots.json';
import decor from '../../../data/decor.json';
import levels from '../../../data/levels.json';
import objectives from '../../../data/objectives.json';
import upgrades from '../../../data/upgrades.json';
import shop from '../../../data/shop.json';
import neighbours from '../../../data/neighbours.json';
import seasons from '../../../data/seasons.json';
import gifts from '../../../data/gifts.json';

// Named one by one rather than globbed: nine files, and an explicit list is
// what lets a plain bundler read this directory at all.
import animInspector from '../../../data/animations/guest_inspector.json';
import animGuest from '../../../data/animations/guest_standard.json';
import animBartender from '../../../data/animations/staff_bartender.json';
import animChef from '../../../data/animations/staff_chef.json';
import animCleaner from '../../../data/animations/staff_cleaner.json';
import animLifeguard from '../../../data/animations/staff_lifeguard.json';
import animReceptionist from '../../../data/animations/staff_receptionist.json';
import animTrainer from '../../../data/animations/staff_trainer.json';
import animUsher from '../../../data/animations/staff_usher.json';

const cast = <T>(v: unknown): T => v as T;

export function simData(): SimData {
  return {
    economy: cast(economy),
    rooms: cast(rooms.rooms),
    decor: cast(decor.items),
    decorCatalogues: cast(decor.catalogues),
    staffRoles: cast(staff.roles),
    staffGrades: cast(staff.grades),
    guestTypes: cast(guests.types),
    shifts: cast(shifts.shifts),
    closedHotel: cast(shifts.closedHotel),
    graceSec: cast(shifts.graceSec),
    starTiers: cast(stars.tiers),
    stars: cast({ score: stars.score }),
    plots: cast(plots.expansions),
    levels: cast(levels.levels),
    events: cast(events.events),
    objectives: cast(objectives.objectives),
    upgrades: cast(upgrades.upgrades),
    shop: cast(shop),
    neighbours: cast(neighbours),
    seasons: cast(seasons.seasons),
    gifts: cast(gifts),
    animations: cast([
      animInspector, animGuest, animBartender, animChef, animCleaner,
      animLifeguard, animReceptionist, animTrainer, animUsher,
    ]),
  };
}
