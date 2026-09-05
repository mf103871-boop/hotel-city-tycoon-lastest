#!/usr/bin/env python3
"""
Validate one room's proposed decor plan (8 catalogue slots + fixture slots)
against the same rules tools/selftest/slots.ts enforces, plus the spacing rule
this redesign adds. Usage:  python3 check_layout.py <plan.json>

plan.json = {
  "room": "<roomId>",
  "items": [ 8 x {"id","category","slotType", "new": bool, ...} ]   # in slot order
  "slots": [ 8 x {"kind","x","y","w","h", "fixture"?: "<id>"} ]      # index i = items[i]
  "extraFixtureSlots": [ {"kind","x","y","w","h","fixture"} ... ]    # fixtures that keep a slot of their own
}
Exit 0 and prints OK when valid; otherwise prints every problem and exits 1.
"""
import json, sys, os
ROOT = os.environ.get('HC_ROOT', '/home/user/hotel-city-tycoon-lastest/hotel-city-tycoon')
plan = json.load(open(sys.argv[1]))
rooms = {r['id']: r for r in json.load(open(f'{ROOT}/data/rooms.json'))['rooms']}
painted = json.load(open(f'{ROOT}/tools/selftest/room-fixtures.json'))['rooms']
decor = {i['id']: i for i in json.load(open(f'{ROOT}/data/decor.json'))['items']}
room = rooms[plan['room']]
W = room['blocks']['w'] * 128; H = room['blocks']['h'] * 96
UW = room['blocks']['w'] * 16; UH = room['blocks']['h'] * 16
FLOOR = {'spa': 12, 'pool': 10}.get(plan['room'], room['blocks']['h'] * 16 - 2)
CROSSABLE = {'washing line','ceiling pipes','picture rail','dado rail','cornice','wall rail','tiled dado','ceiling neon','neon bar left','neon bar right','neon underline','pelmet','welcome mat','number plaque','wall clock'}
KIND_BY_CAT = {'wallpaper':'wall','wallArt':'wall','lighting':'ceiling','flooring':'surface','rug':'surface','bed':'bed','seating':'ground','table':'ground','plant':'ground','luxury':'ground','appliance':'ground','storage':'ground'}
KIND_BY_SLOT = {'wall':'wall','ceiling':'ceiling','floor':'ground','bed':'bed','equipment':'ground'}
SLOT_SIZE = {'wall':(96,72),'floor':(72,72),'ceiling':(72,48),'bed':(104,64),'equipment':(96,72)}
ON_FLOOR = {'ground','bed','surface'}
STANDING = {'ground','bed'}
GAP = 8.0
problems = []
def bad(m): problems.append(m)
def box(s):
    cx, cy, w, h = s['x']*8, s['y']*6, s['w']*8, s['h']*6
    if s['kind'] == 'ceiling': return (cx-w/2, cy, cx+w/2, cy+h)
    if s['kind'] == 'wall': return (cx-w/2, cy-h/2, cx+w/2, cy+h/2)
    return (cx-w/2, cy-h, cx+w/2, cy)
def overlap(a, b, gap=0.0):
    return a[0] < b[2]+gap-0.001 and a[2] > b[0]-gap+0.001 and a[1] < b[3]-0.001 and a[3] > b[1]+0.001
def xoverlap(a, b, gap=0.0):
    return a[0] < b[2]+gap-0.001 and a[2] > b[0]-gap+0.001

items = plan['items']; slots = plan['slots']; extra = plan.get('extraFixtureSlots', [])
if len(items) != 8: bad(f'{len(items)} items, need exactly 8')
if len(slots) != 8: bad(f'{len(slots)} slots, need exactly 8')
ids = [i['id'] for i in items]
if len(set(ids)) != 8: bad('duplicate item ids')
for i, it in enumerate(items):
    if not it.get('new') and it['id'] not in decor: bad(f'item {i} {it["id"]} is not in decor.json and not marked new')
    if it.get('new') and it['id'] in decor: bad(f'item {i} {it["id"]} marked new but already exists')
    if it['category'] not in KIND_BY_CAT: bad(f'item {i} unknown category {it["category"]}')
    if it['slotType'] not in SLOT_SIZE: bad(f'item {i} unknown slotType {it["slotType"]}')
    if it['category'] == 'bed' and it['slotType'] != 'bed': bad(f'item {i}: bed category needs slotType bed')
    if it['category'] in ('appliance','storage') and it['slotType'] != 'equipment': bad(f'item {i}: {it["category"]} needs slotType equipment')
    if it['category'] in ('wallpaper','wallArt') and it['slotType'] != 'wall': bad(f'item {i}: {it["category"]} needs slotType wall')
    if it['category'] == 'lighting' and it['slotType'] != 'ceiling': bad(f'item {i}: lighting needs slotType ceiling')
    if it['category'] in ('flooring','rug','seating','table','plant','luxury') and it['slotType'] != 'floor': bad(f'item {i}: {it["category"]} needs slotType floor')
    if i < len(slots):
        want = KIND_BY_CAT.get(it['category'], KIND_BY_SLOT.get(it['slotType']))
        if slots[i]['kind'] != want: bad(f'slot {i} kind {slots[i]["kind"]} but item {it["id"]} wants {want}')
kinds = [s['kind'] for s in slots]
for k in ('wall','ceiling','surface'):
    if k not in kinds: bad(f'the 8 items include no {k} piece (need >=1 wall, >=1 ceiling, >=1 surface)')
if not any(k in STANDING for k in kinds): pass
allslots = slots + extra
for s in allslots:
    for key in ('x','y','w','h'):
        if not isinstance(s.get(key), int): bad(f'slot {s} has non-integer {key}')
    if s['x'] < 0 or s['y'] < 0: bad(f'slot {s} negative anchor')
    if s['w'] < 2 or s['h'] < 2: bad(f'slot {s} box too small (<2)')
    if s['x'] >= UW or s['y'] >= UH: bad(f'slot {s} anchor outside room units {UW}x{UH}')
    b = box(s)
    if b[0] < -0.001 or b[2] > W+0.001: bad(f'{s["kind"]}@({s["x"]},{s["y"]}) w{s["w"]} runs past the side wall (box x {b[0]:.0f}-{b[2]:.0f} of {W})')
    if b[1] < -0.001 or b[3] > H+0.001: bad(f'{s["kind"]}@({s["x"]},{s["y"]}) h{s["h"]} runs past ceiling/floor (box y {b[1]:.0f}-{b[3]:.0f} of {H})')
    if s['kind'] == 'ceiling' and s['y'] > 4: bad(f'ceiling slot at y={s["y"]} must be <= 4')
    if s['kind'] in ON_FLOOR and s['y'] > FLOOR: bad(f'{s["kind"]} slot at y={s["y"]} is below the floor line {FLOOR}')
    if s['kind'] in ON_FLOOR and s['y'] != FLOOR and not (plan['room'] == 'presidential' and s['y'] == 16) and not (plan['room'] == 'family' and s['y'] == 10 and s['kind']=='bed'):
        bad(f'{s["kind"]} slot at y={s["y"]}: floor pieces stand on the floor line {FLOOR} (presidential mezzanine 16 / family bunk 10 excepted)')
    fx = s.get('fixture')
    if fx:
        if fx not in decor: bad(f'fixture {fx} not in catalogue')
        else:
            d = decor[fx]; want = KIND_BY_CAT.get(d['category'], KIND_BY_SLOT[d['slotType']])
            if want != s['kind']: bad(f'fixture {fx} is a {want} piece but sits in a {s["kind"]} slot')
if not any(s['kind'] in ON_FLOOR and s['y'] == FLOOR for s in allslots): bad(f'no floor slot on the floor line {FLOOR}')
# same-kind / standing collisions with spacing
for i in range(len(allslots)):
    for j in range(i+1, len(allslots)):
        a, b = allslots[i], allslots[j]
        if a is b: continue
        ba, bb = box(a), box(b)
        if a['kind'] in STANDING and b['kind'] in STANDING and a['y'] == b['y']:
            if xoverlap(ba, bb, GAP): bad(f'standing pieces {a["kind"]}@{a["x"]} and {b["kind"]}@{b["x"]} are closer than 8px (need a clear gap): boxes x {ba[0]:.0f}-{ba[2]:.0f} / {bb[0]:.0f}-{bb[2]:.0f}')
        if a['kind'] == b['kind'] and a['kind'] not in STANDING:
            if overlap(ba, bb, GAP): bad(f'two {a["kind"]} slots @({a["x"]},{a["y"]}) and ({b["x"]},{b["y"]}) overlap or touch (need 8px gap)')
        if {a['kind'], b['kind']} == {'wall','ceiling'} and overlap(ba, bb): bad(f'wall @({a["x"]},{a["y"]}) and ceiling @({b["x"]},{b["y"]}) boxes overlap — keep lamps clear of pictures')
        if a['kind'] == 'surface' and b['kind'] == 'surface' and a['y'] == b['y'] and xoverlap(ba, bb, GAP): bad(f'two surfaces @{a["x"]} and @{b["x"]} too close')
# against the painted room
for s in allslots:
    b = box(s); floorPx = s['y'] * 6
    for f in painted.get(plan['room'], []):
        if f['name'] in CROSSABLE: continue
        fb = (f['x0'], f['y0'], f['x1'], f['y1'])
        if s['kind'] in ON_FLOOR:
            if not f.get('standing'): continue
            if not (f['y0'] <= floorPx + 6 and f['y1'] >= floorPx - 6): continue
            if xoverlap(b, fb): bad(f'{s["kind"]}@{s["x"]} stands in the painted "{f["name"]}" (x {f["x0"]:.0f}-{f["x1"]:.0f})')
        else:
            if overlap(b, fb): bad(f'{s["kind"]}@({s["x"]},{s["y"]}) hangs over the painted "{f["name"]}" ({f["x0"]:.0f}-{f["x1"]:.0f} x {f["y0"]:.0f}-{f["y1"]:.0f})')
# fixtures preserved
wanted = plan.get('requiredFixtures')
if wanted is not None:
    have = sorted([s['fixture'] for s in allslots if s.get('fixture')])
    if have != sorted(wanted): bad(f'fixtures differ: have {have}, need {sorted(wanted)}')
# draw sizes
print(f'room {plan["room"]} {W}x{H}px floor line {FLOOR}')
for i, s in enumerate(slots):
    it = items[i]; nw, nh = SLOT_SIZE[it['slotType']]; nw *= 0.55; nh *= 0.55
    sc = min(1, s['w']*8/nw, s['h']*6/nh)
    note = ' (small)' if sc < 0.6 else ''
    print(f'  [{i}] {it["id"]:<32} {s["kind"]:<8} @({s["x"]:>2},{s["y"]:>2}) box {s["w"]}x{s["h"]}  drawn {nw*sc:4.0f}x{nh*sc:3.0f}px{note}' + (f'  replaces built-in {s["fixture"]}' if s.get('fixture') else ''))
for s in extra:
    print(f'  fixture {s["fixture"]:<28} {s["kind"]:<8} @({s["x"]:>2},{s["y"]:>2}) box {s["w"]}x{s["h"]}')
if problems:
    print('PROBLEMS:'); [print('  - ' + p) for p in problems]; sys.exit(1)
print('OK')
