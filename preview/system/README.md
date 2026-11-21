# Star system preview (standalone, not wired into the game)

One continuous camera from street level out to the whole star system: 15 planets (6 classic + 9 exotic), 11 moons, an orbital craft that flies between the home world and its moon Esk.

- `fs.glsl`, `vs.glsl`, `js.txt` are the editable pieces; `python3 assemble.py` splices them into `template.html`, then `python3 build.py` inlines the art into `index.html`.
- Art comes from Pixelwright: terrain atlas `art/atlas4.png` (16 biomes x dark/normal/light rows of 16 tiles) and `art/sprites2.png` (props rows 0-15 at 40 px, then TBU, Observer and craft frames from y=640).
- `gen/` holds the Python that generated the pixel rows written into Pixelwright (exotic worlds: project prj_a8719475de4c5614, assets spr_a3dd19b4 terrain and spr_269d7cf4 props).
- Exotic biome ids: 7 Thalasse (hycean), 8 Oculus (eyeball, tidally locked), 9 Adamant (diamond), 10 Khthon (chthonian), 11 Axiom (computronium), 12 Nox (rogue), 13 Tempest (gas giant), 14 Strangelet (strange matter), 15 Corpus (living world).
