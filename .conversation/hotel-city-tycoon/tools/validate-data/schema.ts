/**
 * Shape validation for data/*.json using the Zod schemas that also produce
 * the app's TypeScript types. Run with: npm run validate:data:schema
 *
 * Pairs with integrity.mjs — that one checks references between files,
 * this one checks the shape of each file. Both must pass before a build.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { ZodTypeAny } from 'zod';
import {
  EconomySchema, RoomsSchema, ShiftsSchema, StarsSchema, GuestsSchema,
  StaffSchema, EventsSchema, PlotsSchema, DecorSchema, LevelsSchema, ObjectivesSchema, UpgradesSchema, ShopSchema, SeasonsSchema, GiftsSchema, NeighboursSchema,
} from '../../src/data/schemas/index.ts';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

const TARGETS: Array<[string, ZodTypeAny]> = [
  ['economy.json', EconomySchema],
  ['rooms.json', RoomsSchema],
  ['shifts.json', ShiftsSchema],
  ['stars.json', StarsSchema],
  ['guests.json', GuestsSchema],
  ['staff.json', StaffSchema],
  ['events.json', EventsSchema],
  ['plots.json', PlotsSchema],
  ['decor.json', DecorSchema],
  ['levels.json', LevelsSchema],
  ['objectives.json', ObjectivesSchema],
  ['upgrades.json', UpgradesSchema],
  ['shop.json', ShopSchema],
  ['neighbours.json', NeighboursSchema],
  ['seasons.json', SeasonsSchema],
  ['gifts.json', GiftsSchema],
];

let failed = 0;
const line = '─'.repeat(58);
console.log(line);
console.log('  Hotel City Tycoon — data schema');
console.log(line);

for (const [file, schema] of TARGETS) {
  const raw = JSON.parse(fs.readFileSync(path.join(ROOT, 'data', file), 'utf8'));
  const result = schema.safeParse(raw);
  if (result.success) {
    console.log(`  ✓ ${file}`);
  } else {
    failed++;
    console.log(`  ✗ ${file}`);
    for (const issue of result.error.issues.slice(0, 12)) {
      console.log(`      ${issue.path.join('.') || '(root)'} — ${issue.message}`);
    }
    if (result.error.issues.length > 12) {
      console.log(`      … and ${result.error.issues.length - 12} more`);
    }
  }
}

console.log(line);
console.log(`  ${failed} file(s) failed schema validation`);
console.log(line);
process.exit(failed ? 1 : 0);
