/**
 * Permanent upgrades.
 *
 * The endgame. A hundred and twenty simulated days showed a player capped at
 * level 60 by day 56, then holding fifty-one million coins with nothing left
 * to buy — nothing unlocks after level 44 but a single plot, and the most
 * expensive decor in the game costs 150,000.
 *
 * Each track shows what it does now and what the next tier would make it,
 * because "×1.36 → ×1.52" is a reason to spend and "Renown IV" is not.
 */
import { useGameStore } from '../bridge/index.ts';
import { upgradeOptions, upgradeInvestment } from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import { coins as formatCoins } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';
import { Sheet } from './Sheet.tsx';
import { blockerLabel } from './BuildPanel.tsx';
import { playSound } from '../audio/index.ts';

export function UpgradesPanel({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const options = upgradeOptions(state);
  const invested = upgradeInvestment(state);

  return (
    <Sheet
      title={t('ui.upgrades')}
      subtitle={invested > 0 ? `${t('ui.invested')} ${invested}` : t('ui.upgradesHint')}
      onClose={onClose}
    >
      {options.map((option) => {
        const maxed = option.owned >= option.total;
        const label = maxed ? t('ui.maxed') : blockerLabel(option.blocker, option.unlockLevel, t);
        return (
          <button
            key={option.id}
            type="button"
            disabled={Boolean(label)}
            onClick={() => {
              if (dispatch({ type: 'BUY_UPGRADE', upgradeId: option.id }).ok) playSound('star');
            }}
            className={`mb-2 min-h-11 w-full rounded-xl border px-4 py-3 text-start transition
              ${label
                ? 'cursor-not-allowed border-white/5 bg-white/[0.02]'
                : 'border-white/10 bg-white/[0.04] hover:border-coral-500/70 hover:bg-white/[0.07]'}`}
          >
            <div className="flex items-baseline gap-2">
              {/* Locked rows dim by colour, not by an opacity wrapper that
                  took the unlock requirement down to 1.9:1 with them. */}
              <span className={`text-sm ${label ? 'text-sand-400' : 'text-sand-100'}`}>
                {t(option.nameKey)}
              </span>
              <span className="font-mono text-[11px] text-sand-500">
                {option.owned}/{option.total} {t('ui.owned')}
              </span>
              {label ? (
                <span className="ms-auto text-[11px] font-medium text-amber-300">{label}</span>
              ) : (
                <span className="ms-auto font-mono text-sm tabular-nums text-brass-400">
                  {option.nextCost === null ? '—' : formatCoins(locale, option.nextCost)}
                </span>
              )}
            </div>
            <p className="mt-0.5 text-[11px] leading-snug text-sand-400">{t(option.descKey)}</p>
            <div className="mt-1.5 flex items-center gap-2">
              <div className="h-1 flex-1 overflow-hidden rounded-full bg-white/10">
                <div
                  className="h-full bg-brass-500/70"
                  style={{ width: `${(option.owned / option.total) * 100}%` }}
                />
              </div>
              {option.next !== null && (
                <span className="font-mono text-[11px] text-sand-500">
                  ×{option.current.toFixed(2)} → ×{option.next.toFixed(2)}
                </span>
              )}
            </div>
          </button>
        );
      })}
    </Sheet>
  );
}
