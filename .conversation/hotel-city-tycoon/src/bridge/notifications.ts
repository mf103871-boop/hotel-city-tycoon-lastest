/**
 * Turning simulation events into things a player notices.
 *
 * The engine already emits everything that happens. Until now nothing read it:
 * a level-up, a fire, a five-star rating and a guest paying were all equally
 * silent. A simulation nobody can hear is not a game.
 *
 * This layer is pure — events in, notifications out — so the rules about what
 * is worth interrupting someone for are testable without a browser.
 */
import type { SimEvent } from '../core/state/types.ts';
import type { RejectReason } from '../core/commands/index.ts';
import { rejectionKey, worthShowing } from './rejections.ts';

export type NoticeKind =
  | 'levelUp' | 'starsUp' | 'starsDown' | 'hazard' | 'hazardCleared'
  | 'guestLost' | 'shiftEnded' | 'income' | 'offline' | 'inspector' | 'rejected';

export type Tone = 'good' | 'bad' | 'neutral';

export interface Notice {
  id: string;
  kind: NoticeKind;
  tone: Tone;
  /** i18n key for the headline. */
  titleKey: string;
  /** Interpolation values for the headline. */
  values: Record<string, string | number>;
  /** Higher shows first and survives trimming. */
  priority: number;
  /** Sound to play, or null for silent notices. */
  sound: string | null;
  /** How many identical events this represents. */
  count: number;
}

/** At most this many on screen; the rest are dropped by priority. */
export const MAX_VISIBLE = 4;

/**
 * Payouts below this are not worth a toast.
 *
 * Without a floor, a busy hotel produces one notification per checkout —
 * dozens a minute — and the important ones drown.
 */
const INCOME_TOAST_FLOOR = 200;

const PRIORITY: Record<NoticeKind, number> = {
  hazard: 100,
  inspector: 95,
  rejected: 50,
  offline: 90,
  levelUp: 80,
  starsUp: 70,
  starsDown: 65,
  shiftEnded: 60,
  hazardCleared: 40,
  guestLost: 30,
  income: 10,
};

const SOUND: Record<NoticeKind, string | null> = {
  hazard: 'alert',
  inspector: 'star',
  rejected: 'error',
  offline: 'chime',
  levelUp: 'levelUp',
  starsUp: 'star',
  starsDown: 'error',
  shiftEnded: 'bell',
  hazardCleared: 'coin',
  guestLost: null,
  income: 'coin',
};

const TONE: Record<NoticeKind, Tone> = {
  hazard: 'bad',
  inspector: 'good',
  rejected: 'bad',
  offline: 'good',
  levelUp: 'good',
  starsUp: 'good',
  starsDown: 'bad',
  shiftEnded: 'neutral',
  hazardCleared: 'good',
  guestLost: 'bad',
  income: 'good',
};

function make(kind: NoticeKind, titleKey: string, values: Record<string, string | number>): Notice {
  return {
    id: `${kind}:${JSON.stringify(values)}`,
    kind,
    tone: TONE[kind],
    titleKey,
    values,
    priority: PRIORITY[kind],
    sound: SOUND[kind],
    count: 1,
  };
}

/**
 * Fold a batch of events into the few notices worth showing.
 *
 * Aggregation matters more than filtering here: ten guests lost in a minute is
 * one message saying ten, not ten messages.
 */
export function noticesFrom(events: readonly SimEvent[]): Notice[] {
  const out: Notice[] = [];
  let coins = 0;
  let lost = 0;
  let shiftEnded = false;

  for (const event of events) {
    switch (event.type) {
      case 'levelUp':
        out.push(make('levelUp', 'notice.levelUp', { level: event.level, coins: event.rewardCoins }));
        break;
      case 'starsChanged':
        out.push(event.to > event.from
          ? make('starsUp', 'notice.starsUp', { stars: event.to })
          : make('starsDown', 'notice.starsDown', { stars: event.to }));
        break;
      case 'fireStarted':
        out.push(make('hazard', 'notice.fire', {}));
        break;
      case 'pestAppeared':
        out.push(make('hazard', 'notice.pest', {}));
        break;
      case 'ghostAppeared':
        out.push(make('hazard', 'notice.ghost', {}));
        break;
      case 'climateStarted':
        out.push(make('hazard', event.eventId === 'heatWave' ? 'notice.heatWave' : 'notice.coldSnap', {}));
        break;
      case 'climateEnded':
        if (!event.repaired) out.push(make('income', 'notice.climateEnded', {}));
        break;
      case 'serviceCalled':
        out.push(make('hazardCleared', 'notice.serviceDone', { coins: event.coins }));
        break;
      case 'hazardCleared':
        if (event.coins > 0) out.push(make('hazardCleared', 'notice.hazardCleared', { coins: event.coins }));
        break;
      case 'guestLeftAngry':
        lost++;
        break;
      case 'shiftEnded':
        shiftEnded = true;
        break;
      case 'guestCheckedOut':
        coins += event.coins;
        break;
      case 'inspectorFound':
        out.push(make('inspector', 'notice.inspectorFound', { coins: event.coins }));
        break;
      case 'guestPoked':
        out.push(make('income', 'notice.guestPoked', { coins: event.coins }));
        break;
      case 'offlineResolved':
        if (event.coins > 0 || event.guestsServed > 0) {
          out.push(make('offline', 'notice.offline', {
            coins: event.coins,
            guests: event.guestsServed,
            minutes: Math.round(event.elapsedMs / 60000),
          }));
        }
        break;
      default:
        break;
    }
  }

  if (shiftEnded) out.push(make('shiftEnded', 'notice.shiftEnded', {}));
  if (lost > 0) {
    const notice = make('guestLost', 'notice.guestLost', { count: lost });
    notice.count = lost;
    out.push(notice);
  }
  if (coins >= INCOME_TOAST_FLOOR) {
    out.push(make('income', 'notice.income', { coins }));
  }

  return dedupe(out);
}

/** Collapse identical notices and keep the most important few. */
export function dedupe(notices: readonly Notice[]): Notice[] {
  const byId = new Map<string, Notice>();
  for (const notice of notices) {
    const existing = byId.get(notice.id);
    if (existing) existing.count += notice.count;
    else byId.set(notice.id, { ...notice });
  }
  return [...byId.values()]
    .sort((a, b) => b.priority - a.priority)
    .slice(0, MAX_VISIBLE);
}

/** Merge new notices into what is already on screen. */
export function mergeNotices(current: readonly Notice[], incoming: readonly Notice[]): Notice[] {
  return dedupe([...current, ...incoming]);
}

// ---------------------------------------------------------------- offline

export interface OfflineSummary {
  minutesAway: number;
  coins: number;
  xp: number;
  guestsServed: number;
  /** True when the shift ran out while they were gone. */
  shiftExpired: boolean;
}

/** Below this, coming back is not an occasion and needs no screen. */
export const OFFLINE_SUMMARY_FLOOR_MS = 3 * 60 * 1000;

/**
 * The "while you were away" summary, or null when nothing worth showing
 * happened. Returning after ninety seconds should not stage a celebration.
 */
export function offlineSummary(events: readonly SimEvent[]): OfflineSummary | null {
  const resolved = events.find((e) => e.type === 'offlineResolved');
  if (!resolved || resolved.type !== 'offlineResolved') return null;
  if (resolved.elapsedMs < OFFLINE_SUMMARY_FLOOR_MS) return null;
  if (resolved.coins <= 0 && resolved.guestsServed <= 0) return null;

  return {
    minutesAway: Math.round(resolved.elapsedMs / 60000),
    coins: resolved.coins,
    xp: 0,
    guestsServed: resolved.guestsServed,
    shiftExpired: events.some((e) => e.type === 'shiftEnded'),
  };
}

/** A refusal, phrased for the player. Returns null for internal-only reasons. */
export function noticeForRejection(reason: RejectReason): Notice | null {
  if (!worthShowing(reason)) return null;
  return make('rejected', rejectionKey(reason), {});
}
