"""Batch 2: starships, the orbital station, frontier creatures and the Abyssians."""
import math
from forge import Prim as P, Part
from units import Unit, flash_part


def leg_parts(prefix, anchors, mat='joint', tip='ink', parent='body', reach=3.5, drop=None, r=1.0):
    """Two-segment legs from each anchor (x, y, z): out and up to a knee, then down to the ground."""
    out = {}
    for i, (x, y, z) in enumerate(anchors):
        side = 1 if y > 0 else -1
        kx, ky, kz = x + (1.2 if x >= 0 else -1.2), y + side * reach * 0.6, z + 1.5
        fz = 0.8 if drop is None else drop
        out[f'{prefix}{i}'] = Part(f'{prefix}{i}', [P('cap', mat, (0, 0, 0), a=(x, y, z), b=(kx, ky, kz), r=r),
                                                     P('cap', tip, (0, 0, 0), a=(kx, ky, kz), b=(kx + 0.6, ky + side * 0.8, fz), r=r * 0.8)],
                                   pivot=(x, y, z), parent=parent)
    return out


def gait(names, k, amp=0.35):
    return {n: {'pitch': (amp if (i + k) % 2 else -amp) * (1 if k % 2 == 0 else 0.4)} for i, n in enumerate(names)}


def bob(k, a=0.5):
    return [0, a, a * 1.6, a][k % 4]


# ============================================================== starships (space, fly)
def engines(at_list, r=1.2):
    return Part('engine', [P('sph', 'core', a, r=r, s=(1.6, 1, 1)) for a in at_list], parent='hull')


def ship_pose(extra=None):
    def pose(anim, k):
        ps = {'hull': {'off': (0, 0, bob(k, 0.4) if anim != 'attack' else 0)},
              'engine': {'off': ([0, -0.6, 0, 0.4][k % 4] - (1.2 if anim == 'move' else 0), 0, 0)}}
        if anim == 'attack':
            ps['hull'] = {'off': ([-0.6, -1, 0][k], 0, 0)}
            ps['flash'] = {'hide': k == 2}
        if extra:
            ps.update(extra(anim, k))
        return ps
    return pose


def corvette():
    parts = {
        'hull': Part('hull', [P('cap', 'ink', (0, 0, 0), a=(-11, 0, 14), b=(8, 0, 14), r=2.6),
                              P('wedge', 'bone', (11, 0, 14), h=(4, 2.2, 2), r=0.4, cut=(1, 0, 0.3, 1.2)),
                              P('box', 'bone', (-3, 0, 16.6), h=(6, 1.8, 0.6), r=0.3),
                              P('box', 'team', (-4, -2.7, 13.6), h=(4, 0.3, 0.7), r=0.1),
                              P('wedge', 'ink', (-7, 0, 12), h=(3.5, 6, 0.4), r=0.2, cut=(1, 0, 0, 1.5)),
                              P('cyl', 'joint', (-12, 0, 14), axis='x', r=2.2, h=0.8)]),
        'flash': flash_part((16, 0, 13.5), r=1.2, parent='hull'),
    }
    parts['engine'] = engines([(-14, 0, 14)], r=1.5)
    dec = [((6, -2.2, 15), 'core.2', 'hull'), ((2, -2.4, 15), 'core.1', 'hull'), ((-1, -2.4, 15), 'core.1', 'hull')]
    return Unit('corvette', 46, 30, (24, 26), parts, fly=True, decals=dec, pose=ship_pose())


def frigate():
    parts = {
        'hull': Part('hull', [P('wedge', 'ink', (0, 0, 14), h=(14, 4.5, 2.8), r=0.7, cut=(1, 0, 0.6, 12)),
                              P('box', 'bone', (-2, 0, 17.4), h=(9, 3, 0.8), r=0.4),
                              P('box', 'bone', (-6, 0, 19.5), h=(3, 2.4, 1.6), r=0.4),
                              P('box', 'team', (-3, -4.6, 13.5), h=(6, 0.3, 0.8), r=0.1),
                              P('box', 'joint', (0, 0, 10.6), h=(10, 3, 0.8), r=0.3),
                              P('cyl', 'joint', (-14.5, -2, 14), axis='x', r=1.6, h=0.8),
                              P('cyl', 'joint', (-14.5, 2, 14), axis='x', r=1.6, h=0.8)]),
        'turret': Part('turret', [P('sph', 'bone', (4, 0, 19), r=1.8, s=(1.2, 1.1, 0.7)),
                                  P('cyl', 'steel', (7.5, 0, 19.2), axis='x', r=0.45, h=2.6)], parent='hull'),
        'flash': flash_part((10.6, 0, 19.2), r=1.2, parent='hull'),
    }
    parts['engine'] = engines([(-16.5, -2, 14), (-16.5, 2, 14)], r=1.3)
    dec = [((-4.5, -2.6, 20), 'core.2', 'hull'), ((-6.5, -2.6, 20), 'core.2', 'hull'), ((8, -4.4, 14.5), 'ember.2', 'hull')] + \
          [((x, -4.6, 15.6), 'core.1', 'hull') for x in (-9, -6, -3, 0, 3)]
    return Unit('frigate', 56, 34, (29, 30), parts, fly=True, decals=dec, pose=ship_pose())


def dreadnought():
    parts = {
        'hull': Part('hull', [P('wedge', 'ink', (0, 0, 15), h=(17, 6, 4), r=1.0, cut=(1, 0, 0.5, 14)),
                              P('box', 'bone', (-3, 0, 20), h=(11, 4.4, 1.2), r=0.5),
                              P('box', 'ink', (-8, 0, 23.4), h=(4, 3.4, 2.4), r=0.6),
                              P('box', 'bone', (-8, 0, 26.4), h=(2.6, 2.4, 0.7), r=0.3),
                              P('box', 'team', (-4, -6.1, 14), h=(8, 0.3, 1.0), r=0.1),
                              P('box', 'joint', (0, 0, 10.2), h=(13, 4.5, 1), r=0.4)] +
                     [P('cyl', 'joint', (-17.5, y, z), axis='x', r=1.7, h=0.9) for y in (-3, 3) for z in (13, 17)]),
        'turret': Part('turret', [P('sph', 'bone', (x, 0, 21.8), r=2.0, s=(1.2, 1.1, 0.7)) for x in (2, 7)] +
                       [P('cyl', 'steel', (x + 3.6, y, 22.2), axis='x', r=0.45, h=2.6) for x in (2, 7) for y in (-0.7, 0.7)],
                       parent='hull'),
        'flash': flash_part((14, 0, 22.2), r=1.5, parent='hull'),
    }
    parts['engine'] = engines([(-19.5, y, z) for y in (-3, 3) for z in (13, 17)], r=1.2)
    dec = [((-6, -3.5, 24.5), 'core.2', 'hull'), ((-8, -3.5, 24.5), 'core.3', 'hull'), ((-10, -3.5, 24.5), 'core.2', 'hull')] + \
          [((x, -6.1, 16.6), 'core.1', 'hull') for x in range(-13, 10, 3)] + [((10, -6, 13), 'ember.2', 'hull')]
    return Unit('dreadnought', 62, 42, (32, 36), parts, fly=True, decals=dec, pose=ship_pose())


def station():
    parts = {
        'hull': Part('hull', [P('cyl', 'ink', (0, 0, 18), axis='z', r=4, h=5),
                              P('sph', 'bone', (0, 0, 23.5), r=3.4, s=(1, 1, 0.6)),
                              P('cyl', 'steel', (0, 0, 28), axis='z', r=0.4, h=3),
                              P('box', 'team', (0, -4, 17), h=(1.6, 0.3, 2.2), r=0.1),
                              P('cyl', 'joint', (0, 0, 11.5), axis='z', r=2, h=1.5)]),
        'ring': Part('ring', [P('box', 'ink', (math.cos(a) * 11, math.sin(a) * 8, 18), h=(2.6, 2.6, 1.6), r=0.6) for a in (0, 1.5708, 3.1416, 4.7124)] +
                     [P('cap', 'joint', (0, 0, 0), a=(0, 0, 18), b=(math.cos(a) * 9, math.sin(a) * 6.5, 18), r=0.7) for a in (0, 1.5708, 3.1416, 4.7124)] +
                     [P('box', 'bone', (math.cos(a) * 11, math.sin(a) * 8, 19.9), h=(2, 2, 0.4), r=0.3) for a in (0, 1.5708, 3.1416, 4.7124)],
                     pivot=(0, 0, 18), parent='hull'),
        'flash': Part('flash', [P('sph', 'core', (0, 0, 32), r=2)], parent='hull'),
        'engine': Part('engine', [P('sph', 'core', (0, 0, 9.4), r=1.2)], parent='hull'),
    }

    def extra(anim, k):
        return {'ring': {'yaw': k * 0.2}}

    def lights(i):
        return [((math.cos(a) * 11, math.sin(a) * 8 - 2.6, 18.4), 'core.2' if (i + j) % 2 else 'core.1', 'ring')
                for j, a in enumerate((0, 1.5708, 3.1416, 4.7124))] + [((0, 0, 31.2), 'ember.2', 'hull')]
    return Unit('station', 52, 42, (26, 38), parts, fly=True, decals=[lights], pose=ship_pose(extra))


# ============================================================== frontier creatures
def crawler():
    anchors = [(x, y, 6) for x in (-5, 0, 5) for y in (-3.5, 3.5)]
    parts = {'body': Part('body', [P('sph', 'chitin', (0, 0, 7), r=5, s=(1.7, 1.0, 0.75)),
                                   P('sph', 'chitin', (-9.5, 0, 7.5), r=3, s=(1.4, 0.9, 0.8)),
                                   P('wedge', 'rock', (0, 0, 10.4), h=(6, 2.6, 0.8), r=0.5, cut=(0, 0, 1, 0.5))], pivot=(0, 0, 7)),
             'head': Part('head', [P('sph', 'chitin', (10, 0, 7), r=2.6, s=(1.2, 1, 0.9)),
                                   P('cap', 'bone', (0, 0, 0), a=(12, -1.5, 6), b=(14.5, -1, 4.5), r=0.6),
                                   P('cap', 'bone', (0, 0, 0), a=(12, 1.5, 6), b=(14.5, 1, 4.5), r=0.6)], pivot=(8, 0, 7), parent='body')}
    parts.update(leg_parts('leg', anchors, mat='chitin', tip='ink', reach=3, r=0.8))
    parts['flash'] = Part('flash', [P('sph', 'ember', (15, 0, 5), r=1.2)], parent='head')
    legs = [f'leg{i}' for i in range(6)]

    def pose(anim, k):
        if anim == 'move':
            ps = gait(legs, k, 0.3); ps['body'] = {'off': (0, 0, [0, 0.5, 0, 0.5][k])}; return ps
        if anim == 'attack':
            return {'head': {'pitch': [-0.3, 0.15, 0][k], 'off': ([1, 2, 0][k], 0, 0)}, 'flash': {'hide': k != 1}}
        return {'body': {'off': (0, 0, [0, 0.3, 0.4, 0.3][k])}}
    dec = [((12, -2.2, 8), 'ember.2', 'head'), ((10.6, -2.4, 8.2), 'ember.1', 'head')]
    return Unit('creatures/crawler', 52, 26, (24, 23), parts, decals=dec, pose=pose)


def floater():
    parts = {'body': Part('body', [P('sph', 'spore', (0, 0, 24), r=6.5, s=(1, 1, 0.7)),
                                   P('sph', 'core', (0, 0, 22.5), r=2.6),
                                   P('cyl', 'spore', (0, 0, 20.5), axis='z', r=6, h=0.5)], pivot=(0, 0, 24))}
    for i, a in enumerate((0.4, 1.9, 3.5, 5.0)):
        x, y = math.cos(a) * 3.5, math.sin(a) * 3
        parts[f't{i}'] = Part(f't{i}', [P('cap', 'spore', (0, 0, 0), a=(x, y, 20), b=(x * 1.2, y, 13), r=0.8),
                                         P('cap', 'flesh', (0, 0, 0), a=(x * 1.2, y, 13), b=(x * 0.9, y, 7), r=0.55)],
                              pivot=(x, y, 20), parent='body')
    parts['flash'] = Part('flash', [P('sph', 'core', (9, 0, 22), r=1.8)], parent='body')

    def pose(anim, k):
        sp = 0.25 if anim == 'move' else 0.15
        ps = {'body': {'off': (0, 0, [0, 1, 1.5, 1][k % 4])}}
        for i in range(4):
            ps[f't{i}'] = {'pitch': math.sin(k * 1.5 + i) * sp}
        if anim == 'attack':
            ps['flash'] = {'hide': k == 2}
        return ps
    spots = [((-3, -5.4, 25), 'spore.3', 'body'), ((2, -5.6, 26), 'spore.3', 'body'), ((0, -6.2, 23), 'core.3', 'body')]
    return Unit('creatures/floater', 34, 40, (16, 36), parts, fly=True, decals=spots, pose=pose)


def strider():
    parts = {'body': Part('body', [P('sph', 'rock', (0, 0, 26), r=4.5, s=(1.4, 1.1, 0.8)),
                                   P('wedge', 'bone', (5, 0, 26), h=(2.6, 2, 1.8), r=0.6, cut=(1, 0, 0.8, 1.6)),
                                   P('sph', 'moss', (-1, 0, 29), r=2.8, s=(1.6, 1, 0.5))], pivot=(0, 0, 26))}
    for i, (x, y) in enumerate(((-2, -3), (-2, 3), (3, -3), (3, 3))):
        parts[f'leg{i}'] = Part(f'leg{i}', [P('cap', 'rock', (0, 0, 0), a=(x, y, 24), b=(x + (3 if x > 0 else -3), y * 1.4, 18), r=1.0),
                                             P('cap', 'joint', (0, 0, 0), a=(x + (3 if x > 0 else -3), y * 1.4, 18), b=(x + (1 if x > 0 else -1), y * 1.3, 0.8), r=0.7)],
                                pivot=(x, y, 24), parent='body')
    parts['flash'] = Part('flash', [P('sph', 'ember', (9.5, 0, 25), r=1.3)], parent='body')
    legs = [f'leg{i}' for i in range(4)]

    def pose(anim, k):
        if anim == 'move':
            ps = gait(legs, k, 0.22); ps['body'] = {'off': (0, 0, [0, 0.8, 0, 0.8][k])}; return ps
        if anim == 'attack':
            return {'body': {'off': ([1, 1.6, 0][k], 0, 0), 'pitch': [0.1, 0.18, 0][k]}, 'flash': {'hide': k == 2}}
        return {'body': {'off': (0, 0, [0, 0.4, 0.6, 0.4][k])}}
    dec = [((7, -1.8, 26.6), 'core.2', 'body'), ((6, -1.8, 26.6), 'core.1', 'body')]
    return Unit('creatures/strider', 42, 40, (20, 37), parts, decals=dec, pose=pose)


def flyer():
    parts = {'body': Part('body', [P('cap', 'basalt', (0, 0, 0), a=(-8, 0, 16), b=(6, 0, 16.5), r=2.4),
                                   P('cap', 'basalt', (0, 0, 0), a=(-8, 0, 16), b=(-16, 0, 17.5), r=0.9),
                                   P('cap', 'flesh', (0, 0, 0), a=(-6, -2, 15.4), b=(5, -1.6, 15.6), r=0.9),
                                   P('wedge', 'bone', (9, 0, 17), h=(3.2, 1.6, 1.4), r=0.4, cut=(1, 0, 0.2, 0.8)),
                                   P('cap', 'bone', (0, 0, 0), a=(-2, 0, 18.4), b=(4, 0, 18.8), r=0.6)], pivot=(0, 0, 16)),
             'wingn': Part('wingn', [P('oct', 'flesh', (-1.5, -8, 17), r=1, s=(5.5, 7.5, 0.4)),
                                     P('cap', 'basalt', (0, 0, 0), a=(1, -1.5, 17.3), b=(3, -15, 17.3), r=0.55)], pivot=(0, -1.5, 17), parent='body'),
             'wingf': Part('wingf', [P('oct', 'flesh', (-1.5, 8, 17), r=1, s=(5.5, 7.5, 0.4)),
                                     P('cap', 'basalt', (0, 0, 0), a=(1, 1.5, 17.3), b=(3, 15, 17.3), r=0.55)], pivot=(0, 1.5, 17), parent='body'),
             'flash': Part('flash', [P('sph', 'ember', (13.5, 0, 16.5), r=1.4), P('sph', 'ember', (16, 0, 16.5), r=0.9)], parent='body')}

    def pose(anim, k):
        flap = 0.75 + [0.45, 0.1, -0.35, 0.1][k % 4] * (1.3 if anim == 'move' else 1)
        ps = {'body': {'off': (0, 0, [0, 1, 1.4, 0.6][k % 4])}, 'wingn': {'roll': -flap}, 'wingf': {'roll': flap}}
        if anim == 'attack':
            ps['flash'] = {'hide': k == 2}
        return ps
    dec = [((10, -1.5, 17.6), 'ember.2', 'body')]
    return Unit('creatures/flyer', 56, 44, (28, 40), parts, fly=True, decals=dec, pose=pose)


def serpent_unit(key, mat='shoal', head_mat='bone', n=7, w=52, h=30, eye='ember.2', glow='core'):
    parts = {}
    prims = []
    for i in range(n):
        prims.append(P('sph', mat, (-i * 3.2, 0, 4), r=3.0 - i * 0.22))
    parts['body'] = Part('body', prims, pivot=(0, 0, 4))
    parts['head'] = Part('head', [P('sph', mat, (4, 0, 6), r=3.2, s=(1.3, 1, 0.9)),
                                  P('wedge', head_mat, (6.5, 0, 7.4), h=(2.6, 2.2, 1), r=0.4, cut=(1, 0, 1, 1.4)),
                                  P('wedge', 'ink', (7, 0, 4.4), h=(2.4, 1.6, 0.6), r=0.3, cut=(1, 0, -1, 1.2))], pivot=(2, 0, 5), parent='body')
    parts['fin'] = Part('fin', [P('wedge', head_mat, (-i * 3.2, 0, 7 - i * 0.2), h=(1.2, 0.4, 1.4), r=0.1, cut=(1, 0, 1, 0.6)) for i in range(1, n - 1, 2)],
                        parent='body')
    parts['flash'] = Part('flash', [P('sph', glow, (10.5, 0, 5), r=1.4)], parent='head')

    def pose(anim, k):
        ph = k * 1.57
        ps = {'body': {'off': (0, 0, 0)}}
        wave = 0.8 if anim == 'move' else 0.4
        # sideways undulation: move the body prims via yaw of head and a bob
        ps['head'] = {'pitch': math.sin(ph) * 0.12 + ([-0.35, 0.2, 0][k] if anim == 'attack' else 0)}
        ps['body'] = {'off': (0, 0, math.sin(ph) * wave * 0.6)}
        if anim == 'attack':
            ps['flash'] = {'hide': k == 2}
        return ps
    dec = [((6.5, -2.4, 7.2), eye, 'head')] + [((-i * 3.2, -2.6, 4.6), 'core.1', 'body') for i in range(1, n, 2)]
    return Unit(key, w, h, (w // 2 + 6, h - 4), parts, decals=dec, pose=pose)


def serpent():
    return serpent_unit('creatures/serpent')


def husk():
    parts = {'body': Part('body', [P('sph', 'bile', (0, 0, 15), r=4, s=(1, 1, 1.2)),
                                   P('sph', 'bile', (2.5, 0, 20), r=2.6),
                                   P('sph', 'acid', (1, -3.4, 15), r=1.2),
                                   P('sph', 'acid', (-1.5, 3, 17), r=1.0)], pivot=(0, 0, 10)),
             'arm': Part('arm', [P('cap', 'bile', (0, 0, 0), a=(1, -4, 17), b=(5, -4.5, 11), r=1.1),
                                 P('cap', 'bone', (0, 0, 0), a=(5, -4.5, 11), b=(8, -4.5, 9.5), r=0.6)], pivot=(1, -4, 17), parent='body')}
    for i, y in enumerate((-2, 2)):
        parts[f'leg{i}'] = Part(f'leg{i}', [P('cap', 'bile', (0, 0, 0), a=(0, y, 11), b=(0.5, y, 5), r=1.2),
                                             P('cap', 'basalt', (0, 0, 0), a=(0.5, y, 5), b=(1, y, 1), r=1.0)], pivot=(0, y, 11), parent='body')
    parts['flash'] = Part('flash', [P('sph', 'acid', (10, -4.5, 9.5), r=1.3)], parent='arm')

    def pose(anim, k):
        if anim == 'move':
            sw = [0.3, 0, -0.3, 0][k]
            return {'body': {'off': (0, 0, [0, 0.6, 0, 0.6][k]), 'pitch': 0.15}, 'leg0': {'pitch': sw}, 'leg1': {'pitch': -sw},
                    'arm': {'pitch': -sw * 0.6}}
        if anim == 'attack':
            return {'arm': {'pitch': [0.8, -0.6, 0][k]}, 'flash': {'hide': k != 1}, 'body': {'pitch': 0.15}}
        return {'body': {'pitch': 0.12 + [0, 0.03, 0.06, 0.03][k]}}
    dec = [((4.6, -2.2, 20.6), 'acid.3', 'body'), ((3.6, -2.4, 20.6), 'acid.2', 'body')]
    return Unit('creatures/husk', 40, 34, (18, 31), parts, decals=dec, pose=pose)


def kaiju():
    parts = {'body': Part('body', [P('sph', 'basalt', (0, 0, 17), r=7, s=(1.3, 1.0, 1.15)),
                                   P('cap', 'basalt', (0, 0, 0), a=(-6, 0, 13), b=(-18, 0, 6), r=2.6),
                                   P('sph', 'rock', (2, 0, 13), r=4, s=(1.2, 0.9, 1))] +
                     [P('wedge', 'magma', (x, 0, 26 - abs(x + 2) * 0.35), h=(1.4, 1.0, 2.4), r=0.2, cut=(1, 0, 1, 1.0)) for x in (-8, -4, 0, 4)],
                     pivot=(0, 0, 14)),
             'head': Part('head', [P('sph', 'basalt', (11, 0, 25), r=3.6, s=(1.4, 1, 0.9)),
                                   P('wedge', 'rock', (14, 0, 23), h=(2.8, 2.4, 1), r=0.5, cut=(1, 0, -1, 1.6))], pivot=(7, 0, 23), parent='body')}
    for i, y in enumerate((-4, 4)):
        parts[f'leg{i}'] = Part(f'leg{i}', [P('cap', 'basalt', (0, 0, 0), a=(-1, y, 12), b=(1, y * 1.1, 4), r=2.6),
                                             P('box', 'basalt', (2, y * 1.1, 1.2), h=(3.6, 2.2, 1.2), r=0.6)], pivot=(-1, y, 12), parent='body')
    parts['arm'] = Part('arm', [P('cap', 'basalt', (0, 0, 0), a=(6, -6, 19), b=(10, -6.5, 14), r=1.5)], pivot=(6, -6, 19), parent='body')
    parts['flash'] = Part('flash', [P('sph', 'magma', (19, 0, 23), r=2.2), P('sph', 'magma', (23, 0, 23), r=1.4)], parent='head')

    def pose(anim, k):
        if anim == 'move':
            sw = [0.3, 0, -0.3, 0][k]
            return {'body': {'off': (0, 0, [0, 1, 0, 1][k])}, 'leg0': {'pitch': sw}, 'leg1': {'pitch': -sw}, 'arm': {'pitch': sw * 0.5}}
        if anim == 'attack':
            return {'head': {'pitch': [-0.2, 0.15, 0][k]}, 'flash': {'hide': k == 2}}
        return {'body': {'off': (0, 0, [0, 0.4, 0.6, 0.4][k])}, 'head': {'pitch': [0, -0.04, -0.06, -0.03][k]}}
    dec = [((14, -2.6, 26), 'magma.3', 'head'), ((12.5, -2.8, 26.2), 'magma.2', 'head')] + \
          [((x, -6.8, 18), 'magma.1', 'body') for x in (-3, 0, 3)]
    return Unit('creatures/kaiju', 58, 40, (26, 37), parts, decals=dec, pose=pose)


# ============================================================== Abyssians (deep things)
def skitterling():
    anchors = [(x, y, 4) for x in (-3, 0, 3) for y in (-2.5, 2.5)]
    parts = {'body': Part('body', [P('sph', 'deep', (0, 0, 5), r=3.6, s=(1.6, 1.0, 0.75)),
                                   P('sph', 'deep', (6, 0, 5), r=2.0)], pivot=(0, 0, 5))}
    parts.update(leg_parts('leg', anchors, mat='deep', tip='ink', reach=2.4, r=0.6))
    parts['flash'] = Part('flash', [P('sph', 'core', (9.5, 0, 4.6), r=1.1)], parent='body')
    legs = [f'leg{i}' for i in range(6)]

    def pose(anim, k):
        if anim == 'move':
            ps = gait(legs, k, 0.4); ps['body'] = {'off': (0, 0, [0, 0.5, 0, 0.5][k])}; return ps
        if anim == 'attack':
            return {'body': {'off': ([1, 2, 0][k], 0, 0)}, 'flash': {'hide': k != 1}}
        return {'body': {'off': (0, 0, [0, 0.3, 0.4, 0.3][k])}}
    dec = [((7.4, -1.6, 5.6), 'core.3', 'body'), ((6.4, -1.8, 5.8), 'core.2', 'body'), ((-1, -3, 6.6), 'core.1', 'body')]
    return Unit('creatures/ab_skitterling', 40, 20, (19, 17), parts, decals=dec, pose=pose)


def tidecrawler():
    anchors = [(x, y, 5) for x in (-4, 0) for y in (-4, 4)]
    parts = {'body': Part('body', [P('sph', 'deep', (0, 0, 7), r=5.5, s=(1.3, 1.1, 0.7)),
                                   P('sph', 'shoal', (-1, 0, 10), r=3.4, s=(1.3, 1, 0.45))], pivot=(0, 0, 7)),
             'claw': Part('claw', [P('cap', 'deep', (0, 0, 0), a=(5, -4, 8), b=(9, -5, 10), r=1.2),
                                   P('sph', 'shoal', (11.5, -5, 10.5), r=2.4, s=(1.4, 0.9, 0.9)),
                                   P('wedge', 'bone', (14, -5, 9.4), h=(1.6, 0.8, 0.6), r=0.2, cut=(1, 0, -1, 0.6))],
                          pivot=(5, -4, 8), parent='body')}
    parts.update(leg_parts('leg', anchors, mat='deep', tip='shoal', reach=3, r=0.8))
    parts['flash'] = Part('flash', [P('sph', 'core', (15, -5, 10), r=1.3)], parent='claw')
    legs = [f'leg{i}' for i in range(4)]

    def pose(anim, k):
        if anim == 'move':
            ps = gait(legs, k, 0.3); ps['body'] = {'off': (0, 0, [0, 0.4, 0, 0.4][k])}; return ps
        if anim == 'attack':
            return {'claw': {'pitch': [0.5, -0.3, 0][k]}, 'flash': {'hide': k != 1}}
        return {'claw': {'pitch': [0, 0.06, 0.1, 0.06][k]}}
    dec = [((5, -3, 10.4), 'core.2', 'body'), ((5.2, -1.4, 10.6), 'core.2', 'body')]
    return Unit('creatures/ab_tidecrawler', 48, 28, (21, 24), parts, decals=dec, pose=pose)


def maw():
    parts = {'body': Part('body', [P('sph', 'deep', (0, 0, 11), r=9, s=(1.15, 1, 0.85)),
                                   P('box', 'ink', (9, -2, 9.6), h=(2.4, 5.5, 2.4), r=1.0)] +
                     [P('wedge', 'bone', (10.8, y, 11.4), h=(0.7, 0.6, 1.1), r=0.1, cut=(0, 0, -1, 0.3)) for y in (-7, -5, -3, -1, 1)],
                     pivot=(0, 0, 8)),
             'jaw': Part('jaw', [P('wedge', 'deep', (5, 0, 4), h=(5, 6.5, 2), r=1, cut=(0, 0, 1, 0.6))] +
                         [P('wedge', 'bone', (10.6, y, 8.2), h=(0.7, 0.6, 1.1), r=0.1, cut=(0, 0, 1, 0.3)) for y in (-6, -4, -2, 0)],
                         pivot=(0, 0, 5), parent='body'),
             'flash': Part('flash', [P('sph', 'core', (12, 0, 9), r=2)])}

    def teeth(i):
        out = []
        for j, y in enumerate((-4, -2.5, -1, 0.5, 2)):
            pass
        return out + [((-3, -8.6, 15), 'core.2', 'body'), ((0, -8.8, 16), 'core.3', 'body'), ((-6, -7.8, 13), 'core.1', 'body')]

    def pose(anim, k):
        if anim == 'move':
            return {'body': {'off': ([0, 0.6, 1, 0.4][k], 0, [0, 0.8, 0, 0.8][k])}}
        if anim == 'attack':
            return {'jaw': {'off': (0, 0, [-2, -2.6, 0][k])}, 'body': {'off': ([1, 2, 0][k], 0, 0)}, 'flash': {'hide': k != 1}}
        return {'jaw': {'off': (0, 0, [0, -0.4, -0.8, -0.4][k])}}
    return Unit('creatures/ab_maw', 52, 32, (22, 29), parts, decals=[teeth], pose=pose)


def riftback():
    parts = {'body': Part('body', [P('sph', 'deep', (0, 0, 10), r=6, s=(1.7, 1, 0.8)),
                                   P('sph', 'deep', (11, 0, 10), r=3, s=(1.3, 0.9, 0.9))] +
                     [P('oct', 'facet', (x, 0, 16 + h), r=h, s=(0.6, 0.6, 1.4)) for x, h in ((-6, 2.4), (-2, 3.4), (2.5, 2.8), (6, 1.8))],
                     pivot=(0, 0, 10))}
    for i, (x, y) in enumerate(((7, -3.5), (7, 3.5), (-7, -3.5), (-7, 3.5))):
        parts[f'leg{i}'] = Part(f'leg{i}', [P('cap', 'deep', (0, 0, 0), a=(x, y, 8), b=(x + 1, y, 4), r=1.6),
                                             P('cap', 'ink', (0, 0, 0), a=(x + 1, y, 4), b=(x + 0.5, y, 1), r=1.2)], pivot=(x, y, 8), parent='body')
    parts['flash'] = Part('flash', [P('oct', 'core', (-1, 0, 26), r=3.5)], parent='body')

    def pose(anim, k):
        if anim == 'move':
            sw = [0.35, 0, -0.35, 0][k]
            return {'body': {'off': (0, 0, [0, 0.7, 0, 0.7][k])}, 'leg0': {'pitch': sw}, 'leg3': {'pitch': sw},
                    'leg1': {'pitch': -sw}, 'leg2': {'pitch': -sw}}
        if anim == 'attack':
            return {'flash': {'hide': k == 2}, 'body': {'off': (0, 0, [-0.6, -1, 0][k])}}
        return {'body': {'off': (0, 0, [0, 0.3, 0.5, 0.3][k])}}
    dec = [((13.4, -2, 11), 'core.3', 'body'), ((-2, -1.4, 22), 'facet.3', 'body'), ((2.5, -1.2, 20), 'facet.3', 'body')]
    return Unit('creatures/ab_riftback', 56, 34, (25, 31), parts, decals=dec, pose=pose)


def choir():
    parts = {'body': Part('body', [P('sph', 'shoal', (math.cos(a) * 4.5, math.sin(a) * 3, 22 + math.sin(a * 2) * 3), r=3.0)
                                   for a in (0.3, 1.9, 3.4, 5.0)] + [P('sph', 'core', (0, 0, 22), r=2.2),
                                   P('cyl', 'bone', (0, 0, 29.5), axis='z', r=4.5, h=0.35)], pivot=(0, 0, 22)),
             'veil': Part('veil', [P('cap', 'shoal', (0, 0, 0), a=(x, 0, 19), b=(x * 1.3, 0, 9), r=0.6) for x in (-3, 0, 3)], parent='body'),
             'flash': Part('flash', [P('sph', 'core', (9, 0, 22), r=2.2), P('sph', 'core', (13, 0, 22), r=1.2)])}

    def eyes(i):
        return [((math.cos(a) * 4 + 0.6, math.sin(a) * 3 - 2.4, 22.6 + math.sin(a * 2) * 3), 'core.3' if (i + j) % 3 else 'core.1', 'body')
                for j, a in enumerate((0.3, 1.9, 3.4, 5.0))]

    def pose(anim, k):
        ps = {'body': {'yaw': k * (0.3 if anim == 'move' else 0.15), 'off': (0, 0, [0, 0.8, 1.2, 0.8][k % 4])},
              'veil': {'pitch': math.sin(k * 1.5) * 0.15}}
        if anim == 'attack':
            ps['flash'] = {'hide': k == 2}
        return ps
    return Unit('creatures/ab_choir', 34, 40, (17, 36), parts, fly=True, decals=[eyes], pose=pose)


def humanoid_abyss(key, w, h, scale=1.0, crown='core', crown_n=5, extra_eyes=0, mat='deep', plate='shoal'):
    s = scale
    parts = {'body': Part('body', [P('sph', mat, (0, 0, 20 * s), r=5 * s, s=(1, 1, 1.25)),
                                   P('box', plate, (1.5 * s, 0, 22 * s), h=(2.4 * s, 4 * s, 3 * s), r=1.0),
                                   P('sph', mat, (1 * s, 0, 29 * s), r=3 * s)], pivot=(0, 0, 14 * s)),
             'crown': Part('crown', [P('wedge', crown, (math.cos(a) * 2.6 * s, math.sin(a) * 2.6 * s, 33.5 * s), h=(0.7, 0.7, 2.4 * s), r=0.2,
                                       cut=(math.cos(a), math.sin(a), 0.7, 0.4)) for a in [i * 6.283 / crown_n for i in range(crown_n)]],
                           parent='body'),
             'arm': Part('arm', [P('cap', mat, (0, 0, 0), a=(1 * s, -5 * s, 24 * s), b=(5 * s, -6 * s, 16 * s), r=1.4 * s),
                                 P('cap', plate, (0, 0, 0), a=(5 * s, -6 * s, 16 * s), b=(9 * s, -6 * s, 13 * s), r=1.1 * s)],
                         pivot=(1 * s, -5 * s, 24 * s), parent='body')}
    for i, y in enumerate((-2.5, 2.5)):
        parts[f'leg{i}'] = Part(f'leg{i}', [P('cap', mat, (0, 0, 0), a=(0, y * s, 15 * s), b=(1 * s, y * s, 7 * s), r=1.8 * s),
                                             P('cap', 'ink', (0, 0, 0), a=(1 * s, y * s, 7 * s), b=(0, y * s, 1), r=1.4 * s)],
                                pivot=(0, y * s, 15 * s), parent='body')
    parts['flash'] = Part('flash', [P('sph', 'core', (11 * s, -6 * s, 13 * s), r=1.8 * s)], parent='arm')

    def pose(anim, k):
        if anim == 'move':
            sw = [0.3, 0, -0.3, 0][k]
            return {'body': {'off': (0, 0, [0, 0.8, 0, 0.8][k])}, 'leg0': {'pitch': sw}, 'leg1': {'pitch': -sw}, 'arm': {'pitch': -sw * 0.5}}
        if anim == 'attack':
            return {'arm': {'pitch': [0.9, -0.5, 0][k]}, 'flash': {'hide': k != 1}}
        return {'body': {'off': (0, 0, [0, -0.3, -0.5, -0.3][k])}, 'arm': {'pitch': [0, 0.05, 0.08, 0.05][k]}}
    dec = [((3 * s, -2.4 * s, 29.6 * s), 'core.3', 'body'), ((3.2 * s, -1 * s, 29.6 * s), 'core.2', 'body')]
    for e in range(extra_eyes):
        dec.append(((2.5 * s, (-3 + e * 1.6) * s, 31.4 * s), 'core.2', 'body'))
    dec += [((3.6 * s, -4.1 * s, 22 * s), 'core.1', 'body')]
    return Unit(key, w, h, (w // 2 - 2, h - 3), parts, decals=dec, pose=pose)


def deepking():
    return humanoid_abyss('creatures/ab_deepking', 52, 56, scale=1.45, crown='core', crown_n=6)


def sovereign():
    return humanoid_abyss('creatures/ab_sovereign', 54, 54, scale=1.4, crown='facet', crown_n=4, extra_eyes=4, plate='bone')


def mother():
    parts = {'body': Part('body', [P('sph', 'deep', (0, 0, 7), r=9, s=(1.4, 1, 0.7)),
                                   P('sph', 'shoal', (2, 0, 11), r=4, s=(1.3, 1, 0.6))] +
                     [P('sph', 'flesh', (x, y, z), r=r) for x, y, z, r in ((-8, -7, 7, 2.6), (-3, -8.4, 5, 2.2), (5, -8, 6, 2.4), (-11, -2, 10, 2.2), (0, -4, 12.6, 2.0))],
                     pivot=(0, 0, 6))}

    def glow(i):
        on = [(-8, -9.6, 7.6), (-3, -10.6, 5.4), (5, -10.4, 6.4)]
        return [(p, 'core.3' if (i + j) % 4 == 0 else 'core.2', 'body') for j, p in enumerate(on)] + [((8.6, -2.4, 11), 'core.3', 'body')]
    parts['flash'] = Part('flash', [P('sph', 'core', (14, 0, 9), r=2.0)], parent='body')

    def pose(anim, k):
        if anim == 'move':
            return {'body': {'off': ([0, 0.5, 1, 0.5][k], 0, [0, 0.6, 0, 0.6][k])}}
        if anim == 'attack':
            return {'flash': {'hide': k == 2}, 'body': {'off': (0, 0, [0.6, 1, 0][k])}}
        return {'body': {'off': (0, 0, [0, 0.3, 0.5, 0.3][k])}}
    return Unit('creatures/ab_mother', 50, 28, (24, 24), parts, decals=[glow], pose=pose)


def lantern():
    parts = {'body': Part('body', [P('cap', 'deep', (0, 0, 0), a=(0, 0, 1), b=(0.5, 0, 22), r=1.6),
                                   P('cap', 'deep', (0, 0, 0), a=(0.5, 0, 22), b=(3.5, 0, 27), r=0.9),
                                   P('sph', 'deep', (0, 0, 2), r=3, s=(1.3, 1.1, 0.6))], pivot=(0, 0, 1)),
             'lure': Part('lure', [P('sph', 'core', (4.5, 0, 26), r=2.0)], pivot=(3.5, 0, 27), parent='body'),
             'flash': Part('flash', [P('sph', 'core', (4.5, 0, 26), r=3.6)], parent='body')}

    def pose(anim, k):
        ps = {'body': {'pitch': [0, 0.04, 0.06, 0.04][k % 4] * (2 if anim == 'move' else 1)}, 'lure': {'off': (0, 0, [0, -0.5, -0.8, -0.5][k % 4])}}
        if anim == 'attack':
            ps['flash'] = {'hide': k == 2}
        return ps
    dec = [((1.3, -1.6, 8), 'core.1', 'body'), ((1.5, -1.6, 14), 'core.1', 'body'), ((1.6, -1.6, 19), 'core.2', 'body')]
    return Unit('creatures/ab_lantern', 18, 34, (8, 31), parts, decals=dec, pose=pose)


ALL2 = {f.__name__: f for f in (corvette, frigate, dreadnought, station, crawler, floater, strider, flyer, serpent, husk,
                                kaiju, skitterling, tidecrawler, maw, riftback, choir, deepking, sovereign, mother, lantern)}
