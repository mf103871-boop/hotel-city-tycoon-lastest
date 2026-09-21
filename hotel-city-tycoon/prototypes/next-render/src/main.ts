/**
 * Hotel City Tycoon — rendering prototype.
 *
 * Every number on screen comes out of `src/core`. Nothing in this directory
 * simulates anything: guests arrive because `advance()` decided they should,
 * rooms get dirty on the real decay curve, and a checkout pays exactly what
 * `checkoutPayout` says. The prototype only decides how that looks.
 *
 * The split is the point. If the renderer can be replaced wholesale — and this
 * file is the proof that it can — then the 7,000 lines of simulation are an
 * asset that survives the move to any engine that speaks TypeScript.
 */
import {
  createInitialState, advance, execute, roomDef,
  computeStars, averageCleanliness, levelProgress, arrivalsPerMinute, totalBeds,
} from '../../../src/core/index.ts';
import type { GameState, GuestInstance, RoomInstance, SimEvent } from '../../../src/core/index.ts';
import { simData } from './sim-data.ts';
import { newRigState, pose, eyesShut, type RigState, type Action } from './rig.ts';
import {
  C, WALL_FOR, SKIN, SHIRT, HAIR, drawCharacter, rr, circle, shade, rgba,
} from './art.ts';

// ---------------------------------------------------------------------
// 1. Boot the real simulation
// ---------------------------------------------------------------------

const data = simData();
const state: GameState = createInitialState(data, { seed: 20260920, epochMs: Date.now(), hotelName: 'فندق المدينة' });

// A hotel nobody staffs serves nobody, and a closed hotel earns nothing. Both
// are ordinary commands, executed exactly as the game would execute them.
const lobby = state.hotel.rooms.find((r) => r.defId === 'lobby');
const keeping = state.hotel.rooms.find((r) => r.defId === 'housekeeping');
if (lobby) execute(data, state, { type: 'HIRE_STAFF', roomId: lobby.id, roleId: 'receptionist' });
if (keeping) execute(data, state, { type: 'HIRE_STAFF', roomId: keeping.id, roleId: 'cleaner' });
execute(data, state, { type: 'BUILD_ROOM', defId: 'economy' });
execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_6h' });

const TPS = data.economy.simulation.ticksPerSecond;

// Warm the hotel up: three simulated minutes, through the same `advance()` the
// game runs, so the first frame already has guests in it.
advance(data, state, TPS * 180);

// ---------------------------------------------------------------------
// 2. Stage geometry
// ---------------------------------------------------------------------

const CELL_W = 104, CELL_H = 86;
const plot = data.plots.find((p) => p.id === state.hotel.plotId)!;
const GRID_W = plot.grid.w;
/**
 * The whole plot, including the floors still to be built. Drawing it as blank
 * shell looked like a bug; drawing it as marked-out slots reads as room to
 * grow, which is what the player actually owns.
 */
const GRID_H = plot.grid.h;

const BX = 20;                       // building left edge, world px
const GY = 26 + GRID_H * CELL_H;     // ground line
const SHAFT_W = 34;
const SHAFT_X = BX + GRID_W * CELL_W;
const WORLD_W = SHAFT_X + SHAFT_W + 20;
const WORLD_H = GY + 74;
/** How far past the world edges the sky and ground paint, in world px. */
const BLEED = 1400;

const floorTop = (f: number) => GY - (f + 1) * CELL_H;
const floorY = (f: number) => GY - f * CELL_H - 7;      // where feet rest
const roomRect = (r: RoomInstance) => {
  const def = roomDef(data, r.defId);
  return {
    x: BX + r.x * CELL_W, y: floorTop(r.y) - (def.blocks.h - 1) * CELL_H,
    w: def.blocks.w * CELL_W, h: def.blocks.h * CELL_H, def,
  };
};

// ---------------------------------------------------------------------
// 3. Actors — a visual body for a simulated guest
// ---------------------------------------------------------------------

type Waypoint = { x: number; f: number; ride?: boolean };

interface Actor {
  id: string;
  kind: 'guest' | 'staff';
  x: number; f: number;           // floor as a float while riding the lift
  rig: RigState;
  look: { skin: string; shirt: string; hair: string; hasBag: boolean };
  facing: number;
  action: Action;
  path: Waypoint[];
  age: number;
  lastState: string;
  speed: number;
  bubble: { text: string; t: number } | null;
  /** World px covered this frame. The rig advances its cycle by distance. */
  moved: number;
}

const actors = new Map<string, Actor>();

const hash = (s: string) => { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; };
/**
 * `>>` is a SIGNED shift: `hash()` returns a full uint32, so `h >> 7` goes
 * negative for half of all ids, the index lands off the front of the array and
 * the character gets an undefined colour. Shift unsigned and take the
 * magnitude — a wrong-looking guest is a crash two frames later.
 */
const pick = <T>(arr: readonly T[], seed: number): T => arr[Math.abs(seed) % arr.length];

function makeActor(id: string, kind: Actor['kind'], x: number, f: number): Actor {
  const h = hash(id);
  return {
    id, kind, x, f,
    rig: newRigState(h % 97 / 97),
    look: {
      skin: pick(SKIN, h >>> 3), shirt: pick(SHIRT, h >>> 7),
      hair: pick(HAIR, h >>> 11), hasBag: kind === 'guest',
    },
    facing: 1, action: 'idle', path: [], age: 0, lastState: '',
    speed: 26 + (h % 9),
    bubble: null, moved: 0,
  };
}

const doorX = () => (lobby ? BX + lobby.x * CELL_W + CELL_W * 0.55 : BX + 50);
const deskX = () => (lobby ? BX + lobby.x * CELL_W + roomDef(data, 'lobby').blocks.w * CELL_W - 34 : BX + 120);
const liftX = SHAFT_X + SHAFT_W / 2;

/** Where the sim says a guest is, turned into somewhere to stand. */
function retarget(a: Actor, g: GuestInstance, queueIndex: number) {
  const room = g.roomId ? state.hotel.rooms.find((r) => r.id === g.roomId) : null;
  switch (g.state) {
    case 'arriving':
      a.path = [{ x: doorX(), f: 0 }];
      break;
    case 'queued': {
      // Backwards from the desk toward the door, tightening as it grows so
      // the tail never leaves the lobby.
      const lo = doorX() + 18, hi = deskX() - 30;
      const gap = Math.min(22, Math.max(11, (hi - lo) / 5));
      a.path = [{ x: Math.max(lo, hi - queueIndex * gap), f: 0 }];
      break;
    }
    case 'checkingIn':
      a.path = [{ x: deskX() - 22, f: 0 }];
      break;
    case 'staying':
    case 'usingAmenity': {
      if (!room) { a.path = [{ x: deskX(), f: 0 }]; break; }
      const rc = roomRect(room);
      a.path = room.y === 0
        ? [{ x: rc.x + rc.w * 0.5, f: 0 }]
        : [{ x: liftX, f: a.f }, { x: liftX, f: room.y, ride: true }, { x: rc.x + rc.w * 0.5, f: room.y }];
      break;
    }
    case 'leaving':
      a.path = a.f > 0
        ? [{ x: liftX, f: a.f }, { x: liftX, f: 0, ride: true }, { x: WORLD_W + 70, f: 0 }]
        : [{ x: WORLD_W + 70, f: 0 }];
      break;
  }
}

// ---------------------------------------------------------------------
// 4. Particles
// ---------------------------------------------------------------------

interface Particle {
  x: number; y: number; vx: number; vy: number; life: number; max: number;
  kind: 'coin' | 'spark' | 'heart' | 'dust' | 'zzz' | 'text';
  text?: string; hue?: string;
}
const particles: Particle[] = [];

function burst(kind: Particle['kind'], x: number, y: number, n: number, text?: string, hue?: string) {
  if (!fx.particles) return;
  for (let i = 0; i < n; i++) {
    const a = -Math.PI / 2 + (Math.random() - 0.5) * 1.5;
    const sp = 26 + Math.random() * 46;
    particles.push({
      x, y, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp,
      life: 0, max: kind === 'text' ? 1.4 : 0.85 + Math.random() * 0.5, kind, text, hue,
    });
  }
}

// ---------------------------------------------------------------------
// 5. Controls
// ---------------------------------------------------------------------

const fx = { skeletal: true, lighting: true, particles: true, speed: 4 };

// ---------------------------------------------------------------------
// 6. Simulation stepping
// ---------------------------------------------------------------------

let tickAccum = 0;
let coinsShown = state.player.coins;
let flash = 0;

function stepSim(dt: number) {
  tickAccum += dt * TPS * fx.speed;
  const whole = Math.floor(tickAccum);
  if (whole <= 0) return;
  tickAccum -= whole;

  const res = advance(data, state, Math.min(whole, 120));
  for (const ev of res.events) onEvent(ev);

  // Keep the demo running: re-open the shift the moment the old one settles.
  if (state.shift.activeShiftId === null) {
    const r = execute(data, state, { type: 'START_SHIFT', shiftId: 'shift_6h' });
    if (!r.ok) state.player.coins += 400;   // demo only — never a game rule
  }
}

function onEvent(ev: SimEvent) {
  const any = ev as Record<string, unknown>;
  if (ev.type === 'guestCheckedOut') {
    const a = actors.get(String(any.guestId ?? ''));
    const amount = Number(any.coins ?? 0);
    if (a) {
      burst('coin', a.x, floorY(Math.round(a.f)) - 30, 5);
      if (amount > 0) burst('text', a.x, floorY(Math.round(a.f)) - 46, 1, `+${amount}`, C.cream);
      a.bubble = { text: '★', t: 1.1 };
    }
    flash = 0.35;
  }
  if (ev.type === 'guestLeftAngry') {
    const a = actors.get(String(any.guestId ?? ''));
    if (a) { a.bubble = { text: '✕', t: 1.2 }; burst('spark', a.x, floorY(0) - 40, 4, undefined, C.coral); }
  }
  if (ev.type === 'levelUp') burst('spark', WORLD_W / 2, GY - 200, 22, undefined, C.cream);
}

// ---------------------------------------------------------------------
// 7. Actor update
// ---------------------------------------------------------------------

function syncActors(dt: number) {
  const queueOrder = new Map<string, number>();
  let q = 0;
  for (const g of state.guests) if (g.state === 'queued') queueOrder.set(g.id, q++);

  const live = new Set<string>();

  for (const g of state.guests) {
    live.add(g.id);
    let a = actors.get(g.id);
    if (!a) {
      a = makeActor(g.id, 'guest', -40 - Math.random() * 190, 0);
      actors.set(g.id, a);
    }
    if (a.lastState !== g.state) {
      a.lastState = g.state;
      retarget(a, g, queueOrder.get(g.id) ?? 0);
      if (g.state === 'staying') a.look.hasBag = false;
      if (g.state === 'queued' && g.desire) a.bubble = { text: '?', t: 2 };
    } else if (g.state === 'queued') {
      retarget(a, g, queueOrder.get(g.id) ?? 0);
    }
    advanceActor(a, dt, g);
  }

  // Staff stay put in the room they were hired into; they are the fixed points
  // the guests move between.
  for (const s of state.staff) {
    live.add(s.id);
    let a = actors.get(s.id);
    const room = state.hotel.rooms.find((r) => r.id === s.roomId);
    if (!a) {
      const rc = room ? roomRect(room) : null;
      a = makeActor(s.id, 'staff', rc ? rc.x + rc.w - 34 : deskX(), room?.y ?? 0);
      a.look.hasBag = false;
      a.look.shirt = s.roleId === 'receptionist' ? C.roomBlue : C.mintDk;
      a.facing = -1;
      actors.set(s.id, a);
    }
    a.age += dt;
    a.action = 'idle';
    advanceActor(a, dt, null);
  }

  for (const [id, a] of actors) {
    if (live.has(id)) continue;
    // Walk the departed off-stage rather than deleting them mid-stride.
    a.path = [{ x: WORLD_W + 80, f: 0 }];
    advanceActor(a, dt, null);
    if (a.x > WORLD_W + 70) actors.delete(id);
  }
}

function advanceActor(a: Actor, dt: number, g: GuestInstance | null) {
  a.age += dt;
  if (a.bubble) { a.bubble.t -= dt; if (a.bubble.t <= 0) a.bubble = null; }

  let moved = 0;
  const wp = a.path[0];

  // If the body is more than a screen behind where the simulation says it is,
  // the walk stopped being animation and became a lie. Close the gap.
  if (wp && !wp.ride && Math.abs(wp.x - a.x) > WORLD_W * 1.2) {
    a.x = wp.x - Math.sign(wp.x - a.x) * 120;
  }

  if (wp && wp.ride) {
    // In the lift: the floor index itself is what moves.
    const dir = Math.sign(wp.f - a.f);
    a.f += dir * dt * 1.35;
    if (Math.abs(wp.f - a.f) < 0.04) { a.f = wp.f; a.path.shift(); }
    a.action = 'idle';
  } else if (wp) {
    const dx = wp.x - a.x;
    // Capped, not proportional: at 60x a literal scaling would teleport
    // everyone, and the walk cycle is the thing worth looking at.
    const step = a.speed * dt * Math.min(fx.speed, 6);
    if (Math.abs(dx) <= step) {
      a.x = wp.x;
      a.path.shift();
      moved = Math.abs(dx);
    } else {
      a.x += Math.sign(dx) * step;
      a.facing = Math.sign(dx);
      moved = step;
    }
    a.action = 'walk';
  } else {
    a.action = a.kind === 'staff' ? 'idle'
      : g?.state === 'staying' ? 'sleep'
      : g?.state === 'queued' ? 'wait'
      : 'idle';
  }

  if (a.action === 'walk' && moved > 0.4 && Math.random() < dt * 5) {
    burst('dust', a.x - a.facing * 4, floorY(Math.round(a.f)), 1);
  }
  if (a.action === 'sleep' && Math.random() < dt * 0.7) {
    particles.push({
      x: a.x + 8, y: floorY(a.f) - 40, vx: 7, vy: -16,
      life: 0, max: 1.8, kind: 'zzz',
    });
  }
  a.moved = moved;
}

// ---------------------------------------------------------------------
// 8. Rendering
// ---------------------------------------------------------------------

const canvas = document.getElementById('stage') as HTMLCanvasElement;
const ctx = canvas.getContext('2d')!;
let view = { scale: 1, ox: 0, oy: 0 };

function resize() {
  const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
  const w = canvas.clientWidth, h = canvas.clientHeight;
  canvas.width = Math.round(w * dpr);
  canvas.height = Math.round(h * dpr);
  const scale = Math.min(w / (WORLD_W * 1.05), h / (WORLD_H * 1.12));
  view = {
    scale: scale * dpr,
    ox: (w * dpr - WORLD_W * scale * dpr) / 2,
    oy: h * dpr * 0.72 - GY * scale * dpr,
  };
}
window.addEventListener('resize', resize);

/** Hours of simulated time per full day/night cycle on screen. */
const DEMO_DAY_HOURS = 2;

/** 0 = midnight, 0.5 = noon. Driven by the simulation's own clock. */
function dayPhase(): number {
  const span = DEMO_DAY_HOURS * 3_600_000;
  return (state.epochMs % span) / span;
}
function nightAmount(): number {
  if (!fx.lighting) return 0;
  const p = dayPhase();
  const d = Math.cos((p - 0.5) * Math.PI * 2);   // +1 at noon, -1 at midnight
  return Math.max(0, Math.min(1, (-d + 0.25) / 1.1));
}

function drawSky(n: number) {
  const g = ctx.createLinearGradient(0, 0, 0, GY);
  g.addColorStop(0, mixHex(C.sky, '#101B3A', n));
  g.addColorStop(0.55, mixHex(C.skyHi, '#22305C', n));
  g.addColorStop(1, mixHex('#D9EEFD', '#3B4A78', n));
  ctx.fillStyle = g;
  ctx.fillRect(-BLEED, -BLEED, WORLD_W + BLEED * 2, WORLD_H + BLEED * 2);

  if (n > 0.35) {
    ctx.fillStyle = `rgba(255,255,255,${(n - 0.35) * 0.9})`;
    for (let i = 0; i < 46; i++) {
      const sx = (i * 137.5) % WORLD_W;
      const sy = (i * 71.3) % (GY * 0.62);
      const tw = 0.5 + 0.5 * Math.sin(now * 2 + i);
      circle(ctx, sx, sy, 0.7 + tw * 0.6); ctx.fill();
    }
    ctx.fillStyle = `rgba(255,248,220,${(n - 0.35) * 1.1})`;
    circle(ctx, WORLD_W - 90, 62, 20); ctx.fill();
    ctx.fillStyle = mixHex(C.sky, '#101B3A', n);
    circle(ctx, WORLD_W - 80, 55, 18); ctx.fill();
  } else {
    ctx.fillStyle = 'rgba(255,240,190,0.95)';
    circle(ctx, WORLD_W - 90, 62, 22); ctx.fill();
  }
}

/** Three parallax bands of city behind the hotel. */
function drawSkyline(n: number) {
  const bands = [
    { y: GY - 8, h: GY * 1.05, c: mixHex('#A8CFF1', '#18233F', n), step: 52, off: 0 },
    { y: GY - 4, h: GY * 0.74, c: mixHex('#93BDE6', '#202C50', n), step: 66, off: 27 },
    { y: GY, h: GY * 0.46, c: mixHex('#7FAEDD', '#2B3763', n), step: 40, off: 13 },
  ];
  for (const b of bands) {
    ctx.fillStyle = b.c;
    for (let x = -60 + b.off; x < WORLD_W + 60; x += b.step) {
      const hh = b.h * (0.55 + 0.45 * Math.abs(Math.sin(x * 0.37 + b.off)));
      ctx.fillRect(x, b.y - hh, b.step - 7, hh);
      if (n > 0.3) {
        ctx.fillStyle = `rgba(253,228,176,${0.5 * n})`;
        for (let wy = b.y - hh + 10; wy < b.y - 12; wy += 15) {
          for (let wx = x + 6; wx < x + b.step - 15; wx += 13) {
            if ((Math.sin(wx * 12.9898 + wy * 78.233) * 43758.5) % 1 > 0.45) ctx.fillRect(wx, wy, 4, 6);
          }
        }
        ctx.fillStyle = b.c;
      }
    }
  }
}

/** Lamp posts, planting and a parked car: depth in front of the hotel. */
function drawStreet(n: number) {
  const lit = fx.lighting && n > 0.25;
  const road = GY + 34;

  ctx.fillStyle = mixHex('#6E7A86', '#1A2436', n);
  ctx.fillRect(-BLEED, road, WORLD_W + BLEED * 2, 40);
  ctx.strokeStyle = mixHex('#E8EEF2', '#5A6478', n);
  ctx.lineWidth = 2.6;
  ctx.setLineDash([16, 14]);
  ctx.beginPath(); ctx.moveTo(-BLEED, road + 20); ctx.lineTo(WORLD_W + BLEED, road + 20); ctx.stroke();
  ctx.setLineDash([]);

  for (let x = BX - 16; x < WORLD_W + 40; x += 152) {
    ctx.strokeStyle = C.ink; ctx.lineWidth = 3.4;
    ctx.beginPath(); ctx.moveTo(x, GY + 26); ctx.lineTo(x, GY - 42); ctx.stroke();
    ctx.fillStyle = lit ? C.creamHi : mixHex(C.warmWhite, '#4A5570', n);
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    circle(ctx, x, GY - 47, 6); ctx.fill(); ctx.stroke();
    if (lit) {
      const g = ctx.createRadialGradient(x, GY - 47, 2, x, GY - 47, 74);
      g.addColorStop(0, `rgba(255,226,150,${0.34 * n})`);
      g.addColorStop(1, 'rgba(255,226,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(x - 76, GY - 122, 152, 152);
    }
  }

  for (const bx of [BX - 34, SHAFT_X + SHAFT_W + 16]) {
    ctx.fillStyle = mixHex('#4E9E68', '#17362A', n);
    for (const d of [-9, 0, 9]) { circle(ctx, bx + d, GY + 14 - Math.abs(d) * 0.4, 11); ctx.fill(); }
    ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
    for (const d of [-9, 0, 9]) { circle(ctx, bx + d, GY + 14 - Math.abs(d) * 0.4, 11); ctx.stroke(); }
  }

  // a parked car, to give the street a scale reference
  const cx = BX + 200;
  ctx.fillStyle = mixHex(C.coral, '#5A2A26', n * 0.7);
  rr(ctx, cx - 44, road + 2, 88, 20, 7); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6; ctx.stroke();
  ctx.fillStyle = mixHex(shade(C.coral, 0.12), '#66332C', n * 0.7);
  rr(ctx, cx - 26, road - 12, 50, 16, 6); ctx.fill(); ctx.stroke();
  ctx.fillStyle = mixHex(C.tile, '#3A465E', n * 0.7);
  rr(ctx, cx - 21, road - 9, 18, 11, 3); ctx.fill();
  rr(ctx, cx + 2, road - 9, 18, 11, 3); ctx.fill();
  ctx.fillStyle = C.ink;
  circle(ctx, cx - 26, road + 22, 7.5); ctx.fill();
  circle(ctx, cx + 26, road + 22, 7.5); ctx.fill();
  if (lit) {
    ctx.fillStyle = `rgba(255,220,160,${0.5 * n})`;
    circle(ctx, cx + 44, road + 10, 4); ctx.fill();
  }
}

/** Slow clouds, drawn from the same pastel family as everything else. */
function drawClouds(n: number) {
  const alpha = 0.85 - n * 0.6;
  if (alpha <= 0.05) return;
  ctx.fillStyle = `rgba(255,255,255,${alpha})`;
  for (let i = 0; i < 5; i++) {
    const speed = 5 + i * 2.5;
    const x = ((i * 231 + now * speed) % (WORLD_W + 420)) - 210;
    const y = 30 + ((i * 97) % 130);
    const sc = 0.7 + (i % 3) * 0.28;
    ctx.beginPath();
    ctx.ellipse(x, y, 34 * sc, 15 * sc, 0, 0, Math.PI * 2);
    ctx.ellipse(x + 26 * sc, y + 4 * sc, 24 * sc, 12 * sc, 0, 0, Math.PI * 2);
    ctx.ellipse(x - 26 * sc, y + 5 * sc, 20 * sc, 10 * sc, 0, 0, Math.PI * 2);
    ctx.fill();
  }
}

/** The plot the player owns but has not built on yet. */
function drawEmptySlots(n: number) {
  const taken = new Set<string>();
  for (const r of state.hotel.rooms) {
    const def = roomDef(data, r.defId);
    for (let dx = 0; dx < def.blocks.w; dx++)
      for (let dy = 0; dy < def.blocks.h; dy++) taken.add(`${r.x + dx},${r.y + dy}`);
  }
  ctx.save();
  ctx.setLineDash([7, 7]);
  ctx.strokeStyle = `rgba(3,17,48,${0.16 + n * 0.1})`;
  ctx.lineWidth = 2;
  for (let gx = 0; gx < GRID_W; gx++) {
    for (let gy = 0; gy < GRID_H; gy++) {
      if (taken.has(`${gx},${gy}`)) continue;
      rr(ctx, BX + gx * CELL_W + 9, floorTop(gy) + 9, CELL_W - 18, CELL_H - 18, 6);
      ctx.stroke();
      ctx.fillStyle = `rgba(3,17,48,${0.05})`;
      ctx.fill();
      ctx.fillStyle = `rgba(3,17,48,${0.22})`;
      ctx.font = '22px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      ctx.fillText('+', BX + gx * CELL_W + CELL_W / 2, floorTop(gy) + CELL_H / 2);
    }
  }
  ctx.restore();
}

function drawGround(n: number) {
  ctx.fillStyle = mixHex('#9AD3A8', '#1F3C34', n);
  ctx.fillRect(-BLEED, GY, WORLD_W + BLEED * 2, WORLD_H + BLEED);
  ctx.fillStyle = mixHex('#C9D3D8', '#2C3A48', n);
  ctx.fillRect(-BLEED, GY, WORLD_W + BLEED * 2, 26);
  ctx.strokeStyle = rgba(C.ink, 0.18); ctx.lineWidth = 1.5;
  ctx.beginPath(); ctx.moveTo(-BLEED, GY + 26); ctx.lineTo(WORLD_W + BLEED, GY + 26); ctx.stroke();
}

function drawBuilding(n: number) {
  // shell
  ctx.fillStyle = mixHex('#E9EDF2', '#3A4664', n);
  rr(ctx, BX - 12, floorTop(GRID_H - 1) - 26, GRID_W * CELL_W + SHAFT_W + 24, GRID_H * CELL_H + 26, 12);
  ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 3; ctx.stroke();

  // roof trim
  ctx.fillStyle = mixHex(C.coral, '#5B2B31', n * 0.7);
  rr(ctx, BX - 18, floorTop(GRID_H - 1) - 34, GRID_W * CELL_W + SHAFT_W + 36, 16, 6);
  ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.4; ctx.stroke();

  drawEmptySlots(n);
  for (const room of state.hotel.rooms) drawRoom(room, n);
  drawShaft(n);
}

function drawRoom(room: RoomInstance, n: number) {
  const rc = roomRect(room);
  const wall = WALL_FOR[room.defId] ?? C.wallCream;
  const dirty = 1 - room.cleanliness;

  ctx.save();
  rr(ctx, rc.x + 3, rc.y + 3, rc.w - 6, rc.h - 6, 7);
  ctx.clip();

  // wall, darkened at night and by grime
  ctx.fillStyle = mixHex(shade(wall, -dirty * 0.32), '#2A3450', n * 0.72);
  ctx.fillRect(rc.x, rc.y, rc.w, rc.h);

  // floor
  ctx.fillStyle = mixHex(C.wood, '#3A2A1C', n * 0.6);
  ctx.fillRect(rc.x, rc.y + rc.h - 13, rc.w, 13);
  ctx.fillStyle = mixHex(C.woodDk, '#2A1E14', n * 0.6);
  ctx.fillRect(rc.x, rc.y + rc.h - 13, rc.w, 3);

  drawFurniture(room, rc, n);

  // interior light: a soft pool from the ceiling lamp, only worth drawing
  // when the room is actually lit and occupied.
  const lit = room.occupants.length > 0 || room.defId === 'lobby';
  if (fx.lighting && n > 0.08 && lit) {
    const g = ctx.createRadialGradient(rc.x + rc.w / 2, rc.y + 10, 4, rc.x + rc.w / 2, rc.y + 10, rc.h * 1.25);
    g.addColorStop(0, `rgba(255,226,150,${0.5 * n})`);
    g.addColorStop(1, 'rgba(255,226,150,0)');
    ctx.fillStyle = g;
    ctx.fillRect(rc.x, rc.y, rc.w, rc.h);
  }
  ctx.restore();

  // frame
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.6;
  rr(ctx, rc.x + 3, rc.y + 3, rc.w - 6, rc.h - 6, 7); ctx.stroke();

  // hazards read instantly, at a glance, from across the room
  if (room.hasPest || room.hasFire || room.hasGhost) {
    const icon = room.hasFire ? '🔥' : room.hasPest ? '🐜' : '👻';
    ctx.font = '20px system-ui';
    ctx.textAlign = 'center';
    ctx.fillText(icon, rc.x + rc.w - 18, rc.y + 26 + Math.sin(now * 5) * 2.5);
  }
  if (dirty > 0.45) {
    ctx.fillStyle = `rgba(90,74,44,${(dirty - 0.45) * 0.5})`;
    for (let i = 0; i < 7; i++) {
      const px = rc.x + 14 + ((i * 53) % (rc.w - 28));
      circle(ctx, px, rc.y + rc.h - 16 - (i % 3) * 5, 2.6 + (i % 2)); ctx.fill();
    }
  }
}

function drawFurniture(room: RoomInstance, rc: { x: number; y: number; w: number; h: number }, n: number) {
  const base = rc.y + rc.h - 13;
  const ink = C.ink;
  ctx.lineWidth = 2;
  ctx.strokeStyle = ink;

  const bed = (x: number) => {
    ctx.fillStyle = mixHex(C.warmWhite, '#39435E', n * 0.6);
    rr(ctx, x, base - 22, 44, 22, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = mixHex(C.roomBlue, '#26365E', n * 0.6);
    rr(ctx, x, base - 30, 12, 30, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = mixHex(C.creamHi, '#4A4A62', n * 0.6);
    rr(ctx, x + 14, base - 27, 15, 8, 3); ctx.fill(); ctx.stroke();
  };
  const lamp = (x: number) => {
    ctx.strokeStyle = ink; ctx.lineWidth = 1.6;
    ctx.beginPath(); ctx.moveTo(x, rc.y + 4); ctx.lineTo(x, rc.y + 15); ctx.stroke();
    ctx.fillStyle = mixHex(C.cream, '#7A6A3A', n * 0.4);
    ctx.beginPath();
    ctx.moveTo(x - 9, rc.y + 25); ctx.lineTo(x + 9, rc.y + 25); ctx.lineTo(x + 5, rc.y + 15); ctx.lineTo(x - 5, rc.y + 15);
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.lineWidth = 2;
  };
  const plant = (x: number) => {
    ctx.fillStyle = mixHex(C.wood, '#3A2A1C', n * 0.6);
    rr(ctx, x - 7, base - 12, 14, 12, 2); ctx.fill(); ctx.stroke();
    ctx.fillStyle = mixHex('#5FB878', '#1F4433', n * 0.6);
    for (const d of [-6, 0, 6]) {
      ctx.beginPath();
      ctx.ellipse(x + d, base - 20 + Math.abs(d) * 0.5, 4.5, 9, d * 0.08, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    }
  };

  if (room.defId === 'lobby') {
    // reception desk — where the receptionist stands and guests check in
    const dx = rc.x + rc.w - 56;
    ctx.fillStyle = mixHex(C.wood, '#3A2A1C', n * 0.6);
    rr(ctx, dx, base - 26, 44, 26, 4); ctx.fill(); ctx.stroke();
    ctx.fillStyle = mixHex(C.woodPale, '#4A3826', n * 0.6);
    rr(ctx, dx - 3, base - 30, 50, 6, 3); ctx.fill(); ctx.stroke();
    plant(rc.x + 24);
    lamp(rc.x + rc.w * 0.42);
    // the revolving door
    ctx.fillStyle = mixHex(C.tile, '#33405E', n * 0.6);
    rr(ctx, rc.x + 44, base - 46, 30, 46, 4); ctx.fill(); ctx.stroke();
  } else if (room.defId === 'housekeeping') {
    ctx.fillStyle = mixHex(C.tile, '#33405E', n * 0.6);
    rr(ctx, rc.x + 16, base - 30, 30, 30, 4); ctx.fill(); ctx.stroke();
    circle(ctx, rc.x + 31, base - 15, 8); ctx.fillStyle = mixHex(C.roomBlue, '#26365E', n * 0.6); ctx.fill(); ctx.stroke();
    plant(rc.x + rc.w - 22);
  } else if (room.defId === 'cafe') {
    for (const tx of [rc.x + 30, rc.x + 72]) {
      ctx.fillStyle = mixHex(C.woodPale, '#4A3826', n * 0.6);
      rr(ctx, tx - 13, base - 18, 26, 4, 2); ctx.fill(); ctx.stroke();
      ctx.beginPath(); ctx.moveTo(tx, base - 14); ctx.lineTo(tx, base); ctx.stroke();
    }
    lamp(rc.x + rc.w * 0.5);
  } else {
    bed(rc.x + 18);
    if (rc.w > 120) bed(rc.x + 74);
    plant(rc.x + rc.w - 22);
    lamp(rc.x + rc.w * 0.62);
  }
}

function drawShaft(n: number) {
  ctx.fillStyle = mixHex('#C3CCDA', '#2B3550', n);
  ctx.fillRect(SHAFT_X, floorTop(GRID_H - 1), SHAFT_W, GRID_H * CELL_H);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2.4;
  ctx.strokeRect(SHAFT_X, floorTop(GRID_H - 1), SHAFT_W, GRID_H * CELL_H);

  // the car tracks whichever guest is currently riding
  const rider = [...actors.values()].find((a) => a.path[0]?.ride);
  const carF = rider ? rider.f : 0;
  const cy = floorTop(carF) + 6;
  ctx.fillStyle = mixHex(C.cream, '#6A5A34', n * 0.55);
  rr(ctx, SHAFT_X + 4, cy, SHAFT_W - 8, CELL_H - 12, 4); ctx.fill();
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2; ctx.stroke();
  ctx.strokeStyle = rgba(C.ink, 0.35); ctx.lineWidth = 1.4;
  ctx.beginPath();
  ctx.moveTo(SHAFT_X + SHAFT_W / 2, cy + 4); ctx.lineTo(SHAFT_X + SHAFT_W / 2, cy + CELL_H - 16);
  ctx.stroke();
}

function drawActors(dt: number, n: number) {
  const list = [...actors.values()].sort((a, b) => a.f - b.f || a.x - b.x);
  for (const a of list) {
    const y = floorY(a.f);
    const scale = 1.3;

    // contact shadow
    ctx.fillStyle = `rgba(3,17,48,${0.16 + 0.1 * (1 - n)})`;
    ctx.beginPath();
    ctx.ellipse(a.x, y + 1.5, 11 * scale, 3.2 * scale, 0, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.translate(a.x, y);

    if (fx.skeletal) {
      const p = pose(a.rig, {
        speed: a.moved, facing: a.facing, dt,
        action: a.action, age: a.age,
      });
      drawCharacter(ctx, p, a.look, {
        shut: eyesShut(a.rig) || a.action === 'sleep',
        scale, ink: C.ink,
      });
    } else {
      drawStiff(a, scale, n);
    }
    ctx.restore();

    if (a.bubble) drawBubble(a.x, y - 58, a.bubble.text);

    // night lamp glow on the character
    if (fx.lighting && n > 0.4) {
      const g = ctx.createRadialGradient(a.x, y - 24, 2, a.x, y - 24, 48);
      g.addColorStop(0, `rgba(255,224,150,${0.10 * n})`);
      g.addColorStop(1, 'rgba(255,224,150,0)');
      ctx.fillStyle = g;
      ctx.fillRect(a.x - 50, y - 74, 100, 100);
    }
  }
}

/**
 * The comparison case: the same character as a rigid two-part sprite, stepped
 * at 10 Hz like a short frame strip. Nothing here is a claim about the shipped
 * renderer — it is the baseline any frame-based approach starts from, drawn
 * beside the rig so the gap is visible rather than asserted.
 */
function drawStiff(a: Actor, scale: number, n: number) {
  const step = a.action === 'walk' ? Math.floor(a.age * 10) % 4 : 0;
  const lift = step === 1 ? -1.5 : step === 3 ? -1.5 : 0;
  ctx.save();
  ctx.scale(scale, scale);
  ctx.translate(0, lift);
  ctx.strokeStyle = C.ink; ctx.lineWidth = 1.8; ctx.lineJoin = 'round';
  ctx.fillStyle = a.look.shirt;
  rr(ctx, -7, -24, 14, 17, 3); ctx.fill(); ctx.stroke();
  ctx.fillStyle = '#3C4A63';
  rr(ctx, -6, -8, 5, 8, 2); ctx.fill(); ctx.stroke();
  rr(ctx, 1, -8, 5, 8, 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = a.look.skin;
  circle(ctx, 0, -33, 9.2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = a.look.hair;
  ctx.beginPath(); ctx.ellipse(0, -36.5, 9.4, 6.4, 0, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = C.ink;
  circle(ctx, -2.6 + a.facing * 1.4, -32, 1.5); ctx.fill();
  circle(ctx, 2.6 + a.facing * 1.4, -32, 1.5); ctx.fill();
  ctx.restore();
}

function drawBubble(x: number, y: number, text: string) {
  ctx.save();
  ctx.fillStyle = '#FFFFFF';
  ctx.strokeStyle = C.ink; ctx.lineWidth = 2;
  rr(ctx, x - 13, y - 15, 26, 24, 8); ctx.fill(); ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x - 5, y + 8); ctx.lineTo(x, y + 15); ctx.lineTo(x + 5, y + 8);
  ctx.fillStyle = '#FFFFFF'; ctx.fill();
  ctx.strokeStyle = '#FFFFFF'; ctx.lineWidth = 3; ctx.stroke();
  ctx.fillStyle = C.ink;
  ctx.font = 'bold 15px system-ui'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText(text, x, y - 2);
  ctx.restore();
}

function drawParticles(dt: number) {
  for (let i = particles.length - 1; i >= 0; i--) {
    const p = particles[i];
    p.life += dt;
    if (p.life > p.max) { particles.splice(i, 1); continue; }
    const t = p.life / p.max;
    p.x += p.vx * dt;
    p.y += p.vy * dt;
    if (p.kind === 'coin' || p.kind === 'spark' || p.kind === 'text') p.vy += 150 * dt;
    if (p.kind === 'dust') { p.vy -= 12 * dt; p.vx *= 0.94; }

    ctx.save();
    ctx.globalAlpha = 1 - t * t;
    if (p.kind === 'coin') {
      const w = Math.abs(Math.cos(p.life * 11)) * 7 + 1.6;
      ctx.fillStyle = C.cream; ctx.strokeStyle = shade(C.cream, -0.4); ctx.lineWidth = 1.2;
      ctx.beginPath(); ctx.ellipse(p.x, p.y, w / 2, 3.6, 0, 0, Math.PI * 2);
      ctx.fill(); ctx.stroke();
    } else if (p.kind === 'text') {
      ctx.fillStyle = p.hue ?? C.cream;
      ctx.strokeStyle = C.ink; ctx.lineWidth = 3;
      ctx.font = 'bold 16px system-ui'; ctx.textAlign = 'center';
      ctx.strokeText(p.text ?? '', p.x, p.y);
      ctx.fillText(p.text ?? '', p.x, p.y);
    } else if (p.kind === 'zzz') {
      ctx.fillStyle = rgba(C.ink, 0.5);
      ctx.font = `bold ${9 + t * 6}px system-ui`;
      ctx.fillText('z', p.x + Math.sin(p.life * 4) * 4, p.y);
    } else if (p.kind === 'dust') {
      ctx.fillStyle = `rgba(190,190,175,${0.5 * (1 - t)})`;
      circle(ctx, p.x, p.y, 1.6 + t * 4); ctx.fill();
    } else {
      ctx.fillStyle = p.hue ?? C.creamHi;
      const r = 3.4 * (1 - t);
      ctx.beginPath();
      for (let k = 0; k < 4; k++) {
        const a = (k / 4) * Math.PI * 2 + p.life * 4;
        ctx.lineTo(p.x + Math.cos(a) * r * 2.6, p.y + Math.sin(a) * r * 2.6);
        ctx.lineTo(p.x + Math.cos(a + 0.39) * r, p.y + Math.sin(a + 0.39) * r);
      }
      ctx.closePath(); ctx.fill();
    }
    ctx.restore();
  }
}

/** Foreground planting, close to the camera and darker for depth. */
function drawForeground(n: number) {
  const y = GY + 96;
  ctx.fillStyle = mixHex('#2F7A52', '#0E2A22', n);
  ctx.beginPath();
  ctx.moveTo(-BLEED, y + 120);
  for (let x = -BLEED; x < WORLD_W + BLEED; x += 44) {
    ctx.quadraticCurveTo(x + 11, y - 26 - ((x * 37) % 17), x + 22, y - 2);
    ctx.quadraticCurveTo(x + 33, y - 20, x + 44, y);
  }
  ctx.lineTo(WORLD_W + BLEED, y + 120);
  ctx.closePath();
  ctx.fill();
  ctx.fillStyle = mixHex('#256444', '#0A211B', n);
  ctx.fillRect(-BLEED, y + 34, WORLD_W + BLEED * 2, 200);
}

function drawVignette(n: number) {
  if (!fx.lighting) return;
  const g = ctx.createRadialGradient(WORLD_W / 2, WORLD_H * 0.45, WORLD_H * 0.25, WORLD_W / 2, WORLD_H * 0.45, WORLD_H * 0.95);
  g.addColorStop(0, 'rgba(0,0,0,0)');
  g.addColorStop(1, `rgba(4,10,30,${0.22 + n * 0.28})`);
  ctx.fillStyle = g;
  ctx.fillRect(-BLEED, -BLEED, WORLD_W + BLEED * 2, WORLD_H + BLEED * 2);
}

// ---------------------------------------------------------------------
// 9. HUD
// ---------------------------------------------------------------------

const el = (id: string) => document.getElementById(id)!;
let hudAccum = 0;

function drawHud(dt: number) {
  hudAccum += dt;
  coinsShown += (state.player.coins - coinsShown) * Math.min(1, dt * 6);
  el('coins').textContent = Math.round(coinsShown).toLocaleString('en-US');
  if (hudAccum < 0.18) return;
  hudAccum = 0;

  const stars = computeStars(data, state);
  const clean = averageCleanliness(data, state);
  const beds = totalBeds(data, state);
  const inside = state.guests.filter((g) => g.state === 'staying').length;

  el('stars').textContent = '★'.repeat(Math.max(1, Math.round(stars))) + '☆'.repeat(Math.max(0, 5 - Math.round(stars)));
  el('clean').textContent = `${Math.round(clean * 100)}%`;
  el('occ').textContent = beds > 0 ? `${inside}/${beds}` : String(inside);
  el('lvl').textContent = String(state.player.level);
  el('arrivals').textContent = arrivalsPerMinute(data, state).toFixed(1);
  el('served').textContent = String(state.stats.guestsServed);
  el('clock').textContent = new Date(state.epochMs).toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });

  const prog = levelProgress(data, state);
  (el('xpbar') as HTMLElement).style.width = `${Math.round(prog * 100)}%`;
  el('gems').textContent = String(state.player.gems);
}

// ---------------------------------------------------------------------
// 10. Loop
// ---------------------------------------------------------------------

let last = performance.now();
let now = 0;

function frame(t: number) {
  const dt = Math.min((t - last) / 1000, 1 / 20);
  last = t;
  now += dt;

  stepSim(dt);
  syncActors(dt);

  const n = nightAmount();
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.setTransform(view.scale, 0, 0, view.scale, view.ox, view.oy);

  drawSky(n);
  drawClouds(n);
  drawSkyline(n);
  drawGround(n);
  drawStreet(n);
  drawBuilding(n);
  drawActors(dt, n);
  drawParticles(dt);
  drawForeground(n);
  drawVignette(n);

  if (flash > 0) {
    flash -= dt;
    ctx.fillStyle = `rgba(253,228,176,${Math.max(0, flash) * 0.16})`;
    ctx.fillRect(-BLEED, -BLEED, WORLD_W + BLEED * 2, WORLD_H + BLEED * 2);
  }

  drawHud(dt);
  requestAnimationFrame(frame);
}

function mixHex(a: string, b: string, t: number): string {
  const pa = parseInt(a.slice(1), 16), pb = parseInt(b.slice(1), 16);
  const m = (sa: number, sb: number) => Math.round(sa + (sb - sa) * t);
  return `rgb(${m((pa >> 16) & 255, (pb >> 16) & 255)},${m((pa >> 8) & 255, (pb >> 8) & 255)},${m(pa & 255, pb & 255)})`;
}

// ---- wire the controls ----------------------------------------------
for (const id of ['skeletal', 'lighting', 'particles'] as const) {
  const box = el(`t-${id}`) as HTMLInputElement;
  box.checked = fx[id];
  box.addEventListener('change', () => { fx[id] = box.checked; });
}
for (const b of document.querySelectorAll<HTMLButtonElement>('[data-speed]')) {
  b.addEventListener('click', () => {
    fx.speed = Number(b.dataset.speed);
    document.querySelectorAll('[data-speed]').forEach((o) => o.classList.toggle('on', o === b));
  });
}

resize();
requestAnimationFrame(frame);
