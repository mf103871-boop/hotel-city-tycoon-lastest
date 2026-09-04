/**
 * A number pair that keeps its own order inside Arabic.
 *
 * `140 → 56` in an RTL paragraph is not `140 → 56`. The Unicode bidi
 * algorithm treats each number as a right-to-left run and the arrow between
 * them as a neutral that joins them, so the whole group is laid out
 * right-to-left and the browser paints `56 → 140`. Measured in Chromium, not
 * reasoned about: every one of these reverses.
 *
 *     logical            Arabic renders
 *     140 → 56           56 → 140          a discount reads as a price rise
 *     ×1.36 → ×1.52      1.52× → 1.36×     an upgrade reads as a downgrade
 *     2×1                1×2               a room's width and height swap
 *
 * `<bdi dir="ltr">` isolates the run, so the pair is placed as one unit in the
 * Arabic flow and reads correctly inside a sentence in either language.
 *
 * This is for ordered pairs only. A single number needs nothing — digits are
 * already laid out left-to-right on their own — and wrapping ordinary
 * localised text would be wrong.
 */
export function Pair({ children }: { children: React.ReactNode }) {
  return <bdi dir="ltr">{children}</bdi>;
}
