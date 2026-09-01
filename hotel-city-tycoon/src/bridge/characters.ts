/**
 * Where every person in the hotel is, right now.
 *
 * Positions are **derived**, never stored. The simulation knows a guest is
 * arriving, queued, staying or leaving, and how many ticks ago that started;
 * everything else follows from arithmetic. That keeps the save file small, the
 * simulation deterministic, and this whole layer testable without a browser.
 *
 * Coordinates are in blocks, matching the grid the rooms sit on, so the
 * renderer applies exactly the same transform it already applies to rooms.
 */
import type { GameState, GuestInstance } from '../core/state/types.ts';
import { simData, roomDefOf, gridSize } from './selectors.ts';
import type { SimData } from '../core/data-source.ts';
import { isOpen } from '../core/systems/economy.ts';

/** The drag cooldown, read the same way the command reads it. */
function onDragCooldown(data: SimData, state: GameState): boolean {
  const ticks = Math.round(data.economy.guests.dragToLobbyCooldownSec * data.economy.simulation.ticksPerSecond);
  return state.lastDragTick >= 0 && state.tick - state.lastDragTick < ticks;
}

export type Activity = 'walking' | 'waiting' | 'resting' | 'working' | 'leaving';

export interface CharacterView {
  id: string;
  kind: 'guest' | 'staff';
  /** Asset key for the sprite, e.g. guest.vip.idle */
  assetKey: string;
  /** Block coordinates, fractional — characters move between cells. */
  x: number;
  y: number;
  facing: 'left' | 'right';
  activity: Activity;
  /** Amenity the guest wants, shown as an icon above their head. */
  desire: string | null;
  /** True while the player can pull them back to reception. */
  draggable: boolean;
  /** 0..1, fades a leaving guest out as they walk off. */
  opacity: number;
}

/** The street runs along the bottom of the plot, below the ground floor. */
const STREET_Y = -0.9;

/** How far past the plot edge guests enter and exit. */
const OFFSCREEN = 2.5;

function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * Math.min(1, Math.max(0, t));
}

/**
 * How many can wait at reception.
 *
 * Read from the lobby the hotel actually has, mirroring the core's rule. It is
 * duplicated rather than imported because importing the core system created a
 * cycle — characters to guests to selectors to characters — which resolved to
 * undefined at module load and took three tests down with a message about a
 * function that plainly existed. A cycle fails as `undefined`, not as an error.
 */
function lobbyCapacity(state: GameState): number {
  let capacity = 0;
  for (const room of state.hotel.rooms) {
    const def = roomDefOf(room.defId);
    if (def?.category !== 'functional' || def.function.kind !== 'entrance') continue;
    capacity += Number(def.function.queueCapacity ?? 0);
  }
  return capacity > 0 ? capacity : simData().economy.guests.maxLobbyQueue;
}

function lobbyPosition(state: GameState): { x: number; y: number } {
  const lobby = state.hotel.rooms.find((r) => r.defId === 'lobby');
  if (!lobby) return { x: 0, y: 0 };
  const def = roomDefOf(lobby.defId);
  return { x: lobby.x + (def?.blocks.w ?? 2) / 2, y: lobby.y };
}

/**
 * A guest's position.
 *
 * Arriving guests walk in from the right across their patience window; leaving
 * guests walk out to the left. Both are a straight interpolation on tick count,
 * which means the same tick always produces the same frame.
 */
export function guestPosition(state: GameState, guest: GuestInstance): {
  x: number; y: number; facing: 'left' | 'right'; activity: Activity; opacity: number;
} {
  const data = simData();
  const tps = data.economy.simulation.ticksPerSecond;
  const grid = gridSize(state);
  const lobby = lobbyPosition(state);
  const elapsed = (state.tick - guest.stateSinceTick) / tps;

  switch (guest.state) {
    case 'arriving': {
      const type = data.guestTypes.find((t) => t.id === guest.typeId);
      const walkSec = Math.max(1, (type?.patienceSec ?? 60) * 0.25);
      return {
        x: lerp(grid.w + OFFSCREEN, lobby.x, elapsed / walkSec),
        y: STREET_Y,
        facing: 'left',
        activity: 'walking',
        opacity: 1,
      };
    }

    case 'queued': {
      const place = state.lobbyQueue.indexOf(guest.id);
      const offset = place < 0 ? 0 : place * 0.42;
      return {
        x: lobby.x + 0.6 + offset,
        y: STREET_Y,
        facing: 'left',
        activity: 'waiting',
        opacity: 1,
      };
    }

    // Standing at the desk while reception deals with them. Deliberately the
    // same activity as queuing: no new art, no renderer change, and the walk
    // cycle stays off — they are stationary either way.
    case 'checkingIn': {
      return {
        x: lobby.x + 0.3,
        y: STREET_Y,
        facing: 'left',
        activity: 'waiting',
        opacity: 1,
      };
    }

    case 'staying':
    case 'usingAmenity': {
      const room = state.hotel.rooms.find((r) => r.id === guest.roomId);
      if (!room) return { x: lobby.x, y: STREET_Y, facing: 'left', activity: 'walking', opacity: 1 };
      const def = roomDefOf(room.defId);
      const width = def?.blocks.w ?? 1;
      const place = Math.max(0, room.occupants.indexOf(guest.id));
      const spread = width / (Math.max(1, room.occupants.length) + 1);
      return {
        x: room.x + spread * (place + 1),
        y: room.y,
        facing: place % 2 === 0 ? 'right' : 'left',
        activity: 'resting',
        opacity: 1,
      };
    }

    case 'leaving': {
      const linger = data.economy.guests.walkAwaySec;
      const t = elapsed / linger;
      return {
        x: lerp(lobby.x, -OFFSCREEN, t),
        y: STREET_Y,
        facing: 'left',
        activity: 'leaving',
        // Fading out signals that the chance to grab them is running out.
        opacity: Math.max(0, 1 - t * 0.8),
      };
    }
  }
}

/** Staff stand in the room they are assigned to. */
export function staffPosition(state: GameState, roomId: string | null): { x: number; y: number } | null {
  if (!roomId) return null;
  const room = state.hotel.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const def = roomDefOf(room.defId);
  return { x: room.x + (def?.blocks.w ?? 1) - 0.35, y: room.y };
}

/**
 * Everyone who should be on screen, guests and staff together.
 *
 * Returned in draw order: people further back first, so a guest in a room
 * never occludes the receptionist standing in front of them.
 */
export function characterViews(state: GameState): CharacterView[] {
  const data = simData();
  const views: CharacterView[] = [];

  for (const staff of state.staff) {
    const pos = staffPosition(state, staff.roomId);
    if (!pos) continue;
    views.push({
      id: staff.id,
      kind: 'staff',
      assetKey: `staff.${staff.roleId}.idle`,
      x: pos.x,
      y: pos.y,
      facing: 'left',
      activity: 'working',
      desire: null,
      draggable: false,
      opacity: 1,
    });
  }

  const dragEnabled = data.economy.guests.dragToLobbyEnabled;
  for (const guest of state.guests) {
    const pos = guestPosition(state, guest);
    views.push({
      id: guest.id,
      kind: 'guest',
      assetKey: `guest.${guest.typeId}.idle`,
      x: pos.x,
      y: pos.y,
      facing: pos.facing,
      activity: pos.activity,
      // A desire only matters while they can still act on it.
      desire: pos.activity === 'resting' ? null : guest.desire,
      // Every clause here mirrors one in the DRAG_GUEST command. A grab handle
      // the simulation will refuse is worse than no handle at all, and a
      // selftest holds the two in step.
      draggable: dragEnabled
        && isOpen(state)
        && !onDragCooldown(data, state)
        && !guest.everCheckedIn
        && (guest.state === 'leaving' || guest.state === 'arriving')
        && !state.lobbyQueue.includes(guest.id)
        && state.lobbyQueue.length < lobbyCapacity(state),
      opacity: pos.opacity,
    });
  }

  return views.sort((a, b) => b.y - a.y || a.x - b.x);
}

/**
 * The nearest guest the player can act on.
 *
 * Two actions share this: pulling a departing guest back to reception, and
 * checking on a resting one in case they are the hotel inspector.
 */
export function guestNear(
  state: GameState,
  x: number,
  y: number,
  radius = 1.0,
): CharacterView | null {
  let best: CharacterView | null = null;
  let bestDistance = radius;
  for (const view of characterViews(state)) {
    if (view.kind !== 'guest') continue;
    if (!view.draggable && view.activity !== 'resting') continue;
    const distance = Math.hypot(view.x - x, view.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = view;
    }
  }
  return best;
}

/** Amenity a guest wants that the hotel does not have. Drives the build hint. */
export function unmetDesires(state: GameState): Record<string, number> {
  const built = new Set<string>();
  for (const room of state.hotel.rooms) {
    const def = roomDefOf(room.defId);
    if (def?.category === 'commercial') built.add(def.desireTag);
  }
  const counts: Record<string, number> = {};
  for (const guest of state.guests) {
    if (!guest.desire || built.has(guest.desire)) continue;
    counts[guest.desire] = (counts[guest.desire] ?? 0) + 1;
  }
  return counts;
}
