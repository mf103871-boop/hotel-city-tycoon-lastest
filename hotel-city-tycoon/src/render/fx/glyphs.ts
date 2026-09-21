/**
 * Every shape the effects channel draws, as geometry (HC-P2-S4, DEC-021).
 *
 * The floating «+25» over an earning room is the one place a renderer is
 * tempted to reach for a font, and a font is the one thing this canvas cannot
 * afford: a glyph drawn through `Text` picks its own hinting per platform, is
 * laid out by a shaper that reads the document's direction, and lands on the
 * canvas as a bitmap nobody can diff. So the digits are polylines in a 9x12
 * box, baked into the runtime atlas once and drawn as sprites — a number on
 * screen is the same number of pixels in Riyadh and in CI, under `dir="rtl"`
 * and under `dir="ltr"`, and this file is the proof that can be read.
 *
 * PURE DATA. No Pixi, no DOM, no string, no character literal used as
 * content: `tools/selftest/effects.ts` asserts all four. The module loads
 * under `node --experimental-strip-types`, which is what lets the headless
 * suites hold it to that standard.
 *
 * The painter's contract (src/render/fx/atlas.ts is the only implementation):
 * walk `GLYPHS[i]` in order and, per stroke, build one path from `points`
 * (`moveTo` the first pair, `lineTo` the rest, `closePath` when `closed`),
 * then `fill()` when `fill` is not null and `stroke()` at `width` when
 * `stroke` is not null. Order is load-bearing, and it is *every rim, then
 * every body* — not rim-then-body per shape. A glyph with two shapes drawn
 * the second way loses the first shape's cream to the second shape's wider
 * ink rim, which is what erased the plus sign's arms and left it reading as
 * a bar with two nubs. `expand()` below is the only place that order is
 * decided. The painter sets round joins and caps; nothing here depends on a
 * miter.
 *
 * Coordinates are logical px with the origin at the glyph box's top-left and
 * y pointing down, the same convention as the rig's poses.
 */
import { PALETTE } from '../anim/cast.ts';

/** The ten digits occupy 0..9, so `GLYPH_DIGIT_0 + d` is the digit `d`. */
export const GLYPH_DIGIT_0 = 0;
export const GLYPH_PLUS = 10;
export const MARK_SMILE = 11;
export const MARK_CROSS = 12;
export const MARK_BANG = 13;
export const MARK_QUERY = 14;
export const MARK_STAR = 15;
/**
 * No sleeper's mark here, deliberately (HC-P2-S4 §9 row 1).
 *
 * The rig already draws a lying sleeper two drifting `z` from `pose.zDrift`
 * (characterRig.ts:771-772) on both tiers, so a third one from this channel
 * was a third mark at a *standing* figure's head height — detached from the
 * bed, and it made a full/lite A/B of a sleeper read as "the mark count
 * changed". The channel does not repeat what the rig already says.
 */
export const MARK_SPARKLE = 16;
export const GLYPH_COUNT = 17;
export const DIGIT_COUNT = 10;
/** The marks, as one contiguous run: `MARK_SMILE .. MARK_SPARKLE`. */
export const MARK_COUNT = GLYPH_COUNT - MARK_SMILE;

/** Every glyph is drawn inside this box, origin at its top-left, logical px. */
export const GLYPH_W = 9;
export const GLYPH_H = 12;
/**
 * Glyph width plus one px of letter-space. The label's advance.
 *
 * One px wider than `GLYPH_W` on purpose: adjacent digits of a `+N` then
 * cannot touch, whatever the sprite's own anchor rounding does.
 */
export const GLYPH_ADVANCE_PX = 10;

/**
 * The atlas grid, here rather than in `atlas.ts`, because the pure half needs
 * it too: `particles.ts`'s `frameOf()` answers in atlas frame indices, and
 * `atlas.ts` imports Pixi, so the indices cannot live there without dragging
 * a renderer into every headless suite that loads a particle.
 */
export const CELL = 16;
export const ATLAS_COLS = 16;
export const ATLAS_RES = 2;
export const ATLAS_W = 256;
export const ATLAS_H = 80;
/** The reaction bubble's card, in its own rect under the grid. */
export const BUBBLE_W = 28;
export const BUBBLE_H = 24;
export const BUBBLE_Y = 48;

export const FRAME_DIGIT_0 = 0;
export const FRAME_PLUS = 10;
export const FRAME_COIN_0 = 11;
export const FRAME_SPARK_0 = 17;
export const FRAME_DUST_0 = 23;
export const FRAME_MARK_0 = 29;
/** The last grid cell, left transparent: the blend fence's texture. */
export const FRAME_BLANK = 35;
export const FRAME_BUBBLE = 36;
/** One number for the coin, the spark and the dust strips. */
export const FX_FRAMES = 6;
export const FRAME_COUNT = 37;

/** Which atlas frame carries the glyph `g`. */
export function frameForGlyph(g: number): number {
  if (g >= GLYPH_DIGIT_0 && g < DIGIT_COUNT) return FRAME_DIGIT_0 + g;
  if (g === GLYPH_PLUS) return FRAME_PLUS;
  if (g >= MARK_SMILE && g < GLYPH_COUNT) return FRAME_MARK_0 + (g - MARK_SMILE);
  return FRAME_BLANK;
}

/** One path in a glyph, with what to do with it. */
export interface GlyphStroke {
  /** `x0,y0,x1,y1,…` in the 9x12 box. */
  readonly points: readonly number[];
  readonly closed: boolean;
  /** A PALETTE value, or null when the path is only stroked. */
  readonly fill: number | null;
  /** A PALETTE value, or null when the path is only filled. */
  readonly stroke: number | null;
  /** Stroke width in logical px. Ignored when `stroke` is null. */
  readonly width: number;
}

/**
 * The pen, in two passes.
 *
 * The approved reference draws its floating number as a thick ink stroke with
 * a cream body on top (prototypes/next-render/src/main.ts:805-809 does
 * exactly that with `strokeText` then `fillText`), and that is the look this
 * reproduces without a font: the same path stroked twice, wide in ink and
 * narrow in cream. It also sidesteps the one thing a 9x12 outline cannot do —
 * a counter. A filled '0' needs a hole, and a hole needs either an even-odd
 * rule the painter would have to know about or a second polygon painted in
 * the background's colour, which is a lie the moment the backdrop moves.
 */
const PEN_W = 1.8;
const PEN_RIM_EXTRA = 1.4;
/**
 * The face marks' pen.
 *
 * Thinner than a digit's on purpose: a smile is three strokes inside one 9x12
 * box, and at 1.8 the eyes' round caps and the mouth's overlapped — the card
 * carried a dark blob rather than a face. At 1.2 the marks clear each other
 * by more than a pen width (the gap is checked in tests/unit/effects.test.ts).
 */
const MARK_PEN_W = 1.2;
/** A solid mark is filled and rimmed once, at the house's hairline. */
const SOLID_RIM_W = 1;

interface PenShape {
  readonly points: readonly number[];
  readonly closed: boolean;
  /** True: fill the path. False: stroke it, rim first. */
  readonly solid: boolean;
}

interface GlyphSpec {
  /** The colour the glyph reads as. */
  readonly main: number;
  /** The rim behind it, or null for a mark that is itself the dark. */
  readonly rim: number | null;
  readonly shapes: readonly PenShape[];
  /** The stroke width for this glyph's pen shapes; `PEN_W` when absent. */
  readonly penW?: number;
}

const pen = (points: readonly number[], closed = false): PenShape => ({ points, closed, solid: false });
const solid = (points: readonly number[]): PenShape => ({ points, closed: true, solid: true });

/**
 * The digits, drawn on a 4.2 x 7.2 body inside the box so that the ink rim
 * still lands inside 9x12: body x 2.4..6.6, y 2.4..9.6, pen 1.8, rim 3.2.
 */
const DIGITS: readonly (readonly PenShape[])[] = [
  // 0 — a hexagonal ring. Stroked, so its counter is a real hole.
  [pen([4.5, 2.4, 6.6, 3.6, 6.6, 8.4, 4.5, 9.6, 2.4, 8.4, 2.4, 3.6], true)],
  // 1 — flag, stem, foot.
  [pen([3.2, 3.6, 4.5, 2.4, 4.5, 9.6]), pen([3.0, 9.6, 6.0, 9.6])],
  // 2
  [pen([2.4, 3.6, 3.4, 2.4, 5.6, 2.4, 6.6, 3.6, 6.6, 4.8, 2.4, 9.6, 6.6, 9.6])],
  // 3 — one stroke through both bowls, pinched at the waist.
  [pen([2.6, 2.8, 5.4, 2.4, 6.6, 3.6, 6.0, 5.8, 4.0, 6.0, 6.2, 6.4, 6.6, 8.2, 5.4, 9.6, 2.6, 9.2])],
  // 4
  [pen([5.6, 2.4, 2.4, 7.2, 6.8, 7.2]), pen([5.6, 2.4, 5.6, 9.6])],
  // 5
  [pen([6.4, 2.4, 2.8, 2.4, 2.6, 5.4, 4.8, 5.0, 6.4, 6.0, 6.4, 8.2, 5.0, 9.6, 2.6, 9.2])],
  // 6
  [pen([6.0, 2.4, 3.4, 4.0, 2.6, 6.6, 3.0, 8.8, 5.0, 9.6, 6.4, 8.4, 6.2, 6.8, 4.4, 6.1, 2.8, 6.9])],
  // 7
  [pen([2.4, 2.4, 6.6, 2.4, 4.0, 9.6])],
  // 8 — two rings rather than one crossing path: a crossing would leave a
  // seam where the pen doubles back on itself at the waist.
  [
    pen([4.5, 2.4, 6.2, 3.4, 6.2, 4.8, 4.5, 5.9, 2.8, 4.8, 2.8, 3.4], true),
    pen([4.5, 5.9, 6.5, 7.0, 6.5, 8.6, 4.5, 9.6, 2.5, 8.6, 2.5, 7.0], true),
  ],
  // 9
  [
    pen([4.5, 2.4, 6.2, 3.4, 6.2, 5.0, 4.5, 6.0, 2.8, 5.0, 2.8, 3.4], true),
    pen([6.2, 5.0, 6.0, 7.8, 4.4, 9.6, 2.9, 9.3]),
  ],
];

const SPECS: readonly GlyphSpec[] = [
  ...DIGITS.map((shapes): GlyphSpec => ({ main: PALETTE.cream, rim: PALETTE.ink, shapes })),
  // The plus. Two bars, the same weight as a digit: the sign is part of the
  // number, not a decoration beside it.
  {
    main: PALETTE.cream,
    rim: PALETTE.ink,
    // The arms run the full width of a digit's body (2.4..6.6) rather than
    // stopping short of it: the vertical bar's ink rim is 1.6 px either side
    // of centre, so a shorter arm leaves barely a stub of cream outside it
    // even now that every rim is painted before every body.
    shapes: [pen([2.4, 6.0, 6.6, 6.0]), pen([4.5, 4.0, 4.5, 8.0])],
  },
  // The marks. Each is drawn inside the bubble card, whose warm white is the
  // background they have to read against — so the dark ones carry no rim.
  {
    // smile: two eyes and a mouth. The eyes end at y 4.4 and the mouth's
    // round cap starts at 7.0 - MARK_PEN_W/2 = 6.4, so two px of warm white
    // separate them: at the old 1.8 pen they overlapped by 0.2 px and the
    // three strokes fused into one dark blob on the card.
    main: PALETTE.ink2,
    rim: null,
    penW: MARK_PEN_W,
    shapes: [
      pen([3.3, 3.4, 3.3, 4.4]),
      pen([5.7, 3.4, 5.7, 4.4]),
      pen([2.9, 7.0, 3.7, 8.1, 5.3, 8.1, 6.1, 7.0]),
    ],
  },
  {
    // cross: the refusal, in the coral the prototype used (main.ts:234)
    main: PALETTE.coral,
    rim: PALETTE.ink,
    shapes: [pen([2.8, 3.2, 6.2, 8.4]), pen([6.2, 3.2, 2.8, 8.4])],
  },
  {
    // bang
    main: PALETTE.coral,
    rim: PALETTE.ink,
    shapes: [pen([4.5, 2.6, 4.5, 7.2]), solid([4.5, 8.4, 5.2, 9.1, 4.5, 9.8, 3.8, 9.1])],
  },
  {
    // query: the guest whose desire went unmet
    main: PALETTE.ink2,
    rim: null,
    shapes: [
      pen([2.9, 4.0, 3.6, 2.7, 5.4, 2.7, 6.2, 4.0, 5.6, 5.4, 4.5, 6.2, 4.5, 7.2]),
      solid([4.5, 8.4, 5.2, 9.1, 4.5, 9.8, 3.8, 9.1]),
    ],
  },
  {
    // star: the inspector's praise. Five points, outer r 3.2, inner r 1.35,
    // about (4.5, 6.0), the first point straight up.
    main: PALETTE.gold,
    rim: PALETTE.ink,
    shapes: [solid([
      4.5, 2.8, 5.29, 4.91, 7.54, 5.01, 5.78, 6.42, 6.38, 8.59,
      4.5, 7.35, 2.62, 8.59, 3.22, 6.42, 1.46, 5.01, 3.71, 4.91,
    ])],
  },
  {
    // sparkle: a four-point twinkle, the cleaner's
    main: PALETTE.glass,
    rim: PALETTE.ink,
    shapes: [solid([
      7.9, 6.0, 5.21, 6.71, 4.5, 9.4, 3.79, 6.71,
      1.1, 6.0, 3.79, 5.29, 4.5, 2.6, 5.21, 5.29,
    ])],
  },
];

/**
 * A spec to the painter's stroke list: every ink rim first, then every body.
 *
 * The pass split is the whole of it. Emitting rim-then-body per shape paints
 * the second shape's rim — `PEN_RIM_EXTRA` wider than its body, so 1.6 px
 * either side of the line — straight over the first shape's cream. On the
 * plus that erased the arms down to two stubs; on the 1, 4, 8 and 9 it ate
 * the join. Two passes cost nothing: this runs once, at bake time.
 */
function expand(spec: GlyphSpec): readonly GlyphStroke[] {
  const out: GlyphStroke[] = [];
  const penW = spec.penW ?? PEN_W;
  if (spec.rim !== null) {
    for (const shape of spec.shapes) {
      if (shape.solid) continue;
      out.push({
        points: shape.points, closed: shape.closed,
        fill: null, stroke: spec.rim, width: penW + PEN_RIM_EXTRA,
      });
    }
  }
  for (const shape of spec.shapes) {
    if (shape.solid) {
      // A solid is filled and hairline-rimmed in one go: its rim is one px
      // and lands inside its own outline, so it cannot reach a neighbour.
      out.push({ points: shape.points, closed: true, fill: spec.main, stroke: spec.rim, width: SOLID_RIM_W });
      continue;
    }
    out.push({ points: shape.points, closed: shape.closed, fill: null, stroke: spec.main, width: penW });
  }
  return out;
}

/** Every glyph, `GLYPH_COUNT` of them, indexed by the constants above. */
export const GLYPHS: readonly (readonly GlyphStroke[])[] = SPECS.map(expand);
