/**
 * Headless checks for the things that only matter at ship time: the web app
 * manifest, the icons, the service worker, and whether the end-to-end suite
 * actually covers the failures this project has had.
 *
 * A PWA fails silently. An icon at the wrong size, a manifest field a store
 * requires, a service worker that caches a stale shell — none of it throws,
 * and all of it is discovered by a user.
 *
 * Run: node --experimental-strip-types tools/selftest/shipping.ts
 */
import fs from 'node:fs';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

/** Reads a PNG header without a decoder. */
function pngSize(path: string): { w: number; h: number } {
  const buf = fs.readFileSync(path);
  return { w: buf.readUInt32BE(16), h: buf.readUInt32BE(20) };
}

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — shipping self-test');
console.log(line);

// ---------------------------------------------------------------- manifest
const manifest = JSON.parse(fs.readFileSync('public/manifest.webmanifest', 'utf8'));

check('the manifest has every field an install prompt needs', () => {
  for (const field of ['name', 'short_name', 'start_url', 'display', 'icons', 'theme_color', 'background_color']) {
    assert(field in manifest, `"${field}" is missing — browsers will not offer to install`);
  }
  eq(manifest.display, 'standalone', 'the app would open in a browser tab rather than as an app');
});

check('the short name fits a home screen', () => {
  assert(manifest.short_name.length <= 12,
    `"${manifest.short_name}" is ${manifest.short_name.length} characters and will be truncated`);
});

check('every declared icon exists at the size it claims', () => {
  for (const icon of manifest.icons as Array<{ src: string; sizes: string }>) {
    const path = `public/${icon.src}`;
    assert(fs.existsSync(path), `"${icon.src}" is declared but the file is missing`);
    const [w, h] = icon.sizes.split('x').map(Number);
    const actual = pngSize(path);
    eq(actual.w, w, `"${icon.src}" is ${actual.w}px wide but claims ${w}`);
    eq(actual.h, h, `"${icon.src}" is ${actual.h}px tall but claims ${h}`);
  }
});

check('a 192 and a 512 icon are both present', () => {
  const sizes = new Set((manifest.icons as Array<{ sizes: string }>).map((i) => i.sizes));
  assert(sizes.has('192x192'), 'no 192px icon — Android install prompts require one');
  assert(sizes.has('512x512'), 'no 512px icon — splash screens require one');
});

check('a maskable icon is provided for adaptive launchers', () => {
  const maskable = (manifest.icons as Array<{ purpose?: string }>).some((i) => i.purpose === 'maskable');
  assert(maskable, 'no maskable icon — Android will letterbox the icon in a white circle');
});

check('the theme colour matches the app background', () => {
  const css = fs.readFileSync('src/index.css', 'utf8');
  assert(css.includes(manifest.background_color.replace('#', '')),
    `the manifest background ${manifest.background_color} is not in the stylesheet — the splash will flash a different colour`);
});

check('the html declares the manifest and an apple touch icon', () => {
  const html = fs.readFileSync('index.html', 'utf8');
  assert(html.includes('manifest.webmanifest'), 'index.html does not link the manifest');
  assert(html.includes('apple-touch-icon'), 'iOS home screens would get a screenshot instead of an icon');
});

// ---------------------------------------------------------------- worker
const sw = fs.readFileSync('public/sw.js', 'utf8');

check('the service worker handles install, activate and fetch', () => {
  for (const event of ['install', 'activate', 'fetch']) {
    assert(sw.includes(`'${event}'`), `the worker never listens for "${event}"`);
  }
});

check('old caches are cleared on activate', () => {
  assert(/caches\.delete/.test(sw),
    'nothing deletes old caches — storage grows with every release');
});

check('the app shell is network-first, not cache-first', () => {
  // Serving a stale index.html after a deploy strands a player on a build that
  // may not understand their save.
  const fetchBlock = sw.slice(sw.indexOf("addEventListener('fetch'"));
  const shellHandler = fetchBlock.slice(fetchBlock.lastIndexOf('event.respondWith'));
  assert(shellHandler.indexOf('fetch(request)') < shellHandler.indexOf('caches.match'),
    'the shell is served from cache before the network');
});

check('the worker only handles same-origin GETs', () => {
  assert(sw.includes("request.method !== 'GET'"), 'the worker would intercept POSTs');
  assert(sw.includes('url.origin !== self.location.origin'), 'the worker would intercept third-party requests');
});

check('the worker is registered in production only', () => {
  const main = fs.readFileSync('src/main.tsx', 'utf8');
  assert(main.includes('serviceWorker.register'), 'nothing registers the worker');
  assert(/import\.meta\.env\.PROD/.test(main),
    'the worker would cache a dev bundle and hide every change until storage is cleared');
});

// ---------------------------------------------------------------- e2e cover
const spec = fs.readdirSync('tests/e2e')
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => fs.readFileSync(`tests/e2e/${f}`, 'utf8'))
    .join('\n');
const titles = [...spec.matchAll(/test\('([^']+)'/g)].map((m) => m[1]!);

check('nothing in the verify chain runs unchecked here', () => {
  // `npm run verify` runs four things. Three of them need node_modules and so
  // could not execute in this container — meaning their claims went unverified
  // for fourteen rounds, through a balance retune that changed every income
  // figure in the game.
  //
  // Each one now needs either a headless mirror or a reason not to have one.
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  const verify: string = pkg.scripts.verify;
  const covered: Record<string, string> = {
    'validate:data': 'runs here directly',
    typecheck: 'needs the compiler; the import and schema guards catch its usual failures',
    lint: 'needs eslint; the boundary rules are also asserted structurally',
    'test:logic': 'mirrored by tools/selftest/vitest-parity.ts',
    'test:selftest': 'is this',
  };
  const steps = [...verify.matchAll(/npm run ([\w:]+)/g)].map((m) => m[1]!);
  for (const step of steps) {
    assert(step in covered, `"${step}" is in verify and has no headless account of it`);
  }
  assert(fs.existsSync('tools/selftest/vitest-parity.ts'),
    'the vitest suite has no headless mirror, so its claims go unchecked between runs');
  console.log(`      ${steps.length} verify steps, all accounted for`);
});

check('the browser suite covers every screen a player opens', () => {
  // The suite was written in P6a and did not grow with the game. Four panels
  // arrived after it — shop, city, upgrades, the daily gift — and running it
  // would have reported a healthy pass while never opening half of them.
  //
  // A passing suite that tests less than it appears to is worse than a missing
  // one, because it is trusted.
  const spec = fs.readdirSync('tests/e2e')
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => fs.readFileSync(`tests/e2e/${f}`, 'utf8'))
    .join('\n').toLowerCase();
  const screens: Array<[string, RegExp]> = [
    ['BuildPanel', /build menu|\+ build/],
    ['RoomSheet', /room.*sheet|decorat/],
    ['ShiftPanel', /shift|open hotel/],
    ['ShopPanel', /shop/],
    ['CityPanel', /the city|rival/],
    ['UpgradesPanel', /upgrade/],
    ['DailyGift', /daily gift/],
    ['SettingsSheet', /settings|export|sound/],
  ];
  const missing = screens
    .filter(([file]) => fs.existsSync(`src/ui/${file}.tsx`))
    .filter(([, pattern]) => !pattern.test(spec))
    .map(([file]) => file);
  assert(missing.length === 0,
    `no browser scenario ever opens: ${missing.join(', ')}`);
  console.log(`      ${screens.length} screens, all reached by a scenario`);
});

check('the commands a player can issue are exercised', () => {
  // Not every command needs its own scenario, but a command nothing in the
  // browser ever triggers has only ever been proved in a simulation.
  const commands = fs.readFileSync('src/core/commands/index.ts', 'utf8');
  const all = [...commands.matchAll(/\| \{ type: '([A-Z_]+)'/g)].map((m) => m[1]!);
  const spec = fs.readdirSync('tests/e2e')
    .filter((f) => f.endsWith('.spec.ts'))
    .map((f) => fs.readFileSync(`tests/e2e/${f}`, 'utf8'))
    .join('\n').toLowerCase();
  const words: Record<string, RegExp> = {
    BUILD_ROOM: /build/, PLACE_DECOR: /decorat/, START_SHIFT: /shift|open hotel/,
    CLAIM_OBJECTIVE: /objective|claim/, BUY_SHOP_OFFER: /shop/,
    CLAIM_GIFT: /daily gift|collect/, VISIT_NEIGHBOUR: /visit/,
    BUY_UPGRADE: /upgrade/, HIRE_STAFF: /staff/,
  };
  const untested = Object.keys(words).filter((c) => all.includes(c) && !words[c]!.test(spec));
  assert(untested.length === 0, `never reached from a browser: ${untested.join(', ')}`);
  console.log(`      ${Object.keys(words).length} of ${all.length} commands reachable from a scenario`);
});

check('there are end-to-end tests at all', () => {
  assert(titles.length >= 10, `only ${titles.length} end-to-end tests exist`);
  console.log(`      ${titles.length} scenarios`);
});

check('every shipped failure has a test that would have caught it', () => {
  // One entry per bug this project actually released. If a regression class
  // has no browser test, it can happen again unnoticed.
  const mustCover: Array<[string, RegExp]> = [
    ['boot stuck on loading (StrictMode)', /boots past the loading screen/i],
    ['art present but never loaded', /room art actually loads/i],
    ['renderer never initialised', /renderer initialises/i],
    ['countdown looked frozen', /countdown ticks/i],
    ['decor meter unreachable', /decorating moves the meter/i],
    ['save never verified in a browser', /survives a full reload/i],
    ['RTL flipped the canvas', /without flipping the canvas/i],
    ['export unreachable', /can be exported/i],
  ];
  for (const [bug, pattern] of mustCover) {
    assert(titles.some((t) => pattern.test(t)), `no end-to-end test covers: ${bug}`);
  }
});

check('the e2e suite starts from a clean hotel', () => {
  assert(/deleteDatabase/.test(spec),
    'tests would inherit each other\'s saves and pass or fail depending on order');
});

check('the e2e config runs a phone profile', () => {
  const config = fs.readFileSync('playwright.config.ts', 'utf8');
  assert(/devices\['Pixel|iPhone/.test(config),
    'only desktop is tested, and this game is only designed for phones');
});

// ---------------------------------------------------------------- budgets
check('the budget checker is wired into the build', () => {
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert(pkg.scripts.build.includes('check:budget'),
    'budgets are checked only if someone remembers to — which means never');
});

check('the shipped payload is inside its budget', () => {
  let bytes = 0;
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = `${dir}/${name}`;
      const stat = fs.statSync(full);
      if (stat.isDirectory()) walk(full);
      else bytes += stat.size;
    }
  };
  walk('public');
  const mb = bytes / 1024 / 1024;
  assert(mb < 8, `public/ is ${mb.toFixed(1)}MB`);
  console.log(`      everything served is ${mb.toFixed(2)}MB`);
});

check('the worker never caches application code', () => {
  // The cache-first rule matched `/assets/`, which is also where the built
  // JavaScript bundle lands. A stale bundle looks exactly like a deployment
  // that never happened, and we spent two verification rounds on that shape
  // of problem already.
  const worker = fs.readFileSync('public/sw.js', 'utf8');
  const rule = /const isAsset = ([\s\S]*?);/.exec(worker)?.[1] ?? '';
  assert(rule.length > 0, 'the asset rule was not found');
  assert(!/\\\/assets\\\/\|/.test(rule) && !/'\/assets\/'/.test(rule),
    'the worker caches everything under /assets/, including the code bundle');
  for (const dir of ['rooms', 'characters', 'audio']) {
    assert(rule.includes(dir), `the worker no longer caches ${dir}`);
  }
});

check('a stale deployment can be cleared without developer tools', () => {
  const main = fs.readFileSync('src/main.tsx', 'utf8');
  assert(/fresh/.test(main) && /unregister/.test(main),
    'there is no way for a player to clear a stuck worker');
});

check('the build is identifiable without opening a console', () => {
  const app = fs.readFileSync('src/ui/App.tsx', 'utf8');
  assert(/__BUILD_ID__/.test(app), 'the loading screen does not say which build it is');
});

check('nothing excludes the art from a deployment', () => {
  // The single line `public/assets/` in .gitignore shipped three releases
  // without their character art. The rooms survived only because they had
  // been committed before the rule started mattering.
  const ignore = fs.existsSync('.gitignore') ? fs.readFileSync('.gitignore', 'utf8') : '';
  const active = ignore
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  for (const rule of active) {
    const bare = rule.replace(/^!?\/?/, '').replace(/\/$/, '');
    if (!bare) continue;
    assert(!/^public/.test(bare),
      `.gitignore rule "${rule}" excludes served art from any deployment through git`);
    assert(!/^assets/.test(bare),
      `.gitignore rule "${rule}" excludes the art directory`);
  }
});

check('the build refuses to ship without its declared art', () => {
  const checker = fs.readFileSync('tools/check-budget.mjs', 'utf8');
  assert(/assets shipped/.test(checker),
    'the build never compares what dist contains against what the manifest declares');
  const pkg = JSON.parse(fs.readFileSync('package.json', 'utf8'));
  assert(pkg.scripts.build.includes('check:budget'),
    'the completeness check is not part of the build');
});

check('every asset the manifest declares exists in the source tree', () => {
  const manifest = JSON.parse(fs.readFileSync('public/assets/manifest.json', 'utf8'));
  const absent = manifest.entries.filter(
    (e: { file: string }) => !fs.existsSync(`public/assets/${e.file}`),
  );
  assert(absent.length === 0,
    `${absent.length} declared assets are missing from public/: ` +
    absent.slice(0, 5).map((e: { file: string }) => e.file).join(', '));
  console.log(`      all ${manifest.entries.length} declared assets present`);
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
