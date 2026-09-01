/**
 * The shift picker.
 *
 * Paying up front to keep the hotel open is the mechanic Hotel City was built
 * around, so the choice gets its own panel rather than a single button. The
 * cost breakdown is shown because "why did that cost so much" is the first
 * question a player asks once they have staff.
 */
import { useGameStore } from '../bridge/index.ts';
import { shiftOptions, shiftBreakdown } from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';
import { Sheet, OptionRow } from './Sheet.tsx';

export function ShiftPanel({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);

  return (
    <Sheet title={t('ui.openHotel')} subtitle={t('ui.shiftHint')} onClose={onClose}>
      {shiftOptions(state).map((option) => {
        const parts = shiftBreakdown(state, option.id);
        const blocked = !option.unlocked ? t('ui.notUnlocked', { level: '?' })
          : !option.affordable ? t('ui.cannotAfford') : null;
        return (
          <OptionRow
          locale={locale}
            key={option.id}
            title={t(option.nameKey)}
            meta={`${t('ui.base')} ${parts.base} · ${t('ui.wages')} ${parts.wages}`}
            price={option.cost}
            currency="coins"
            blockerLabel={blocked}
            onPick={() => { dispatch({ type: 'START_SHIFT', shiftId: option.id }); onClose(); }}
          />
        );
      })}
    </Sheet>
  );
}
