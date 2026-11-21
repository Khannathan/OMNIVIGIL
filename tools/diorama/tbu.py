"""Batch 3b: the TBU parts kit (Armored Core style) in the Diorama camera.
Ten 48x48 cells rendered with one shared origin so they stack in the hangar portrait
(order back, base, head, arm), like the Prism kit."""
from forge import Prim as P, Part, render
from statics import rp

CELL, ORG = 48, (19, 46)
NECK = (0, 0, 21.5)        # where heads sit
SHOULDER = (3, -5.2, 18)   # right-arm mount (front side, faces the camera)
BACK = (-4, 3.5, 19)       # backpack mount


def base():
    pr = []
    for y in (-3.2, 3.2):
        m = 'ink' if y < 0 else 'joint'
        pr += [P('box', m, (-1.5, y, 9), h=(1.8, 1.4, 3.2), r=0.6, seams=0),
               P('cap', 'joint', (0, 0, 0), a=(-1.5, y, 6), b=(0.5, y, 3.2), r=1.3),
               P('wedge', 'bone' if y < 0 else 'ink', (1, y, 1.4), h=(3.6, 1.8, 1.4), r=0.4, cut=(1, 0, 1, 3), seams=0)]
    pr += [P('box', 'joint', (0, 0, 12.6), h=(3, 3.6, 1.2), r=0.6, seams=0),
           P('wedge', 'ink', (0, 0, 16.8), h=(4.6, 4.6, 3.4), r=0.9, cut=(1, 0, -0.5, 4.2)),
           P('box', 'bone', (1.2, 0, 18.4), h=(3, 4.2, 1.6), r=0.6, seams=0),
           P('box', 'team', (-0.5, -4.65, 15.4), h=(3, 0.25, 0.8), r=0.05, seams=0),
           P('box', 'team', (-1.5, 4.0, 13.2), h=(1.4, 0.3, 0.6), r=0.05, seams=0),
           P('sph', 'joint', SHOULDER, r=1.7),
           P('cyl', 'joint', (0, 0, 20.6), axis='z', r=1.4, h=0.8)]
    dec = [((3.6, -4.3, 16), 'core.2', None), ((-3, -3.3, 9.5), 'core.1', None)]
    return pr, dec


def head_sensor():
    z = NECK[2]
    return [P('box', 'ink', (0.5, 0, z + 2), h=(2.6, 2.2, 1.6), r=0.6, seams=0),
            P('box', 'glass', (2.9, 0, z + 2.2), h=(0.5, 1.8, 0.5), r=0.2, seams=0),
            P('box', 'team', (-1, -2.3, z + 2.6), h=(1, 0.2, 0.4), r=0.05, seams=0),
            P('cap', 'steel', (0, 0, 0), a=(-1.5, 1.6, z + 3), b=(-3, 1.6, z + 6.5), r=0.25)], \
        [((3.4, -0.8, z + 2.2), 'core.3', None)]


def head_crest():
    z = NECK[2]
    return [P('wedge', 'ink', (0.5, 0, z + 2), h=(2.8, 2.2, 1.8), r=0.5, cut=(1, 0, 1, 2.2), seams=0),
            P('wedge', 'team', (-0.5, 0, z + 5), h=(3, 0.5, 2), r=0.1, cut=(-1, 0, 1, 0.6), seams=0),
            P('box', 'bone', (-0.5, 0, z + 3.9), h=(2, 2.3, 0.4), r=0.1, seams=0)], \
        [((2.4, -2.3, z + 2), 'core.3', None), ((1.4, -2.3, z + 2), 'core.2', None)]


def head_dome():
    z = NECK[2]
    return [P('cyl', 'ink', (0, 0, z + 1), axis='z', r=2.6, h=0.7),
            P('sph', 'glass', (0.3, 0, z + 2.2), r=1, s=(2.4, 2.4, 2.2)),
            P('sph', 'core', (1.6, -0.9, z + 2.6), r=0.6),
            P('box', 'team', (0, -2.6, z + 1), h=(1.2, 0.2, 0.4), r=0.05, seams=0)], []


def arm(weapon):
    x, y, z = SHOULDER
    pr = [P('box', 'ink', (x + 0.5, y - 1, z), h=(2.4, 1.4, 2.0), r=0.6, seams=0),
          P('box', 'team', (x + 0.5, y - 2.45, z + 0.6), h=(1.6, 0.1, 0.5), r=0.05, seams=0),
          P('cap', 'joint', (0, 0, 0), a=(x + 1, y - 1, z - 1.5), b=(x + 3, y - 1, z - 5), r=1.0)]
    hx, hz = x + 3.5, z - 5.5
    if weapon == 'rifle':
        pr += [P('box', 'bone', (hx + 3, y - 1, hz), h=(4, 1.0, 1.2), r=0.4, seams=0),
               P('cyl', 'steel', (hx + 10, y - 1, hz + 0.3), axis='x', r=0.5, h=3.4),
               P('box', 'ink', (hx + 1, y - 1, hz - 2), h=(0.8, 0.8, 1.4), r=0.2, seams=0)]
        dec = [((hx + 2, y - 2.1, hz + 0.3), 'core.2', None)]
    elif weapon == 'blade':
        pr += [P('box', 'ink', (hx + 1, y - 1, hz), h=(1.6, 1.2, 1.2), r=0.4, seams=0),
               rp(P('wedge', 'core', (hx + 6, y - 1, hz - 3.5), h=(5.5, 0.3, 0.8), r=0.1, cut=(0, 0, 1, 0.3), seams=0), 'y', 0.75)]
        dec = []
    else:  # cannon
        pr += [P('cyl', 'ink', (hx + 3, y - 1, hz), axis='x', r=2.0, h=3.6),
               P('cyl', 'bone', (hx + 8, y - 1, hz), axis='x', r=1.3, h=2),
               P('cyl', 'ember', (hx + 10.1, y - 1, hz), axis='x', r=0.8, h=0.15),
               P('tor', 'steel', (hx + 2, y - 1, hz), axis='x', R=2.0, r=0.4)]
        dec = []
    return pr, dec


def back(kind):
    x, y, z = BACK
    if kind == 'missiles':
        pr = [P('box', 'ink', (x, y, z + 2), h=(2.6, 2.6, 3), r=0.5, seams=0),
              P('box', 'team', (x - 2.65, y, z + 2), h=(0.1, 1.6, 1.6), r=0.05, seams=0)]
        dec = [((x + 0.6 + i * 1.2, y - 2.7, z + 4.2 - j * 1.6), 'ember.2', None) for i in range(2) for j in range(3)]
    elif kind == 'radar':
        pr = [P('box', 'ink', (x, y, z + 1), h=(2, 2, 2), r=0.5, seams=0),
              P('cyl', 'steel', (x - 1, y, z + 5), axis='z', r=0.4, h=2.5),
              rp(P('sph', 'bone', (x - 2, y, z + 7.5), r=1, s=(4, 4, 0.7)), 'y', -0.55),
              P('sph', 'core', (x - 0.8, y, z + 8.1), r=0.6)]
        dec = []
    else:  # shield
        pr = [P('box', 'ink', (x, y, z), h=(1.6, 1.6, 2), r=0.5, seams=0),
              rp(P('box', 'bone', (x - 2.6, y - 1, z + 1), h=(0.6, 3.6, 7.5), r=0.6, seams=0), 'y', 0.12),
              P('box', 'core', (x - 3.25, y - 1, z + 1), h=(0.1, 0.4, 5), r=0.05),
              P('box', 'team', (x - 3.2, y - 1, z + 6.6), h=(0.1, 2.4, 0.5), r=0.05, seams=0)]
        dec = []
    return pr, dec


PARTS = [('base/frame', base), ('head/sensor', head_sensor), ('head/crest', head_crest), ('head/dome', head_dome),
         ('arm/rifle', lambda: arm('rifle')), ('arm/blade', lambda: arm('blade')), ('arm/cannon', lambda: arm('cannon')),
         ('back/missiles', lambda: back('missiles')), ('back/radar', lambda: back('radar')), ('back/shield', lambda: back('shield'))]


def cell(fn):
    pr, dec = fn()
    return render({'p': Part('p', pr)}, {}, CELL, CELL, ORG, dec, scale=1.45)


if __name__ == '__main__':
    from forge import to_png
    from PIL import Image
    grids = [cell(f) for _, f in PARTS]
    to_png(grids, '/tmp/claude-0/tbu_kit.png')
    kit = Image.open('/tmp/claude-0/tbu_kit.png')
    # sample portraits: back, base, head, arm
    out = Image.new('RGBA', (48 * 4, 48), (40, 48, 56, 255))
    for i, (h, a, b) in enumerate(((1, 4, 7), (2, 5, 8), (3, 6, 9), (1, 6, 9))):
        for idx in (b, 0, h, a):
            out.alpha_composite(kit.crop((idx * 48, 0, idx * 48 + 48, 48)), (i * 48, 0))
    big = Image.new('RGBA', (kit.width, 100), (40, 48, 56, 255)); big.alpha_composite(kit, (0, 0)); big.alpha_composite(out, (0, 50))
    big.resize((big.width * 3, big.height * 3), 0).save('/tmp/claude-0/tbu_view.png')
