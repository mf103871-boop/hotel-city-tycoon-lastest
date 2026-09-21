/**
 * The lighting maths (DEC-018).
 *
 * Everything outside the rooms — sky, city, street, the hotel's frame, the
 * people on the pavement — follows a continuous night amount; everything
 * inside them keeps following the closed/open boolean, exactly as before. The
 * amount is quantised to `DUSK_STEPS` before any view sees it, so a two-hour
 * dusk is at most twenty-five redraws and the Canvas2D lane's tint cache
 * stays bounded (it keys a tinted copy per colour string).
 *
 * Every night colour is still `nightfall()` of its day colour, and the ramp
 * ends are the two pictures the game already drew, so the parity checks in
 * tools/selftest/render.ts hold by construction rather than by a second
 * table of numbers.
 *
 * Pure: no Pixi, no DOM, no classes, so it loads under node strip-types.
 */
import { nightfall } from './backdrop.ts';

/** How many distinct nights there are between noon and midnight. */
export const DUSK_STEPS = 24;

/** A night amount in 0..1, quantised to 0..DUSK_STEPS. Anything unfinite is day, never NaN. */
export function quantiseDusk(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.round(Math.min(1, Math.max(0, n)) * DUSK_STEPS);
}

/** Per-channel blend of two 0xRRGGBB colours; `t` is clamped to [0, 1]. */
export function lerpTint(day: number, night: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const band = (shift: number): number => {
    const a = (day >> shift) & 0xff;
    const b = (night >> shift) & 0xff;
    return Math.round(a + (b - a) * k);
  };
  return (band(16) << 16) | (band(8) << 8) | band(0);
}

/** A day colour at this many steps of dusk: the day at 0, `nightfall()` at 24. */
export function duskTint(day: number, dusk: number): number {
  return lerpTint(day, nightfall(day), dusk / DUSK_STEPS);
}

/** How strongly a lit room's pool glows at full night. */
export const POOL_ALPHA_OPEN = 0.55;
/** The lobby keeps a low light while the hotel is shut: somebody minds the desk. */
export const POOL_ALPHA_CLOSED_LOBBY = 0.35;

/**
 * The alpha of a room's light pool.
 *
 * Nothing for an empty room that is not the lobby; the closed-lobby constant
 * while the hotel is shut; otherwise the open strength scaled by how dark it
 * is outside, so pools fade in with the dusk rather than switching on.
 */
export function poolAlpha(dusk: number, lit: boolean, lobby: boolean, closed: boolean): number {
  if (!lit && !lobby) return 0;
  if (lobby && closed) return POOL_ALPHA_CLOSED_LOBBY;
  return POOL_ALPHA_OPEN * Math.min(1, Math.max(0, dusk / DUSK_STEPS));
}

/** Stars appear once the sky is more than a third of the way to night, and never fully opaque. */
export function starAlpha(dusk: number): number {
  return Math.max(0, dusk / DUSK_STEPS - 0.35) / 0.65 * 0.9;
}
