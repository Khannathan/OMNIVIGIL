// OMNIVIGIL v4 - boot and the render loop
(function (OV) {
  'use strict';
  OV.startGame = function (st) {
    OV.state = st;
    OV.attachRng(st);
    OV.recomputeMods(OV.db, st);
    OV.updateRegionOwners(st);
    const UI = OV.ui;
    UI.sel = null; UI.centered = false; UI.missionPlan = null; UI.mapMode = 'planet'; UI._lastSelKey = 'null';
    if (st.planet && st.planet !== 'earth') OV.usePlanet(st, st.planet);
    OV.showScreen('game');
    UI.wm.closeAll();
    UI.ensureMap(true);
    UI.wm.restore();
    UI.refresh();
  };
  OV.reload = function () { location.reload(); };

  function loop(ms) {
    const t = ms / 1000;
    try {
      if (OV.state && !document.getElementById('screen-game').hidden) {
        OV.ui.drawMap(t);
        const hs = document.getElementById('hudSigil');
        if (hs && OV.state.ai.forge && OV.forgeRender && OV.forgeRender.drawCoreBadgeFromAI) { if (t - (loop.lastCore || 0) > 0.045) { loop.lastCore = t; OV.forgeRender.drawCoreBadgeFromAI(hs, OV.state.ai, t); } } // Genesis Forge: the Core itself on the HUD
        else if (hs) { const c = hs.getContext('2d'); c.clearRect(0, 0, 80, 80); OV.drawSigilPixel(c, 40, 40, 30, OV.lookFromCosmetics(OV.db, OV.state.ai.cosmetics), t, 2); }
      }
      OV.ui.create.animate(t);
    } catch (e) { console.error(e); }
    requestAnimationFrame(loop);
  }

  window.addEventListener('DOMContentLoaded', async () => {
    try {
      OV.db = await OV.loadPacks();
      if (OV.db.warnings.length) console.warn('Pack warnings:', OV.db.warnings);
    } catch (e) {
      document.getElementById('boot').textContent = 'Failed to load content packs: ' + e.message;
      return;
    }
    document.getElementById('boot').hidden = true;
    OV.showScreen('menu');
    requestAnimationFrame(loop);
  });
})(window.OV);
