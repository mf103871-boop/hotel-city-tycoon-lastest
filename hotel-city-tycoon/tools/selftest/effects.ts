/**
 * Headless tests for the effects channel (HC-P2-S4, DEC-021, BL-048).
 *
 * The effects are the one part of the renderer whose whole content is a
 * promise about what it does *not* do: it does not draw a glyph through a
 * font, it does not allocate per frame, it does not put a Graphics anywhere
 * the additive light can reach it, and it does not invent an event the
 * simulation never emits. None of those can be seen in a screenshot, and the
 * canvas cannot be asserted on in CI at all (DEC-009) — so they are asserted
 * here, from the source and from the pure maths, which is the only place they
 * can be.
 *
 * `animations.ts` is the model: the same check/assert helpers, the same
 * footer, and a failure that names the thing that broke.
 *
 * Run: node --experimental-strip-types tools/selftest/effects.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import {
  FX, FIELD_CAP_LITE, FX_LIFE_MS, FX_STEPS,
  createField, emit, stepField, burst, stepsOf, stepOf, ambientCap, dustCap,
  BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD,
} from '../../src/render/fx/particles.ts';
import { GLYPHS, GLYPH_COUNT, DIGIT_COUNT } from '../../src/render/fx/glyphs.ts';
import { effectsFor, CUE, MAX_CUES_PER_BATCH } from '../../src/bridge/effects.ts';
import type { EffectCue } from '../../src/bridge/effects.ts';
import { PALETTE, shade, lighten } from '../../src/render/anim/cast.ts';
import type { GameState, SimEvent } from '../../src/core/state/types.ts';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

/** Comments are not code: every source grep below runs on the stripped text. */
const strip = (src: string): string => src.replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/\/\/[^\n]*/g, ' ');

function sources(dir: string, out: string[] = []): string[] {
  if (!fs.existsSync(dir)) return out;
  for (const name of fs.readdirSync(dir).sort()) {
    const full = path.join(dir, name);
    if (fs.statSync(full).isDirectory()) sources(full, out);
    else if (/\.tsx?$/.test(name)) out.push(full);
  }
  return out;
}

const read = (file: string): string => fs.readFileSync(file, 'utf8');
const fxFiles = (): string[] => sources('src/render/fx');

/**
 * The body of a named function or method, by matching braces.
 *
 * The same extractor `tools/selftest/animations.ts` uses on `apply()`: a
 * regex cannot find the end of a function, and an allocation check that reads
 * past the closing brace is a check that fails for the next function's sins.
 */
function bodyOf(src: string, signature: string): string {
  const at = src.indexOf(signature);
  assert(at >= 0, `${signature} is not in the file any more`);
  const open = src.indexOf('{', at);
  assert(open >= 0, `${signature} has no body`);
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    const c = src[i];
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return src.slice(open, i + 1);
    }
  }
  throw new Error(`${signature} never closes`);
}

/** effectsFor reads one field of the state, and this suite has no save. */
const stateAt = (tick: number): GameState => ({ tick } as unknown as GameState);
const checkedOut = (roomId: string, guestId: string, coins: number): SimEvent =>
  ({ type: 'guestCheckedOut', guestId, roomId, coins, xp: 1 });

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — the effects channel');
console.log(line);

// ------------------------------------------------------- the cue contract

check('every cue answers an event that really exists', () => {
  // The mirror of animations.ts's 'every reaction answers a real event': a
  // cue keyed on an event name the union does not have is dead code that
  // looks alive, and nothing else in the build would ever say so.
  const types = read('src/core/state/types.ts');
  const known = new Set<string>();
  for (const m of types.matchAll(/\{ type: '([a-zA-Z]+)'/g)) known.add(m[1]!);
  assert(known.size > 20, `only ${known.size} event names found — the union moved`);

  const src = strip(read('src/bridge/effects.ts'));
  const named = new Set<string>();
  for (const m of src.matchAll(/case '([a-zA-Z]+)'|event\.type === '([a-zA-Z]+)'/g)) {
    named.add((m[1] ?? m[2])!);
  }
  assert(named.size > 0, 'src/bridge/effects.ts answers no event at all');
  for (const name of named) assert(known.has(name), `effects.ts answers '${name}', which no SimEvent carries`);
  console.log(`      ${named.size} of ${known.size} simulation events reach the canvas`);
});

check('a cue is presentation and never state', () => {
  const src = strip(read('src/bridge/effects.ts'));
  assert(!/\bstate\.[a-zA-Z.]+\s*(?:=[^=]|\+\+|--|\+=|-=)/.test(src),
    'src/bridge/effects.ts writes into the state; a cue is drawn and forgotten');
  // The only thing it may take from the simulation is its shape.
  for (const m of strip(read('src/bridge/effects.ts')).matchAll(/^\s*import\s+(type\s+)?\{([^}]*)\}\s+from\s+'([^']+)'/gm)) {
    const [, isType, names, from] = m;
    if (!from!.includes('core/')) continue;
    assert(isType, `effects.ts imports ${names!.trim()} from ${from} at runtime; the bridge's cue table is pure`);
  }
});

check('an offline batch plays nothing', () => {
  // Two assertions on purpose. The behavioural one is the contract; the
  // source one is what catches somebody deleting the guard and leaving a
  // test green because their fixture happened not to carry the event.
  const src = strip(read('src/bridge/effects.ts'));
  assert(src.includes('offlineResolved'), 'the offline guard is gone from effects.ts');
  assert(src.includes('graceEnded'), 'the grace guard is gone from effects.ts');

  const settled: SimEvent[] = [checkedOut('r1', 'g1', 25), checkedOut('r2', 'g2', 25)];
  eq(effectsFor(stateAt(4), settled).length, 2, 'two checkouts should play two cues');
  const away: SimEvent[] = [...settled, { type: 'offlineResolved', elapsedMs: 9e6, coins: 50, xp: 4, guestsServed: 2 }];
  eq(effectsFor(stateAt(4), away).length, 0,
    'coming back from a night away showers the map with coins that were banked hours ago');
  const grace: SimEvent[] = [...settled, { type: 'graceEnded', settled: 2 }];
  eq(effectsFor(stateAt(4), grace).length, 0, 'the grace batch plays effects');
});

check('the same batch of events plays the same effects twice', () => {
  const events: SimEvent[] = [
    checkedOut('r1', 'g1', 25),
    { type: 'levelUp', level: 3, rewardCoins: 200, rewardGems: 1 },
    { type: 'hazardCleared', roomId: 'r2', hazard: 'pest', coins: 12 },
  ];
  const a = JSON.stringify(effectsFor(stateAt(999), events));
  const b = JSON.stringify(effectsFor(stateAt(999), events));
  eq(a, b, 'the same tick and the same events produced two different sets of cues');

  const one = createField(64);
  const two = createField(64);
  burst(one, FX.coin, 10, 20, 8, 31337, BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD);
  burst(two, FX.coin, 10, 20, 8, 31337, BURST_SPEED_MIN, BURST_SPEED_SPAN, BURST_SPREAD_RAD);
  for (let i = 0; i < 200; i++) { stepField(one, 16.7); stepField(two, 16.7); }
  eq(one.live, two.live, 'two identical fields ran to different lengths');
  for (let i = 0; i < one.live; i++) {
    eq(one.vx[i], two.vx[i], `slot ${i} drifted in x`);
    eq(one.vy[i], two.vy[i], `slot ${i} drifted in y`);
    eq(one.ageMs[i], two.ageMs[i], `slot ${i} aged differently`);
  }
});

check('a cue table cannot quietly grow past what the frame can carry', () => {
  const events: SimEvent[] = [];
  for (let i = 0; i < 40; i++) events.push(checkedOut(`r${i}`, `g${i}`, i + 1));
  const cues: EffectCue[] = effectsFor(stateAt(2), events);
  eq(cues.length, MAX_CUES_PER_BATCH, 'a 40-room catch-up batch was not capped');
  eq(cues[cues.length - 1]!.roomId, 'r39', 'the ceiling kept the oldest cues, not the newest');
  // Same-room payouts merge before the ceiling, so a crowded room is one cue.
  const merged = effectsFor(stateAt(2), [checkedOut('r1', 'g1', 25), checkedOut('r1', 'g2', 5)]);
  eq(merged.length, 1, 'two checkouts in one room played two bursts');
  eq(merged[0]!.amount, 30, 'the merged payout did not sum its coins');
  eq(merged[0]!.kind, CUE.payout, 'a checkout is a payout');
});

// ---------------------------------------------------------- the hot path

check('the particle tick allocates nothing', () => {
  // A per-frame allocation is invisible until the collector runs, and then it
  // is a dropped frame on the lane that can least afford one (DEC-009: the
  // canvas renderer, no GPU). The forbidden list deliberately contains no
  // token a non-null assertion can trip — noUncheckedIndexedAccess forces a
  // `!` on every typed-array read in these bodies.
  const forbidden = ['new ', '.map(', '.filter(', '.slice(', '.push(', '`', '.visible ='];
  const bodies: Array<[string, string]> = [
    ['particles.ts stepField', bodyOf(strip(read('src/render/fx/particles.ts')), 'export function stepField(')],
  ];
  // The layer's own tick joins this list the moment the file exists.
  if (fs.existsSync('src/render/fx/particleLayer.ts')) {
    bodies.push(['particleLayer.ts tick', bodyOf(strip(read('src/render/fx/particleLayer.ts')), 'tick(dtMs')]);
  }
  for (const [name, body] of bodies) {
    for (const bad of forbidden) {
      assert(!body.includes(bad), `${name} contains "${bad}" — it allocates on the frame`);
    }
  }
  console.log(`      ${bodies.length} per-frame bodies read`);
});

check('the field never exceeds its capacity and never loses a cue to ambience', () => {
  const f = createField(FIELD_CAP_LITE);
  for (let i = 0; i < 400; i++) emit(f, FX.dust, 0, i, i, 1, -1, FX_LIFE_MS, i);
  assert(f.live <= FIELD_CAP_LITE, `${f.live} live particles in a ${FIELD_CAP_LITE}-slot field`);
  eq(f.dust, dustCap(FIELD_CAP_LITE), 'dust did not stop at its own share of the field');
  for (let i = 0; i < 400; i++) emit(f, FX.sparkle, 0, i, i, 0, -8, FX_LIFE_MS, i);
  eq(f.ambient, ambientCap(FIELD_CAP_LITE), 'ambience did not stop at its share of the field');

  const held = f.ambient;
  for (let i = f.live; i < FIELD_CAP_LITE; i++) emit(f, FX.coin, 1, i, i, 1, -1, FX_LIFE_MS, i);
  eq(f.live, FIELD_CAP_LITE, 'the field did not fill');
  assert(emit(f, FX.coin, 1, 5, 5, 1, -1, FX_LIFE_MS, 5),
    'a cue was refused by a field half full of garnish');
  eq(f.ambient, held - 1, 'the cue did not evict the oldest ambient particle');
  eq(f.live, FIELD_CAP_LITE, 'the eviction grew the field past its cap');
});

check('every effect is drawn on the one 12 fps clock', () => {
  // ART-0 §11 asks for drawn motion at 8–12 fps and this is what makes the
  // answer literal rather than a reading: nothing is integrated, so every
  // effect advances exactly twelve times a second, on both tiers.
  eq(stepsOf(FX_LIFE_MS), FX_STEPS, 'a one-shot is no longer six steps');
  const ms = 1000 / 12;
  for (let age = 0; age < FX_LIFE_MS; age += 3) {
    eq(stepOf(age, FX_LIFE_MS, false), Math.min(FX_STEPS - 1, Math.floor(age / ms)),
      `the step at ${age} ms is off the 12 fps grid`);
    eq(stepOf(age, FX_LIFE_MS, true), 0, 'reduced motion let the position step advance');
  }
});

// ------------------------------------------------------- DEC-021, the words

check('the effects channel draws no glyph through a font, and the canvas\'s remaining text is a closed list', () => {
  // Two halves, and the split is the point. The first is the promise S4
  // makes: nothing it adds reaches a font. The second is the truth about the
  // tree it was added to — three Pixi Text placeholders were already there,
  // and a check that asserted "none anywhere" would have been red on the
  // merged main before a line of S4 existed.
  const banned = [/fillText/, /measureText/, /\bnew Text\(/, /BitmapText/, /HTMLText/, /\bfont\s*=/];
  const watched = [...fxFiles(), 'src/bridge/effects.ts'];
  for (const file of watched) {
    const src = strip(read(file));
    for (const bad of banned) assert(!bad.test(src), `${file} matches ${bad} — the effects channel reached for a font`);
    assert(!/import\s*\{[^}]*\bText\b[^}]*\}\s*from\s*'pixi\.js'/.test(src),
      `${file} imports Text from pixi.js`);
  }

  // The digits are polygon data, countable, in a file with no string in it.
  eq(GLYPHS.length, GLYPH_COUNT, 'the glyph table lost an entry');
  // Ten digits, a plus and six marks. There is no sleeper's `z` among them:
  // the rig draws a lying sleeper two of its own at both tiers, so this
  // channel dropped its third in review (step report §9 row 1).
  eq(GLYPH_COUNT, 17, 'GLYPH_COUNT moved without the atlas moving with it');
  for (let d = 0; d < DIGIT_COUNT; d++) {
    assert((GLYPHS[d]?.length ?? 0) > 0, `digit ${d} has no geometry`);
  }
  const glyphs = strip(read('src/render/fx/glyphs.ts')).replace(/^\s*import[^\n]*\n/gm, '');
  assert(!/['"`]/.test(glyphs), 'src/render/fx/glyphs.ts carries a string literal; the glyphs are geometry');

  // The closed allow-list. BL-051 owns retiring these three with the real
  // room and decor art; until then they are ASCII derived from data ids
  // (room.defId, piece.category.slice(0, 4).toUpperCase()), never from
  // src/i18n, which is what the RTL assertion in game.spec.ts actually
  // guards. A fourth cannot appear without this check saying so.
  const allowed: Record<string, number> = { 'src/render/roomView.ts': 2, 'src/render/decorView.ts': 1 };
  const found: Record<string, number> = {};
  for (const file of sources('src/render')) {
    const hits = strip(read(file)).match(/\bnew Text\(/g);
    if (hits) found[file.split(path.sep).join('/')] = hits.length;
  }
  const names = Object.keys(found).sort();
  eq(names.join(','), Object.keys(allowed).sort().join(','), 'the canvas grew or lost a Text placeholder');
  for (const name of names) eq(found[name], allowed[name], `${name} draws a different number of Text nodes`);
  console.log(`      ${names.length} files still draw Pixi Text, ${Object.values(allowed).reduce((a, b) => a + b, 0)} nodes (BL-051)`);
});

check('no effect names a colour the palette does not have', () => {
  // The boundary and the negative lookahead are load-bearing: a bare
  // /0x....../ matches the first six hex digits of the seed mixers
  // (0x9e3779b9, 0x85ebca6b — the constants anim/scheduler.ts and anim/rig.ts
  // already mix with) and would reject the very file it was written to guard.
  const named = new Set<number>(Object.values(PALETTE));
  const derived = new Set<number>(named);
  for (const colour of named) {
    for (let t = -1; t <= 1.0001; t += 0.05) {
      derived.add(shade(colour, t));
      derived.add(lighten(colour, t));
    }
  }
  let seen = 0;
  for (const file of fxFiles()) {
    for (const m of strip(read(file)).matchAll(/0x[0-9a-fA-F]{6}(?![0-9a-fA-F])/g)) {
      const value = Number.parseInt(m[0]!, 16);
      seen++;
      assert(derived.has(value), `${file} names ${m[0]}, which is neither a palette colour nor a shade of one`);
    }
  }
  console.log(`      ${seen} literal colours across ${fxFiles().length} fx files, all from the cast palette`);
});

// --------------------------------------------------------- BL-048, upstream

check('Pixi still restores a blend mode it did not set', () => {
  // The defect BL-048 is closed against, read from the installed sources.
  // The sprite batch sets the 2D blend mode in place; the Graphics adaptor
  // sets it *inside* a save()/restore() pair, and the context system caches
  // only the mode it last asked for — so the restore silently puts the real
  // globalCompositeOperation back while the cache still believes the mode it
  // was told. This check exists to tell us the day an upgrade fixes that, so
  // BL-050 can retire the blend fence with evidence rather than by feel.
  const batch = 'node_modules/pixi.js/lib/rendering/batcher/canvas/CanvasBatchAdaptor.mjs';
  const graphics = 'node_modules/pixi.js/lib/scene/graphics/canvas/CanvasGraphicsAdaptor.mjs';
  const context = 'node_modules/pixi.js/lib/rendering/renderers/canvas/CanvasContextSystem.mjs';
  if (!fs.existsSync(batch) || !fs.existsSync(graphics) || !fs.existsSync(context)) {
    console.log('      pixi.js is not installed here; skipped (cold checkout)');
    return;
  }
  const b = read(batch);
  assert(/contextSystem\.setBlendMode\(batch\.blendMode\)/.test(b),
    'the sprite batch no longer sets the blend mode — re-read BL-048 before trusting the fence');
  const g = read(graphics);
  const save = g.indexOf('context.save()');
  const set = g.indexOf('setBlendMode(renderable.groupBlendMode)');
  const restore = g.lastIndexOf('context.restore()');
  assert(save >= 0 && set > save && restore > set,
    'the Graphics adaptor no longer wraps its blend mode in save/restore — BL-048 may be fixed upstream (BL-050)');
  assert(/if \(this\._activeBlendMode === blendMode\) return;/.test(read(context)),
    'the context system no longer early-returns on a cached blend mode — BL-048 may be fixed upstream (BL-050)');
});

// ------------------------------------------------------- BL-048, this tree

check('nothing drawn after the lights is a Graphics', () => {
  // The primary guard, and it is structural rather than mechanical: only
  // CanvasGraphicsAdaptor can leave the cached blend mode and the real one
  // disagreeing, so a layer above the light that contains no Graphics cannot
  // start the leak at all — whatever the fence does or does not do.
  const layout = strip(read('src/render/layout.ts'));
  const at = (name: string): number => {
    const m = layout.match(new RegExp(`\\b${name}:\\s*(\\d+)`));
    assert(m, `LAYER has no ${name}`);
    return Number(m![1]);
  };
  assert(at('overlays') < at('effects'), 'the effects are drawn under the light they are meant to read over');
  assert(at('effects') < at('indicators'), 'the effects squat on the layer S5 reserved for the lift indicator');

  // Everything additive lives inside the overlays layer, beside the pools.
  const additive: string[] = [];
  for (const file of sources('src/render')) {
    const src = strip(read(file));
    if (!/blendMode\s*=\s*'add'/.test(src)) continue;
    const name = file.split(path.sep).join('/');
    additive.push(name);
    assert(/overlays/.test(src), `${name} blends additively but is not parented into layers.overlays`);
    assert(!/new Graphics\(/.test(src), `${name} blends additively with a Graphics — this is BL-048's ignition`);
  }
  assert(additive.length > 0, 'nothing is additive any more; re-read DEC-018 before deleting this check');

  for (const file of ['src/render/fx/particleLayer.ts', 'src/render/fx/pulseLayer.ts']) {
    const src = strip(read(file));
    assert(!/new Graphics\(/.test(src), `${file} constructs a Graphics above the light`);
    assert(!/import\s*\{[^}]*\bGraphics\b[^}]*\}\s*from\s*'pixi\.js'/.test(src),
      `${file} imports Graphics from pixi.js`);
  }

  /*
   * And nothing in the channel tints a sprite.
   *
   * It is a performance rule with a picture behind it: Pixi's Canvas2D sprite
   * path keeps a tinted *copy* of a texture per (texture, tint) pair, so one
   * `.tint =` in this directory turns a burst of atlas frames — today one run
   * of `drawImage` calls off a single source — into a run of one-off
   * canvases, on the lane that has no GPU to spare (DEC-009). The colour is
   * baked into the atlas instead (atlas.ts's docblock says so and this is
   * what holds it); an explicit `= 0xffffff` is allowed, because it says the
   * same thing out loud.
   */
  let tints = 0;
  for (const file of fxFiles()) {
    for (const m of strip(read(file)).matchAll(/\.tint\s*=\s*([^;\n]+)/g)) {
      tints++;
      eq(m[1]!.trim(), '0xffffff', `${file} tints an effect sprite; the colour belongs in the atlas`);
    }
  }
  console.log(`      ${additive.length} additive files, all inside layers.overlays; ${tints} tint writes in src/render/fx`);
});

check('the blend fence leads the effects layer', () => {
  // Its *position* is what is load-bearing: a fence that is not first no
  // longer protects anything drawn before it. Its whole value is leaving the
  // cached mode and the real one agreeing at 'normal' after the additive
  // batch, so a Graphics drawn later takes the early return at
  // CanvasContextSystem.mjs:117, draws against 'source-over' and restores
  // 'source-over' — harmless instead of fatal.
  const src = strip(read('src/render/fx/particleLayer.ts'));
  assert(/addChildAt\(this\.fence,\s*0\)/.test(src), 'the blend fence is no longer the first child of the effects layer');
  assert(/this\.fence\.blendMode\s*=\s*'normal'/.test(src), 'the fence does not set a normal blend mode, which is the only thing it is for');
  // The guarded renderable toggle is the pool's, never the fence's: the
  // resynchronisation has to happen on every frame, live or idle.
  const toggles = [...src.matchAll(/this\.(\w+)\.renderable\s*=/g)].map((m) => m[1]!);
  assert(toggles.length > 0, 'nothing toggles renderable any more');
  for (const name of toggles) eq(name, 'pool', 'something other than the sprite pool toggles renderable in the effects layer');
});

check('a floating number is never hidden under a reaction card', () => {
  /*
   * `inspectorFound` pushes a payout and a praise for the SAME person in the
   * same batch, and the card is centred four px over the head and 24 px tall
   * — exactly the span the `+N` rises through. With one flat container the
   * draw order was creation order, so the number the channel's own contract
   * says is never withheld spent its whole life behind the card. Three
   * groups inside the pool pin the order instead, whatever order the cues
   * arrive in; a Container is not a Graphics, so BL-048 is untouched.
   */
  const src = strip(read('src/render/fx/particleLayer.ts'));
  const order = [...src.matchAll(/this\.pool\.addChild\(this\.(\w+)\)/g)].map((m) => m[1]!);
  eq(order.join(','), 'parts,cards,numbers', 'the effect groups are not parented in draw order');
  assert(/this\.parts\.addChild\(sprite\)/.test(src), 'a particle is no longer drawn in the parts group');
  assert(/makeSprite\(this\.cards\)/.test(src), 'a bubble is no longer drawn in the cards group');
  assert(/makeSprite\(this\.numbers\)/.test(src), 'a label is no longer drawn in the numbers group');

  // And the event this order exists for still behaves the way it did.
  const found: SimEvent[] = [{ type: 'inspectorFound', guestId: 'g1', coins: 25, xp: 3, boost: 0 }];
  const cues = effectsFor(stateAt(7), found);
  eq(cues.length, 2, 'inspectorFound no longer plays two cues');
  eq(cues[0]!.charId, cues[1]!.charId, 'the two inspectorFound cues no longer land on one person');
  eq(cues[0]!.kind, CUE.payout, 'inspectorFound no longer pays first');
  eq(cues[1]!.kind, CUE.praise, 'inspectorFound no longer praises');
});

check('the canvas and the bridge agree what a cue number means', () => {
  // The scene takes its cues structurally so that src/render imports nothing
  // from src/bridge, which means the cue table exists twice. This is what
  // makes two copies safe: they are read back and compared, name by name.
  const table = (file: string, name: string): Record<string, number> => {
    const src = strip(read(file));
    const at = src.indexOf(`${name} = {`);
    assert(at >= 0, `${file} has no ${name} table`);
    const body = src.slice(at, src.indexOf('}', at));
    const out: Record<string, number> = {};
    for (const m of body.matchAll(/(\w+):\s*(\d+)/g)) out[m[1]!] = Number(m[2]);
    return out;
  };
  const bridge = table('src/bridge/effects.ts', 'CUE');
  const render = table('src/render/fx/particleLayer.ts', 'FX_CUE');
  eq(Object.keys(render).sort().join(','), Object.keys(bridge).sort().join(','),
    'the canvas and the bridge name different cues');
  for (const key of Object.keys(bridge)) eq(render[key], bridge[key], `the two tables disagree about '${key}'`);
  eq(bridge['payout'], CUE.payout, 'the parsed table does not match the imported one');
  console.log(`      ${Object.keys(bridge).length} cues, the same number on both sides`);
});

check('ambience runs only where the phase it reads is the phase that is drawn', () => {
  // The footfall reads the raw `rigState.phase`; rig.ts draws
  // `gridT(rs.phase, frames)` on the lite tier instead. Raw and drawn agree
  // only on the full tier, which is harmless exactly because ambience does
  // not run anywhere else — so that guard is the contract, and this is it.
  const scene = strip(read('src/render/scene.ts'));
  const at = scene.indexOf('const ambient');
  assert(at >= 0, 'scene.ts no longer hoists one guard for the three ambient polls');
  const guard = scene.slice(at, scene.indexOf('this.visibleCharacters', at));
  assert(guard.includes("motionTier() === 'full'"),
    "the ambient guard no longer names motionTier() === 'full'");
  for (const poll of ['takeFootfall()', 'takeWorkStroke()']) {
    assert(guard.includes(poll), `${poll} is not inside the full-tier guard in scene.ts`);
  }
  // And the one that was dropped stays dropped: a third `z` over a sleeper
  // the rig already draws two for is the defect, not the absence of one.
  assert(!/takeSleepBeat/.test(scene), 'the sleeper\'s mark came back; the rig already draws two (step report §9 row 1)');
  // And the guard turns them off for a player who asked for less motion.
  assert(/prefersReducedMotion\(\)/.test(guard), 'ambience ignores a request for less motion');

  const rig = strip(read('src/render/anim/rig.ts'));
  assert(/gridT\(rs\.phase/.test(rig), 'rig.ts no longer quantises the stride phase on the lite tier — re-read this check');
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
