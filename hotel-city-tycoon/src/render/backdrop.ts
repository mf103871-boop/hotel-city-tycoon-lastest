/**
 * The world the hotel stands in: sky, city, trees, street, and the building's
 * own shell.
 *
 * Until now the scene drew rooms on a flat brown clear-colour and a debug
 * grid. Everything the art direction says about *composition* — a hotel in the
 * middle of the frame, sky above it, a quieter city behind, a pavement holding
 * it down (ART-0 §3 and §10) — was missing, and no amount of redrawing the
 * rooms could supply it, because none of it belongs to a room.
 *
 * It is drawn with Pixi Graphics rather than shipped as art on purpose. The
 * backdrop has to stretch to whatever plot the player has expanded to, stay
 * crisp at every zoom, and cost nothing to download; flat vector shapes do all
 * three, and an image of a sky would do none of them.
 *
 * Everything here is decoration. It never reads the simulation, never
 * responds to input, and redraws only when the plot's size or the hotel's
 * outline actually changes.
 */
import { Graphics } from 'pixi.js';
import type { Container } from 'pixi.js';
import type { WorldBounds } from './camera.ts';
import { BLOCK_W, BLOCK_H } from './layout.ts';

/**
 * The palette, matching `tools/art/hcstyle.py`.
 *
 * Duplicated rather than imported because the art tooling is Python and this
 * is the renderer; `tools/selftest/render.ts` checks the two agree, so the
 * copy cannot drift silently.
 */
export const SKY = 0x6fbcf9;
export const SKY_HIGH = 0x8fd0fb;
export const CITY_FAR = 0xa9c8e8;
export const CITY_NEAR = 0x93b8df;
export const CITY_WINDOW = 0xd8e8f7;
export const TREE_FAR = 0xa8d9b4;
export const TREE_NEAR = 0x8fcca1;
export const ROAD = 0x9aa3ac;
export const ROAD_LINE = 0xedf1f4;
export const KERB = 0xc6cdd4;
export const INK = 0x031130;
export const GOLD = 0xf5c24d;
export const GOLD_DARK = 0xd19b2a;

/**
 * The night wash, `out = in * scale + lift` per channel.
 *
 * These are the numbers `tools/art/hcvariants.py` bakes into every `*_night`
 * room image (its `NIGHT_SCALE` / `NIGHT_LIFT`), and `tools/selftest/render.ts`
 * reads them back out of that file and fails if this copy has drifted.
 *
 * They are here because a room going dark while the sky above it stayed at
 * noon was the single most obviously wrong thing on screen: the hotel switches
 * to its night pictures the moment it stops trading, and every new player's
 * first frame was a periwinkle hotel under a bright blue summer sky. Painting
 * the world with the same transform that is baked into the art is what makes
 * one night instead of two.
 */
const NIGHT_SCALE: readonly [number, number, number] = [0.44, 0.50, 0.56];
const NIGHT_LIFT: readonly [number, number, number] = [20, 26, 58];

/** The night wash parameters, for the parity self-test. */
export const NIGHT_WASH = { scale: NIGHT_SCALE, lift: NIGHT_LIFT } as const;

/** One colour after dark. The same arithmetic the art pipeline applies. */
export function nightfall(colour: number): number {
  const band = (shift: number, i: 0 | 1 | 2): number => {
    const v = (colour >> shift) & 0xff;
    return Math.max(0, Math.min(255, Math.round(v * NIGHT_SCALE[i] + NIGHT_LIFT[i])));
  };
  return (band(16, 0) << 16) | (band(8, 1) << 8) | band(0, 2);
}

/**
 * What a sprite drawn in daylight must be multiplied by to sit in a night room.
 *
 * Decor and characters are day-lit art composited over whichever room picture
 * is showing, so without this a fully lit sofa and a fully lit receptionist
 * stood in a dark room. A tint is a multiply and the wash is a multiply plus a
 * lift, so this is the wash applied to white: the closest a tint can get, and
 * near-exact for the bright flat colours this art is made of.
 */
export const NIGHT_TINT = nightfall(0xffffff);

/** Every backdrop colour after dark, derived once rather than written twice. */
export const NIGHT = {
  sky: nightfall(SKY),
  skyHigh: nightfall(SKY_HIGH),
  cityFar: nightfall(CITY_FAR),
  cityNear: nightfall(CITY_NEAR),
  cityWindow: nightfall(CITY_WINDOW),
  treeFar: nightfall(TREE_FAR),
  treeNear: nightfall(TREE_NEAR),
  road: nightfall(ROAD),
  roadLine: nightfall(ROAD_LINE),
  kerb: nightfall(KERB),
  ink: nightfall(INK),
} as const;

/**
 * A window with a light on behind it.
 *
 * The one thing in the night picture that is not the wash: a city where every
 * window went dark with the sky reads as a power cut, and it is the scatter of
 * lit windows that tells a player at a glance that it is night rather than
 * that the screen has dimmed.
 */
export const NIGHT_WINDOW_LIT = 0xf5c24d;

/** A room footprint, in blocks — all the shell needs to know. */
export interface ShellRect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * A deterministic value in 0..1 from an integer.
 *
 * The skyline must be the same every time the plot is redrawn, or the city
 * behind the hotel would reshuffle itself every time the player buys a room.
 * A hash of the position is the cheapest way to get variety that never moves.
 */
function jitter(n: number, salt = 0): number {
  const x = Math.sin((n + 1) * 127.1 + salt * 311.7) * 43758.5453;
  return x - Math.floor(x);
}

export class Backdrop {
  private readonly sky = new Graphics();
  private readonly city = new Graphics();
  private readonly street = new Graphics();
  private readonly shell = new Graphics();
  private lastKey = '';

  constructor(layers: { sky: Container; cityscape: Container; street: Container; roomShell: Container }) {
    layers.sky.addChild(this.sky);
    layers.cityscape.addChild(this.city);
    layers.street.addChild(this.street);
    // The shell shares the room layer but is added first, so rooms draw over
    // its fill and its frame reads as the wall they are set into.
    layers.roomShell.addChildAt(this.shell, 0);
  }

  /**
   * Redraw for a plot of this size with the hotel at this outline.
   *
   * `stars` is the rating shown above the building — the reference image's
   * three gold stars, which are how a hotel says what it is worth before the
   * player reads a single number.
   */
  update(world: WorldBounds, gridH: number, rooms: ShellRect[], stars: number,
         night = false): void {
    const outline = boundingBox(rooms);
    const key = `${world.x},${world.y},${world.width},${world.height},${gridH},${stars},` +
      `${night ? 'n' : 'd'},` +
      (outline ? `${outline.x},${outline.y},${outline.w},${outline.h}` : 'empty');
    if (key === this.lastKey) return;
    this.lastKey = key;

    // The ground: where the plot's bottom row of blocks rests.
    const groundY = gridH * BLOCK_H;
    // Painted well past the plot so a fast pan never reaches an edge.
    const left = world.x - world.width;
    const right = world.x + world.width * 2;
    const top = world.y - world.height;

    this.drawSky(left, right, top, groundY, night);
    this.drawCity(left, right, groundY, night);
    this.drawStreet(left, right, groundY, world.height, night);
    this.drawShell(outline, gridH, stars, night);
  }

  private drawSky(left: number, right: number, top: number, groundY: number,
                  night: boolean): void {
    const g = this.sky;
    g.clear();
    const w = right - left;
    g.rect(left, top, w, groundY - top).fill(night ? NIGHT.sky : SKY);
    // Three bands rather than a gradient: the art is flat, and a real gradient
    // would be the only smooth thing on screen.
    const band = (groundY - top) * 0.18;
    const high = night ? NIGHT.skyHigh : SKY_HIGH;
    g.rect(left, groundY - band * 2, w, band * 2).fill({ color: high, alpha: 0.55 });
    g.rect(left, groundY - band, w, band).fill({ color: high, alpha: 0.55 });
  }

  private drawCity(left: number, right: number, groundY: number, night: boolean): void {
    const g = this.city;
    g.clear();
    const far = night ? NIGHT.cityFar : CITY_FAR;
    const near = night ? NIGHT.cityNear : CITY_NEAR;
    // Two ranks of buildings, the far one paler and shorter, so the skyline
    // has depth without any of it competing with the hotel (ART-0 §10).
    for (const [rank, colour, scale] of [[0, far, 0.72], [1, near, 1.0]] as const) {
      const step = BLOCK_W * (rank === 0 ? 1.1 : 1.45);
      for (let i = Math.floor(left / step); i < Math.ceil(right / step); i++) {
        const r = jitter(i, rank);
        const h = (BLOCK_H * (1.1 + r * 2.2)) * scale;
        const w = step * (0.62 + jitter(i, rank + 7) * 0.3);
        const x = i * step + (step - w) / 2;
        const y = groundY - h;
        g.roundRect(x, y, w, h, 4).fill(colour);
        // A pitched roof on some of them: a skyline of flat boxes reads as a
        // wall, and the reference's city is houses, not offices.
        if (r > 0.55) {
          g.moveTo(x - 3, y).lineTo(x + w / 2, y - h * 0.22).lineTo(x + w + 3, y).fill(colour);
        }
        const cols = Math.max(1, Math.floor(w / 26));
        const rowsN = Math.max(1, Math.floor(h / 30));
        for (let cx = 0; cx < cols; cx++) {
          for (let cy = 0; cy < rowsN; cy++) {
            const roll = jitter(i * 31 + cx * 7 + cy * 13, rank);
            if (roll < 0.42) continue;
            // After dark a third of them have someone still up. Without this
            // the city dims with the sky and reads as a power cut rather than
            // as a night, and the hotel loses the thing it is lit against.
            const lit = night && roll > 0.72;
            g.roundRect(x + 8 + cx * 26, y + 12 + cy * 30, 9, 11, 2)
              .fill({
                color: lit ? NIGHT_WINDOW_LIT : night ? NIGHT.cityWindow : CITY_WINDOW,
                alpha: lit ? 0.9 : rank === 0 ? 0.5 : 0.75,
              });
          }
        }
      }
    }

    // Trees along the front of the city, in two greens for the same reason.
    const treeFar = night ? NIGHT.treeFar : TREE_FAR;
    const treeNear = night ? NIGHT.treeNear : TREE_NEAR;
    for (const [rank, colour, size] of [[0, treeFar, 0.8], [1, treeNear, 1.0]] as const) {
      const step = BLOCK_W * 0.62;
      for (let i = Math.floor(left / step); i < Math.ceil(right / step); i++) {
        if (jitter(i, 40 + rank) < 0.34) continue;
        const r = jitter(i, 50 + rank);
        const rad = (16 + r * 12) * size;
        const x = i * step + r * 12;
        const y = groundY - rad * 0.9;
        g.circle(x, y, rad).fill(colour);
        g.circle(x - rad * 0.7, y + rad * 0.4, rad * 0.66).fill(colour);
        g.circle(x + rad * 0.7, y + rad * 0.4, rad * 0.66).fill(colour);
      }
    }
  }

  private drawStreet(left: number, right: number, groundY: number, depth: number,
                     night: boolean): void {
    const g = this.street;
    g.clear();
    const w = right - left;
    const kerbH = BLOCK_H * 0.22;
    g.rect(left, groundY, w, depth * 2).fill(night ? NIGHT.road : ROAD);
    g.rect(left, groundY, w, kerbH).fill(night ? NIGHT.kerb : KERB);
    g.rect(left, groundY + kerbH, w, 2).fill({ color: night ? NIGHT.ink : INK, alpha: 0.25 });
    // Centre line, dashed, well below the pavement the guests walk on.
    const dashY = groundY + kerbH + BLOCK_H * 0.42;
    const line = night ? NIGHT.roadLine : ROAD_LINE;
    for (let x = Math.floor(left / 64) * 64; x < right; x += 64) {
      g.roundRect(x, dashY, 34, 5, 2.5).fill(line);
    }
  }

  /**
   * The building's own shell: the dark frame the rooms are set into, and the
   * star rating above it.
   *
   * Drawn around the rooms the player has actually built rather than around
   * the whole plot, so an empty plot shows a street and a sky rather than an
   * empty box, and the frame grows as the hotel does.
   */
  private drawShell(outline: ShellRect | null, gridH: number, stars: number,
                    night: boolean): void {
    const g = this.shell;
    g.clear();
    if (!outline) return;

    const x = outline.x * BLOCK_W;
    const y = (gridH - outline.y - outline.h) * BLOCK_H;
    const w = outline.w * BLOCK_W;
    const h = outline.h * BLOCK_H;
    const pad = 5;

    // A frame, not a filled box. Filling the bounding box was the first
    // attempt and it painted a black slab across every gap in an L-shaped
    // hotel — which is what every hotel looks like while it is being built.
    // Stroked, the gaps show sky and the frame still reads as the building's
    // outer edge: the heaviest line in the picture, as ART-0 §4 asks.
    // The frame follows the rooms into night for the same reason the sky does:
    // every outline baked into a `*_night` room image has had the wash applied
    // to it, so a day-dark frame around them would be the one hard black edge
    // in a picture that no longer has any.
    const ink = night ? NIGHT.ink : INK;
    g.roundRect(x - pad, y - pad, w + pad * 2, h + pad * 2, 6)
      .stroke({ width: 5, color: ink, alignment: 0.5 });
    // A parapet along the top, so the building has a top rather than stopping.
    g.roundRect(x - pad - 4, y - pad - 8, w + pad * 2 + 8, 10, 4).fill(ink);

    if (stars > 0) {
      const gap = 26;
      const cx0 = x + w / 2 - ((stars - 1) * gap) / 2;
      for (let i = 0; i < stars; i++) {
        drawStar(g, cx0 + i * gap, y - pad - 26, 11);
      }
    }
  }
}

/**
 * A five-pointed star, filled gold with a darker rim.
 *
 * The one thing above the street the night wash is not applied to. Washed, the
 * gold went to a dead olive and the rating read as three grey smudges; a
 * hotel's star sign is lit, which is also why the city behind it keeps a
 * scatter of lit windows in the same gold.
 */
function drawStar(g: Graphics, cx: number, cy: number, r: number): void {
  const pts: number[] = [];
  for (let i = 0; i < 10; i++) {
    const angle = (Math.PI / 5) * i - Math.PI / 2;
    const radius = i % 2 === 0 ? r : r * 0.44;
    pts.push(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius);
  }
  g.poly(pts).fill(GOLD).stroke({ width: 2, color: GOLD_DARK });
}

/** The smallest block rectangle containing every room, or null if there are none. */
export function boundingBox(rooms: ShellRect[]): ShellRect | null {
  if (rooms.length === 0) return null;
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  for (const r of rooms) {
    minX = Math.min(minX, r.x);
    minY = Math.min(minY, r.y);
    maxX = Math.max(maxX, r.x + r.w);
    maxY = Math.max(maxY, r.y + r.h);
  }
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}
