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
import { Container, Graphics, Rectangle, Sprite, Texture } from 'pixi.js';
import { texture, assetGeneration } from './assets.ts';
import { BLOCK_W, BLOCK_H, blockToWorld } from './layout.ts';
import { INK, NIGHT_TINT, nightfall } from './backdrop.ts';

/** The desire bubble's card. Warm white, from ART-0 §7. */
const BUBBLE = 0xdde2df;

const CHAR_W = 48;
const CHAR_H = 72;
const WALK_FRAMES = 6;
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
/** A full stride cycle. Slower reads as a stroll, faster as a scurry. */
const WALK_CYCLE_MS = 620;

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
 * Sliced walk sheets, cached by key.
 *
 * Slicing allocates six textures per character type, so it happens once and
 * never inside the render loop.
 */
const walkFrames = new Map<string, Texture[] | null>();
/** The asset generation the null entries above were recorded under. */
let walkFramesGeneration = -1;

function framesFor(assetKey: string): Texture[] | null {
  // A null entry means "no sheet yet", and the sheet can still arrive: drop
  // the nulls whenever a bundle lands and keep the frames already sliced.
  const generation = assetGeneration();
  if (generation !== walkFramesGeneration) {
    walkFramesGeneration = generation;
    for (const [key, frames] of walkFrames) if (frames === null) walkFrames.delete(key);
  }
  const cached = walkFrames.get(assetKey);
  if (cached !== undefined) return cached;

  const sheet = texture(assetKey.replace(/\.(idle|walk)$/, '.walk'));
  if (!sheet) { walkFrames.set(assetKey, null); return null; }

  const frames: Texture[] = [];
  for (let i = 0; i < WALK_FRAMES; i++) {
    frames.push(new Texture({
      source: sheet.source,
      frame: new Rectangle(i * CHAR_W, 0, CHAR_W, CHAR_H),
    }));
  }
  walkFrames.set(assetKey, frames);
  return frames;
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
  private walkElapsed = 0;
  private walkFrame = -1;
  private walking = false;
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
      `${data.night ? 'n' : 'd'}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    // Feet on the floor of whichever block they occupy.
    const base = blockToWorld(0, data.y, plotHeight);
    this.position.set(data.x * BLOCK_W, base.y + BLOCK_H);
    this.alpha = data.opacity;

    // Walking characters animate; everyone else holds their idle frame.
    this.walking = data.activity === 'walking' || data.activity === 'leaving';
    if (!this.walking) this.walkFrame = -1;

    const art = this.walking
      ? (framesFor(data.assetKey)?.[0] ?? texture(data.assetKey))
      : texture(data.assetKey);
    if (art) {
      this.sprite.texture = art;
      this.sprite.width = CHAR_W * CHARACTER_ART_SCALE;
      this.sprite.height = CHAR_H * CHARACTER_ART_SCALE;
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
   * Advance the stride.
   *
   * Driven by wall-clock rather than simulation ticks on purpose: this is
   * presentation, and tying it to the tick would make characters march at
   * 10Hz. The simulation stays deterministic; the legs do not need to be.
   */
  tickAnimation(deltaMs: number): void {
    if (!this.walking) return;
    // Characters still move across the street; their legs simply stop cycling.
    // Freezing them in place instead would lose the information that somebody
    // is arriving.
    if (prefersReducedMotion()) return;
    const frames = framesFor(this.lastAssetKey);
    if (!frames) return;

    this.walkElapsed = (this.walkElapsed + deltaMs) % WALK_CYCLE_MS;
    const index = Math.floor((this.walkElapsed / WALK_CYCLE_MS) * WALK_FRAMES) % WALK_FRAMES;
    if (index === this.walkFrame) return;
    this.walkFrame = index;
    this.sprite.texture = frames[index]!;
    this.sprite.visible = true;
  }

  reset(): void {
    this.lastKey = '';
    this.walkElapsed = 0;
    this.walkFrame = -1;
    this.walking = false;
    this.alpha = 1;
    this.visible = true;
    this.renderable = true;
    this.sprite.visible = false;
    this.bubble.clear();
    this.grabRing.clear();
  }
}
