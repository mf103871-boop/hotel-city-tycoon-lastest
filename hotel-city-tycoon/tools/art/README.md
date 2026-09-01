# tools/art

Art tooling. The shipped art is now **supplied**, not generated — but the
generators remain for two jobs that still matter.

    npm run gen:art:derive   # variants from whatever base art is on disk
    npm run gen:art          # regenerate the procedural fallback set

## What is shipped

`public/assets/` holds 72 base files — 23 room interiors, 20
characters, 18 decor pieces, 7 UI icons, 4 hazard overlays — plus **132 files
derived from them by tooling**, plus 3 incident icons (5A). Two bases are
pipeline-drawn finals rather than hand-supplied: the Disco interior
(`spa_base.png`, drawn by `gen_rooms.spa()` — one source of truth for the
shipped art and the fallback) and the three 4C incident images
(`render_effects(only=['ghost','heatWave','coldSnap'])`).

## Derivation is the point

`gen_rooms.py --derive` reads each `<room>_base.png` and produces its night,
dirty, pest and thumb variants by colour transform. `gen_props.py --derive`
does the same for character thumbs and work/sleep frames.

That is 132 files nobody has to draw. When a base image is replaced, rerun the
derive step and every variant follows.

- `night` — cool wash, warm sources left bright
- `dirty` — desaturated toward ochre and darkened, heavier toward the floor
- `pest` — a transparent overlay only, composited over the base at runtime

## The procedural set

`gen_rooms.py` and `gen_props.py` without `--derive` redraw the original
placeholder art from `style.py`. It is kept because the renderer falls back to
a drawn shell for any missing texture, and because a regenerable set is useful
when a new room type is added before its art exists.

A copy of the three generators sits in `procedural-backup/`.

## Palette

`src/index.css` is derived from the supplied art, not chosen beside it: mint
`#b8d8d0` walls, cream `#f8f0d8` trim, coral `#f07858` doors, wood `#e08030`.
The interface chrome is a warm charcoal `#1a1210` so it reads as night outside
a lit hotel and the interiors stay the only saturated thing on screen.

If the art direction changes, measure the new dominant colours and update
those tokens — the whole interface follows from them.
