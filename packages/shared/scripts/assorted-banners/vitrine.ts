/**
 * Les bannières assorties de la VITRINE des cadres illustrés (#15553 ← #13960) : masque félin, toile
 * d'araignée, ailes d'ange, cercle runique, griffes d'os, ailes de démon — chacune dans la palette de son
 * contour d'avatar (`stroke.colors`, index pour index).
 */
import { type P, sparkle, taper } from '../illustrated-rings/kit.js';
import { type AssortedBanner, CORNER_GROUPS, at, banner, circle, curve, diamond, ellipseShape, leaf, line, mirrorShape, poly, smooth, spread, twinkleCorners, wing } from './draw.js';

// ── Masque félin ────────────────────────────────────────────────────────
// 0 violet · 1 nuit · 2 or · 3 or clair · 4 rouge

export const catEye = ([x, y]: P, w: number, h: number, side: 1 | -1) =>
  smooth([[x - (w / 2) * side, y + 0.8 * side, 'corner'], [x, y - h / 2], [x + (w / 2) * side, y - 0.8 * side, 'corner'], [x, y + h / 2]]);

const maskHalf: readonly P[] = [[0, 2.5], [5, 1.8], [11.5, -0.2], [14, 5], [15.5, 9], [13, 13.5], [8.5, 16.5], [3, 14], [0, 16]];
const maskOutline = smooth([...maskHalf.map(([x, y]): P => [x, y + 0.6]), ...[...maskHalf].slice(1, -1).reverse().map(([x, y]): P => [-x, y + 0.6])]);

export const MASQUE_FELIN_BANNER: AssortedBanner = banner({
  key: 'masque-felin',
  palette: ['#3B1F66', '#140A24', '#E2B04A', '#FFE7A6', '#FF2238'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 3, at: 0 }, { color: 2, at: 1 }] }],
  border: { width: 6, color: 1, opacity: 0.9, filets: [{ inset: 0.7, width: 0.5, color: 2, opacity: 1 }, { inset: 5.4, width: 0.45, color: 0, opacity: 1 }] },
  corner: {
    size: 17,
    marks: [
      { shapes: [poly([[1.5, 15], [3.5, 1.5], [15, 3.5]])], color: 2, gradient: 0 },
      { shapes: [poly([[4, 11.5], [5.2, 4.6], [11.5, 5.8]])], color: 0 },
      { shapes: [catEye([9.2, 9.2], 5.4, 2.6, 1)], color: 4, group: 'corner' },
    ],
  },
  cartouche: {
    width: 36,
    depth: 18,
    marks: [
      { shapes: [maskOutline], color: 1, opacity: 0.95 },
      { shapes: [maskOutline], color: 2, gradient: 0, width: 0.8 },
      { shapes: [poly([[5.2, 2.6], [10.6, 0.6], [11.8, 5.6]]), poly([[-5.2, 2.6], [-10.6, 0.6], [-11.8, 5.6]])], color: 0 },
      { shapes: [catEye([5.6, 7.4], 6.4, 3, 1), catEye([-5.6, 7.4], 6.4, 3, -1)], color: 4, group: 'yeux' },
      { shapes: [poly([[-1.4, 11.6], [1.4, 11.6], [0, 13.2]])], color: 3 },
    ],
  },
  frieze: { module: 12, from: 18, fit: 'justify', marks: [{ shapes: [diamond([6, 3], 1.1, 1.4)], color: 2, opacity: 0.9 }] },
  motion: [
    { kind: 'twinkle', targets: ['yeux'], duration: 4, amplitude: 0.8 },
    twinkleCorners(4, 0.7),
  ],
});

// ── Toile d'araignée ────────────────────────────────────────────────────
// 0 ardoise · 1 nuit · 2 soie · 3 rouge

const webSpokes = spread(5, 0, 90).map((degrees) => line([[0.6, 0.6], at(19, degrees, [0.6, 0.6])]));
const webRing = (r: number) => curve(spread(5, 0, 90).flatMap((degrees, index, all) => {
  const point = at(r, degrees, [0.6, 0.6]);
  if (index === all.length - 1) return [point];
  return [point, at(r * 0.86, (degrees + all[index + 1]!) / 2, [0.6, 0.6])];
}));

const spiderLegs = ([0, 1, 2, 3] as const).flatMap((leg) => ([1, -1] as const).map((side) => curve([[side * 1, 10.4 + leg * 0.9], [side * (3.4 + (leg === 0 || leg === 3 ? 0.4 : 1)), 8.6 + leg * 2], [side * (4.6 + (leg % 2) * 0.6), 11 + leg * 2.4]])));

export const TOILE_ARAIGNEE_BANNER: AssortedBanner = banner({
  key: 'toile-araignee',
  palette: ['#4B5568', '#0E1220', '#E8EEF7', '#C8323C'],
  border: { width: 5, color: 1, opacity: 0.88, filets: [{ inset: 0.6, width: 0.45, color: 2, opacity: 0.85 }, { inset: 4.4, width: 0.4, color: 0, opacity: 1 }] },
  corner: {
    size: 20,
    marks: [
      { shapes: webSpokes, color: 2, width: 0.4, opacity: 0.95, group: 'corner' },
      { shapes: [webRing(6), webRing(11.5), webRing(17)], color: 2, width: 0.35, opacity: 0.9, group: 'corner' },
    ],
  },
  cartouche: {
    width: 14,
    depth: 18,
    marks: [
      { shapes: [line([[0, 0], [0, 9.6]])], color: 2, width: 0.3, opacity: 0.9, group: 'araignee' },
      { shapes: spiderLegs, color: 1, width: 0.55, group: 'araignee' },
      { shapes: [circle(1.4, [0, 10.4]), ellipseShape([2.2, 2.7], [0, 13.6])], color: 1, group: 'araignee' },
      { shapes: [poly([[-0.7, 12.6], [0.7, 12.6], [0, 13.6]]), poly([[-0.7, 14.6], [0.7, 14.6], [0, 13.6]])], color: 3, group: 'araignee' },
    ],
  },
  motion: [
    { kind: 'skew', targets: ['araignee'], duration: 5, direction: 'alternate', amplitude: 6, origin: 'top' },
    { kind: 'twinkle', targets: [...CORNER_GROUPS], duration: 6, stagger: 1.5, amplitude: 0.35 },
  ],
});

// ── Ailes d'ange ────────────────────────────────────────────────────────
// 0 or · 1 or profond · 2 lumière · 3 blanc

const angelCorner = wing([2.5, 2.5], 16, 8, 82, 5);
const angelPair = wing([2.4, 7.5], 14, -24, 28, 5);

export const AILES_ANGE_BANNER: AssortedBanner = banner({
  key: 'ailes-ange',
  palette: ['#E9B949', '#9C6A17', '#FFF3C2', '#FFFFFF'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 3, at: 0 }, { color: 2, at: 0.4 }, { color: 0, at: 1 }] }],
  border: { width: 4.6, color: 1, opacity: 0.55, filets: [{ inset: 0.6, width: 0.6, color: 0, opacity: 1 }, { inset: 4, width: 0.4, color: 2, opacity: 1 }] },
  corner: {
    size: 19,
    marks: [
      { shapes: angelCorner, color: 0, gradient: 0, group: 'corner' },
      { shapes: angelCorner, color: 1, width: 0.25, opacity: 0.55, group: 'corner' },
    ],
  },
  cartouche: {
    width: 42,
    depth: 16,
    marks: [
      { shapes: [...angelPair, ...angelPair.map(mirrorShape)], color: 0, gradient: 0, group: 'ailes' },
      { shapes: [ellipseShape([5.4, 1.5], [0, 3.4])], color: 0, width: 0.9, group: 'halo' },
      { shapes: [sparkle([0, 9.6], 2.6)], color: 3, group: 'halo' },
    ],
  },
  frieze: { module: 16, from: 20, fit: 'justify', marks: [{ shapes: [sparkle([8, 2.3], 1.2)], color: 3, opacity: 0.95, group: 'eclats' }] },
  motion: [
    { kind: 'pulse', targets: ['halo'], duration: 4, amplitude: 0.12, origin: 'self' },
    { kind: 'pulse', targets: ['ailes'], duration: 6, amplitude: 0.05, origin: 'self' },
    { kind: 'twinkle', targets: ['eclats'], duration: 3, amplitude: 0.8 },
  ],
});

// ── Cercle runique ──────────────────────────────────────────────────────
// 0 nuit marine · 1 bleu · 2 cyan · 3 glace

const RUNES: readonly (readonly P[])[] = [
  [[0, -1.2], [0, 1.2], [0, -0.2], [0.8, -1]],
  [[-0.6, 1.2], [-0.6, -1.2], [0.6, -0.2], [-0.6, 0.4]],
  [[0, -1.2], [0, 1.2], [0, -1.2], [0.8, -0.4], [0, 0.4]],
  [[-0.7, -1.2], [0.7, 1.2], [0, 0], [-0.7, 1.2]],
  [[0, -1.2], [0, 1.2], [0, 0], [0.8, -0.8], [0, 0], [0.8, 0.8]],
];
export const rune = (index: number, center: P, k: number, angle = 0) => {
  const r = (angle * Math.PI) / 180;
  return line(RUNES[index % RUNES.length]!.map(([x, y]): P => [center[0] + k * (x * Math.cos(r) - y * Math.sin(r)), center[1] + k * (x * Math.sin(r) + y * Math.cos(r))]));
};
const runeDisc = (center: P, r: number) => [
  circle(r, center),
  circle(r * 0.62, center),
  ...spread(8, -90, 225).map((degrees, index) => rune(index, at(r * 0.81, degrees, center), r * 0.11, degrees + 90)),
];

export const CERCLE_RUNIQUE_BANNER: AssortedBanner = banner({
  key: 'cercle-runique',
  palette: ['#08133A', '#1D4ED8', '#38C8FF', '#C9F4FF'],
  border: { width: 6, color: 0, opacity: 0.9, filets: [{ inset: 0.7, width: 0.45, color: 2, opacity: 1 }, { inset: 5.3, width: 0.45, color: 1, opacity: 1 }] },
  corner: { size: 16, marks: [{ shapes: runeDisc([8, 8], 6.6), color: 2, width: 0.45, group: 'corner' }, { shapes: [diamond([8, 8], 1.2)], color: 3 }] },
  cartouche: { width: 22, depth: 19, marks: [{ shapes: runeDisc([0, 9.4], 9), color: 2, width: 0.5, group: 'cercle' }, { shapes: [diamond([0, 9.4], 1.8)], color: 3, group: 'coeur' }] },
  frieze: { module: 9, from: 17, fit: 'justify', marks: [{ shapes: [rune(0, [4.5, 3], 1.1)], color: 2, width: 0.35, opacity: 0.9, group: 'runes' }] },
  motion: [
    { kind: 'rotate', targets: ['cercle'], duration: 24, origin: 'self' },
    { kind: 'pulse', targets: ['coeur'], duration: 3, amplitude: 0.2, origin: 'self' },
    { kind: 'twinkle', targets: ['runes', ...CORNER_GROUPS], duration: 4, stagger: 0.8, amplitude: 0.6 },
  ],
});

// ── Griffes d'os ────────────────────────────────────────────────────────
// 0 pourpre · 1 nuit · 2 violet · 3 os · 4 rose

const claw = (root: P, tip: P, bend: number, width: number) => {
  const mid: P = [(root[0] + tip[0]) / 2 + bend, (root[1] + tip[1]) / 2 - bend * 0.4];
  return taper([root, mid, tip], [width, width * 0.7, 0.15]);
};

export const GRIFFES_OS_BANNER: AssortedBanner = banner({
  key: 'griffes-os',
  palette: ['#5B1A9E', '#14081F', '#A855F7', '#F0E9DA', '#E879F9'],
  border: { width: 5.4, color: 1, opacity: 0.92, filets: [{ inset: 0.6, width: 0.5, color: 2, opacity: 1 }, { inset: 4.8, width: 0.4, color: 0, opacity: 1 }] },
  corner: {
    size: 18,
    marks: [
      { shapes: [circle(4.4, [5, 5])], color: 0, opacity: 0.95 },
      { shapes: [claw([4, 5.5], [9.5, 17], 1.6, 2.4), claw([6, 4.5], [14.5, 14.5], 1.8, 2.6), claw([5.5, 3.5], [17, 9.5], 1.6, 2.4)], color: 3 },
      { shapes: [circle(1.3, [5, 5])], color: 4, group: 'corner' },
    ],
  },
  cartouche: {
    width: 26,
    depth: 17,
    marks: [
      { shapes: [ellipseShape([10.5, 3.2], [0, 1.8])], color: 0, opacity: 0.95 },
      { shapes: [claw([-6, 2], [-8.4, 15], -1.2, 2.6), claw([0, 2.4], [0, 16.4], 0, 2.9), claw([6, 2], [8.4, 15], 1.2, 2.6)], color: 3, group: 'griffes' },
      { shapes: [circle(1, [-6, 2.2]), circle(1, [0, 2.6]), circle(1, [6, 2.2])], color: 4, group: 'lueurs' },
    ],
  },
  motion: [
    { kind: 'pulse', targets: ['griffes'], duration: 3.5, amplitude: 0.06, origin: 'self' },
    { kind: 'twinkle', targets: ['lueurs', ...CORNER_GROUPS], duration: 2.8, stagger: 0.6, amplitude: 0.75 },
  ],
});

// ── Ailes de démon ──────────────────────────────────────────────────────
// 0 cuivre · 1 brun · 2 clair · 3 braise

/** Une aile de chauve-souris : bord d'attaque de `root` à `tip`, membrane festonnée entre les doigts. */
const batWing = (root: P, span: number) => {
  const fingers = spread(4, 6, 84).map((degrees) => at(span * (degrees > 40 && degrees < 60 ? 1 : 0.86), degrees, root));
  const scallops = fingers.slice(0, -1).map((finger, index) => {
    const next = fingers[index + 1]!;
    const mid: P = [(finger[0] + next[0]) / 2, (finger[1] + next[1]) / 2];
    return [root[0] + (mid[0] - root[0]) * 0.72, root[1] + (mid[1] - root[1]) * 0.72] as P;
  });
  const outline: P[] = [root, fingers[0]!, ...scallops.flatMap((scallop, index) => [scallop, fingers[index + 1]!])];
  return { membrane: poly(outline), ribs: fingers.map((finger) => line([root, finger])) };
};

const demonCorner = batWing([1.5, 1.5], 18);
const horn = (side: 1 | -1) => taper([[side * 3.6, 6], [side * 6.4, 3.4], [side * 6.6, 0.4]], [2.6, 1.8, 0.2]);

export const AILES_DEMON_BANNER: AssortedBanner = banner({
  key: 'ailes-demon',
  palette: ['#C06A2F', '#5E2A12', '#F6A866', '#FF4D1A'],
  gradients: [{ kind: 'linear', x1: 0, y1: 0, x2: 1, y2: 1, stops: [{ color: 0, at: 0 }, { color: 1, at: 1 }] }],
  border: { width: 5.6, color: 1, opacity: 0.92, filets: [{ inset: 0.6, width: 0.5, color: 3, opacity: 0.95 }, { inset: 5, width: 0.4, color: 0, opacity: 1 }] },
  corner: {
    size: 19,
    marks: [
      { shapes: [demonCorner.membrane], color: 0, gradient: 0, group: 'corner' },
      { shapes: demonCorner.ribs, color: 1, width: 0.6, group: 'corner' },
    ],
  },
  cartouche: {
    width: 20,
    depth: 12,
    marks: [
      { shapes: [horn(1), horn(-1)], color: 2 },
      { shapes: [leaf([-3.4, 6], [3.4, 6], 2.2)], color: 1 },
      { shapes: [diamond([0, 6], 1.4, 1.9)], color: 3, group: 'braise' },
    ],
  },
  frieze: { module: 14, from: 20, fit: 'justify', marks: [{ shapes: [poly([[5.6, 0.6], [8.4, 0.6], [7, 4.4]])], color: 3, opacity: 0.8, group: 'braises' }] },
  motion: [
    { kind: 'skew', targets: [...CORNER_GROUPS], duration: 3.6, direction: 'alternate', amplitude: 5, origin: 'self' },
    { kind: 'twinkle', targets: ['braise', 'braises'], duration: 2.4, stagger: 0.8, amplitude: 0.7 },
  ],
});

export const VITRINE_BANNERS: readonly AssortedBanner[] = [MASQUE_FELIN_BANNER, TOILE_ARAIGNEE_BANNER, AILES_ANGE_BANNER, CERCLE_RUNIQUE_BANNER, GRIFFES_OS_BANNER, AILES_DEMON_BANNER];
