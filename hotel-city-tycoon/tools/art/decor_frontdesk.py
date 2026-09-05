"""
The staff room, maintenance and the business centre.

Three working rooms behind the guest floors, and the first time each has had a
catalogue of its own. The staff room is a break room: a vending machine, a
rubber mat by the kettle, lino on the floor, the employee-of-the-month frame
and the exit sign over the door. Maintenance is a workshop: checker plate on
the floor, a breaker panel on the wall, painted breeze block behind it and a
caged lamp on the pipe run. The business centre is an office: a shredder,
carpet tiles, a flat LED panel overhead and a frosted glass partition.

None of it is trying to look expensive, which is what separates these from the
guest-room ladders. The wallpapers are concrete and glass rather than damask,
the lights are a sign, a work lamp and a ceiling tile rather than a chandelier,
and the floor coverings are institutional. So the silhouette does the telling:
the vending machine is the only appliance that is a dark cabinet with a lit
grid inside it, the shredder the only one that is a narrow upright column, the
exit sign the only light that is a sign, the breaker panel the only wall art
with no picture frame around it, and the checker plate the only floor that is
studded metal.

Sizes come from `gen_decor.SLOT_SIZE`: 96x72 for the equipment slot and for
wall pieces, 72x72 for the floor coverings, 72x48 for a hanging light. Nothing
below assumes those numbers — every routine lays out from `c.w` and `c.h`,
because the same drawing is handed a 1x and a 2x canvas.
"""
from __future__ import annotations

from hcstyle import (
    P, Canvas, LW_PROP, LW_DETAIL, LW_FACE,
    alpha, shade, tint, mix,
)

from decor_props import _stand
from decor_surfaces import (
    _band, _panel, _art_frame, _cord, _ceiling_plate, _glow, _star, GOLD,
)


# -------------------------------------------------------------- staff room

def appliance_snackVending(c: Canvas) -> None:
    """
    A twin-front vending machine filling its bay edge to edge.

    A dark cabinet with two lit windows of packets. The read at 32px is the
    two bright windows inside the navy block, so the price strip, the coin
    slot and the flap are all drawn small enough never to compete with them —
    it is the only appliance that is a dark box with a grid of colour inside.
    """
    cx, half = c.w / 2, min(c.w * 0.46, 42.0)
    fy = _stand(c, cx, half)
    top = fy - 64.0
    body = mix(P["ink2"], P["roomBlueDk"], 0.30)
    for fx in (cx - half + 7.0, cx + half - 7.0):
        c.rrect(fx - 4.0, fy - 4.0, 8.0, 4.0, r=1.2, fill=P["black"],
                ink=P["ink"], lw=LW_FACE)
    c.rrect(cx - half, top, half * 2.0, fy - top - 2.0, r=3.0, fill=body,
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - half + 2.0, top + 2.0, half * 2.0 - 4.0, 3.0, r=1.2,
            fill=tint(body, 0.22))
    # Two windows with a control strip between them. The interior is a lit
    # pale blue rather than glass over navy: a vending machine is a light box,
    # and glass drawn honestly over the cabinet colour is a black hole.
    win_y, win_h = top + 7.0, 38.0
    strip_w = 12.0
    win_w = (half * 2.0 - 8.0 - strip_w) / 2.0
    interior = mix(P["glass"], P["white"], 0.45)
    hues = (P["coral"], P["gold"], P["mint"])
    for side in (0, 1):
        wx = cx - half + 4.0 + side * (win_w + strip_w)
        c.rrect(wx, win_y, win_w, win_h, r=2.0, fill=interior,
                ink=P["ink"], lw=LW_DETAIL)
        for row in range(3):
            sy = win_y + 3.0 + row * 11.5
            for k in range(3):
                px = wx + 3.0 + k * (win_w - 6.0 - 5.6) / 2.0
                c.rrect(px, sy, 5.6, 7.0, r=1.4, fill=hues[(k + row + side) % 3],
                        ink=P["ink"], lw=LW_FACE)
            # The shelf, drawn after the packets so they stand on it.
            c.line([(wx + 2.0, sy + 7.6), (wx + win_w - 2.0, sy + 7.6)],
                   P["metalDk"], 1.2)
        c.line([(wx + 3.0, win_y + win_h - 5.0), (wx + 7.0, win_y + 5.0)],
               alpha(P["white"], 0.40), 1.4)
    # The control strip: a lit price display, the coin slot, four buttons and
    # the change cup.
    sx = cx - strip_w / 2
    c.rrect(sx + 1.0, win_y + 2.0, strip_w - 2.0, 8.0, r=1.2, fill=tint(P["cream"], 0.30),
            ink=P["ink"], lw=LW_FACE)
    c.line([(sx + 3.0, win_y + 6.0), (sx + strip_w - 3.0, win_y + 6.0)], P["ink2"], 1.0)
    c.rrect(sx + strip_w / 2 - 1.5, win_y + 13.0, 3.0, 8.0, r=1.0, fill=P["black"],
            ink=P["ink"], lw=LW_FACE)
    for row in range(2):
        for k in range(2):
            c.circle(sx + 4.0 + k * 4.0, win_y + 25.0 + row * 4.2, 1.3, fill=P["metal"],
                     ink=P["ink"], lw=LW_FACE)
    c.rrect(sx + 2.5, win_y + win_h - 6.0, strip_w - 5.0, 4.0, r=1.0, fill=P["black"])
    # The dispensing flap along the bottom.
    c.rrect(cx - half + 6.0, fy - 16.0, half * 2.0 - 12.0, 9.0, r=2.0, fill=P["black"],
            ink=P["ink"], lw=LW_DETAIL)
    c.rect(cx - half + 10.0, fy - 14.4, half * 2.0 - 20.0, 1.6, fill=tint(P["black"], 0.35))


def rug_antiFatigueMat(c: Canvas) -> None:
    """
    A black rubber mat with a yellow safety bevel.

    Dark block, yellow outline: that pairing is the whole identity, and it is
    what keeps it apart from the coir doormat, the curled yoga mat and the red
    runner. The lighter strip along the front edge is its thickness — a rubber
    mat is a slab, not a textile, and the slab has to show a side.
    """
    base = mix(P["black"], P["shadow"], 0.35)
    x, y, w, h = _band(c, 19.0, base, r=2.2, w=60.0)
    bottom = min(y + h, c.h)
    edge_h = 3.6
    face_bottom = bottom - edge_h - 1.0
    c.rect(x + 1.4, face_bottom, w - 2.8, edge_h, fill=tint(base, 0.24))
    c.line([(x + 1.4, face_bottom), (x + w - 1.4, face_bottom)], P["ink"], LW_FACE)
    # The bevel: one yellow line just inside the outline, thick enough to
    # survive 55% — at 1px it would be a grey fringe rather than a border.
    yellow = tint(P["gold"], 0.10)
    c.rrect(x + 2.4, y + 2.4, w - 4.8, face_bottom - y - 4.4, r=1.6, ink=yellow, lw=1.8)
    # Drainage holes, two rows, at very low contrast: a grid of bright dots
    # on black reads as a keyboard.
    hole = mix(base, P["metalDk"], 0.40)
    for row in range(2):
        for k in range(8):
            c.circle(x + 9.0 + k * 6.0, y + 6.2 + row * 3.8, 1.0, fill=hole)


def flooring_scuffedLino(c: Canvas) -> None:
    """
    Institutional vinyl: sage-green tiles, grey seams, a scuff or two.

    Matte and flat on purpose — every other floor in the game is polished
    stone or timber, and the lino is the one that is not. The scuffs and the
    single darker tile are what say 'used' rather than 'new sample'.
    """
    sage = mix(P["mint"], P["concrete"], 0.42)
    x, y, w, h = _band(c, 27.0, sage, r=1.6)
    cols, rows = 4, 2
    tw = (w - 2.8) / cols
    th = (h - 2.8) / rows
    # One tile a shade darker, in the front row so the top sliver stays whole.
    c.rect(x + 1.4 + tw, y + 1.4 + th, tw, th, fill=shade(sage, 0.10))
    seam = mix(P["concrete"], P["metalDk"], 0.50)
    for i in range(1, cols):
        c.line([(x + 1.4 + i * tw, y + 1.6), (x + 1.4 + i * tw, y + h - 1.6)], seam, 1.0)
    for j in range(1, rows):
        c.line([(x + 1.6, y + 1.4 + j * th), (x + w - 1.6, y + 1.4 + j * th)], seam, 1.0)
    scuff = shade(P["concrete"], 0.38)
    c.line([(x + 8.0, y + 20.0), (x + 15.0, y + 17.0)], scuff, 1.3)
    c.line([(x + 44.0, y + 7.0), (x + 53.0, y + 9.5)], scuff, 1.3)
    c.ellipse(x + 30.0, y + 8.5, 1.5, 1.0, fill=tint(sage, 0.45))


def wallArt_starEmployee(c: Canvas) -> None:
    """
    Employee of the month: a walnut frame, a flat photo, a gold star.

    The chibi staffer uses the game's own face vocabulary, but the photo is
    flat photo-booth blue-grey rather than a painted ground — that and the star
    stuck over the corner are what say staff room, not gallery. The star is
    drawn last and outside the frame so the silhouette has a point on it.
    """
    walnut = mix(P["woodDk"], P["ink2"], 0.45)
    ix, iy, iw, ih = _art_frame(c, 58.0, 58.0, walnut, depth=4.0)
    photo = mix(P["tile"], P["wallSky"], 0.45)
    c.rect(ix, iy, iw, ih, fill=photo)
    hx, hy = ix + iw / 2, iy + ih * 0.42
    # Uniform first, so the head sits on shoulders. The trapezoid ends on the
    # photo's bottom edge: a rounded body drawn past it would cover the rail.
    navy = mix(P["roomBlueDk"], P["ink2"], 0.45)
    c.poly([(hx - 15.0, iy + ih), (hx - 11.0, hy + 11.0), (hx - 4.0, hy + 8.5),
            (hx + 4.0, hy + 8.5), (hx + 11.0, hy + 11.0), (hx + 15.0, iy + ih)],
           fill=navy)
    c.poly([(hx - 4.0, hy + 8.5), (hx, hy + 14.0), (hx + 4.0, hy + 8.5)], fill=P["white"])
    # The lanyard: two cords to a card.
    for side in (-1, 1):
        c.line([(hx + side * 4.5, hy + 9.5), (hx + side * 1.4, hy + 19.0)], P["coral"], 1.2)
    c.rrect(hx - 3.6, hy + 18.0, 7.2, 5.0, r=0.8, fill=P["white"], ink=P["ink"], lw=LW_FACE)
    c.line([(hx - 2.0, hy + 20.6), (hx + 2.0, hy + 20.6)], P["ink2"], 0.8)
    # The head: skin, hair, two eyes, blush, an open smile.
    r = 9.0
    c.circle(hx, hy, r, fill=P["skin3"], ink=P["ink"], lw=LW_DETAIL)
    c.pie(hx, hy, r, r, 180, 360, fill=P["hairBlack"])
    c.ellipse(hx, hy - 1.6, r - 0.2, 3.6, fill=P["hairBlack"])
    c.ellipse(hx + 1.0, hy - 0.6, 5.4, 2.4, fill=P["skin3"])
    for side in (-1, 1):
        c.ellipse(hx + side * 3.3, hy + 1.6, 1.2, 1.6, fill=P["ink"])
        c.circle(hx + side * 3.3 - 0.5, hy + 1.1, 0.45, fill=P["white"])
        c.ellipse(hx + side * 5.6, hy + 4.2, 1.5, 0.9, fill=alpha(P["blush"], 0.6))
    c.pie(hx, hy + 3.6, 1.6, 1.8, 8, 172, fill=P["ink"])
    # The brass plaque on the bottom rail, with two lines of 'text'.
    brass = mix(P["gold"], P["woodDk"], 0.30)
    c.rrect(hx - 11.0, iy + ih + 0.6, 22.0, 2.9, r=0.8, fill=brass, ink=P["ink"], lw=LW_FACE)
    c.line([(hx - 7.0, iy + ih + 2.0), (hx + 7.0, iy + ih + 2.0)], P["ink2"], 0.8)
    # The star, over the top-right corner and hanging off the frame.
    _star(c, ix + iw + 2.0, iy - 1.0, 8.0, fill=GOLD, ink=P["ink"], lw=LW_DETAIL)
    c.circle(ix + iw - 0.6, iy - 3.2, 1.2, fill=tint(GOLD, 0.55))


def lighting_exitSign(c: Canvas) -> None:
    """
    A lit exit sign on a short bracket.

    The one lighting piece that is a sign rather than a lamp: no bulb, no
    shade, no chain. Wide and low so it is a green pill with white marks at
    24px, and the pictogram is a figure and an arrow — the two shapes people
    know without reading — rather than four letters nobody could.
    """
    cx = c.w / 2
    drop = 7.0
    sw, sh = 50.0, 18.0
    green = mix(P["green"], P["leaf"], 0.35)
    _glow(c, cx, drop + sh + 4.0, 20.0, colour=P["leaf"])
    _ceiling_plate(c, cx, 10.0, colour=P["black"])
    c.line([(cx, 2.0), (cx, drop + 1.0)], P["black"], 2.2)
    c.rrect(cx - sw / 2, drop, sw, sh, r=3.0, fill=green, ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - sw / 2 + 2.0, drop + 2.0, sw - 4.0, 2.6, r=1.0, fill=tint(green, 0.24))
    # The running figure, leaning into its stride. Strokes are two logical
    # pixels wide: at 55% anything finer breaks into dots.
    white = P["white"]
    fx, fy = cx - sw * 0.20, drop + sh / 2
    c.circle(fx - 1.2, fy - 5.0, 2.1, fill=white)
    c.line([(fx - 2.6, fy - 2.4), (fx + 1.6, fy + 1.0)], white, 2.2)
    c.line([(fx + 1.6, fy + 1.0), (fx + 5.2, fy + 5.6)], white, 2.0)
    c.line([(fx + 1.6, fy + 1.0), (fx - 3.6, fy + 4.8)], white, 2.0)
    c.line([(fx - 1.0, fy - 1.2), (fx + 4.2, fy - 3.6)], white, 1.8)
    c.line([(fx - 1.0, fy - 1.2), (fx - 5.6, fy + 0.6)], white, 1.8)
    # The doorway the figure runs to, and the arrow past it.
    dx = cx - sw * 0.02
    c.rrect(dx, fy - 6.0, 6.0, 12.0, r=0.8, ink=white, lw=1.4)
    ax = cx + sw * 0.16
    c.line([(ax, fy), (ax + 9.0, fy)], white, 2.2)
    c.poly([(ax + 8.0, fy - 4.2), (ax + 13.5, fy), (ax + 8.0, fy + 4.2)], fill=white)


# ------------------------------------------------------------- maintenance

def flooring_checkerPlate(c: Canvas) -> None:
    """
    Galvanised checker plate on the floor.

    A cool steel band with rows of raised studs alternating direction, each
    stud a highlight stroke over its own shade stroke so it sits proud of the
    sheet. Studded metal is what no other floor is: concrete is flat grey, and
    everything above it is stone or wood.
    """
    steel = P["metal"]
    x, y, w, h = _band(c, 25.0, steel, r=1.8)
    bottom = min(y + h, c.h)
    c.rect(x + 1.4, bottom - 4.6, w - 2.8, 3.6, fill=shade(steel, 0.28))
    hi, lo = tint(steel, 0.55), shade(steel, 0.30)
    for row in range(3):
        sy = y + 4.2 + row * 5.6
        for k in range(8):
            sx = x + 6.0 + k * 8.0 + (row % 2) * 4.0
            if sx > x + w - 6.0:
                continue
            d = 1.0 if (row + k) % 2 == 0 else -1.0
            p0, p1 = (sx - 1.9, sy + 1.9 * d), (sx + 1.9, sy - 1.9 * d)
            c.line([(p0[0] + 0.6, p0[1] + 0.8), (p1[0] + 0.6, p1[1] + 0.8)], lo, 2.0)
            c.line([p0, p1], hi, 2.0)


def wallArt_breakerPanel(c: Canvas) -> None:
    """
    A steel breaker box with its door swung open.

    The only wall art that is not a picture in a frame: a dark cabinet, a
    cream panel of black toggles and one red main switch, with the door drawn
    as a narrower panel beside the box so the silhouette has a tab on it. Laid
    out from the canvas centre so box plus door stay centred as a pair.
    """
    cx, cy = c.w / 2, c.h / 2
    bw, bh = 44.0, 56.0
    dw, dh = 18.0, 52.0
    gap = 2.0
    bx, by = cx - (bw + gap + dw) / 2, cy - bh / 2
    steel = P["metalDk"]
    # The door, foreshortened to a narrow panel, with its warning sticker.
    dx, dy = bx + bw + gap, cy - dh / 2
    c.rrect(dx, dy, dw, dh, r=2.0, fill=mix(steel, P["metal"], 0.35),
            ink=P["ink"], lw=LW_PROP)
    c.rect(dx + dw - 3.6, dy + 2.0, 1.8, dh - 4.0, fill=shade(steel, 0.20))
    tx, ty = dx + dw / 2 - 0.6, dy + dh * 0.36
    c.poly([(tx, ty - 5.6), (tx + 5.6, ty + 4.0), (tx - 5.6, ty + 4.0)],
           fill=GOLD, ink=P["ink"], lw=LW_FACE)
    c.line([(tx, ty - 2.2), (tx, ty + 1.0)], P["ink"], 1.2)
    c.circle(tx, ty + 2.7, 0.7, fill=P["ink"])
    for k in range(3):
        c.rrect(bx + bw - 1.2, by + 7.0 + k * 19.0, gap + 2.4, 6.0, r=1.0,
                fill=P["black"], ink=P["ink"], lw=LW_FACE)
    # The box and its cream panel.
    c.rrect(bx, by, bw, bh, r=2.4, fill=steel, ink=P["ink"], lw=LW_PROP)
    c.rrect(bx + 2.0, by + 2.0, bw - 4.0, 2.6, r=1.0, fill=tint(steel, 0.22))
    px, py, pw, ph = bx + 5.0, by + 6.0, bw - 10.0, bh - 11.0
    c.rrect(px, py, pw, ph, r=1.6, fill=P["cream"], ink=P["ink"], lw=LW_DETAIL)
    mx = px + pw / 2
    c.rrect(mx - 7.0, py + 3.0, 14.0, 7.0, r=1.6, fill=P["coral"], ink=P["ink"], lw=LW_DETAIL)
    c.rect(mx - 4.6, py + 4.8, 3.6, 3.4, fill=tint(P["coral"], 0.45))
    # Two columns of breakers, the toggle nub swapping side so the rows are
    # not one repeated stamp.
    kw = pw / 2 - 6.0
    for col in (0, 1):
        for row in range(5):
            kx = px + 4.0 + col * (pw / 2)
            ky = py + 14.0 + row * 6.0
            c.rrect(kx, ky, kw, 3.6, r=1.0, fill=P["black"], ink=P["ink"], lw=LW_FACE)
            on = (row + col) % 3 != 2
            c.rect(kx + (kw * 0.58 if on else kw * 0.18), ky + 0.9, 2.6, 1.8, fill=P["metal"])


def wallpaper_breezeBlock(c: Canvas) -> None:
    """
    Painted cinder blocks in running bond.

    Fat grey rectangles with pale mortar between them — a staggered grid,
    which no other wallpaper has. Each block gets one darker line along its
    lower edge so the wall reads as laid rather than printed, and one rust
    drip near the top corner says nobody has painted it in a while.
    """
    block = mix(P["concrete"], P["tile"], 0.30)
    mortar = tint(P["concrete"], 0.50)
    x, y, w, h = _panel(c, mortar, r=2.0)
    inset, m = 1.4, 2.0
    x0, y0, x1, y1 = x + inset, y + inset, x + w - inset, y + h - inset
    rows, cols = 4, 3
    bh = (y1 - y0 - m * (rows - 1)) / rows
    bw = (x1 - x0 - m * (cols - 1)) / cols
    recess = shade(block, 0.22)
    for row in range(rows):
        by = y0 + row * (bh + m)
        off = (bw + m) / 2 if row % 2 else 0.0
        for col in range(-1, cols + 1):
            bx0 = x0 + col * (bw + m) + off
            bx1 = bx0 + bw
            # Pillow has no clip region, so the half blocks at the ends are
            # trimmed to the panel by hand.
            bx0c, bx1c = max(bx0, x0), min(bx1, x1)
            if bx1c - bx0c < 2.0:
                continue
            c.rrect(bx0c, by, bx1c - bx0c, bh, r=1.0, fill=block)
            c.rect(bx0c, by + bh - 1.8, bx1c - bx0c, 1.8, fill=recess)
    rust = mix(block, mix(P["woodDk"], P["coral"], 0.35), 0.55)
    c.line([(x1 - 13.0, y0 + 2.0), (x1 - 13.0, y0 + 15.0)], rust, 1.6)
    c.line([(x1 - 10.4, y0 + 2.0), (x1 - 10.4, y0 + 8.0)], rust, 1.2)


def lighting_cageLamp(c: Canvas) -> None:
    """
    A mechanic's cage lamp on a black cord.

    The read at 40px is the dark ribs crossing a warm bulb: the bare bulb has
    no cage and every other pendant hangs a solid shade. The ribs are arcs on
    the bulb's own centre, so they converge under the cap and meet at a knot
    below it the way a real cage does, and each is an ink stroke with a steel
    stroke inside it so it stays a wire rather than a grey smear.
    """
    cx = c.w / 2
    drop = 9.0
    bulb_cy, br = drop + 15.0, 7.6
    _glow(c, cx, bulb_cy + 2.0, 16.0, colour=P["cream"])
    _ceiling_plate(c, cx, 10.0, colour=P["black"])
    _cord(c, cx, drop, colour=P["black"])
    c.circle(cx, bulb_cy, br, fill=GOLD, ink=P["ink"], lw=LW_PROP)
    c.circle(cx - 2.6, bulb_cy - 2.6, 1.8, fill=tint(GOLD, 0.60))
    rib = P["metalDk"]
    ry = br + 4.0
    for rx in (br + 3.0, br * 0.42):
        for start, end in ((90, 270), (270, 450)):
            c.arc(cx, bulb_cy, rx, ry, start, end, P["ink"], 2.4)
            c.arc(cx, bulb_cy, rx, ry, start, end, rib, 1.2)
    # The hoop round the middle and the knot at the bottom.
    c.ellipse(cx, bulb_cy + 1.0, br + 3.0, 2.6, ink=P["ink"], lw=2.2)
    c.ellipse(cx, bulb_cy + 1.0, br + 3.0, 2.6, ink=rib, lw=1.0)
    c.circle(cx, bulb_cy + ry, 2.0, fill=rib, ink=P["ink"], lw=LW_FACE)
    # The cap, drawn last so the ribs run up under it.
    c.rrect(cx - 5.5, drop - 1.0, 11.0, 6.0, r=2.6, fill=P["black"], ink=P["ink"], lw=LW_DETAIL)
    c.rect(cx - 3.5, drop + 0.4, 7.0, 1.4, fill=tint(P["black"], 0.30))


# --------------------------------------------------------- business centre

def appliance_paperShredder(c: Canvas) -> None:
    """
    A shredder: a tall charcoal bin under a slotted steel hood, a sheet going
    in and a window full of strips.

    An upright column with a white-striped belly, which nothing else on the
    equipment slot is: the printer is a flat box on a stand and the laundry
    machines are wide with a round door. The sheet stands well clear of the
    hood so the silhouette has a flag on top.
    """
    cx = c.w / 2
    fy = _stand(c, cx, 22.0)
    bw = 34.0
    charcoal = mix(P["black"], P["ink2"], 0.25)
    hood_y, hood_h = fy - 52.0, 10.0
    bin_y = hood_y + hood_h - 1.0
    # The sheet first: the hood covers its foot.
    c.poly([(cx - 8.0, hood_y + 3.0), (cx + 8.0, hood_y + 3.0),
            (cx + 9.5, hood_y - 12.0), (cx - 6.5, hood_y - 12.0)],
           fill=P["white"], ink=P["ink"], lw=LW_DETAIL)
    for k in range(3):
        c.line([(cx - 4.4 + k * 0.4, hood_y - 9.0 + k * 3.0),
                (cx + 5.2 + k * 0.4, hood_y - 9.0 + k * 3.0)], P["linenSh"], 1.0)
    c.rrect(cx - bw / 2, bin_y, bw, fy - bin_y - 1.0, r=3.0, fill=charcoal,
            ink=P["ink"], lw=LW_PROP)
    c.rect(cx - bw / 2 + 2.0, bin_y + 2.0, 2.0, fy - bin_y - 6.0, fill=tint(charcoal, 0.20))
    # The window: a dark interior, strips standing in it, then glass over.
    wx, wy, ww, wh = cx - bw / 2 + 5.0, bin_y + 7.0, bw - 10.0, fy - bin_y - 14.0
    c.rrect(wx, wy, ww, wh, r=2.0, fill=shade(charcoal, 0.30), ink=P["ink"], lw=LW_DETAIL)
    for k in range(5):
        sx = wx + 2.4 + k * 4.4
        top = wy + wh * (0.22 + ((k * 3) % 4) * 0.09)
        c.rrect(sx, top, 2.2, wy + wh - 1.4 - top, r=0.8,
                fill=P["white"] if k % 2 == 0 else P["linen"])
    c.rrect(wx + 1.0, wy + 1.0, ww - 2.0, wh - 2.0, r=1.6, fill=alpha(P["glass"], 0.22))
    c.line([(wx + 3.0, wy + wh - 5.0), (wx + 6.0, wy + 4.0)], alpha(P["white"], 0.50), 1.2)
    # The hood: a lighter steel cap with the feed slot, vents and one lamp.
    c.rrect(cx - bw / 2 - 2.0, hood_y, bw + 4.0, hood_h, r=2.6, fill=P["metal"],
            ink=P["ink"], lw=LW_PROP)
    c.rrect(cx - bw / 2, hood_y + 1.6, bw, 2.0, r=0.8, fill=tint(P["metal"], 0.35))
    c.rrect(cx - 11.0, hood_y + 4.0, 22.0, 2.6, r=1.0, fill=P["black"])
    for k in range(3):
        c.line([(cx + 13.0, hood_y + 3.6 + k * 1.8), (cx + 16.0, hood_y + 3.6 + k * 1.8)],
               P["metalDk"], 0.9)
    c.circle(cx - 14.0, hood_y + 5.4, 1.2, fill=P["mint"])


def flooring_officeCarpet(c: Canvas) -> None:
    """
    Carpet tiles laid as a checker of slate and dove grey.

    Six squares across and three deep: the coarsest checker that still reads
    as tiles rather than as a stripe. The dove tiles are the band itself, so
    the lighter sliver along the top edge survives, and only the slate ones
    are drawn over it. A grey grid of squares is what no other floor is.
    """
    slate = mix(P["wallSlate"], P["metalDk"], 0.55)
    dove = mix(P["metal"], P["tile"], 0.45)
    x, y, w, h = _band(c, 27.0, dove, r=1.6)
    cols, rows = 6, 3
    tw = (w - 2.8) / cols
    th = (h - 2.8) / rows
    for row in range(rows):
        for col in range(cols):
            tx, ty = x + 1.4 + col * tw, y + 1.4 + row * th
            dark = (row + col) % 2 == 0
            if dark:
                c.rect(tx, ty, tw, th, fill=slate)
            fleck = tint(slate, 0.30) if dark else shade(dove, 0.16)
            for k in range(2):
                fx = tx + 2.4 + k * 4.8 + ((row * 3 + col) % 3) * 0.7
                fy = ty + 2.2 + ((col + k) % 2) * 3.2
                c.line([(fx, fy), (fx + 1.6, fy)], fleck, 1.0)
    seam = shade(slate, 0.30)
    for i in range(1, cols):
        c.line([(x + 1.4 + i * tw, y + 1.6), (x + 1.4 + i * tw, y + h - 1.6)], seam, 0.9)
    for j in range(1, rows):
        c.line([(x + 1.6, y + 1.4 + j * th), (x + w - 1.6, y + 1.4 + j * th)], seam, 0.9)


def lighting_officePanel(c: Canvas) -> None:
    """
    A flat LED panel on two rods.

    A floating white slab: wide, thin, and the only light in the game with
    straight edges. Two rods rather than one cord so it hangs level, and the
    glow beneath is blue-white rather than cream — office light is cold.
    """
    cx = c.w / 2
    drop = 9.0
    pw, ph = 56.0, 12.0
    _glow(c, cx, drop + ph + 6.0, 24.0, colour=P["glass"])
    for dx in (-18.0, 18.0):
        _ceiling_plate(c, cx + dx, 8.0, colour=P["metal"])
        c.line([(cx + dx, 2.0), (cx + dx, drop + 1.0)], P["metalDk"], 1.8)
    c.rrect(cx - pw / 2, drop, pw, ph, r=2.0, fill=P["metal"], ink=P["ink"], lw=LW_PROP)
    c.rect(cx - pw / 2 + 1.2, drop + ph - 2.4, pw - 2.4, 1.4, fill=shade(P["metal"], 0.25))
    cool = mix(P["white"], P["glass"], 0.22)
    c.rrect(cx - pw / 2 + 2.4, drop + 2.4, pw - 4.8, ph - 4.8, r=1.2, fill=cool)
    c.rect(cx - pw / 2 + 4.0, drop + 3.4, 14.0, 1.4, fill=P["white"])


def wallpaper_officePartition(c: Canvas) -> None:
    """
    A frosted glass partition in a steel frame.

    A cool translucent sheet — the room's own wall shows through it, which is
    the one thing paper cannot do — with a frosted privacy band across the
    middle and one diagonal sheen. The band is what stops it reading as an
    empty window: a partition is glass somebody has deliberately obscured.
    """
    x, y, w, h = _panel(c, P["metal"], r=2.0)
    c.rrect(x + 1.6, y + 1.6, w - 3.2, h - 3.2, r=1.4, ink=tint(P["metal"], 0.45), lw=LW_FACE)
    gx, gy, gw, gh = x + 4.0, y + 4.0, w - 8.0, h - 8.0
    pane = mix(P["glass"], P["tile"], 0.50)
    c.rrect(gx, gy, gw, gh, r=1.2, fill=alpha(pane, 0.62), ink=P["ink"], lw=LW_DETAIL)
    band_h = 14.0
    band_y = y + h / 2 - band_h / 2
    c.rect(gx + 1.0, band_y, gw - 2.0, band_h, fill=alpha(P["white"], 0.62))
    for by in (band_y, band_y + band_h):
        c.line([(gx + 1.0, by), (gx + gw - 1.0, by)], alpha(P["white"], 0.9), 0.9)
    # The sheen is kept inside the pane by construction — both ends are on it.
    c.line([(gx + gw * 0.60, gy + gh - 2.0), (gx + gw * 0.82, gy + 2.0)],
           alpha(P["white"], 0.45), 2.4)


PIECES = {
    "appliance_snackVending": appliance_snackVending,
    "rug_antiFatigueMat": rug_antiFatigueMat,
    "flooring_scuffedLino": flooring_scuffedLino,
    "wallArt_starEmployee": wallArt_starEmployee,
    "lighting_exitSign": lighting_exitSign,

    "flooring_checkerPlate": flooring_checkerPlate,
    "wallArt_breakerPanel": wallArt_breakerPanel,
    "wallpaper_breezeBlock": wallpaper_breezeBlock,
    "lighting_cageLamp": lighting_cageLamp,

    "appliance_paperShredder": appliance_paperShredder,
    "flooring_officeCarpet": flooring_officeCarpet,
    "lighting_officePanel": lighting_officePanel,
    "wallpaper_officePartition": wallpaper_officePartition,
}
