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

const CHAR_W = 48;
const CHAR_H = 72;
const WALK_FRAMES = 6;
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

const DESIRE_COLOUR: Record<string, number> = {
  food: 0xe08030,
  fitness: 0xf07858,
  nightlife: 0x9a7ab8,
  entertainment: 0x7fc4a0,
  wellness: 0x6ec0c0,
};

export interface CharacterViewData {
  assetKey: string;
  /** Fractional block coordinates. */
  x: number;
  y: number;
  facing: 'left' | 'right';
  desire: string | null;
  draggable: boolean;
  opacity: number;
  kind: 'guest' | 'staff';
  /** What the character is doing. Drives whether the walk cycle runs. */
  activity: 'walking' | 'waiting' | 'resting' | 'working' | 'leaving';
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
      `${data.facing},${data.desire ?? ''},${data.draggable},${data.opacity.toFixed(2)}`;
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
      this.sprite.width = CHAR_W * 0.55;
      this.sprite.height = CHAR_H * 0.55;
      this.sprite.scale.x = Math.abs(this.sprite.scale.x) * (data.facing === 'left' ? -1 : 1);
      this.sprite.visible = true;
      this.fallback.clear();
    } else {
      this.sprite.visible = false;
      this.fallback.clear();
      const w = 12;
      const h = 34;
      this.fallback.roundRect(-w / 2, -h, w, h * 0.62, 2)
        .fill(data.kind === 'staff' ? 0x6ec0c0 : 0xb8a898);
      this.fallback.circle(0, -h + 2, 5).fill(0xf0c8a0);
    }

    // A ring marks a guest the player can still pull back to reception.
    this.grabRing.clear();
    if (data.draggable) {
      this.grabRing.circle(0, -6, 15).stroke({ width: 2, color: 0xe08030, alpha: 0.7 });
    }

    this.bubble.clear();
    if (data.desire) {
      const colour = DESIRE_COLOUR[data.desire] ?? 0xd9a441;
      this.bubble.roundRect(-9, -56, 18, 15, 4).fill(0x241a16).stroke({ width: 1, color: colour });
      this.bubble.circle(0, -48, 4).fill(colour);
      this.bubble.moveTo(-3, -41).lineTo(3, -41).lineTo(0, -37).fill(0x241a16);
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
