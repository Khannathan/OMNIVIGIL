"""Batch 3a: static map sprites (structures and strategic sites) in the Diorama camera.
Single frame each, anchored bottom-centre, team parts in magenta like the Prism set."""
import math
import numpy as np
from forge import Prim as P, Part, render, rot

CW, CH, ORG = 80, 80, (34, 66)


def rp(prim, ax, a):
    prim.R = rot(ax, a)
    return prim


def plinth(hx, hy, z=0.9, team=True, mat='ink'):
    out = [P('box', mat, (0, 0, z), h=(hx, hy, z), r=0.4, seams=0)]
    if team:
        out.append(P('box', 'team', (0, -hy - 0.05, z * 0.9), h=(hx - 1.2, 0.25, z * 0.45), r=0.05, seams=0))
    return out


def grid_dots(x0, x1, z0, z1, y, dx=2, dz=2, tok='core.2', alt='core.1', seed=0):
    out = []
    i = seed
    x = x0
    while x <= x1 + 1e-6:
        z = z0
        while z <= z1 + 1e-6:
            out.append(((x, y, z), tok if (i * 7 + int(x * 3) + int(z)) % 5 else alt, None))
            z += dz; i += 1
        x += dx
    return out


def side_dots(y0, y1, z0, z1, x, dy=2, dz=2, tok='core.1'):
    out = []
    y = y0
    while y <= y1 + 1e-6:
        z = z0
        while z <= z1 + 1e-6:
            out.append(((x, y, z), tok, None)); z += dz
        y += dy
    return out


def flag(x, y, z, h=9):
    return [P('box', 'joint', (x, y, z + h / 2), h=(0.5, 0.5, h / 2), r=0.1, seams=0),
            P('box', 'team', (x + 2.2, y, z + h - 1.4), h=(2, 0.25, 1.3), r=0.1, seams=0)]


class Static:
    def __init__(self, key, prims, decals=(), w=CW, h=CH, origin=ORG):
        self.key, self.prims, self.decals = key, prims, list(decals)
        self.w, self.h, self.origin = w, h, origin

    def frame(self):
        g = render({'body': Part('body', self.prims)}, {}, self.w, self.h, self.origin, self.decals)
        ys = [y for y in range(g.shape[0]) if any(v is not None for v in g[y])]
        xs = [x for x in range(g.shape[1]) if any(v is not None for v in g[:, x])]
        self.crop = (min(ys), max(ys) + 1, min(xs), max(xs) + 1)
        return g[min(ys):max(ys) + 1, min(xs):max(xs) + 1]


S = {}


def reg(fn):
    S[fn.__name__] = fn
    return fn


# ================================================================ structures
@reg
def array():
    pr = plinth(13, 7, z=0.8)
    for i, x in enumerate((-8.5, 0, 8.5)):
        pr += [P('box', 'joint', (x, 0, 3.4), h=(0.6, 0.6, 2.4), r=0.1, seams=0),
               rp(P('box', 'glass', (x, 0, 6.4), h=(3.8, 5.6, 0.35), r=0.1, seams=0), 'x', -0.75),
               rp(P('box', 'bone', (x, 0, 6.2), h=(4.0, 5.8, 0.2), r=0.1, seams=0), 'x', -0.75)]
    return Static('array', pr)


@reg
def block():
    pr = plinth(12, 8) + [
        P('box', 'ink', (0, 0, 8.5), h=(10.5, 7, 6.8), r=0.5),
        P('box', 'bone', (-3, 0, 15.8), h=(5, 5, 0.6), r=0.3, seams=0),
        P('box', 'ink', (5, 2, 17), h=(2, 2, 1.6), r=0.3)]
    dec = grid_dots(-8, 8, 4, 12, -7.1, dx=2, dz=2.6) + side_dots(-5, 5, 4, 12, 10.6, dy=2.5, dz=2.6)
    return Static('block', pr, dec)


@reg
def bunker():
    pr = plinth(13, 8, team=False) + [
        P('wedge', 'ink', (0, 0, 4.4), h=(11.5, 7, 2.8), r=0.8, cut=(0, -1, 1.6, 6.2)),
        P('box', 'bone', (-3, 1.5, 7.4), h=(4, 3, 0.5), r=0.2, seams=0),
        P('box', 'outline' if False else 'joint', (0, -6.2, 4.2), h=(7, 0.6, 0.45), r=0.1, seams=0),
        P('box', 'team', (0, -7.1, 1.1), h=(10, 0.25, 0.4), r=0.05, seams=0)]
    dec = [((-8, -8.1, 1.0), 'ember.2', None), ((8, -8.1, 1.0), 'ember.2', None), ((-4, -6.9, 4.2), 'core.2', None), ((3, -6.9, 4.2), 'core.2', None)]
    return Static('bunker', pr, dec)


@reg
def citadel():
    pr = plinth(12, 8, z=1.2) + [
        P('box', 'ink', (0, 0, 7.5), h=(8, 6, 5.5), r=0.4),
        P('box', 'bone', (0, 0, 14), h=(4.5, 3.5, 1.4), r=0.4, seams=0),
        P('cone', 'core', (0, 0, 17.6), r0=1.4, r1=0.3, hz=2.2)]
    for x in (-9.5, 9.5):
        for y in (-5.5, 5.5):
            pr += [P('box', 'bone', (x, y, 8.5), h=(2, 2, 7), r=0.4, seams=0), P('box', 'ink', (x, y, 16), h=(2.3, 2.3, 0.6), r=0.2, seams=0)]
    pr += [P('box', 'team', (0, -6.1, 5.2), h=(5, 0.25, 0.6), r=0.05, seams=0), P('box', 'joint', (0, -6.3, 4), h=(1.6, 0.4, 2.6), r=0.3, seams=0)]
    dec = [((x, -7.6, 12), 'core.2', None) for x in (-9.5, 9.5)]
    return Static('citadel', pr, dec)


@reg
def crystal():
    pr = plinth(9, 6, team=True, mat='basalt')
    for (x, y, h, r, tilt) in ((0, 0, 20, 3.4, 0), (-5, 1, 12, 2.3, -0.35), (5, -1, 14, 2.5, 0.3), (2.5, 3, 9, 1.8, 0.15), (-2.5, -3, 7, 1.6, -0.2)):
        pr.append(rp(P('oct', 'facet', (x, y, 1.0 + h * 0.5), r=1, s=(r, r, h * 0.5)), 'y', tilt))
    dec = [((0, -2.0, 18), 'core.3', None), ((-5.5, -0.8, 11), 'core.2', None), ((5.5, -2.0, 12), 'core.2', None)]
    return Static('crystal', pr, dec)


@reg
def dish():
    pr = plinth(9, 7) + [
        P('box', 'ink', (0, 0, 4), h=(5, 4, 2.3), r=0.5, seams=0),
        P('cyl', 'steel', (0, 0, 8.4), axis='z', r=0.9, h=2.4),
        rp(P('sph', 'bone', (0, 0, 13), r=1, s=(7.5, 7.5, 1.6)), 'y', -0.5),
        rp(P('sph', 'steel', (0.6, 0, 13.8), r=1, s=(6, 6, 1.0)), 'y', -0.5),
        P('cap', 'steel', (0, 0, 0), a=(1.5, 0, 14.5), b=(4.5, 0, 19.5), r=0.35),
        P('sph', 'core', (4.6, 0, 19.8), r=0.9)]
    return Static('dish', pr)


@reg
def dome():
    pr = plinth(12, 8) + [
        P('sph', 'bone', (0, 0, 2), r=1, s=(10, 6.8, 8)),
        P('cyl', 'glass', (0, 0, 2.6), axis='z', r=10.3, h=0.8),
        P('cyl', 'ink', (0, 0, 9.8), axis='z', r=2.2, h=0.5),
        P('cyl', 'core', (0, 0, 10.4), axis='z', r=1.2, h=0.3)]
    return Static('dome', pr)


@reg
def elevator():
    pr = plinth(10, 7) + [
        P('box', 'ink', (0, 0, 4.5), h=(7, 5, 2.8), r=0.5),
        P('cone', 'bone', (0, 0, 9), r0=3.2, r1=1.6, hz=1.8),
        P('cyl', 'steel', (0, 0, 22), axis='z', r=0.8, h=12),
        P('cyl', 'core', (0, 0, 22), axis='z', r=0.35, h=12.5),
        P('box', 'bone', (0, 0, 17), h=(2, 2, 1.2), r=0.3, seams=0),
        P('box', 'ink', (2.8, 0, 12), h=(0.4, 0.4, 3), r=0.1, seams=0)]
    dec = grid_dots(-5, 5, 3.2, 5.5, -5.1, dx=2.5, dz=2.3)
    return Static('elevator', pr, dec)


@reg
def factory():
    pr = plinth(13, 8) + [P('box', 'ink', (0, 0, 5.6), h=(11.5, 7, 3.8), r=0.4)]
    for x in (-8, -2.5, 3):
        pr.append(P('wedge', 'bone', (x, 0, 10.6), h=(2.8, 6.6, 1.6), r=0.2, cut=(-1, 0, 1, 0.5), seams=0))
    pr += [P('cyl', 'steel', (9, 3, 12), axis='z', r=1.2, h=4.5), P('cyl', 'ember', (9, 3, 16.8), axis='z', r=0.8, h=0.3),
           P('box', 'ember', (-7, -7.1, 3.6), h=(2, 0.3, 1.8), r=0.1, seams=0)]
    dec = [((x, -7.1, 4), 'core.2', None) for x in (2, 4, 6, 8)]
    return Static('factory', pr, dec)


@reg
def habitat():
    pr = plinth(11, 8) + [
        P('box', 'bone', (0, 0, 4.2), h=(9.5, 6.5, 2.4), r=0.8, seams=4),
        P('box', 'ink', (0, 0, 8), h=(7, 4.8, 1.6), r=0.6, seams=0),
        P('box', 'glass', (0, 0, 11), h=(4.2, 3, 1.6), r=0.5, seams=0)]
    dec = [((x, -6.6, 2.6), 'core.2', None) for x in range(-8, 9, 2)]
    return Static('habitat', pr, dec)


@reg
def hive():
    pr = plinth(12, 8, mat='basalt') + [
        P('sph', 'chitin', (-3, 1, 6), r=1, s=(7, 6, 7.5)),
        P('sph', 'chitin', (5, -1, 4.5), r=1, s=(5, 4.5, 5)),
        P('sph', 'chitin', (-1, 2, 12), r=1, s=(3.5, 3, 4)),
        P('cone', 'chitin', (-1, 2, 16), r0=1.8, r1=0.5, hz=2)]
    dec = [((-5, -4.6, 5), 'ember.2', None), ((-1, -5.6, 8), 'ember.1', None), ((5, -4.5, 3.5), 'ember.2', None),
           ((-3, -2.3, 12), 'ember.2', None), ((-6, -3.5, 10), 'ember.1', None), ((1, -5.4, 3), 'ember.1', None)]
    return Static('hive', pr, dec)


@reg
def lab():
    pr = plinth(12, 8) + [
        P('box', 'bone', (0, 0, 4.5), h=(10.5, 7, 2.8), r=0.5),
        P('box', 'glass', (-4, 0, 9.2), h=(3, 3, 2), r=0.3, seams=0),
        P('cyl', 'ink', (5, 2, 8), axis='z', r=1.8, h=1.6),
        P('cyl', 'steel', (5, 2, 11), axis='z', r=0.35, h=2),
        P('sph', 'bone', (5, 2, 14), r=1.6)]
    dec = [((x, -7.1, 2.2), 'core.2', None) for x in range(-9, 10, 2)]
    return Static('lab', pr, dec)


@reg
def launch():
    pr = plinth(12, 8) + [
        P('box', 'ink', (5, 0, 4), h=(5, 6, 2.3), r=0.4),
        P('cyl', 'bone', (-5, 0, 11), axis='z', r=1.8, h=9),
        P('cone', 'ember', (-5, 0, 21.5), r0=1.8, r1=0.3, hz=1.6),
        P('box', 'team', (-5, -1.6, 8), h=(1.2, 0.3, 0.6), r=0.05, seams=0),
        P('box', 'steel', (-1, 0, 11), h=(0.8, 0.8, 9.5), r=0.1, seams=0),
        P('box', 'steel', (-2.6, 0, 16), h=(1.6, 0.4, 0.3), r=0.05, seams=0),
        P('box', 'steel', (-2.6, 0, 9), h=(1.6, 0.4, 0.3), r=0.05, seams=0),
        P('box', 'bone', (6, 2, 8), h=(2, 2, 1.8), r=0.3, seams=0)]
    dec = [((-1, -1.1, z), 'ember.2', None) for z in (6, 12, 18)]
    return Static('launch', pr, dec)


@reg
def monolith():
    pr = plinth(7, 5) + [
        P('box', 'ink', (0, 0, 13), h=(3.5, 1.8, 11.4), r=0.3, seams=0),
        P('box', 'core', (0, -1.85, 13), h=(0.35, 0.1, 9.5), r=0.05),
        P('box', 'team', (1.8, -1.9, 9), h=(0.6, 0.1, 3.5), r=0.05, seams=0)]
    return Static('monolith', pr)


@reg
def obelisk():
    pr = plinth(7, 5) + [
        P('box', 'ink', (0, 0, 2.6), h=(4.2, 3.4, 0.9), r=0.3, seams=0),
        P('pyr', 'bone', (0, 0, 13), h=(2.6, 2.2, 9.6), taper=0.45),
        P('oct', 'core', (0, 0, 24.2), r=1, s=(1.3, 1.1, 1.8))]
    dec = [((0, -2.0, z), 'core.1', None) for z in (8, 12, 16)]
    return Static('obelisk', pr, dec)


@reg
def pylon():
    pr = plinth(6.5, 5) + [
        P('cone', 'ink', (0, 0, 6), r0=4, r1=1.8, hz=4),
        P('cyl', 'steel', (0, 0, 15), axis='z', r=0.8, h=6),
        P('tor', 'bone', (0, 0, 15.5), axis='z', R=3, r=0.6),
        P('tor', 'bone', (0, 0, 11.5), axis='z', R=2.4, r=0.5),
        P('sph', 'core', (0, 0, 23.5), r=2.6)]
    return Static('pylon', pr)


@reg
def pyramid():
    pr = plinth(13, 9, z=1.0)
    for i, (hx, hy) in enumerate(((11, 7.5), (8.5, 5.8), (6, 4.1), (3.6, 2.4))):
        pr.append(P('box', 'bone' if i % 2 == 0 else 'ink', (0, 0, 3.2 + i * 4), h=(hx, hy, 2), r=0.3, seams=0))
    pr += [P('cone', 'core', (0, 0, 19.5), r0=1.6, r1=0.2, hz=2.2), P('box', 'core', (0, -7.6, 3.2), h=(1.6, 0.1, 1.4), r=0.05)]
    return Static('pyramid', pr)


@reg
def reactor():
    pr = plinth(12, 8) + [
        P('cyl', 'ink', (-3, 0.5, 6), axis='z', r=5.8, h=4.2),
        P('cyl', 'core', (-3, 0.5, 10.4), axis='z', r=4.3, h=0.3),
        P('tor', 'bone', (-3, 0.5, 10.3), axis='z', R=5.0, r=0.8),
        P('box', 'bone', (7, 0, 4.5), h=(3.5, 5, 2.8), r=0.4, seams=0),
        P('cyl', 'steel', (7, 2, 9), axis='z', r=0.9, h=2)]
    dec = [((-6, -5.0, 5), 'core.2', None), ((-3, -5.3, 5), 'core.2', None), ((0, -4.8, 5), 'core.1', None)]
    return Static('reactor', pr, dec)


@reg
def ring():
    pr = plinth(12, 6) + [
        P('box', 'ink', (0, 0, 3.4), h=(8, 4.5, 1.6), r=0.4, seams=0),
        P('tor', 'bone', (0, 0, 13.5), axis='y', R=8.2, r=1.5),
        P('cyl', 'glass', (0, 0.4, 13.5), axis='y', r=6.8, h=0.25)]
    for a in (0.6, 1.6, 2.6, 3.6, 4.6, 5.6):
        pr.append(P('box', 'ink', (8.2 * math.cos(a), -0.4, 13.5 + 8.2 * math.sin(a)), h=(1, 1.6, 1), r=0.3, seams=0))
    return Static('ring', pr)


@reg
def silo():
    pr = plinth(12, 7)
    for x, h in ((-7, 8), (0, 10), (7, 7)):
        pr += [P('cyl', 'bone', (x, 0, 2 + h / 2), axis='z', r=3, h=h / 2),
               P('sph', 'bone', (x, 0, 2 + h), r=1, s=(3, 3, 1.3)),
               P('cyl', 'ink', (x, 0, 2.5 + h * 0.35), axis='z', r=3.15, h=0.4)]
    pr += [P('box', 'steel', (-3.5, -1, 2 + 7), h=(0.6, 0.6, 0.6), r=0.1, seams=0)]
    return Static('silo', pr)


@reg
def spaceport():
    pr = plinth(15, 9) + [
        P('cyl', 'ink', (-3, 0, 2.5), axis='z', r=8.5, h=0.8),
        P('cyl', 'bone', (-3, 0, 3.0), axis='z', r=6.5, h=0.5),
        P('tor', 'core', (-3, 0, 3.6), axis='z', R=4.2, r=0.35),
        P('box', 'ink', (10.5, 2, 6), h=(2.2, 2.2, 4.4), r=0.4, seams=0),
        P('box', 'glass', (10.5, 2, 11.5), h=(2.8, 2.8, 1.2), r=0.4, seams=0),
        P('cyl', 'steel', (10.5, 2, 14), axis='z', r=0.25, h=1.6)]
    dec = [((-3, -6.5, 3.9), 'ember.2', None), ((5.5, -1, 3.2), 'ember.2', None), ((-11.5, 0, 3.2), 'ember.2', None)]
    return Static('spaceport', pr, dec)


@reg
def spire():
    pr = plinth(7, 5) + [
        P('box', 'ink', (0, 0, 3.2), h=(4.5, 3.5, 1.5), r=0.4, seams=0),
        P('cone', 'bone', (0, 0, 13), r0=3.2, r1=0.6, hz=8.5),
        P('tor', 'ink', (0, 0, 10), axis='z', R=2.6, r=0.45),
        P('cyl', 'core', (0, 0, 24), axis='z', r=0.4, h=2.6)]
    dec = [((0, -2.3, z), 'core.2', None) for z in (6.5, 8)]
    return Static('spire', pr, dec)


@reg
def tower():
    pr = plinth(8, 6) + [
        P('box', 'bone', (0, 0, 13.5), h=(6, 4.5, 11.8), r=0.4, seams=0),
        P('box', 'ink', (0, 0, 26), h=(4.5, 3.5, 0.8), r=0.3, seams=0),
        P('cyl', 'steel', (2, 1, 28.5), axis='z', r=0.3, h=2),
        P('sph', 'ember', (2, 1, 30.6), r=0.6)]
    dec = grid_dots(-4.5, 4.5, 4, 23, -4.6, dx=1.5, dz=2.1, tok='core.1', alt='ink.1') + side_dots(-3, 3, 4, 23, 6.1, dy=1.5, dz=2.1, tok='core.0')
    return Static('tower', pr, dec)


@reg
def vat():
    pr = plinth(13, 7)
    for x in (-6, 6):
        pr += [P('cyl', 'glass', (x, 0, 7), axis='z', r=4.2, h=5),
               P('cyl', 'acid', (x, 0, 5.5), axis='z', r=3.6, h=3.4),
               P('cyl', 'ink', (x, 0, 12.4), axis='z', r=4.5, h=0.6),
               P('cyl', 'ink', (x, 0, 2.2), axis='z', r=4.5, h=0.5)]
    pr += [P('cap', 'steel', (0, 0, 0), a=(-6, 0, 13.4), b=(6, 0, 13.4), r=0.5)]
    return Static('vat', pr)


# ================================================================ strategic sites
@reg
def core():
    pr = plinth(8, 6, team=False, mat='basalt') + [
        P('cone', 'ink', (0, 0, 3), r0=5, r1=3.4, hz=1.4),
        P('oct', 'core', (0, 0, 13), r=1, s=(4.5, 4.5, 7)),
        P('tor', 'bone', (0, 0, 12), axis='z', R=6, r=0.45),
        P('oct', 'core', (0, 0, 23), r=1, s=(1.2, 1.2, 1.6))]
    return Static('core', pr)


@reg
def pt_base():
    pr = plinth(13, 7, team=False) + [
        P('wedge', 'ink', (-3, 0, 3.6), h=(8, 5.5, 2), r=0.7, cut=(0, -1, 1.4, 4.2)),
        P('box', 'joint', (-3, -4.8, 3.2), h=(5, 0.5, 0.4), r=0.1, seams=0),
        P('box', 'bone', (7, 0, 3.2), h=(3, 4, 1.6), r=0.4, seams=0)] + flag(10, 3, 1.8)
    return Static('pt_base', pr, [((-6, -5.6, 3.2), 'core.2', None), ((0, -5.6, 3.2), 'core.2', None)])


@reg
def pt_campus():
    pr = plinth(13, 7, team=False, mat='moss') + [
        P('box', 'bone', (-6, 1, 4.2), h=(5, 4, 2.6), r=0.5, seams=0),
        P('wedge', 'ink', (-6, 1, 7.4), h=(5.5, 4.4, 1), r=0.2, cut=(0, -1, 1, 0.2), seams=0),
        P('box', 'bone', (3, 2, 3.4), h=(3, 3, 1.8), r=0.4, seams=0),
        P('cyl', 'joint', (3, -3.5, 2.6), axis='z', r=0.4, h=1),
        P('sph', 'moss', (3, -3.5, 5), r=2)] + flag(10, 3, 1.8)
    dec = [((x, -3.1, 4), 'core.2', None) for x in (-9, -7, -5, -3)]
    return Static('pt_campus', pr, dec)


@reg
def pt_data_hub():
    pr = plinth(13, 7, team=False)
    for x in (-8, -4, 0):
        pr.append(P('box', 'ink', (x, 0, 5), h=(1.6, 4.5, 3.3), r=0.3, seams=0))
    pr += [P('cyl', 'steel', (6, 1, 5), axis='z', r=0.5, h=3), rp(P('sph', 'bone', (6, 1, 8.5), r=1, s=(3.5, 3.5, 0.8)), 'y', -0.5)] + flag(10.5, 3, 1.8)
    dec = []
    for x in (-8, -4, 0):
        dec += [((x, -4.6, z), 'core.2' if (x + z) % 3 else 'ember.2', None) for z in (3, 4.5, 6, 7.5)]
    return Static('pt_data_hub', pr, dec)


@reg
def pt_financial():
    pr = plinth(13, 7, team=False) + [
        P('box', 'glass', (-2, 1, 11), h=(5, 4, 9.5), r=0.4, seams=0),
        P('wedge', 'bone', (-2, 1, 21.5), h=(5, 4, 1.4), r=0.2, cut=(1, 0, 1, 1.5), seams=0),
        P('box', 'bone', (6, 0, 3.5), h=(3, 4, 1.8), r=0.3, seams=0)] + flag(10.5, 3, 1.8)
    dec = grid_dots(-6, 2, 3.5, 19, -3.1, dx=2, dz=2.2, tok='bone.2', alt='core.3')
    return Static('pt_financial', pr, dec)


@reg
def pt_foundry():
    pr = plinth(13, 7, team=False) + [
        P('box', 'ink', (-3, 0, 5), h=(7.5, 5.5, 3.3), r=0.4),
        P('cone', 'steel', (-6, 1, 13), r0=2.2, r1=1.3, hz=5),
        P('cyl', 'ember', (-6, 1, 18.2), axis='z', r=1.1, h=0.3),
        P('box', 'magma', (-1, -5.6, 3.6), h=(3, 0.2, 1.6), r=0.1, seams=0),
        P('box', 'bone', (6.5, 0, 3.2), h=(2.5, 4, 1.5), r=0.3, seams=0)] + flag(10.5, 3, 1.8)
    return Static('pt_foundry', pr)


@reg
def pt_industrial():
    pr = plinth(13, 7, team=False) + [P('box', 'ink', (-2, 0, 4.6), h=(8.5, 5.5, 2.8), r=0.4)]
    for x in (-7, -2, 3):
        pr.append(P('wedge', 'bone', (x, 0, 8.7), h=(2.4, 5.2, 1.3), r=0.2, cut=(-1, 0, 1, 0.5), seams=0))
    pr += [P('cyl', 'steel', (5, 3, 10), axis='z', r=1, h=3.5), P('sph', 'joint', (5.5, 3, 15.5), r=1, s=(2, 1.5, 1.4))] + flag(10.5, 3, 1.8)
    dec = [((x, -5.6, 3.4), 'ember.2', None) for x in (-8, -5, -2)]
    return Static('pt_industrial', pr, dec)


@reg
def pt_mine():
    pr = plinth(14, 7, team=False, mat='rock') + [
        P('sph', 'rock', (-7, 0, 2), r=1, s=(5.5, 5, 4)),
        P('sph', 'rock', (6, 3, 2), r=1, s=(3.5, 3, 2.6)),
        P('box', 'steel', (-1, -1, 8), h=(0.5, 0.5, 6.2), r=0.1, seams=0),
        P('box', 'steel', (3, -1, 8), h=(0.5, 0.5, 6.2), r=0.1, seams=0),
        P('box', 'ink', (1, -1, 14.5), h=(2.6, 1, 0.6), r=0.1, seams=0),
        P('cyl', 'bone', (1, -1.8, 14.5), axis='y', r=1.2, h=0.3),
        P('box', 'joint', (1, -1, 3), h=(1.6, 1.6, 1.2), r=0.2, seams=0)] + flag(11, 3, 1.8)
    dec = [((-8, -3.5, 3), 'ember.2', None), ((-5, -3.2, 4.5), 'ember.1', None), ((6, 0.5, 3), 'ember.2', None)]
    return Static('pt_mine', pr, dec)


@reg
def pt_port():
    pr = plinth(13, 7, team=False) + [
        P('box', 'deep', (0, -6.5, 0.4), h=(13, 1.2, 0.4), r=0.1, seams=0),
        P('box', 'team', (-7, 1, 2.8), h=(2.6, 1.4, 1), r=0.1, seams=0),
        P('box', 'ember', (-7, 1, 4.8), h=(2.6, 1.4, 1), r=0.1, seams=0),
        P('box', 'steel', (-2, 2, 2.8), h=(2.6, 1.4, 1), r=0.1, seams=0),
        P('box', 'steel', (4, 0, 8), h=(0.6, 0.6, 6.4), r=0.1, seams=0),
        P('box', 'bone', (2, 0, 14.6), h=(6, 0.7, 0.5), r=0.1, seams=0),
        P('cyl', 'steel', (-3, 0, 12), axis='z', r=0.15, h=2.4)] + flag(10.5, 3, 1.8)
    return Static('pt_port', pr)


@reg
def pt_power_grid():
    pr = plinth(13, 7, team=False) + [
        P('cone', 'steel', (-4, 0, 9), r0=2.6, r1=0.6, hz=7.4),
        P('box', 'steel', (-4, 0, 13), h=(4.5, 0.4, 0.3), r=0.05, seams=0),
        P('box', 'steel', (-4, 0, 9.5), h=(3.5, 0.4, 0.3), r=0.05, seams=0),
        P('box', 'ink', (5, 0, 3.6), h=(3, 3.5, 1.9), r=0.4, seams=0),
        P('cyl', 'bone', (4, -1, 6.4), axis='z', r=0.5, h=1),
        P('cyl', 'bone', (6, 1, 6.4), axis='z', r=0.5, h=1)] + flag(10.5, 3, 1.8)
    dec = [((-8.5, 0, 12.6), 'core.2', None), ((0.5, 0, 12.6), 'core.2', None), ((5, -3.6, 3.6), 'ember.2', None)]
    return Static('pt_power_grid', pr, dec)


@reg
def pt_relay():
    pr = plinth(11, 7, team=False) + [
        P('box', 'ink', (-3, 0, 3.4), h=(4, 4, 1.7), r=0.4, seams=0),
        P('cyl', 'steel', (-3, 0, 12), axis='z', r=0.6, h=7),
        P('tor', 'bone', (-3, 0, 14), axis='z', R=2, r=0.35),
        P('tor', 'bone', (-3, 0, 10.5), axis='z', R=2.6, r=0.35),
        P('sph', 'core', (-3, 0, 19.5), r=1.2)] + flag(8.5, 3, 1.8)
    return Static('pt_relay', pr)


@reg
def pt_unclaimed():
    pr = plinth(12, 7, team=False, mat='rock') + [
        P('box', 'ink', (-6, 1, 4.5), h=(1.2, 3.5, 3.2), r=0.3, seams=0),
        rp(P('box', 'ink', (-1, 2, 3), h=(4, 1, 1.5), r=0.3, seams=0), 'y', 0.3),
        P('box', 'joint', (5, -1, 2.6), h=(2.5, 2.5, 1.2), r=0.6, seams=0),
        P('sph', 'rock', (8, 2, 2), r=1, s=(2.5, 2.5, 1.5)),
        P('sph', 'moss', (-3, -3, 2), r=1, s=(2, 1.5, 1.2))]
    dec = [((-6, -2.6, 4), 'ember.1', None), ((5, -3.6, 2.2), 'ember.0', None)]
    return Static('pt_unclaimed', pr, dec)


@reg
def rift():
    pr = plinth(8, 5, team=False, mat='basalt') + [
        P('oct', 'core', (0, 0, 13), r=1, s=(4, 0.8, 9.5)),
        P('oct', 'ink', (0, 0.6, 13), r=1, s=(2.4, 0.6, 7)),
        rp(P('oct', 'facet', (-5.5, 0, 6), r=1, s=(1, 1, 3)), 'y', -0.4),
        rp(P('oct', 'facet', (5, 1, 5), r=1, s=(0.9, 0.9, 2.5)), 'y', 0.4)]
    dec = [((-6, -1, 16), 'core.3', None), ((6, -1, 19), 'core.2', None), ((-3, -1, 24), 'core.2', None), ((4, -1, 10), 'core.3', None)]
    return Static('rift', pr, dec)


STRUCT = ['array', 'block', 'bunker', 'citadel', 'crystal', 'dish', 'dome', 'elevator', 'factory', 'habitat', 'hive', 'lab',
          'launch', 'monolith', 'obelisk', 'pylon', 'pyramid', 'reactor', 'ring', 'silo', 'spaceport', 'spire', 'tower', 'vat']
SITES = ['core', 'pt_base', 'pt_campus', 'pt_data_hub', 'pt_financial', 'pt_foundry', 'pt_industrial', 'pt_mine', 'pt_port',
         'pt_power_grid', 'pt_relay', 'pt_unclaimed', 'rift']

if __name__ == '__main__':
    import sys, time
    from forge import to_png
    from PIL import Image
    keys = sys.argv[1:] or STRUCT + SITES
    ims = []
    for k in keys:
        t = time.time(); g = S[k]().frame()
        ims.append(to_png([g], f'/tmp/claude-0/s_{k}.png')); print(k, g.shape[1], g.shape[0], round(time.time() - t, 1), flush=True)
    W = 8; cw = max(i.width for i in ims) + 4; ch = max(i.height for i in ims) + 4
    sheet = Image.new('RGBA', (W * cw, ((len(ims) + W - 1) // W) * ch), (58, 82, 54, 255))
    for i, im in enumerate(ims):
        sheet.alpha_composite(im, ((i % W) * cw + (cw - im.width) // 2, (i // W) * ch + ch - im.height - 2))
    sheet.resize((sheet.width * 3, sheet.height * 3), 0).save('/tmp/claude-0/statics.png')
