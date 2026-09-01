/**
 * Interface preferences.
 *
 * The language lived in a `useState('en')`, so an Arabic player was returned
 * to English on every launch. It is a presentation choice, not simulation
 * state: putting it in the save would mean a schema bump, a migration, and an
 * imported save quietly changing the interface language. localStorage is the
 * right size for it — synchronous at boot, survives reloads, and is not part
 * of the hotel.
 *
 * Every access is wrapped: private browsing and blocked storage throw, and a
 * language preference is never worth crashing over.
 */
import type { Locale } from '../i18n/index.ts';
import { DEFAULT_LOCALE, LOCALES } from '../i18n/index.ts';

const LOCALE_KEY = 'hct.locale';

export function loadLocale(): Locale {
  try {
    const value = localStorage.getItem(LOCALE_KEY);
    return (LOCALES as readonly string[]).includes(value ?? '') ? (value as Locale) : DEFAULT_LOCALE;
  } catch {
    return DEFAULT_LOCALE;
  }
}

export function storeLocale(locale: Locale): void {
  try {
    localStorage.setItem(LOCALE_KEY, locale);
  } catch {
    // Nothing to do: the choice still applies for this session.
  }
}
