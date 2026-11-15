/**
 * Famille ASIATIQUE des cadres illustrés (#13962) — un DRAGON DE JADE qui ondule autour de l'avatar,
 * des NUAGES DE SOIE qui dérivent, des LANTERNES DE PAPIER qui se balancent.
 * Motifs d'inspiration (écailles, nuages enroulés, lanternes) : aucun idéogramme, aucun signe religieux.
 */
import type { IllustratedPack } from './packs.js';
import {
  C,
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
  oscillate,
  path,
  pathAnimated,
  polar,
  quad,
  rad,
  radial,
  ringArc,
  ringCircle,
  ringDiamonds,
  ringGradient,
  ringTicks,
  shadow,
  sharpShape,
  smoothShape,
  stack,
  still,
  stroke,
  taper,
} from './kit.js';

type Shape = ReturnType<typeof smoothShape>;

/** Un chemin qui se déforme en boucle : `build(u)` pour `u` de 0 à 1, `steps` étapes linéaires. */
const morph = (seconds: number, steps: number, build: (u: number) => Shape) =>
  pathAnimated(Array.from({ length: steps + 1 }, (_, index) => [(index * seconds) / steps, build((index % steps) / steps)] as const), LINEAR);

const spin = (seconds: number, degrees: number) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);

/** Une spirale ouverte (volute de nuage), du bord vers le cœur. */
const curl = (center: P, radius: number, start: number, turns = 1.2): P[] =>
  Array.from({ length: 9 }, (_, index) => polar(radius * (1 - (index / 8) * 0.8), start + 360 * turns * (index / 8), center));

/** Un nuage enroulé : trois lobes, une base, deux volutes dorées. */
function cloud(at: P, size: number, colors: { readonly light: string; readonly shade: string; readonly line: string }) {
  const lobes = [
    circle(5 * size, add(at, [-6 * size, 0.8 * size])),
    circle(6.6 * size, add(at, [0, -2 * size])),
    circle(5 * size, add(at, [6.4 * size, 0.8 * size])),
    ellipse([25 * size, 7 * size], add(at, [0, 3.2 * size])),
  ];
  const volutes = [curl(add(at, [-6 * size, 0.8 * size]), 3.4 * size, 200), curl(add(at, [6.4 * size, 0.8 * size]), 3.4 * size, -20, -1.2)].map((points) => path(smoothShape(points, false)));
  return [
    shadow(lobes, [0.6, 1.6], 24),
    art(lobes, [radial([[0, colors.light], [1, colors.shade]], add(at, [-2 * size, -4 * size]), 12 * size)]),
    art(volutes, [stroke(colors.line, 0.9 * size, 90)]),
  ];
}

// ── Dragon de jade ──────────────────────────────────────────────────────

const JADE = { night: '#06201A', deep: '#0B3B2E', jade: '#1F8A5B', light: '#8EE6B4', gold: '#E8B547', goldLight: '#FFE6A0', red: '#D7263D', pearl: '#FFF4D6' } as const;
const HEAD_AT = 282;
const TAIL_AT = 40;
const COIL = 55;
const SPINE_POINTS = 15;

/** L'échine, de la nuque (fixe) à la queue (qui ondule de plus en plus). */
const spine = (u: number, offset = 0): P[] =>
  Array.from({ length: SPINE_POINTS }, (_, index) => {
    const at = index / (SPINE_POINTS - 1);
    const degrees = HEAD_AT + (TAIL_AT - HEAD_AT) * at;
    return polar(COIL + offset + 4.2 * Math.sin(rad(degrees) * 5 - u * Math.PI * 2) * at, degrees);
  });

const BODY_WIDTHS = Array.from({ length: SPINE_POINTS }, (_, index) => Math.max(0.3, 10.5 - 10 * (index / (SPINE_POINTS - 1)) ** 1.2));

const leg = (u: number, index: number) => {
  const points = spine(u);
  const root = points[index]!;
  const out = polar(9, HEAD_AT + (TAIL_AT - HEAD_AT) * (index / (SPINE_POINTS - 1)), root);
  return taper([root, mix2(root, out, 0.6, [1.5, 0]), out], [3.2, 2.2, 0.3]);
};
const mix2 = (a: P, b: P, at: number, nudge: P): P => add([a[0] + (b[0] - a[0]) * at, a[1] + (b[1] - a[1]) * at], nudge);

function dragonHead() {
  const skull = path(smoothShape([[-3, -6], [6, -7.4], [13, -5], [18.5, -1.8, 'corner'], [17.4, 1.6], [12, 3.6], [6, 6.6], [-3, 6.2]]));
  const jaw = path(smoothShape([[6, 4.2], [12, 4.4], [16, 5.8, 'corner'], [11, 7.6], [5, 7]]));
  const horns = [taper([[3, -5.6], [-3, -11], [-10, -13.4]], [2.8, 1.8, 0.2]), taper([[0, -4.4], [-6, -7.6], [-12, -7.8]], [2.2, 1.4, 0.2])].map(path);
  const mane = [0, 1, 2].map((index) => path(taper([[-2, -2 + index * 3.4], [-9, -4 + index * 4.6], [-15, -3 + index * 6]], [4, 2.6, 0.2])));
  const whiskers = [path(smoothShape([[17, 0.4], [23, -3.4], [29, -1.6]], false)), path(smoothShape([[15, 4.6], [20, 8.6], [26, 8]], false))];
  return stack(
    [
      art(mane, [linear([[0, JADE.red], [1, JADE.gold]], [-2, 0], [-15, 6])]),
      shadow([skull, jaw], [0.6, 1.4], 36),
      art(horns, [linear([[0, JADE.goldLight], [1, JADE.gold]], [0, -4], [-10, -13]), stroke('#7A5212', 0.4)]),
      art([jaw], [fill(JADE.deep), stroke(JADE.gold, 0.6)]),
      art([skull], [linear([[0, JADE.light], [0.5, JADE.jade], [1, JADE.deep]], [8, -7], [8, 7]), stroke(JADE.gold, 0.8)]),
      art([path(smoothShape([[2, -3.2], [8, -5.4], [14, -3.4]], false))], [stroke('#FFFFFF', 0.7, 55)]),
      art([ellipse([3.8, 2.6], [8.6, -2.4])], [fill(JADE.goldLight), stroke(JADE.night, 0.4)]),
      art([ellipse([0.9, 2.2], [8.8, -2.4])], [fill(JADE.night)]),
      art([circle(0.7, [17, -0.6])], [fill(JADE.night)]),
      art(whiskers, [stroke(JADE.goldLight, 0.7, 90)], around([16, 2], { r: animated(oscillate(7, 2, 8)) })),
    ],
    { p: still(polar(COIL, HEAD_AT)), r: animated(keys([[0, 14], [2, 6], [4, 16], [6, 9], [8, 14]])), s: still([128, 128]) },
  );
}

function dragonFront() {
  const seconds = 8;
  const body = morph(seconds, 6, (u) => taper(spine(u), BODY_WIDTHS));
  const scales = morph(seconds, 6, (u) => smoothShape(spine(u, 0.6).slice(1, -2), false));
  const crest = morph(seconds, 6, (u) => smoothShape(spine(u, 4.6).slice(1, -4), false));
  const legs = [4, 9].map((index) => morph(seconds, 6, (u) => leg(u, index)));
  const pearl = stack(
    [glow(polar(66, -42), 8, JADE.goldLight, 0.9), art([circle(3.6, polar(66, -42))], [radial([[0, '#FFFFFF'], [0.6, JADE.pearl], [1, JADE.gold]], add(polar(66, -42), [-1.2, -1.2]), 4.2)])],
    around([C, C], { r: animated(keys([[0, -6], [2, 4], [4, 12], [6, 2], [8, -6]])) }),
  );
  return film('dragon-jade-avant', seconds, [
    art(legs, [fill(JADE.gold), stroke('#7A5212', 0.4)]),
    shadow([body], [1, 2.2], 40),
    art([body], [radial([[0, JADE.deep], [0.78, JADE.deep], [0.86, JADE.jade], [1, JADE.light]], [C, C], 66), stroke(JADE.night, 0.6)]),
    art([scales], [stroke(JADE.light, 4.4, 38, [1.1, 2])]),
    art([crest], [stroke(JADE.gold, 1.6, 95, [2, 2.6])]),
    dragonHead(),
    pearl,
  ]);
}

function dragonBack() {
  const seconds = 12;
  const clouds = [0, 1, 2, 3, 4].flatMap((index) => cloud(polar(60, -54 + index * 72), 0.9, { light: '#E6FFF1', shade: '#5FBF8E', line: JADE.gold }));
  return film('dragon-jade-arriere', seconds, [
    glow([C, C], 68, JADE.jade, 0.75, animated(keys([[0, 60], [4, 100], [8, 70], [12, 60]])), 0.58),
    stack(clouds, around([C, C], { r: spin(seconds, 72), o: still(80) })),
  ]);
}

const dragonStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [JADE.jade, JADE.deep, JADE.gold, JADE.light, JADE.red] },
  gradients: [ringGradient([[3, 0], [0, 0.45], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 2, opacity: 1, width: 0.8 },
      { d: ringTicks(28, 44.2, 47.8), color: 1, opacity: 0.6, width: 0.9 },
      { d: ringDiamonds(1, 46, 3.2, -90), color: 4, opacity: 1 },
    ],
  },
};

export const DRAGON_JADE = { key: 'dragon-jade', still: dragonStill, back: dragonBack, front: dragonFront };

// ── Nuages de soie ──────────────────────────────────────────────────────

const SILK = { night: '#1B1440', indigo: '#3A2E7A', rose: '#F4A6B8', blush: '#FFE3EA', gold: '#E9C46A', red: '#C8344B', white: '#FFFFFF' } as const;

const ribbon = (u: number, offset: number): Shape =>
  smoothShape(
    Array.from({ length: 11 }, (_, index) => {
      const at = index / 10;
      const degrees = 100 + 110 * at;
      return polar(61 + offset + 3.4 * Math.sin(at * Math.PI * 3 - u * Math.PI * 2), degrees);
    }),
    false,
  );

function silkFront() {
  const seconds = 8;
  const tone = { light: SILK.white, shade: SILK.rose, line: SILK.gold };
  const drift = (pairs: readonly (readonly [number, readonly [number, number]])[]) => animated(keys(pairs));
  const big = stack(cloud(polar(58, 140), 1.25, tone), { p: drift([[0, [0, 0]], [2, [3, -1]], [5, [-2, 1]], [8, [0, 0]]]) });
  const top = stack(cloud(polar(60, -38), 1.1, tone), { p: drift([[0, [0, 0]], [3, [-3, 1]], [6, [2, -1]], [8, [0, 0]]]) });
  const small = stack(cloud(polar(63, 52), 0.8, tone), { p: drift([[0, [0, 0]], [4, [2, 2]], [8, [0, 0]]]) });
  return film('nuages-soie-avant', seconds, [
    art([morph(seconds, 6, (u) => ribbon(u, 0))], [stroke('#000000', 4.6, 22)], { p: still([0.6, 1.4]) }),
    art([morph(seconds, 6, (u) => ribbon(u, 0))], [stroke(SILK.red, 3.6)]),
    art([morph(seconds, 6, (u) => ribbon(u, -0.8))], [stroke(SILK.gold, 0.9, 85)]),
    small,
    big,
    top,
  ]);
}

function silkBack() {
  const seconds = 10;
  const tone = { light: SILK.blush, shade: SILK.indigo, line: SILK.rose };
  const ring = [0, 1, 2, 3, 4, 5].flatMap((index) => cloud(polar(61, index * 60), 0.7, tone));
  return film('nuages-soie-arriere', seconds, [
    art([circle(68)], [radial([[0, SILK.rose], [1, SILK.indigo]], [C, C], 68, { alphas: [[0, 0], [0.6, 0], [0.72, 0.85], [1, 0]] })]),
    stack(ring, around([C, C], { r: spin(seconds, -60), o: still(70) })),
  ]);
}

const silkStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [SILK.indigo, SILK.night, SILK.rose, SILK.gold, SILK.red] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 1, width: 0.7 },
      { d: ringArc(46, 100, 210), color: 4, opacity: 1, width: 2.4 },
      { d: ringTicks(12, 44.6, 47.4, -75), color: 2, opacity: 0.85, width: 1.2 },
    ],
  },
};

export const NUAGES_SOIE = { key: 'nuages-soie', still: silkStill, back: silkBack, front: silkFront };

// ── Lanternes de papier ─────────────────────────────────────────────────

const LANTERN = { night: '#1A0F1F', red: '#D21F3C', deep: '#6E0B14', gold: '#E8B547', warm: '#FFB347', glow: '#FFD58A', cord: '#3B2A1A' } as const;
const CORD = quad([6, 42], [70, -34], [134, 42], 9);
const hangAt = (t: number): P => add(add([6 * (1 - t) ** 2, 42 * (1 - t) ** 2], [70 * 2 * t * (1 - t), -34 * 2 * t * (1 - t)]), [134 * t * t, 42 * t * t]);

function lantern(hang: P, size: number, phase: number, frames: number) {
  const body = ellipse([15, 14], [0, 12]);
  const flicker = animated(cycle([[0, [70]], [0.2, [100]], [0.35, [78]], [0.6, [96]], [1, [70]]], phase, frames));
  return stack(
    [
      art([path(sharpShape([[0, 0], [0, 4], [0, 0]], false))], [stroke(LANTERN.cord, 0.7)]),
      shadow([body], [0.8, 1.6], 34),
      glow([0, 12], 13, LANTERN.warm, 0.7, flicker),
      art([body], [radial([[0, LANTERN.glow], [0.45, LANTERN.red], [1, LANTERN.deep]], [-1.6, 10], 9)]),
      art([ellipse([8, 14], [0, 12]), ellipse([2.6, 14], [0, 12])], [stroke(LANTERN.deep, 0.6, 80)]),
      art([ellipse([5, 4], [-3, 9])], [radial([[0, '#FFFFFF'], [1, '#FFFFFF']], [-3, 9], 3, { alphas: [[0, 0.45], [1, 0]] })]),
      art([path(sharpShape([[-4.2, 3.6], [4.2, 3.6], [3.6, 6], [-3.6, 6]])), path(sharpShape([[-3.4, 18.4], [3.4, 18.4], [3, 20.4], [-3, 20.4]]))], [linear([[0, LANTERN.glow], [1, LANTERN.gold]], [0, 3], [0, 21]), stroke('#7A5212', 0.4)]),
      art([path(taper([[0, 20.4], [0.4, 25], [0, 29]], [2.6, 1.6, 0.3]))], [fill(LANTERN.red)]),
    ],
    { p: still(hang), s: still([size * 100, size * 100]), r: animated(cycle([[0, [-8]], [0.5, [8]], [1, [-8]]], phase, frames)) },
  );
}

function lanternFront() {
  const seconds = 6;
  const frames = seconds * 30;
  return film('lanternes-papier-avant', seconds, [
    art([path(smoothShape(CORD, false))], [stroke('#000000', 1.4, 28)], { p: still([0.4, 1]) }),
    art([path(smoothShape(CORD, false))], [stroke(LANTERN.cord, 0.9)]),
    lantern(hangAt(0.18), 0.95, 0, frames),
    lantern(hangAt(0.5), 0.8, 0.33, frames),
    lantern(hangAt(0.82), 0.95, 0.66, frames),
  ]);
}

const MOTES: readonly (readonly [number, number, number])[] = [
  [30, 0, 1.6],
  [48, 0.22, 1.2],
  [70, 0.47, 1.8],
  [92, 0.71, 1.3],
  [112, 0.36, 1.5],
  [60, 0.86, 1.1],
];

function lanternBack() {
  const seconds = 6;
  const frames = seconds * 30;
  const motes = MOTES.map(([x, phase, size]) =>
    art([circle(size, [0, 0])], [radial([[0, '#FFFFFF'], [1, LANTERN.warm]], [0, 0], size)], {
      p: animated(cycle([[0, [x, 136]], [0.5, [x + 5, 96]], [1, [x - 3, 56]]], phase, frames)),
      o: animated(cycle([[0, [0]], [0.25, [90]], [0.75, [70]], [1, [0]]], phase, frames)),
    }),
  );
  return film('lanternes-papier-arriere', seconds, [
    glow([C, C], 68, LANTERN.warm, 0.7, animated(keys([[0, 60], [2, 100], [4.5, 72], [6, 60]])), 0.6),
    glow([C, 24], 36, LANTERN.red, 0.5),
    ...motes,
  ]);
}

const lanternStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [LANTERN.red, LANTERN.deep, LANTERN.gold, LANTERN.glow] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 2, opacity: 1, width: 0.8 },
      { d: ringTicks(16, 43.6, 48.4), color: 1, opacity: 0.7, width: 0.6 },
      { d: ringDiamonds(3, 46, 2.6, -90), color: 3, opacity: 1 },
    ],
  },
};

export const LANTERNES_PAPIER = { key: 'lanternes-papier', still: lanternStill, back: lanternBack, front: lanternFront };

export const CADRES_ASIATIQUES: IllustratedPack = {
  slug: 'cadres-asiatiques',
  order: 10,
  names: {
    fr: { name: 'Cadres d’Asie', description: 'Trois cadres inspirés de l’Asie : un dragon de jade qui ondule autour de l’avatar, des nuages de soie qui dérivent, des lanternes de papier qui se balancent.' },
    en: { name: 'Asian frames', description: 'Three frames inspired by Asia: a jade dragon coiling around your avatar, drifting silk clouds and swaying paper lanterns.' },
    es: { name: 'Marcos de Asia', description: 'Tres marcos inspirados en Asia: un dragón de jade que ondula alrededor de tu avatar, nubes de seda a la deriva y farolillos de papel que se mecen.' },
    pt: { name: 'Molduras da Ásia', description: 'Três molduras inspiradas na Ásia: um dragão de jade que ondula à volta do teu avatar, nuvens de seda à deriva e lanternas de papel que balançam.' },
    de: { name: 'Asiatische Rahmen', description: 'Drei von Asien inspirierte Rahmen: ein Jadedrache, der sich um deinen Avatar windet, treibende Seidenwolken und schaukelnde Papierlaternen.' },
    it: { name: 'Cornici d’Asia', description: 'Tre cornici ispirate all’Asia: un drago di giada che si snoda attorno al tuo avatar, nuvole di seta alla deriva e lanterne di carta che dondolano.' },
    ar: { name: 'إطارات آسيوية', description: 'ثلاثة إطارات مستوحاة من آسيا: تنين من اليشم يتموّج حول صورتك الرمزية، وغيوم حريرية تنساب، وفوانيس ورقية تتأرجح.' },
  },
  frames: [
    { ...DRAGON_JADE, names: { fr: 'Dragon de jade', en: 'Jade dragon', es: 'Dragón de jade', pt: 'Dragão de jade', de: 'Jadedrache', it: 'Drago di giada', ar: 'تنين اليشم' } },
    { ...NUAGES_SOIE, names: { fr: 'Nuages de soie', en: 'Silk clouds', es: 'Nubes de seda', pt: 'Nuvens de seda', de: 'Seidenwolken', it: 'Nuvole di seta', ar: 'غيوم الحرير' } },
    { ...LANTERNES_PAPIER, names: { fr: 'Lanternes de papier', en: 'Paper lanterns', es: 'Farolillos de papel', pt: 'Lanternas de papel', de: 'Papierlaternen', it: 'Lanterne di carta', ar: 'فوانيس ورقية' } },
  ],
};
