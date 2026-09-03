/**
 * Bottom sheet.
 *
 * Every panel in the game uses this. On a phone the bottom half of the screen
 * is where the thumb lives, so panels rise from there rather than covering the
 * hotel from the top. The canvas stays visible above the sheet on purpose —
 * the player is choosing where to put something, and needs to see the hotel
 * while they choose.
 *
 * It is a dialog to assistive technology and to the keyboard: it takes focus
 * when it opens, Escape closes it, and focus goes back where it came from.
 */
import { useEffect, useId, useRef } from 'react';
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
  const titleId = useId();
  const section = useRef<HTMLElement>(null);
  // Read through a ref so the effect runs once per open, not once per render:
  // callers pass inline arrows, and re-running it every simulation tick would
  // pull focus off whatever the player was touching inside the sheet.
  const close = useRef(onClose);
  close.current = onClose;

  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    section.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close.current(); };
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('keydown', onKey);
      previous?.focus?.();
    };
  }, []);

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
      <section
        ref={section}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="max-h-[68%] overflow-hidden rounded-t-2xl border-t border-white/10 bg-midnight-900 shadow-2xl outline-none"
      >
        <header className="flex items-baseline gap-3 border-b border-white/5 px-4 py-3">
          <h2 id={titleId} className="text-base font-semibold text-white">{title}</h2>
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
  title, meta, detail, price, currency, label, blockerLabel, onPick, locale = 'en',
}: {
  title: string;
  /** One line explaining what this is for. */
  meta?: string;
  /** Dimensions, rates — the numbers, kept smaller than the explanation. */
  detail?: string;
  price?: number;
  currency?: 'coins' | 'gems';
  /** Shown in the price's place when there is no price to show ("Owned ×2 · Free"). */
  label?: string;
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
      ) : label ? (
        <span className="shrink-0 text-[11px] text-emerald-300">{label}</span>
      ) : price !== undefined ? (
        <span className={`shrink-0 font-mono text-sm tabular-nums ${currency === 'gems' ? 'text-water-hi' : 'text-brass-400'}`}>
          {formatCoins(locale, price)}
        </span>
      ) : null}
    </button>
  );
}
