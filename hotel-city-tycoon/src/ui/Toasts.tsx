/**
 * Toasts.
 *
 * They sit under the top bar rather than over it, because the coin count is
 * the number a player is watching when something good happens and covering it
 * defeats the notification.
 */
import { useEffect } from 'react';
import type { Notice } from '../bridge/notifications.ts';
import { translate } from '../i18n/index.ts';
import type { Locale } from '../i18n/index.ts';

const TONE_STYLE = {
  good: 'border-emerald-500/30 bg-emerald-950/80 text-emerald-100',
  bad: 'border-amber-500/30 bg-amber-950/80 text-amber-100',
  neutral: 'border-white/10 bg-midnight-800/92 text-sand-200',
} as const;

/**
 * A mark per tone, so a toast is not green-versus-amber and nothing else.
 *
 * Good news and bad news arrive in the same place, in the same shape, for the
 * same couple of seconds; hue was the only thing separating them, which
 * ART-0 §7 rules out and red-green colourblindness defeats outright.
 */
const TONE_MARK = {
  good: '✓',
  bad: '!',
  neutral: '·',
} as const;

export function Toasts({
  notices, locale, onExpire,
}: {
  notices: Notice[];
  locale: Locale;
  onExpire: (id: string) => void;
}) {
  useEffect(() => {
    if (notices.length === 0) return;
    // Urgent things linger; a coin payout does not need six seconds.
    const timers = notices.map((notice) =>
      setTimeout(() => onExpire(notice.id), notice.priority >= 80 ? 5200 : 2800),
    );
    return () => timers.forEach(clearTimeout);
  }, [notices, onExpire]);

  if (notices.length === 0) return null;

  return (
    <div className="pointer-events-none absolute inset-x-0 top-20 z-20 flex flex-col items-center gap-1.5 px-3">
      {notices.map((notice) => (
        <div
          key={notice.id}
          className={`w-full max-w-sm rounded-xl border px-4 py-2.5 text-sm shadow-lg backdrop-blur ${TONE_STYLE[notice.tone]}`}
        >
          <span aria-hidden="true" className="me-2 font-bold">{TONE_MARK[notice.tone]}</span>
          {translate(locale, notice.titleKey, notice.values)}
          {notice.count > 1 && <span className="ms-2 opacity-60">×{notice.count}</span>}
        </div>
      ))}
    </div>
  );
}
