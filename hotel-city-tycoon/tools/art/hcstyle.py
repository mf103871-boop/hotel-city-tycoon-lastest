"""
The visual language of Hotel City Tycoon, as code.

Everything drawn for this game is drawn through this module, and that
constraint is the only reason procedurally-produced art can look like one
hotel instead of two hundred separate pictures. `docs/ART-0_VISUAL_DIRECTION_AR.md`
is the brief; this file is that brief made executable.

Four rules from ART-0 shape the whole module:

1.  **Flat front orthographic.** No isometric, no vanishing point, no
    perspective wedges on the side walls. A room is a rectangle seen straight
    on, which is what makes the hotel read as a dollhouse.
2.  **Dark rounded outlines.** Deep navy, never pure black, with rounded caps
    and corners. Thickness is a hierarchy: the room frame is thickest,
    furniture is medium, facial detail is thinnest, and nothing is ever thin
    enough to disappear when the phone zooms out.
3.  **One dominant pastel per room**, its furniture higher in contrast than
    its wall, and at most three strong accents in the frame.
4.  **Nothing finer than two device pixels.** A room block is 128x96 at 1x;
    a detail smaller than that is mud, so it is not drawn at all.

Coordinates here are always *logical 1x pixels*, as floats. The canvas
multiplies them by its own factor, so one drawing routine produces the 1x file
and the @2x file from the same numbers and they cannot drift apart. Supersampling
plus a Lanczos downsample is what gives flat shapes clean anti-aliased edges
without a vector library.

    from hcstyle import Canvas, P
    c = Canvas(128, 96, tier=2)
    c.rrect(4, 4, 120, 88, r=6, fill=P['mint'], ink=P['ink'], lw=2)
    c.save('rooms/example_base.png')
"""
from __future__ import annotations

import math
import os

from PIL import Image, ImageDraw, ImageFilter

# --------------------------------------------------------------------- setup

#: Supersample factor. Every canvas draws this many times bigger than it saves.
#: Four is the point where the flat shapes stop showing stair-steps; eight
#: costs four times the memory for a difference nobody can see at 1x.
SS = 4

#: The simulation's block, in world pixels. Room art is sized to it exactly.
BLOCK_W = 128
BLOCK_H = 96

#: Where finished art lands. Tier 1 at the root, tier 2 under @2x/.
ASSET_ROOT = "public/assets"


# --------------------------------------------------------------------- colour

def rgb(hex_string: str) -> tuple[int, int, int]:
    """`'#6FBCF9'` to `(111, 188, 249)`."""
    h = hex_string.lstrip("#")
    return (int(h[0:2], 16), int(h[2:4], 16), int(h[4:6], 16))


def mix(a, b, t: float):
    """Blend two colours. `t=0` is all `a`, `t=1` is all `b`."""
    return tuple(int(round(a[i] + (b[i] - a[i]) * t)) for i in range(3))


def shade(colour, t: float = 0.18):
    """The same colour, darker. Used for a floor under its own wall."""
    return mix(colour, (10, 20, 44), t)


def tint(colour, t: float = 0.18):
    """The same colour, lighter. Used for a highlight on its own shape."""
    return mix(colour, (255, 255, 255), t)


def alpha(colour, a: float):
    """RGBA from RGB and an 0..1 opacity."""
    return (colour[0], colour[1], colour[2], int(round(255 * a)))


#: The palette.
#:
#: The first block is ART-0 §7 verbatim — those nine values are the reference
#: image measured. Everything after is derived from them by the rules in the
#: same section: a room accent is one of the nine moved 5–10%, furniture is
#: warmer and more saturated than any wall, and the outside is 25–40% less
#: saturated than the hotel so the building stays the brightest thing on screen.
P = {
    # --- ART-0 §7, measured from the reference -------------------------------
    "sky":        rgb("#6FBCF9"),
    "skyHi":      rgb("#8FD0FB"),
    "roomBlue":   rgb("#4F8EE7"),
    "roomBlueDk": rgb("#4784D6"),
    "mint":       rgb("#B4E7C3"),
    "mintDk":     rgb("#A5DBB7"),
    "cream":      rgb("#FBD991"),
    "creamHi":    rgb("#FDE4B0"),
    "lavender":   rgb("#A7A1D3"),
    "coral":      rgb("#ED5C47"),
    "warmWhite":  rgb("#DDE2DF"),
    "ink":        rgb("#031130"),
    "ink2":       rgb("#132A50"),

    # --- room walls, one dominant pastel each --------------------------------
    "wallSky":    rgb("#BFE0FA"),   # pale blue — laundry, gym
    "wallMint":   rgb("#C6EBD2"),   # mint — economy, spa
    "wallCream":  rgb("#FBE7B8"),   # cream — standard, lobby
    "wallPeach":  rgb("#FBD3B0"),   # peach — family
    "wallRose":   rgb("#F7C3CE"),   # rose — honeymoon
    "wallLilac":  rgb("#C9C2EC"),   # lilac — double, business
    "wallSand":   rgb("#EFE0C2"),   # sand — executive, luxury
    "wallSlate":  rgb("#8FA8C8"),   # slate — maintenance
    "wallNavy":   rgb("#2E4C86"),   # deep navy — bar, cinema
    "wallTeal":   rgb("#9FDCD8"),   # teal — pool
    "wallGrape":  rgb("#7B6BB5"),   # grape — arcade
    "wallRed":    rgb("#E7644F"),   # warm red — restaurant

    # --- floors ---------------------------------------------------------------
    "wood":       rgb("#D9954E"),
    "woodDk":     rgb("#B87334"),
    "woodPale":   rgb("#EAC084"),
    "tile":       rgb("#DCE7EF"),
    "tileDk":     rgb("#B9CBD9"),
    "carpet":     rgb("#C9556A"),
    "concrete":   rgb("#9BA6B4"),

    # --- materials -----------------------------------------------------------
    "white":      rgb("#FBFCFD"),
    "linen":      rgb("#F2F5F8"),
    "linenSh":    rgb("#D6DEE7"),
    "glass":      rgb("#BFE6F5"),
    "glassDk":    rgb("#8FCBE4"),
    "metal":      rgb("#C3CCD8"),
    "metalDk":    rgb("#8B97A8"),
    "gold":       rgb("#F5C24D"),
    "goldDk":     rgb("#D19B2A"),
    "green":      rgb("#5BB877"),
    "greenDk":    rgb("#3D8F58"),
    "leaf":       rgb("#77CB8D"),
    "water":      rgb("#57C2E8"),
    "waterDk":    rgb("#2E9AC6"),
    "black":      rgb("#22304A"),
    "shadow":     rgb("#0B1B3A"),

    # --- outside -------------------------------------------------------------
    "cityFar":    rgb("#A9C8E8"),
    "cityNear":   rgb("#93B8DF"),
    "treeFar":    rgb("#A8D9B4"),
    "treeNear":   rgb("#8FCCA1"),
    "road":       rgb("#9AA3AC"),
    "roadLine":   rgb("#EDF1F4"),
    "kerb":       rgb("#C6CDD4"),

    # --- skin and hair, deliberately varied ----------------------------------
    "skin1":      rgb("#F7D3B5"),
    "skin2":      rgb("#EFBE96"),
    "skin3":      rgb("#D79A6E"),
    "skin4":      rgb("#B0744A"),
    "skin5":      rgb("#8A5533"),
    "hairBlack":  rgb("#2A2431"),
    "hairBrown":  rgb("#7A4A2C"),
    "hairAuburn": rgb("#B4562C"),
    "hairBlond":  rgb("#F2C960"),
    "hairGrey":   rgb("#C8CCD4"),
    "hairPink":   rgb("#F27EA8"),
    "blush":      rgb("#F79FA0"),
}

#: Wall colours live in the RoomSpec tables of rooms_guest / rooms_commercial
#: / rooms_service, and nowhere else.
#:
#: There used to be a ROOM_WALL dict here that claimed to be "the wall colour
#: every room type is built on" and that "two rooms next to each other never
#: share one". Nothing read it, both claims were false — five groups of rooms
#: share a wall by design, and the table disagreed with the shipped art for
#: deluxe, executive, presidential and spa — and a contract that nothing
#: enforces and nothing consumes is worse than no contract, because the next
#: person to read it believes it.


# ------------------------------------------------------------------ line work

#: Outline weights in 1x pixels, from ART-0 §4 scaled to a 128x96 block.
#: The reference sheet quotes 7–9px on a 1536-wide canvas; a room block is an
#: eighth of that, so the same *proportion* lands here.
LW_FRAME = 2.0      # the room's own frame — thickest line in the game
LW_PROP = 1.4       # furniture, fittings, characters
LW_DETAIL = 1.0     # panel lines, window bars, folds
LW_FACE = 0.9       # eyes, mouths, the finest thing drawn


# ---------------------------------------------------------------------- canvas

def _grow(box, pad: float):
    """A box widened by a line width, so an outline is inside the scratch layer."""
    return [box[0] - pad, box[1] - pad, box[2] + pad, box[3] + pad]


def _shift(box, dx: float, dy: float):
    return [box[0] - dx, box[1] - dy, box[2] - dx, box[3] - dy]


def _bounds(points, pad: float):
    xs = [p[0] for p in points]
    ys = [p[1] for p in points]
    return [min(xs) - pad, min(ys) - pad, max(xs) + pad, max(ys) + pad]


class Canvas:
    """
    A drawing surface addressed in logical 1x pixels.

    Every coordinate handed to the methods below is in the units the game
    thinks in — a room is 128x96 whatever tier is being written — and the
    canvas scales them. `tier=1` writes `public/assets/<path>`, `tier=2` writes
    `public/assets/@2x/<path>` at double the size from identical arithmetic.
    """

    def __init__(self, w: float, h: float, tier: int = 1, bg=None):
        self.w = float(w)
        self.h = float(h)
        self.tier = tier
        self.k = tier * SS
        size = (max(1, int(round(self.w * self.k))), max(1, int(round(self.h * self.k))))
        fill = (0, 0, 0, 0) if bg is None else (bg if len(bg) == 4 else (*bg, 255))
        self.img = Image.new("RGBA", size, fill)
        self.d = ImageDraw.Draw(self.img, "RGBA")

    # -- unit conversion ----------------------------------------------------
    def _p(self, v: float) -> float:
        return v * self.k

    def _box(self, x, y, w, h):
        return [self._p(x), self._p(y), self._p(x + w) - 1, self._p(y + h) - 1]

    # -- blending -----------------------------------------------------------
    #
    # Pillow's `ImageDraw.Draw(img, "RGBA")` only blends when the *image* is
    # RGB. On an RGBA canvas — which every canvas here is, because sprites need
    # transparency — a translucent fill REPLACES the pixel, alpha and all. A
    # 50% white highlight over a coral wall did not lighten the wall; it cut a
    # half-transparent hole through it.
    #
    # So anything translucent is drawn onto its own transparent layer and
    # composited, which is what `alpha()` has always looked like it did. Opaque
    # drawing — nearly all of it — still goes straight onto the canvas, so the
    # cost only lands where blending is actually asked for.

    @staticmethod
    def _translucent(*colours) -> bool:
        return any(c is not None and len(c) == 4 and c[3] < 255 for c in colours)

    def _paint(self, colours, bbox, draw):
        """
        Run `draw(handle, dx, dy)` so translucent colours blend instead of
        replace.

        The scratch layer covers the shape's own bounding box rather than the
        whole canvas. A supersampled four-block room is twelve megapixels;
        allocating and compositing that for every translucent highlight turned
        a nine-second generation into minutes. `dx`/`dy` are what the caller
        subtracts from its coordinates to draw into that box.
        """
        if not self._translucent(*colours):
            draw(self.d, 0, 0)
            return
        pad = 2
        x0 = max(0, int(min(bbox[0], bbox[2])) - pad)
        y0 = max(0, int(min(bbox[1], bbox[3])) - pad)
        x1 = min(self.img.width, int(max(bbox[0], bbox[2])) + pad + 1)
        y1 = min(self.img.height, int(max(bbox[1], bbox[3])) + pad + 1)
        if x1 <= x0 or y1 <= y0:
            return
        layer = Image.new("RGBA", (x1 - x0, y1 - y0), (0, 0, 0, 0))
        draw(ImageDraw.Draw(layer, "RGBA"), x0, y0)
        self.img.alpha_composite(layer, (x0, y0))

    # -- primitives ---------------------------------------------------------
    def rect(self, x, y, w, h, fill=None, ink=None, lw=LW_PROP):
        if w <= 0 or h <= 0:
            return
        box = self._box(x, y, w, h)
        width = max(1, int(round(self._p(lw)))) + max(0, int(round(self._p(lw))))
        self._paint((fill, ink), _grow(box, width), lambda d, dx, dy: d.rectangle(
            _shift(box, dx, dy), fill=fill, outline=ink,
            width=max(1, int(round(self._p(lw)))) if ink else 0))

    def rrect(self, x, y, w, h, r=3.0, fill=None, ink=None, lw=LW_PROP):
        """A rounded rectangle. The default shape of nearly everything here."""
        if w <= 0 or h <= 0:
            return
        radius = max(0, min(self._p(r), self._p(min(w, h)) / 2 - 1))
        box = self._box(x, y, w, h)
        width = max(1, int(round(self._p(lw))))
        self._paint((fill, ink), _grow(box, width), lambda d, dx, dy: d.rounded_rectangle(
            _shift(box, dx, dy), radius=radius, fill=fill, outline=ink,
            width=width if ink else 0))

    def ellipse(self, cx, cy, rx, ry, fill=None, ink=None, lw=LW_PROP):
        box = [self._p(cx - rx), self._p(cy - ry), self._p(cx + rx) - 1, self._p(cy + ry) - 1]
        width = max(1, int(round(self._p(lw))))
        self._paint((fill, ink), _grow(box, width), lambda d, dx, dy: d.ellipse(
            _shift(box, dx, dy), fill=fill, outline=ink, width=width if ink else 0))

    def circle(self, cx, cy, r, fill=None, ink=None, lw=LW_PROP):
        self.ellipse(cx, cy, r, r, fill, ink, lw)

    def poly(self, pts, fill=None, ink=None, lw=LW_PROP):
        scaled = [(self._p(x), self._p(y)) for x, y in pts]
        width = max(1, int(round(self._p(lw))))
        self._paint((fill, ink), _bounds(scaled, width), lambda d, dx, dy: d.polygon(
            [(px - dx, py - dy) for px, py in scaled], fill=fill, outline=ink,
            width=width if ink else 0))

    def line(self, pts, colour, lw=LW_DETAIL, cap=True):
        """A polyline with rounded joins — ART-0 §6 asks for rounded ends."""
        scaled = [(self._p(x), self._p(y)) for x, y in pts]
        width = max(1, int(round(self._p(lw))))

        def draw(d, dx, dy):
            moved = [(px - dx, py - dy) for px, py in scaled]
            d.line(moved, fill=colour, width=width, joint="curve")
            if cap and width > 2:
                r = width / 2
                for x, y in (moved[0], moved[-1]):
                    d.ellipse([x - r, y - r, x + r, y + r], fill=colour)
        self._paint((colour,), _bounds(scaled, width * 2), draw)

    def arc(self, cx, cy, rx, ry, start, end, colour, lw=LW_DETAIL):
        box = [self._p(cx - rx), self._p(cy - ry), self._p(cx + rx) - 1, self._p(cy + ry) - 1]
        width = max(1, int(round(self._p(lw))))
        self._paint((colour,), _grow(box, width), lambda d, dx, dy: d.arc(
            _shift(box, dx, dy), start, end, fill=colour, width=width))

    def pie(self, cx, cy, rx, ry, start, end, fill=None, ink=None, lw=LW_PROP):
        box = [self._p(cx - rx), self._p(cy - ry), self._p(cx + rx) - 1, self._p(cy + ry) - 1]
        width = max(1, int(round(self._p(lw))))
        self._paint((fill, ink), _grow(box, width), lambda d, dx, dy: d.pieslice(
            _shift(box, dx, dy), start, end, fill=fill, outline=ink,
            width=width if ink else 0))

    # -- composition --------------------------------------------------------
    def blit(self, other: "Canvas", x: float, y: float):
        """Stamp another canvas of the same tier onto this one."""
        self.img.alpha_composite(other.img, (int(round(self._p(x))), int(round(self._p(y)))))

    def overlay(self, colour, a: float):
        """Wash the whole canvas — night light, grime, a heat haze."""
        layer = Image.new("RGBA", self.img.size, alpha(colour, a))
        self.img.alpha_composite(layer)

    def contact_shadow(self, cx, cy, rx, ry=None, a=0.16):
        """
        The small ellipse under anything standing on a floor.

        ART-0 §8 puts it at 10–18% opacity: enough to seat an object, never
        enough to read as a light source.
        """
        self.ellipse(cx, cy, rx, ry if ry is not None else rx * 0.34, fill=alpha(P["shadow"], a))

    # -- output -------------------------------------------------------------
    def image(self) -> Image.Image:
        """The finished bitmap at its declared size."""
        target = (max(1, int(round(self.w * self.tier))), max(1, int(round(self.h * self.tier))))
        return self.img.resize(target, Image.LANCZOS)

    def save(self, rel_path: str) -> str:
        """Write to the asset tree for this canvas's tier and return the path."""
        root = ASSET_ROOT if self.tier == 1 else f"{ASSET_ROOT}/@{self.tier}x"
        path = f"{root}/{rel_path}"
        os.makedirs(os.path.dirname(path), exist_ok=True)
        save_png(self.image(), path)
        return path


def save_png(img: Image.Image, path: str) -> None:
    """
    Write a PNG small enough to ship.

    Flat art is a few hundred colours pretending to be truecolour — the fills
    are flat, and everything past them is anti-aliasing along the outlines.
    Quantising to an adaptive palette is visually lossless at this scale and
    roughly halves the file, which is the difference between shipping a
    complete @2x tree inside the 8MB budget and not.

    Octree rather than median cut: it is the only method Pillow will run on an
    RGBA image, and transparency is not optional here — every sprite outside
    the room backgrounds has it.

    But octree is asked for a palette, not promised one. Given `colors=N` for
    an image that has exactly N colours it still merges neighbours wherever its
    subdivision happens to put them, and near-neighbours are most of what flat
    art is made of. `wallArt_projectorScreen` went in with 103 colours and came
    out with 19: the screen's white face `#FBFCFD` and its tinted top band
    `#E2F4FA` were merged into one `#F3F9FC`, so the 1x file lost the two-tone
    screen that the @2x file still has. Two resolutions of the same sprite were
    different pictures, which is the one thing `both_tiers` exists to prevent.

    So the result is checked rather than assumed. Quantised output is kept only
    when it is pixel-identical to what was drawn; anything else ships as
    truecolour. Almost every asset is still quantised — flat art really is a
    few hundred flat colours — and the handful that are not cost a few KB
    against a budget with megabytes of headroom.
    """
    rgba = img.convert("RGBA")
    colours = rgba.getcolors(maxcolors=1 << 16)
    if colours is not None and len(colours) <= 256:
        quantised = rgba.quantize(
            colors=max(2, len(colours)), method=Image.FASTOCTREE, dither=Image.NONE,
        )
        if list(quantised.convert("RGBA").getdata()) == list(rgba.getdata()):
            quantised.save(path, optimize=True)
            return
    rgba.save(path, optimize=True)


def both_tiers(fn, *args, **kwargs) -> list[str]:
    """
    Run one drawing routine for both resolution tiers.

    `fn(tier) -> Canvas` is called twice, so the 1x and the @2x file are the
    same arithmetic at two scales rather than one file resized — which is what
    keeps the outlines the same weight relative to the art on a phone.
    """
    out = []
    for tier in (1, 2):
        canvas, rel = fn(tier, *args, **kwargs)
        out.append(canvas.save(rel))
    return out


# ------------------------------------------------------------------ room spec


class RoomSpec:
    """
    One room type's art contract.

    `wall` and `floor` are the two colours the room is built from — one
    dominant pastel and the surface under it, per ART-0 §7 — and `draw` adds
    the architecture that makes it that room: its windows, its door, and, for a
    commercial room, the fixed equipment `ASSET-SPEC.md` §1 says belongs to the
    building rather than to the decor catalogue.

    `draw(c, fy)` is handed a canvas whose shell is already painted and the
    floor line `fy` that everything standing in the room shares. What it must
    never draw is movable furniture: beds, chairs, tables, lamps and rugs are
    decor sprites composited on top at runtime, and a room that has them baked
    in shows each one twice as soon as the player buys it.
    """

    def __init__(self, wall, floor=None, draw=None, floor_h=None):
        self.wall = wall
        self.floor = floor
        self.draw = draw or (lambda c, fy: None)
        self.floor_h = floor_h


# ------------------------------------------------------------- room furniture
#
# Shared architecture. A room's own generator draws what makes it that room;
# everything below is what every room has in common, so a lobby and a gym feel
# built by the same firm.

def room_shell(c: Canvas, wall, floor=None, floor_h: float | None = None,
               skirting: bool = True) -> float:
    """
    The empty room: wall, floor band, and the frame that separates it from its
    neighbours.

    Returns the floor line — the y every character's feet and every standing
    piece of furniture sit on. Flat by construction: no side walls, no ceiling
    wedge, nothing that implies a camera anywhere but straight ahead.
    """
    w, h = c.w, c.h
    fh = floor_h if floor_h is not None else max(9.0, h * 0.14)
    # One flat colour, exactly as the reference does it. A gradient here reads
    # as a seam at 1x and buys nothing; the wall's job is to be the quiet field
    # everything else is legible against.
    c.rect(0, 0, w, h, fill=wall)

    floor_colour = floor if floor is not None else P["wood"]
    c.rect(0, h - fh, w, fh, fill=floor_colour)
    c.rect(0, h - fh, w, fh * 0.28, fill=tint(floor_colour, 0.16))
    if skirting:
        c.rect(0, h - fh - 1.6, w, 1.6, fill=shade(floor_colour, 0.30))

    room_frame(c)
    return h - fh


def room_frame(c: Canvas) -> None:
    """
    The dark border every room carries.

    Each room owns its own frame rather than the hotel drawing a grid over the
    top, because rooms are placed on a free grid and a shared line would have
    to know about neighbours that may not exist yet. Two rooms side by side
    therefore meet in a double-weight separator, which is exactly the
    dollhouse look the reference has.
    """
    c.rect(0, 0, c.w, c.h, ink=P["ink"], lw=LW_FRAME)


def window(c: Canvas, x, y, w, h, night: bool = False, arch: bool = False) -> None:
    """
    A window with daylight behind it.

    The reference's rooms are lit rooms in the daytime, so what is outside is
    sky and a hint of the city rather than the black rectangle a night-set
    hotel would use. `night=True` is what the night variant swaps in.
    """
    r = min(w, h) * (0.5 if arch else 0.18)
    if night:
        c.rrect(x, y, w, h, r=r, fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
        # A few lit windows in the towers opposite.
        for i in range(max(1, int(w // 7))):
            for j in range(max(1, int(h // 9))):
                if (i * 3 + j * 5) % 4 == 0:
                    c.rrect(x + 2.5 + i * 6.5, y + 3 + j * 8, 2.4, 3.0, r=0.6,
                            fill=alpha(P["cream"], 0.9))
    else:
        c.rrect(x, y, w, h, r=r, fill=P["glass"], ink=P["ink"], lw=LW_PROP)
        c.rect(x + 1.5, y + h * 0.55, w - 3, h * 0.45 - 1.5, fill=alpha(P["cityFar"], 0.85))
        c.rrect(x + w * 0.18, y + h * 0.42, w * 0.22, h * 0.5, r=1, fill=alpha(P["cityNear"], 0.7))
        c.rrect(x + w * 0.55, y + h * 0.5, w * 0.26, h * 0.42, r=1, fill=alpha(P["cityNear"], 0.55))
        # Sun glint: two thin diagonals, the only gloss in the room.
        c.line([(x + w * 0.16, y + h * 0.72), (x + w * 0.44, y + h * 0.14)],
               alpha(P["white"], 0.55), LW_DETAIL)
        c.line([(x + w * 0.36, y + h * 0.80), (x + w * 0.56, y + h * 0.52)],
               alpha(P["white"], 0.40), LW_DETAIL * 0.8)
    # Mullion. One bar, not a grid: a grid turns to mud at 1x.
    c.line([(x + w / 2, y + 1.5), (x + w / 2, y + h - 1.5)], P["ink"], LW_DETAIL)


def door(c: Canvas, x, floor_y, w, h, colour=None) -> None:
    """A door standing on the floor line, handle on the opening side."""
    colour = colour or P["coral"]
    c.rrect(x, floor_y - h, w, h, r=1.8, fill=colour, ink=P["ink"], lw=LW_PROP)
    c.rrect(x + w * 0.14, floor_y - h * 0.88, w * 0.72, h * 0.74, r=1.2,
            fill=alpha(tint(colour, 0.18), 0.6))
    c.circle(x + w * 0.80, floor_y - h * 0.46, 1.1, fill=P["gold"], ink=P["ink"], lw=LW_FACE)


def wall_lamp(c: Canvas, cx, y, warm=True) -> None:
    """
    A sconce. Rooms that have one read as lived-in at a glance — but only if
    it is big enough to be a lamp rather than a smudge, which at a 96-pixel
    room height means about six pixels of shade.
    """
    shade_colour = P["cream"] if warm else P["metal"]
    # The wall plate and arm, then the shade. Without the plate the shade reads
    # as a caret floating on the wall rather than as a lamp fixed to it.
    c.rrect(cx - 1.6, y, 3.2, 4.0, r=1.2, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    c.poly([(cx - 5.4, y + 10.5), (cx + 5.4, y + 10.5), (cx + 3.0, y + 3.6), (cx - 3.0, y + 3.6)],
           fill=shade_colour, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 5.4, y + 9.6, 10.8, 1.8, r=0.9, fill=tint(shade_colour, 0.42))
    # A pool of light under it: one soft mark, the only glow in the room.
    c.ellipse(cx, y + 13.5, 6.4, 3.0, fill=alpha(shade_colour, 0.30))


def pendant(c: Canvas, cx, drop, shade_w=7.0, colour=None) -> None:
    """A ceiling lamp hanging from the top of the room."""
    colour = colour or P["cream"]
    c.line([(cx, 2.0), (cx, drop)], P["ink2"], LW_DETAIL)
    c.poly([(cx - shade_w / 2, drop + shade_w * 0.62), (cx + shade_w / 2, drop + shade_w * 0.62),
            (cx + shade_w * 0.18, drop), (cx - shade_w * 0.18, drop)],
           fill=colour, ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, drop + shade_w * 0.62, shade_w / 2, shade_w * 0.12, fill=tint(colour, 0.35))


def rug_strip(c: Canvas, cx, floor_y, w, colour=None) -> None:
    """A rug lying on the floor line, seen straight on: a flat band."""
    colour = colour or P["carpet"]
    c.rrect(cx - w / 2, floor_y - 2.6, w, 4.4, r=1.6, fill=colour, ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - w / 2 + 2, floor_y - 1.8, w - 4, 2.8, r=1.0, fill=alpha(tint(colour, 0.30), 0.7))


def plant_pot(c: Canvas, cx, floor_y, scale=1.0) -> None:
    """The small potted plant that appears in a dozen rooms."""
    s = scale
    c.contact_shadow(cx, floor_y + 0.6, 5.0 * s)
    c.poly([(cx - 3.4 * s, floor_y - 6.0 * s), (cx + 3.4 * s, floor_y - 6.0 * s),
            (cx + 2.6 * s, floor_y), (cx - 2.6 * s, floor_y)],
           fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    for dx, dy, r in ((-2.6, -9.4, 3.0), (2.6, -9.4, 3.0), (0, -12.0, 3.4), (0, -8.0, 3.0)):
        c.circle(cx + dx * s, floor_y + dy * s, r * s, fill=P["leaf"], ink=P["ink"], lw=LW_DETAIL)


def counter(c: Canvas, x, floor_y, w, h, body=None, top=None) -> None:
    """A service counter: bar, reception desk, cafe front."""
    body = body or P["wood"]
    top = top or P["woodPale"]
    c.rrect(x, floor_y - h, w, h, r=1.8, fill=body, ink=P["ink"], lw=LW_PROP)
    c.rrect(x - 1.2, floor_y - h - 2.2, w + 2.4, 3.0, r=1.2, fill=top, ink=P["ink"], lw=LW_PROP)


# --------------------------------------------------------------------- people
#
# One builder, many people. ART-0 §5 asks for chibi proportions, a silhouette
# that names the role without a label, and deliberate variety in skin, hair,
# age and build — never one body with the colours swapped.

#: Character frame, from the render contract in ART-0 §17.
CHAR_W = 48
CHAR_H = 72
#: Feet sit here; the pivot the renderer anchors to is (CHAR_W/2, FOOT_Y).
FOOT_Y = 70.0


class Person:
    """
    One character's fixed identity: what does not change between frames.

    Keeping it in one object is what stops a walk cycle from quietly changing
    somebody's hair colour halfway through — ART-0 §11 forbids exactly that,
    and it is the failure mode of drawing each frame from scratch.
    """

    def __init__(self, skin, hair, hair_style="short", top=None, bottom=None,
                 accent=None, build="normal", height=1.0, cap=None, apron=None,
                 age="adult", cap_style="beanie"):
        self.skin = skin
        self.hair = hair
        self.hair_style = hair_style
        self.top = top or P["roomBlue"]
        self.bottom = bottom or P["ink2"]
        self.accent = accent or P["gold"]
        self.build = build           # slim | normal | broad
        self.height = height         # 0.9 short, 1.0 average, 1.08 tall
        self.cap = cap               # a hat colour, or None
        self.cap_style = cap_style   # beanie | pillbox | toque | peaked
        self.apron = apron           # an apron/overall colour, or None
        self.age = age               # child | adult | senior

def _figure(who: Person):
    """
    The skeleton every pose hangs on, in logical pixels.

    Proportions come straight from ART-0 §5 and from measuring the reference:
    the head is a little under half the figure, the torso a third, the legs the
    remaining fifth. Short legs are not a stylisation for its own sake — they
    are what keeps a 30-pixel-tall character reading as a person rather than a
    stick, and they let a room's floor line sit high without the feet leaving it.

    Height varies the *body*, never the head: a tall adult and a child differ
    in build, so the cast reads as different people instead of one drawing at
    two zoom levels.
    """
    total = 60.0 * who.height
    head_r = total * (0.235 if who.age != "child" else 0.255)
    top_y = FOOT_Y - total
    head_cy = top_y + head_r
    hip_y = FOOT_Y - total * 0.215
    body_top = head_cy + head_r * 0.86
    shoulder = {"slim": 10.0, "normal": 11.4, "broad": 13.2}[who.build] * (0.86 if who.age == "child" else 1.0)
    return {
        "total": total, "head_r": head_r, "head_cy": head_cy,
        "body_top": body_top, "hip_y": hip_y, "shoulder": shoulder,
    }


#: Vertical bob per frame, by pose. Small on purpose: ART-0 §11 asks for
#: movement that is visible without everything on screen bouncing.
_BOB = {
    "idle": (0.0, -0.4, -0.55, -0.4),
    "walk": (-0.8, -0.3, 0.5, 0.8, 0.3, -0.5),
    "work": (0.0, -0.6, -0.3),
    "sit": (0.0,),
    "stand": (0.0,),
}


def draw_person(c: Canvas, who: Person, ox: float, oy: float = 0.0,
                pose: str = "idle", phase: int = 0, expression: str = "smile",
                prop: str | None = None, facing: int = 1) -> None:
    """
    Draw one character with their feet at `(ox, FOOT_Y + oy)`.

    `pose` is the activity the simulation is in — idle, walk, work, sit, sleep
    — and `phase` the frame within it. Only limbs and a sub-pixel bob change
    between frames: the head, the face and the clothes are re-read from `who`
    every time, so a walk cycle physically cannot change who somebody is.
    """
    if pose == "sleep":
        _draw_sleeper(c, who, ox, oy, expression)
        return

    g = _figure(who)
    bob = _BOB.get(pose, (0.0,))[phase % len(_BOB.get(pose, (0.0,)))]
    oy += bob

    head_cy = g["head_cy"] + oy
    body_top = g["body_top"] + oy
    hip_y = g["hip_y"] + oy
    foot = FOOT_Y + oy
    shoulder = g["shoulder"]
    head_r = g["head_r"]

    c.contact_shadow(ox, FOOT_Y + 0.4, shoulder * 0.62, a=0.14)
    _draw_hair_back(c, who, ox, head_cy, head_r)

    # --- legs: short, thick, and always ending in a shoe -------------------
    swing = 0.0
    if pose == "walk":
        swing = (3.8, 2.0, -2.0, -3.8, -2.0, 2.0)[phase % 6] * facing
    seat = pose == "sit"
    for side in (-1, 1):
        hx = ox + side * shoulder * 0.26
        fx = hx + swing * side
        fy = foot - 1.8
        if seat:
            fx, fy = hx + facing * 3.2, foot - 1.8
        c.line([(hx, hip_y), (fx, fy)], P["ink"], 4.6)
        c.line([(hx, hip_y), (fx, fy)], who.bottom, 3.2)
        c.rrect(fx - 2.4, fy - 0.6, 4.8, 2.8, r=1.3, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)

    # --- torso --------------------------------------------------------------
    torso_h = hip_y - body_top + 1.6
    c.rrect(ox - shoulder / 2, body_top, shoulder, torso_h, r=shoulder * 0.30,
            fill=who.top, ink=P["ink"], lw=LW_PROP)
    if who.apron:
        c.rrect(ox - shoulder * 0.32, body_top + torso_h * 0.24, shoulder * 0.64,
                torso_h * 0.86, r=1.4, fill=who.apron, ink=P["ink"], lw=LW_DETAIL)
        c.line([(ox - shoulder * 0.22, body_top + torso_h * 0.24),
                (ox - shoulder * 0.30, body_top + 0.8)], P["ink"], LW_FACE)
        c.line([(ox + shoulder * 0.22, body_top + torso_h * 0.24),
                (ox + shoulder * 0.30, body_top + 0.8)], P["ink"], LW_FACE)
    else:
        # A collar. The cheapest mark that says "uniform" rather than "shirt".
        c.line([(ox - shoulder * 0.24, body_top + 1.4), (ox, body_top + 3.2),
                (ox + shoulder * 0.24, body_top + 1.4)], who.accent, LW_DETAIL)

    # --- arms ---------------------------------------------------------------
    arm_y = body_top + torso_h * 0.26
    arm_len = torso_h * 0.72
    hands: dict[int, tuple[float, float]] = {}
    for side in (-1, 1):
        ax = ox + side * (shoulder / 2 - 0.6)
        if pose == "work" and side == facing:
            end = (ax + side * 4.8, arm_y + arm_len * 0.30)
        elif pose == "work":
            end = (ax + side * 1.6, arm_y + arm_len * 0.90)
        elif pose == "walk":
            sw = (-3.0, -1.5, 1.5, 3.0, 1.5, -1.5)[phase % 6] * -side * facing
            end = (ax + sw * 0.8, arm_y + arm_len)
        elif pose == "sit":
            end = (ax + side * 2.2, arm_y + arm_len * 0.68)
        else:
            end = (ax + side * 1.3, arm_y + arm_len)
        c.line([(ax, arm_y), end], P["ink"], 4.0)
        c.line([(ax, arm_y), end], who.top, 2.8)
        c.circle(end[0], end[1], 1.9, fill=who.skin, ink=P["ink"], lw=LW_FACE)
        hands[side] = end

    # --- head ---------------------------------------------------------------
    c.circle(ox, head_cy, head_r, fill=who.skin, ink=P["ink"], lw=LW_PROP)
    _draw_hair_front(c, who, ox, head_cy, head_r)
    if who.cap:
        _draw_cap(c, who, ox, head_cy, head_r)
    _draw_face(c, who, ox, head_cy, head_r, expression)

    # The tool goes in last so it is never buried under an arm.
    if prop:
        hx, hy = hands[1 if facing >= 0 else -1]
        _draw_prop(c, prop, hx, hy, facing)


def _draw_hair_back(c: Canvas, who: Person, cx, cy, r):
    """Hair that falls behind the head, drawn before the skull."""
    style = who.hair_style
    if style == "long":
        c.rrect(cx - r * 1.02, cy - r * 0.55, r * 2.04, r * 2.05, r=r * 0.62,
                fill=who.hair, ink=P["ink"], lw=LW_FACE)
    elif style == "bun":
        c.circle(cx, cy - r * 1.06, r * 0.44, fill=who.hair, ink=P["ink"], lw=LW_FACE)
    elif style == "pigtails":
        for side in (-1, 1):
            c.circle(cx + side * r * 1.06, cy + r * 0.12, r * 0.42,
                     fill=who.hair, ink=P["ink"], lw=LW_FACE)
    elif style == "ponytail":
        c.rrect(cx + r * 0.72, cy - r * 0.30, r * 0.62, r * 1.50, r=r * 0.31,
                fill=who.hair, ink=P["ink"], lw=LW_FACE)


def _draw_hair_front(c: Canvas, who: Person, cx, cy, r):
    """
    The hair you actually read: a skull cap with a shaped fringe.

    ART-0 §5 makes hair and headwear the primary way one character is told from
    another, so each style changes the *silhouette* — a lobed crown, a flat
    fringe, a receded hairline — rather than only the colour.
    """
    style = who.hair_style
    if style == "bald":
        # Hair at the temples and nowhere else. A band across the forehead
        # would read as a headband, which is a different character entirely.
        for side in (-1, 1):
            c.ellipse(cx + side * r * 0.80, cy - r * 0.16, r * 0.26, r * 0.40, fill=who.hair)
        c.arc(cx, cy, r, r, 180, 360, P["ink"], LW_FACE)
        return

    # The crown: the top 45% of the skull, every style.
    c.pie(cx, cy, r, r, 180, 360, fill=who.hair)
    fringe_y = cy - r * 0.16

    if style == "curly":
        for dx, dy, rr in ((-0.78, -0.42, 0.40), (-0.40, -0.80, 0.44), (0.0, -0.94, 0.44),
                           (0.40, -0.80, 0.44), (0.78, -0.42, 0.40)):
            c.circle(cx + dx * r, cy + dy * r, rr * r, fill=who.hair)
    elif style == "spiky":
        # Three soft tufts. Sharp spikes read as horns at this size, which is
        # a different character than the one the uniform is describing.
        for dx, lift in ((-0.52, 0.86), (0.0, 1.00), (0.52, 0.86)):
            c.ellipse(cx + dx * r, cy - r * lift * 0.72, r * 0.30, r * 0.42, fill=who.hair)
    elif style in ("short", "bun", "ponytail"):
        # Two small side tabs in front of the ears.
        for side in (-1, 1):
            c.rrect(cx + side * r * 0.98 - (r * 0.30 if side > 0 else 0), cy - r * 0.34,
                    r * 0.30, r * 0.62, r=r * 0.14, fill=who.hair)
    elif style in ("long", "pigtails"):
        for side in (-1, 1):
            c.rrect(cx + side * r * 1.0 - (r * 0.34 if side > 0 else 0), cy - r * 0.36,
                    r * 0.34, r * 0.86, r=r * 0.16, fill=who.hair)

    # A fringe that dips slightly, so the hairline is a shape and not a chord.
    c.ellipse(cx, fringe_y, r * 0.99, r * 0.40, fill=who.hair)
    c.ellipse(cx, fringe_y + r * 0.14, r * 0.62, r * 0.26, fill=who.skin)
    c.arc(cx, cy, r, r, 180, 360, P["ink"], LW_FACE)


def _draw_cap(c: Canvas, who: Person, cx, cy, r):
    """
    A hat over the hair — the single strongest role signal in a silhouette.

    Four shapes, because a chef and a bellhop have to be told apart from across
    the lobby: a soft beanie, a flat pillbox, a tall toque, and a peaked cap.
    """
    style = who.cap_style
    if style == "toque":
        c.rrect(cx - r * 0.74, cy - r * 1.72, r * 1.48, r * 1.20, r=r * 0.46,
                fill=who.cap, ink=P["ink"], lw=LW_FACE)
        c.rrect(cx - r * 0.86, cy - r * 0.68, r * 1.72, r * 0.36, r=r * 0.16,
                fill=who.cap, ink=P["ink"], lw=LW_FACE)
        return
    if style == "pillbox":
        c.rrect(cx - r * 0.66, cy - r * 1.22, r * 1.32, r * 0.66, r=r * 0.18,
                fill=who.cap, ink=P["ink"], lw=LW_FACE)
        c.rrect(cx - r * 0.80, cy - r * 0.66, r * 1.60, r * 0.28, r=r * 0.12,
                fill=shade(who.cap, 0.18), ink=P["ink"], lw=LW_FACE)
        return
    if style == "peaked":
        c.pie(cx, cy - r * 0.22, r * 0.88, r * 0.88, 182, 358, fill=who.cap)
        c.rrect(cx - r * 1.06, cy - r * 0.52, r * 2.12, r * 0.30, r=r * 0.14,
                fill=shade(who.cap, 0.22), ink=P["ink"], lw=LW_FACE)
        c.arc(cx, cy - r * 0.22, r * 0.88, r * 0.88, 182, 358, P["ink"], LW_FACE)
        return
    c.pie(cx, cy - r * 0.16, r * 0.92, r * 0.92, 182, 358, fill=who.cap)
    c.rrect(cx - r * 0.94, cy - r * 0.44, r * 1.88, r * 0.30, r=r * 0.14,
            fill=who.cap, ink=P["ink"], lw=LW_FACE)
    c.arc(cx, cy - r * 0.16, r * 0.92, r * 0.92, 182, 358, P["ink"], LW_FACE)


def _draw_face(c: Canvas, who: Person, cx, cy, r, expression):
    """
    Two eyes, a mouth, two spots of blush, and nothing else.

    ART-0 §5 is explicit that this is the whole vocabulary. At the size a
    character is actually seen — around thirty pixels tall on a phone — a nose
    or an extra brow line is one dark pixel too many, and the face stops
    reading as friendly.
    """
    ex = r * 0.36
    ey = cy + r * 0.14
    if expression == "sleep":
        for side in (-1, 1):
            c.arc(cx + side * ex, ey + r * 0.04, r * 0.19, r * 0.16, 190, 350, P["ink"], LW_FACE)
    else:
        for side in (-1, 1):
            c.ellipse(cx + side * ex, ey, r * 0.135, r * 0.175, fill=P["ink"])
            c.circle(cx + side * ex - r * 0.05, ey - r * 0.055, r * 0.05, fill=P["white"])
    for side in (-1, 1):
        c.ellipse(cx + side * ex * 1.72, ey + r * 0.30, r * 0.17, r * 0.105,
                  fill=alpha(P["blush"], 0.6))

    my = cy + r * 0.46
    if expression == "happy":
        # A small open smile. The first version was a filled half-disc a
        # quarter of the head wide, which at 30 pixels tall read as a snout.
        c.pie(cx, my - r * 0.10, r * 0.17, r * 0.19, 8, 172, fill=P["ink"])
    elif expression == "sleep":
        c.ellipse(cx, my, r * 0.11, r * 0.09, fill=P["ink"])
    elif expression == "cross":
        c.arc(cx, my + r * 0.16, r * 0.22, r * 0.20, 200, 340, P["ink"], LW_FACE)
    else:
        c.arc(cx, my - r * 0.14, r * 0.21, r * 0.22, 15, 165, P["ink"], LW_FACE)


def _draw_prop(c: Canvas, prop: str, x, y, facing):
    """The tool that finishes a role: a tray, a mop, a dumbbell, a clipboard."""
    f = 1 if facing >= 0 else -1
    if prop == "tray":
        c.rrect(x - 5.0, y - 1.6, 10.0, 2.2, r=1.0, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
        c.rrect(x - 2.4, y - 4.2, 4.0, 2.8, r=1.0, fill=P["white"], ink=P["ink"], lw=LW_FACE)
        c.circle(x + 2.6, y - 2.8, 1.2, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    elif prop == "mop":
        c.line([(x, y - 11.0), (x, y + 6.0)], P["woodDk"], 1.6)
        c.rrect(x - 3.2, y + 4.6, 6.4, 3.6, r=1.4, fill=P["glassDk"], ink=P["ink"], lw=LW_FACE)
    elif prop == "clipboard":
        c.rrect(x - 3.0, y - 1.4, 6.0, 7.4, r=1.0, fill=P["woodPale"], ink=P["ink"], lw=LW_FACE)
        for i in range(3):
            c.rect(x - 1.8, y + 0.8 + i * 1.7, 3.6, 0.7, fill=P["ink2"])
    elif prop == "dumbbell":
        c.line([(x - 3.4, y), (x + 3.4, y)], P["metalDk"], 1.4)
        for dx in (-4.8, 2.8):
            c.rrect(x + dx, y - 2.4, 2.2, 4.8, r=0.9, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)
    elif prop == "cup":
        c.rrect(x - 2.0, y - 3.0, 4.0, 4.0, r=1.0, fill=P["white"], ink=P["ink"], lw=LW_FACE)
        c.arc(x + 2.0, y - 1.4, 1.6, 1.4, 270, 90, P["ink"], LW_FACE)
        c.rect(x - 1.2, y - 2.2, 2.4, 0.9, fill=P["woodDk"])
    elif prop == "towel":
        c.rrect(x - 2.8, y - 1.4, 5.6, 6.0, r=1.2, fill=P["linen"], ink=P["ink"], lw=LW_FACE)
        c.line([(x - 1.8, y + 1.4), (x + 1.8, y + 1.4)], P["glassDk"], 0.8)
    elif prop == "wrench":
        c.line([(x, y - 1.2), (x + f * 4.6, y + 3.6)], P["metal"], 1.6)
        c.circle(x + f * 5.2, y + 4.0, 1.6, ink=P["metalDk"], lw=1.1)
    elif prop == "whistle":
        c.line([(x, y - 3.0), (x, y + 1.0)], P["gold"], 0.9)
        c.rrect(x - 1.6, y + 0.6, 3.2, 2.2, r=0.9, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    elif prop == "popcorn":
        c.rrect(x - 2.6, y - 1.0, 5.2, 5.4, r=0.8, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
        for dx, dy in ((-1.4, -1.6), (0.0, -2.2), (1.4, -1.6)):
            c.circle(x + dx, y + dy, 1.2, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)
    elif prop == "suitcase":
        c.rrect(x - 3.4, y + 0.4, 6.8, 5.2, r=1.0, fill=P["woodDk"], ink=P["ink"], lw=LW_FACE)
        c.arc(x, y + 0.6, 1.8, 1.6, 180, 360, P["ink"], LW_FACE)
        c.line([(x - 3.4, y + 2.6), (x + 3.4, y + 2.6)], P["gold"], 0.8)


def _draw_sleeper(c: Canvas, who: Person, ox, oy, expression="sleep"):
    """
    Asleep, seen from the same flat front as everything else.

    The figure lies down; the camera does not move. The renderer draws this
    over whatever bed the room has, so what the sprite owes the picture is the
    part a bed cannot supply: a head on a pillow, a quilt turned back at the
    shoulders, an arm resting on top, a bump where the feet are, and two Zs.
    That is the whole reading at thirty pixels tall, and it is the shorthand
    the reference uses.
    """
    head_r = 11.4
    quilt_h = 15.0
    quilt_top = FOOT_Y + oy - quilt_h - 1.0
    cy = quilt_top - 4.0
    hx = ox - 11.5

    c.contact_shadow(ox, FOOT_Y + oy - 0.6, 21.0, 2.8, a=0.12)
    # Pillow, propped up behind the head where a pillow actually is.
    c.rrect(hx - 12.0, cy - 8.4, 18.0, 13.4, r=5.6, fill=P["linen"], ink=P["ink"], lw=LW_DETAIL)
    # The body under the quilt: a hump, so the bedding has somebody in it.
    c.ellipse(ox + 3.0, quilt_top + 1.0, 13.0, 5.0, fill=who.top, ink=P["ink"], lw=LW_PROP)
    c.rrect(hx + 1.0, quilt_top, 29.0, quilt_h, r=4.6, fill=who.top, ink=P["ink"], lw=LW_PROP)
    # The sheet turned back over the quilt at the shoulders — white, because a
    # tinted band the same hue as the quilt disappears at 1x.
    c.rrect(hx + 1.4, quilt_top + 0.6, 8.4, quilt_h - 1.2, r=3.4,
            fill=P["linen"], ink=P["ink"], lw=LW_FACE)
    for dx in (15.0, 22.0):
        c.line([(hx + dx, quilt_top + 3.4), (hx + dx, quilt_top + quilt_h - 3.4)],
               alpha(shade(who.top, 0.34), 0.6), LW_DETAIL)
    # The feet, tenting the quilt at the far end. Drawn as a bump on the top
    # edge rather than an outlined shape, which at 1x reads as a hole.
    c.ellipse(hx + 25.0, quilt_top + 1.2, 4.2, 3.0, fill=tint(who.top, 0.26))
    # An arm resting on the sheet, so somebody is plainly in the bed.
    c.rrect(hx + 8.0, quilt_top + 1.8, 8.0, 3.6, r=1.8, fill=who.skin, ink=P["ink"], lw=LW_FACE)

    c.circle(hx, cy, head_r, fill=who.skin, ink=P["ink"], lw=LW_PROP)
    c.pie(hx, cy, head_r, head_r, 180, 360, fill=who.hair)
    c.ellipse(hx, cy - head_r * 0.16, head_r * 0.99, head_r * 0.40, fill=who.hair)
    c.ellipse(hx, cy - head_r * 0.02, head_r * 0.62, head_r * 0.26, fill=who.skin)
    c.arc(hx, cy, head_r, head_r, 180, 360, P["ink"], LW_FACE)
    _draw_face(c, who, hx, cy, head_r, expression)

    for i, (dx, dy, s) in enumerate(((6.0, -13.0, 1.0), (11.5, -19.0, 0.72))):
        zx, zy = ox + dx, cy + dy
        c.line([(zx - 2.2 * s, zy - 2.2 * s), (zx + 2.2 * s, zy - 2.2 * s),
                (zx - 2.2 * s, zy + 2.2 * s), (zx + 2.2 * s, zy + 2.2 * s)],
               alpha(P["ink2"], 0.9 - i * 0.25), 1.2 * s)


def soften(img: Image.Image, radius: float = 0.4) -> Image.Image:
    """A whisper of blur. Only for backgrounds that must not compete."""
    return img.filter(ImageFilter.GaussianBlur(radius))


__all__ = [
    "SS", "BLOCK_W", "BLOCK_H", "ASSET_ROOT", "P", "RoomSpec",
    "LW_FRAME", "LW_PROP", "LW_DETAIL", "LW_FACE",
    "CHAR_W", "CHAR_H", "FOOT_Y",
    "Canvas", "Person", "rgb", "mix", "shade", "tint", "alpha",
    "save_png", "both_tiers", "soften", "math",
    "room_shell", "room_frame", "window", "door", "wall_lamp", "pendant",
    "rug_strip", "plant_pot", "counter", "draw_person",
]
