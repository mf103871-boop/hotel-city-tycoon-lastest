/**
 * The seasonal banner.
 *
 * An event that changes what the hotel earns has to say so, or the player sees
 * numbers move for no reason they can name.
 */
import { useGameStore } from '../bridge/index.ts';
import { seasonBanner } from '../bridge/selectors.ts';
import { Pair } from './Pair.tsx';
import { translate } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';

export function SeasonBanner({ locale }: { locale: Locale }) {
  const state = useGameStore((s) => s.state);
  if (!state) return null;

  const season = seasonBanner(state.epochMs);
  if (!season) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);

  return (
    /* `end-16`, not `inset-x-3`: the Settings gear is `end-3 top-24 z-20` and a
       full-width banner ran straight under it, so the gear covered the
       end-aligned countdown — the one number this banner exists to show. */
    <div className="pointer-events-none absolute start-3 end-16 top-24 z-10 rounded-xl border border-brass-500/30 bg-ink-900/92 px-4 py-2 backdrop-blur">
      <div className="flex items-baseline gap-2">
        <span className="text-sm font-semibold text-brass-400">{t(season.nameKey)}</span>
        <span className="ms-auto font-mono text-[11px] text-sand-400">
          {t('ui.eventEnds', { days: season.daysLeft })}
        </span>
      </div>
      <p className="text-[11px] leading-snug text-sand-400">{t(season.descKey)}</p>
      <p className="mt-0.5 font-mono text-[11px] text-brass-400">
        <Pair>×{season.incomeMultiplier.toFixed(2)} · ×{season.arrivalMultiplier.toFixed(2)}</Pair>
      </p>
    </div>
  );
}
