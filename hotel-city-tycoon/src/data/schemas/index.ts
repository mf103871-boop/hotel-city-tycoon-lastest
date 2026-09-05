import { z } from 'zod';
import { FileHeader, Id, I18nKey, AssetKey, Level, NonNegInt, PosInt, Ratio, Price, CurrencyId } from './common.ts';

export * from './common.ts';
export * from './economy.ts';
export * from './rooms.ts';
export * from './animations.ts';

export const ShiftsSchema = z.object({
  ...FileHeader,
  /** How long a guest already being served may finish after the shift ends. */
  graceSec: NonNegInt,
  graceNote: z.string().optional(),
  shifts: z.array(z.object({
    id: Id, nameKey: I18nKey, durationSec: PosInt, baseCost: NonNegInt,
    currency: CurrencyId, unlockLevel: Level, assetKey: AssetKey,
    /** Income earned per guest while this shift runs. Short shifts pay more. */
    incomeMultiplier: z.number().positive(),
  })).min(1),
  tuningNote: z.string().optional(),
  closedHotel: z.object({
    incomeMultiplier: z.number().min(0),
    dirtRateMultiplier: z.number().positive(),
    pestChanceMultiplier: z.number().positive(),
    guestsWalkAway: z.boolean(),
  }),
});

export const StarsSchema = z.object({
  ...FileHeader,
  tiers: z.array(z.object({
    stars: z.number().int().min(1).max(5),
    minAvgDecorFill: Ratio, minCommercialRooms: NonNegInt,
    minCleanliness: Ratio, minGuestRooms: NonNegInt,
    incomeMultiplier: z.number().positive(), arrivalMultiplier: z.number().positive(),
    dailyBonusCoins: NonNegInt,
  })).length(5),
  score: z.object({
    weights: z.object({
      roomQuality: Ratio, guestSatisfaction: Ratio, cleanliness: Ratio,
      amenityCoverage: Ratio, staffService: Ratio,
    }),
    thresholds: z.object({ two: NonNegInt, three: NonNegInt, four: NonNegInt, five: NonNegInt }),
    note: z.string().optional(),
  }),
});

export const GuestsSchema = z.object({
  ...FileHeader,
  desireTags: z.array(z.string()).min(1),
  types: z.array(z.object({
    id: Id, nameKey: I18nKey, assetKey: AssetKey,
    spawnWeight: PosInt, payMultiplier: z.number().positive(), stayMultiplier: z.number().positive(),
    patienceSec: PosInt, minTier: PosInt, maxTier: PosInt, desireChance: Ratio,
    unlockLevel: Level, special: z.string().optional(),
  })).min(1),
});

export const StaffSchema = z.object({
  ...FileHeader,
  roles: z.array(z.object({
    id: Id, nameKey: I18nKey, assetKey: AssetKey, roomTypes: z.array(Id).min(1),
    wagePerHour: NonNegInt, tempWagePerHour: NonNegInt, hireCost: NonNegInt, unlockLevel: Level,
  })).min(1),
  grades: z.array(z.object({
    id: Id, nameKey: I18nKey, efficiency: z.number().positive(),
    wageMultiplier: z.number().positive(), weight: PosInt,
  })).min(1),
});

export const EventsSchema = z.object({
  ...FileHeader,
  events: z.array(z.object({
    id: Id, nameKey: I18nKey, assetKey: AssetKey,
    trigger: z.object({ kind: z.string() }).passthrough(),
    scope: z.enum(['room', 'hotel']),
    blocksIncome: z.boolean(),
    cooldownSec: NonNegInt,
    unlockLevel: Level,
  }).passthrough()).min(1),
});

export const PlotsSchema = z.object({
  ...FileHeader,
  expansions: z.array(z.object({
    id: Id, blocks: PosInt, grid: z.object({ w: PosInt, h: PosInt }),
    cost: NonNegInt, unlockLevel: Level,
  })).min(1),
});

export const DecorSchema = z.object({
  ...FileHeader,
  slotTypes: z.array(z.string()).min(1),
  categories: z.array(z.string()).min(1),
  items: z.array(z.object({
    id: Id, category: z.string(), slotType: z.enum(['wall', 'floor', 'ceiling', 'bed', 'equipment']),
    nameKey: I18nKey, assetKey: AssetKey, decorPoints: PosInt, cost: Price,
    unlockLevel: Level, sellable: z.boolean(), giftable: z.boolean(), tier: PosInt,
    /*
     * Which rooms may hold this piece, as a list of tokens: a room id
     * (`gym`), a room category (`guest`), or `any`. An empty list means the
     * same as `any` — it is what every piece meant before the field existed.
     *
     * This is what gives each room a catalogue of its own. The slotType rule
     * in economy.json is coarse by design (no bed outside a bedroom, no
     * equipment inside one); it cannot say that a treadmill belongs in the
     * gym and not in the arcade, and the gym's list is the whole point.
     */
    roomScope: z.array(z.string().min(1)).min(1),
  })).min(1),
  /*
   * Each room's own shop: exactly eight item ids, sold in this room and in no
   * other, in the order of the room's numbered places (roomAnchors.ts designs
   * one slot per position). A piece in no catalogue is a built-in.
   */
  catalogues: z.record(z.string().min(1), z.array(Id).length(8)),
});

export const NeighboursSchema = z.object({
  ...FileHeader,
  count: PosInt,
  visitsPerDay: PosInt,
  visitReward: z.object({ xp: NonNegInt }),
  names: z.array(z.string().min(1)).min(8),
  profiles: z.array(z.object({
    id: Id,
    growthPerDay: z.number().positive(),
    starCeiling: z.number().int().min(1).max(5),
  }).passthrough()).min(1),
});

export const ShopSchema = z.object({
  ...FileHeader,
  refreshHours: PosInt,
  slots: PosInt,
  discount: z.object({ min: Ratio, max: Ratio }),
  featured: z.object({ discount: Ratio, note: z.string().optional() }),
});

export const SeasonsSchema = z.object({
  ...FileHeader,
  seasons: z.array(z.object({
    id: Id, nameKey: I18nKey, descKey: I18nKey,
    from: z.string().regex(/^\d{2}-\d{2}$/), to: z.string().regex(/^\d{2}-\d{2}$/),
    incomeMultiplier: z.number().positive(), arrivalMultiplier: z.number().positive(),
    dailyGems: NonNegInt, decorDiscount: Ratio,
  })).min(1),
});

export const GiftsSchema = z.object({
  ...FileHeader,
  resetHours: PosInt,
  itemPeriodDays: PosInt,
  maxItemCost: NonNegInt,
  tuningNote: z.string().optional(),
});

export const UpgradesSchema = z.object({
  ...FileHeader,
  upgrades: z.array(z.object({
    id: Id, nameKey: I18nKey, descKey: I18nKey, assetKey: AssetKey,
    effect: z.enum(['arrivalRate', 'income', 'staffEfficiency', 'wageDiscount', 'amenityCapacity']),
    unlockLevel: Level,
    tiers: z.array(z.object({ cost: PosInt, value: z.number().positive() })).min(1),
  })).min(1),
});

export const ObjectivesSchema = z.object({
  ...FileHeader,
  objectives: z.array(z.object({
    id: Id, titleKey: I18nKey, hintKey: I18nKey,
    /*
     * The condition kinds the checker actually implements.
     *
     * `z.string()` accepted anything, and the checker returned "complete" for
     * anything it did not recognise — so a typo in this file paid its reward
     * immediately and silently. An objective worth 190,000 coins could be
     * claimed by misspelling its own condition.
     */
    check: z.object({
      kind: z.enum([
        'hotelOpen', 'level', 'stars', 'guestsServed',
        'plotBlocks', 'roomCount', 'anyRoomFill', 'cleanliness',
        'reputation', 'amenityCoverage',
      ]),
    }).passthrough(),
    group: z.enum(['tutorial', 'milestone', 'goal']),
    rewardCoins: NonNegInt, rewardGems: NonNegInt,
  })).min(1),
  groupNote: z.string().optional(),
});

export const LevelsSchema = z.object({
  ...FileHeader,
  maxLevel: PosInt,
  curve: z.object({ formula: z.string(), note: z.string().optional() }),
  levels: z.array(z.object({
    level: Level, xpTotal: NonNegInt, xpToNext: NonNegInt.nullable(),
    rewardCoins: NonNegInt, rewardGems: NonNegInt,
    unlocks: z.array(z.object({ kind: z.string(), id: Id })),
  })).min(1),
});
