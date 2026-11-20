// OMNIVIGIL - shared utilities (seeded RNG, number formatting, helpers)
window.OV = window.OV || {};

(function (OV) {
  'use strict';

  // ---------- Seeded RNG ----------
  function hashString(str) {
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) {
      h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
      h = (h << 13) | (h >>> 19);
    }
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  }

  // RNG whose internal state can be saved and restored (keeps runs deterministic across save/load)
  function RNG(seed) {
    this.s = typeof seed === 'number' ? seed >>> 0 : hashString(String(seed));
  }
  RNG.prototype.next = function () {
    let t = (this.s = (this.s + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  RNG.prototype.range = function (a, b) { return a + (b - a) * this.next(); };
  RNG.prototype.int = function (a, b) { return Math.floor(this.range(a, b + 1)); };
  RNG.prototype.chance = function (p) { return this.next() < p; };
  RNG.prototype.pick = function (arr) { return arr[Math.floor(this.next() * arr.length)]; };
  RNG.prototype.weighted = function (arr, wf) {
    const total = arr.reduce((s, x) => s + Math.max(0, wf(x)), 0);
    if (total <= 0) return null;
    let r = this.next() * total;
    for (const x of arr) { r -= Math.max(0, wf(x)); if (r <= 0) return x; }
    return arr[arr.length - 1];
  };
  RNG.prototype.shuffle = function (arr) {
    const a = arr.slice();
    for (let i = a.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [a[i], a[j]] = [a[j], a[i]];
    }
    return a;
  };
  OV.RNG = RNG;
  OV.hashString = hashString;

  // ---------- Value noise (for map generation) ----------
  OV.makeNoise = function (rng) {
    const seed = Math.floor(rng.next() * 4294967296) | 0;
    const hash = (x, y) => {
      let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263)) ^ seed;
      h = Math.imul(h ^ (h >>> 13), 1274126177);
      return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
    };
    // lattice values cached in a 128x128 table: generating a dozen planets stays fast
    const T = new Float32Array(16384);
    for (let y = 0; y < 128; y++) for (let x = 0; x < 128; x++) T[(y << 7) | x] = hash(x, y);
    const smooth = (t) => t * t * (3 - 2 * t);
    function noise(x, y) {
      const xi = Math.floor(x), yi = Math.floor(y);
      const xf = x - xi, yf = y - yi;
      const x0 = xi & 127, x1 = (xi + 1) & 127, y0 = (yi & 127) << 7, y1 = ((yi + 1) & 127) << 7;
      const a = T[y0 | x0], b = T[y0 | x1], c = T[y1 | x0], d = T[y1 | x1];
      const u = smooth(xf), v = smooth(yf);
      return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
    }
    return function fbm(x, y, oct) {
      let amp = 1, freq = 1, sum = 0, norm = 0;
      for (let i = 0; i < (oct || 5); i++) {
        sum += noise(x * freq, y * freq) * amp;
        norm += amp; amp *= 0.5; freq *= 2;
      }
      return sum / norm;
    };
  };


  // 3D value noise, sampled on the unit sphere so planets have no seams or polar stretching.
  // Returns { n(x,y,z) in 0..1, fbm(x,y,z,oct), ridged(x,y,z,oct) }.
  OV.makeNoise3 = function (rng) {
    const P = new Uint8Array(512), V = new Float32Array(256);
    for (let i = 0; i < 256; i++) { P[i] = i; V[i] = rng.next(); }
    for (let i = 255; i > 0; i--) { const j = Math.floor(rng.next() * (i + 1)); const t = P[i]; P[i] = P[j]; P[j] = t; }
    for (let i = 0; i < 256; i++) P[i + 256] = P[i];
    const sm = (t) => t * t * (3 - 2 * t);
    function n(x, y, z) {
      const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z);
      const u = sm(x - xi), v = sm(y - yi), w = sm(z - zi);
      const X = xi & 255, Y = yi & 255, Z = zi & 255;
      const A = P[X] + Y, B = P[X + 1] + Y;
      const AA = P[A] + Z, AB = P[A + 1] + Z, BA = P[B] + Z, BB = P[B + 1] + Z;
      const l = (a, b, t) => a + (b - a) * t;
      return l(l(l(V[P[AA]], V[P[BA]], u), l(V[P[AB]], V[P[BB]], u), v), l(l(V[P[AA + 1]], V[P[BA + 1]], u), l(V[P[AB + 1]], V[P[BB + 1]], u), v), w);
    }
    function fbm(x, y, z, oct) {
      let amp = 1, f = 1, sum = 0, norm = 0;
      for (let i = 0; i < (oct || 5); i++) { sum += n(x * f + i * 17.3, y * f + i * 9.1, z * f + i * 31.7) * amp; norm += amp; amp *= 0.5; f *= 2.03; }
      return sum / norm;
    }
    function ridged(x, y, z, oct) {
      let amp = 1, f = 1, sum = 0, norm = 0, prev = 1;
      for (let i = 0; i < (oct || 4); i++) { let r = 1 - Math.abs(n(x * f + i * 7.7, y * f + i * 3.3, z * f + i * 5.9) * 2 - 1); r *= r; sum += r * amp * prev; prev = r; norm += amp; amp *= 0.5; f *= 2.1; }
      return sum / norm;
    }
    return { n, fbm, ridged };
  };

  // ---------- Number formatting ----------
  // Full number below 10,000, then 10K, 1.5M, 2.25B ... no cap.
  const SUFFIXES = ['', 'K', 'M', 'B', 'T', 'Qa', 'Qi', 'Sx', 'Sp', 'Oc', 'No', 'Dc',
    'UDc', 'DDc', 'TDc', 'QaDc', 'QiDc', 'SxDc', 'SpDc', 'OcDc', 'NoDc', 'Vg'];
  function suffixFor(idx) {
    if (idx < SUFFIXES.length) return SUFFIXES[idx];
    // beyond: aa, ab, ac ... endless
    const n = idx - SUFFIXES.length;
    const a = String.fromCharCode(97 + Math.floor(n / 26) % 26), b = String.fromCharCode(97 + n % 26);
    return a + b;
  }
  OV.fmt = function (n) {
    if (n === undefined || n === null || isNaN(n)) return '0';
    if (!isFinite(n)) return '∞';
    const neg = n < 0; n = Math.abs(n);
    let out;
    if (n < 10000) {
      out = n % 1 === 0 || n >= 100 ? Math.floor(n).toLocaleString('en-US') : (Math.round(n * 10) / 10).toString();
    } else {
      let idx = Math.floor(Math.log10(n) / 3);
      let v = n / Math.pow(1000, idx);
      if (v >= 999.95) { v /= 1000; idx++; }
      const dec = v >= 100 ? 0 : v >= 10 ? 1 : 2;
      out = parseFloat(v.toFixed(dec)).toString() + suffixFor(idx);
    }
    return (neg ? '-' : '') + out;
  };
  OV.pct = (x) => Math.round(x * 100) + '%';

  OV.ROMAN = ['', 'I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'];
  OV.roman = function (n) {
    if (n <= 10) return OV.ROMAN[n];
    const map = [[1000, 'M'], [900, 'CM'], [500, 'D'], [400, 'CD'], [100, 'C'], [90, 'XC'], [50, 'L'], [40, 'XL'], [10, 'X'], [9, 'IX'], [5, 'V'], [4, 'IV'], [1, 'I']];
    let s = '';
    for (const [v, r] of map) while (n >= v) { s += r; n -= v; }
    return s;
  };

  OV.clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  OV.deepClone = (o) => JSON.parse(JSON.stringify(o));
  OV.esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  OV.uid = (() => { let i = 0; return (p) => (p || 'x') + '_' + Date.now().toString(36) + '_' + (i++).toString(36); })();
  OV.sum = (arr, f) => arr.reduce((s, x) => s + (f ? f(x) : x), 0);

  // Template fill: "Hello {name}" with object
  OV.fill = function (str, vars) {
    return String(str || '').replace(/\{(\w+)\}/g, (m, k) => (vars && vars[k] !== undefined ? vars[k] : m));
  };
})(window.OV);
