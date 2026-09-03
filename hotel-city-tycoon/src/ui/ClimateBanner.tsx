/**
 * The climate banner — 5A.
 *
 * An incident that halves what guests pay has to say so on screen, exactly as
 * the seasonal banner argues for seasons. It shows the incident's own art,
 * its name, and how long it has left if nobody calls the repair crew.
 */
import { useGameStore } from '../bridge/index.ts';
import { phoneView } from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';

export function ClimateBanner({ locale }: { locale: Locale }) {
  const state = useGameStore((s) => s.state);
  if (!state) return null;

  const climate = phoneView(state).climate;
  if (!climate) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const minutes = Math.max(1, Math.round(climate.msLeft / 60_000));
  const descKey = climate.eventId === 'heatWave' ? 'notice.heatWave' : 'notice.coldSnap';

  return (
    <div className="pointer-events-none absolute inset-x-3 top-36 z-10 rounded-xl border border-water-hi/30 bg-ink-900/85 px-4 py-2 backdrop-blur">
      <div className="flex items-center gap-2">
        <img src={`${import.meta.env.BASE_URL}assets/effects/${climate.eventId}.png`} alt="" className="h-6 w-6 shrink-0" />
        <span className="text-sm font-semibold text-cream-100">{t(climate.nameKey)}</span>
        <span className="ms-auto font-mono text-[11px] text-slate-400">
          {minutes} {t('ui.minutesShort')}
        </span>
      </div>
      <p className="mt-0.5 text-[11px] leading-snug text-slate-400">{t(descKey)}</p>
    </div>
  );
}
