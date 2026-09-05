"""
The pieces only the coin bedrooms sell: the economy, standard, double, family
and deluxe rooms, one wave each.

These are the rooms most of the hotel is made of, so what has to survive the
55% composite is the outline — that is all a bed or a lamp has left at 40px —
and every silhouette here is chosen against the rest of its category:

*   The **economy** room is a hostel: `bed_metalFrame` is the one bed with
    bare grey tube hoops at both ends and nothing under the mattress (the cot
    is mint and barred, the single has a plank board); `table_crateNightstand`
    is two lattice boxes stacked with a black brick on top, where every other
    table has legs; `lighting_ceilingFan` is the one fitting that is wider
    than it is tall — a flat T of blades, not a hanging drop.
*   The **standard** room is a painted cottage: `bed_paintedSpindle` is a
    sage rail on turned spindles under a patchwork quilt;
    `wallArt_bedsideSconce` is the one wall piece with no frame — a brass
    elbow, a cream thimble and a wedge of light; `lighting_paperLantern` is a
    single pale ball on a thread.
*   The **double** room is pale oak and brass: `bed_twinBrass` is straight
    gold posts with ball finials and open air under the rail, `bed_twinOak`
    two rounded slabs with mint bedding, `table_twinNightstand` a bedside
    tower with a lamp on it, and `luxury_chevalMirror` a tall tilted oval on
    two splayed legs.
*   The **family** room is a nursery: `bed_trundleBed` is the one bed with a
    second, lower mattress pulled out beside it — a two-step staircase;
    `seating_rockingHorse` is a horse on a crescent; `rug_roadPlaymat` is a
    picture map, not a weave; `lighting_balloonLantern` is a striped
    teardrop over a basket.
*   The **deluxe** room is a timber-and-textile loft: `bed_loftSleigh` is the
    one bed with a curl at *both* ends, and `lighting_loftRattan` the one
    lamp that is a wide bell with a criss-cross weave.

Anchors as everywhere: floor pieces and beds stand on the bottom edge with a
contact shadow, the pendants start their cord at y = 0, the rug lies in the
floor band and the sconce is centred on its wall canvas. Sizes come from
`c.w` / `c.h`.
"""
from __future__ import annotations

from PIL import ImageChops

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)
from decor_props import _stand, _legs, _bed_body, _pillow
from decor_surfaces import (
    _band, _cord, _ceiling_plate, _glow, GOLD, GOLD_DK, GOLD_HI,
)

#: Walnut is not in the palette: the darkest wood there is `woodDk`, which is
#: an orange oak. Pulling it toward the brown of `hairBrown` gives the cool
#: dark timber a sleigh bed is made of without inventing a hex.
WALNUT = mix(P["woodDk"], P["hairBrown"], 0.55)

#: A saturated teal, between the pool water and the plant green. `wallTeal`
#: is a pastel wall colour and vanished against a cream quilt.
TEAL = mix(P["waterDk"], P["greenDk"], 0.45)


# ------------------------------------------------------------------ the bed

def _sleigh_end(c: Canvas, curl_x: float, top: float, bottom: float,
                curl_r: float, out: int) -> None:
    """
    One end of a sleigh bed, seen edge-on: a thick board that leans outward as
    it rises and finishes in a full curl on its outer side.

    `out` is the direction the scroll rolls (-1 at the head, +1 at the foot).
    The board is a polygon rather than a rectangle so its outer edge can bow
    out and come back in at the base — that S in the outline is the whole
    read; a straight plank with a circle stuck on top looked like a lollipop.
    """
    def px(u: float) -> float:
        return curl_x + out * u

    neck = top + curl_r * 2 - 1.0
    board = [
        (px(-3.0), bottom), (px(0.5), bottom - 8.0), (px(2.2), neck + 10.0),
        (px(2.6), neck),
        (px(-6.4), neck), (px(-6.8), neck + 10.0), (px(-8.0), bottom - 8.0),
        (px(-11.0), bottom),
    ]
    c.poly(board, fill=WALNUT, ink=P["ink"], lw=LW_PROP)
    # One highlight sliver down the face, following the lean.
    c.line([(px(-1.6), bottom - 10.0), (px(-0.4), neck + 10.0), (px(0.0), neck + 3.0)],
           tint(WALNUT, 0.30), LW_DETAIL)
    # The curl: a full round with a smaller round inside it, which is the only
    # spiral this line weight can carry.
    cy = top + curl_r
    c.circle(curl_x, cy, curl_r, fill=WALNUT, ink=P["ink"], lw=LW_PROP)
    c.circle(curl_x, cy, curl_r * 0.50, fill=tint(WALNUT, 0.26), ink=P["ink"], lw=LW_FACE)
    c.arc(curl_x, cy, curl_r * 0.76, curl_r * 0.76, 195, 300, tint(WALNUT, 0.34), 1.0)


def bed_loftSleigh(c: Canvas) -> None:
    """
    A walnut sleigh bed: a scroll at each end, the head one taller, a cream
    quilt, two plump linen pillows and a teal cable-knit throw across the foot
    with its fringe hanging over the rail.

    The footboard is drawn *after* the bedding so it caps the foot end; at the
    head the board goes behind the mattress like every other headboard here.
    """
    cx = c.w / 2
    x0, x1 = cx - 50.0, cx + 50.0
    fy = _stand(c, cx, 51.0)
    _sleigh_end(c, x0 + 8.0, 6.0, fy - 7.0, 7.5, -1)
    # Walnut feet rather than the oak ones `_bed_body` would draw: a walnut
    # bed on orange feet reads as two pieces of furniture.
    _legs(c, (x0 + 19.0, x1 - 18.0), fy - 7.0, colour=WALNUT, w=5.0, r=1.8)
    mat_y = _bed_body(c, x0 + 13.0, x1 - 12.0, 38.0, quilt=P["creamHi"], base=WALNUT,
                      mat_h=9.0, leg_h=6.0, quilt_from=0.36, legs=False)
    _pillow(c, x0 + 28.0, mat_y - 4.5, 22.0, 12.0, colour=P["linen"])
    _pillow(c, x0 + 47.0, mat_y - 3.5, 20.0, 11.0, colour=P["white"])
    # The throw: taller than the quilt it lies on, so it reads as a layer
    # rather than as a patch of the quilt in another colour.
    tx, tw = x1 - 41.0, 22.0
    ty, th = mat_y - 4.6, 19.0
    c.rrect(tx, ty, tw, th, r=2.6, fill=TEAL, ink=P["ink"], lw=LW_PROP)
    c.line([(tx + 1.6, ty + 6.0), (tx + tw - 1.6, ty + 6.0)], shade(TEAL, 0.30), LW_DETAIL)
    # Cable knit: two braids of chevrons. At 55% a chevron is a dash, but two
    # columns of dashes on a plain block is still visibly a knit.
    knit = tint(TEAL, 0.38)
    for bx in (tx + 6.0, tx + tw - 6.0):
        for k in range(3):
            ky = ty + 8.4 + k * 3.4
            c.line([(bx - 2.2, ky + 1.6), (bx, ky), (bx + 2.2, ky + 1.6)], knit, 1.0)
    for i in range(7):
        fx = tx + 1.8 + i * (tw - 3.6) / 6
        c.line([(fx, ty + th - 0.6), (fx, ty + th + 3.4)], knit, 1.2)
    _sleigh_end(c, x1 - 7.0, 24.0, fy - 7.0, 6.5, 1)


# ----------------------------------------------------------------- the lamp

def lighting_loftRattan(c: Canvas) -> None:
    """
    An open-weave rattan bell on a knotted jute cord, flared at the mouth like
    an upturned basket, with an amber bulb showing through the lattice.

    The weave is drawn on its own canvas and masked to the bell, the way the
    wallpaper panels are: Pillow has no clip region, and a lattice stroked
    straight onto the shade spilled past its flare and out over the wall.
    """
    cx = c.w / 2
    drop = 11.0
    bell_h = 24.0
    mouth = drop + bell_h
    honey = P["wood"]
    tan = P["woodPale"]
    jute = mix(P["woodPale"], P["metalDk"], 0.30)

    _glow(c, cx, mouth + 5.0, 21.0, colour=P["cream"])
    _ceiling_plate(c, cx, 10.0, colour=P["wood"])
    _cord(c, cx, drop, colour=jute)
    for ky in (3.6, 7.6):
        c.circle(cx, ky, 1.6, fill=shade(jute, 0.18), ink=P["ink"], lw=LW_FACE)

    # The bell profile: narrow collar, straight-ish belly, then a flare that
    # widens fast near the mouth. The flare is what makes it a basket rather
    # than the cone two tiers below it.
    prof = ((0.0, 5.0), (0.20, 7.5), (0.45, 11.0), (0.68, 15.5), (0.86, 20.5), (1.0, 24.0))
    left = [(cx - hw, drop + t * bell_h) for t, hw in prof]
    right = [(cx + hw, drop + t * bell_h) for t, hw in prof]
    outline = left + right[::-1]

    weave = Canvas(c.w, c.h, tier=c.tier)
    weave.poly(outline, fill=honey)
    # The bulb seen through the gaps: a bright disc under the lattice, so the
    # weave reads as open rather than as a pattern printed on a solid shade.
    weave.circle(cx, drop + bell_h * 0.60, 8.0, fill=P["cream"])
    weave.circle(cx, drop + bell_h * 0.60, 4.0, fill=P["creamHi"])
    lat = shade(honey, 0.42)
    y0, y1 = drop - 2.0, mouth + 2.0
    for i in range(-7, 8):
        x = cx + i * 7.0
        weave.line([(x, y0), (x + (y1 - y0), y1)], lat, 1.3)
        weave.line([(x, y0), (x - (y1 - y0), y1)], lat, 1.3)
    # Solid rattan wraps at the collar and the mouth, in the paler tan.
    weave.rect(cx - 12.0, drop, 24.0, 4.0, fill=tan)
    weave.rect(cx - 30.0, mouth - 3.6, 60.0, 3.6, fill=tan)
    weave.line([(cx - 4.0, drop + 5.0), (cx - 9.0, drop + 12.0), (cx - 14.0, drop + 18.0)],
               tint(honey, 0.40), 1.2)
    mask = Canvas(c.w, c.h, tier=c.tier)
    mask.poly(outline, fill=(255, 255, 255, 255))
    weave.img.putalpha(ImageChops.multiply(weave.img.getchannel("A"), mask.img.getchannel("A")))
    c.img.alpha_composite(weave.img)
    c.poly(outline, ink=P["ink"], lw=LW_PROP)

    # The opening, seen from a little below, and the bulb hanging in it.
    c.ellipse(cx, mouth, 24.0, 3.2, fill=tint(tan, 0.30), ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx, mouth + 0.8, 3.8, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 1.2, mouth - 0.4, 1.2, fill=P["creamHi"])




# ================================================================ T O O L K I T
#
# The marks the coin bedrooms share and nothing else in the catalogue does:
# round metal tube, a slab with rounded top corners, a patchwork quilt and a
# rotated oval. Each exists so that two pieces drawn weeks apart — the hostel
# hoop bed and the brass twin, the spindle quilt and the trundle quilt — are
# the same drawing at two sizes.

#: Pale sage: the painted spindle bed's colour. `mintDk` is a nursery mint;
#: pulled toward the grey of `metalDk` it goes the dusty green of old paint.
SAGE = mix(P["mintDk"], P["metalDk"], 0.30)

#: Pale oak for the double room's twin set: `wood` is an orange hotel oak,
#: `woodPale` a bleached pine; halfway between is a light natural oak that is
#: still warmer than the lilac wall behind it.
OAK = mix(P["wood"], P["woodPale"], 0.45)

#: Grass, for the play mat. `green` is a plant green; toward `leaf` it is the
#: flat lawn of a printed mat rather than foliage.
GRASS = mix(P["green"], P["leaf"], 0.40)

#: Navy for the brass twin's stripe — the bar wall shaded a step so it stays
#: a strong blue against white bedding.
NAVY = shade(P["wallNavy"], 0.15)


def _tube(c: Canvas, pts, w: float, colour) -> None:
    """
    A round metal tube along a polyline.

    An ink stroke with the metal laid over it, rather than an outlined shape:
    `line` joins with rounded corners and caps, so one call carries a hoop
    round its bend with no seam, which a stack of rectangles never does.
    """
    c.line(pts, P["ink"], w + 2 * LW_DETAIL)
    c.line(pts, colour, w)


def _hoop(c: Canvas, x: float, top: float, w: float, bottom: float,
          tube: float, colour) -> None:
    """A tubular bed end: two uprights joined by a half-round top bar."""
    r = w / 2
    hx = x + r
    pts = [(x, bottom), (x, top + r)]
    for k in range(1, 12):
        a = math.pi + math.pi * k / 12
        pts.append((hx + math.cos(a) * r, top + r + math.sin(a) * r))
    pts += [(x + w, top + r), (x + w, bottom)]
    _tube(c, pts, tube, colour)
    # One highlight sliver up the left upright: the only modelling a tube gets.
    c.line([(x - 0.4, bottom - 6.0), (x - 0.4, top + r + 2.0)], tint(colour, 0.40), 0.9)


def _slab(c: Canvas, x: float, top: float, w: float, bottom: float, colour,
          r: float = 5.0) -> None:
    """
    A board with rounded top corners and a square bottom.

    Drawn as one polygon rather than a rounded rectangle, because a rounded
    rectangle rounds its bottom corners too and a footboard that stands on
    round feet of its own colour reads as a loaf.
    """
    pts = [(x, bottom), (x, top + r)]
    for k in range(1, 6):
        a = math.pi + (math.pi / 2) * k / 6
        pts.append((x + r + math.cos(a) * r, top + r + math.sin(a) * r))
    pts.append((x + r, top))
    pts.append((x + w - r, top))
    for k in range(1, 6):
        a = 1.5 * math.pi + (math.pi / 2) * k / 6
        pts.append((x + w - r + math.cos(a) * r, top + r + math.sin(a) * r))
    pts += [(x + w, top + r), (x + w, bottom)]
    c.poly(pts, fill=colour, ink=P["ink"], lw=LW_PROP)


def _patchwork(c: Canvas, x: float, y: float, w: float, h: float, colours,
               s: float = 4.8) -> None:
    """
    A quilt of squares, laid so the cells tile the rectangle exactly.

    Three colours on a grid always fall into diagonals if the rows shift by
    a constant, so the rows follow a Latin-square offset instead; that is what
    makes it read as patchwork rather than as a striped mattress. Seams are
    in shadow linen, not ink — a black grid over a quilt is a cage.
    """
    cols = max(1, int(round(w / s)))
    rows = max(1, int(round(h / s)))
    cw, ch = w / cols, h / rows
    offsets = (0, 2, 1)
    n = len(colours)
    for r in range(rows):
        for k in range(cols):
            col = colours[(k + offsets[r % 3]) % n]
            c.rect(x + k * cw, y + r * ch, cw + 0.4, ch + 0.4, fill=col)
    for k in range(1, cols):
        c.line([(x + k * cw, y), (x + k * cw, y + h)], P["linenSh"], 0.8)
    for r in range(1, rows):
        c.line([(x, y + r * ch), (x + w, y + r * ch)], P["linenSh"], 0.8)


def _oval(cx: float, cy: float, rx: float, ry: float, ang: float, n: int = 40):
    """The points of an ellipse rotated by `ang` — Pillow cannot tilt one."""
    ca, sa = math.cos(ang), math.sin(ang)
    pts = []
    for i in range(n):
        t = 2 * math.pi * i / n
        x, y = rx * math.cos(t), ry * math.sin(t)
        pts.append((cx + x * ca - y * sa, cy + x * sa + y * ca))
    return pts


def _ticking(c: Canvas, x: float, y: float, w: float, h: float, stripe,
             pitch: float = 5.0) -> None:
    """A thin mattress in ticking: white with narrow stripes at a coarse pitch."""
    c.rrect(x, y, w, h, r=2.4, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    sx = x + 3.2
    while sx < x + w - 3.6:
        c.rect(sx, y + 1.3, 1.8, h - 2.6, fill=stripe)
        sx += pitch


# ================================================================ E C O N O M Y

def bed_metalFrame(c: Canvas) -> None:
    """
    A hostel single on a tubular grey-steel frame: a tall hoop at the head, a
    lower hoop at the foot, a side rail between them and nothing underneath —
    a thin ticking mattress, one flat pillow and a grey blanket over the foot.

    The hoops are the whole read. Every other bed has a board or a divan
    under the mattress; this one is bare tube from the rail to the floor, so
    at 40px it is two arches with a stripe of bedding between.
    """
    cx = c.w / 2
    x0, x1 = cx - 43.0, cx + 43.0
    fy = _stand(c, cx, 44.0)
    steel = P["metalDk"]
    tube = 3.0
    hoop_w = 12.0
    rail_y = fy - 14.0
    mat_h = 8.0
    mat_y = rail_y - mat_h - 0.6
    blanket = mix(P["metal"], P["concrete"], 0.50)

    # The rail and the bedding go first; the hoops stand in front at the ends.
    _tube(c, [(x0 + 6.0, rail_y), (x1 - 6.0, rail_y)], tube, steel)
    _ticking(c, x0 + hoop_w + 1.0, mat_y, (x1 - x0) - 2 * hoop_w - 2.0, mat_h, P["roomBlue"])
    _pillow(c, x0 + 26.0, mat_y - 2.4, 20.0, 6.4)
    # A folded blanket across the foot: taller than the mattress it lies on,
    # with the fold drawn as its own lighter band, so it reads as cloth.
    bx, bw = x1 - hoop_w - 24.0, 21.0
    by, bh = mat_y - 4.0, mat_h + 5.2
    c.rrect(bx, by, bw, bh, r=2.4, fill=blanket, ink=P["ink"], lw=LW_PROP)
    c.rrect(bx, by, bw, 4.6, r=2.4, fill=tint(blanket, 0.24), ink=P["ink"], lw=LW_FACE)
    c.line([(bx + 2.0, by + bh - 3.4), (bx + bw - 2.0, by + bh - 3.4)], shade(blanket, 0.30), LW_FACE)

    _hoop(c, x0 + 1.5, 12.0, hoop_w, fy - 1.6, tube, steel)
    _hoop(c, x1 - hoop_w - 1.5, 30.0, hoop_w, fy - 1.6, tube, steel)
    # A cross bar in each hoop at mattress height, so the frame holds the bed
    # rather than standing beside it.
    for hx in (x0 + 1.5, x1 - hoop_w - 1.5):
        _tube(c, [(hx, rail_y), (hx + hoop_w, rail_y)], tube * 0.8, steel)


def _crate(c: Canvas, x: float, y: float, w: float, h: float, colour,
           book: bool = False) -> None:
    """
    One milk crate seen face-on: a plastic box with two rows of square holes.

    The holes are dark squares of the crate's own colour, not ink — nine ink
    squares on a blue box is a keypad. When `book` is set the left holes show
    a paperback through them, cover and page edge, which is all "something is
    kept in it" needs.
    """
    c.rrect(x, y, w, h, r=1.8, fill=colour, ink=P["ink"], lw=LW_PROP)
    c.rect(x + 1.8, y + 1.4, w - 3.6, 1.4, fill=tint(colour, 0.30))
    hole = shade(colour, 0.55)
    s, pitch = 3.4, 5.6
    cols = int((w - 5.0) // pitch)
    ox = x + (w - ((cols - 1) * pitch + s)) / 2
    for r in range(2):
        for k in range(cols):
            hx, hy = ox + k * pitch, y + 4.6 + r * pitch
            fill = hole
            if book and k < 2:
                fill = P["coral"] if r == 0 else P["creamHi"]
            c.rect(hx, hy, s, s, fill=fill)


def table_crateNightstand(c: Canvas) -> None:
    """
    Two plastic milk crates stacked as a bedside table — blue on red — with a
    black clock radio on top and a paperback showing through the upper one.

    No legs, no top, no drawer: a stack of two bright boxes with a black
    brick on it, which nothing else in the table category is.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 18.0)
    cw, ch = 32.0, 17.0
    x = cx - cw / 2
    _crate(c, x, fy - ch, cw, ch, P["coral"])
    _crate(c, x, fy - 2 * ch, cw, ch, P["roomBlue"], book=True)
    # The clock radio: a squat black box with three red digits and a dial.
    rw, rh = 18.0, 7.4
    rx, ry = cx - rw / 2, fy - 2 * ch - rh + 0.6
    c.rrect(rx, ry, rw, rh, r=1.6, fill=P["black"], ink=P["ink"], lw=LW_PROP)
    c.rect(rx + 1.8, ry + 1.4, rw - 3.6, 1.2, fill=tint(P["black"], 0.25))
    for k in range(3):
        c.rect(rx + 3.0 + k * 3.4, ry + 3.0, 2.2, 2.4, fill=P["coral"])
    c.circle(rx + rw - 3.6, ry + rh / 2 + 0.4, 1.5, fill=P["metal"], ink=P["ink"], lw=LW_FACE)


def lighting_ceilingFan(c: Canvas) -> None:
    """
    A ceiling fan: a short dark rod to a round cream motor, three pine blades
    reaching almost to the canvas sides, a warm bulb under the hub and a
    pull-chain.

    The outer two blades are seen from below as tapered paddles and the
    middle one edge-on as a bar, so the silhouette is a flat T — the only
    lighting piece that is wider than it is tall.
    """
    cx = c.w / 2
    drop = 8.0
    hy = drop + 6.0
    pine = P["woodPale"]
    dark = P["black"]
    reach = c.w / 2 - 3.0

    _glow(c, cx, hy + 13.0, 15.0)
    _ceiling_plate(c, cx, 12.0, colour=dark)
    c.rrect(cx - 1.6, 0.0, 3.2, drop + 2.0, r=1.0, fill=dark, ink=P["ink"], lw=LW_FACE)
    # The paddles: wider at the tip than at the root, and lifted a little at
    # the tip, which is how a blade looks from under it.
    for side in (-1, 1):
        root, tip = cx + side * 7.0, cx + side * reach
        c.poly([(root, hy - 1.6), (tip, hy - 5.4), (tip, hy + 0.4), (root, hy + 2.6)],
               fill=pine, ink=P["ink"], lw=LW_PROP)
        c.line([(cx + side * 9.0, hy + 1.0), (cx + side * (reach - 2.0), hy - 1.2)],
               shade(pine, 0.36), LW_DETAIL)
    # The near blade, edge-on: a thin bar toward the viewer.
    c.rrect(cx - 11.0, hy + 2.4, 22.0, 3.0, r=1.4, fill=shade(pine, 0.22),
            ink=P["ink"], lw=LW_DETAIL)
    # The motor: a cream drum, then the light kit under it.
    c.ellipse(cx, hy, 9.0, 5.6, fill=P["cream"], ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx - 2.6, hy - 2.2, 3.2, 1.3, fill=P["creamHi"])
    c.rrect(cx - 4.0, hy + 4.4, 8.0, 3.2, r=1.2, fill=shade(P["cream"], 0.18),
            ink=P["ink"], lw=LW_FACE)
    c.circle(cx, hy + 9.6, 3.4, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 1.0, hy + 8.6, 1.0, fill=P["creamHi"])
    # The pull-chain, with a bead on its end.
    c.line([(cx + 6.4, hy + 4.0), (cx + 7.2, hy + 12.0)], P["ink2"], 0.9)
    c.circle(cx + 7.3, hy + 13.0, 1.3, fill=P["metal"], ink=P["ink"], lw=LW_FACE)


# =============================================================== S T A N D A R D

def _spindle_end(c: Canvas, x: float, w: float, top: float, bottom: float,
                 n: int, colour) -> None:
    """
    A bed end of turned spindles: two posts with knobs, a rounded rail, and
    `n` slim spindles between with a bead on each.

    The spindles are thin and the rail is thick, so at 55% the end reads as
    a rail on posts with texture under it rather than as a barred cot.
    """
    for px in (x + 2.0, x + w - 2.0):
        c.rrect(px - 2.0, top - 1.0, 4.0, bottom - top + 1.0, r=1.6, fill=colour,
                ink=P["ink"], lw=LW_DETAIL)
        c.circle(px, top - 1.6, 2.5, fill=colour, ink=P["ink"], lw=LW_FACE)
    for k in range(n):
        sx = x + 5.4 + (w - 10.8) * k / max(1, n - 1)
        c.rrect(sx - 1.1, top + 4.0, 2.2, bottom - top - 4.0, r=1.0, fill=colour,
                ink=P["ink"], lw=LW_FACE)
        c.circle(sx, top + 4.0 + (bottom - top - 4.0) * 0.38, 1.8, fill=colour,
                 ink=P["ink"], lw=LW_FACE)
    c.rrect(x, top, w, 4.6, r=2.3, fill=tint(colour, 0.14), ink=P["ink"], lw=LW_PROP)
    c.line([(x + 3.0, top + 1.5), (x + w - 3.0, top + 1.5)], tint(colour, 0.42), 0.9)


def bed_paintedSpindle(c: Canvas) -> None:
    """
    A compact single in pale sage paint: a rounded head rail on four turned
    spindles, a lower foot rail on three, and a patchwork quilt of coral,
    lavender and mint squares over a cream sheet with one white pillow.

    Spindles and patchwork are the two marks no other bed carries; the sage
    keeps it apart from the mint cot on the same wall.
    """
    cx = c.w / 2
    x0, x1 = cx - 41.0, cx + 41.0
    fy = _stand(c, cx, 42.0)
    head_w, foot_w = 20.0, 16.0
    _spindle_end(c, x0, head_w, 14.0, fy, 4, SAGE)
    mat_y = _bed_body(c, x0 + head_w - 6.0, x1 - foot_w + 6.0, 40.0, quilt=P["creamHi"],
                      base=SAGE, mat_h=8.0, leg_h=6.0, quilt_from=0.36, legs=False)
    bx0, bx1 = x0 + head_w - 6.0, x1 - foot_w + 6.0
    qx = bx0 + (bx1 - bx0) * 0.36
    _patchwork(c, qx + 1.4, mat_y + 1.2, bx1 - qx - 2.8, 8.0 + 4.6 - 2.6,
               (P["coral"], P["lavender"], P["mint"]))
    _pillow(c, x0 + 28.0, mat_y - 3.8, 19.0, 9.0)
    _spindle_end(c, x1 - foot_w, foot_w, 30.0, fy, 3, SAGE)


def wallArt_bedsideSconce(c: Canvas) -> None:
    """
    A wall-mounted reading lamp: a round brass backplate, a jointed swing-arm
    up and out to a pleated cream drum shade tilted toward the pillow, and a
    fan of warm light on the wall under it.

    No frame, on purpose. Every other wall piece is a rectangle of some kind;
    this one is a thimble on an elbow with a wedge of light beneath, and the
    wedge is what fills the canvas the frame would have.
    """
    cx, cy = c.w / 2, c.h / 2
    plate = (cx - 15.0, cy - 12.0)
    elbow = (cx - 4.0, cy - 25.0)
    tilt = math.radians(24.0)
    # The drum's axis points down and to the left, toward the bed.
    dx, dy = -math.sin(tilt), math.cos(tilt)
    px, py = math.cos(tilt), math.sin(tilt)
    sc = (cx + 8.0, cy - 15.0)
    half_w, half_h = 10.0, 7.0

    # The fan of light: three nested wedges from the mouth of the shade, at
    # the low opacities `_glow` uses, aimed a little left of straight down.
    ax, ay = sc[0] + dx * (half_h + 1.0), sc[1] + dy * (half_h + 1.0)
    for r, a in ((42.0, 0.08), (32.0, 0.09), (22.0, 0.11)):
        c.pie(ax, ay, r, r, 50, 152, fill=alpha(P["creamHi"], a))

    # The backplate and the arm.
    c.circle(plate[0], plate[1], 8.5, fill=GOLD, ink=P["ink"], lw=LW_PROP)
    c.circle(plate[0], plate[1], 5.0, fill=tint(GOLD, 0.28), ink=P["ink"], lw=LW_FACE)
    c.circle(plate[0] - 3.4, plate[1] - 3.4, 1.4, fill=GOLD_HI)
    top = (sc[0] - dx * half_h, sc[1] - dy * half_h)
    _tube(c, [plate, elbow, top], 2.8, GOLD)
    for jx, jy in (plate, elbow):
        c.circle(jx, jy, 2.4, fill=GOLD_DK, ink=P["ink"], lw=LW_FACE)

    # The drum: a rotated rectangle with pleat lines along its axis, a dark
    # cap at the top and a lit mouth at the bottom.
    corners = [(sc[0] + px * half_w * s + dx * half_h * t, sc[1] + py * half_w * s + dy * half_h * t)
               for s, t in ((-1, -1), (1, -1), (1, 1), (-1, 1))]
    c.poly(corners, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    for k in range(-2, 3):
        u = k * 3.6
        c.line([(sc[0] + px * u - dx * (half_h - 1.4), sc[1] + py * u - dy * (half_h - 1.4)),
                (sc[0] + px * u + dx * (half_h - 1.4), sc[1] + py * u + dy * (half_h - 1.4))],
               P["linenSh"], 0.9)
    c.poly(_oval(sc[0] - dx * half_h, sc[1] - dy * half_h, half_w, 2.4, tilt),
           fill=shade(P["linen"], 0.20), ink=P["ink"], lw=LW_FACE)
    c.poly(_oval(sc[0] + dx * half_h, sc[1] + dy * half_h, half_w, 2.6, tilt),
           fill=P["cream"], ink=P["ink"], lw=LW_FACE)
    c.poly(_oval(sc[0] + dx * half_h, sc[1] + dy * half_h, 3.2, 1.3, tilt), fill=P["creamHi"])


def lighting_paperLantern(c: Canvas) -> None:
    """
    A rice-paper globe nearly as wide as the canvas: cream, ribbed, with a
    warmer centre where the bulb sits, on a short black cord from a small
    white cup, glowing all round.

    One pale ball on a thread. The bulb is a small drop, the lamp a cone and
    every pendant a dome; a plain sphere this size is nothing else.
    """
    cx = c.w / 2
    drop = 7.0
    r = 19.0
    gy = drop + r
    paper = P["linen"]

    _glow(c, cx, gy + 2.0, 22.0)
    _ceiling_plate(c, cx, 10.0, colour=P["white"])
    _cord(c, cx, drop, colour=P["ink2"])
    c.circle(cx, gy, r, fill=paper, ink=P["ink"], lw=LW_PROP)
    # The bulb through the paper: a warm oval, then the bulb itself.
    c.ellipse(cx, gy + 1.0, 8.5, 10.5, fill=P["cream"])
    c.ellipse(cx, gy + 0.4, 3.6, 4.6, fill=P["creamHi"])
    # The ribs: chords at latitude, in shadow linen. Five, not fifteen.
    for k in (-2, -1, 0, 1, 2):
        ry = gy + k * 6.2
        hw = math.sqrt(max(0.0, r * r - (ry - gy) ** 2)) - 1.4
        c.line([(cx - hw, ry), (cx + hw, ry)], P["linenSh"], 0.9)
    c.arc(cx, gy, r - 3.0, r - 3.0, 200, 250, P["white"], 1.4)
    # The wire collars at the poles, so the paper hangs from something.
    c.ellipse(cx, gy - r + 0.6, 3.6, 1.6, fill=P["black"], ink=P["ink"], lw=LW_FACE)
    c.ellipse(cx, gy + r - 0.6, 3.6, 1.6, fill=P["black"], ink=P["ink"], lw=LW_FACE)


# ================================================================= D O U B L E

def bed_twinBrass(c: Canvas) -> None:
    """
    A twin on a brass tube frame: two tall head posts with ball finials and
    two rails between them, a lower gate at the foot, a white quilt with a
    navy band folded across the foot, one pillow, and open air under the rail.

    Straight posts with balls, in gold — the hostel bed's hoops are grey and
    round-topped, and every wooden bed has a board.
    """
    cx = c.w / 2
    x0, x1 = cx - 41.0, cx + 41.0
    fy = _stand(c, cx, 42.0)
    tube = 3.2
    end_w = 12.0
    rail_y = fy - 14.0
    mat_h = 8.0
    mat_y = rail_y - mat_h - 0.6
    bx0, bx1 = x0 + end_w + 1.0, x1 - end_w - 1.0

    _tube(c, [(x0 + 6.0, rail_y), (x1 - 6.0, rail_y)], tube, GOLD)
    c.rrect(bx0, mat_y, bx1 - bx0, mat_h, r=2.8, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.line([(bx0 + 3.0, mat_y + mat_h * 0.62), (bx1 - 3.0, mat_y + mat_h * 0.62)],
           P["linenSh"], LW_DETAIL)
    qx = bx0 + (bx1 - bx0) * 0.36
    c.rrect(qx, mat_y - 3.6, bx1 - qx, mat_h + 7.6, r=3.4, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    # The turned-down edge, in shadow linen: over a white quilt the linen
    # fold `_bed_body` draws would vanish.
    c.rrect(qx + 0.6, mat_y - 3.2, bx1 - qx - 1.2, 3.8, r=1.8, fill=P["linenSh"],
            ink=P["ink"], lw=LW_FACE)
    # The navy band across the foot, with its fold as a lighter strip.
    nx, nw = bx1 - 19.0, 15.0
    c.rrect(nx, mat_y - 3.4, nw, mat_h + 7.2, r=2.2, fill=NAVY, ink=P["ink"], lw=LW_DETAIL)
    c.rrect(nx, mat_y - 3.4, nw, 4.4, r=2.2, fill=tint(NAVY, 0.18), ink=P["ink"], lw=LW_FACE)
    _pillow(c, bx0 + 12.0, mat_y - 3.6, 19.0, 9.0)

    # The ends, in front: posts to the floor with ball finials, rails between.
    for hx, top, rails in ((x0 + 2.0, 9.0, (12.5, 24.0)), (x1 - end_w - 2.0, 31.0, (34.5,))):
        for ry in rails:
            _tube(c, [(hx, ry), (hx + end_w, ry)], tube * 0.8, GOLD)
        if len(rails) == 2:
            for k in (1, 2):
                sx = hx + end_w * k / 3
                c.line([(sx, rails[0]), (sx, rails[1])], P["ink"], 2.6)
                c.line([(sx, rails[0]), (sx, rails[1])], GOLD_DK, 1.2)
        _tube(c, [(hx, rail_y), (hx + end_w, rail_y)], tube * 0.8, GOLD)
        for px in (hx, hx + end_w):
            _tube(c, [(px, top), (px, fy - 1.6)], tube, GOLD)
            c.line([(px - 0.5, top + 4.0), (px - 0.5, fy - 8.0)], GOLD_HI, 0.8)
            c.circle(px, top - 1.4, 2.9, fill=GOLD, ink=P["ink"], lw=LW_FACE)
            c.circle(px - 0.9, top - 2.3, 0.9, fill=GOLD_HI)


def bed_twinOak(c: Canvas) -> None:
    """
    A twin with a plain oak slab headboard, a lower slab footboard, both with
    rounded top corners, a mint quilt and two cream pillows.

    Two slabs and mint: the single next to it on the ladder is one plank and
    blue, and the brass twin beside it in the room has no board at all.
    """
    cx = c.w / 2
    x0, x1 = cx - 42.0, cx + 42.0
    fy = _stand(c, cx, 43.0)
    head_w, foot_w = 16.0, 12.0
    _slab(c, x0, 13.0, head_w, fy - 5.0, OAK, r=5.0)
    c.line([(x0 + 3.2, 17.0), (x0 + 3.2, 34.0)], tint(OAK, 0.34), LW_DETAIL)
    c.line([(x0 + head_w - 4.0, 20.0), (x0 + head_w - 4.0, 30.0)], shade(OAK, 0.22), 0.9)
    mat_y = _bed_body(c, x0 + head_w - 6.0, x1 - foot_w + 5.0, 41.0, quilt=P["mint"],
                      base=OAK, mat_h=8.0, leg_h=6.0, quilt_from=0.40)
    _pillow(c, x0 + 26.0, mat_y - 4.0, 19.0, 9.6, colour=P["cream"])
    _pillow(c, x0 + 42.0, mat_y - 3.2, 17.0, 8.8, colour=P["creamHi"])
    _slab(c, x1 - foot_w, 31.0, foot_w, fy - 5.0, OAK, r=4.4)
    c.line([(x1 - foot_w + 3.0, 34.5), (x1 - foot_w + 3.0, 46.0)], tint(OAK, 0.34), LW_DETAIL)


def table_twinNightstand(c: Canvas) -> None:
    """
    A narrow two-drawer chest in pale oak with a small brass lamp on top under
    a cream shade.

    Taller than it is wide: the chest is a tower and the lamp adds another
    third to it, where the side table is a disc on a stick and the desk is a
    slab across the canvas.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 17.0)
    bw, bh = 28.0, 29.0
    bx, by = cx - bw / 2, fy - bh
    _legs(c, (cx - 10.0, cx + 10.0), fy - 5.0, colour=P["woodDk"], w=4.0)
    c.rrect(bx, by, bw, bh - 3.0, r=2.4, fill=OAK, ink=P["ink"], lw=LW_PROP)
    c.rrect(bx - 1.6, by - 2.2, bw + 3.2, 4.2, r=1.6, fill=tint(OAK, 0.10), ink=P["ink"], lw=LW_PROP)
    c.rect(bx, by - 1.0, bw, 1.2, fill=tint(OAK, 0.36))
    for k in range(2):
        dy = by + 4.0 + k * 10.6
        c.rrect(bx + 2.6, dy, bw - 5.2, 9.0, r=1.4, fill=tint(OAK, 0.16), ink=P["ink"], lw=LW_FACE)
        c.circle(cx, dy + 4.5, 1.6, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    # The lamp: a brass ball on a foot, a stem, and a cream shade with one
    # cel facet on its left.
    top = by - 2.2
    c.ellipse(cx, top - 1.2, 5.0, 1.8, fill=GOLD_DK, ink=P["ink"], lw=LW_FACE)
    c.circle(cx, top - 6.6, 4.6, fill=GOLD, ink=P["ink"], lw=LW_PROP)
    c.circle(cx - 1.6, top - 8.0, 1.4, fill=GOLD_HI)
    c.rrect(cx - 1.1, top - 15.0, 2.2, 5.0, r=0.8, fill=GOLD_DK, ink=P["ink"], lw=LW_FACE)
    sy = top - 25.0
    c.poly([(cx - 10.0, sy + 11.0), (cx + 10.0, sy + 11.0), (cx + 6.4, sy), (cx - 6.4, sy)],
           fill=P["creamHi"], ink=P["ink"], lw=LW_PROP)
    c.poly([(cx - 8.6, sy + 9.8), (cx - 3.6, sy + 9.8), (cx - 1.4, sy + 1.2), (cx - 5.2, sy + 1.2)],
           fill=P["cream"])
    c.ellipse(cx, sy + 11.0, 10.0, 2.0, fill=P["white"], ink=P["ink"], lw=LW_FACE)


def luxury_chevalMirror(c: Canvas) -> None:
    """
    A tall oval cheval mirror in a walnut frame, pivoted between two splayed
    walnut legs and tilted a little, its glass pale blue with one diagonal
    highlight.

    The oval is the outline: the mirror is the only luxury piece that is a
    tall ellipse on two sticks, and the tilt is what makes it a cheval rather
    than a wall mirror that has fallen to the floor.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 20.0)
    walnut = mix(P["woodDk"], P["hairBrown"], 0.55)
    pivot_y = fy - 34.0
    ang = math.radians(-7.0)
    for side in (-1, 1):
        c.poly([(cx + side * 15.0 - 2.1, pivot_y - 1.0), (cx + side * 15.0 + 2.1, pivot_y - 1.0),
                (cx + side * 21.0 + 2.3, fy), (cx + side * 21.0 - 2.3, fy)],
               fill=walnut, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - 19.0, fy - 8.0, 38.0, 3.4, r=1.4, fill=walnut, ink=P["ink"], lw=LW_DETAIL)
    c.poly(_oval(cx, pivot_y, 16.0, 27.0, ang), fill=walnut, ink=P["ink"], lw=LW_PROP)
    c.poly(_oval(cx, pivot_y, 12.4, 23.4, ang), fill=P["glass"], ink=P["ink"], lw=LW_FACE)
    c.line([(cx - 6.0, pivot_y + 10.0), (cx + 5.0, pivot_y - 12.0)], P["white"], 1.6)
    c.line([(cx - 2.0, pivot_y + 13.0), (cx + 1.0, pivot_y + 7.0)], P["white"], 1.0)
    # The frame's own highlight: an arc up its upper-left inside.
    c.arc(cx + 1.0, pivot_y, 14.4, 25.4, 200, 260, tint(walnut, 0.36), 1.1)
    for side in (-1, 1):
        c.circle(cx + side * 16.2, pivot_y - 0.6, 2.7, fill=GOLD, ink=P["ink"], lw=LW_FACE)


# ================================================================= F A M I L Y

def bed_trundleBed(c: Canvas) -> None:
    """
    A pale-wood single with a rounded mint headboard and a red-blue-yellow
    patchwork quilt, and under its foot a drawer pulled out with a second,
    lower mattress and its own small pillow on it.

    The read is the step: a tall bed and a low bed side by side in one
    sprite, which no other bed has. The main bed stands on long legs so the
    drawer has room to come out from under it.
    """
    cx = c.w / 2
    x0, x1 = cx - 50.0, cx + 50.0
    fy = _stand(c, cx, 51.0)
    pale = P["woodPale"]
    leg = mix(P["woodPale"], P["woodDk"], 0.45)
    main_x1 = x0 + 66.0
    leg_h = 13.0

    c.rrect(x0, 15.0, 13.0, fy - 5.0 - 15.0, r=6.0, fill=P["mint"], ink=P["ink"], lw=LW_PROP)
    c.rrect(x0 + 2.8, 18.4, 7.4, 12.0, r=3.2, fill=tint(P["mint"], 0.34))
    mat_y = _bed_body(c, x0 + 8.0, main_x1, 34.0, quilt=P["creamHi"], base=pale,
                      mat_h=8.0, leg_h=leg_h, quilt_from=0.34, legs=False)
    qx = x0 + 8.0 + (main_x1 - x0 - 8.0) * 0.34
    _patchwork(c, qx + 1.4, mat_y + 1.2, main_x1 - qx - 2.8, 8.0 + 4.6 - 2.6,
               (P["coral"], P["roomBlue"], P["gold"]))
    _pillow(c, x0 + 24.0, mat_y - 3.8, 19.0, 9.0)

    # The trundle: a drawer box on the floor with a thin mattress and a small
    # pillow, its left end tucked under the bed's foot.
    tx0, ty = cx + 4.0, fy - 12.0
    c.rrect(tx0, ty, x1 - tx0, 12.0, r=2.0, fill=pale, ink=P["ink"], lw=LW_PROP)
    c.rect(tx0 + 2.0, ty + 1.6, x1 - tx0 - 4.0, 1.4, fill=tint(pale, 0.34))
    c.rrect(x1 - 9.0, ty + 5.0, 5.0, 2.2, r=1.0, fill=P["ink2"])
    c.rrect(tx0 + 1.0, ty - 6.4, x1 - tx0 - 2.0, 7.0, r=2.6, fill=P["linen"], ink=P["ink"], lw=LW_PROP)
    c.line([(tx0 + 4.0, ty - 2.2), (x1 - 4.0, ty - 2.2)], P["linenSh"], LW_DETAIL)
    c.rrect(tx0 + 3.0, ty - 4.8, 18.0, 5.6, r=1.8, fill=P["roomBlue"], ink=P["ink"], lw=LW_FACE)
    _pillow(c, x1 - 11.0, ty - 8.6, 13.0, 6.2)

    _legs(c, (x0 + 13.0, main_x1 - 5.0), fy - leg_h, colour=leg, w=5.0, r=1.8)


def seating_rockingHorse(c: Canvas) -> None:
    """
    A dapple-grey wooden horse side-on, head to the left, red saddle, yellow
    mane, on two bow rockers joined by a footrest.

    A horse on a crescent: the one seat with an animal in its outline and a
    curve where every chair, stool and bench has legs.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 32.0)
    grey = mix(P["metal"], P["white"], 0.22)
    wood = P["wood"]
    half = 31.0
    big_r = 70.0

    def bow(lift: float, colour) -> None:
        pts = []
        for k in range(21):
            t = -1.0 + 2.0 * k / 20
            x = t * half
            pts.append((cx + x, fy - 2.3 - lift - (big_r - math.sqrt(big_r * big_r - x * x))))
        _tube(c, pts, 3.4, colour)

    bow(2.6, shade(wood, 0.30))
    # Legs, far pair first, standing on the rocker.
    for lx, col in ((cx - 9.0, shade(grey, 0.18)), (cx + 9.0, shade(grey, 0.18)),
                    (cx - 13.0, grey), (cx + 13.0, grey)):
        c.rrect(lx - 2.0, fy - 30.0, 4.0, 26.6, r=1.6, fill=col, ink=P["ink"], lw=LW_DETAIL)
    c.rrect(cx - 12.0, fy - 15.0, 24.0, 3.0, r=1.4, fill=wood, ink=P["ink"], lw=LW_DETAIL)
    bow(0.0, wood)

    # The body and its dapples, the neck up to the head at the left.
    c.ellipse(cx + 2.0, fy - 33.0, 16.5, 9.0, fill=grey, ink=P["ink"], lw=LW_PROP)
    c.poly([(cx - 17.0, fy - 51.0), (cx - 9.0, fy - 54.0), (cx - 2.0, fy - 37.0), (cx - 14.0, fy - 31.0)],
           fill=grey, ink=P["ink"], lw=LW_PROP)
    for dx, dy in ((-6.0, -35.0), (6.0, -30.0), (12.0, -36.0), (-9.0, -44.0)):
        c.circle(cx + dx, fy + dy, 1.9, fill=P["white"])
    c.rrect(cx - 32.0, fy - 58.0, 18.0, 9.0, r=4.0, fill=grey, ink=P["ink"], lw=LW_PROP)
    c.poly([(cx - 20.0, fy - 57.0), (cx - 17.0, fy - 63.0), (cx - 14.5, fy - 56.5)],
           fill=grey, ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 24.0, fy - 55.0, 1.2, fill=P["ink"])
    c.circle(cx - 29.6, fy - 51.8, 0.9, fill=shade(grey, 0.40))
    # The mane: three gold scallops down the back of the neck, and the tail.
    for k, (mx, my) in enumerate(((cx - 13.0, fy - 58.0), (cx - 9.5, fy - 52.5), (cx - 6.0, fy - 47.0))):
        c.circle(mx, my, 3.2 - k * 0.3, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    _tube(c, [(cx + 17.5, fy - 36.0), (cx + 22.0, fy - 30.0), (cx + 21.0, fy - 24.0)], 3.0, GOLD)
    # The saddle, with a girth so it is strapped on rather than laid on.
    c.line([(cx + 3.0, fy - 38.0), (cx + 3.0, fy - 26.0)], P["coral"], 1.6)
    c.rrect(cx - 4.0, fy - 45.0, 15.0, 7.4, r=3.4, fill=P["coral"], ink=P["ink"], lw=LW_PROP)
    c.rect(cx - 1.0, fy - 43.6, 9.0, 1.4, fill=tint(P["coral"], 0.34))


def rug_roadPlaymat(c: Canvas) -> None:
    """
    A grass-green play mat printed with a grey road loop, a pond, two houses,
    a round tree and two toy cars parked on the road.

    A picture, not a weave: the grey loop on green is the read, where every
    other rug is a border, a medallion or a stripe.
    """
    x, y, w, h = _band(c, 22.0, GRASS, r=2.0, w=64.0)
    cy = y + h / 2
    road = P["road"]
    # The loop: a stroked rounded rectangle, then dashes down its long sides.
    c.rrect(x + 7.0, y + 4.0, w - 14.0, h - 8.0, r=6.0, ink=road, lw=4.4)
    for ry in (y + 4.0, y + h - 4.0):
        for k in range(6):
            dx = x + 16.0 + k * 6.6
            c.line([(dx, ry), (dx + 2.6, ry)], P["roadLine"], 0.9)
    # The pond, the houses and the tree inside the loop.
    c.ellipse(x + 19.0, cy, 5.2, 3.0, fill=P["water"], ink=shade(P["water"], 0.35), lw=LW_FACE)
    for hx, hy, col in ((x + 33.0, cy - 1.0, P["coral"]), (x + 41.5, cy + 1.6, P["roomBlue"])):
        c.rect(hx - 2.4, hy - 1.0, 4.8, 3.6, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)
        c.poly([(hx - 3.2, hy - 1.0), (hx, hy - 4.0), (hx + 3.2, hy - 1.0)],
               fill=col, ink=P["ink"], lw=LW_FACE)
    c.rect(x + 51.5, cy - 0.2, 1.6, 3.6, fill=P["woodDk"])
    c.circle(x + 52.3, cy - 2.4, 3.2, fill=P["greenDk"], ink=P["ink"], lw=LW_FACE)
    # Two toy cars on the road, one each side, wheels as ink dots.
    for carx, cary, col in ((x + 24.0, y + 4.0, P["coral"]), (x + 44.0, y + h - 4.0, P["gold"])):
        c.rrect(carx - 3.4, cary - 2.0, 6.8, 3.6, r=1.4, fill=col, ink=P["ink"], lw=LW_FACE)
        c.rect(carx - 1.6, cary - 2.6, 3.4, 1.4, fill=tint(col, 0.36))
        for wx in (carx - 2.0, carx + 2.0):
            c.circle(wx, cary + 1.8, 0.9, fill=P["ink"])


def lighting_balloonLantern(c: Canvas) -> None:
    """
    A pendant shaped like a hot-air balloon: a fat striped envelope in coral
    and cream on a short cord, glowing, with a tiny wicker basket hung under
    it on four strings.

    The gores are drawn as lenses that follow the balloon's own profile, so
    the stripes stay inside the outline without a mask. A striped teardrop
    over a basket is nothing else in the category.
    """
    cx = c.w / 2
    drop = 5.0
    prof = ((0.0, 0.0), (1.6, 5.4), (4.2, 9.6), (8.0, 12.4), (13.0, 13.4), (18.0, 12.4),
            (22.0, 9.8), (25.0, 6.8), (27.4, 4.2))
    top = drop

    def edge(u: float):
        return [(cx + u * hw, top + dy) for dy, hw in prof]

    _glow(c, cx, top + 15.0, 24.0, colour=P["cream"])
    _ceiling_plate(c, cx, 10.0, colour=P["metal"])
    _cord(c, cx, drop, colour=P["ink2"])
    bounds = (-1.0, -0.6, -0.2, 0.2, 0.6, 1.0)
    for k in range(5):
        left, right = edge(bounds[k]), edge(bounds[k + 1])
        c.poly(left + right[::-1], fill=P["coral"] if k % 2 == 0 else P["creamHi"])
    outline = edge(-1.0) + edge(1.0)[::-1]
    c.poly(outline, ink=P["ink"], lw=LW_PROP)
    c.line([(cx - 8.0, top + 6.0), (cx - 9.6, top + 12.0)], tint(P["coral"], 0.42), 1.2)
    # The neck ring, the strings and the basket.
    neck = top + prof[-1][0]
    c.ellipse(cx, neck, 4.6, 1.8, fill=P["black"], ink=P["ink"], lw=LW_FACE)
    by = neck + 7.0
    for sx, bx in ((-3.4, -4.0), (-1.2, -1.4), (1.2, 1.4), (3.4, 4.0)):
        c.line([(cx + sx, neck + 1.0), (cx + bx, by)], P["ink2"], 0.8)
    c.rrect(cx - 5.4, by, 10.8, 6.0, r=1.6, fill=P["wood"], ink=P["ink"], lw=LW_DETAIL)
    for k in range(2):
        c.line([(cx - 4.0, by + 2.0 + k * 2.2), (cx + 4.0, by + 2.0 + k * 2.2)], shade(P["wood"], 0.32), 0.8)
    c.rect(cx - 5.0, by + 0.8, 10.0, 1.0, fill=tint(P["wood"], 0.34))


PIECES = {
    # economy
    "bed_metalFrame":          bed_metalFrame,
    "table_crateNightstand":   table_crateNightstand,
    "lighting_ceilingFan":     lighting_ceilingFan,
    # standard
    "bed_paintedSpindle":      bed_paintedSpindle,
    "wallArt_bedsideSconce":   wallArt_bedsideSconce,
    "lighting_paperLantern":   lighting_paperLantern,
    # double
    "bed_twinBrass":           bed_twinBrass,
    "bed_twinOak":             bed_twinOak,
    "table_twinNightstand":    table_twinNightstand,
    "luxury_chevalMirror":     luxury_chevalMirror,
    # family
    "bed_trundleBed":          bed_trundleBed,
    "seating_rockingHorse":    seating_rockingHorse,
    "rug_roadPlaymat":         rug_roadPlaymat,
    "lighting_balloonLantern": lighting_balloonLantern,
    # deluxe
    "bed_loftSleigh":          bed_loftSleigh,
    "lighting_loftRattan":     lighting_loftRattan,
}
