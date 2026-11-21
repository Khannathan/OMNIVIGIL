// Procedural names and flavour lines. Every name comes from the object's own seed, so the same
// galaxy is always called the same thing on the same universe seed.
import { rng, Rng, pick } from './hash';

const ON = ['v', 'th', 'k', 'z', 's', 'r', 'm', 'n', 'l', 'd', 'c', 'x', 'ae', 'or', 'il', 'q', 'h', 'sh', 'vr', 'kh', 'ty', 'br', 'gl', 'ph', 'y', 'tz', 'ss', 'dr', 'cr', 'ul'];
const NU = ['a', 'e', 'i', 'o', 'u', 'ae', 'ia', 'eo', 'y', 'ai', 'ou', 'ei', 'a', 'e', 'o'];
const CO = ['', 'n', 'r', 's', 'th', 'l', 'x', 'nd', 'rn', 'ss', 'k', 'm', 'sh', 'v', 'ch', 'lt', 'rk', 'st'];
function word(r: Rng, min = 2, max = 3): string {
  const n = min + Math.floor(r() * (max - min + 1)); let w = '';
  for (let i = 0; i < n; i++) w += pick(r, ON) + pick(r, NU) + (i === n - 1 || r() < 0.3 ? pick(r, CO) : '');
  w = w.replace(/(.)\1\1+/g, '$1$1');
  return w.charAt(0).toUpperCase() + w.slice(1);
}
const GAL_FORMS = ['{w} Wheel', 'The {w} Spiral', '{w}', '{w} Expanse', '{w}’s Veil', 'The {w} Drift', '{w} Cloud', '{w} Crown', 'Great {w}', 'The {w} Lantern', '{w} Reach', '{w} Halo', '{w} Lens', '{w} Maelstrom', 'Old {w}', 'The {w} Bloom'];
const GREEK = ['Alpha', 'Beta', 'Gamma', 'Delta', 'Epsilon', 'Zeta', 'Eta', 'Theta', 'Iota', 'Kappa', 'Lambda', 'Mu', 'Nu', 'Xi', 'Omicron', 'Pi', 'Rho', 'Sigma', 'Tau', 'Upsilon', 'Phi', 'Chi', 'Psi', 'Omega'];
export const ROMAN = ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X', 'XI', 'XII', 'XIII', 'XIV', 'XV', 'XVI'];

export function galaxyName(seed: number, major: boolean): string {
  const r = rng(seed ^ 0x6a1);
  if (!major) return `${word(r, 1, 2).toUpperCase().slice(0, 3)}-${100 + Math.floor(r() * 8900)}`;
  return pick(r, GAL_FORMS).replace('{w}', word(r, 2, 3));
}
export function starName(seed: number, lum: boolean): string {
  const r = rng(seed ^ 0x57a);
  const k = r();
  if (lum || k < 0.45) return word(r, 2, 3);
  if (k < 0.7) return `${pick(r, GREEK)} ${word(r, 2, 2)}`;
  if (k < 0.88) return `${word(r, 1, 2)}-${Math.floor(r() * 990) + 10}`;
  return `${word(r, 2, 2)} ${pick(r, ['Prime', 'Minor', 'Major', 'Deep', 'Far', 'Hollow', 'Vigil'])}`;
}
export function regionName(seed: number): string {
  const r = rng(seed ^ 0x3e9);
  return pick(r, ['The {w} Reach', '{w} Deep', 'Sector {w}', 'The {w} Shoals', '{w} Verge', 'The {w} Narrows', '{w} March', 'The {w} Gulf']).replace('{w}', word(r, 2, 2));
}
export function featureName(seed: number, kind: string): string {
  const r = rng(seed ^ 0x77f);
  const w = word(r, 2, 3);
  return pick(r, [`${w} ${kind}`, `The ${w} ${kind}`, `${kind} of ${w}`, `${w}`]);
}
export function nameWord(seed: number, min = 2, max = 3) { return word(rng(seed), min, max); }

export function fmtCount(n: number): string {
  if (n >= 1e12) return (n / 1e12).toFixed(1) + ' trillion';
  if (n >= 1e9) return (n / 1e9).toFixed(n >= 1e10 ? 0 : 1) + ' billion';
  if (n >= 1e6) return (n / 1e6).toFixed(n >= 1e7 ? 0 : 1) + ' million';
  if (n >= 1e3) return Math.round(n).toLocaleString('en-US');
  return String(Math.round(n));
}
