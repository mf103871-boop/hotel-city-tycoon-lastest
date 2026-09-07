"""Deterministic export of ImageGen artwork; no re-drawing or background removal.

The selected RGBA source art already has its background removed by ImageGen.
This compiler crops poses, downsamples, aligns them, and packs the existing
animation contract. Room state variants reuse the game's established transforms.
It never overwrites sources. Re-run without network access or generative tools.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
import sys

from PIL import Image
from hcstyle import Canvas
from hcvariants import nightfall, grime, dirty_layer

ROOT = Path(__file__).resolve().parents[2]
SOURCE = ROOT / 'art-source/approved/cartoon-v1'
ASSETS = ROOT / 'public/assets'
FILTER = Image.Resampling.LANCZOS


def digest(path):
    return hashlib.sha256(path.read_bytes()).hexdigest()


def read_sources():
    for row in json.loads((SOURCE / 'sources.json').read_text())['sources']:
        path = SOURCE / row['file']
        if digest(path) != row['sha256']:
            raise ValueError(f'Source changed without a version update: {path}')


def bbox(img):
    # Inspect coverage to find the sprite bounds. Preserve source alpha itself.
    result = img.getchannel('A').point(lambda a: 255 if a > 8 else 0).getbbox()
    if result is None:
        raise ValueError('Empty source pose')
    return result


def isolated(name):
    img = Image.open(SOURCE / name)
    if img.mode != 'RGBA' or img.getchannel('A').getextrema()[0] != 0:
        raise ValueError(f'{name}: expected real transparent RGBA artwork')
    return img


def fit(img, width, height):
    scale = min(width / img.width, height / img.height)
    return img.resize((max(1, round(img.width * scale)), max(1, round(img.height * scale))), FILTER)


def poses(name, bands, columns=None):
    sheet = isolated(name)
    result = {}
    for row, (top, bottom) in enumerate(bands):
        xs = (columns or {}).get(row, [round(i * sheet.width / 8) for i in range(9)])
        count = 5 if row == 3 and name != 'guest-standard-poses.png' else len(xs) - 1
        if row == 3 and name == 'guest-standard-poses.png':
            count = 4
        for col in range(count):
            cell = sheet.crop((xs[col], top, xs[col + 1], bottom))
            box = bbox(cell)
            cropped = cell.crop(box)
            # Head center, independent of a suitcase, extended hand or mop.
            head = cropped.crop((0, 0, cropped.width, round(cropped.height * .42)))
            hb = bbox(head)
            center = (hb[0] + hb[2]) / 2
            result[(row, col)] = (cropped, center)
    return result


def at(row, *cols):
    return [(row, col) for col in cols]


STAFF_CLIPS = {
    'idle': at(0, 0, 1, 2, 3), 'blink': at(0, 4), 'walk': at(1, *range(8)),
    'work': at(2, *range(6)), 'happy': at(0, 5, 6, 7) + at(2, 6),
    'angry': at(3, 0, 1, 2, 3), 'scared': at(2, 7) + at(3, 4),
}


def character(kind, name, bands, clips, columns=None):
    collection = poses(name, bands, columns)
    anim = json.loads((ROOT / f'data/animations/{kind}.json').read_text())
    if set(clips) != set(anim['clips']):
        raise ValueError(f'{kind}: source mapping does not cover every animation')
    fw, fh = anim['frame']['w'], anim['frame']['h']
    px, py = anim['frame']['pivot']['x'], anim['frame']['pivot']['y']
    standing = [collection[p] for clip, ps in clips.items() if clip != 'sleep' for p in ps]
    # One scale per character, not a different head size for every wide pose.
    scale = min(57 / max(img.height for img, _ in standing),
                (px - 2) / max(max(cx, img.width - cx) for img, cx in standing))
    metadata = {'source': name, 'scale': scale, 'frame': anim['frame'],
                'status': 'IMPLEMENTED; motion and interaction review pending', 'clips': {}}
    for tier in (1, 2):
        cols = max(c['frames'] for c in anim['clips'].values())
        out = Image.new('RGBA', (fw * cols * tier, fh * len(clips) * tier))
        first = None
        for row, (clip, definition) in enumerate(anim['clips'].items()):
            mapping = clips[clip]
            if len(mapping) != definition['frames']:
                raise ValueError(f'{kind}/{clip}: source mapping has wrong frame count')
            metadata['clips'][clip] = {'sourcePoses': mapping, **definition}
            for col, pose in enumerate(mapping):
                img, cx = collection[pose]
                s = min((fw - 4) / img.width, 31 / img.height) if clip == 'sleep' else scale
                art = img.resize((max(1, round(img.width * s * tier)), max(1, round(img.height * s * tier))), FILTER)
                # Snap the visible sole, including resampling's antialiased edge.
                bb = bbox(art)
                art = art.crop(bb)
                center = art.width / 2 if clip == 'sleep' else cx * s * tier - bb[0]
                x, y = round(px * tier - center), py * tier - art.height + 1
                # Bed anchor is its floor contact; the sleeper rests on the
                # mattress above it. Keep the shared pivot, lift only its art.
                if clip == 'sleep':
                    y -= 10 * tier
                if x < 0 or x + art.width > fw * tier or y < 0:
                    raise ValueError(f'{kind}/{clip}/{col}: sprite outside cell')
                cell = Image.new('RGBA', (fw * tier, fh * tier))
                cell.alpha_composite(art, (x, y))
                out.alpha_composite(cell, (col * fw * tier, row * fh * tier))
                if row == 0 and col == 0:
                    first = cell
        save(out, f'characters/{kind}_sheet.png', tier)
        portrait = Image.new('RGBA', (64 * tier, 64 * tier))
        crop = first.crop(bbox(first))
        crop = fit(crop, 60 * tier, 60 * tier)
        portrait.alpha_composite(crop, ((portrait.width - crop.width) // 2, portrait.height - crop.height - 2 * tier))
        save(portrait, f'characters/{kind}_thumb.png', tier)
    return metadata


EXPORTS = []


def save(img, rel, tier):
    path = ASSETS / (f'@{tier}x' if tier > 1 else '') / rel
    path.parent.mkdir(parents=True, exist_ok=True)
    img.convert('RGBA').save(path, optimize=True)
    EXPORTS.append({'file': str(path.relative_to(ROOT)), 'size': list(img.size),
                    'sha256': digest(path), 'tier': tier})


def export():
    read_sources()
    counter = isolated('counter.png')
    counter = counter.crop(bbox(counter))
    bed = isolated('bed.png')
    bed = bed.crop(bbox(bed))
    for tier in (1, 2):
        desk = Image.new('RGBA', (256 * tier, 96 * tier))
        # Existing measured desk paint envelope x140..209, y51..87.
        desk_art = fit(counter, 66 * tier, 33 * tier)
        desk.alpha_composite(desk_art, (round(174.3 * tier - desk_art.width / 2), 86 * tier - desk_art.height))
        save(desk, 'rooms/lobby_front.png', tier)
        for room, w in [('lobby', 256), ('economy', 128)]:
            base = Image.open(SOURCE / f'{room}.png').convert('RGBA').resize((w * tier, 96 * tier), FILTER)
            save(base, f'rooms/{room}_base.png', tier)
            save(nightfall(base), f'rooms/{room}_night.png', tier)
            dirty = grime(base)
            litter = Canvas(w, 96, tier=tier)
            dirty_layer(litter, room, 82.56)
            dirty.alpha_composite(litter.image())
            save(dirty, f'rooms/{room}_dirty.png', tier)
            whole = base.copy()
            if room == 'lobby':
                whole.alpha_composite(desk)
            card = Image.new('RGBA', (96 * tier, 96 * tier))
            icon = fit(whole, 92 * tier, 92 * tier)
            card.alpha_composite(icon, ((card.width - icon.width) // 2, (card.height - icon.height) // 2))
            save(card, f'rooms/{room}_thumb.png', tier)
        sprite = Image.new('RGBA', (104 * tier, 64 * tier))
        art = fit(bed, 100 * tier, 58 * tier)
        sprite.alpha_composite(art, ((sprite.width - art.width) // 2, 62 * tier - art.height))
        save(sprite, 'decor/bed_cot.png', tier)

    guest = {
        'idle': at(0, 0, 1, 2, 3), 'blink': at(0, 4), 'walk': at(1, *range(8)),
        'sleep': at(2, 0, 1, 2), 'sit': at(0, 5, 6),
        # Three unique happy poses; hold the last for its authored fourth beat.
        'happy': at(2, 3, 4, 5, 5), 'angry': at(3, 0, 1, 2, 3),
        'scared': at(0, 7) + at(2, 6),
    }
    cast = [character('guest_standard', 'guest-standard-poses.png',
                      [(0, 315), (315, 572), (572, 822), (822, 1086)], guest,
                      {2: [0, 232, 445, 651, 850, 1044, 1234, 1448]}),
            character('staff_receptionist', 'receptionist-poses.png',
                      [(0, 299), (299, 554), (554, 817), (817, 1086)], STAFF_CLIPS)]
    cleaner = {**STAFF_CLIPS, 'idle': at(0, 0, 2, 0, 2), 'blink': at(0, 1), 'happy': at(0, 4, 5, 6, 7)}
    cast.append(character('staff_cleaner', 'cleaner-poses.png',
                          [(0, 306), (306, 556), (556, 815), (815, 1086)], cleaner))
    metadata = {'version': 1, 'status': 'IMPLEMENTED; in-engine visual approval pending',
                'exporter': 'tools/art/export_approved.py',
                'roomAnchor': 'top-left; logical lobby 256x96, economy 128x96',
                'counterPaintBox': [140, 51, 209, 87], 'bedAnchor': [0.5, 1],
                'hitboxes': 'unchanged; existing room/decor/character interaction geometry',
                'cast': cast, 'exports': sorted(EXPORTS, key=lambda e: e['file'])}
    (SOURCE / 'exports.json').write_text(json.dumps(metadata, indent=2) + '\n')
    print(f'{len(EXPORTS)} runtime PNGs exported from 7 original sources; sources untouched.')


def check():
    read_sources()
    manifest = json.loads((ASSETS / 'manifest.json').read_text())
    entries = {e['file']: e for e in manifest['entries']}
    rows = json.loads((SOURCE / 'exports.json').read_text())['exports']
    for row in rows:
        path = ROOT / row['file']
        if digest(path) != row['sha256']:
            raise ValueError(f'Export differs from protected source build: {path}')
        im = Image.open(path)
        rel = path.relative_to(ASSETS).as_posix()
        if row['tier'] > 1:
            rel = rel.split('/', 1)[1]
        entry = entries[rel]
        expected = (entry['width'] * row['tier'], entry['height'] * row['tier'])
        if im.size != expected or im.mode != 'RGBA':
            raise ValueError(f'{rel}: wrong dimensions or format: {im.size}/{im.mode}')
        if '/characters/' in row['file'] or '/decor/' in row['file'] or '_front.' in rel:
            if im.getchannel('A').getextrema()[0] != 0:
                raise ValueError(f'{rel}: missing transparent background')
    print(f'7 source hashes and {len(rows)} protected runtime PNGs match; dimensions and alpha valid.')


if __name__ == '__main__':
    check() if '--check' in sys.argv else export()
