"""Batch 1 unit models for the diorama forge: the eleven core army units, posed for the game's
15-frame strip (idle 0-3, move 4-7, attack 8-10, death 11-14). Units face right (+x)."""
import math
from forge import Prim as P, Part, render

TAU = math.pi * 2


def flash_part(at, r=1.8, parent=None):
    return Part('flash', [P('sph', 'ember', at, r=r), P('sph', 'ember', (at[0] + r * 1.4, at[1], at[2]), r=r * 0.6)],
                pivot=at, parent=parent)


def death_pose(parts, i, seed=1, fly=False):
    """Frames 11-14: flash, break apart, scorch, settle."""
    k = i - 11
    pose = {}
    names = [n for n, p in parts.items() if p.parent is None and n != 'flash']
    for j, n in enumerate(names):
        a = (j * 2.399 + seed) % TAU
        spread = [0, 1.5, 3, 3.5][k]
        lift = [0, 2, 1, -1][k] if not fly else [0, -3, -9, -16][k]
        pose[n] = {'off': (math.cos(a) * spread, 0, max(-4, lift + abs(math.sin(a)) * spread * 0.5)),
                   'pitch': [0, 0.15, 0.35, 0.5][k] * (1 if j % 2 else -1)}
        if k == 0:
            pose[n]['mat'] = 'ember' if j == 0 else None
    pose['flash'] = {'hide': True}
    return pose, [0, 0, 1, 2][k]


class Unit:
    def __init__(self, key, w, h, origin, parts, fly=False, decals=(), pose=None, bob=0.0):
        self.key, self.w, self.h, self.origin, self.parts, self.fly = key, w, h, origin, parts, fly
        self.decals, self.posefn, self.bob = list(decals), pose, bob

    def frame(self, i):
        if i >= 11:
            pose, dim = death_pose(self.parts, i, fly=self.fly)
            return render(self.parts, pose, self.w, self.h, self.origin, self.decals_for(i), dim=dim)
        anim, k = ('idle', i) if i < 4 else ('move', i - 4) if i < 8 else ('attack', i - 8)
        pose = self.posefn(anim, k) if self.posefn else {}
        pose.setdefault('flash', {'hide': True})
        return render(self.parts, pose, self.w, self.h, self.origin, self.decals_for(i))

    def decals_for(self, i):
        out = []
        for d in self.decals:
            if callable(d):
                out += d(i)
            else:
                out.append(d)
        return out

    def frames(self):
        # render with room below, then crop so the lowest outline of the live frames sits on the
        # last row (sheets are anchored bottom-centre); death frames may fall into the cut
        self.h += 8
        fr = [self.frame(i) for i in range(15)]
        self.h -= 8
        bottom = max(max((y for y in range(f.shape[0]) if any(v is not None for v in f[y])), default=0) for f in (fr if self.fly else fr[:11]))
        top = min(min((y for y in range(f.shape[0]) if any(v is not None for v in f[y])), default=99) for f in fr)
        top = max(0, min(top - 1, bottom + 1 - self.h))
        self.crop = (top, bottom + 1)
        return [f[top:bottom + 1] for f in fr]


# ------------------------------------------------------------------ tank
def tank():
    parts = {
        'tread': Part('tread', [P('box', 'joint', (0, 0, 2.6), h=(12.5, 6.5, 2.6), r=2.4)]),
        'hull': Part('hull', [P('wedge', 'ink', (0, 0, 6.6), h=(11.5, 6.2, 2.4), r=0.5, cut=(1, 0, 1.2, 9.8)),
                              P('box', 'team', (-5, -6.3, 6.4), h=(4, 0.3, 0.8), r=0.1),
                              P('box', 'ink', (-11, 0, 7.5), h=(1.5, 4, 1.6), r=0.4)]),
        'turret': Part('turret', [P('wedge', 'bone', (-1.5, 0, 10.6), h=(5.5, 4.4, 1.9), r=0.8, cut=(1, 0, 1.4, 5.4)),
                                  P('cyl', 'ink', (-3, 1, 12.6), axis='z', r=1.6, h=0.5),
                                  P('cyl', 'steel', (-6, 2.5, 15), axis='z', r=0.25, h=3)], pivot=(-1.5, 0, 10.6), parent='hull'),
        'barrel': Part('barrel', [P('cyl', 'steel', (9.5, 0, 10.8), axis='x', r=0.8, h=6.5),
                                  P('box', 'ink', (16.2, 0, 10.8), h=(1.2, 1.3, 1.3), r=0.3)], pivot=(4, 0, 10.8), parent='turret'),
        'flash': flash_part((19, 0, 10.8), parent='barrel'),
    }

    def wheels(i):
        sh = (i - 4) % 4 if 4 <= i < 8 else 0
        return [((x + sh, -6.6, 2.2), 'steel.2', 'tread') for x in range(-10, 11, 4)]

    def pose(anim, k):
        if anim == 'idle':
            return {'hull': {'off': (0, 0, [0, 0, 0.4, 0][k])}}
        if anim == 'move':
            return {'hull': {'off': (0, 0, [0, 0.5, 0, 0.5][k]), 'pitch': [0, -0.03, 0, 0.03][k]}}
        return {'turret': {'off': ([-0.6, -1.2, -0.4][k], 0, 0)}, 'barrel': {'off': ([-1.5, -1, 0][k], 0, 0)},
                'flash': {'hide': k != 0}}
    decals = [((0.5, -4.5, 11), 'core.2', 'turret'), ((-1.5, -4.5, 11), 'core.1', 'turret'),
              ((10.5, -6.2, 7.4), 'ember.2', 'hull'), wheels]
    return Unit('tank', 52, 32, (19, 29), parts, decals=decals, pose=pose)


# ------------------------------------------------------------------ trooper squad (three soldiers)
def soldier(n, x, y, team_mat='team'):
    base = f's{n}_'
    return {
        base + 'legs': Part(base + 'legs', [P('cap', 'joint', (0, 0, 0), a=(x - 0.6, y, 4.2), b=(x - 0.8, y - 0.8, 0.8), r=0.9),
                                            P('cap', 'joint', (0, 0, 0), a=(x + 0.6, y, 4.2), b=(x + 0.9, y + 0.8, 0.8), r=0.9)]),
        base + 'body': Part(base + 'body', [P('box', 'ink', (x, y, 6.6), h=(1.6, 1.5, 2.2), r=0.6),
                                            P('box', team_mat, (x - 1.4, y, 7), h=(0.7, 1.3, 1.4), r=0.3),
                                            P('sph', 'bone', (x + 0.2, y, 10.0), r=1.6),
                                            P('cyl', 'steel', (x + 2.8, y - 1.6, 7.4), axis='x', r=0.5, h=2.4)],
                            pivot=(x, y, 4)),
    }


def trooper():
    parts = {}
    spots = [(-6, 3), (1, -1), (8, 4)]
    for n, (x, y) in enumerate(spots):
        parts.update(soldier(n, x, y))
    parts['flash'] = Part('flash', [P('sph', 'ember', (x + 6.6, y - 1.6, 7.4), r=1.1) for x, y in spots])

    def pose(anim, k):
        ps = {}
        for n in range(3):
            if anim == 'move':
                ph = (k + n) % 4
                ps[f's{n}_legs'] = {'off': (0, 0, [0, 0.6, 0, 0.6][ph]), 'pitch': [0.25, 0, -0.25, 0][ph]}
                ps[f's{n}_body'] = {'off': (0, 0, [0, 0.6, 0, 0.6][ph])}
            elif anim == 'idle':
                ps[f's{n}_body'] = {'off': (0, 0, -0.4 if (k + n) % 4 == 2 else 0)}
            else:
                ps[f's{n}_body'] = {'off': ([-0.4, -0.7, 0][k], 0, 0)}
        ps['flash'] = {'hide': anim != 'attack' or k == 2}
        return ps
    decals = [((x + 1.6, y - 1.6, 10.2), 'core.2', f's{n}_body') for n, (x, y) in enumerate(spots)]
    return Unit('trooper', 44, 24, (15, 22), parts, decals=decals, pose=pose)


# ------------------------------------------------------------------ biped mech
def legset(prefix, hip, mat='ink', thigh=6.5, shin=7.0, foot=(3.2, 2, 1)):
    hx, hy, hz = hip
    kz = hz - thigh
    return {
        prefix + 'thigh': Part(prefix + 'thigh', [P('cap', mat, (0, 0, 0), a=(hx, hy, hz), b=(hx + 1.5, hy, kz), r=1.7)],
                               pivot=hip, parent='pelvis'),
        prefix + 'shin': Part(prefix + 'shin', [P('cap', 'joint', (0, 0, 0), a=(hx + 1.5, hy, kz), b=(hx - 0.5, hy, kz - shin + 1), r=1.4),
                                                P('box', 'bone', (hx + 1.2, hy - 0.2, kz - 2), h=(1.2, 1.4, 2.2), r=0.5),
                                                P('box', 'ink', (hx, hy, foot[2]), h=foot, r=0.6)],
                              pivot=(hx + 1.5, hy, kz), parent=prefix + 'thigh'),
    }


def mech():
    parts = {'pelvis': Part('pelvis', [P('box', 'joint', (0, 0, 15), h=(2.5, 3.5, 1.4), r=0.6)], pivot=(0, 0, 15))}
    parts.update(legset('lb_', (-1, 3.6, 15), mat='ink'))
    parts.update(legset('lf_', (-1, -3.6, 15), mat='ink'))
    parts['torso'] = Part('torso', [P('wedge', 'bone', (0, 0, 21), h=(5, 5, 4.2), r=1.0, cut=(1, 0, 0.9, 5.4)),
                                    P('box', 'ink', (-1, 0, 25.6), h=(3.2, 3.6, 1.0), r=0.5),
                                    P('box', 'team', (-3.5, -5.1, 20.5), h=(1.2, 0.3, 2.4), r=0.1),
                                    P('box', 'ink', (-5.8, 0, 21), h=(1.4, 3.6, 3.0), r=0.5)],
                          pivot=(0, 0, 16), parent='pelvis')
    parts['gun'] = Part('gun', [P('box', 'ink', (1.5, -6.8, 19), h=(2, 1.4, 1.8), r=0.6),
                                P('cyl', 'steel', (7.5, -6.8, 19.3), axis='x', r=0.7, h=4.5)], pivot=(0, -6.8, 21), parent='torso')
    parts['pod'] = Part('pod', [P('box', 'ink', (-2, 6.2, 25), h=(2.6, 1.6, 1.8), r=0.5)], pivot=(-2, 6, 24), parent='torso')
    parts['flash'] = flash_part((13.6, -6.8, 19.3), r=1.6, parent='gun')

    def pose(anim, k):
        if anim == 'idle':
            return {'pelvis': {'off': (0, 0, [0, -0.4, -0.6, -0.3][k])}}
        if anim == 'move':
            sw = [0.45, 0.15, -0.45, -0.15][k]
            return {'pelvis': {'off': (0, 0, [0, 0.8, 0, 0.8][k])},
                    'lf_thigh': {'pitch': sw}, 'lb_thigh': {'pitch': -sw},
                    'lf_shin': {'pitch': -max(0, -sw) * 1.2}, 'lb_shin': {'pitch': -max(0, sw) * 1.2}}
        return {'torso': {'off': ([-0.6, -1, 0][k], 0, 0)}, 'gun': {'off': ([-1.4, -0.8, 0][k], 0, 0)}, 'flash': {'hide': k != 0}}
    decals = [((4.4, -3, 24), 'core.2', 'torso'), ((4.4, -1.6, 24), 'core.1', 'torso'), ((-2, 5, 26.5), 'ember.2', 'pod')]
    return Unit('mech', 46, 42, (17, 39), parts, decals=decals, pose=pose)


# ------------------------------------------------------------------ hover drone
def drone():
    parts = {
        'body': Part('body', [P('sph', 'ink', (0, 0, 16), r=4.2, s=(1.4, 1.2, 0.8)),
                              P('sph', 'bone', (-0.5, 0, 18.2), r=3.0, s=(1.3, 1.1, 0.6)),
                              P('box', 'team', (-3, -4.3, 15.6), h=(1.6, 0.3, 0.6), r=0.1),
                              P('cyl', 'steel', (4, 0, 13), axis='x', r=0.6, h=2.2)]),
        'rotors': Part('rotors', [P('cyl', 'joint', (x, y, 18.5), axis='z', r=2.6, h=0.35) for x, y in ((-6, -5), (6, -5), (-6, 5), (6, 5))] +
                       [P('cap', 'ink', (0, 0, 0), a=(0, 0, 17), b=(x * 0.9, y * 0.9, 18.2), r=0.6) for x, y in ((-6, -5), (6, -5), (-6, 5), (6, 5))],
                       parent='body'),
        'flash': flash_part((8.5, 0, 13), r=1.2, parent='body'),
    }

    def blades(i):
        ph = i % 2
        out = []
        for x, y in ((-6, -5), (6, -5), (-6, 5), (6, 5)):
            out += [((x - 2 + ph, y, 18.9), 'steel.3', 'rotors'), ((x + 2 - ph, y, 18.9), 'steel.3', 'rotors')]
        return out

    def pose(anim, k):
        if anim == 'idle':
            return {'body': {'off': (0, 0, [0, 0.6, 1, 0.6][k])}}
        if anim == 'move':
            return {'body': {'off': (0, 0, [0.4, 0.8, 0.4, 0][k]), 'pitch': 0.18}}
        return {'body': {'off': ([-0.6, -1, 0][k], 0, 0.5)}, 'flash': {'hide': k == 2}}
    decals = [((5.4, -2.2, 16), 'core.2', 'body'), ((5.6, -1, 15.6), 'core.3', 'body'), blades]
    return Unit('drone', 40, 30, (19, 28), parts, fly=True, decals=decals, pose=pose)


# ------------------------------------------------------------------ jet fighter
def jet():
    parts = {
        'body': Part('body', [P('cap', 'bone', (0, 0, 0), a=(-11, 0, 16), b=(9, 0, 16), r=2.2),
                              P('wedge', 'bone', (13, 0, 16), h=(3.5, 1.6, 1.6), r=0.4, cut=(1, 0, 0.0, 0.5)),
                              P('sph', 'glass', (4.5, 0, 17.8), r=1.6, s=(2.2, 1, 1)),
                              P('wedge', 'ink', (-2, 0, 15.4), h=(6, 9.5, 0.45), r=0.2, cut=(1, 0, 0, 1.0)),
                              P('wedge', 'ink', (-9.5, 0, 20), h=(2.4, 0.4, 3.2), r=0.2, cut=(1, 0, 1.2, 0.6)),
                              P('box', 'team', (-3, -8, 15.4), h=(2.6, 1.2, 0.5), r=0.1),
                              P('cyl', 'joint', (-12.5, 0, 16), axis='x', r=1.6, h=1)]),
        'flame': Part('flame', [P('sph', 'ember', (-15, 0, 16), r=1.4, s=(1.8, 1, 1))], parent='body'),
        'flash': flash_part((12, -3, 15), r=1.2, parent='body'),
    }

    def pose(anim, k):
        if anim == 'idle':
            return {'body': {'off': (0, 0, [0, 0.5, 1, 0.5][k])}, 'flame': {'off': ([0, -0.6, 0, 0.6][k], 0, 0)}}
        if anim == 'move':
            return {'body': {'off': (0, 0, [0, 0.4, 0, -0.4][k]), 'roll': [0, 0.08, 0, -0.08][k]},
                    'flame': {'off': (-1.5, 0, 0)}}
        return {'body': {'off': ([-0.5, -0.8, 0][k], 0, 0)}, 'flash': {'hide': k == 2}}
    decals = [((-6, -2.2, 17.5), 'core.2', 'body'), ((10, -1.5, 16.6), 'ember.2', 'body')]
    return Unit('jet', 50, 34, (24, 30), parts, fly=True, decals=decals, pose=pose)


# ------------------------------------------------------------------ gunship (bomber slot)
def bomber():
    parts = {
        'body': Part('body', [P('cap', 'ink', (0, 0, 0), a=(-9, 0, 17), b=(7, 0, 17), r=3.4),
                              P('wedge', 'bone', (8, 0, 17.4), h=(3, 3, 2.6), r=0.8, cut=(1, 0, 0.8, 1.6)),
                              P('sph', 'glass', (9.5, 0, 19), r=1.6, s=(1.6, 1.4, 1)),
                              P('box', 'bone', (-2, 0, 20.6), h=(6, 2.6, 0.8), r=0.4),
                              P('box', 'team', (-5, -3.4, 17), h=(2.4, 0.3, 1.2), r=0.1),
                              P('wedge', 'ink', (-12, 0, 21), h=(2.2, 0.5, 3), r=0.2, cut=(1, 0, 1, 0.2)),
                              P('cyl', 'steel', (6, -3.2, 13.5), axis='x', r=0.6, h=3.2)]),
        'fans': Part('fans', [P('cyl', 'joint', (0, y, 18.6), axis='z', r=3.4, h=1.1) for y in (-8, 8)] +
                     [P('box', 'ink', (0, y * 0.6, 18.6), h=(1, abs(y) * 0.4, 0.6), r=0.2) for y in (-8, 8)], parent='body'),
        'flash': flash_part((10.5, -3.2, 13.5), r=1.3, parent='body'),
    }

    def blur(i):
        ph = i % 2
        return [((-2 + 4 * ph, y, 19.8), 'steel.3', 'fans') for y in (-8, 8)] + [((2 - 4 * ph, y, 19.8), 'steel.2', 'fans') for y in (-8, 8)]

    def pose(anim, k):
        if anim == 'idle':
            return {'body': {'off': (0, 0, [0, 0.6, 1, 0.6][k])}}
        if anim == 'move':
            return {'body': {'off': (0, 0, [0, 0.4, 0, 0.4][k]), 'pitch': 0.12}}
        return {'body': {'off': ([-0.6, -1, 0][k], 0, 0)}, 'flash': {'hide': k == 2}}
    decals = [((-6, -3.6, 18.4), 'core.2', 'body'), ((-3, -3.6, 18.4), 'core.1', 'body'), ((0, -3.6, 18.4), 'core.2', 'body'), blur]
    return Unit('bomber', 48, 34, (22, 30), parts, fly=True, decals=decals, pose=pose)


# ------------------------------------------------------------------ destroyer
def ship():
    parts = {
        'hull': Part('hull', [P('wedge', 'ink', (0, 0, 2.5), h=(16, 5, 2.5), r=0.8, cut=(1, 0, -0.6, 13.5)),
                              P('wedge', 'bone', (0, 0, 5.4), h=(15.5, 4.6, 0.5), r=0.3, cut=(1, 0, 0, 13)),
                              P('box', 'team', (-4, -5.1, 3), h=(6, 0.2, 0.7), r=0.1)]),
        'bridge': Part('bridge', [P('box', 'bone', (-4, 0, 9), h=(4.5, 3.4, 3.2), r=0.6),
                                  P('box', 'ink', (-3, 0, 13), h=(2.6, 2.6, 1.2), r=0.4),
                                  P('cyl', 'steel', (-4, 0, 17), axis='z', r=0.35, h=3.5),
                                  P('box', 'steel', (-4, 0, 19), h=(0.3, 2.2, 0.3)),
                                  P('cyl', 'ink', (-11, 0, 8), axis='z', r=1.4, h=2)], parent='hull'),
        'turret': Part('turret', [P('sph', 'bone', (7, 0, 7), r=2.4, s=(1.2, 1.1, 0.7)),
                                  P('cyl', 'steel', (11, 0, 7.4), axis='x', r=0.5, h=3)], pivot=(7, 0, 7), parent='hull'),
        'flash': flash_part((15, 0, 7.4), r=1.4, parent='turret'),
    }

    def wake(i):
        ph = i % 4 if 4 <= i < 8 else 0
        return [((-17 - ph, y, 0.2), 'bone.2', None) for y in (-3, 0, 3)] if 4 <= i < 8 else []

    def pose(anim, k):
        if anim == 'idle':
            return {'hull': {'off': (0, 0, [0, 0.4, 0, -0.4][k]), 'pitch': [0, 0.02, 0, -0.02][k]}}
        if anim == 'move':
            return {'hull': {'off': (0, 0, [0, 0.5, 0, 0.5][k]), 'pitch': [-0.03, 0, 0.03, 0][k]}}
        return {'turret': {'off': ([-0.8, -0.5, 0][k], 0, 0)}, 'flash': {'hide': k == 2}}
    decals = [((-1.4, -3.5, 10.5), 'core.2', 'bridge'), ((-3.4, -3.5, 10.5), 'core.2', 'bridge'),
              ((-5.4, -3.5, 10.5), 'core.1', 'bridge'), ((-4, 0, 20.6), 'ember.2', 'bridge'), wake]
    return Unit('ship', 52, 30, (24, 27), parts, decals=decals, pose=pose)


# ------------------------------------------------------------------ submarine
def sub():
    parts = {
        'hull': Part('hull', [P('cap', 'ink', (0, 0, 0), a=(-13, 0, 3), b=(12, 0, 3), r=3.4),
                              P('box', 'bone', (2, 0, 7.6), h=(3, 1.5, 2.6), r=0.8),
                              P('box', 'ink', (-15, 0, 4), h=(1.2, 3.5, 0.3), r=0.1),
                              P('box', 'team', (-4, -3.3, 4.2), h=(3, 0.3, 0.6), r=0.1),
                              P('cyl', 'steel', (2.5, 0, 12), axis='z', r=0.3, h=1.8)]),
        'flash': Part('flash', [P('sph', 'core', (16, -1, 2), r=1.4)], parent='hull'),
    }

    def pose(anim, k):
        if anim == 'idle':
            return {'hull': {'off': (0, 0, [0, -0.4, -0.8, -0.4][k])}}
        if anim == 'move':
            return {'hull': {'off': (0, 0, [0, -0.4, 0, -0.4][k])}}
        return {'hull': {'off': ([-0.4, -0.6, 0][k], 0, 0)}, 'flash': {'hide': k == 2}}
    decals = [((4, -1.6, 8.6), 'core.2', 'hull'), ((8, -3.4, 3.6), 'core.1', 'hull')]
    return Unit('sub', 50, 22, (24, 19), parts, decals=decals, pose=pose)


# ------------------------------------------------------------------ titan
def titan():
    parts = {'pelvis': Part('pelvis', [P('box', 'joint', (0, 0, 22), h=(4, 5, 2), r=0.8)], pivot=(0, 0, 22))}
    parts.update(legset('lb_', (-1, 5.5, 22), thigh=9.5, shin=10, foot=(4.5, 2.6, 1.3)))
    parts.update(legset('lf_', (-1, -5.5, 22), thigh=9.5, shin=10, foot=(4.5, 2.6, 1.3)))
    parts['torso'] = Part('torso', [P('wedge', 'bone', (0, 0, 31), h=(7, 7, 6.5), r=1.4, cut=(1, 0, 0.8, 7.5)),
                                    P('box', 'ink', (-1, 0, 38.6), h=(5, 5.4, 1.6), r=0.7),
                                    P('box', 'team', (-5.5, -7.1, 30), h=(1.5, 0.3, 3.5), r=0.1),
                                    P('box', 'ink', (-8.5, 0, 31), h=(2, 5, 5), r=0.8),
                                    P('sph', 'ink', (3.5, 0, 41), r=2.2)],
                          pivot=(0, 0, 23), parent='pelvis')
    parts['cannon'] = Part('cannon', [P('box', 'ink', (-1, 9.4, 39), h=(4.5, 2.2, 2.2), r=0.7),
                                      P('cyl', 'steel', (7, 9.4, 39.3), axis='x', r=1.0, h=4.5)], pivot=(-1, 9.4, 39), parent='torso')
    parts['arm'] = Part('arm', [P('cap', 'ink', (0, 0, 0), a=(1, -9, 35), b=(3, -9.5, 27), r=2.2),
                                P('box', 'bone', (4, -9.5, 26), h=(3, 2, 2.2), r=0.7),
                                P('cyl', 'steel', (10, -9.5, 26), axis='x', r=1.0, h=4)], pivot=(1, -9, 35), parent='torso')
    parts['flash'] = flash_part((15.5, -9.5, 26), r=2.2, parent='arm')

    def pose(anim, k):
        if anim == 'idle':
            return {'pelvis': {'off': (0, 0, [0, -0.5, -0.8, -0.4][k])}, 'cannon': {'pitch': [0, -0.05, -0.08, -0.04][k]}}
        if anim == 'move':
            sw = [0.35, 0.12, -0.35, -0.12][k]
            return {'pelvis': {'off': (0, 0, [0, 1, 0, 1][k])},
                    'lf_thigh': {'pitch': sw}, 'lb_thigh': {'pitch': -sw},
                    'lf_shin': {'pitch': -max(0, -sw) * 1.2}, 'lb_shin': {'pitch': -max(0, sw) * 1.2}}
        return {'torso': {'off': ([-0.8, -1.2, 0][k], 0, 0)}, 'arm': {'off': ([-1.6, -1, 0][k], 0, 0)}, 'flash': {'hide': k == 2}}
    decals = [((6.4, -4, 35), 'core.2', 'torso'), ((6.4, -2, 35), 'core.3', 'torso'), ((6.4, 0, 35), 'core.2', 'torso'),
              ((4.8, -1.8, 41.5), 'core.2', 'torso'), ((-3, 9.4, 41.3), 'ember.2', 'cannon')]
    return Unit('titan', 62, 60, (24, 57), parts, decals=decals, pose=pose)


# ------------------------------------------------------------------ cyber entity
def cyber():
    parts = {
        'core': Part('core', [P('sph', 'core', (0, 0, 16), r=2.2)]),
        'shell': Part('shell', [P('oct', 'ink', (0, 0, 16), r=6.5, s=(0.8, 0.8, 1.25)),
                                P('box', 'team', (0, -4.2, 16), h=(0.8, 0.4, 3.2), r=0.2)], pivot=(0, 0, 16)),
        'ring': Part('ring', [P('oct', 'bone', (math.cos(a) * 9, math.sin(a) * 6, 16 + math.sin(a * 2) * 1.5), r=1.7, s=(1, 1, 1.5))
                              for a in (0.3, 1.9, 3.5, 5.1)], pivot=(0, 0, 16)),
        'flash': Part('flash', [P('sph', 'core', (12, 0, 16), r=2), P('sph', 'core', (16, 0, 16), r=1.2)]),
    }

    def pose(anim, k):
        sp = {'idle': 0.25, 'move': 0.45, 'attack': 0.35}[anim]
        bob = [0, 0.6, 1, 0.6][k] if k < 4 else 0
        ps = {'ring': {'yaw': k * sp, 'off': (0, 0, bob)}, 'shell': {'off': (0, 0, bob)}, 'core': {'off': (0, 0, bob)}}
        if anim == 'attack':
            ps['flash'] = {'hide': k == 2}
        return ps

    def glyph(i):
        return [((0, -4.9, 16 + dz), 'core.3' if dz == 0 else 'core.2', 'shell') for dz in (-3, 0, 3)] + \
               [((-3, -3.6, 16 + (i % 4) - 1.5), 'core.1', 'shell')]
    return Unit('cyber', 40, 34, (20, 32), parts, fly=True, decals=[glyph], pose=pose)


# ------------------------------------------------------------------ biomech beast
def beast():
    parts = {
        'body': Part('body', [P('sph', 'ink', (0, 0, 10), r=5, s=(1.8, 1.0, 0.85)),
                              P('box', 'team', (-3, -4.5, 9.6), h=(2.2, 0.3, 1.0), r=0.2),
                              P('cap', 'ink', (0, 0, 0), a=(-8, 0, 11), b=(-15, 0, 15), r=1.2)] +
                     [P('wedge', 'bone', (x, 0, 14.6 - abs(x) * 0.12), h=(1.2, 1.6, 1.6), r=0.3, cut=(1, 0, 1, 0.8)) for x in (-6, -2.5, 1, 4.5)],
                     pivot=(0, 0, 10)),
        'head': Part('head', [P('sph', 'ink', (10.5, 0, 11), r=3.0, s=(1.3, 0.9, 0.8)),
                              P('wedge', 'bone', (12.5, 0, 12.2), h=(2.6, 2.4, 1.0), r=0.4, cut=(1, 0, 1.2, 1.6)),
                              P('wedge', 'joint', (13, 0, 8.6), h=(2.6, 1.8, 0.7), r=0.3, cut=(1, 0, -0.8, 1.8))],
                     pivot=(8, 0, 11), parent='body'),
    }
    for nm, x, y in (('fl', 6, -3.5), ('fr', 6, 3.5), ('bl', -6, -3.5), ('br', -6, 3.5)):
        parts['leg_' + nm] = Part('leg_' + nm, [P('cap', 'joint', (0, 0, 0), a=(x, y, 8), b=(x + 1.5, y, 4.5), r=1.3),
                                                 P('cap', 'ink', (0, 0, 0), a=(x + 1.5, y, 4.5), b=(x + 0.5, y, 1), r=1.0)],
                                  pivot=(x, y, 8), parent='body')
    parts['flash'] = Part('flash', [P('sph', 'ember', (16, -1, 9.4), r=1.4)], parent='head')

    def pose(anim, k):
        if anim == 'idle':
            return {'body': {'off': (0, 0, [0, 0.4, 0.6, 0.4][k])}, 'head': {'pitch': [0, 0.04, 0.08, 0.04][k]}}
        if anim == 'move':
            sw = [0.4, 0, -0.4, 0][k]
            return {'body': {'off': (0, 0, [0, 0.8, 0, 0.8][k])}, 'leg_fl': {'pitch': sw}, 'leg_br': {'pitch': sw},
                    'leg_fr': {'pitch': -sw}, 'leg_bl': {'pitch': -sw}}
        return {'body': {'off': ([1, 2, 0][k], 0, 0)}, 'head': {'pitch': [-0.25, 0.1, 0][k]}, 'flash': {'hide': k != 1}}
    decals = [((12.4, -2.4, 11.6), 'ember.2', 'head'), ((10.8, -2.5, 11.6), 'ember.1', 'head'),
              ((-3, -4.4, 11.6), 'core.1', 'body'), ((0, -4.6, 11.4), 'core.2', 'body'), ((3, -4.4, 11.2), 'core.1', 'body')]
    return Unit('beast', 46, 26, (21, 24), parts, decals=decals, pose=pose)


ALL = {f.__name__: f for f in (trooper, mech, tank, drone, jet, bomber, ship, sub, titan, cyber, beast)}
