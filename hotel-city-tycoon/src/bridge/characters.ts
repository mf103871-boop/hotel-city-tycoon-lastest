/**
 * Where every person in the hotel is, right now — and what they are doing.
 *
 * Positions are **derived**, never stored. The simulation knows a guest is
 * arriving, queued, staying or leaving, and how many ticks ago that started;
 * everything else follows from arithmetic. That keeps the save file small, the
 * simulation deterministic, and this whole layer testable without a browser.
 *
 * HC-P2-S1 made the arithmetic a journey rather than a spot: each state is a
 * route (`paths.ts`) from where the previous state left the person to the
 * movement point (`roomWaypoints.ts`) this state puts them at — the desk, the
 * bed, the stool, the door — followed by what they do there. The tick says
 * how far along the route they are. The renderer gets the point, the speed
 * along the current leg and the clip to play, and does the rest at the
 * display's own rate.
 *
 * Coordinates are in blocks, matching the grid the rooms sit on, so the
 * renderer applies exactly the same transform it already applies to rooms.
 */
import type { GameState, GuestInstance, RoomInstance, StaffInstance } from '../core/state/types.ts';
import { simData, roomDefOf, gridSize } from './selectors.ts';
import type { SimData, CharacterAnimationDef } from '../core/data-source.ts';
import { isOpen } from '../core/systems/economy.ts';
import { cleaningOrder } from '../core/systems/cleaning.ts';
import { cleanableRooms } from '../core/systems/cleanliness.ts';
import { waypoint, waypointsNamed, toBlock } from '../core/systems/roomWaypoints.ts';
import {
  PAVEMENT_Y, ENTRY_BEYOND, EXIT_BEYOND, REACT_SEC,
  personSeed, seeded, walkSpeed, speedToArrive, distance,
  walk, dwell, lift, react, travel, evaluate, totalTicks,
} from './paths.ts';
import type { Pt, Leg, PathSample } from './paths.ts';

/** The drag cooldown, read the same way the command reads it. */
function onDragCooldown(data: SimData, state: GameState): boolean {
  const ticks = Math.round(data.economy.guests.dragToLobbyCooldownSec * data.economy.simulation.ticksPerSecond);
  return state.lastDragTick >= 0 && state.tick - state.lastDragTick < ticks;
}

export type Activity = 'walking' | 'waiting' | 'resting' | 'sitting' | 'working' | 'leaving' | 'lift';

/** A row of the character's sheet. The renderer plays it; the bridge chooses it. */
export type Clip = 'idle' | 'walk' | 'work' | 'sleep' | 'sit' | 'happy' | 'angry' | 'scared';

/** How the person feels, as far as the state can tell. Drives fidgets and the leaving reaction. */
export type Mood = 'neutral' | 'impatient' | 'happy' | 'angry';

export interface CharacterView {
  id: string;
  kind: 'guest' | 'staff';
  /** Asset key for the sprite, e.g. guest.vip.idle */
  assetKey: string;
  /** Block coordinates, fractional — where the person is at this tick. */
  x: number;
  y: number;
  /** Blocks per second along the current leg of their route; zero while standing. */
  vx: number;
  vy: number;
  /** Where the current leg ends. The renderer carries them towards it between snapshots. */
  toX: number;
  toY: number;
  /** Changes whenever a new leg begins; the renderer eases within a leg and snaps across a jump. */
  segment: string;
  facing: 'left' | 'right';
  activity: Activity;
  clip: Clip;
  mood: Mood;
  /** This person's own seed: their id against the save's. Drives speed, blinks, fidgets. */
  seed: number;
  /** Amenity the guest wants, shown as an icon above their head. */
  desire: string | null;
  /** True while the player can pull them back to reception. */
  draggable: boolean;
  /** True while a tap on them does something: a resting guest may be the inspector. */
  tappable: boolean;
  /** 0..1, fades a leaving guest out as they walk off. */
  opacity: number;
}

// ---------------------------------------------------------------- data

const animIndexes = new WeakMap<SimData, Map<string, CharacterAnimationDef>>();

function animOf(kind: 'guest' | 'staff', typeId: string): CharacterAnimationDef | undefined {
  const data = simData();
  let index = animIndexes.get(data);
  if (!index) {
    index = new Map(data.animations.map((a) => [a.id, a]));
    animIndexes.set(data, index);
  }
  return index.get(`${kind}.${typeId}`);
}

/** A file's clip, if the sheet carries it. */
function hasClip(anim: CharacterAnimationDef | undefined, clip: Clip): boolean {
  return !!anim?.clips[clip];
}

// ---------------------------------------------------------------- places

interface Place { x: number; y: number; facing: 'left' | 'right'; pose: 'stand' | 'sit' | 'sleep' }

/** A room's movement point on the hotel grid, or null when the room lacks it. */
function placeIn(room: RoomInstance, name: string): Place | null {
  const def = roomDefOf(room.defId);
  const wp = waypoint(room.defId, def?.blocks.w ?? 1, def?.blocks.h ?? 1, name);
  if (!wp) return null;
  const p = toBlock(room, def?.blocks.h ?? 1, wp);
  return { x: p.x, y: p.y, facing: wp.facing, pose: wp.pose };
}

function placesIn(room: RoomInstance, prefix: string): Place[] {
  const def = roomDefOf(room.defId);
  return waypointsNamed(room.defId, def?.blocks.w ?? 1, def?.blocks.h ?? 1, prefix).map((wp) => {
    const p = toBlock(room, def?.blocks.h ?? 1, wp);
    return { x: p.x, y: p.y, facing: wp.facing, pose: wp.pose };
  });
}

/**
 * Where a room is entered from.
 *
 * The painted door when the room has one; otherwise the edge nearer the
 * lobby, so a guest crossing the same floor walks in from the side they
 * came from rather than through the far wall.
 */
function doorOf(room: RoomInstance, lobby: RoomInstance | undefined): Place {
  const door = placeIn(room, 'door');
  if (door) return door;
  const def = roomDefOf(room.defId);
  const centre = room.x + (def?.blocks.w ?? 1) / 2;
  const lobbyCentre = lobby ? lobby.x + (roomDefOf(lobby.defId)?.blocks.w ?? 2) / 2 : 0;
  const name = centre > lobbyCentre ? 'edgeLeft' : 'edgeRight';
  return placeIn(room, name) ?? { x: room.x + 0.5, y: room.y, facing: 'right', pose: 'stand' };
}

function lobbyRoom(state: GameState): RoomInstance | undefined {
  return state.hotel.rooms.find((r) => r.defId === 'lobby');
}

/** The street and the reception, on the hotel grid. */
interface Street {
  entry: Pt;
  exit: Pt;
  /** On the pavement, at the lobby's door. */
  doorOut: Pt;
  /** Just inside the lobby's door. */
  doorIn: Place;
  deskFront: Place;
  queue: (place: number) => Place;
  lobbyRow: number;
}

function street(state: GameState): Street {
  const grid = gridSize(state);
  const lobby = lobbyRoom(state);
  const fallback: Place = { x: (lobby?.x ?? 0) + 0.17, y: (lobby?.y ?? 0) + 0.125, facing: 'right', pose: 'stand' };
  const doorIn = (lobby && placeIn(lobby, 'door')) ?? fallback;
  const deskFront = (lobby && placeIn(lobby, 'deskFront')) ?? { ...fallback, x: fallback.x + 0.8 };
  const inside = lobby ? placesIn(lobby, 'queue') : [];
  const doorOut = { x: doorIn.x, y: PAVEMENT_Y };
  return {
    entry: { x: grid.w + ENTRY_BEYOND, y: PAVEMENT_Y },
    exit: { x: -EXIT_BEYOND, y: PAVEMENT_Y },
    doorOut,
    doorIn,
    deskFront,
    queue: (place) => inside[place]
      ?? { x: doorOut.x - 0.3 * (place - inside.length + 1), y: PAVEMENT_Y, facing: 'right', pose: 'stand' },
    lobbyRow: lobby?.y ?? 0,
  };
}

// ---------------------------------------------------------------- guests

/**
 * How many can wait at reception.
 *
 * Read from the lobby the hotel actually has, mirroring the core's rule. It is
 * duplicated rather than imported because importing the core system created a
 * cycle — characters to guests to selectors to characters — which resolved to
 * undefined at module load and took three tests down with a message about a
 * function that plainly existed. A cycle fails as `undefined`, not as an error.
 */
function lobbyCapacity(state: GameState): number {
  let capacity = 0;
  for (const room of state.hotel.rooms) {
    const def = roomDefOf(room.defId);
    if (def?.category !== 'functional' || def.function.kind !== 'entrance') continue;
    capacity += Number(def.function.queueCapacity ?? 0);
  }
  return capacity > 0 ? capacity : simData().economy.guests.maxLobbyQueue;
}

interface Journey {
  legs: Leg[];
  /** What they do once the route is finished. */
  at: Place;
  clip: Clip;
  activity: Activity;
  /** The clip a `react` leg plays, when the route has one. */
  reactClip?: Clip;
}

/** The index of this guest among the guests actually inside a room. */
function berth(room: RoomInstance, guest: GuestInstance, state: GameState): number {
  // A guest still at the desk holds their bed (guests.ts reserves it at
  // check-in) but is not in the room yet; counting them shifted everybody's
  // bed the moment a new arrival reached reception.
  let n = 0;
  for (const id of room.occupants) {
    if (id === guest.id) return n;
    const other = state.guests.find((g) => g.id === id);
    if (other && other.state !== 'checkingIn') n++;
  }
  return n;
}

function guestJourney(state: GameState, guest: GuestInstance, anim: CharacterAnimationDef | undefined,
                      seed: number, s: Street): Journey {
  const data = simData();
  const tps = data.economy.simulation.ticksPerSecond;
  const base = anim ? walkSpeed(anim.motion.walkSpeedBlocksPerSec, anim.motion.speedJitter, seed) : 1.4;
  const liftTicks = Math.max(1, Math.round((anim?.motion.liftMs ?? 400) / 1000 * tps));
  const lobby = lobbyRoom(state);
  const stand = (p: Pt, facing: 'left' | 'right' = 'left'): Place => ({ x: p.x, y: p.y, facing, pose: 'stand' });

  switch (guest.state) {
    case 'arriving': {
      return { legs: [walk(s.entry, s.doorOut, base, tps)], at: stand(s.doorOut), clip: 'idle', activity: 'waiting' };
    }
    case 'queued': {
      const place = Math.max(0, state.lobbyQueue.indexOf(guest.id));
      const spot = s.queue(place);
      return { legs: [walk(s.entry, spot, base, tps)], at: spot, clip: 'idle', activity: 'waiting' };
    }
    case 'checkingIn': {
      // Straight off the street, or from the front of the queue: `waitedTicks`
      // tells the two apart, since a guest who queued waited more than a tick.
      const from: Pt = guest.waitedTicks <= 1 ? s.entry : s.queue(0);
      const via: Pt[] = from.y === PAVEMENT_Y && from.x > s.doorOut.x ? [s.doorOut, s.doorIn] : [s.doorIn];
      const points = [from, ...via, s.deskFront];
      let dist = 0;
      for (let i = 1; i < points.length; i++) dist += distance(points[i - 1]!, points[i]!);
      // Reception started its clock the moment they were accepted; the walk
      // has to finish before it does, whatever the plot's width.
      const window = Math.round((guest.finishesAtTick - guest.stateSinceTick) * 0.6);
      const speed = speedToArrive(base, dist, window, tps);
      const legs: Leg[] = [];
      for (let i = 1; i < points.length; i++) legs.push(walk(points[i - 1]!, points[i]!, speed, tps));
      return { legs, at: s.deskFront, clip: 'idle', activity: 'waiting' };
    }
    case 'staying':
    case 'usingAmenity': {
      const room = state.hotel.rooms.find((r) => r.id === guest.roomId);
      if (!room) return { legs: [], at: stand(s.doorOut), clip: 'idle', activity: 'waiting' };
      const door = doorOf(room, lobby);
      const i = berth(room, guest, state);
      if (guest.state === 'staying') {
        const beds = placesIn(room, 'guestSleep');
        const bed = beds[i % Math.max(1, beds.length)] ?? placeIn(room, 'standLeft') ?? door;
        // Up from the desk: on the same floor a walk, otherwise the lift is
        // taken at the desk — a guest fading at the street door reads as leaving.
        const legs = travel(s.deskFront, s.lobbyRow, s.deskFront, bed, room.y, door, base, liftTicks, tps);
        return { legs, at: bed, clip: bed.pose === 'sleep' ? 'sleep' : 'idle', activity: 'resting' };
      }
      const uses = placesIn(room, 'guestUse');
      const n = Math.max(1, uses.length);
      const chosen = uses[i % n] ?? placeIn(room, 'standLeft') ?? door;
      // When a room has more customers than places, the sharers stand a few
      // pixels apart rather than on top of each other.
      const share = Math.floor(i / n);
      const spot: Place = share === 0 ? chosen : { ...chosen, x: chosen.x + 0.05 * share, pose: 'stand' };
      // They came from a bedroom somewhere, and the state does not say which:
      // a short fade-in at the door stands in for the trip.
      const legs = [lift(door, door, Math.max(1, Math.round(liftTicks / 2))), walk(door, spot, base, tps)];
      return { legs, at: spot, clip: spot.pose === 'sit' ? 'sit' : 'idle', activity: spot.pose === 'sit' ? 'sitting' : 'waiting' };
    }
    case 'leaving': {
      const from: Pt = guest.everCheckedIn ? s.doorIn : s.doorOut;
      const mood = leavingMood(guest, anim);
      const reactClip: Clip | undefined = mood === 'happy' && hasClip(anim, 'happy') ? 'happy'
        : mood === 'angry' && hasClip(anim, 'angry') ? 'angry' : undefined;
      const reactTicks = reactClip ? Math.round(REACT_SEC * tps) : 0;
      const points: Pt[] = from === s.doorIn ? [from, s.doorOut, s.exit] : [from, s.exit];
      let dist = 0;
      for (let i = 1; i < points.length; i++) dist += distance(points[i - 1]!, points[i]!);
      // The whole walk is the rescue window: they reach the edge exactly when
      // the simulation drops them, however far the edge is.
      const walkAway = Math.round(data.economy.guests.walkAwaySec * tps);
      const speed = dist / (Math.max(1, walkAway - reactTicks) / tps);
      const legs: Leg[] = [];
      if (reactClip) legs.push(react(from, reactTicks));
      for (let i = 1; i < points.length; i++) legs.push(walk(points[i - 1]!, points[i]!, speed, tps));
      const journey: Journey = { legs, at: stand(s.exit), clip: 'idle', activity: 'leaving' };
      if (reactClip) journey.reactClip = reactClip;
      return journey;
    }
  }
}

/** How a guest feels on the way out, from what the stay left behind. */
function leavingMood(guest: GuestInstance, anim: CharacterAnimationDef | undefined): Mood {
  if (guest.leaveReason && guest.leaveReason !== 'checkedOut') return 'angry';
  if (guest.satisfaction < 0) return 'neutral';
  const data = simData();
  if (guest.satisfaction >= data.economy.satisfaction.tipThreshold) return 'happy';
  const angryBelow = anim?.behaviour.angryBelow;
  if (angryBelow !== undefined && guest.satisfaction < angryBelow) return 'angry';
  return 'neutral';
}

/**
 * The sleep routine: mostly asleep, up beside the bed now and then.
 *
 * Every guest wakes on their own timetable — the interval is drawn from the
 * file's range by the guest's seed — so a corridor of sleepers is a corridor
 * of individuals rather than a metronome.
 */
function sleepPhase(elapsed: number, anim: CharacterAnimationDef | undefined, seed: number, tps: number): 'asleep' | 'awake' {
  const routine = anim?.behaviour.sleep;
  if (!routine) return 'asleep';
  const [lo, hi] = routine.wakeEverySec;
  const wakeEvery = Math.round((lo + (hi - lo) * seeded(seed, 0x33)) * tps);
  const awake = Math.round(routine.awakeSec * tps);
  const cycle = wakeEvery + awake;
  return elapsed % cycle < wakeEvery ? 'asleep' : 'awake';
}

/** Whether a waiting guest has run out of visible patience. */
function impatient(guest: GuestInstance, anim: CharacterAnimationDef | undefined): boolean {
  const after = anim?.behaviour.impatientAfter;
  if (after === undefined || guest.patienceTotalTicks <= 0) return false;
  return guest.waitedTicks / guest.patienceTotalTicks > after;
}

interface Pose {
  x: number; y: number; vx: number; vy: number; toX: number; toY: number; segment: string;
  facing: 'left' | 'right'; activity: Activity; clip: Clip; mood: Mood; opacity: number;
}

function facingOf(sample: PathSample, standing: Place, fallback: 'left' | 'right'): 'left' | 'right' {
  if (sample.kind === 'walk') return sample.vx < -1e-9 ? 'left' : sample.vx > 1e-9 ? 'right' : fallback;
  return sample.done ? standing.facing : fallback;
}

/**
 * A guest's position, speed, clip and mood at this tick.
 *
 * Every state is a route from where the last state left them to where this
 * one puts them, then the activity itself. All of it is a function of the
 * tick count since the state began, which is what makes the same tick always
 * produce the same frame.
 */
export function guestPose(state: GameState, guest: GuestInstance): Pose {
  const data = simData();
  const tps = data.economy.simulation.ticksPerSecond;
  const anim = animOf('guest', guest.typeId);
  const seed = personSeed(guest.id, state.seed);
  const s = street(state);
  const journey = guestJourney(state, guest, anim, seed, s);
  const elapsed = state.tick - guest.stateSinceTick;
  const sample = evaluate(journey.legs, elapsed, tps);

  let at = journey.at;
  let clip: Clip = journey.clip;
  let activity: Activity = journey.activity;
  let mood: Mood = 'neutral';
  let phase = '';

  if (guest.state === 'staying' && sample.done) {
    const room = state.hotel.rooms.find((r) => r.id === guest.roomId);
    const woke = sleepPhase(elapsed - totalTicks(journey.legs), anim, seed, tps) === 'awake';
    if (woke && room) {
      const beds = placesIn(room, 'standNearBed');
      const i = berth(room, guest, state);
      const beside = beds[i % Math.max(1, beds.length)];
      if (beside) { at = beside; clip = 'idle'; activity = 'waiting'; phase = 'awake'; }
    }
  }
  if ((guest.state === 'queued' || guest.state === 'arriving') && impatient(guest, anim)) mood = 'impatient';
  if (guest.state === 'leaving') mood = leavingMood(guest, anim);

  if (!sample.done) {
    if (sample.kind === 'walk') { clip = 'walk'; activity = guest.state === 'leaving' ? 'leaving' : 'walking'; }
    else if (sample.kind === 'lift') { clip = 'idle'; activity = 'lift'; }
    else if (sample.kind === 'react') { clip = journey.reactClip ?? 'idle'; activity = 'waiting'; }
    else { clip = 'idle'; activity = 'waiting'; }
  }

  let opacity = 1;
  if (guest.state === 'leaving') {
    // Fading out signals that the chance to grab them is running out.
    const t = elapsed / Math.max(1, Math.round(data.economy.guests.walkAwaySec * tps));
    opacity = Math.max(0, 1 - t * 0.8);
  }
  if (sample.hidden) opacity = 0;

  const x = sample.done ? at.x : sample.x;
  const y = sample.done ? at.y : sample.y;
  return {
    x, y,
    vx: sample.vx, vy: sample.vy,
    toX: sample.done ? at.x : sample.toX, toY: sample.done ? at.y : sample.toY,
    segment: `${guest.state}:${guest.stateSinceTick}:${sample.leg}${phase ? ':' + phase : ''}`,
    facing: facingOf(sample, at, guest.state === 'leaving' || guest.state === 'arriving' ? 'left' : 'right'),
    activity, clip, mood, opacity,
  };
}

/**
 * A guest's position — the shape the older callers and tests read.
 */
export function guestPosition(state: GameState, guest: GuestInstance): {
  x: number; y: number; facing: 'left' | 'right'; activity: Activity; opacity: number;
} {
  const p = guestPose(state, guest);
  return { x: p.x, y: p.y, facing: p.facing, activity: p.activity, opacity: p.opacity };
}

// ---------------------------------------------------------------- staff

/** One cleaning round: walk there, work, and slip out again. */
const CLEAN_WINDOW_SEC = 20;
const CLEAN_TRAVEL_MAX_SEC = 6;
const CLEAN_EXIT_SEC = 1;

/**
 * The room a cleaner is seen working in.
 *
 * Rooms below the income gate come first, in the core's own cleaning order;
 * otherwise whichever rooms are less than spotless, taken in turn, one per
 * round. `cleaningOrder()[0]` itself flips every second as the simulation
 * tops rooms up, so it is read for the set and not for the first element.
 */
export function cleanerTarget(state: GameState, cleanerIndex: number): RoomInstance | null {
  const data = simData();
  const gate = data.economy.cleanliness.incomeGateThreshold;
  const tps = data.economy.simulation.ticksPerSecond;
  const order = cleaningOrder(data, state);
  let candidates = order.filter((r) => r.cleanliness < gate);
  if (candidates.length === 0) candidates = cleanableRooms(data, state).filter((r) => r.cleanliness < 0.999);
  if (candidates.length === 0) return null;
  candidates = [...candidates].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  const round = Math.floor(state.tick / (CLEAN_WINDOW_SEC * tps));
  return candidates[(round + cleanerIndex) % candidates.length] ?? null;
}

function staffPose(state: GameState, staff: StaffInstance, home: RoomInstance, cleanerIndex: number): Pose | null {
  const data = simData();
  const tps = data.economy.simulation.ticksPerSecond;
  const anim = animOf('staff', staff.roleId);
  const seed = personSeed(staff.id, state.seed);
  const speed = anim ? walkSpeed(anim.motion.walkSpeedBlocksPerSec, anim.motion.speedJitter, seed) : 1.5;
  const liftTicks = Math.max(1, Math.round((anim?.motion.liftMs ?? 400) / 1000 * tps));
  const lobby = lobbyRoom(state);
  const work = placeIn(home, 'staffWork') ?? placeIn(home, 'standRight');
  if (!work) return null;
  const still = (at: Place, clip: Clip, activity: Activity, segment: string): Pose => ({
    x: at.x, y: at.y, vx: 0, vy: 0, toX: at.x, toY: at.y, segment,
    facing: at.facing, activity, clip, mood: 'neutral', opacity: 1,
  });

  // Shut for the night: everyone stands down by the wall.
  if (!isOpen(state)) {
    const rest = placeIn(home, 'standLeft') ?? work;
    return still(rest, 'idle', 'waiting', 'closed');
  }

  const when = anim?.behaviour.workWhen ?? 'guestInRoom';

  if (when === 'guestCheckingIn') {
    const busy = state.guests.some((g) => g.state === 'checkingIn');
    return still(work, busy ? 'work' : 'idle', busy ? 'working' : 'waiting', 'desk');
  }

  if (when === 'cleaning') {
    const target = cleanerTarget(state, cleanerIndex);
    const post = placeIn(home, 'clean') ?? work;
    if (!target) return still(post, 'idle', 'waiting', 'home');
    const there = placeIn(target, 'clean') ?? doorOf(target, lobby);
    const windowTicks = CLEAN_WINDOW_SEC * tps;
    const phase = state.tick % windowTicks;
    const out = doorOf(home, lobby);
    const entry = doorOf(target, lobby);
    // Never more than a few seconds on the way, however far the room is.
    const dist = home.y === target.y ? distance(post, there) : distance(post, out) + distance(entry, there);
    const pace = speedToArrive(speed, dist, CLEAN_TRAVEL_MAX_SEC * tps - liftTicks, tps);
    const legs = travel(post, home.y, out, there, target.y, entry, pace, liftTicks, tps);
    const going = totalTicks(legs);
    const exitTicks = CLEAN_EXIT_SEC * tps;
    const working = Math.max(1, windowTicks - going - exitTicks);
    legs.push(dwell(there, working));
    legs.push(lift(there, post, exitTicks));
    const sample = evaluate(legs, phase, tps);
    const segment = `clean:${target.id}:${Math.floor(state.tick / windowTicks)}:${sample.leg}`;
    if (sample.kind === 'walk') {
      return { x: sample.x, y: sample.y, vx: sample.vx, vy: sample.vy, toX: sample.toX, toY: sample.toY, segment,
        facing: sample.vx < 0 ? 'left' : 'right', activity: 'walking', clip: 'walk', mood: 'neutral', opacity: 1 };
    }
    if (sample.kind === 'lift') {
      return { ...still({ x: sample.x, y: sample.y, facing: there.facing, pose: 'stand' }, 'idle', 'lift', segment), opacity: 0 };
    }
    if (sample.kind === 'dwell') {
      const scrubbing = target.cleanliness < 0.999;
      return still(there, scrubbing ? 'work' : 'idle', scrubbing ? 'working' : 'waiting', segment);
    }
    return still(post, 'idle', 'waiting', segment);
  }

  // Everyone else works when somebody is in their room, and wanders when not.
  const serving = state.guests.some((g) => g.state === 'usingAmenity' && g.roomId === home.id);
  if (serving) return still(work, 'work', 'working', 'serving');

  const route = anim?.behaviour.patrol;
  if (!route || route.points.length < 2) return still(work, 'idle', 'waiting', 'post');
  const stops = route.points.map((name) => placeIn(home, name) ?? work);
  const legs: Leg[] = [];
  stops.forEach((stop, i) => {
    legs.push(dwell(stop, Math.round((route.dwellMs[i] ?? 0) / 1000 * tps)));
    legs.push(walk(stop, stops[(i + 1) % stops.length]!, speed, tps));
  });
  const cycle = totalTicks(legs);
  const offset = Math.floor(seeded(seed, 0x77) * cycle);
  const phase = (state.tick + offset) % cycle;
  const sample = evaluate(legs, phase, tps);
  const segment = `patrol:${Math.floor((state.tick + offset) / cycle)}:${sample.leg}`;
  if (sample.kind === 'walk') {
    return { x: sample.x, y: sample.y, vx: sample.vx, vy: sample.vy, toX: sample.toX, toY: sample.toY, segment,
      facing: sample.vx < 0 ? 'left' : 'right', activity: 'walking', clip: 'walk', mood: 'neutral', opacity: 1 };
  }
  const stop = stops[Math.floor(sample.leg / 2) % stops.length] ?? work;
  return still(stop, 'idle', 'waiting', segment);
}

/** Staff stand in the room they are assigned to — at their work point. */
export function staffPosition(state: GameState, roomId: string | null): { x: number; y: number } | null {
  if (!roomId) return null;
  const room = state.hotel.rooms.find((r) => r.id === roomId);
  if (!room) return null;
  const work = placeIn(room, 'staffWork') ?? placeIn(room, 'standRight');
  return work ? { x: work.x, y: work.y } : null;
}

// ---------------------------------------------------------------- everyone

/**
 * Everyone who should be on screen, guests and staff together.
 *
 * Returned in draw order: people further back first, so a guest in a room
 * never occludes the receptionist standing in front of them.
 */
export function characterViews(state: GameState): CharacterView[] {
  const data = simData();
  const views: CharacterView[] = [];

  let cleaners = 0;
  for (const staff of state.staff) {
    const home = staff.roomId ? state.hotel.rooms.find((r) => r.id === staff.roomId) : undefined;
    if (!home) continue;
    const pose = staffPose(state, staff, home, staff.roleId === 'cleaner' ? cleaners++ : 0);
    if (!pose) continue;
    views.push({
      id: staff.id,
      kind: 'staff',
      assetKey: `staff.${staff.roleId}.idle`,
      ...pose,
      seed: personSeed(staff.id, state.seed),
      desire: null,
      draggable: false,
      tappable: false,
    });
  }

  const dragEnabled = data.economy.guests.dragToLobbyEnabled;
  for (const guest of state.guests) {
    const pose = guestPose(state, guest);
    const resting = guest.state === 'staying' || guest.state === 'usingAmenity';
    views.push({
      id: guest.id,
      kind: 'guest',
      assetKey: `guest.${guest.typeId}.idle`,
      ...pose,
      seed: personSeed(guest.id, state.seed),
      // A desire only matters while they can still act on it.
      desire: resting ? null : guest.desire,
      // Every clause here mirrors one in the DRAG_GUEST command. A grab handle
      // the simulation will refuse is worse than no handle at all, and a
      // selftest holds the two in step.
      draggable: dragEnabled
        && isOpen(state)
        && !onDragCooldown(data, state)
        && !guest.everCheckedIn
        && (guest.state === 'leaving' || guest.state === 'arriving')
        && !state.lobbyQueue.includes(guest.id)
        && state.lobbyQueue.length < lobbyCapacity(state),
      // And every clause here mirrors TAP_GUEST, for the same reason.
      tappable: resting && !state.revealedGuests.includes(guest.id),
    });
  }

  return views.sort((a, b) => b.y - a.y || a.x - b.x);
}

/**
 * The nearest guest the player can act on.
 *
 * Two actions share this: pulling a departing guest back to reception, and
 * checking on a resting one in case they are the hotel inspector.
 */
export function guestNear(
  state: GameState,
  x: number,
  y: number,
  radius = 1.0,
): CharacterView | null {
  let best: CharacterView | null = null;
  let bestDistance = radius;
  for (const view of characterViews(state)) {
    if (view.kind !== 'guest') continue;
    if (!view.draggable && !view.tappable) continue;
    const distance = Math.hypot(view.x - x, view.y - y);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = view;
    }
  }
  return best;
}

/** Amenity a guest wants that the hotel does not have. Drives the build hint. */
export function unmetDesires(state: GameState): Record<string, number> {
  const built = new Set<string>();
  for (const room of state.hotel.rooms) {
    const def = roomDefOf(room.defId);
    if (def?.category === 'commercial') built.add(def.desireTag);
  }
  const counts: Record<string, number> = {};
  for (const guest of state.guests) {
    if (!guest.desire || built.has(guest.desire)) continue;
    counts[guest.desire] = (counts[guest.desire] ?? 0) + 1;
  }
  return counts;
}
