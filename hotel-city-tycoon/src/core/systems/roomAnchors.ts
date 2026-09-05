/**
 * Where a piece of furniture goes, and how big it is drawn — the room plans.
 *
 * DEC-010 gave a placed piece an anchor; `decorPlacement.ts` picks one by
 * scanning the room row by row for the first free cell. That is correct and it
 * is deterministic, and it looks like what it is: furniture queueing up along
 * a grid. HC-P1-S5 replaced the scan's opinion with a *designed slot table*.
 *
 * ### What a slot is
 *
 * One row per place a room keeps something, in the order the room wants them
 * filled. A slot carries four numbers rather than two:
 *
 *   - `x`, `y` — the anchor, in DEC-010 units (16 per block, 8px across and
 *     6px down), measured from the room's own top-left. This is the point the
 *     sprite hangs from, exactly as before.
 *   - `w`, `h` — the BOX the sprite is fitted inside, in the same units. The
 *     picture is scaled down to fit, keeping its aspect ratio, and never
 *     scaled up past its natural size.
 *
 * The box is why the plan can promise the player specific sizes as well as
 * specific places. Before it, every floor piece in the game — a stool, a
 * grand piano, a marble floor — was drawn at exactly 39.6x39.6px, because
 * the only size in the system came from the sprite's slot type. A room's
 * narrow strip of free floor got the same 40px box as a ballroom, and the
 * overflow simply hung over whatever was painted next to it.
 *
 * ### Where the numbers come from
 *
 * Each room's own picture. `tools/selftest/room-fixtures.json` records what
 * every room paints and where, and `tools/selftest/slots.ts` proves that no
 * slot in this file stands a sprite on top of the building or hangs one
 * outside the room. Those two files are the reason these numbers can be
 * trusted: they were measured against the art rather than guessed, and the
 * measurement is re-checked on every run.
 *
 * That check found what the player was complaining about. Under the old
 * point list the laundry stood furniture inside two of its own washing
 * machines, the gym put a treadmill in the middle of the mirror, the cinema
 * put five pieces under the screen, and the pool put two of them in the
 * water.
 *
 * ### Why the numbers are here rather than in `data/`
 *
 * A placement slot is a fact about the *picture* — it exists because the
 * lobby's desk occupies the right third and the pool is mostly water, so
 * furniture has to go somewhere else. Room art and these numbers change
 * together; the economy does not care. That is the same reasoning that keeps
 * `decorArt.ts` out of `data/`.
 */
import type { SimData } from '../data-source.ts';
import { roomById } from '../data-source.ts';
import {
  ANCHOR_UNITS_PER_BLOCK, anchorBoundsFor, anchorKey,
} from './decorPlacement.ts';

/**
 * The five kinds of place a piece can occupy.
 *
 * Fewer kinds than categories on purpose: a table, an armchair, a palm and a
 * washing machine all want the same thing — a clear patch of floor to stand
 * on — and giving each its own list would mean four sets of numbers that have
 * to agree with each other.
 */
export type SpotKind = 'wall' | 'ceiling' | 'ground' | 'bed' | 'surface';

export interface Spot {
  x: number;
  y: number;
}

/** A designed place in a room: an anchor, and the box the art is fitted into. */
export interface Slot extends Spot {
  kind: SpotKind;
  /** Box width in anchor units (8px each). */
  w: number;
  /** Box height in anchor units (6px each). */
  h: number;
  /**
   * The piece the building itself puts here — the laundry's washing machines,
   * the gym's treadmill, the bed in a bedroom.
   *
   * A fixture is drawn, and nothing else. It is not in `room.decor`, it costs
   * nothing, it scores no decor points, it cannot be sold and it does not use
   * up a slot the player paid for, so it moves no number in the economy. What
   * it does is stop a newly built room looking like an empty box, and give the
   * player something to upgrade: buying a piece of the same category takes the
   * fixture's place, which is what "replace what is already in the room"
   * means from the inside.
   */
  fixture?: string;
}

/** Which kind of spot each decor category asks for. */
const KIND_BY_CATEGORY: Readonly<Record<string, SpotKind>> = {
  wallpaper: 'wall',
  wallArt: 'wall',
  lighting: 'ceiling',
  flooring: 'surface',
  rug: 'surface',
  bed: 'bed',
  seating: 'ground',
  table: 'ground',
  plant: 'ground',
  luxury: 'ground',
  appliance: 'ground',
  storage: 'ground',
};

/** Fallback for a category nobody has classified: go by the surface it names. */
const KIND_BY_SLOT_TYPE: Readonly<Record<string, SpotKind>> = {
  wall: 'wall',
  ceiling: 'ceiling',
  floor: 'ground',
  bed: 'bed',
  equipment: 'ground',
};

export function spotKindFor(category: string, slotType: string): SpotKind {
  return KIND_BY_CATEGORY[category] ?? KIND_BY_SLOT_TYPE[slotType] ?? 'ground';
}

/**
 * When a room runs out of slots of the kind a piece wants, it is offered the
 * next best surface rather than dropped straight to the scan. A rug and a
 * chair both live on the floor; a poster and a wallpaper panel both live on
 * the wall. Nothing here ever moves a piece between the floor and the wall.
 */
const NEIGHBOURING_KINDS: Readonly<Record<SpotKind, SpotKind[]>> = {
  ground: ['bed', 'surface'],
  bed: ['ground', 'surface'],
  surface: ['ground', 'bed'],
  wall: [],
  ceiling: [],
};

type Layout = Readonly<Record<string, readonly Slot[]>>;

const s = (kind: SpotKind, x: number, y: number, w: number, h: number,
           fixture?: string): Slot =>
  (fixture === undefined ? { kind, x, y, w, h } : { kind, x, y, w, h, fixture });

/**
 * The painted floor line of a room, in anchor units.
 *
 * `hcstyle.room_shell` puts it at `h - max(9, h * 0.14)`, which is 82.56px —
 * 13.76 units — in every one-block-high room. Three rooms override it: the
 * disco's dance floor is deeper, and the pool's deck deeper still, so a
 * sunbed standing at unit 14 stood two units inside the water. The
 * presidential suite is the only two-storey room and has a second standing
 * line, the mezzanine deck at unit 16, which its plan uses directly.
 */
const FLOOR_LINE: Readonly<Record<string, number>> = { spa: 12, pool: 10 };

export function floorLineFor(roomDefId: string, blocksH: number): number {
  return FLOOR_LINE[roomDefId] ?? blocksH * ANCHOR_UNITS_PER_BLOCK - 2;
}

/**
 * The plans, one ordered list per room.
 *
 * Generated against `tools/selftest/room-fixtures.json` and then checked by
 * `tools/selftest/slots.ts` on every run, so a number typed here that would
 * put a sofa through the reception desk fails the build rather than shipping.
 */
const LAYOUTS: Layout = {
  lobby: [
    // The eight pieces lobby sells, in catalogue order.
    s('ground', 15, 14, 5, 7), // 0: storage_luggageRack
    s('ground', 29, 14, 5, 7), // 1: luxury_aquarium
    s('wall', 15, 8, 5, 5), // 2: wallArt_cityMap
    s('wall', 8, 8, 6, 6), // 3: wallArt_masterpiece
    s('wall', 29, 8, 6, 6), // 4: wallpaper_gilded
    s('ceiling', 17, 0, 4, 5), // 5: lighting_lobbyLantern
    s('ceiling', 10, 0, 5, 5), // 6: lighting_chandelier
    s('surface', 29, 14, 5, 7), // 7: flooring_marble
    // What the room comes furnished with.
    s('ground', 8, 14, 5, 7, 'seating_lobbyBench'),
    s('surface', 8, 14, 5, 7, 'rug_entranceRunner'),
  ],
  housekeeping: [
    // The eight pieces housekeeping sells, in catalogue order.
    s('ground', 3, 14, 5, 7, 'storage_supplyCart'), // 0: storage_linenShelf
    s('ground', 9, 14, 4, 7, 'storage_laundryBasket'), // 1: storage_amenityShelf
    s('ground', 14, 14, 4, 7), // 2: appliance_vacuum
    s('surface', 4, 14, 6, 7), // 3: flooring_concrete
    s('surface', 12, 14, 5, 7), // 4: rug_mat
    s('wall', 12, 7, 6, 5), // 5: wallArt_roomStatusBoard
    s('wall', 11, 12, 7, 4), // 6: wallpaper_plain
    s('ceiling', 12, 0, 5, 4), // 7: lighting_bulb
  ],
  laundry: [
    // The eight pieces laundry sells, in catalogue order.
    s('ground', 4, 14, 5, 7, 'appliance_washer'), // 0: appliance_commercialWasher
    s('ground', 24, 14, 5, 7, 'appliance_washer'), // 1: appliance_foldingTable
    s('ground', 19, 14, 3, 7), // 2: plant_succulent
    s('ground', 30, 14, 4, 7), // 3: appliance_ironingBoard
    s('surface', 9, 14, 5, 7), // 4: flooring_drainTile
    s('wall', 9, 4, 6, 6), // 5: wallArt_lostSockBoard
    s('wall', 23, 4, 6, 6), // 6: wallpaper_utilityTile
    s('ceiling', 17, 0, 5, 4), // 7: lighting_laundryBatten
    // What the room comes furnished with.
    s('ground', 14, 14, 5, 7, 'appliance_dryer'),
  ],
  staffRoom: [
    // The eight pieces staffRoom sells, in catalogue order.
    s('ground', 14, 14, 5, 7, 'storage_lockers'), // 0: storage_miniFridge
    s('ground', 30, 14, 4, 7, 'appliance_coffeeMachine'), // 1: appliance_snackVending
    s('ground', 20, 14, 5, 7), // 2: seating_staffSofa
    s('ground', 25, 14, 3, 7), // 3: plant_bonsai
    s('surface', 14, 14, 5, 7), // 4: rug_kitchenMat
    s('surface', 28, 14, 6, 7), // 5: flooring_scuffedLino
    s('wall', 13, 5, 7, 6), // 6: wallArt_starEmployee
    s('ceiling', 25, 0, 3, 5), // 7: lighting_stringBulbs
  ],
  maintenance: [
    // The eight pieces maintenance sells, in catalogue order.
    s('ground', 14, 14, 4, 7, 'storage_toolRack'), // 0: storage_partsBin
    s('ground', 19, 14, 4, 7), // 1: table_deskWood
    s('ground', 25, 14, 5, 7, 'storage_stepLadder'), // 2: storage_safeCabinet
    s('surface', 25, 14, 5, 7), // 3: flooring_checkerPlate
    s('surface', 19, 14, 5, 7), // 4: rug_antiFatigueMat
    s('wall', 14, 6, 6, 6), // 5: wallArt_breakerPanel
    s('wall', 28, 6, 7, 7), // 6: wallpaper_breezeBlock
    s('ceiling', 20, 2, 5, 5), // 7: lighting_cageLamp
  ],
  business: [
    // The eight pieces business sells, in catalogue order.
    s('ground', 3, 14, 6, 7, 'appliance_printer'), // 0: appliance_paperShredder
    s('ground', 11, 14, 8, 7), // 1: table_meetingTable
    s('surface', 11, 14, 8, 7), // 2: flooring_officeCarpet
    s('wall', 11, 8, 7, 7), // 3: wallArt_projectorScreen
    s('ground', 28, 14, 6, 7), // 4: plant_lobbyFicus
    s('ceiling', 36, 2, 6, 5), // 5: lighting_officePanel
    s('wall', 44, 8, 7, 7), // 6: wallpaper_officePartition
    s('ground', 44, 14, 7, 7), // 7: luxury_gallerypiece
  ],
  economy: [
    // The eight pieces economy sells, in catalogue order.
    s('bed', 3, 14, 6, 6, 'bed_cot'), // 0: bed_metalFrame
    s('ground', 9, 14, 4, 7), // 1: table_crateNightstand
    s('surface', 3, 14, 6, 7), // 2: flooring_carpet
    s('surface', 9, 14, 4, 7), // 3: rug_woolRug
    s('wall', 3, 11, 6, 6), // 4: wallpaper_striped
    s('wall', 9, 7, 4, 5), // 5: wallArt_poster
    s('ceiling', 9, 0, 4, 4), // 6: lighting_ceilingFan
    s('ceiling', 14, 0, 4, 5), // 7: lighting_lamp
  ],
  standard: [
    // The eight pieces standard sells, in catalogue order.
    s('bed', 4, 14, 8, 6, 'bed_single'), // 0: bed_paintedSpindle
    s('surface', 2, 14, 4, 7), // 1: flooring_oak
    s('surface', 8, 14, 4, 7), // 2: rug_persianRug
    s('wall', 2, 11, 4, 5), // 3: wallArt_bedsideSconce
    s('wall', 7, 11, 4, 5), // 4: wallArt_print
    s('wall', 9, 3, 4, 6), // 5: wallpaper_damask
    s('ceiling', 4, 0, 5, 3), // 6: lighting_pendant
    s('ceiling', 14, 0, 4, 5), // 7: lighting_paperLantern
  ],
  double: [
    // The eight pieces double sells, in catalogue order.
    s('bed', 5, 14, 8, 6, 'bed_single'), // 0: bed_twinBrass
    s('bed', 15, 14, 8, 6, 'bed_single'), // 1: bed_twinOak
    s('ground', 22, 14, 4, 7), // 2: table_twinNightstand
    s('ground', 30, 14, 3, 7), // 3: luxury_chevalMirror
    s('surface', 5, 14, 6, 7), // 4: rug_silkRug
    s('surface', 15, 14, 6, 7), // 5: flooring_mosaic
    s('wall', 22, 8, 5, 6), // 6: wallpaper_velvet
    s('ceiling', 22, 0, 4, 4), // 7: lighting_crystalTiers
  ],
  family: [
    // The eight pieces family sells, in catalogue order.
    s('bed', 5, 14, 7, 6, 'bed_single'), // 0: bed_trundleBed
    s('ground', 12, 14, 5, 7), // 1: seating_rockingHorse
    s('surface', 5, 14, 7, 7), // 2: rug_antiqueRug
    s('surface', 20, 14, 8, 7), // 3: rug_roadPlaymat
    s('wall', 20, 3, 8, 4), // 4: wallpaper_mural
    s('wall', 28, 2, 4, 4), // 5: wallArt_painting
    s('ceiling', 4, 0, 5, 4), // 6: lighting_starfield
    s('ceiling', 12, 0, 5, 4), // 7: lighting_balloonLantern
    // What the room comes furnished with.
    s('bed', 20, 14, 8, 6, 'bed_cot'),
    s('bed', 20, 10, 8, 4, 'bed_cot'),
  ],
  deluxe: [
    // The eight pieces deluxe sells, in catalogue order.
    s('bed', 12, 14, 8, 6, 'bed_queen'), // 0: bed_loftSleigh
    s('ground', 3, 14, 5, 7), // 1: seating_armchair
    s('surface', 12, 14, 6, 7), // 2: rug_silkrunner
    s('ground', 20, 14, 5, 7), // 3: table_glassTable
    s('surface', 20, 14, 6, 7), // 4: flooring_inlaidparquet
    s('wall', 20, 8, 6, 6), // 5: wallArt_commissionedportrait
    s('ceiling', 26, 0, 6, 4), // 6: lighting_loftRattan
    s('ground', 30, 14, 4, 7), // 7: plant_fern
  ],
  executive: [
    // The eight pieces executive sells, in catalogue order.
    s('ground', 16, 14, 4, 7), // 0: seating_chaise
    s('surface', 17, 14, 6, 7), // 1: rug_antiquecarpet
    s('bed', 23, 14, 8, 6, 'bed_king'), // 2: bed_leatherWingback
    s('ground', 30, 14, 4, 7), // 3: luxury_minibar
    s('ground', 35, 14, 4, 7), // 4: table_writingdesk
    s('ceiling', 34, 2, 3, 5), // 5: lighting_bankersPendant
    s('ground', 40, 14, 4, 7), // 6: plant_indoorolivetree
    s('wall', 45, 2, 6, 4), // 7: wallArt_worldClocks
  ],
  honeymoon: [
    // The eight pieces honeymoon sells, in catalogue order.
    s('bed', 15, 14, 8, 6, 'bed_canopy'), // 0: bed_petalCanopy
    s('ground', 5, 14, 5, 7), // 1: seating_velvetchaise
    s('ground', 22, 14, 4, 7), // 2: plant_orchidWall
    s('ground', 27, 14, 4, 7), // 3: luxury_jacuzzi
    s('surface', 15, 14, 6, 7), // 4: rug_roseGarland
    s('wall', 22, 8, 5, 6), // 5: wallpaper_handpaintedsilk
    s('wall', 2, 8, 4, 6), // 6: wallArt_originallandscape
    s('ceiling', 21, 0, 3, 4), // 7: lighting_roseChandelier
  ],
  luxurySuite: [
    // The eight pieces luxurySuite sells, in catalogue order.
    s('ground', 4, 14, 5, 7), // 0: plant_wintergarden
    s('bed', 14, 14, 8, 6, 'bed_floating'), // 1: bed_emperorbed
    s('wall', 14, 8, 7, 6), // 2: wallpaper_gildedpanelling
    s('ceiling', 18, 0, 5, 5), // 3: lighting_crystalchandelier
    s('ground', 23, 14, 5, 7), // 4: table_marbleconsole
    s('ground', 41, 14, 5, 7), // 5: seating_salonset
    s('surface', 45, 14, 6, 7), // 6: rug_ermineHearth
    s('ground', 49, 14, 5, 7), // 7: luxury_fireplace
    // What the room comes furnished with.
    s('bed', 32, 14, 8, 6, 'bed_floating'),
  ],
  presidential: [
    // The eight pieces presidential sells, in catalogue order.
    s('bed', 26, 30, 8, 6, 'bed_fourposter'), // 0: bed_stateBed
    s('ground', 15, 16, 5, 7), // 1: seating_throne
    s('ground', 24, 16, 5, 7), // 2: table_crystalTable
    s('ground', 17, 30, 5, 7), // 3: luxury_piano
    s('ground', 46, 30, 4, 7), // 4: luxury_goldStatue
    s('surface', 17, 30, 6, 7), // 5: flooring_onyxfloor
    s('wall', 30, 7, 7, 7), // 6: wallArt_crossedStandards
    s('ceiling', 15, 2, 5, 5), // 7: lighting_constellationlights
    // What the room comes furnished with.
    s('bed', 6, 16, 8, 6, 'bed_fourposter'),
  ],
  cafe: [
    // The eight pieces cafe sells, in catalogue order.
    s('ground', 18, 14, 4, 7, 'table_cafeTable'), // 0: appliance_espressoBar
    s('ground', 23, 14, 4, 7, 'seating_cafeChair'), // 1: seating_stool
    s('ground', 29, 14, 5, 7), // 2: appliance_cakeDisplay
    s('surface', 23, 14, 5, 7), // 3: rug_latteRug
    s('surface', 29, 14, 5, 7), // 4: flooring_macaronTiles
    s('wall', 4, 2, 5, 4), // 5: wallArt_cupcakeBunting
    s('ceiling', 10, 0, 5, 4), // 6: lighting_cupcakePendant
    s('wall', 17, 4, 4, 8), // 7: wallpaper_sprinkleWall
  ],
  gym: [
    // The eight pieces gym sells, in catalogue order.
    s('ground', 3, 14, 5, 7, 'appliance_treadmill'), // 0: appliance_rowingMachine
    s('ground', 9, 14, 5, 7, 'storage_dumbbellRack'), // 1: appliance_weightRack
    s('ground', 15, 14, 5, 7), // 2: appliance_spinBike
    s('ground', 21, 14, 5, 7), // 3: appliance_punchBag
    s('ground', 27, 14, 5, 7), // 4: storage_towelStack
    s('surface', 22, 14, 6, 7), // 5: rug_yogaMat
    s('wall', 30, 2, 4, 4), // 6: wallArt_intervalTimer
    s('ceiling', 17, 2, 3, 5), // 7: lighting_gymHighBay
  ],
  restaurant: [
    // The eight pieces restaurant sells, in catalogue order.
    s('ground', 19, 14, 5, 7, 'table_diningTable'), // 0: table_marbleTable
    s('ground', 26, 14, 5, 7, 'seating_cafeChair'), // 1: seating_loveseat
    s('ground', 32, 14, 5, 7), // 2: luxury_cocktailCart
    s('ground', 38, 14, 5, 7), // 3: storage_wineRack
    s('ground', 44, 14, 5, 7), // 4: appliance_prepStation
    s('surface', 32, 14, 5, 7), // 5: flooring_bistroCheck
    s('wall', 12, 4, 6, 5), // 6: wallArt_brasserieMirror
    s('ceiling', 22, 2, 5, 5), // 7: lighting_candelabra
  ],
  bar: [
    // The eight pieces bar sells, in catalogue order.
    s('ground', 24, 14, 4, 7, 'seating_barStool'), // 0: appliance_beerTap
    s('ground', 30, 14, 4, 7, 'seating_barStool'), // 1: luxury_privatebar
    s('wall', 24, 8, 4, 6), // 2: wallpaper_bottleGreen
    s('wall', 30, 8, 4, 6), // 3: wallArt_sculptureWall
    s('ceiling', 21, 0, 3, 5), // 4: lighting_neonCocktail
    s('ceiling', 1, 0, 2, 4), // 5: lighting_pubLantern
    s('surface', 28, 14, 5, 7), // 6: flooring_pubBoards
    s('surface', 23, 14, 2, 7), // 7: rug_barMat
  ],
  arcade: [
    // The eight pieces arcade sells, in catalogue order.
    s('ground', 9, 14, 5, 7), // 0: appliance_pinballTable
    s('ground', 15, 14, 5, 7), // 1: appliance_clawMachine
    s('ground', 22, 14, 6, 7), // 2: appliance_airHockey
    s('ground', 29, 14, 5, 7), // 3: storage_displayCase
    s('surface', 12, 14, 6, 7), // 4: flooring_galaxyCarpet
    s('surface', 25, 14, 5, 7), // 5: rug_danceGameMat
    s('wall', 15, 7, 7, 6), // 6: wallArt_hiScoreBoard
    s('ceiling', 3, 2, 5, 5), // 7: lighting_hologram
    // What the room comes furnished with.
    s('ground', 3, 14, 5, 7, 'appliance_arcadeCabinet'),
  ],
  cinema: [
    // The eight pieces cinema sells, in catalogue order.
    s('ground', 28, 14, 5, 7, 'seating_cinemaSeats'), // 0: seating_loungeBooth
    s('ground', 36, 14, 5, 7), // 1: appliance_popcornCart
    s('ground', 3, 14, 4, 7), // 2: plant_palm
    s('ground', 45, 14, 4, 7), // 3: table_sideTable
    s('wall', 45, 4, 4, 5), // 4: wallArt_nowShowingBoard
    s('ceiling', 2, 0, 4, 3), // 5: lighting_exitSign
    s('surface', 16, 14, 5, 7), // 6: rug_multiplexCarpet
    s('surface', 32, 14, 5, 7), // 7: flooring_aisleLights
    // What the room comes furnished with.
    s('ground', 12, 14, 5, 7, 'seating_cinemaSeats'),
    s('ground', 20, 14, 5, 7, 'seating_cinemaSeats'),
  ],
  spa: [
    // The eight pieces spa sells, in catalogue order.
    s('ground', 12, 12, 5, 7), // 0: appliance_fogMachine
    s('wall', 13, 7, 6, 6), // 1: wallpaper_animatedAurora
    s('ceiling', 19, 2, 5, 5), // 2: lighting_laserRig
    s('surface', 24, 12, 5, 7), // 3: flooring_ledDanceFloor
    s('ceiling', 29, 2, 5, 5), // 4: lighting_mirrorBallCluster
    s('surface', 30, 12, 5, 7), // 5: flooring_obsidian
    s('ground', 30, 12, 5, 7), // 6: luxury_goGoPodium
    s('wall', 35, 7, 6, 6), // 7: wallArt_ledVideoWall
    // What the room comes furnished with.
    s('ground', 19, 12, 6, 7, 'appliance_djBooth'),
  ],
  pool: [
    // The eight pieces pool sells, in catalogue order.
    s('ground', 62, 10, 4, 7), // 0: luxury_divingBoard
    s('ground', 57, 10, 3, 7), // 1: plant_poolPalm
    s('surface', 4, 10, 6, 7), // 2: flooring_deckTiles
    s('surface', 60, 10, 6, 7), // 3: rug_swimTowel
    s('wall', 22, 5, 5, 6), // 4: wallpaper_poolMosaic
    s('wall', 40, 5, 5, 6), // 5: wallArt_lifeguardBoard
    s('ceiling', 16, 0, 4, 4), // 6: lighting_poolFloodlight
    s('ceiling', 46, 0, 4, 4), // 7: lighting_heatLamp
    // What the room comes furnished with.
    s('ground', 2, 10, 3, 7, 'seating_sunLounger'),
    s('ground', 6, 10, 3, 7, 'luxury_parasol'),
  ],
};

/**
 * A room nobody has drawn a plan for, derived from its footprint.
 *
 * Every room in the catalogue has an entry above, so this only ever runs for a
 * room added after this file — which is exactly when a sensible default beats
 * a crash.
 */
function defaultLayout(roomDefId: string, blocksW: number, blocksH: number): readonly Slot[] {
  const w = blocksW * ANCHOR_UNITS_PER_BLOCK;
  const floor = floorLineFor(roomDefId, blocksH);
  const out: Slot[] = [];
  for (let b = 0; b < blocksW; b++) {
    const mid = b * ANCHOR_UNITS_PER_BLOCK + 8;
    out.push(s('bed', mid, floor, 8, 6));
    out.push(s('ground', mid - 4, floor, 5, 7));
    out.push(s('ground', mid + 4, floor, 5, 7));
    out.push(s('surface', mid, floor, 6, 7));
    out.push(s('wall', mid, 8, 5, 6));
    out.push(s('ceiling', mid, 2, 5, 5));
  }
  return out.length > 0 ? out : [s('ground', Math.round(w / 2), floor, 5, 7)];
}

/** Every room this file has a plan for — for the self-test's coverage check. */
export function plannedRooms(): string[] {
  return Object.keys(LAYOUTS);
}

/** The plan for one room, falling back to a footprint-derived default. */
export function layoutFor(roomDefId: string, blocksW: number, blocksH: number): readonly Slot[] {
  return LAYOUTS[roomDefId] ?? defaultLayout(roomDefId, blocksW, blocksH);
}

/**
 * The slots of one kind, in the order the room wants them filled.
 *
 * `limit` bounds the list — a room can be asked for at most as many slots as
 * `data/economy.json` lets it hold pieces.
 */
export function slotsOfKind(layout: readonly Slot[], kind: SpotKind, limit: number): Slot[] {
  return layout.filter((slot) => slot.kind === kind).slice(0, limit);
}

/** Back-compatible view of `slotsOfKind` for callers that only want positions. */
export function spotsOfKind(layout: readonly Slot[], kind: SpotKind, _roomW: number,
                            limit: number): Spot[] {
  return slotsOfKind(layout, kind, limit).map((slot) => ({ x: slot.x, y: slot.y }));
}

/**
 * The slot a piece standing at this anchor occupies, if the room designed one
 * there. This is how the renderer finds a piece's box: the anchor plus the
 * kind of thing standing on it is the identity, so nothing new has to be
 * written into the save.
 *
 * The kind matters because a floor covering is *meant* to share its place with
 * the chair standing on it, so a room can have a `surface` slot and a `bed`
 * slot at the same coordinate. Without the kind, a rug laid in the economy
 * room resolved to the bed's slot and was drawn in the bed's box.
 */
export function slotAt(roomDefId: string, blocksW: number, blocksH: number,
                       x: number, y: number, kind?: SpotKind): Slot | null {
  const layout = layoutFor(roomDefId, blocksW, blocksH);
  const here = layout.filter((slot) => slot.x === x && slot.y === y);
  if (here.length === 0) return null;
  return (kind && here.find((slot) => slot.kind === kind)) ?? here[0]!;
}

/** What the building puts in this room before the player buys anything. */
export interface RoomFixture {
  /** Stable within a room: the slot's index in its plan. */
  slot: number;
  defId: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * The key a slot is occupied by, which is its kind AND its anchor.
 *
 * Not the anchor alone. A room may design a `surface` slot and a `bed` slot at
 * the same coordinate on purpose — a rug belongs under the bed standing on it
 * — and keying on the anchor alone meant that laying a rug in the economy room
 * made its built-in bed vanish.
 */
export function occupancyKey(kind: SpotKind, x: number, y: number): string {
  return `${kind}:${x},${y}`;
}

/**
 * The fixtures of a room that nothing is standing in front of.
 *
 * `occupied` holds `occupancyKey` values for the room's own pieces. A bought
 * piece standing in a fixture's slot hides it — that is the upgrade the player
 * can see — and a rug lying across a bed's feet hides nothing.
 */
export function fixturesFor(roomDefId: string, blocksW: number, blocksH: number,
                            occupied: ReadonlySet<string>): RoomFixture[] {
  const out: RoomFixture[] = [];
  const layout = layoutFor(roomDefId, blocksW, blocksH);
  for (let i = 0; i < layout.length; i++) {
    const slot = layout[i]!;
    if (!slot.fixture) continue;
    if (occupied.has(occupancyKey(slot.kind, slot.x, slot.y))) continue;
    out.push({ slot: i, defId: slot.fixture, x: slot.x, y: slot.y, w: slot.w, h: slot.h });
  }
  return out;
}

/** A piece already in the room, as this file needs to see it. */
export interface PlacedPiece {
  defId: string;
  localX: number;
  localY: number;
}

/** Kinds that stand on the floor and therefore compete for the same span of it. */
const STANDS_ON_FLOOR: ReadonlySet<SpotKind> = new Set<SpotKind>(['ground', 'bed']);

/**
 * Where this piece goes in this room, or null if the plan has nothing left.
 *
 * Null is not a failure: it is this file saying it has no opinion, and the
 * caller falling back to `firstFreeAnchor`'s scan — which always answers.
 * Each candidate is pulled inside the room's legal range for that piece's own
 * reach before it is offered, so a number typed into a layout above can be
 * wrong about a room's size without ever putting furniture through a wall.
 *
 * `placed` is what the room already holds; a slot another piece is standing
 * in is skipped. Floor coverings are the one exception, and it is the point of
 * the rule rather than a hole in it: a rug is *supposed* to share its place
 * with the chair standing on it (decorArt.ts draws it first), so a surface
 * slot only avoids other surfaces.
 *
 * Deterministic by construction: an ordered array, scanned in order, with no
 * randomness and no dependence on object key order.
 */
export function anchorFor(
  data: SimData | null,
  roomDefId: string | undefined,
  defId: string,
  taken: ReadonlySet<string>,
  maxPieces = 24,
  placed: readonly PlacedPiece[] = [],
): Spot | null {
  if (!data || !roomDefId) return null;
  const def = data.decor.find((d) => d.id === defId);
  const room = roomById(data, roomDefId);
  if (!def || !room) return null;

  const kind = spotKindFor(def.category, def.slotType);
  const bounds = anchorBoundsFor(data, roomDefId);
  const layout = layoutFor(roomDefId, room.blocks.w, room.blocks.h);

  /*
   * What is standing where, and what class of thing it is.
   *
   * A room may design two places at one coordinate on purpose — a rug lies
   * under the bed standing on it, and `decorArt.ts` draws floor coverings
   * first for exactly that reason. Twelve coordinates across the 23 rooms are
   * shared that way, eight of them a bed and its rug.
   *
   * So one point may hold two pieces, but only ever one floor covering and one
   * thing standing on it. Blocking by the bare anchor made a rug take the
   * bed's place away, so the next bed bought for that room fell through to the
   * scan; ignoring the classes entirely would let a second rug stack on the
   * first. The test is therefore whether the piece being placed and what is
   * already there are complementary.
   *
   * `taken` is still honoured for anchors the caller did not describe: it is
   * all some callers pass, and a busy anchor of unknown class is best treated
   * as busy.
   */
  const occupiedBy = new Map<string, Set<SpotKind>>();
  const described = new Set<string>();
  for (const p of placed) {
    const at = anchorKey(p.localX, p.localY);
    described.add(at);
    const other = data.decor.find((d) => d.id === p.defId);
    if (!other) continue;
    const has = occupiedBy.get(at) ?? new Set<SpotKind>();
    has.add(spotKindFor(other.category, other.slotType));
    occupiedBy.set(at, has);
  }
  const isBlocked = (spot: Spot): boolean => {
    const at = anchorKey(spot.x, spot.y);
    const here = occupiedBy.get(at);
    if (here) {
      for (const other of here) {
        if ((other === 'surface') === (kind === 'surface')) return true;
      }
      return false;
    }
    return taken.has(at) && !described.has(at);
  };

  /*
   * A slot is offered as it was designed, pulled back only inside the room's
   * own footprint.
   *
   * It used to be clamped by the piece's category reach instead
   * (`anchorRange`), which was right while the reach was the only description
   * of how big a piece is drawn, and became wrong the moment the slot carried
   * its own box: a bed asking for the business centre's first floor slot was
   * pushed one unit right of it, so the armchair that took the same slot next
   * ended up standing across the bed. The slot's box is the size now, and
   * `tools/selftest/slots.ts` proves every box is inside its room, so there is
   * nothing left for the reach to correct.
   */
  const clamp = (slot: Slot): Spot => ({
    x: Math.min(Math.max(slot.x, 0), bounds.w - 1),
    y: Math.min(Math.max(slot.y, 0), bounds.h - 1),
  });

  /*
   * The order the room offers its places, and it is the whole behaviour a
   * player sees.
   *
   * A piece takes an empty place of its own kind first, so a bought plant does
   * not evict the laundry's washing machine. Failing that it takes the place
   * of a built-in of the SAME category — a better washer standing where the
   * built-in washer stood, which is the upgrade the player asked for. Only
   * when its own kind is exhausted does it spill onto a neighbouring surface,
   * and only at the very end may it displace a built-in of another kind.
   */
  const sameCategory = (slot: Slot): boolean => {
    if (!slot.fixture) return false;
    const built = data.decor.find((d) => d.id === slot.fixture);
    return !!built && built.category === def.category;
  };
  const free = (slot: Slot): boolean => !slot.fixture;
  const anything = (): boolean => true;
  const own = [kind];
  const near = NEIGHBOURING_KINDS[kind];
  const order: Array<[SpotKind[], (slot: Slot) => boolean]> = [
    [own, free], [own, sameCategory],
    [near, free], [near, sameCategory],
    [own, anything], [near, anything],
  ];

  for (const [kinds, accepts] of order) {
    for (const candidateKind of kinds) {
      for (const slot of slotsOfKind(layout, candidateKind, maxPieces)) {
        if (!accepts(slot)) continue;
        const spot = clamp(slot);
        if (isBlocked(spot)) continue;
        return spot;
      }
    }
  }
  return null;
}

/**
 * The place a room keeps for the piece it sells at this position.
 *
 * A room's catalogue (`decor.json` `catalogues`, `catalogueIndex`) lists
 * eight pieces in slot order, and the first eight entries of its plan above
 * are those eight places, in the same order — so the position of a piece in
 * the room's list is the whole of where it goes. That is what makes every
 * piece land in the same designed spot every time, far from the others: no
 * scan, no "first free place of the right kind", no dependence on what was
 * bought before it.
 *
 * Null for an index the plan does not have, which is only ever a room added
 * to `rooms.json` without a plan of its own.
 */
export function catalogueSlot(roomDefId: string, blocksW: number, blocksH: number,
                              index: number): Slot | null {
  if (!Number.isInteger(index) || index < 0) return null;
  return layoutFor(roomDefId, blocksW, blocksH)[index] ?? null;
}

/** May a piece of this kind stand in this place? */
function accepts(slot: Slot, kind: SpotKind): boolean {
  return slot.kind === kind || NEIGHBOURING_KINDS[kind].includes(slot.kind);
}

/**
 * The designed place at this anchor that a piece of `kind` may take, if there
 * is one.
 *
 * REPLACE_DECOR's whole promise rests on this: a swap must land where the old
 * piece stood. Asking `anchorFor` instead walks the room's plan from the top
 * and hands back the FIRST free place of the right kind, which is only the
 * old one by coincidence — so replacing the third chair in a restaurant moved
 * it to the first table's place.
 */
export function slotForKindAt(roomDefId: string, blocksW: number, blocksH: number,
                              x: number, y: number, kind: SpotKind): Slot | null {
  const layout = layoutFor(roomDefId, blocksW, blocksH);
  return layout.find((slot) => slot.x === x && slot.y === y && accepts(slot, kind)) ?? null;
}

/**
 * The box a piece standing at this anchor is drawn in, in room-local pixels,
 * or null when no slot was designed there.
 *
 * Pixels rather than anchor units because the only caller is the renderer, and
 * `anchorToLocalPx`'s two constants live on the render side. The core keeps
 * the units; the conversion is the same 8 and 6 the whole file is built on.
 */
export function slotBoxPx(roomDefId: string, blocksW: number, blocksH: number,
                          x: number, y: number,
                          kind?: SpotKind): { w: number; h: number } | null {
  const slot = slotAt(roomDefId, blocksW, blocksH, x, y, kind);
  if (!slot) return null;
  return { w: slot.w * 8, h: slot.h * 6 };
}

/** Every kind that stands on the floor — exported for the self-tests. */
export function standsOnFloor(kind: SpotKind): boolean {
  return STANDS_ON_FLOOR.has(kind);
}
