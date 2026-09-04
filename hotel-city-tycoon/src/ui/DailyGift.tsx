/**
 * The daily gift — decision 15a.
 *
 * The daily claim IS the home money bag: the star-tier value from the
 * original's money-bag table. Once a week the catalogue's free item rides
 * along, exactly the beat of the original's weekly free gifts. No streak,
 * no pressure: miss a day and tomorrow is simply another bag.
 */
import { useGameStore } from '../bridge/index.ts';
import { dailyGift } from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import { coins } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';
import { playSound } from '../audio/index.ts';

export function DailyGift({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const gift = dailyGift(state, state.epochMs);
  if (!gift.available) return null;

  return (
    <div className="absolute inset-0 z-40 flex items-center justify-center bg-black/70 px-6 backdrop-blur-sm">
      <section className="w-full max-w-sm rounded-2xl border border-brass-500/25 bg-ink-900 p-5">
        <h2 className="text-lg font-semibold text-cream-100">{t('ui.dailyGift')}</h2>
        <p className="mt-0.5 text-[11px] text-sand-400">{t('ui.moneyBag')}</p>

        <div className="mt-4 rounded-xl bg-white/[0.04] px-4 py-3 text-center">
          <div className="font-mono text-2xl tabular-nums text-brass-400">
            +{coins(locale, gift.bagCoins)}
          </div>
        </div>

        {gift.itemIsNew && (
          <div className="mt-3 rounded-xl border border-water-hi/20 bg-water-hi/5 px-4 py-3 text-center">
            <div className="text-[11px] uppercase tracking-wide text-water-hi">{t('ui.freeItemWeekly')}</div>
            <div className="mt-1 font-semibold text-cream-100">{t(`decor.${gift.itemDefId}.name`)}</div>
          </div>
        )}

        <button
          type="button"
          onClick={() => {
            if (dispatch({ type: 'CLAIM_GIFT', epochMs: state.epochMs }).ok) playSound('chime');
            onClose();
          }}
          className="mt-4 min-h-11 w-full rounded-xl bg-coral-500 px-4 py-3 font-semibold text-ink-950"
        >
          {t('ui.collect')}
        </button>
      </section>
    </div>
  );
}
