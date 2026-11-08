/**
 * Les briques géométriques des COLLECTIONS MEESHY (#15158) : chemins SVG à deux décimales pour les
 * formes FIXES (contours dans leur viewBox 0 0 100 100, cadres de bannière dans 0 0 300 100, tuiles
 * de fond), et films Lottie de taille libre, construits sur le kit des cadres illustrés.
 */
import { FPS, layer, type P } from '../illustrated-rings/kit.js';

export const n2 = (value: number): string => String(Math.round(value * 100) / 100);
const pt = ([x, y]: P): string => `${n2(x)} ${n2(y)}`;

/** Un point à `r` de `center`, à `degrees` (0 = à droite, 90 = en bas). */
export const at = (r: number, degrees: number, center: P = [50, 50]): P => {
  const radians = (degrees * Math.PI) / 180;
  return [center[0] + r * Math.cos(radians), center[1] + r * Math.sin(radians)];
};

/** Un cercle fermé ; `clockwise` inverse le sens, pour évider un cercle dans un autre (règle non nulle). */
export const circlePath = (r: number, center: P = [50, 50], clockwise = false): string => {
  const sweep = clockwise ? 1 : 0;
  return `M${n2(center[0] - r)} ${n2(center[1])}A${n2(r)} ${n2(r)} 0 1 ${sweep} ${n2(center[0] + r)} ${n2(center[1])}A${n2(r)} ${n2(r)} 0 1 ${sweep} ${n2(center[0] - r)} ${n2(center[1])}Z`;
};

export const polygonPath = (points: readonly P[]): string => `M${points.map(pt).join('L')}Z`;
export const polylinePath = (points: readonly P[]): string => `M${points.map(pt).join('L')}`;

/** Des disques, en UN chemin. */
export const dotsPath = (centers: readonly P[], r: number): string => centers.map((center) => circlePath(r, center)).join('');

/** Une étoile à quatre branches, en polygone. */
export const starPoints = ([x, y]: P, size: number, waist = 0.22): P[] => {
  const w = size * waist;
  return [[x, y - size], [x + w, y - w], [x + size, y], [x + w, y + w], [x, y + size], [x - w, y + w], [x - size, y], [x - w, y - w]];
};

/** Un losange centré. */
export const diamondPoints = ([x, y]: P, rx: number, ry = rx): P[] => [[x, y - ry], [x + rx, y], [x, y + ry], [x - rx, y]];

/** Une feuille en amande entre deux points, bombée de `bulge` des deux côtés. */
export const leafPath = (from: P, to: P, bulge: number): string => {
  const mid: P = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * bulge * 2;
  const ny = (dx / length) * bulge * 2;
  return `M${pt(from)}Q${pt([mid[0] + nx, mid[1] + ny])} ${pt(to)}Q${pt([mid[0] - nx, mid[1] - ny])} ${pt(from)}Z`;
};

/** `count` angles réguliers depuis `start`. */
export const around = (count: number, start = -90): number[] => Array.from({ length: count }, (_, index) => start + (index * 360) / count);

// ── Les films ───────────────────────────────────────────────────────────

/** Un film de `width × height` unités, `pieces` du FOND vers l'AVANT, en un seul calque, bouclé à 30 i/s. */
export const filmOf = (name: string, seconds: number, width: number, height: number, pieces: readonly unknown[]) => {
  const frames = seconds * FPS;
  return { v: '5.7.0', fr: FPS, ip: 0, op: frames, w: width, h: height, nm: name, ddd: 0, assets: [], layers: [layer(pieces, frames)], markers: [] };
};

/** Un croissant : le disque (`outer`, `r1`) privé du disque (`inner`, `r2`) qui le mord. */
export const crescentPath = (outer: P, r1: number, inner: P, r2: number): string => {
  const dx = inner[0] - outer[0];
  const dy = inner[1] - outer[1];
  const d = Math.hypot(dx, dy);
  const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
  const h = Math.sqrt(Math.max(r1 * r1 - a * a, 0));
  const base: P = [outer[0] + (a * dx) / d, outer[1] + (a * dy) / d];
  const one: P = [base[0] - (h * dy) / d, base[1] + (h * dx) / d];
  const two: P = [base[0] + (h * dy) / d, base[1] - (h * dx) / d];
  return `M${pt(one)}A${n2(r1)} ${n2(r1)} 0 1 1 ${pt(two)}A${n2(r2)} ${n2(r2)} 0 0 0 ${pt(one)}Z`;
};
