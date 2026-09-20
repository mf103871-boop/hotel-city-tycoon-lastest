/**
 * Drawing, in the project's own visual language.
 *
 * The palette is lifted verbatim from `tools/art/hcstyle.py`, so the prototype
 * argues about technique and not about taste: same colours, same chibi
 * proportions, same dark ink line as ART-0 / DEC-008 require. What changes is
 * that every shape here is drawn live each frame, which is what lets a room be
 * lit from inside it and a character be posed rather than picked from a strip.
 */
import type { Pose } from './rig.ts';
import { clamp } from './rig.ts';

/** `tools/art/hcstyle.py` — the single source of colour for the whole game. */
export const C = {
  sky: '#6FBCF9', skyHi: '#8FD0FB',
  roomBlue: '#4F8EE7', roomBlueDk: '#4784D6',
  mint: '#B4E7C3', mintDk: '#A5DBB7',
  cream: '#FBD991', creamHi: '#FDE4B0',
  lavender: '#A7A1D3', coral: '#ED5C47',
  warmWhite: '#DDE2DF', ink: '#031130', ink2: '#132A50',
  wallSky: '#BFE0FA', wallMint: '#C6EBD2', wallCream: '#FBE7B8',
  wallPeach: '#FBD3B0', wallRose: '#F7C3CE', wallLilac: '#C9C2EC',
  wallSand: '#EFE0C2', wallSlate: '#8FA8C8', wallNavy: '#2E4C86',
  wallTeal: '#9FDCD8', wallGrape: '#7B6BB5', wallRed: '#E7644F',
  wood: '#D9954E', woodDk: '#B87334', woodPale: '#EAC084',
  tile: '#DCE7EF',
} as const;

/** Wall colour per room, following the same room→wall mapping as the art tool. */
export const WALL_FOR: Record<string, string> = {
  lobby: C.wallCream, housekeeping: C.wallSky, laundry: C.wallSky,
  staffRoom: C.wallMint, maintenance: C.wallSlate, business: C.wallLilac,
  economy: C.wallMint, standard: C.wallCream, double: C.wallLilac,
  family: C.wallPeach, deluxe: C.wallSand, executive: C.wallSand,
  honeymoon: C.wallRose, luxurySuite: C.wallSand, presidential: C.wallSand,
  cafe: C.wallCream, gym: C.wallSky, restaurant: C.wallRed, bar: C.wallNavy,
  arcade: C.wallGrape, cinema: C.wallNavy, spa: C.wallMint, pool: C.wallTeal,
};

export const SKIN = ['#F6C9A0', '#E0A87A', '#C2855C', '#8D5A3B', '#FAD9BC'];
export const SHIRT = [C.coral, C.roomBlue, C.lavender, '#3FAE8C', '#E8A13C', '#D46BA0'];
export const HAIR = ['#2B2130', '#5A3A25', '#1B1B22', '#8A5A2B', '#C8752F', '#3B2E4A'];

export type Ctx = CanvasRenderingContext2D;

export const rr = (ctx: Ctx, x: number, y: number, w: number, h: number, r: number) => {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, r);
};

/**
 * One posed character.
 *
 * Limbs are strokes with round caps rather than filled outlines: at chibi size
 * a stroked bone reads cleaner than a polygon, and it costs one path per limb
 * instead of a tessellation per frame.
 */
export function drawCharacter(
  ctx: Ctx, p: Pose, look: { skin: string; shirt: string; hair: string; hasBag: boolean },
  opts: { shut: boolean; scale: number; ink: string; tint?: number },
) {
  const s = opts.scale;
  ctx.save();
  ctx.scale(s, s * p.squash);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';

  const ink = opts.ink;
  const f = p.facing;

  // ---- legs (behind the torso) --------------------------------------
  ctx.strokeStyle = ink;
  ctx.lineWidth = 5.4;
  limb(ctx, p.hip, p.kneeR, p.footR);
  limb(ctx, p.hip, p.kneeL, p.footL);
  ctx.strokeStyle = '#3C4A63';
  ctx.lineWidth = 3.6;
  limb(ctx, p.hip, p.kneeR, p.footR);
  ctx.strokeStyle = '#4A5B78';
  limb(ctx, p.hip, p.kneeL, p.footL);

  // shoes
  for (const ft of [p.footR, p.footL]) {
    ctx.fillStyle = ink;
    rr(ctx, ft.x - 2.6 + f * 0.8, ft.y - 1.6, 5.4, 3.0, 1.4);
    ctx.fill();
  }

  // ---- back arm ------------------------------------------------------
  const backArm = f > 0 ? [p.shoulderL, p.elbowL, p.handL] as const : [p.shoulderR, p.elbowR, p.handR] as const;
  const frontArm = f > 0 ? [p.shoulderR, p.elbowR, p.handR] as const : [p.shoulderL, p.elbowL, p.handL] as const;

  ctx.strokeStyle = ink; ctx.lineWidth = 4.8;
  limb(ctx, ...backArm);
  ctx.strokeStyle = shade(look.shirt, -0.18); ctx.lineWidth = 3.1;
  limb(ctx, ...backArm);

  // ---- torso ---------------------------------------------------------
  ctx.beginPath();
  ctx.moveTo(p.hip.x, p.hip.y);
  ctx.lineTo(p.neck.x, p.neck.y);
  ctx.strokeStyle = ink; ctx.lineWidth = 13.4; ctx.stroke();
  ctx.strokeStyle = look.shirt; ctx.lineWidth = 10.4; ctx.stroke();
  // a lighter panel down the front reads as a shirt rather than a tube
  ctx.beginPath();
  ctx.moveTo(p.hip.x + f * 1.6, p.hip.y - 1);
  ctx.lineTo(p.neck.x + f * 1.6, p.neck.y + 1.5);
  ctx.strokeStyle = shade(look.shirt, 0.16); ctx.lineWidth = 3.6; ctx.stroke();

  // ---- front arm ------------------------------------------------------
  ctx.strokeStyle = ink; ctx.lineWidth = 4.8;
  limb(ctx, ...frontArm);
  ctx.strokeStyle = look.shirt; ctx.lineWidth = 3.1;
  limb(ctx, ...frontArm);
  // hand
  ctx.fillStyle = look.skin;
  ctx.strokeStyle = ink; ctx.lineWidth = 1.1;
  circle(ctx, frontArm[2].x, frontArm[2].y, 1.9); ctx.fill(); ctx.stroke();

  // ---- suitcase, carried by the front hand ---------------------------
  if (look.hasBag) {
    const h = frontArm[2];
    ctx.save();
    ctx.translate(h.x, h.y + 1.4);
    ctx.rotate(Math.sin(p.hip.x * 0.4) * 0.06);
    ctx.fillStyle = C.wood; ctx.strokeStyle = ink; ctx.lineWidth = 1.3;
    rr(ctx, -3.4, 0, 6.8, 5.6, 1.2); ctx.fill(); ctx.stroke();
    ctx.strokeStyle = shade(C.wood, -0.3); ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(-3.4, 2.2); ctx.lineTo(3.4, 2.2); ctx.stroke();
    ctx.restore();
  }

  // ---- head -----------------------------------------------------------
  ctx.save();
  ctx.translate(p.head.x, p.head.y);
  ctx.rotate(p.headTilt);

  ctx.fillStyle = look.skin; ctx.strokeStyle = ink; ctx.lineWidth = 1.7;
  circle(ctx, 0, 0, 9.2); ctx.fill(); ctx.stroke();

  // hair: a cap clipped to the skull, plus a tuft that reads at small size
  ctx.save();
  circle(ctx, 0, 0, 9.2); ctx.clip();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.ellipse(0, -3.6, 9.6, 7.4, 0, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
  ctx.fillStyle = look.hair;
  ctx.beginPath();
  ctx.ellipse(-f * 5.2, -6.6, 3.2, 2.4, -f * 0.5, 0, Math.PI * 2);
  ctx.fill();

  // eyes
  const ex = f * 2.0;
  ctx.fillStyle = ink;
  if (opts.shut) {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.2; ctx.lineCap = 'round';
    for (const dx of [-2.6, 2.6]) {
      ctx.beginPath();
      ctx.moveTo(ex + dx - 1.2, 1.2); ctx.quadraticCurveTo(ex + dx, 2.2, ex + dx + 1.2, 1.2);
      ctx.stroke();
    }
  } else {
    for (const dx of [-2.6, 2.6]) {
      circle(ctx, ex + dx, 1.0, 1.55); ctx.fill();
      ctx.fillStyle = '#FFFFFF';
      circle(ctx, ex + dx + 0.55, 0.4, 0.55); ctx.fill();
      ctx.fillStyle = ink;
    }
  }
  // cheeks
  ctx.fillStyle = 'rgba(237,92,71,0.32)';
  circle(ctx, ex - 5.0, 3.4, 1.7); ctx.fill();
  circle(ctx, ex + 5.0, 3.4, 1.7); ctx.fill();
  ctx.restore();

  ctx.restore();
}

function limb(ctx: Ctx, a: { x: number; y: number }, b: { x: number; y: number }, c: { x: number; y: number }) {
  ctx.beginPath();
  ctx.moveTo(a.x, a.y);
  ctx.lineTo(b.x, b.y);
  ctx.lineTo(c.x, c.y);
  ctx.stroke();
}

export const circle = (ctx: Ctx, x: number, y: number, r: number) => {
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
};

/**
 * Lighten (t>0) or darken (t<0) a #rrggbb by a fraction.
 *
 * Returns hex, not `rgb()`. It matters: the night blend parses its inputs as
 * hex, so a shaded colour handed back in functional notation came out NaN and
 * painted the room black.
 */
export function shade(hex: string, t: number): string {
  const n = parseInt(hex.slice(1), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  const m = (v: number) => clamp(Math.round(t > 0 ? v + (255 - v) * t : v * (1 + t)), 0, 255);
  return `#${((1 << 24) | (m(r) << 16) | (m(g) << 8) | m(b)).toString(16).slice(1)}`;
}

export function rgba(hex: string, a: number): string {
  const n = parseInt(hex.slice(1), 16);
  return `rgba(${(n >> 16) & 255},${(n >> 8) & 255},${n & 255},${a})`;
}
