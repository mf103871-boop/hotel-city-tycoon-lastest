"""
The cafe, the restaurant and the bar — second wave.

The first wave (`decor_dining`) gave these rooms furniture: tables, stools, a
cake display, a beer tap. What they still bought from the general catalogue
was their *surfaces* — the same striped paper, oak boards and persian rug a
bedroom gets — and a cafe papered like a bedroom is a bedroom with a counter
in it. The pieces here are the surfaces a cake shop would actually choose,
and every one of them is drawn as food, because food is the one subject no
surface in `decor_surfaces` has. That is what keeps them apart by outline:

*   the latte rug is the only rug in the game that is *round* — an ellipse
    on the floor line where every other rug is a rectangle or a runner — and
    the only brown one with a pale pour on it;
*   the macaron tiles are the only floor built from hexagons: marble is
    slabs, mosaic is a fine chequer, parquet is chevrons, and a honeycomb of
    fat pastel cells reads as candy from across the room;
*   the bunting is the only wall piece that is not a rectangle at all — a
    zig-zag of pennants on a sagging string between two pins, no frame, no
    mount, no tape;
*   the cupcake pendant is the only light with a *flared, ridged* shade under
    a soft dome; the other pendants are a cone, a half-dome, a globe, a cage;
*   the sprinkle wall is the only paper with no repeat: loose tilted dashes
    inside a scalloped rim, where plain, striped, damask and gilded are each
    a rhythm or a grid.

Drawn against `hcstyle` and nothing else, laid out from `c.w` / `c.h`
because every routine is handed a 1x and a 2x canvas. The helpers come from
`decor_surfaces` (panel, band, cord, plate, glow, and the wall-panel wrapper)
so that a cafe floor and a suite floor are the same strip of material at the
same y.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    shade, tint, mix, math,
)

from decor_surfaces import (
    _panel, _band, _cord, _ceiling_plate, _glow, _as_wall_panel,
    BAND_CY, GOLD,
)


# ------------------------------------------------------------------ toolkit

def _clip_poly(pts, rect):
    """
    A convex polygon trimmed to a rectangle, by Sutherland–Hodgman.

    The same reason `decor_surfaces._clipped_line` exists: Pillow has no clip
    region, so a tiling laid across a floor band spills over the band's edge
    and onto the room's own floor. Each hexagon is trimmed before it is
    filled, which also gives the patch the cut tiles a real floor has where
    it meets a wall.
    """
    x0, y0, x1, y1 = rect

    def against(points, inside, cross):
        out = []
        for i, cur in enumerate(points):
            prev = points[i - 1]
            if inside(cur):
                if not inside(prev):
                    out.append(cross(prev, cur))
                out.append(cur)
            elif inside(prev):
                out.append(cross(prev, cur))
        return out

    def at_x(p, q, x):
        t = (x - p[0]) / (q[0] - p[0])
        return (x, p[1] + (q[1] - p[1]) * t)

    def at_y(p, q, y):
        t = (y - p[1]) / (q[1] - p[1])
        return (p[0] + (q[0] - p[0]) * t, y)

    for inside, cross in (
            (lambda p: p[0] >= x0, lambda p, q: at_x(p, q, x0)),
            (lambda p: p[0] <= x1, lambda p, q: at_x(p, q, x1)),
            (lambda p: p[1] >= y0, lambda p, q: at_y(p, q, y0)),
            (lambda p: p[1] <= y1, lambda p, q: at_y(p, q, y1))):
        pts = against(pts, inside, cross)
        if len(pts) < 3:
            return []
    return pts


#: The macaron flavours, and the order they are tried in when a tile is laid.
_MACARON = (
    P["wallRose"],                              # blush
    P["mint"],                                  # pistachio
    mix(P["cream"], P["gold"], 0.35),           # lemon
    mix(P["wallLilac"], P["lavender"], 0.35),   # lilac
)

#: What a sprinkle comes in. The mint is pushed towards green and the lemon
#: towards gold because a true pastel dash on a cream ground is a grey dash.
_SPRINKLE = (
    P["coral"],
    mix(P["mint"], P["green"], 0.50),
    P["gold"],
    P["hairBrown"],
)


# --------------------------------------------------------------------- cafe

def rug_latteRug(c: Canvas) -> None:
    """
    A round rug that is a latte seen from above: coffee-brown with a cream
    rim like the lip of a cup, a milk rosetta pulled through a heart, and a
    few short tassels round the edge.

    Round is the whole identity — nothing else on the rug slot is — so it is
    an ellipse lying on the same floor line `_band` uses rather than a
    rounded strip. The pour is laid *along* the rug, not across it: the
    rosetta is the one mark that has to survive 55%, and across the short
    axis it had eight pixels to live in.
    """
    cx = c.w / 2
    rx, ry = 30.0, 10.0
    # The body sits a fringe-length above the edge so the front tassels are
    # what touch the floor line, exactly as a fringed rug does.
    cy = min(BAND_CY, c.h - ry - 2.0)
    coffee = mix(P["woodDk"], P["hairBrown"], 0.50)
    cream = P["creamHi"]
    milk = tint(cream, 0.50)
    # Tassels first, under the rim. Twelve short stubs on the half-hour, so
    # none sticks straight out of the side like a handle; drawn long and thin
    # they were the rays of a sun, so they are short and fat.
    for i in range(12):
        ang = math.radians(i * 30 + 15)
        ca, sa = math.cos(ang), math.sin(ang)
        c.line([(cx + ca * rx, cy + sa * ry),
                (cx + ca * (rx + 2.0), cy + sa * (ry + 2.0))], cream, 1.7)
    c.ellipse(cx, cy, rx, ry, fill=cream, ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, cy, rx - 2.8, ry - 2.2, fill=coffee,
              ink=shade(coffee, 0.35), lw=LW_FACE)
    # Crema catches the light along the far rim: one pale arc, top-left only,
    # so it reads as a curve of the cup and not as a grin.
    c.arc(cx, cy, rx - 6.0, ry - 4.4, 200, 300, tint(coffee, 0.32), 1.3)
    # The rosetta: a stem, and four pairs of petals swept back from the heart.
    # Each petal is a fat round-capped stroke rather than a pointed leaf —
    # pointed leaves on a stem are a fishbone, and poured milk has no points.
    hx = cx + 14.0
    c.line([(cx - 16.0, cy), (hx - 2.0, cy)], milk, 1.6)
    for k, lx in enumerate((cx - 13.0, cx - 7.5, cx - 2.0, cx + 3.5)):
        reach = 5.2 - k * 0.5
        for side in (-1, 1):
            c.line([(lx, cy), (lx - reach * 0.92, cy + side * reach * 0.78)],
                   milk, 2.6)
    # The pour starts as a round blob, which is what closes the left end.
    c.circle(cx - 16.6, cy, 2.0, fill=milk)
    # The heart the stem is pulled through: two lobes and a point.
    hy = cy - 0.4
    for side in (-1, 1):
        c.circle(hx + side * 2.5, hy - 1.2, 3.0, fill=milk)
    c.poly([(hx - 5.3, hy - 0.3), (hx + 5.3, hy - 0.3), (hx, hy + 4.8)], fill=milk)


def flooring_macaronTiles(c: Canvas) -> None:
    """
    Chunky hexagon tiles in four macaron pastels on cream grout, laid so no
    two neighbours share a flavour.

    The hexagons are big on purpose — nine or ten pixels across, three courses
    to the band — because a honeycomb only reads as one while each cell is a
    shape rather than a dot. Colours are handed out by a greedy walk over the
    grid (a cell takes the first flavour none of its laid neighbours has),
    which scatters them without ever letting two of a kind touch.
    """
    grout = tint(P["creamHi"], 0.50)
    x, y, w, h = _band(c, 28.0, grout)
    field = (x + 1.6, y + 1.6, x + w - 1.6, y + h - 1.6)
    radius = 5.6            # centre to vertex
    gap = 0.8               # half the grout line
    hw = radius * math.sqrt(3) / 2
    pitch_y = radius * 1.5
    rows = int((c.h - field[1]) // pitch_y) + 1
    cols = int((field[2] - field[0]) // (hw * 2)) + 2
    laid: dict[tuple[int, int], int] = {}
    for row in range(rows):
        cy = field[1] + 4.6 + row * pitch_y
        offset = hw if row % 2 else 0.0
        for col in range(-1, cols):
            cx = field[0] + hw + col * hw * 2 + offset
            # The neighbours already on the floor: the cell to the left and
            # the two in the course above (odd courses shift right by a half).
            above = ((row - 1, col), (row - 1, col + 1)) if row % 2 else \
                    ((row - 1, col - 1), (row - 1, col))
            taken = {laid[n] for n in ((row, col - 1),) + above if n in laid}
            start = (col * 5 + row * 3) % len(_MACARON)
            flavour = next((start + k) % len(_MACARON) for k in range(len(_MACARON))
                           if (start + k) % len(_MACARON) not in taken)
            laid[(row, col)] = flavour
            r = radius - gap
            pts = [(cx + math.cos(math.radians(60 * i - 30)) * r,
                    cy + math.sin(math.radians(60 * i - 30)) * r) for i in range(6)]
            pts = _clip_poly(pts, field)
            if pts:
                c.poly(pts, fill=_MACARON[flavour])
    c.rrect(x + 1.8, y + 1.8, w - 3.6, h - 3.6, r=1.4,
            ink=shade(grout, 0.30), lw=LW_FACE)


def wallArt_cupcakeBunting(c: Canvas) -> None:
    """
    Five pastel pennants on a string that sags between two wall pins, one dot
    on each and a cupcake on the middle one.

    No frame, and that is deliberate: every other wall piece is a rectangle,
    so a zig-zag on a line is the one silhouette the slot has never shown. It
    is centred where `_art_frame` would centre a picture, and the pennants
    are cut tall so the string of them still fills the slot the way a frame
    would. Each pennant's top edge follows the string, so the end ones tilt
    and the middle one hangs level, which is what bunting does.
    """
    cx, cy = c.w / 2, c.h / 2
    half = 40.0
    top = cy - 24.0
    sag = 15.0

    def sx(t: float) -> float:
        return cx - half + t * half * 2

    def sy(t: float) -> float:
        u = t * 2 - 1
        return top + sag * (1 - u * u)

    c.line([(sx(i / 24), sy(i / 24)) for i in range(25)], P["ink2"], 1.2)
    lemon = mix(P["cream"], P["gold"], 0.40)
    flags = (
        (P["coral"], P["creamHi"]),
        (P["mint"], P["coral"]),
        (lemon, P["coral"]),
        (P["creamHi"], P["coral"]),
        (P["coral"], P["creamHi"]),
    )
    fw, fh = 15.0, 28.0
    dt = fw / (half * 4)
    for k, (colour, dot) in enumerate(flags):
        t = 0.1 + k * 0.2
        x0, y0 = sx(t - dt), sy(t - dt)
        x1, y1 = sx(t + dt), sy(t + dt)
        mx, my = sx(t), (y0 + y1) / 2
        c.poly([(x0, y0), (x1, y1), (mx, my + fh)],
               fill=colour, ink=P["ink"], lw=LW_PROP)
        if k == 2:
            # The cupcake, in the wide top half where a tiny thing can be
            # drawn with three shapes and still have room round it.
            case = mix(P["coral"], P["woodDk"], 0.30)
            c.poly([(mx - 3.8, my + 6.6), (mx + 3.8, my + 6.6),
                    (mx + 2.6, my + 11.6), (mx - 2.6, my + 11.6)],
                   fill=case, ink=P["ink"], lw=LW_FACE)
            c.ellipse(mx, my + 5.4, 4.4, 3.0, fill=P["white"], ink=P["ink"], lw=LW_FACE)
            c.circle(mx, my + 2.4, 1.4, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
            c.circle(mx, my + 17.0, 1.7, fill=dot)
        else:
            c.circle(mx, my + 7.5, 2.3, fill=dot)
    for px in (cx - half, cx + half):
        c.circle(px, top, 2.4, fill=GOLD, ink=P["ink"], lw=LW_FACE)


def lighting_cupcakePendant(c: Canvas) -> None:
    """
    A pendant whose shade is a cupcake: a pleated coral case flaring out
    under a cream frosting swirl, a cherry on top, one dark cord, and the
    light coming out of the open bottom of the case.

    The read at 40px is the flared, ridged cup under a soft dome — the only
    fitting in the game with that outline. The pleats are alternating facets,
    not lines: a line thin enough to be a crease vanishes at 55%, a narrow
    dark facet between two lit ones survives. The paper is lit from inside,
    so the facets are coral warmed towards cream and the opening is the same
    pale yellow the glow is.
    """
    cx = c.w / 2
    drop = 8.0
    case_top, case_bot = 27.0, 41.0
    top_hw, bot_hw = 17.0, 10.0
    _glow(c, cx, case_bot + 2.0, 17.0)
    _ceiling_plate(c, cx, 12.0, P["ink2"])
    _cord(c, cx, drop)
    # The case: five lit facets with four ridges between them, top width to
    # bottom width in one fan so every seam converges below the lamp.
    paper = mix(P["coral"], P["creamHi"], 0.32)
    ridge = P["coral"]
    widths = (5.0, 2.25, 5.0, 2.25, 5.0, 2.25, 5.0, 2.25, 5.0)
    scale = bot_hw / top_hw
    xt = cx - top_hw
    for i, wd in enumerate(widths):
        xb = cx + (xt - cx) * scale
        c.poly([(xt, case_top), (xt + wd, case_top),
                (xb + wd * scale, case_bot), (xb, case_bot)],
               fill=ridge if i % 2 else paper)
        xt += wd
    c.poly([(cx - top_hw, case_top), (cx + top_hw, case_top),
            (cx + bot_hw, case_bot), (cx - bot_hw, case_bot)],
           ink=P["ink"], lw=LW_PROP)
    c.ellipse(cx, case_bot, bot_hw, 2.6, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)
    # The frosting: three tiers, widest first, so each one's underside shows
    # as a curve below the tier above — a swirl in three flat shapes.
    frost = tint(P["creamHi"], 0.35)
    for cy0, rx, ry in ((24.0, 17.8, 5.8), (18.6, 12.6, 5.0), (13.6, 7.4, 4.0)):
        c.ellipse(cx, cy0, rx, ry, fill=frost, ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx, 8.6, 3.0, fill=P["coral"], ink=P["ink"], lw=LW_FACE)
    c.circle(cx - 1.0, 7.6, 0.9, fill=P["white"])


def wallpaper_sprinkleWall(c: Canvas) -> None:
    """
    Cream paper thrown with sugar sprinkles — short tilted dashes in coral,
    mint, lemon and chocolate — inside a pale pink scalloped rim.

    The scatter is a jittered grid with the jitter and the tilt both taken
    from the row and column indices, so it looks loose and is identical on
    every run; a true random scatter would ship a different wall each build.
    The rim is a band with half-discs bulging into the field, which is a
    cupcake case seen edge-on and the only scalloped edge on any paper.
    """
    base = mix(P["wallCream"], P["white"], 0.35)
    x, y, w, h = _panel(c, base)
    pink = P["wallRose"]
    band, r = 2.4, 3.0
    c.rrect(x + 1.2, y + 1.2, w - 2.4, h - 2.4, r=2.4, fill=pink)
    c.rrect(x + 1.2 + band, y + 1.2 + band, w - 2.4 - band * 2, h - 2.4 - band * 2,
            r=1.6, fill=base)
    ix0, iy0 = x + 1.2 + band, y + 1.2 + band
    ix1, iy1 = x + w - 1.2 - band, y + h - 1.2 - band
    step = 6.4
    n_across = int((ix1 - ix0) // step)
    n_down = int((iy1 - iy0) // step)
    for i in range(n_across + 1):
        sx = ix0 + (ix1 - ix0) * i / n_across
        c.circle(sx, iy0, r, fill=pink)
        c.circle(sx, iy1, r, fill=pink)
    for j in range(n_down + 1):
        sy = iy0 + (iy1 - iy0) * j / n_down
        c.circle(ix0, sy, r, fill=pink)
        c.circle(ix1, sy, r, fill=pink)
    fx0, fy0 = ix0 + r + 2.4, iy0 + r + 2.4
    fx1, fy1 = ix1 - r - 2.4, iy1 - r - 2.4
    rows, cols = 5, 8
    for i in range(rows):
        for j in range(cols):
            # The jitter is most of a cell, so the rows and columns vanish.
            px = fx0 + (fx1 - fx0) * (j + 0.5) / cols + ((i * 7 + j * 5) % 7 - 3) * 1.1
            py = fy0 + (fy1 - fy0) * (i + 0.5) / rows + ((i * 3 + j * 7) % 7 - 3) * 1.0
            ang = math.radians(((i * 53 + j * 37) % 7) * 25.0)
            half_len = 2.5 + ((i + j * 3) % 3) * 0.4
            dx, dy = math.cos(ang) * half_len, math.sin(ang) * half_len
            colour = _SPRINKLE[(i * 3 + j * 5 + i * j) % len(_SPRINKLE)]
            c.line([(px - dx, py - dy), (px + dx, py + dy)], colour, 2.0)


PIECES = {
    "rug_latteRug":            rug_latteRug,
    "flooring_macaronTiles":   flooring_macaronTiles,
    "wallArt_cupcakeBunting":  wallArt_cupcakeBunting,
    "lighting_cupcakePendant": lighting_cupcakePendant,
    # Framed and washed the way every wallpaper in `decor_surfaces` is, so
    # the cafe's sprinkles sit in the same moulded panel as the suites' silk.
    "wallpaper_sprinkleWall":  _as_wall_panel(wallpaper_sprinkleWall),
}
