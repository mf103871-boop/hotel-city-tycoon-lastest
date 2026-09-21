/**
 * Who the nine people are: a TypeScript transcription of the cast.
 *
 * The art pipeline casts in Python — tools/art/characters.py decides that the
 * chef is broad, grey-haired and in whites with a toque, and tools/art/hcstyle.py
 * holds the palette those choices are made from. The live rig (HC-P2-S3,
 * DEC-020) draws the same people at runtime, so the same decisions have to
 * exist on this side of the language boundary. This file is that copy, and
 * nothing more: no drawing, no maths, no Pixi. A selftest reads characters.py
 * and hcstyle.py with a regex and fails the moment a field here drifts from
 * the Python (tools/selftest/render.ts), the way the backdrop palette already
 * is kept honest.
 *
 * Colours are the hcstyle `P` names the cast actually uses, with their hexes
 * (hcstyle.py:96-170). `shade` and `lighten` are hcstyle's `shade`/`tint`
 * (hcstyle.py:69-76): the pillbox band, the peaked cap's brim and the
 * sleeper's foot tent are derived colours there and must be derived the same
 * way here.
 */

/** The hcstyle `P` entries the cast wears or carries, by name. */
export const PALETTE = {
  skin1: 0xf7d3b5,
  skin2: 0xefbe96,
  skin3: 0xd79a6e,
  skin4: 0xb0744a,
  skin5: 0x8a5533,
  hairBlack: 0x2a2431,
  hairBrown: 0x7a4a2c,
  hairAuburn: 0xb4562c,
  hairBlond: 0xf2c960,
  hairGrey: 0xc8ccd4,
  hairPink: 0xf27ea8,
  blush: 0xf79fa0,
  coral: 0xed5c47,
  roomBlue: 0x4f8ee7,
  green: 0x5bb877,
  warmWhite: 0xdde2df,
  white: 0xfbfcfd,
  linen: 0xf2f5f8,
  glass: 0xbfe6f5,
  glassDk: 0x8fcbe4,
  wallGrape: 0x7b6bb5,
  wallNavy: 0x2e4c86,
  lavender: 0xa7a1d3,
  metal: 0xc3ccd8,
  metalDk: 0x8b97a8,
  gold: 0xf5c24d,
  cream: 0xfbd991,
  creamHi: 0xfde4b0,
  ink: 0x031130,
  ink2: 0x132a50,
  woodDk: 0xb87334,
  woodPale: 0xeac084,
  shadow: 0x0b1b3a,
} as const;

export type PaletteName = keyof typeof PALETTE;

export type HairStyle = 'short' | 'bun' | 'spiky' | 'curly' | 'long' | 'ponytail' | 'pigtails' | 'bald';
export type CapStyle = 'beanie' | 'pillbox' | 'toque' | 'peaked';
export type Prop =
  | 'mop' | 'tray' | 'clipboard' | 'dumbbell' | 'cup' | 'towel' | 'wrench' | 'whistle' | 'popcorn' | 'suitcase';
export type Expression = 'smile' | 'happy' | 'cross';
export type Build = 'slim' | 'normal' | 'broad';
export type Age = 'adult' | 'senior' | 'child';

/** One cast member, as characters.py's `Member(Person(...), prop, prop_work, expression)`. */
export interface Look {
  skin: number;
  hair: number;
  hairStyle: HairStyle;
  top: number;
  bottom: number;
  accent: number;
  apron: number | null;
  cap: number | null;
  capStyle: CapStyle | null;
  build: Build;
  height: number;
  age: Age;
  /** Carried while idle and walking; null for somebody who stands empty-handed. */
  prop: Prop | null;
  /** Held in the work pose — often a different tool from the one carried. */
  propWork: Prop | null;
  expression: Expression;
}

const P = PALETTE;

/**
 * The nine rows of characters.py STAFF + GUESTS, keyed as data/staff.json
 * roles and data/guests.json types name them. Order and values are the
 * Python's; the selftest holds them to it field by field.
 */
export const CAST: Readonly<Record<string, Look>> = {
  'staff.receptionist': {
    skin: P.skin4, hair: P.hairBlack, hairStyle: 'short',
    top: P.coral, bottom: P.ink2, accent: P.gold,
    apron: null, cap: P.coral, capStyle: 'pillbox',
    build: 'normal', height: 1.00, age: 'adult',
    prop: null, propWork: 'clipboard', expression: 'happy',
  },
  'staff.cleaner': {
    skin: P.skin2, hair: P.hairAuburn, hairStyle: 'bun',
    top: P.roomBlue, bottom: P.ink2, accent: P.white,
    apron: P.linen, cap: null, capStyle: null,
    build: 'slim', height: 0.94, age: 'adult',
    prop: 'mop', propWork: 'mop', expression: 'smile',
  },
  'staff.trainer': {
    skin: P.skin5, hair: P.hairBlack, hairStyle: 'spiky',
    top: P.green, bottom: P.ink2, accent: P.creamHi,
    apron: null, cap: null, capStyle: null,
    build: 'broad', height: 1.08, age: 'adult',
    prop: 'dumbbell', propWork: 'dumbbell', expression: 'happy',
  },
  'staff.chef': {
    skin: P.skin1, hair: P.hairGrey, hairStyle: 'short',
    top: P.warmWhite, bottom: P.ink2, accent: P.coral,
    apron: null, cap: P.white, capStyle: 'toque',
    build: 'broad', height: 0.98, age: 'senior',
    prop: null, propWork: 'tray', expression: 'happy',
  },
  'staff.bartender': {
    skin: P.skin3, hair: P.hairBrown, hairStyle: 'curly',
    top: P.glass, bottom: P.ink2, accent: P.gold,
    apron: P.wallNavy, cap: null, capStyle: null,
    build: 'slim', height: 1.02, age: 'adult',
    prop: 'towel', propWork: 'cup', expression: 'smile',
  },
  'staff.usher': {
    skin: P.skin1, hair: P.hairPink, hairStyle: 'long',
    top: P.wallGrape, bottom: P.ink2, accent: P.gold,
    apron: null, cap: P.wallGrape, capStyle: 'peaked',
    build: 'slim', height: 0.92, age: 'adult',
    prop: 'popcorn', propWork: 'popcorn', expression: 'happy',
  },
  'staff.lifeguard': {
    skin: P.skin3, hair: P.hairBlond, hairStyle: 'ponytail',
    top: P.coral, bottom: P.roomBlue, accent: P.white,
    apron: null, cap: null, capStyle: null,
    build: 'normal', height: 1.00, age: 'adult',
    prop: 'whistle', propWork: 'whistle', expression: 'smile',
  },
  'guest.standard': {
    skin: P.skin2, hair: P.hairBrown, hairStyle: 'long',
    top: P.lavender, bottom: P.ink2, accent: P.cream,
    apron: null, cap: null, capStyle: null,
    build: 'normal', height: 1.00, age: 'adult',
    prop: 'suitcase', propWork: 'suitcase', expression: 'smile',
  },
  'guest.inspector': {
    skin: P.skin4, hair: P.hairGrey, hairStyle: 'short',
    top: P.metalDk, bottom: P.ink2, accent: P.coral,
    apron: null, cap: null, capStyle: null,
    build: 'broad', height: 1.04, age: 'senior',
    prop: 'clipboard', propWork: 'clipboard', expression: 'cross',
  },
};

/**
 * The cast row for an asset key. The bridge names people `<kind>.<id>.sheet`
 * and the staff panel `<kind>.<id>.thumb`; both are the same person.
 */
export function lookFor(assetKey: string): Look | null {
  const id = assetKey.replace(/\.(sheet|thumb)$/, '');
  return CAST[id] ?? null;
}

export function castIds(): string[] {
  return Object.keys(CAST);
}

/**
 * How far a carried tool reaches from the hand, in rig px, strokes included
 * — transcribed from hcstyle `_draw_prop` (hcstyle.py:1024-1064) so the
 * bounds checks know how wide a person with a tray is. `halfWidth` is the
 * larger of the two sides; `above` is how far the tool rises over the hand.
 */
export const PROP_EXTENT: Readonly<Record<Prop, { halfWidth: number; above: number }>> = {
  tray: { halfWidth: 5.45, above: 4.65 },
  mop: { halfWidth: 3.65, above: 11.8 },
  clipboard: { halfWidth: 3.45, above: 1.85 },
  dumbbell: { halfWidth: 5.45, above: 2.85 },
  cup: { halfWidth: 4.05, above: 3.45 },
  towel: { halfWidth: 3.25, above: 1.85 },
  wrench: { halfWidth: 7.35, above: 2.0 },
  whistle: { halfWidth: 2.05, above: 3.45 },
  popcorn: { halfWidth: 3.05, above: 3.85 },
  suitcase: { halfWidth: 3.85, above: 1.45 },
};

/** Per-channel blend of `a` toward `b`, rounded like hcstyle `mix`. */
function mix(a: number, b: readonly [number, number, number], t: number): number {
  const ch = (shift: number, target: number): number => {
    const v = (a >> shift) & 0xff;
    return Math.max(0, Math.min(255, Math.round(v + (target - v) * t)));
  };
  return (ch(16, b[0]) << 16) | (ch(8, b[1]) << 8) | ch(0, b[2]);
}

/** hcstyle `shade`: the same colour, darker — mixed toward (10, 20, 44), not P.shadow. */
export function shade(colour: number, t: number): number {
  return mix(colour, [10, 20, 44], t);
}

/** hcstyle `tint`: the same colour, lighter — mixed toward white. */
export function lighten(colour: number, t: number): number {
  return mix(colour, [255, 255, 255], t);
}
