/**
 * The phone — 4C.
 *
 * The original resolved its incidents through a phone menu: the ghost took a
 * ghostbuster, the weather took a repair crew. Fires and pests stay hands-on
 * (tap the room); the phone is for what you cannot fix yourself.
 */
import { useGameStore } from '../bridge/index.ts';
import { phoneView } from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import { coins } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';
import { Sheet } from './Sheet.tsx';
import { playSound } from '../audio/index.ts';

export function PhoneButton({ onOpen }: { onOpen: () => void }) {
  const state = useGameStore((s) => s.state);
  if (!state) return null;
  const view = phoneView(state);
  const attention = view.haunted + (view.climate ? 1 : 0);

  return (
    /*
     * Beside the Settings gear, under the header — not floating over the
     * bottom bar. At `bottom-24 end-3 z-30` it sat on the right end of the
     * "Open hotel" button and the shift countdown, and, being rendered after
     * the panels with the same z-index, on top of every sheet's rows too.
     * z-20 keeps it beneath the sheets.
     */
    <button
      type="button"
      onClick={onOpen}
      aria-label="phone"
      className="absolute end-16 top-24 z-20 flex h-11 w-11 items-center justify-center rounded-lg border border-white/10 bg-midnight-900/92 text-lg backdrop-blur"
    >
      <span aria-hidden>📞</span>
      {attention > 0 && (
        <span className="absolute -top-1 -end-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-coral-500 px-1 font-mono text-[11px] font-semibold text-ink-950">
          {attention}
        </span>
      )}
    </button>
  );
}

export function PhoneSheet({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const view = phoneView(state);
  const minutesLeft = view.climate ? Math.max(1, Math.round(view.climate.msLeft / 60_000)) : 0;

  const call = (service: 'ghostbuster' | 'repair') => {
    if (dispatch({ type: 'CALL_SERVICE', service }).ok) playSound('chime');
  };

  const quiet = view.haunted + (view.climate ? 1 : 0) === 0;
  return (
    <Sheet title={t('ui.phone')} {...(quiet ? { subtitle: t('ui.allQuiet') } : {})} onClose={onClose}>
      <div className="flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
        {/* Under the Vite base, like the loader: an absolute /assets/ path 404s on a deployment served under a path prefix. */}
        <img src={`${import.meta.env.BASE_URL}assets/effects/ghost.png`} alt="" className={`h-8 w-8 shrink-0 ${view.haunted === 0 ? 'opacity-40' : ''}`} />
        <div className="me-auto">
          <div className="font-semibold text-cream-100">{t('ui.ghostbuster')}</div>
          <div className="mt-0.5 text-[12px] text-sand-400">
            {view.haunted > 0 ? `${view.haunted} × ${t('event.ghost.name')}` : t('ui.allQuiet')}
          </div>
        </div>
        <button
          type="button"
          disabled={view.haunted === 0}
          onClick={() => call('ghostbuster')}
          className="min-h-11 rounded-xl bg-coral-500 px-4 py-2 font-semibold text-ink-950 disabled:opacity-30"
        >
          {coins(locale, view.ghostFee)}
        </button>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 rounded-xl bg-white/[0.04] px-4 py-3">
        {view.climate
          ? <img src={`${import.meta.env.BASE_URL}assets/effects/${view.climate.eventId}.png`} alt="" className="h-8 w-8 shrink-0" />
          : <span className="h-8 w-8 shrink-0" />}
        <div className="me-auto">
          <div className="font-semibold text-cream-100">{t('ui.repairCrew')}</div>
          <div className="mt-0.5 text-[12px] text-sand-400">
            {view.climate
              ? `${t(view.climate.nameKey)} · ${minutesLeft} ${t('ui.minutesShort')}`
              : t('ui.allQuiet')}
          </div>
        </div>
        <button
          type="button"
          disabled={!view.climate}
          onClick={() => call('repair')}
          className="min-h-11 rounded-xl bg-coral-500 px-4 py-2 font-semibold text-ink-950 disabled:opacity-30"
        >
          {view.climate ? coins(locale, view.climate.fee) : '—'}
        </button>
      </div>
    </Sheet>
  );
}
