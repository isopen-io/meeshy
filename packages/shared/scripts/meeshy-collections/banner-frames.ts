/**
 * Les CADRES DE BANNIÈRE par Meeshy (#15158) — six fixes et quatre animés, au gabarit 300 × 100 que le rendu
 * étire sans déformer. Ils restent à la LISIÈRE : une bordure de 3 à 7 unités (moins de 7 % de la hauteur),
 * des coins de 12 au plus, et aucun cartouche en bas, là où la bannière porte niveau et compteurs ; le centre
 * reste transparent. Chaque cadre unit un ton sombre et un ton clair, pour se lire sur une photo claire
 * comme sur une sombre. L'animation est DÉCLARÉE (`motion` : reflet, scintillement, pulsation), rendue par
 * le GPU et arrêtée sous « réduire les animations » : le cadre fixe reste.
 */
import type { P } from '../illustrated-rings/kit.js';
import { circlePath, crescentPath, diamondPoints, dotsPath, n2, polygonPath, polylinePath, starPoints } from './geometry.js';

type FramePath = { readonly d: string; readonly color: number; readonly opacity: number; readonly width?: number; readonly gradient?: number; readonly group?: string };
type Piece = { readonly anchor: 'start' | 'center' | 'end'; readonly paths: readonly FramePath[] };
type Frieze = { readonly module: number; readonly from: number; readonly to: number; readonly fit: 'repeat' | 'justify'; readonly paths: readonly FramePath[] };
type Motion = { readonly kind: 'twinkle' | 'sweep' | 'pulse'; readonly targets: readonly string[]; readonly duration: number; readonly stagger?: number; readonly amplitude?: number; readonly origin?: 'self' };

export type BannerFrame = {
  readonly key: string;
  readonly viewBox: readonly [0, 0, 300, 100];
  readonly palette: readonly string[];
  readonly gradients?: readonly unknown[];
  readonly border: { readonly width: number; readonly color: number; readonly opacity: number; readonly gradient?: number; readonly filets: readonly { readonly inset: number; readonly width: number; readonly color: number; readonly opacity: number; readonly gradient?: number }[] };
  readonly reach: { readonly corner: number; readonly cartouche?: { readonly width: number; readonly depth: number; readonly edge: 'top' } };
  readonly pieces?: readonly Piece[];
  readonly friezes?: readonly Frieze[];
  readonly motion?: readonly Motion[];
};

const VIEWBOX = [0, 0, 300, 100] as const;
const R = 300;

/** Les quatre coins d'une forme dessinée en haut à gauche : miroir horizontal (bord droit) et vertical (bas). */
type Corner = (flipX: boolean, flipY: boolean) => string;
const flip = (flipX: boolean, flipY: boolean) => ([x, y]: P): P => [flipX ? R - x : x, flipY ? 100 - y : y];

/** Les coins en pièces : `start` porte ceux de gauche, `end` ceux de droite ; un groupe par coin si `groups`. */
function corners(draw: Corner, paint: Omit<FramePath, 'd' | 'group'>, groups?: readonly [string, string, string, string]): readonly Piece[] {
  const path = (flipX: boolean, flipY: boolean, index: number): FramePath => ({ d: draw(flipX, flipY), ...paint, ...(groups === undefined ? {} : { group: groups[index] }) });
  return [
    { anchor: 'start', paths: [path(false, false, 0), path(false, true, 2)] },
    { anchor: 'end', paths: [path(true, false, 1), path(true, true, 3)] },
  ];
}

const merge = (pieces: readonly (readonly Piece[])[]): readonly Piece[] =>
  (['start', 'center', 'end'] as const).flatMap((anchor) => {
    const paths = pieces.flat().filter((piece) => piece.anchor === anchor).flatMap((piece) => piece.paths);
    return paths.length === 0 ? [] : [{ anchor, paths }];
  });

/**
 * Un FILET plein, en groupe `bande`, que le reflet balaie : une bande pleine de `thickness` à `inset` du bord,
 * en deux montants et une frise qui tombe juste. Pleine (jamais un trait) : le masque du reflet est sa forme.
 */
const strip = (inset: number, thickness: number, paint: Omit<FramePath, 'd' | 'group'>): { readonly pieces: readonly Piece[]; readonly frieze: Frieze } => {
  const a = inset;
  const b = inset + thickness;
  return {
    pieces: [
      { anchor: 'start', paths: [{ d: `M${a} ${a}H${b}V${100 - a}H${a}Z`, ...paint, group: 'bande' }] },
      { anchor: 'end', paths: [{ d: `M${R - b} ${a}H${R - a}V${100 - a}H${R - b}Z`, ...paint, group: 'bande' }] },
    ],
    frieze: { module: 60, from: 0, to: 0, fit: 'justify', paths: [{ d: `M0 ${a}H60V${b}H0ZM0 ${100 - b}H60V${100 - a}H0Z`, ...paint, group: 'bande' }] },
  };
};

const GOLD = { kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 1, at: 0 }, { color: 3, at: 0.5 }, { color: 2, at: 1 }] };

// ── Liseré d'or ─────────────────────────────────────────────────────────

const bracket: Corner = (fx, fy) => polylinePath([[2.2, 11], [2.2, 2.2], [11, 2.2]].map(flip(fx, fy)));
const stud: Corner = (fx, fy) => polygonPath(diamondPoints([6, 6], 1.6).map(flip(fx, fy)));

const liseretOr = (key: string, animated: boolean): BannerFrame => {
  const gold = strip(0.6, 0.9, { color: 1, gradient: 0, opacity: 1 });
  const outer = animated ? [] : [{ inset: 0.8, width: 0.8, color: 1, gradient: 0, opacity: 1 }];
  return {
    key,
    viewBox: VIEWBOX,
    palette: ['#1C1917', '#E8C877', '#A47A2C', '#FFF4CF'],
    gradients: [GOLD],
    border: { width: 4, color: 0, opacity: animated ? 0.8 : 0.6, filets: [...outer, { inset: 3.3, width: 0.45, color: 1, opacity: 0.85 }] },
    reach: { corner: 11 },
    pieces: merge([...(animated ? [gold.pieces] : []), corners(bracket, { color: 1, gradient: 0, opacity: 1, width: 1.1 }), corners(stud, { color: 3, opacity: 1 }, animated ? ['g0', 'g1', 'g2', 'g3'] : undefined)]),
    ...(animated
      ? {
          friezes: [gold.frieze],
          motion: [
            { kind: 'sweep', targets: ['bande'], duration: 6.5 },
            { kind: 'twinkle', targets: ['g0', 'g1', 'g3', 'g2'], duration: 3.2, stagger: 0.8, amplitude: 0.7 },
          ],
        }
      : {}),
  };
};

// ── Volutes ─────────────────────────────────────────────────────────────

const scroll: Corner = (fx, fy) => {
  const f = flip(fx, fy);
  const p = (x: number, y: number) => {
    const [px, py] = f([x, y]);
    return `${n2(px)} ${n2(py)}`;
  };
  return `M${p(2.4, 13)}Q${p(2.4, 2.4)} ${p(13, 2.4)}M${p(5, 12)}Q${p(5, 5)} ${p(12, 5)}`;
};

const VOLUTES: BannerFrame = {
  key: 'volutes',
  viewBox: VIEWBOX,
  palette: ['#0F172A', '#E2E8F0', '#94A3B8', '#F8FAFC'],
  border: { width: 3.2, color: 0, opacity: 0.55, filets: [{ inset: 0.6, width: 0.5, color: 1, opacity: 0.95 }, { inset: 2.7, width: 0.4, color: 2, opacity: 0.9 }] },
  reach: { corner: 12 },
  pieces: merge([corners(scroll, { color: 1, opacity: 1, width: 0.7 }), corners((fx, fy) => `${circlePath(1.1, flip(fx, fy)([7.6, 7.6]))}${circlePath(0.6, flip(fx, fy)([12.4, 12.4]))}`, { color: 3, opacity: 1 })]),
};

// ── Rang de perles ──────────────────────────────────────────────────────

const pearlColumn = (x: number): readonly P[] => Array.from({ length: 14 }, (_, index): P => [x, 11 + index * 6]);

const rangDePerles = (key: string, animated: boolean): BannerFrame => {
  const shine = animated ? { group: 'bande' } : {};
  const pearls = (x: number, anchor: 'start' | 'end'): Piece => ({
    anchor,
    paths: [{ d: dotsPath(pearlColumn(x), 1.45), color: 2, opacity: 1, ...shine }, { d: dotsPath(pearlColumn(x).map(([px, py]): P => [px - 0.45, py - 0.5]), 0.45), color: 3, opacity: 0.95 }],
  });
  return {
    key,
    viewBox: VIEWBOX,
    palette: ['#1F1B2E', '#F5F0FA', '#CFC5E3', '#FFFFFF'],
    border: { width: 5, color: 0, opacity: animated ? 0.75 : 0.5, filets: [{ inset: 5, width: 0.4, color: 1, opacity: 0.9 }] },
    reach: { corner: 8 },
    pieces: merge([
      [pearls(2.5, 'start'), pearls(R - 2.5, 'end')],
      corners((fx, fy) => circlePath(2.3, flip(fx, fy)([4, 4])), { color: 1, opacity: 1 }, animated ? ['g0', 'g1', 'g2', 'g3'] : undefined),
    ]),
    friezes: [
      { module: 6, from: 8, to: 8, fit: 'justify', paths: [{ d: dotsPath([[11, 2.5], [11, 97.5]], 1.45), color: 2, opacity: 1, ...shine }, { d: dotsPath([[10.55, 2], [10.55, 97]], 0.45), color: 3, opacity: 0.95 }] },
    ],
    ...(animated
      ? {
          motion: [
            { kind: 'sweep', targets: ['bande'], duration: 7 },
            { kind: 'twinkle', targets: ['g0', 'g1', 'g3', 'g2'], duration: 2.8, stagger: 0.7, amplitude: 0.6 },
          ],
        }
      : {}),
  };
};

// ── Onyx ────────────────────────────────────────────────────────────────

const ONYX: BannerFrame = {
  key: 'onyx',
  viewBox: VIEWBOX,
  palette: ['#0A0A0A', '#2A2A2A', '#D4AF37', '#F5E6A8'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 3, at: 0 }, { color: 2, at: 1 }] }],
  border: { width: 6.5, color: 0, opacity: 0.85, filets: [{ inset: 1, width: 0.5, color: 2, opacity: 0.9 }, { inset: 5.9, width: 0.5, color: 2, opacity: 0.9 }] },
  reach: { corner: 12, cartouche: { width: 14, depth: 7, edge: 'top' } },
  pieces: merge([
    corners((fx, fy) => polygonPath(diamondPoints([6.5, 6.5], 3.4).map(flip(fx, fy))), { color: 2, gradient: 0, opacity: 1 }),
    corners((fx, fy) => polygonPath(diamondPoints([6.5, 6.5], 1.4).map(flip(fx, fy))), { color: 0, opacity: 0.9 }),
    [{ anchor: 'center', paths: [{ d: polygonPath(diamondPoints([150, 3.4], 2.8, 2.4)), color: 2, gradient: 0, opacity: 1 }] }],
  ]),
};

// ── Marqueterie ─────────────────────────────────────────────────────────

const MARQUETERIE: BannerFrame = {
  key: 'marqueterie',
  viewBox: VIEWBOX,
  palette: ['#3B2A1E', '#C8A27A', '#6B4A33', '#EADBC8'],
  border: { width: 6, color: 0, opacity: 0.9, filets: [{ inset: 0.5, width: 0.4, color: 3, opacity: 0.8 }, { inset: 5.5, width: 0.4, color: 3, opacity: 0.8 }] },
  reach: { corner: 7 },
  pieces: merge([
    ...(['start', 'end'] as const).map((anchor): readonly Piece[] => {
      const x = anchor === 'start' ? 1.2 : R - 4.8;
      const ys = Array.from({ length: 11 }, (_, index) => 8 + index * 8);
      return [
        { anchor, paths: [
          { d: ys.map((y) => polygonPath([[x, y], [x + 3.6, y], [x + 1.8, y + 4]])).join(''), color: 1, opacity: 1 },
          { d: ys.map((y) => polygonPath([[x, y + 8], [x + 1.8, y + 4], [x + 3.6, y + 8]])).join(''), color: 2, opacity: 1 },
        ] },
      ];
    }),
    corners((fx, fy) => polygonPath([[0.8, 0.8], [6.2, 0.8], [6.2, 6.2], [0.8, 6.2]].map(flip(fx, fy))), { color: 1, opacity: 1 }),
    corners((fx, fy) => polygonPath(diamondPoints([3.5, 3.5], 1.6).map(flip(fx, fy))), { color: 0, opacity: 0.9 }),
  ]),
  friezes: [
    { module: 8, from: 7, to: 7, fit: 'justify', paths: [
      { d: `${polygonPath([[7, 1.2], [11, 4.8], [15, 1.2]])}${polygonPath([[7, 98.8], [11, 95.2], [15, 98.8]])}`, color: 1, opacity: 1 },
      { d: `${polygonPath([[7, 4.8], [11, 1.2], [15, 4.8]])}${polygonPath([[7, 95.2], [11, 98.8], [15, 95.2]])}`, color: 2, opacity: 1 },
    ] },
  ],
};

// ── Minuit ──────────────────────────────────────────────────────────────

const starRow = (stars: readonly (readonly [number, number, number])[]): string => stars.map(([x, y, size]) => polygonPath(starPoints([x, y], size))).join('');

const minuit = (key: string, animated: boolean): BannerFrame => ({
  key,
  viewBox: VIEWBOX,
  palette: ['#0B1033', '#24308A', '#F8E7A1', '#8EA2FF'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ color: 1, at: 0 }, { color: 0, at: 1 }] }],
  border: { width: 5, color: 0, gradient: 0, opacity: 0.85, filets: [{ inset: 4.6, width: 0.4, color: 3, opacity: 0.85 }] },
  reach: { corner: 12 },
  pieces: [
    { anchor: 'start', paths: [
      { d: crescentPath([6.4, 6.4], 4.2, [8.2, 5.2], 3.5), color: 2, opacity: 1, ...(animated ? { group: 'lune' } : {}) },
      { d: starRow([[2.5, 30, 1.2], [2.5, 52, 0.9], [2.5, 74, 1.3], [8.5, 94, 1]]), color: 2, opacity: 0.95, ...(animated ? { group: 's0' } : {}) },
    ] },
    { anchor: 'center', paths: [{ d: starRow([[128, 2.5, 1], [150, 2.4, 1.5], [172, 2.6, 1]]), color: 2, opacity: 1, ...(animated ? { group: 's1' } : {}) }] },
    { anchor: 'end', paths: [
      { d: polygonPath(starPoints([R - 6.4, 6.4], 3.4, 0.2)), color: 2, opacity: 1, ...(animated ? { group: 's2' } : {}) },
      { d: starRow([[R - 2.5, 26, 1], [R - 2.5, 48, 1.3], [R - 2.5, 70, 0.9], [R - 8.5, 94, 1.1]]), color: 2, opacity: 0.95, ...(animated ? { group: 's3' } : {}) },
    ] },
  ],
  friezes: [{ module: 24, from: 14, to: 14, fit: 'repeat', paths: [{ d: starRow([[20, 2.6, 0.8], [31, 97.4, 0.9]]), color: 3, opacity: 0.9 }] }],
  ...(animated
    ? {
        motion: [
          { kind: 'twinkle', targets: ['s0', 's1', 's3', 's2'], duration: 3.6, stagger: 0.9, amplitude: 0.75 },
          { kind: 'pulse', targets: ['lune'], duration: 5, amplitude: 0.08, origin: 'self' },
        ],
      }
    : {}),
});

// ── Néon (animé seulement) ──────────────────────────────────────────────

const neonBracket: Corner = (fx, fy) => polylinePath(([[4.2, 12], [4.2, 4.2], [12, 4.2]] as const).map((point) => flip(fx, fy)(point as unknown as P)));
const NEON: BannerFrame = (() => {
  const cyan = strip(0.7, 1.1, { color: 1, opacity: 1 });
  return {
    key: 'neon',
    viewBox: VIEWBOX,
    palette: ['#0B0B1A', '#22D3EE', '#F472B6', '#E0F2FE'],
    border: { width: 3.4, color: 0, opacity: 0.85, filets: [{ inset: 2.6, width: 0.6, color: 2, opacity: 1 }] },
    reach: { corner: 12, cartouche: { width: 22, depth: 5, edge: 'top' } },
    pieces: merge([
      cyan.pieces,
      corners(neonBracket, { color: 3, opacity: 1, width: 1.2 }, ['n0', 'n1', 'n2', 'n3']),
      [{ anchor: 'center', paths: [{ d: 'M141 4.4H159', color: 2, opacity: 1, width: 1.4, group: 'trait' }] }],
    ]),
    friezes: [cyan.frieze],
    motion: [
      { kind: 'sweep', targets: ['bande'], duration: 5 },
      { kind: 'twinkle', targets: ['n0', 'n1', 'n3', 'n2'], duration: 2.4, stagger: 0.6, amplitude: 0.55 },
      { kind: 'pulse', targets: ['trait'], duration: 3, amplitude: 0.12, origin: 'self' },
    ],
  };
})();

export const SIGNATURE_FRAMES: readonly BannerFrame[] = [liseretOr('liseret-or', false), VOLUTES, rangDePerles('rang-de-perles', false), ONYX, MARQUETERIE, minuit('minuit', false)];
export const VIVANT_FRAMES: readonly BannerFrame[] = [liseretOr('liseret-lumiere', true), rangDePerles('perles-vives', true), minuit('nuit-vive', true), NEON];
