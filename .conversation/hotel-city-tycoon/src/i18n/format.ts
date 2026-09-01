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
