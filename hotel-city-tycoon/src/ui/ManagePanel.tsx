/**
 * Manage.
 *
 * The home for the six commands that had core logic, tests and save support and
 * no way for a player to reach them: expanding the plot, putting rooms back,
 * and everything to do with owned decor.
 *
 * A rejection never closes this panel. The point of showing a blocked row is
 * that the player learns what would unblock it, and a sheet that vanishes on
 * refusal teaches nothing.
 */
import { useState } from 'react';
import { useGameStore } from '../bridge/index.ts';
import { nextExpansion, storedRoomViews, storedDecor } from '../bridge/selectors.ts';
import { REJECTION_KEY } from '../bridge/rejections.ts';
import { translate } from '../i18n/index.ts';
import { coins as fmtCoins, num } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';
import { Sheet, OptionRow } from './Sheet.tsx';
import { blockerLabel } from './BuildPanel.tsx';

export type ManageTab = 'plot' | 'rooms' | 'decor';

const TABS: Array<{ key: ManageTab; labelKey: string }> = [
  { key: 'plot', labelKey: 'ui.tab.plot' },
  { key: 'rooms', labelKey: 'ui.tab.storedRooms' },
  { key: 'decor', labelKey: 'ui.tab.inventory' },
];

export function ManagePanel({
  locale, onClose, onPlaceStored,
}: {
  locale: Locale;
  onClose: () => void;
  /** Hands the player to the placement picker on the canvas. */
  onPlaceStored: (roomId: string) => void;
}) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const [tab, setTab] = useState<ManageTab>('plot');
  const [problem, setProblem] = useState<string | null>(null);
  const [confirmSell, setConfirmSell] = useState<string | null>(null);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const expansion = nextExpansion(state);
  const rooms = storedRoomViews(state);
  const decor = storedDecor(state);

  return (
    <Sheet title={t('ui.manage')} subtitle={t('ui.manageHint')} onClose={onClose}>
      <div className="mb-3 flex gap-1.5">
        {TABS.map(({ key, labelKey }) => (
          <button
            key={key}
            type="button"
            data-testid={`manage-tab-${key}`}
            onClick={() => { setTab(key); setProblem(null); setConfirmSell(null); }}
            className={`min-h-11 flex-1 rounded-lg px-3 py-2.5 text-xs transition
              ${tab === key ? 'bg-brass-500 font-semibold text-midnight-950' : 'bg-white/5 text-sand-300'}`}
          >
            {t(labelKey)}
          </button>
        ))}
      </div>

      {/* The reason the last action was refused. It stays until the player
          does something else, rather than flashing past. */}
      {problem && (
        <p data-testid="manage-problem" className="mb-3 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {t(problem)}
        </p>
      )}

      {tab === 'plot' && (
        <div data-testid="manage-plot">
          {!expansion && (
            <p className="py-6 text-center text-sm text-sand-400">{t('ui.plotMaxed')}</p>
          )}
          {expansion && (
            <>
              <dl className="mb-3 grid grid-cols-2 gap-2 rounded-xl bg-white/[0.03] p-3">
                <dt className="text-[11px] uppercase tracking-wide text-sand-400">{t('ui.plotNow')}</dt>
                <dd className="text-end font-mono text-sm text-sand-100">
                  {expansion.currentGrid.w}×{expansion.currentGrid.h} · {expansion.currentBlocks}
                </dd>
                <dt className="text-[11px] uppercase tracking-wide text-sand-400">{t('ui.plotAfter')}</dt>
                <dd data-testid="plot-after" className="text-end font-mono text-sm text-brass-400">
                  {expansion.grid.w}×{expansion.grid.h} · {expansion.blocks}
                </dd>
                <dt className="text-[11px] uppercase tracking-wide text-sand-400">{t('ui.requiredLevel')}</dt>
                <dd className="text-end font-mono text-sm text-sand-100">{expansion.unlockLevel}</dd>
              </dl>
              <OptionRow
                locale={locale}
                title={t('ui.expandPlot')}
                meta={`+${expansion.blocks - expansion.currentBlocks} ${t('ui.blocks')}`}
                detail={`${expansion.grid.w}×${expansion.grid.h}`}
                price={expansion.cost}
                currency="coins"
                blockerLabel={blockerLabel(expansion.blocker, expansion.unlockLevel, t)}
                onPick={() => {
                  const r = dispatch({ type: 'EXPAND_PLOT', plotId: expansion.id });
                  setProblem(r.ok ? null : REJECTION_KEY[r.reason]);
                }}
              />
            </>
          )}
        </div>
      )}

      {tab === 'rooms' && (
        <div data-testid="manage-rooms" className="space-y-2">
          {rooms.length === 0 && (
            <p className="py-6 text-center text-sm text-sand-400">{t('ui.noStoredRooms')}</p>
          )}
          {rooms.map((room) => (
            <div key={room.id} data-testid={`stored-room-${room.id}`} className="rounded-xl bg-white/[0.03] p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-sand-100">{t(room.nameKey)}</span>
                <span className="ms-auto font-mono text-[11px] text-sand-400">
                  {room.blocks.w}×{room.blocks.h}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-sand-400">
                {room.decorCount} {t('ui.pieces')} · {room.decorPoints} {t('ui.points')}
                {' · '}{Math.round(room.cleanliness * 100)}% {t('ui.clean')}
              </p>
              <button
                type="button"
                data-testid={`place-stored-${room.id}`}
                onClick={() => { onPlaceStored(room.id); onClose(); }}
                className="mt-2 min-h-11 w-full rounded-lg bg-brass-500 px-3 py-2.5 text-sm font-semibold text-midnight-950"
              >
                {t('ui.placeBack')}
              </button>
            </div>
          ))}
        </div>
      )}

      {tab === 'decor' && (
        <div data-testid="manage-decor" className="space-y-2">
          {decor.length === 0 && (
            <p className="py-6 text-center text-sm text-sand-400">{t('ui.noOwnedDecor')}</p>
          )}
          {decor.map((item) => (
            <div key={item.defId} data-testid={`owned-decor-${item.defId}`} className="rounded-xl bg-white/[0.03] p-3">
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium text-sand-100">{t(item.nameKey)}</span>
                <span
                  data-testid={`owned-count-${item.defId}`}
                  className="ms-auto font-mono text-xs text-brass-400"
                >
                  ×{num(locale, item.count)}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] text-sand-400">
                +{item.decorPoints} {t('ui.points')}
                {' · '}
                {item.refund
                  ? `${t('ui.refund')} ${item.refund.currency === 'coins'
                      ? fmtCoins(locale, item.refund.amount)
                      : `${item.refund.amount} ${t('ui.gems')}`}`
                  : t('ui.notRefundable')}
              </p>

              {confirmSell === item.defId ? (
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    data-testid={`sell-confirm-${item.defId}`}
                    onClick={() => {
                      const r = dispatch({ type: 'SELL_DECOR', defId: item.defId });
                      setProblem(r.ok ? null : REJECTION_KEY[r.reason]);
                      setConfirmSell(null);
                    }}
                    className="min-h-11 flex-1 rounded-lg bg-rose-500/80 px-3 py-2.5 text-sm font-semibold text-white"
                  >
                    {t('ui.confirmSell')}
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmSell(null)}
                    className="min-h-11 flex-1 rounded-lg bg-white/5 px-3 py-2.5 text-sm text-sand-300"
                  >
                    {t('ui.cancel')}
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  data-testid={`sell-decor-${item.defId}`}
                  disabled={!item.refund}
                  onClick={() => setConfirmSell(item.defId)}
                  className="mt-2 min-h-11 w-full rounded-lg bg-white/5 px-3 py-2.5 text-sm text-sand-200 disabled:opacity-40"
                >
                  {t('ui.sell')}
                </button>
              )}
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}
