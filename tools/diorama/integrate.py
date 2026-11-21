#!/usr/bin/env python3
"""Swap the Diorama sheets (art-preview/diorama/dropin) into src/art/prism and update the manifest
sizes. Then run tools/prism-pack.py and tools/prism-icons.py."""
import json, pathlib, shutil
from PIL import Image
root = pathlib.Path(__file__).resolve().parent.parent.parent
src, dst = root / 'art-preview/diorama/dropin', root / 'src/art/prism'
mf = dst / 'manifest.json'; M = json.loads(mf.read_text())
n = 0
for p in sorted(src.rglob('*.png')):
    rel = p.relative_to(src); shutil.copyfile(p, dst / rel); n += 1
    im = Image.open(p).convert('RGBA'); key = rel.with_suffix('').as_posix()
    sub = rel.parts[0]
    if sub in ('units', 'creatures'):
        k = key[6:] if sub == 'units' else key
        u = M['units'][k]; w = im.width // 15; h = im.height
        f0 = im.crop((0, 0, w, h)).getbbox()  # idle frame body
        u.update(w=w, h=h, bodyW=f0[2] - f0[0], bodyH=f0[3] - f0[1])
    elif sub in ('structures', 'sites'):
        M['statics'][key].update(w=im.width, h=im.height)
mf.write_text(json.dumps(M, indent=1) + '\n')
print('copied', n, 'sheets')
