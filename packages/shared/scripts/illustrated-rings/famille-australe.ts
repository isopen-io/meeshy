/**
 * Famille AUSTRALE des cadres illustrés (#13970) — les CERCLES DE POINTS, la TORTUE MARINE et la
 * CROIX DU SUD. Inspirés de la peinture de points et du ciel austral : aucune reproduction d'œuvre,
 * aucun récit ni être sacré (pas de serpent arc-en-ciel), aucun tiki.
 */
import type { IllustratedFrame } from './frame.js';
import type { IllustratedPack } from './packs.js';
import {
  C,
  FPS,
  LINEAR,
  type P,
  animated,
  around,
  art,
  circle,
  cycle,
  fill,
  film,
  glow,
  keys,
  oscillate,
  path,
  polar,
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
  transform,
} from './kit.js';

const spinBy = (degrees: number, seconds: number) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);
/** Un scintillement : l'opacité creuse puis revient, à la phase donnée. */
const twinkle = (phase: number, frames: number, low = 30) => animated(cycle([[0, [100]], [0.2, [low]], [0.45, [100]], [1, [100]]], phase, frames));
const EARTH = { ochre: '#D97706', red: '#9A3412', cream: '#FDF4E3', charcoal: '#1C1917', yellow: '#FBBF24', white: '#FFFFFF', sea: '#0E7490', deepSea: '#083344', night: '#0B1E3F', sky: '#93C5FD', olive: '#65A30D' } as const;

// ── Cercles de points ───────────────────────────────────────────────────

type DotRing = { readonly r: number; readonly count: number; readonly hex: string; readonly size: number; readonly turn: number };
const DOT_RINGS: readonly DotRing[] = [
  { r: 47, count: 36, hex: EARTH.cream, size: 1.5, turn: 10 },
  { r: 53, count: 30, hex: EARTH.yellow, size: 1.7, turn: -12 },
  { r: 59, count: 24, hex: EARTH.ochre, size: 2, turn: 15 },
];

/** Un anneau de points en trois tiers entrelacés qui scintillent à tour de rôle. */
function dotRing(ring: DotRing, seconds: number, frames: number) {
  const thirds = [0, 1, 2].map((third) =>
    art(
      Array.from({ length: ring.count / 3 }, (_, index) => circle(ring.size, polar(ring.r, (index * 3 + third) * (360 / ring.count) - 90))),
      [fill(ring.hex)],
      { o: twinkle(third / 3, frames, 40) },
    ),
  );
  return stack(thirds, around([C, C], { r: spinBy(ring.turn, seconds) }));
}

/** Une petite rosace de points : un cœur et huit points autour. */
const rosette = (at: P) => [circle(1.8, at), ...Array.from({ length: 8 }, (_, index) => circle(0.9, polar(4.2, index * 45, at)))];

function dotsFront() {
  const seconds = 12;
  const frames = seconds * FPS;
  const centers = [-60, 0, 60, 120, 180, 240].map((degrees) => polar(64.5, degrees));
  const rosettes = centers.map((at, index) =>
    art(rosette(at), [fill(index % 2 === 0 ? EARTH.cream : EARTH.yellow)], { a: still(at), p: still(at), s: animated(cycle([[0, [100, 100]], [0.2, [125, 125]], [0.4, [100, 100]], [1, [100, 100]]], index / 6, frames)) }),
  );
  return film('cercles-points-avant', seconds, [...DOT_RINGS.map((ring) => dotRing(ring, seconds, frames)), ...rosettes]);
}

function dotsBack() {
  const seconds = 12;
  const band = [circle(62.5), circle(43)];
  return film('cercles-points-arriere', seconds, [
    glow([C, C], 70, EARTH.ochre, 0.75, animated(keys([[0, 55], [4, 100], [9, 70], [12, 55]])), 0.6),
    art(band, [radial([[0, EARTH.red], [0.7, EARTH.red], [0.86, '#5B1E0B'], [1, EARTH.charcoal]], [C, C], 62.5, { evenOdd: true })]),
    art([circle(67.5)], [stroke(EARTH.cream, 1.3, 70, [0.1, 3.2])], around([C, C], { r: spinBy(-20, seconds) })),
  ]);
}

const dotsStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [EARTH.red, EARTH.charcoal, EARTH.cream, EARTH.yellow, EARTH.ochre] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringTicks(36, 43.8, 44, -90), color: 2, opacity: 1, width: 1.2 },
      { d: ringTicks(30, 46, 46.2, -84), color: 3, opacity: 1, width: 1.3 },
      { d: ringTicks(24, 48, 48.2, -90), color: 4, opacity: 1, width: 1.4 },
    ],
  },
};

export const CERCLES_POINTS: IllustratedFrame = { key: 'cercles-points', still: dotsStill, back: dotsBack, front: dotsFront };

// ── Tortue marine ───────────────────────────────────────────────────────

const SHELL: readonly P[] = [
  [9.5, 0],
  [6, -6.2],
  [-3, -6.8],
  [-9, -3.4],
  [-10.5, 0],
  [-9, 3.4],
  [-3, 6.8],
  [6, 6.2],
];
const SHELL_DOTS: readonly P[] = [
  [5, 0],
  [1.6, -3],
  [1.6, 3],
  [-2.2, 0],
  [-5.4, -2.6],
  [-5.4, 2.6],
  [-1.6, -5],
  [-1.6, 5],
  [4, -4],
  [4, 4],
  [-7.8, 0],
];

/** Une nageoire attachée en `root`, battant autour de sa racine. */
const flipper = (root: P, tip: P, width: number, amplitude: number, period: number, seconds: number) =>
  art([path(taper([root, [(root[0] + tip[0]) / 2 + 1, (root[1] + tip[1]) / 2], tip], [width, width * 0.8, 0.4]))], [fill(EARTH.olive), stroke('#365314', 0.4)], around(root, { r: animated(oscillate(amplitude, period, seconds)) }));

/** La tortue, tête vers +x, centrée sur l'origine. */
function turtle(seconds: number) {
  const shell = path(smoothShape(SHELL));
  return [
    flipper([4, -5], [-2, -14.5], 4.4, 18, 1.5, seconds),
    flipper([4, 5], [-2, 14.5], 4.4, -18, 1.5, seconds),
    flipper([-7, -4], [-12, -8.5], 2.8, 12, 1.5, seconds),
    flipper([-7, 4], [-12, 8.5], 2.8, -12, 1.5, seconds),
    art([circle(3.2, [12.4, 0])], [radial([[0, '#A3E635'], [1, EARTH.olive]], [12, -1], 3.6), stroke('#365314', 0.4)]),
    art([circle(0.6, [13.6, -1.4]), circle(0.6, [13.6, 1.4])], [fill(EARTH.charcoal)]),
    shadow([shell], [0.6, 1.4], 36),
    art([shell], [radial([[0, EARTH.yellow], [0.6, EARTH.ochre], [1, EARTH.red]], [1, -1], 11), stroke('#451A03', 0.6)]),
    art([path(smoothShape(SHELL.map(([x, y]): P => [x * 0.62, y * 0.62])))], [stroke('#451A03', 0.5, 70)]),
    art(SHELL_DOTS.map((at) => circle(0.75, at)), [fill(EARTH.cream)]),
  ];
}

/** Le cercle ondulé de pointillés que la tortue longe. */
const waveRing = (r: number, waves: number, depth: number): P[] => Array.from({ length: waves * 6 }, (_, index) => polar(r + depth * Math.sin((index * Math.PI) / 3), (index * 360) / (waves * 6)));

function turtleFront() {
  const seconds = 12;
  const frames = seconds * FPS;
  const bubbles = [
    [-15, -2, 1.2, 0],
    [-19, 2, 0.9, 0.3],
    [-23, -1, 0.7, 0.6],
  ].map(([x, y, r, phase]) => art([circle(r!, [x!, y!])], [stroke(EARTH.sky, 0.5)], { o: twinkle(phase!, frames, 0) }));
  const swimmer = stack([...bubbles, ...turtle(seconds)], { p: still(polar(57, -90)) });
  return film('tortue-marine-avant', seconds, [
    art([path(smoothShape(waveRing(48, 8, 1.4)))], [stroke(EARTH.cream, 1.3, 90, [0.1, 2.6])], around([C, C], { r: spinBy(-45, seconds) })),
    stack([swimmer], around([C, C], { r: spinBy(360, seconds) })),
  ]);
}

function turtleBack() {
  const seconds = 12;
  return film('tortue-marine-arriere', seconds, [
    glow([C, C], 70, EARTH.sea, 0.85, animated(keys([[0, 60], [3.5, 100], [8, 72], [12, 60]])), 0.55),
    art([circle(63), circle(43)], [radial([[0, EARTH.deepSea], [0.7, EARTH.deepSea], [0.9, EARTH.sea], [1, EARTH.deepSea]], [C, C], 63, { evenOdd: true, opacity: 85 })]),
    art([circle(61)], [stroke(EARTH.sky, 1, 75, [0.1, 3])], around([C, C], { r: spinBy(30, seconds) })),
    art([circle(66.5)], [stroke(EARTH.cream, 1.2, 60, [0.1, 4.2])], around([C, C], { r: spinBy(-18, seconds) })),
  ]);
}

const turtleStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [EARTH.sea, EARTH.deepSea, EARTH.cream, EARTH.ochre] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringTicks(40, 46, 46.2), color: 2, opacity: 0.9, width: 1.2 },
      { d: ringDiamonds(1, 46, 3.4, -90), color: 3, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 1, width: 0.7 },
    ],
  },
};

export const TORTUE_MARINE: IllustratedFrame = { key: 'tortue-marine', still: turtleStill, back: turtleBack, front: turtleFront };

// ── Croix du Sud ────────────────────────────────────────────────────────

/** Les cinq étoiles de la constellation, posées en haut à droite, hors de l'avatar : position, éclat, phase. */
const CROSS: readonly (readonly [P, number, number])[] = [
  [[110, 6], 5.4, 0],
  [[104, 40], 6.4, 0.22],
  [[94, 21], 4.6, 0.45],
  [[123, 25], 4.4, 0.66],
  [[113, 31], 2.6, 0.85],
];

function crossFront() {
  const seconds = 10;
  const frames = seconds * FPS;
  const lines = [path(sharpShape([CROSS[0]![0], CROSS[1]![0]], false)), path(sharpShape([CROSS[2]![0], CROSS[3]![0]], false))];
  const stars = CROSS.map(([at, size, phase]) =>
    stack(
      [glow(at, size * 1.8, EARTH.sky, 0.7), art([path(sparkle(at, size))], [radial([[0, EARTH.white], [1, '#DBEAFE']], at, size)])],
      { a: still(at), p: still(at), s: animated(cycle([[0, [100, 100]], [0.15, [70, 70]], [0.35, [112, 112]], [0.5, [100, 100]], [1, [100, 100]]], phase, frames)) },
    ),
  );
  const trail = { ty: 'tm', s: still(0), e: still(14), o: animated(keys([[0, 0], [seconds, 360]]), LINEAR), m: 1 };
  return film('croix-du-sud-avant', seconds, [
    art(lines, [stroke(EARTH.sky, 0.6, 45, [1.2, 2])]),
    art([path(smoothShape(Array.from({ length: 9 }, (_, index) => polar(52, -175 + index * 10)), false))], [stroke(EARTH.cream, 1.4, 85, [0.1, 3])]),
    { ty: 'gr', it: [circle(60), trail, stroke(EARTH.white, 1.4, 55), transform()] },
    ...stars,
  ]);
}

/** Un ciel de petites étoiles éparses entre `inner` et 68, en trois tiers qui scintillent. */
function starfield(frames: number) {
  return [0, 1, 2].map((third) =>
    art(
      Array.from({ length: 10 }, (_, index) => {
        const n = index * 3 + third;
        return circle(0.5 + (n % 3) * 0.25, polar(46 + ((n * 7.3) % 22), n * 137.5));
      }),
      [fill(EARTH.white)],
      { o: twinkle(third / 3, frames, 20) },
    ),
  );
}

function crossBack() {
  const seconds = 10;
  const frames = seconds * FPS;
  return film('croix-du-sud-arriere', seconds, [
    art([circle(69)], [radial([[0, EARTH.night], [1, EARTH.night]], [C, C], 69, { alphas: [[0, 0], [0.58, 0], [0.68, 0.95], [0.9, 0.85], [1, 0]] })]),
    glow([C, C], 66, '#3B82F6', 0.45, animated(keys([[0, 50], [3, 100], [7, 65], [10, 50]])), 0.62),
    stack(starfield(frames), around([C, C], { r: spinBy(12, seconds) })),
  ]);
}

const crossStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [EARTH.night, '#1E3A8A', EARTH.white, EARTH.sky] },
  gradients: [ringGradient([[1, 0], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringDiamonds(4, 46, 1.8, -62), color: 2, opacity: 1 },
      { d: ringArc(48.2, -170, -100), color: 3, opacity: 0.8, width: 0.6 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 0.8, width: 0.6 },
    ],
  },
};

export const CROIX_DU_SUD: IllustratedFrame = { key: 'croix-du-sud', still: crossStill, back: crossBack, front: crossFront };

// ── Le pack ─────────────────────────────────────────────────────────────

export const CADRES_AUSTRAUX: IllustratedPack = {
  slug: 'cadres-australs',
  order: 18,
  names: {
    fr: { name: 'Cadres australs', description: 'Trois cadres inspirés de la peinture de points et du ciel austral : des cercles de points qui scintillent, une tortue marine qui nage autour de l’avatar, la Croix du Sud qui brille.' },
    en: { name: 'Southern frames', description: 'Three frames inspired by dot painting and the southern sky: twinkling circles of dots, a sea turtle swimming around your avatar, and the shining Southern Cross.' },
    es: { name: 'Marcos australes', description: 'Tres marcos inspirados en la pintura de puntos y el cielo austral: círculos de puntos que centellean, una tortuga marina que nada alrededor del avatar y la Cruz del Sur que brilla.' },
    pt: { name: 'Molduras austrais', description: 'Três molduras inspiradas na pintura de pontos e no céu austral: círculos de pontos que cintilam, uma tartaruga marinha que nada à volta do avatar e o Cruzeiro do Sul a brilhar.' },
    de: { name: 'Südliche Rahmen', description: 'Drei Rahmen nach Punktmalerei und südlichem Himmel: funkelnde Punktkreise, eine Meeresschildkröte, die um deinen Avatar schwimmt, und das leuchtende Kreuz des Südens.' },
    it: { name: 'Cornici australi', description: 'Tre cornici ispirate alla pittura a punti e al cielo australe: cerchi di punti che scintillano, una tartaruga marina che nuota intorno all’avatar e la Croce del Sud che brilla.' },
    ar: { name: 'إطارات جنوبية', description: 'ثلاثة إطارات مستوحاة من الرسم بالنقاط والسماء الجنوبية: دوائر نقاط تتلألأ، وسلحفاة بحرية تسبح حول صورتك الرمزية، وصليب الجنوب يلمع.' },
  },
  frames: [
    { ...CERCLES_POINTS, names: { fr: 'Cercles de points', en: 'Dot circles', es: 'Círculos de puntos', pt: 'Círculos de pontos', de: 'Punktkreise', it: 'Cerchi di punti', ar: 'دوائر النقاط' } },
    { ...TORTUE_MARINE, names: { fr: 'Tortue marine', en: 'Sea turtle', es: 'Tortuga marina', pt: 'Tartaruga marinha', de: 'Meeresschildkröte', it: 'Tartaruga marina', ar: 'سلحفاة بحرية' } },
    { ...CROIX_DU_SUD, names: { fr: 'Croix du Sud', en: 'Southern Cross', es: 'Cruz del Sur', pt: 'Cruzeiro do Sul', de: 'Kreuz des Südens', it: 'Croce del Sud', ar: 'صليب الجنوب' } },
  ],
};
