# World map preview (Pixelwright)

Standalone WebGL2 preview of a rebuilt world map. Not wired into the game yet.

- `art/atlas.png`: Pixelwright "World map - terrain atlas" (spr_2c3137a3): 16 terrain tiles (16x16) x 6 worlds
  (rows: Terran, Fungal, Crystal, Lava, Ice, Toxic). Tile order: deep sea, sea, shallows, beach, grass, meadow,
  marsh, broadleaf canopy, pine canopy, rock, high rock, snow, city residential, city core, road, farmland.
- `art/atlas3.png`: the same with a dark and a light row per world (ramp step -1/+1), for hillshade.
- `art/props.png`: Pixelwright "World map - close-up props" (spr_687d0ed1): 32x40 cells, 6 per world
  (tree A, tree B, rocks, small building, tall building, landmark).
- `art/sprites.png`: props + Prism TBU and Observer sheets.
- `template.html` + `build.py` -> `index.html` (art inlined as data URIs). Run `python3 preview/worldmap/build.py` from the repo root.

How it works: one ray-cast cube-sphere (same face conventions as src/gl/cube.ts). Each screen pixel picks a
quadtree level so one texel is about one pixel, crossfading levels with a 4x4 ordered dither. The terrain class
comes from seeded 3D noise at the texel centre, and the colour is the matching Pixelwright tile pixel. Close up,
props and units are camera-facing billboards placed from a JS twin of the same noise.
