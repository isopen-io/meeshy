/**
 * Les bannières assorties des familles ÉGYPTIENNE, MAYA, INDIENNE, AMÉRINDIENNE et AUSTRALE
 * (#15553 ← #13966…#13970), chacune dans la palette de son contour d'avatar.
 */
import { type P, sparkle } from '../illustrated-rings/kit.js';
import { type AssortedBanner, CORNER_GROUPS, at, banner, circle, curve, diamond, ellipseShape, leaf, line, mirrorShape, poly, rect, smooth, spread, star, tapered, twinkleCorners, wing } from './draw.js';
import { catEye } from './vitrine.js';

const fan = (center: P, r: number, from: number, to: number, count: number, bulge: number) =>
  spread(count, from, to).map((degrees) => leaf(at(r * 0.15, degrees, center), at(r, degrees, center), bulge));

// ── Égyptiens ───────────────────────────────────────────────────────────

const hood = smooth([[0, 1.2], [3.6, 3.4], [4.8, 8.6], [3, 13.4], [1.4, 16.4], [0, 17], [-1.4, 16.4], [-3, 13.4], [-4.8, 8.6], [-3.6, 3.4]]);

export const COBRA_DORE_BANNER: AssortedBanner = banner({
  key: 'cobra-dore',
  palette: ['#E8B53A', '#8A5A12', '#FFE39A', '#1E3A8A'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 2, at: 0 }, { color: 0, at: 0.5 }, { color: 1, at: 1 }] }],
  border: { width: 6, color: 3, opacity: 0.9, filets: [{ inset: 0.6, width: 0.6, color: 0, opacity: 1 }, { inset: 5.3, width: 0.5, color: 0, opacity: 1 }] },
  corner: {
    size: 16,
    marks: [
      { shapes: [poly([[0.6, 0.6], [15.4, 0.6], [0.6, 15.4]])], color: 0, gradient: 0 },
      { shapes: [line([[0.6, 5], [5, 0.6]]), line([[0.6, 9.4], [9.4, 0.6]])], color: 3, width: 1.2, group: 'corner' },
    ],
  },
  cartouche: {
    width: 16,
    depth: 18,
    marks: [
      { shapes: [hood], color: 0, gradient: 0, group: 'capuchon' },
      { shapes: [line([[0, 5], [0, 14.6]]), line([[-2.6, 8.6], [2.6, 8.6]]), line([[-2, 12], [2, 12]])], color: 3, width: 0.8, group: 'capuchon' },
      { shapes: [circle(0.6, [-1.6, 3.4]), circle(0.6, [1.6, 3.4])], color: 3, group: 'yeux' },
    ],
  },
  frieze: { module: 9, from: 17, fit: 'justify', marks: [{ shapes: [rect([0.8, 1.2], [3.2, 4]), rect([5.2, 1.2], [3.2, 4])], color: 0, opacity: 0.9 }, { shapes: [rect([4.3, 1.6], [0.6, 3.2])], color: 2 }] },
  motion: [
    { kind: 'pulse', targets: ['capuchon'], duration: 4, amplitude: 0.07, origin: 'self' },
    { kind: 'twinkle', targets: ['yeux', ...CORNER_GROUPS], duration: 3, stagger: 0.6, amplitude: 0.6 },
  ],
});

const scarabWings = wing([2.4, 8.4], 15, -14, 30, 6);

export const SCARABEE_AILE_BANNER: AssortedBanner = banner({
  key: 'scarabee-aile',
  palette: ['#1E3A8A', '#14B8A6', '#E8B53A', '#FFE39A'],
  border: { width: 5.6, color: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.5, color: 2, opacity: 1 }, { inset: 5, width: 0.4, color: 1, opacity: 1 }] },
  corner: { size: 15, marks: [{ shapes: fan([1, 1], 14, 5, 85, 5, 1.6), color: 1, group: 'corner' }, { shapes: fan([1, 1], 14, 5, 85, 5, 1.6), color: 2, width: 0.3 }] },
  cartouche: {
    width: 44,
    depth: 18,
    marks: [
      { shapes: [...scarabWings, ...scarabWings.map(mirrorShape)], color: 1, group: 'ailes' },
      { shapes: [...scarabWings, ...scarabWings.map(mirrorShape)], color: 2, width: 0.3, group: 'ailes' },
      { shapes: [circle(2.4, [0, 4.4])], color: 2, group: 'soleil' },
      { shapes: [ellipseShape([3, 4.4], [0, 11.2]), ellipseShape([2, 1.4], [0, 7])], color: 0 },
      { shapes: [line([[0, 7.6], [0, 15.4]])], color: 2, width: 0.5 },
    ],
  },
  motion: [
    { kind: 'pulse', targets: ['ailes'], duration: 5, amplitude: 0.05, origin: 'self' },
    { kind: 'pulse', targets: ['soleil'], duration: 3, amplitude: 0.15, origin: 'self' },
    twinkleCorners(5, 0.4),
  ],
});

const pyramid = (x: number, base: number, height: number) => poly([[x - base / 2, 15.5], [x, 15.5 - height], [x + base / 2, 15.5]]);

export const SOLEIL_DU_DESERT_BANNER: AssortedBanner = banner({
  key: 'soleil-du-desert',
  palette: ['#E8B53A', '#C2410C', '#FFE39A', '#1E3A8A', '#14B8A6'],
  border: { width: 5.4, color: 1, opacity: 0.9, filets: [{ inset: 0.6, width: 0.5, color: 2, opacity: 1 }, { inset: 4.8, width: 0.4, color: 0, opacity: 1 }] },
  corner: {
    size: 16,
    marks: [
      { shapes: [rect([0.6, 0.6], [14.8, 14.8])], color: 3, opacity: 0.9 },
      { shapes: [pyramid(9.6, 9, 7.6), pyramid(4.4, 6, 5)], color: 0, group: 'corner' },
      { shapes: [circle(1.4, [12.6, 4])], color: 2 },
    ],
  },
  cartouche: {
    width: 40,
    depth: 18,
    marks: [
      { shapes: spread(9, 10, 170).map((degrees) => poly([at(7.6, degrees - 4, [0, 0]), at(16.6, degrees, [0, 0]), at(7.6, degrees + 4, [0, 0])])), color: 0, opacity: 0.9, group: 'rayons' },
      { shapes: [circle(7, [0, 0])], color: 2 },
      { shapes: [circle(7, [0, 0])], color: 1, width: 0.6 },
    ],
  },
  frieze: { module: 8, from: 17, fit: 'justify', marks: [{ shapes: [diamond([4, 2.7], 1, 1.4)], color: 4, opacity: 0.9 }] },
  motion: [
    { kind: 'pulse', targets: ['rayons'], duration: 4, amplitude: 0.1, origin: 'frame' },
    twinkleCorners(6, 0.3),
  ],
});

const lotus = (base: P, size: number) => [
  ...[-50, -25, 25, 50].map((tilt) => leaf(base, at(size * 0.82, -90 + tilt, base), size * 0.16)),
  leaf(base, at(size, -90, base), size * 0.2),
];

export const LOTUS_DU_NIL_BANNER: AssortedBanner = banner({
  key: 'lotus-du-nil',
  palette: ['#0E7490', '#14B8A6', '#F9A8D4', '#3F8F3A', '#E8B53A'],
  border: { width: 5.4, color: 0, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 4, opacity: 1 }, { inset: 4.8, width: 0.4, color: 1, opacity: 1 }] },
  corner: {
    size: 18,
    marks: [
      { shapes: [leaf([1, 17], [12, 13], 2.4), leaf([1, 17], [5, 6], 2.4)], color: 3 },
      { shapes: lotus([4.6, 13.6], 11), color: 2, group: 'corner' },
      { shapes: [circle(0.9, [4.6, 13.6])], color: 4 },
    ],
  },
  cartouche: { width: 22, depth: 16, marks: [{ shapes: lotus([0, 15], 13.6).map(mirrorShape), color: 2, group: 'fleur' }, { shapes: [ellipseShape([5, 1.2], [0, 15])], color: 3 }] },
  frieze: { module: 10, from: 19, fit: 'justify', marks: [{ shapes: [leaf([5, 5], [5, 0.8], 1)], color: 2, opacity: 0.9 }, { shapes: [circle(0.6, [0.6, 3])], color: 4 }] },
  motion: [
    { kind: 'pulse', targets: ['fleur', ...CORNER_GROUPS], duration: 4.6, stagger: 0.5, amplitude: 0.06, origin: 'self' },
  ],
});

// ── Mayas ───────────────────────────────────────────────────────────────

/** Une pyramide à gradins dans le coin : `steps` marches de `size` à rien. */
const stepped = (size: number, steps: number) => {
  const step = size / steps;
  const stairs = Array.from({ length: steps }, (_, index): P[] => [[size - index * step, 0.6 + (index + 1) * step], [size - (index + 1) * step, 0.6 + (index + 1) * step]]).flat();
  return poly([[0.6, 0.6], [size, 0.6], ...stairs.slice(0, -1), [0.6, size + 0.6]]);
};

export const SERPENT_DE_JADE_BANNER: AssortedBanner = banner({
  key: 'serpent-de-jade',
  palette: ['#10B981', '#065F46', '#6EE7B7', '#FACC15', '#B91C1C'],
  border: { width: 6, color: 1, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 3, opacity: 1 }] },
  corner: {
    size: 17,
    marks: [
      { shapes: [poly([[0.6, 0.6], [16, 0.6], [16, 6], [11, 6], [11, 11], [6, 11], [6, 16], [0.6, 16]])], color: 0 },
      { shapes: [poly([[3, 3], [9, 3], [9, 6], [6, 6], [6, 9], [3, 9]])], color: 3, group: 'corner' },
      { shapes: [poly([[11.4, 2.6], [15, 2.6], [13.2, 4.6]])], color: 4 },
    ],
  },
  frieze: {
    module: 10,
    from: 18,
    fit: 'justify',
    marks: [
      { shapes: [poly([[0, 1.2], [5, 4.8], [10, 1.2], [10, 3], [5, 6], [0, 3]])], color: 0, group: 'bande' },
      { shapes: [diamond([5, 2.6], 0.9)], color: 2 },
    ],
  },
  motion: [
    { kind: 'sweep', targets: ['bande'], duration: 6 },
    twinkleCorners(4, 0.5),
  ],
});

const glyph = ([x, y]: P, size: number) => ({
  frame: rect([x + size * 0.15, y + size * 0.15], [size * 0.7, size * 0.7]),
  dots: [circle(size * 0.1, [x + size * 0.36, y + size * 0.4]), circle(size * 0.1, [x + size * 0.64, y + size * 0.4])],
  mouth: line([[x + size * 0.3, y + size * 0.66], [x + size * 0.7, y + size * 0.66]]),
});
const glyphMarks = (g: ReturnType<typeof glyph>, group?: string) => [
  { shapes: [g.frame], color: 1, width: 0.5 },
  { shapes: g.dots, color: 3, ...(group === undefined ? {} : { group }) },
  { shapes: [g.mouth], color: 4, width: 0.5 },
];

export const CARTOUCHES_DE_GLYPHES_BANNER: AssortedBanner = banner({
  key: 'cartouches-de-glyphes',
  palette: ['#A8A29E', '#57534E', '#E7E5E4', '#D97706', '#B91C1C'],
  border: { width: 6.6, color: 0, opacity: 0.95, filets: [{ inset: 0.5, width: 0.45, color: 1, opacity: 1 }, { inset: 6, width: 0.45, color: 1, opacity: 1 }] },
  corner: { size: 15, marks: [{ shapes: [rect([0.6, 0.6], [13.8, 13.8])], color: 2 }, ...glyphMarks(glyph([1.6, 1.6], 11.8), 'corner')] },
  cartouche: { width: 20, depth: 18, marks: [{ shapes: [rect([-9, 0], [18, 17])], color: 2 }, { shapes: [rect([-9, 0], [18, 17])], color: 1, width: 0.6 }, ...glyphMarks(glyph([-7, 1.4], 14), 'yeux')] },
  frieze: { module: 8, from: 16, fit: 'justify', marks: [{ shapes: [rect([1, 1], [6, 4.6])], color: 1, width: 0.4, opacity: 0.9 }, { shapes: [circle(0.6, [4, 3.3])], color: 3 }] },
  motion: [
    { kind: 'twinkle', targets: ['yeux', ...CORNER_GROUPS], duration: 3.4, stagger: 0.6, amplitude: 0.6 },
  ],
});

export const FRISE_A_GRADINS_BANNER: AssortedBanner = banner({
  key: 'frise-a-gradins',
  palette: ['#B91C1C', '#06B6D4', '#FACC15', '#A8A29E'],
  border: { width: 6.6, color: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }, { inset: 6, width: 0.45, color: 2, opacity: 1 }] },
  corner: { size: 16, marks: [{ shapes: [stepped(15, 4)], color: 1, group: 'corner' }, { shapes: [stepped(8, 2)], color: 2 }] },
  frieze: {
    module: 12,
    from: 17,
    fit: 'justify',
    marks: [{ shapes: [poly([[0, 5.6], [0, 3.6], [2, 3.6], [2, 1.6], [4, 1.6], [4, 0.8], [8, 0.8], [8, 1.6], [10, 1.6], [10, 3.6], [12, 3.6], [12, 5.6]])], color: 1, opacity: 0.95, group: 'bande' }],
  },
  motion: [
    { kind: 'sweep', targets: ['bande'], duration: 6.5 },
    twinkleCorners(4.4, 0.45),
  ],
});

const rosette = ([x, y]: P, r: number) => [circle(r, [x, y]), circle(r * 0.55, [x, y])];

export const JAGUAR_DE_JUNGLE_BANNER: AssortedBanner = banner({
  key: 'jaguar-de-jungle',
  palette: ['#D97706', '#0C1A12', '#FACC15', '#16A34A'],
  border: { width: 6, color: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 1, opacity: 1 }, { inset: 5.4, width: 0.45, color: 1, opacity: 1 }] },
  corner: {
    size: 19,
    marks: [
      { shapes: fan([0.6, 0.6], 18.4, 4, 86, 5, 2.2), color: 3, group: 'corner' },
      { shapes: fan([0.6, 0.6], 18.4, 4, 86, 5, 2.2), color: 1, width: 0.3, opacity: 0.6 },
    ],
  },
  cartouche: {
    width: 24,
    depth: 11,
    marks: [
      { shapes: [ellipseShape([11, 5], [0, 4.6])], color: 1, opacity: 0.9 },
      { shapes: [catEye([-4.6, 5], 6.4, 3.4, -1), catEye([4.6, 5], 6.4, 3.4, 1)], color: 2, group: 'yeux' },
      { shapes: [ellipseShape([0.6, 1.4], [-4.6, 5]), ellipseShape([0.6, 1.4], [4.6, 5])], color: 1 },
    ],
  },
  frieze: { module: 9, from: 20, fit: 'justify', marks: [{ shapes: rosette([4.5, 3], 1.7), color: 1, evenOdd: true, opacity: 0.85 }] },
  side: [{ shapes: [24, 40, 56, 72].flatMap((y) => rosette([3, y], 1.6)), color: 1, evenOdd: true, opacity: 0.85 }],
  motion: [
    { kind: 'twinkle', targets: ['yeux'], duration: 4.2, amplitude: 0.85 },
    { kind: 'skew', targets: [...CORNER_GROUPS], duration: 4, stagger: 0.5, direction: 'alternate', amplitude: 3, origin: 'self' },
  ],
});

// ── Indiens ─────────────────────────────────────────────────────────────

const petals = (center: P, r: number, count: number, from = 0, to = 360 - 360 / count) => spread(count, from, to).map((degrees) => leaf(at(r * 0.3, degrees, center), at(r, degrees, center), r * 0.17));

export const MANDALA_FLORAL_BANNER: AssortedBanner = banner({
  key: 'mandala-floral',
  palette: ['#F97316', '#7C2D12', '#FACC15', '#BE185D'],
  border: { width: 5.8, color: 1, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }, { inset: 5.2, width: 0.45, color: 0, opacity: 1 }] },
  corner: { size: 18, marks: [{ shapes: petals([0.6, 0.6], 17, 5, 0, 90), color: 0, group: 'corner' }, { shapes: petals([0.6, 0.6], 10, 4, 11, 79), color: 3 }, { shapes: [circle(3.4, [0.6, 0.6])], color: 2 }] },
  cartouche: {
    width: 22,
    depth: 20,
    marks: [
      { shapes: petals([0, 10], 9.6, 12), color: 0, group: 'mandala' },
      { shapes: petals([0, 10], 6, 8, 22.5, 337.5), color: 3, group: 'mandala' },
      { shapes: [circle(2.2, [0, 10])], color: 2, group: 'mandala' },
    ],
  },
  frieze: { module: 8, from: 19, fit: 'justify', marks: [{ shapes: [circle(1.1, [4, 2.9])], color: 2 }, { shapes: [diamond([0.4, 2.9], 0.7)], color: 3 }] },
  motion: [
    { kind: 'rotate', targets: ['mandala'], duration: 30, origin: 'self' },
    twinkleCorners(5, 0.35),
  ],
});

const peacockEye = ([x, y]: P, k: number) => [ellipseShape([2.2 * k, 3 * k], [x, y]), ellipseShape([1.4 * k, 2 * k], [x, y + 0.3 * k]), ellipseShape([0.7 * k, 1 * k], [x, y + 0.5 * k])];
const peacockMarks = (centers: readonly P[], k: number, group?: string) => {
  const eyes = centers.map((center) => peacockEye(center, k));
  return [
    { shapes: eyes.map((eye) => eye[0]!), color: 4 },
    { shapes: eyes.map((eye) => eye[1]!), color: 2, ...(group === undefined ? {} : { group }) },
    { shapes: eyes.map((eye) => eye[2]!), color: 1 },
  ];
};

export const PAON_ROUE_BANNER: AssortedBanner = banner({
  key: 'paon-roue',
  palette: ['#0F766E', '#1E1B4B', '#FACC15', '#38BDF8', '#15803D'],
  border: { width: 5.6, color: 1, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 3, opacity: 1 }, { inset: 5, width: 0.4, color: 0, opacity: 1 }] },
  corner: {
    size: 19,
    marks: [
      { shapes: spread(4, 12, 78).map((degrees) => line([[0.6, 0.6], at(15, degrees, [0.6, 0.6])])), color: 0, width: 0.5 },
      ...peacockMarks(spread(4, 12, 78).map((degrees) => at(14.6, degrees, [0.6, 0.6])), 1.2, 'corner'),
    ],
  },
  cartouche: {
    width: 40,
    depth: 18,
    marks: [
      { shapes: spread(7, 20, 160).map((degrees) => line([[0, 1], at(13, degrees, [0, 1])])), color: 0, width: 0.5, group: 'roue' },
      ...peacockMarks(spread(7, 20, 160).map((degrees) => at(13.4, degrees, [0, 1])), 1.15, 'roue'),
    ],
  },
  frieze: { module: 9, from: 20, fit: 'justify', marks: [{ shapes: [ellipseShape([1.2, 1.6], [4.5, 2.8])], color: 3, opacity: 0.9, group: 'ocelles' }] },
  motion: [
    { kind: 'pulse', targets: ['roue'], duration: 5, amplitude: 0.06, origin: 'self' },
    { kind: 'twinkle', targets: ['ocelles', ...CORNER_GROUPS], duration: 3.6, stagger: 0.6, amplitude: 0.5 },
  ],
});

const marigold = ([x, y]: P, r: number) => [...spread(7, 0, 360 - 360 / 7).map((degrees) => circle(r * 0.42, at(r * 0.6, degrees, [x, y]))), circle(r * 0.6, [x, y])];

export const GUIRLANDE_SOUCIS_BANNER: AssortedBanner = banner({
  key: 'guirlande-soucis',
  palette: ['#F97316', '#C2410C', '#FBBF24', '#15803D', '#FFFBEB'],
  border: { width: 5, color: 1, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 1 }] },
  corner: {
    size: 17,
    marks: [
      { shapes: [leaf([4, 4], [15, 8], 2.2), leaf([4, 4], [8, 15], 2.2)], color: 3 },
      { shapes: marigold([5, 5], 4.4), color: 0, group: 'corner' },
      { shapes: [circle(1.6, [5, 5])], color: 2 },
    ],
  },
  cartouche: {
    width: 70,
    depth: 12,
    marks: [
      { shapes: [curve([[-34, 1], [-17, 9], [0, 1]]), curve([[0, 1], [17, 9], [34, 1]])], color: 3, width: 0.6 },
      { shapes: [-28, -17, -6].flatMap((x) => marigold([x, x === -17 ? 7.6 : 5], 2.2)), color: 0, group: 'fleurs' },
      { shapes: [6, 17, 28].flatMap((x) => marigold([x, x === 17 ? 7.6 : 5], 2.2)), color: 0, group: 'fleurs' },
      { shapes: [-17, 17].flatMap((x) => [poly([[x - 0.6, 9.4], [x + 0.6, 9.4], [x, 11.6]])]), color: 2 },
    ],
  },
  frieze: { module: 7, from: 18, fit: 'justify', marks: [{ shapes: [circle(1.3, [3.5, 2.5])], color: 2, opacity: 0.95, group: 'boutons' }] },
  motion: [
    { kind: 'skew', targets: ['fleurs'], duration: 5, direction: 'alternate', amplitude: 3, origin: 'top' },
    { kind: 'twinkle', targets: ['boutons', ...CORNER_GROUPS], duration: 3, stagger: 0.5, amplitude: 0.4 },
  ],
});

// ── Amérindiens ─────────────────────────────────────────────────────────

const dreamcatcher = (center: P, r: number) => ({
  hoop: circle(r, center),
  web: spread(7, 0, 308.6).map((degrees, index, all) => line([at(r, degrees, center), at(r * 0.45, (degrees + (all[(index + 1) % all.length]! + (index === all.length - 1 ? 360 : 0))) / 2, center)])),
  core: circle(r * 0.18, center),
});
const feather = (top: P, length: number) => leaf(top, [top[0], top[1] + length], length * 0.18);

export const CERCLE_TISSE_BANNER: AssortedBanner = banner({
  key: 'cercle-tisse',
  palette: ['#7C4A21', '#C08A52', '#14B8A6', '#C2410C', '#FAFAF9'],
  border: { width: 5.4, color: 0, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 1, opacity: 1 }, { inset: 4.8, width: 0.4, color: 2, opacity: 1 }] },
  corner: (() => {
    const small = dreamcatcher([8, 8], 6.4);
    return { size: 16, marks: [{ shapes: [small.hoop], color: 1, width: 1 }, { shapes: small.web, color: 4, width: 0.3, opacity: 0.9, group: 'corner' }, { shapes: [small.core], color: 2 }] };
  })(),
  cartouche: (() => {
    const big = dreamcatcher([0, 6.6], 5.6);
    return {
      width: 20,
      depth: 20,
      marks: [
        { shapes: [line([[0, 0], [0, 1]])], color: 1, width: 0.5 },
        { shapes: [big.hoop], color: 1, width: 0.9, group: 'attrape' },
        { shapes: big.web, color: 4, width: 0.3, group: 'attrape' },
        { shapes: [big.core], color: 2, group: 'attrape' },
        { shapes: [line([[-4, 10.6], [-4, 13]]), line([[4, 10.6], [4, 13]]), line([[0, 12.2], [0, 14]])], color: 1, width: 0.35, group: 'plumes' },
        { shapes: [feather([-4, 13], 5.6), feather([4, 13], 5.6), feather([0, 14], 5.4)], color: 3, group: 'plumes' },
      ],
    };
  })(),
  frieze: { module: 8, from: 17, fit: 'justify', marks: [{ shapes: [diamond([4, 2.7], 1.2)], color: 2, opacity: 0.9 }] },
  motion: [
    { kind: 'skew', targets: ['plumes'], duration: 3.6, direction: 'alternate', amplitude: 7, origin: 'top' },
    { kind: 'skew', targets: ['attrape'], duration: 5, direction: 'alternate', amplitude: 3, origin: 'top' },
    twinkleCorners(5, 0.35),
  ],
});

const beadDiamond = (center: P, rx: number, ry: number) => [diamond(center, rx, ry), diamond(center, rx * 0.5, ry * 0.5)];

export const PERLAGE_LOSANGES_BANNER: AssortedBanner = banner({
  key: 'perlage-losanges',
  palette: ['#F5DEB3', '#14B8A6', '#C2410C', '#1C1917'],
  border: { width: 6.6, color: 3, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 0, opacity: 1 }, { inset: 6, width: 0.45, color: 0, opacity: 1 }] },
  corner: {
    size: 16,
    marks: [
      { shapes: [rect([0.6, 0.6], [14.8, 14.8])], color: 0 },
      { shapes: [diamond([8, 8], 6.4)], color: 1, group: 'corner' },
      { shapes: [diamond([8, 8], 3.2)], color: 2 },
      { shapes: [diamond([8, 8], 1.2)], color: 3 },
    ],
  },
  frieze: {
    module: 10,
    from: 17,
    fit: 'justify',
    marks: [
      { shapes: [beadDiamond([5, 3.3], 3.6, 2.6)[0]!], color: 1, group: 'perles-a' },
      { shapes: [beadDiamond([5, 3.3], 3.6, 2.6)[1]!], color: 2, group: 'perles-b' },
      { shapes: [circle(0.5, [0.2, 3.3])], color: 0 },
    ],
  },
  side: [{ shapes: [24, 36, 48, 60, 72].map((y) => diamond([3.3, y], 2.4, 3.6)), color: 1 }, { shapes: [24, 36, 48, 60, 72].map((y) => diamond([3.3, y], 1.1, 1.7)), color: 2 }],
  motion: [
    { kind: 'twinkle', targets: ['perles-a', 'perles-b', ...CORNER_GROUPS], duration: 3.2, stagger: 0.5, amplitude: 0.4 },
  ],
});

const peaks = (size: number) => [poly([[0.6, size], [size * 0.32, size * 0.42], [size * 0.55, size * 0.7], [size * 0.78, size * 0.3], [size, size]])];

export const SOLEIL_MONTAGNES_BANNER: AssortedBanner = banner({
  key: 'soleil-montagnes',
  palette: ['#EAB308', '#C2410C', '#0F5E59', '#FAFAF9'],
  border: { width: 5.6, color: 2, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 0, opacity: 1 }, { inset: 5, width: 0.4, color: 1, opacity: 1 }] },
  corner: { size: 16, marks: [{ shapes: [rect([0.6, 0.6], [14.8, 14.8])], color: 1, opacity: 0.9 }, { shapes: peaks(15), color: 2 }, { shapes: [circle(2.2, [4.4, 4.4])], color: 0, group: 'corner' }] },
  cartouche: {
    width: 36,
    depth: 18,
    marks: [
      { shapes: spread(9, 10, 170).map((degrees) => line([at(8, degrees, [0, 0]), at(15.4, degrees, [0, 0])])), color: 0, width: 1.1, group: 'rayons' },
      { shapes: [circle(6.8, [0, 0])], color: 0 },
      { shapes: [circle(4.4, [0, 0])], color: 1 },
      { shapes: [poly([[-15, 18], [-8, 10], [-3, 15], [3, 8.6], [10, 15], [15, 18]])], color: 2, opacity: 0.95 },
      { shapes: [poly([[1.4, 10.4], [3, 8.6], [4.8, 10.6], [3, 10.1]])], color: 3 },
    ],
  },
  motion: [
    { kind: 'pulse', targets: ['rayons'], duration: 4.4, amplitude: 0.1, origin: 'frame' },
    twinkleCorners(5, 0.35),
  ],
});

// ── Australs ────────────────────────────────────────────────────────────

const dotRing = (center: P, r: number, count: number, size: number) => spread(count, 0, 360 - 360 / count).map((degrees) => circle(size, at(r, degrees, center)));

export const CERCLES_POINTS_BANNER: AssortedBanner = banner({
  key: 'cercles-points',
  palette: ['#9A3412', '#1C1917', '#FDF4E3', '#FBBF24', '#D97706'],
  border: { width: 6, color: 1, opacity: 0.92, filets: [{ inset: 0.5, width: 0.45, color: 4, opacity: 1 }] },
  corner: {
    size: 18,
    marks: [
      { shapes: [circle(8.4, [9, 9])], color: 0 },
      { shapes: dotRing([9, 9], 6.8, 16, 0.65), color: 2, group: 'corner' },
      { shapes: dotRing([9, 9], 4.2, 10, 0.6), color: 3 },
      { shapes: [circle(1.8, [9, 9])], color: 4 },
    ],
  },
  cartouche: { width: 20, depth: 19, marks: [{ shapes: [circle(9, [0, 9.4])], color: 0 }, { shapes: dotRing([0, 9.4], 7.4, 18, 0.65), color: 2, group: 'points-a' }, { shapes: dotRing([0, 9.4], 4.8, 12, 0.6), color: 3, group: 'points-b' }, { shapes: [circle(2, [0, 9.4])], color: 4 }] },
  frieze: { module: 5, from: 19, fit: 'justify', marks: [{ shapes: [circle(0.65, [2.5, 3])], color: 2, opacity: 0.9 }] },
  motion: [
    { kind: 'twinkle', targets: ['points-a', 'points-b', ...CORNER_GROUPS], duration: 3, stagger: 0.5, amplitude: 0.5 },
  ],
});

const turtle = (center: P) => {
  const [x, y] = center;
  return {
    flippers: [leaf([x - 3, y - 2], [x - 8, y - 5.6], 1.4), leaf([x + 3, y - 2], [x + 8, y - 5.6], 1.4), leaf([x - 2.6, y + 2.6], [x - 5.6, y + 5.4], 1), leaf([x + 2.6, y + 2.6], [x + 5.6, y + 5.4], 1)],
    head: ellipseShape([1.8, 2.2], [x, y - 5.6]),
    shell: ellipseShape([4.4, 5.2], [x, y]),
    plates: [diamond([x, y], 1.6, 2.2), ...[[-2.4, -2.2], [2.4, -2.2], [-2.4, 2.2], [2.4, 2.2]].map(([dx, dy]) => circle(0.9, [x + dx!, y + dy!]))],
  };
};

export const TORTUE_MARINE_BANNER: AssortedBanner = banner({
  key: 'tortue-marine',
  palette: ['#0E7490', '#083344', '#FDF4E3', '#D97706'],
  border: { width: 5.6, color: 1, opacity: 0.9, filets: [{ inset: 0.5, width: 0.45, color: 2, opacity: 0.9 }, { inset: 5, width: 0.4, color: 0, opacity: 1 }] },
  corner: { size: 16, marks: [{ shapes: [curve([[0.6, 12], [4, 8], [8, 12], [12, 8], [15.4, 12]]), curve([[0.6, 7], [4, 3], [8, 7], [12, 3], [15.4, 7]])], color: 2, width: 0.6, opacity: 0.85, group: 'corner' }] },
  cartouche: (() => {
    const shape = turtle([0, 9.6]);
    return {
      width: 22,
      depth: 18,
      marks: [
        { shapes: [...shape.flippers, shape.head], color: 0, group: 'tortue' },
        { shapes: [shape.shell], color: 3, group: 'tortue' },
        { shapes: shape.plates, color: 2, group: 'tortue' },
      ],
    };
  })(),
  frieze: { module: 6, from: 17, fit: 'justify', marks: [{ shapes: [circle(0.6, [3, 3])], color: 2, opacity: 0.85, group: 'bulles' }] },
  motion: [
    { kind: 'skew', targets: ['tortue'], duration: 4, direction: 'alternate', amplitude: 4, origin: 'self' },
    { kind: 'twinkle', targets: ['bulles', ...CORNER_GROUPS], duration: 4, stagger: 0.8, amplitude: 0.4 },
  ],
});

const SOUTHERN_CROSS: readonly (readonly [P, number])[] = [[[8, 2.6], 1.7], [[8, 13.4], 2], [[3.4, 7.4], 1.5], [[12.2, 8.4], 1.3], [[10.4, 10.6], 0.8]];

export const CROIX_DU_SUD_BANNER: AssortedBanner = banner({
  key: 'croix-du-sud',
  palette: ['#0B1E3F', '#1E3A8A', '#FFFFFF', '#93C5FD'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 0, y2: 1, stops: [{ color: 1, at: 0 }, { color: 0, at: 1 }] }],
  border: { width: 5.4, color: 0, gradient: 0, opacity: 0.9, filets: [{ inset: 4.8, width: 0.4, color: 3, opacity: 0.85 }] },
  corner: { size: 16, marks: [{ shapes: SOUTHERN_CROSS.map(([center, r]) => star(center, r, 5, 0.42)), color: 2, group: 'corner' }] },
  cartouche: { width: 16, depth: 14, marks: [{ shapes: [sparkle([0, 6.4], 5.4)], color: 2, group: 'etoile' }, { shapes: [circle(1.2, [0, 6.4])], color: 3 }] },
  frieze: { module: 20, from: 17, fit: 'repeat', marks: [{ shapes: [star([4, 2.6], 0.9, 5, 0.42), star([14, 2.2], 0.6, 5, 0.42)], color: 3, opacity: 0.9, group: 'ciel' }] },
  motion: [
    { kind: 'twinkle', targets: [...CORNER_GROUPS, 'ciel'], duration: 3.4, stagger: 0.6, amplitude: 0.7 },
    { kind: 'pulse', targets: ['etoile'], duration: 3, amplitude: 0.18, origin: 'self' },
  ],
});

export const EGYPTIENS_BANNERS = [COBRA_DORE_BANNER, SCARABEE_AILE_BANNER, SOLEIL_DU_DESERT_BANNER, LOTUS_DU_NIL_BANNER] as const;
export const MAYAS_BANNERS = [SERPENT_DE_JADE_BANNER, CARTOUCHES_DE_GLYPHES_BANNER, FRISE_A_GRADINS_BANNER, JAGUAR_DE_JUNGLE_BANNER] as const;
export const INDIENS_BANNERS = [MANDALA_FLORAL_BANNER, PAON_ROUE_BANNER, GUIRLANDE_SOUCIS_BANNER] as const;
export const AMERINDIENS_BANNERS = [CERCLE_TISSE_BANNER, PERLAGE_LOSANGES_BANNER, SOLEIL_MONTAGNES_BANNER] as const;
export const AUSTRAUX_BANNERS = [CERCLES_POINTS_BANNER, TORTUE_MARINE_BANNER, CROIX_DU_SUD_BANNER] as const;
export const SUD_OUEST_BANNERS: readonly AssortedBanner[] = [...EGYPTIENS_BANNERS, ...MAYAS_BANNERS, ...INDIENS_BANNERS, ...AMERINDIENS_BANNERS, ...AUSTRAUX_BANNERS];
