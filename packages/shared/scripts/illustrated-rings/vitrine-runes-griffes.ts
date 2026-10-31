/**
 * Vitrine des cadres illustrés (#13960) — le CERCLE DE GLYPHES et les GRIFFES D'OS.
 * Les glyphes sont INVENTÉS (traits, crochets, losanges) : aucun alphabet réel, aucun signe sacré.
 */
import type { IllustratedFrame } from './frame.js';
import {
  C,
  LINEAR,
  type P,
  add,
  animated,
  around,
  art,
  circle,
  fill,
  cycle,
  film,
  glow,
  keys,
  linear,
  mix,
  oscillate,
  path,
  pathAnimated,
  polar,
  quad,
  radial,
  ringCircle,
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

// ── Cercle de glyphes ───────────────────────────────────────────────────

const RUNE = { deep: '#08133A', blue: '#1D4ED8', cyan: '#38C8FF', ice: '#C9F4FF', white: '#FFFFFF' } as const;
const GLYPH_RADIUS = 54;

const GLYPHS: readonly (readonly (readonly P[])[])[] = [
  [[[0, -3.6], [0, 3.6]], [[0, -1.4], [2.4, -3.4]], [[0, 0.8], [-2.2, 2.8]]],
  [[[2.2, -3.4], [-1.6, 0], [2.2, 3.4]], [[-2.6, -3.6], [-2.6, 3.6]]],
  [[[-2.2, -3.6], [2.2, -1.2], [-2.2, 1.2], [2.2, 3.6]]],
  [[[0, -3.6], [2.2, -1], [0, 1.4], [-2.2, -1], [0, -3.6]], [[0, 1.4], [0, 3.6]]],
  [[[-1.6, -3.6], [-1.6, 3.6]], [[1.6, -3.6], [1.6, 3.6]], [[-2.8, 1.2], [2.8, -1.2]]],
  [[[-2.4, 2.4], [0, -3.4], [2.4, 2.4]], [[-2.8, 3.6], [2.8, 3.6]]],
  [[[-2.4, -2.4], [2.4, -2.4]], [[0, -2.4], [0, 3.6]], [[-2, 1.4], [0, 3.6], [2, 1.4]]],
];

function runeFront() {
  const seconds = 12;
  const frames = seconds * 30;
  const count = 14;
  const band = art([circle(59), circle(49)], [radial([[0, RUNE.deep], [0.82, RUNE.deep], [0.9, RUNE.blue], [1, RUNE.deep]], [C, C], 59, { evenOdd: true })]);
  const edges = art([circle(59), circle(49)], [stroke(RUNE.cyan, 0.9, 90)]);
  const glyphs = Array.from({ length: count }, (_, index) => {
    const degrees = -90 + (index * 360) / count;
    const glyph = GLYPHS[index % GLYPHS.length]!;
    const lines = glyph.map((points) => path(sharpShape(points, false)));
    const pulse = animated(cycle([[0, [45]], [0.08, [100]], [0.22, [45]], [1, [45]]], index / count, frames));
    return stack(
      [
        art(lines, [stroke(RUNE.cyan, 2.8, 22)]),
        art(lines, [stroke(RUNE.ice, 1.3)]),
      ],
      { p: still(polar(GLYPH_RADIUS, degrees)), r: still(degrees + 90), o: pulse },
    );
  });
  const spin = (turns: number) => animated(keys([[0, 0], [seconds, 360 * turns]]), LINEAR);
  const inner = art([circle(45)], [stroke(RUNE.cyan, 1.1, 85, [2.4, 3.6])], around([C, C], { r: spin(-1) }));
  const comet = art(
    [circle(GLYPH_RADIUS)],
    [stroke(RUNE.white, 2.2, 70)],
    around([C, C], { r: spin(2) }),
  );
  const cometTrim = { ...comet, it: [comet.it[0], { ty: 'tm', s: still(0), e: still(9), o: still(0), m: 1 }, ...comet.it.slice(1)] };
  return film('cercle-runique-avant', seconds, [
    art([circle(59), circle(49)], [{ ...fill('#000000', 30), r: 2 }], { p: still([0, 2]) }),
    band,
    edges,
    stack(glyphs, around([C, C], { r: spin(1) })),
    inner,
    cometTrim,
  ]);
}

function runeBack() {
  const seconds = 12;
  return film('cercle-runique-arriere', seconds, [
    glow([C, C], 69, RUNE.cyan, 0.8, animated(keys([[0, 55], [4, 100], [7, 68], [9.5, 100], [12, 55]])), 0.62),
  ]);
}

const runeStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [RUNE.deep, RUNE.blue, RUNE.cyan, RUNE.ice] },
  gradients: [ringGradient([[1, 0], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.6, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.6)}`, color: 2, opacity: 1, width: 0.8 },
      { d: ringTicks(14, 44.4, 47.6), color: 3, opacity: 0.95, width: 0.9 },
      { d: ringTicks(14, 45.4, 46.6, -77.14), color: 2, opacity: 0.8, width: 1.4 },
    ],
  },
};

export const CERCLE_RUNIQUE: IllustratedFrame = { key: 'cercle-runique', still: runeStill, back: runeBack, front: runeFront };

// ── Griffes d'os et flamme violette ─────────────────────────────────────

const BONE = { void: '#14081F', violet: '#5B1A9E', purple: '#A855F7', magenta: '#E879F9', core: '#F7DDFF', bone: '#F0E9DA', shade: '#B4A991', dark: '#4E4536' } as const;

/** Une griffe : sa base hors de l'anneau, sa pointe posée sur le bord de l'avatar. */
function claw(degrees: number, side: 1 | -1) {
  const base = polar(64, degrees);
  const tip = polar(37, degrees + 36 * side);
  const control = polar(74, degrees + 20 * side);
  const spine = quad(base, control, tip, 7);
  const shape = path(taper(spine, [8.6, 8, 7, 5.6, 4, 2.2, 0.2]));
  const knuckle = [circle(4.8, base), circle(3.2, polar(69.5, degrees - 4 * side))];
  const flex = animated(oscillate(4 * side, 3, 6));
  return stack(
    [
      shadow([shape, ...knuckle], [1.2, 2.2], 40),
      art(knuckle, [radial([[0, BONE.bone], [1, BONE.shade]], add(base, [-1.4, -1.4]), 5), stroke(BONE.dark, 0.6)]),
      art([shape], [linear([[0, BONE.shade], [0.5, BONE.bone], [1, BONE.shade]], polar(4, degrees + 90, mix(base, tip, 0.5)), polar(4, degrees - 90, mix(base, tip, 0.5))), stroke(BONE.dark, 0.7)]),
      art([path(smoothShape(spine.slice(0, 5).map((point) => add(point, [-0.8 * side, -0.9])), false))], [stroke('#FFFFFF', 0.7, 70)]),
    ],
    around(base, { r: flex }),
  );
}

/** Une langue de flamme : une goutte à base ronde dont la pointe ondule. */
const tongue = (x: number, base: number, height: number, width: number, sway: number) =>
  smoothShape([
    [x, base + width * 0.22],
    [x - width / 2, base - height * 0.12],
    [x - width * 0.3, base - height * 0.55],
    [x + sway, base - height, 'corner'],
    [x + width * 0.34, base - height * 0.5],
    [x + width / 2, base - height * 0.12],
  ]);

function flame(x: number, base: number, height: number, width: number, colors: readonly [string, string], seconds: number, phase: number) {
  const sways = [-3, 2.4, -1.6, 3.6, -2.4, -3];
  const heights = [1, 0.84, 1.1, 0.9, 1.05, 1];
  const steps = sways.map((sway, index) => [((index / (sways.length - 1)) * seconds + phase) % seconds, tongue(x, base, height * heights[index]!, width * (heights[index]! * 0.3 + 0.7), sway)] as const);
  const ordered = [...steps].sort((a, b) => a[0] - b[0]);
  const looped = ordered[0]![0] === 0 ? ordered : [[0, ordered[ordered.length - 1]![1]] as const, ...ordered];
  const closing = [...looped, [seconds, looped[0]![1]] as const].filter((step, index, list) => index === 0 || step[0] > list[index - 1]![0]);
  return art([pathAnimated(closing)], [linear([[0, colors[0]], [1, colors[1]]], [x, base], [x, base - height], { alphas: [[0, 0.95], [0.7, 0.9], [1, 0.55]] })]);
}

const fireOf = (base: number, scale: number, seconds: number) => [
  flame(70 - 14 * scale, base, 26 * scale, 14 * scale, [BONE.violet, BONE.purple], seconds, 0),
  flame(70 + 14 * scale, base, 24 * scale, 13 * scale, [BONE.violet, BONE.purple], seconds, 1.4),
  flame(70, base, 36 * scale, 18 * scale, [BONE.purple, BONE.magenta], seconds, 0.7),
  flame(70, base, 20 * scale, 9 * scale, [BONE.magenta, BONE.core], seconds, 2.1),
];

function clawBack() {
  const seconds = 6;
  return film('griffes-os-arriere', seconds, [
    glow([C, 118], 44, BONE.purple, 0.8, animated(keys([[0, 70], [1.5, 100], [3, 75], [4.5, 100], [6, 70]]))),
    ...fireOf(118, 1.5, seconds),
  ]);
}

function clawFront() {
  const seconds = 6;
  const frames = seconds * 30;
  const sparks = [
    [62, 0, 2.2],
    [76, 0.35, 1.8],
    [70, 0.7, 2.6],
  ].map(([x, phase, size]) =>
    art([circle(size!, [0, 0])], [radial([[0, BONE.core], [1, BONE.magenta]], [0, 0], size!)], {
      p: animated(cycle([[0, [x!, 132]], [0.5, [x! + 5, 112]], [1, [x! - 3, 92]]], phase!, frames)),
      o: animated(cycle([[0, [0]], [0.2, [100]], [1, [0]]], phase!, frames)),
    }),
  );
  return film('griffes-os-avant', seconds, [claw(138, 1), claw(112, 1), claw(42, -1), claw(68, -1), ...fireOf(134, 0.85, seconds), ...sparks]);
}

const clawStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [BONE.violet, BONE.void, BONE.purple, BONE.bone, BONE.magenta] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 4, opacity: 0.9, width: 0.7 },
      { d: [42, 68, 112, 138].map((degrees) => ringTicks(1, 43.4, 48.6, degrees)).join(''), color: 3, opacity: 1, width: 2.2 },
      { d: ringTicks(20, 44.6, 47.4, -81), color: 1, opacity: 0.7, width: 0.6 },
    ],
  },
};

export const GRIFFES_OS: IllustratedFrame = { key: 'griffes-os', still: clawStill, back: clawBack, front: clawFront };
