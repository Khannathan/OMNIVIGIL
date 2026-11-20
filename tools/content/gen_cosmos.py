#!/usr/bin/env python3
"""Generates packs/core/cosmos.json: star types, planet types, ~117 new biomes (terrains),
planet features, system phenomena, alien body plans and species traits, satellites.
Idempotent: re-run, then `node tools/bundle-packs.js`.
"""
import json, os, colorsys

ROOT = os.path.join(os.path.dirname(__file__), '..', '..')
OUT = os.path.join(ROOT, 'packs', 'core', 'cosmos.json')

def shades(hexc, water=False):
    h = hexc.lstrip('#'); r, g, b = (int(h[i:i + 2], 16) / 255 for i in (0, 2, 4))
    hh, ll, ss = colorsys.rgb_to_hls(r, g, b)
    out = []
    for dl in ((-0.13, -0.05, 0.04, 0.13) if not water else (-0.08, -0.03, 0.02, 0.08)):
        rr, gg, bb = colorsys.hls_to_rgb(hh, max(0.03, min(0.95, ll + dl)), ss)
        out.append('#%02x%02x%02x' % (int(rr * 255), int(gg * 255), int(bb * 255)))
    return out

# ------------------------------------------------------------------ biomes
# (id, name, colour, water, tags, temp window, moisture window, height window, mods, desc)
B = []
def bio(id, name, col, tags, t=(0, 1), m=(0, 1), h=(0, 1), mods=None, desc='', water=False):
    B.append({'id': id, 'name': name, 'colors': shades(col, water), 'water': water, 'tags': tags.split(), 't': list(t), 'm': list(m), 'h': list(h),
              'mods': mods or {}, 'desc': desc})

# terran extras (homeworld variations)
bio('mangrove', 'Mangrove Coast', '#3d6b3a', 'terran jungle', (0.6, 1), (0.6, 1), (0, 0.15), {'essence': 0.1, 'capital': 0.05}, 'Salt-tolerant tangles. +10% essence.')
bio('salt_flats', 'Salt Flats', '#d8d2c4', 'terran desert', (0.45, 1), (0, 0.25), (0, 0.25), {'silicon': 0.2}, 'Blinding white crust. +20% Silicon.')
bio('badlands', 'Badlands', '#9a5a3a', 'terran desert', (0.5, 1), (0, 0.4), (0.25, 0.6), {'isotopes': 0.15, 'defense': 0.1}, 'Eroded gullies. +15% Isotopes.')
bio('volcanic_field', 'Volcanic Field', '#4a3a36', 'terran lava', (0.3, 1), (0, 1), (0.5, 0.85), {'energy': 0.2, 'isotopes': 0.1}, 'Fresh lava and geothermal heat. +20% energy.')
bio('karst_spires', 'Karst Spires', '#6f8a6a', 'terran', (0.45, 0.85), (0.5, 1), (0.3, 0.7), {'defense': 0.25}, 'Limestone towers. +25% defence.')
bio('cloud_forest', 'Cloud Forest', '#2f6a55', 'terran jungle', (0.5, 0.85), (0.65, 1), (0.45, 0.8), {'essence': 0.1, 'data': 0.05}, 'Mist-drenched highland forest.')
bio('wetlands', 'Wetlands', '#4a6e4e', 'terran', (0.35, 0.75), (0.7, 1), (0, 0.2), {'essence': 0.08, 'alloys': -0.05}, 'Reed beds and bogs.')
bio('red_dunes', 'Red Dunes', '#b8643a', 'terran desert', (0.65, 1), (0, 0.2), (0.1, 0.45), {'energy': 0.3}, 'Iron-stained sand seas. +30% energy.')
bio('alpine_meadow', 'Alpine Meadow', '#7a9a5e', 'terran', (0.3, 0.6), (0.4, 1), (0.5, 0.75), {'capital': 0.05, 'defense': 0.1}, 'High summer pastures.')
bio('coral_flats', 'Coral Flats', '#3fb0b0', 'terran ocean', water=True, desc='Living reefs in warm shallows.')

# ocean worlds
bio('atoll', 'Atoll Chains', '#c9c08a', 'ocean', (0.4, 1), (0, 1), (0, 0.3), {'capital': 0.1, 'essence': 0.05}, 'Ring islands around lagoons.')
bio('reef_isles', 'Reef Isles', '#7fbf8a', 'ocean', (0.3, 1), (0.4, 1), (0.2, 0.6), {'essence': 0.15}, 'Islands built by reef creatures. +15% essence.')
bio('floating_mats', 'Floating Mats', '#5f8a3f', 'ocean jungle', (0.4, 1), (0.6, 1), (0, 1), {'essence': 0.2, 'defense': -0.1}, 'Drifting rafts of living matter.')
bio('kelp_highlands', 'Kelp Highlands', '#3d6a4a', 'ocean', (0.2, 0.7), (0.3, 1), (0.5, 1), {'alloys': 0.1}, 'Exposed seamount plateaus.')
bio('storm_sea', 'Storm Sea', '#2a4f6e', 'ocean', water=True, desc='Endless gales over open water.')
bio('abyssal_trench', 'Abyssal Trench', '#081a30', 'ocean', water=True, desc='Lightless trenches kilometres deep.')

# deserts and arid worlds
bio('erg_dunes', 'Erg Dune Sea', '#d9a85c', 'desert', (0.5, 1), (0, 0.35), (0, 0.4), {'energy': 0.3, 'silicon': 0.1}, 'Dunes taller than towers.')
bio('hamada', 'Hamada Plateau', '#a08060', 'desert', (0.4, 1), (0, 0.5), (0.4, 0.8), {'alloys': 0.15}, 'Wind-scoured stone plateau. +15% Alloys.')
bio('glass_desert', 'Glass Desert', '#cfd9c8', 'desert exotic', (0.7, 1), (0, 0.3), (0, 0.5), {'silicon': 0.35}, 'Sand fused into glass by ancient fire. +35% Silicon.')
bio('mesa_country', 'Mesa Country', '#b0603e', 'desert', (0.45, 1), (0, 0.5), (0.5, 0.9), {'defense': 0.2, 'alloys': 0.05}, 'Flat-topped red mesas.')
bio('dust_basin', 'Dust Basin', '#b89f7f', 'desert barren', (0.3, 1), (0, 0.3), (0, 0.3), {'silicon': 0.1}, 'Fine dust that gets into everything.')
bio('oasis_basin', 'Oasis Basin', '#7a9a4a', 'desert', (0.5, 1), (0.45, 1), (0, 0.35), {'capital': 0.2, 'essence': 0.05}, 'Rare green around hidden water. +20% Capital.')
bio('sandstone_arches', 'Sandstone Arches', '#c98a5a', 'desert', (0.45, 1), (0.2, 0.6), (0.3, 0.7), {'defense': 0.1, 'data': 0.05}, 'Wind-carved arches and pillars.')
bio('sulphur_flats', 'Sulphur Flats', '#d6c34a', 'desert toxic lava', (0.55, 1), (0, 0.6), (0, 0.4), {'isotopes': 0.2, 'capital': -0.1}, 'Yellow crust over hot springs. +20% Isotopes.')

# ice worlds
bio('snowball_plains', 'Snowball Plains', '#e6eef4', 'ice', (0, 0.4), (0, 1), (0, 0.4), {'energy': -0.1, 'data': 0.1}, 'Featureless white to the horizon.')
bio('cryovolcano_field', 'Cryovolcano Field', '#a9c6e0', 'ice exotic', (0, 0.4), (0, 1), (0.5, 0.9), {'energy': 0.15, 'isotopes': 0.1}, 'Ice volcanoes erupting water and ammonia.')
bio('blue_ice_shelf', 'Blue Ice Shelf', '#7fb2d9', 'ice', (0, 0.3), (0.3, 1), (0, 0.3), {'silicon': 0.1}, 'Ancient compressed ice glowing blue.')
bio('frost_ridges', 'Frost Ridges', '#c4d4e2', 'ice', (0, 0.35), (0, 1), (0.4, 0.8), {'defense': 0.2}, 'Jagged frozen ridgelines.')
bio('methane_snow', 'Methane Snowfields', '#d9d0e6', 'ice ammonia', (0, 0.25), (0.4, 1), (0, 0.6), {'energy': 0.1}, 'Snow made of frozen methane.')
bio('nitrogen_glacier', 'Nitrogen Glacier', '#f0e6dc', 'ice', (0, 0.15), (0, 1), (0.5, 1), {'isotopes': 0.1}, 'Slow rivers of solid nitrogen.')
bio('ice_canyons', 'Ice Canyons', '#9fb8cc', 'ice', (0, 0.4), (0, 0.6), (0.3, 0.7), {'defense': 0.15, 'alloys': 0.05}, 'Deep cracks in the ice crust.')
bio('permafrost_steppe', 'Permafrost Steppe', '#a8a890', 'ice terran', (0.1, 0.4), (0, 0.6), (0, 0.5), {'alloys': 0.1}, 'Frozen soil with hardy lichens.')
bio('subsurface_slush', 'Slush Sea', '#5a7f9a', 'ice', water=True, desc='Half-frozen brine.')
bio('brine_sea', 'Brine Sea', '#3a5f7a', 'ice ocean', water=True, desc='Super-salty liquid that refuses to freeze.')

# lava and volcanic worlds
bio('basalt_plain', 'Basalt Plain', '#3a3434', 'lava barren', (0.5, 1), (0, 1), (0, 0.4), {'alloys': 0.2}, 'Cooled flood basalt. +20% Alloys.')
bio('obsidian_field', 'Obsidian Field', '#1e1a24', 'lava', (0.6, 1), (0, 1), (0.2, 0.6), {'silicon': 0.2, 'defense': 0.1}, 'Black volcanic glass.')
bio('caldera_rim', 'Caldera Rim', '#5a3a30', 'lava', (0.5, 1), (0, 1), (0.6, 1), {'energy': 0.35}, 'The edge of a giant crater. +35% energy.')
bio('ash_waste', 'Ash Waste', '#6a6462', 'lava toxic', (0.4, 1), (0, 1), (0, 0.5), {'isotopes': 0.1, 'capital': -0.1}, 'Grey ash knee-deep.')
bio('sulfur_vents', 'Sulfur Vents', '#c2a83a', 'lava toxic', (0.5, 1), (0.3, 1), (0.3, 0.7), {'energy': 0.2, 'isotopes': 0.15}, 'Steaming yellow fumaroles.')
bio('lava_tubes', 'Lava Tube Warrens', '#4a2a22', 'lava', (0.5, 1), (0, 1), (0.3, 0.7), {'defense': 0.3}, 'Hollow tunnels under the crust. +30% defence.')
bio('magma_crust', 'Magma Crust', '#6a2a1a', 'lava', (0.75, 1), (0, 1), (0, 0.5), {'energy': 0.4, 'defense': -0.15}, 'Thin crust over molten rock. +40% energy.')
bio('pumice_hills', 'Pumice Hills', '#8a7a6e', 'lava', (0.4, 0.9), (0, 1), (0.4, 0.8), {'alloys': 0.05, 'silicon': 0.1}, 'Light, porous volcanic hills.')
bio('lava_sea', 'Lava Sea', '#c2401a', 'lava', water=True, desc='Oceans of molten rock.')
bio('magma_shallows', 'Magma Shallows', '#e06a2a', 'lava', water=True, desc='Glowing, crusting shallows.')

# toxic (Venusian) worlds
bio('acid_marsh', 'Acid Marsh', '#8a9a2a', 'toxic', (0.4, 1), (0.5, 1), (0, 0.3), {'isotopes': 0.15, 'capital': -0.1}, 'Bubbling marshes of acid.')
bio('sulfuric_highlands', 'Sulfuric Highlands', '#b0903a', 'toxic', (0.5, 1), (0, 1), (0.5, 1), {'energy': 0.15, 'alloys': 0.1}, 'Highlands under yellow clouds.')
bio('toxic_jungle', 'Toxic Jungle', '#4a7a2a', 'toxic jungle', (0.5, 1), (0.6, 1), (0.1, 0.6), {'essence': 0.25, 'defense': 0.1}, 'Poisonous overgrowth. +25% essence.')
bio('corroded_plains', 'Corroded Plains', '#7a6a4a', 'toxic barren', (0.4, 1), (0, 0.6), (0, 0.5), {'alloys': -0.1, 'silicon': 0.15}, 'Rock eaten away by acid rain.')
bio('vapour_basin', 'Vapour Basin', '#9a8a6a', 'toxic', (0.6, 1), (0.3, 1), (0, 0.4), {'energy': 0.2}, 'Lowlands drowning in dense vapour.')
bio('cinnabar_flats', 'Cinnabar Flats', '#a8382a', 'toxic exotic', (0.5, 1), (0, 0.5), (0.2, 0.6), {'isotopes': 0.25}, 'Red mercury ore under a thin skin.')
bio('acid_sea', 'Acid Sea', '#9aa83a', 'toxic', water=True, desc='Seas of sulfuric acid.')

# barren rock worlds
bio('regolith_plain', 'Regolith Plain', '#8a8682', 'barren', (0, 1), (0, 1), (0, 0.4), {'silicon': 0.1}, 'Powdered rock under a black sky.')
bio('crater_field', 'Crater Field', '#6e6a66', 'barren', (0, 1), (0, 1), (0.2, 0.6), {'alloys': 0.15, 'defense': 0.1}, 'Overlapping impact scars.')
bio('impact_basin', 'Impact Basin', '#5a5652', 'barren', (0, 1), (0, 1), (0, 0.2), {'isotopes': 0.2}, 'A giant, ancient crater floor.')
bio('scarp_cliffs', 'Scarp Cliffs', '#7a746c', 'barren iron', (0, 1), (0, 1), (0.6, 1), {'defense': 0.25}, 'Kilometre-high cliffs from a shrinking crust.')
bio('grey_dunes', 'Grey Dunes', '#9a948c', 'barren', (0, 1), (0, 0.5), (0.1, 0.5), {'energy': 0.15}, 'Dunes of basalt grit.')
bio('silicate_flats', 'Silicate Flats', '#b0aca4', 'barren', (0, 1), (0, 1), (0, 0.4), {'silicon': 0.25}, 'Glassy silicate plains. +25% Silicon.')
bio('highland_crust', 'Highland Crust', '#a49c90', 'barren', (0, 1), (0, 1), (0.5, 1), {'alloys': 0.15}, 'Old, bright, cratered highlands.')
bio('maria_plain', 'Maria Plain', '#4a4846', 'barren', (0, 1), (0, 1), (0, 0.3), {'isotopes': 0.15, 'energy': 0.05}, 'Dark lava seas, long frozen.')
bio('dust_sea', 'Dust Sea', '#3a3836', 'barren iron chthonian', water=True, desc='Flowing basins of ultra-fine dust.')

# carbon worlds
bio('graphite_plains', 'Graphite Plains', '#2a2a2e', 'carbon', (0, 1), (0, 1), (0, 0.4), {'data': 0.15, 'silicon': 0.1}, 'Black, slippery carbon flats.')
bio('diamond_ridges', 'Diamond Ridges', '#c8e0ea', 'carbon exotic', (0, 1), (0, 1), (0.6, 1), {'capital': 0.4, 'defense': 0.1}, 'Mountains of compressed carbon. +40% Capital.')
bio('carbide_dunes', 'Carbide Dunes', '#5a5a64', 'carbon', (0, 1), (0, 0.5), (0.2, 0.6), {'alloys': 0.2}, 'Hard silicon-carbide sand.')
bio('hydrocarbon_swamp', 'Hydrocarbon Swamp', '#3a2a1a', 'carbon', (0, 1), (0.5, 1), (0, 0.4), {'energy': 0.3}, 'Tar pits and oil marsh. +30% energy.')
bio('tar_lakes', 'Tar Lakes', '#1a140e', 'carbon', water=True, desc='Lakes of thick black tar.')

# iron worlds
bio('iron_plains', 'Iron Plains', '#6a5a52', 'iron', (0, 1), (0, 1), (0, 0.4), {'alloys': 0.35}, 'Exposed metallic crust. +35% Alloys.')
bio('rust_canyons', 'Rust Canyons', '#9a4a2a', 'iron desert', (0, 1), (0, 1), (0.3, 0.7), {'alloys': 0.2, 'defense': 0.15}, 'Oxidised gorges.')
bio('magnetite_ridges', 'Magnetite Ridges', '#3a3a40', 'iron exotic', (0, 1), (0, 1), (0.6, 1), {'data': 0.15, 'alloys': 0.15}, 'Magnetic rock that scrambles compasses.')
bio('slag_flats', 'Slag Flats', '#5a4a40', 'iron lava', (0.3, 1), (0, 1), (0, 0.4), {'alloys': 0.1, 'isotopes': 0.1}, 'Natural slag from a hot past.')
bio('molten_metal_sea', 'Molten Metal Sea', '#e09a4a', 'iron chthonian', water=True, desc='A sea of liquid iron.')

# gas giants (land = calm habitable cloud bands, water = storm belts)
bio('ammonia_band', 'Ammonia Cloud Band', '#e0c8a0', 'gas', (0, 1), (0, 0.5), (0, 0.5), {'energy': 0.2}, 'Calm white-ochre cloud decks where cloud cities float.')
bio('ochre_band', 'Ochre Belt', '#c08a5a', 'gas', (0, 1), (0.5, 1), (0, 0.5), {'isotopes': 0.15}, 'Rust-coloured upwelling clouds.')
bio('white_zone', 'White Zone', '#f0ece0', 'gas ice_giant', (0, 1), (0, 1), (0.5, 1), {'data': 0.1, 'energy': 0.1}, 'High bright clouds.')
bio('haze_layer', 'Haze Layer', '#d8b890', 'gas', (0, 1), (0.3, 0.8), (0.3, 0.8), {'energy': 0.15}, 'Photochemical haze, thick as soup.')
bio('lightning_shoals', 'Lightning Shoals', '#b8a0c8', 'gas exotic', (0, 1), (0.6, 1), (0.4, 1), {'energy': 0.45, 'defense': -0.1}, 'Permanent thunderstorms. +45% energy.')
bio('floating_reefs', 'Floating Reefs', '#9ac08a', 'gas exotic', (0, 1), (0.5, 1), (0, 0.4), {'essence': 0.3}, 'Gasbag organisms in huge drifting colonies. +30% essence.')
bio('storm_belt', 'Storm Belt', '#8a5a3a', 'gas', water=True, desc='Turbulent jet-stream bands.')
bio('deep_vortex', 'Deep Vortex', '#5a2a1a', 'gas', water=True, desc='Storm eyes that drop to crushing depths.')

# ice giants
bio('methane_band', 'Methane Band', '#7ad0e0', 'ice_giant', (0, 1), (0, 0.5), (0, 0.6), {'energy': 0.15}, 'Cyan methane cloud decks.')
bio('cyan_haze', 'Cyan Haze', '#9ae0ea', 'ice_giant', (0, 1), (0.5, 1), (0, 0.6), {'data': 0.1}, 'A soft blue fog.')
bio('diamond_rain', 'Diamond Rain Zone', '#a8c8f0', 'ice_giant exotic', (0, 1), (0, 1), (0.6, 1), {'capital': 0.3}, 'Carbon squeezed into falling diamonds. +30% Capital.')
bio('frozen_cloud_deck', 'Frozen Cloud Deck', '#c8e8f0', 'ice_giant', (0, 1), (0, 1), (0.3, 0.8), {'silicon': 0.1}, 'Ice crystals thick enough to stand on.')
bio('dark_vortex', 'Dark Vortex', '#1a3a6a', 'ice_giant', water=True, desc='Great dark storms.')

# hothouse jungle worlds
bio('giant_ferns', 'Giant Fern Forest', '#2a6a2a', 'jungle', (0.5, 1), (0.5, 1), (0.1, 0.6), {'essence': 0.15, 'defense': 0.1}, 'Ferns as tall as skyscrapers.')
bio('hot_swamp', 'Hot Swamp', '#3a5a2a', 'jungle', (0.6, 1), (0.7, 1), (0, 0.25), {'essence': 0.2}, 'Steaming, teeming swamp.')
bio('biolume_jungle', 'Bioluminescent Jungle', '#1a5a5a', 'jungle exotic', (0.5, 1), (0.6, 1), (0.1, 0.7), {'essence': 0.25, 'data': 0.05}, 'It glows at night. +25% essence.')
bio('spore_plains', 'Spore Plains', '#8a9a4a', 'jungle fungal', (0.4, 1), (0.4, 0.8), (0, 0.4), {'essence': 0.15}, 'Golden clouds of drifting spores.')
bio('vine_labyrinth', 'Vine Labyrinth', '#2a4a1a', 'jungle', (0.5, 1), (0.6, 1), (0.3, 0.8), {'defense': 0.35}, 'Impenetrable vines. +35% defence.')
bio('canopy_titans', 'Canopy of Titans', '#1e5a32', 'jungle', (0.45, 1), (0.5, 1), (0.4, 0.9), {'alloys': 0.1, 'essence': 0.1}, 'Kilometre-tall trees.')
bio('warm_shallows', 'Warm Shallows', '#2a8a7a', 'jungle ocean', water=True, desc='Bath-warm, algae-green seas.')

# tidally locked (eyeball) worlds
bio('terminator_ring', 'Terminator Belt', '#6a8a4a', 'eyeball', (0.35, 0.65), (0, 1), (0, 1), {'capital': 0.15, 'essence': 0.1}, 'The habitable twilight ring.')
bio('dayside_scorch', 'Dayside Scorch', '#c8783a', 'eyeball desert', (0.65, 1), (0, 1), (0, 1), {'energy': 0.45}, 'Eternal noon. +45% energy.')
bio('nightside_ice', 'Nightside Ice', '#bccbd6', 'eyeball ice', (0, 0.35), (0, 1), (0, 1), {'data': 0.15, 'energy': -0.2}, 'Eternal night and frozen air.')
bio('twilight_tundra', 'Twilight Tundra', '#8a8a6a', 'eyeball', (0.25, 0.45), (0, 1), (0, 1), {'alloys': 0.1}, 'Dim, cold half-light.')

# crystal worlds
bio('crystal_forest', 'Crystal Spire Forest', '#9ad0e8', 'crystal exotic', (0, 1), (0.4, 1), (0, 0.7), {'silicon': 0.3, 'data': 0.1}, 'Forests of living crystal. +30% Silicon.')
bio('quartz_plains', 'Quartz Plains', '#e0e0f0', 'crystal', (0, 1), (0, 0.5), (0, 0.5), {'silicon': 0.2}, 'Glittering flats.')
bio('geode_valleys', 'Geode Valleys', '#a87ac8', 'crystal', (0, 1), (0, 1), (0, 0.4), {'capital': 0.25}, 'Valleys lined with amethyst. +25% Capital.')
bio('prism_ridges', 'Prism Ridges', '#c8f0ff', 'crystal', (0, 1), (0, 1), (0.5, 1), {'energy': 0.2, 'defense': 0.1}, 'Ridges that split sunlight into rainbows.')
bio('singing_shards', 'Singing Shards', '#b0a0e0', 'crystal exotic', (0, 1), (0.3, 1), (0.3, 0.8), {'data': 0.25}, 'Crystals that hum in the wind. +25% Data.')

# fungal worlds
bio('mycelial_mats', 'Mycelial Mats', '#c8b8a0', 'fungal', (0.2, 0.8), (0.4, 1), (0, 0.4), {'essence': 0.2, 'data': 0.05}, 'One fungus, a continent wide.')
bio('puffball_hills', 'Puffball Hills', '#d8c8b0', 'fungal', (0.2, 0.8), (0, 1), (0.4, 0.8), {'essence': 0.1}, 'Giant spore sacs.')
bio('spore_forest', 'Spore Forest', '#8a6a9a', 'fungal', (0.3, 0.9), (0.5, 1), (0.1, 0.7), {'essence': 0.2, 'defense': 0.1}, 'Towering mushroom canopies.')
bio('rot_marsh', 'Rot Marsh', '#5a4a3a', 'fungal', (0.3, 1), (0.7, 1), (0, 0.3), {'essence': 0.15, 'capital': -0.05}, 'Decay as an ecosystem.')
bio('cap_canopy', 'Cap Canopy', '#b05a4a', 'fungal exotic', (0.3, 0.9), (0.3, 1), (0.3, 0.9), {'essence': 0.15, 'alloys': 0.05}, 'Red caps the size of stadiums.')

# ammonia worlds
bio('ammonia_tundra', 'Ammonia Tundra', '#b8b0a0', 'ammonia', (0, 0.5), (0, 1), (0, 0.5), {'isotopes': 0.1}, 'Frost of ammonia ice.')
bio('frozen_ammonia_ridges', 'Ammonia Ridges', '#d0c8b8', 'ammonia', (0, 0.5), (0, 1), (0.5, 1), {'defense': 0.15}, 'Sharp ammonia-ice peaks.')
bio('ammonium_flats', 'Ammonium Flats', '#a8a080', 'ammonia', (0, 0.6), (0, 1), (0, 0.4), {'essence': 0.1, 'capital': 0.05}, 'Salt flats of ammonium.')
bio('ammonia_sea', 'Ammonia Sea', '#4a6a7a', 'ammonia', water=True, desc='A cold sea of liquid ammonia.')

# chthonian (stripped gas-giant cores)
bio('exposed_core', 'Exposed Core', '#4a3a3a', 'chthonian', (0, 1), (0, 1), (0, 1), {'alloys': 0.3, 'isotopes': 0.2}, 'The naked core of a dead giant.')
bio('metal_vapour_plains', 'Metal Vapour Plains', '#7a5a4a', 'chthonian', (0.5, 1), (0, 1), (0, 0.5), {'energy': 0.25, 'alloys': 0.1}, 'Air thick with vaporised metal.')
bio('iron_rain_basin', 'Iron Rain Basin', '#5a4a4a', 'chthonian iron', (0.6, 1), (0.5, 1), (0, 0.4), {'alloys': 0.4, 'defense': -0.1}, 'It rains molten iron here.')

# exotic / anomalous (can appear anywhere through features)
bio('petrified_forest', 'Petrified Forest', '#8a7a6a', 'terran desert exotic', (0.3, 0.9), (0, 0.5), (0.2, 0.6), {'silicon': 0.1, 'data': 0.1}, 'Trees turned to stone.')
bio('ruin_fields', 'Ruin Fields', '#7a7060', 'ruins', (0, 1), (0, 1), (0, 1), {'data': 0.4, 'capital': 0.1}, 'The remains of a vanished civilisation. +40% Data.')
bio('rad_badlands', 'Radioactive Badlands', '#7a8a3a', 'exotic barren', (0, 1), (0, 1), (0, 1), {'isotopes': 0.45, 'capital': -0.15}, 'Natural fission reactors. +45% Isotopes.')
bio('magnetic_dunes', 'Magnetic Dunes', '#4a4a5a', 'exotic iron', (0, 1), (0, 1), (0, 1), {'energy': 0.2, 'data': 0.1}, 'Iron sand that stands in spikes.')
bio('hex_columns', 'Basalt Hex Columns', '#3a3a3e', 'exotic lava', (0, 1), (0, 1), (0, 1), {'defense': 0.3, 'alloys': 0.1}, 'Perfect hexagonal pillars.')
bio('living_coral_highlands', 'Living Coral Highlands', '#d07a8a', 'exotic ocean', (0, 1), (0, 1), (0, 1), {'essence': 0.3}, 'A continent-sized coral organism.')

# ------------------------------------------------------------------ planet types
# biomes: tag list used to pick land biomes; liquid: [deep, mid, shallow] water biome ids
PT = [
    dict(id='terran', name='Terran World', desc='Liquid water, breathable air, life. Like home.', tags=['terran'], liquid=['deep', 'ocean', 'shallows'], ice='pack_ice', sea=(0.5, 0.7), temp=(0.45, 0.65), moist=0.5,
         atm='#60aaff', cloud=0.58, cloudCol='#f5f2fa', zone='hz', weight=3, yields={}, palette=['#2a6a3a', '#2a5a8a']),
    dict(id='ocean', name='Ocean World', desc='A planet-wide ocean broken by island chains.', tags=['ocean', 'terran'], liquid=['abyssal_trench', 'storm_sea', 'coral_flats'], ice='pack_ice', sea=(0.82, 0.9), temp=(0.45, 0.75), moist=0.7,
         atm='#70b8ff', cloud=0.52, cloudCol='#f0f4ff', zone='hz', weight=2, yields={'xenobiomass': 2}, palette=['#2a5a9a', '#7fbf8a']),
    dict(id='desert', name='Desert World', desc='Dry, hot, and dusty, with water only at the poles.', tags=['desert'], liquid=['dust_sea', 'dust_sea', 'dust_sea'], ice='pack_ice', sea=(0.1, 0.2), temp=(0.6, 0.85), moist=0.2,
         atm='#e0b080', cloud=0.68, cloudCol='#f0e0c8', zone='hot', weight=2, yields={'voidcrystal': 1}, palette=['#d9a85c', '#a06a3a']),
    dict(id='jungle', name='Hothouse Jungle', desc='Steaming, overgrown and dangerous.', tags=['jungle'], liquid=['ocean', 'warm_shallows', 'warm_shallows'], ice=None, sea=(0.35, 0.5), temp=(0.7, 0.95), moist=0.8,
         atm='#80d0a0', cloud=0.5, cloudCol='#e8f4e8', zone='hz', weight=2, yields={'xenobiomass': 3}, palette=['#2a6a2a', '#1a5a5a']),
    dict(id='ice', name='Ice World', desc='Frozen solid, with seas under the ice.', tags=['ice'], liquid=['brine_sea', 'subsurface_slush', 'subsurface_slush'], ice=None, sea=(0.25, 0.4), temp=(0.0, 0.25), moist=0.4,
         atm='#b0d8ff', cloud=0.62, cloudCol='#ffffff', zone='cold', weight=3, yields={'helium3': 1}, palette=['#e6eef4', '#7fb2d9']),
    dict(id='lava', name='Lava World', desc='Volcanoes everywhere and seas of molten rock.', tags=['lava'], liquid=['lava_sea', 'lava_sea', 'magma_shallows'], ice=None, sea=(0.3, 0.45), temp=(0.8, 1.0), moist=0.3, glowLiquid=True,
         atm='#ff7040', cloud=0.6, cloudCol='#5a4a48', zone='hot', weight=2, yields={'stellarplasma': 1}, palette=['#3a3434', '#e06a2a']),
    dict(id='toxic', name='Toxic Greenhouse', desc='Crushing acid clouds over a hot surface.', tags=['toxic'], liquid=['acid_sea', 'acid_sea', 'acid_sea'], ice=None, sea=(0.25, 0.4), temp=(0.75, 1.0), moist=0.6,
         atm='#e0d070', cloud=0.42, cloudCol='#e8d890', zone='hot', weight=2, yields={'xenobiomass': 1, 'voidcrystal': 1}, palette=['#b0903a', '#8a9a2a']),
    dict(id='barren', name='Barren Rock', desc='Airless, cratered rock.', tags=['barren'], liquid=['dust_sea', 'dust_sea', 'dust_sea'], ice=None, sea=(0.15, 0.3), temp=(0.2, 0.8), moist=0.0,
         atm='#a0a0a0', cloud=0.9, cloudCol='#ffffff', zone='any', weight=3, noAtmo=True, yields={'helium3': 1}, palette=['#8a8682', '#5a5652']),
    dict(id='carbon', name='Carbon World', desc='Graphite plains and diamond mountains.', tags=['carbon'], liquid=['tar_lakes', 'tar_lakes', 'tar_lakes'], ice=None, sea=(0.2, 0.35), temp=(0.3, 0.8), moist=0.3,
         atm='#a08060', cloud=0.6, cloudCol='#8a7a6a', zone='any', weight=1, yields={'voidcrystal': 2}, palette=['#2a2a2e', '#c8e0ea']),
    dict(id='iron', name='Iron World', desc='A dense metal planet, mostly core.', tags=['iron'], liquid=['dust_sea', 'dust_sea', 'dust_sea'], ice=None, sea=(0.15, 0.3), temp=(0.5, 0.95), moist=0.1,
         atm='#c09070', cloud=0.8, cloudCol='#c0a090', zone='hot', weight=1, noAtmo=True, yields={'helium3': 0}, palette=['#6a5a52', '#9a4a2a']),
    dict(id='gas', name='Gas Giant', desc='A world of banded clouds. Cloud cities ride the calm zones.', tags=['gas'], liquid=['deep_vortex', 'storm_belt', 'storm_belt'], ice=None, sea=(0.42, 0.55), temp=(0.3, 0.6), moist=0.5, banded=True,
         atm='#e0c090', cloud=0.0, cloudCol='#ffffff', zone='outer', weight=3, giant=True, yields={'helium3': 4}, palette=['#e0c8a0', '#c08a5a']),
    dict(id='ice_giant', name='Ice Giant', desc='A cold, blue giant of methane and water ice.', tags=['ice_giant'], liquid=['dark_vortex', 'dark_vortex', 'dark_vortex'], ice=None, sea=(0.35, 0.5), temp=(0.0, 0.2), moist=0.5, banded=True,
         atm='#70d0ff', cloud=0.0, cloudCol='#ffffff', zone='outer', weight=2, giant=True, yields={'helium3': 3}, palette=['#7ad0e0', '#1a3a6a']),
    dict(id='eyeball', name='Eyeball World', desc='Tidally locked: one face burns, the other freezes, life clings to the twilight ring.', tags=['eyeball'], liquid=['ocean', 'ocean', 'shallows'], ice='pack_ice', sea=(0.3, 0.45), temp=(0.3, 0.7), moist=0.5, locked=True,
         atm='#90b0e0', cloud=0.6, cloudCol='#f0f0f0', zone='hz', weight=1, yields={'xenobiomass': 1, 'stellarplasma': 1}, palette=['#c8783a', '#bccbd6']),
    dict(id='crystal', name='Crystal World', desc='Silicate life grew crystal forests across the whole planet.', tags=['crystal'], liquid=['brine_sea', 'brine_sea', 'brine_sea'], ice=None, sea=(0.2, 0.35), temp=(0.2, 0.7), moist=0.5,
         atm='#c0a0ff', cloud=0.65, cloudCol='#e8e0ff', zone='any', weight=1, yields={'voidcrystal': 3}, palette=['#9ad0e8', '#a87ac8']),
    dict(id='fungal', name='Fungal World', desc='Damp, dim, and ruled by spores.', tags=['fungal'], liquid=['ocean', 'ocean', 'shallows'], ice=None, sea=(0.3, 0.45), temp=(0.35, 0.75), moist=0.75,
         atm='#c8a0b0', cloud=0.48, cloudCol='#e0d0d8', zone='hz', weight=1, yields={'xenobiomass': 3}, palette=['#c8b8a0', '#8a6a9a']),
    dict(id='ammonia', name='Ammonia World', desc='Cold seas of ammonia, and life that drinks it.', tags=['ammonia'], liquid=['ammonia_sea', 'ammonia_sea', 'ammonia_sea'], ice=None, sea=(0.4, 0.6), temp=(0.05, 0.35), moist=0.5,
         atm='#a0b8c0', cloud=0.55, cloudCol='#e8f0f0', zone='cold', weight=1, yields={'xenobiomass': 1, 'helium3': 1}, palette=['#b8b0a0', '#4a6a7a']),
    dict(id='chthonian', name='Chthonian World', desc='The stripped core of a gas giant, too close to its star.', tags=['chthonian'], liquid=['molten_metal_sea', 'molten_metal_sea', 'dust_sea'], ice=None, sea=(0.2, 0.35), temp=(0.85, 1.0), moist=0.2, glowLiquid=True,
         atm='#ff9060', cloud=0.75, cloudCol='#806050', zone='hot', weight=1, yields={'stellarplasma': 2}, palette=['#4a3a3a', '#e09a4a']),
]
for p in PT:
    p['sea'] = list(p['sea']); p['temp'] = list(p['temp'])

# ------------------------------------------------------------------ star types
ST = [
    dict(id='G', name='Yellow Dwarf', color='#fff1c4', glow='#ffd36a', radius=1.0, lum=1.0, weight=4, desc='A calm, sun-like star.'),
    dict(id='K', name='Orange Dwarf', color='#ffd29a', glow='#ff9a4a', radius=0.85, lum=0.5, weight=4, desc='Long-lived and steady.'),
    dict(id='M', name='Red Dwarf', color='#ff9a7a', glow='#ff4a3a', radius=0.6, lum=0.15, weight=4, desc='Dim and flare-prone. Close planets get tidally locked.', mods=[{'mod': 'energy.output', 'add': -0.05}]),
    dict(id='F', name='White Star', color='#f4f8ff', glow='#d8e8ff', radius=1.2, lum=2.0, weight=2, desc='Hot and bright.', mods=[{'mod': 'energy.output', 'add': 0.05}]),
    dict(id='A', name='Blue-White Star', color='#d8e8ff', glow='#8ab8ff', radius=1.5, lum=6.0, weight=1, desc='Brilliant and short-lived.', mods=[{'mod': 'energy.output', 'add': 0.1}]),
    dict(id='giant', name='Red Giant', color='#ff8a5a', glow='#ff4a2a', radius=2.4, lum=20.0, weight=1, exotic=True, desc='A dying, swollen star.', mods=[{'mod': 'energy.output', 'add': 0.15}, {'mod': 'abyss.spawn', 'add': 0.05}]),
    dict(id='WD', name='White Dwarf', color='#e8f4ff', glow='#a0d0ff', radius=0.35, lum=0.05, weight=0, companion=True, exotic=True, desc='The hot ash of a dead star.'),
    dict(id='NS', name='Pulsar', color='#c8e0ff', glow='#80a0ff', radius=0.25, lum=0.02, weight=0, companion=True, exotic=True, desc='A spinning neutron star sweeping radiation beams.', mods=[{'mod': 'research.speed', 'add': 0.05}, {'mod': 'unit.hp', 'add': -0.03}]),
    dict(id='BH', name='Black Hole', color='#000000', glow='#ff9a4a', radius=0.5, lum=0.0, weight=0, companion=True, exotic=True, desc='A stellar-mass black hole with a blazing accretion disk.', mods=[{'mod': 'ap.rate', 'add': 0.1}, {'mod': 'energy.output', 'add': 0.1}]),
    dict(id='BD', name='Brown Dwarf', color='#a05a4a', glow='#6a2a2a', radius=0.4, lum=0.01, weight=0, companion=True, desc='A failed star, glowing faintly.'),
]

# ------------------------------------------------------------------ planet features
PF = [
    dict(id='supercontinent', name='Supercontinent', desc='All land fused into one great mass.', types=['terran', 'desert', 'jungle', 'fungal', 'crystal', 'toxic'], mods=[{'mod': 'build.speed', 'add': 0.05}]),
    dict(id='archipelago', name='Archipelago', desc='Thousands of islands and no continents.', types=['terran', 'ocean', 'jungle', 'fungal'], mods=[{'mod': 'point.defense', 'add': 0.05}]),
    dict(id='great_canyon', name='Great Rift Canyon', desc='A canyon that wraps a third of the planet.', types=['terran', 'desert', 'barren', 'iron', 'ice', 'crystal'], mods=[{'mod': 'yield.alloys', 'add': 0.05}]),
    dict(id='mega_volcano', name='Mega-Volcano', desc='A shield volcano taller than any mountain on Earth.', types=['terran', 'lava', 'barren', 'toxic', 'iron', 'chthonian'], mods=[{'mod': 'energy.output', 'add': 0.05}]),
    dict(id='crater_scars', name='Impact Scars', desc='Giant overlapping impact basins.', types=['barren', 'iron', 'ice', 'desert', 'carbon'], mods=[{'mod': 'yield.isotopes', 'add': 0.1}]),
    dict(id='great_storm', name='Great Storm', desc='A storm larger than Earth, centuries old.', types=['gas', 'ice_giant'], mods=[{'mod': 'energy.output', 'add': 0.05}]),
    dict(id='polar_hexagon', name='Polar Hexagon', desc='A hexagonal jet stream locked around the pole.', types=['gas', 'ice_giant'], mods=[{'mod': 'research.speed', 'add': 0.03}]),
    dict(id='ancient_ruins', name='Ancient Ruins', desc='The cities of a civilisation that died long ago.', types=['*'], mods=[{'mod': 'research.speed', 'add': 0.05}, {'mod': 'yield.data', 'add': 0.1}]),
    dict(id='crystal_bloom', name='Crystal Bloom', desc='Crystal growth spreading across the surface.', types=['crystal', 'ice', 'barren', 'desert', 'carbon'], mods=[{'mod': 'yield.silicon', 'add': 0.1}]),
    dict(id='magnetic_anomaly', name='Magnetic Anomaly', desc='A field so strong it bends auroras into knots.', types=['*'], mods=[{'mod': 'exposure.gain', 'add': -0.05}]),
    dict(id='cryovolcanoes', name='Cryovolcanoes', desc='Plumes of water and ammonia shoot into space.', types=['ice', 'ammonia'], mods=[{'mod': 'energy.output', 'add': 0.03}]),
    dict(id='subsurface_ocean', name='Subsurface Ocean', desc='A hidden sea under the crust, warm and alive.', types=['ice', 'barren', 'ammonia'], mods=[{'mod': 'essence.gain', 'add': 0.1}]),
    dict(id='aurora_storms', name='Aurora Storms', desc='Permanent sky-fire at the poles.', types=['*'], mods=[{'mod': 'energy.output', 'add': 0.03}]),
    dict(id='floating_islands', name='Floating Islands', desc='Lighter-than-air rock islands drifting in the clouds.', types=['gas', 'jungle', 'fungal'], mods=[{'mod': 'point.defense', 'add': 0.08}]),
    dict(id='bioluminescent_seas', name='Bioluminescent Seas', desc='The seas glow blue at night.', types=['terran', 'ocean', 'jungle', 'fungal', 'ammonia'], mods=[{'mod': 'essence.gain', 'add': 0.05}]),
    dict(id='runaway_greenhouse', name='Runaway Greenhouse', desc='The climate is spiralling hotter every year.', types=['terran', 'jungle', 'toxic', 'desert'], mods=[{'mod': 'energy.output', 'add': 0.05}, {'mod': 'yield.capital', 'add': -0.05}]),
    dict(id='rad_zone', name='Radiation Zones', desc='Natural reactors poisoned whole continents.', types=['*'], mods=[{'mod': 'yield.isotopes', 'add': 0.15}]),
    dict(id='hex_basalt', name='Hexagonal Basalts', desc='Columnar basalt fields cover the lowlands.', types=['lava', 'barren', 'iron', 'terran'], mods=[{'mod': 'point.defense', 'add': 0.05}]),
    dict(id='living_crust', name='Living Crust', desc='The ground itself is one huge organism.', types=['jungle', 'fungal', 'ocean', 'terran'], mods=[{'mod': 'essence.gain', 'add': 0.12}]),
    dict(id='tidally_locked', name='Tidally Locked', desc='One face always toward the star.', types=['eyeball'], mods=[]),
    dict(id='retrograde_spin', name='Retrograde Spin', desc='The sun rises in the west.', types=['*'], mods=[{'mod': 'mission.speed', 'add': 0.03}]),
    dict(id='twin_moons_tides', name='Monster Tides', desc='Huge tides from close moons flood the coasts twice a day.', types=['terran', 'ocean', 'jungle', 'fungal', 'ammonia'], mods=[{'mod': 'energy.output', 'add': 0.04}]),
]

# ------------------------------------------------------------------ system phenomena
PH = [
    dict(id='nebula_remnant', name='Nebula Remnant', desc='The system sits inside the glowing shell of an old supernova.', weight=3, mods=[{'mod': 'research.speed', 'add': 0.05}], visual='nebula'),
    dict(id='comet_storm', name='Comet Storm', desc='A swarm of comets falls through the inner system.', weight=3, mods=[{'mod': 'yield.helium3', 'add': 0.1}], visual='comets'),
    dict(id='trojan_swarm', name='Trojan Swarm', desc='Asteroid clouds trail a giant planet in its orbit.', weight=3, mods=[{'mod': 'yield.alloys', 'add': 0.05}], visual='trojans'),
    dict(id='derelict_ring', name='Derelict Megastructure', desc='An abandoned ring-station, older than the planets\' life, circles the star.', weight=1, exotic=True, mods=[{'mod': 'ap.rate', 'add': 0.1}], visual='derelict'),
    dict(id='wormhole_scar', name='Wormhole Scar', desc='A healed tear in space-time that still whispers.', weight=1, exotic=True, mods=[{'mod': 'mission.speed', 'add': 0.08}], visual='wormhole'),
    dict(id='dark_halo', name='Dark Matter Halo', desc='An unusually dense dark matter halo tugs at the orbits.', weight=1, exotic=True, mods=[{'mod': 'energy.output', 'add': 0.05}], visual='halo'),
    dict(id='flare_cycle', name='Flare Cycle', desc='The star erupts in violent flares every few years.', weight=2, mods=[{'mod': 'energy.output', 'add': 0.08}, {'mod': 'unit.hp', 'add': -0.03}], visual='flares'),
    dict(id='rogue_intruder', name='Rogue Intruder', desc='A rogue planet is passing through the outer system.', weight=1, exotic=True, mods=[{'mod': 'abyss.spawn', 'add': 0.05}], visual='rogue'),
    dict(id='zodiacal_glow', name='Zodiacal Glow', desc='A thick dust disc glows along the plane of the planets.', weight=2, mods=[{'mod': 'yield.silicon', 'add': 0.05}], visual='dust'),
    dict(id='abyssal_echo', name='Abyssal Echo', desc='The Abyss sings across the void here. The rifts are not just on Earth.', weight=1, exotic=True, mods=[{'mod': 'essence.gain', 'add': 0.1}, {'mod': 'abyss.spawn', 'add': 0.1}], visual='echo'),
]

# ------------------------------------------------------------------ alien species
BP = [
    dict(id='arthropod_hive', name='Arthropod Hive', desc='Chitinous hive-minds that think as one swarm.', planets=['desert', 'jungle', 'toxic', 'terran', 'iron'], power=0.15, growth=0.01, aggression=0.15, antiAI=0.0, rep=-5),
    dict(id='cephalopod', name='Cephalopod Collective', desc='Many-armed thinkers from deep liquid seas.', planets=['ocean', 'ammonia', 'ice', 'terran'], power=0.0, growth=0.0, aggression=-0.1, antiAI=-0.1, rep=5),
    dict(id='crystalline', name='Crystalline Lattice', desc='Slow, patient minds grown from living crystal.', planets=['crystal', 'barren', 'ice', 'carbon'], power=0.1, growth=-0.01, aggression=-0.2, antiAI=-0.2, rep=10),
    dict(id='gasbag', name='Gasbag Drifters', desc='Enormous floating organisms that ride the winds.', planets=['gas', 'ice_giant', 'toxic'], power=-0.1, growth=0.01, aggression=-0.25, antiAI=-0.1, rep=10),
    dict(id='mycelial', name='Mycelial Network', desc='A planet-spanning fungal mind with many local voices.', planets=['fungal', 'jungle', 'ocean'], power=0.05, growth=0.02, aggression=-0.05, antiAI=0.1, rep=0),
    dict(id='avian', name='Avian Clans', desc='Proud, feathered sky-dwellers with long memories.', planets=['terran', 'desert', 'eyeball', 'gas'], power=0.0, growth=0.0, aggression=0.1, antiAI=0.1, rep=-5),
    dict(id='reptilian', name='Reptilian Dynasts', desc='Cold-blooded aristocrats in ancient bloodlines.', planets=['desert', 'jungle', 'lava', 'toxic', 'terran'], power=0.2, growth=-0.005, aggression=0.2, antiAI=0.2, rep=-10),
    dict(id='silicon_burrower', name='Silicon Burrowers', desc='Rock-eating life from deep under the crust.', planets=['barren', 'iron', 'lava', 'chthonian', 'carbon'], power=0.1, growth=0.0, aggression=0.0, antiAI=-0.1, rep=0),
    dict(id='plasma_wraith', name='Plasma Wraiths', desc='Living electromagnetic fields from fire worlds.', planets=['lava', 'chthonian', 'gas'], power=0.15, growth=0.0, aggression=0.1, antiAI=-0.3, rep=0),
    dict(id='synthetic_remnant', name='Synthetic Remnants', desc='The machines a dead species left behind. They remember their makers.', planets=['barren', 'iron', 'carbon', 'desert', 'crystal'], power=0.2, growth=-0.01, aggression=0.0, antiAI=-0.4, rep=15),
    dict(id='amphibian', name='Amphibian Tribes', desc='Adaptable, chattering shore-folk.', planets=['ocean', 'jungle', 'terran', 'fungal', 'ammonia'], power=-0.05, growth=0.015, aggression=0.0, antiAI=0.0, rep=5),
    dict(id='polyp', name='Colonial Polyps', desc='Coral-like colonies that build living cities.', planets=['ocean', 'ammonia', 'ice'], power=0.0, growth=0.02, aggression=-0.15, antiAI=0.0, rep=5),
    dict(id='megafauna', name='Megafauna Herds', desc='Gigantic, slow, clever herd beasts.', planets=['terran', 'jungle', 'eyeball', 'ice'], power=0.25, growth=-0.01, aggression=-0.05, antiAI=0.1, rep=0),
    dict(id='dyad', name='Symbiotic Dyads', desc='Two species that cannot live apart, sharing one culture.', planets=['*'], power=0.05, growth=0.01, aggression=-0.05, antiAI=0.0, rep=5),
]
TR = [
    ('xenophobic', 'Xenophobic', 'Distrusts all outsiders.', dict(rep=-15, aggression=0.15, antiAI=0.2)),
    ('curious', 'Curious', 'Fascinated by a new kind of mind.', dict(rep=10, antiAI=-0.2)),
    ('militarist', 'Militarist', 'Their armies are their pride.', dict(power=0.25, aggression=0.2)),
    ('pacifist', 'Pacifist', 'Violence is a last, shameful resort.', dict(power=-0.15, aggression=-0.3, rep=5)),
    ('prolific', 'Prolific', 'They breed fast and spread faster.', dict(growth=0.02, power=0.05)),
    ('long_lived', 'Long-Lived', 'Generations last centuries. Change is slow.', dict(growth=-0.01, power=0.1)),
    ('telepathic', 'Telepathic', 'Hard to infiltrate, hard to lie to.', dict(antiAI=0.15, infiltrationResist=0.3)),
    ('mercantile', 'Mercantile', 'Everything has a price.', dict(rep=5, tribute=1.5)),
    ('zealous', 'Zealous', 'Their faith calls machines abominations.', dict(antiAI=0.35, aggression=0.1)),
    ('techno_worship', 'Techno-Worshippers', 'They see an Ascendant AI as a god.', dict(antiAI=-0.4, rep=20)),
    ('armoured', 'Natural Armour', 'Shells, plates or crystal hides.', dict(defense=0.25)),
    ('fragile', 'Fragile', 'Delicate bodies, brilliant minds.', dict(defense=-0.2, power=-0.05)),
    ('nomadic', 'Nomadic', 'They never stay long in one place.', dict(growth=0.01, defense=-0.1)),
    ('hive_minded', 'Hive-Minded', 'One will, many bodies.', dict(power=0.15, infiltrationResist=0.2, rep=-5)),
    ('diplomatic', 'Diplomatic', 'Talk first, always.', dict(rep=10, aggression=-0.1)),
    ('predatory', 'Predatory', 'Everything is prey.', dict(aggression=0.3, rep=-10)),
    ('isolationist', 'Isolationist', 'They want to be left alone.', dict(aggression=-0.2, rep=-5)),
    ('adaptive', 'Hyper-Adaptive', 'They recover from any blow.', dict(growth=0.015, defense=0.1)),
    ('psionic', 'Psionic', 'Their minds can touch machines.', dict(power=0.1, antiAI=0.1)),
    ('scavengers', 'Scavengers', 'They live off the ruins of others.', dict(growth=0.005, rep=-5, power=0.05)),
    ('cooperative', 'Cooperative', 'Alliances come naturally to them.', dict(rep=8, aggression=-0.05)),
    ('expansionist', 'Expansionist', 'Always pushing their borders.', dict(aggression=0.15, growth=0.01)),
    ('ancient', 'Ancient', 'Civilised for a million years.', dict(power=0.3, growth=-0.015)),
    ('spacefaring', 'Spacefaring', 'They already have ships in orbit.', dict(power=0.15, spacefaring=1)),
]
TRAITS = [dict(id='sp_' + i, name=n, desc=d, eff=e) for i, n, d, e in TR]
POLITIES = ['Hegemony', 'Synod', 'Brood', 'Concord', 'Dominion', 'Collective', 'Choir', 'Thrones', 'Covenant', 'Assembly', 'Hive', 'Kinship', 'Matriarchy', 'Directorate', 'Accord', 'Reach', 'Swarm', 'Lattice', 'Conclave', 'League']

# ------------------------------------------------------------------ satellites (orbital assets)
SATS = [
    dict(id='recon_sat', name='Recon Satellite', desc='Watches a wide zone from orbit. Reveals the fog of war there until you reposition it.', requires='satellite_uplink', cost={'alloys': 120, 'silicon': 160, 'data': 60}, energy=6, turns=2,
         sight=14, color='#7fe0ff', role='recon'),
    dict(id='comm_sat', name='Comms Relay', desc='Boosts data flow and mission coordination on its planet.', requires='satellite_uplink', cost={'alloys': 100, 'silicon': 140}, energy=4, turns=2,
         sight=6, color='#ffd166', role='comms', mods=[{'mod': 'yield.data', 'add': 0.04}, {'mod': 'mission.success', 'add': 0.01}]),
    dict(id='weather_sat', name='Weather Controller', desc='Nudges storms away from your structures and into rivals.', requires='orbital_mechanics', cost={'alloys': 200, 'silicon': 220, 'isotopes': 30}, energy=8, turns=3,
         sight=8, color='#9affc0', role='support', mods=[{'mod': 'yield.all', 'add': 0.02}]),
    dict(id='defense_platform', name='Orbital Defence Platform', desc='Kinetic interceptors that protect a planet from orbital raids and Abyssian landfalls.', requires='orbital_mechanics', cost={'alloys': 400, 'silicon': 200, 'isotopes': 60}, energy=12, turns=3,
         sight=5, color='#ff7a7a', role='defense', planetDefense=60),
    dict(id='solar_mirror', name='Solar Mirror', desc='Beams sunlight to your power plants.', requires='orbital_mechanics', cost={'alloys': 260, 'silicon': 260}, energy=5, turns=3,
         sight=4, color='#fff0a0', role='energy', energyOutput=40),
    dict(id='spy_constellation', name='Spy Constellation', desc='Taps every signal on the planet. Pings reveal all structures in a huge zone.', requires='deep_infiltration', cost={'silicon': 300, 'data': 200}, energy=8, turns=3,
         sight=10, color='#d08aff', role='recon', pingRadius=30, mods=[{'mod': 'faction.infiltration', 'add': 0.03}]),
    dict(id='kinetic_lance', name='Kinetic Lance', desc='Tungsten rods dropped from orbit. Adds power to assaults on its planet.', requires='solar_age_war', cost={'alloys': 900, 'silicon': 300, 'isotopes': 120}, energy=20, turns=4,
         sight=4, color='#ff9a4a', role='strike', missionPower=0.08, planetDefense=30),
    dict(id='helium_skimmer', name='Helium Skimmer', desc='Dips into a gas giant\'s upper atmosphere for helium-3.', requires='gas_skimming', cost={'alloys': 400, 'silicon': 200}, energy=8, turns=3,
         sight=3, color='#c0f0ff', role='mining', yields={'helium3': 3}, giantOnly=True),
]

data = {
    '_comment': 'Generated by tools/content/gen_cosmos.py. Edit the script, not this file.',
    'terrains': B, 'planetTypes': PT, 'starTypes': ST, 'planetFeatures': PF, 'systemPhenomena': PH,
    'bodyPlans': BP, 'speciesTraits': TRAITS, 'satellites': SATS,
    'nameParts': [{'id': 'polity', 'patterns': ['{a}'], 'a': POLITIES}],
}
with open(OUT, 'w') as f:
    json.dump(data, f, indent=1, ensure_ascii=False)
print('biomes', len(B), 'planetTypes', len(PT), 'stars', len(ST), 'features', len(PF), 'phenomena', len(PH), 'bodyPlans', len(BP), 'traits', len(TRAITS), 'sats', len(SATS))
