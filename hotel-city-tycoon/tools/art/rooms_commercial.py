"""
The rooms that take the player's money: cafe, gym, restaurant, bar, arcade,
cinema, disco and pool.

These eight get an exception the rest of the hotel does not. `ASSET-SPEC.md` §1
says their *built-in* equipment belongs to the building rather than to the decor
catalogue — a cafe without a counter is a beige rectangle, a cinema without a
screen is a dark one — so the fixed kit is drawn here: counters, a mirror wall,
a kitchen pass, a bottle shelf, a prize wall, a screen and its curtains, a
dance floor, a pool basin.

Everything the player can *buy* is still forbidden, and the temptation to draw
it is strongest exactly here. No stools at the bar, no tables in the
restaurant, no cabinets in the arcade, no seats in the cinema, no espresso
machine on the cafe counter: all of those are decor sprites, and a room with
one baked in shows it twice the moment somebody buys the real thing. What each
room owes the picture is the part a sprite can never supply — the architecture
that says what this place is from across a phone screen.

Two habits run through all eight. The horizontal centre of every room is left
free, because guests and staff stand on the floor line there. And each room
commits to one hero fixture plus two or three supporting marks, per ART-0 §4's
demand that a quarter of the room stay empty.
"""
from __future__ import annotations

from hcstyle import (
    P, RoomSpec, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix, math, window, counter,
)
from hcvariants import seeded


# ------------------------------------------------------------------ shared

def light_layer(c: Canvas) -> Canvas:
    """
    A blank canvas the size of the room, for anything genuinely see-through.

    The drawing primitives *write* their colour into the pixels: a fill carrying
    an alpha replaces what was underneath rather than tinting it, which on an
    opaque wall punches a translucent hole the backdrop shows through. Only
    `Canvas.blit` composites. So a neon halo or a beam of light is drawn on its
    own layer and blitted, and everything that merely wants to be a paler
    version of a colour uses `mix`/`tint`/`shade` instead and stays solid.
    """
    return Canvas(c.w, c.h, tier=c.tier)


def neon(c: Canvas, pts, colour, lw: float = 2.0) -> None:
    """
    A lit tube: a soft halo, the tube itself, and a hot core.

    Three concentric strokes rather than a blur, because a blur is a texture
    and ART-0 §8 forbids those. The halo is what makes the arcade and the disco
    feel switched on instead of merely painted.
    """
    glow = light_layer(c)
    glow.line(pts, alpha(colour, 0.22), lw * 3.2)
    glow.line(pts, alpha(colour, 0.46), lw * 1.9)
    glow.line(pts, colour, lw)
    glow.line(pts, tint(colour, 0.70), max(0.9, lw * 0.38))
    c.blit(glow, 0, 0)


def service_counter(c: Canvas, x, fy, w, h, body, top) -> None:
    """
    The shared `counter()` with a timber top you can actually see.

    Its slab is three pixels deep, which at furniture line weight is almost
    entirely outline — fine for a reception desk seen behind a receptionist,
    too thin for a cafe or a bar where the top edge is the thing the eye lands
    on. This puts a deeper slab over it and keeps everything else shared.
    """
    counter(c, x, fy, w, h, body=body, top=top)
    c.rrect(x - 1.4, fy - h - 3.0, w + 2.8, 4.8, r=1.8, fill=top, ink=P["ink"], lw=LW_DETAIL)


def tiled_dado(c: Canvas, fy: float, top: float, colour=None) -> None:
    """
    The band of wall tiling a wet room carries at knee height.

    Grout every sixteen pixels rather than at true tile pitch: a real tile grid
    is exactly the fine repeat ART-0 §4 says turns to mud on a phone.
    """
    colour = colour or P["white"]
    grout = mix(colour, P["tileDk"], 0.75)
    c.rect(0, top, c.w, fy - top, fill=colour)
    for i in range(1, int(c.w // 16) + 1):
        c.line([(i * 16, top + 1), (i * 16, fy - 1)], grout, LW_DETAIL)
    c.line([(0, top), (c.w, top)], P["ink"], LW_DETAIL)


# ------------------------------------------------------------------- cafe

def cafe(c: Canvas, fy: float) -> None:
    """
    A service counter under a shelf of cups, and a chalk board that says what
    the place sells. The espresso machine that would stand on the counter is
    decor, so the top is left deliberately bare for it.
    """
    # The counter is joinery, not a table pushed against the wall, which is why
    # it runs into the frame instead of stopping clear of it.
    cw = 116.0
    service_counter(c, 10, fy, cw, 30, body=P["coral"], top=P["woodPale"])
    seam = shade(P["coral"], 0.26)
    for i in range(1, 4):
        c.line([(10 + i * cw / 4, fy - 26), (10 + i * cw / 4, fy - 4)], seam, LW_DETAIL)
    c.rect(12, fy - 4.0, cw - 4, 2.4, fill=shade(P["coral"], 0.34))

    # Cup shelf above it. Two rows would read as a warehouse; one row of five
    # is enough to say "this is where the coffee comes from".
    sx, sw = 16.0, 104.0
    c.rect(sx, 34, sw, 3.4, fill=P["woodPale"], ink=P["ink"], lw=LW_DETAIL)
    for i in range(5):
        x = sx + 6 + i * 19
        c.rrect(x, 26.6, 8.0, 7.4, r=1.6,
                fill=P["white"] if i % 2 == 0 else P["mint"], ink=P["ink"], lw=LW_FACE)
        c.arc(x + 8.6, 30.4, 2.2, 2.0, 270, 90, P["ink"], LW_FACE)

    # The menu board: the room's label, and the only dark mass on a cream wall.
    bx, by, bw, bh = 152.0, 12.0, 88.0, 40.0
    c.rrect(bx, by, bw, bh, r=2.4, fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
    c.rrect(bx + 3, by + 3, bw - 6, bh - 6, r=1.6,
            ink=mix(P["ink2"], P["warmWhite"], 0.45), lw=LW_FACE)
    c.rrect(bx + bw * 0.28, by + 8, bw * 0.44, 3.4, r=1.2, fill=P["creamHi"])
    for i in range(3):
        y = by + 17 + i * 7.0
        c.rrect(bx + 9, y, bw * (0.46 - i * 0.06), 2.6, r=1.0, fill=P["warmWhite"])
        c.rrect(bx + bw - 22, y, 12.0, 2.6, r=1.0, fill=P["gold"])


# -------------------------------------------------------------------- gym

def gym(c: Canvas, fy: float) -> None:
    """
    A mirror wall and a set of wall bars. Both are bolted to the building, and
    between them they say "gym" without a single machine — which matters,
    because the treadmill and the weight rack are decor the player buys.
    """
    w = c.w
    # A gym mirror runs floor to near-ceiling, and what makes it read as glass
    # rather than as a pale panel is the strip of reflected floor along its
    # bottom edge. A mirror with nothing in it is just a hole in the wall.
    mx, my, mw, mh = 12.0, 15.0, 112.0, fy - 21.0
    c.rrect(mx, my, mw, mh, r=2.0, fill=P["glass"], ink=P["ink"], lw=LW_PROP)
    c.rect(mx + 2, my + mh - 12, mw - 4, 10, fill=mix(P["glass"], P["wood"], 0.45))
    c.line([(mx + mw / 2, my + 2), (mx + mw / 2, my + mh - 2)],
           mix(P["glass"], P["ink"], 0.30), LW_DETAIL)
    c.line([(mx + 14, my + mh - 10), (mx + 44, my + 6)], tint(P["glass"], 0.75), LW_PROP)
    c.line([(mx + 32, my + mh - 10), (mx + 50, my + mh - 32)], tint(P["glass"], 0.50), LW_DETAIL)

    # Wall bars. Chunky rungs on purpose: at ninety-six pixels of room height a
    # true ladder pitch closes up into a grey block.
    bx, bw = 150.0, 66.0
    for side in (0, 1):
        c.rrect(bx + side * (bw - 6), 14, 6.0, fy - 22, r=2.0,
                fill=P["woodPale"], ink=P["ink"], lw=LW_PROP)
    for i in range(6):
        c.rrect(bx + 4, 22 + i * 9.4, bw - 8, 3.2, r=1.4,
                fill=P["wood"], ink=P["ink"], lw=LW_FACE)

    # The barre. It is what turns a glazed panel into a place people train, and
    # it gives the mirror a horizon so it is not one undivided sheet.
    ry = my + mh * 0.60
    for x in (mx + 10, mx + mw - 10):
        c.line([(x, ry), (x, ry + 8)], P["ink"], 3.0)
        c.line([(x, ry), (x, ry + 8)], P["metalDk"], 1.6)
    c.line([(mx - 2, ry), (mx + mw + 2, ry)], P["ink"], 3.6)
    c.line([(mx - 2, ry), (mx + mw + 2, ry)], P["metal"], 2.0)

    # A towel rail on the far wall, so the end of the room is not simply blank.
    tx = w - 26
    c.line([(tx - 12, 24), (tx + 12, 24)], P["metalDk"], LW_PROP)
    for i, col in enumerate((P["linen"], P["glass"])):
        c.rrect(tx - 11 + i * 12, 24, 10.0, 17.0, r=2.0, fill=col, ink=P["ink"], lw=LW_FACE)


# ------------------------------------------------------------- restaurant

def restaurant(c: Canvas, fy: float) -> None:
    """
    A banquette down one wall and the kitchen pass at the other end.

    The banquette is the exception worth arguing for: it is upholstery, but it
    is built into the wall frame to frame, and without it a restaurant on a red
    wall is indistinguishable from a bar. The tables and chairs that stand in
    front of it are decor and are not drawn.
    """
    w = c.w
    rail_y = fy - 44.0
    # Two-tone walls, light above the rail and deep below. A single field of a
    # colour this saturated fights everything put on it; split, it reads as a
    # scheme and gives the room air at the top where nothing else happens.
    c.rect(0, 0, w, rail_y, fill=mix(P["wallRed"], P["creamHi"], 0.26))
    c.rect(0, rail_y, w, 3.0, fill=P["wallSand"], ink=P["ink"], lw=LW_DETAIL)

    # Banquette: buttoned back, and a base boxed to the floor. No legs — that
    # is the whole difference between built-in seating and the sofa the decor
    # catalogue sells.
    bw = 176.0
    c.rrect(2, rail_y + 4, bw + 4, 26, r=3.0, fill=P["creamHi"], ink=P["ink"], lw=LW_PROP)
    for i in range(5):
        x = 6 + bw * (i + 0.5) / 5
        c.line([(x, rail_y + 8), (x, rail_y + 26)], mix(P["creamHi"], P["goldDk"], 0.5), LW_DETAIL)
        c.circle(x, rail_y + 17, 1.2, fill=P["goldDk"])
    c.rrect(2, fy - 17, bw + 8, 17.0, r=2.4, fill=P["cream"], ink=P["ink"], lw=LW_PROP)
    c.rect(4, fy - 15, bw + 4, 2.6, fill=P["creamHi"])
    c.rect(6, fy - 6, bw, 1.6, fill=mix(P["cream"], P["goldDk"], 0.45))

    # The pass: a lit hatch into a kitchen we never see, with a plate ledge and
    # two heat lamps. The dark opening is the second-strongest shape in the room
    # and the reason the right half does not read as blank wall.
    px, pw = w - 146.0, 120.0
    py, ph = rail_y - 24.0, 42.0
    c.rrect(px - 4, py - 4, pw + 8, ph + 8, r=3.0, fill=P["wallSand"], ink=P["ink"], lw=LW_PROP)
    c.rrect(px, py, pw, ph, r=1.8, fill=P["ink2"], ink=P["ink"], lw=LW_DETAIL)
    c.rect(px, py + ph - 9, pw, 9, fill=mix(P["woodDk"], P["creamHi"], 0.38))
    for i in range(3):
        cx = px + pw * (i + 0.5) / 3
        c.ellipse(cx, py + ph - 6.5, 8.0, 2.6, fill=P["white"], ink=P["ink"], lw=LW_FACE)
        c.ellipse(cx, py + ph - 7.4, 4.4, 1.4, fill=P["glass"])
    for i in range(2):
        lx = px + pw * (0.3 + i * 0.4)
        c.line([(lx, py - 3), (lx, py + 2)], P["ink2"], LW_DETAIL)
        c.poly([(lx - 5, py + 8), (lx + 5, py + 8), (lx + 2, py + 2), (lx - 2, py + 2)],
               fill=P["gold"], ink=P["ink"], lw=LW_FACE)
        c.ellipse(lx, py + 8, 5.0, 1.4, fill=P["creamHi"])
    c.rrect(px - 7, py + ph + 3, pw + 14, 4.4, r=1.8, fill=P["metal"], ink=P["ink"], lw=LW_PROP)


# --------------------------------------------------------------------- bar

def bar(c: Canvas, fy: float) -> None:
    """
    A back-bar of bottles over a heavy counter, on a navy wall.

    Everything here has to be lighter than its background, which inverts the
    usual rule and is why the bottles carry the room: twelve bright shapes in
    two rows are legible at 1x in a way dark timber never would be. Their
    heights are uneven on purpose — a row of identical bottles reads as a rack
    of batteries.
    """
    w = c.w
    sx, sw = 18.0, 132.0
    c.rrect(sx, 14, sw, 40, r=2.4, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
    c.rect(sx + 3, 17, sw - 6, 34, fill=mix(shade(P["woodDk"], 0.52), P["gold"], 0.14))
    heights = (13.0, 10.0, 14.5, 11.5, 13.0, 9.5)
    spirits = (P["green"], P["coral"], P["glass"], P["gold"], P["lavender"], P["mint"])
    for row in range(2):
        y = 33.0 + row * 19.0
        for i in range(6):
            bxx = sx + 8 + i * 20.0
            bh = heights[(i + row * 2) % 6]
            col = spirits[(i + row * 3) % 6]
            c.rrect(bxx, y - bh, 6.4, bh, r=1.6, fill=col, ink=P["ink"], lw=LW_FACE)
            c.rect(bxx + 2.3, y - bh - 4.4, 1.9, 4.6, fill=col, ink=P["ink"], lw=LW_FACE)
            c.rect(bxx + 1.2, y - bh + 3.0, 4.0, 2.6, fill=tint(col, 0.55))
        c.rect(sx + 2, y, sw - 4, 2.6, fill=P["woodPale"], ink=P["ink"], lw=LW_FACE)

    # The counter, with a brass foot rail. The rail is what makes it a bar and
    # not a reception desk, and it fills the gap the missing stools leave.
    cw = 156.0
    service_counter(c, 12, fy, cw, 26, body=P["woodDk"], top=P["woodPale"])
    c.line([(16, fy - 6.0), (12 + cw - 4, fy - 6.0)], P["gold"], LW_PROP)
    for x in (22.0, 12 + cw - 10):
        c.line([(x, fy - 6.0), (x, fy - 1.0)], P["goldDk"], LW_DETAIL)

    # A hanging glass rack over the far end: fixed to the ceiling, and the one
    # piece of sparkle in an otherwise dark room.
    rx, rw = w - 74.0, 62.0
    c.rrect(rx, 10, rw, 4.0, r=1.4, fill=P["metalDk"], ink=P["ink"], lw=LW_DETAIL)
    for i in range(3):
        gx = rx + 11 + i * 20.0
        c.poly([(gx - 6, 14), (gx + 6, 14), (gx, 23)], fill=P["glass"], ink=P["ink"], lw=LW_FACE)
        c.line([(gx, 23), (gx, 28)], P["ink"], LW_FACE)
        c.line([(gx - 3.4, 28.6), (gx + 3.4, 28.6)], P["ink"], LW_FACE)


# ------------------------------------------------------------------ arcade

def arcade(c: Canvas, fy: float) -> None:
    """
    Neon and a prize wall. The cabinets are decor, so the left half of the room
    is kept clear for them and the fixed kit lives on the wall above.
    """
    w = c.w
    # A tube along the ceiling, drawn first: it sets the room's light before
    # anything else, which is how an arcade announces itself.
    neon(c, [(10, 9), (w - 10, 9)], P["glass"], 1.8)

    # The sign: a star over a bar of light. Abstract on purpose — lettering at
    # this size is a smear, and a star is read faster than a word anyway.
    star = []
    for k in range(11):
        rr = 18.0 if k % 2 == 0 else 7.8
        a = math.radians(-90 + k * 36)
        star.append((66 + rr * math.cos(a), 32 + rr * math.sin(a)))
    neon(c, star, P["coral"], 2.0)
    neon(c, [(40, 56), (92, 56)], P["gold"], 1.8)

    # Prize wall: a glazed case of plush, which is what a child actually plays
    # these machines for. Three shelves, biggest prize on top.
    px, py, pw, ph = 152.0, 16.0, 92.0, fy - 26.0
    c.rrect(px, py, pw, ph, r=2.4, fill=P["metalDk"], ink=P["ink"], lw=LW_PROP)
    c.rrect(px + 3, py + 3, pw - 6, ph - 6, r=1.6, fill=shade(P["wallGrape"], 0.30))
    rng = seeded("arcade:prizes")
    palette = (P["coral"], P["gold"], P["mint"], P["glass"], P["hairPink"], P["leaf"])
    for row in range(3):
        y = py + 6 + (row + 1) * (ph - 12) / 3
        c.rect(px + 4, y - 2.4, pw - 8, 2.4, fill=P["metal"], ink=P["ink"], lw=LW_FACE)
        for i in range(3):
            cx = px + 8 + (i + 0.5) * (pw - 16) / 3
            r = 6.4 - row * 0.8
            col = rng.pick(palette)
            for dx in (-1, 1):
                c.circle(cx + dx * r * 0.72, y - r * 2.0, r * 0.44,
                         fill=col, ink=P["ink"], lw=LW_FACE)
            c.circle(cx, y - r - 1.4, r, fill=col, ink=P["ink"], lw=LW_FACE)
            for dx in (-1, 1):
                c.circle(cx + dx * r * 0.34, y - r - 2.4, r * 0.16, fill=P["ink"])
    # One short glint in the corner of the glazing. A diagonal across the whole
    # case was the first try and it read as a crack, straight through the toys.
    glaze = light_layer(c)
    glaze.line([(px + 8, py + 24), (px + 26, py + 6)], alpha(P["white"], 0.34), LW_PROP)
    c.blit(glaze, 0, 0)


# ------------------------------------------------------------------ cinema

def cinema(c: Canvas, fy: float) -> None:
    """
    Screen, curtains, projector porthole.

    The screen has to be legible at 1x, which means big, bright, and carrying a
    picture: a blank white slab reads as a wall panel. Two masking bars and
    three flat shapes — a sun and two hills — is the smallest thing that reads
    as a film from across a room, and it survives the night filter still lit.
    """
    w = c.w
    sx, sy, sw, sh = 78.0, 16.0, w - 156.0, 48.0

    # The masking frame first, so the bright screen sits inside a dark border
    # rather than floating on a dark wall.
    c.rrect(sx - 5, sy - 5, sw + 10, sh + 10, r=3.0, fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
    c.rect(sx, sy, sw, sh, fill=P["linen"], ink=P["ink"], lw=LW_DETAIL)
    c.circle(sx + sw * 0.30, sy + sh * 0.36, 8.0, fill=P["gold"])
    c.pie(sx + sw * 0.64, sy + sh - 5, sw * 0.32, sh * 0.60, 180, 360, fill=P["glassDk"])
    c.pie(sx + sw * 0.32, sy + sh - 5, sw * 0.26, sh * 0.42, 180, 360, fill=P["metalDk"])
    # Letterbox bars. Two dark strips are what make a bright rectangle a film.
    c.rect(sx, sy, sw, 5.0, fill=P["ink2"])
    c.rect(sx, sy + sh - 5, sw, 5.0, fill=P["ink2"])

    # Curtains: one each side, drawn as a stack of folds so the silhouette is
    # broken. A flat rectangle in the same red would read as a pillar.
    fold = shade(P["carpet"], 0.32)
    for cx in (40.0, w - 76.0):
        c.rrect(cx, 10, 36.0, fy - 14, r=3.0, fill=P["carpet"], ink=P["ink"], lw=LW_PROP)
        for i in range(3):
            c.line([(cx + 6 + i * 10.0, 14), (cx + 6 + i * 10.0, fy - 8)], fold, LW_DETAIL)
        c.rect(cx + 1, fy - 9, 34.0, 4.0, fill=fold)

    # Pelmet across the top, tying the two curtains into one proscenium.
    c.rrect(34, 6, w - 68, 10.0, r=2.4, fill=shade(P["carpet"], 0.16), ink=P["ink"], lw=LW_PROP)
    for i in range(int((w - 68) // 16)):
        c.pie(42 + i * 16, 12.0, 8.0, 5.0, 0, 180, fill=P["carpet"])

    # Projection booth: a lit porthole and the beam it throws. One low-opacity
    # wedge — enough to explain the porthole, not enough to sit on top of the
    # guests standing underneath it.
    beam = light_layer(c)
    beam.poly([(30, 24), (30, 30), (sx + 4, sy + 6), (sx + 4, sy + sh - 6)],
              fill=alpha(P["creamHi"], 0.22))
    c.blit(beam, 0, 0)
    c.rrect(10, 18, 20.0, 15.0, r=2.0, fill=P["ink2"], ink=P["ink"], lw=LW_PROP)
    c.rrect(13, 21, 14.0, 9.0, r=1.2, fill=P["creamHi"], ink=P["ink"], lw=LW_FACE)

    # Aisle lights let into the floor: the detail every cinema has and no other
    # room does, and it keeps the floor line readable in the night variant.
    for i in range(int(w // 46)):
        c.circle(24 + i * 46, fy + 5.0, 1.8, fill=P["gold"], ink=P["ink"], lw=LW_FACE)


# ------------------------------------------------------------------- disco

def disco(c: Canvas, fy: float) -> None:
    """
    The room the data calls `spa` and the player calls the Disco: lights down,
    music up.

    A dance floor, a mirror ball, two speaker stacks and neon on the wall. The
    floor is the hero — a lit chequer is unmistakable even at thumbnail size —
    and the ball is what stops the room reading as a chequered bathroom. The
    room asks for a deeper floor band than the rest of the hotel so the chequer
    gets two rows; one row reads as a stripe, not a floor.
    """
    w = c.w
    rng = seeded("disco:floor")
    lit = (P["coral"], P["gold"], P["water"], P["hairPink"])

    # Beams first, so the ball sits on top of its own light. They stop at the
    # floor line: run them onto the chequer and they wash the one thing in the
    # room that has to stay saturated.
    bx, by = w / 2, 32.0
    beams = light_layer(c)
    for dx, col in ((-2.0, P["water"]), (-0.8, P["gold"]),
                    (0.8, P["hairPink"]), (2.0, P["coral"])):
        beams.poly([(bx, by), (bx + dx * 52 - 13, fy), (bx + dx * 52 + 13, fy)],
                   fill=alpha(col, 0.20))
    c.blit(beams, 0, 0)

    # Dance floor: lit cells alternating with dark ones. All-lit is a picnic
    # blanket; the dark half is what makes the bright half read as switched on.
    cell_w, cell_h = 24.0, (c.h - fy) / 2
    for row in range(2):
        for i in range(int(w // cell_w) + 1):
            x = i * cell_w
            fill = P["ink2"] if (row + i) % 2 else tint(rng.pick(lit), 0.12)
            c.rect(x, fy + row * cell_h, min(cell_w, w - x), cell_h,
                   fill=fill, ink=P["ink"], lw=LW_DETAIL)

    # Mirror ball. The facets are a scatter of small squares rather than a drawn
    # grid: a grid on a sphere needs curvature this style does not have.
    c.line([(bx, 2), (bx, by - 12)], P["ink2"], LW_DETAIL)
    c.circle(bx, by, 13.0, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    for row in range(5):
        for col_i in range(5):
            fx, fy_ = bx - 9.6 + col_i * 4.8, by - 9.6 + row * 4.8
            if (fx - bx) ** 2 + (fy_ - by) ** 2 > 108:
                continue
            c.rect(fx - 2.1, fy_ - 2.1, 4.2, 4.2,
                   fill=(P["white"], P["metalDk"], P["glass"])[(row * 2 + col_i) % 3])
    c.circle(bx, by, 13.0, ink=P["ink"], lw=LW_PROP)
    for dx, dy in ((-20, -13), (20, -13), (0, -22)):
        c.line([(bx + dx - 3.4, by + dy), (bx + dx + 3.4, by + dy)], P["white"], LW_DETAIL)
        c.line([(bx + dx, by + dy - 3.4), (bx + dx, by + dy + 3.4)], P["white"], LW_DETAIL)

    # Speaker stacks, one at each end: a big box under a small one, which is
    # what makes it read as a stack and not a wardrobe.
    for side in (0, 1):
        x = 14.0 + side * (w - 74.0)
        c.rrect(x, fy - 40, 60.0, 40.0, r=2.4, fill=P["black"], ink=P["ink"], lw=LW_PROP)
        for i in range(2):
            c.circle(x + 16 + i * 28, fy - 22, 11.0, fill=P["ink2"], ink=P["ink"], lw=LW_DETAIL)
            c.circle(x + 16 + i * 28, fy - 22, 4.2, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
        c.rrect(x + 6, fy - 60, 48.0, 19.0, r=2.0, fill=P["black"], ink=P["ink"], lw=LW_PROP)
        c.circle(x + 20, fy - 50.5, 7.0, fill=P["ink2"], ink=P["ink"], lw=LW_DETAIL)
        c.circle(x + 20, fy - 50.5, 2.6, fill=P["metalDk"], ink=P["ink"], lw=LW_FACE)
        c.rrect(x + 34, fy - 55, 14.0, 9.0, r=1.4, fill=P["ink2"], ink=P["ink"], lw=LW_FACE)

    # Two neon bars on the back wall, either side of the ball.
    neon(c, [(88, 16), (128, 16)], P["hairPink"], 1.8)
    neon(c, [(w - 128, 16), (w - 88, 16)], P["water"], 1.8)


# -------------------------------------------------------------------- pool

def pool(c: Canvas, fy: float) -> None:
    """
    Four blocks of hotel, and the water has to read before anything else does.

    That is a size problem more than a drawing one: a pool sunk into a
    thirteen-pixel floor band is a puddle. So this room asks for a deep floor
    (`floor_h` in the registry below) and spends nearly all of it on the basin —
    a two-tone body of water under a mosaic waterline, with a white coping wide
    enough for guests to stand on at the floor line.
    """
    w = c.w
    # Wet-room tiling to knee height, which also stops the teal wall from
    # meeting the teal water in one undifferentiated field.
    tiled_dado(c, fy, fy - 12.0, P["glass"])

    # A pool hall is the brightest room in the hotel, and two tall lights are
    # what says so on a wall this wide.
    window(c, 50, 13, 60, 40)
    window(c, w - 110, 13, 60, 40)

    # A lifebuoy between them: one round shape on a long flat wall, and the
    # fastest possible "this is a swimming pool" at thumbnail size.
    lx, ly = w / 2, 32.0
    c.circle(lx, ly, 16.0, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    for a in (0, 180):
        c.pie(lx, ly, 16.0, 16.0, a + 12, a + 78, fill=P["coral"])
    c.circle(lx, ly, 7.0, fill=P["wallTeal"], ink=P["ink"], lw=LW_PROP)

    px, pw = 76.0, w - 152.0
    top = fy + 4.0
    # Grout on the deck either side of the basin. Without it the deck and the
    # coping merge into one pale field and the pool stops looking sunk into it.
    for i in range(int(w // 18) + 1):
        gx = i * 18.0
        if px - 10 < gx < px + pw + 10:
            continue
        c.line([(gx, fy + 2), (gx, c.h - 2)], P["tileDk"], LW_DETAIL)

    # The basin, cut into the deck: coping lip first at the floor line so feet
    # have something to stand on, then the water below it.
    c.rrect(px - 6, fy, pw + 12, 7.0, r=2.4, fill=P["white"], ink=P["ink"], lw=LW_PROP)
    c.rrect(px, top, pw, c.h - top - 2.0, r=4.0, fill=P["waterDk"], ink=P["ink"], lw=LW_PROP)
    c.rrect(px + 2.5, top + 2.5, pw - 5, c.h - top - 7.0, r=3.0, fill=P["water"])
    # A deeper tone across the bottom third. Two tones is the whole of the
    # shading budget, and spending it on depth is what stops the basin reading
    # as a flat blue sticker laid on the deck.
    c.rect(px + 3.5, c.h - 12.0, pw - 7, 6.0, fill=mix(P["water"], P["waterDk"], 0.55))
    for i in range(int((pw - 8) // 9)):
        c.rect(px + 4 + i * 9, top + 3.0, 7.0, 3.2,
               fill=P["glass"] if i % 2 == 0 else P["waterDk"])

    # Ripples: short arcs, one to a lane so they spread rather than clump, and
    # placed from a keyed stream so the same pool is the same pool every run.
    rng = seeded("pool:ripples")
    lanes = int(pw // 34)
    for k in range(lanes):
        rx = px + 14 + (k + rng.between(0.15, 0.85)) * (pw - 34) / lanes
        ry = rng.between(top + 11, c.h - 9)
        c.arc(rx, ry, rng.between(5.0, 8.0), 2.4, 190, 350, P["white"], LW_DETAIL)
        c.arc(rx + 9, ry + 4, 4.0, 2.0, 190, 350, tint(P["water"], 0.55), LW_DETAIL)

    # The ladder, hooked over the coping at the deep end. Ink under metal is the
    # same trick the character limbs use: it outlines a stroke that has no fill.
    ldx = px + pw * 0.86
    # Both rails rise straight and are capped by a crossbar. Splaying their
    # tops was the first attempt and, with no perspective to explain the curve,
    # it read as a pair of antennae rather than as handrails.
    for x in (ldx, ldx + 13.0):
        c.line([(x, c.h - 8), (x, fy - 12)], P["ink"], 3.6)
        c.line([(x, c.h - 8), (x, fy - 12)], P["metal"], 2.0)
    c.line([(ldx, fy - 12), (ldx + 13, fy - 12)], P["ink"], 3.6)
    c.line([(ldx, fy - 12), (ldx + 13, fy - 12)], P["metal"], 2.0)
    for i in range(2):
        y = top + 9.0 + i * 9.0
        c.line([(ldx, y), (ldx + 13, y)], P["ink"], 3.2)
        c.line([(ldx, y), (ldx + 13, y)], P["metal"], 1.8)


ROOMS = {
    "cafe":       RoomSpec(P["wallCream"], P["wood"], cafe),
    "gym":        RoomSpec(P["wallSky"], P["wood"], gym),
    "restaurant": RoomSpec(P["wallRed"], P["wood"], restaurant),
    "bar":        RoomSpec(P["wallNavy"], P["woodDk"], bar),
    "arcade":     RoomSpec(P["wallGrape"], P["carpet"], arcade),
    "cinema":     RoomSpec(P["wallNavy"], P["carpet"], cinema),
    # The disco is the one room whose wall is not straight out of `ROOM_WALL`:
    # the palette's mint was chosen when this room was still a spa, and a mint
    # disco cannot hold neon. A grape darkened toward the ink keeps it in the
    # family while giving the lights something to burn against. Its floor is
    # deep because the dance floor is the room.
    "spa":        RoomSpec(mix(P["wallGrape"], P["ink"], 0.34), P["ink2"], disco, floor_h=22.0),
    # The pool pays for its depth too: a standard floor band is thirteen pixels
    # and a basin cut into that is a puddle.
    "pool":       RoomSpec(P["wallTeal"], P["tile"], pool, floor_h=34.0),
}
