#!/usr/bin/env python3
"""
The cast: every staff role and guest type, in every state the renderer asks for.

Two files per character, and the animation file decides what is in them:

    <kind>_<id>_sheet.png    one row per clip, one column per frame
    <kind>_<id>_thumb.png    64x64, head and shoulders for the staff panel

`data/animations/<kind>_<id>.json` is the contract (HC-P2-S1, DEC-012). It
names the clips, how many frames each one holds and how fast they run; this
driver draws exactly that, `tools/gen-asset-manifest.mjs` copies the same
table into the manifest, and the renderer slices the sheet from the manifest.
One number, three consumers — so a sheet whose rows disagree with the game is
not a thing that can be built.

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

THUMB = 64

#: Which drawing pose each clip is made from, and the face it wears.
#:
#: A clip is a row in the sheet; a pose is what `hcstyle.draw_person` knows how
#: to draw. Several clips share a pose and differ only in expression — a blink
#: is an idle with the eyes shut — which is what keeps the identity fixed
#: across every row (ART-0 §11) without drawing nine separate people.
CLIP_POSE = {
    "idle": ("idle", None),
    "blink": ("idle", "blink"),
    "walk": ("walk", None),
    "work": ("work", None),
    "sleep": ("sleep", "sleep"),
    "sit": ("sit", None),
    # The reactions are poses of their own, not faces pasted on a standing
    # figure: at the size a character is seen the body carries the reading and
    # the face confirms it (ART-0 §5).
    "happy": ("happy", "happy"),
    "angry": ("angry", "cross"),
    "scared": ("scared", "scared"),
}

#: Files the older per-variant layout wrote, cleared when a sheet replaces them.
LEGACY_VARIANTS = ("idle", "walk", "work", "sleep")


def roster() -> list[tuple[str, str]]:
    """`('staff', 'receptionist')` and friends, from the data files."""
    with open("data/staff.json", encoding="utf8") as fh:
        staff = [("staff", r["id"]) for r in json.load(fh)["roles"]]
    with open("data/guests.json", encoding="utf8") as fh:
        guests = [("guest", g["id"]) for g in json.load(fh)["types"]]
    return staff + guests


def animation(kind: str, cid: str) -> dict:
    """The character's animation file — the contract this driver draws to."""
    with open(f"data/animations/{kind}_{cid}.json", encoding="utf8") as fh:
        return json.load(fh)


def frame(member, tier: int, clip: str, phase: int = 0, frames: int = 1) -> Canvas:
    """
    One cell of the sheet.

    `frames` travels with the phase because a cycle's shape depends on how
    long it is: the same stride drawn over six frames and over eight has to
    start and end in the same place either way, and only the drawing code can
    know that. Poses that ignore it (a single-frame work pose today) simply do
    not read it.
    """
    pose, expression = CLIP_POSE.get(clip, ("idle", None))
    c = Canvas(CHAR_W, CHAR_H, tier=tier)
    prop = member.prop_work if pose == "work" else member.prop
    draw_person(c, member.person, CHAR_W / 2, pose=pose, phase=phase,
                expression=expression or member.expression, prop=prop, frames=frames)
    return c


def sheet(member, anim: dict, tier: int) -> Image.Image:
    """
    Every clip of one character on a single image: a row per clip, in the
    file's own order, each row as wide as the longest one.

    Composed from whole canvases rather than drawn into one large one so that
    every cell is identical in size and pivot by construction: the renderer
    slices at exact multiples of the frame, and a stride that drifts one pixel
    left over six frames is the classic way a walk cycle starts to shuffle.
    """
    clips = anim["clips"]
    cols = max(c["frames"] for c in clips.values())
    rows = len(clips)
    img = Image.new("RGBA", (CHAR_W * cols * tier, CHAR_H * rows * tier), (0, 0, 0, 0))
    for row, (name, clip) in enumerate(clips.items()):
        for i in range(clip["frames"]):
            cell = frame(member, tier, name, i, clip["frames"]).image()
            img.alpha_composite(cell, (CHAR_W * tier * i, CHAR_H * tier * row))
    return img


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


def _root(tier: int) -> str:
    return "public/assets" if tier == 1 else f"public/assets/@{tier}x"


def _save(img: Image.Image, kind: str, cid: str, variant: str, tier: int) -> str:
    path = f"{_root(tier)}/characters/{kind}_{cid}_{variant}.png"
    os.makedirs(os.path.dirname(path), exist_ok=True)
    save_png(img, path)
    return path


def _drop_legacy(kind: str, cid: str) -> int:
    """
    Remove the per-variant files a sheet replaces.

    Left behind they would be undeclared files in the asset tree — dead weight
    against the budget, and exactly what `tools/selftest/assets.ts` refuses.
    """
    gone = 0
    for tier in (1, 2):
        for variant in LEGACY_VARIANTS:
            path = f"{_root(tier)}/characters/{kind}_{cid}_{variant}.png"
            if os.path.exists(path):
                os.remove(path)
                gone += 1
    return gone


def generate(only: list[str] | None = None) -> int:
    people = roster()
    missing = [f"{k}.{i}" for k, i in people if f"{k}.{i}" not in characters.CAST]
    if missing:
        raise SystemExit(f"no drawing for: {', '.join(missing)}")

    written = 0
    dropped = 0
    for kind, cid in people:
        if only and cid not in only:
            continue
        member = characters.CAST[f"{kind}.{cid}"]
        anim = animation(kind, cid)
        unknown = [c for c in anim["clips"] if c not in CLIP_POSE]
        if unknown:
            raise SystemExit(f"{kind}_{cid}.json asks for clips nothing draws: {', '.join(unknown)}")
        for tier in (1, 2):
            _save(sheet(member, anim, tier), kind, cid, "sheet", tier)
            _save(thumb(member, tier), kind, cid, "thumb", tier)
            written += 2
        dropped += _drop_legacy(kind, cid)
        rows = ", ".join(f"{n}x{c['frames']}" for n, c in anim["clips"].items())
        print(f"  {kind}_{cid:<14} sheet[{rows}] · thumb")
    if dropped:
        print(f"  {dropped} superseded per-variant file(s) removed")
    return written


if __name__ == "__main__":
    args = [a for a in sys.argv[1:] if not a.startswith("-")]
    total = generate(args or None)
    print(f"{total} character files written")
