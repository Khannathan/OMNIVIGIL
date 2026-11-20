// OMNIVIGIL v4 - window manager. The map is always on screen; every other panel is a
// draggable, resizable window floating above it. Several can be open at once, each body
// scrolls on its own, and positions are remembered between sessions.
(function (OV) {
  'use strict';
  const UI = (OV.ui = OV.ui || {});
  const KEY = 'omnivigil.v4.windows';
  const WM = (UI.wm = { defs: {}, wins: {}, z: 20, layer: null });

  function load() { try { return JSON.parse(localStorage.getItem(KEY)) || {}; } catch (e) { return {}; } }
  function save() {
    const out = {};
    for (const [id, w] of Object.entries(WM.wins)) if (!id.includes(':')) out[id] = { x: w.x, y: w.y, w: w.w, h: w.h, open: w.open };
    try { localStorage.setItem(KEY, JSON.stringify(out)); } catch (e) { /* storage blocked: positions just reset */ }
  }
  const saved = load();

  // def: { title, icon, render(id) -> html, w, h, x?, y?, side?: 'right', kind? }
  WM.define = function (id, def) { WM.defs[id] = def; };
  function defOf(id) {
    if (WM.defs[id]) return WM.defs[id];
    const base = id.split(':')[0];
    return WM.defs[base + ':*'] || null;
  }
  function stageRect() {
    const s = document.getElementById('stage');
    return s ? s.getBoundingClientRect() : { left: 0, top: 0, width: window.innerWidth, height: window.innerHeight };
  }
  function place(id, def) {
    const r = stageRect(), sv = saved[id];
    const narrow = r.width < 760;
    let w = Math.min(def.w || 520, r.width - 12), h = Math.min(def.h || 520, r.height - 12);
    let x, y;
    if (sv && !narrow) { w = Math.min(sv.w || w, r.width - 12); h = Math.min(sv.h || h, r.height - 12); x = sv.x; y = sv.y; }
    else if (narrow) { w = r.width - 8; h = Math.min(h, r.height - 8); x = 4; y = 4; }
    else if (def.side === 'right') { x = r.width - w - 10; y = 10; }
    else { const n = Object.values(WM.wins).filter((q) => q.open).length; x = 70 + (n % 6) * 34; y = 14 + (n % 6) * 30; }
    const b = clamp({ x, y, w, h }, r);
    b.h = Math.max(140, Math.min(b.h, r.height - b.y - 6)); // open fully on screen
    return b;
  }
  function clamp(b, r) {
    r = r || stageRect();
    b.w = Math.max(260, Math.min(b.w, r.width)); b.h = Math.max(140, Math.min(b.h, r.height));
    b.x = Math.max(0, Math.min(b.x, r.width - 80)); b.y = Math.max(0, Math.min(b.y, r.height - 36));
    return b;
  }

  WM.isOpen = (id) => !!(WM.wins[id] && WM.wins[id].open);
  WM.open = function (id, opts) {
    const def = defOf(id); if (!def) return;
    let w = WM.wins[id];
    if (!w) { w = WM.wins[id] = Object.assign(place(id, def), { id, open: false }); }
    if (opts && opts.at) { Object.assign(w, clamp(Object.assign({}, w, opts.at))); }
    w.open = true; w.z = ++WM.z;
    ensureEl(id); WM.render(id); save();
    const el = w.el; el.classList.remove('closing'); el.classList.add('opening'); setTimeout(() => el.classList.remove('opening'), 220);
    UI.renderDock && UI.renderDock();
  };
  WM.close = function (id) {
    const w = WM.wins[id]; if (!w || !w.open) return;
    w.open = false;
    const el = w.el;
    if (el) { el.classList.add('closing'); setTimeout(() => { if (w.open) return; if (el.parentNode) el.remove(); if (w.el === el) w.el = null; }, 160); }
    if (id.includes(':')) delete WM.wins[id];
    const def = defOf(id); if (def && def.onClose) def.onClose(id);
    save(); UI.renderDock && UI.renderDock();
  };
  WM.toggle = function (id) {
    const w = WM.wins[id];
    if (w && w.open) { if (w.z === WM.z) WM.close(id); else WM.focus(id); } else WM.open(id);
  };
  WM.focus = function (id) { const w = WM.wins[id]; if (!w || !w.el) return; w.z = ++WM.z; w.el.style.zIndex = w.z; layerFocus(id); };
  function layerFocus(id) { for (const q of Object.values(WM.wins)) if (q.el) q.el.classList.toggle('front', q.id === id); }
  WM.closeAll = function () { for (const id of Object.keys(WM.wins)) if (WM.wins[id].open) WM.close(id); };

  function ensureEl(id) {
    const w = WM.wins[id], def = defOf(id);
    if (!WM.layer) WM.layer = document.getElementById('windows');
    if (!w.el) {
      const el = document.createElement('section');
      el.className = 'win'; el.dataset.win = id;
      el.innerHTML = `<header class="win-h"><span class="win-ic"></span><span class="win-t"></span><span class="win-x"><button class="win-btn" data-wm="max" title="Maximise / restore">▢</button><button class="win-btn" data-wm="close" title="Close (Esc)">✕</button></span></header><div class="win-b"></div><i class="win-grip" title="Drag to resize"></i>`;
      WM.layer.appendChild(el);
      w.el = el;
      el.addEventListener('pointerdown', () => { if (w.z !== WM.z) WM.focus(id); }, true);
      header(el.querySelector('.win-h'), w);
      grip(el.querySelector('.win-grip'), w);
    }
    const el = w.el;
    el.querySelector('.win-ic').textContent = def.icon || '';
    el.style.left = w.x + 'px'; el.style.top = w.y + 'px'; el.style.width = w.w + 'px'; el.style.height = w.h + 'px'; el.style.zIndex = w.z;
    el.classList.toggle('wide', w.w > 700);
    layerFocus(id);
  }
  function header(h, w) {
    h.addEventListener('pointerdown', (e) => {
      const b = e.target.closest('[data-wm]');
      if (b) { if (b.dataset.wm === 'close') WM.close(w.id); else maximise(w); return; }
      if (e.button !== 0) return;
      e.preventDefault();
      const sx = e.clientX, sy = e.clientY, ox = w.x, oy = w.y;
      h.setPointerCapture(e.pointerId);
      w.el.classList.add('dragging');
      const mv = (ev) => { w.x = ox + ev.clientX - sx; w.y = oy + ev.clientY - sy; clamp(w); w.el.style.left = w.x + 'px'; w.el.style.top = w.y + 'px'; };
      const up = () => { h.removeEventListener('pointermove', mv); h.removeEventListener('pointerup', up); w.el.classList.remove('dragging'); save(); };
      h.addEventListener('pointermove', mv); h.addEventListener('pointerup', up);
    });
    h.addEventListener('dblclick', (e) => { if (!e.target.closest('[data-wm]')) maximise(w); });
  }
  function maximise(w) {
    const r = stageRect();
    if (w.prev) { Object.assign(w, w.prev); w.prev = null; } else { w.prev = { x: w.x, y: w.y, w: w.w, h: w.h }; Object.assign(w, { x: 4, y: 4, w: r.width - 8, h: r.height - 8 }); }
    ensureEl(w.id); WM.render(w.id); save();
  }
  function grip(g, w) {
    g.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      const sx = e.clientX, sy = e.clientY, ow = w.w, oh = w.h;
      g.setPointerCapture(e.pointerId);
      const mv = (ev) => { w.w = ow + ev.clientX - sx; w.h = oh + ev.clientY - sy; clamp(w); w.el.style.width = w.w + 'px'; w.el.style.height = w.h + 'px'; w.el.classList.toggle('wide', w.w > 700); };
      const up = () => { g.removeEventListener('pointermove', mv); g.removeEventListener('pointerup', up); save(); };
      g.addEventListener('pointermove', mv); g.addEventListener('pointerup', up);
    });
  }

  // Re-render a window body, keeping every scroll position and the focused field.
  WM.render = function (id) {
    const w = WM.wins[id]; if (!w || !w.open || !w.el) return;
    const def = defOf(id);
    const body = w.el.querySelector('.win-b');
    const ae = document.activeElement;
    const typing = ae && body.contains(ae) && ae.matches('input[type=text], input:not([type]), input[type=search], textarea');
    if (typing && !w.force) return; // never wipe a field the player is typing in
    const scrolls = Array.from(body.querySelectorAll('.scroll')).map((e) => e.scrollTop);
    const top = body.scrollTop;
    let html = '';
    try { html = def.render(id) || ''; } catch (e) { console.error(e); html = `<p class="danger">This window failed to draw: ${OV.esc(e.message)}</p>`; }
    const title = typeof def.title === 'function' ? def.title(id) : def.title;
    w.el.querySelector('.win-t').textContent = title || id;
    body.innerHTML = html;
    body.scrollTop = top;
    Array.from(body.querySelectorAll('.scroll')).forEach((e, i) => { if (scrolls[i] !== undefined) e.scrollTop = scrolls[i]; });
    if (def.after) def.after(id, body);
  };
  WM.renderAll = function () { for (const id of Object.keys(WM.wins)) if (WM.wins[id].open) WM.render(id); };
  // Reopen the windows that were open last time (called when a game starts).
  WM.restore = function (ids) {
    for (const [id, s] of Object.entries(saved)) if (s.open && WM.defs[id]) WM.open(id);
    if (ids) ids.forEach((id) => { if (!WM.isOpen(id)) WM.open(id); });
  };
  WM.resetLayout = function () { try { localStorage.removeItem(KEY); } catch (e) { /* */ } for (const k of Object.keys(saved)) delete saved[k]; for (const id of Object.keys(WM.wins)) { const w = WM.wins[id]; if (w.el) w.el.remove(); } WM.wins = {}; };
  window.addEventListener('resize', () => { for (const w of Object.values(WM.wins)) if (w.open && w.el) { clamp(w); ensureEl(w.id); } });
})(window.OV);
