/**
 * Localisation.
 *
 * English is the primary locale and the fallback for every key. Arabic is the
 * secondary locale with full RTL. A missing Arabic string falls back to
 * English rather than showing a raw key — a player should never see
 * `room.deluxe.name` on screen.
 */
// Import attributes rather than a bare JSON import: this module has to load
// under Node (for the headless tests) as well as through Vite.
import en from './locales/en.json' with { type: 'json' };
import ar from './locales/ar.json' with { type: 'json' };

export const LOCALES = ['en', 'ar'] as const;
export type Locale = (typeof LOCALES)[number];

export const DEFAULT_LOCALE: Locale = 'en';

const TABLES: Record<Locale, Record<string, string>> = { en, ar };

/** Text direction for a locale. The canvas is direction-agnostic; only the HUD flips. */
export function directionOf(locale: Locale): 'ltr' | 'rtl' {
  return locale === 'ar' ? 'rtl' : 'ltr';
}

export function isRtl(locale: Locale): boolean {
  return directionOf(locale) === 'rtl';
}

/**
 * Look up a key, with {placeholder} interpolation.
 * Falls back to English, then to the key itself so a missing string is
 * obvious in development but never crashes.
 */
export function translate(locale: Locale, key: string, vars?: Record<string, string | number>): string {
  const template = TABLES[locale]?.[key] ?? TABLES[DEFAULT_LOCALE][key] ?? key;
  if (!vars) return template;
  return template.replace(/\{(\w+)\}/g, (match, name: string) => {
    const value = vars[name];
    return value === undefined ? match : String(value);
  });
}

/** Bind a locale once, for components that translate many keys. */
export function translatorFor(locale: Locale) {
  return (key: string, vars?: Record<string, string | number>) => translate(locale, key, vars);
}

/** Keys present in English but missing from `locale`. Used by the validator. */
export function missingKeys(locale: Locale): string[] {
  const target = TABLES[locale] ?? {};
  return Object.keys(TABLES[DEFAULT_LOCALE]).filter((k) => !(k in target));
}

export function coverage(locale: Locale): number {
  const total = Object.keys(TABLES[DEFAULT_LOCALE]).length;
  if (total === 0) return 1;
  return (total - missingKeys(locale).length) / total;
}
