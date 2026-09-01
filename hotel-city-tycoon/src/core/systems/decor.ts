/**
 * Decor meter — the single most important number in the game.
 *
 * In the original Hotel City, a room's income was gated by how full its decor
 * meter was; an empty room paid almost nothing and a full one paid maximum.
 * We keep that exactly, but make the curve explicit and data-driven instead of
 * hidden in the renderer.
 */
import type { SimData, RoomDef } from '../data-source.ts';
import { decorDef, roomById } from '../data-source.ts';
import type { RoomInstance } from '../state/types.ts';

/** Sum of decor points currently placed in a room. */
export function computeDecorPoints(data: SimData, room: RoomInstance): number {
  let sum = 0;
  for (const placed of room.decor) sum += decorDef(data, placed.defId).decorPoints;
  return sum;
}

/** 0..1 — how full the meter is. Red at 0, green at 1. */
export function decorFill(def: RoomDef, room: RoomInstance): number {
  if (def.decorTarget <= 0) return 1;
  return Math.min(1, room.decorPoints / def.decorTarget);
}

/**
 * Income multiplier from decor.
 * At empty fill the room is penalised; at full fill it earns the bonus.
 */
export function decorMultiplier(data: SimData, def: RoomDef, room: RoomInstance): number {
  const { fillCurve, maxIncomeBonusAtFull, emptyIncomePenalty } = data.economy.decorMeter;
  const raw = decorFill(def, room);
  const t = fillCurve === 'easeOut' ? 1 - (1 - raw) * (1 - raw) : raw;
  return 1 + emptyIncomePenalty + (maxIncomeBonusAtFull - emptyIncomePenalty) * t;
}

/** Average fill across every room that has a meter. Feeds the star rating. */
export function averageDecorFill(data: SimData, rooms: RoomInstance[]): number {
  let total = 0;
  let counted = 0;
  for (const room of rooms) {
    const def = roomById(data, room.defId);
    if (!def || def.decorTarget <= 0) continue;
    total += decorFill(def, room);
    counted++;
  }
  return counted === 0 ? 0 : total / counted;
}
