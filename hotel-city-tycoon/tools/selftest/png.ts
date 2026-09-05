/**
 * A minimal PNG reader, shared by the selftests that look at shipped pixels.
 *
 * Every asset test until HC-P1 checked the manifest — that a key has a file
 * and a path resolves. None of them opened one. That is how a night wash that
 * clipped every pale blue to #0000FF shipped through a green suite: the only
 * thing that would have caught it is looking at the pixels. `assets.ts` reads
 * room and decor art through this; `animations.ts` reads the character sheets,
 * where a pivot that drifts one pixel between frames is a limping walk.
 *
 * Handles the 8-bit RGB/RGBA/indexed, non-interlaced files the art pipeline
 * produces — `save_png` quantises anything under 256 colours, so the pest
 * overlays arrive palettised — and refuses anything else rather than guessing.
 *
 * Runs under `node --experimental-strip-types`: no enums, no parameter
 * properties, and nothing imported that a cold checkout does not have.
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

export interface Png { width: number; height: number; channels: number; data: Buffer }

export function readPng(path: string): Png {
  const file = fs.readFileSync(path);
  if (file.readUInt32BE(0) !== 0x89504e47) throw new Error(`${path} is not a PNG`);
  let pos = 8;
  let width = 0; let height = 0; let depth = 0; let colour = 0; let interlace = 0;
  const idat: Buffer[] = [];
  let palette: Buffer | null = null;
  let alphas: Buffer | null = null;
  while (pos < file.length) {
    const len = file.readUInt32BE(pos);
    const type = file.toString('ascii', pos + 4, pos + 8);
    const body = file.subarray(pos + 8, pos + 8 + len);
    pos += 12 + len;
    if (type === 'IHDR') {
      width = body.readUInt32BE(0); height = body.readUInt32BE(4);
      depth = body[8]!; colour = body[9]!; interlace = body[12]!;
    } else if (type === 'IDAT') idat.push(body);
    else if (type === 'PLTE') palette = body;
    else if (type === 'tRNS') alphas = body;
    else if (type === 'IEND') break;
  }
  if (depth !== 8 || interlace !== 0 || (colour !== 2 && colour !== 6 && colour !== 3)) {
    throw new Error(`${path}: unsupported PNG (depth ${depth}, colour ${colour}, interlace ${interlace})`);
  }
  if (colour === 3 && !palette) throw new Error(`${path}: indexed PNG with no palette`);
  const channels = colour === 6 ? 4 : colour === 3 ? 1 : 3;
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const stride = width * channels;
  const out = Buffer.alloc(stride * height);
  let prev = Buffer.alloc(stride);
  let read = 0;
  for (let y = 0; y < height; y++) {
    const filter = raw[read++]!;
    const line = Buffer.from(raw.subarray(read, read + stride));
    read += stride;
    for (let x = 0; x < stride; x++) {
      const a = x >= channels ? line[x - channels]! : 0;
      const b = prev[x]!;
      const c = x >= channels ? prev[x - channels]! : 0;
      if (filter === 1) line[x] = (line[x]! + a) & 0xff;
      else if (filter === 2) line[x] = (line[x]! + b) & 0xff;
      else if (filter === 3) line[x] = (line[x]! + ((a + b) >> 1)) & 0xff;
      else if (filter === 4) {
        const p = a + b - c;
        const pa = Math.abs(p - a); const pb = Math.abs(p - b); const pc = Math.abs(p - c);
        line[x] = (line[x]! + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 0xff;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  if (colour !== 3) return { width, height, channels, data: out };

  // Expand the palette so every caller sees RGBA and none of them has to know
  // which of the three encodings a given file happens to use.
  const rgba = Buffer.alloc(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    const idx = out[i]!;
    rgba[i * 4] = palette![idx * 3]!;
    rgba[i * 4 + 1] = palette![idx * 3 + 1]!;
    rgba[i * 4 + 2] = palette![idx * 3 + 2]!;
    rgba[i * 4 + 3] = alphas && idx < alphas.length ? alphas[idx]! : 255;
  }
  return { width, height, channels: 4, data: rgba };
}
