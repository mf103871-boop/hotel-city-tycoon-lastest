/**
 * A person on screen.
 *
 * Real sprite when the art has loaded, a drawn figure when it has not — the
 * same fallback contract the rooms use, so a missing character file never
 * empties the hotel.
 *
 * The want bubble above a guest's head is the mechanic that taught players
 * what to build in the original game, so it is drawn here rather than left to
 * the HUD: it has to point at the person who wants it.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { texture, assetGeneration } from './assets.ts';
import { framesFor, animOf, clipOf } from './anim/sheet.ts';
import { BLOCK_W, BLOCK_H, blockToWorld } from './layout.ts';
import { INK, NIGHT_TINT, nightfall } from './backdrop.ts';

/** The desire bubble's card. Warm white, from ART-0 §7. */
const BUBBLE = 0xdde2df;

/**
 * The frame the placeholder is drawn against when no sheet has loaded.
 *
 * Real sizes come from the manifest's `anim` block, per character (ART-0
 * §17); these are only what the capsule falls back to before any art exists.
 */
const FALLBACK_FRAME = { w: 48, h: 72 };
/**
 * How big a character is drawn, as a fraction of its 48x72 frame.
 *
 * Was 0.55, which put a guest 40 world pixels tall in a 96-pixel room — 41% of
 * the interior, against the 58-72% ART-0 §5 asks for and the reference image
 * shows. The people were the smallest thing on screen in a game about people.
 * At 0.82 a guest stands 59 pixels tall in a 96-pixel room: the same
 * proportion as the reference, still short of the ceiling, and still clear of
 * the decor meter along the room's top edge.
 */
const CHARACTER_ART_SCALE = 0.82;

/**
 * Whether the player has asked for less motion.
 *
 * Read once and cached: this is queried per character per frame, and a media
 * query lookup in the render loop is exactly the kind of work the frame budget
 * cannot afford. A player who changes the setting reloads anyway.
 */
let reducedMotion: boolean | null = null;

export function prefersReducedMotion(): boolean {
  if (reducedMotion === null) {
    try {
      reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;
    } catch {
      reducedMotion = false;
    }
  }
  return reducedMotion;
}

/** Test hook. */
export function setReducedMotionForTests(value: boolean | null): void {
  reducedMotion = value;
}

/**
 * What a guest is asking for: a colour *and* a shape.
 *
 * Two of these used to be a hue apart and nothing else — food `#E08030` and
 * fitness `#F07858`, both mid-weight oranges, 1.03:1 apart, on a four-pixel
 * dot. To a red-green colourblind player they were the same dot.
 *
 * Recolouring alone could not fix it. The five best-separated colours this
 * palette can offer still only reach 1.35:1 in greyscale, because ART-0 §7's
 * palette is dense in green and blue and thin everywhere else — and 1.35:1 on
 * four pixels is not a message. So the mark carries the meaning and the colour
 * reinforces it, which is what §7 asks for when it rules out colour on its own.
 *
 * The colours are still the best set available: hues at 8°, 41°, 138°, 198°
 * and 253° and luminances from 0.18 to 0.80, so nothing here is a pair of
 * neighbours in either dimension.
 */
type DesireMark = 'circle' | 'square' | 'triangle' | 'diamond' | 'ring';

const DESIRE: Record<string, { colour: number; mark: DesireMark }> = {
  food: { colour: 0xfde4b0, mark: 'circle' },           // creamHi
  fitness: { colour: 0xed5c47, mark: 'square' },        // coral
  nightlife: { colour: 0x7b6bb5, mark: 'triangle' },    // grape
  entertainment: { colour: 0x5bb877, mark: 'diamond' }, // green
  wellness: { colour: 0x8fcbe4, mark: 'ring' },         // glassDk
};

/** The desire's mark, centred on (cx, cy) at radius r. */
function drawDesireMark(g: Graphics, mark: DesireMark, cx: number, cy: number,
                        r: number, colour: number, rim: number): void {
  switch (mark) {
    case 'square':
      g.rect(cx - r * 0.85, cy - r * 0.85, r * 1.7, r * 1.7);
      break;
    case 'triangle':
      g.poly([cx, cy - r * 1.1, cx + r, cy + r * 0.75, cx - r, cy + r * 0.75]);
      break;
    case 'diamond':
      g.poly([cx, cy - r * 1.15, cx + r * 1.15, cy, cx, cy + r * 1.15, cx - r * 1.15, cy]);
      break;
    case 'ring':
      // Drawn as a stroked circle, so the hole is the thing that identifies it.
      g.circle(cx, cy, r * 0.85).stroke({ width: 2, color: colour });
      g.circle(cx, cy, r * 0.85).stroke({ width: 0.75, color: rim });
      return;
    default:
      g.circle(cx, cy, r);
  }
  g.fill(colour).stroke({ width: 1, color: rim });
}

export interface CharacterViewData {
  assetKey: string;
  /** Fractional block coordinates — where the person is at the snapshot's tick. */
  x: number;
  y: number;
  /**
   * Blocks per second along the current leg of their route, and where that
   * leg ends. The bridge derives them (HC-P2-S1); the renderer carries the
   * sprite forward at this speed between two ten-hertz snapshots so motion
   * is continuous at the display's own rate.
   */
  vx: number;
  vy: number;
  toX: number;
  toY: number;
  /** Changes when a new leg begins. Within a leg the view eases; across a jump it snaps. */
  segment: string;
  facing: 'left' | 'right';
  desire: string | null;
  draggable: boolean;
  /** A tap on them does something (a resting guest may be the inspector). */
  tappable: boolean;
  opacity: number;
  kind: 'guest' | 'staff';
  /** What the character is doing. Drives whether the walk cycle runs. */
  activity: 'walking' | 'waiting' | 'resting' | 'sitting' | 'working' | 'leaving' | 'lift';
  /** The sheet row the bridge asks for. */
  clip: 'idle' | 'walk' | 'work' | 'sleep' | 'sit' | 'happy' | 'angry' | 'scared';
  mood: 'neutral' | 'impatient' | 'happy' | 'angry';
  /** This person's own seed, for blinks and fidgets that are theirs alone. */
  seed: number;
  /**
   * The hotel is shut, so everyone is standing in a room drawn after dark.
   *
   * Character art is day-lit, and without this a receptionist in full noon
   * light stood in a night lobby — the one thing on screen the wash had not
   * touched, and so the one thing that looked pasted on.
   */
  night?: boolean;
}

export class CharacterView extends Container {
  private readonly sprite = new Sprite();
  private readonly fallback = new Graphics();
  private readonly bubble = new Graphics();
  private readonly grabRing = new Graphics();
  private lastKey = '';
  private clipElapsed = 0;
  private clipFrame = -1;
  private clip = 'idle';
  private cycling = false;
  private lastAssetKey = '';

  constructor() {
    super();
    this.sprite.anchor.set(0.5, 1);
    this.sprite.visible = false;
    this.addChild(this.grabRing, this.fallback, this.sprite, this.bubble);
  }

  update(data: CharacterViewData, plotHeight: number): void {
    this.lastAssetKey = data.assetKey;
    const key = `${assetGeneration()},${data.assetKey},${data.x.toFixed(2)},${data.y},` +
      `${data.facing},${data.desire ?? ''},${data.draggable},${data.opacity.toFixed(2)},` +
      `${data.night ? 'n' : 'd'},${data.clip}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    // Feet on the floor of whichever block they occupy.
    const base = blockToWorld(0, data.y, plotHeight);
    this.position.set(data.x * BLOCK_W, base.y + BLOCK_H);
    this.alpha = data.opacity;

    // The clip the bridge asked for, whatever it is: a sleeping guest shows
    // the sleep row, a working member of staff the work row. Rows with more
    // than one frame cycle; a single-frame row simply holds.
    if (data.clip !== this.clip) { this.clip = data.clip; this.clipElapsed = 0; this.clipFrame = -1; }
    const row = clipOf(data.assetKey, this.clip);
    this.cycling = (row?.frames ?? 1) > 1;

    const spec = animOf(data.assetKey);
    const frame = spec?.frame ?? FALLBACK_FRAME;
    const art = framesFor(data.assetKey, this.clip)?.[0]
      ?? framesFor(data.assetKey, 'idle')?.[0]
      ?? texture(data.assetKey);
    if (art) {
      this.sprite.texture = art;
      this.sprite.width = frame.w * CHARACTER_ART_SCALE;
      this.sprite.height = frame.h * CHARACTER_ART_SCALE;
      this.sprite.scale.x = Math.abs(this.sprite.scale.x) * (data.facing === 'left' ? -1 : 1);
      this.sprite.tint = data.night ? NIGHT_TINT : 0xffffff;
      this.sprite.visible = true;
      this.fallback.clear();
    } else {
      this.sprite.visible = false;
      this.fallback.clear();
      const w = 12;
      const h = 34;
      const body = data.kind === 'staff' ? 0x57c2e8 : 0xa7a1d3;
      const face = 0xf7d3b5;
      this.fallback.roundRect(-w / 2, -h, w, h * 0.62, 2)
        .fill(data.night ? nightfall(body) : body);
      this.fallback.circle(0, -h + 2, 5).fill(data.night ? nightfall(face) : face);
    }

    // A ring marks a guest the player can still pull back to reception.
    this.grabRing.clear();
    if (data.draggable) {
      this.grabRing.circle(0, -6, 15).stroke({ width: 2, color: 0xf5c24d, alpha: 0.8 });
    }

    // The bubble is a warm white card with an ink rim, like every other thing
    // drawn in this world. It used to be filled with the interface's dark
    // brown, which was the only brown inside the hotel and made the desire
    // dot's own colour hard to read against it.
    this.bubble.clear();
    if (data.desire) {
      const want = DESIRE[data.desire] ?? DESIRE.food!;
      const card = data.night ? nightfall(BUBBLE) : BUBBLE;
      const rim = data.night ? nightfall(INK) : INK;
      this.bubble.roundRect(-9, -56, 18, 15, 4).fill(card).stroke({ width: 1, color: rim });
      drawDesireMark(this.bubble, want.mark, 0, -48, 4,
        data.night ? nightfall(want.colour) : want.colour, rim);
      this.bubble.moveTo(-3, -42).lineTo(3, -42).lineTo(0, -37).fill(card);
    }
  }

  /**
   * Advance the current clip.
   *
   * Driven by wall-clock rather than simulation ticks on purpose: this is
   * presentation, and tying it to the tick would make characters march at
   * 10Hz. The simulation stays deterministic; the legs do not need to be.
   *
   * The rate is the clip's own — 8 to 12 drawn frames a second, per ART-0 §11
   * — read from the manifest, while this method itself is called at the
   * display's rate. Two clocks, deliberately different.
   */
  tickAnimation(deltaMs: number): void {
    if (!this.cycling) return;
    // Characters still move across the street; their legs simply stop cycling.
    // Freezing them in place instead would lose the information that somebody
    // is arriving.
    if (prefersReducedMotion()) return;
    const row = clipOf(this.lastAssetKey, this.clip);
    const frames = framesFor(this.lastAssetKey, this.clip);
    if (!row || !frames || frames.length === 0) return;

    const cycleMs = (row.frames / row.fps) * 1000;
    this.clipElapsed = (this.clipElapsed + deltaMs) % cycleMs;
    const index = Math.floor((this.clipElapsed / cycleMs) * row.frames) % row.frames;
    if (index === this.clipFrame) return;
    this.clipFrame = index;
    this.sprite.texture = frames[index]!;
    this.sprite.visible = true;
  }

  reset(): void {
    this.lastKey = '';
    this.clipElapsed = 0;
    this.clipFrame = -1;
    this.clip = 'idle';
    this.cycling = false;
    this.alpha = 1;
    this.visible = true;
    this.renderable = true;
    this.sprite.visible = false;
    this.bubble.clear();
    this.grabRing.clear();
  }
}
