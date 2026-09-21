/**
 * A person as fixed Pixi parts on the joints the rig computes.
 *
 * HC-P2-S3 (DEC-020, owner: «هيكل حي»). Every shape hcstyle's `draw_person`
 * paints into a sheet cell is here as one Graphics whose geometry is drawn
 * ONCE into a GraphicsContext shared by everybody of the same size, and then
 * only moved: position, rotation, scale and alpha, never a redraw. Fills are
 * white and outlines are ink, so a part's `tint` is its colour — skin, hair,
 * a uniform, a night wash — and the ink under it stays ink. Expressions,
 * eyes, mouths and both tool sets are always-present parts switched by
 * alpha; lying down is the one `visible` toggle, at snapshot rate.
 *
 * Why it is built this way (facts read in node_modules/pixi.js, 8.20.1 and
 * 8.21.0 alike):
 * - Graphics.mjs:33-43 — assigning `context` calls onViewUpdate, which walks
 *   validateRenderables and sets `structureDidChange` on the world's render
 *   group: a rebuild of every instruction in the scene. So contexts are
 *   assigned only when the look key changes, and only when they differ.
 * - Container.mjs:1060-1110 — `visible`/`renderable` flips do the same, so a
 *   face changes by alpha (UPDATE_COLOR only).
 * - updateRenderGroupTransforms.mjs:80-89 → GraphicsPipe.updateRenderable →
 *   Batcher.updateElement re-packs every vertex of a part whose transform
 *   changed. Pixi's own circle tessellation (buildCircle.mjs:48-49) would put
 *   ≈ 3 K vertices on a person; every shape here is an explicit `poly()`
 *   point list with a fixed segment count (≈ 1.2 K vertices a person), and a
 *   standing person whose pose is on the clip's frame grid moves nothing on
 *   most frames because Pixi's setters are equality-guarded.
 * - GraphicsContextSystem.mjs:103-109 — `batchMode: 'auto'` drops any shape
 *   over 400 vertex floats out of the batcher; `'batch'` keeps every part in
 *   the default batch beside the decor sprites (all use the white texture).
 * - No RenderTexture, no cacheAsTexture, no filter, no mask (DEC-019): the
 *   Canvas2D lane redraws each part as a path, tinted through
 *   CanvasGraphicsAdaptor's group tint, exactly as WebGL multiplies colours.
 *
 * Coordinates are rig px: the sheets' 48×72 frame at scale 1, origin at the
 * feet, −y up; `setLook` scales the whole container by CHARACTER_ART_SCALE
 * and `setFacing` mirrors it, as the sheet sprite is flipped today. Every
 * number is hcstyle.py's, cited at the shape.
 */
import { Container, Graphics, GraphicsContext } from 'pixi.js';
import { PALETTE, shade, lighten } from './anim/cast.ts';
import type { Look, HairStyle, CapStyle, Prop } from './anim/cast.ts';
import type { Pose, Pt, RigProportions } from './anim/rig.ts';

const WHITE = 0xffffff;
const INK = PALETTE.ink;

// hcstyle.py:190-193 — the outline weights, in rig px.
const LW_PROP = 1.4;
const LW_DETAIL = 1.0;
const LW_FACE = 0.9;

/** Polygon segment counts: fixed so a person's vertex count is fixed (chord error ≤ 0.3 device px at 2× zoom). */
const SEG = {
  skull: 32, hand: 10, highlight: 6, curl: 12, eye: 10, blush: 8, fringe: 16, shadow: 16,
  capsule: 5, rrect: 4, shoe: 3, tab: 3, faceArc: 8, hairArc: 16, pie: 18, small: 8, bump: 10,
} as const;

/** The sleeper's radius (hcstyle.py:1093): never depended on the person's height. */
const SLEEP_HEAD_R = 11.4;
/** hcstyle.py:1101 — the sleeper's head sits 9.5 left of the pivot and 4 above the quilt. */
const SLEEP_HX = -9.5;
const SLEEP_CY = -4;
/** The quilt's rest height and the bed's rest top (hcstyle.py:1096-1098 with FOOT_Y = 0). */
const QUILT_H = 15;
const QUILT_TOP = -16;

// ---------------------------------------------------------------- point lists
const DEG = Math.PI / 180;

function circlePts(cx: number, cy: number, r: number, n: number): number[] {
  return ellipsePts(cx, cy, r, r, n);
}

function ellipsePts(cx: number, cy: number, rx: number, ry: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i < n; i++) {
    const a = (i / n) * Math.PI * 2;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

/** An open arc from `a0` to `a1` degrees, PIL's convention: clockwise from +x with y down — Pixi's too. */
function arcPts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= n; i++) {
    const a = (a0 + ((a1 - a0) * i) / n) * DEG;
    out.push(cx + Math.cos(a) * rx, cy + Math.sin(a) * ry);
  }
  return out;
}

function piePts(cx: number, cy: number, rx: number, ry: number, a0: number, a1: number, n: number): number[] {
  return [cx, cy, ...arcPts(cx, cy, rx, ry, a0, a1, n)];
}

function rectPts(x: number, y: number, w: number, h: number): number[] {
  return [x, y, x + w, y, x + w, y + h, x, y + h];
}

function rrectPts(x: number, y: number, w: number, h: number, r: number, segs: number): number[] {
  const rr = Math.min(r, w / 2, h / 2);
  const out: number[] = [];
  const corner = (cx: number, cy: number, a0: number): void => {
    for (let i = 0; i <= segs; i++) {
      const a = (a0 + (90 * i) / segs) * DEG;
      out.push(cx + Math.cos(a) * rr, cy + Math.sin(a) * rr);
    }
  };
  corner(x + w - rr, y + rr, 270);
  corner(x + w - rr, y + h - rr, 0);
  corner(x + rr, y + h - rr, 90);
  corner(x + rr, y + rr, 180);
  return out;
}

/** A horizontal capsule from (0, 0) to (len, 0): a bone, rotated onto its joints. */
function capsulePts(len: number, halfW: number, segs: number): number[] {
  const out: number[] = [];
  for (let i = 0; i <= segs; i++) {
    const a = (-90 + (180 * i) / segs) * DEG;
    out.push(len + Math.cos(a) * halfW, Math.sin(a) * halfW);
  }
  for (let i = 0; i <= segs; i++) {
    const a = (90 + (180 * i) / segs) * DEG;
    out.push(Math.cos(a) * halfW, Math.sin(a) * halfW);
  }
  return out;
}

// ---------------------------------------------------------------- drawing into a context
const strokeOf = (width: number, color: number) => ({ width, color, cap: 'round' as const, join: 'round' as const });

/** hcstyle's `fill=colour, ink=P["ink"], lw`: a white fill the tint colours, under an ink line. */
function inked(g: GraphicsContext, pts: number[], lw: number): void {
  g.poly(pts, true).fill(WHITE).stroke(strokeOf(lw, INK));
}

/** An unstroked fill, in the tint's colour (or a fixed one: the eyes' ink and white). */
function filled(g: GraphicsContext, pts: number[], color = WHITE): void {
  g.poly(pts, true).fill(color);
}

/** An open polyline, in the tint's colour unless it is ink. */
function line(g: GraphicsContext, pts: number[], lw: number, color = WHITE): void {
  g.poly(pts, false).stroke(strokeOf(lw, color));
}

// ---------------------------------------------------------------- the shared contexts
const SHARED = new Map<string, GraphicsContext>();

/**
 * The one place a GraphicsContext is made. Everybody with the same key shares
 * the geometry, so it is tessellated once for the scene (GraphicsContextSystem
 * keeps one gpuContext per context, not per Graphics).
 */
function contextFor(key: string, draw: (g: GraphicsContext) => void): GraphicsContext {
  let ctx = SHARED.get(key);
  if (!ctx) {
    ctx = new GraphicsContext();
    ctx.batchMode = 'batch';
    draw(ctx);
    SHARED.set(key, ctx);
  }
  return ctx;
}

const EMPTY = contextFor('empty', () => { /* a part this look does not have */ });

// Legs: hcstyle.py:808-809 draws an ink line 4.6 wide under a colour line 3.2
// wide, both with round caps. A capsule 3.9 wide with a centred 0.7 ink
// outline is that picture exactly: 4.6 outside, 3.2 of colour inside. Arms
// (860-861): 4.0 under 2.8 → 3.4 wide with a 0.6 line.
const LEG_HALF = (3.2 + 0.7) / 2;
const LEG_LW = 0.7;
const ARM_HALF = (2.8 + 0.6) / 2;
const ARM_LW = 0.6;
/** hcstyle's leg line ends at the ankle, 1.8 above the floor (810); the shin stops there so its cap sits inside the shoe. */
const ANKLE = 1.8;

const k = (n: number): string => n.toFixed(2);

function thighCtx(len: number): GraphicsContext {
  return contextFor(`thigh:${k(len)}`, (g) => inked(g, capsulePts(len, LEG_HALF, SEG.capsule), LEG_LW));
}
function shinCtx(len: number): GraphicsContext {
  return contextFor(`shin:${k(len)}`, (g) => inked(g, capsulePts(Math.max(0.5, len - ANKLE), LEG_HALF, SEG.capsule), LEG_LW));
}
function armCtx(len: number): GraphicsContext {
  return contextFor(`arm:${k(len)}`, (g) => inked(g, capsulePts(len, ARM_HALF, SEG.capsule), ARM_LW));
}
/** hcstyle.py:810 — the shoe around an ankle 1.8 above the foot joint: y from −2.4 to +0.4 about the contact. */
const SHOE = contextFor('shoe', (g) => inked(g, rrectPts(-2.4, -ANKLE - 0.6, 4.8, 2.8, 1.3, SEG.shoe), LW_FACE));
/** hcstyle.py:862. */
const HAND = contextFor('hand', (g) => inked(g, circlePts(0, 0, 1.9, SEG.hand), LW_FACE));
/** hcstyle.py:812-814; the origin is the top centre, at the neck. */
function torsoCtx(s: number, h: number): GraphicsContext {
  return contextFor(`torso:${k(s)}x${k(h)}`, (g) => inked(g, rrectPts(-s / 2, 0, s, h, s * 0.30, SEG.rrect), LW_PROP));
}
/** hcstyle.py:825-826 — the collar, in the accent colour. */
function collarCtx(s: number): GraphicsContext {
  return contextFor(`collar:${k(s)}`, (g) => line(g, [-s * 0.24, 1.4, 0, 3.2, s * 0.24, 1.4], LW_DETAIL));
}
/** hcstyle.py:816-822 — the apron and its two ink straps. */
function apronCtx(s: number, h: number): GraphicsContext {
  return contextFor(`apron:${k(s)}x${k(h)}`, (g) => {
    inked(g, rrectPts(-s * 0.32, h * 0.24, s * 0.64, h * 0.86, 1.4, SEG.rrect), LW_DETAIL);
    line(g, [-s * 0.22, h * 0.24, -s * 0.30, 0.8], LW_FACE, INK);
    line(g, [s * 0.22, h * 0.24, s * 0.30, 0.8], LW_FACE, INK);
  });
}
/** hcstyle.py:866. */
function skullCtx(r: number): GraphicsContext {
  return contextFor(`skull:${k(r)}`, (g) => inked(g, circlePts(0, 0, r, SEG.skull), LW_PROP));
}
/** hcstyle.py:878-892. */
function hairBackCtx(style: HairStyle, r: number): GraphicsContext {
  switch (style) {
    case 'long':
      return contextFor(`hairBack:long:${k(r)}`, (g) =>
        inked(g, rrectPts(-r * 1.02, -r * 0.55, r * 2.04, r * 2.05, r * 0.62, SEG.rrect), LW_FACE));
    case 'bun':
      return contextFor(`hairBack:bun:${k(r)}`, (g) => inked(g, circlePts(0, -r * 1.06, r * 0.44, SEG.curl), LW_FACE));
    case 'pigtails':
      return contextFor(`hairBack:pigtails:${k(r)}`, (g) => {
        for (const side of [-1, 1]) inked(g, circlePts(side * r * 1.06, r * 0.12, r * 0.42, SEG.curl), LW_FACE);
      });
    case 'ponytail':
      return contextFor(`hairBack:ponytail:${k(r)}`, (g) =>
        inked(g, rrectPts(r * 0.72, -r * 0.30, r * 0.62, r * 1.50, r * 0.31, SEG.rrect), LW_FACE));
    default:
      return EMPTY;
  }
}
/**
 * hcstyle.py:895-938 — the crown, the style's own tabs, curls or tufts, and
 * the fringe, in the hair colour; the ink arc over the crown. `plain` is the
 * sleeper's head (1102-1105): crown and fringe only.
 */
function hairCapCtx(style: HairStyle | 'plain', r: number): GraphicsContext {
  return contextFor(`hairCap:${style}:${k(r)}`, (g) => {
    if (style === 'bald') {
      for (const side of [-1, 1]) filled(g, ellipsePts(side * r * 0.80, -r * 0.16, r * 0.26, r * 0.40, SEG.bump));
      line(g, arcPts(0, 0, r, r, 180, 360, SEG.hairArc), LW_FACE, INK);
      return;
    }
    filled(g, piePts(0, 0, r, r, 180, 360, SEG.pie));
    const fringeY = -r * 0.16;
    if (style === 'curly') {
      const curls: Array<[number, number, number]> = [
        [-0.78, -0.42, 0.40], [-0.40, -0.70, 0.42], [0.0, -0.80, 0.42], [0.40, -0.70, 0.42], [0.78, -0.42, 0.40],
      ];
      for (const [dx, dy, rr] of curls) filled(g, circlePts(dx * r, dy * r, rr * r, SEG.curl));
    } else if (style === 'spiky') {
      const tufts: Array<[number, number]> = [[-0.52, 0.68], [0.0, 0.78], [0.52, 0.68]];
      for (const [dx, lift] of tufts) filled(g, ellipsePts(dx * r, -r * lift * 0.72, r * 0.30, r * 0.36, SEG.bump));
    } else if (style === 'short' || style === 'bun' || style === 'ponytail') {
      for (const side of [-1, 1]) {
        filled(g, rrectPts(side * r * 0.98 - (side > 0 ? r * 0.30 : 0), -r * 0.34, r * 0.30, r * 0.62, r * 0.14, SEG.tab));
      }
    } else if (style === 'long' || style === 'pigtails') {
      for (const side of [-1, 1]) {
        filled(g, rrectPts(side * r * 1.0 - (side > 0 ? r * 0.34 : 0), -r * 0.36, r * 0.34, r * 0.86, r * 0.16, SEG.tab));
      }
    }
    filled(g, ellipsePts(0, fringeY, r * 0.99, r * 0.40, SEG.fringe));
    line(g, arcPts(0, 0, r, r, 180, 360, SEG.hairArc), LW_FACE, INK);
  });
}
/** hcstyle.py:936 — the skin showing under the fringe's dip. */
function fringeSkinCtx(r: number): GraphicsContext {
  return contextFor(`fringeSkin:${k(r)}`, (g) => filled(g, ellipsePts(0, -r * 0.02, r * 0.62, r * 0.26, SEG.fringe)));
}
/** hcstyle.py:941-974 — the hat's crown, in the cap colour. */
function capBaseCtx(style: CapStyle, r: number): GraphicsContext {
  return contextFor(`capBase:${style}:${k(r)}`, (g) => {
    switch (style) {
      case 'toque':
        inked(g, rrectPts(-r * 0.74, -r * 1.42, r * 1.48, r * 0.94, r * 0.40, SEG.rrect), LW_FACE);
        break;
      case 'pillbox':
        inked(g, rrectPts(-r * 0.66, -r * 1.22, r * 1.32, r * 0.66, r * 0.18, SEG.rrect), LW_FACE);
        break;
      case 'peaked':
        filled(g, piePts(0, -r * 0.22, r * 0.88, r * 0.88, 182, 358, SEG.pie));
        line(g, arcPts(0, -r * 0.22, r * 0.88, r * 0.88, 182, 358, SEG.hairArc), LW_FACE, INK);
        break;
      default:
        filled(g, piePts(0, -r * 0.16, r * 0.92, r * 0.92, 182, 358, SEG.pie));
        line(g, arcPts(0, -r * 0.16, r * 0.92, r * 0.92, 182, 358, SEG.hairArc), LW_FACE, INK);
    }
  });
}
/** The hat's band or brim; the pillbox's and the peaked cap's are a shade darker (tinted so by setLook). */
function capBandCtx(style: CapStyle, r: number): GraphicsContext {
  return contextFor(`capBand:${style}:${k(r)}`, (g) => {
    switch (style) {
      case 'toque': inked(g, rrectPts(-r * 0.86, -r * 0.68, r * 1.72, r * 0.36, r * 0.16, SEG.rrect), LW_FACE); break;
      case 'pillbox': inked(g, rrectPts(-r * 0.80, -r * 0.66, r * 1.60, r * 0.28, r * 0.12, SEG.rrect), LW_FACE); break;
      case 'peaked': inked(g, rrectPts(-r * 1.06, -r * 0.52, r * 2.12, r * 0.30, r * 0.14, SEG.rrect), LW_FACE); break;
      default: inked(g, rrectPts(-r * 0.94, -r * 0.44, r * 1.88, r * 0.30, r * 0.14, SEG.rrect), LW_FACE);
    }
  });
}
// hcstyle.py:977-1021 — two eyes, a mouth, two spots of blush, nothing else.
// The eyes and mouths are ink and white as drawn; their tint is the light.
function eyesOpenCtx(r: number): GraphicsContext {
  return contextFor(`eyesOpen:${k(r)}`, (g) => {
    const ex = r * 0.36; const ey = r * 0.14;
    for (const side of [-1, 1]) filled(g, ellipsePts(side * ex, ey, r * 0.135, r * 0.175, SEG.eye), INK);
    for (const side of [-1, 1]) filled(g, circlePts(side * ex - r * 0.05, ey - r * 0.055, r * 0.05, SEG.highlight), WHITE);
  });
}
function eyesShutCtx(r: number): GraphicsContext {
  return contextFor(`eyesShut:${k(r)}`, (g) => {
    const ex = r * 0.36; const ey = r * 0.14;
    for (const side of [-1, 1]) line(g, arcPts(side * ex, ey + r * 0.04, r * 0.19, r * 0.16, 190, 350, SEG.faceArc), LW_FACE, INK);
  });
}
function eyesScaredCtx(r: number): GraphicsContext {
  return contextFor(`eyesScared:${k(r)}`, (g) => {
    const ex = r * 0.36; const ey = r * 0.14;
    for (const side of [-1, 1]) filled(g, ellipsePts(side * ex, ey, r * 0.17, r * 0.23, SEG.eye), INK);
    for (const side of [-1, 1]) filled(g, circlePts(side * ex - r * 0.05, ey - r * 0.08, r * 0.06, SEG.highlight), WHITE);
    for (const side of [-1, 1]) line(g, arcPts(side * ex, ey - r * 0.30, r * 0.20, r * 0.14, 200, 340, SEG.faceArc), LW_FACE, INK);
  });
}
function blushCtx(r: number): GraphicsContext {
  return contextFor(`blush:${k(r)}`, (g) => {
    const ex = r * 0.36; const ey = r * 0.14;
    for (const side of [-1, 1]) filled(g, ellipsePts(side * ex * 1.72, ey + r * 0.30, r * 0.17, r * 0.105, SEG.blush));
  });
}
export type Mouth = 'smile' | 'happy' | 'cross' | 'sleep' | 'scared';
const MOUTHS: readonly Mouth[] = ['smile', 'happy', 'cross', 'sleep', 'scared'];
function mouthCtx(expr: Mouth, r: number): GraphicsContext {
  return contextFor(`mouth:${expr}:${k(r)}`, (g) => {
    const my = r * 0.46;
    switch (expr) {
      case 'scared': filled(g, ellipsePts(0, my, r * 0.13, r * 0.15, SEG.small), INK); break;
      case 'happy': filled(g, piePts(0, my - r * 0.10, r * 0.17, r * 0.19, 8, 172, SEG.faceArc), INK); break;
      case 'sleep': filled(g, ellipsePts(0, my, r * 0.11, r * 0.09, SEG.small), INK); break;
      case 'cross': line(g, arcPts(0, my + r * 0.16, r * 0.22, r * 0.20, 200, 340, SEG.faceArc), LW_FACE, INK); break;
      default: line(g, arcPts(0, my - r * 0.14, r * 0.21, r * 0.22, 15, 165, SEG.faceArc), LW_FACE, INK);
    }
  });
}

/**
 * hcstyle.py:1024-1064 — the tool that finishes a role, as up to three
 * parts of one colour each, about the hand.
 */
interface PropPart { colour: number; draw: (g: GraphicsContext) => void }
const PROPS: Readonly<Record<Prop, readonly PropPart[]>> = {
  tray: [
    { colour: PALETTE.metal, draw: (g) => inked(g, rrectPts(-5.0, -1.6, 10.0, 2.2, 1.0, SEG.tab), LW_FACE) },
    { colour: PALETTE.white, draw: (g) => inked(g, rrectPts(-2.4, -4.2, 4.0, 2.8, 1.0, SEG.tab), LW_FACE) },
    { colour: PALETTE.coral, draw: (g) => inked(g, circlePts(2.6, -2.8, 1.2, SEG.small), LW_FACE) },
  ],
  mop: [
    { colour: PALETTE.woodDk, draw: (g) => line(g, [0, -11.0, 0, 6.0], 1.6) },
    { colour: PALETTE.glassDk, draw: (g) => inked(g, rrectPts(-3.2, 4.6, 6.4, 3.6, 1.4, SEG.tab), LW_FACE) },
  ],
  clipboard: [
    { colour: PALETTE.woodPale, draw: (g) => inked(g, rrectPts(-3.0, -1.4, 6.0, 7.4, 1.0, SEG.tab), LW_FACE) },
    { colour: PALETTE.ink2, draw: (g) => { for (let i = 0; i < 3; i++) filled(g, rectPts(-1.8, 0.8 + i * 1.7, 3.6, 0.7)); } },
  ],
  dumbbell: [
    { colour: PALETTE.metalDk, draw: (g) => line(g, [-3.4, 0, 3.4, 0], 1.4) },
    { colour: PALETTE.ink2, draw: (g) => { for (const dx of [-4.8, 2.8]) inked(g, rrectPts(dx, -2.4, 2.2, 4.8, 0.9, SEG.tab), LW_FACE); } },
  ],
  cup: [
    {
      colour: PALETTE.white,
      draw: (g) => {
        inked(g, rrectPts(-2.0, -3.0, 4.0, 4.0, 1.0, SEG.tab), LW_FACE);
        line(g, arcPts(2.0, -1.4, 1.6, 1.4, 270, 450, SEG.faceArc), LW_FACE, INK);
      },
    },
    { colour: PALETTE.woodDk, draw: (g) => filled(g, rectPts(-1.2, -2.2, 2.4, 0.9)) },
  ],
  towel: [
    { colour: PALETTE.linen, draw: (g) => inked(g, rrectPts(-2.8, -1.4, 5.6, 6.0, 1.2, SEG.tab), LW_FACE) },
    { colour: PALETTE.glassDk, draw: (g) => line(g, [-1.8, 1.4, 1.8, 1.4], 0.8) },
  ],
  wrench: [
    { colour: PALETTE.metal, draw: (g) => line(g, [0, -1.2, 4.6, 3.6], 1.6) },
    { colour: PALETTE.metalDk, draw: (g) => g.poly(circlePts(5.2, 4.0, 1.6, SEG.hand), true).stroke(strokeOf(1.1, WHITE)) },
  ],
  whistle: [
    {
      colour: PALETTE.gold,
      draw: (g) => {
        line(g, [0, -3.0, 0, 1.0], 0.9);
        inked(g, rrectPts(-1.6, 0.6, 3.2, 2.2, 0.9, SEG.tab), LW_FACE);
      },
    },
  ],
  popcorn: [
    { colour: PALETTE.coral, draw: (g) => inked(g, rrectPts(-2.6, -1.0, 5.2, 5.4, 0.8, SEG.tab), LW_FACE) },
    {
      colour: PALETTE.creamHi,
      draw: (g) => {
        const kernels: Array<[number, number]> = [[-1.4, -1.6], [0.0, -2.2], [1.4, -1.6]];
        for (const [dx, dy] of kernels) inked(g, circlePts(dx, dy, 1.2, SEG.small), LW_FACE);
      },
    },
  ],
  suitcase: [
    {
      colour: PALETTE.woodDk,
      draw: (g) => {
        inked(g, rrectPts(-3.4, 0.4, 6.8, 5.2, 1.0, SEG.tab), LW_FACE);
        line(g, arcPts(0, 0.6, 1.8, 1.6, 180, 360, SEG.faceArc), LW_FACE, INK);
      },
    },
    { colour: PALETTE.gold, draw: (g) => line(g, [-3.4, 2.6, 3.4, 2.6], 0.8) },
  ],
};
const PROP_SLOTS = 3;
function propCtx(prop: Prop, i: number): GraphicsContext {
  const part = PROPS[prop][i];
  return part ? contextFor(`prop:${prop}:${i}`, part.draw) : EMPTY;
}

// hcstyle.py:1075-1120 — the sleeper, relative to the bed's top (quilt_top).
// Parts whose height breathes are drawn at their rest height from their own
// top edge, so apply() can scale them in y.
const SHADOW = contextFor('shadow', (g) => filled(g, ellipsePts(0, 0, 1, 1, SEG.shadow)));
const SLEEP_SHADOW = contextFor('sleepShadow', (g) => filled(g, ellipsePts(0, 0, 19.0, 2.8, SEG.shadow)));
const PILLOW = contextFor('pillow', (g) =>
  inked(g, rrectPts(SLEEP_HX - 10.4, SLEEP_CY - 8.4, 16.4, 13.4, 5.6, SEG.rrect), LW_DETAIL));
const HUMP = contextFor('hump', (g) => inked(g, ellipsePts(3.0, 1.0, 13.0, 5.0, SEG.fringe), LW_PROP));
const QUILT = contextFor('quilt', (g) => inked(g, rrectPts(0, 0, 29.0, QUILT_H, 4.6, SEG.rrect), LW_PROP));
const SHEET_FOLD = contextFor('sheetFold', (g) => inked(g, rrectPts(0, 0, 8.4, QUILT_H - 1.2, 3.4, SEG.rrect), LW_FACE));
const QUILT_FOLDS = contextFor('quiltFolds', (g) => {
  for (const dx of [15.0, 22.0]) line(g, [dx, 0, dx, QUILT_H - 6.8], LW_DETAIL);
});
const FOOT_TENT = contextFor('footTent', (g) => filled(g, ellipsePts(0, 0, 4.2, 3.0, SEG.bump)));
const ARM_ON_SHEET = contextFor('armOnSheet', (g) => inked(g, rrectPts(0, 0, 8.0, 3.6, 1.8, SEG.tab), LW_FACE));
function zCtx(s: number): GraphicsContext {
  return contextFor(`z:${k(s)}`, (g) =>
    line(g, [-2.2 * s, -2.2 * s, 2.2 * s, -2.2 * s, -2.2 * s, 2.2 * s, 2.2 * s, 2.2 * s], 1.2 * s));
}
/** Where the two Zs sit about the head (hcstyle.py:1114): offset from the pivot and from the head's centre. */
const Z_A = { x: 6.0, y: SLEEP_CY - 13.0, s: 1.0, driftScale: 1.0, alpha: 0.9 };
const Z_B = { x: 11.5, y: SLEEP_CY - 19.0, s: 0.72, driftScale: 1.4, alpha: 0.65 };

// ---------------------------------------------------------------- the rig
function part(): Graphics {
  return new Graphics({ context: EMPTY });
}

/** Assign a context only when it differs: the setter itself is guarded, but the intent is the file's contract. */
function assign(g: Graphics, ctx: GraphicsContext): void {
  if (g.context !== ctx) g.context = ctx;
}

/** Put a bone on its two joints: root at `a`, pointing at `b`. */
function bone(g: Graphics, a: Pt, b: Pt): void {
  g.position.set(a.x, a.y);
  g.rotation = Math.atan2(b.y - a.y, b.x - a.x);
}

export type Expression = Mouth;

export class CharacterRig extends Container {
  // Root level, in draw order.
  private readonly shadow = part();
  private readonly hairBack = part();
  private readonly body = new Container();
  private readonly head = new Container();
  private readonly sleepSet = new Container();
  // Below the neck, back to front.
  private readonly thighL = part();
  private readonly shinL = part();
  private readonly thighR = part();
  private readonly shinR = part();
  private readonly shoeL = part();
  private readonly shoeR = part();
  private readonly upperArmB = part();
  private readonly foreArmB = part();
  private readonly handB = part();
  private readonly torso = part();
  private readonly collar = part();
  private readonly apron = part();
  private readonly upperArmF = part();
  private readonly foreArmF = part();
  private readonly handF = part();
  private readonly propIdle = new Container();
  private readonly propWork = new Container();
  private readonly propIdleParts: Graphics[] = [];
  private readonly propWorkParts: Graphics[] = [];
  // The head, about the skull's centre.
  private readonly skull = part();
  private readonly hairCap = part();
  private readonly fringeSkin = part();
  private readonly capBase = part();
  private readonly capBand = part();
  private readonly eyesOpen = part();
  private readonly eyesShut = part();
  private readonly eyesScared = part();
  private readonly mouths: Record<Mouth, Graphics> = {
    smile: part(), happy: part(), cross: part(), sleep: part(), scared: part(),
  };
  private readonly blush = part();
  // Asleep: the bed's parts about the quilt's top edge, and the Zs.
  private readonly sleepShadow = part();
  private readonly bed = new Container();
  private readonly pillow = part();
  private readonly hump = part();
  private readonly quilt = part();
  private readonly sheetFold = part();
  private readonly quiltFolds = part();
  private readonly footTent = part();
  private readonly armOnSheet = part();
  private readonly sleepHead = new Container();
  private readonly sleepSkull = part();
  private readonly sleepHairCap = part();
  private readonly sleepFringeSkin = part();
  private readonly sleepEyes = part();
  private readonly sleepMouth = part();
  private readonly sleepBlush = part();
  private readonly zA = part();
  private readonly zB = part();

  private lookKey = '';
  private look: Look | null = null;
  private p: RigProportions | null = null;
  private lying = false;
  private seated = false;
  private artScale = 1;
  private facing: 1 | -1 = 1;
  /** What the open and the wide eyes show when the lids are not shut. */
  private eyesOpenAlpha = 1;
  private eyesScaredAlpha = 0;
  private readonly parts: number;

  constructor() {
    super();
    this.body.addChild(
      this.thighL, this.shinL, this.thighR, this.shinR, this.shoeL, this.shoeR,
      this.upperArmB, this.foreArmB, this.handB,
      this.torso, this.collar, this.apron,
      this.upperArmF, this.foreArmF, this.handF,
      this.propIdle, this.propWork,
    );
    for (let i = 0; i < PROP_SLOTS; i++) {
      const a = part(); const b = part();
      this.propIdleParts.push(a); this.propWorkParts.push(b);
      this.propIdle.addChild(a); this.propWork.addChild(b);
    }
    this.head.addChild(
      this.skull, this.hairCap, this.fringeSkin, this.capBase, this.capBand,
      this.eyesOpen, this.eyesShut, this.eyesScared,
      ...MOUTHS.map((m) => this.mouths[m]),
      this.blush,
    );
    this.sleepHead.addChild(
      this.sleepSkull, this.sleepHairCap, this.sleepFringeSkin, this.sleepEyes, this.sleepMouth, this.sleepBlush,
    );
    this.sleepHead.position.set(SLEEP_HX, SLEEP_CY);
    this.bed.addChild(
      this.pillow, this.hump, this.quilt, this.sheetFold, this.quiltFolds, this.footTent, this.armOnSheet,
      this.sleepHead, this.zA, this.zB,
    );
    this.bed.position.y = QUILT_TOP;
    this.sleepSet.addChild(this.sleepShadow, this.bed);
    this.sleepSet.visible = false;
    this.addChild(this.shadow, this.hairBack, this.body, this.head, this.sleepSet);

    // Fixed geometry and fixed alphas: everything that never depends on the look.
    assign(this.shadow, SHADOW);
    this.shadow.alpha = 0.14;
    this.shadow.position.y = 0.4;
    assign(this.sleepShadow, SLEEP_SHADOW);
    this.sleepShadow.alpha = 0.12;
    this.sleepShadow.position.y = -0.6;
    assign(this.shoeL, SHOE); assign(this.shoeR, SHOE);
    assign(this.handB, HAND); assign(this.handF, HAND);
    assign(this.pillow, PILLOW);
    assign(this.hump, HUMP);
    assign(this.quilt, QUILT); this.quilt.position.set(SLEEP_HX + 1.0, 0);
    assign(this.sheetFold, SHEET_FOLD); this.sheetFold.position.set(SLEEP_HX + 1.4, 0.6);
    assign(this.quiltFolds, QUILT_FOLDS); this.quiltFolds.position.set(SLEEP_HX, 3.4); this.quiltFolds.alpha = 0.6;
    assign(this.footTent, FOOT_TENT); this.footTent.position.set(SLEEP_HX + 25.0, 1.2);
    assign(this.armOnSheet, ARM_ON_SHEET); this.armOnSheet.position.set(SLEEP_HX + 8.0, 1.8);
    assign(this.sleepSkull, skullCtx(SLEEP_HEAD_R));
    assign(this.sleepHairCap, hairCapCtx('plain', SLEEP_HEAD_R));
    assign(this.sleepFringeSkin, fringeSkinCtx(SLEEP_HEAD_R));
    assign(this.sleepEyes, eyesShutCtx(SLEEP_HEAD_R));
    assign(this.sleepMouth, mouthCtx('sleep', SLEEP_HEAD_R));
    assign(this.sleepBlush, blushCtx(SLEEP_HEAD_R));
    this.sleepBlush.alpha = 0.6;
    this.blush.alpha = 0.6;
    assign(this.zA, zCtx(Z_A.s)); this.zA.position.set(Z_A.x, Z_A.y); this.zA.alpha = Z_A.alpha;
    assign(this.zB, zCtx(Z_B.s)); this.zB.position.set(Z_B.x, Z_B.y); this.zB.alpha = Z_B.alpha;
    this.setExpression('smile', false);
    this.setProp('idle');

    let n = 0;
    const count = (c: Container): void => {
      for (const child of c.children) {
        if (child instanceof Graphics) n++;
        else if (child instanceof Container) count(child);
      }
    };
    count(this);
    this.parts = n;
  }

  /**
   * Dress the rig as one person. Assigns every part's geometry by size key
   * and every tint; returns at once when the look key is the one it already
   * wears, so a snapshot never touches a context (a context change rebuilds
   * the world's instructions). Returns whether it dressed: a dressing tints
   * as well, and the caller owes the tints itself when it did not.
   */
  setLook(look: Look, p: RigProportions, lit: (c: number) => number, scale: number, lookKey: string): boolean {
    if (lookKey === this.lookKey) return false;
    this.lookKey = lookKey;
    this.look = look;
    this.p = p;
    const r = p.headR;

    assign(this.hairBack, hairBackCtx(look.hairStyle, r));
    const thigh = thighCtx(p.thigh); const shin = shinCtx(p.shin);
    assign(this.thighL, thigh); assign(this.thighR, thigh);
    assign(this.shinL, shin); assign(this.shinR, shin);
    const upper = armCtx(p.upperArm); const fore = armCtx(p.foreArm);
    assign(this.upperArmB, upper); assign(this.upperArmF, upper);
    assign(this.foreArmB, fore); assign(this.foreArmF, fore);
    assign(this.torso, torsoCtx(p.shoulder, p.torsoH));
    assign(this.collar, collarCtx(p.shoulder));
    assign(this.apron, look.apron === null ? EMPTY : apronCtx(p.shoulder, p.torsoH));
    this.collar.alpha = look.apron === null ? 1 : 0;
    this.apron.alpha = look.apron === null ? 0 : 1;
    for (let i = 0; i < PROP_SLOTS; i++) {
      assign(this.propIdleParts[i]!, look.prop ? propCtx(look.prop, i) : EMPTY);
      assign(this.propWorkParts[i]!, look.propWork ? propCtx(look.propWork, i) : EMPTY);
    }
    assign(this.skull, skullCtx(r));
    assign(this.hairCap, hairCapCtx(look.hairStyle, r));
    assign(this.fringeSkin, fringeSkinCtx(r));
    assign(this.capBase, look.capStyle ? capBaseCtx(look.capStyle, r) : EMPTY);
    assign(this.capBand, look.capStyle ? capBandCtx(look.capStyle, r) : EMPTY);
    assign(this.eyesOpen, eyesOpenCtx(r));
    assign(this.eyesShut, eyesShutCtx(r));
    assign(this.eyesScared, eyesScaredCtx(r));
    for (const m of MOUTHS) assign(this.mouths[m], mouthCtx(m, r));
    assign(this.blush, blushCtx(r));

    this.shadow.scale.set(p.shoulder * (this.seated ? 0.44 : 0.62));
    this.shadow.scale.y *= 0.34;
    this.artScale = scale;
    this.scale.set(scale * this.facing, scale);
    this.setTints(lit);
    return true;
  }

  /** Re-colour for the light — night, dusk — without touching any geometry. */
  setTints(lit: (c: number) => number): void {
    const look = this.look;
    if (!look) return;
    const white = lit(WHITE);
    this.shadow.tint = lit(PALETTE.shadow);
    this.sleepShadow.tint = this.shadow.tint;
    this.hairBack.tint = lit(look.hair);
    const bottom = lit(look.bottom);
    this.thighL.tint = bottom; this.thighR.tint = bottom; this.shinL.tint = bottom; this.shinR.tint = bottom;
    const shoe = lit(PALETTE.ink2);
    this.shoeL.tint = shoe; this.shoeR.tint = shoe;
    const top = lit(look.top);
    this.upperArmB.tint = top; this.foreArmB.tint = top; this.upperArmF.tint = top; this.foreArmF.tint = top;
    this.torso.tint = top;
    const skin = lit(look.skin);
    this.handB.tint = skin; this.handF.tint = skin;
    this.collar.tint = lit(look.accent);
    this.apron.tint = look.apron === null ? white : lit(look.apron);
    for (let i = 0; i < PROP_SLOTS; i++) {
      const idle = look.prop ? PROPS[look.prop][i] : undefined;
      const work = look.propWork ? PROPS[look.propWork][i] : undefined;
      this.propIdleParts[i]!.tint = idle ? lit(idle.colour) : white;
      this.propWorkParts[i]!.tint = work ? lit(work.colour) : white;
    }
    this.skull.tint = skin;
    this.hairCap.tint = lit(look.hair);
    this.fringeSkin.tint = skin;
    // hcstyle.py:958 and :966 — the pillbox band and the peaked cap's brim are the cap a shade darker.
    const cap = look.cap ?? WHITE;
    this.capBase.tint = lit(cap);
    this.capBand.tint = lit(look.capStyle === 'pillbox' ? shade(cap, 0.18) : look.capStyle === 'peaked' ? shade(cap, 0.22) : cap);
    this.eyesOpen.tint = white; this.eyesShut.tint = white; this.eyesScared.tint = white;
    for (const m of MOUTHS) this.mouths[m].tint = white;
    this.blush.tint = lit(PALETTE.blush);
    // The bed (hcstyle.py:1101-1112).
    const linen = lit(PALETTE.linen);
    this.pillow.tint = linen;
    this.hump.tint = top;
    this.quilt.tint = top;
    this.sheetFold.tint = linen;
    this.quiltFolds.tint = lit(shade(look.top, 0.34));
    this.footTent.tint = lit(lighten(look.top, 0.26));
    this.armOnSheet.tint = skin;
    this.sleepSkull.tint = skin;
    this.sleepHairCap.tint = lit(look.hair);
    this.sleepFringeSkin.tint = skin;
    this.sleepEyes.tint = white; this.sleepMouth.tint = white;
    this.sleepBlush.tint = lit(PALETTE.blush);
    const z = lit(PALETTE.ink2);
    this.zA.tint = z; this.zB.tint = z;
  }

  /** Mirror for the other facing: the pose always faces +x. */
  setFacing(f: 1 | -1): void {
    this.facing = f;
    this.scale.x = this.artScale * f;
  }

  /** The face, by alpha. `eyesShut` here is the clip's (sleep); a blink is apply()'s. */
  setExpression(e: Expression, eyesShut: boolean): void {
    this.eyesOpenAlpha = e === 'scared' ? 0 : 1;
    this.eyesScaredAlpha = e === 'scared' ? 1 : 0;
    this.eyesOpen.alpha = eyesShut ? 0 : this.eyesOpenAlpha;
    this.eyesScared.alpha = eyesShut ? 0 : this.eyesScaredAlpha;
    this.eyesShut.alpha = eyesShut ? 1 : 0;
    for (const m of MOUTHS) this.mouths[m].alpha = m === e ? 1 : 0;
  }

  /** Which tool set shows, by alpha; both are built at setLook. */
  setProp(which: 'idle' | 'work' | null): void {
    this.propIdle.alpha = which === 'idle' ? 1 : 0;
    this.propWork.alpha = which === 'work' ? 1 : 0;
  }

  /** The seated shadow is under the feet, not under a standing body (hcstyle.py:794). */
  setSeated(on: boolean): void {
    if (on === this.seated) return;
    this.seated = on;
    const s = this.p?.shoulder ?? 11.4;
    this.shadow.scale.set(s * (on ? 0.44 : 0.62));
    this.shadow.scale.y *= 0.34;
  }

  /** Lie down or get up: the only visible toggle, at snapshot rate, and only on a change. */
  setLying(on: boolean): void {
    if (on === this.lying) return;
    this.lying = on;
    this.sleepSet.visible = on;
    this.body.visible = !on;
    this.head.visible = !on;
    this.hairBack.visible = !on;
    this.shadow.visible = !on;
  }

  /**
   * One frame: put every part on its joint. Transforms and alpha only —
   * nothing here allocates, redraws, swaps a context or toggles visibility
   * (tools/selftest/animations.ts greps this body for exactly that).
   */
  apply(pose: Pose, eyesShut: boolean): void {
    if (pose.lying) {
      // The quilt rises with a breath (quilt_h = 15 − breath, its top at
      // −16 + 2·breath; hcstyle.py:1096-1098) and the Zs drift up.
      const breath = pose.quiltBreath;
      this.bed.position.y = QUILT_TOP + 2 * breath;
      this.quilt.scale.y = (QUILT_H - breath) / QUILT_H;
      this.sheetFold.scale.y = (QUILT_H - 1.2 - breath) / (QUILT_H - 1.2);
      this.quiltFolds.scale.y = (QUILT_H - 6.8 - breath) / (QUILT_H - 6.8);
      this.zA.position.y = Z_A.y + pose.zDrift * Z_A.driftScale;
      this.zB.position.y = Z_B.y + pose.zDrift * Z_B.driftScale;
      return;
    }
    // Everything below the neck compresses about the feet; the hip's drop is
    // already in the joints, so the body container itself does not move.
    this.body.scale.y = pose.squash;
    bone(this.thighL, pose.hipL, pose.kneeL);
    bone(this.shinL, pose.kneeL, pose.footL);
    bone(this.thighR, pose.hipR, pose.kneeR);
    bone(this.shinR, pose.kneeR, pose.footR);
    this.shoeL.position.set(pose.footL.x, pose.footL.y);
    this.shoeR.position.set(pose.footR.x, pose.footR.y);
    // L is the back side, R the front: the pose faces +x and the container mirrors.
    bone(this.upperArmB, pose.shoulderL, pose.elbowL);
    bone(this.foreArmB, pose.elbowL, pose.handL);
    this.handB.position.set(pose.handL.x, pose.handL.y);
    // The torso hangs from the neck and leans with the chest.
    this.torso.position.set(pose.chest.x, pose.neck.y);
    this.collar.position.set(pose.chest.x, pose.neck.y);
    this.apron.position.set(pose.chest.x, pose.neck.y);
    bone(this.upperArmF, pose.shoulderR, pose.elbowR);
    bone(this.foreArmF, pose.elbowR, pose.handR);
    this.handF.position.set(pose.handR.x, pose.handR.y);
    this.propIdle.position.set(pose.handR.x, pose.handR.y);
    this.propWork.position.set(pose.handR.x, pose.handR.y);
    // The head is already computed from the squashed neck: no extra squash.
    this.head.position.set(pose.head.x, pose.head.y);
    this.head.rotation = pose.headTilt;
    this.hairBack.position.set(pose.head.x, pose.head.y);
    this.hairBack.rotation = pose.headTilt;
    this.eyesOpen.alpha = eyesShut ? 0 : this.eyesOpenAlpha;
    this.eyesScared.alpha = eyesShut ? 0 : this.eyesScaredAlpha;
    this.eyesShut.alpha = eyesShut ? 1 : 0;
  }

  /** How many Graphics this person is made of (standing and sleeping parts alike). */
  partCount(): number {
    return this.parts;
  }

  /** Half the drawn width in world px, measured from the parts themselves. Diagnostics only: it walks the tree. */
  boundsHalfWidth(): number {
    const b = this.getLocalBounds();
    return ((b.maxX - b.minX) / 2) * this.artScale;
  }
}
