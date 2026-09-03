#!/usr/bin/env node
/**
 * Where the ceiling, wall and floor actually are inside each room image.
 *
 * The renderer has to know this and cannot guess it. Decor is positioned
 * against bands — a lamp hangs from the ceiling line, an armchair stands on
 * the floor line, a wallpaper covers the wall — and the floor line is at 0.71
 * of room height in the ART-1 economy interior and 0.90 in the cinema. A
 * constant is wrong by more than a whole anchor row in most rooms.
 *
 * The art is supplied, not generated, so the bands cannot come from the
 * drawing code either (tools/art/style.py's shell() predicts only spa, the one
 * room still drawn procedurally). They have to be read back off the pixels.
 *
 * This proposes; a human confirms against the overlays. Rooms where the
 * detector is not confident are reported as such rather than guessed at.
 *
 *   node tools/art/measure-interiors.mjs           # report
 *   node tools/art/measure-interiors.mjs --overlay # + tools/art/overlays/*.png
 *   node tools/art/measure-interiors.mjs --json    # machine-readable
 */
import fs from 'node:fs';
import zlib from 'node:zlib';

const ROOMS_DIR = 'public/assets/rooms';

// ---------------------------------------------------------------- png

/** Minimal RGBA8 PNG reader. Every room image is bitDepth 8, colour type 6, non-interlaced. */
export function readPng(file) {
  const data = fs.readFileSync(file);
  let pos = 8;
  let ihdr = null;
  const idat = [];
  while (pos < data.length) {
    const len = data.readUInt32BE(pos);
    const type = data.toString('latin1', pos + 4, pos + 8);
    if (type === 'IHDR') {
      ihdr = {
        w: data.readUInt32BE(pos + 8),
        h: data.readUInt32BE(pos + 12),
        depth: data[pos + 16],
        colour: data[pos + 17],
        interlace: data[pos + 20],
      };
    } else if (type === 'IDAT') idat.push(data.subarray(pos + 8, pos + 8 + len));
    pos += 12 + len;
  }
  if (!ihdr) throw new Error(`${file}: no IHDR`);
  if (ihdr.depth !== 8 || ihdr.colour !== 6 || ihdr.interlace !== 0) {
    throw new Error(`${file}: expected 8-bit RGBA, non-interlaced`);
  }
  const raw = zlib.inflateSync(Buffer.concat(idat));
  const { w, h } = ihdr;
  const stride = w * 4;
  const out = Buffer.alloc(h * stride);
  let prev = Buffer.alloc(stride);
  let p = 0;
  for (let y = 0; y < h; y++) {
    const filter = raw[p++];
    const line = Buffer.from(raw.subarray(p, p + stride));
    p += stride;
    for (let i = 0; i < stride; i++) {
      const a = i >= 4 ? line[i - 4] : 0;
      const b = prev[i];
      const c = i >= 4 ? prev[i - 4] : 0;
      if (filter === 1) line[i] = (line[i] + a) & 255;
      else if (filter === 2) line[i] = (line[i] + b) & 255;
      else if (filter === 3) line[i] = (line[i] + ((a + b) >> 1)) & 255;
      else if (filter === 4) {
        const q = a + b - c;
        const pa = Math.abs(q - a), pb = Math.abs(q - b), pc = Math.abs(q - c);
        line[i] = (line[i] + (pa <= pb && pa <= pc ? a : pb <= pc ? b : c)) & 255;
      }
    }
    line.copy(out, y * stride);
    prev = line;
  }
  return { w, h, px: out };
}

export function writePng(file, w, h, rgb) {
  const raw = Buffer.alloc(h * (w * 3 + 1));
  for (let y = 0; y < h; y++) {
    raw[y * (w * 3 + 1)] = 0;
    rgb.copy(raw, y * (w * 3 + 1) + 1, y * w * 3, (y + 1) * w * 3);
  }
  const chunk = (type, body) => {
    const head = Buffer.alloc(8);
    head.writeUInt32BE(body.length, 0);
    head.write(type, 4, 'latin1');
    const crc = Buffer.alloc(4);
    crc.writeUInt32BE(crc32(Buffer.concat([head.subarray(4), body])) >>> 0, 0);
    return Buffer.concat([head, body, crc]);
  };
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4);
  ihdr[8] = 8; ihdr[9] = 2;
  fs.writeFileSync(file, Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr), chunk('IDAT', zlib.deflateSync(raw, { level: 9 })), chunk('IEND', Buffer.alloc(0)),
  ]));
}

let CRC_TABLE = null;
function crc32(buf) {
  if (!CRC_TABLE) {
    CRC_TABLE = new Int32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      CRC_TABLE[n] = c;
    }
  }
  let c = -1;
  for (const b of buf) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8);
  return c ^ -1;
}

// ---------------------------------------------------------------- measure

const L1 = (a, b) => Math.abs(a[0] - b[0]) + Math.abs(a[1] - b[1]) + Math.abs(a[2] - b[2]);

/** The commonest opaque colour of a row, over the central band of columns. */
function rowMode(img, y, from, to) {
  const counts = new Map();
  for (let x = from; x < to; x++) {
    const k = (y * img.w + x) * 4;
    if (img.px[k + 3] < 200) continue;
    const key = (img.px[k] << 16) | (img.px[k + 1] << 8) | img.px[k + 2];
    counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  let best = -1, n = 0;
  for (const [key, c] of counts) if (c > n) { n = c; best = key; }
  if (best < 0) return null;
  return { rgb: [(best >> 16) & 255, (best >> 8) & 255, best & 255], share: n / (to - from) };
}

/**
 * Bands, read off the pixels.
 *
 * A room is horizontal stripes seen face on: frame, cornice, wall, skirting,
 * floor, frame. The stripes are not flat — floors have planks and shading, and
 * walls carry windows and fixtures — so segmenting by "rows of the same
 * colour" shatters a floor into sub-stripes. What *is* reliable is the
 * boundary: the single row where the dominant colour changes decisively and
 * stays changed. There are two such rows, the cornice line and the floor line,
 * and everything else follows from them.
 */
export function measure(img) {
  const from = Math.floor(img.w * 0.15), to = Math.ceil(img.w * 0.85);
  const modes = [];
  for (let y = 0; y < img.h; y++) modes.push(rowMode(img, y, from, to));
  const at = (y) => modes[y]?.rgb ?? null;

  /** Rows at an edge that are frame: near-black outline, or transparent. */
  const isFrame = (y) => { const c = at(y); return !c || c[0] + c[1] + c[2] < 210; };
  let top = 0;
  while (top < img.h * 0.1 && isFrame(top)) top++;
  let bottom = img.h - 1;
  while (bottom > img.h * 0.8 && isFrame(bottom)) bottom--;

  /**
   * The floor starts where the wall stops.
   *
   * Every edge-detecting variant of this failed on real art. A drawn floor has
   * its own shading — a bright leading edge, a dark front lip — and those score
   * as strongly as the wall-to-floor junction above them, so "the biggest
   * colour change in the lower half" picks a line inside the floorboards and
   * reports a 7px floor in a room with a quarter of the image in floor.
   * Preferring the topmost strong edge then picks a mural instead.
   *
   * Asking where the WALL ends cannot make either mistake: the wall's colour
   * is the commonest colour of the wall region, fixtures and murals are a
   * minority of it by construction, and nothing below the junction is wall
   * coloured however it is shaded.
   */
  const wallRegion = new Map();
  for (let y = top; y < Math.floor(img.h * 0.6); y++) {
    const m = modes[y];
    if (!m) continue;
    const key = m.rgb.join(',');
    wallRegion.set(key, (wallRegion.get(key) ?? 0) + 1);
  }
  let wallKey = null, wallN = 0;
  for (const [k, n] of wallRegion) if (n > wallN) { wallN = n; wallKey = k; }
  if (!wallKey) return null;
  const wallRgb = wallKey.split(',').map(Number);

  const isWall = (y) => { const m = modes[y]; return !!m && L1(m.rgb, wallRgb) <= 30; };
  let wallBottom = -1;
  for (let y = top; y <= Math.floor(img.h * 0.92); y++) if (isWall(y)) wallBottom = y;
  if (wallBottom < 0) return null;

  /*
   * The skirting is whatever sits between the wall and the floor proper: a
   * keyline, a shadow, a moulding. It belongs to neither band — furniture
   * standing on it floats, and a floor laid over it covers the room's own trim
   * — so the floor starts once the colour below has settled.
   */
  let floorTop = wallBottom + 1;
  while (floorTop < bottom - 2) {
    const a = modes[floorTop], b = modes[floorTop + 1], c = modes[floorTop + 2];
    if (a && b && c && L1(a.rgb, b.rgb) <= 30 && L1(b.rgb, c.rgb) <= 30) break;
    floorTop++;
  }
  const floorRgb = modes[Math.min(bottom, floorTop + 1)]?.rgb ?? modes[floorTop]?.rgb ?? wallRgb;

  /*
   * The cornice is measured against a sample taken from the MIDDLE of the
   * wall, not from just above the skirting. The art shades a wall towards its
   * base, so a sample taken there matches the cornice about as well as it
   * matches the wall, and the scan stops on the first cream row — hanging
   * every ceiling lamp above the trim it is supposed to hang from.
   */
  const midWall = wallRgb;
  let ceilingBottom = top;
  for (let y = top; y < Math.floor(img.h * 0.35); y++) {
    const m = modes[y];
    if (m && L1(m.rgb, midWall) > 24) ceilingBottom = y + 1;
  }

  const wall = { start: ceilingBottom, end: wallBottom, rgb: wallRgb };
  const floor = { start: floorTop, end: bottom, rgb: floorRgb };

  /*
   * The usable width is measured at the FRONT of the floor, not its middle.
   * Most interiors are drawn with a slight perspective wedge, so the floor is
   * a trapezoid: at the middle row the side walls have eaten 30px that are
   * floor by the front edge. Furniture stands at the front, so the front row
   * is the honest measurement.
   */
  const frontY = Math.max(floor.start, bottom - 1);
  const isEdge = (x, y) => {
    const k = (y * img.w + x) * 4;
    // Frame, not furniture: transparent, or the near-black outline the art
    // draws around the room. Anything with real colour in it is interior.
    return img.px[k + 3] < 200 || img.px[k] + img.px[k + 1] + img.px[k + 2] < 210;
  };
  let left = 0;
  while (left < 6 && isEdge(left, frontY)) left++;
  let right = 0;
  while (right < 6 && isEdge(img.w - 1 - right, frontY)) right++;

  return {
    inset: Math.max(left, right),
    ceilingBottom: wall.start,
    wallBottom: wall.end,
    floorTop: floor.start,
    floorBottom: floor.end,
    // How much of each band is actually its own surface. A wall that is mostly
    // mural or fixture cannot have a wallpaper laid over it.
    wallPurity: purity(img, wall, from, to),
    floorPurity: purity(img, floor, from, to),
  };
}

function purity(img, run, from, to) {
  let hit = 0, total = 0;
  for (let y = run.start; y <= run.end; y++) {
    for (let x = from; x < to; x++) {
      const k = (y * img.w + x) * 4;
      if (img.px[k + 3] < 200) continue;
      total++;
      if (L1([img.px[k], img.px[k + 1], img.px[k + 2]], run.rgb) <= 45) hit++;
    }
  }
  return total ? Number((hit / total).toFixed(3)) : 0;
}

/** Reasons the reading should not be trusted without a human looking at it. */
export function concerns(m, img) {
  const out = [];
  if (m.floorBottom - m.floorTop + 1 < 12) out.push(`floor band ${m.floorBottom - m.floorTop + 1}px`);
  if (m.wallBottom - m.ceilingBottom + 1 < 30) out.push(`wall band ${m.wallBottom - m.ceilingBottom + 1}px`);
  if (m.floorTop - m.wallBottom - 1 > 6) out.push(`${m.floorTop - m.wallBottom - 1}px skirting`);
  if (m.ceilingBottom > img.h * 0.3) out.push(`cornice ends at ${m.ceilingBottom}/${img.h}`);
  if (m.inset > 8) out.push(`inset ${m.inset}px`);
  return out;
}

// ---------------------------------------------------------------- cli

if (import.meta.url === `file://${process.argv[1]}`) {
  const overlay = process.argv.includes('--overlay');
  const asJson = process.argv.includes('--json');
  const write = process.argv.includes('--write');
  const rooms = fs.readdirSync(ROOMS_DIR).filter((f) => f.endsWith('_base.png')).sort();
  const result = {};
  if (overlay) fs.mkdirSync('tools/art/overlays', { recursive: true });

  for (const file of rooms) {
    const id = file.replace('_base.png', '');
    const img = readPng(`${ROOMS_DIR}/${file}`);
    const m = measure(img);
    if (!m) { result[id] = { error: 'no bands found' }; continue; }
    result[id] = { ...m, concerns: concerns(m, img) };

    if (overlay) {
      const S = 4;
      const W = img.w * S, H = img.h * S;
      const rgb = Buffer.alloc(W * H * 3);
      for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
        const k = ((y / S | 0) * img.w + (x / S | 0)) * 4;
        const a = img.px[k + 3];
        const o = (y * W + x) * 3;
        for (let c = 0; c < 3; c++) rgb[o + c] = (img.px[k + c] * a + 40 * (255 - a)) / 255;
      }
      const line = (y, col) => {
        for (let s = 0; s < S; s++) for (let x = 0; x < W; x++) {
          const o = ((y * S + s) * W + x) * 3;
          rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2];
        }
      };
      const vline = (x, col) => {
        for (let s = 0; s < S; s++) for (let y = 0; y < H; y++) {
          const o = (y * W + x * S + s) * 3;
          rgb[o] = col[0]; rgb[o + 1] = col[1]; rgb[o + 2] = col[2];
        }
      };
      line(m.ceilingBottom, [255, 0, 255]);   // magenta: ceiling ends
      line(m.wallBottom, [0, 255, 0]);        // green:   wall ends
      line(m.floorTop, [0, 255, 255]);        // cyan:    floor starts
      line(m.floorBottom, [255, 255, 0]);     // yellow:  floor ends
      vline(m.inset, [255, 80, 80]);          // red:     usable left edge
      vline(img.w - 1 - m.inset, [255, 80, 80]);
      writePng(`tools/art/overlays/${id}.png`, W, H, rgb);
    }
  }

  if (write) {
    /*
     * Written into data/rooms.json, not a file of its own: `interior` is part
     * of what a room IS, the placement code already reads rooms.json through
     * the same data source, and a second file is a second thing to forget to
     * regenerate.
     *
     * Only the measured numbers are touched. A hand-corrected `interior` keeps
     * its `reviewed: true` and is left alone — the detector reads a single
     * storey, so presidential's mezzanine can only ever be authored by hand.
     */
    const path = 'data/rooms.json';
    const doc = JSON.parse(fs.readFileSync(path, 'utf8'));
    let changed = 0, kept = 0;
    for (const room of doc.rooms) {
      const m = result[room.id];
      if (!m || m.error) continue;
      if (room.interior?.reviewed) { kept++; continue; }
      room.interior = {
        inset: m.inset,
        ceilingBottom: m.ceilingBottom,
        wallBottom: m.wallBottom,
        floorTop: m.floorTop,
        floorBottom: m.floorBottom,
      };
      changed++;
    }
    fs.writeFileSync(path, `${JSON.stringify(doc, null, 2)}\n`);
    console.log(`  ${changed} measured, ${kept} hand-reviewed and left alone -> ${path}`);
    process.exit(0);
  }

  if (asJson) { console.log(JSON.stringify(result, null, 2)); process.exit(0); }
  console.log('room           size      inset ceilB wallB floorT floorB  frac   wallPur floorPur  concerns');
  for (const [id, m] of Object.entries(result)) {
    if (m.error) { console.log(`${id.padEnd(14)} ${m.error}`); continue; }
    const img = readPng(`${ROOMS_DIR}/${id}_base.png`);
    console.log(
      `${id.padEnd(14)} ${`${img.w}x${img.h}`.padEnd(9)} ${String(m.inset).padStart(5)} ` +
      `${String(m.ceilingBottom).padStart(5)} ${String(m.wallBottom).padStart(5)} ` +
      `${String(m.floorTop).padStart(6)} ${String(m.floorBottom).padStart(6)}  ` +
      `${(m.floorTop / img.h).toFixed(3)}  ${m.wallPurity.toFixed(2).padStart(6)} ${m.floorPurity.toFixed(2).padStart(7)}  ${m.concerns.join('; ')}`);
  }
}
