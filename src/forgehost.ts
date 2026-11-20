// v1b <- Genesis Forge. The Forge (js/forge) is reused as built: it runs on the legacy content
// loader and a few legacy helpers, and its "awaken" hands its setup to v1b instead of the old sim.
// Porting the Forge to TypeScript is on the M1/M3 list; until then this shim keeps it whole.
import '../js/core/util.js';
import '../js/core/packs.js';
import '../packs/bundle.js';
import '../js/engine/cosmos.js';
import '../js/engine/world.js';
import '../js/engine/sim.js';
import '../js/ui/wm.js';
import '../js/ui/shell.js';
import '../js/ui/create.js';
import '../js/forge/render.js';
import '../js/forge/forge.js';

const OV: any = (globalThis as any).OV;

export function hookForge(onAwaken: (setup: any, epithet: string, forge: unknown) => void, onMenu: () => void) {
  // the Forge builds a legacy state, saves it and starts it; v1b takes over at each step
  OV.newGame = (_db: unknown, setup: any) => ({ ai: { name: setup.name }, _setup: setup });
  OV.saveGame = () => {};
  OV.hasSave = () => false;
  let swallowModal = false;
  OV.startGame = (st: any) => { swallowModal = true; onAwaken(st._setup, st.ai.epithet || '', st.ai.forge); };
  const UI = OV.ui || (OV.ui = {});
  const baseModal = UI.modal;
  UI.modal = (html: string, opts?: unknown) => { if (swallowModal) { swallowModal = false; return; } return baseModal ? baseModal(html, opts) : undefined; };
  const forgeShow = OV.showScreen;
  OV.showScreen = (name: string) => { if (name === 'menu') return onMenu(); return forgeShow(name); };
}
