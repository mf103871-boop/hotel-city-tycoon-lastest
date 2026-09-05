"""
The arcade and the cinema — second wave.

The first wave (`decor_leisure`) gave these two rooms their machines and their
seats. What they still bought from the general catalogue was their surfaces:
the same oak boards, persian rug and framed landscape a bedroom gets, and an
arcade with a persian rug on its floor is a bedroom with a pinball table in
it. The pieces here are the surfaces those rooms would actually have, and
every one of them is *lit* — neon, marquee bulbs, blacklight confetti, aisle
LEDs — because light on black is the one subject no surface in
`decor_surfaces` has. That is what keeps them apart by outline:

*   the galaxy carpet is a low near-black band freckled with magenta, cyan
    and yellow, with two ringed planets in it; obsidian and onyx are glossy
    black with no colour, and every other floor is one plain material;
*   the dance mat is the smallest, squarest thing on the rug slot — a dark
    pad with a silver rim and four bright chevrons in a cross — where every
    other rug is a wide band with a woven border;
*   the hi-score board is the only wall piece that is a black panel inside
    a neon line: no frame, no mount, no picture, three glowing rows of glyphs;
*   the now-showing board is the only wall piece rimmed with a ring of bulbs;
*   the multiplex carpet is a deep navy-purple block with no border at all,
    speckled with teal, magenta and yellow, and it is squarer than the galaxy
    band beside it;
*   the aisle strip is the shallowest floor piece in the game, a charcoal
    bar with a row of amber dots along its front and light pooling under it.

Drawn against `hcstyle` and nothing else, laid out from `c.w` / `c.h`
because every routine is handed a 1x and a 2x canvas. The band, frame and
star helpers come from `decor_surfaces`, so a cinema floor and a suite floor
are the same strip of material at the same y.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix,
)

from decor_surfaces import _band, _art_frame, _star, BAND_CY, GOLD


# ------------------------------------------------------------------ toolkit
#
# The palette has no neon, so the three arcade colours are derived from it
# rather than invented: the pink pushed toward the grape wall is the magenta,
# the water pushed toward mint is the cyan, and the gold lifted a touch is the
# yellow. Kept here so all six pieces burn the same three colours.

MAGENTA = mix(P["hairPink"], P["wallGrape"], 0.28)
CYAN = mix(P["water"], P["mint"], 0.25)
YELLOW = tint(P["gold"], 0.12)
TEAL = mix(P["waterDk"], P["mint"], 0.40)
AMBER = mix(P["gold"], P["coral"], 0.28)


def _squiggle(c: Canvas, x: float, y: float, colour, flip: float = 1.0,
              lw: float = 1.3) -> None:
    """
    One confetti tilde: a five-pixel zigzag.

    Shorter than that it is a dot and longer it is a worm; at 55% this is a
    bright fleck with a kink in it, which is what blacklight carpet has.
    """
    c.line([(x, y + 1.2 * flip), (x + 1.7, y - 1.2 * flip),
            (x + 3.4, y + 1.2 * flip), (x + 5.1, y - 1.2 * flip)], colour, lw)


def _planet(c: Canvas, cx: float, cy: float, r: float, body, ring) -> None:
    """
    A small ringed planet: a disc with a flat ellipse through its waist.

    The ring is drawn whole behind the disc and its lower half again in
    front, so the disc visibly sits *inside* the ring rather than on it.
    """
    c.ellipse(cx, cy, r * 2.0, r * 0.62, ink=ring, lw=1.0)
    c.circle(cx, cy, r, fill=body, ink=P["ink"], lw=LW_FACE)
    c.circle(cx - r * 0.35, cy - r * 0.35, r * 0.30, fill=tint(body, 0.45))
    c.arc(cx, cy, r * 2.0, r * 0.62, 0, 180, ring, 1.0)


def _pin_star(c: Canvas, cx: float, cy: float, r: float = 1.3) -> None:
    """A four-point pin-star: two short crossed strokes, no fill."""
    c.line([(cx - r, cy), (cx + r, cy)], P["white"], 0.8)
    c.line([(cx, cy - r), (cx, cy + r)], P["white"], 0.8)


def _chevron(c: Canvas, cx: float, cy: float, dx: float, dy: float, colour,
             size: float = 4.6, thick: float = 2.6) -> None:
    """
    A chunky chevron arrow pointing along (dx, dy), one of the four unit axes.

    Six points: the outer V and the inner V a stroke-width behind it. Filled
    rather than stroked so it stays one bright wedge at 55% instead of two
    thin legs that fall apart.
    """
    # Axis vectors: `a` points the way the arrow points, `b` is across it.
    ax, ay = dx, dy
    bx, by = -dy, dx
    tip = (cx + ax * size, cy + ay * size)
    pts = [
        tip,
        (cx - ax * size + bx * size, cy - ay * size + by * size),
        (cx - ax * size + bx * (size - thick), cy - ay * size + by * (size - thick)),
        (cx + ax * (size - thick * 1.1), cy + ay * (size - thick * 1.1)),
        (cx - ax * size - bx * (size - thick), cy - ay * size - by * (size - thick)),
        (cx - ax * size - bx * size, cy - ay * size - by * size),
    ]
    c.poly(pts, fill=colour, ink=P["ink"], lw=LW_FACE)


def _glyph_bar(c: Canvas, x: float, y: float, n: int, colour, block: float = 4.0,
               gap: float = 1.2, h: float = 6.4) -> float:
    """
    A row of `n` block glyphs — a word on a scoreboard — with a glow under it.

    Returns the x where the bar ends. The glow is one translucent slab behind
    the blocks; the blocks themselves are opaque, so at 55% the bar is a solid
    bright dash with a soft edge rather than a smear.
    """
    w = n * block + (n - 1) * gap
    c.rrect(x - 1.6, y - 1.6, w + 3.2, h + 3.2, r=2.0, fill=alpha(colour, 0.24))
    for i in range(n):
        c.rrect(x + i * (block + gap), y, block, h, r=0.8, fill=colour)
        c.rect(x + i * (block + gap) + 0.8, y + 0.8, block - 1.6, 1.2,
               fill=tint(colour, 0.45))
    return x + w


def _tile_word(c: Canvas, x: float, y: float, n: int, seed: int,
               tile: float = 4.6, gap: float = 1.0, h: float = 6.4) -> float:
    """
    A word of white letter tiles on a black letterboard.

    Each tile carries one small dark mark — a stem, a bar or a dot, chosen by
    index — which is as much of a letter as fits. Returns the end x.
    """
    for i in range(n):
        tx = x + i * (tile + gap)
        c.rrect(tx, y, tile, h, r=0.7, fill=P["white"], ink=P["ink"], lw=LW_FACE)
        k = (seed + i * 3) % 3
        if k == 0:
            c.line([(tx + tile * 0.5, y + 1.6), (tx + tile * 0.5, y + h - 1.6)], P["ink2"], 0.9)
        elif k == 1:
            c.line([(tx + 1.2, y + h * 0.5), (tx + tile - 1.2, y + h * 0.5)], P["ink2"], 0.9)
        else:
            c.rect(tx + 1.3, y + 1.6, tile - 2.6, h - 3.2, fill=P["ink2"])
            c.rect(tx + 2.0, y + 2.4, tile - 4.0, h - 4.8, fill=P["white"])
    return x + n * tile + (n - 1) * gap


# ------------------------------------------------------------------- arcade

def flooring_galaxyCarpet(c: Canvas) -> None:
    """
    Blacklight carpet: a low near-black navy band freckled with magenta, cyan
    and yellow confetti, two ringed planets and a scatter of pin-stars.

    The band is shallower than any other flooring so the darkness is a strip
    and not a hole, and the confetti is laid on an arithmetic stagger (index
    maths, not random) so the art is identical on every run and no two flecks
    of one colour touch. The planets are the two things big enough to be a
    *shape* at 55%; everything else is meant to read as sparkle.
    """
    navy = mix(P["ink2"], P["black"], 0.45)
    x, y, w, h = _band(c, 22.0, navy, r=3.0)
    bottom = min(y + h, c.h)
    neon = (MAGENTA, CYAN, YELLOW)
    # Confetti: three rows, staggered, colour cycling so neighbours differ.
    for row in range(3):
        ry = y + 5.0 + row * 5.6
        for i in range(9):
            fx = x + 4.0 + i * 7.2 + ((i * 5 + row * 2) % 4) * 1.1
            if fx > x + w - 9.0 or ry > bottom - 3.0:
                continue
            # Leave room where the planets go.
            if (row == 1 and 2 <= i <= 3) or (row == 0 and 6 <= i <= 7):
                continue
            _squiggle(c, fx, ry, neon[(i + row) % 3], flip=1.0 if (i + row) % 2 else -1.0)
    # Pin-stars between the confetti: white, tiny, few.
    for px, py in ((x + 9.0, y + 3.6), (x + 30.0, y + 12.6), (x + 47.0, y + 4.2),
                   (x + 61.0, y + 14.4), (x + 20.0, y + 18.0)):
        _pin_star(c, px, py)
    for px, py in ((x + 16.0, y + 15.4), (x + 41.0, y + 8.0), (x + 55.0, y + 18.6)):
        c.circle(px, py, 0.7, fill=P["white"])
    # Two planets: one warm, one cool, on opposite sides so they balance.
    _planet(c, x + 22.0, y + 11.0, 3.0, mix(P["coral"], P["gold"], 0.45), YELLOW)
    _planet(c, x + 51.0, y + 6.6, 2.4, mix(P["water"], P["lavender"], 0.40), CYAN)


def rug_danceGameMat(c: Canvas) -> None:
    """
    A rhythm-game pad: dark charcoal, a thin silver rim, and four chunky
    chevrons in a cross round a blank centre — up magenta, down cyan, left
    and right yellow.

    Drawn as the smallest and squarest thing on the rug slot: 44 wide to the
    bands' 60-plus, and deeper than it is usual for a rug, so the outline
    says "pad" before the arrows say "game". The centre is left empty on
    purpose — a fifth mark there turns the cross into a flower.
    """
    charcoal = mix(P["black"], P["metalDk"], 0.14)
    x, y, w, h = _band(c, 30.0, charcoal, r=2.6, w=44.0)
    bottom = min(y + h, c.h)
    # The silver rim: one pale line just inside the outline, thick enough to
    # survive 55% — at 1px it would be a grey fringe rather than a rim.
    silver = tint(P["metal"], 0.30)
    c.rrect(x + 2.2, y + 2.2, w - 4.4, h - 4.4, r=1.8, ink=silver, lw=1.6)
    cx = x + w / 2
    cy = y + (bottom - y) / 2 + 0.6
    reach = 8.4
    _chevron(c, cx, cy - reach, 0.0, -1.0, MAGENTA)
    _chevron(c, cx, cy + reach, 0.0, 1.0, CYAN)
    _chevron(c, cx - reach * 1.35, cy, -1.0, 0.0, YELLOW)
    _chevron(c, cx + reach * 1.35, cy, 1.0, 0.0, YELLOW)
    # The blank centre is a shade lighter than the pad: a panel, not a hole.
    c.rrect(cx - 4.2, cy - 3.6, 8.4, 7.2, r=1.2, fill=tint(charcoal, 0.10),
            ink=shade(charcoal, 0.30), lw=LW_FACE)


def wallArt_hiScoreBoard(c: Canvas) -> None:
    """
    A black scoreboard inside a magenta neon line: three rows of glowing
    block glyphs — a short cyan name, a long yellow score — and a gold star
    beside the top row.

    No frame, no mount, no picture: the ink outline of the panel is the only
    edge it has, and the neon is drawn *inside* it with a halo bleeding out
    over the wall, which is what a lit tube on a black box does. The glyphs
    are fat blocks rather than letters because letters are noise at 55% and
    blocks are still a bright dash.
    """
    black = mix(P["black"], P["ink"], 0.55)
    pw, ph = 82.0, 58.0
    px, py = c.w / 2 - pw / 2, c.h / 2 - ph / 2
    # The halo first, so the panel's own outline sits on top of it.
    c.rrect(px - 2.4, py - 2.4, pw + 4.8, ph + 4.8, r=4.0, ink=alpha(MAGENTA, 0.20), lw=3.6)
    ix, iy, iw, ih = _art_frame(c, pw, ph, black, depth=6.0)
    c.rrect(px + 2.6, py + 2.6, pw - 5.2, ph - 5.2, r=2.6, ink=alpha(MAGENTA, 0.35), lw=4.0)
    c.rrect(px + 2.6, py + 2.6, pw - 5.2, ph - 5.2, r=2.6, ink=MAGENTA, lw=2.0)
    c.rrect(px + 2.6, py + 2.6, pw - 5.2, ph - 5.2, r=2.6, ink=alpha(P["white"], 0.35), lw=0.8)
    # Three rows, each a rank mark, a name and a score.
    row_h = 6.4
    for row in range(3):
        ry = iy + 6.0 + row * 13.0
        rank_x = ix + 6.0
        if row == 0:
            _star(c, rank_x, ry + row_h / 2, 4.4, fill=GOLD, ink=P["ink"], lw=LW_FACE)
            c.circle(rank_x - 1.2, ry + row_h / 2 - 1.4, 0.9, fill=tint(GOLD, 0.55))
        else:
            c.circle(rank_x, ry + row_h / 2, 1.5, fill=alpha(MAGENTA, 0.30))
            c.circle(rank_x, ry + row_h / 2, 0.9, fill=MAGENTA)
        end = _glyph_bar(c, ix + 13.0, ry, 3, CYAN)
        # The score shortens down the table: the top score is the longest bar.
        _glyph_bar(c, end + 5.0, ry, 7 - row, YELLOW)


# ------------------------------------------------------------------- cinema

def wallArt_nowShowingBoard(c: Canvas) -> None:
    """
    A marquee letterboard: a black board inside a red frame studded all the
    way round with warm bulbs, and three rows of white letter tiles.

    The bulbs are the silhouette — a dark rectangle rimmed with a ring of
    dots — so they sit on the frame's centreline at a pitch wide enough that
    each is still a disc at 55%, and each has a small halo so the rim glows
    rather than reading as a row of rivets. The tiles carry one dark mark
    each: a stem, a bar or a box, which is as much of a letter as fits.
    """
    red = shade(mix(P["coral"], P["carpet"], 0.30), 0.10)
    board = mix(P["black"], P["ink"], 0.45)
    fw, fh = 82.0, 60.0
    fx, fy = c.w / 2 - fw / 2, c.h / 2 - fh / 2
    ix, iy, iw, ih = _art_frame(c, fw, fh, red, depth=8.0)
    # A darker rebate round the opening, then the board.
    c.rect(ix - 1.4, iy - 1.4, iw + 2.8, ih + 2.8, fill=shade(red, 0.38))
    c.rrect(ix, iy, iw, ih, r=1.2, fill=board, ink=P["ink"], lw=LW_DETAIL)
    # Letterboard rails: faint grooves the tiles slot into.
    for k in range(1, 4):
        gy = iy + ih * k / 4
        c.line([(ix + 2.0, gy), (ix + iw - 2.0, gy)], tint(board, 0.12), 1.0)
    # Three rows of tiles, a title of three lines, each centred.
    tile, gap, word_gap = 4.6, 1.0, 3.2
    rows = ((3, 7), (5,), (6, 2))
    for r, words in enumerate(rows):
        total = sum(n * tile + (n - 1) * gap for n in words) + word_gap * (len(words) - 1)
        tx = c.w / 2 - total / 2
        ty = iy + ih * (r + 0.5) / 3 - 3.2
        for wi, n in enumerate(words):
            tx = _tile_word(c, tx, ty, n, seed=r * 2 + wi, tile=tile, gap=gap) + word_gap
    # The bulbs, on the frame's centreline: ten along the top and bottom, five
    # up each side between the corners, all with a halo behind them.
    inset = 4.0
    bulbs = []
    for i in range(10):
        bx = fx + inset + i * (fw - inset * 2) / 9
        bulbs.append((bx, fy + inset))
        bulbs.append((bx, fy + fh - inset))
    for j in range(1, 6):
        by = fy + inset + j * (fh - inset * 2) / 6
        bulbs.append((fx + inset, by))
        bulbs.append((fx + fw - inset, by))
    for bx, by in bulbs:
        c.circle(bx, by, 3.6, fill=alpha(YELLOW, 0.30))
    for bx, by in bulbs:
        c.circle(bx, by, 2.2, fill=YELLOW, ink=P["ink"], lw=LW_FACE)
        c.circle(bx - 0.6, by - 0.6, 0.7, fill=tint(YELLOW, 0.60))


def rug_multiplexCarpet(c: Canvas) -> None:
    """
    Foyer carpet: a deep navy-purple block with no border, scattered with
    teal squiggles, magenta stars and yellow dots.

    Borderless is the rule — every other rug is a bordered weave — so there
    is no inner line at all, only the outline; and it is drawn squarer than
    the galaxy band next door so the two dark speckled carpets never share a
    silhouette. The three kinds of fleck are three *shapes* as well as three
    colours, which is what keeps it readable when the colours go at 55%.
    """
    plum = shade(mix(P["wallNavy"], P["wallGrape"], 0.50), 0.40)
    x, y, w, h = _band(c, 30.0, plum, r=2.2, w=56.0)
    bottom = min(y + h, c.h)
    # Teal squiggles on a three-row stagger.
    for row in range(3):
        ry = y + 5.4 + row * 7.6
        for i in range(6):
            fx = x + 4.0 + i * 9.0 + ((i * 3 + row * 5) % 4) * 1.2
            if fx > x + w - 9.0 or ry > bottom - 3.0:
                continue
            _squiggle(c, fx, ry, TEAL, flip=1.0 if (i + row) % 2 else -1.0, lw=1.4)
    # Magenta stars, placed between the squiggle rows.
    for sx, sy in ((x + 12.0, y + 9.6), (x + 33.0, y + 17.0), (x + 47.0, y + 8.2),
                   (x + 21.0, y + 21.6), (x + 44.0, y + 20.8)):
        if sy < bottom - 3.0:
            _star(c, sx, sy, 2.6, fill=MAGENTA, ink=None)
    # Yellow dots, smallest of the three, filling the gaps.
    for dx, dy in ((x + 6.0, y + 16.4), (x + 25.0, y + 13.6), (x + 39.0, y + 13.0),
                   (x + 52.0, y + 15.8), (x + 16.0, y + 5.0), (x + 30.0, y + 24.0),
                   (x + 50.0, y + 24.2)):
        if dy < bottom - 2.5:
            c.circle(dx, dy, 1.2, fill=YELLOW)


def flooring_aisleLights(c: Canvas) -> None:
    """
    Aisle lighting: a shallow charcoal strip along the floor with a row of
    amber LEDs along its front edge and amber light pooling under it.

    Deliberately the shallowest floor piece in the game — half the height of
    a flooring band — so at 55% it is a dark bar with a dotted lit edge and
    nothing else. The pool is painted first and the strip over it, so what
    survives of the pool is the spill in front of the LEDs, on the floor,
    where light from a strip at ankle height actually falls.
    """
    charcoal = mix(P["black"], P["concrete"], 0.30)
    band_h = 13.0
    strip_bottom = BAND_CY + band_h / 2
    # The pool: two flat ellipses of amber, most of which the strip will cover.
    c.ellipse(c.w / 2, strip_bottom + 0.6, 33.0, 6.6, fill=alpha(AMBER, 0.20))
    c.ellipse(c.w / 2, strip_bottom + 0.4, 24.0, 4.4, fill=alpha(AMBER, 0.18))
    x, y, w, h = _band(c, band_h, charcoal, r=2.0)
    bottom = min(y + h, c.h)
    # A darker foot along the front edge so the strip has a side.
    c.rect(x + 1.4, bottom - 3.6, w - 2.8, 2.4, fill=shade(charcoal, 0.28))
    # The LEDs: nine along the front edge, each with a halo that spills past
    # the outline onto the floor in front.
    n = 9
    ly = bottom - 2.4
    for i in range(n):
        lx = x + 5.0 + i * (w - 10.0) / (n - 1)
        c.circle(lx, ly, 3.0, fill=alpha(AMBER, 0.30))
    for i in range(n):
        lx = x + 5.0 + i * (w - 10.0) / (n - 1)
        c.circle(lx, ly, 1.4, fill=AMBER)
        c.circle(lx - 0.4, ly - 0.4, 0.5, fill=tint(AMBER, 0.60))


PIECES = {
    "flooring_galaxyCarpet":   flooring_galaxyCarpet,
    "rug_danceGameMat":        rug_danceGameMat,
    "wallArt_hiScoreBoard":    wallArt_hiScoreBoard,
    "wallArt_nowShowingBoard": wallArt_nowShowingBoard,
    "rug_multiplexCarpet":     rug_multiplexCarpet,
    "flooring_aisleLights":    flooring_aisleLights,
}
