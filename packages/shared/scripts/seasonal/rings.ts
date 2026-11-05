/**
 * Les contours d'avatar du NOUVEL AN (#16271) — quatre thèmes, chacun en contour FIXE (le pack statique) et en
 * cadre illustré ANIMÉ (le pack vivant) : un anneau fixe de repli et des films Lottie qui débordent du contour,
 * `back` derrière l'avatar et `front` au-dessus, composés sur le kit de #13960 (carré de 140 unités, avatar au
 * centre, rayon 42).
 */
import type { IllustratedFrame } from '../illustrated-rings/frame.js';
import {
  C,
  FPS,
  LINEAR,
  type P,
  type RingStill,
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
  path,
  polar,
  radial,
  ringArc,
  ringCircle,
  ringDiamonds,
  ringGradient,
  ringTicks,
  sharpShape,
  sparkle,
  stack,
  still,
  stroke,
} from '../illustrated-rings/kit.js';
import { circlePath, n2 } from '../meeshy-collections/geometry.js';

const spinBy = (degrees: number, seconds: number) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);
const twinkle = (phase: number, frames: number, low = 15) => animated(cycle([[0, [100]], [0.2, [low]], [0.45, [100]], [1, [100]]], phase, frames));
/** Des disques posés sur le cercle `r` du viewBox 0 0 100 100, aux angles donnés. */
const ringDots = (r: number, size: number, angles: readonly number[]): string =>
  angles.map((degrees) => circlePath(size, [50 + r * Math.cos((degrees * Math.PI) / 180), 50 + r * Math.sin((degrees * Math.PI) / 180)])).join('');
/** Des rayons courts posés sur le cercle `r` du viewBox, en gerbe autour de chaque angle donné. */
const ringBursts = (r: number, size: number, angles: readonly number[]): string =>
  angles
    .flatMap((degrees) => {
      const [cx, cy] = [50 + r * Math.cos((degrees * Math.PI) / 180), 50 + r * Math.sin((degrees * Math.PI) / 180)];
      return Array.from({ length: 8 }, (_, index) => index * 45).map((ray) => {
        const [dx, dy] = [Math.cos((ray * Math.PI) / 180), Math.sin((ray * Math.PI) / 180)];
        return `M${n2(cx + dx * size * 0.35)} ${n2(cy + dy * size * 0.35)}L${n2(cx + dx * size)} ${n2(cy + dy * size)}`;
      });
    })
    .join('');

const NY = {
  night: '#0B1026',
  magenta: '#EC4899',
  gold: '#FBBF24',
  cyan: '#22D3EE',
  violet: '#7C3AED',
  pink: '#F472B6',
  yellow: '#FACC15',
  teal: '#2DD4BF',
  midnight: '#1E1B4B',
  indigo: '#4338CA',
  silver: '#E2E8F0',
  clockGold: '#D4AF37',
  champagne: '#F7E7CE',
  bubbly: '#D4A017',
  amber: '#8A5A00',
  white: '#FFFDF5',
} as const;

// ── Feux d'artifice ─────────────────────────────────────────────────────

const rays = (center: P, r1: number, r2: number, count: number) =>
  Array.from({ length: count }, (_, index) => (index * 360) / count).map((degrees) => path(sharpShape([polar(r1, degrees, center), polar(r2, degrees, center)], false)));

const BURSTS: readonly (readonly [number, string])[] = [[-140, NY.magenta], [-62, NY.gold], [8, NY.cyan], [96, NY.pink], [178, NY.gold]];

function fireworksFront() {
  const seconds = 6;
  const frames = seconds * FPS;
  return film('bouquet-final-avant', seconds, BURSTS.map(([degrees, hex], index) => {
    const at = polar(58, degrees);
    return stack([glow(at, 9, hex, 0.5), art(rays(at, 2.2, 8.5, 12), [stroke(hex, 1)]), art(rays(at, 1.2, 4.4, 6), [stroke('#FFF7D6', 0.8)])], {
      a: still(at),
      p: still(at),
      s: animated(cycle([[0, [10, 10]], [0.2, [100, 100]], [0.42, [116, 116]], [1, [116, 116]]], index / BURSTS.length, frames)),
      o: animated(cycle([[0, [0]], [0.05, [100]], [0.3, [80]], [0.5, [0]], [1, [0]]], index / BURSTS.length, frames)),
    });
  }));
}

function fireworksBack() {
  const seconds = 6;
  return film('bouquet-final-arriere', seconds, [
    glow([C, C], 66, NY.violet, 0.5, animated(keys([[0, 55], [3, 100], [6, 55]])), 0.6),
    art([circle(56)], [stroke(NY.gold, 0.9, 60, [0.1, 3.2])], around([C, C], { r: spinBy(40, seconds) })),
  ]);
}

const fireworksAnimatedStill: RingStill = {
  stroke: { style: 'none', width: 0.04, colors: [NY.night, NY.violet, NY.gold, NY.cyan] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringDiamonds(8, 46, 1.5), color: 2, opacity: 1 },
      { d: ringTicks(16, 44, 48, -78.75), color: 3, opacity: 0.75, width: 0.5 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 2, opacity: 0.85, width: 0.5 },
    ],
  },
};

export const BOUQUET_FINAL: IllustratedFrame = { key: 'bouquet-final', still: fireworksAnimatedStill, back: fireworksBack, front: fireworksFront };

export const FEUX_D_ARTIFICE: RingStill = {
  stroke: { style: 'none', width: 0.04, colors: [NY.night, NY.magenta, NY.gold, NY.cyan] },
  gradients: [ringGradient([[0, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.2, gradient: 0 },
      { d: ringBursts(46, 2.6, [-90, -18, 54, 126, 198]), color: 2, opacity: 1, width: 0.6 },
      { d: ringDots(46, 0.9, [-54, 18, 90, 162, 234]), color: 3, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 0.9, width: 0.5 },
    ],
  },
};

// ── Confettis ───────────────────────────────────────────────────────────

const CONFETTI_COLORS = [NY.pink, NY.yellow, NY.teal, NY.violet] as const;
const CONFETTI = Array.from({ length: 16 }, (_, index) => [-180 + index * 22.5 + (index % 2) * 7, 52 + (index % 3) * 5, index / 16] as const);

function confettiFront() {
  const seconds = 6;
  const frames = seconds * FPS;
  return film('envol-de-confettis-avant', seconds, CONFETTI.map(([degrees, r, phase], index) => {
    const [x, y] = polar(r, degrees);
    const hex = CONFETTI_COLORS[index % CONFETTI_COLORS.length]!;
    return art([path(sharpShape([[-2.4, -1], [2.4, -1], [2.4, 1], [-2.4, 1]]))], [fill(hex)], {
      p: animated(cycle([[0, [x, y - 8]], [1, [x + 3, y + 8]]], phase, frames), LINEAR),
      o: animated(cycle([[0, [0]], [0.15, [100]], [0.85, [100]], [1, [0]]], phase, frames)),
      r: spinBy(index % 2 === 0 ? 360 : -360, seconds),
      s: animated(cycle([[0, [100, 100]], [0.25, [100, 20]], [0.5, [100, 100]], [0.75, [100, 20]], [1, [100, 100]]], phase, frames)),
    });
  }));
}

function confettiBack() {
  const seconds = 6;
  return film('envol-de-confettis-arriere', seconds, [
    glow([C, C], 66, NY.pink, 0.45, animated(keys([[0, 60], [3, 100], [6, 60]])), 0.6),
    art([circle(57)], [stroke(NY.yellow, 1.4, 70, [1.6, 4.8])], around([C, C], { r: spinBy(-60, seconds) })),
  ]);
}

const confettiAnimatedStill: RingStill = {
  stroke: { style: 'none', width: 0.04, colors: [NY.violet, NY.pink, NY.yellow, NY.teal] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringDiamonds(6, 46, 1.6, -90), color: 2, opacity: 1 },
      { d: ringDiamonds(6, 46, 1.4, -60), color: 3, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 0.85, width: 0.5 },
    ],
  },
};

export const ENVOL_DE_CONFETTIS: IllustratedFrame = { key: 'envol-de-confettis', still: confettiAnimatedStill, back: confettiBack, front: confettiFront };

export const PLUIE_DE_CONFETTIS: RingStill = {
  stroke: { style: 'none', width: 0.04, colors: [NY.white, NY.pink, NY.yellow, NY.teal] },
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.6 },
      { d: ringDots(46, 1.2, [-90, -30, 30, 90, 150, 210]), color: 1, opacity: 1 },
      { d: ringDots(46, 1, [-60, 0, 60, 120, 180, 240]), color: 2, opacity: 1 },
      { d: ringTicks(12, 44, 48, -75), color: 3, opacity: 1, width: 0.9 },
      { d: `${ringCircle(49.6)}${ringCircle(42.5)}`, color: 1, opacity: 0.8, width: 0.5 },
    ],
  },
};

// ── Minuit ──────────────────────────────────────────────────────────────

const CLOCK_AT = polar(58, -90);

function midnightFront() {
  const seconds = 6;
  const frames = seconds * FPS;
  const stars = ([[-150, 58, 2.6], [-30, 58, 2.6], [-170, 52, 1.8], [-10, 52, 1.8]] as const).map(([degrees, r, size], index) =>
    art([path(sparkle(polar(r, degrees), size))], [fill(NY.silver)], { o: twinkle(index / 4, frames, 0) }),
  );
  const clock = stack(
    [
      glow(CLOCK_AT, 12, NY.clockGold, 0.6),
      art([ellipse([15, 15], CLOCK_AT)], [radial([[0, '#312E81'], [1, NY.midnight]], CLOCK_AT, 7.5), stroke(NY.clockGold, 1)]),
      art(Array.from({ length: 12 }, (_, index) => path(sharpShape([polar(5.4, index * 30, CLOCK_AT), polar(6.6, index * 30, CLOCK_AT)], false))), [stroke(NY.silver, 0.5)]),
      art([path(sharpShape([CLOCK_AT, polar(3.6, -90, CLOCK_AT)], false))], [stroke(NY.clockGold, 1)]),
      art([path(sharpShape([CLOCK_AT, polar(5.6, -90, CLOCK_AT)], false))], [stroke(NY.white, 0.6)], around(CLOCK_AT, { r: spinBy(360, seconds) })),
    ],
    { a: still(CLOCK_AT), p: still(CLOCK_AT), s: animated(keys([[0, [100, 100]], [5.6, [100, 100]], [5.8, [114, 114]], [6, [100, 100]]])) },
  );
  return film('minuit-sonne-avant', seconds, [...stars, clock]);
}

function midnightBack() {
  const seconds = 6;
  return film('minuit-sonne-arriere', seconds, [
    glow([C, C], 66, NY.indigo, 0.5, animated(keys([[0, 60], [3, 100], [6, 60]])), 0.6),
    art([circle(56)], [stroke(NY.silver, 0.8, 65, [0.6, 2.33])], around([C, C], { r: spinBy(360, seconds) })),
  ]);
}

const midnightAnimatedStill: RingStill = {
  stroke: { style: 'none', width: 0.04, colors: [NY.midnight, NY.indigo, NY.silver, NY.clockGold] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringTicks(12, 43.6, 48.4), color: 2, opacity: 0.9, width: 0.8 },
      { d: ringDiamonds(1, 46, 3, -90), color: 3, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 0.8, width: 0.5 },
    ],
  },
};

export const MINUIT_SONNE: IllustratedFrame = { key: 'minuit-sonne', still: midnightAnimatedStill, back: midnightBack, front: midnightFront };

export const CADRAN_DE_MINUIT: RingStill = {
  stroke: { style: 'none', width: 0.04, colors: [NY.midnight, NY.clockGold, NY.silver, NY.indigo] },
  gradients: [ringGradient([[3, 0], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringTicks(60, 45, 47.4), color: 2, opacity: 0.55, width: 0.25 },
      { d: ringTicks(12, 43.4, 48.6), color: 1, opacity: 1, width: 0.9 },
      { d: ringDiamonds(4, 46, 2, -90), color: 1, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 0.9, width: 0.5 },
    ],
  },
};

// ── Champagne doré ──────────────────────────────────────────────────────

const BUBBLES = Array.from({ length: 14 }, (_, index) => [index % 2 === 0 ? 180 - 16 - (index % 7) * 6 : 16 + (index % 7) * 6, 1.4 + (index % 3) * 0.6, index / 14] as const);

function champagneFront() {
  const seconds = 5;
  const frames = seconds * FPS;
  return film('champagne-petillant-avant', seconds, BUBBLES.map(([degrees, r, phase]) => {
    const [x, y] = polar(54, degrees);
    return art([ellipse([r * 2, r * 2])], [stroke(NY.champagne, 0.6), fill(NY.white, 25)], {
      p: animated(cycle([[0, [x, y + 6]], [0.5, [x + 1.5, y - 8]], [1, [x - 1, y - 22]]], phase, frames), LINEAR),
      o: animated(cycle([[0, [0]], [0.15, [100]], [0.7, [100]], [1, [0]]], phase, frames)),
    });
  }));
}

function champagneBack() {
  const seconds = 5;
  const frames = seconds * FPS;
  const sparkles = ([[-120, 60, 2.4], [-60, 61, 2], [-90, 64, 2.8], [150, 60, 2], [30, 60, 2]] as const).map(([degrees, r, size], index) =>
    art([path(sparkle(polar(r, degrees), size))], [fill('#FFF3C4')], { o: twinkle(index / 5, frames, 0) }),
  );
  return film('champagne-petillant-arriere', seconds, [glow([C, C], 66, NY.bubbly, 0.5, animated(keys([[0, 55], [2.5, 100], [5, 55]])), 0.6), ...sparkles]);
}

const champagneAnimatedStill: RingStill = {
  stroke: { style: 'none', width: 0.04, colors: [NY.bubbly, NY.amber, NY.champagne, NY.white] },
  gradients: [ringGradient([[1, 0], [0, 0.45], [2, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringDots(46, 1, [-150, -120, -60, -30, 30, 60, 120, 150]), color: 3, opacity: 0.9 },
      { d: ringArc(48.6, 200, 340), color: 2, opacity: 0.8, width: 0.5 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 0.9, width: 0.5 },
    ],
  },
};

export const CHAMPAGNE_PETILLANT: IllustratedFrame = { key: 'champagne-petillant', still: champagneAnimatedStill, back: champagneBack, front: champagneFront };

export const COUPE_DE_CHAMPAGNE: RingStill = {
  stroke: { style: 'none', width: 0.04, colors: [NY.champagne, NY.bubbly, NY.amber, NY.white] },
  gradients: [ringGradient([[1, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.6, gradient: 0 },
      { d: ringDots(46, 0.8, Array.from({ length: 18 }, (_, index) => index * 20 - 90)), color: 3, opacity: 1 },
      { d: ringDots(46, 1.6, [-90, 30, 150]), color: 2, opacity: 1 },
      { d: `${ringCircle(49.6)}${ringCircle(42.5)}`, color: 2, opacity: 0.9, width: 0.5 },
    ],
  },
};

/** Les quatre thèmes, dans l'ordre de l'offre : feux d'artifice, confettis, minuit, champagne. */
export const NEW_YEAR_STILL_RINGS: readonly (RingStill & { readonly key: string })[] = [
  { key: 'feux-d-artifice', ...FEUX_D_ARTIFICE },
  { key: 'pluie-de-confettis', ...PLUIE_DE_CONFETTIS },
  { key: 'cadran-de-minuit', ...CADRAN_DE_MINUIT },
  { key: 'coupe-de-champagne', ...COUPE_DE_CHAMPAGNE },
];

export const NEW_YEAR_ANIMATED_RINGS: readonly IllustratedFrame[] = [BOUQUET_FINAL, ENVOL_DE_CONFETTIS, MINUIT_SONNE, CHAMPAGNE_PETILLANT];
