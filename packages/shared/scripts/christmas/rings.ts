/**
 * Les contours d'avatar de NOËL (#15553) — six cadres illustrés composés sur le kit des cadres de
 * #13960 : un anneau fixe de repli (celui de « réduire les animations ») et des films Lottie qui
 * débordent du contour, `back` derrière l'avatar et `front` au-dessus.
 */
import type { IllustratedFrame } from '../illustrated-rings/frame.js';
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
  path,
  polar,
  radial,
  ringArc,
  ringCircle,
  ringDiamonds,
  ringGradient,
  ringTicks,
  sharpShape,
  smoothShape,
  sparkle,
  stack,
  still,
  stroke,
} from '../illustrated-rings/kit.js';

const spinBy = (degrees: number, seconds: number) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);
/** Un scintillement : l'opacité creuse puis revient, à la phase donnée. */
const twinkle = (phase: number, frames: number, low = 25) => animated(cycle([[0, [100]], [0.2, [low]], [0.45, [100]], [1, [100]]], phase, frames));

const NOEL = {
  red: '#C8102E',
  deepRed: '#7A0A1C',
  green: '#1F7A3A',
  deepGreen: '#0E3B22',
  gold: '#E8B547',
  light: '#FFE7A6',
  snow: '#F8FAFC',
  ice: '#BFE3FF',
  night: '#0F2747',
  blue: '#3B82F6',
} as const;

// ── Flocons qui tombent ─────────────────────────────────────────────────

const flake = (size: number) => [0, 60, 120].map((degrees) => path(sharpShape([polar(size, degrees, [0, 0]), polar(size, degrees + 180, [0, 0])], false)));

/** Douze flocons autour de l'avatar, qui descendent en s'effaçant, chacun à sa phase. */
const FLAKES: readonly (readonly [number, number, number, number])[] = Array.from({ length: 12 }, (_, index) => {
  const degrees = -170 + index * 30 + (index % 2) * 9;
  return [degrees, 52 + (index % 3) * 6, 2.2 + (index % 3) * 0.7, index / 12] as const;
});

function flakesFront() {
  const seconds = 8;
  const frames = seconds * FPS;
  return film('flocons-tombants-avant', seconds, FLAKES.map(([degrees, r, size, phase]) => {
    const [x, y] = polar(r, degrees);
    return art(flake(size), [stroke(NOEL.snow, 0.9)], {
      p: animated(cycle([[0, [x, y - 7]], [1, [x + 2, y + 7]]], phase, frames), LINEAR),
      o: animated(cycle([[0, [0]], [0.2, [100]], [0.8, [100]], [1, [0]]], phase, frames)),
      r: spinBy(90, seconds),
    });
  }));
}

function flakesBack() {
  const seconds = 8;
  return film('flocons-tombants-arriere', seconds, [
    glow([C, C], 66, NOEL.ice, 0.55, animated(keys([[0, 60], [4, 100], [8, 60]])), 0.6),
    art([circle(57)], [stroke(NOEL.snow, 1.2, 70, [0.1, 3.4])], around([C, C], { r: spinBy(30, seconds) })),
  ]);
}

const flakesStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NOEL.night, NOEL.blue, NOEL.snow, NOEL.ice] },
  gradients: [ringGradient([[1, 0], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringTicks(12, 44, 48), color: 2, opacity: 0.9, width: 0.6 },
      { d: ringDiamonds(6, 46, 1.4), color: 3, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 0.8, width: 0.5 },
    ],
  },
};

export const FLOCONS_TOMBANTS: IllustratedFrame = { key: 'flocons-tombants', still: flakesStill, back: flakesBack, front: flakesFront };

// ── Couronne de houx ────────────────────────────────────────────────────

/** Une feuille de houx le long de `degrees`, piquante (pointes vives, creux arrondis), posée sur le cercle `r`. */
const hollyLeaf = (r: number, degrees: number, length: number) => {
  const local: readonly (readonly [number, number, boolean])[] = [[0, 0, true], [0.18, -0.2, true], [0.3, -0.16, false], [0.45, -0.3, true], [0.6, -0.18, false], [0.78, -0.24, true], [1, 0, true], [0.78, 0.24, true], [0.6, 0.18, false], [0.45, 0.3, true], [0.3, 0.16, false], [0.18, 0.2, true]];
  const origin = polar(r, degrees);
  const tangent = degrees + 90 + (Math.round(degrees) % 45 === 0 ? 24 : -24);
  return smoothShape(local.map(([x, y, sharp]) => {
    const [px, py] = polar(Math.hypot(x, y) * length, tangent + (Math.atan2(y, x) * 180) / Math.PI, origin);
    return sharp ? ([px, py, 'corner'] as const) : ([px, py] as const);
  }));
};

const WREATH = Array.from({ length: 16 }, (_, index) => index * 22.5 - 90);
const BERRIES: readonly number[] = [-90, -30, 30, 90, 150, 210];

function hollyFront() {
  const seconds = 6;
  const frames = seconds * FPS;
  const leaves = (even: boolean, hex: string) => art(WREATH.filter((_, index) => (index % 2 === 0) === even).map((degrees) => path(hollyLeaf(48 + (even ? 0 : 3), degrees, 16))), [fill(hex), stroke(NOEL.deepGreen, 0.5, 70)]);
  const berries = BERRIES.map((degrees, index) => {
    const at = polar(50, degrees + 11);
    return art([circle(2.3, [at[0] - 1.8, at[1]]), circle(2.3, [at[0] + 1.8, at[1] + 0.6]), circle(2.3, [at[0], at[1] - 2.2])], [radial([[0, '#FF5A6E'], [1, NOEL.red]], at, 4)], {
      a: still(at),
      p: still(at),
      s: animated(cycle([[0, [100, 100]], [0.15, [118, 118]], [0.35, [100, 100]], [1, [100, 100]]], index / BERRIES.length, frames)),
    });
  });
  return film('couronne-de-houx-avant', seconds, [leaves(false, NOEL.deepGreen), leaves(true, NOEL.green), ...berries]);
}

function hollyBack() {
  const seconds = 6;
  return film('couronne-de-houx-arriere', seconds, [glow([C, C], 66, NOEL.gold, 0.55, animated(keys([[0, 55], [3, 100], [6, 55]])), 0.6)]);
}

const hollyStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NOEL.green, NOEL.deepGreen, NOEL.red, NOEL.light] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringDiamonds(8, 46, 1.6), color: 2, opacity: 1 },
      { d: ringArc(48.6, 200, 340), color: 3, opacity: 0.7, width: 0.5 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 0.9, width: 0.5 },
    ],
  },
};

export const COURONNE_DE_HOUX: IllustratedFrame = { key: 'couronne-de-houx', still: hollyStill, back: hollyBack, front: hollyFront };

// ── Guirlande lumineuse ─────────────────────────────────────────────────

const BULB_COLORS = [NOEL.red, NOEL.gold, NOEL.green, NOEL.blue] as const;
const BULBS = Array.from({ length: 16 }, (_, index) => index * 22.5 - 90 + 11.25);

function lightsFront() {
  const seconds = 4;
  const frames = seconds * FPS;
  const cable = path(smoothShape(Array.from({ length: 32 }, (_, index) => polar(index % 2 === 0 ? 49 : 52.5, index * 11.25 - 90))));
  const bulbs = BULBS.map((degrees, index) => {
    const at = polar(53.5, degrees);
    const hex = BULB_COLORS[index % BULB_COLORS.length]!;
    return stack(
      [
        glow(at, 6, hex, 0.7),
        art([path(smoothShape([polar(0.2, degrees, at), polar(2.2, degrees + 70, at), polar(4.6, degrees, at), polar(2.2, degrees - 70, at)]))], [fill(hex)]),
        art([path(sharpShape([polar(1.6, degrees + 180 + 40, at), polar(1.6, degrees + 180 - 40, at), polar(0.2, degrees - 40, at), polar(0.2, degrees + 40, at)]))], [fill(NOEL.deepGreen)]),
      ],
      { o: twinkle((index % 4) / 4, frames, 30) },
    );
  });
  return film('guirlande-lumineuse-avant', seconds, [art([cable], [stroke(NOEL.deepGreen, 1.1)]), ...bulbs]);
}

function lightsBack() {
  const seconds = 4;
  return film('guirlande-lumineuse-arriere', seconds, [glow([C, C], 64, NOEL.light, 0.4, animated(keys([[0, 50], [2, 90], [4, 50]])), 0.62)]);
}

const lightsStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NOEL.deepGreen, NOEL.red, NOEL.gold, NOEL.green, NOEL.blue] },
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 5.6 },
      { d: ringDiamonds(4, 46, 1.8, -90), color: 1, opacity: 1 },
      { d: ringDiamonds(4, 46, 1.8, -45), color: 2, opacity: 1 },
      { d: ringDiamonds(4, 46, 1.6, -67.5), color: 3, opacity: 1 },
    ],
  },
};

export const GUIRLANDE_LUMINEUSE: IllustratedFrame = { key: 'guirlande-lumineuse', still: lightsStill, back: lightsBack, front: lightsFront };

// ── Étoile du sapin ─────────────────────────────────────────────────────

const STAR_AT = polar(57, -90);
const fivePoint = (center: P, r: number) =>
  sharpShape(Array.from({ length: 10 }, (_, index) => polar(index % 2 === 0 ? r : r * 0.45, -90 + index * 36, center)));

function starFront() {
  const seconds = 8;
  const frames = seconds * FPS;
  const sparkles = ([[-130, 60, 3], [-50, 61, 2.6], [-160, 55, 2.2], [-20, 56, 2.4]] as const).map(([degrees, r, size], index) =>
    art([path(sparkle(polar(r, degrees), size))], [fill(NOEL.light)], { o: twinkle(index / 4, frames, 0) }),
  );
  const star = stack(
    [
      glow(STAR_AT, 13, NOEL.light, 0.8),
      art([path(fivePoint(STAR_AT, 9.5))], [radial([[0, NOEL.light], [1, NOEL.gold]], STAR_AT, 9.5), stroke('#9A6A17', 0.7, 80)]),
    ],
    { a: still(STAR_AT), p: still(STAR_AT), s: animated(keys([[0, [100, 100]], [2, [112, 112]], [4, [100, 100]], [6, [108, 108]], [8, [100, 100]]])) },
  );
  return film('etoile-du-sapin-avant', seconds, [...sparkles, star]);
}

function starBack() {
  const seconds = 8;
  const rays = Array.from({ length: 12 }, (_, index) => {
    const degrees = index * 30;
    return art([path(sharpShape([polar(4, degrees - 8, STAR_AT), polar(index % 2 === 0 ? 24 : 17, degrees, STAR_AT), polar(4, degrees + 8, STAR_AT)]))], [fill(NOEL.light, 55)]);
  });
  return film('etoile-du-sapin-arriere', seconds, [
    glow([C, C], 64, NOEL.gold, 0.45, animated(keys([[0, 60], [4, 100], [8, 60]])), 0.62),
    stack(rays, around(STAR_AT, { r: spinBy(60, seconds) })),
  ]);
}

const starStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NOEL.gold, '#9A6A17', NOEL.light, NOEL.deepGreen] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 5.6, gradient: 0 },
      { d: ringDiamonds(1, 46, 3.2, -90), color: 2, opacity: 1 },
      { d: ringTicks(24, 44.5, 47.5), color: 3, opacity: 0.6, width: 0.5 },
      { d: `${ringCircle(49)}${ringCircle(43)}`, color: 1, opacity: 0.9, width: 0.5 },
    ],
  },
};

export const ETOILE_DU_SAPIN: IllustratedFrame = { key: 'etoile-du-sapin', still: starStill, back: starBack, front: starFront };

// ── Bonnet du Père Noël ─────────────────────────────────────────────────

/** Le bonnet posé sur le haut de l'avatar : un cône rouge qui retombe à droite, une bordure de fourrure, un pompon qui se balance. */
function hatFront() {
  const seconds = 6;
  const brim = path(smoothShape([...[-155, -130, -105, -80, -55].map((degrees) => polar(51, degrees)), ...[-55, -80, -105, -130, -155].map((degrees) => polar(43, degrees))]));
  const pivot = polar(50, -100);
  const cone = path(smoothShape([polar(49, -152), [38, 14], [62, 3], [94, 3, 'corner'], [104, 12], [92, 15], polar(49, -58)]));
  const pompom: P = [106, 13];
  const swinging = stack(
    [
      art([cone], [radial([[0, '#E3263F'], [1, NOEL.deepRed]], [62, 16], 40)]),
      art([circle(6.4, pompom)], [radial([[0, '#FFFFFF'], [1, '#D9E2EC']], pompom, 6.4)]),
    ],
    around(pivot, { r: animated(keys([[0, -4], [2, 4], [3.5, -2], [5, 3], [6, -4]])) }),
  );
  return film('bonnet-du-pere-noel-avant', seconds, [swinging, art([brim], [radial([[0, '#FFFFFF'], [1, '#D9E2EC']], [C, 24], 30), stroke('#CBD5E1', 0.6)])]);
}

function hatBack() {
  const seconds = 6;
  const frames = seconds * FPS;
  const flakes = Array.from({ length: 8 }, (_, index) => art([circle(1 + (index % 2) * 0.5, polar(62, 20 + index * 22))], [fill(NOEL.snow)], { o: twinkle(index / 8, frames, 10) }));
  return film('bonnet-du-pere-noel-arriere', seconds, [glow([C, C], 64, NOEL.red, 0.35, animated(keys([[0, 60], [3, 100], [6, 60]])), 0.62), ...flakes]);
}

const hatStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NOEL.red, NOEL.deepRed, NOEL.snow, NOEL.gold] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringArc(46, -160, -20), color: 2, opacity: 1, width: 6.8 },
      { d: ringDiamonds(3, 46, 1.4, 60), color: 3, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 0.8, width: 0.5 },
    ],
  },
};

export const BONNET_DU_PERE_NOEL: IllustratedFrame = { key: 'bonnet-du-pere-noel', still: hatStill, back: hatBack, front: hatFront };

// ── Sucre d'orge ────────────────────────────────────────────────────────

function caneBack() {
  const seconds = 6;
  return film('sucre-d-orge-arriere', seconds, [
    art([circle(46)], [stroke(NOEL.snow, 7.4)]),
    art([circle(46)], [stroke(NOEL.red, 7.4, 100, [4.5, 4.5])], around([C, C], { r: spinBy(-45, seconds) })),
    art([circle(46)], [stroke(NOEL.green, 1.2, 100, [2, 7])], around([C, C], { r: spinBy(-45, seconds) })),
  ]);
}

/** Un nœud de ruban vert, en bas de l'avatar. */
function caneFront() {
  const seconds = 6;
  const knot: P = polar(48, 90);
  const loop = (side: 1 | -1) => path(smoothShape([knot, [knot[0] + side * 7, knot[1] - 6], [knot[0] + side * 13, knot[1] - 1], [knot[0] + side * 8, knot[1] + 4]].map((point, index) => (index === 0 ? [point[0], point[1], 'corner'] as const : point))));
  const tail = (side: 1 | -1) => path(sharpShape([knot, [knot[0] + side * 5, knot[1] + 12], [knot[0] + side * 2.6, knot[1] + 11], [knot[0] + side * 1, knot[1] + 3]]));
  return film('sucre-d-orge-avant', seconds, [
    stack(
      [art([tail(1), tail(-1)], [fill(NOEL.deepGreen)]), art([loop(1), loop(-1)], [radial([[0, '#2FA055'], [1, NOEL.green]], knot, 12)]), art([circle(2.6, knot)], [fill(NOEL.deepGreen)])],
      { a: still(knot), p: still(knot), s: animated(keys([[0, [100, 100]], [3, [108, 108]], [6, [100, 100]]])) },
    ),
  ]);
}

const caneStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NOEL.snow, NOEL.red, NOEL.green, NOEL.deepRed] },
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.8 },
      { d: ringDiamonds(12, 46, 3), color: 1, opacity: 1 },
      { d: ringDiamonds(1, 48, 2.6, 90), color: 2, opacity: 1 },
      { d: `${ringCircle(49.6)}${ringCircle(42.5)}`, color: 3, opacity: 0.8, width: 0.5 },
    ],
  },
};

export const SUCRE_D_ORGE: IllustratedFrame = { key: 'sucre-d-orge', still: caneStill, back: caneBack, front: caneFront };
