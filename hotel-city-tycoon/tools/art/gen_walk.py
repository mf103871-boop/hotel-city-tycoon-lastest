#!/usr/bin/env python3
"""
Walk cycles, derived from the supplied idle art.

Twenty characters were sliding across the street without moving a leg, which
is the most visible unfinished thing in the game. Rather than ask for twenty
hand-drawn sprite sheets, this builds a six-frame cycle from each idle frame.

The approach is deliberately modest. A convincing walk at 48x72 does not need
redrawn limbs — it needs the body to rise and fall, the torso to lean slightly
into the step, and the legs to swing. Those are all transforms on regions of
an image the artist already drew, so the character keeps their own face,
clothes and props in every frame.

Run: python3 tools/art/gen_walk.py
"""
import math
import os

from PIL import Image

OUT = "public/assets/characters"
FRAMES = 6
CHAR_W, CHAR_H = 48, 72

# Where the body divides. Measured against the supplied art, where heads sit
# in the top third and feet in the bottom fifth.
HEAD_END = 0.34
LEG_START = 0.64


def shear_region(source, top, bottom, offset):
    """Slide a horizontal band sideways, tapering to nothing at its top edge."""
    out = source.copy()
    band_height = bottom - top
    if band_height <= 0:
        return out
    for y in range(top, bottom):
        # Zero at the hip, full at the foot: a leg pivots, it does not slide.
        t = (y - top) / band_height
        dx = int(round(offset * t))
        if dx == 0:
            continue
        row = source.crop((0, y, source.width, y + 1))
        out.paste(Image.new("RGBA", (source.width, 1), (0, 0, 0, 0)), (0, y))
        out.paste(row, (dx, y), row)
    return out


def walk_frame(idle, index):
    """
    One frame of the cycle.

    Two contact points, two passes, two lifts — the shape of any walk. The
    vertical bob peaks when the legs are together and dips at contact, which
    is what stops a walk reading as a hover.
    """
    phase = (index / FRAMES) * 2 * math.pi

    # Legs swing forward and back through a full sine; the front leg on one
    # side is the back leg half a cycle later.
    swing = math.sin(phase)
    # The body rises twice per cycle, once for each pass.
    bob = -abs(math.cos(phase)) * 1.6 + 0.8
    # A slight lean into the direction of travel, strongest mid-stride.
    lean = math.sin(phase) * 0.6

    frame = Image.new("RGBA", (CHAR_W, CHAR_H), (0, 0, 0, 0))
    body = idle.copy()

    leg_top = int(CHAR_H * LEG_START)
    body = shear_region(body, leg_top, CHAR_H, swing * 3.2)

    head_end = int(CHAR_H * HEAD_END)
    body = shear_region(body, 0, head_end, lean * -1.0)

    frame.paste(body, (0, int(round(bob))), body)
    return frame


def build_sheet(idle_path):
    idle = Image.open(idle_path).convert("RGBA")
    if idle.size != (CHAR_W, CHAR_H):
        idle = idle.resize((CHAR_W, CHAR_H), Image.LANCZOS)

    sheet = Image.new("RGBA", (CHAR_W * FRAMES, CHAR_H), (0, 0, 0, 0))
    for i in range(FRAMES):
        sheet.paste(walk_frame(idle, i), (i * CHAR_W, 0))
    return sheet


if __name__ == "__main__":
    if not os.path.isdir(OUT):
        raise SystemExit(f"  ? {OUT} does not exist")

    written = 0
    for name in sorted(os.listdir(OUT)):
        if not name.endswith("_idle.png"):
            continue
        stem = name[: -len("_idle.png")]
        sheet = build_sheet(os.path.join(OUT, name))
        path = os.path.join(OUT, f"{stem}_walk.png")
        sheet.save(path)
        written += 1

    print(f"  ✓ {written} walk sheets, {FRAMES} frames each at {CHAR_W}x{CHAR_H}")
    print(f"    written to {OUT}/")
