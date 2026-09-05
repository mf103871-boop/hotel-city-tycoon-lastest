import { z } from 'zod';
import { FileHeader, NonNegInt, PosInt, Ratio } from './common.ts';

/**
 * A character's animation file — `data/animations/<kind>_<id>.json`.
 *
 * One file per staff role and guest type (HC-P2-S1, DEC-012). It is the single
 * source of truth for what the art pipeline draws (`tools/art/gen_chars.py`
 * reads the clip table to lay out the sheet), what the manifest declares
 * (`tools/gen-asset-manifest.mjs` copies the clip table into the entry's
 * `anim` block, which is what the renderer reads), and how the bridge moves
 * the character (speed, patrol, sleep routine, reactions).
 *
 * Presentation only. The simulation never reads it — it is carried in
 * `SimData.animations` so the bridge can reach it through the same injection
 * the headless tools use, and a selftest proves `src/core` never touches it.
 */

/** Every clip a sheet may carry, in no particular order. */
export const CLIP_NAMES = [
  'idle', 'blink', 'walk', 'work', 'sleep', 'sit', 'happy', 'angry', 'scared',
] as const;
export type ClipName = (typeof CLIP_NAMES)[number];

/**
 * Idle-time fidgets the renderer knows how to perform. All of them are free:
 * a held frame, a facing flip, or the blink clip when the sheet has one.
 */
export const FIDGETS = ['shiftWeight', 'glance', 'blink'] as const;

/** When a member of staff plays their `work` clip. */
export const WORK_WHEN = ['guestCheckingIn', 'cleaning', 'guestInRoom'] as const;

/**
 * The simulation events a reaction may answer to.
 *
 * Mirrored from `SimEvent['type']` in `src/core/state/types.ts`; the data
 * integrity validator checks this list against the source so the two cannot
 * drift apart silently.
 */
export const SIM_EVENT_TYPES = [
  'climateEnded', 'climateStarted', 'decorSold', 'desireUnmet', 'fireStarted',
  'ghostAppeared', 'giftClaimed', 'graceEnded', 'guestArrived', 'guestCheckedIn',
  'guestCheckedOut', 'guestLeftAngry', 'guestPoked', 'guestReviewed', 'hazardCleared',
  'incomeBlocked', 'inspectorFound', 'levelUp', 'neighbourVisited', 'nothingFound',
  'offlineResolved', 'pestAppeared', 'plotExpanded', 'roomMoved', 'roomRestored',
  'roomStored', 'seasonGemsPaid', 'serviceCalled', 'shiftEnded', 'shiftStarted',
  'shopPurchase', 'staffAssigned', 'staffFired', 'staffHired', 'staffUnassigned',
  'starBonusPaid', 'starsChanged', 'upgradeBought',
] as const;

/**
 * Frame counts and rates live inside ART-0 §11's bands: drawn motion is 8–12
 * fps at most, and a sheet row never holds more than twelve frames.
 */
export const ClipSchema = z.object({
  frames: z.number().int().min(1).max(12),
  fps: z.number().int().min(1).max(12),
  loop: z.boolean(),
});

/** `[min, max]` milliseconds, in order. */
const MsRange = z.tuple([NonNegInt, NonNegInt])
  .refine(([lo, hi]) => lo <= hi, 'range must be [min, max]');
const SecRange = z.tuple([PosInt, PosInt])
  .refine(([lo, hi]) => lo <= hi, 'range must be [min, max]');

/**
 * A row in the sheet. `.strict()` so a misspelt clip name is an error rather
 * than a silently ignored row.
 */
const ClipsSchema = z.object({
  idle: ClipSchema,
  walk: ClipSchema,
  blink: ClipSchema.optional(),
  work: ClipSchema.optional(),
  sleep: ClipSchema.optional(),
  sit: ClipSchema.optional(),
  happy: ClipSchema.optional(),
  angry: ClipSchema.optional(),
  scared: ClipSchema.optional(),
}).strict();

export const AnimationSchema = z.object({
  ...FileHeader,
  id: z.string().regex(/^(staff|guest)\.[a-z][a-zA-Z0-9]*$/, 'id must be staff.<roleId> or guest.<typeId>'),
  /** The art contract, fixed by ART-0 §17: 48×72, feet at (24, 70), facing right. */
  frame: z.object({
    w: z.literal(48),
    h: z.literal(72),
    pivot: z.object({ x: z.literal(24), y: z.literal(70) }),
    facing: z.literal('right'),
  }),
  clips: ClipsSchema,
  motion: z.object({
    walkSpeedBlocksPerSec: z.number().positive().max(4),
    /** ± fraction of the walk speed, per individual, from the entity's seed. */
    speedJitter: Ratio.max(0.5),
    turnPauseMs: NonNegInt,
    /** The fade out and in that stands for a trip between floors. */
    liftMs: PosInt,
  }),
  behaviour: z.object({
    blinkEveryMs: MsRange,
    fidgets: z.array(z.enum(FIDGETS)),
    fidgetEveryMs: MsRange,
    workWhen: z.enum(WORK_WHEN).optional(),
    /**
     * Where a member of staff wanders while nobody needs them: the room's
     * waypoints in visiting order, and how long they stay at each — one
     * dwell per point, in the same order.
     */
    patrol: z.object({
      points: z.array(z.string().min(1)).min(1),
      dwellMs: z.array(NonNegInt).min(1),
    }).refine((p) => p.points.length === p.dwellMs.length, 'one dwell per patrol point').optional(),
    sleep: z.object({ wakeEverySec: SecRange, awakeSec: PosInt }).optional(),
    /** Fraction of the patience window after which a waiting guest looks it. */
    impatientAfter: Ratio.optional(),
    /** A checkout below this satisfaction leaves angry. */
    angryBelow: z.number().min(0).max(100).optional(),
  }),
  /** Simulation event type → one-shot clip. */
  reactions: z.record(z.string(), z.enum(CLIP_NAMES)),
}).superRefine((doc, ctx) => {
  const kind = doc.id.split('.')[0];
  if (kind === 'staff' && !doc.clips.work) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips', 'work'], message: 'staff must carry a work clip' });
  }
  if (kind === 'guest' && !doc.clips.sleep) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips', 'sleep'], message: 'guests must carry a sleep clip' });
  }
  for (const [name, clip] of Object.entries(doc.clips)) {
    if (!clip) continue;
    const seconds = clip.frames / clip.fps;
    if (clip.loop && clip.frames > 1 && (seconds < 0.3 || seconds > 2.0)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips', name], message: `a loop cycles in 0.3–2.0 s (ART-0 §11); this one takes ${seconds.toFixed(2)} s` });
    }
    if (!clip.loop && (seconds < 0.1 || seconds > 1.2)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['clips', name], message: `a one-shot lasts 0.1–1.2 s (ART-0 §11); this one takes ${seconds.toFixed(2)} s` });
    }
  }
  const events = new Set<string>(SIM_EVENT_TYPES);
  for (const [event, clipName] of Object.entries(doc.reactions)) {
    if (!events.has(event)) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reactions', event], message: `"${event}" is not a simulation event` });
    }
    const clip = doc.clips[clipName as ClipName];
    if (!clip) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reactions', event], message: `reaction names clip "${clipName}", which this character does not carry` });
    } else if (clip.loop) {
      ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['reactions', event], message: `reaction "${clipName}" must be a one-shot (loop: false)` });
    }
  }
  if (kind === 'guest' && !doc.behaviour.sleep) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['behaviour', 'sleep'], message: 'guests need a sleep routine' });
  }
  if (kind === 'staff' && !doc.behaviour.workWhen) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, path: ['behaviour', 'workWhen'], message: 'staff need a workWhen rule' });
  }
});

export type AnimationDef = z.infer<typeof AnimationSchema>;
