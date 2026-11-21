"""Batch 3 Pixelwright writes: statics, the TBU kit and fx packed into rows that each fit one pixels_write."""
import json, sys
import numpy as np
from statics import S, STRUCT, SITES
import tbu, fx
CH = 'abcdefghijklmnopqrstuvwxyz0123456789!$%&*+=?@#~^-_:;<>/(){}[],'
W = 512


def crop(g):
    ys = [y for y in range(g.shape[0]) if any(v is not None for v in g[y])]
    xs = [x for x in range(g.shape[1]) if any(v is not None for v in g[:, x])]
    return g[min(ys):max(ys) + 1, min(xs):max(xs) + 1]


items = [(k, S[k]().frame()) for k in STRUCT + SITES]
items += [(n, crop(tbu.cell(f))) for n, f in tbu.PARTS]
items += [(f'muzzle{i}', crop(fx.muzzle_frame(i))) for i in range(3)] + [(f'impact{i}', crop(fx.impact_frame(i))) for i in range(4)]
items += [(f'slash{i}', crop(fx.slash_frame(i))) for i in range(4)] + [(f'burst{i}', crop(fx.burst_frame(i))) for i in range(1, 6)]
GAP = 6
rows, cur = [], []


def fits(row):
    w = sum(g.shape[1] for _, g in row) + GAP * (len(row) - 1)
    h = max(g.shape[0] for _, g in row)
    toks = set(t for _, g in row for t in g.ravel() if t is not None)
    return w <= W - 8 and w * h <= 16384 and len(toks) <= len(CH)


for it in items:
    if cur and not fits(cur + [it]):
        rows.append(cur); cur = []
    cur.append(it)
rows.append(cur)
out = []; y = 2
for row in rows:
    H = max(g.shape[0] for _, g in row)
    w = sum(g.shape[1] for _, g in row) + GAP * (len(row) - 1)
    canvas = np.full((H, w), None, object); x = 0
    for _, g in row:
        canvas[H - g.shape[0]:, x:x + g.shape[1]] = g; x += g.shape[1] + GAP
    toks = {}
    rr = []
    for yy in range(H):
        r = ''
        for xx in range(w):
            t = canvas[yy, xx]
            if t is None:
                r += '.'
            else:
                if t not in toks: toks[t] = CH[len(toks)]
                r += toks[t]
        rr.append('|'.join(r[i:i + 8] for i in range(0, len(r), 8)))
    keys = {v: k for k, v in toks.items()}; keys['.'] = 'keep'
    out.append({'names': [n for n, _ in row], 'origin': [4, y], 'rows': rr, 'keys': keys, 'w': w, 'h': H})
    y += H + 6
json.dump({'writes': out, 'h': y}, open(sys.argv[1], 'w'))
for o in out:
    print(o['origin'], o['w'], o['h'], len(o['keys']), o['names'])
print('height', y)
