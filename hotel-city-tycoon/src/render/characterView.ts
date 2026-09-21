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
 *
 * Since HC-P2-S3 (DEC-020) a person with a cast identity is drawn by the live
 * rig — joints posed by arithmetic every frame, fixed parts moved onto them —
 * and the sheet sprite is the fallback for an asset key the cast does not
 * know. The clip player and the scheduler are shared by both paths: the JSON
 * still decides what clip plays, for how long, and when a blink happens.
 */
import { Container, Graphics, Sprite } from 'pixi.js';
import { texture, assetGeneration } from './assets.ts';
import { framesFor, animOf, clipOf } from './anim/sheet.ts';
import {
  createMotion, resetMotion, step, snapTo, fadeAlpha,
} from './anim/motion.ts';
import type { MotionSample } from './anim/motion.ts';
import {
  createPlayer, resetPlayer, setBase, playOnce, advance, progress,
} from './anim/clipPlayer.ts';
import { createScheduler, resetScheduler, tick, FIDGET_MS } from './anim/scheduler.ts';
import type { SchedulerConfig, Fidget } from './anim/scheduler.ts';
import {
  pose, createRigState, resetRigState, figureFor, headExtent, STRIDE_PX, NEUTRAL_INPUT,
} from './anim/rig.ts';
import type { RigProportions, RigInput, RigClip } from './anim/rig.ts';
import { lookFor } from './anim/cast.ts';
import type { Look } from './anim/cast.ts';
import { CharacterRig } from './characterRig.ts';
import type { Expression } from './characterRig.ts';
import { motionTier } from './quality.ts';
import { BLOCK_W, BLOCK_H, blockToWorld, bandDepth, DEPTH_CHARACTER_BIAS } from './layout.ts';
import { INK, NIGHT_TINT, nightfall } from './backdrop.ts';
import { duskTint } from './lighting.ts';

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
 * How often a character blinks and fidgets when their own file says nothing.
 *
 * The rates the animation files carry are the real ones; this is what a
 * character falls back to before their sheet has loaded, inside ART-0 §11's
 * "every 2.5–5 s, varied timing".
 */
const DEFAULT_SCHEDULE: SchedulerConfig = {
  blinkEveryMs: [2500, 5000],
  fidgetEveryMs: [3500, 8000],
  fidgets: ['shiftWeight', 'glance'],
};

/**
 * What this character's sheet lets them do while idle.
 *
 * Read from the manifest rather than passed down from the bridge: whether a
 * blink is possible is a fact about the sheet, and the sheet is the manifest's
 * to describe. A character with no blink row still shifts their weight.
 */
function scheduleFor(assetKey: string): SchedulerConfig {
  const fidgets: Fidget[] = ['shiftWeight', 'glance'];
  if (clipOf(assetKey, 'blink')) fidgets.push('blink');
  return { ...DEFAULT_SCHEDULE, fidgets };
}

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

/** The clips the rig knows how to pose; anything else a one-shot names falls back to the base clip. */
const RIG_CLIPS: ReadonlyArray<RigClip> = ['idle', 'walk', 'work', 'sleep', 'sit', 'happy', 'angry', 'scared'];
const RIG_CLIP_INDEX: ReadonlyMap<string, number> = new Map(RIG_CLIPS.map((c, i) => [c, i]));

/**
 * The face for what the person is doing and feeling: the clip first, the
 * mood next, the member's own expression otherwise (characters.py's
 * `expression`). Snapshot rate, so a one-shot reaction keeps the face it
 * started with.
 */
function expressionFor(clip: CharacterViewData['clip'], mood: CharacterViewData['mood'], own: Look['expression']): Expression {
  if (clip === 'sleep') return 'sleep';
  if (clip === 'scared') return 'scared';
  if (clip === 'angry' || mood === 'angry') return 'cross';
  if (clip === 'happy' || mood === 'happy') return 'happy';
  return own;
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
  /**
   * Quantised 0..24 night amount for people standing OUTSIDE (y < 0); people
   * inside keep `night` (DEC-018). Someone on the pavement is lit by the
   * street, and the street now dims through dusk whether or not the hotel
   * is trading.
   */
  dusk?: number;
}

export class CharacterView extends Container {
  private readonly sprite = new Sprite();
  private readonly fallback = new Graphics();
  private readonly bubble = new Graphics();
  private readonly grabRing = new Graphics();
  private readonly motion = createMotion();
  private readonly player = createPlayer();
  private readonly scheduler = createScheduler(0);
  private schedule: SchedulerConfig = DEFAULT_SCHEDULE;
  /** The last snapshot, kept so every frame can move towards it. */
  private sample: MotionSample = { x: 0, y: 0, vx: 0, vy: 0, toX: 0, toY: 0, segment: '' };
  private plotHeight = 1;
  private baseAlpha = 1;
  private baseFacing: 1 | -1 = 1;
  private frame = FALLBACK_FRAME;
  private drawn = '';
  private impatient = false;
  private lastAssetKey = '';

  // The live rig (HC-P2-S3). `rigInput` is filled in place every frame.
  private readonly rig = new CharacterRig();
  private readonly rigState = createRigState(0);
  private readonly rigInput: RigInput = { ...NEUTRAL_INPUT };
  private proportions: RigProportions | null = null;
  private look: Look | null = null;
  /** Who this is (asset generation + key): drives contexts, once per person. */
  private lookKey = '';
  /** Everything else about the appearance that a snapshot can change: tints, face, tool, facing, bubble. */
  private cheapKey = '';
  /** The light alone, so a dusk step re-tints without re-dressing. */
  private lightKey = '';
  /** Where the feet were last frame, in blocks; NaN until a frame has been posed since a settle. */
  private prevX = NaN;
  private prevY = NaN;
  private blinkLeftMs = 0;
  /** The lite tier's last posed key: the pose is recomputed only when it changes. */
  private rigKey = -1;
  private mood: CharacterViewData['mood'] = 'neutral';
  /** The top of the standing figure incl. hair and hat, world px above the feet — where the bubble hangs. */
  private standingTop = 0;
  private readonly timing = (name: string) => clipOf(this.lastAssetKey, name);

  constructor() {
    super();
    this.sprite.anchor.set(0.5, 1);
    this.sprite.visible = false;
    this.rig.visible = false;
    this.addChild(this.grabRing, this.fallback, this.sprite, this.rig, this.bubble);
  }

  update(data: CharacterViewData, plotHeight: number): void {
    // Position is carried every frame in tickAnimation, so it is stored here
    // and left out of the dirty key: a walking character would otherwise
    // re-tessellate their bubble and grab ring ten times a second.
    this.lastAssetKey = data.assetKey;
    this.plotHeight = plotHeight;
    this.baseAlpha = data.opacity;
    this.impatient = data.mood === 'impatient';
    this.sample.x = data.x;
    this.sample.y = data.y;
    this.sample.vx = data.vx;
    this.sample.vy = data.vy;
    this.sample.toX = data.toX;
    this.sample.toY = data.toY;
    this.sample.segment = data.segment;
    if (this.scheduler.seed !== data.seed) {
      resetScheduler(this.scheduler, data.seed);
      resetRigState(this.rigState, data.seed);
    }
    this.schedule = scheduleFor(data.assetKey);
    setBase(this.player, data.clip);
    this.mood = data.mood;

    // Two keys. Who the person is assigns the rig's geometry (a context
    // change rebuilds the world's draw list, so it happens once per person);
    // everything else a snapshot can change — facing, light, face, tool,
    // bubble — is a tint, an alpha, a scale or a redraw of the bubble alone.
    const lookKey = `${assetGeneration()},${data.assetKey}`;
    const cheapKey = `${data.facing},${data.desire ?? ''},${data.draggable},${data.opacity.toFixed(2)},` +
      `${data.night ? 'n' : 'd'},${data.dusk ?? 0},${data.clip},${data.mood}`;
    const lookChanged = lookKey !== this.lookKey;
    if (!lookChanged && cheapKey === this.cheapKey) return;
    this.lookKey = lookKey;
    this.cheapKey = cheapKey;

    this.baseFacing = data.facing === 'left' ? -1 : 1;
    const spec = animOf(data.assetKey);
    this.frame = spec?.frame ?? FALLBACK_FRAME;
    const frame = this.frame;
    const art = framesFor(data.assetKey, data.clip)?.[0]
      ?? framesFor(data.assetKey, 'idle')?.[0]
      ?? texture(data.assetKey);
    // Outside the building the light is the sky's; inside it is the room's.
    const outside = data.y < 0;
    const lit = (day: number): number => (outside
      ? duskTint(day, data.dusk ?? 0)
      : (data.night ? nightfall(day) : day));
    const lightKey = `${outside ? 'o' : 'i'}${data.night ? 'n' : 'd'}${data.dusk ?? 0}`;
    if (lookChanged) {
      this.look = lookFor(data.assetKey);
      this.proportions = this.look ? figureFor(this.look.build, this.look.height, this.look.age) : null;
      if (this.look && this.proportions) {
        const p = this.proportions;
        const ext = headExtent(this.look.hairStyle, this.look.capStyle);
        this.standingTop = (-p.headCy + ext.up * p.headR + ext.upStroke) * CHARACTER_ART_SCALE;
      }
    }
    if (this.look && this.proportions) {
      // The rig draws this person. The sheet stays loaded and unused behind
      // it; the capsule is only ever drawn for somebody without a look, so it
      // is cleared once, when the look arrives, not on every snapshot.
      this.drawn = '';
      this.sprite.visible = false;
      if (lookChanged) this.fallback.clear();
      this.rig.setLook(this.look, this.proportions, lit, CHARACTER_ART_SCALE, lookKey);
      if (!lookChanged && lightKey !== this.lightKey) this.rig.setTints(lit);
      this.rig.setExpression(expressionFor(data.clip, data.mood, this.look.expression), data.clip === 'sleep');
      this.rig.setProp(data.clip === 'work' ? 'work' : 'idle');
      this.rig.setSeated(data.clip === 'sit');
      this.rig.setLying(data.clip === 'sleep');
      this.rig.setFacing(this.baseFacing);
      this.rig.visible = true;
    } else if (art) {
      this.rig.visible = false;
      this.drawn = '';
      this.sprite.texture = art;
      this.sprite.width = frame.w * CHARACTER_ART_SCALE;
      this.sprite.height = frame.h * CHARACTER_ART_SCALE;
      this.sprite.scale.x = Math.abs(this.sprite.scale.x) * this.baseFacing;
      this.sprite.tint = outside ? duskTint(0xffffff, data.dusk ?? 0) : (data.night ? NIGHT_TINT : 0xffffff);
      this.sprite.visible = true;
      this.fallback.clear();
    } else {
      this.rig.visible = false;
      this.sprite.visible = false;
      this.fallback.clear();
      const w = 12;
      const h = 34;
      const body = data.kind === 'staff' ? 0x57c2e8 : 0xa7a1d3;
      const face = 0xf7d3b5;
      this.fallback.roundRect(-w / 2, -h, w, h * 0.62, 2).fill(lit(body));
      this.fallback.circle(0, -h + 2, 5).fill(lit(face));
    }
    this.lightKey = lightKey;

    // A ring marks a guest the player can still pull back to reception.
    this.grabRing.clear();
    if (data.draggable) {
      this.grabRing.circle(0, -6, 15).stroke({ width: 2, color: 0xf5c24d, alpha: 0.8 });
    }

    // The bubble is a warm white card with an ink rim, like every other thing
    // drawn in this world. It used to be filled with the interface's dark
    // brown, which was the only brown inside the hotel and made the desire
    // dot's own colour hard to read against it.
    //
    // Its tail ends 4 px over the top of the drawn person: the rig's standing
    // top, hat and hair included, or the sheet frame's fixed −37 for the
    // fallback sprite (the card at −56, the mark at −48, the tail from −42).
    this.bubble.clear();
    if (data.desire) {
      const want = DESIRE[data.desire] ?? DESIRE.food!;
      const card = data.night ? nightfall(BUBBLE) : BUBBLE;
      const rim = data.night ? nightfall(INK) : INK;
      const tip = this.bubbleTip();
      this.bubble.roundRect(-9, tip - 19, 18, 15, 4).fill(card).stroke({ width: 1, color: rim });
      drawDesireMark(this.bubble, want.mark, 0, tip - 11, 4,
        data.night ? nightfall(want.colour) : want.colour, rim);
      this.bubble.moveTo(-3, tip - 5).lineTo(3, tip - 5).lineTo(0, tip).fill(card);
    }
  }

  /** Where the bubble's tail points, world px above the feet (negative). */
  private bubbleTip(): number {
    return this.look ? -this.standingTop - 4 : -37;
  }

  /**
   * One frame: carry the position towards the simulation's, advance the clip
   * at its own rate, and let the character blink or shift their weight.
   *
   * Driven by wall-clock rather than simulation ticks on purpose: this is
   * presentation, and tying it to the tick would make characters march at
   * 10Hz. The simulation stays deterministic; the legs do not need to be.
   *
   * Two clocks live here, deliberately apart (ART-0 §11): the position moves
   * at the display's rate, so nothing steps; the drawn frames step at the
   * clip's own 8 to 12 a second, read from the manifest.
   */
  tickAnimation(deltaMs: number): void {
    const reduced = prefersReducedMotion();
    const lite = motionTier() === 'lite';

    // Position, every frame. Characters still travel under reduced motion —
    // freezing them would lose the information that somebody is arriving.
    step(this.motion, this.sample, deltaMs);
    // How far the feet went, in world px: the stride is driven by this, not
    // by time. Zero on the first frame after a settle, so a person who was
    // culled does not arrive mid-cycle; capped at half a stride so a clamped
    // dt cannot spin the legs.
    const movedPx = Number.isNaN(this.prevX) ? 0 : Math.min(STRIDE_PX / 2,
      Math.hypot((this.motion.x - this.prevX) * BLOCK_W, (this.motion.y - this.prevY) * BLOCK_H));
    this.prevX = this.motion.x;
    this.prevY = this.motion.y;
    this.place();

    // The small human things, while they are standing about doing nothing.
    const settled = this.sample.vx === 0 && this.sample.vy === 0;
    const busy = this.player.base === 'sleep' || this.player.base === 'walk';
    const beat = tick(this.scheduler, deltaMs, this.schedule,
      !reduced && settled && !busy, this.impatient);
    if (this.look) {
      // The rig blinks by shutting the eyes for the blink row's own length
      // (frames / fps, from the JSON — DEC-012's duration clause) without
      // restarting the base clip, so a working reach does not jump back.
      if (beat.play === 'blink') {
        const row = clipOf(this.lastAssetKey, 'blink');
        if (row) this.blinkLeftMs = (row.frames / row.fps) * 1000;
      } else if (beat.play && clipOf(this.lastAssetKey, beat.play)) playOnce(this.player, beat.play);
    } else if (beat.play && clipOf(this.lastAssetKey, beat.play)) playOnce(this.player, beat.play);

    // A glance is a look over the shoulder: the one fidget that is a flip
    // rather than a frame, so it costs nothing to draw and reads at any size.
    const facing: 1 | -1 = beat.holding === 'glance' ? (this.baseFacing === 1 ? -1 : 1) : this.baseFacing;

    const { clip, frame } = advance(this.player, deltaMs, this.timing, reduced);
    if (!this.look || !this.proportions) {
      const key = `${clip}:${frame}`;
      if (key !== this.drawn) {
        const frames = framesFor(this.lastAssetKey, clip);
        const art = frames?.[frame] ?? frames?.[0];
        if (art) {
          this.drawn = key;
          this.sprite.texture = art;
          this.sprite.width = this.frame.w * CHARACTER_ART_SCALE;
          this.sprite.height = this.frame.h * CHARACTER_ART_SCALE;
          this.sprite.visible = true;
        }
      }
      this.sprite.scale.x = Math.abs(this.sprite.scale.x) * facing;
      return;
    }

    // The rig. The clip's own duration is the clock: on the full tier its
    // continuous progress, on the lite tier the frame index the sheet would
    // have shown.
    const row = clipOf(this.lastAssetKey, clip);
    const frames = row?.frames ?? 1;
    const t = lite ? frame / frames : progress(this.player, this.timing);
    const rigClip = RIG_CLIP_INDEX.has(clip) ? clip as RigClip
      : RIG_CLIP_INDEX.has(this.player.base) ? this.player.base as RigClip : 'idle';
    const holding = beat.holding === 'blink' ? null : beat.holding;
    const inp = this.rigInput;
    inp.clip = rigClip;
    inp.clipT = t;
    inp.frames = frames;
    inp.oneShot = this.player.oneShot !== null;
    inp.movedPx = movedPx;
    inp.facing = facing;
    inp.dtS = deltaMs / 1000;
    inp.holding = holding;
    inp.holdT = holding ? Math.min(1, Math.max(0, 1 - this.scheduler.activeLeftMs / FIDGET_MS[holding])) : 0;
    inp.mood = this.mood;
    inp.reduced = reduced;
    inp.lite = lite;
    const p = pose(this.rigState, this.proportions, inp);
    const eyesShut = this.blinkLeftMs > 0 || rigClip === 'sleep';
    if (lite) {
      // Only when the sampled key changes: Pixi's setters are equality-guarded
      // anyway, but on the canvas lane the pose itself is the cost to skip.
      const key = (((RIG_CLIP_INDEX.get(rigClip) ?? 0) * 64 + frame) * 64
        + Math.floor(this.rigState.phase * frames)) * 4 + (facing > 0 ? 2 : 0) + (eyesShut ? 1 : 0);
      if (key !== this.rigKey) {
        this.rigKey = key;
        this.rig.setFacing(facing);
        this.rig.apply(p, eyesShut);
      }
    } else {
      this.rig.setFacing(facing);
      this.rig.apply(p, eyesShut);
    }
    this.blinkLeftMs -= deltaMs;
  }

  /** Whether this person is the live rig, drawn from their sheet, or still the placeholder capsule. */
  drawnSource(): 'rig' | 'sheet' | 'none' {
    return this.rig.visible ? 'rig' : this.sprite.visible ? 'sheet' : 'none';
  }

  /** Whether this person's sheet has arrived — the fallback the rig stands in front of. */
  sheetReady(): boolean {
    return framesFor(this.lastAssetKey, 'idle') !== null;
  }

  /** The standing figure's top, hat included, in world px above the feet (0 on the sheet path). */
  standingTopPx(): number {
    return this.look ? this.standingTop : 0;
  }

  /** How many Graphics the rig is made of, for `hct.rigStats()`. */
  rigPartCount(): number {
    return this.rig.partCount();
  }

  /**
   * Play a one-shot in answer to something that happened — a check-in, a
   * fire, a guest leaving happy. Ignored when this character's sheet has no
   * such row, which is how a reaction stays optional per character.
   */
  react(clip: string): void {
    if (!clipOf(this.lastAssetKey, clip)) return;
    playOnce(this.player, clip);
  }

  /**
   * Put the view where the simulation says, with no easing.
   *
   * For a character who was off screen: they must be in the right place the
   * moment they are drawn again, not slide in from wherever the camera left
   * them. The container is moved too, not only the motion state, because the
   * scene's cull reads the container's position: a view that only updated
   * its motion stayed wherever it was last drawn — for a view fresh from the
   * pool, the plot origin — and on a phone whose fitted camera does not
   * contain that point it was culled every frame and never drawn at all.
   */
  settle(): void {
    snapTo(this.motion, this.sample);
    // The next posed frame must not read the snap as a stride.
    this.prevX = NaN;
    this.prevY = NaN;
    this.place();
  }

  /**
   * The container's position, alpha and draw order from the motion state.
   *
   * Draw order by the foot the character stands on, so two people passing
   * each other overlap the way the room does. The pool never reorders its
   * children, so without this the order was whatever recycling produced.
   * The same formula places the room's furniture (`decorView.ts`), which is
   * what lets somebody walk behind a sofa and in front of the next one.
   */
  private place(): void {
    const base = blockToWorld(0, this.motion.y, this.plotHeight);
    const x = this.motion.x * BLOCK_W;
    const y = base.y + BLOCK_H;
    this.position.set(x, y);
    this.alpha = this.baseAlpha * fadeAlpha(this.motion);
    this.zIndex = bandDepth(x, y, DEPTH_CHARACTER_BIAS);
  }

  reset(): void {
    this.drawn = '';
    this.impatient = false;
    this.baseAlpha = 1;
    this.baseFacing = 1;
    this.frame = FALLBACK_FRAME;
    // Pools hand one view to many characters in turn. Anything remembered
    // here would follow a departed guest into the next arrival — the position
    // most visibly of all, as a slide across the plot.
    resetMotion(this.motion);
    resetPlayer(this.player);
    resetScheduler(this.scheduler, 0);
    this.schedule = DEFAULT_SCHEDULE;
    this.alpha = 1;
    this.visible = true;
    this.renderable = true;
    this.sprite.visible = false;
    this.bubble.clear();
    this.grabRing.clear();
    resetRigState(this.rigState, 0);
    this.rig.visible = false;
    this.look = null;
    this.proportions = null;
    this.lookKey = '';
    this.cheapKey = '';
    this.lightKey = '';
    this.rigKey = -1;
    this.blinkLeftMs = 0;
    this.mood = 'neutral';
    this.standingTop = 0;
    this.prevX = NaN;
    this.prevY = NaN;
  }
}
