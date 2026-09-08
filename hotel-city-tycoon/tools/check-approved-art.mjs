/** Build-time validation needs only Node; Pillow is an art-export dependency. */
import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const family = 'art-source/approved/cartoon-v1';
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const sources = read(`${family}/sources.json`).sources;
const exports = read(`${family}/exports.json`).exports;
const entries = new Map(read('public/assets/manifest.json').entries.map(e => [e.file, e]));
const pngMagic = '89504e470d0a1a0a';

function verify(file, row, expected) {
  const bytes = fs.readFileSync(path.join(root, file));
  if (createHash('sha256').update(bytes).digest('hex') !== row.sha256) {
    throw new Error(`Protected artwork changed: ${file}. Re-export its versioned sources.`);
  }
  if (bytes.subarray(0, 8).toString('hex') !== pngMagic || bytes.readUInt32BE(16) !== expected[0]
      || bytes.readUInt32BE(20) !== expected[1]) throw new Error(`Invalid PNG size: ${file}`);
  return bytes;
}

for (const row of sources) verify(`${family}/${row.file}`, row, row.size);
for (const row of exports) {
  const rel = row.file.replace(/^public\/assets\/(?:@\d+x\/)?/, '');
  const entry = entries.get(rel);
  if (!entry) throw new Error(`Unlisted artwork: ${row.file}`);
  const bytes = verify(row.file, row, [entry.width * row.tier, entry.height * row.tier]);
  if (bytes[25] !== 6) throw new Error(`Export must retain RGBA channels: ${row.file}`);
}
console.log(`${sources.length} source hashes and ${exports.length} protected exports verified against manifest.`);
