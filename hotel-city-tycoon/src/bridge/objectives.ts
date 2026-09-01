/**
 * Objectives.
 *
 * A self-advancing checklist, not a tutorial. The original Hotel City walled
 * new players behind a scripted sequence that could not be skipped; this is
 * the alternative — nothing is gated, the game stays fully open, and a small
 * card just says what is worth trying next.
 *
 * Every condition is a pure predicate over game state, which means the whole
 * progression can be proved to terminate without opening a browser.
 */
import type { GameState } from '../core/state/types.ts';
import type { ObjectiveDef } from '../core/data-source.ts';
import { simData } from './selectors.ts';
import { objectiveProgress as evaluate } from '../core/systems/objectives.ts';

export interface ObjectiveView {
  id: string;
  titleKey: string;
  hintKey: string;
  rewardCoins: number;
  rewardGems: number;
  /** 0..1, so the card can show a bar rather than a bare yes/no. */
  progress: number;
  done: boolean;
  claimed: boolean;
  /** tutorial, milestone or goal. None of them gate play. */
  group: ObjectiveDef['group'];
}

export function objectiveViews(state: GameState): ObjectiveView[] {
  const claimed = new Set(state.completedObjectives);
  return simData().objectives.map((def: ObjectiveDef) => {
    const progress = evaluate(simData(), state, def.check);
    return {
      id: def.id,
      titleKey: def.titleKey,
      hintKey: def.hintKey,
      rewardCoins: def.rewardCoins,
      rewardGems: def.rewardGems,
      progress,
      done: progress >= 1,
      claimed: claimed.has(def.id),
      group: def.group,
    };
  });
}

/**
 * The one objective to show.
 *
 * Tutorial steps first while any remain, then milestones, then goals — a new
 * player should be pointed at "open your hotel", not at "reach level 30".
 * Within a group, author order. Still one next step rather than a list,
 * because a list of twenty-three things is not guidance.
 */
const GROUP_ORDER: Record<ObjectiveDef['group'], number> = {
  tutorial: 0, milestone: 1, goal: 2,
};

export function currentObjective(state: GameState): ObjectiveView | null {
  const open = objectiveViews(state).filter((o) => !o.claimed);
  if (open.length === 0) return null;
  let best = open[0]!;
  for (const o of open) {
    if (GROUP_ORDER[o.group] < GROUP_ORDER[best.group]) best = o;
  }
  return best;
}

/** Everything still open in one group. */
export function objectivesInGroup(
  state: GameState,
  group: ObjectiveDef['group'],
): ObjectiveView[] {
  return objectiveViews(state).filter((o) => o.group === group);
}

/** Objectives that are finished and waiting to be collected. */
export function claimableObjectives(state: GameState): ObjectiveView[] {
  return objectiveViews(state).filter((o) => o.done && !o.claimed);
}

export function allObjectivesDone(state: GameState): boolean {
  return objectiveViews(state).every((o) => o.claimed);
}

/** Completed and claimed, out of the total. For a progress line. */
export function objectiveProgress(state: GameState): { claimed: number; total: number } {
  const views = objectiveViews(state);
  return { claimed: views.filter((o) => o.claimed).length, total: views.length };
}
