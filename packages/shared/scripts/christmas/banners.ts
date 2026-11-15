/**
 * Les bannières de NOËL (#15553), une par contour de Noël, dans sa palette : animées par des
 * mouvements déclarés (scintillement, balancement, reflet), arrêtées sous « réduire les animations ».
 */
import { type P, sparkle } from '../illustrated-rings/kit.js';
import { type AssortedBanner, CORNER_GROUPS, at, banner, circle, curve, diamond, ellipseShape, leaf, line, mirrorShape, poly, smooth, spread, star, twinkleCorners } from '../assorted-banners/draw.js';

/** Un flocon à six branches, chaque branche portant deux barbes. */
const snowflake = (center: P, r: number) =>
  spread(6, -90, 210).flatMap((degrees) => {
    const tip = at(r, degrees, center);
    const knot = at(r * 0.55, degrees, center);
    return [line([center, tip]), line([at(r * 0.3, degrees - 50, knot), knot, at(r * 0.3, degrees + 50, knot)])];
  });

// ── Noël enneigé ────────────────────────────────────────────────────────
// flocons-tombants : 0 nuit · 1 bleu · 2 neige · 3 glace

export const FLOCONS_TOMBANTS_BANNER: AssortedBanner = banner({
  key: 'flocons-tombants',
  palette: ['#0F2747', '#3B82F6', '#F8FAFC', '#BFE3FF'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ color: 1, at: 0 }, { color: 0, at: 1 }] }],
  border: { width: 5.6, color: 0, gradient: 0, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 3, opacity: 1 }, { inset: 5, width: 0.4, color: 2, opacity: 0.8 }] },
  corner: { size: 16, marks: [{ shapes: snowflake([8, 8], 6.6), color: 2, width: 0.6, group: 'corner' }, { shapes: [circle(1, [8, 8])], color: 3 }] },
  cartouche: { width: 20, depth: 19, marks: [{ shapes: snowflake([0, 9.6], 8.4), color: 2, width: 0.75, group: 'flocon' }, { shapes: [diamond([0, 9.6], 1.6)], color: 3, group: 'flocon' }] },
  frieze: {
    module: 12,
    from: 17,
    fit: 'justify',
    marks: [
      { shapes: snowflake([3, 2.8], 1.7), color: 2, width: 0.35, opacity: 0.9, group: 'neige-a' },
      { shapes: [circle(0.6, [9, 3.4])], color: 3, opacity: 0.9, group: 'neige-b' },
    ],
  },
  motion: [
    { kind: 'rotate', targets: ['flocon'], duration: 20, origin: 'self' },
    { kind: 'twinkle', targets: ['neige-a', 'neige-b', ...CORNER_GROUPS], duration: 3.2, stagger: 0.5, amplitude: 0.7 },
  ],
});

// couronne-de-houx : 0 vert · 1 vert profond · 2 rouge · 3 lumière

const hollyLeaf = (from: P, degrees: number, length: number) => {
  const local: P[] = [[0, 0], [0.2, -0.22], [0.35, -0.12], [0.5, -0.26], [0.65, -0.13], [0.8, -0.24], [1, 0], [0.8, 0.24], [0.65, 0.13], [0.5, 0.26], [0.35, 0.12], [0.2, 0.22]];
  return poly(local.map(([x, y]) => at(Math.hypot(x, y) * length, degrees + (Math.atan2(y, x) * 180) / Math.PI, from)));
};
const berries = (center: P, r: number) => [circle(r, [center[0] - r * 0.8, center[1]]), circle(r, [center[0] + r * 0.8, center[1] + r * 0.3]), circle(r, [center[0], center[1] - r * 0.9])];

export const COURONNE_DE_HOUX_BANNER: AssortedBanner = banner({
  key: 'couronne-de-houx',
  palette: ['#1F7A3A', '#0E3B22', '#C8102E', '#FFE7A6'],
  border: { width: 5.4, color: 1, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 3, opacity: 0.9 }, { inset: 4.8, width: 0.4, color: 2, opacity: 1 }] },
  corner: {
    size: 19,
    marks: [
      { shapes: [hollyLeaf([4.6, 4.6], 0, 13.6), hollyLeaf([4.6, 4.6], 90, 13.6)], color: 0 },
      { shapes: [hollyLeaf([4.6, 4.6], 45, 11)], color: 1 },
      { shapes: berries([5, 5], 1.9), color: 2, group: 'corner' },
    ],
  },
  cartouche: {
    width: 30,
    depth: 14,
    marks: [
      { shapes: [hollyLeaf([-1.6, 5], 175, 12), hollyLeaf([1.6, 5], 5, 12)], color: 0 },
      { shapes: [hollyLeaf([-1, 6], 145, 9), hollyLeaf([1, 6], 35, 9)], color: 1 },
      { shapes: berries([0, 6.2], 2.1), color: 2, group: 'baies' },
    ],
  },
  frieze: { module: 10, from: 20, fit: 'justify', marks: [{ shapes: [circle(0.9, [5, 2.7])], color: 2, opacity: 0.95, group: 'grains' }] },
  motion: [
    { kind: 'pulse', targets: ['baies', ...CORNER_GROUPS], duration: 3.6, stagger: 0.6, amplitude: 0.14, origin: 'self' },
    { kind: 'twinkle', targets: ['grains'], duration: 2.8, amplitude: 0.5 },
  ],
});

// ── Lumières de Noël ────────────────────────────────────────────────────
// guirlande-lumineuse : 0 vert profond · 1 rouge · 2 or · 3 vert · 4 bleu

/** Une ampoule qui pend sous le câble, au point `top`. */
const bulb = (top: P, size: number) => smooth([[top[0], top[1], 'corner'], [top[0] + size * 0.55, top[1] + size * 0.5], [top[0], top[1] + size * 1.2], [top[0] - size * 0.55, top[1] + size * 0.5]]);

const SWAG = 24;
const swagY = (x: number): number => 1.2 + Math.sin((x / SWAG) * Math.PI) * 1.6;

export const GUIRLANDE_LUMINEUSE_BANNER: AssortedBanner = banner({
  key: 'guirlande-lumineuse',
  palette: ['#0E3B22', '#C8102E', '#E8B547', '#1F7A3A', '#3B82F6'],
  border: { width: 6.6, color: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }] },
  corner: {
    size: 14,
    marks: [
      { shapes: [curve([[0.6, 12], [3, 3], [12, 0.6]])], color: 0, width: 0.8 },
      { shapes: [bulb([2.4, 7], 3.4)], color: 1, group: 'corner' },
      { shapes: [bulb([6.6, 2.6], 3.4)], color: 4, group: 'corner' },
    ],
  },
  frieze: {
    module: SWAG,
    from: 14,
    fit: 'justify',
    marks: [
      { shapes: [curve(spread(5, 0, SWAG).map((x): P => [x, swagY(x)]))], color: 3, width: 0.5 },
      ...[1, 2, 4].map((color, index) => ({ shapes: [bulb([4 + index * 8, swagY(4 + index * 8)], 3.2)], color, group: `ampoules-${index}` })),
    ],
  },
  side: [
    { shapes: [curve([[3, 14], [4.4, 32], [3, 50], [4.4, 68], [3, 86]])], color: 3, width: 0.5 },
    { shapes: [22, 46, 70].map((y) => bulb([3.6, y], 2.8)), color: 2, group: 'ampoules-1' },
  ],
  motion: [
    { kind: 'twinkle', targets: ['ampoules-0', 'ampoules-1', 'ampoules-2', ...CORNER_GROUPS], duration: 2.4, stagger: 0.4, amplitude: 0.75 },
  ],
});

// etoile-du-sapin : 0 or · 1 or profond · 2 lumière · 3 vert profond

const needles = (root: P, degrees: number, length: number) => [
  line([root, at(length, degrees, root)]),
  ...spread(5, 0.2, 0.9).flatMap((t) => {
    const knot = at(length * t, degrees, root);
    return [line([knot, at(length * 0.28, degrees - 40, knot)]), line([knot, at(length * 0.28, degrees + 40, knot)])];
  }),
];

export const ETOILE_DU_SAPIN_BANNER: AssortedBanner = banner({
  key: 'etoile-du-sapin',
  palette: ['#E8B547', '#9A6A17', '#FFE7A6', '#0E3B22'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 2, at: 0 }, { color: 0, at: 0.5 }, { color: 1, at: 1 }] }],
  border: { width: 6, color: 3, opacity: 0.92, filets: [{ inset: 0.5, width: 0.5, color: 0, gradient: 0, opacity: 1 }, { inset: 5.4, width: 0.4, color: 0, opacity: 1 }] },
  corner: {
    size: 19,
    marks: [
      { shapes: [...needles([0.8, 0.8], 20, 18), ...needles([0.8, 0.8], 70, 18)], color: 0, width: 0.5, opacity: 0.9 },
      { shapes: [circle(1.8, [10, 6.4]), circle(1.4, [6, 11.6])], color: 0, gradient: 0, group: 'corner' },
    ],
  },
  cartouche: {
    width: 30,
    depth: 19,
    marks: [
      { shapes: spread(8, 0, 315).map((degrees) => poly([at(4, degrees - 9, [0, 9.4]), at(degrees % 90 === 0 ? 14 : 10.4, degrees, [0, 9.4]), at(4, degrees + 9, [0, 9.4])])), color: 2, opacity: 0.6, group: 'rayons' },
      { shapes: [star([0, 9.4], 7.6, 5, 0.45)], color: 0, gradient: 0, group: 'etoile' },
      { shapes: [star([0, 9.4], 7.6, 5, 0.45)], color: 1, width: 0.45, group: 'etoile' },
    ],
  },
  frieze: { module: 14, from: 20, fit: 'justify', marks: [{ shapes: [sparkle([7, 2.9], 1.5)], color: 2, opacity: 0.95, group: 'eclats' }] },
  motion: [
    { kind: 'pulse', targets: ['etoile'], duration: 4, amplitude: 0.1, origin: 'self' },
    { kind: 'rotate', targets: ['rayons'], duration: 16, origin: 'self' },
    { kind: 'twinkle', targets: ['eclats', ...CORNER_GROUPS], duration: 3, stagger: 0.5, amplitude: 0.7 },
  ],
});

// ── Atelier du Père Noël ────────────────────────────────────────────────
// bonnet-du-pere-noel : 0 rouge · 1 rouge profond · 2 neige · 3 or

const fur = (from: P, to: P, r: number) => {
  const count = Math.max(2, Math.round(Math.hypot(to[0] - from[0], to[1] - from[1]) / (r * 1.4)));
  return spread(count, 0, 1).map((t) => circle(r, [from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t]));
};

export const BONNET_DU_PERE_NOEL_BANNER: AssortedBanner = banner({
  key: 'bonnet-du-pere-noel',
  palette: ['#C8102E', '#7A0A1C', '#F8FAFC', '#E8B547'],
  border: { width: 5.4, color: 0, opacity: 0.94, filets: [{ inset: 4.9, width: 0.4, color: 3, opacity: 1 }] },
  corner: { size: 13, marks: [{ shapes: [circle(4.6, [6, 6])], color: 2, group: 'corner' }, { shapes: [circle(4.6, [6, 6])], color: 1, width: 0.3, opacity: 0.4 }] },
  cartouche: {
    width: 34,
    depth: 18,
    marks: [
      { shapes: [smooth([[-10, 9.6, 'corner'], [-6, 3], [3, 1.6], [11, 6.4, 'corner'], [12.6, 10.6], [8, 9.6, 'corner']])], color: 0, group: 'bonnet' },
      { shapes: [circle(2.6, [12.6, 12.2])], color: 2, group: 'bonnet' },
      { shapes: fur([-10.4, 11], [9, 11], 1.8), color: 2 },
    ],
  },
  frieze: { module: 6, from: 13, fit: 'justify', marks: [{ shapes: [circle(1.6, [3, 1.6])], color: 2, opacity: 0.95, group: 'bande' }] },
  side: [{ shapes: fur([2.2, 15], [2.2, 85], 2.2), color: 2, opacity: 0.95 }],
  motion: [
    { kind: 'skew', targets: ['bonnet'], duration: 3, direction: 'alternate', amplitude: 5, origin: 'bottom' },
    { kind: 'sweep', targets: ['bande'], duration: 6 },
    twinkleCorners(4, 0.35),
  ],
});

// sucre-d-orge : 0 neige · 1 rouge · 2 vert · 3 rouge profond

/** Une canne en J dans le coin : le crochet en haut-gauche, la hampe qui descend. */
const caneStripes = (count: number) =>
  spread(count, 0, 1).map((t) => {
    const y = 4 + t * 12;
    return poly([[2.2, y], [5.2, y - 1.6], [5.2, y - 0.6], [2.2, y + 1]]);
  });

export const SUCRE_D_ORGE_BANNER: AssortedBanner = banner({
  key: 'sucre-d-orge',
  palette: ['#F8FAFC', '#C8102E', '#1F7A3A', '#7A0A1C'],
  border: { width: 6, color: 0, opacity: 0.96, filets: [{ inset: 0.5, width: 0.45, color: 3, opacity: 1 }, { inset: 5.5, width: 0.45, color: 3, opacity: 1 }] },
  corner: {
    size: 17,
    marks: [
      { shapes: [curve([[3.7, 16.4], [3.7, 5], [8.4, 2.4], [12.6, 5], [12.6, 8.4]])], color: 0, width: 3 },
      { shapes: [curve([[3.7, 16.4], [3.7, 5], [8.4, 2.4], [12.6, 5], [12.6, 8.4]])], color: 3, width: 0.4, opacity: 0.5 },
      { shapes: caneStripes(5), color: 1, group: 'corner' },
    ],
  },
  cartouche: {
    width: 24,
    depth: 13,
    marks: [
      { shapes: [leaf([0, 5], [-9, 1.6], 2.6), leaf([0, 5], [9, 1.6], 2.6), poly([[0, 5], [-4, 12], [-2.4, 12], [0, 6.6]]), mirrorShape(poly([[0, 5], [-4, 12], [-2.4, 12], [0, 6.6]]))], color: 2, group: 'noeud' },
      { shapes: [ellipseShape([1.8, 1.6], [0, 5])], color: 3 },
    ],
  },
  frieze: { module: 6, from: 17, fit: 'justify', marks: [{ shapes: [poly([[0.4, 5.6], [3.4, 0.4], [5.4, 0.4], [2.4, 5.6]])], color: 1, opacity: 0.95, group: 'bande' }] },
  side: [{ shapes: spread(12, 18, 78).map((y) => poly([[0.4, y + 3], [5.6, y], [5.6, y + 2], [0.4, y + 5]])), color: 1, opacity: 0.95 }],
  motion: [
    { kind: 'sweep', targets: ['bande'], duration: 5 },
    { kind: 'pulse', targets: ['noeud'], duration: 3.4, amplitude: 0.08, origin: 'self' },
    twinkleCorners(4.4, 0.3),
  ],
});

export const CHRISTMAS_BANNERS: readonly AssortedBanner[] = [FLOCONS_TOMBANTS_BANNER, COURONNE_DE_HOUX_BANNER, GUIRLANDE_LUMINEUSE_BANNER, ETOILE_DU_SAPIN_BANNER, BONNET_DU_PERE_NOEL_BANNER, SUCRE_D_ORGE_BANNER];
