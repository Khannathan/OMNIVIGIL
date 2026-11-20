// OMNIVIGIL v1b "Ascendant" entry point (the v6 design-bible rebuild).
//   src/sim     deterministic simulation (worker), five resources, one cycle
//   src/render  one continuous globe (Three.js) with the HD Diorama art from src/art
//   src/ui      HUD, Directives, five docks, playback
import './forgehost';
import { hookForge } from './forgehost';
import './art/landart';
import { buildContent } from './sim/content';
import { App } from './ui/app';
import '../css/v1b.css';

const OV: any = (globalThis as any).OV;

async function boot() {
  const bootEl = document.getElementById('boot')!;
  try {
    OV.db = await OV.loadPacks();
  } catch (e) { bootEl.textContent = 'Failed to load content packs: ' + (e as Error).message; return; }
  const C = buildContent(OV.db);
  const app = new App(C);
  (window as any).v1b = app;
  hookForge((setup, epithet, forge) => { const s = app.setupFromForge(setup, epithet); s.forge = forge; app.start(s); }, () => app.menu());
  bootEl.hidden = true;
  await app.boot();
}
if (document.readyState === 'loading') window.addEventListener('DOMContentLoaded', boot); else boot();
