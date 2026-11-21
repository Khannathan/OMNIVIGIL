// Pointy-top hexes in odd-row offset coordinates. Pixel hexes are 32 wide, 36 tall, rows 27 apart.
export const HW = 32, HH = 36, ROW = 27;
export function key(x: number, y: number) { return y * 1000 + x; }
export function toCube(x: number, y: number) { const q = x - (y - (y & 1)) / 2; return [q, y, -q - y]; }
export function dist(ax: number, ay: number, bx: number, by: number) {
  const [aq, ar, as] = toCube(ax, ay), [bq, br, bs] = toCube(bx, by);
  return Math.max(Math.abs(aq - bq), Math.abs(ar - br), Math.abs(as - bs));
}
const ODD = [[1, 0], [1, -1], [0, -1], [-1, 0], [0, 1], [1, 1]], EVEN = [[1, 0], [0, -1], [-1, -1], [-1, 0], [-1, 1], [0, 1]];
export function neighbors(x: number, y: number, W: number, H: number): [number, number][] {
  const out: [number, number][] = []; const d = y & 1 ? ODD : EVEN;
  for (const [dx, dy] of d) { const nx = x + dx, ny = y + dy; if (nx >= 0 && ny >= 0 && nx < W && ny < H) out.push([nx, ny]); }
  return out;
}
export function inRange(x: number, y: number, r: number, W: number, H: number): [number, number][] {
  const out: [number, number][] = [];
  for (let yy = Math.max(0, y - r); yy <= Math.min(H - 1, y + r); yy++)
    for (let xx = Math.max(0, x - r - 1); xx <= Math.min(W - 1, x + r + 1); xx++) if (dist(x, y, xx, yy) <= r) out.push([xx, yy]);
  return out;
}
export function center(x: number, y: number): [number, number] { return [HW * (x + 0.5 * (y & 1)) + HW / 2, ROW * y + HH / 2]; }
export function fromPixel(px: number, py: number): [number, number] {
  const X = (px - HW / 2) * (18 / (HW / Math.sqrt(3))), Y = py - HH / 2, S = 18;
  let q = (Math.sqrt(3) / 3 * X - Y / 3) / S, r = (2 / 3 * Y) / S, s = -q - r;
  let rq = Math.round(q), rr = Math.round(r), rs = Math.round(s);
  const dq = Math.abs(rq - q), dr = Math.abs(rr - r), ds = Math.abs(rs - s);
  if (dq > dr && dq > ds) rq = -rr - rs; else if (dr > ds) rr = -rq - rs;
  return [rq + (rr - (rr & 1)) / 2, rr];
}
// hex outline points for pixel drawing (pointy top)
export function corners(cx: number, cy: number, shrink = 0): [number, number][] {
  const w = HW / 2 - shrink, h = HH / 2 - shrink, q = HH / 4 - shrink / 2;
  return [[cx, cy - h], [cx + w, cy - q], [cx + w, cy + q], [cx, cy + h], [cx - w, cy + q], [cx - w, cy - q]];
}
