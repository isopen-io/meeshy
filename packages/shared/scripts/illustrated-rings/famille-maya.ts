/**
 * Famille MAYA des cadres illustrés (#13967) — serpent de jade, cartouches de glyphes, frise à
 * gradins, jaguar de la jungle. Inspirés de la sculpture, des frises et de la forêt ; les glyphes
 * sont INVENTÉS (aucun glyphe réel lisible), le serpent est une créature originale, sans divinité.
 */
import type { IllustratedFrame } from './frame.js';
import type { IllustratedPack } from './packs.js';
import {
  C,
  FPS,
  LINEAR,
  type P,
  add,
  animated,
  around,
  art,
  circle,
  cycle,
  ellipse,
  fill,
  film,
  glow,
  keys,
  linear,
  mix,
  path,
  polar,
  radial,
  ringArc,
  ringCircle,
  ringDiamonds,
  ringGradient,
  ringPolygon,
  ringTicks,
  scale,
  shadow,
  sharpShape,
  smoothShape,
  stack,
  still,
  stroke,
  taper,
} from './kit.js';

const MAYA = {
  jade: '#10B981',
  jadeDeep: '#065F46',
  jadeLight: '#6EE7B7',
  turquoise: '#06B6D4',
  quetzal: '#16A34A',
  red: '#B91C1C',
  ochre: '#D97706',
  gold: '#FACC15',
  stone: '#A8A29E',
  stoneLight: '#E7E5E4',
  stoneDark: '#57534E',
  night: '#0C1A12',
  jungle: '#14532D',
  leaf: '#22C55E',
} as const;

const spin = (seconds: number, degrees = 360) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);

/** Un groupe de traits auquel s'ajoute un découpage (`tm`) qui parcourt le chemin. */
const trimmed = (group: { readonly ty: string; readonly it: readonly unknown[] }, length: number, seconds: number) => ({
  ...group,
  it: [group.it[0], { ty: 'tm', s: still(0), e: still(length), o: spin(seconds), m: 1 }, ...group.it.slice(1)],
});

// ── Serpent de jade ─────────────────────────────────────────────────────

const SERPENT_SPINE: readonly P[] = [160, 184, 208, 232, 256, 280, 304, 328, 352].map((degrees, index) => polar(55 + (index % 2 === 0 ? -1.6 : 1.6), degrees));
const HEAD_AT = polar(55, 8);

function serpentHead() {
  const skull = path(smoothShape([[-5, -4.6], [3, -5.4], [9.4, -2.4], [11.6, 0, 'corner'], [9, 1.4], [3, 2.2], [-5, 3.6]]));
  const jaw = path(smoothShape([[-3, 2.4], [4, 2.8], [9.6, 3.6, 'corner'], [4, 5.6], [-3, 4.8]]));
  return stack(
    [
      shadow([skull, jaw], [0.8, 1.6], 40),
      art([jaw], [linear([[0, MAYA.jade], [1, MAYA.jadeDeep]], [0, 2], [0, 6]), stroke(MAYA.jadeDeep, 0.5)], around([-3, 3], { r: animated(keys([[0, 0], [2, 16], [3, 0], [6.5, 12], [7.5, 0], [10, 0]])) })),
      art([skull], [linear([[0, MAYA.jadeLight], [0.5, MAYA.jade], [1, MAYA.jadeDeep]], [0, -6], [0, 3]), stroke(MAYA.jadeDeep, 0.6)]),
      art([path(smoothShape([[-3, -3.6], [3, -4.4], [8, -2]], false))], [stroke(MAYA.gold, 0.9)]),
      art([circle(1.5, [3.4, -1.6])], [fill(MAYA.gold)]),
      art([ellipse([0.7, 2.2], [3.4, -1.6])], [fill(MAYA.night)]),
      art([circle(0.5, [10, -1])], [fill(MAYA.night)]),
    ],
    { p: still(HEAD_AT), r: still(98) },
  );
}

function serpentCrest(seconds: number) {
  const frames = seconds * FPS;
  const root = polar(56, 354);
  return [300, 318, 336, 354, 12, 30].map((degrees, index) => {
    const length = [14, 18, 21, 22, 19, 15][index]!;
    const spine = [root, polar(length * 0.5, degrees, root), polar(length, degrees - 12, root)];
    const feather = path(taper(spine, [1.6, 4.6, 0.2]));
    return art([feather], [linear([[0, MAYA.quetzal], [0.7, MAYA.turquoise], [1, MAYA.red]], root, spine[2]!), stroke(MAYA.jadeDeep, 0.4)], {
      ...around(root),
      r: animated(cycle([[0, [0]], [0.25, [7]], [0.5, [-3]], [0.75, [5]], [1, [0]]], index / 6, frames)),
    });
  });
}

function serpentFront() {
  const seconds = 10;
  const spine = [...SERPENT_SPINE, HEAD_AT];
  const widths = spine.map((_, index) => 0.6 + Math.sin((Math.min(index, spine.length - 2) / (spine.length - 2)) * Math.PI * 0.62) * 8);
  const body = path(taper(spine, widths));
  const line = path(smoothShape(spine.slice(1), false));
  return film('serpent-jade-avant', seconds, [
    ...serpentCrest(seconds),
    shadow([body], [1, 2.4], 40),
    art([body], [linear([[0, MAYA.jadeDeep], [0.5, MAYA.jade], [1, MAYA.jadeLight]], [70, 30], [70, 6]), stroke(MAYA.jadeDeep, 0.6)]),
    art([line], [stroke(MAYA.gold, 1.6, 85, [1.2, 3.4])]),
    art([path(smoothShape(spine.slice(2).map((point) => add(point, scale([point[0] - C, point[1] - C], 0.035))), false))], [stroke(MAYA.jadeLight, 0.7, 75)]),
    trimmed(art([line], [stroke('#FFFFFF', 2.4, 55)]), 10, seconds),
    serpentHead(),
  ]);
}

function serpentBack() {
  const seconds = 10;
  const plumes = [200, 218, 236, 254, 272, 290].map((degrees, index) => {
    const base = polar(30, degrees);
    const spine = [base, polar(52, degrees + 4), polar(70, degrees - 2)];
    return art([path(taper(spine, [3, 8, 0.4]))], [linear([[0, MAYA.jadeDeep], [0.6, MAYA.quetzal], [1, MAYA.turquoise]], base, spine[2]!, { alphas: [[0, 0.9], [1, 0.75]] })], {
      ...around(base),
      r: animated(keys([[0, 0], [2 + index * 0.3, 4], [5 + index * 0.2, -3], [10, 0]])),
    });
  });
  return film('serpent-jade-arriere', seconds, [glow([C, C], 69, MAYA.quetzal, 0.7, animated(keys([[0, 55], [3, 100], [6.5, 70], [10, 55]])), 0.55), ...plumes]);
}

const serpentStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [MAYA.jade, MAYA.jadeDeep, MAYA.jadeLight, MAYA.gold, MAYA.red] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.6, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.6)}`, color: 1, opacity: 1, width: 0.9 },
      { d: ringTicks(20, 44.4, 47.6, -81), color: 3, opacity: 0.9, width: 0.8 },
      { d: ringDiamonds(1, 46, 3.4, -10), color: 4, opacity: 1 },
    ],
  },
};

export const SERPENT_JADE: IllustratedFrame = { key: 'serpent-de-jade', still: serpentStill, back: serpentBack, front: serpentFront };

// ── Cartouches de glyphes ───────────────────────────────────────────────

/** Cinq signes INVENTÉS : volutes, points et barres, dans un carré de 10 unités. */
const SIGNS: readonly (readonly (readonly P[])[])[] = [
  [[[-3, 3], [-3, -3], [3, -3], [3, 1], [-0.6, 1], [-0.6, -0.8]]],
  [[[-3.2, 2.6], [3.2, 2.6]], [[-2.6, -1.4], [0, -3.2], [2.6, -1.4], [0, 0.4], [-2.6, -1.4]]],
  [[[-3, -2.8], [-1, -0.6], [-3, 1.6]], [[3, -2.8], [1, -0.6], [3, 1.6]], [[-2, 3], [2, 3]]],
  [[[0, -3.2], [0, 3.2]], [[-3, 0], [3, 0]], [[-2.4, -2.4], [-1.2, -2.4]], [[1.2, 2.4], [2.4, 2.4]]],
  [[[-3, 0.8], [-1, -2.6], [1, 0.8], [3, -2.6]], [[-2.4, 3], [2.4, 3]]],
];

function cartoucheFront() {
  const seconds = 10;
  const frames = seconds * FPS;
  const count = 10;
  const tablets = Array.from({ length: count }, (_, index) => {
    const degrees = -90 + (index * 360) / count;
    const tablet = path(smoothShape([[-6, -6], [6, -6], [6, 6], [-6, 6]], true, 0.08));
    const lines = SIGNS[index % SIGNS.length]!.map((points) => path(sharpShape(points, false)));
    const dots = [circle(0.8, [-4.2, -4.2]), circle(0.8, [4.2, 4.2])];
    const lit = animated(cycle([[0, [0]], [0.07, [100]], [0.26, [0]], [1, [0]]], index / count, frames));
    return stack(
      [
        shadow([tablet], [0.6, 1.6], 45),
        art([tablet], [linear([[0, MAYA.stoneLight], [1, MAYA.stone]], [-6, -6], [6, 6]), stroke(MAYA.stoneDark, 0.9)]),
        art([path(smoothShape([[-4.6, -4.6], [4.6, -4.6], [4.6, 4.6], [-4.6, 4.6]], true, 0.08))], [stroke(MAYA.ochre, 0.6, 80)]),
        art(lines, [stroke(MAYA.stoneDark, 1.3)]),
        art(dots, [fill(MAYA.red)]),
        art(lines, [stroke(MAYA.gold, 2.6, 45)], { o: lit }),
        art(lines, [stroke('#FFFFFF', 0.8)], { o: lit }),
      ],
      { p: still(polar(54, degrees)), r: still(degrees + 90) },
    );
  });
  return film('cartouches-glyphes-avant', seconds, [
    art([circle(51), circle(45)], [radial([[0, MAYA.stoneDark], [0.88, MAYA.stoneDark], [1, MAYA.stone]], [C, C], 51, { evenOdd: true })]),
    ...tablets,
  ]);
}

function cartoucheBack() {
  const seconds = 10;
  return film('cartouches-glyphes-arriere', seconds, [
    glow([C, C], 69, MAYA.ochre, 0.7, animated(keys([[0, 55], [3.5, 100], [7, 70], [10, 55]])), 0.55),
    art([circle(64)], [stroke(MAYA.gold, 1.4, 70, [2, 4])], around([C, C], { r: spin(seconds) })),
  ]);
}

const cartoucheStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [MAYA.stone, MAYA.stoneDark, MAYA.stoneLight, MAYA.ochre, MAYA.red] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 7, gradient: 0 },
      { d: `${ringCircle(49.6)}${ringCircle(42.4)}`, color: 1, opacity: 1, width: 0.9 },
      { d: ringTicks(10, 42.6, 49.4, -72), color: 1, opacity: 0.9, width: 0.8 },
      { d: ringDiamonds(10, 46, 1.8, -90), color: 3, opacity: 1 },
    ],
  },
};

export const CARTOUCHES_GLYPHES: IllustratedFrame = { key: 'cartouches-de-glyphes', still: cartoucheStill, back: cartoucheBack, front: cartoucheFront };

// ── Frise à gradins ─────────────────────────────────────────────────────

/** Un motif à gradins : un crochet et un escalier, dans un rectangle de 12 × 10. */
const FRET: readonly (readonly P[])[] = [
  [[-6, 4.6], [-6, -4.4], [3, -4.4], [3, 1], [-2.2, 1], [-2.2, -1.2]],
  [[-2.6, 4.6], [0.4, 4.6], [0.4, 3.2], [3, 3.2], [3, 1.8], [6, 1.8], [6, -4.4]],
];

function fretFront() {
  const seconds = 8;
  const frames = seconds * FPS;
  const band = path(smoothShape([...[14, 52, 90, 128, 166].map((degrees) => polar(44, degrees)), ...[166, 128, 90, 52, 14].map((degrees) => polar(57, degrees))].map((point, index) => (index === 0 || index === 4 || index === 5 || index === 9 ? ([point[0], point[1], 'corner'] as const) : point))));
  const units = Array.from({ length: 9 }, (_, index) => {
    const degrees = 160 - index * 16.25;
    const lines = FRET.map((points) => path(sharpShape(points, false)));
    return stack(
      [art(lines, [stroke(MAYA.jadeDeep, 2.6)]), art(lines, [stroke(MAYA.turquoise, 1.6)]), art(lines, [stroke('#FFFFFF', 1.2)], { o: animated(cycle([[0, [0]], [0.08, [85]], [0.22, [0]], [1, [0]]], index / 9, frames)) })],
      { p: still(polar(50.5, degrees)), r: still(degrees - 90), s: still([88, 88]) },
    );
  });
  return film('frise-gradins-avant', seconds, [
    shadow([band], [0, 2.4], 42),
    art([band], [linear([[0, MAYA.red], [1, '#7F1D1D']], [70, 110], [70, 128]), stroke(MAYA.gold, 1)]),
    art([path(smoothShape([polar(45.4, 18), polar(45.4, 90), polar(45.4, 162)], false))], [stroke(MAYA.gold, 0.8, 80)]),
    ...units,
  ]);
}

function fretBack() {
  const seconds = 8;
  const tiers = [0, 1, 2, 3, 4].map((index) => {
    const half = 50 - index * 9;
    const top = 46 - (index + 1) * 8;
    return path(sharpShape([[C - half, top + 8], [C - half + 2, top], [C + half - 2, top], [C + half, top + 8]]));
  });
  const stair = path(sharpShape([[C - 5, 46], [C - 4, 6], [C + 4, 6], [C + 5, 46]]));
  const sun = stack(
    [glow([C, 4], 26, MAYA.gold, 0.8), art([circle(10, [C, 4])], [radial([[0, '#FFF7CC'], [1, MAYA.ochre]], [C - 2, 2], 11)])],
    { p: animated(keys([[0, [0, 30]], [2.5, [0, 2]], [5, [0, -4]], [8, [0, 30]]])) },
  );
  return film('frise-gradins-arriere', seconds, [
    glow([C, C], 69, MAYA.ochre, 0.6, 100, 0.55),
    sun,
    shadow(tiers, [0, 1.6], 40),
    art(tiers, [linear([[0, MAYA.stoneLight], [1, MAYA.stone]], [C, 6], [C, 46]), stroke(MAYA.stoneDark, 0.7)]),
    art([stair], [linear([[0, MAYA.stone], [1, MAYA.stoneDark]], [C, 6], [C, 46])]),
    art([path(sharpShape([[C - 9, -2], [C + 9, -2], [C + 9, 6], [C - 9, 6]]))], [fill(MAYA.red), stroke(MAYA.stoneDark, 0.6)]),
  ]);
}

const fretStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [MAYA.red, MAYA.turquoise, MAYA.gold, MAYA.stone] },
  gradients: [ringGradient([[3, 0], [0, 0.5], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.8, gradient: 0 },
      { d: `${ringCircle(49.5)}${ringCircle(42.5)}`, color: 2, opacity: 1, width: 0.8 },
      {
        d: Array.from({ length: 12 }, (_, index) => {
          const degrees = -90 + index * 30;
          return ringPolygon([polar(44, degrees - 4, [50, 50]), polar(44, degrees + 4, [50, 50]), polar(48, degrees + 4, [50, 50]), polar(48, degrees, [50, 50]), polar(46, degrees, [50, 50]), polar(46, degrees - 4, [50, 50])]);
        }).join(''),
        color: 1,
        opacity: 1,
      },
      { d: ringArc(46, -150, -30), color: 3, opacity: 0.5, width: 1 },
    ],
  },
};

export const FRISE_GRADINS: IllustratedFrame = { key: 'frise-a-gradins', still: fretStill, back: fretBack, front: fretFront };

// ── Jaguar de la jungle ─────────────────────────────────────────────────

/** Une grande feuille : limbe pointu, nervure, quatre paires de nervures secondaires. */
function leaf(base: P, degrees: number, length: number, width: number, sway: readonly number[], seconds: number) {
  const tip = polar(length, degrees, base);
  const side = polar(width / 2, degrees + 90, [0, 0]);
  const blade = path(smoothShape([[base[0], base[1], 'corner'], add(mix(base, tip, 0.35), side), add(mix(base, tip, 0.75), scale(side, 0.7)), [tip[0], tip[1], 'corner'], add(mix(base, tip, 0.75), scale(side, -0.7)), add(mix(base, tip, 0.35), scale(side, -1))]));
  const veins = [0.25, 0.45, 0.62, 0.78].flatMap((at) => {
    const root = mix(base, tip, at);
    const reach = (1 - Math.abs(at - 0.4)) * 0.8;
    return [path(sharpShape([root, add(mix(base, tip, at + 0.1), scale(side, reach))], false)), path(sharpShape([root, add(mix(base, tip, at + 0.1), scale(side, -reach))], false))];
  });
  return stack(
    [
      shadow([blade], [1, 2.2], 40),
      art([blade], [linear([[0, MAYA.jungle], [0.5, MAYA.quetzal], [1, MAYA.leaf]], base, tip), stroke(MAYA.jungle, 0.5)]),
      art([path(sharpShape([base, tip], false)), ...veins], [stroke(MAYA.jadeLight, 0.6, 60)]),
    ],
    around(base, { r: animated(sway.map((value, index) => ({ t: (index * seconds * FPS) / (sway.length - 1), s: [value] }))) }),
  );
}

function jaguarFront() {
  const seconds = 9;
  const frames = seconds * FPS;
  const rosettes = Array.from({ length: 14 }, (_, index) => {
    const at = polar(49, -90 + index * (360 / 14));
    return art([circle(2.1, at)], [stroke(MAYA.night, 1.1, 90, [2.2, 1.2])]);
  });
  const blink = animated(keys([[0, [100, 100]], [2, [100, 100]], [2.15, [100, 8]], [2.3, [100, 100]], [6.5, [100, 100]], [6.65, [100, 8]], [6.8, [100, 100]], [9, [100, 100]]]), LINEAR);
  const eye = (at: P, side: 1 | -1) =>
    stack(
      [
        glow(at, 7, MAYA.gold, 0.6),
        art([path(smoothShape([[at[0] - 4 * side, at[1] + 1, 'corner'], [at[0], at[1] - 2.6], [at[0] + 4 * side, at[1] - 1, 'corner'], [at[0], at[1] + 2.4]]))], [radial([[0, '#FEF08A'], [1, MAYA.ochre]], at, 4.4), stroke(MAYA.night, 0.7)]),
        art([ellipse([1.2, 4], at)], [fill(MAYA.night)]),
      ],
      around(at, { s: blink }),
    );
  return film('jaguar-jungle-avant', seconds, [
    art([circle(54), circle(44)], [radial([[0, MAYA.ochre], [0.86, MAYA.ochre], [1, MAYA.gold]], [C, C], 54, { evenOdd: true })]),
    art([circle(54), circle(44)], [{ ...stroke(MAYA.night, 0.8, 70) }]),
    ...rosettes,
    art([ellipse([30, 14], [24, 18])], [fill(MAYA.night, 85)]),
    eye([18, 18], -1),
    eye([31, 18], 1),
    leaf([0, 34], -42, 34, 15, [0, 6, -3, 4, 0], seconds),
    leaf([40, 2], 200, 30, 13, [0, -5, 2, -4, 0], seconds),
    leaf([4, 140], -50, 40, 17, [0, -4, 5, -2, 0], seconds),
    leaf([140, 136], -132, 38, 16, [0, 5, -3, 3, 0], seconds),
    leaf([140, 20], 160, 30, 13, [0, 3, -5, 2, 0], seconds),
    art([circle(0.8, [0, 0])], [fill('#FEF9C3')], { p: animated(cycle([[0, [96, 100]], [0.5, [116, 78]], [1, [96, 100]]], 0, frames)) }),
  ]);
}

function jaguarBack() {
  const seconds = 9;
  const frames = seconds * FPS;
  const fireflies = (
    [
      [[14, 70], [30, 40], 0],
      [[126, 60], [110, 30], 0.3],
      [[30, 128], [56, 112], 0.55],
      [[118, 118], [96, 130], 0.8],
    ] as const
  ).map(([from, to, phase]) =>
    stack([glow([0, 0], 5, MAYA.gold, 0.9), art([circle(1, [0, 0])], [fill('#FEF9C3')])], {
      p: animated(cycle([[0, from], [0.5, to], [1, from]], phase, frames)),
      o: animated(cycle([[0, [20]], [0.3, [100]], [0.6, [30]], [1, [20]]], phase, frames)),
    }),
  );
  return film('jaguar-jungle-arriere', seconds, [glow([C, C], 69, MAYA.jungle, 0.9, 100, 0.5), ...fireflies]);
}

const jaguarStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [MAYA.ochre, MAYA.night, MAYA.gold, MAYA.quetzal] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.6, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.6)}`, color: 1, opacity: 0.9, width: 0.8 },
      { d: Array.from({ length: 12 }, (_, index) => ringArc(46, -90 + index * 30, -78 + index * 30)).join(''), color: 1, opacity: 0.85, width: 2 },
      { d: ringArc(48.6, 150, 210) + ringArc(48.6, -30, 30), color: 3, opacity: 1, width: 1.6 },
    ],
  },
};

export const JAGUAR_JUNGLE: IllustratedFrame = { key: 'jaguar-de-jungle', still: jaguarStill, back: jaguarBack, front: jaguarFront };

// ── Le pack ─────────────────────────────────────────────────────────────

export const CADRES_MAYAS: IllustratedPack = {
  slug: 'cadres-mayas',
  order: 15,
  names: {
    fr: { name: 'Cadres mayas', description: 'Quatre cadres de pierre et de jade : un serpent de jade à crête de plumes, des cartouches de glyphes qui s’allument, une frise à gradins sous un soleil levant, un jaguar caché dans la jungle.' },
    en: { name: 'Maya frames', description: 'Four frames of stone and jade: a jade serpent with a feathered crest, glyph cartouches that light up, a stepped frieze under a rising sun and a jaguar hiding in the jungle.' },
    es: { name: 'Marcos mayas', description: 'Cuatro marcos de piedra y jade: una serpiente de jade con cresta de plumas, cartuchos de glifos que se iluminan, un friso escalonado bajo un sol naciente y un jaguar escondido en la selva.' },
    pt: { name: 'Molduras maias', description: 'Quatro molduras de pedra e jade: uma serpente de jade com crista de penas, cartuchos de glifos que se acendem, um friso em degraus sob um sol nascente e um jaguar escondido na selva.' },
    de: { name: 'Maya-Rahmen', description: 'Vier Rahmen aus Stein und Jade: eine Jadeschlange mit Federkamm, aufleuchtende Glyphenkartuschen, ein Stufenfries unter aufgehender Sonne und ein im Dschungel verborgener Jaguar.' },
    it: { name: 'Cornici maya', description: 'Quattro cornici di pietra e giada: un serpente di giada dalla cresta piumata, cartigli di glifi che si illuminano, un fregio a gradoni sotto il sole nascente e un giaguaro nascosto nella giungla.' },
    ar: { name: 'إطارات مايا', description: 'أربعة إطارات من الحجر واليشم: ثعبان من اليشم بعُرف من الريش، وخراطيش رموز تضيء، وإفريز مدرّج تحت شمس مشرقة، ونمر أمريكي يختبئ في الأدغال.' },
  },
  frames: [
    { ...SERPENT_JADE, names: { fr: 'Serpent de jade', en: 'Jade serpent', es: 'Serpiente de jade', pt: 'Serpente de jade', de: 'Jadeschlange', it: 'Serpente di giada', ar: 'ثعبان اليشم' } },
    { ...CARTOUCHES_GLYPHES, names: { fr: 'Cartouches de glyphes', en: 'Glyph cartouches', es: 'Cartuchos de glifos', pt: 'Cartuchos de glifos', de: 'Glyphenkartuschen', it: 'Cartigli di glifi', ar: 'خراطيش الرموز' } },
    { ...FRISE_GRADINS, names: { fr: 'Frise à gradins', en: 'Stepped frieze', es: 'Friso escalonado', pt: 'Friso em degraus', de: 'Stufenfries', it: 'Fregio a gradoni', ar: 'الإفريز المدرّج' } },
    { ...JAGUAR_JUNGLE, names: { fr: 'Jaguar de la jungle', en: 'Jungle jaguar', es: 'Jaguar de la selva', pt: 'Jaguar da selva', de: 'Dschungeljaguar', it: 'Giaguaro della giungla', ar: 'نمر الأدغال' } },
  ],
};
