/**
 * Number formatting.
 *
 * Fourteen call sites used bare `toLocaleString()`, which follows the device
 * rather than the language the player chose. Somebody playing in Arabic on an
 * Arabic device saw Arabic-Indic digits; the same player on an English device
 * saw Western ones. Same game, same screen, different numbers.
 *
 * Digits are Western in both locales on purpose. Arabic-Indic numerals are
 * correct Arabic, but a tycoon game is read as numbers far more than as prose,
 * and mixing digit systems across a session — a device that reports one thing,
 * a save exported on another — is worse than being consistently plain.
 */
import type { Locale } from './index.ts';

const BCP47: Record<Locale, string> = {
  // `-u-nu-latn` keeps Western digits while the rest of the formatting follows
  // the locale: grouping, and the separator characters around it.
  en: 'en-US',
  ar: 'ar-u-nu-latn',
};

const cache = new Map<string, Intl.NumberFormat>();

function formatter(locale: Locale, options?: Intl.NumberFormatOptions): Intl.NumberFormat {
  const key = `${locale}:${JSON.stringify(options ?? {})}`;
  let found = cache.get(key);
  if (!found) {
    // Cached because these are built per frame in a HUD that redraws at 10Hz,
    // and constructing an Intl formatter is not cheap.
    found = new Intl.NumberFormat(BCP47[locale], options);
    cache.set(key, found);
  }
  return found;
}

/** A plain number, grouped for the chosen language. */
export function num(locale: Locale, value: number): string {
  return formatter(locale).format(value);
}

/**
 * A currency amount, shortened once it stops being readable.
 *
 * A late hotel holds hundreds of millions, and "268,146,111" in a button is a
 * number nobody reads — they see length, not value.
 */
export function coins(locale: Locale, value: number): string {
  const abs = Math.abs(value);
  if (abs >= 1_000_000) {
    return `${formatter(locale, { maximumFractionDigits: 1 }).format(value / 1_000_000)}M`;
  }
  if (abs >= 100_000) {
    return `${formatter(locale, { maximumFractionDigits: 0 }).format(value / 1000)}K`;
  }
  return formatter(locale).format(value);
}

/** A whole-number percentage. */
export function percent(locale: Locale, ratio: number): string {
  return formatter(locale, { style: 'percent', maximumFractionDigits: 0 }).format(ratio);
}

/**
 * An ordered pair of numbers that must keep its order in Arabic.
 *
 * `"140 → 56"` in a right-to-left paragraph does not render as `140 → 56`.
 * The Unicode bidi algorithm resolves each number to a right-to-left run and
 * the arrow between them to a neutral that joins the two, so the group is laid
 * out right-to-left and the browser paints `56 → 140`. Measured in Chromium
 * rather than reasoned about — every pair of this shape reverses:
 *
 *     logical            Arabic painted
 *     140 → 56           56 → 140         a discount reads as a price rise
 *     ×1.36 → ×1.52      1.52× → 1.36×    an upgrade reads as a downgrade
 *     2×1                1×2              a room's width and height swap
 *
 * LRI…PDI (U+2066, U+2069) isolates the run: it is placed as a single unit in
 * the Arabic flow, so the pair reads correctly and the Arabic around it is
 * unaffected. Isolate, not embed — U+202A would leave the surrounding text's
 * direction to guesswork at the boundary.
 *
 * For an ordered pair only. A lone number needs nothing; digits already run
 * left to right on their own, and wrapping ordinary localised prose would put
 * its words in the wrong place.
 */
export function pair(text: string): string {
  return `⁦${text}⁩`;
}

/**
 * A rough duration, in the reader's own units.
 *
 * Two panels used to build this themselves — `${days}d ${hours % 24}h` and
 * `${hours}h ${minutes}m` — which puts English letters into an Arabic
 * interface. The letters come from the locale now, and the rounding rule lives
 * in one place instead of being written twice and slightly differently.
 *
 * Deliberately coarse: it answers "how long until the shop refreshes" and "how
 * long were you away", where a player wants the size of the gap, not seconds.
 */
export function duration(
  locale: Locale,
  ms: number,
  unit: (key: string) => string,
): string {
  const minutes = Math.max(0, Math.floor(ms / 60_000));
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  if (days > 0) return `${num(locale, days)}${unit('ui.daysShort')} ${num(locale, hours % 24)}${unit('ui.hoursShort')}`;
  if (hours > 0) return `${num(locale, hours)}${unit('ui.hoursShort')} ${num(locale, minutes % 60)}${unit('ui.minutesShort')}`;
  return `${num(locale, minutes)}${unit('ui.minutesShort')}`;
}
