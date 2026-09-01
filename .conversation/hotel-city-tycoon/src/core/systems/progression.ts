/**
 * XP, levels and unlocks.
 */
import type { SimData } from '../data-source.ts';
import type { GameState, SimEvent } from '../state/types.ts';
import { earn } from './economy.ts';

export function levelForXp(data: SimData, xp: number): number {
  let level = 1;
  for (const entry of data.levels) {
    if (entry.xpTotal <= xp) level = entry.level;
    else break;
  }
  return level;
}

export function xpForLevel(data: SimData, level: number): number {
  return data.levels.find((l) => l.level === level)?.xpTotal ?? 0;
}

/** Progress through the current level, 0..1. Drives the HUD bar. */
export function levelProgress(data: SimData, state: GameState): number {
  const cur = xpForLevel(data, state.player.level);
  const next = data.levels.find((l) => l.level === state.player.level + 1);
  if (!next) return 1;
  const span = next.xpTotal - cur;
  return span <= 0 ? 1 : Math.min(1, (state.player.xp - cur) / span);
}

/** Grants XP and applies every level-up it triggers. Mutates state. */
export function grantXp(data: SimData, state: GameState, xp: number, out: SimEvent[]): void {
  if (xp <= 0) return;
  state.player.xp += xp;
  const target = levelForXp(data, state.player.xp);
  while (state.player.level < target) {
    state.player.level++;
    const entry = data.levels.find((l) => l.level === state.player.level);
    const coins = entry?.rewardCoins ?? 0;
    const gems = entry?.rewardGems ?? 0;
    earn(state, coins, 'objectiveReward');
    state.player.gems += gems;
    out.push({ type: 'levelUp', level: state.player.level, rewardCoins: coins, rewardGems: gems });
  }
}

export function isUnlocked(data: SimData, state: GameState, kind: string, id: string): boolean {
  for (const entry of data.levels) {
    if (entry.level > state.player.level) break;
    if (entry.unlocks.some((u) => u.kind === kind && u.id === id)) return true;
  }
  return false;
}
