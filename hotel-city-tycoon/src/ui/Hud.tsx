/**
 * The HUD.
 *
 * Deliberately sparse for P3a: enough to prove the simulation is running and
 * to drive it by hand. The full panelled interface is P4.
 *
 * Visual direction is brass on midnight — a hotel lobby after dark, brass
 * fittings and lit signage. Numbers are the hero, because in a tycoon game
 * the numbers are what the player is actually watching.
 */
import type { ReactNode } from 'react';
import { useGameStore } from '../bridge/index.ts';
import {
  hotelIsOpen, shiftSecondsLeft, bestAffordableShift, levelBarProgress, urgentRooms,
} from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import { coins } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';

function Readout({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex flex-col">
      <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{label}</span>
      <span className="font-mono text-lg leading-tight text-brass-400 tabular-nums">{value}</span>
    </div>
  );
}

export function Hud({
  locale = 'en', onOpenBuild, onOpenShift, onOpenUpgrades, onOpenShop, onOpenCity, onOpenManage, objective,
}: {
  locale?: Locale;
  onOpenBuild: () => void;
  onOpenShift: () => void;
  onOpenUpgrades: () => void;
  onOpenShop: () => void;
  onOpenCity: () => void;
  onOpenManage: () => void;
  /** The objective card, rendered above the bottom bar. */
  objective?: ReactNode;
}) {
  const state = useGameStore((s) => s.state);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const open = hotelIsOpen(state);
  const secondsLeft = shiftSecondsLeft(state);
  // Seconds are shown deliberately: at HH:MM a live countdown looks frozen,
  // and "is the simulation running" is the first thing anyone checks.
  const hh = Math.floor(secondsLeft / 3600);
  const mm = Math.floor((secondsLeft % 3600) / 60);
  const ss = secondsLeft % 60;
  const bestShift = bestAffordableShift(state);
  const urgent = urgentRooms(state);

  return (
    <>
      <header className="pointer-events-none absolute inset-x-0 top-0 z-10 p-3">
        <div className="pointer-events-auto flex items-center gap-4 rounded-xl border border-white/5 bg-midnight-900/85 px-4 py-2.5 backdrop-blur">
          <Readout label={t('ui.coins')} value={coins(locale, state.player.coins)} />
          <Readout label={t('ui.gems')} value={String(state.player.gems)} />
          <Readout label={t('ui.level')} value={String(state.player.level)} />
          <div className="ms-auto flex flex-col items-end">
            <span className="text-[11px] uppercase tracking-[0.12em] text-slate-400">{t('ui.stars')}</span>
            <span className="text-lg leading-tight text-brass-400">{'★'.repeat(state.hotel.stars)}</span>
          </div>
        </div>
        <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-white/10">
          <div
            className="h-full bg-brass-500 transition-[width] duration-500"
            style={{ width: `${Math.round(levelBarProgress(state) * 100)}%` }}
          />
        </div>
      </header>

      <footer className="pointer-events-none absolute inset-x-0 bottom-0 z-10 p-3">
        {objective}
        <div className="pointer-events-auto rounded-xl border border-white/5 bg-midnight-900/85 px-4 py-3 backdrop-blur">
          {open ? (
            <div className="flex items-baseline justify-between">
              <span className="text-xs uppercase tracking-[0.12em] text-slate-400">{t('ui.shiftEndsIn')}</span>
              <span className="font-mono text-xl text-brass-400 tabular-nums">
                {String(hh).padStart(2, '0')}:{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}
              </span>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenShift}
              className="w-full rounded-lg bg-brass-500 px-4 py-3 font-semibold text-midnight-950 transition hover:bg-brass-400"
            >
              {bestShift
                ? `${t('ui.openHotel')} · ${bestShift.cost}`
                : t('ui.openHotel')}
            </button>
          )}

          <div className="mt-3 flex gap-2">
            <button
              type="button"
              onClick={onOpenBuild}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-slate-200 hover:border-brass-500/60"
            >
              + {t('ui.build')}
            </button>
            <button
              type="button"
              onClick={onOpenShop}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-slate-200 hover:border-brass-500/60"
            >
              {t('ui.shop')}
            </button>
            <button
              type="button"
              onClick={onOpenCity}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-slate-200 hover:border-brass-500/60"
            >
              {t('ui.city')}
            </button>
            <button
              type="button"
              data-testid="open-manage"
              onClick={onOpenManage}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-slate-200 hover:border-brass-500/60"
            >
              {t('ui.manage')}
            </button>
            <button
              type="button"
              onClick={onOpenUpgrades}
              className="flex-1 rounded-lg border border-white/10 px-3 py-2.5 text-sm text-slate-200 hover:border-brass-500/60"
            >
              {t('ui.upgrades')}
            </button>
          </div>

          <p className="mt-2 text-center text-[11px] text-slate-500">
            {state.hotel.rooms.length} {t('ui.rooms')} · {state.stats.guestsServed} {t('ui.guestsServed').toLowerCase()}
            {urgent.length > 0 && (
              <span className="ms-2 text-amber-400">· {urgent.length} {t('ui.needsAttention')}</span>
            )}
          </p>
        </div>
      </footer>
    </>
  );
}
