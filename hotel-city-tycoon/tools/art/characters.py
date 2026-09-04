"""
The cast: nine people who run and visit the hotel.

`hcstyle.draw_person` already knows how to draw a body, so nothing here draws
anything. This module is *casting*: deciding who these nine are. That is a
harder job than it sounds, because ART-0 §5 sets two tests a cast has to pass
at once.

**The uniform has to name the role with no label.** A player meeting a
character for the first time sees a 30-pixel figure walking across a room, and
has to know what it does. So each role gets one silhouette-level signal — a
toque, a peaked cap, a waistcoat, a mop — and then a colour that belongs to
nobody else. The chef is the only person in whites, the lifeguard the only one
in red-and-blue, the usher the only one in grape.

**They have to be nine people, not one person recoloured.** §5 forbids exactly
that, and it is the easy failure: nine bodies at height 1.0, build "normal",
differing only in shirt. So height, build, skin, hair colour *and* hair
silhouette all move together here — the trainer is tall and broad with black
spikes, the usher is short and slim with pink pigtails, and they would still be
told apart as pure black shapes. Five skin tones and all six hair colours are
spent across nine characters; two people are old, one is visibly young.

Props are the last 10%. A mop or a tray finishes the reading of a uniform that
is already right, and cannot rescue one that is not.
"""
from __future__ import annotations

from hcstyle import P, Person


class Member:
    """
    One castable character: an identity, two props and a default mood.

    `prop` is what they carry while idle and walking; `prop_work` is what
    appears in the work pose, which is often a different tool — a bartender
    walks with a towel and works with a glass. Defaulting `prop_work` to `prop`
    keeps the common case (a cleaner never puts the mop down) to one argument.
    """

    def __init__(self, person: Person, prop: str | None = None,
                 prop_work: str | None = None, expression: str = "smile"):
        self.person = person
        self.prop = prop
        self.prop_work = prop_work if prop_work is not None else prop
        self.expression = expression


# ------------------------------------------------------------------- staff

#: The seven roles in `data/staff.json`, in the order the player unlocks them.
#:
#: Uniform colours are chosen against the room each role works in, because a
#: staff member is nearly always seen standing in their own room: the cleaner's
#: blue is loud against pale-blue housekeeping, the chef's whites are the only
#: light shape in the warm-red restaurant, the usher's grape reads on the navy
#: of the cinema.
STAFF = {
    # The face of the hotel, so the loudest uniform in the game: a bellhop's
    # coral tunic and pillbox cap, gold at the collar. No prop when idle —
    # standing empty-handed at the desk is what a receptionist looks like — and
    # the register when checking somebody in.
    "receptionist": Member(
        Person(skin=P["skin4"], hair=P["hairBlack"], hair_style="short",
               top=P["coral"], bottom=P["ink2"], accent=P["gold"],
               cap=P["coral"], cap_style="pillbox",
               build="normal", height=1.00),
        prop=None, prop_work="clipboard", expression="happy",
    ),
    # Apron and mop, the two things that have meant "cleaner" for a century.
    # Short and slim with a high bun: her outline is the narrowest of the seven,
    # which is what keeps her apart from the receptionist at a glance even
    # though both are staff in a coloured tunic.
    "cleaner": Member(
        Person(skin=P["skin2"], hair=P["hairAuburn"], hair_style="bun",
               top=P["roomBlue"], bottom=P["ink2"], accent=P["white"],
               apron=P["linen"],
               build="slim", height=0.94),
        prop="mop", expression="smile",
    ),
    # The biggest body in the cast: broad, tall, black spikes, no hat. The gym
    # is the one room where the staff member is meant to look stronger than the
    # guests, and build does that where a uniform cannot.
    "trainer": Member(
        Person(skin=P["skin5"], hair=P["hairBlack"], hair_style="spiky",
               top=P["green"], bottom=P["ink2"], accent=P["creamHi"],
               build="broad", height=1.08),
        prop="dumbbell", expression="happy",
    ),
    # Whites and a toque. The jacket is warmWhite rather than white so the
    # toque stays the brightest thing on him and the hat keeps its own edge;
    # two identical whites stacked read as one tall blob at 1x. Grey hair and a
    # heavy build make him the senior of the kitchen, and the coral neckerchief
    # is the single accent his uniform is allowed. Dark trousers, though a real
    # kitchen wears check: with pale skin, grey hair, a white jacket and a white
    # hat, a pale leg as well left nothing in the figure to anchor it, and he
    # dissolved against a light wall.
    "chef": Member(
        Person(skin=P["skin1"], hair=P["hairGrey"], hair_style="short",
               top=P["warmWhite"], bottom=P["ink2"], accent=P["coral"],
               cap=P["white"], cap_style="toque",
               build="broad", height=0.98, age="senior"),
        prop=None, prop_work="tray", expression="happy",
    ),
    # Waistcoat over a pale shirt: the apron slot, used for the one garment
    # that says bar rather than kitchen. Navy, not the near-black it started as
    # — at that value the waistcoat swallowed its own outline and the torso read
    # as a hole. Slim, tall and curly-haired, so the dark torso block does not
    # read as the same person as the chef. The shirt is pale blue and not the
    # white a bar actually wears, for two reasons: it leaves the chef as the
    # only person in the game dressed in white, and a white towel or a white
    # glass held against a white sleeve is a prop that has vanished.
    "bartender": Member(
        Person(skin=P["skin3"], hair=P["hairBrown"], hair_style="curly",
               top=P["glass"], bottom=P["ink2"], accent=P["gold"],
               apron=P["wallNavy"],
               build="slim", height=1.02),
        prop="towel", prop_work="cup", expression="smile",
    ),
    # The youngest of the cast — short, slim, long pink hair under a peaked cap.
    # Grape is nobody else's colour and survives the cinema's navy wall, and
    # the popcorn box is the prop that fixes the room she belongs to. Two
    # earlier hair styles failed against the cap: pigtails sit at exactly the
    # height of its brim, so the shapes touched and the pair read as earmuffs,
    # and a short cut left only a strip of fringe showing under the crown,
    # which read as a hairband. Long hair falls clear of the brim on both
    # sides, and is the one style a hat cannot swallow.
    "usher": Member(
        Person(skin=P["skin1"], hair=P["hairPink"], hair_style="long",
               top=P["wallGrape"], bottom=P["ink2"], accent=P["gold"],
               cap=P["wallGrape"], cap_style="peaked",
               build="slim", height=0.92),
        prop="popcorn", expression="happy",
    ),
    # Red top, blue shorts, blond ponytail, whistle: the international uniform
    # of a poolside. Bare-headed like the trainer, but half a head shorter and
    # a normal build, and the only person in the game wearing two saturated
    # colours at once.
    "lifeguard": Member(
        Person(skin=P["skin3"], hair=P["hairBlond"], hair_style="ponytail",
               top=P["coral"], bottom=P["roomBlue"], accent=P["white"],
               build="normal", height=1.00),
        prop="whistle", expression="smile",
    ),
}


# ------------------------------------------------------------------ guests

#: The two guest types. Guests must not be mistakable for staff, so neither
#: wears a hat, an apron or a saturated tunic — the whole staff vocabulary is
#: off limits, and what is left is soft clothes and a piece of luggage.
GUESTS = {
    # Everybody who checks in. Deliberately the most ordinary figure drawn:
    # lavender jacket, long brown hair, average height and build, a suitcase in
    # one hand. He is the yardstick the rest of the cast is read against, so he
    # gets no strong signal of his own.
    "standard": Member(
        Person(skin=P["skin2"], hair=P["hairBrown"], hair_style="long",
               top=P["lavender"], bottom=P["ink2"], accent=P["cream"],
               build="normal", height=1.00),
        prop="suitcase", expression="smile",
    ),
    # The secret inspector, who has to be spottable by a player who knows what
    # to look for and invisible to one who does not. Everything about him is
    # sober: a grey suit, a red tie at the collar, grey hair, a heavy build and
    # the only unhappy mouth in the cast. The clipboard is the tell. Balding was
    # the obvious draw for him and had to go — the bald style leaves hair only
    # at the temples, and two grey lobes either side of a head read as
    # headphones, which is a different character entirely.
    "inspector": Member(
        Person(skin=P["skin4"], hair=P["hairGrey"], hair_style="short",
               top=P["metalDk"], bottom=P["ink2"], accent=P["coral"],
               build="broad", height=1.04, age="senior"),
        prop="clipboard", expression="cross",
    ),
}


#: What `gen_chars.py` reads, keyed exactly as `data/staff.json` and
#: `data/guests.json` name their rows.
CAST = {f"staff.{k}": v for k, v in STAFF.items()}
CAST.update({f"guest.{k}": v for k, v in GUESTS.items()})

__all__ = ["Member", "STAFF", "GUESTS", "CAST"]
