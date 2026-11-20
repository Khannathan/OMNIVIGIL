// Shared types for the OMNIVIGIL namespace. The legacy JS modules are untyped (any) until they
// are converted; new TypeScript code describes what it uses here.
export interface GlobeLook {
  atm: number[] | null; cloudCol: number[]; ring: { tilt?: number; color: string; inner: number; outer: number; gaps: number } | null;
  [k: string]: any;
}
export interface GlobeTex {
  TW: number; TH: number; W: number; H: number; TS: number; CW: number; CH: number;
  albedo: Uint32Array; emis: Uint32Array; water: Uint8Array; cloud: Uint8Array; look: GlobeLook;
  [k: string]: any;
}
export interface GLView {
  dw: number; dh: number; px: number; cx: number; cy: number; R: number; yaw: number; pitch: number; t: number; st: any;
  sun: number[]; gridOn?: number; cloudOff: number; cloudFade: number; dith: number; bg?: number; starsOn?: boolean;
  patch?: { canvas: HTMLCanvasElement; x0: number; y0: number; w: number; h: number; version: number; alpha: number; soft: number } | null;
}
export type OVNamespace = any;
