"""Batch 3d: relight the 12x12 UI icons with the Diorama key light (upper left):
edges facing the light step up one shade on their ramp, edges facing away step down,
and a one-pixel drop shadow falls to the lower right. Colours stay on the palette ramps,
so the resource row keeps its team magenta for tools/prism-icons.py."""
import json, sys
from PIL import Image
from forge import PAL, RAMPS

RGB = {t: tuple(int(h[i:i + 2], 16) for i in (1, 3, 5)) for t, h in PAL.items()}
RAMPOF = {}
for r in list(RAMPS.values()):
    for i, t in enumerate(r):
        RAMPOF.setdefault(t, (r, i))


def near(c):
    return min(RGB, key=lambda t: sum((a - b) ** 2 for a, b in zip(RGB[t], c)))


def step(t, d):
    if t not in RAMPOF:
        return t
    r, i = RAMPOF[t]
    return r[max(0, min(len(r) - 1, i + d))]


def relight(src, dst, cell=12):
    im = Image.open(src).convert('RGBA'); W, H = im.size
    tok = [[None if im.getpixel((x, y))[3] < 128 else near(im.getpixel((x, y))[:3]) for x in range(W)] for y in range(H)]
    out = [row[:] for row in tok]

    def solid(x, y):
        return 0 <= x < W and 0 <= y < H and tok[y][x] not in (None, 'outline') and x // cell == x0 // cell

    for y in range(H):
        for x in range(W):
            t = tok[y][x]
            if t in (None, 'outline'):
                continue
            x0 = x
            lit = not solid(x - 1, y) or not solid(x, y - 1)
            dark = not solid(x + 1, y) or not solid(x, y + 1)
            if lit and not dark:
                out[y][x] = step(t, 1)
            elif dark and not lit:
                out[y][x] = step(t, -1)
    res = Image.new('RGBA', (W, H), (0, 0, 0, 0))
    for y in range(H):
        for x in range(W):
            if out[y][x] is None and x % cell < cell - 1 and y < H - 1 and y > 0 and x > 0 and \
               tok[y - 1][x - 1] not in (None,) and (x - 1) // cell == x // cell:
                res.putpixel((x, y), RGB['ink.0'] + (150,))
            elif out[y][x] is not None:
                res.putpixel((x, y), RGB[out[y][x]] + (255,))
    res.save(dst)
    return res


if __name__ == '__main__':
    root = sys.argv[1] if len(sys.argv) > 1 else '../../src/art/prism/ui'
    for n in ('icons', 'icons2', 'icons3'):
        relight(f'{root}/{n}.png', f'/tmp/claude-0/{n}.png')
    ims = [Image.open(f'{root}/{n}.png').convert('RGBA') for n in ('icons', 'icons2', 'icons3')] + \
          [Image.open(f'/tmp/claude-0/{n}.png') for n in ('icons', 'icons2', 'icons3')]
    Wd = max(i.width for i in ims); Hd = sum(i.height + 3 for i in ims)
    s = Image.new('RGBA', (Wd, Hd), (40, 48, 56, 255)); y = 0
    for i in ims:
        s.alpha_composite(i, (0, y)); y += i.height + 3
    s.resize((Wd * 4, Hd * 4), 0).save('/tmp/claude-0/icons_view.png')
