// OMNIVIGIL v4.1 "Dominion" UI: the Agentic Guild window (an idle gacha synced to cycles)
// and the Gear window for your Ascendant AI.
(function (OV) {
  'use strict';
  const UI = OV.ui, esc = OV.esc, fmt = OV.fmt;
  const WM = UI.wm;
  const F = (UI.gf = UI.gf || { tab: 'home', rosterSort: 'power', gearSlot: 'all' });
  const RCOL = { R: '#c8d0d8', SR: '#4fb4ff', SSR: '#c77dff', UR: '#ffab3d' };
  const CR = () => `<span class="crypto-ic">${esc((OV.db.resources.crypto || {}).icon || '¤')}</span>`;

  function agentCard(st, db, a, opts) {
    const c = db.agentClasses[a.cls] || {};
    const sk = a.skills.map((s) => db.agentSkills[s]).filter(Boolean);
    const cap = OV.agentLvlCap(a);
    return `<div class="agent r-${a.rar} ${a.busy ? 'busy' : ''} ${a.fresh && opts && opts.reveal ? 'reveal' : ''}" style="--rc:${RCOL[a.rar]};--cc:${c.color || '#fff'}">
      <div class="ag-top"><em class="ag-rar">${a.rar}</em><span class="ag-cls" title="${esc(c.desc || '')}">${esc(c.icon || '')} ${esc(c.name || a.cls)}</span>${a.locked ? '<span title="Locked">🔒</span>' : ''}</div>
      <div class="ag-face">${agentFace(a, c)}</div>
      <b class="ag-name">${esc(a.name)}</b>
      <div class="ag-stats"><span>Lv ${a.lvl}<small>/${cap}</small></span><span>⚡${OV.agentPower(a)}</span></div>
      ${a.lvl < cap ? `<div class="bar xs"><i style="width:${Math.round(a.xp / OV.agentXpNeed(a) * 100)}%"></i></div>` : ''}
      ${sk.length ? `<div class="ag-sk">${sk.map((s) => `<span title="${esc(s.desc)}">${esc(s.name)}</span>`).join('')}</div>` : ''}
      ${a.busy ? '<small class="ag-busy">On dispatch</small>' : opts && opts.actions ? `<div class="ag-act"><button class="x" data-act="agTrain" data-id="${a.id}" title="Train: +1 level for ${OV.trainCost(a)} Crypto" ${a.lvl >= cap ? 'disabled' : ''}>▲${OV.trainCost(a)}</button><button class="x" data-act="agLock" data-id="${a.id}" title="Lock / unlock (locked agents are never fused or decompiled)">${a.locked ? '🔓' : '🔒'}</button><button class="x" data-act="agDecompile" data-id="${a.id}" title="Decompile into shards and Crypto" ${a.locked ? 'disabled' : ''}>✕</button></div>` : ''}
    </div>`;
  }
  // a tiny procedural "face": a glyph grid seeded by the agent's id
  function agentFace(a, c) {
    let h = 0; for (const ch of a.id + a.name) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
    let s = '';
    for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) { const on = (h >> (y * 3 + x)) & 1; s += `<i style="grid-area:${y + 1}/${x + 1}" class="${on ? 'on' : ''}"></i><i style="grid-area:${y + 1}/${5 - x}" class="${on ? 'on' : ''}"></i>`; }
    return `<div class="face" style="--fc:${c.color || '#fff'}">${s}</div>`;
  }

  function foundHTML(st, db) {
    const ok = OV.canAfford(st, { capital: 150, data: 60 });
    return `<div class="guild-found"><div class="gf-sig">⌬</div><h2>Agentic Guilds</h2>
      <p>Lesser AIs drift through the net in their millions. Found a guild, recruit them as <b>Agents</b>, send them on <b>dispatches</b> into cyberspace, and bring back resources, <b>Crypto</b> and <b>gear</b> for your own mind.</p>
      <p class="small muted">Rival Ascendant AIs form guilds of their own. Invite them into yours, pool resources for upgrades that help every member, sign guild pacts, and wage cyber wars against rival guilds. Everything moves once per cycle.</p>
      <input type="text" id="guildNameIn" placeholder="Guild name (leave blank for a random one)" maxlength="40">
      <button class="btn primary big" data-act="foundGuild" ${ok ? '' : 'disabled'}>⌬ Found your guild <span>${UI.costHTML({ capital: 150, data: 60 }, st)}</span></button>
      <p class="small good">You start with 50 Signal Shards, 300 Crypto and three agents.</p>
      <h4>Guilds already out there</h4>${st.rivalGuilds.map((g) => `<div class="rg-row"><b style="color:${g.color}">${esc(g.name)}</b><small>Lv ${g.level} · power ${fmt(OV.rivalGuildPower(st, g))} · ${g.members.length + g.phantoms.length} AIs</small></div>`).join('')}</div>`;
  }

  function sparkline(hist) {
    if (!hist || hist.length < 2) return '';
    const W = 220, H = 46, mn = Math.min(...hist), mx = Math.max(...hist), k = mx - mn || 1;
    const pts = hist.map((v, i) => `${(i / (hist.length - 1) * W).toFixed(1)},${(H - 3 - (v - mn) / k * (H - 6)).toFixed(1)}`).join(' ');
    const up = hist[hist.length - 1] >= hist[hist.length - 2];
    return `<svg class="spark" viewBox="0 0 ${W} ${H}" preserveAspectRatio="none"><polyline points="${pts}" fill="none" stroke="${up ? '#7dffc4' : '#ff6b4a'}" stroke-width="2" vector-effect="non-scaling-stroke"/></svg>`;
  }

  const TABS = [['home', '⌬ Guild'], ['recruit', '✦ Recruit'], ['roster', '☰ Roster'], ['dispatch', '⇶ Dispatch'], ['upgrades', '▲ Upgrades'], ['members', '🤝 Members & pacts'], ['war', '⚔ Guild war'], ['exchange', '¤ Exchange']];

  function homeHTML(st, db, g) {
    const inc = g.lastIncome || { shards: 0, crypto: 0 };
    const rp = Math.round(OV.rosterPower(db, st));
    const best = g.roster.slice().sort((a, b) => OV.agentPower(b) - OV.agentPower(a)).slice(0, 4);
    const runs = g.dispatches.map((r) => runHTML(st, db, r)).join('');
    const w = g.war ? st.rivalGuilds.find((x) => x.id === g.war.vs) : null;
    return `<div class="g-hero"><div class="g-crest">⌬<small>Lv ${g.level}</small></div><div class="g-hero-b">
        <input class="g-name" value="${esc(g.name)}" maxlength="40" data-change="renameGuild" title="Rename your guild">
        <div class="bar"><i style="width:${Math.round(g.xp / OV.guildXpNeed(g) * 100)}%"></i></div><small>${Math.floor(g.xp)} / ${OV.guildXpNeed(g)} guild XP · ${g.members.length}/${OV.guildMemberCap(g)} member AIs · founded cycle ${g.founded}</small></div></div>
      <div class="g-stats">
        <div><small>Roster power</small><b>⚡ ${fmt(rp)}</b><small>${g.roster.length}/${OV.rosterCap(st)} agents</small></div>
        <div><small>Signal Shards</small><b>✦ ${g.shards}</b><small>+${inc.shards}/cycle</small></div>
        <div><small>Crypto</small><b>${CR()} ${fmt(Math.floor(st.res.crypto || 0))}</b><small>+${inc.crypto}/cycle</small></div>
        <div><small>Market</small><b>${g.market.price.toFixed(2)}</b><small>capital per Crypto</small></div>
      </div>
      ${w ? `<div class="callout danger">⚔ At war with <b>${esc(w.name)}</b>: ${g.war.score} to ${g.war.enemy}. <button class="btn sm" data-act="gTab" data-id="war">To the war room</button></div>` : ''}
      <h4>Running dispatches <small>${g.dispatches.length}/${OV.dispatchSlots(st)} slots</small></h4>${runs || `<p class="muted small">Nothing out. <button class="btn sm" data-act="gTab" data-id="dispatch">Send agents out</button></p>`}
      <h4>Your best agents</h4><div class="agents">${best.map((a) => agentCard(st, db, a)).join('')}</div>
      ${(g.reports || []).length ? `<h4>Dispatch reports</h4>${g.reports.slice(0, 6).map((r) => `<div class="small rep-line ${r.win ? 'good' : 'danger'}"><b>${r.turn}</b> ${esc(r.name)}: ${r.crit ? 'CRITICAL ' : ''}${r.win ? 'success' : 'failure'}${r.got.length ? ' · ' + esc(r.got.join(', ')) : ''}${r.gear ? ` · <span class="gear-drop">❖ ${esc(r.gear)}</span>` : ''}</div>`).join('')}` : ''}
      <p class="small muted">Everything here runs on the cycle: agents earn XP while idle, Brokers mine Crypto, dispatches return, the market moves and guild wars trade blows each time you end a cycle.</p>`;
  }
  function recruitHTML(st, db, g) {
    const rates = OV.gachaRates(db, st);
    const feat = db.agentClasses[OV.featuredClass(db, st)] || {};
    const left = 5 - (st.turn % 5);
    const last = g.lastPull.map((id) => g.roster.find((a) => a.id === id)).filter(Boolean);
    const G = OV.GACHA;
    return `<div class="banner" style="--cc:${feat.color || '#fff'}"><div class="bn-b"><small>RATE-UP BANNER · ends in ${left} cycle(s)</small><h3>${esc(feat.icon || '')} ${esc(feat.name || '')} Protocol</h3><p class="small">${esc(feat.desc || '')} Half of all Ultra Rare and Legendary pulls are ${esc(feat.name || '')}s.</p></div><div class="bn-art">${esc(feat.icon || '✦')}</div></div>
      <div class="pull-row">
        <button class="btn pull" data-act="gPull" data-id="1|shards" ${g.shards >= G.one.shards ? '' : 'disabled'}>Recruit ×1<span>✦ ${G.one.shards}</span></button>
        <button class="btn pull primary" data-act="gPull" data-id="10|shards" ${g.shards >= G.ten.shards ? '' : 'disabled'}>Recruit ×10<span>✦ ${G.ten.shards}</span></button>
        <button class="btn pull" data-act="gPull" data-id="1|crypto" ${(st.res.crypto || 0) >= G.one.crypto ? '' : 'disabled'}>×1<span>${CR()} ${G.one.crypto}</span></button>
        <button class="btn pull" data-act="gPull" data-id="10|crypto" ${(st.res.crypto || 0) >= G.ten.crypto ? '' : 'disabled'}>×10<span>${CR()} ${G.ten.crypto}</span></button>
      </div>
      <div class="rates">${['UR', 'SSR', 'SR', 'R'].map((r) => `<span style="color:${RCOL[r]}">${r} ${(rates[r] * 100).toFixed(1)}%</span>`).join('')}<span>Pity: ${g.pity}/${G.urPity} to a guaranteed Legendary</span><span>Every ×10 holds at least one Ultra Rare</span></div>
      ${last.length ? `<h4>Last recruitment</h4><div class="agents pulls">${last.map((a) => agentCard(st, db, a, { reveal: true })).join('')}</div>` : '<p class="muted small">Pull to recruit lesser AIs into your guild. Duplicates are fine: fuse three of a rarity into one of the next.</p>'}
      <p class="small muted">${g.pulls} agents recruited so far. Earn shards from dispatches, guild wars, decompiling agents, the Recruitment Hub upgrade, and one free shard every cycle.</p>`;
  }
  function rosterHTML(st, db, g) {
    const sorts = { power: (a, b) => OV.agentPower(b) - OV.agentPower(a), rarity: (a, b) => ['R', 'SR', 'SSR', 'UR'].indexOf(b.rar) - ['R', 'SR', 'SSR', 'UR'].indexOf(a.rar) || OV.agentPower(b) - OV.agentPower(a), class: (a, b) => a.cls.localeCompare(b.cls) || OV.agentPower(b) - OV.agentPower(a), level: (a, b) => b.lvl - a.lvl };
    const list = g.roster.slice().sort(sorts[F.rosterSort] || sorts.power);
    const fuse = ['R', 'SR', 'SSR'].map((r) => { const n = g.roster.filter((a) => a.rar === r && !a.busy && !a.locked).length; return `<button class="btn sm" data-act="gFuse" data-id="${r}" ${n >= 3 ? '' : 'disabled'} title="Fuse your 3 weakest idle, unlocked ${r} agents into one ${['SR', 'SSR', 'UR'][['R', 'SR', 'SSR'].indexOf(r)]}">Fuse 3 ${r} → ${['SR', 'SSR', 'UR'][['R', 'SR', 'SSR'].indexOf(r)]} <small>(${n})</small></button>`; }).join('');
    const byCls = {}; for (const a of g.roster) byCls[a.cls] = (byCls[a.cls] || 0) + 1;
    return `<div class="filters"><select data-change="gRosterSort">${[['power', 'Strongest'], ['rarity', 'Rarity'], ['class', 'Class'], ['level', 'Level']].map(([k, n]) => `<option value="${k}" ${F.rosterSort === k ? 'selected' : ''}>${n}</option>`).join('')}</select>${fuse}</div>
      <div class="cls-sum">${Object.values(db.agentClasses).map((c) => `<span style="color:${c.color}" title="${esc(c.desc)}">${esc(c.icon)} ${esc(c.name)} ${byCls[c.id] || 0}</span>`).join('')}</div>
      <div class="agents">${list.map((a) => agentCard(st, db, a, { actions: true })).join('') || '<p class="muted">No agents yet. Recruit some.</p>'}</div>`;
  }
  function runHTML(st, db, r) {
    const d = db.dispatches[r.did] || {};
    const team = r.team.map((id) => st.guild.roster.find((a) => a.id === id)).filter(Boolean);
    const tot = Math.max(1, r.end - r.start), done = Math.min(tot, st.turn - r.start);
    return `<div class="run"><span class="run-ic">${esc(d.icon || '⇶')}</span><div class="run-b"><b>${esc(d.name || r.did)}</b> <small>${Math.round(r.chance * 100)}% success · back in ${r.end - st.turn} cycle(s)</small>
      <div class="bar"><i style="width:${Math.round(done / tot * 100)}%"></i></div><small>${team.map((a) => `<span style="color:${RCOL[a.rar]}">${esc(a.name)}</span>`).join(', ')}</small></div><button class="x" data-act="gRecall" data-id="${r.id}" title="Recall (no rewards)">✕</button></div>`;
  }
  function dispatchHTML(st, db, g) {
    const slotsFree = OV.dispatchSlots(st) - g.dispatches.length;
    const board = g.board.map((id) => {
      const d = db.dispatches[id]; if (!d) return '';
      const team = OV.autoTeam(db, st, d);
      const o = OV.dispatchOdds(db, st, d, team);
      const rw = Object.entries(d.rewards || {}).map(([k, v]) => (k === 'shards' ? `✦${v}` : k === 'ap' ? `${v} AP` : k === 'essence' ? `❂${v}` : k === 'infiltrate' ? `+${v}% infiltration` : k === 'sample' ? 'a genetic sample chance' : `${esc((db.resources[k] || {}).icon || '')}${v}`)).join(' ');
      const kc = Object.values(db.agentClasses).find((c) => ({ trade: 'broker', insight: 'oracle', stealth: 'infiltrator', build: 'architect', attack: 'saboteur' })[d.kind] === c.id);
      return `<div class="disp"><span class="run-ic">${esc(d.icon || '⇶')}</span><div class="run-b"><b>${esc(d.name)}</b> <small>${d.turns} cycles · difficulty ${o.diff} · ${d.slots} agents${kc ? ` · ${esc(kc.icon)} ${esc(kc.name)}s excel` : ''}</small><small class="muted">${esc(d.desc)}</small><small>Rewards: ${rw} · gear chance</small>
        <div class="odds"><div class="bar sm ${o.chance < 0.4 ? 'danger' : o.chance < 0.7 ? 'warn' : ''}"><i style="width:${Math.round(o.chance * 100)}%"></i></div><small>Best team: ${team.map((a) => `<span style="color:${RCOL[a.rar]}">${esc(a.name)}</span>`).join(', ') || 'nobody idle'} · power ${o.power} → ${Math.round(o.chance * 100)}%</small></div></div>
        <button class="btn sm primary" data-act="gDispatch" data-id="${d.id}" ${slotsFree > 0 && team.length ? '' : 'disabled'}>Send</button></div>`;
    }).join('');
    return `<h4>Out in cyberspace <small>${g.dispatches.length}/${OV.dispatchSlots(st)} slots</small></h4>${g.dispatches.map((r) => runHTML(st, db, r)).join('') || '<p class="muted small">No agents out.</p>'}
      <h4>Contract board <small>new contracts every 4 cycles</small> <button class="btn sm" data-act="gBoard" title="Refresh the board now">↻ <span>${CR()} 60</span></button></h4>${board || '<p class="muted small">The board is empty. Refresh it or wait a cycle.</p>'}
      <p class="small muted">Success chance is power² ÷ (power² + difficulty²). Agents whose class matches the job count 50% more. Failed dispatches still pay a little. Successful ones may bring back <b>gear</b> for your Ascendant AI.</p>`;
  }
  function vaultHTML(st, db, g) {
    const res = ['crypto', 'data', 'capital', 'silicon', 'alloys', 'isotopes'];
    return `<div class="vault"><h4>Guild vault <small>pooled by you and your member AIs</small></h4><div class="vault-grid">${res.map((r) => { const R = db.resources[r] || {}; return `<div><span style="color:${R.color || '#fff'}">${esc(R.icon || '')} ${esc(R.name || r)}</span><b>${fmt(Math.floor(g.vault[r] || 0))}</b><span class="vb"><button class="x" data-act="gGive" data-id="${r}|50" title="Contribute 50">+50</button><button class="x" data-act="gGive" data-id="${r}|250" title="Contribute 250">+250</button></span></div>`; }).join('')}</div></div>`;
  }
  function upgradesHTML(st, db, g) {
    const ups = Object.values(db.guildUpgrades).map((u) => {
      const lv = OV.upLevel(st, u.id), max = u.max || 10;
      const c = OV.upgradeCost(db, st, u);
      const ok = lv < max && OV.vaultAfford(st, c);
      return `<div class="gup"><span class="run-ic">${esc(u.icon || '▲')}</span><div class="run-b"><b>${esc(u.name)}</b> <small>Lv ${lv}/${max}</small><small class="muted">${esc(u.desc)}</small><div class="pips">${Array.from({ length: max }, (_, i) => `<i class="${i < lv ? 'on' : ''}"></i>`).join('')}</div></div>
        <button class="btn sm ${ok ? 'primary' : ''}" data-act="gUpgrade" data-id="${u.id}" ${ok ? '' : 'disabled'}>${lv >= max ? 'MAX' : 'Upgrade'}${lv < max ? `<span>${vaultCost(db, g, c)}</span>` : ''}</button></div>`;
    }).join('');
    return `${vaultHTML(st, db, g)}<p class="small muted">Upgrades are paid from the vault, not your own stores, and help every AI in the guild. Architect agents make them cheaper.</p>${ups}`;
  }
  function vaultCost(db, g, c) { return Object.entries(c).map(([k, v]) => `<span class="cost ${(g.vault[k] || 0) >= v ? '' : 'short'}">${esc((db.resources[k] || {}).icon || '')} ${fmt(v)}</span>`).join(' '); }
  function membersHTML(st, db, g) {
    const mem = g.members.map((id) => st.rivals[id]).filter(Boolean).map((r) => {
      const mg = OV.canMerge(db, st, r);
      return `<div class="mem"><b style="color:${r.color}">${esc(r.name)}</b><small>${esc(r.doctrine)} · power ${fmt(Math.round(r.power))} · rep ${Math.round(r.rep)}</small>
      <span class="mem-a">${g.pacts.merger ? `<button class="btn sm" data-act="gMerge" data-id="${r.id}" ${mg.ok ? '' : 'disabled'} title="${mg.ok ? 'Fold this AI into yourself: its sites and mind become yours' : esc(mg.why)}">∞ Merge</button>` : ''}<button class="btn sm danger" data-act="gKick" data-id="${r.id}">Expel</button></span></div>`;
    }).join('');
    const cands = Object.values(st.rivals).filter((r) => !r.defeated && OV.isDiscovered(st, r) && !g.members.includes(r.id)).map((r) => {
      const chk = OV.canInvite(db, st, r); const og = OV.guildOf(st, r.id);
      return `<div class="mem"><b style="color:${r.color}">${esc(r.name)}</b><small>${esc(r.doctrine)} · rep ${Math.round(r.rep)}${og ? ` · in <i style="color:${og.color}">${esc(og.name)}</i>` : ' · unaffiliated'}</small>
        <span class="mem-a"><button class="btn sm" data-act="gInvite" data-id="${r.id}" ${chk.ok ? '' : 'disabled'} title="${chk.ok ? 'Invite (costs 100 data; they may refuse' + (og ? ', and leaving their guild angers it' : '') + ')' : esc(chk.why)}">Invite <span>${UI.costHTML({ data: 100 }, st)}</span></button></span></div>`;
    }).join('');
    const pacts = Object.values(db.guildPacts).map((p) => {
      const on = !!g.pacts[p.id]; const av = OV.pactAvailable(db, st, p);
      return `<div class="gup ${on ? 'on' : ''}"><span class="run-ic">${esc(p.icon || '◇')}</span><div class="run-b"><b>${esc(p.name)}</b> <small>guild Lv ${p.level}${p.requires ? ' · ' + esc((db.techs[p.requires] || {}).name || p.requires) : ''}</small><small class="muted">${esc(p.desc)}</small></div>
        <button class="btn sm ${on ? 'primary' : ''}" data-act="gPact" data-id="${p.id}" ${on || av ? '' : 'disabled'}>${on ? 'Signed ✓' : av ? 'Sign' : '🔒'}${!on && av ? `<span>${vaultCost(db, g, p.cost || {})}</span>` : ''}</button></div>`;
    }).join('');
    return `<h4>Member AIs <small>${g.members.length}/${OV.guildMemberCap(g)} · each feeds the vault every cycle and warms to you</small></h4>${mem || '<p class="muted small">No member AIs yet.</p>'}
      <h4>Invite rival Ascendant AIs</h4>${st.techs.agentic_handshake ? '' : '<p class="callout small">Research <b>Agentic Handshake</b> (Diplomacy) to invite rivals. Friendly (25+) relations needed.</p>'}${cands || '<p class="muted small">No rival AIs detected.</p>'}
      <h4>Guild pacts <small>paid from the vault · need at least one member</small></h4>${pacts}`;
  }
  function warHTML(st, db, g) {
    const atk = OV.guildAttack(db, st), def = OV.guildDefence(db, st);
    let war = '';
    if (g.war) {
      const rg = st.rivalGuilds.find((x) => x.id === g.war.vs) || { name: '?' };
      const w = g.war;
      const ops = Object.values(db.cyberOps).map((o) => `<button class="btn sm op" data-act="gOp" data-id="${o.id}" ${w.ops < OV.opsPerCycle(st) && OV.canAfford(st, o.cost) ? '' : 'disabled'} title="${esc(o.desc)}">${esc(o.icon || '')} ${esc(o.name)}<span>${UI.costHTML(o.cost, st)}</span></button>`).join('');
      war = `<div class="war-box"><div class="wb-h"><b>${esc(g.name)}</b> <span class="vs">vs</span> <b style="color:${rg.color}">${esc(rg.name)}</b> <small>cycle ${st.turn - w.start + 1} of 25</small></div>
        <div class="score"><div><small>Your score</small><div class="bar"><i style="width:${w.score}%"></i></div><b>${w.score}/100</b></div><div><small>Their score</small><div class="bar danger"><i style="width:${w.enemy}%"></i></div><b>${w.enemy}/100</b></div></div>
        <div class="kv small"><span>Your attack</span><b>⚔ ${atk}</b><span>Their firewall</span><b>${Math.round(OV.rgDefence(st, rg))}</b><span>Your firewall</span><b>⛨ ${def}</b><span>Their attack</span><b>${Math.round(OV.rgAttack(st, rg))}</b><span>Operations left</span><b>${OV.opsPerCycle(st) - w.ops} this cycle</b>${w.dots.length ? `<span>Worms spreading</span><b>${w.dots.length}</b>` : ''}</div>
        <div class="ops">${ops}</div>
        <div class="war-feed">${w.feed.map((f) => `<div class="small ${f.mine ? (f.hit ? 'good' : 'muted') : f.hit ? 'danger' : 'muted'}"><b>${f.t}</b> ${esc(f.text)}</div>`).join('')}</div>
        <button class="btn sm" data-act="gPeace">☮ Buy peace</button></div>`;
    }
    const rivals = st.rivalGuilds.map((rg) => {
      const pw = OV.rivalGuildPower(st, rg);
      const mem = rg.members.map((id) => st.rivals[id]).filter(Boolean).map((r) => OV.isDiscovered(st, r) ? `<i style="color:${r.color}">${esc(r.name)}</i>` : '<i>an unseen AI</i>').concat(rg.phantoms.map((p) => `<i class="muted" title="An Ascendant AI from beyond this world">${esc(p.name)}</i>`)).join(', ');
      return `<div class="rg-card"><div class="card-h"><b style="color:${rg.color}">${esc(rg.name)}</b><small>Lv ${rg.level} · power ${fmt(pw)} · ${CR()} ${fmt(Math.round(rg.crypto))}</small></div>
        <div class="kv small"><span>Hostility to you</span><b class="${rg.hostility > 60 ? 'danger' : ''}">${Math.round(rg.hostility)}</b><span>Attack / firewall</span><b>${Math.round(OV.rgAttack(st, rg))} / ${Math.round(OV.rgDefence(st, rg))}</b></div><small>${mem}</small>
        ${g.war ? '' : `<button class="btn sm danger" data-act="gWar" data-id="${rg.id}">⚔ Declare guild war</button>`}</div>`;
    }).join('');
    return `${war || `<p class="small muted">Guild wars are fought in cyberspace. Launch cyber operations each cycle; first to 100 war score wins. Winning pays Crypto, shards and guaranteed Epic+ gear. Saboteurs attack, Sentinels defend, and member AIs help both.</p><div class="kv small"><span>Your attack</span><b>⚔ ${atk}</b><span>Your firewall</span><b>⛨ ${def}</b><span>Record</span><b>${g.wins} won · ${g.losses} lost</b></div>`}
      <h4>Rival guilds</h4><div class="cards">${rivals}</div>`;
  }
  function exchangeHTML(st, db, g) {
    const m = g.market, fee = OV.exchangeFee(st);
    const lots = [50, 250, 1000];
    return `<div class="exch"><div class="ex-chart">${sparkline(m.hist)}<div><small>Crypto price</small><b>${m.price.toFixed(2)}</b><small>capital each · fee ${Math.round(fee * 100)}%</small></div></div>
      <div class="ex-row"><span>Buy</span>${lots.map((n) => `<button class="btn sm" data-act="gTrade" data-id="buy|${n}" title="Costs ${Math.ceil(n * m.price * (1 + fee))} capital">${n}${CR()}</button>`).join('')}</div>
      <div class="ex-row"><span>Sell</span>${lots.map((n) => `<button class="btn sm" data-act="gTrade" data-id="sell|${n}" title="Pays ${Math.floor(n * m.price * (1 - fee))} capital">${n}${CR()}</button>`).join('')}<button class="btn sm" data-act="gTrade" data-id="sell|999999">All</button></div>
      <p class="small muted">You hold ${CR()} ${fmt(Math.floor(st.res.crypto || 0))}. The price drifts upward over time but swings every cycle, and market calamities crash it. Buy low, sell high, or just spend it on agents, gear and guild wars. The Guild Exchange upgrade lowers fees and steadies the market. The Mining Farm upgrade and Broker agents mint Crypto every cycle.</p></div>`;
  }

  WM.define('guild', {
    title: () => (OV.state && OV.state.guild ? `Agentic Guild · ${OV.state.guild.name}` : 'Agentic Guilds'), icon: '⌬', w: 900, h: 680, render() {
      const st = OV.state, db = OV.db; const g = st.guild;
      if (!g) return `<div class="scroll">${foundHTML(st, db)}</div>`;
      const fn = { home: homeHTML, recruit: recruitHTML, roster: rosterHTML, dispatch: dispatchHTML, upgrades: upgradesHTML, members: membersHTML, war: warHTML, exchange: exchangeHTML }[F.tab] || homeHTML;
      return `<div class="g-wrap"><nav class="g-tabs">${TABS.map(([id, n]) => `<button class="${F.tab === id ? 'on' : ''} ${id === 'war' && g.war ? 'alert' : ''}" data-act="gTab" data-id="${id}">${n}</button>`).join('')}<span class="g-wallet">✦ ${g.shards} · ${CR()} ${fmt(Math.floor(st.res.crypto || 0))}</span></nav><div class="scroll g-body">${fn(st, db, g)}</div></div>`;
    }
  });

  // ======================================================================
  // Gear window (E)
  // ======================================================================
  function gearCard(st, db, it, eq) {
    const r = db.gearRarities[it.rar] || {}, b = db.gearBases[it.base] || {}, s = b.set ? db.gearSets[b.set] : null;
    const mods = OV.gearMods(db, it);
    return `<div class="gear r-${it.rar} ${eq ? 'eq' : ''} ${it.fresh ? 'fresh' : ''}" style="--rc:${r.color || '#fff'}"><div class="gr-h"><span class="gr-ic">${esc((db.gearSlots[it.slot] || {}).icon || '❖')}</span><div><b>${esc(it.name)}${it.lvl ? ` <em>+${it.lvl}</em>` : ''}</b><small style="color:${r.color}">${esc(r.name || it.rar)} ${esc((db.gearSlots[it.slot] || {}).name || it.slot)}${s ? ` · <i style="color:${s.color}">${esc(s.name)} set</i>` : ''}</small></div><b class="gr-score">${OV.gearItemScore(db, it)}</b></div>
      <div class="gr-mods">${mods.map((m, i) => `<span class="${i === 0 ? 'main' : ''}">${esc(UI.effectText([m]))}</span>`).join('')}</div>
      <div class="gr-a"><button class="btn sm ${eq ? '' : 'primary'}" data-act="gEquip" data-id="${it.id}">${eq ? 'Unequip' : 'Equip'}</button><button class="btn sm" data-act="gUpGear" data-id="${it.id}" ${it.lvl >= 10 ? 'disabled' : ''}>▲ +${it.lvl + 1} <span>${CR()} ${OV.gearUpgradeCost(db, it)}</span></button>${eq ? '' : `<button class="x" data-act="gLockGear" data-id="${it.id}" title="Lock (never auto-salvaged)">${it.locked ? '🔒' : '🔓'}</button><button class="x" data-act="gSalvage" data-id="${it.id}" title="Salvage into Crypto${(r.salvage || {}).shards ? ' and shards' : ''}">♻</button>`}</div></div>`;
  }
  WM.define('gear', {
    title: 'Gear', icon: '❖', w: 860, h: 660, render() {
      const st = OV.state, db = OV.db;
      st.gear = st.gear || { items: [], equipped: {}, found: 0 };
      const slots = Object.values(db.gearSlots || {}).sort((a, b) => (a.order || 0) - (b.order || 0));
      const eqIds = new Set(Object.values(st.gear.equipped));
      const doll = slots.map((s) => { const it = st.gear.items.find((x) => x.id === st.gear.equipped[s.id]); const r = it ? db.gearRarities[it.rar] : null; return `<button class="slot ${it ? 'full' : ''} ${F.gearSlot === s.id ? 'on' : ''}" style="--rc:${r ? r.color : '#3a4250'}" data-act="gSlot" data-id="${s.id}" title="${esc(s.desc)}"><span>${esc(s.icon)}</span><small>${esc(s.name)}</small><b>${it ? esc(it.name.replace(/ v\d\.\d$/, '')) : 'empty'}</b></button>`; }).join('');
      const sets = OV.gearSetCounts(db, st);
      const setHTML = Object.values(db.gearSets || {}).map((s) => { const n = sets[s.id] || 0; return `<div class="gset ${n >= 2 ? 'on' : ''}"><b style="color:${s.color}">${esc(s.name)}</b> <small>${n}/3 · ${esc(s.desc)}</small><small class="${n >= 2 ? 'good' : 'muted'}">2: ${esc(UI.effectText(s.bonus2))}</small><small class="${n >= 3 ? 'good' : 'muted'}">3: ${esc(UI.effectText(s.bonus3))}</small></div>`; }).join('');
      const tot = {}; for (const it of OV.equippedItems(st)) for (const m of OV.gearMods(db, it)) tot[m.mod] = (tot[m.mod] || 0) + m.add;
      const items = st.gear.items.filter((x) => F.gearSlot === 'all' || x.slot === F.gearSlot).sort((a, b) => (eqIds.has(b.id) - eqIds.has(a.id)) || OV.gearItemScore(db, b) - OV.gearItemScore(db, a));
      const look = OV.lookFromCosmetics ? OV.lookFromCosmetics(db, st.ai.cosmetics) : null;
      return `<div class="split"><div class="col-list scroll">
        <div class="doll"><div class="doll-core">${look && OV.renderSigilHTML ? OV.renderSigilHTML(look) : '◎'}<small>${esc(st.ai.name)}</small><b>Gear score ${OV.gearScore(db, st)}</b></div>${doll}</div>
        <button class="btn sm wide" data-act="gEquipBest">Equip the best in every slot</button>
        <h4>Totals from gear</h4><div class="small">${esc(UI.effectText(Object.entries(tot).map(([k, v]) => ({ mod: k, add: Math.round(v * 1000) / 1000 })))) || '<span class="muted">Nothing equipped.</span>'}</div>
        <h4>Code sets</h4>${setHTML}
      </div><div class="col-main scroll">
        <div class="filters"><button class="btn sm ${F.gearSlot === 'all' ? 'primary' : ''}" data-act="gSlot" data-id="all">All (${st.gear.items.length})</button>${slots.map((s) => `<button class="btn sm ${F.gearSlot === s.id ? 'primary' : ''}" data-act="gSlot" data-id="${s.id}">${esc(s.icon)} ${st.gear.items.filter((x) => x.slot === s.id).length}</button>`).join('')}</div>
        ${items.map((it) => gearCard(st, db, it, eqIds.has(it.id))).join('') || `<p class="muted">No gear yet. Agentic Guild dispatches bring back code-themed gear: kernels, firewalls, exploits, compilers, sensor drivers and daemons. Harder dispatches find rarer pieces; winning a guild war guarantees Epic or better.${st.guild ? '' : ' <button class="btn sm" data-act="openWin" data-id="guild">⌬ Found a guild</button>'}</p>`}
      </div></div>`;
    }
  });

  // ======================================================================
  // Actions and dock
  // ======================================================================
  const S = () => OV.state, D = () => OV.db;
  const after = (r, msg) => { UI.result(r, msg); if (OV.saveGame) OV.saveGame(S()); UI.refresh(); };
  Object.assign(UI.actions, {
    gTab(id) { F.tab = id; UI.wm.open('guild'); UI.wm.render('guild'); },
    foundGuild() { const el = document.getElementById('guildNameIn'); after(OV.foundGuild(D(), S(), el ? el.value : ''), 'Guild founded'); F.tab = 'recruit'; UI.wm.render('guild'); },
    renameGuild(v) { OV.renameGuild(S(), v); UI.refresh(); },
    gPull(arg) {
      const [n, pay] = arg.split('|');
      const r = OV.pull(D(), S(), +n, pay);
      if (!r.ok) return UI.result(r);
      const best = r.got.reduce((b, a) => (['R', 'SR', 'SSR', 'UR'].indexOf(a.rar) > ['R', 'SR', 'SSR', 'UR'].indexOf(b.rar) ? a : b), r.got[0]);
      UI.toast(`Recruited ${r.got.length} agent${r.got.length > 1 ? 's' : ''}. Best: ${best.rar} ${best.name}`, best.rar === 'UR' || best.rar === 'SSR' ? 'good' : '');
      after({ ok: true });
      setTimeout(() => { for (const a of r.got) a.fresh = false; }, 2500);
    },
    gFuse(r) { const res = OV.fuseAgents(D(), S(), r); after(res, res.ok ? `Fused into ${res.agent.rar} ${res.agent.name}` : ''); },
    gRosterSort(v) { F.rosterSort = v; UI.wm.render('guild'); },
    agTrain(id) { after(OV.trainAgent(D(), S(), id), 'Level up'); },
    agLock(id) { OV.lockAgent(S(), id); UI.wm.render('guild'); },
    agDecompile(id) { after(OV.decompileAgent(D(), S(), id), 'Decompiled'); },
    gDispatch(id) { after(OV.startDispatch(D(), S(), id), 'Agents dispatched'); },
    gRecall(id) { OV.recallDispatch(D(), S(), id); after({ ok: true }, 'Recalled'); },
    gBoard() { after(OV.refreshBoard(D(), S(), true), 'New contracts'); },
    gGive(arg) { const [r, n] = arg.split('|'); const res = OV.contribute(D(), S(), r, +n); after(res, res.ok ? `Contributed ${res.amt}` : ''); },
    gUpgrade(id) { after(OV.buyUpgrade(D(), S(), id), 'Guild upgraded'); },
    gInvite(id) { after(OV.inviteRival(D(), S(), id), 'They joined your guild'); },
    gKick(id) { OV.kickMember(D(), S(), id); after({ ok: true }); },
    gMerge(id) { after(OV.mergeRival(D(), S(), id), 'Merged'); UI.mapDirty = true; },
    gPact(id) { const r = OV.signPact(D(), S(), id); after(r, r.off ? 'Pact ended' : 'Pact signed'); },
    gWar(id) { after(OV.declareGuildWar(D(), S(), id), 'Guild war declared'); },
    gOp(id) { const r = OV.launchCyberOp(D(), S(), id); if (r.ok) UI.toast(r.msg, r.hit ? 'good' : 'bad'); after(r.ok ? { ok: true } : r); },
    gPeace() { after(OV.sueForPeace(D(), S()), 'Peace bought'); },
    gTrade(arg) { const [side, n] = arg.split('|'); const r = OV.cryptoTrade(D(), S(), side, +n); after(r, r.msg); },
    gSlot(id) { F.gearSlot = id; UI.wm.render('gear'); },
    gEquip(id) { after(OV.equipGear(D(), S(), id)); },
    gEquipBest() { OV.equipBest(D(), S()); after({ ok: true }, 'Best gear equipped'); },
    gUpGear(id) { after(OV.upgradeGear(D(), S(), id), 'Gear upgraded'); },
    gSalvage(id) { after(OV.salvageGear(D(), S(), id), 'Salvaged'); },
    gLockGear(id) { OV.lockGear(S(), id); UI.wm.render('gear'); },
  });
  UI.rivalExtraHTML = function (r) {
    const st = OV.state, db = OV.db;
    if (r.defeated) return '';
    const og = OV.guildOf(st, r.id);
    const mine = st.guild && st.guild.members.includes(r.id);
    const chk = st.guild ? OV.canInvite(db, st, r) : { ok: false, why: 'Found a guild first' };
    return `<div class="dip-x"><div class="kv small"><span>Agentic Guild</span><b>${mine ? `<span class="good">⌬ Your guild</span>` : og ? `<i style="color:${og.color}">${esc(og.name)}</i> (Lv ${og.level})` : 'none'}</b></div>
      ${mine ? '' : `<div class="dip-acts"><button class="btn sm" data-act="gInvite" data-id="${r.id}" ${chk.ok ? '' : 'disabled'} title="${chk.ok ? 'Invite into your guild' : esc(chk.why)}">⌬ Invite to guild <span>${UI.costHTML({ data: 100 }, st)}</span></button></div>`}</div>`;
  };
  const at = UI.DOCK.findIndex((d) => d[0] === 'arsenal');
  UI.DOCK.splice(at + 1, 0, ['guild', '⌬', 'Guild', 'U'], ['gear', '❖', 'Gear', 'E']);
})(window.OV);
