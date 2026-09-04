#!/usr/bin/env python3
"""
The cast: every staff role and guest type, in every state the renderer asks for.

Four files per character, and the driver decides which four from the data
rather than from a list here:

    <kind>_<id>_idle.png    48x72, one frame, facing right
    <kind>_<id>_walk.png    288x72, six frames laid out horizontally
    <kind>_<id>_thumb.png   64x64, head and shoulders for the staff panel
    <kind>_<id>_work.png    staff only — doing the job
    <kind>_<id>_sleep.png   guests only — asleep in a bed

Every frame of a character shares one canvas and one pivot: feet at
`(CHAR_W/2, FOOT_Y)`, always. ART-0 §11 forbids a figure whose height or face
changes between frames, and the way to guarantee that is not to check it
afterwards but to draw every frame from the same `Person` — which is what
`characters.py` supplies and what this driver iterates.

Run: python3 tools/art/gen_chars.py [role_id ...]
"""
from __future__ import annotations

import json
import os
import sys

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))

from PIL import Image  # noqa: E402

from hcstyle import CHAR_W, CHAR_H, Canvas, draw_person, save_png, P, alpha, tint  # noqa: E402

import characters  # noqa: E402

#: Six frames, as `src/render/characterView.ts` slices them.
WALK_FRAMES = 6
THUMB = 64


def roster() -> list[tuple[str, str]]:
    """`('staff', 'receptionist')` and friends, from the data files."""
    with open("data/staff.json", encoding="utf8") as fh:
        staff = [("staff", r["id"]) for r in json.load(fh)["roles"]]
    with open("data/guests.json", encoding="utf8") as fh:
        guests = [("guest", g["id"]) for g in json.load(fh)["types"]]
    return staff + guests


def frame(member, tier: int, pose: str, phase: int = 0) -> Canvas:
    c = Canvas(CHAR_W, CHAR_H, tier=tier)
    prop = member.prop_work if pose == "work" else member.prop
    draw_person(c, member.person, CHAR_W / 2, pose=pose, phase=phase,
                expression="sleep" if pose == "sleep" else member.expression,
                prop=prop)
    return c


def walk_sheet(member, tier: int) -> Image.Image:
    """
    Six frames on one strip.

    Composed from six full canvases rather than drawn into one wide one so that
    every frame is identical in size and pivot by construction: the renderer
    slices at exact multiples of CHAR_W, and a stride that drifts one pixel
    left over six frames is the classic way a walk cycle starts to shuffle.
    """
    sheet = Image.new("RGBA", (CHAR_W * WALK_FRAMES * tier, CHAR_H * tier), (0, 0, 0, 0))
    for i in range(WALK_FRAMES):
        sheet.alpha_composite(frame(member, tier, "walk", i).image(), (CHAR_W * tier * i, 0))
    return sheet


def thumb(member, tier: int) -> Image.Image:
    """
    Head and shoulders on a round card — what the staff and guest panels show.

    Cropping the idle frame would give a 48-pixel-wide figure adrift in a
    64-pixel square. The figure is drawn oversized and low instead, so the head
    fills the card the way a portrait should.
    """
    c = Canvas(THUMB, THUMB, tier=tier)
    c.circle(THUMB / 2, THUMB / 2, THUMB / 2 - 1.5,
             fill=tint(member.person.top, 0.62), ink=P["ink"], lw=2.0)
    inner = Canvas(CHAR_W, CHAR_H, tier=tier)
    draw_person(inner, member.person, CHAR_W / 2, pose="idle",
                expression=member.expression, prop=None)
    art = inner.image()
    zoom = 1.55
    art = art.resize((int(art.width * zoom), int(art.height * zoom)), Image.LANCZOS)
    out = c.image()
    # Position the head in the upper two thirds of the card and let the body
    # run off the bottom edge, which is what a portrait crop looks like.
    out.alpha_composite(art, ((out.width - art.width) // 2, int(-2 * tier)))
    mask = Canvas(THUMB, THUMB, tier=tier)
    mask.circle(THUMB / 2, THUMB / 2, THUMB / 2 - 1.5, fill=(255, 255, 255, 255))
    clipped = Image.new("RGBA", out.size, (0, 0, 0, 0))
    clipped.paste(out, (0, 0), mask.image().getchannel("A"))
    ring = Canvas(THUMB, THUMB, tier=tier)
    ring.circle(THUMB / 2, THUMB / 2, THUMB / 2 - 1.5, ink=P["ink"], lw=2.0)
    clipped.alpha_composite(ring.image())
    return clipped


def _save(img: Image.Image, kind: str, cid: str, variant: str, tier: int) -> str:
    root = "public/assets" if tier == 1 else f"public/assets/@{tier}x"
    path = f"{root}/characters/{kind}_{cid}_{variant}.png"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    save_png(img, path)
    return path


def generate(only: list[str] | None = None) -> int:
    people = roster()
    missing = [f"{k}.{i}" for k, i in people if f"{k}.{i}" not in characters.CAST]
    if missing:
        raise SystemExit(f"no drawing for: {', '.join(missing)}")

    written = 0
    for kind, cid in people:
        if only and cid not in only:
            continue
        member = characters.CAST[f"{kind}.{cid}"]
        for tier in (1, 2):
            _save(frame(member, tier, "idle").image(), kind, cid, "idle", tier)
            _save(walk_sheet(member, tier), kind, cid, "walk", tier)
            _save(thumb(member, tier), kind, cid, "thumb", tier)
            extra = "work" if kind == "staff" else "sleep"
            _save(frame(member, tier, extra).image(), kind, cid, extra, tier)
            written += 4
        print(f"  {kind}_{cid:<14} idle · walk(6) · thumb · "
              f"{'work' if kind == 'staff' else 'sleep'}")
    return written


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    total = generate(args or None)
    print(f"{total} character files written")
