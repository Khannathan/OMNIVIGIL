#!/usr/bin/env python3
"""Diorama forge: renders OMNIVIGIL sprites in the same 3/4 camera and light as the Pixelwright
world map (front face square on, depth receding up and to the right at half scale, light from
the upper left), banded onto the project's palette ramps with a dark outline.

Models are lists of primitives (signed distance functions) with a material ramp. Each frame is a
pose: parts move, turn and swap per frame. The result is a grid of palette tokens, which goes to
the studio (pixels_write rows) and to the game sheets (PNG) unchanged.
"""
import json, math, pathlib
import numpy as np

HERE = pathlib.Path(__file__).resolve().parent
PAL = json.loads((HERE / 'palette.json').read_text())  # token -> hex

# light from the upper left and slightly in front; view goes "into" the screen along VIEW
L = np.array([-0.55, -0.45, 0.70]); L = L / np.linalg.norm(L)
VIEW = np.array([-0.5, 1.0, -0.5]); VIEW = VIEW / np.linalg.norm(VIEW)

BAYER = [[0, 8, 2, 10], [12, 4, 14, 6], [3, 11, 1, 9], [15, 7, 13, 5]]
DITHER = 0.10

RAMPS = {  # material -> palette ramp tokens (dark to light); emissive ones ignore light
    'ink': ['ink.0', 'ink.1', 'ink.2', 'ink.3', 'ink.4'],
    'bone': ['ink.4', 'bone.0', 'bone.1', 'bone.2'],
    'team': ['ink.2', 'team.0', 'team.1', 'team.2'],
    'core': ['core.0', 'core.1', 'core.2', 'core.3'],
    'ember': ['ember.0', 'ember.1', 'ember.2'],
    'steel': ['steel.0', 'steel.1', 'steel.2', 'steel.3'],
    'joint': ['joint.0', 'joint.1', 'joint.2'],
    'glass': ['ink.1', 'core.0', 'core.1', 'core.2'],
    'chitin': ['geode.0', 'geode.1', 'geode.2', 'geode.3'],
    'flesh': ['cap.0', 'cap.1', 'cap.2', 'cap.3'],
    'spore': ['spore.0', 'spore.1', 'spore.2', 'spore.3'],
    'bile': ['bile.0', 'bile.1', 'bile.2', 'bile.3'],
    'acid': ['acid.0', 'acid.1', 'acid.2', 'acid.3'],
    'deep': ['abyss.0', 'abyss.2', 'frost.2', 'frost.3'],
    'shoal': ['shoal.0', 'shoal.1', 'shoal.2', 'shoal.3'],
    'rock': ['rock.0', 'rock.1', 'rock.2', 'rock.3', 'rock.4'],
    'basalt': ['basalt.0', 'basalt.1', 'basalt.2', 'basalt.3'],
    'magma': ['magma.0', 'magma.1', 'magma.2', 'magma.3'],
    'facet': ['facet.0', 'facet.1', 'facet.2', 'facet.3'],
    'moss': ['moss.0', 'moss.1', 'moss.2', 'moss.3'],
}
EMISSIVE = {'core', 'ember', 'acid', 'magma'}


def rot(ax, a):
    c, s = math.cos(a), math.sin(a)
    if ax == 'y':  # pitch in the side view (x right, z up)
        return np.array([[c, 0, s], [0, 1, 0], [-s, 0, c]])
    if ax == 'z':
        return np.array([[c, -s, 0], [s, c, 0], [0, 0, 1]])
    return np.array([[1, 0, 0], [0, c, -s], [0, s, c]])


class Prim:
    """kind: box (h = half sizes, r = rounding), cyl (axis, r, h), sph (r), cap (a, b, r),
    wedge (box cut by a slope: h, cut = (nx, nz, offset) in local space)."""

    def __init__(self, kind, mat, at=(0, 0, 0), **k):
        self.kind, self.mat, self.at, self.k = kind, mat, np.array(at, float), k
        self.R = np.eye(3)

    def sdf(self, p):  # p: (N,3) local to the primitive's parent space
        q = (p - self.at) @ self.R  # inverse rotate
        k = self.k
        if self.kind == 'box' or self.kind == 'wedge':
            h = np.array(k['h'], float) - k.get('r', 0)
            d = np.abs(q) - h
            out = np.linalg.norm(np.maximum(d, 0), axis=1) + np.minimum(d.max(axis=1), 0) - k.get('r', 0)
            if self.kind == 'wedge':
                n = np.array(k['cut'][:3], float); n = n / np.linalg.norm(n)
                out = np.maximum(out, q @ n - k['cut'][3])
            return out
        if self.kind == 'oct':
            s = np.array(k.get('s', (1, 1, 1)), float)
            return (np.abs(q / s).sum(axis=1) - k['r']) * 0.57735 * s.min()
        if self.kind == 'sph':
            s = np.array(k.get('s', (1, 1, 1)), float)
            return (np.linalg.norm(q / s, axis=1) - k['r']) * s.min()
        if self.kind == 'cyl':
            ax = 'xyz'.index(k.get('axis', 'z'))
            o = [i for i in range(3) if i != ax]
            d = np.stack([np.linalg.norm(q[:, o], axis=1) - k['r'], np.abs(q[:, ax]) - k['h']], 1)
            return np.minimum(d.max(axis=1), 0) + np.linalg.norm(np.maximum(d, 0), axis=1)
        if self.kind == 'cap':
            a, b = np.array(k['a'], float), np.array(k['b'], float)
            pa, ba = q - a, b - a
            t = np.clip((pa @ ba) / (ba @ ba), 0, 1)
            return np.linalg.norm(pa - t[:, None] * ba, axis=1) - k['r']
        raise ValueError(self.kind)


class Part:
    """A group of primitives with a pivot; pose = (offset, pitch, yaw, hide)."""

    def __init__(self, name, prims, pivot=(0, 0, 0), parent=None):
        self.name, self.prims, self.pivot, self.parent = name, prims, np.array(pivot, float), parent


def build_world(parts, pose):
    """Flatten parts into world-space primitives for this pose: list of (prim, M, t)."""
    mats = {}
    out = []

    def xf(name):
        if name in mats:
            return mats[name]
        part = parts[name]
        ps = pose.get(name, {})
        R = rot('y', ps.get('pitch', 0)) @ rot('z', ps.get('yaw', 0)) @ rot('x', ps.get('roll', 0))
        off = np.array(ps.get('off', (0, 0, 0)), float)
        # world = parentR @ (R @ (p - pivot) + pivot + off) + parentT
        if part.parent:
            PR, PT = xf(part.parent)
        else:
            PR, PT = np.eye(3), np.zeros(3)
        Rw = PR @ R
        Tw = PR @ (part.pivot + off - R @ part.pivot) + PT
        mats[name] = (Rw, Tw)
        return mats[name]

    for name, part in parts.items():
        if pose.get(name, {}).get('hide'):
            continue
        Rw, Tw = xf(name)
        for pr in part.prims:
            out.append((pr, Rw, Tw, pose.get(name, {}).get('mat')))
    return out


def scene_sdf(prims, p):
    best = np.full(len(p), 1e9); mat = np.full(len(p), -1)
    for i, (pr, Rw, Tw, _) in enumerate(prims):
        local = (p - Tw) @ Rw  # world -> part space (Rw orthonormal)
        d = pr.sdf(local)
        m = d < best
        best = np.where(m, d, best); mat = np.where(m, i, mat)
    return best, mat


def render(parts, pose, w, h, origin, decals=(), shade_bias=0.0, dim=0):
    """origin: screen pixel of world (0,0,0). Returns (h,w) array of tokens (None = clear)."""
    prims = build_world(parts, pose)
    ys, xs = np.mgrid[0:h, 0:w]
    sx = (xs + 0.5 - origin[0]).ravel(); sy = (ys + 0.5 - origin[1]).ravel()
    y0 = -40.0
    p = np.stack([sx - 0.5 * y0, np.full_like(sx, y0), -sy - 0.5 * y0], 1)
    t = np.zeros(len(p)); hit = np.zeros(len(p), bool); alive = np.ones(len(p), bool)
    for _ in range(140):
        idx = np.where(alive)[0]
        if not len(idx):
            break
        q = p[idx] + VIEW[None] * t[idx, None]
        d, _m = scene_sdf(prims, q)
        h_ = d < 0.02
        hit[idx[h_]] = True; alive[idx[h_]] = False
        t[idx] += np.maximum(d, 0.02) * 0.9
        far = t[idx] > 160
        alive[idx[far]] = False
    pos = p + VIEW[None] * t[:, None]
    hitidx = np.where(hit)[0]
    grid = np.full(w * h, None, object)
    depth = np.full(w * h, 1e9)
    if len(hitidx):
        hp = pos[hitidx]
        d0, mi = scene_sdf(prims, hp)
        e = 0.25
        n = np.zeros_like(hp)
        for a in range(3):
            o = np.zeros(3); o[a] = e
            n[:, a] = scene_sdf(prims, hp + o)[0] - scene_sdf(prims, hp - o)[0]
        n /= np.linalg.norm(n, axis=1, keepdims=True) + 1e-9
        # ambient occlusion: is there geometry close above the surface?
        ao = np.zeros(len(hp))
        for s in (1.2, 2.4):
            ao += np.clip(s - scene_sdf(prims, hp + n * s)[0], 0, s) / s
        lam = np.clip(n @ L, -1, 1)
        for j, gi in enumerate(hitidx):
            pr, _, _, override = prims[mi[j]]
            mat = override or pr.mat
            ramp = RAMPS[mat]
            if mat in EMISSIVE:
                k = len(ramp) - 2 + (1 if lam[j] > 0.3 else 0)
                k = min(len(ramp) - 1, max(0, k - dim))
            else:
                px, py = gi % w, gi // w
                v = 0.5 + 0.5 * lam[j] + shade_bias - 0.22 * ao[j] + (BAYER[py % 4][px % 4] - 7.5) / 16 * DITHER
                k = int(np.clip(math.floor(v * len(ramp) + 0.15), 0, len(ramp) - 1))
                sp = pr.k.get('seams', 5 if pr.kind in ('box', 'wedge') and pr.k['h'][0] >= 3.5 and mat in ('ink', 'bone', 'steel') else 0)
                if sp:
                    _, Rw_, Tw_, _ = prims[mi[j]]
                    q = ((hp[j] - Tw_) @ Rw_ - pr.at) @ pr.R
                    nl = (n[j] @ Rw_) @ pr.R
                    hx = pr.k['h'][0]
                    if abs(nl[0]) < 0.6 and abs(q[0]) < hx - 1.2 and (q[0] + hx) % sp < 0.75:
                        k = max(0, k - 1)
                    if abs(nl[1]) > 0.7 and abs(q[2] - pr.k['h'][2] * 0.15) < 0.4 and pr.k['h'][2] >= 2.5:
                        k = max(0, k - 1)
                k = max(0, k - dim)
            grid[gi] = ramp[k]
            depth[gi] = t[gi]
    grid = grid.reshape(h, w); depth = depth.reshape(h, w)
    # decals: (world point, token, size) painted when not hidden
    prim_world = None
    for (wp, tok, part) in decals:
        if part and pose.get(part, {}).get('hide'):
            continue
        if part:
            Rw, Tw = _part_xf(parts, pose, part)
            wp = Rw @ np.array(wp, float) + Tw
        wp = np.array(wp, float)
        px = wp[0] + 0.5 * wp[1] + origin[0]; py = -wp[2] - 0.5 * wp[1] + origin[1]
        ix, iy = int(math.floor(px)), int(math.floor(py))
        if 0 <= ix < w and 0 <= iy < h and grid[iy, ix] is not None:
            # depth of the decal along the view vs the surface there
            sx_, sy_ = ix + 0.5 - origin[0], iy + 0.5 - origin[1]
            tt = (wp - np.array([sx_ + 20, -40, -sy_ + 20])) @ VIEW
            if tt <= depth[iy, ix] + 1.5:
                grid[iy, ix] = tok
    return finish(grid, depth)


def _part_xf(parts, pose, name):
    lst = build_world({k: v for k, v in parts.items()}, pose)
    # recompute transform of the named part
    mats = {}

    def xf(nm):
        if nm in mats:
            return mats[nm]
        part = parts[nm]; ps = pose.get(nm, {})
        R = rot('y', ps.get('pitch', 0)) @ rot('z', ps.get('yaw', 0)) @ rot('x', ps.get('roll', 0))
        off = np.array(ps.get('off', (0, 0, 0)), float)
        PR, PT = xf(part.parent) if part.parent else (np.eye(3), np.zeros(3))
        mats[nm] = (PR @ R, PR @ (part.pivot + off - R @ part.pivot) + PT)
        return mats[nm]
    return xf(name)


DARKER = {}
for r in RAMPS.values():
    for i, tkn in enumerate(r):
        DARKER.setdefault(tkn, r[max(0, i - 2)])


LIGHTER = {}
for r in RAMPS.values():
    for i, tkn in enumerate(r):
        LIGHTER.setdefault(tkn, r[min(len(r) - 1, i + 1)])


def finish(grid, depth):
    h, w = grid.shape
    out = grid.copy()
    # rim light: top and left silhouette edges catch the light (upper-left key light)
    for y in range(h):
        for x in range(w):
            t = grid[y, x]
            if t is None or t.split('.')[0] in EMISSIVE:
                continue
            up = grid[y - 1, x] if y > 0 else None
            if up is None or depth[y, x] - depth[y - 1, x] < -3.5:
                out[y, x] = LIGHTER[t]
    # inner contour: a pixel whose upper or left neighbour is much nearer gets darkened
    for y in range(h):
        for x in range(w):
            if grid[y, x] is None:
                continue
            for dx, dy in ((-1, 0), (0, -1), (1, 0), (0, 1)):
                X, Y = x + dx, y + dy
                if 0 <= X < w and 0 <= Y < h and grid[Y, X] is not None and depth[y, x] - depth[Y, X] > 3.5:
                    tok = grid[y, x]
                    if not (tok.startswith('core') or tok.startswith('ember')):
                        out[y, x] = 'outline'
                    break
    # outer outline
    o2 = out.copy()
    for y in range(h):
        for x in range(w):
            if out[y, x] is not None:
                continue
            for dx, dy in ((-1, 0), (1, 0), (0, -1), (0, 1)):
                X, Y = x + dx, y + dy
                if 0 <= X < w and 0 <= Y < h and out[Y, X] is not None and out[Y, X] != 'outline':
                    o2[y, x] = 'outline'
                    break
    return o2


def to_png(grids, path, cell=None):
    from PIL import Image
    h = max(g.shape[0] for g in grids); w = sum(g.shape[1] for g in grids)
    im = Image.new('RGBA', (w, h), (0, 0, 0, 0))
    x0 = 0
    for g in grids:
        for y in range(g.shape[0]):
            for x in range(g.shape[1]):
                t = g[y, x]
                if t is not None:
                    hx = PAL[t]
                    im.putpixel((x0 + x, y), tuple(int(hx[i:i + 2], 16) for i in (1, 3, 5)) + (255,))
        x0 += g.shape[1]
    im.save(path)
    return im
