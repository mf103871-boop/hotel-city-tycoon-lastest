/**
 * Which simulation events the canvas celebrates, and how (HC-P2-S4).
 *
 * The sibling of `reactions.ts` (which clip a person plays) and
 * `notifications.ts` (which toast the HUD raises): the simulation emits
 * events, and this decides what the effects channel should draw over the
 * hotel. A cue is presentation and nothing else — it is never written into
 * the state, never reaches the save, and a cue missed because the frame was
 * dropped is simply not played.
 *
 * PURE. No Pixi, no DOM, no layout maths, no clock: a cue names a room or a
 * person and an amount, and the scene resolves that to world pixels, because
 * the bridge has no idea where anything is on screen.
 *
 * Two suppressions are load-bearing and easy to delete by accident.
 *
 * A batch carrying `offlineResolved` plays nothing at all. `engine.ts`
 * delivers the whole offline batch to every listener in one emit, and
 * `sim/offline.ts` settles finished guests through the same `checkOut` that
 * pushes `guestCheckedOut` — so without the guard, coming back from a night
 * away showers the map with coin bursts and floating numbers for money that
 * was banked hours ago and has already been reported by the away summary
 * (`notifications.ts` renders it from the same event). `graceEnded` is the
 * same story with the same answer.
 *
 * And a batch produces at most `MAX_CUES_PER_BATCH` cues. The offline
 * threshold is 60 s, so a tab hidden for 59 s comes back through one
 * `advance()` with up to ~590 ticks of events in a single batch and no
 * `offlineResolved` to catch it. Same-room checkouts merge first, with their
 * coins summed; the ceiling is the backstop, and it keeps the newest cues —
 * a payout that just happened is the one worth showing.
 */
import type { GameState, SimEvent } from '../core/state/types.ts';
import { SEED_MIX_A, SEED_MIX_B } from '../render/fx/particles.ts';

/** What the canvas should play. Integer keys; the scene switches on them. */
export const CUE = {
  payout: 0, clear: 1, refuse: 2, praise: 3, greet: 4, puzzled: 5, triumph: 6,
} as const;

export interface EffectCue {
  /** One of `CUE.*`. */
  kind: number;
  /** '' when the cue is not anchored to a room. */
  roomId: string;
  /** '' when the cue is not anchored to a person. */
  charId: string;
  /** Coins for a floating number, 0 for none. */
  amount: number;
  seed: number;
}

export const MAX_CUES_PER_BATCH = 12;

/**
 * How many consecutive snapshots a room must read dirty before the canvas
 * will celebrate it coming clean again.
 *
 * `data/economy.json` gives cleaning at 0.004/s against a 0.12 dirt step per
 * checkout and a 0.35 income gate, so a room that crosses the gate upward
 * takes about 150 s to come back — it cannot flap at the 10 Hz snapshot rate.
 * What this re-arm is really for is the other case: `systems/events.ts`
 * raises a pest-cleared room's cleanliness to exactly the gate, and
 * `selectors.ts` tests `cleanliness < gate`, so the room flips off `.dirty`
 * in the same tick as the `hazardCleared` that already earned a spark burst.
 */
export const DIRTY_REARM_SNAPSHOTS = 3;

/** The room's new consecutive-dirty count, given this snapshot. */
export function nextDirtyCount(prev: number, dirtyNow: boolean): number {
  return dirtyNow ? prev + 1 : 0;
}

/**
 * Whether a room that just read clean has earned the "clean again" ring.
 *
 * `dirtySnapshots` is the count *before* this snapshot. A room carrying a
 * `CUE.clear` in the same batch gets nothing, because the clear already told
 * the same story louder.
 */
export function ringFires(dirtySnapshots: number, dirtyNow: boolean, clearCued: boolean): boolean {
  if (dirtyNow || clearCued) return false;
  return dirtySnapshots >= DIRTY_REARM_SNAPSHOTS;
}

/**
 * Deterministic per `(tick, the cue's position in the batch)`.
 *
 * No string hashing and no `Math.random`, so the same batch replays the same
 * bursts — which is what makes an evidence capture reproducible.
 */
function seedAt(tick: number, index: number): number {
  return (Math.imul(tick, SEED_MIX_A) + Math.imul(index, SEED_MIX_B)) >>> 0;
}

function push(out: EffectCue[], tick: number, kind: number, roomId: string, charId: string, amount: number): void {
  out.push({ kind, roomId, charId, amount, seed: seedAt(tick, out.length) });
}

/** The effects this batch of events asks the canvas to play, in event order. */
export function effectsFor(state: GameState, events: readonly SimEvent[]): EffectCue[] {
  for (const event of events) {
    if (event.type === 'offlineResolved' || event.type === 'graceEnded') return [];
  }
  const tick = state.tick;
  const out: EffectCue[] = [];
  // Sixty simultaneous checkouts are sixty coins' worth of feedback on the
  // rooms that earned it, not sixty bursts: same-room payouts merge, summed.
  const payoutOf = new Map<string, number>();
  for (const event of events) {
    switch (event.type) {
      case 'guestCheckedOut': {
        const at = payoutOf.get(event.roomId);
        if (at !== undefined) {
          const cue = out[at]!;
          cue.amount += event.coins;
          break;
        }
        payoutOf.set(event.roomId, out.length);
        push(out, tick, CUE.payout, event.roomId, event.guestId, event.coins);
        break;
      }
      case 'guestPoked':
        push(out, tick, CUE.payout, '', event.guestId, event.coins);
        break;
      case 'inspectorFound':
        push(out, tick, CUE.payout, '', event.guestId, event.coins);
        push(out, tick, CUE.praise, '', event.guestId, 0);
        break;
      case 'starBonusPaid':
        push(out, tick, CUE.payout, '', '', event.coins);
        break;
      case 'hazardCleared':
        // `coins` here is the clear reward the player is paid.
        push(out, tick, CUE.clear, event.roomId, '', event.coins);
        break;
      case 'serviceCalled':
        // `coins` here is the price the player paid. Nothing floats up for
        // money going the other way.
        push(out, tick, CUE.clear, '', '', 0);
        break;
      case 'guestLeftAngry':
        push(out, tick, CUE.refuse, '', event.guestId, 0);
        break;
      case 'guestCheckedIn':
        push(out, tick, CUE.greet, event.roomId, event.guestId, 0);
        break;
      case 'nothingFound':
        push(out, tick, CUE.puzzled, '', event.guestId, 0);
        break;
      case 'desireUnmet':
        push(out, tick, CUE.puzzled, '', event.guestId, 0);
        break;
      case 'levelUp':
        push(out, tick, CUE.triumph, '', '', event.rewardCoins);
        break;
      case 'starsChanged':
        if (event.to > event.from) push(out, tick, CUE.triumph, '', '', 0);
        break;
      default:
        break;
    }
  }
  if (out.length > MAX_CUES_PER_BATCH) out.splice(0, out.length - MAX_CUES_PER_BATCH);
  return out;
}
