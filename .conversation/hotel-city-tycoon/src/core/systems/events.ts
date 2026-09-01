/**
 * Hazards: pests and fires.
 *
 * Both block income until the player deals with them. Fire rewards decay after
 * the first clear so that letting rooms burn never becomes an income strategy —
 * the original game shipped that bug and players farmed it.
 */
import type { SimData } from '../data-source.ts';
import { isFunctionalRoom, roomById } from '../data-source.ts';
import type { GameState, RoomInstance, SimEvent } from '../state/types.ts';
import { effectActive } from './cleanliness.ts';
import { grantXp } from './progression.ts';
import { earn } from './economy.ts';
import type { Rng } from '../rng/index.ts';

export function fireChanceMultiplier(data: SimData, state: GameState): number {
  let mult = 1;
  const stacks: Record<string, number> = {};
  for (const room of state.hotel.rooms) {
    const def = roomById(data, room.defId);
    if (!def || !isFunctionalRoom(def) || def.function.kind !== 'hazardReduction') continue;
    if (!effectActive(data, state, room)) continue;
    const max = Number(def.function.stacksMax ?? 1);
    stacks[def.id] = (stacks[def.id] ?? 0) + 1;
    if ((stacks[def.id] ?? 0) > max) continue;
    mult *= Number(def.function.fireChanceMultiplier ?? 1);
  }
  return mult;
}

/** Rooms that fell below the pest threshold become infested. */
export function checkPests(
  data: SimData,
  state: GameState,
  out: SimEvent[],
  multiplier = 1,
): void {
  const pestDef = data.events.find((e) => e.id === 'pest');
  if (pestDef && state.tick < (state.eventCooldowns['pest'] ?? 0)) return;

  // A closed hotel is likelier to become infested; the threshold rises with it.
  const threshold = data.economy.cleanliness.pestThreshold * multiplier;
  let appeared = false;
  for (const room of state.hotel.rooms) {
    if (room.hasPest) continue;
    const def = roomById(data, room.defId);
    if (!def || def.category === 'functional') continue;
    // A hotel that slips below the threshold used to have every room infested
    // in the same tick, which is not an incident, it is a wipe.
    if (activeIncidents(state) >= maxSimultaneousIncidents(data)) break;
    if (room.cleanliness <= threshold) {
      room.hasPest = true;
      appeared = true;
      out.push({ type: 'pestAppeared', roomId: room.id });
    }
  }
  // The cooldown the data has declared since P1, finally applied. Without it
  // an infestation could recur the instant it was cleared.
  if (appeared && pestDef) {
    state.eventCooldowns['pest'] = state.tick + pestDef.cooldownSec * data.economy.simulation.ticksPerSecond;
  }
}

/**
 * How many room hazards may run at once.
 *
 * Derived from the data rather than invented: one per declared ROOM hazard
 * event, plus one, so a hotel can be unlucky without being unplayable.
 * (4C: the filter used to test for trigger kinds named 'cleanliness' and
 * 'random', which no event has ever used — the real kinds are
 * 'cleanlinessBelow' and 'randomPerHour' — so the cap silently sat at one
 * incident for the whole game. Hotel-scope weather does not count: it is
 * one hotel-wide state, not a room on fire.)
 */
export function maxSimultaneousIncidents(data: SimData): number {
  const hazards = data.events.filter((e) =>
    e.scope === 'room'
    && (e.trigger.kind === 'cleanlinessBelow' || e.trigger.kind === 'randomPerHour'));
  return Math.max(1, hazards.length + 1);
}

/** Rooms currently on fire, infested or haunted. */
export function activeIncidents(state: GameState): number {
  let n = 0;
  for (const room of state.hotel.rooms) if (room.hasFire || room.hasPest || room.hasGhost) n++;
  return n;
}

/**
 * 4C: the ghost. Same roll as the fire, its own event row, and one haunting
 * at a time — but no tap clears it: only the ghostbuster call does.
 */
export function checkGhosts(
  data: SimData,
  state: GameState,
  seconds: number,
  rng: Rng,
  out: SimEvent[],
): void {
  const def = data.events.find((e) => e.id === 'ghost');
  if (!def || def.unlockLevel > state.player.level) return;
  if (state.tick < (state.eventCooldowns['ghost'] ?? 0)) return;
  if (state.hotel.rooms.some((r) => r.hasGhost)) return; // one ghost, as the original
  if (activeIncidents(state) >= maxSimultaneousIncidents(data)) return;

  const perHour = Number(def.trigger.chance ?? 0);
  const p = 1 - Math.pow(1 - Math.min(0.99, perHour), seconds / 3600);
  for (const room of state.hotel.rooms) {
    if (room.hasGhost || room.hasFire || room.hasPest) continue;
    const rd = roomById(data, room.defId);
    if (!rd || rd.category === 'functional') continue;
    if (rng.chance('events', p / Math.max(1, state.hotel.rooms.length))) {
      room.hasGhost = true;
      state.eventCooldowns['ghost'] = state.tick + def.cooldownSec * data.economy.simulation.ticksPerSecond;
      out.push({ type: 'ghostAppeared', roomId: room.id });
      break;
    }
  }
}

/** 4C: income multiplier while the hotel is too hot or too cold. */
export function climateMultiplier(data: SimData, state: GameState): number {
  if (!state.climate || state.tick >= state.climate.untilTick) return 1;
  const def = data.events.find((e) => e.id === state.climate!.eventId);
  return def?.incomeMultiplier ?? 1;
}

/**
 * 4C: hotel-wide weather. The expiry runs whether or not the hotel is open —
 * weather passes on its own clock — while a NEW wave only rolls while guests
 * are actually in the building to suffer it.
 */
export function checkClimate(
  data: SimData,
  state: GameState,
  seconds: number,
  rng: Rng,
  out: SimEvent[],
  open: boolean,
): void {
  if (state.climate && state.tick >= state.climate.untilTick) {
    out.push({ type: 'climateEnded', eventId: state.climate.eventId, repaired: false });
    state.climate = null;
  }
  if (state.climate || !open) return;

  for (const def of data.events) {
    if (def.scope !== 'hotel' || def.trigger.kind !== 'randomPerHour') continue;
    if (def.unlockLevel > state.player.level) continue;
    if (state.tick < (state.eventCooldowns[def.id] ?? 0)) continue;
    const perHour = Number(def.trigger.chance ?? 0);
    const p = 1 - Math.pow(1 - Math.min(0.99, perHour), seconds / 3600);
    if (rng.chance('events', p)) {
      const ticks = Math.round(Number(def.durationSec ?? 0) * data.economy.simulation.ticksPerSecond);
      state.climate = { eventId: def.id, untilTick: state.tick + ticks };
      state.eventCooldowns[def.id] = state.tick + def.cooldownSec * data.economy.simulation.ticksPerSecond;
      out.push({ type: 'climateStarted', eventId: def.id });
      break;
    }
  }
}

/**
 * Does this event stop the room earning?
 *
 * Read from the event definition. `blocksIncome` has been in the data since P1
 * and the answer was hardcoded in two places that did not agree with it.
 */
export function blocksIncome(data: SimData, eventId: string): boolean {
  const def = data.events.find((e) => e.id === eventId);
  return def?.blocksIncome ?? true;
}

/** Roll for fires across `seconds` of elapsed time. */
export function checkFires(
  data: SimData,
  state: GameState,
  seconds: number,
  rng: Rng,
  out: SimEvent[],
): void {
  const def = data.events.find((e) => e.id === 'fire');
  if (!def || def.unlockLevel > state.player.level) return;
  const cooldownUntil = state.eventCooldowns['fire'] ?? 0;
  if (state.tick < cooldownUntil) return;

  const perHour = Number(def.trigger.chance ?? 0) * fireChanceMultiplier(data, state);
  const p = 1 - Math.pow(1 - Math.min(0.99, perHour), seconds / 3600);

  if (activeIncidents(state) >= maxSimultaneousIncidents(data)) return;

  for (const room of state.hotel.rooms) {
    if (room.hasFire) continue;
    const rd = roomById(data, room.defId);
    if (!rd || rd.category === 'functional') continue;
    if (rng.chance('events', p / Math.max(1, state.hotel.rooms.length))) {
      room.hasFire = true;
      state.eventCooldowns['fire'] = state.tick + def.cooldownSec * data.economy.simulation.ticksPerSecond;
      out.push({ type: 'fireStarted', roomId: room.id });
      break; // at most one fire per evaluation, so a big hotel is not punished
    }
  }
}

/** Coins awarded for clearing a hazard, with the decay applied. */
export function clearReward(data: SimData, state: GameState, eventId: string): number {
  const def = data.events.find((e) => e.id === eventId);
  const r = def?.clearRewardCoins;
  if (!r) return 0;
  const cleared = state.eventClearCounts[eventId] ?? 0;
  return cleared < r.decayAfter ? r.first : r.repeat;
}

export function clearHazard(
  data: SimData,
  state: GameState,
  room: RoomInstance,
  hazard: 'pest' | 'fire',
  out: SimEvent[],
): void {
  if (hazard === 'pest') {
    room.hasPest = false;
    room.cleanliness = Math.max(room.cleanliness, data.economy.cleanliness.incomeGateThreshold);
    state.stats.pestsCleared++;
  } else {
    room.hasFire = false;
    state.stats.firesCleared++;
  }
  const coins = clearReward(data, state, hazard);
  if (coins > 0) earn(state, coins, 'eventReward');
  // `clearRewardXp` has been in the data since P1. Fire clears promised 30 XP
  // and paid none, because nothing read the field.
  const def = data.events.find((e) => e.id === hazard);
  const xp = def?.clearRewardXp ?? 0;
  if (xp > 0) grantXp(data, state, xp, out);

  state.eventClearCounts[hazard] = (state.eventClearCounts[hazard] ?? 0) + 1;
  out.push({ type: 'hazardCleared', roomId: room.id, hazard, coins });
}
