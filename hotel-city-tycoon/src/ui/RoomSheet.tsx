/**
 * The room sheet.
 *
 * Opens when a room is tapped. It is the single place a player deals with one
 * room: the decor meter, whatever is wrong with it, its staff, and selling it.
 *
 * The meter is the hero of this panel because it is the hero of the game —
 * income scales with it, and the original Hotel City hid it behind a hover
 * state that half the players never found.
 */
import { useState } from 'react';
import { useGameStore } from '../bridge/index.ts';
import { roomDetail, decorCatalog, freeSlots, staffOptionFor } from '../bridge/selectors.ts';
import { slotsFor } from '../bridge/selectors.ts';
import { REJECTION_KEY } from '../bridge/rejections.ts';
import { translate } from '../i18n/index.ts';
import { coins } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';
import { Sheet, OptionRow } from './Sheet.tsx';
import { blockerLabel } from './BuildPanel.tsx';

function Meter({ fill, points, target, locale }: { fill: number; points: number; target: number; locale: Locale }) {
  const pct = Math.round(fill * 100);
  const full = fill >= 0.999;
  return (
    <div className="mb-4">
      <div className="mb-1 flex items-baseline justify-between">
        <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{translate(locale, 'ui.decorMeter')}</span>
        <span className={`font-mono text-sm tabular-nums ${full ? 'text-emerald-400' : 'text-brass-400'}`}>
          {points}/{target}
        </span>
      </div>
      <div className="h-2.5 overflow-hidden rounded-full bg-black/40">
        <div
          className={`h-full rounded-full transition-[width] duration-300 ${full ? 'bg-emerald-500' : 'bg-brass-500'}`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

export function RoomSheet({
  roomId, locale, onClose, onMove,
}: {
  roomId: string;
  locale: Locale;
  onClose: () => void;
  /** Hands the player to the placement picker on the canvas. */
  onMove: (roomId: string, defId: string) => void;
}) {
  const [problem, setProblem] = useState<string | null>(null);
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  const [mode, setMode] = useState<'overview' | 'decorate'>('overview');
  if (!state) return null;

  const detail = roomDetail(state, roomId);
  if (!detail) { onClose(); return null; }

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const hazard = detail.hasFire ? 'fire' : detail.hasPest ? 'pest' : null;
  const staff = staffOptionFor(state, roomId);

  if (mode === 'decorate') {
    const slots = freeSlots(state, roomId);
    const catalogue = decorCatalog(state, roomId);
    return (
      <Sheet
        title={t('ui.decorate')}
        subtitle={`${t(detail.nameKey)} · ${slots.length} ${t('ui.slotsFree')}`}
        onClose={() => setMode('overview')}
      >
        <Meter fill={detail.fill} points={detail.decorPoints} target={detail.decorTarget} locale={locale} />
        {catalogue.map((item) => (
          <OptionRow
          locale={locale}
            key={item.defId}
            title={t(item.nameKey)}
            // The scene sprite, not the ART-1 thumbnail: only ten of the
            // seventy-seven pieces have a thumbnail drawn, while every piece
            // has a scene sprite on disk. Switching this path to
            // `decor/thumbs/` is a one-line change once the rest exist.
            icon={`${import.meta.env.BASE_URL}assets/decor/${item.defId}.png`}
            meta={`+${item.decorPoints} · ${Math.round(item.meterShare * 100)}% ${t('ui.ofMeter')}`}
            {...(item.owned > 0
              // Already owned: the core consumes the copy and charges nothing,
              // so showing a price here would be a bill that never arrives.
              ? { label: `${t('ui.owned')} ×${item.owned} · ${t('ui.free')}` }
              : { price: item.cost.amount, currency: item.cost.currency })}
            blockerLabel={blockerLabel(item.blocker, item.unlockLevel, t)}
            onPick={() => {
              // A slot this kind of piece is actually allowed in, not just the
              // first empty index.
              const slot = slotsFor(state, roomId, item.slotType)[0];
              if (slot !== undefined) {
                dispatch({ type: 'PLACE_DECOR', roomId, defId: item.defId, slot });
              }
            }}
          />
        ))}
      </Sheet>
    );
  }

  return (
    <Sheet
      title={t(detail.nameKey)}
      {...(detail.capacity > 0 ? { subtitle: `${detail.occupants}/${detail.capacity}` } : {})}
      onClose={onClose}
    >
      {detail.decorTarget > 0 && (
        <Meter fill={detail.fill} points={detail.decorPoints} target={detail.decorTarget} locale={locale} />
      )}

      {detail.hasGhost && (
        <p className="rounded-xl bg-white/[0.04] px-4 py-3 text-[13px] text-slate-300">
          {t('ui.ghostHint')}
        </p>
      )}
      {hazard && (
        <button
          type="button"
          onClick={() => dispatch({ type: 'CLEAR_HAZARD', roomId, hazard })}
          className="mb-3 w-full rounded-xl border border-amber-500/40 bg-amber-950/50 px-4 py-3 text-start"
        >
          <span className="block text-sm font-semibold text-amber-200">
            {hazard === 'fire' ? t('ui.putOutFire') : t('ui.clearPest')}
          </span>
          <span className="block text-[11px] text-amber-300/70">
            {detail.hazardCost > 0 ? `${coins(locale, detail.hazardCost)} ${t('ui.coins')}` : t('ui.free')}
          </span>
        </button>
      )}

      <dl className="mb-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <dt className="text-slate-400">{t('ui.cleanliness')}</dt>
          <dd className="font-mono text-sm text-slate-100">{Math.round(detail.cleanliness * 100)}%</dd>
        </div>
        <div className="rounded-lg bg-white/[0.03] px-3 py-2">
          <dt className="text-slate-400">{t('ui.slots')}</dt>
          <dd className="font-mono text-sm text-slate-100">{detail.usedSlots}/{detail.decorSlots}</dd>
        </div>
      </dl>

      {detail.placed.length > 0 && (
        <ul data-testid="placed-decor" className="mb-3 space-y-1.5">
          {detail.placed.map((piece) => (
            <li
              key={piece.id}
              data-testid={`placed-${piece.defId}`}
              className="flex items-center gap-2 rounded-lg bg-white/[0.03] px-3 py-2"
            >
              <span className="text-xs text-slate-200">{t(piece.nameKey)}</span>
              <span className="font-mono text-[11px] text-slate-400">+{piece.decorPoints}</span>
              <button
                type="button"
                data-testid={`remove-decor-${piece.defId}`}
                onClick={() => {
                  // Removal returns the piece to the player's own store; it is
                  // not a sale, and it charges nothing to put back later.
                  const r = dispatch({ type: 'REMOVE_DECOR', roomId, decorId: piece.id });
                  setProblem(r.ok ? null : REJECTION_KEY[r.reason]);
                }}
                className="ms-auto min-h-11 rounded-lg px-3 py-2 text-xs text-slate-300 hover:bg-white/5"
              >
                {t('ui.remove')}
              </button>
            </li>
          ))}
        </ul>
      )}

      {detail.decorSlots > 0 && (
        <button
          type="button"
          onClick={() => setMode('decorate')}
          className="mb-2 w-full rounded-xl bg-brass-500 px-4 py-3 font-semibold text-midnight-950 hover:bg-brass-400"
        >
          {t('ui.decorate')}
        </button>
      )}

      <div className="mb-2 flex gap-2">
        <button
          type="button"
          data-testid="room-move"
          onClick={() => { onMove(roomId, detail.defId); onClose(); }}
          className="min-h-11 flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-200"
        >
          {t('ui.move')}
        </button>
        {/* Always shown, and always says why when it will not work. Hiding it
            left the player unable to tell "you cannot" from "there is no such
            thing". */}
        <button
          type="button"
          data-testid="room-store"
          data-blocked={detail.storeBlocker ?? ''}
          disabled={detail.storeBlocker !== null}
          onClick={() => {
            const r = dispatch({ type: 'STORE_ROOM', roomId });
            if (r.ok) { onClose(); return; }
            setProblem(REJECTION_KEY[r.reason]);
          }}
          className="min-h-11 flex-1 rounded-xl bg-white/5 px-4 py-2.5 text-sm text-slate-200 disabled:opacity-40"
        >
          {t('ui.store')}
        </button>
      </div>

      {(problem || detail.storeBlocker) && (
        <p data-testid="room-problem" className="mb-2 rounded-lg bg-rose-500/10 px-3 py-2 text-xs text-rose-300">
          {t(problem ?? `reject.${detail.storeBlocker}`)}
        </p>
      )}

      {staff && (
        <OptionRow
          locale={locale}
          title={`${t('ui.hire')} · ${t(staff.nameKey)}`}
          meta={`${staff.wagePerHour} ${t('ui.perHour')}`}
          price={staff.hireCost}
          currency="coins"
          blockerLabel={blockerLabel(staff.blocker, 1, t)}
          onPick={() => dispatch({ type: 'HIRE_STAFF', roomId, roleId: staff.roleId })}
        />
      )}

      {detail.canSell && (
        <button
          type="button"
          onClick={() => { dispatch({ type: 'SELL_ROOM', roomId }); onClose(); }}
          className="mt-2 w-full rounded-xl border border-white/10 px-4 py-2.5 text-sm text-slate-400 hover:border-red-500/50 hover:text-red-300"
        >
          {t('ui.sell')} · {coins(locale, detail.sellRefund)}
        </button>
      )}
    </Sheet>
  );
}
