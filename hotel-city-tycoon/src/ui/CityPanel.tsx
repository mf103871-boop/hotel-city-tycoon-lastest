/**
 * The city.
 *
 * Section 13 of the architecture document names generated rivals as the
 * substitute for a social layer that would need a server. This screen exists
 * to answer one question a player otherwise cannot: am I doing well?
 *
 * It says outright, at the bottom, that these hotels are part of the game.
 * Implying they were real people would make the city feel busier at the cost
 * of the only thing the game has going for it, which is that it does not lie
 * to the person playing it.
 */
import { useGameStore } from '../bridge/index.ts';
import { cityView } from '../bridge/selectors.ts';
import { translate } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';
import { Sheet } from './Sheet.tsx';
import { playSound } from '../audio/index.ts';

/**
 * A five-star rating.
 *
 * The unearned pips are hollow ★ → ☆ as well as dimmer. They used to be the
 * same filled glyph in a quieter colour, which is a rating told by hue alone —
 * the one thing ART-0 §7 rules out — and at 2.3:1 the quieter colour was close
 * to not being there at all.
 */
function Stars({ n }: { n: number }) {
  return (
    <span className="text-brass-400">
      {'★'.repeat(n)}
      <span className="text-sand-600">{'☆'.repeat(5 - n)}</span>
    </span>
  );
}

export function CityPanel({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const state = useGameStore((s) => s.state);
  const dispatch = useGameStore((s) => s.dispatch);
  if (!state) return null;

  const t = (k: string, v?: Record<string, string | number>) => translate(locale, k, v);
  const now = state.epochMs;
  const city = cityView(state, now);

  // The player's own hotel is placed in the list rather than shown separately:
  // the comparison is the point, and a separate box makes it easy to skip.
  const rows = [
    ...city.hotels.map((h) => ({ ...h, isPlayer: false })),
    {
      id: 'player', name: state.hotel.name, profileId: '', visited: false,
      level: state.player.level, stars: state.hotel.stars,
      rooms: state.hotel.rooms.length, isPlayer: true,
    },
  ].sort((a, b) => b.level - a.level || b.stars - a.stars);

  return (
    <Sheet
      title={t('ui.city')}
      subtitle={`${t('ui.rank', { rank: city.rank, of: city.of })} · ${
        city.visitsLeft > 0
          ? t('ui.visitsLeft', { n: city.visitsLeft })
          : t('ui.noVisitsLeft')
      }`}
      onClose={onClose}
    >
      {rows.map((hotel) => (
        <div
          key={hotel.id}
          className={`mb-2 flex min-h-11 items-center gap-3 rounded-xl border px-3 py-2.5 ${
            hotel.isPlayer
              ? 'border-coral-500/50 bg-coral-500/10'
              : 'border-white/10 bg-white/[0.03]'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block truncate text-sm text-sand-100">
              {hotel.name}
              {hotel.isPlayer && (
                <span className="ms-2 text-[11px] text-coral-400">{t('ui.yourHotel')}</span>
              )}
            </span>
            <span className="block text-[11px] text-sand-400">
              <Stars n={hotel.stars} /> · {t('ui.level')} {hotel.level} · {hotel.rooms} {t('ui.rooms')}
            </span>
          </span>

          {!hotel.isPlayer && (
            <button
              type="button"
              disabled={hotel.visited || city.visitsLeft <= 0}
              onClick={() => {
                if (dispatch({ type: 'VISIT_NEIGHBOUR', neighbourId: hotel.id, epochMs: now }).ok) {
                  playSound('coin');
                }
              }}
              className={`min-h-11 shrink-0 rounded-lg px-3 py-2 text-xs ${
                hotel.visited || city.visitsLeft <= 0
                  ? 'cursor-not-allowed border border-white/10 text-sand-400'
                  : 'bg-brass-500 font-semibold text-ink-950'
              }`}
            >
              {hotel.visited ? t('ui.visited') : `${t('ui.visit')} +${city.rewardCoins}`}
            </button>
          )}
        </div>
      ))}

      <p className="mt-3 text-center text-[11px] leading-snug text-sand-500">
        {t('ui.generatedCity')}
      </p>
    </Sheet>
  );
}
