// Orthographic camera: yaw around the system pole, pitch away from straight down.
export class Cam {
  cx = 0; cy = 0; cz = 0; yaw = 0; pitch = 0.62; scale = 40; W = 320; H = 180;
  R = [1, 0, 0]; U = [0, 1, 0]; V = [0, 0, 1];
  update() {
    const cy = Math.cos(this.yaw), sy = Math.sin(this.yaw), cp = Math.cos(this.pitch), sp = Math.sin(this.pitch);
    this.R = [cy, -sy, 0]; this.U = [cp * sy, cp * cy, sp]; this.V = [-sp * sy, -sp * cy, cp];
  }
  /** world AU -> screen pixels; returns depth (toward viewer) in out[2] */
  proj(x: number, y: number, z: number, out: Float64Array | number[]) {
    const dx = x - this.cx, dy = y - this.cy, dz = z - this.cz; const R = this.R, U = this.U, V = this.V;
    out[0] = this.W / 2 + (dx * R[0] + dy * R[1] + dz * R[2]) * this.scale;
    out[1] = this.H / 2 - (dx * U[0] + dy * U[1] + dz * U[2]) * this.scale;
    out[2] = dx * V[0] + dy * V[1] + dz * V[2];
  }
  /** screen pixel -> point on the z = 0 plane */
  unproject(sx: number, sy: number): [number, number] {
    const u = (sx - this.W / 2) / this.scale, w = (this.H / 2 - sy) / this.scale; const R = this.R, U = this.U, V = this.V;
    const t = -(this.cz + u * R[2] + w * U[2]) / V[2];
    return [this.cx + u * R[0] + w * U[0] + t * V[0], this.cy + u * R[1] + w * U[1] + t * V[1]];
  }
}
