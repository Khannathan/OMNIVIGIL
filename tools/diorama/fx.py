"""Batch 3c: combat effects. The burst is a lit fireball from the forge; the small 16x16
effects are drawn as 2D shapes with the same palette ramps and Bayer dithering."""
import math, random
import numpy as np
from forge import Prim as P, Part, render, BAYER

R = random.Random(7)


# ------------------------------------------------------------------ burst (48x48 x 6), forge-lit
def burst_frame(i):
    pr, dec = [], []
    c = (0, 0, 0)
    if i == 0:
        pr += [P('sph', 'core', c, r=3.2), P('oct', 'core', c, r=1, s=(9, 0.6, 1.2)), P('oct', 'core', c, r=1, s=(1.2, 0.6, 9))]
    else:
        fire = [0, 7, 10, 9, 5, 0][i]; smoke = [0, 0, 6, 11, 13, 14][i]
        rr = random.Random(i * 13)
        if smoke:
            for k in range(7):
                a = k / 7 * 6.283 + i * 0.3
                d = smoke * 0.55
                pr.append(P('sph', 'joint' if k % 2 else 'ink', (d * math.cos(a), rr.uniform(-2, 2), d * math.sin(a) * 0.8 + i * 0.8),
                            r=smoke * (0.42 + 0.1 * rr.random()) * (1.0 if i < 5 else 0.75)))
        if fire:
            for k in range(9):
                a = k / 9 * 6.283 + i; d = fire * (0.55 if k % 3 else 0.75)
                pr.append(P('sph', ['ember', 'magma', 'ember'][k % 3], (d * math.cos(a), -smoke * 0.5 - 1 + rr.uniform(-1, 1), d * math.sin(a) * 0.9),
                            r=fire * rr.uniform(0.28, 0.42)))
            pr.append(P('sph', 'core' if i == 1 else 'ember', (0, -smoke * 0.5 - 3, 0), r=fire * 0.42))
        for k in range([0, 14, 18, 10, 6, 3][i]):
            a = rr.uniform(0, 6.283); d = rr.uniform(10, 14 + i * 2)
            dec.append(((d * math.cos(a), -16, d * math.sin(a)), rr.choice(['ember.2', 'ember.1', 'core.2']), None))
    if not pr:
        pr = [P('sph', 'ink', (0, 0, 0), r=0.01)]
    g = render({'p': Part('p', pr)}, {}, 48, 48, (24, 24), [])
    # loose sparks are painted after the render so they float free of the smoke
    for (x, y, z), tok, _ in dec:
        px, py = int(24 + x + 0.5 * y + 8), int(24 - z - 0.5 * y - 8)
        if 0 <= px < 48 and 0 <= py < 48 and g[py, px] is None:
            g[py, px] = tok
    return g


# ------------------------------------------------------------------ 2D helpers for 16x16
RAMP_FIRE = ['ember.0', 'ember.1', 'ember.2', 'core.3']
RAMP_SPARK = ['core.0', 'core.1', 'core.2', 'core.3']


def shade(v, x, y, ramp):
    v = v + (BAYER[y % 4][x % 4] - 7.5) / 16 * 0.18
    return ramp[int(np.clip(math.floor(v * len(ramp)), 0, len(ramp) - 1))]


def outline(g, tok='outline'):
    h, w = g.shape; o = g.copy()
    for y in range(h):
        for x in range(w):
            if g[y, x] is None and any(0 <= x + dx < w and 0 <= y + dy < h and g[y + dy, x + dx] is not None and g[y + dy, x + dx] != tok
                                       for dx, dy in ((1, 0), (-1, 0), (0, 1), (0, -1))):
                o[y, x] = tok
    return o


def muzzle_frame(i):
    g = np.full((16, 16), None, object)
    L = [5, 9, 6][i]; W = [2.2, 3.4, 2.4][i]
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - 2, y + 0.5 - 8
            if dx < 0:
                continue
            t = dx / L
            if t > 1:
                continue
            half = W * (1 - t) ** 0.7 + (1.2 if (i == 1 and abs(dy) < 0.6 and t < 1.0) else 0)
            star = i == 1 and abs(abs(dy) - (dx * 0.7)) < 0.6 and dx < 5
            if abs(dy) <= half or star:
                v = 1 - t * 0.8 - abs(dy) / (half + 1e-3) * 0.35
                g[y, x] = shade(v + (0.1 if i == 1 else -0.1 * i), x, y, RAMP_FIRE)
    return outline(g) if i < 2 else g


def impact_frame(i):
    g = np.full((16, 16), None, object)
    rr = random.Random(3)
    rad = [1.6, 3.4, 2.8, 0][i]
    for y in range(16):
        for x in range(16):
            d = math.hypot(x + 0.5 - 8, y + 0.5 - 8)
            if d <= rad:
                g[y, x] = shade(1 - d / (rad + 0.5) * 0.7 - 0.15 * i, x, y, RAMP_FIRE)
    for k in range(9):
        a = rr.uniform(0, 6.283); sp = rr.uniform(2.5, 4.5)
        d = sp * (i + 0.6)
        x, y = int(8 + d * math.cos(a)), int(8 + d * math.sin(a))
        if i and 0 <= x < 16 and 0 <= y < 16:
            g[y, x] = ['ember.2', 'core.3', 'ember.1', 'ember.0'][i]
            x2, y2 = int(8 + (d - 1.2) * math.cos(a)), int(8 + (d - 1.2) * math.sin(a))
            if i < 3 and 0 <= x2 < 16 and 0 <= y2 < 16 and g[y2, x2] is None:
                g[y2, x2] = 'ember.0'
    return outline(g) if i < 2 else g


def slash_frame(i):
    g = np.full((16, 16), None, object)
    # an arc swept from the top to the right around the lower-left corner; the bright edge leads
    a0, a1 = [(-105, -75), (-105, -30), (-80, 5), (-35, 5)][i]
    for y in range(16):
        for x in range(16):
            dx, dy = x + 0.5 - 2.5, y + 0.5 - 13.5
            r = math.hypot(dx, dy); a = math.degrees(math.atan2(dy, dx))
            if a0 <= a <= a1:
                lead = (a - a0) / (a1 - a0 + 1e-6)
                thick = 1.0 + 2.2 * lead if i < 3 else 1.6
                if 10.5 - thick <= r <= 10.5:
                    v = 0.2 + 0.8 * lead - (10.5 - r) * 0.06 - (0.3 if i == 3 else 0)
                    g[y, x] = shade(v, x, y, RAMP_SPARK)
    return outline(g) if i < 3 else g


def strip(fn, n):
    return [fn(i) for i in range(n)]


if __name__ == '__main__':
    from forge import to_png
    from PIL import Image
    out = {}
    for name, fn, n in (('muzzle', muzzle_frame, 3), ('impact', impact_frame, 4), ('slash', slash_frame, 4), ('burst', burst_frame, 6)):
        to_png(strip(fn, n), f'/tmp/claude-0/fx_{name}.png')
        out[name] = Image.open(f'/tmp/claude-0/fx_{name}.png')
    W = max(i.width for i in out.values()); H = sum(i.height + 4 for i in out.values())
    s = Image.new('RGBA', (W, H), (40, 48, 56, 255)); y = 0
    for i in out.values():
        s.alpha_composite(i, (0, y)); y += i.height + 4
    s.resize((W * 3, H * 3), 0).save('/tmp/claude-0/fx_view.png')
