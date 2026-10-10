import { encodeQr } from '@/lib/qr';

import type { PhotoReferral } from './referral';

/**
 * LE CARRÉ QR DU LIEN DE PARRAINAGE (#9554) — « juste un carré QR code pour
 * pouvoir capturer et y aller ». UNE matrice, DEUX peintres : l'aperçu la trace
 * en SVG (`qrPath`), l'image exportée la remplit sur son `canvas` — tous deux
 * depuis les mêmes rectangles, donc le carré qu'on voit est celui qui part.
 *
 * Le carré se mesure dans les pixels de l'image exportée : un module fait un
 * nombre ENTIER de pixels (un module à cheval sur deux pixels se lit mal), deux
 * au moins, et la matrice est centrée dans un carré clair qui lui laisse sa
 * marge de silence. Un lien que la place ne rendrait pas lisible ne rend pas de
 * carré ; un emplacement sans jeton (#7742) non plus — jamais un QR d'un lien
 * qui n'existe pas.
 *
 * Les deux couleurs sont écrites : un QR se lit sombre sur clair, quel que soit
 * le thème de celui qui le montre.
 */

export const QR_QUIET_MODULES = 4;
export const QR_MIN_MODULE_PX = 2;
export const QR_LIGHT = '#ffffff';
export const QR_DARK = '#000000';

/** Une suite horizontale de modules sombres, en pixels du carré. */
export type QrRun = { readonly x: number; readonly y: number; readonly w: number; readonly h: number };

export type QrSquare = {
  /** Le côté du carré clair, marge de silence comprise. */
  readonly side: number;
  /** Le côté de la matrice, en modules. */
  readonly size: number;
  /** Le côté d'un module, en pixels entiers. */
  readonly module: number;
  /** Où commence la matrice dans le carré, sur les deux axes. */
  readonly origin: number;
  readonly runs: readonly QrRun[];
};

const runsOf = (row: readonly boolean[], y: number, module: number, origin: number): readonly QrRun[] =>
  row.reduce<readonly QrRun[]>((runs, dark, x) => {
    if (!dark) return runs;
    const last = runs.at(-1);
    const left = origin + x * module;
    if (last !== undefined && last.x + last.w === left) return [...runs.slice(0, -1), { ...last, w: last.w + module }];
    return [...runs, { x: left, y: origin + y * module, w: module, h: module }];
  }, []);

export function referralQr(referral: Pick<PhotoReferral, 'url' | 'placeholder'>, side: number): QrSquare | null {
  if (referral.placeholder === true || referral.url === '') return null;
  const room = Math.floor(side / QR_MIN_MODULE_PX) - QR_QUIET_MODULES * 2;
  const matrix = encodeQr(referral.url, { maxVersion: Math.floor((room - 17) / 4) });
  if (matrix === null) return null;
  const module = Math.floor(side / (matrix.size + QR_QUIET_MODULES * 2));
  const origin = Math.floor((side - matrix.size * module) / 2);
  return { side, size: matrix.size, module, origin, runs: matrix.modules.flatMap((row, y) => runsOf(row, y, module, origin)) };
}

/** Les rectangles en UN tracé SVG, dans une vue de `side` × `side`. */
export const qrPath = (square: QrSquare): string => square.runs.map((run) => `M${run.x} ${run.y}h${run.w}v${run.h}h-${run.w}z`).join('');
