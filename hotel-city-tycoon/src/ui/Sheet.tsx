/**
 * Bottom sheet.
 *
 * Every panel in the game uses this. On a phone the bottom half of the screen
 * is where the thumb lives, so panels rise from there rather than covering the
 * hotel from the top. The canvas stays visible above the sheet on purpose —
 * the player is choosing where to put something, and needs to see the hotel
 * while they choose.
 */
import type { ReactNode } from 'react';
import { coins as formatCoins } from '../i18n/format.ts';
import type { Locale } from '../i18n/index.ts';

export function Sheet({
  title, subtitle, onClose, children,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
}) {
  return (
    <div className="absolute inset-0 z-30 flex flex-col justify-end">
      {/* The dimmed area above the sheet dismisses it. It fills the space it
          is given, so it needs no minimum of its own. */}
      <button
        type="button"
        aria-label="Close"
        onClick={onClose}
        className="min-h-11 flex-1 bg-black/50 backdrop-blur-[1px]"
      />
      <section className="max-h-[68%] overflow-hidden rounded-t-2xl border-t border-white/10 bg-midnight-900 shadow-2xl">
        <header className="flex items-baseline gap-3 border-b border-white/5 px-4 py-3">
          <h2 className="text-base font-semibold text-white">{title}</h2>
          {subtitle && <span className="text-xs text-slate-400">{subtitle}</span>}
          <button
            type="button"
            onClick={onClose}
            className="ms-auto rounded-lg px-4 py-2 text-sm text-slate-400 hover:bg-white/5 hover:text-white"
          >
            ✕
          </button>
        </header>
        <div className="max-h-[calc(68vh-3.5rem)] overflow-y-auto overscroll-contain px-4 py-3">
          {children}
        </div>
      </section>
    </div>
  );
}

/** A row that is either actionable or explains why it is not. */
export function OptionRow({
  title, meta, detail, price, currency, blockerLabel, onPick, locale = 'en',
}: {
  title: string;
  /** One line explaining what this is for. */
  meta?: string;
  /** Dimensions, rates — the numbers, kept smaller than the explanation. */
  detail?: string;
  price?: number;
  currency?: 'coins' | 'gems';
  blockerLabel?: string | null;
  onPick?: () => void;
  /** Prices follow the chosen language, not the device. */
  locale?: Locale;
}) {
  const disabled = Boolean(blockerLabel);
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onPick}
      className={`mb-2 flex min-h-11 w-full items-center gap-3 rounded-xl border px-3 py-2.5 text-start transition
        ${disabled
          ? 'cursor-not-allowed border-white/5 bg-white/[0.02] opacity-55'
          : 'border-white/10 bg-white/[0.04] hover:border-brass-500/70 hover:bg-white/[0.07]'}`}
    >
      <span className="min-w-0 flex-1">
        <span className="block truncate text-sm text-slate-100">{title}</span>
        {meta && <span className="block text-[11px] leading-snug text-slate-400">{meta}</span>}
        {detail && <span className="mt-0.5 block font-mono text-[11px] text-slate-500">{detail}</span>}
      </span>
      {blockerLabel ? (
        <span className="shrink-0 text-[11px] text-slate-500">{blockerLabel}</span>
      ) : price !== undefined ? (
        <span className={`shrink-0 font-mono text-sm tabular-nums ${currency === 'gems' ? 'text-water-hi' : 'text-brass-400'}`}>
          {formatCoins(locale, price)}
        </span>
      ) : null}
    </button>
  );
}
