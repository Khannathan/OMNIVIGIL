#!/usr/bin/env python3
"""Build an itch.io HTML5 upload: dist/omnivigil-itch.zip with index.html at the root.

Usage: python3 tools/make-itch.py
Then on itch.io: Create new project -> Kind of project: HTML -> upload the zip ->
tick "This file will be played in the browser". Suggested viewport 1600 x 900,
with "Fullscreen button" and "Mobile friendly" on.
"""
import os, zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OUT = os.path.join(ROOT, 'dist', 'omnivigil-itch.zip')
BUILD = os.path.join(ROOT, 'build')  # run `npm run build` first (Vite output)
INCLUDE = [('index.html', BUILD), ('assets', BUILD), ('README.md', ROOT), ('PACK_FORMAT.md', ROOT)]

os.makedirs(os.path.dirname(OUT), exist_ok=True)
n = 0
with zipfile.ZipFile(OUT, 'w', zipfile.ZIP_DEFLATED) as z:
    for item, base in INCLUDE:
        p = os.path.join(base, item)
        if os.path.isfile(p):
            z.write(p, item); n += 1
            continue
        for d, _, files in os.walk(p):
            for f in sorted(files):
                full = os.path.join(d, f)
                z.write(full, os.path.relpath(full, base).replace(os.sep, '/')); n += 1
print(f'wrote {OUT} ({n} files, {os.path.getsize(OUT) // 1024} KB)')
