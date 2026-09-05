/**
 * The build menu.
 *
 * Grouped the way a player thinks about the hotel: rooms that earn, rooms that
 * entertain, rooms that keep the place running. Locked entries stay visible
 * rather than hidden — seeing the presidential suite at level 44 is what makes
 * level 44 worth reaching.
 */
import { useState } from 'react';
import { useGameStore } from '../bridge/index.ts';
import { buildCatalog } from '../bridge/selectors.ts';
import type { Blocker, BuildOption } from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';
import { pair } from '../i18n/format.ts';
import { Sheet, OptionRow } from './Sheet.tsx';

const TABS: Array<{ key: 'guest' | 'commercial' | 'functional'; labelKey: string }> = [
  { key: 'guest', labelKey: 'ui.tab.guest' },
  { key: 'commercial', labelKey: 'ui.tab.commercial' },
  { key: 'functional', labelKey: 'ui.tab.functional' },
];

export function blockerLabel(
  blocker: Blocker,
  unlockLevel: number,
  t: (k: string, v?: Record<string, string | number>) => string,
): string | null {
  switch (blocker) {
    case 'locked': return t('ui.notUnlocked', { level: unlockLevel });
    case 'cannotAfford': return t('ui.cannotAfford');
    case 'noSpace': return t('ui.noSpace');
    case 'alreadyExists': return t('ui.alreadyExists');
    case 'placed': return t('ui.installed');
    default: return null;
  }
}

export function BuildPanel({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const [tab, setTab] = useState<'guest' | 'commercial' | 'functional'>('guest');
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const groups = buildCatalog(state);
  const options: BuildOption[] = groups[tab] ?? [];

  return (
    <Sheet title={t('ui.build')} subtitle={t('ui.buildHint')} onClose={onClose}>
      <div className="mb-3 flex gap-1.5">
        {TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            onClick={() => setTab(key)}
            className={`min-h-11 flex-1 rounded-lg px-3 py-2.5 text-xs transition
              ${tab === key ? 'bg-brass-500 font-semibold text-midnight-950' : 'bg-white/5 text-sand-300'}`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {options.map((option) => (
        <OptionRow
          locale={locale}
          key={option.defId}
          title={t(option.nameKey)}
          meta={t(option.descKey)}
          detail={[
            pair(`${option.blocks.w}×${option.blocks.h}`),
            option.incomePerGuest ? `${option.incomePerGuest} ${t('ui.perGuest')}` : null,
          ].filter(Boolean).join(' · ')}
          price={option.cost.amount}
          currency={option.cost.currency}
          blockerLabel={blockerLabel(option.blocker, option.unlockLevel, t)}
          onPick={() => {
            dispatch({ type: 'BUILD_ROOM', defId: option.defId });
            onClose();
          }}
        />
      ))}
    </Sheet>
  );
}
