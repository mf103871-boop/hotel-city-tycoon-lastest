/**
 * Stress mode.
 *
 * The architecture document's exit criteria for P3 and P5 are sixty rooms and
 * forty characters at a steady sixty frames. Reaching that by playing takes
 * weeks, which is most of why those criteria sat unmeasured for thirteen
 * phases.
 *
 * This builds that hotel in a second so the measurement can actually be taken.
 *
 * It never touches a real save. The state is constructed in memory, autosave
 * is refused for the session, and the only way in is a url flag.
 */
import type { SimData } from '../core/data-source.ts';
import type { GameState } from '../core/state/types.ts';
import { createInitialState } from '../core/state/init.ts';
import { execute } from '../core/commands/index.ts';
import { advance } from '../core/sim/tick.ts';

export interface StressOptions {
  rooms: number;
  seconds: number;
  epochMs: number;
}

/**
 * A hotel at the scale the document asks about.
 *
 * Built by issuing real commands rather than assembling state by hand, so what
 * gets measured is a hotel the game could actually produce — a hand-built
 * state could quietly violate a rule the renderer depends on.
 */
export function buildStressState(data: SimData, opts: StressOptions): GameState {
  const state = createInitialState(data, { seed: 20260829, epochMs: opts.epochMs, hotelName: 'Stress' });
  state.player.coins = 500_000_000;
  state.player.level = 60;

  for (const plot of [...data.plots].sort((a, b) => a.blocks - b.blocks)) {
    execute(data, state, { type: 'EXPAND_PLOT', plotId: plot.id });
  }

  // A realistic mix, not sixty identical boxes: the renderer's cost depends on
  // room sizes and on how many amenities hold guests.
  const mix = ['economy', 'standard', 'double', 'family', 'deluxe', 'cafe', 'gym', 'restaurant'];
  let built = state.hotel.rooms.length;
  for (let i = 0; built < opts.rooms; i++) {
    const defId = mix[i % mix.length]!;
    const before = state.hotel.rooms.length;
    execute(data, state, { type: 'BUILD_ROOM', defId });
    if (state.hotel.rooms.length === before) {
      // Out of space or unbuildable: fall back to the smallest thing there is.
      if (execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' }).ok) built++;
      else break;
    } else {
      built = state.hotel.rooms.length;
      const room = state.hotel.rooms[state.hotel.rooms.length - 1]!;
      const def = data.rooms.find((r) => r.id === defId);
      if (def && 'staffRole' in def && def.staffRole) {
        execute(data, state, { type: 'HIRE_STAFF', roomId: room.id, roleId: def.staffRole });
      }
    }
  }

  // Decorate everything: a full meter is the expensive case to draw.
  const best = [...data.decor]
    .filter((d) => d.cost.currency === 'coins')
    .sort((a, b) => b.decorPoints - a.decorPoints);
  for (const room of state.hotel.rooms) {
    const def = data.rooms.find((r) => r.id === room.defId);
    if (!def) continue;
    for (let slot = 0; slot < def.decorSlots; slot++) {
      const item = best[slot % best.length];
      if (item) execute(data, state, { type: 'PLACE_DECOR', roomId: room.id, defId: item.id, slot });
    }
  }

  // Run the hotel long enough to fill with people.
  execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_48h' });
  advance(data, state, opts.seconds * data.economy.simulation.ticksPerSecond);
  return state;
}

/** Read the stress request from the url, or null for a normal session. */
export function stressRequest(search: string): { rooms: number; seconds: number } | null {
  try {
    const params = new URLSearchParams(search);
    if (!params.has('stress')) return null;
    const rooms = Number(params.get('stress'));
    return {
      rooms: Number.isFinite(rooms) && rooms > 0 ? Math.min(200, rooms) : 60,
      seconds: Number(params.get('warm') ?? 900),
    };
  } catch {
    return null;
  }
}
