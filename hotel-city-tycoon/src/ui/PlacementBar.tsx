/**
 * Placement mode.
 *
 * One picker, shared by moving a room and putting a stored one back, because
 * they are the same gesture: choose a square, see whether it fits, confirm.
 *
 * Tap-driven rather than drag-driven. A drag on a phone competes with the
 * scroll and the pan, and the canvas already reports an empty tap in block
 * coordinates — so the cheap, reliable interaction was the one already there.
 */
import { useGameStore } from '../bridge/index.ts';
import { canPlaceAt } from '../bridge/selectors.ts';
import { REJECTION_KEY } from '../bridge/rejections.ts';
import { translate } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';

export interface Placement {
  kind: 'move' | 'stored';
  roomId: string;
  defId: string;
  /** Where the player last tapped, or null before they have chosen. */
  at: { x: number; y: number } | null;
  /** i18n key for a refusal that got past the preview. */
  refusal?: string;
}

export function PlacementBar({
  placement, locale, onChange, onDone,
}: {
  placement: Placement;
  locale: Locale;
  onChange: (next: Placement) => void;
  onDone: () => void;
}) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const { at } = placement;
  // The preview asks exactly what the command will ask, so a green box can
  // never sit over a square the core then refuses.
  const valid = at !== null && canPlaceAt(
    state, placement.defId, at.x, at.y,
    placement.kind === 'move' ? placement.roomId : undefined,
  );

  return (
    <div
      data-testid="placement-bar"
      className="pointer-events-auto absolute inset-x-0 bottom-0 z-40 border-t border-white/10 bg-midnight-900/95 px-4 py-3 backdrop-blur"
    >
      <p className="text-xs text-sand-300">
        {t(placement.kind === 'move' ? 'ui.moveHint' : 'ui.placeHint')}
      </p>

      {placement.refusal && (
        <p data-testid="placement-refusal" className="mt-1 text-xs text-rose-300">
          {t(placement.refusal)}
        </p>
      )}

      <p
        data-testid="placement-status"
        data-valid={at === null ? 'none' : valid ? 'yes' : 'no'}
        className={`mt-1 text-sm font-medium ${
          at === null ? 'text-sand-400' : valid ? 'text-emerald-400' : 'text-rose-400'
        }`}
      >
        {at === null
          ? t('ui.pickASpot')
          : `${at.x},${at.y} — ${t(valid ? 'ui.spotFits' : 'ui.spotBlocked')}`}
      </p>

      <div className="mt-2 flex gap-2">
        <button
          type="button"
          data-testid="placement-confirm"
          disabled={!valid}
          onClick={() => {
            if (!at) return;
            const result = placement.kind === 'move'
              ? dispatch({ type: 'MOVE_ROOM', roomId: placement.roomId, x: at.x, y: at.y })
              : dispatch({ type: 'PLACE_STORED_ROOM', roomId: placement.roomId, x: at.x, y: at.y });
            if (result.ok) { onDone(); return; }
            // Refused after all: keep the player in the mode and say why,
            // rather than dropping them back to the hotel with nothing changed
            // and no explanation.
            onChange({ ...placement, at: null, refusal: REJECTION_KEY[result.reason] });
          }}
          className="min-h-11 flex-1 rounded-lg bg-brass-500 px-3 py-2.5 text-sm font-semibold text-midnight-950 disabled:opacity-40"
        >
          {t('ui.confirmPlacement')}
        </button>
        <button
          type="button"
          data-testid="placement-cancel"
          onClick={onDone}
          className="min-h-11 flex-1 rounded-lg bg-white/5 px-3 py-2.5 text-sm text-sand-300"
        >
          {t('ui.cancel')}
        </button>
      </div>
    </div>
  );
}
