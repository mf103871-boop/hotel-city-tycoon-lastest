# tools/art

Every picture in this game is drawn here, in Python, and checked into
`public/assets/`. There is no external art supplier and no image generator in
the loop: the whole set — 23 room interiors and their four variants each, the
cast, the decor catalogue, the interface icons and the hazard badges — is
produced by these modules from one shared style system.

    npm run gen:art        # redraw everything, both resolutions, then the manifest
    npm run art:preview    # contact sheets, so it can be looked at

## Why draw in code

Because the alternative loses coherence. Two hundred and fifty pictures made
one at a time drift: the outline thins, the palette wanders, one room's floor
sits four pixels lower than its neighbour's. Here a room *cannot* reach outside
`hcstyle.py`, so twenty-three rooms composed separately still read as one
hotel — and when the art direction changes, it changes in one file and the
whole set follows.

It also means the art is diffable, reviewable, and free to regenerate at any
resolution. `docs/ART-0_VISUAL_DIRECTION_AR.md` is the brief; `hcstyle.py` is
that brief made executable.

## The layout

| file | what it holds |
|---|---|
| `hcstyle.py` | The style system: palette, `Canvas`, line weights, room shell, the chibi `Person` builder. Every other module draws through it and nothing else. |
| `hcvariants.py` | Night, dirty, pest and thumb, derived from a base image. 92 room files nobody draws. |
| `gen_rooms.py` | Driver: sizes each room from `data/rooms.json`, builds the shell, calls the room's own routine, writes the variants. |
| `rooms_service.py` `rooms_guest.py` `rooms_commercial.py` | The 23 rooms, split by what they are for. |
| `gen_decor.py` | Driver: sizes each piece from `data/decor.json` and the manifest's slot table. |
| `decor_surfaces.py` `decor_props.py` | The catalogue: wall and floor treatments, then everything that stands in a room. |
| `decor_service.py` `decor_fitness.py` `decor_dining.py` `decor_leisure.py` | The pieces that belong to one room rather than to the hotel — the back of house and the lobby, the gym and the poolside, the cafe/restaurant/bar, the arcade/cinema/disco. |
| `gen_chars.py` | Driver: one sheet per staff role and guest type — a row per clip, laid out by `data/animations/<kind>_<id>.json` — plus the thumb. |
| `characters.py` | The casting table — who each of them is. |
| `gen_ui.py` `ui_icons.py` | Currency, shift timers and the six incident badges. |
| `gen_sounds.py` | The audio cues. Unrelated to the drawing, same idea. |
| `preview.py` | Contact sheets and the composed room shot. |
| `dump-anchors.ts` | Where the game puts furniture, asked of the game rather than guessed. |

## The rules that matter

Four, from ART-0, and they are load-bearing rather than decorative:

1. **Flat front orthographic.** No side walls, no vanishing point, no
   isometric. It is what makes the hotel read as a dollhouse.
2. **Deep navy outlines, never black**, in a hierarchy: the room frame is the
   heaviest line on screen, furniture is medium, a face is the finest.
3. **One dominant pastel per room**, with its furniture higher in contrast than
   its wall, and a quarter of the room left empty.
4. **Nothing finer than two pixels.** A room block is 128×96 at 1×; a detail
   below that is mud on a phone.

## Two resolutions from one drawing

Every coordinate in these modules is a *logical 1× pixel*, as a float. `Canvas`
multiplies by its own tier, so `@2x` is the same arithmetic at twice the scale
rather than a resized `@1x` — which is what keeps an outline the same weight
relative to the art on a high-density screen. Both tiers are written on every
run, and `tools/gen-asset-manifest.mjs` only declares the `@2x` tier once every
file in it exists.

## What a room may not contain

Beds, chairs, tables, lamps, rugs, plants and pictures are **decor sprites**,
composited over the room at runtime at the slots
`src/core/systems/roomAnchors.ts` hands out. A room that draws one shows it
twice the moment a player buys one. The exception `ASSET-SPEC.md` §1 grants is
fixed equipment — a cafe's counter, a cinema's screen, a pool's water — because
that is part of the building.

The laundry and housekeeping used to break that rule, and it showed: installing
`appliance_washer` put a fourth machine beside the three the laundry painted,
and `storage_linenShelf` stood a second shelf unit in front of housekeeping's
own. The laundry now paints the *plumbing* — three tiled bays with a plinth and
a stop tap — and the machines are decor standing in them; housekeeping's
shelving is half the width it was. A room's slot table names which of those
places the building furnishes itself (`fixture`), so a new room still arrives
looking like a laundry.

`tools/selftest/room-fixtures.json` records what every room paints and where,
in the same 1x pixels, and `tools/selftest/slots.ts` checks the slot table
against it on every run. Change a room routine and update that file in the same
commit, or the check is measuring a picture that no longer exists.

## Looking at it

Nothing here can screenshot the running game: DEC-009 keeps the canvas out of
CI and these machines have no GPU. `preview.py` composes the same pictures the
game composes instead, and `compose` is the one that matters — a room with its
decor at the game's own anchors and its people at the game's own scale.

    python3 tools/art/preview.py rooms rooms_guest
    python3 tools/art/preview.py decor bed
    python3 tools/art/preview.py cast
    python3 tools/art/preview.py compose standard

Sheets land in `docs/art-preview/`.

## Determinism

No `random`. Where variation is wanted — a room's grime, the skyline behind the
hotel — it comes from `hcvariants.seeded(key)`, an xorshift keyed by the
asset's own name, so a picture is the same whether it was generated alone or in
a batch of two hundred.
