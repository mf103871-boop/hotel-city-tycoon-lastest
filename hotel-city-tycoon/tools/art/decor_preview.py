#!/usr/bin/env python3
"""Compose a decorated room from the layout the game itself computes — HC-P1-S4.

DEC-009 keeps the canvas out of CI and the build machines have no GPU, so the
Pixi scene cannot be screenshotted on demand. This is the next best evidence
and it is deliberately dumb: every box, size and draw order comes from
`tools/art/decor-layout.ts`, which reads the shipped render modules. Nothing
here decides where anything goes, so the picture cannot flatter the code.

It composes what RoomView composes — the room base, then each piece in draw
order, into the piece's clamped box — and nothing else: no camera, no meter,
no captions, no characters. A green frame marks the room's own bounds so a
piece leaving them would be obvious.

Needs Pillow, like every other script in this directory.

    node --experimental-strip-types tools/art/decor-layout.ts --out /tmp/l.json
    python3 tools/art/decor_preview.py /tmp/l.json docs/hc-p1-s4-shots/room.png
"""
import json
import sys
from PIL import Image, ImageDraw

ASSETS = "public/assets"
CHECKER = (28, 28, 32), (36, 36, 41)


def checkerboard(w: int, h: int, cell: int = 8) -> Image.Image:
    """Transparency backdrop, so a piece's own background shows as a rectangle."""
    img = Image.new("RGBA", (w, h))
    d = ImageDraw.Draw(img)
    for y in range(0, h, cell):
        for x in range(0, w, cell):
            d.rectangle([x, y, x + cell - 1, y + cell - 1],
                        fill=CHECKER[(x // cell + y // cell) % 2] + (255,))
    return img


def compose(layout: dict, scale: int) -> Image.Image:
    rw, rh = layout["room"]["width"], layout["room"]["height"]
    canvas = checkerboard(rw, rh)
    room = Image.open(f"{ASSETS}/{layout['room']['file']}").convert("RGBA")
    if room.size != (rw, rh):
        room = room.resize((rw, rh), Image.LANCZOS)
    canvas.alpha_composite(room)

    for piece in layout["pieces"]:
        if not piece["file"]:
            continue
        box = piece["box"]
        w, h = max(1, round(box["w"])), max(1, round(box["h"]))
        art = Image.open(f"{ASSETS}/{piece['file']}").convert("RGBA").resize((w, h), Image.LANCZOS)
        canvas.alpha_composite(art, (round(box["left"]), round(box["top"])))

    out = canvas.resize((rw * scale, rh * scale), Image.NEAREST)
    d = ImageDraw.Draw(out)
    d.rectangle([0, 0, rw * scale - 1, rh * scale - 1], outline=(64, 200, 120, 255), width=2)
    return out


def main() -> None:
    layout_file = sys.argv[1] if len(sys.argv) > 1 else "/tmp/decor-layout.json"
    out_file = sys.argv[2] if len(sys.argv) > 2 else "decor-preview.png"
    scale = int(sys.argv[3]) if len(sys.argv) > 3 else 4
    with open(layout_file, encoding="utf8") as fh:
        layout = json.load(fh)
    img = compose(layout, scale)
    img.save(out_file)
    print(f"{out_file}  {img.width}x{img.height}  "
          f"{len(layout['pieces'])} pieces at {scale}x over {layout['room']['defId']}")


if __name__ == "__main__":
    main()
