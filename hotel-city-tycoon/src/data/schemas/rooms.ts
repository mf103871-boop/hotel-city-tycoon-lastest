import { z } from 'zod';
import { FileHeader, Id, I18nKey, AssetKey, Level, NonNegInt, PosInt, Price, Blocks } from './common.ts';

/**
 * Where the ceiling, wall and floor are inside this room's own art, in
 * room-local pixels at 1x.
 *
 * Decor is positioned against these bands, not against the room's bounding
 * box: a lamp hangs from the ceiling line, an armchair stands on the floor
 * line, a wallpaper covers the wall. The floor line is at 0.70 of room height
 * in the ART-1 economy interior and 0.95 in the cafe, so a constant is wrong
 * by more than a whole anchor row in most rooms — and the art is supplied
 * rather than generated, so the numbers cannot come from the drawing code
 * either. They are measured off the pixels by tools/art/measure-interiors.mjs
 * and checked back against them by tools/selftest/room-interior.ts.
 *
 * `reviewed` marks an interior a human corrected by hand; the measuring tool
 * will not overwrite one. The detector reads a single storey, so a room drawn
 * with a mezzanine can only ever be authored that way.
 */
const Interior = z.object({
  /** Pixels of outer frame on each side, before the usable interior starts. */
  inset: NonNegInt,
  /** Last row of the cornice; the wall band starts here. */
  ceilingBottom: NonNegInt,
  /** Last row of the wall, above the skirting. */
  wallBottom: NonNegInt,
  /** First row of the floor surface, below the skirting. */
  floorTop: NonNegInt,
  /** Last row of the floor, above the bottom frame. */
  floorBottom: NonNegInt,
  reviewed: z.boolean().optional(),
}).refine(
  (i) => i.ceilingBottom < i.wallBottom && i.wallBottom < i.floorTop && i.floorTop <= i.floorBottom,
  { message: 'interior bands must run ceilingBottom < wallBottom < floorTop <= floorBottom' },
);

const Base = {
  id: Id,
  nameKey: I18nKey,
  descKey: I18nKey.optional(),
  assetKey: AssetKey,
  blocks: Blocks,
  cost: Price,
  unlockLevel: Level,
  decorSlots: NonNegInt,
  decorTarget: NonNegInt,
  interior: Interior,
};

export const GuestRoom = z.object({
  ...Base,
  category: z.literal('guest'),
  tier: z.number().int().min(1).max(9),
  beds: PosInt,
  incomePerGuest: PosInt,
  xpPerGuest: PosInt,
  stayDurationSec: PosInt,
});

export const CommercialRoom = z.object({
  ...Base,
  category: z.literal('commercial'),
  capacity: PosInt,
  incomePerCustomer: PosInt,
  xpPerCustomer: PosInt,
  serviceDurationSec: PosInt,
  staffRole: Id.nullable(),
  staffSlots: NonNegInt,
  desireTag: z.enum(['food', 'fitness', 'nightlife', 'entertainment', 'wellness']),
});

const Fn = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('entrance'), queueCapacity: PosInt }),
  z.object({ kind: z.literal('cleaning'), roomsServed: PosInt }),
  z.object({ kind: z.literal('cleaningBoost'), roomsServedBonus: PosInt, dirtRateMultiplier: z.number().positive() }),
  z.object({ kind: z.literal('wageDiscount'), wageMultiplier: z.number().positive(), stacksMax: PosInt }),
  z.object({ kind: z.literal('hazardReduction'), fireChanceMultiplier: z.number().positive(), stacksMax: PosInt }),
  z.object({ kind: z.literal('arrivalBoost'), arrivalRateMultiplier: z.number().positive(), stacksMax: PosInt }),
]);

export const FunctionalRoom = z.object({
  ...Base,
  category: z.literal('functional'),
  unique: z.boolean(),
  required: z.boolean(),
  staffRole: Id.nullable(),
  staffSlots: NonNegInt,
  function: Fn,
});

export const RoomDef = z.discriminatedUnion('category', [GuestRoom, CommercialRoom, FunctionalRoom]);

export const RoomsSchema = z.object({
  ...FileHeader,
  rooms: z.array(RoomDef).min(1),
});
export type RoomDef = z.infer<typeof RoomDef>;
export type Rooms = z.infer<typeof RoomsSchema>;
