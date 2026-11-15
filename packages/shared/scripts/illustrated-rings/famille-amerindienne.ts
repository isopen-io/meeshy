/**
 * Famille AMÉRINDIENNE des cadres illustrés (#13969) — le CERCLE TISSÉ AUX PLUMES, le PERLAGE EN
 * LOSANGES et le SOLEIL SUR LES MONTAGNES. Inspirés du tissage et du perlage (losanges, chevrons,
 * dents, escaliers) : plumes STYLISÉES seulement, aucune coiffe, aucun visage, aucun signe sacré.
 */
import type { IllustratedFrame } from './frame.js';
import type { IllustratedPack } from './packs.js';
import {
  C,
  FPS,
  LINEAR,
  type P,
  type Vertex,
  animated,
  around,
  art,
  circle,
  cycle,
  evenOdd,
  fill,
  film,
  glow,
  keys,
  linear,
  path,
  polar,
  radial,
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
  transform,
} from './kit.js';

const corner = (point: P): Vertex => [point[0], point[1], 'corner'];
const spinBy = (degrees: number, seconds: number) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);
const sway = (amplitude: number, phase: number, frames: number) =>
  animated(cycle([[0, [0]], [0.25, [amplitude]], [0.5, [0]], [0.75, [-amplitude]], [1, [0]]], phase, frames));
const glints = (points: readonly (readonly [P, number, number])[], hex: string, frames: number) =>
  points.map(([at, size, phase]) =>
    art([path(sparkle([0, 0], size))], [fill(hex)], {
      p: still(at),
      s: animated(cycle([[0, [0, 0]], [0.12, [110, 110]], [0.3, [0, 0]], [1, [0, 0]]], phase, frames)),
    }),
  );
/** Un quadrilatère posé sur l'anneau : de `r1` à `r2`, centré sur `degrees`, demi-ouverture `half`. */
const diamond = (r1: number, r2: number, degrees: number, half: number) =>
  sharpShape([polar(r1, degrees), polar((r1 + r2) / 2, degrees - half), polar(r2, degrees), polar((r1 + r2) / 2, degrees + half)]);

const TONE = { turquoise: '#14B8A6', deepTeal: '#0F5E59', terracotta: '#C2410C', sand: '#F5DEB3', ink: '#1C1917', white: '#FAFAF9', ochre: '#EAB308', red: '#B91C1C', leather: '#7C4A21', tan: '#C08A52' } as const;

// ── Cercle tissé aux plumes ─────────────────────────────────────────────

/** Une plume stylisée qui pend de son attache (origine), longueur `length`. */
function hangingFeather(top: P, length: number, phase: number, frames: number) {
  const width = length * 0.28;
  const start = 7;
  const vane = path(
    smoothShape([corner([0, start]), [width / 2, start + length * 0.28], [width * 0.52, start + length * 0.66], corner([0, start + length]), [-width * 0.5, start + length * 0.68], [-width / 2, start + length * 0.28]]),
  );
  const barbs = [0.35, 0.5, 0.65].map((at) => path(sharpShape([[0, start + length * at], [width * 0.42, start + length * (at + 0.08)]], false)));
  return stack(
    [
      art([path(sharpShape([[0, 0], [0, start + 1]], false))], [stroke(TONE.leather, 0.7)]),
      art([circle(1.7, [0, 4.2])], [radial([[0, '#7FF5E6'], [1, TONE.turquoise]], [-0.5, 3.6], 2), stroke(TONE.deepTeal, 0.3)]),
      shadow([vane], [0.6, 1.2], 30),
      art([vane], [linear([[0, TONE.white], [0.58, TONE.white], [0.6, TONE.terracotta], [0.8, TONE.terracotta], [0.82, TONE.ink], [1, TONE.ink]], [0, start], [0, start + length]), stroke('#8A7660', 0.4)]),
      art([path(sharpShape([[0, start - 0.5], [0, start + length * 0.92]], false)), ...barbs], [stroke('#8A7660', 0.45, 80)]),
    ],
    { p: still(top), r: sway(9, phase, frames) },
  );
}

function hoopFront() {
  const seconds = 6;
  const frames = seconds * FPS;
  const band = [circle(51.6), circle(46.4)];
  const wraps = Array.from({ length: 40 }, (_, index) => path(sharpShape([polar(46.6, index * 9 - 90), polar(51.4, index * 9 - 85)], false)));
  const beadAt = [-100, -90, -80, -160, -20].map((degrees) => polar(49, degrees));
  const beads = beadAt.map((at, index) => art([circle(2, at)], [radial([[0, '#FFFFFF'], [0.4, [TONE.turquoise, TONE.red, TONE.white][index % 3]!], [1, TONE.deepTeal]], [at[0] - 0.7, at[1] - 0.7], 2.6)]));
  const feathers = (
    [
      [160, 30, 0],
      [130, 21, 0.3],
      [50, 21, 0.55],
      [20, 30, 0.8],
    ] as const
  ).map(([degrees, length, phase]) => hangingFeather(polar(51.6, degrees), length, phase, frames));
  return film('cercle-tisse-avant', seconds, [
    art(band, [evenOdd('#000000', 30)], { p: still([0, 1.8]) }),
    art(band, [radial([[0, TONE.leather], [0.88, TONE.leather], [0.95, TONE.tan], [1, TONE.leather]], [C, C], 51.6, { evenOdd: true })]),
    art(wraps, [stroke('#3B2210', 0.6, 65)]),
    art([path(smoothShape([polar(50.4, -150), polar(50.8, -120), polar(51, -90), polar(50.8, -60), polar(50.4, -30)], false))], [stroke('#F3D9B1', 0.7, animated(keys([[0, 35], [2, 80], [6, 35]])))]),
    ...beads,
    ...feathers,
  ]);
}

function hoopBack() {
  const seconds = 6;
  const teeth = Array.from({ length: 24 }, (_, index) => path(sharpShape([polar(55, index * 15 - 95), polar(64, index * 15 - 90), polar(55, index * 15 - 85)])));
  return film('cercle-tisse-arriere', seconds, [
    glow([C, C], 70, TONE.turquoise, 0.75, animated(keys([[0, 55], [2.5, 100], [6, 55]])), 0.6),
    stack([art(teeth, [linear([[0, TONE.ochre], [1, TONE.terracotta]], [C, 6], [C, 134]), stroke(TONE.ink, 0.5)]), art([circle(54.4)], [stroke(TONE.ink, 1.2)])], around([C, C], { r: spinBy(15, seconds) })),
    art([circle(66)], [stroke(TONE.white, 1.2, 70, [0.1, 3.4])], around([C, C], { r: spinBy(-24, seconds) })),
  ]);
}

const hoopStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [TONE.leather, TONE.tan, TONE.turquoise, TONE.terracotta, TONE.white] },
  gradients: [ringGradient([[1, 0], [0, 0.6], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringTicks(30, 43, 49, -86), color: 1, opacity: 0.8, width: 0.6 },
      { d: ringDiamonds(6, 46, 2.6, -90), color: 2, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 0.9, width: 0.7 },
    ],
  },
};

export const CERCLE_TISSE: IllustratedFrame = { key: 'cercle-tisse', still: hoopStill, back: hoopBack, front: hoopFront };

// ── Perlage en losanges ─────────────────────────────────────────────────

function beadworkFront() {
  const seconds = 12;
  const frames = seconds * FPS;
  const band = [circle(56.6), circle(45.4)];
  const angles = Array.from({ length: 12 }, (_, index) => index * 30 - 90);
  const big = (odd: number) => angles.filter((_, index) => index % 2 === odd).map((degrees) => path(diamond(46.8, 55.2, degrees, 8.6)));
  const cores = angles.map((degrees) => path(diamond(49.4, 52.6, degrees, 3)));
  const steps = angles.flatMap((degrees) => [path(diamond(46.6, 49.6, degrees + 15, 3.2)), path(diamond(52.4, 55.4, degrees + 15, 3.2))]);
  const edgeBeads = Array.from({ length: 36 }, (_, index) => [circle(0.9, polar(46.2, index * 10 - 85)), circle(0.9, polar(55.8, index * 10 - 85))]).flat();
  const pattern = stack(
    [
      art(band, [evenOdd(TONE.sand)]),
      art(big(0), [linear([[0, '#5EEAD4'], [1, TONE.turquoise]], [C, 10], [C, 130]), stroke(TONE.ink, 0.6)]),
      art(big(1), [linear([[0, '#F97316'], [1, TONE.terracotta]], [C, 10], [C, 130]), stroke(TONE.ink, 0.6)]),
      art(cores, [fill(TONE.ink)]),
      art(steps, [fill(TONE.red)]),
      art(edgeBeads, [fill(TONE.white)]),
    ],
    around([C, C], { r: spinBy(30, seconds) }),
  );
  return film('perlage-losanges-avant', seconds, [
    art(band, [evenOdd('#000000', 32)], { p: still([0, 2]) }),
    pattern,
    art(band, [stroke(TONE.ink, 0.9)]),
    art([path(smoothShape([polar(54, -160), polar(55, -125), polar(55.4, -90), polar(55, -55), polar(54, -20)], false))], [stroke('#FFFFFF', 1.6, 30)]),
    ...glints([[polar(56, -130), 3.2, 0], [polar(56, -45), 2.8, 0.3], [polar(56, 70), 3, 0.62]], '#FFFFFF', frames),
  ]);
}

function beadworkBack() {
  const seconds = 12;
  const chevrons = Array.from({ length: 16 }, (_, index) => {
    const degrees = index * 22.5 - 90;
    return path(sharpShape([polar(60, degrees - 6), polar(66, degrees), polar(60, degrees + 6)], false));
  });
  return film('perlage-losanges-arriere', seconds, [
    glow([C, C], 70, TONE.turquoise, 0.7, animated(keys([[0, 60], [4, 100], [9, 70], [12, 60]])), 0.6),
    art(chevrons, [stroke(TONE.terracotta, 2.6), stroke(TONE.ochre, 1)], around([C, C], { r: spinBy(-22.5, seconds) })),
    art([circle(58.4)], [stroke(TONE.sand, 0.9, 80, [0.1, 2.6])], around([C, C], { r: spinBy(20, seconds) })),
  ]);
}

const beadworkStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [TONE.sand, TONE.turquoise, TONE.terracotta, TONE.ink] },
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4 },
      { d: ringDiamonds(6, 46, 2.8, -90), color: 1, opacity: 1 },
      { d: ringDiamonds(6, 46, 2.8, -60), color: 2, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 1, width: 0.8 },
    ],
  },
};

export const PERLAGE_LOSANGES: IllustratedFrame = { key: 'perlage-losanges', still: beadworkStill, back: beadworkBack, front: beadworkFront };

// ── Soleil sur les montagnes ────────────────────────────────────────────

/** Un rayon en escalier, de `inner` à `inner + 14`. */
function steppedRay(degrees: number, inner: number) {
  const r = [inner, inner + 5, inner + 9, inner + 14];
  const w = [7, 4.5, 2];
  return sharpShape([
    polar(r[0]!, degrees - w[0]!),
    polar(r[1]!, degrees - w[0]!),
    polar(r[1]!, degrees - w[1]!),
    polar(r[2]!, degrees - w[1]!),
    polar(r[2]!, degrees - w[2]!),
    polar(r[3]!, degrees - w[2]!),
    polar(r[3]!, degrees + w[2]!),
    polar(r[2]!, degrees + w[2]!),
    polar(r[2]!, degrees + w[1]!),
    polar(r[1]!, degrees + w[1]!),
    polar(r[1]!, degrees + w[0]!),
    polar(r[0]!, degrees + w[0]!),
  ]);
}

function sunBack() {
  const seconds = 12;
  const rays = Array.from({ length: 12 }, (_, index) => path(steppedRay(index * 30 - 90, 53)));
  return film('soleil-montagnes-arriere', seconds, [
    glow([C, C], 70, TONE.ochre, 0.8, animated(keys([[0, 55], [3, 100], [8, 70], [12, 55]])), 0.5),
    art([circle(53)], [radial([[0, '#FDE68A'], [0.8, TONE.ochre], [1, TONE.terracotta]], [C, C], 53)]),
    stack([shadow(rays, [0, 1.6], 30), art(rays, [linear([[0, TONE.ochre], [1, TONE.terracotta]], [C, 2], [C, 138]), stroke(TONE.ink, 0.5)])], around([C, C], { r: spinBy(30, seconds) })),
  ]);
}

const RIDGE: readonly P[] = [
  [0, 100],
  [14, 88],
  [24, 98],
  [34, 102],
  [46, 114],
  [58, 110],
  [70, 118],
  [82, 110],
  [94, 114],
  [106, 102],
  [116, 98],
  [126, 88],
  [140, 100],
];

function sunFront() {
  const seconds = 12;
  const frames = seconds * FPS;
  const mountains = path(sharpShape([[0, 140], ...RIDGE, [140, 140]]));
  const back = path(sharpShape([[0, 140], ...RIDGE.map(([x, y]): P => [x, y + 10]), [140, 140]]));
  const ridge = path(sharpShape(RIDGE, false));
  const river = path(sharpShape(Array.from({ length: 17 }, (_, index): P => [6 + index * 8, index % 2 === 0 ? 128 : 136]), false));
  const flow = { ty: 'tm', s: still(0), e: still(22), o: animated(keys([[0, 0], [seconds, 360]]), LINEAR), m: 1 };
  return film('soleil-montagnes-avant', seconds, [
    shadow([mountains], [0, -1.4], 28),
    art([mountains], [linear([[0, TONE.terracotta], [0.5, '#7C2D12'], [1, '#3B160A']], [C, 86], [C, 140])]),
    art([back], [linear([[0, TONE.deepTeal], [1, '#082F2C']], [C, 96], [C, 140], { alphas: [[0, 0.85], [1, 1]] })]),
    art([ridge], [stroke(TONE.white, 1.3, 95, [0.1, 2.8])]),
    art([river], [stroke(TONE.ink, 3.8, 50), stroke(TONE.turquoise, 2.4)]),
    { ty: 'gr', it: [river, flow, stroke('#E0FFFB', 1.3, 90), transform()] },
    ...glints([[[14, 86], 3, 0], [[126, 86], 3, 0.4], [[70, 116], 2.6, 0.7]], '#FFFFFF', frames),
  ]);
}

const sunStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [TONE.ochre, TONE.terracotta, TONE.deepTeal, TONE.white] },
  gradients: [ringGradient([[0, 0], [1, 0.55], [2, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringTicks(12, 43.4, 48.6), color: 1, opacity: 1, width: 2 },
      { d: ringDiamonds(4, 46, 2.6, -45), color: 3, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 2, opacity: 1, width: 0.8 },
    ],
  },
};

export const SOLEIL_MONTAGNES: IllustratedFrame = { key: 'soleil-montagnes', still: sunStill, back: sunBack, front: sunFront };

// ── Le pack ─────────────────────────────────────────────────────────────

export const CADRES_AMERINDIENS: IllustratedPack = {
  slug: 'cadres-amerindiens',
  order: 17,
  names: {
    fr: { name: 'Cadres amérindiens', description: 'Trois cadres inspirés du tissage et du perlage : un cercle tissé dont les plumes stylisées se balancent, un perlage de losanges qui tourne, un soleil en escalier sur des montagnes et leur rivière.' },
    en: { name: 'Native American frames', description: 'Three frames inspired by weaving and beadwork: a woven hoop with swaying stylised feathers, a turning band of beaded diamonds, a stepped sun over mountains and their river.' },
    es: { name: 'Marcos amerindios', description: 'Tres marcos inspirados en el tejido y el abalorio: un aro tejido con plumas estilizadas que se mecen, una banda de rombos de cuentas que gira y un sol escalonado sobre montañas y su río.' },
    pt: { name: 'Molduras ameríndias', description: 'Três molduras inspiradas na tecelagem e no trabalho de miçangas: um aro tecido com penas estilizadas que balançam, uma faixa de losangos de miçangas que gira e um sol em degraus sobre montanhas e o seu rio.' },
    de: { name: 'Indigene amerikanische Rahmen', description: 'Drei Rahmen nach Web- und Perlenmustern: ein gewebter Reif mit schwingenden stilisierten Federn, ein drehendes Perlenband aus Rauten und eine gestufte Sonne über Bergen und ihrem Fluss.' },
    it: { name: 'Cornici amerindie', description: 'Tre cornici ispirate alla tessitura e alle perline: un cerchio intrecciato con piume stilizzate che ondeggiano, una fascia di rombi di perline che gira e un sole a gradini sopra montagne e il loro fiume.' },
    ar: { name: 'إطارات أمريكية أصلية', description: 'ثلاثة إطارات مستوحاة من النسيج والخرز: طوق منسوج تتمايل منه ريش مبسّط، وشريط معيّنات من الخرز يدور، وشمس مدرّجة فوق الجبال ونهرها.' },
  },
  frames: [
    { ...CERCLE_TISSE, names: { fr: 'Cercle tissé aux plumes', en: 'Feathered woven hoop', es: 'Aro tejido con plumas', pt: 'Aro tecido com penas', de: 'Gewebter Federreif', it: 'Cerchio intrecciato con piume', ar: 'طوق منسوج بالريش' } },
    { ...PERLAGE_LOSANGES, names: { fr: 'Perlage en losanges', en: 'Beaded diamonds', es: 'Rombos de cuentas', pt: 'Losangos de miçangas', de: 'Perlenrauten', it: 'Rombi di perline', ar: 'معيّنات الخرز' } },
    { ...SOLEIL_MONTAGNES, names: { fr: 'Soleil sur les montagnes', en: 'Sun over the mountains', es: 'Sol sobre las montañas', pt: 'Sol sobre as montanhas', de: 'Sonne über den Bergen', it: 'Sole sulle montagne', ar: 'شمس فوق الجبال' } },
  ],
};
