/**
 * Number formatting follows the chosen language, not the device.
 *
 * Fourteen call sites used a bare `toLocaleString()`. A player who chose
 * Arabic on an Arabic device saw Arabic-Indic digits; the same player on an
 * English device saw Western ones. Same game, same screen, different numbers —
 * and nothing in the game had any say in it.
 *
 * Run: node --experimental-strip-types tools/selftest/format.ts
 */
import fs from 'node:fs';
import path from 'node:path';
import { num, coins, percent } from '../../src/i18n/format.ts';

let passed = 0;
const failures: string[] = [];
function check(name: string, fn: () => void): void {
  try { fn(); passed++; console.log(`  ✓ ${name}`); }
  catch (e) { failures.push(name); console.log(`  ✗ ${name}\n      ${(e as Error).message}`); }
}
function assert(c: unknown, m: string): asserts c { if (!c) throw new Error(m); }
function eq(a: unknown, b: unknown, m: string): void { if (a !== b) throw new Error(`${m} (got ${String(a)}, expected ${String(b)})`); }

const line = '─'.repeat(66);
console.log(line);
console.log('  Hotel City Tycoon — number formatting');
console.log(line);

check('the interface never formats by device', () => {
  // The defect itself. A bare call reads the device, not the game.
  const problems: string[] = [];
  const walk = (dir: string) => {
    for (const name of fs.readdirSync(dir)) {
      const full = path.join(dir, name);
      if (fs.statSync(full).isDirectory()) { walk(full); continue; }
      if (!/\.tsx?$/.test(name)) continue;
      const src = fs.readFileSync(full, 'utf8');
      if (/toLocaleString\(\s*\)/.test(src)) problems.push(full);
    }
  };
  walk('src/ui');
  assert(problems.length === 0,
    `these follow the device rather than the chosen language: ${problems.join(', ')}`);
});

check('both languages produce the same digits', () => {
  // Arabic-Indic numerals are correct Arabic. They are not used here on
  // purpose: a tycoon game is read as numbers far more than as prose, and a
  // digit system that shifts with a device is worse than one that is plainly
  // consistent.
  eq(num('en', 1234567).replace(/[^\d]/g, ''), '1234567', 'English digits changed');
  eq(num('ar', 1234567).replace(/[^\d]/g, ''), '1234567', 'Arabic switched digit system');
});

check('large numbers are shortened rather than shown in full', () => {
  // A late hotel holds hundreds of millions. "268,146,111" in a button is
  // length, not value.
  assert(coins('en', 268_146_111).length < 10,
    `a nine-figure sum renders as "${coins('en', 268_146_111)}"`);
  assert(/M$/.test(coins('en', 5_400_000)), 'millions are not shortened');
  assert(/K$/.test(coins('en', 250_000)), 'hundreds of thousands are not shortened');
  console.log(`      ${coins('en', 268_146_111)} · ${coins('en', 5_400_000)} · ${coins('en', 250_000)} · ${coins('en', 4300)}`);
});

check('small numbers are left alone', () => {
  // Shortening what a player counts in their head is a loss, not a gain.
  eq(coins('en', 30), '30', 'a two-figure reward was abbreviated');
  eq(coins('en', 4300), '4,300', 'a four-figure sum was abbreviated');
});

check('negative and zero survive', () => {
  eq(coins('en', 0), '0', 'zero renders wrongly');
  assert(coins('en', -1500).startsWith('-'), 'a negative lost its sign');
});

check('percentages are whole and signed correctly', () => {
  eq(percent('en', 0.5).replace(/[^\d%]/g, ''), '50%', 'a half is not fifty percent');
  eq(percent('en', 1).replace(/[^\d%]/g, ''), '100%', 'a full meter is not a hundred percent');
});

check('formatters are reused rather than rebuilt', () => {
  // The HUD redraws ten times a second and constructing an Intl formatter is
  // not cheap; building one per frame is the kind of cost that never shows up
  // in a profile as any single thing.
  const source = fs.readFileSync('src/i18n/format.ts', 'utf8');
  assert(/cache/.test(source) && /Map/.test(source), 'formatters are constructed on every call');
});

check('the shared price row knows the language', () => {
  // It renders every price in the game. An automated conversion left it
  // printing a raw integer, which was worse than the defect being fixed.
  const sheet = fs.readFileSync('src/ui/Sheet.tsx', 'utf8');
  assert(/formatCoins\(locale/.test(sheet), 'the shared row prints an unformatted number');
  for (const panel of ['BuildPanel', 'ShopPanel', 'ShiftPanel']) {
    const src = fs.readFileSync(`src/ui/${panel}.tsx`, 'utf8');
    assert(/locale=\{locale\}/.test(src), `${panel} does not tell the row which language to use`);
  }
});

console.log(line);
if (failures.length === 0) console.log(`  ${passed} checks passed`);
else { console.log(`  ${passed} passed, ${failures.length} FAILED`); failures.forEach((f) => console.log(`    ✗ ${f}`)); }
console.log(line);
process.exit(failures.length ? 1 : 0);
