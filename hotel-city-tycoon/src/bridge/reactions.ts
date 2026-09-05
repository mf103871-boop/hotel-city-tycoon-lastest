/**
 * Which characters react to which simulation events, and how (HC-P2-S1).
 *
 * The simulation emits events; the animation files say which one-shot clip
 * a character plays in answer. This joins the two: a `guestCheckedOut` goes
 * to that guest, a `fireStarted` in a room goes to everyone standing in it,
 * a `guestCheckedIn` goes to the receptionist who did the work.
 *
 * Presentation only. A reaction is played by the renderer and forgotten; it
 * is never written into the state and does not survive a reload — which is
 * the right answer for a cheer that happened three seconds ago.
 */
import type { GameState, SimEvent } from '../core/state/types.ts';
import type { CharacterAnimationDef } from '../core/data-source.ts';
import { simData, roomDefOf } from './selectors.ts';

export interface Reaction {
  id: string;
  clip: string;
}

function animFor(kind: 'staff' | 'guest', typeId: string): CharacterAnimationDef | undefined {
  const id = `${kind}.${typeId}`;
  return simData().animations.find((a) => a.id === id);
}

function push(out: Reaction[], id: string, anim: CharacterAnimationDef | undefined, event: string): void {
  const clip = anim?.reactions[event];
  if (!clip || !anim?.clips[clip]) return;
  out.push({ id, clip });
}

/** The reactions this batch of events provokes, in event order. */
export function reactionsFor(state: GameState, events: readonly SimEvent[]): Reaction[] {
  const out: Reaction[] = [];
  for (const event of events) {
    if ('guestId' in event) {
      const guest = state.guests.find((g) => g.id === event.guestId);
      if (guest) push(out, guest.id, animFor('guest', guest.typeId), event.type);
      // The receptionist shares the moment: a check-in is their work paying off.
      if (event.type === 'guestCheckedIn') {
        for (const staff of state.staff) {
          const room = state.hotel.rooms.find((r) => r.id === staff.roomId);
          if (room && roomDefOf(room.defId)?.id === 'lobby') {
            push(out, staff.id, animFor('staff', staff.roleId), event.type);
          }
        }
      }
      continue;
    }
    if ('roomId' in event) {
      const room = state.hotel.rooms.find((r) => r.id === event.roomId);
      if (!room) continue;
      for (const guestId of room.occupants) {
        const guest = state.guests.find((g) => g.id === guestId);
        if (guest) push(out, guest.id, animFor('guest', guest.typeId), event.type);
      }
      for (const staff of state.staff) {
        if (staff.roomId === room.id) push(out, staff.id, animFor('staff', staff.roleId), event.type);
      }
    }
  }
  return out;
}
