"""
The nine guest bedrooms, from a 3,000-coin box to the presidential suite.

A bedroom cannot be told apart by its furniture. The bed, the lamp and the rug
are decor sprites the renderer drops on top, and the very same bed can stand in
an economy room and in the suite. What 700,000 coins actually buys is *the
room* — its windows, its mouldings, its second storey — so the architecture has
to carry the whole escalation on its own, and it has to do it at 128 pixels a
block on a phone.

Each tier therefore adds one step that is visible in a second:

    economy       one small window, a plain door
    standard      a wider window on a cill, a panelled door, a number plaque
    double        two windows, a transomed door, a picture rail
    family        a three-pane window and a sleeping alcove, on a dado
    deluxe        arched windows, panelled wainscot, cornice, ceiling rose
    executive     three arches and a chimney breast, over parquet
    honeymoon     arched balcony doors onto a balustrade, a rose ceiling
    luxurySuite   a bay window, double doors under a fanlight, twin roses
    presidential  two storeys: a mezzanine, its railing and its stair

The lower middle of every room is left empty on purpose: that is where the bed
and the guests are composited, and it is also where ART-0 §4's quarter of empty
canvas comes from. Nothing movable is drawn here — no bed, no chair, no lamp,
no plant, no picture. Only the building.
"""
from __future__ import annotations

from hcstyle import (
    P, RoomSpec, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, mix, shade, tint,
)

#: How far inside the room frame any full-width moulding stops. The shell has
#: already drawn a 2px frame; running a cornice over it thins that frame in a
#: way that shows up the moment two rooms sit side by side.
INSET = 3.0


# ------------------------------------------------------------------ mouldings

def _trim(wall):
    """
    The painted woodwork of a room: its own wall, most of the way to white.

    Deriving it from the wall rather than using one shared off-white is what
    keeps nine differently-coloured bedrooms looking like nine rooms in one
    hotel instead of nine rooms with the same skirting bought in bulk.
    """
    return tint(wall, 0.66)


def _cornice(c: Canvas, wall, y: float = 3.5, h: float = 6.0) -> None:
    """
    The moulded band where wall meets ceiling. The first sign of money.

    Two steps rather than one flat band: a deep fascia with a narrow fillet
    hanging below it. A single stripe of trim read as a join between two rooms
    the first time it was drawn, and a cornice that reads as a seam is worse
    than no cornice at all.
    """
    trim = _trim(wall)
    c.rect(INSET, y, c.w - INSET * 2, h, fill=trim)
    c.line([(INSET, y + h), (c.w - INSET, y + h)], P["ink"], LW_DETAIL)
    c.line([(INSET, y + h * 0.62), (c.w - INSET, y + h * 0.62)],
           alpha(P["ink2"], 0.35), LW_FACE)
    c.rect(INSET, y + h + 1.4, c.w - INSET * 2, 1.6, fill=trim)


def _picture_rail(c: Canvas, wall, y: float) -> None:
    """A single rail around the room at window-head height."""
    c.rect(INSET, y, c.w - INSET * 2, 1.8, fill=_trim(wall))
    c.line([(INSET, y + 1.8), (c.w - INSET, y + 1.8)], alpha(P["ink"], 0.75), LW_FACE)


def _dado(c: Canvas, wall, fy: float, y_off: float = 22.0) -> None:
    """
    A dado rail with nothing under it.

    The cheap half of panelling: a family room gets the rail, and only from the
    deluxe up does the wall below it fill in with panels.
    """
    trim = _trim(wall)
    y = fy - y_off
    c.rrect(INSET, y, c.w - INSET * 2, 2.4, r=1.0, fill=trim, ink=P["ink"], lw=LW_DETAIL)


def _wainscot(c: Canvas, wall, fy: float, x: float, w: float,
              h: float = 18.0, panels: int = 6) -> None:
    """
    Panelled wainscot: a capping rail over a run of recessed panels.

    Drawn before doors and windows so that anything standing against the wall
    sits in front of it, which is how a real dado behaves and, more usefully,
    is what stops a door looking like it has been cut out of the panelling.
    """
    trim = _trim(wall)
    top = fy - h
    c.rect(x, top, w, h, fill=trim)
    c.rrect(x, top - 2.4, w, 3.0, r=1.2, fill=tint(trim, 0.25), ink=P["ink"], lw=LW_DETAIL)
    gap = 4.0
    pw = (w - gap * (panels + 1)) / panels
    if pw < 6.0:                       # below this a panel is a smudge, so skip them
        return
    for i in range(panels):
        px = x + gap + i * (pw + gap)
        c.rrect(px, top + 3.4, pw, h - 6.6, r=1.4,
                fill=alpha(shade(trim, 0.10), 0.85), ink=alpha(P["ink"], 0.70), lw=LW_FACE)


def _ceiling_rose(c: Canvas, wall, cx: float, cy: float, r: float = 8.0) -> None:
    """
    The plaster medallion a light hangs from — the mount only.

    The chandelier itself is decor the player buys, so all the room owes it is
    somewhere convincing to be screwed to, and the gold boss in the middle is
    that screw fixing.
    """
    trim = _trim(wall)
    c.circle(cx, cy, r, fill=trim, ink=P["ink"], lw=LW_DETAIL)
    c.circle(cx, cy, r * 0.60, fill=tint(trim, 0.30), ink=alpha(P["ink"], 0.7), lw=LW_FACE)
    c.circle(cx, cy, r * 0.22, fill=P["gold"], ink=P["ink"], lw=LW_FACE)


# -------------------------------------------------------------------- glazing

def _glazing(c: Canvas, x: float, y: float, w: float, h: float,
             panes: int = 2, arch: bool = False) -> None:
    """
    Daylight behind glass, square-headed or arched.

    `hcstyle.window` is the square-headed version of exactly this, and the
    guest tiers turn on windows getting taller and rounder as they get dearer.
    A semicircular head is not something its rounded rectangle can fake: at
    r = w/2 the cill rounds off too and the window reads as a pill. So the arch
    is a half disc on a shaft, stroked to match, and the view through it is the
    same two towers every other window in the hotel looks at.
    """
    rise = min(w / 2, h * 0.55) if arch else 0.0
    spring = y + rise
    cx = x + w / 2
    bottom = y + h
    shaft = bottom - spring

    if arch:
        c.pie(cx, spring, w / 2, rise, 180, 360, fill=P["glass"])
    c.rect(x, spring, w, shaft, fill=P["glass"])

    # The city outside, kept inside the straight shaft: spilling it into the
    # arch head would need a clip nobody has, and a plain lit fanlight above a
    # skyline is what a real arched window looks like anyway.
    c.rect(x + 1.5, bottom - shaft * 0.44, w - 3, shaft * 0.44 - 1.5,
           fill=alpha(P["cityFar"], 0.85))
    c.rrect(x + w * 0.16, bottom - shaft * 0.52, w * 0.22, shaft * 0.50, r=1,
            fill=alpha(P["cityNear"], 0.70))
    c.rrect(x + w * 0.56, bottom - shaft * 0.44, w * 0.26, shaft * 0.42, r=1,
            fill=alpha(P["cityNear"], 0.55))
    # Sun glint: two thin diagonals, the only gloss allowed in the room.
    c.line([(x + w * 0.18, bottom - shaft * 0.24), (x + w * 0.46, spring + shaft * 0.12)],
           alpha(P["white"], 0.55), LW_DETAIL)
    c.line([(x + w * 0.40, bottom - shaft * 0.14), (x + w * 0.58, bottom - shaft * 0.44)],
           alpha(P["white"], 0.40), LW_DETAIL * 0.8)

    if arch:
        c.arc(cx, spring, w / 2, rise, 180, 360, P["ink"], LW_PROP)
        for ex in (x, x + w):
            c.line([(ex, spring), (ex, bottom)], P["ink"], LW_PROP)
        c.line([(x, bottom), (x + w, bottom)], P["ink"], LW_PROP)
        c.line([(x + 1.0, spring), (x + w - 1.0, spring)], P["ink"], LW_DETAIL)
    else:
        c.rrect(x, y, w, h, r=1.4, ink=P["ink"], lw=LW_PROP)

    # Mullions. One bar per pane boundary and no transoms: a full grid turns to
    # mud at 1x, which is the whole reason the reference glazing is this plain.
    for i in range(1, panes):
        mx = x + w * i / panes
        c.line([(mx, spring + 0.6), (mx, bottom - 1.2)], P["ink"], LW_DETAIL)


def _cill(c: Canvas, wall, x: float, y: float, w: float) -> None:
    """The shelf under a window. Standard up; economy does without."""
    c.rrect(x - 2.4, y, w + 4.8, 3.0, r=1.2, fill=_trim(wall), ink=P["ink"], lw=LW_DETAIL)


# ---------------------------------------------------------------------- doors

def _door(c: Canvas, wall, x: float, fy: float, w: float, h: float,
          panels: int = 2, transom: float = 0.0, fanlight: float = 0.0) -> None:
    """
    The corridor door, in the hotel's own joinery.

    Every guest room has one and it is always at an end wall, because a door in
    the middle of the room is a door the bed would stand in front of.
    """
    leaf = P["woodDk"]
    top = fy - h
    if transom > 0:
        c.rrect(x, top - transom - 1.0, w, transom, r=1.2,
                fill=P["glass"], ink=P["ink"], lw=LW_DETAIL)
        c.line([(x + w / 2, top - transom - 0.5), (x + w / 2, top - 1.5)], P["ink"], LW_FACE)
    if fanlight > 0:
        c.pie(x + w / 2, top - 1.0, w / 2, fanlight, 180, 360, fill=P["glass"])
        c.arc(x + w / 2, top - 1.0, w / 2, fanlight, 180, 360, P["ink"], LW_DETAIL)
        for k in (-0.5, 0.0, 0.5):
            c.line([(x + w / 2, top - 1.0),
                    (x + w / 2 + k * w * 0.46, top - 1.0 - fanlight * (1 - abs(k) * 0.5))],
                   alpha(P["ink"], 0.8), LW_FACE)

    c.rrect(x, top, w, h, r=2.0, fill=leaf, ink=P["ink"], lw=LW_PROP)
    ph = (h - 6.0 - 3.0 * (panels - 1)) / panels
    for i in range(panels):
        c.rrect(x + w * 0.16, top + 3.0 + i * (ph + 3.0), w * 0.68, ph, r=1.2,
                fill=alpha(tint(leaf, 0.22), 0.75), ink=alpha(P["ink"], 0.6), lw=LW_FACE)
    c.circle(x + w * 0.82, fy - h * 0.44, 1.3, fill=P["gold"], ink=P["ink"], lw=LW_FACE)


def _double_doors(c: Canvas, wall, x: float, fy: float, w: float, h: float,
                  fanlight: float = 0.0, glazed: bool = False) -> None:
    """
    A pair of leaves. The suites' entrance, and the honeymoon room's balcony.

    `glazed` swaps the timber for daylight, which is the only difference
    between a grand door and a door onto a balcony seen from the front.
    """
    trim = _trim(wall)
    top = fy - h
    if fanlight > 0:
        c.pie(x + w / 2, top + 0.5, w / 2, fanlight, 180, 360, fill=P["glass"])
        c.arc(x + w / 2, top + 0.5, w / 2, fanlight, 180, 360, P["ink"], LW_PROP)
        for k in (-0.62, -0.24, 0.24, 0.62):
            c.line([(x + w / 2, top + 0.5),
                    (x + w / 2 + k * w * 0.48, top + 0.5 - fanlight * (1 - abs(k) * 0.55))],
                   alpha(P["ink"], 0.75), LW_FACE)

    for side in (0, 1):
        lx = x + side * w / 2
        lw_ = w / 2
        if glazed:
            c.rect(lx, top, lw_, h, fill=P["glass"])
            c.rect(lx + 1.5, fy - h * 0.34, lw_ - 3, h * 0.30, fill=alpha(P["cityFar"], 0.8))
            c.rrect(lx + lw_ * 0.24, fy - h * 0.40, lw_ * 0.30, h * 0.36, r=1,
                    fill=alpha(P["cityNear"], 0.62))
            c.line([(lx + lw_ * 0.24, fy - h * 0.20), (lx + lw_ * 0.66, fy - h * 0.62)],
                   alpha(P["white"], 0.5), LW_DETAIL)
            c.rrect(lx, top, lw_, h, r=1.6, ink=P["ink"], lw=LW_PROP)
            c.line([(lx + lw_ / 2, top + 1.5), (lx + lw_ / 2, fy - 1.5)], P["ink"], LW_DETAIL)
        else:
            c.rrect(lx, top, lw_, h, r=2.0, fill=P["woodDk"], ink=P["ink"], lw=LW_PROP)
            for i in range(2):
                c.rrect(lx + lw_ * 0.18, top + 3.5 + i * (h * 0.46), lw_ * 0.64, h * 0.40,
                        r=1.4, fill=alpha(tint(P["woodDk"], 0.24), 0.75),
                        ink=alpha(P["ink"], 0.6), lw=LW_FACE)
    # Handles meeting at the meeting stile: the mark that says "double doors".
    for dx in (-2.6, 2.6):
        c.circle(x + w / 2 + dx, fy - h * 0.44, 1.3, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    c.rrect(x - 2.0, top - 2.0, w + 4.0, 3.0, r=1.2, fill=trim, ink=P["ink"], lw=LW_DETAIL)


# ------------------------------------------------------------ other structure

def _balustrade(c: Canvas, wall, x: float, y_top: float, w: float, h: float) -> None:
    """
    A railing seen dead on: two rails and a comb of balusters.

    The balusters are lines rather than outlined shapes on purpose — an
    outlined baluster is three pixels wide at 1x, of which two are outline, and
    the railing turns into a dark bar.
    """
    trim = _trim(wall)
    n = max(3, int(w // 14))
    for i in range(1, n):
        bx = x + i * w / n
        c.line([(bx, y_top + 2.0), (bx, y_top + h - 1.4)], P["ink2"], LW_DETAIL)
    c.rrect(x, y_top, w, 2.8, r=1.2, fill=trim, ink=P["ink"], lw=LW_DETAIL)
    c.rrect(x, y_top + h - 2.4, w, 2.4, r=1.0, fill=trim, ink=P["ink"], lw=LW_DETAIL)


def _alcove(c: Canvas, wall, x: float, fy: float, w: float, h: float) -> None:
    """
    A recess in the wall with a shelf across it — the family room's berths.

    Square-headed, and that is the whole design. Drawn with an arched head it
    read as a tunnel through to the next room, or worse as a bread oven; a
    square opening divided in two reads as somewhere a second and third guest
    sleep, which is the one thing a family room owes the player at a glance.

    Recessed rather than built, so whatever is parked in it stands in front of
    the opening instead of inside a box that has been drawn twice. And painted
    rather than shadowed: darkening the wall itself turned a peach room brown.
    """
    trim = _trim(wall)
    lining = shade(trim, 0.10)
    top = fy - h

    # The reveal: the thickness of the wall the opening is cut through.
    c.rrect(x - 3.4, top - 3.4, w + 6.8, h + 3.4, r=4.0,
            fill=trim, ink=P["ink"], lw=LW_PROP)
    c.rrect(x, top, w, h, r=2.4, fill=lining, ink=P["ink"], lw=LW_PROP)
    # One shadow under each head, which is all the depth a flat room may claim.
    c.rect(x + 1.4, top + 1.4, w - 2.8, 3.2, fill=shade(lining, 0.16))
    c.rrect(x - 1.6, top + h * 0.50, w + 3.2, 4.0, r=1.6,
            fill=trim, ink=P["ink"], lw=LW_PROP)
    c.rect(x + 1.4, top + h * 0.50 + 4.0, w - 2.8, 3.2, fill=shade(lining, 0.16))


def _chimney_breast(c: Canvas, wall, x: float, fy: float, w: float, top: float) -> None:
    """
    The chimney breast: a pier of wall with a hearth opening and a mantel.

    No fire, no fender, no logs. A lit grate is a decor sprite and an unlit one
    is a black hole, so what the building supplies is the opening and the shelf
    over it.

    The opening is arched and narrow. Square and wide, as it was drawn first,
    it read as a television — which is the failure mode of every flat grey
    rectangle in a wall, and the reason the stone surround around it is not
    optional.
    """
    trim = _trim(wall)
    c.rect(x, top, w, fy - top, fill=tint(wall, 0.24))
    c.rect(x + w, top, 2.6, fy - top, fill=alpha(P["ink"], 0.10))
    for ex in (x, x + w):
        c.line([(ex, top), (ex, fy)], P["ink"], LW_PROP)

    open_w = w * 0.44
    open_h = 30.0
    ox = x + (w - open_w) / 2
    rise = open_w * 0.34
    cx = ox + open_w / 2
    # Surround, then the void inside it, then the mantel across the top.
    c.rrect(ox - 6.0, fy - open_h - 7.0, open_w + 12.0, open_h + 7.0, r=3.0,
            fill=trim, ink=P["ink"], lw=LW_PROP)
    c.pie(cx, fy - open_h + rise, open_w / 2, rise, 180, 360, fill=shade(wall, 0.58))
    c.rect(ox, fy - open_h + rise, open_w, open_h - rise, fill=shade(wall, 0.58))
    c.arc(cx, fy - open_h + rise, open_w / 2, rise, 180, 360, P["ink"], LW_PROP)
    for ex in (ox, ox + open_w):
        c.line([(ex, fy - open_h + rise), (ex, fy)], P["ink"], LW_PROP)
    c.rrect(x - 4.0, fy - open_h - 13.0, w + 8.0, 5.4, r=2.0,
            fill=trim, ink=P["ink"], lw=LW_PROP)
    c.rrect(ox - 9.0, fy - 1.4, open_w + 18.0, 4.4, r=1.6,
            fill=P["tile"], ink=P["ink"], lw=LW_DETAIL)


def _bay(c: Canvas, wall, x: float, y: float, w: float, h: float, lights: int = 3) -> None:
    """
    A bay window, flattened.

    A real bay turns two corners, and turning a corner is perspective, which
    ART-0 §2 forbids outright. What survives the flattening is what a bay
    actually looks like from the street: one wide framed opening holding a row
    of arched lights over a deep shelf, and that reads as the grandest window
    in the hotel without tilting a single edge.
    """
    trim = _trim(wall)
    c.rrect(x, y, w, h, r=4.0, fill=trim, ink=P["ink"], lw=LW_PROP)
    gap = 5.0
    lw_ = (w - gap * (lights + 1)) / lights
    for i in range(lights):
        _glazing(c, x + gap + i * (lw_ + gap), y + gap, lw_, h - gap * 2,
                 panes=1, arch=True)
    c.rrect(x - 6.0, y + h - 1.0, w + 12.0, 5.0, r=2.0,
            fill=trim, ink=P["ink"], lw=LW_PROP)


def _mezzanine(c: Canvas, wall, floor, x: float, y: float, w: float) -> None:
    """
    The upper deck of a two-storey suite, and the railing along its edge.

    The deck is the only horizontal the hotel ever draws across the middle of a
    room, so it is given the full frame weight: at a glance it has to read as a
    floor somebody could stand on, not as a shelf.
    """
    slab = 9.0
    c.rect(x, y, w, slab, fill=floor)
    c.rect(x, y, w, slab * 0.30, fill=tint(floor, 0.18))
    c.rect(x, y + slab - 2.0, w, 2.0, fill=shade(floor, 0.34))
    c.rect(x, y, w, slab, ink=P["ink"], lw=LW_PROP)
    _balustrade(c, wall, x, y - 20.0, w, 20.0)


def _stair(c: Canvas, wall, tread, x_top: float, y_top: float,
           x_bot: float, y_bot: float, steps: int = 8) -> None:
    """
    A flight down from the mezzanine, drawn as its own front elevation.

    Seen straight on a staircase is a stepped silhouette and a diagonal rail —
    that is all, and it is enough. Anything else here would be a side wall.
    The treads are timber rather than trim: painted white against a white
    handrail the whole flight read as a paper ramp.
    """
    sw = (x_bot - x_top) / steps
    sh = (y_bot - y_top) / steps
    pts = [(x_top, y_top)]
    for i in range(steps):
        pts.append((x_top + (i + 1) * sw, y_top + i * sh))
        pts.append((x_top + (i + 1) * sw, y_top + (i + 1) * sh))
    pts.append((x_top, y_bot))
    c.poly(pts, fill=shade(tread, 0.20), ink=P["ink"], lw=LW_PROP)
    # Each tread as its own slab on the string. Drawn as a shaded line first,
    # the eight steps merged into one tan wedge the moment the sheet was
    # looked at at 1x, which is the only size that counts.
    for i in range(steps):
        c.rrect(x_top + i * sw, y_top + i * sh, sw + 1.0, 3.4, r=1.0,
                fill=tread, ink=P["ink"], lw=LW_DETAIL)
    # Handrail on posts, parallel to the flight, started clear of the deck.
    rise = 13.0
    c.line([(x_top + sw * 0.5, y_top + sh * 0.5 - rise), (x_bot, y_bot - rise)],
           P["ink2"], LW_PROP)
    for i in range(1, steps, 2):
        px = x_top + i * sw
        py = y_top + i * sh
        c.line([(px, py - rise * 0.95), (px, py)], P["ink2"], LW_DETAIL)


# --------------------------------------------------------------------- floors

def _planks(c: Canvas, fy: float, colour, gap: float = 17.0) -> None:
    """Board seams. Two per block, which is as fine as a floor can be at 1x."""
    n = int((c.w - 8.0) // gap)
    for i in range(1, n + 1):
        x = 6.0 + i * gap
        c.line([(x, fy + 1.4), (x, c.h - 3.0)], alpha(shade(colour, 0.40), 0.45), LW_DETAIL)


def _parquet(c: Canvas, fy: float, colour, gap: float = 15.0) -> None:
    """
    Chevron blocks — the floor of the expensive rooms.

    A chevron is two strokes where a plank is one, and that is exactly why it
    is kept for the suites: it costs the same ink and it says parquet.
    """
    top = fy + 2.0
    bot = c.h - 3.4
    n = int((c.w - 10.0) // gap)
    for i in range(n):
        x = 6.0 + i * gap
        c.line([(x, bot), (x + gap / 2, top), (x + gap, bot)],
               alpha(shade(colour, 0.42), 0.42), LW_DETAIL)


def _floor_border(c: Canvas, fy: float, colour) -> None:
    """A pale inlaid band along the front of a suite floor."""
    c.rect(INSET, c.h - 5.4, c.w - INSET * 2, 2.4, fill=alpha(tint(colour, 0.42), 0.9))


# ---------------------------------------------------------------------- rooms

def economy(c: Canvas, fy: float) -> None:
    """
    The cheapest room in the hotel, and it has to look it.

    One small window and a plain door. Everything the tiers above add — a cill,
    a rail, a moulding — is deliberately absent, because the escalation is only
    legible if the bottom of it is genuinely bare.
    """
    _glazing(c, 21, 22, 32, 26, panes=2)
    _door(c, P["wallMint"], 88, fy, 26, 40, panels=2)


def standard(c: Canvas, fy: float) -> None:
    """
    One step up: a window on a cill, a panelled door, a number plate.

    The window is 36 wide rather than 44. At 44 it ran to x 62 and the door
    starts at 82, which left twenty pixels of bare wall in the whole room —
    less than the narrowest picture the catalogue sells, so a `standard` room
    had nowhere a wall piece could hang and every one of them fell back to the
    scan (src/core/systems/roomAnchors.ts now designs a wall slot there).
    """
    wall = P["wallCream"]
    _glazing(c, 16, 18, 36, 30, panes=2)
    _cill(c, wall, 16, 48, 36)
    _door(c, wall, 82, fy, 30, 44, panels=3)
    # The room number, on the wall beside the door at eye height — a plaque,
    # not digits: at 1x a numeral is four dark pixels and reads as dirt.
    c.rrect(70, fy - 32, 9, 11, r=1.6, fill=P["gold"], ink=P["ink"], lw=LW_FACE)
    for i in range(2):
        c.line([(72, fy - 28.4 + i * 3.4), (77, fy - 28.4 + i * 3.4)],
               alpha(P["ink"], 0.55), LW_FACE)
    _planks(c, fy, P["wood"])


def double(c: Canvas, fy: float) -> None:
    """Two blocks, two windows, and the first moulding: a picture rail."""
    wall = P["wallLilac"]
    _picture_rail(c, wall, 15)
    for x in (28, 106):
        _glazing(c, x, 24, 46, 32, panes=2)
        _cill(c, wall, x, 56, 46)
    _door(c, wall, 196, fy, 32, 46, panels=3, transom=8.0)
    _planks(c, fy, P["wood"])


def family(c: Canvas, fy: float) -> None:
    """
    The room that sleeps four, so it is drawn as two places to sleep.

    The wide three-pane window belongs to the main half; the alcove is the
    children's berth, and being a recess rather than a bunk it stays legal —
    the beds that go in it are still bought from the catalogue.
    """
    wall = P["wallPeach"]
    _picture_rail(c, wall, 15)
    # 72 wide, not 84: the alcove reveal starts at x 122, and at 84 the cill
    # reached x 104, leaving eighteen pixels of wall between them — too narrow
    # for any picture in the catalogue, so the room had no wall slot at all.
    _glazing(c, 18, 24, 72, 34, panes=3)
    _cill(c, wall, 18, 58, 72)
    _dado(c, wall, fy, 22.0)
    _alcove(c, wall, 126, fy, 64, 48)
    _door(c, wall, 210, fy, 32, 46, panels=2, transom=8.0)
    _planks(c, fy, P["woodPale"])


def deluxe(c: Canvas, fy: float) -> None:
    """
    Where the room stops being square: arched windows, a cornice, panelling and
    a ceiling rose, all at once, because deluxe is the first gem-priced tier and
    the jump has to be worth the currency change.
    """
    wall = mix(P["wallMint"], P["wallTeal"], 0.55)
    _cornice(c, wall)
    _wainscot(c, wall, fy, INSET, c.w - INSET * 2, h=18.0, panels=8)
    for x in (24, 92):
        _glazing(c, x, 16, 44, 40, panes=2, arch=True)
        _cill(c, wall, x, 56, 44)
    # The rose hangs over the strip of ceiling between the glazing and the
    # door, which is the only span wide enough for it not to graze an arch.
    _ceiling_rose(c, wall, 164, 19, 8.0)
    _door(c, wall, 190, fy, 32, 46, panels=3, transom=8.0)
    _planks(c, fy, P["wood"])


def executive(c: Canvas, fy: float) -> None:
    """
    Three blocks of arched glass and a chimney breast.

    The fireplace is what separates this from a wide deluxe: a stone opening
    and a mantel are architecture nobody can buy from the decor shop, and they
    take the left third so the middle of the floor stays free.
    """
    wall = mix(P["wallSlate"], P["warmWhite"], 0.40)
    _cornice(c, wall)
    _wainscot(c, wall, fy, 112, c.w - 112 - INSET, h=18.0, panels=8)
    _chimney_breast(c, wall, 10, fy, 96, 13.0)
    for x in (132, 208, 284):
        _glazing(c, x, 14, 48, 41, panes=2, arch=True)
        _cill(c, wall, x, 55, 48)
    _door(c, wall, 342, fy, 32, 46, panels=3, transom=8.0)
    _parquet(c, fy, P["woodDk"])


def honeymoon(c: Canvas, fy: float) -> None:
    """
    Arched balcony doors onto a balustrade, under a rose ceiling.

    The one guest room with a way out of it. The balustrade is set to the right
    of centre so the doorway is a view rather than an obstacle, and the carpet
    is the only floor in the hotel that is not a timber of some kind.
    """
    wall = P["wallRose"]
    _cornice(c, wall)
    _ceiling_rose(c, wall, 192, 19, 9.0)
    _wainscot(c, wall, fy, INSET, c.w - INSET * 2, h=18.0, panels=12)
    for x in (32, 104):
        _glazing(c, x, 16, 46, 40, panes=2, arch=True)
        _cill(c, wall, x, 56, 46)
    _double_doors(c, wall, 236, fy, 84, 54, fanlight=15.0, glazed=True)
    # Set high enough that its top rail lands on the wall rather than on the
    # wainscot cap: three pale horizontals inside seventeen pixels is a grey
    # smear at 1x, however tidy it looks at four times the size.
    _balustrade(c, wall, 230, fy - 25.0, 96, 25.0)
    _door(c, wall, 338, fy, 32, 46, panels=3)


def luxury_suite(c: Canvas, fy: float) -> None:
    """
    Four blocks wide, and the room where the windows become the architecture.

    A bay in the middle, one arched window to the left of it, and double doors
    under a fanlight on the right. Two ceiling roses rather than one, because
    at this width a single medallion in the centre would sit over the bay and
    read as a bubble.
    """
    wall = P["wallSand"]
    _cornice(c, wall)
    _wainscot(c, wall, fy, INSET, c.w - INSET * 2, h=18.0, panels=11)
    for cx in (110, 390):
        _ceiling_rose(c, wall, cx, 19, 8.5)
    _glazing(c, 30, 16, 50, 40, panes=2, arch=True)
    _cill(c, wall, 30, 56, 50)
    _bay(c, wall, 176, 14, 160, 40, lights=3)
    _double_doors(c, wall, 420, fy, 68, 52, fanlight=14.0)
    _parquet(c, fy, P["wood"])
    _floor_border(c, fy, P["wood"])


def presidential(c: Canvas, fy: float) -> None:
    """
    Two storeys in one room, which is the whole reason it is 3x2.

    A mezzanine deck cuts the upper half, railed along its open edge, with a
    stair down into the double-height void on the right. The void is what sells
    it: one window eighty pixels tall that no other room in the hotel can have,
    because no other room is two blocks high.
    """
    wall = mix(P["wallLilac"], P["lavender"], 0.45)
    floor = P["woodDk"]
    deck_y = 96.0
    deck_x1 = 250.0

    _cornice(c, wall)
    _ceiling_rose(c, wall, 318, 17, 9.0)

    # Upper storey: two arched windows on the wall the mezzanine serves.
    for x in (44, 140):
        _glazing(c, x, 22, 52, 48, panes=2, arch=True)
        _cill(c, wall, x, 70, 52)

    # The double-height window, dropped past the deck line into the void.
    _glazing(c, 286, 28, 64, 80, panes=2, arch=True)
    _cill(c, wall, 286, 108, 64)

    _wainscot(c, wall, fy, INSET, c.w - INSET * 2, h=20.0, panels=9)
    _mezzanine(c, wall, floor, INSET, deck_y, deck_x1 - INSET)
    _stair(c, wall, P["woodPale"], deck_x1, deck_y + 9.0, 346, fy, steps=8)
    _double_doors(c, wall, 30, fy, 74, 54, fanlight=14.0)

    _parquet(c, fy, floor)
    _floor_border(c, fy, floor)


ROOMS = {
    "economy":      RoomSpec(P["wallMint"], P["concrete"], economy),
    "standard":     RoomSpec(P["wallCream"], P["wood"], standard),
    "double":       RoomSpec(P["wallLilac"], P["wood"], double),
    "family":       RoomSpec(P["wallPeach"], P["woodPale"], family),
    # Deluxe, executive and presidential move off their default wall: the
    # defaults repeat mint, sand and lilac inside one ladder, and a tier the
    # player cannot see the difference of is a tier they will not buy.
    #
    # Executive reached for that with mix(wallSand, wallSlate, 0.40), and the
    # arithmetic ate it. Sand and slate sit on opposite sides of the blue-
    # yellow axis (b* +16.6 and -19.2), so at 0.40 the hue cancels: the room
    # shipped at #C9CAC4, chroma 2.8, against a minimum of 16.5 for every
    # other room in the hotel. The one tier that was singled out for being
    # hard to tell apart came out the only grey box in a hotel of pastels —
    # the greyed-out colour an interface uses for something you cannot have.
    #
    # Lightening the slate instead of cancelling it keeps the cool, formal
    # direction that mix was reaching for and gets the chroma back: #AEBFD1,
    # chroma 11.2, L* 76.7 — still clearly below luxurySuite's 89.7 so the
    # ladder still climbs, and 15.9 ΔE from its nearest neighbour in the
    # guest ladder, which is further than any other candidate managed.
    "deluxe":       RoomSpec(mix(P["wallMint"], P["wallTeal"], 0.55), P["wood"], deluxe),
    "executive":    RoomSpec(mix(P["wallSlate"], P["warmWhite"], 0.40), P["woodDk"], executive),
    # A full-strength carpet under a rose wall is two reds shouting; pulling
    # it back towards the wall keeps the room warm instead of loud.
    "honeymoon":    RoomSpec(P["wallRose"], mix(P["carpet"], P["wallRose"], 0.34),
                             honeymoon),
    "luxurySuite":  RoomSpec(P["wallSand"], P["wood"], luxury_suite),
    # A 3x2 room would otherwise get a floor band half a storey deep, because
    # the shell sizes it as a fraction of the canvas.
    "presidential": RoomSpec(mix(P["wallLilac"], P["lavender"], 0.45), P["woodDk"],
                             presidential, floor_h=13.5),
}
