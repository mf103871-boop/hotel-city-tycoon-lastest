/**
 * Adapts the Zod-validated GameData into the plain SimData the core expects.
 *
 * This is the seam that keeps the core dependency-free: the app validates once
 * here, then hands the simulation a plain object. Tests and headless tools
 * build the same shape their own way.
 */
import type { SimData } from '../core/data-source.ts';
import { GameData } from './index.ts';

export function appSimData(): SimData {
  return {
    economy: GameData.economy as unknown as SimData['economy'],
    rooms: GameData.rooms.rooms as unknown as SimData['rooms'],
    decor: GameData.decor.items as unknown as SimData['decor'],
    decorCatalogues: GameData.decor.catalogues as unknown as SimData['decorCatalogues'],
    staffRoles: GameData.staff.roles as unknown as SimData['staffRoles'],
    staffGrades: GameData.staff.grades as unknown as SimData['staffGrades'],
    guestTypes: GameData.guests.types as unknown as SimData['guestTypes'],
    shifts: GameData.shifts.shifts as unknown as SimData['shifts'],
    closedHotel: GameData.shifts.closedHotel as unknown as SimData['closedHotel'],
    graceSec: GameData.shifts.graceSec as unknown as SimData['graceSec'],
    starTiers: GameData.stars.tiers as unknown as SimData['starTiers'],
    stars: { score: GameData.stars.score } as unknown as SimData['stars'],
    plots: GameData.plots.expansions as unknown as SimData['plots'],
    levels: GameData.levels.levels as unknown as SimData['levels'],
    events: GameData.events.events as unknown as SimData['events'],
    objectives: GameData.objectives.objectives as unknown as SimData['objectives'],
    upgrades: GameData.upgrades.upgrades as unknown as SimData['upgrades'],
    shop: GameData.shop as unknown as SimData['shop'],
    neighbours: GameData.neighbours as unknown as SimData['neighbours'],
    seasons: GameData.seasons.seasons as unknown as SimData['seasons'],
    gifts: GameData.gifts as unknown as SimData['gifts'],
  };
}
