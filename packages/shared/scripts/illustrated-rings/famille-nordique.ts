/**
 * Famille NORDIQUE des cadres illustrés (#13965) — corbeaux qui tournoient, aurore boréale,
 * anneau de pierre gravée, proue sculptée. Les signes gravés sont INVENTÉS (aucun alphabet
 * réel, aucun signe religieux) ; la proue et les corbeaux sont des silhouettes originales.
 */
import type { IllustratedFrame } from './frame.js';
import type { IllustratedPack } from './packs.js';
import {
  C,
  FPS,
  LINEAR,
  type Key,
  type P,
  add,
  animated,
  around,
  art,
  circle,
  cycle,
  ellipse,
  evenOdd,
  fill,
  film,
  glow,
  keys,
  linear,
  mix,
  path,
  pathAnimated,
  polar,
  quad,
  radial,
  ringArc,
  ringCircle,
  ringDiamonds,
  ringGradient,
  ringTicks,
  shadow,
  sharpShape,
  smoothShape,
  sparkle,
  stack,
  still,
  stroke,
  taper,
} from './kit.js';

const NORD = {
  night: '#0B1426',
  deep: '#13284A',
  teal: '#2DD4BF',
  green: '#4ADE80',
  violet: '#A78BFA',
  ice: '#E0F2FE',
  silver: '#CBD5E1',
  raven: '#0F1117',
  sheen: '#3B4A6B',
  moon: '#F5F1DC',
  wood: '#8A5328',
  woodLight: '#D49A5A',
  woodDark: '#3E2210',
  stone: '#56606D',
  stoneLight: '#A3ACB8',
  stoneDark: '#262C35',
  amber: '#FBBF24',
  ember: '#F97316',
  sailRed: '#B91C1C',
  sail: '#F1E6D0',
  sea: '#1E5A8A',
  foam: '#E6F4FF',
} as const;

const spin = (seconds: number, degrees = 360) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);

/** Un battement d'aile : l'aile se replie (`low` en échelle verticale) puis se rouvre, `period` secondes par battement. */
const flapKeys = (period: number, seconds: number, low: number): Key[] =>
  Array.from({ length: Math.round(seconds / period) * 2 + 1 }, (_, index) => ({ t: (index * period * FPS) / 2, s: index % 2 === 0 ? [100, 100] : [100, low] }));

// ── Corbeaux tournoyants ────────────────────────────────────────────────

/** Un corbeau en vol, tourné vers +x, centré sur son corps. */
function raven(period: number, seconds: number) {
  const body = path(smoothShape([[-10, 0.6], [-4, -2.9], [4, -2.7], [8.2, -1.8], [8.8, 1.2], [3, 3], [-5, 2.5]]));
  const head = circle(2.7, [9, -0.6]);
  const beak = path(sharpShape([[10.9, -1.6], [15.2, 0], [10.9, 1]]));
  const tail = path(smoothShape([[-9, -1.5], [-15.6, -3.6, 'corner'], [-14.4, 0.4], [-15.6, 4, 'corner'], [-9, 1.9]]));
  const wing = (dx: number) =>
    path(smoothShape([[3 + dx, -1.6], [-1 + dx, -8], [-7 + dx, -15.5, 'corner'], [-5.4 + dx, -10.4], [-10.4 + dx, -12.6, 'corner'], [-6.6 + dx, -6.6], [-10.6 + dx, -6.2, 'corner'], [-3 + dx, -1.6]]));
  const beat = animated(flapKeys(period, seconds, -52));
  return stack([
    art([wing(2)], [fill(NORD.sheen, 90)], { a: still([2, -1.6]), p: still([2, -1.6]), s: beat }),
    shadow([body, head, tail], [0.6, 1.4], 30),
    art([body, head, tail, beak], [linear([[0, NORD.sheen], [1, NORD.raven]], [0, -3], [0, 3]), stroke('#000000', 0.4, 70)]),
    art([wing(0)], [linear([[0, NORD.raven], [1, NORD.sheen]], [0, -14], [0, 0]), stroke(NORD.silver, 0.35, 45)], {
      a: still([3, -1.6]),
      p: still([3, -1.6]),
      s: beat,
    }),
    art([circle(0.7, [9.8, -1.3])], [fill(NORD.ice, 95)]),
    art([path(smoothShape([[-6, -1.2], [0, -2.2], [6, -1.6]], false))], [stroke(NORD.silver, 0.5, 50)]),
  ]);
}

function ravensFront() {
  const seconds = 12;
  const birds = (
    [
      [-90, 60, 1.2, 1.2],
      [30, 64, 1, 1],
      [150, 57, 1.5, 0.85],
    ] as const
  ).map(([degrees, r, period, size]) =>
    stack([raven(period, seconds)], { p: still(polar(r, degrees)), r: still(degrees + 90), s: still([size * 92, size * 92]) }),
  );
  const feathers = [0, 0.33, 0.66].map((phase, index) =>
    art([path(smoothShape([[0, -3], [1.4, 0], [0, 3.4], [-0.9, 0]]))], [fill(NORD.sheen)], {
      p: animated(cycle([[0, [36 + index * 34, 4]], [1, [44 + index * 30, 136]]], phase, seconds * FPS)),
      r: animated(cycle([[0, [0]], [0.5, [140]], [1, [300]]], phase, seconds * FPS)),
      o: animated(cycle([[0, [0]], [0.15, [90]], [0.8, [70]], [1, [0]]], phase, seconds * FPS)),
    }),
  );
  return film('corbeaux-tournoyants-avant', seconds, [stack(birds, around([C, C], { r: spin(seconds) })), ...feathers]);
}

function ravensBack() {
  const seconds = 12;
  const gusts = [0, 120, 240].map((degrees) =>
    art([path(smoothShape([polar(58, degrees), polar(63, degrees + 24), polar(60, degrees + 52)], false))], [stroke(NORD.silver, 1.2, 40)]),
  );
  return film('corbeaux-tournoyants-arriere', seconds, [
    glow([C, C], 68, NORD.deep, 0.95, 100, 0.55),
    glow([104, 30], 26, NORD.moon, 0.55, animated(keys([[0, 70], [5, 100], [12, 70]]))),
    art([circle(13, [104, 30])], [radial([[0, NORD.moon], [1, '#C9C3A8']], [100, 26], 14)]),
    art([circle(3, [100, 27]), circle(2, [108, 34])], [fill('#BDB698', 60)]),
    stack(gusts, around([C, C], { r: spin(seconds, -360) })),
  ]);
}

const ravenStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NORD.deep, NORD.raven, NORD.silver, NORD.moon] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.3)}${ringCircle(42.7)}`, color: 2, opacity: 0.85, width: 0.7 },
      { d: ringArc(46, -140, -100) + ringArc(46, -20, 20) + ringArc(46, 100, 140), color: 1, opacity: 0.9, width: 3 },
      { d: ringDiamonds(3, 46, 2.4, -60), color: 3, opacity: 1 },
    ],
  },
};

export const CORBEAUX_TOURNOYANTS: IllustratedFrame = { key: 'corbeaux-tournoyants', still: ravenStill, back: ravensBack, front: ravensFront };

// ── Aurore boréale ──────────────────────────────────────────────────────

/** Un rideau d'aurore : bord haut ondulé, hauteur variable, sur toute la largeur du film. */
function curtain(base: number, height: number, amplitude: number, phase: number) {
  const xs = [-6, 16, 38, 60, 82, 104, 126, 146];
  const top = xs.map((x, index): P => [x, base + amplitude * Math.sin(index * 1.3 + phase)]);
  const bottom = xs.map((x, index): P => [x, base + height + amplitude * 0.6 * Math.sin(index * 1.1 + phase * 1.4) + (index % 2) * 4]);
  return smoothShape([...top, ...[...bottom].reverse()].map((point, index, list) => (index === 0 || index === xs.length - 1 || index === xs.length || index === list.length - 1 ? [point[0], point[1], 'corner'] : point)));
}

function auroraBack() {
  const seconds = 9;
  const ribbon = (base: number, height: number, amplitude: number, colors: readonly [string, string], offset: number) =>
    art(
      [pathAnimated([0, 1, 2, 3].map((step) => [(step * seconds) / 3, curtain(base, height, amplitude, offset + ((step % 3) * Math.PI * 2) / 3)] as const))],
      [linear([[0, colors[0]], [1, colors[1]]], [70, base], [70, base + height + 8], { alphas: [[0, 0], [0.35, 0.85], [1, 0]] })],
    );
  return film('aurore-boreale-arriere', seconds, [
    glow([C, C], 69, NORD.night, 0.9, 100, 0.5),
    ribbon(10, 34, 7, [NORD.violet, NORD.green], 0),
    ribbon(22, 30, 6, [NORD.green, NORD.teal], 1.7),
    ribbon(34, 24, 5, [NORD.teal, NORD.green], 3.1),
    glow([C, 30], 40, NORD.green, 0.35, animated(keys([[0, 60], [2.2, 100], [5, 70], [7, 95], [9, 60]]))),
  ]);
}

/** Un flocon à six branches, chacune portant deux barbes. */
function snowflake(at: P, size: number) {
  const arms = [0, 60, 120, 180, 240, 300].flatMap((degrees) => {
    const tip = polar(size, degrees, [0, 0]);
    const barb = (k: number, s: number) => {
      const root = mix([0, 0], tip, k);
      return [path(sharpShape([polar(s, degrees - 50, root), root, polar(s, degrees + 50, root)], false))];
    };
    return [path(sharpShape([[0, 0], tip], false)), ...barb(0.55, size * 0.32), ...barb(0.8, size * 0.2)];
  });
  return art(arms, [stroke(NORD.ice, 1.1)], { p: still(at), r: spin(9, 60) });
}

function auroraFront() {
  const seconds = 9;
  const frames = seconds * FPS;
  const shards = Array.from({ length: 11 }, (_, index) => {
    const degrees = 28 + index * 12.4;
    const long = [9, 13, 7, 15, 10, 17, 10, 14, 7, 12, 8][index]!;
    return path(taper([polar(43, degrees), polar(48 + long / 2, degrees + 1.5), polar(48 + long, degrees)], [5.4, 3.2, 0.2]));
  });
  const stars = (
    [
      [[16, 18], 3.4, 0],
      [[124, 14], 3, 0.3],
      [[132, 46], 2.2, 0.55],
      [[8, 52], 2.4, 0.8],
      [[40, 6], 2, 0.15],
    ] as const
  ).map(([at, size, phase]) =>
    art([path(sparkle([0, 0], size))], [fill(NORD.ice)], { p: still(at), s: animated(cycle([[0, [20, 20]], [0.15, [110, 110]], [0.35, [20, 20]], [1, [20, 20]]], phase, frames)) }),
  );
  return film('aurore-boreale-avant', seconds, [
    shadow(shards, [0.6, 1.6], 35, NORD.night),
    art(shards, [linear([[0, NORD.ice], [1, NORD.teal]], [70, 110], [70, 140]), stroke('#FFFFFF', 0.5, 80)]),
    art([path(smoothShape([polar(47, 36), polar(51, 90), polar(47, 144)], false))], [stroke('#FFFFFF', 0.9, animated(keys([[0, 30], [3, 90], [6, 40], [9, 30]])))]),
    snowflake([20, 112], 7),
    snowflake([122, 116], 6),
    ...stars,
  ]);
}

const auroraStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NORD.night, NORD.green, NORD.teal, NORD.violet, NORD.ice] },
  gradients: [ringGradient([[3, 0], [1, 0.5], [2, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.3)}${ringCircle(42.7)}`, color: 4, opacity: 0.8, width: 0.6 },
      { d: ringTicks(11, 47, 49.6, 28), color: 4, opacity: 0.9, width: 0.8 },
      { d: ringDiamonds(6, 46, 1.6, -90), color: 4, opacity: 1 },
    ],
  },
};

export const AURORE_BOREALE: IllustratedFrame = { key: 'aurore-boreale', still: auroraStill, back: auroraBack, front: auroraFront };

// ── Anneau de pierre gravée ─────────────────────────────────────────────

/** Six signes INVENTÉS (chevrons, crochets, points), ni runes réelles, ni ceux du cercle runique. */
const MARKS: readonly (readonly (readonly P[])[])[] = [
  [[[-2.4, -3.4], [0, -1], [2.4, -3.4]], [[0, -1], [0, 3.6]]],
  [[[-2.4, 3.4], [-2.4, -3.4], [2.4, -0.6]], [[-2.4, 1], [2, 3.4]]],
  [[[0, -3.6], [2.6, 0], [0, 3.6], [-2.6, 0], [0, -3.6]]],
  [[[-2.6, -3.4], [2.6, -3.4]], [[-1.4, -3.4], [1.4, 3.6]], [[1.4, -3.4], [-1.4, 3.6]]],
  [[[-2.4, -3.6], [-2.4, 3.6], [2.4, 3.6]], [[0, -1.4], [2.4, -3.6]]],
  [[[0, -3.6], [0, 3.6]], [[-2.6, -1.6], [0, 0.6], [2.6, -1.6]]],
];

function stoneFront() {
  const seconds = 10;
  const frames = seconds * FPS;
  const count = 12;
  const band = [circle(57), circle(45)];
  const marks = Array.from({ length: count }, (_, index) => {
    const degrees = -90 + (index * 360) / count;
    const lines = MARKS[index % MARKS.length]!.map((points) => path(sharpShape(points, false)));
    const lit = animated(cycle([[0, [8]], [0.06, [100]], [0.24, [12]], [1, [8]]], index / count, frames));
    return stack(
      [
        art(lines, [stroke(NORD.stoneDark, 1.9)]),
        art(lines, [stroke('#FFFFFF', 0.5, 35)], { p: still([-0.4, -0.5]) }),
        art(lines, [stroke(NORD.ember, 3, 40)], { o: lit }),
        art(lines, [stroke(NORD.amber, 1.1)], { o: lit }),
      ],
      { p: still(polar(51, degrees)), r: still(degrees + 90) },
    );
  });
  const cracks = [
    [polar(57, 22), polar(53, 26), polar(50, 24)],
    [polar(45, 200), polar(49, 204), polar(52, 201)],
  ].map((points) => path(smoothShape(points, false)));
  const moss = [polar(55, 120), polar(56, 132), polar(54, 60)].map((at, index) => art([ellipse([7 - index, 3.2], at)], [radial([[0, '#5E8C3A'], [1, '#2F4A1E']], at, 4)]));
  return film('anneau-pierre-avant', seconds, [
    art(band, [evenOdd('#000000', 38)], { p: still([0, 2.4]) }),
    art(band, [radial([[0, NORD.stone], [0.8, NORD.stone], [0.9, NORD.stoneLight], [1, NORD.stone]], [C, C], 57, { evenOdd: true })]),
    art([circle(57)], [stroke(NORD.stoneDark, 1.2)]),
    art([circle(45)], [stroke(NORD.stoneLight, 0.9, 80)]),
    art([path(smoothShape([polar(56, -160), polar(56.6, -120), polar(56, -80)], false))], [stroke('#FFFFFF', 0.8, 45)]),
    art(cracks, [stroke(NORD.stoneDark, 0.6, 80)]),
    ...moss,
    ...marks,
  ]);
}

function stoneBack() {
  const seconds = 10;
  const wisps = [0, 0.33, 0.66].map((phase, index) =>
    art([ellipse([40, 9], [0, 0])], [radial([[0, NORD.silver], [1, NORD.silver]], [0, 0], 20, { alphas: [[0, 0.5], [1, 0]] })], {
      p: animated(cycle([[0, [-10, 34 + index * 34]], [1, [150, 40 + index * 30]]], phase, seconds * FPS)),
    }),
  );
  return film('anneau-pierre-arriere', seconds, [glow([C, C], 68, NORD.amber, 0.4, animated(keys([[0, 40], [2.5, 90], [6, 55], [10, 40]])), 0.62), ...wisps]);
}

const stoneStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NORD.stone, NORD.stoneDark, NORD.stoneLight, NORD.amber] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 7, gradient: 0 },
      { d: `${ringCircle(49.6)}${ringCircle(42.4)}`, color: 1, opacity: 1, width: 0.9 },
      { d: ringTicks(12, 44.2, 47.8, -90), color: 1, opacity: 0.95, width: 1.1 },
      { d: ringTicks(12, 45, 47, -75), color: 3, opacity: 0.9, width: 0.8 },
    ],
  },
};

export const ANNEAU_PIERRE: IllustratedFrame = { key: 'anneau-pierre-gravee', still: stoneStill, back: stoneBack, front: stoneFront };

// ── Proue sculptée ──────────────────────────────────────────────────────

/** La ligne médiane de la proue : du bas à gauche, le long du flanc, jusqu'à une volute au-dessus. */
const PROW_SPINE: readonly P[] = [...quad([40, 132], [-6, 92], [18, 30], 7), [26, 16], [36, 14], [40, 22], [34, 28]];

function prowFront() {
  const seconds = 8;
  const widths = [11, 10, 9, 8.4, 7.8, 7.2, 6.6, 6, 5, 3.4, 0.6];
  const neck = path(taper(PROW_SPINE, widths));
  const carving = path(smoothShape(PROW_SPINE.slice(1, 9).map((point) => add(point, [1.6, 0.4])), false));
  const shields = [64, 82, 100, 118].map((degrees, index) => {
    const at = polar(57, 180 - degrees);
    const color = index % 2 === 0 ? NORD.sailRed : NORD.sail;
    return [
      shadow([circle(6.6, at)], [0.6, 1.6], 40),
      art([circle(6.6, at)], [radial([[0, color], [1, index % 2 === 0 ? '#6B0F0F' : '#B8A88A']], add(at, [-2, -2]), 8), stroke(NORD.woodDark, 0.9)]),
      art([circle(2, at)], [radial([[0, NORD.silver], [1, NORD.stone]], add(at, [-0.6, -0.6]), 2.2)]),
    ];
  }).flat();
  const wave = (y: number, offset: number, color: string, opacity: number) =>
    art(
      [path(smoothShape([[-20, y + 20], [-20, y, 'corner'], [0, y - 4], [20, y], [40, y - 4], [60, y], [80, y - 4], [100, y], [120, y - 4], [140, y], [160, y - 4], [160, y + 20, 'corner']]))],
      [linear([[0, color], [1, NORD.sea]], [0, y - 4], [0, y + 14], { opacity })],
      { p: animated(keys([[0, [offset, 0]], [seconds / 2, [offset - 20, 1.5]], [seconds, [offset - 40, 0]]]), LINEAR) },
    );
  return film('proue-sculptee-avant', seconds, [
    ...shields,
    shadow([neck], [1.2, 2.4], 40),
    art([neck], [linear([[0, NORD.woodDark], [0.45, NORD.wood], [1, NORD.woodLight]], [10, 130], [38, 14]), stroke(NORD.woodDark, 0.8)]),
    art([carving], [stroke(NORD.woodDark, 0.9, 85, [2.2, 1.8])]),
    art([path(smoothShape(PROW_SPINE.slice(2, 8).map((point) => add(point, [-2.4, -0.4])), false))], [stroke(NORD.woodLight, 0.8, 70)]),
    art([circle(1.6, [31, 19])], [fill(NORD.amber)], { o: animated(keys([[0, 40], [2, 100], [4.5, 60], [8, 40]])) }),
    wave(126, 0, NORD.foam, 70),
    wave(132, 10, NORD.sea, 100),
  ]);
}

function prowBack() {
  const seconds = 8;
  const swell = animated(keys([[0, [100, 100]], [2.4, [107, 101]], [4.8, [97, 99]], [8, [100, 100]]]));
  const sailShape = smoothShape([[58, 8, 'corner'], [128, 8, 'corner'], [134, 44], [126, 80, 'corner'], [64, 80, 'corner'], [60, 44]]);
  const stripes = [70, 86, 102, 118].map((x) => path(sharpShape([[x, 8], [x + 8, 8], [x + 9, 80], [x + 1, 80]])));
  return film('proue-sculptee-arriere', seconds, [
    glow([C, C], 68, NORD.sea, 0.6, 100, 0.55),
    art([path(sharpShape([[94, 0], [96, 0], [96, 96], [94, 96]]))], [fill(NORD.woodDark)]),
    stack(
      [
        shadow([path(sailShape)], [1.4, 2], 35),
        art([path(sailShape)], [linear([[0, NORD.sail], [1, '#C9B890']], [60, 8], [130, 80])]),
        art(stripes, [fill(NORD.sailRed, 92)]),
        art([path(sailShape)], [stroke(NORD.woodDark, 0.8)]),
      ],
      around([94, 8], { s: swell }),
    ),
    art([path(sharpShape([[56, 7], [132, 7]], false))], [stroke(NORD.woodDark, 2.2)]),
  ]);
}

const prowStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NORD.wood, NORD.woodDark, NORD.woodLight, NORD.sailRed, NORD.sail] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.6, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.6)}`, color: 1, opacity: 1, width: 0.9 },
      { d: ringDiamonds(4, 46, 2.6, -45), color: 3, opacity: 1 },
      { d: ringArc(46, 20, 160), color: 4, opacity: 0.55, width: 1.2 },
    ],
  },
};

export const PROUE_SCULPTEE: IllustratedFrame = { key: 'proue-sculptee', still: prowStill, back: prowBack, front: prowFront };

// ── Le pack ─────────────────────────────────────────────────────────────

export const CADRES_NORDIQUES: IllustratedPack = {
  slug: 'cadres-nordiques',
  order: 13,
  names: {
    fr: { name: 'Cadres nordiques', description: 'Quatre cadres venus du grand Nord : des corbeaux qui tournoient, une aurore boréale qui ondule, un anneau de pierre gravée qui s’allume, une proue sculptée sur les vagues.' },
    en: { name: 'Nordic frames', description: 'Four frames from the far North: circling ravens, a rippling northern aurora, a carved stone ring that lights up and a carved prow riding the waves.' },
    es: { name: 'Marcos nórdicos', description: 'Cuatro marcos del gran Norte: cuervos que giran, una aurora boreal que ondula, un anillo de piedra grabada que se ilumina y una proa tallada sobre las olas.' },
    pt: { name: 'Molduras nórdicas', description: 'Quatro molduras do grande Norte: corvos que rodopiam, uma aurora boreal que ondula, um anel de pedra gravada que se acende e uma proa esculpida sobre as ondas.' },
    de: { name: 'Nordische Rahmen', description: 'Vier Rahmen aus dem hohen Norden: kreisende Raben, ein wogendes Nordlicht, ein gravierter Steinring, der aufleuchtet, und ein geschnitzter Bug auf den Wellen.' },
    it: { name: 'Cornici nordiche', description: 'Quattro cornici dal grande Nord: corvi che volteggiano, un’aurora boreale che ondeggia, un anello di pietra incisa che si illumina e una prua scolpita sulle onde.' },
    ar: { name: 'إطارات شمالية', description: 'أربعة إطارات من أقصى الشمال: غربان تحلّق في دوائر، وشفق قطبي يتموّج، وحلقة من الحجر المنقوش تضيء، ومقدّمة سفينة منحوتة فوق الأمواج.' },
  },
  frames: [
    { ...CORBEAUX_TOURNOYANTS, names: { fr: 'Corbeaux tournoyants', en: 'Circling ravens', es: 'Cuervos en círculo', pt: 'Corvos em círculo', de: 'Kreisende Raben', it: 'Corvi in volo', ar: 'غربان محلّقة' } },
    { ...AURORE_BOREALE, names: { fr: 'Aurore boréale', en: 'Northern lights', es: 'Aurora boreal', pt: 'Aurora boreal', de: 'Nordlicht', it: 'Aurora boreale', ar: 'الشفق القطبي' } },
    { ...ANNEAU_PIERRE, names: { fr: 'Anneau de pierre gravée', en: 'Carved stone ring', es: 'Anillo de piedra grabada', pt: 'Anel de pedra gravada', de: 'Gravierter Steinring', it: 'Anello di pietra incisa', ar: 'حلقة الحجر المنقوش' } },
    { ...PROUE_SCULPTEE, names: { fr: 'Proue sculptée', en: 'Carved prow', es: 'Proa tallada', pt: 'Proa esculpida', de: 'Geschnitzter Bug', it: 'Prua scolpita', ar: 'مقدّمة منحوتة' } },
  ],
};
