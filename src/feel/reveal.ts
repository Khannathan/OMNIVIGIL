// OMNIVIGIL v6 - reward reveals. Gacha pulls, gear drops and new Source Codes play a card
// reveal: cards drop in face down, flip one by one, and rarer cards pause, flash their colour,
// burst light and play a bigger sting. Click or press any key to hurry it, then to close.
import { sfx } from './audio';

export interface RevealItem { name: string; rarity: string; color: string; tier: number; icon?: string; kind: string; sub?: string }

const queue: { title: string; items: RevealItem[] }[] = [];
let busy = false;
const esc = (s: string) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c] as string));

export function reveal(title: string, items: RevealItem[]) {
  if (!items.length) return;
  queue.push({ title, items });
  if (!busy) next();
}

function next() {
  const job = queue.shift();
  if (!job) { busy = false; return; }
  busy = true;
  const best = Math.max(...job.items.map((i) => i.tier));
  const el = document.createElement('div');
  el.className = 'ov-reveal';
  el.style.setProperty('--best', job.items.find((i) => i.tier === best)!.color);
  el.innerHTML = `<div class="rv-title">${esc(job.title)}</div><div class="rv-cards ${job.items.length > 5 ? 'many' : ''}">${job.items.map((it, i) => `
    <div class="rv-card t${it.tier}" style="--rc:${it.color};--i:${i}">
      <div class="rv-in"><div class="rv-back"><span>◈</span></div>
      <div class="rv-face"><div class="rv-rar">${esc(it.rarity)}</div><div class="rv-icon">${esc(it.icon || '✦')}</div><div class="rv-name">${esc(it.name)}</div><div class="rv-kind">${esc(it.kind)}${it.sub ? ' · ' + esc(it.sub) : ''}</div></div></div>
    </div>`).join('')}</div><div class="rv-hint">click to continue</div>`;
  document.body.appendChild(el);
  const cards = [...el.querySelectorAll<HTMLElement>('.rv-card')];
  let i = 0, timer: any = 0, done = false;
  const flipNext = () => {
    if (i >= cards.length) { done = true; el.classList.add('done'); return; }
    const c = cards[i], it = job.items[i]; i++;
    c.classList.add('flip'); sfx.flip();
    if (it.tier >= 2) { setTimeout(() => { c.classList.add('burst'); sfx.reward(it.tier); if (it.tier >= 3) el.classList.add('flash'); setTimeout(() => el.classList.remove('flash'), 450); }, 160); }
    timer = setTimeout(flipNext, it.tier >= 3 ? 900 : it.tier >= 2 ? 450 : 200);
  };
  setTimeout(() => { el.classList.add('in'); timer = setTimeout(flipNext, 450); }, 20);
  if (best < 2) setTimeout(() => sfx.reward(best), 500);
  const close = () => { clearTimeout(timer); el.classList.add('out'); setTimeout(() => { el.remove(); next(); }, 250); window.removeEventListener('keydown', key, true); };
  const hurry = () => { clearTimeout(timer); while (i < cards.length) { cards[i].classList.add('flip'); if (job.items[i].tier >= 2) cards[i].classList.add('burst'); i++; } done = true; el.classList.add('done'); };
  const key = (e: KeyboardEvent) => { e.stopPropagation(); e.preventDefault(); done ? close() : hurry(); };
  el.addEventListener('click', () => (done ? close() : hurry()));
  window.addEventListener('keydown', key, true);
}
