/**
 * The objective card.
 *
 * One step at a time, with a progress bar rather than a checkbox. It sits
 * above the bottom bar and never blocks anything: a player who ignores it
 * entirely still plays the whole game.
 */
import { useGameStore } from '../bridge/index.ts';
import { currentObjective } from '../bridge/objectives.ts';
import { translate } from '../i18n/index.ts';
import { coins } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';
import { playSound } from '../audio/index.ts';

export function ObjectiveCard({ locale }: { locale: Locale }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const objective = currentObjective(state);
  if (!objective) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const pct = Math.round(objective.progress * 100);

  return (
    <div className="pointer-events-auto mb-2 rounded-xl border border-white/10 bg-midnight-900/92 px-4 py-2.5 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="text-[11px] uppercase tracking-[0.12em] text-brass-500">{t('ui.objective')}</span>
        <span className="min-w-0 flex-1 truncate text-sm text-sand-100">{t(objective.titleKey)}</span>
        {objective.done ? (
          <button
            type="button"
            onClick={() => {
              if (dispatch({ type: 'CLAIM_OBJECTIVE', objectiveId: objective.id }).ok) {
                playSound('star');
              }
            }}
            className="shrink-0 rounded-lg bg-brass-500 px-4 py-2 text-xs font-semibold text-midnight-950"
          >
            {t('ui.claim')}
            {objective.rewardCoins > 0 && ` · ${coins(locale, objective.rewardCoins)}`}
          </button>
        ) : (
          <span className="shrink-0 font-mono text-xs tabular-nums text-sand-400">{pct}%</span>
        )}
      </div>

      {!objective.done && (
        <>
          <p className="mt-0.5 text-[11px] leading-snug text-sand-400">{t(objective.hintKey)}</p>
          <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
            <div className="h-full bg-brass-500/70 transition-[width] duration-500" style={{ width: `${pct}%` }} />
          </div>
        </>
      )}
    </div>
  );
}
