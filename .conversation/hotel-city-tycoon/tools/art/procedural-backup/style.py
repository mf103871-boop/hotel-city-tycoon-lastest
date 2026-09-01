"""
Shared style system.

Every generated asset draws from this module and nothing else. That constraint
is the whole reason procedurally-drawn art can look coherent: twenty-three
rooms composed separately still read as one hotel because they cannot reach
outside this palette or these primitives.

Direction: an art-deco hotel at night. Deep navy walls, brass fittings, warm
lamplight, a lit city outside every window. Flat shapes with strong silhouettes,
because a room is 128x96 pixels and anything finer than two pixels turns to mud.
"""
from PIL import Image, ImageDraw

SS = 4          # supersample factor; everything renders 4x then downsamples
BLOCK_W = 128
BLOCK_H = 96

P = {
    # walls, by mood
    "wall":       (32, 50, 72),
    "wall_hi":    (44, 66, 92),
    "wall_lo":    (24, 39, 58),
    "wall_warm":  (58, 55, 68),
    "wall_rich":  (52, 40, 66),
    "wall_spa":   (38, 62, 66),
    "wall_util":  (34, 42, 44),

    # floors
    "floor":      (46, 36, 32),
    "floor_hi":   (61, 48, 42),
    "floor_dark": (32, 25, 22),
    "floor_pale": (92, 82, 70),
    "tile":       (54, 72, 82),

    # metal and light
    "brass":      (217, 164, 65),
    "brass_dim":  (150, 112, 44),
    "brass_lo":   (110, 82, 34),
    "citylight":  (233, 196, 118),

    # outside
    "night":      (12, 22, 40),
    "city":       (58, 84, 120),
    "glass":      (70, 104, 142),

    # fabric
    "linen":      (226, 219, 201),
    "linen_sh":   (188, 180, 162),
    "silk":       (214, 196, 216),

    # accents
    "red":        (150, 62, 58),
    "red_hi":     (186, 88, 80),
    "green":      (58, 104, 88),
    "green_hi":   (86, 138, 114),
    "purple":     (78, 58, 96),
    "purple_hi":  (116, 88, 138),
    "blue":       (56, 92, 130),
    "teal":       (62, 122, 124),
    "water":      (58, 132, 158),
    "water_hi":   (104, 176, 196),
    "skin":       (214, 168, 132),
    "skin_dk":    (168, 122, 92),
    "hair":       (44, 34, 30),
    "white":      (238, 240, 244),
    "grey":       (120, 126, 134),
    "dark":       (18, 26, 38),
}


def canvas(w, h, transparent=True):
    """A supersampled drawing surface plus its draw handle."""
    img = Image.new("RGBA", (w * SS, h * SS), (0, 0, 0, 0) if transparent else (*P["wall"], 255))
    return img, ImageDraw.Draw(img, "RGBA")


def finish(img, w, h, path):
    """Downsample and write. Lanczos gives the flat shapes clean edges."""
    import os
    os.makedirs(os.path.dirname(path), exist_ok=True)
    img.resize((w, h), Image.LANCZOS).save(path)
    return path


def rect(d, x, y, w, h, fill):
    if w <= 0 or h <= 0:
        return
    d.rectangle([int(x), int(y), int(x + w) - 1, int(y + h) - 1], fill=fill)


def outline(d, x, y, w, h, colour, width=None):
    d.rectangle([int(x), int(y), int(x + w) - 1, int(y + h) - 1],
                outline=colour, width=width or max(1, SS))


def ellipse(d, x, y, w, h, fill):
    d.ellipse([int(x), int(y), int(x + w) - 1, int(y + h) - 1], fill=fill)


# ---------------------------------------------------------------- room shell

def shell(d, W, H, wall=None, floor=None, tiled=False):
    """Walls, ceiling and floor. Returns the ceiling and floor band heights."""
    wall = wall or P["wall"]
    floor = floor or P["floor"]
    rect(d, 0, 0, W, H, wall)

    ceil_h = max(4 * SS, H // 14)
    rect(d, 0, 0, W, ceil_h, P["wall_lo"])
    rect(d, 0, ceil_h, W, max(1, SS // 2), P["brass_lo"])

    # Deco pilasters, spaced by half a block so wide rooms keep a rhythm.
    step = BLOCK_W * SS // 2
    for x in range(step // 2, W, step):
        rect(d, x, ceil_h, max(1, SS), H, P["wall_hi"] if wall is not P["wall_hi"] else P["wall_lo"])

    floor_h = max(6 * SS, H // 6)
    rect(d, 0, H - floor_h, W, floor_h, floor)
    rect(d, 0, H - floor_h, W, max(1, SS), P["floor_hi"])
    rect(d, 0, H - max(2, SS), W, max(2, SS), P["floor_dark"])
    if tiled:
        for x in range(0, W, 10 * SS):
            rect(d, x, H - floor_h, max(1, SS // 2), floor_h, P["floor_dark"])
    return ceil_h, floor_h


def window(d, x, y, w, h):
    """A night window. The lit city outside is what makes an interior a hotel."""
    rect(d, x, y, w, h, P["night"])
    n = max(2, w // (12 * SS))
    bw = w // n
    for i in range(n):
        bh = int(h * (0.35 + 0.42 * ((i * 7 + 3) % 5) / 5))
        bx = x + i * bw
        rect(d, bx, y + h - bh, bw - max(1, SS), bh, P["city"])
        for row in range(1, max(2, bh // (5 * SS))):
            for col in range(1, max(2, bw // (6 * SS))):
                if (i * 3 + row * 5 + col * 7) % 4 == 0:
                    rect(d, bx + col * 5 * SS, y + h - bh + row * 5 * SS, 2 * SS, 2 * SS, P["citylight"])
    outline(d, x, y, w, h, P["brass_dim"])
    rect(d, x + w // 2 - SS // 2, y, max(1, SS), h, P["brass_lo"])


def door(d, x, y, w, h):
    rect(d, x, y, w, h, P["wall_lo"])
    outline(d, x, y, w, h, P["brass_dim"])
    rect(d, x + w - 4 * SS, y + h // 2, 2 * SS, 2 * SS, P["brass"])


def rug(d, cx, y, w, h, colour):
    rect(d, cx - w // 2, y, w, h, colour)
    outline(d, cx - w // 2, y, w, h, P["brass_lo"], max(1, SS // 2))


def bed(d, x, fy, w, tier):
    """A bed whose richness rises with the room tier — the visible reward."""
    h = int(BLOCK_H * SS * (0.16 + 0.03 * min(tier, 6)))
    rect(d, x, fy - h, w, h, P["floor_hi"])
    rect(d, x, fy - h, w, int(h * 0.5), P["linen"] if tier < 6 else P["silk"])
    rect(d, x, fy - h, int(w * 0.24), int(h * 0.5), P["linen_sh"])
    head_h = int(h * (0.6 + 0.25 * min(tier, 5) / 5))
    rect(d, x - 2 * SS, fy - h - head_h, max(2, SS + tier // 3), h + head_h,
         P["brass_dim"] if tier >= 3 else P["brass_lo"])
    if tier >= 5:
        # Canopy posts on the expensive rooms.
        rect(d, x + w - SS, fy - h - head_h, max(2, SS), h + head_h, P["brass_dim"])
    return h


def pendant(d, cx, ceil_h, drop, width, warm=True):
    rect(d, cx, ceil_h, max(1, SS), drop, P["brass_lo"])
    rect(d, cx - width // 2, ceil_h + drop, width, 3 * SS, P["brass"])
    rect(d, cx - width // 2 + SS, ceil_h + drop + 3 * SS, width - 2 * SS, 2 * SS,
         P["citylight"] if warm else P["glass"])


def counter(d, x, y, w, h, top=None):
    rect(d, x, y, w, h, P["floor_hi"])
    rect(d, x, y, w, max(2, SS), top or P["brass_dim"])
    rect(d, x, y + h - max(1, SS), w, max(1, SS), P["floor_dark"])


def plant(d, x, fy, scale=1.0):
    pw = int(BLOCK_W * SS * 0.05 * scale)
    ph = int(BLOCK_H * SS * 0.11 * scale)
    rect(d, x, fy - ph, pw, ph, P["green"])
    for ox, oy in ((-4, -8), (0, -11), (4, -8), (-2, -5), (2, -5)):
        rect(d, x + pw // 2 + ox * SS, fy - ph + oy * SS, 3 * SS, 3 * SS, P["green_hi"])


def framed_art(d, x, y, w, h, colour):
    rect(d, x, y, w, h, P["brass_dim"])
    rect(d, x + 2 * SS, y + 2 * SS, w - 4 * SS, h - 4 * SS, colour)


def chair(d, x, fy, colour, back_left=True, scale=1.0):
    s = SS * scale
    seat_w = int(5 * s)
    rect(d, x, fy - int(BLOCK_H * SS * 0.09), seat_w, int(2 * s), colour)
    bx = x if back_left else x + seat_w - int(s)
    rect(d, bx, fy - int(BLOCK_H * SS * 0.17), max(1, int(s)), int(BLOCK_H * SS * 0.09), colour)
    rect(d, x + int(s), fy - int(BLOCK_H * SS * 0.07), max(1, int(s)), int(BLOCK_H * SS * 0.07), P["floor_dark"])


def table(d, x, fy, w, top_colour=None):
    top_h = max(3 * SS, int(BLOCK_H * SS * 0.03))
    y = fy - int(BLOCK_H * SS * 0.17)
    rect(d, x, y, w, top_h, top_colour or P["floor_hi"])
    rect(d, x, y, w, max(1, SS), P["brass_lo"])
    rect(d, x + w // 2 - SS, y + top_h, 2 * SS, int(BLOCK_H * SS * 0.17) - top_h, P["floor_dark"])
    rect(d, x + w // 2 - 3 * SS, fy - 2 * SS, 6 * SS, 2 * SS, P["floor_dark"])
