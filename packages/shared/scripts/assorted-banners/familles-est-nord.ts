/**
 * Les bannières assorties des familles ASIATIQUE, AFRICAINE, CELTE et NORDIQUE (#15553 ← #13962…#13965),
 * chacune dans la palette de son contour d'avatar.
 */
import { type P, sparkle } from '../illustrated-rings/kit.js';
import { type AssortedBanner, CORNER_GROUPS, at, banner, circle, curve, diamond, ellipseShape, leaf, line, mirrorShape, poly, rect, smooth, spread, tapered, twinkleCorners } from './draw.js';
import { rune } from './vitrine.js';

const lattice = (size: number): P[][] => [[[1, 1], [size, 1]], [[1, 1], [1, size]], [[1, size * 0.55], [size * 0.55, size * 0.55]], [[size * 0.55, 1], [size * 0.55, size * 0.55]]];

// ── Asiatiques ──────────────────────────────────────────────────────────

/** Un corps de dragon en S : deux arcs effilés, de la gueule à la queue. */
const dragonBody = [tapered([2, 15], [4, 4], [12, 6], [3.2, 3.6, 2.6]), tapered([12, 6], [18, 8], [17, 1.6], [2.6, 1.8, 0.2])];
const flames = (center: P, r: number) => spread(7, -170, -10).map((degrees) => leaf(at(r * 0.6, degrees, center), at(r * 1.7, degrees, center), r * 0.28));

export const DRAGON_JADE_BANNER: AssortedBanner = banner({
  key: 'dragon-jade',
  palette: ['#1F8A5B', '#0B3B2E', '#E8B547', '#8EE6B4', '#D7263D'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 3, at: 0 }, { color: 0, at: 1 }] }],
  border: { width: 5.6, color: 1, opacity: 0.92, filets: [{ inset: 0.6, width: 0.5, color: 2, opacity: 1 }, { inset: 5, width: 0.4, color: 0, opacity: 1 }] },
  corner: {
    size: 19,
    marks: [
      { shapes: dragonBody, color: 0, gradient: 0, group: 'corner' },
      { shapes: [circle(0.7, [4.6, 8]), circle(0.7, [8, 5.4]), circle(0.7, [13.2, 6.4])], color: 2, group: 'corner' },
      { shapes: [circle(1.6, [2.4, 15.4])], color: 4 },
    ],
  },
  cartouche: {
    width: 24,
    depth: 16,
    marks: [
      { shapes: flames([0, 8], 4), color: 4, opacity: 0.9, group: 'flammes' },
      { shapes: [circle(4, [0, 8])], color: 2 },
      { shapes: [circle(1.6, [-1.2, 6.8])], color: 3, opacity: 0.9 },
    ],
  },
  frieze: { module: 8, from: 20, fit: 'justify', marks: [{ shapes: [curve([[0.6, 4], [4, 1.2], [7.4, 4]])], color: 3, width: 0.45, opacity: 0.8 }] },
  motion: [
    { kind: 'pulse', targets: ['flammes'], duration: 2.6, amplitude: 0.12, origin: 'self' },
    twinkleCorners(5, 0.45),
  ],
});

/** Un nuage de bon augure : trois lobes et une volute. */
const cloud = ([x, y]: P, k: number) => [circle(2.6 * k, [x, y]), circle(3.4 * k, [x + 4 * k, y - 1.2 * k]), circle(2.4 * k, [x + 8 * k, y]), ellipseShape([5.4 * k, 1.8 * k], [x + 4 * k, y + 1.2 * k])];
const curl = ([x, y]: P, k: number) => curve([[x + 4 * k, y + 0.4 * k], [x + 5.2 * k, y - 1.2 * k], [x + 3.4 * k, y - 2.4 * k], [x + 2.2 * k, y - 0.8 * k]]);

export const NUAGES_SOIE_BANNER: AssortedBanner = banner({
  key: 'nuages-soie',
  palette: ['#3A2E7A', '#1B1440', '#F4A6B8', '#E9C46A', '#C8344B'],
  border: { width: 5.4, color: 1, opacity: 0.9, filets: [{ inset: 0.6, width: 0.45, color: 3, opacity: 1 }, { inset: 4.8, width: 0.4, color: 2, opacity: 0.9 }] },
  corner: {
    size: 18,
    marks: [
      { shapes: cloud([3.4, 6.2], 1.05), color: 2, group: 'corner' },
      { shapes: [curl([3.4, 6.2], 1.05)], color: 3, width: 0.55, group: 'corner' },
      { shapes: cloud([5, 14], 0.7), color: 0, opacity: 0.95 },
    ],
  },
  cartouche: {
    width: 34,
    depth: 13,
    marks: [
      { shapes: [...cloud([-9.6, 6.6], 1.1), ...cloud([0.6, 5.2], 1.1)], color: 2, group: 'nuage' },
      { shapes: [curl([-9.6, 6.6], 1.1), curl([0.6, 5.2], 1.1)], color: 3, width: 0.6, group: 'nuage' },
    ],
  },
  frieze: { module: 14, from: 19, fit: 'justify', marks: [{ shapes: [diamond([7, 2.7], 0.9)], color: 4, opacity: 0.9 }] },
  motion: [
    { kind: 'skew', targets: ['nuage'], duration: 6, direction: 'alternate', amplitude: 4, origin: 'bottom' },
    twinkleCorners(6, 0.35),
  ],
});

const lantern = ([x, y]: P, k: number) => ({
  string: line([[x, 0], [x, y - 3.8 * k]]),
  caps: [rect([x - 1.8 * k, y - 4.1 * k], [3.6 * k, 1 * k]), rect([x - 1.8 * k, y + 3.1 * k], [3.6 * k, 1 * k])],
  body: ellipseShape([3.4 * k, 3.6 * k], [x, y]),
  ribs: [curve([[x, y - 3.4 * k], [x - 1.9 * k, y], [x, y + 3.4 * k]]), curve([[x, y - 3.4 * k], [x + 1.9 * k, y], [x, y + 3.4 * k]]), line([[x, y - 3.4 * k], [x, y + 3.4 * k]])],
  tassel: poly([[x - 0.5 * k, y + 4.1 * k], [x + 0.5 * k, y + 4.1 * k], [x + 0.9 * k, y + 7 * k], [x - 0.9 * k, y + 7 * k]]),
});
const lanternMarks = (spec: ReturnType<typeof lantern>, group: string) => [
  { shapes: [spec.string], color: 2, width: 0.35, group },
  { shapes: [spec.body], color: 0, group },
  { shapes: spec.ribs, color: 1, width: 0.35, opacity: 0.8, group },
  { shapes: [...spec.caps, spec.tassel], color: 2, group },
];

export const LANTERNES_PAPIER_BANNER: AssortedBanner = banner({
  key: 'lanternes-papier',
  palette: ['#D21F3C', '#6E0B14', '#E8B547', '#FFD58A'],
  border: { width: 5, color: 1, opacity: 0.92, filets: [{ inset: 0.6, width: 0.5, color: 2, opacity: 1 }, { inset: 4.4, width: 0.4, color: 3, opacity: 0.8 }] },
  corner: { size: 14, marks: [{ shapes: lattice(13).map((points) => line(points)), color: 2, width: 0.7 }, { shapes: [diamond([7, 7], 1.6)], color: 3, group: 'corner' }] },
  cartouche: {
    width: 40,
    depth: 18,
    marks: [
      ...lanternMarks(lantern([-12, 8.5], 0.9), 'l0'),
      ...lanternMarks(lantern([0, 10], 1.05), 'l1'),
      ...lanternMarks(lantern([12, 8.5], 0.9), 'l2'),
    ],
  },
  motion: [
    { kind: 'skew', targets: ['l0', 'l1', 'l2'], duration: 4.4, stagger: 0.7, direction: 'alternate', amplitude: 5, origin: 'top' },
    twinkleCorners(3.6, 0.6),
  ],
});

// ── Africains ───────────────────────────────────────────────────────────

const zigzag = (from: P, count: number, step: number, height: number) => line(Array.from({ length: count * 2 + 1 }, (_, index): P => [from[0] + index * step, from[1] + (index % 2 === 0 ? 0 : height)]));
const triangles = (size: number) => [poly([[1, 1], [size, 1], [1, size]])];

export const MASQUE_EBENE_BANNER: AssortedBanner = banner({
  key: 'masque-ebene',
  palette: ['#4A2C17', '#1C0F07', '#D08A2E', '#F2C14E', '#F3E3C3'],
  border: { width: 6, color: 1, opacity: 0.92, filets: [{ inset: 0.6, width: 0.5, color: 2, opacity: 1 }, { inset: 5.4, width: 0.4, color: 3, opacity: 0.9 }] },
  corner: {
    size: 16,
    marks: [
      { shapes: triangles(15), color: 0 },
      { shapes: [zigzag([2.4, 4.2], 3, 1.6, 1.6), zigzag([2.4, 8], 2, 1.6, 1.6)], color: 3, width: 0.5, group: 'corner' },
    ],
  },
  cartouche: {
    width: 20,
    depth: 19,
    marks: [
      { shapes: [smooth([[0, 0.6], [4.6, 3], [5.2, 9], [3, 15], [0, 18.2], [-3, 15], [-5.2, 9], [-4.6, 3]])], color: 1 },
      { shapes: [smooth([[0, 0.6], [4.6, 3], [5.2, 9], [3, 15], [0, 18.2], [-3, 15], [-5.2, 9], [-4.6, 3]])], color: 2, width: 0.6 },
      { shapes: [leaf([-4, 7.6], [-1.2, 7.6], 0.9), leaf([1.2, 7.6], [4, 7.6], 0.9)], color: 3, group: 'yeux' },
      { shapes: [line([[0, 2], [0, 12.6]]), line([[-1.8, 15], [1.8, 15]])], color: 2, width: 0.7 },
      { shapes: [line([[-3.6, 3.6], [-1.6, 4.8]]), line([[3.6, 3.6], [1.6, 4.8]]), line([[-3.8, 11], [-2.2, 12.4]]), line([[3.8, 11], [2.2, 12.4]])], color: 4, width: 0.5 },
    ],
  },
  frieze: { module: 10, from: 17, fit: 'justify', marks: [{ shapes: [poly([[1, 1], [5, 4.6], [9, 1]])], color: 2, opacity: 0.85 }] },
  motion: [
    { kind: 'twinkle', targets: ['yeux'], duration: 3.6, amplitude: 0.7 },
    twinkleCorners(4.8, 0.5),
  ],
});

const KENTE = [0, 1, 2, 0, 3, 2] as const;

export const BANDES_TISSEES_BANNER: AssortedBanner = banner({
  key: 'bandes-tissees',
  palette: ['#F2B705', '#1E7B45', '#C0392B', '#17120E'],
  border: { width: 6.4, color: 3, opacity: 0.92, filets: [{ inset: 0.5, width: 0.5, color: 0, opacity: 1 }, { inset: 5.9, width: 0.45, color: 0, opacity: 1 }] },
  corner: {
    size: 14,
    marks: [
      { shapes: [rect([1, 1], [12, 12])], color: 0 },
      { shapes: [rect([1, 4.6], [12, 2]), rect([1, 9.4], [12, 2])], color: 1 },
      { shapes: [rect([4.6, 1], [2, 12]), rect([9.4, 1], [2, 12])], color: 2, opacity: 0.9, group: 'corner' },
    ],
  },
  side: [0, 1, 2].map((color) => ({ shapes: Array.from({ length: 12 }, (_, index) => index).filter((index) => index % 3 === color).map((index) => rect([1.2, 16 + index * 5.8], [4, 4.2])), color: KENTE[color]!, opacity: 0.95 })),
  frieze: {
    module: 30,
    from: 15,
    fit: 'justify',
    marks: [0, 1, 2, 3].map((color) => ({
      shapes: KENTE.map((tone, index) => ({ tone, index })).filter(({ tone }) => tone === color).map(({ index }) => rect([index * 5 + 0.4, 1.2], [4.2, 4])),
      color,
      opacity: 0.95,
      group: 'bande',
    })).filter((mark) => mark.shapes.length > 0),
  },
  motion: [
    { kind: 'sweep', targets: ['bande'], duration: 7 },
    twinkleCorners(4, 0.4),
  ],
});

const beads = (from: P, count: number, step: P, r: number) => Array.from({ length: count }, (_, index) => circle(r, [from[0] + index * step[0], from[1] + index * step[1]]));

export const COLLIER_PERLES_BANNER: AssortedBanner = banner({
  key: 'collier-perles',
  palette: ['#3B2414', '#D08A2E', '#B4532A', '#F3E3C3', '#25337A'],
  border: { width: 5.6, color: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 1, opacity: 1 }] },
  corner: {
    size: 15,
    marks: [
      { shapes: [circle(5, [6.4, 6.4])], color: 4 },
      { shapes: beads([6.4, 2.6], 1, [0, 0], 1.3).concat(beads([10.2, 6.4], 1, [0, 0], 1.3), beads([6.4, 10.2], 1, [0, 0], 1.3), beads([2.6, 6.4], 1, [0, 0], 1.3)), color: 3, group: 'corner' },
      { shapes: [circle(1.5, [6.4, 6.4])], color: 1 },
    ],
  },
  side: [{ shapes: beads([2.8, 18], 11, [0, 6.4], 1.5), color: 1 }, { shapes: beads([2.8, 21.2], 10, [0, 6.4], 1.1), color: 2 }],
  cartouche: {
    width: 18,
    depth: 16,
    marks: [
      { shapes: [curve([[-8, 0.4], [0, 5.6], [8, 0.4]])], color: 1, width: 0.5 },
      { shapes: [diamond([0, 10], 4.4, 5.8)], color: 4, group: 'pendentif' },
      { shapes: [diamond([0, 10], 2.2, 3)], color: 1, group: 'pendentif' },
      { shapes: beads([-5.2, 2.6], 2, [2.4, 1.2], 1), color: 3 },
      { shapes: beads([2.8, 3.8], 2, [2.4, -1.2], 1), color: 3 },
    ],
  },
  frieze: {
    module: 6,
    from: 16,
    fit: 'justify',
    marks: [
      { shapes: [circle(1.5, [1.6, 2.8])], color: 1, group: 'perles-a' },
      { shapes: [circle(1.1, [4.6, 2.8])], color: 2, group: 'perles-b' },
    ],
  },
  motion: [
    { kind: 'twinkle', targets: ['perles-a', 'perles-b'], duration: 3, stagger: 1.5, amplitude: 0.45 },
    { kind: 'pulse', targets: ['pendentif'], duration: 4, amplitude: 0.08, origin: 'self' },
  ],
});

// ── Celtes ──────────────────────────────────────────────────────────────

const knot = ([x, y]: P, r: number) => [circle(r, [x - r * 0.7, y]), circle(r, [x + r * 0.7, y]), circle(r, [x, y - r * 0.7]), circle(r, [x, y + r * 0.7])];
const braid = (module: number, y: number, amplitude: number) => [
  curve([[0, y - amplitude], [module / 4, y], [module / 2, y + amplitude], [(module * 3) / 4, y], [module, y - amplitude]]),
  curve([[0, y + amplitude], [module / 4, y], [module / 2, y - amplitude], [(module * 3) / 4, y], [module, y + amplitude]]),
];

export const NOEUD_ENTRELACE_BANNER: AssortedBanner = banner({
  key: 'noeud-entrelace',
  palette: ['#0F5132', '#071A12', '#E3B65A', '#F4E9C9'],
  border: { width: 6, color: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }, { inset: 5.5, width: 0.45, color: 2, opacity: 1 }] },
  corner: {
    size: 16,
    marks: [
      { shapes: [rect([0.6, 0.6], [14.8, 14.8])], color: 1, opacity: 0.9 },
      { shapes: knot([8, 8], 3.6), color: 2, width: 0.7, group: 'corner' },
      { shapes: [circle(6.4, [8, 8])], color: 3, width: 0.4, opacity: 0.8 },
    ],
  },
  frieze: { module: 10, from: 16, fit: 'justify', marks: [{ shapes: braid(10, 3, 1.6), color: 2, width: 0.55, group: 'tresse' }] },
  motion: [
    { kind: 'sweep', targets: ['tresse'], duration: 8 },
    twinkleCorners(5, 0.5),
  ],
});

/** Une spirale de `turns` tours autour de `center`, ouverte vers `start`. */
const spiral = (center: P, r: number, start: number, turns = 1.6) =>
  curve(Array.from({ length: Math.round(turns * 8) + 1 }, (_, index) => at(r * (1 - index / (turns * 8 + 2)), start + index * 45, center)));
const triskele = (center: P, r: number) => spread(3, -90, 150).map((degrees) => spiral(at(r * 0.5, degrees, center), r * 0.5, degrees + 180));

export const SPIRALE_TRIPLE_BANNER: AssortedBanner = banner({
  key: 'spirale-triple',
  palette: ['#2E8B57', '#071A12', '#E3B65A', '#F4E9C9'],
  border: { width: 5.4, color: 1, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }, { inset: 4.8, width: 0.4, color: 0, opacity: 1 }] },
  corner: { size: 16, marks: [{ shapes: [circle(7, [8, 8])], color: 0, opacity: 0.95 }, { shapes: triskele([8, 8], 6), color: 2, width: 0.6, group: 'corner' }] },
  cartouche: { width: 22, depth: 19, marks: [{ shapes: [circle(9, [0, 9.4])], color: 1, opacity: 0.95 }, { shapes: [circle(9, [0, 9.4])], color: 2, width: 0.5 }, { shapes: triskele([0, 9.4], 8), color: 3, width: 0.75, group: 'triskele' }] },
  frieze: { module: 8, from: 17, fit: 'justify', marks: [{ shapes: [spiral([4, 2.7], 1.8, 0, 1.2)], color: 2, width: 0.4, opacity: 0.85 }] },
  motion: [
    { kind: 'rotate', targets: ['triskele'], duration: 18, origin: 'self' },
    { kind: 'rotate', targets: [...CORNER_GROUPS], duration: 24, direction: 'reverse', origin: 'self' },
  ],
});

const ivyLeaf = ([x, y]: P, size: number, degrees: number) => {
  const tip = at(size, degrees, [x, y]);
  return smooth([[x, y, 'corner'], at(size * 0.55, degrees - 50, [x, y]), [tip[0], tip[1], 'corner'], at(size * 0.55, degrees + 50, [x, y])]);
};

export const LIERRE_EMERAUDE_BANNER: AssortedBanner = banner({
  key: 'lierre-emeraude',
  palette: ['#0F5132', '#071A12', '#6CC48A', '#9A6A2E'],
  border: { width: 5, color: 1, opacity: 0.88, filets: [{ inset: 0.5, width: 0.4, color: 3, opacity: 1 }] },
  corner: {
    size: 19,
    marks: [
      { shapes: [curve([[1.6, 18], [3, 6], [18, 1.6]])], color: 3, width: 0.8 },
      { shapes: [ivyLeaf([3.2, 12], 4.6, 160), ivyLeaf([5, 5.6], 5.2, 225), ivyLeaf([11.6, 3], 4.6, 290)], color: 2, group: 'corner' },
      { shapes: [ivyLeaf([2.4, 16], 3.4, 30), ivyLeaf([15.6, 2.2], 3.4, 60)], color: 0 },
    ],
  },
  side: [{ shapes: [curve([[2.4, 20], [3.6, 35], [1.8, 50], [3.6, 65], [2.4, 80]])], color: 3, width: 0.55 }],
  frieze: {
    module: 18,
    from: 20,
    fit: 'justify',
    marks: [
      { shapes: [curve([[0, 2.4], [6, 3.6], [12, 1.8], [18, 2.4]])], color: 3, width: 0.55 },
      { shapes: [ivyLeaf([5, 3.2], 3, 60), ivyLeaf([13, 2], 3, 110)], color: 2, group: 'feuilles' },
    ],
  },
  motion: [
    { kind: 'skew', targets: ['feuilles', ...CORNER_GROUPS], duration: 3.2, stagger: 0.4, direction: 'alternate', amplitude: 4, origin: 'self' },
  ],
});

// ── Nordiques ───────────────────────────────────────────────────────────

/** Un corbeau en vol, ailes ouvertes, tourné vers la droite. */
const raven = ([x, y]: P, k: number) =>
  poly([[x - 4.4 * k, y + 0.6 * k], [x - 1.6 * k, y - 0.4 * k], [x - 0.6 * k, y - 3.6 * k], [x + 0.6 * k, y - 0.6 * k], [x + 2.6 * k, y - 0.8 * k], [x + 3.8 * k, y - 0.2 * k], [x + 2.6 * k, y + 0.4 * k], [x + 1.2 * k, y + 0.8 * k], [x + 2 * k, y + 3.2 * k], [x - 0.4 * k, y + 1 * k], [x - 2.6 * k, y + 1.6 * k]]);

export const CORBEAUX_TOURNOYANTS_BANNER: AssortedBanner = banner({
  key: 'corbeaux-tournoyants',
  palette: ['#13284A', '#0F1117', '#CBD5E1', '#F5F1DC'],
  border: { width: 5, color: 1, opacity: 0.88, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 0.9 }, { inset: 4.4, width: 0.4, color: 0, opacity: 1 }] },
  corner: { size: 16, marks: [{ shapes: [circle(6.8, [8, 8])], color: 0, opacity: 0.9 }, { shapes: [raven([8.4, 8.4], 1.25)], color: 1, group: 'corner' }, { shapes: [circle(6.8, [8, 8])], color: 2, width: 0.4 }] },
  cartouche: {
    width: 26,
    depth: 19,
    marks: [
      { shapes: [circle(8.6, [0, 9.4])], color: 2, width: 0.4, opacity: 0.6 },
      { shapes: [raven([5.2, 4.6], 1.1), mirrorShape(raven([5.2, 14.4], 1.1))], color: 1, group: 'vol' },
      { shapes: [circle(0.5, [8.6, 4]), circle(0.5, [-8.6, 13.8])], color: 3, group: 'vol' },
    ],
  },
  motion: [
    { kind: 'rotate', targets: ['vol'], duration: 14, origin: 'self' },
    twinkleCorners(6, 0.3),
  ],
});

export const AURORE_BOREALE_BANNER: AssortedBanner = banner({
  key: 'aurore-boreale',
  palette: ['#0B1426', '#4ADE80', '#2DD4BF', '#A78BFA', '#E0F2FE'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 0, stops: [{ color: 1, at: 0 }, { color: 2, at: 0.5 }, { color: 3, at: 1 }] }],
  border: { width: 6.4, color: 0, opacity: 0.88, filets: [{ inset: 5.8, width: 0.5, color: 2, gradient: 0, opacity: 1 }] },
  corner: { size: 12, marks: [{ shapes: [sparkle([6, 6], 3.2)], color: 4, group: 'corner' }] },
  frieze: {
    module: 24,
    from: 12,
    fit: 'justify',
    bottom: true,
    marks: [
      { shapes: [curve([[0, 4.6], [6, 1.6], [12, 4.2], [18, 1.2], [24, 4.6]])], color: 1, gradient: 0, width: 1.4, opacity: 0.85, group: 'voile' },
      { shapes: [curve([[0, 2.4], [6, 4.4], [12, 1.8], [18, 4.6], [24, 2.4]])], color: 3, width: 0.6, opacity: 0.7, group: 'voile' },
    ],
  },
  motion: [
    { kind: 'sweep', targets: ['voile'], duration: 9 },
    twinkleCorners(3.2, 0.8),
  ],
});

export const ANNEAU_PIERRE_GRAVEE_BANNER: AssortedBanner = banner({
  key: 'anneau-pierre-gravee',
  palette: ['#56606D', '#262C35', '#A3ACB8', '#FBBF24'],
  border: { width: 7, color: 0, opacity: 0.95, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 0.9 }, { inset: 6.4, width: 0.45, color: 1, opacity: 1 }] },
  corner: {
    size: 16,
    marks: [
      { shapes: [circle(7.2, [8, 8])], color: 1 },
      { shapes: [circle(7.2, [8, 8]), circle(4.6, [8, 8])], color: 2, width: 0.5 },
      { shapes: spread(4, 45, 315).map((degrees, index) => rune(index, at(5.9, degrees, [8, 8]), 0.75, degrees + 90)), color: 2, width: 0.4 },
      { shapes: [circle(2.2, [8, 8])], color: 3, group: 'corner' },
    ],
  },
  frieze: { module: 8, from: 17, fit: 'justify', marks: [{ shapes: [rune(2, [4, 3.4], 1.4)], color: 2, width: 0.45, opacity: 0.9 }] },
  motion: [twinkleCorners(4.4, 0.65)],
});

/** Une proue de drakkar : un cou qui s'enroule en tête de dragon. */
const prow = [tapered([2, 17], [1.6, 4], [10, 2.6], [3, 2.4, 1.6]), tapered([10, 2.6], [15.4, 3.4], [13.4, 7.6], [1.6, 1.2, 0.3])];

export const PROUE_SCULPTEE_BANNER: AssortedBanner = banner({
  key: 'proue-sculptee',
  palette: ['#8A5328', '#3E2210', '#D49A5A', '#B91C1C', '#F1E6D0'],
  border: { width: 6, color: 1, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }, { inset: 5.4, width: 0.45, color: 0, opacity: 1 }] },
  corner: { size: 18, marks: [{ shapes: prow, color: 0 }, { shapes: prow, color: 2, width: 0.4 }, { shapes: [circle(0.8, [11.4, 3.6])], color: 3, group: 'corner' }] },
  frieze: {
    module: 12,
    from: 19,
    fit: 'justify',
    marks: [
      { shapes: [circle(2.6, [6, 3])], color: 3, group: 'boucliers' },
      { shapes: [circle(2.6, [6, 3])], color: 4, width: 0.4 },
      { shapes: [circle(0.8, [6, 3])], color: 2 },
    ],
  },
  motion: [
    { kind: 'twinkle', targets: ['boucliers', ...CORNER_GROUPS], duration: 3.4, stagger: 0.6, amplitude: 0.45 },
  ],
});

export const ASIATIQUES_BANNERS = [DRAGON_JADE_BANNER, NUAGES_SOIE_BANNER, LANTERNES_PAPIER_BANNER] as const;
export const AFRICAINS_BANNERS = [MASQUE_EBENE_BANNER, BANDES_TISSEES_BANNER, COLLIER_PERLES_BANNER] as const;
export const CELTES_BANNERS = [NOEUD_ENTRELACE_BANNER, SPIRALE_TRIPLE_BANNER, LIERRE_EMERAUDE_BANNER] as const;
export const NORDIQUES_BANNERS = [CORBEAUX_TOURNOYANTS_BANNER, AURORE_BOREALE_BANNER, ANNEAU_PIERRE_GRAVEE_BANNER, PROUE_SCULPTEE_BANNER] as const;
export const EST_NORD_BANNERS: readonly AssortedBanner[] = [...ASIATIQUES_BANNERS, ...AFRICAINS_BANNERS, ...CELTES_BANNERS, ...NORDIQUES_BANNERS];
