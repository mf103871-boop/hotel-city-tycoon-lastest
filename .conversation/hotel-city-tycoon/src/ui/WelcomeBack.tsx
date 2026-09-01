/**
 * The "while you were away" screen.
 *
 * Every idle game lives on this moment: the player left, the hotel kept
 * working, and coming back has to feel like collecting something. The engine
 * has computed this since P2.5 and nobody ever showed it.
 *
 * It appears only after a real absence — returning after ninety seconds should
 * not stage a celebration.
 */
import type { OfflineSummary } from '../bridge/notifications.ts';
import { translate } from '../i18n/index.ts';
import { coins, num } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';

function Figure({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex-1 rounded-xl bg-white/[0.04] px-4 py-3 text-center">
      <div className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</div>
      <div className={`mt-1 font-mono text-xl tabular-nums ${accent ? 'text-brass-400' : 'text-slate-100'}`}>
        {value}
      </div>
    </div>
  );
}

export function WelcomeBack({
  summary, locale, onDismiss,
}: {
  summary: OfflineSummary;
  locale: Locale;
  onDismiss: () => void;
}) {
  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const hours = Math.floor(summary.minutesAway / 60);
  const minutes = summary.minutesAway % 60;
  const away = hours > 0 ? `${hours}h ${minutes}m` : `${minutes}m`;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-2xl border border-brass-500/25 bg-midnight-900 p-5 shadow-2xl">
        <h2 className="text-lg font-semibold text-white">{t('ui.welcomeBack')}</h2>
        <p className="mt-0.5 text-xs text-slate-400">{t('ui.whileYouWereAway')} · {away}</p>

        <div className="mt-4 flex gap-2">
          <Figure label={t('ui.coins')} value={`+${coins(locale, summary.coins)}`} accent />
          <Figure label={t('ui.guestsServed')} value={num(locale, summary.guestsServed)} />
        </div>

        {summary.shiftExpired && (
          <p className="mt-3 rounded-lg border border-amber-500/25 bg-amber-950/50 px-3 py-2 text-xs text-amber-200">
            {t('ui.shiftRanOut')}
          </p>
        )}

        <button
          type="button"
          onClick={onDismiss}
          className="mt-4 w-full rounded-xl bg-brass-500 px-4 py-3 font-semibold text-midnight-950 hover:bg-brass-400"
        >
          {t('ui.collect')}
        </button>
      </section>
    </div>
  );
}
