/**
 * Vitrine des cadres illustrés (#13960) — les AILES D'ANGE et les AILES DE DÉMON.
 */
import type { IllustratedFrame } from './frame.js';
import {
  C,
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
  quad,
  radial,
  ringCircle,
  ringDiamonds,
  ringGradient,
  ringTicks,
  scale,
  shadow,
  sharpShape,
  smoothShape,
  sparkle,
  stack,
  still,
  stroke,
  sub,
  taper,
  unit,
} from './kit.js';

/** Une aile droite, pivotant à l'épaule ; la gauche est son miroir autour de l'axe de l'avatar. */
const mirrored = (wing: unknown) => stack([wing], { a: still([C, C]), p: still([C, C]), s: still([-100, 100]) });

// ── Ailes d'ange ────────────────────────────────────────────────────────

const ANGEL = { gold: '#E9B949', deep: '#9C6A17', light: '#FFF3C2', white: '#FFFFFF', shade: '#C7D3E6', mist: '#8FA6C8', sky: '#A9CBFF' } as const;
const SHOULDER: P = [104, 70];
const WRIST: P = [124, 40];

/** Une plume : une goutte allongée de la base vers la pointe. */
const feather = (base: P, degrees: number, size: number, width: number) => {
  const tip = polar(size, degrees, base);
  const direction = unit(sub(tip, base));
  const side: P = [-direction[1], direction[0]];
  return smoothShape([
    [base[0], base[1], 'corner'],
    add(mix(base, tip, 0.45), scale(side, width / 2)),
    add(mix(base, tip, 0.86), scale(side, width * 0.28)),
    [tip[0], tip[1], 'corner'],
    add(mix(base, tip, 0.86), scale(side, -width * 0.3)),
    add(mix(base, tip, 0.45), scale(side, -width / 2)),
  ]);
};

function angelWing() {
  const arm = quad(SHOULDER, [118, 62], WRIST, 8);
  const row = (count: number, from: number, to: number, sizes: readonly [number, number], width: number, start: number) =>
    Array.from({ length: count }, (_, index) => {
      const at = index / (count - 1);
      const base = arm[Math.min(arm.length - 1, Math.round(start + at * (arm.length - 1 - start)))]!;
      return path(feather(base, from + (to - from) * at, sizes[0] + (sizes[1] - sizes[0]) * at, width));
    });
  const primaries = row(7, 32, -58, [24, 33], 8.6, 2);
  const secondaries = row(6, 40, -40, [17, 22], 8, 0);
  const coverts = row(6, 30, -50, [11, 14], 7.4, 0);
  const plume = (shapes: readonly unknown[], top: string, bottom: string) => [
    shadow(shapes, [1.2, 2], 26, '#3A4A66'),
    art(shapes, [linear([[0, bottom], [1, top]], SHOULDER, [138, 20]), stroke(ANGEL.mist, 0.55, 80)]),
  ];
  const flap = animated(keys([[0, 0], [0.9, -11], [1.6, 3], [2.4, 0], [3, 0], [3.9, -11], [4.6, 3], [5.4, 0], [6, 0]]));
  return stack(
    [
      ...plume(primaries, ANGEL.white, ANGEL.shade),
      ...plume(secondaries, ANGEL.white, '#DCE5F2'),
      ...plume(coverts, ANGEL.light, ANGEL.white),
      art([path(smoothShape(arm, false))], [stroke(ANGEL.gold, 1.4, 85)]),
    ],
    around(SHOULDER, { r: flap }),
  );
}

function angelBack() {
  const seconds = 6;
  const rays = Array.from({ length: 12 }, (_, index) => {
    const degrees = index * 30;
    const long = index % 2 === 0 ? 70 : 60;
    const shape = sharpShape([polar(40, degrees - 2, [C, C]), polar(long, degrees - 6, [C, C]), polar(long, degrees + 6, [C, C]), polar(40, degrees + 2, [C, C])]);
    return art([path(shape)], [linear([[0, ANGEL.light], [1, ANGEL.gold]], polar(40, degrees, [C, C]), polar(long, degrees, [C, C]), { alphas: [[0, 0.85], [1, 0]] })]);
  });
  const halo = glow([C, C], 68, ANGEL.light, 0.9, animated(keys([[0, 60], [3, 100], [6, 60]])), 0.58);
  return film('ailes-ange-arriere', seconds, [
    halo,
    stack(rays, around([C, C], { r: animated(keys([[0, 0], [6, 30]]), { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } }), o: animated(keys([[0, 70], [3, 100], [6, 70]])) })),
    angelWing(),
    mirrored(angelWing()),
  ]);
}

function angelFront() {
  const seconds = 6;
  const frames = seconds * 30;
  const halo = stack(
    [
      art([ellipse([38, 9], [C, 13])], [stroke('#6B4A10', 4.4, 35)], { p: still([0, 1.4]) }),
      art([ellipse([38, 9], [C, 13])], [stroke(ANGEL.gold, 3.4)]),
      art([ellipse([38, 9], [C, 12.4])], [stroke(ANGEL.light, 1.2, 90)]),
    ],
    { p: animated(keys([[0, [0, 0]], [3, [0, -2]], [6, [0, 0]]])) },
  );
  const sparkles = (
    [
      [polar(56, -128), 4.2, 0],
      [polar(60, -60), 3.4, 0.25],
      [polar(55, -20), 3, 0.5],
      [polar(58, -160), 3.2, 0.72],
    ] as const
  ).map(([at, size, phase]) =>
    art([path(sparkle([0, 0], size))], [fill(ANGEL.light)], {
      p: still(at),
      s: animated(cycle([[0, [0, 0]], [0.12, [110, 110]], [0.3, [0, 0]], [1, [0, 0]]], phase, frames)),
      r: animated(keys([[0, 0], [6, 90]]), { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } }),
    }),
  );
  return film('ailes-ange-avant', seconds, [halo, ...sparkles]);
}

const angelStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [ANGEL.gold, ANGEL.deep, ANGEL.light, ANGEL.white] },
  gradients: [ringGradient([[2, 0], [0, 0.45], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 0.95, width: 0.7 },
      { d: ringTicks(24, 44.2, 47.8), color: 2, opacity: 0.85, width: 0.5 },
      { d: ringDiamonds(4, 46, 2.6, -90), color: 3, opacity: 1 },
    ],
  },
};

export const AILES_ANGE: IllustratedFrame = { key: 'ailes-ange', still: angelStill, back: angelBack, front: angelFront };

// ── Ailes de démon ──────────────────────────────────────────────────────

const DEMON = { copper: '#C06A2F', light: '#F6A866', dark: '#5E2A12', wing: '#2A0A0E', wingMid: '#7A1820', vein: '#D9773A', ember: '#FF8A1F', hot: '#FFD37A', fire: '#FF4D1A' } as const;
const D_SHOULDER: P = [105, 64];
const D_WRIST: P = [124, 28];
const D_TIPS: readonly P[] = [
  [136, 6],
  [139, 40],
  [133, 72],
  [117, 96],
];

function demonWing() {
  const scallop = (from: P, to: P) => quad(from, mix(mix(from, to, 0.5), D_WRIST, 0.3), to, 5).slice(1);
  const membrane = sharpShape([
    D_SHOULDER,
    D_WRIST,
    D_TIPS[0]!,
    ...scallop(D_TIPS[0]!, D_TIPS[1]!),
    ...scallop(D_TIPS[1]!, D_TIPS[2]!),
    ...scallop(D_TIPS[2]!, D_TIPS[3]!),
    ...quad(D_TIPS[3]!, [108, 84], D_SHOULDER, 5).slice(1, -1),
  ]);
  const bones = D_TIPS.map((tip) => path(taper([D_WRIST, mix(D_WRIST, tip, 0.5), tip], [2.6, 1.6, 0.4])));
  const arm = path(taper([D_SHOULDER, mix(D_SHOULDER, D_WRIST, 0.5), D_WRIST], [4.4, 3.4, 2.8]));
  const thumb = path(taper([D_WRIST, [122, 20], [118, 15]], [2.4, 1.4, 0.2]));
  const flap = animated(keys([[0, 0], [0.7, -13], [1.3, 5], [2, 0], [2.7, -13], [3.3, 5], [4, 0], [6, 0]]));
  return stack(
    [
      shadow([path(membrane)], [1.6, 2.4], 40),
      art([path(membrane)], [linear([[0, DEMON.wingMid], [1, DEMON.wing]], [130, 30], D_SHOULDER), stroke(DEMON.dark, 0.6)]),
      art(D_TIPS.map((tip) => path(smoothShape([mix(D_WRIST, tip, 0.15), mix(D_WRIST, tip, 0.9)], false))), [stroke(DEMON.ember, 0.5, 40)]),
      art([...bones, arm, thumb], [linear([[0, DEMON.light], [1, DEMON.dark]], D_WRIST, [136, 70]), stroke(DEMON.dark, 0.4)]),
    ],
    around(D_SHOULDER, { r: flap, s: animated(keys([[0, [100, 100]], [0.7, [92, 104]], [1.3, [102, 99]], [2, [100, 100]], [2.7, [92, 104]], [3.3, [102, 99]], [4, [100, 100]], [6, [100, 100]]])) }),
  );
}

function demonBack() {
  const seconds = 6;
  return film('ailes-demon-arriere', seconds, [
    glow([C, 122], 46, DEMON.fire, 0.75, animated(keys([[0, 60], [1.5, 100], [3, 70], [4.5, 100], [6, 60]]))),
    glow([C, C], 66, DEMON.ember, 0.55, 100, 0.6),
    demonWing(),
    mirrored(demonWing()),
  ]);
}

const horn = (side: 1 | -1) => {
  const base = polar(44, side === 1 ? -62 : -118);
  const tip: P = [side === 1 ? 112 : 28, 2];
  const spine = quad(base, [side === 1 ? 118 : 22, 28], tip, 7);
  const shape = path(taper(spine, [9, 8.2, 7, 5.6, 4, 2.2, 0.2]));
  const ridges = [1, 2, 3, 4].map((index) => {
    const at = spine[index]!;
    const next = spine[index + 1]!;
    const across = unit([-(next[1] - at[1]), next[0] - at[0]]);
    const half = [8, 7, 5.6, 4][index - 1]! / 2;
    return path(smoothShape([add(at, scale(across, half)), add(add(at, scale(across, 0)), [0, 1.2]), add(at, scale(across, -half))], false));
  });
  return [
    shadow([shape], [1, 2], 38),
    art([shape], [linear([[0, DEMON.dark], [0.55, DEMON.copper], [1, DEMON.light]], base, tip), stroke(DEMON.dark, 0.6)]),
    art(ridges, [stroke(DEMON.dark, 0.7, 70)]),
    art([path(smoothShape(spine.slice(1, 6).map((point) => add(point, [side * -1.4, 0])), false))], [stroke(DEMON.hot, 0.8, animated(keys([[0, 25], [3, 85], [6, 25]])))]),
  ];
};

const EMBERS: readonly (readonly [number, number, number, string])[] = [
  [36, 0, 3.2, DEMON.ember],
  [52, 0.31, 2.4, DEMON.hot],
  [66, 0.62, 3.6, DEMON.ember],
  [80, 0.12, 2.6, DEMON.hot],
  [96, 0.45, 3, DEMON.ember],
  [110, 0.78, 2.4, DEMON.hot],
  [28, 0.55, 2.2, DEMON.hot],
  [104, 0.9, 3.2, DEMON.ember],
];

function demonFront() {
  const seconds = 6;
  const frames = seconds * 30;
  const embers = EMBERS.map(([x, phase, size, color]) =>
    art([circle(size / 2, [0, 0])], [radial([[0, DEMON.hot], [1, color]], [0, 0], size / 2)], {
      p: animated(cycle([[0, [x, 138]], [0.5, [x + 8, 94]], [1, [x - 4, 52]]], phase, frames)),
      o: animated(cycle([[0, [0]], [0.12, [100]], [0.65, [80]], [1, [0]]], phase, frames)),
    }),
  );
  return film('ailes-demon-avant', seconds, [...horn(1), ...horn(-1), ...embers]);
}

const demonStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [DEMON.copper, DEMON.dark, DEMON.light, DEMON.fire] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 1, width: 0.9 },
      { d: ringTicks(16, 43.6, 48.4, -78.75), color: 1, opacity: 0.75, width: 0.7 },
      { d: ringDiamonds(2, 46, 3, 90), color: 3, opacity: 1 },
    ],
  },
};

export const AILES_DEMON: IllustratedFrame = { key: 'ailes-demon', still: demonStill, back: demonBack, front: demonFront };
