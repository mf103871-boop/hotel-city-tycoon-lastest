"""A layout proof using shipped PNGs. This is NOT a running-engine capture."""
import json
from pathlib import Path
from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parents[2]
ASSETS = ROOT / 'public/assets/@2x'
OUT = ROOT / 'docs/art-preview/cartoon-v1'
M = json.loads((ROOT / 'public/assets/manifest.json').read_text())
ENTRIES = {e['key']: e for e in M['entries']}
RESAMPLE = Image.Resampling.LANCZOS
ZOOM = 3


def art(rel):
    return Image.open(ASSETS / rel).convert('RGBA')


def character(kind, clip='idle', frame=0):
    e = ENTRIES[f'{kind}.sheet']
    a = e['anim']
    w, h = a['frame']['w'] * 2, a['frame']['h'] * 2
    row = a['clips'][clip]['row']
    return art(e['file']).crop((frame*w, row*h, (frame+1)*w, (row+1)*h))


def person(room, kind, x, y, clip='idle', frame=0):
    im = character(kind, clip, frame)
    scale = .82 * ZOOM / 2
    im = im.resize((round(im.width*scale), round(im.height*scale)), RESAMPLE)
    room.alpha_composite(im, (round(x*ZOOM-24*.82*ZOOM), round(y*ZOOM-70*.82*ZOOM)))


def lobby(elapsed_ms=0):
    room = art('rooms/lobby_base.png').resize((256*ZOOM,96*ZOOM), RESAMPLE)
    for kind,x,y,clip in [('guest.standard',77,84,'walk'),
                          ('staff.cleaner',112,84,'work'),
                          ('staff.receptionist',174,83,'work')]:
        timing = ENTRIES[f'{kind}.sheet']['anim']['clips'][clip]
        frame = int(elapsed_ms * timing['fps'] / 1000) % timing['frames']
        person(room, kind, x, y, clip, frame)
    room.alpha_composite(art('rooms/lobby_front.png').resize(room.size, RESAMPLE))
    return room


def bedroom():
    room = art('rooms/economy_base.png').resize((128*ZOOM,96*ZOOM), RESAMPLE)
    # Existing economy slot: center (3,14) in 16-unit coordinates, 6x6 box.
    bed = art('decor/bed_cot.png').resize((48*ZOOM,round(64/104*48*ZOOM)),RESAMPLE)
    room.alpha_composite(bed, (0,84*ZOOM-bed.height))
    person(room, 'guest.standard', 24, 84, 'sleep')
    return room


def main():
    OUT.mkdir(parents=True, exist_ok=True)
    board = Image.new('RGBA',(864,862),(246,243,232,255))
    draw = ImageDraw.Draw(board)
    font_path = '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
    try:
        title = ImageFont.truetype(font_path,24)
        small = ImageFont.truetype(font_path,15)
    except OSError:
        title = small = ImageFont.load_default()
    draw.text((48,24),'HOTEL CITY  /  CARTOON ART V1',font=title,fill='#242620')
    draw.text((48,59),'Assembled runtime assets - not an engine screenshot',font=small,fill='#4b524d')
    board.alpha_composite(lobby(220),(48,96))
    draw.text((48,405),'ECONOMY ROOM',font=small,fill='#242620')
    board.alpha_composite(bedroom(),(48,437))
    draw.text((477,405),'NEW CAST',font=small,fill='#242620')
    for x,kind in [(458,'guest.standard'),(584,'staff.receptionist'),(710,'staff.cleaner')]:
        im=character(kind)
        im=im.resize((144,216),RESAMPLE)
        board.alpha_composite(im,(x,457))
    draw.text((48,756),'7 original sources / 32 exported PNGs / 1x + 2x',font=small,fill='#4b524d')
    draw.text((48,787),'Animation timing, blanket layering and device review remain in progress.',font=small,fill='#4b524d')
    board.convert('RGB').save(OUT/'layout-proof.png',optimize=True)
    print('Wrote layout-proof.png (asset composition, not an engine capture).')


if __name__ == '__main__':
    main()
