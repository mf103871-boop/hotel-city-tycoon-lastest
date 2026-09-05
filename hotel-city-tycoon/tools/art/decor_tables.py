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

The second half of the module is the restaurant and the bar, and the same
argument holds: a brasserie on oak boards is a bedroom with tables in it.
Their surfaces are a brasserie's and a pub's — not food this time but the
materials those rooms are built from — and each is kept apart by the one
thing no surface already had:

*   the bistro floor is the only chequer: hard black and cream squares,
    where marble is a slab, mosaic a fine tessera and the macarons are
    hexagons;
*   the brasserie mirror is the only frame with a beaded rim, so its
    silhouette is scalloped, and the only wall piece whose picture is empty
    glass with writing on it;
*   the bottle-green panelling is the only paper that is dark, vertical and
    unpatterned at once — boards with a rail, not a repeat;
*   the neon sign is the only light that is a *plate* — squarish, dark, on
    two chains — and the only one whose light is a drawn outline;
*   the pub lantern is the only six-sided fitting, pointed at both ends;
*   the pub boards are the only dark floor with a pale worn path across it,
    and the bar mat the only black, gridded, unfringed rug.

Drawn against `hcstyle` and nothing else, laid out from `c.w` / `c.h`
because every routine is handed a 1x and a 2x canvas. The helpers come from
`decor_surfaces` (panel, band, frame, chain, plate, glow, the clipped line
and the wall-panel wrapper) so that a cafe floor and a suite floor are the
same strip of material at the same y; the bar's two dark woods and its green
are the suites' constants, so the bar and the banker's lamp agree on what
bottle green is.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math,
)

from decor_surfaces import (
    _panel, _band, _cord, _chain, _ceiling_plate, _glow, _art_frame,
    _clipped_line, _as_wall_panel,
    BAND_CY, GOLD, GOLD_DK, GOLD_HI,
)
from decor_suites import BOTTLE, WALNUT_DK


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


# --------------------------------------------------------------- restaurant

def flooring_bistroCheck(c: Canvas) -> None:
    """
    Black and cream marble squares in a strict straight-laid chequer, three
    courses deep, with a thin brass trim strip along the front edge.

    The chequer is the whole read, so it is coarse: nine tiles across the
    band and three down, each a shape of its own at 55% rather than a
    texture. The cream squares are the band itself and only the black ones
    are laid on it, which keeps every seam a hard edge — a grout line between
    tiles this contrasted reads as a grey halo round the black. The trim is
    the one thing on the floor that is not a square: a warm horizontal at the
    foot, so the strip still has a front.
    """
    cream = mix(P["linen"], P["creamHi"], 0.45)
    black = mix(P["black"], P["ink2"], 0.30)
    x, y, w, h = _band(c, 34.0, cream)
    bottom = min(y + h, c.h)
    trim_h = 3.6
    fx0, fy0 = x + 1.6, y + 1.6
    fx1, fy1 = x + w - 1.6, bottom - trim_h - 0.6
    # The band's own sheen is painted out: a lighter stripe across the top
    # course made the cream tiles two different creams.
    c.rect(fx0, fy0, fx1 - fx0, fy1 - fy0, fill=cream)
    cols, rows = 9, 3
    tw, th = (fx1 - fx0) / cols, (fy1 - fy0) / rows
    for row in range(rows):
        for col in range(cols):
            if (row + col) % 2:
                c.rect(fx0 + col * tw, fy0 + row * th, tw, th, fill=black)
    # A vein on two of the cream squares — marble, not lino — kept faint so
    # the tile stays a flat shape from across the room.
    vein = shade(cream, 0.16)
    for col, row in ((1, 1), (6, 0)):
        tx, ty = fx0 + col * tw, fy0 + row * th
        c.line([(tx + 1.4, ty + th - 1.8), (tx + tw - 1.6, ty + 1.6)], vein, 0.9)
    c.rect(fx0, fy1, fx1 - fx0, trim_h, fill=GOLD)
    c.line([(fx0, fy1), (fx1, fy1)], P["ink"], LW_FACE)
    c.rect(fx0 + 1.0, fy1 + 0.8, fx1 - fx0 - 2.0, 0.9, fill=GOLD_HI)


#: "Menu du Jour" as three pen strokes, in (dx, dy) from the start of the
#: line, baseline at dy = 0. Not letterforms: at this size a real glyph is a
#: smudge and a confident squiggle with ascenders in the right places is
#: handwriting.
_SCRIPT = (
    ((0.0, 0.0), (1.6, -6.5), (3.2, 0.0), (4.8, -6.5), (6.4, 0.0),          # M
     (7.6, -2.6), (9.0, 0.0), (10.4, -2.6), (11.8, 0.0),                    # en
     (13.2, -2.6), (14.6, 0.0), (15.8, -2.6)),                              # u
    ((19.5, 0.0), (21.0, -2.6), (22.4, 0.0), (23.2, -6.5), (24.0, 0.0),     # d
     (25.4, -2.6), (26.8, 0.0), (28.0, -2.6)),                              # u
    ((31.5, -6.0), (34.0, -6.5), (33.0, 0.0), (31.8, 2.4)),                 # J
    ((35.2, -2.6), (36.6, 0.0), (38.0, -2.6), (39.4, 0.0), (40.6, -2.6),    # ou
     (41.8, 0.0), (43.0, -2.6), (44.2, -1.4)),                              # r
)


def wallArt_brasserieMirror(c: Canvas) -> None:
    """
    A wide landscape mirror in a beaded gilt frame: silver-blue glass with
    one diagonal streak of reflected light, the day's menu written across
    the top in gold script and two lines of chalk prices under it.

    The beads sit *on* the frame's outer edge rather than inside it, so the
    outline is scalloped — a gilt rectangle with a bumpy rim, where every
    painting is a hard rectangle with or without a crest. Inside, the glass
    is a cool flat and nearly empty — no scene, no sitter — so at 40px it
    reads as reflected light rather than as a picture of something.
    """
    cx, cy = c.w / 2, c.h / 2
    fw, fh = 82.0, 52.0
    x0, y0 = cx - fw / 2, cy - fh / 2
    ix, iy, iw, ih = _art_frame(c, fw, fh, GOLD, depth=5.0)
    n_across, n_down = 12, 8
    for i in range(n_across + 1):
        bx = x0 + fw * i / n_across
        for by in (y0, y0 + fh):
            c.circle(bx, by, 2.4, fill=GOLD_HI, ink=P["ink"], lw=LW_FACE)
    for j in range(1, n_down):
        by = y0 + fh * j / n_down
        for bx in (x0, x0 + fw):
            c.circle(bx, by, 2.4, fill=GOLD_HI, ink=P["ink"], lw=LW_FACE)
    c.rrect(x0 + 3.0, y0 + 3.0, fw - 6.0, fh - 6.0, r=1.6, ink=GOLD_DK, lw=LW_FACE)
    glass = mix(P["tile"], P["glass"], 0.40)
    c.rect(ix, iy, iw, ih, fill=glass, ink=P["ink"], lw=LW_FACE)
    # One shade along the foot and the right side: the frame's own depth
    # falling across the glass, and the one thing that makes it a surface.
    dusk = shade(glass, 0.14)
    c.rect(ix, iy + ih - 2.6, iw, 2.6, fill=dusk)
    c.rect(ix + iw - 2.6, iy, 2.6, ih, fill=dusk)
    sx, sy, sc = ix + 5.0, iy + 12.5, 1.4
    for stroke in _SCRIPT:
        c.line([(sx + dx * sc, sy + dy * sc) for dx, dy in stroke], GOLD_DK, 1.5)
    chalk = P["white"]
    for k, (item, price) in enumerate(((22.0, 8.0), (16.0, 6.0))):
        ly = iy + 21.0 + k * 6.4
        c.line([(ix + 8.0, ly), (ix + 8.0 + item, ly)], chalk, 1.8)
        c.line([(ix + iw - 10.0 - price, ly), (ix + iw - 10.0, ly)], chalk, 1.8)
    # The reflection, last, over everything written on the glass.
    c.poly([(ix + iw * 0.34, iy + ih), (ix + iw * 0.46, iy + ih),
            (ix + iw * 0.74, iy), (ix + iw * 0.62, iy)], fill=alpha(P["white"], 0.55))


# ---------------------------------------------------------------------- bar

def wallpaper_bottleGreen(c: Canvas) -> None:
    """
    Deep bottle-green tongue-and-groove boards standing on end, a brass
    picture rail across the top and one brass hook hanging off it.

    Seven boards, not twelve: each is a stripe wide enough to keep its groove
    at 55%, and the groove is what makes it joinery rather than paint — a
    dark line and a lit edge side by side, the way a bevel catches light.
    This is the only paper in the catalogue that is dark, vertical and
    unpatterned at once; the regency stripes are pale and even, everything
    else is a repeat. The rail and the hook are the two horizontal marks on
    it, and they are brass because the bar is.
    """
    # A step darker than the banker's lamp glass: the wall-panel wrapper lets
    # the room through the paper, and the suites' green came out sage on the
    # bar's navy. Shaded rather than mixed, so it is still that green.
    base = shade(BOTTLE, 0.18)
    x, y, w, h = _panel(c, base, r=2.4)
    boards = 7
    bw = (w - 2.4) / boards
    lit = tint(base, 0.20)
    groove = shade(base, 0.45)
    for i in range(boards):
        bx = x + 1.2 + i * bw
        c.rect(bx + 1.0, y + 1.2, 1.6, h - 2.4, fill=lit)
        if i:
            c.line([(bx - 0.4, y + 1.6), (bx - 0.4, y + h - 1.6)], groove, 1.4)
    rail_y, rail_h = y + 7.0, 3.6
    c.rect(x + 1.4, rail_y + rail_h, w - 2.8, 1.4, fill=shade(base, 0.35))
    c.rrect(x + 1.0, rail_y, w - 2.0, rail_h, r=1.2, fill=GOLD, ink=P["ink"], lw=LW_DETAIL)
    c.rect(x + 3.0, rail_y + 0.9, w - 6.0, 0.9, fill=GOLD_HI)
    # The hook: a slider on the rail, a stem, and a J-curl. Drawn as ink
    # then brass so it stays a wire at 55% rather than a gold smear.
    hx, hy = x + w * 0.66, rail_y + rail_h
    stem, r = 6.0, 2.6
    c.rrect(hx - 2.2, rail_y - 0.6, 4.4, rail_h + 1.2, r=1.0,
            fill=GOLD_DK, ink=P["ink"], lw=LW_FACE)
    for colour, lw in ((P["ink"], 2.8), (GOLD_DK, 1.4)):
        c.line([(hx, hy - 0.6), (hx, hy + stem)], colour, lw)
        c.arc(hx - r, hy + stem, r, r, 0, 180, colour, lw)
        c.line([(hx - 2 * r, hy + stem), (hx - 2 * r, hy + stem - 1.8)], colour, lw)


def lighting_neonCocktail(c: Canvas) -> None:
    """
    A neon sign on two short chains: a coral martini glass, a mint olive on
    a stick, on a dark backing plate, and the coral haze a tube throws.

    The plate is squarer than anything else that hangs — the batten is a
    bar, the exit sign a pill, everything else a point on a cord — and it is
    dark so the glowing outline on it is the brightest thing in the sprite.
    Each tube is three strokes on top of each other: a wide translucent halo,
    the coral tube, and a pale core, which is what makes a line read as lit
    glass rather than as a coral drawing. The olive is a filled disc, not a
    ring — a ring six pixels across is a smudge at 55%.
    """
    cx = c.w / 2
    drop = 8.0
    pw, ph = 42.0, 32.0
    px, py = cx - pw / 2, drop
    plate = mix(P["black"], P["ink2"], 0.35)
    for dx in (-13.0, 13.0):
        _ceiling_plate(c, cx + dx, 8.0, colour=P["metalDk"])
        _chain(c, cx + dx, drop, links=2)
    c.rrect(px, py, pw, ph, r=3.0, fill=plate, ink=P["ink"], lw=LW_PROP)
    c.rect(px + 2.4, py + 1.8, pw - 4.8, 1.4, fill=tint(plate, 0.16))
    _glow(c, cx, py + ph * 0.55, 21.0, colour=P["coral"])

    def tube(pts, colour, w: float = 2.2) -> None:
        c.line(pts, alpha(colour, 0.32), w + 2.8)
        c.line(pts, colour, w)
        c.line(pts, tint(colour, 0.55), w * 0.4)

    rim_y, half = py + 7.0, 12.0
    bowl_y = rim_y + 12.0
    foot_y = py + ph - 5.0
    neon = P["coral"]
    tube([(cx - half, rim_y), (cx + half, rim_y), (cx, bowl_y), (cx - half, rim_y)], neon)
    tube([(cx, bowl_y), (cx, foot_y - 1.0)], neon)
    tube([(cx - 7.0, foot_y), (cx + 7.0, foot_y)], neon)
    ox, oy = cx + 1.5, rim_y + 6.0
    tube([(cx - 8.5, rim_y - 4.0), (ox, oy)], GOLD_HI, 1.4)
    c.circle(ox, oy, 4.6, fill=alpha(P["mint"], 0.30))
    c.circle(ox, oy, 2.9, fill=P["mint"])
    c.circle(ox, oy, 1.0, fill=P["coral"])


def lighting_pubLantern(c: Canvas) -> None:
    """
    A brass-framed hexagonal lantern with amber panes on a single chain, and
    the warm pool of light it throws.

    Six sides is the identity: a pointed cap and a pointed foot, where the
    lobby lantern is a box with a lid and every shade is round. The taper is
    deep — more than a quarter of the height at each end — because a hexagon
    that is nearly a rectangle is a rectangle at 55%. Two brass mullions
    divide the amber into three panes; the left one is lit a shade brighter
    and the right a shade darker, which is all the roundness a flat lantern
    gets.
    """
    cx = c.w / 2
    drop = 11.0
    top, bot = drop + 2.0, drop + 28.0
    hw, taper = 11.0, 7.5
    mid = (top + bot) / 2
    amber = mix(P["gold"], P["coral"], 0.22)
    _glow(c, cx, mid + 4.0, 18.0, colour=P["gold"])
    _ceiling_plate(c, cx, 10.0, colour=GOLD_DK)
    _chain(c, cx, drop, links=3)

    def edge_top(px: float) -> float:
        return top + taper * abs(px - cx) / hw

    def edge_bot(px: float) -> float:
        return bot - taper * abs(px - cx) / hw

    def pane(a: float, b: float, fill) -> None:
        c.poly([(a, edge_top(a)), (b, edge_top(b)), (b, edge_bot(b)), (a, edge_bot(a))],
               fill=fill)

    hexa = [(cx, top), (cx + hw, top + taper), (cx + hw, bot - taper),
            (cx, bot), (cx - hw, bot - taper), (cx - hw, top + taper)]
    c.poly(hexa, fill=amber, ink=P["ink"], lw=LW_PROP)
    m = 3.8
    pane(cx - hw + 1.0, cx - m, tint(amber, 0.22))
    pane(cx + m, cx + hw - 1.0, shade(amber, 0.16))
    c.ellipse(cx, mid, 2.4, 5.0, fill=P["creamHi"])
    for dx in (-m, m):
        px = cx + dx
        c.line([(px, edge_top(px) + 0.4), (px, edge_bot(px) - 0.4)], GOLD_DK, 1.4)
    # The brass frame, inside the ink: the same hexagon shrunk on its centre.
    s = 0.85
    c.poly([(cx + (px - cx) * s, mid + (py - mid) * s) for px, py in hexa],
           ink=GOLD_DK, lw=1.3)
    c.circle(cx, top - 0.6, 2.4, fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.circle(cx, bot + 0.4, 1.8, fill=GOLD_DK, ink=P["ink"], lw=LW_FACE)


def flooring_pubBoards(c: Canvas) -> None:
    """
    Wide dark-walnut boards, a nail head at each end of every board, and a
    paler path worn across the middle where the drinkers walk.

    Three boards to the strip and no end joints: the oak floor is staggered
    courses of pale timber, and what separates a pub floor from it is that
    the boards are long, dark and few. The worn path runs *across* the strip
    — front to back, the way a room is walked — as a pale zone whose width
    changes on each board, so it reads as wear and not as a stripe painted
    on. The grain is drawn after it so the same boards continue through.
    """
    walnut = WALNUT_DK
    x, y, w, h = _band(c, 28.0, walnut)
    bottom = min(y + h, c.h)
    rows = 3
    top = y + 1.6
    depth = (bottom - 0.6 - top) / rows
    cxm = c.w / 2
    worn = mix(walnut, P["woodPale"], 0.40)
    worn_edge = mix(walnut, P["woodPale"], 0.18)
    for row in range(rows):
        ry = top + row * depth
        half = (10.0, 12.5, 9.0)[row]
        c.rect(cxm - half - 2.4, ry, half * 2 + 4.8, depth, fill=worn_edge)
        c.rect(cxm - half, ry, half * 2, depth, fill=worn)
    for row in range(1, rows):
        ry = top + row * depth
        c.line([(x + 1.4, ry), (x + w - 1.4, ry)], shade(walnut, 0.45), 1.3)
    grain, pale = shade(walnut, 0.28), tint(walnut, 0.14)
    for row in range(rows):
        ry = top + row * depth
        c.rect(x + 8.0 + row * 9.0, ry + depth * 0.30, w * 0.30, 1.0, fill=grain)
        c.rect(x + w * 0.48 - row * 7.0, ry + depth * 0.66, w * 0.26, 1.0, fill=pale)
    # One nail at each end of each board. Two a side is twelve dots, and
    # twelve dots on a dark floor is a keyboard.
    nail = P["metalDk"]
    for row in range(rows):
        ny = top + row * depth + depth / 2
        for nx in (x + 4.2, x + w - 4.2):
            c.circle(nx, ny, 1.5, fill=nail)
            c.circle(nx - 0.5, ny - 0.5, 0.6, fill=tint(nail, 0.5))


def rug_barMat(c: Canvas) -> None:
    """
    A black rubber bar mat: a raised diamond grid on the top, a coral stripe
    along its front edge, and a lip round the rim.

    Rubber, not textile, so no fringe, no border, no medallion — the three
    things every woven rug on the slot has — and black, which no rug is. It
    is drawn deeper than it is long, the proportion of a service mat, so it
    reads apart from the wide, low anti-fatigue mat in maintenance even when
    both are a dark block. The grid is a lattice of lit lines clipped to the
    top face: the one texture that says moulded rubber.
    """
    rubber = mix(P["black"], P["shadow"], 0.25)
    x, y, w, h = _band(c, 22.0, rubber, r=2.4, w=50.0)
    bottom = min(y + h, c.h)
    stripe_h = 4.0
    face_bot = bottom - stripe_h - 0.8
    c.rrect(x + 1.6, y + 1.6, w - 3.2, face_bot - y - 2.4, r=1.6,
            ink=tint(rubber, 0.30), lw=LW_FACE)
    inner = (x + 3.0, y + 3.0, w - 6.0, face_bot - y - 5.2)
    ix, iy, iw, ih = inner
    lat = tint(rubber, 0.36)
    step = 6.0
    n = int((iw + ih) // step) + 2
    for i in range(-n, n):
        px = ix + i * step
        _clipped_line(c, (px, iy + ih), (px + ih, iy), inner, lat, 1.1)
        _clipped_line(c, (px, iy), (px + ih, iy + ih), inner, lat, 1.1)
    c.rect(x + 1.4, face_bot, w - 2.8, stripe_h, fill=P["coral"])
    c.line([(x + 1.4, face_bot), (x + w - 1.4, face_bot)], P["ink"], LW_FACE)
    c.rect(x + 3.0, face_bot + 0.8, w - 6.0, 0.9, fill=tint(P["coral"], 0.35))


PIECES = {
    "rug_latteRug":            rug_latteRug,
    "flooring_macaronTiles":   flooring_macaronTiles,
    "wallArt_cupcakeBunting":  wallArt_cupcakeBunting,
    "lighting_cupcakePendant": lighting_cupcakePendant,
    # Framed and washed the way every wallpaper in `decor_surfaces` is, so
    # the cafe's sprinkles sit in the same moulded panel as the suites' silk.
    "wallpaper_sprinkleWall":  _as_wall_panel(wallpaper_sprinkleWall),

    "flooring_bistroCheck":    flooring_bistroCheck,
    "wallArt_brasserieMirror": wallArt_brasserieMirror,
    # The same moulded panel again: the bar's boards are wall treatment,
    # and the wash lets the navy behind them through.
    "wallpaper_bottleGreen":   _as_wall_panel(wallpaper_bottleGreen),
    "lighting_neonCocktail":   lighting_neonCocktail,
    "lighting_pubLantern":     lighting_pubLantern,
    "flooring_pubBoards":      flooring_pubBoards,
    "rug_barMat":              rug_barMat,
}
