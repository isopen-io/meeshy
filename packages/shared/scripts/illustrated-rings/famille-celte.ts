/**
 * Famille CELTE des cadres illustrés (#13964) — un NŒUD ENTRELACÉ qui s'efface puis se retrace,
 * une SPIRALE TRIPLE qui tourne au sommet de l'avatar, un LIERRE D'ÉMERAUDE dont les feuilles frémissent.
 * Ornements d'entrelacs et de spirales, aucun signe religieux.
 */
import type { IllustratedPack } from './packs.js';
import {
  C,
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
  path,
  polar,
  rad,
  radial,
  ringCircle,
  ringDiamonds,
  ringGradient,
  ringTicks,
  shadow,
  smoothShape,
  sparkle,
  stack,
  still,
  stroke,
  transform,
} from './kit.js';

const spin = (seconds: number, degrees: number) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);

/** Une pièce dont les formes sont TRACÉES par un trim path (`tm`) avant d'être peintes. */
const traced = (shapes: readonly unknown[], trim: unknown, paints: readonly unknown[], tr: Record<string, unknown> = {}) => ({
  ty: 'gr',
  it: [...shapes, trim, ...[...paints].reverse(), transform(tr)],
});

const CELT = { night: '#071A12', emerald: '#0F5132', green: '#2E8B57', leaf: '#6CC48A', bronze: '#9A6A2E', gold: '#E3B65A', cream: '#F4E9C9', stone: '#5E6B66', stoneLight: '#A7B3AD' } as const;

// ── Nœud entrelacé ──────────────────────────────────────────────────────

/** Un brin de la tresse : un cercle qui ondule `lobes` fois autour de l'avatar. */
const braid = (sign: 1 | -1, lobes = 7, radius = 53, depth = 5.2) =>
  smoothShape(Array.from({ length: lobes * 6 }, (_, index) => {
    const degrees = (index * 360) / (lobes * 6);
    return polar(radius + sign * depth * Math.sin(rad(degrees) * lobes), degrees);
  }));

/** Le nœud est entier à la première image (celle de « réduire les animations »), s'efface, puis se retrace. */
const knotTrim = (seconds: number) => {
  const at = (second: number) => second * 30;
  const start: Key[] = [{ t: 0, s: [0] }, { t: at(4), s: [0] }, { t: at(6), s: [100], h: 1 }, { t: at(6.4), s: [0] }, { t: at(seconds), s: [0] }];
  const end: Key[] = [{ t: 0, s: [100] }, { t: at(6), s: [100], h: 1 }, { t: at(6.4), s: [0] }, { t: at(9.4), s: [100] }, { t: at(seconds), s: [100] }];
  return { ty: 'tm', s: animated(start), e: animated(end), o: still(0), m: 1 };
};

function knotFront() {
  const seconds = 10;
  const strands = [path(braid(1)), path(braid(-1))];
  const trim = knotTrim(seconds);
  const studs = [-90, 0, 90, 180].map((degrees) => {
    const at = polar(53, degrees);
    return art([circle(3.4, at)], [radial([[0, '#FFFFFF'], [0.4, CELT.gold], [1, CELT.bronze]], add(at, [-1, -1]), 4), stroke(CELT.night, 0.5)]);
  });
  const glints = stack(
    [0, 120, 240].map((degrees) => art([path(sparkle(polar(60, degrees), 3))], [fill(CELT.cream, 90)])),
    around([C, C], { r: spin(seconds, 360) }),
  );
  return film('noeud-entrelace-avant', seconds, [
    traced(strands, trim, [stroke('#000000', 5.6, 30)], { p: still([0.6, 1.6]) }),
    traced(strands, trim, [stroke(CELT.night, 4.8)]),
    traced(strands, trim, [stroke(CELT.gold, 3.2)]),
    traced(strands, trim, [stroke(CELT.cream, 0.8, 75)], { p: still([-0.4, -0.6]) }),
    ...studs,
    glints,
  ]);
}

function knotBack() {
  const seconds = 10;
  return film('noeud-entrelace-arriere', seconds, [
    glow([C, C], 68, CELT.green, 0.8, animated(keys([[0, 60], [3, 100], [7, 70], [10, 60]])), 0.6),
    art([circle(60), circle(46)], [radial([[0, CELT.stone], [0.8, CELT.stone], [0.9, CELT.stoneLight], [1, CELT.stone]], [C, C], 60, { evenOdd: true, opacity: 85 })]),
    art([circle(53)], [stroke(CELT.night, 0.8, 60, [0.1, 3.8])], around([C, C], { r: spin(seconds, -36) })),
  ]);
}

const knotStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [CELT.emerald, CELT.night, CELT.gold, CELT.cream] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 2, opacity: 1, width: 0.8 },
      { d: ringTicks(14, 44, 48, -90), color: 2, opacity: 0.9, width: 1.1 },
      { d: ringDiamonds(4, 46, 2.4, -90), color: 3, opacity: 1 },
    ],
  },
};

export const NOEUD_ENTRELACE = { key: 'noeud-entrelace', still: knotStill, back: knotBack, front: knotFront };

// ── Spirale triple ──────────────────────────────────────────────────────

/** Trois volutes enroulées autour d'un même cœur, de rayon `radius`. */
function tripleSpiral(center: P, radius: number) {
  return [0, 120, 240].map((offset) => {
    const eye = polar(radius * 0.48, -90 + offset, center);
    const points = Array.from({ length: 12 }, (_, index) => {
      const at = index / 11;
      return polar(radius * 0.5 * (1 - at) + 0.4, -90 + offset + 180 + 420 * at, eye);
    });
    return path(smoothShape([center, ...points], false, 0.2));
  });
}

function spiralMedallion(center: P, radius: number, seconds: number, turn: number) {
  const arms = tripleSpiral(center, radius);
  return stack(
    [
      shadow([circle(radius + 2.4, center)], [0.6, 1.6], 38),
      art([circle(radius + 2.4, center)], [radial([[0, CELT.green], [1, CELT.night]], add(center, [-2, -2]), radius + 3), stroke(CELT.gold, 1.1)]),
      art(arms, [stroke(CELT.night, radius * 0.24)]),
      art(arms, [stroke(CELT.gold, radius * 0.15)]),
      art(arms, [stroke(CELT.cream, radius * 0.04, 70)]),
    ],
    around(center, { r: spin(seconds, turn) }),
  );
}

function spiralFront() {
  const seconds = 9;
  const band = (from: number, to: number) => smoothShape(Array.from({ length: 7 }, (_, index) => polar(60, from + ((to - from) * index) / 6)), false);
  const links = [band(-74, 26), band(56, 124), band(154, 254)].map(path);
  return film('spirale-triple-avant', seconds, [
    art(links, [stroke(CELT.night, 3.2, 90)]),
    art(links, [stroke(CELT.gold, 1.6, 95, [3, 2])]),
    spiralMedallion([C, 12.6], 9.6, seconds, 120),
    spiralMedallion(polar(60, 40), 7.6, seconds, -120),
    spiralMedallion(polar(60, 140), 7.6, seconds, -120),
  ]);
}

function spiralBack() {
  const seconds = 9;
  return film('spirale-triple-arriere', seconds, [
    glow([C, C], 68, CELT.emerald, 0.85, 100, 0.58),
    stack([art([circle(64)], [stroke(CELT.leaf, 1, 70, [6, 4])]), art([circle(66.4)], [stroke(CELT.gold, 0.6, 60, [1, 3])])], around([C, C], { r: spin(seconds, 40) })),
    glow([C, 13], 22, CELT.gold, 0.55, animated(keys([[0, 50], [2, 100], [5, 70], [9, 50]]))),
  ]);
}

const spiralStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [CELT.green, CELT.night, CELT.gold, CELT.cream] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 2, opacity: 1, width: 0.8 },
      { d: ringDiamonds(3, 46, 3, -90), color: 3, opacity: 1 },
      { d: ringTicks(30, 44.6, 47.4), color: 1, opacity: 0.6, width: 0.6 },
    ],
  },
};

export const SPIRALE_TRIPLE = { key: 'spirale-triple', still: spiralStill, back: spiralBack, front: spiralFront };

// ── Lierre d'émeraude ───────────────────────────────────────────────────

const VINE_FROM = 125;
const VINE_TO = 415;

const vinePoint = (at: number): P => {
  const degrees = VINE_FROM + (VINE_TO - VINE_FROM) * at;
  return polar(55 + 3.2 * Math.sin(at * Math.PI * 10), degrees);
};

/** Une feuille de lierre à trois lobes, pointe vers le haut du repère local. */
const IVY = smoothShape([
  [0, 0, 'corner'],
  [-3.2, -1.4],
  [-6, -4.6, 'corner'],
  [-3.4, -6.4],
  [-3.2, -9.6, 'corner'],
  [0, -12.6, 'corner'],
  [3.2, -9.6, 'corner'],
  [3.4, -6.4],
  [6, -4.6, 'corner'],
  [3.2, -1.4],
]);

function leaf(at: number, size: number, phase: number, frames: number) {
  const base = vinePoint(at);
  const degrees = VINE_FROM + (VINE_TO - VINE_FROM) * at;
  const outward = (Math.round(at * 20) % 2 === 0 ? 1 : -1) * 38;
  return stack(
    [
      shadow([path(IVY)], [0.5, 1.2], 34),
      art([path(IVY)], [linear([[0, CELT.leaf], [1, CELT.emerald]], [0, -12], [0, 0]), stroke(CELT.night, 0.4)]),
      art([path(smoothShape([[0, -0.4], [0, -10.4]], false)), path(smoothShape([[0, -3], [-3.6, -5]], false)), path(smoothShape([[0, -3], [3.6, -5]], false))], [stroke(CELT.gold, 0.45, 80)]),
    ],
    {
      p: still(base),
      s: still([size * 100, size * 100]),
      r: animated(cycle([[0, [degrees + 90 + outward]], [0.5, [degrees + 90 + outward + 10]], [1, [degrees + 90 + outward]]], phase, frames)),
    },
  );
}

function ivyFront() {
  const seconds = 8;
  const frames = seconds * 30;
  const vine = path(smoothShape(Array.from({ length: 31 }, (_, index) => vinePoint(index / 30)), false));
  const leaves = Array.from({ length: 13 }, (_, index) => leaf(0.04 + index * 0.077, index % 3 === 1 ? 0.75 : 0.95, index / 13, frames));
  const berries = [0.12, 0.42, 0.72].flatMap((at) => {
    const base = polar(6, VINE_FROM + (VINE_TO - VINE_FROM) * at + 90, vinePoint(at));
    return [-1.6, 1.6].map((dx) => art([circle(1.5, add(base, [dx, 0]))], [radial([[0, '#FFFFFF'], [0.4, '#4B5DB8'], [1, '#141B3D']], add(base, [dx - 0.5, -0.5]), 2)]));
  });
  return film('lierre-emeraude-avant', seconds, [
    art([vine], [stroke('#000000', 3, 28)], { p: still([0.5, 1.2]) }),
    art([vine], [stroke(CELT.bronze, 2.2)]),
    art([vine], [stroke(CELT.gold, 0.6, 70)]),
    ...leaves,
    ...berries,
  ]);
}

function ivyBack() {
  const seconds = 8;
  const rings = [0, 60, 120, 180, 240, 300].map((degrees) => ellipse([30, 30], polar(52, degrees)));
  return film('lierre-emeraude-arriere', seconds, [
    glow([C, C], 68, CELT.leaf, 0.6, animated(keys([[0, 55], [2.5, 100], [5.5, 70], [8, 55]])), 0.6),
    art(rings, [stroke(CELT.emerald, 1.4, 60)], around([C, C], { r: spin(seconds, 60) })),
    art([circle(46), circle(43)], [evenOdd(CELT.night, 50)]),
  ]);
}

const ivyStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [CELT.emerald, CELT.night, CELT.leaf, CELT.bronze] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 1, width: 0.8 },
      { d: ringDiamonds(12, 46, 2.2, -90), color: 2, opacity: 1 },
      { d: ringDiamonds(12, 46, 1, -75), color: 3, opacity: 0.9 },
    ],
  },
};

export const LIERRE_EMERAUDE = { key: 'lierre-emeraude', still: ivyStill, back: ivyBack, front: ivyFront };

export const CADRES_CELTES: IllustratedPack = {
  slug: 'cadres-celtes',
  order: 12,
  names: {
    fr: { name: 'Cadres celtes', description: 'Trois cadres inspirés des entrelacs celtes : un nœud entrelacé qui s’efface puis se retrace, une spirale triple qui tourne, un lierre d’émeraude dont les feuilles frémissent.' },
    en: { name: 'Celtic frames', description: 'Three frames inspired by Celtic interlace: a knot that fades and redraws itself, a turning triple spiral and an emerald ivy whose leaves quiver.' },
    es: { name: 'Marcos celtas', description: 'Tres marcos inspirados en los entrelazados celtas: un nudo que se borra y se vuelve a trazar, una espiral triple que gira y una hiedra esmeralda de hojas que tiemblan.' },
    pt: { name: 'Molduras celtas', description: 'Três molduras inspiradas nos entrelaçados celtas: um nó que se apaga e se volta a traçar, uma espiral tripla que gira e uma hera esmeralda de folhas que estremecem.' },
    de: { name: 'Keltische Rahmen', description: 'Drei von keltischen Flechtmustern inspirierte Rahmen: ein Knoten, der verblasst und sich neu zeichnet, eine kreisende Dreifachspirale und smaragdgrüner Efeu mit zitternden Blättern.' },
    it: { name: 'Cornici celtiche', description: 'Tre cornici ispirate agli intrecci celtici: un nodo che svanisce e si ridisegna, una spirale tripla che gira e un’edera smeraldo dalle foglie che fremono.' },
    ar: { name: 'إطارات سلتية', description: 'ثلاثة إطارات مستوحاة من الزخارف السلتية المتشابكة: عقدة تمّحي ثم تُرسم من جديد، ولولب ثلاثي يدور، ولبلاب زمرّدي ترتعش أوراقه.' },
  },
  frames: [
    { ...NOEUD_ENTRELACE, names: { fr: 'Nœud entrelacé', en: 'Interlaced knot', es: 'Nudo entrelazado', pt: 'Nó entrelaçado', de: 'Flechtknoten', it: 'Nodo intrecciato', ar: 'العقدة المتشابكة' } },
    { ...SPIRALE_TRIPLE, names: { fr: 'Spirale triple', en: 'Triple spiral', es: 'Espiral triple', pt: 'Espiral tripla', de: 'Dreifachspirale', it: 'Spirale tripla', ar: 'اللولب الثلاثي' } },
    { ...LIERRE_EMERAUDE, names: { fr: 'Lierre d’émeraude', en: 'Emerald ivy', es: 'Hiedra esmeralda', pt: 'Hera esmeralda', de: 'Smaragdefeu', it: 'Edera smeraldo', ar: 'اللبلاب الزمرّدي' } },
  ],
};
