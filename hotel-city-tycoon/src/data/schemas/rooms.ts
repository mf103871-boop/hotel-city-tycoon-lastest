import { z } from 'zod';
import { FileHeader, Id, I18nKey, AssetKey, Level, NonNegInt, PosInt, Price, Blocks } from './common.ts';

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
