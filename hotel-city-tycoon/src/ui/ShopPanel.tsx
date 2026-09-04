/**
 * The rotating shop.
 *
 * The original refreshed its catalogue weekly, and that refresh was the reason
 * players came back on a schedule rather than when they happened to feel like
 * it. The shelf is derived from the save's seed and the week number, so it is
 * the same on every device and after every reload — reloading to reroll is not
 * a strategy.
 */
import { useGameStore } from '../bridge/index.ts';
import { shopSlots, shopRefreshIn } from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import { coins, pair } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';
import { Sheet, OptionRow } from './Sheet.tsx';
import { playSound } from '../audio/index.ts';

function countdown(ms: number): string {
  const hours = Math.floor(ms / 3600_000);
  const days = Math.floor(hours / 24);
  return days > 0 ? `${days}d ${hours % 24}h` : `${hours}h`;
}

export function ShopPanel({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const now = state.epochMs;
  const slots = shopSlots(state, now);

  return (
    <Sheet
      title={t('ui.shop')}
      subtitle={`${t('ui.refreshesIn')} ${countdown(shopRefreshIn(now))}`}
      onClose={onClose}
    >
      {slots.map((slot) => (
        <div key={slot.defId} className={slot.featured ? 'rounded-xl bg-coral-500/10 p-1' : ''}>
          {slot.featured && (
            <p className="px-2 pb-1 text-[11px] uppercase tracking-[0.12em] text-coral-400">
              {t('ui.featured')}
            </p>
          )}
          <OptionRow
          locale={locale}
            title={t(slot.nameKey)}
            meta={`+${slot.decorPoints} · ${Math.round(slot.discount * 100)}% ${t('ui.save')}`
              + (slot.owned > 0 ? ` · ${t('ui.owned')} ${slot.owned}` : '')}
            detail={pair(`${coins(locale, slot.fullPrice)} → ${coins(locale, slot.price)}`)}
            price={slot.price}
            currency={slot.currency}
            blockerLabel={
              slot.taken ? t('ui.taken')
                : !slot.affordable ? t('ui.cannotAfford')
                : null
            }
            onPick={() => {
              if (dispatch({ type: 'BUY_SHOP_OFFER', defId: slot.defId, epochMs: now }).ok) {
                playSound('coin');
              }
            }}
          />
        </div>
      ))}
    </Sheet>
  );
}
