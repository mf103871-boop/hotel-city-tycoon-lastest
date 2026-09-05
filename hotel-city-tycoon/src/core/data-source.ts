/**
 * The balance data the simulation is handed.
 *
 * The core never imports `src/data` and never imports Zod. It receives a plain
 * object matching this shape. That is what lets the same core run inside the
 * app (where Zod has already validated the data), inside a unit test with a
 * hand-built fixture, and inside the headless balance simulator with no
 * dependencies installed at all.
 *
 * The shapes are declared structurally rather than imported from the Zod
 * schemas so that nothing in this directory pulls a runtime dependency. The
 * schema validation in `src/data` is what guarantees the real files match.
 */

export interface Price { currency: 'coins' | 'gems'; amount: number }
export interface Blocks { w: number; h: number }

interface RoomBase {
  id: string;
  nameKey: string;
  assetKey: string;
  blocks: Blocks;
  cost: Price;
  unlockLevel: number;
  decorSlots: number;
  decorTarget: number;
}

export interface GuestRoomDef extends RoomBase {
  category: 'guest';
  tier: number;
  beds: number;
  incomePerGuest: number;
  xpPerGuest: number;
  stayDurationSec: number;
}

export interface CommercialRoomDef extends RoomBase {
  category: 'commercial';
  capacity: number;
  incomePerCustomer: number;
  xpPerCustomer: number;
  serviceDurationSec: number;
  staffRole: string | null;
  staffSlots: number;
  desireTag: string;
}

export interface FunctionalRoomDef extends RoomBase {
  category: 'functional';
  unique: boolean;
  required: boolean;
  staffRole: string | null;
  staffSlots: number;
  function: Record<string, unknown> & { kind: string };
}

export type RoomDef = GuestRoomDef | CommercialRoomDef | FunctionalRoomDef;

export interface DecorDef {
  id: string; category: string; slotType: string; assetKey: string; nameKey: string;
  decorPoints: number; cost: Price; unlockLevel: number;
  sellable: boolean; giftable: boolean; tier: number;
  /** Room ids, room categories, or `any` — see `decorFitsRoom` in quality.ts. */
  roomScope: string[];
}

/**
 * Which pieces each kind of room sells, in slot order — `decor.json`'s
 * `catalogues`.
 *
 * Every room has a catalogue of its own: eight pieces sold nowhere else, and
 * the position of a piece in the list is the numbered place it stands in
 * (`roomAnchors.ts` designs one slot per position). A piece missing from every
 * catalogue is a built-in the room comes furnished with; it is drawn, and it
 * cannot be bought.
 */
export type DecorCatalogues = Record<string, string[]>;

export interface StaffRoleDef {
  id: string; roomTypes: string[]; wagePerHour: number; tempWagePerHour: number; hireCost: number; unlockLevel: number;
}
export interface StaffGradeDef {
  id: string; efficiency: number; wageMultiplier: number; weight: number;
}
export interface GuestTypeDef {
  id: string; spawnWeight: number; payMultiplier: number; stayMultiplier: number;
  patienceSec: number; minTier: number; maxTier: number; desireChance: number;
  unlockLevel: number; special?: string;
}
export interface ShiftDef {
  id: string; durationSec: number; baseCost: number; currency: 'coins' | 'gems'; unlockLevel: number;
  /**
   * Income per guest while this shift runs.
   *
   * Short shifts pay more, long shifts pay less. Without it the longest shift
   * was both cheapest per hour and least effort, so it strictly dominated.
   */
  incomeMultiplier: number;
}
export interface StarTier {
  stars: number; minAvgDecorFill: number; minCommercialRooms: number;
  minCleanliness: number; minGuestRooms: number;
  incomeMultiplier: number; arrivalMultiplier: number; dailyBonusCoins: number;
}
export interface PlotDef { id: string; blocks: number; grid: Blocks; cost: number; unlockLevel: number }
export interface LevelDef {
  level: number; xpTotal: number; xpToNext: number | null;
  rewardCoins: number; rewardGems: number;
  unlocks: Array<{ kind: string; id: string }>;
}
export interface EventDef {
  id: string; nameKey: string; assetKey: string;
  scope: 'room' | 'hotel'; blocksIncome: boolean;
  cooldownSec: number; unlockLevel: number;
  trigger: Record<string, unknown> & { kind: string };
  clearCost?: Price;
  clearRewardCoins?: { first: number; repeat: number; decayAfter: number };
  clearRewardXp?: number;
  /** 4C climate incidents: income multiplier while active, and how long the
   *  weather lasts if nobody calls the repair crew. */
  incomeMultiplier?: number;
  durationSec?: number;
  /** Inspection pays this per star. Read by REVEAL_GUEST. */
  rewardCoinsPerStar?: number;
  /** Inspection XP. Read by REVEAL_GUEST. */
  rewardXp?: number;
  /** The inspector's temporary rating lift. Read by REVEAL_GUEST. */
  temporaryStarBoost?: { amount: number; durationSec: number };
  /** Income multiplier while the trigger guest is in the building. */
  rewardMultiplierWhileStaying?: number;
}

export type UpgradeEffect =
  'arrivalRate' | 'income' | 'staffEfficiency' | 'wageDiscount' | 'amenityCapacity';

export interface UpgradeDef {
  id: string; nameKey: string; descKey: string; assetKey: string;
  effect: UpgradeEffect; unlockLevel: number;
  tiers: Array<{ cost: number; value: number }>;
}

export interface NeighboursDef {
  count: number;
  visitsPerDay: number;
  visitReward: { xp: number };
  names: string[];
  profiles: Array<{ id: string; growthPerDay: number; starCeiling: number }>;
}

export interface ShopDef {
  refreshHours: number; slots: number;
  discount: { min: number; max: number };
  featured: { discount: number };
}

export interface SeasonDef {
  id: string; nameKey: string; descKey: string;
  from: string; to: string;
  incomeMultiplier: number; arrivalMultiplier: number;
  dailyGems: number; decorDiscount: number;
}

export interface GiftsDef {
  resetHours: number;
  /** Days per free-item rotation — 7, the original's weekly catalogue beat. */
  itemPeriodDays: number;
  /** The free item is any coin decor piece at or under this price. */
  maxItemCost: number;
}

export interface ObjectiveDef {
  id: string; titleKey: string; hintKey: string;
  /** Which list this belongs on. Nothing is gated on any of them. */
  group: 'tutorial' | 'milestone' | 'goal';
  check: Record<string, unknown> & { kind: string };
  rewardCoins: number; rewardGems: number;
}

export interface EconomyDef {
  start: { coins: number; gems: number; level: number; stars: number; plotBlocks: number; prebuiltRooms: string[] };
  simulation: {
    tickMs: number; ticksPerSecond: number;
    /**
     * Names the resolver strategy. `resolveOffline` throws when this is
     * anything else, so it has to be part of the contract rather than read
     * through an index signature.
     */
    offlineResolution: 'analytic';
    /**
     * Corrects the closed-form model, which assumes perfect packing and so
     * overestimates live throughput. Measured, not chosen.
     */
    analyticThroughputFactor: number;
    maxOfflineHours: number; autosaveIntervalSec: number; offlineEfficiency: number;
  };
  cleanliness: {
    roomsPerCleaner: number; dirtRatePerGuestCheckout: number; cleanRatePerCleanerPerSec: number;
    incomeGateThreshold: number; pestThreshold: number; pestBlocksIncome: boolean;
  };
  guests: {
    baseArrivalPerMinute: number; arrivalRoomCountBonus: number; maxLobbyQueue: number;
    walkAwayIfNoRoom: boolean; dragToLobbyEnabled: boolean; dragToLobbyCooldownSec: number;
    walkAwaySec: number;
    /** Base seconds to check one guest in, before receptionist efficiency. */
    checkInSec: number;
    /** True blocks a shift with no receptionist; false runs a weak stand-in. */
    requireReceptionist: boolean;
    /** How well an unstaffed reception copes, when it is allowed to. */
    tempReceptionistEfficiency: number;
  };
  decorMeter: { fillCurve: 'linear' | 'easeOut'; maxIncomeBonusAtFull: number; emptyIncomePenalty: number };
  sellback: { ratio: number; refundCurrency: 'coins' | 'gems'; gemPurchasesRefundable: boolean };
  /** What it costs to keep the rooms open, charged with the shift. */
  poke: { minCoins: number; maxCoins: number; dailyCap: number; note?: string };
  upkeep: { perRoomPerHour: number; tierMultiplier: number };
  /** How a room's furnishing becomes a number between 0 and 1. */
  roomQuality: {
    repeatFalloff: number;
    varietyTargetCategories: number;
    varietyFloor: number;
    hazardConditionPenalty: number;
    slotTypeRooms: Array<{ slotType: string; categories: string[] }>;
  };
  /** How a guest's stay turns into a number between 0 and 100. */
  satisfaction: {
    base: number;
    roomQualityWeight: number; cleanlinessWeight: number; serviceWeight: number;
    amenityMetBonus: number; unmetDesirePenalty: number;
    waitPenaltyMax: number; incidentPenalty: number;
    tipThreshold: number; tipMaxRatio: number;
    reviewWindowSec: number; reputationStart: number;
    desireChanceEarlyScale: number; desireChanceEarlyUntilLevel: number;
  };
  shiftCostScaling: { formula: string; perLevel: number };
  xp: { grantOnGuestCheckout: boolean; grantOnRoomBuild: number; grantOnDecorPlace: number };
  limits: { maxRoomsPerHotel: number; maxDecorPerRoom: number; maxSaveSlots: number };
}

/** Everything the simulation is allowed to know about balance. */
export interface SimData {
  economy: EconomyDef;
  rooms: RoomDef[];
  decor: DecorDef[];
  decorCatalogues: DecorCatalogues;
  staffRoles: StaffRoleDef[];
  staffGrades: StaffGradeDef[];
  guestTypes: GuestTypeDef[];
  shifts: ShiftDef[];
  /** What a hotel does while nobody is paying to keep it open. */
  closedHotel: { incomeMultiplier: number; dirtRateMultiplier: number;
                 pestChanceMultiplier: number; guestsWalkAway: boolean };
  /**
   * Seconds after a shift ends during which guests already being served may
   * finish. Nothing new starts in that window.
   */
  graceSec: number;
  starTiers: StarTier[];
  /** The weights and bands behind the hotel score. */
  stars: {
    score: {
      weights: {
        roomQuality: number; guestSatisfaction: number; cleanliness: number;
        amenityCoverage: number; staffService: number;
      };
      thresholds: { two: number; three: number; four: number; five: number };
    };
  };
  plots: PlotDef[];
  levels: LevelDef[];
  events: EventDef[];
  objectives: ObjectiveDef[];
  upgrades: UpgradeDef[];
  shop: ShopDef;
  neighbours: NeighboursDef;
  seasons: SeasonDef[];
  gifts: GiftsDef;
}

// ---------------------------------------------------------------- helpers

/**
 * Room definitions indexed by id, per data set.
 *
 * The lookup was a linear scan in twenty-one places, several of them inside
 * the loop that touches every room ten times a second. Keyed on the data
 * object itself so a test using a different fixture cannot pick up another
 * one's index, and weak so it does not hold data alive.
 */
const roomIndexes = new WeakMap<SimData, Map<string, RoomDef>>();

export function roomById(data: SimData, id: string): RoomDef | undefined {
  let index = roomIndexes.get(data);
  if (!index) {
    index = new Map(data.rooms.map((r) => [r.id, r]));
    roomIndexes.set(data, index);
  }
  return index.get(id);
}

export function roomDef(data: SimData, id: string): RoomDef {
  // Goes through the same index as `roomById`. This used to be its own linear
  // scan, which meant two lookup paths that could disagree about which
  // definition wins when a data set carries a duplicate id.
  const def = roomById(data, id);
  if (!def) throw new Error(`Unknown room definition "${id}"`);
  return def;
}

export function decorDef(data: SimData, id: string): DecorDef {
  const def = data.decor.find((d) => d.id === id);
  if (!def) throw new Error(`Unknown decor definition "${id}"`);
  return def;
}

/** The pieces a room of this kind sells, in slot order. Empty for a room nobody catalogued. */
export function catalogueFor(data: SimData, roomDefId: string): readonly string[] {
  return data.decorCatalogues[roomDefId] ?? [];
}

/**
 * The numbered place in the room a piece belongs in, or -1 when the room does
 * not sell it. The index IS the slot: `PlacedDecor.slot` for a catalogue piece
 * is always its position in the room's list.
 */
export function catalogueIndex(data: SimData, roomDefId: string, defId: string): number {
  return catalogueFor(data, roomDefId).indexOf(defId);
}

export function shiftDef(data: SimData, id: string): ShiftDef {
  const def = data.shifts.find((s) => s.id === id);
  if (!def) throw new Error(`Unknown shift definition "${id}"`);
  return def;
}

export function isGuestRoom(def: RoomDef): def is GuestRoomDef {
  return def.category === 'guest';
}
export function isCommercialRoom(def: RoomDef): def is CommercialRoomDef {
  return def.category === 'commercial';
}
export function isFunctionalRoom(def: RoomDef): def is FunctionalRoomDef {
  return def.category === 'functional';
}
