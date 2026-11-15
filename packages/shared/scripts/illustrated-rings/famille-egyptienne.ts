/**
 * Famille ÉGYPTIENNE des cadres illustrés (#13966) — cobra d'or, scarabée ailé, soleil du désert,
 * lotus du Nil. Inspirés de l'orfèvrerie et de la flore du Nil ; aucun signe religieux (ni œil,
 * ni ankh, ni divinité), aucun hiéroglyphe.
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

const NILE = {
  gold: '#E8B53A',
  goldLight: '#FFE39A',
  goldDeep: '#8A5A12',
  lapis: '#1E3A8A',
  lapisLight: '#3B82F6',
  turquoise: '#14B8A6',
  turquoiseLight: '#5EEAD4',
  carnelian: '#C2410C',
  sand: '#E9C987',
  night: '#1A1206',
  papyrus: '#3F8F3A',
  papyrusLight: '#9BD36A',
  lotus: '#F9A8D4',
  lotusLight: '#FDF2F8',
  water: '#0E7490',
} as const;

const spin = (seconds: number, degrees = 360) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);

/** Des rayons effilés autour du centre, de `r1` à `r2`. */
function rays(count: number, r1: number, r2: number, width: number, colors: readonly [string, string], alpha = 0.8) {
  return Array.from({ length: count }, (_, index) => {
    const degrees = (index * 360) / count;
    const long = index % 2 === 0 ? r2 : r2 - 7;
    return art([path(taper([polar(r1, degrees), polar((r1 + long) / 2, degrees), polar(long, degrees)], [width, width * 0.6, 0.3]))], [
      linear([[0, colors[0]], [1, colors[1]]], polar(r1, degrees), polar(long, degrees), { alphas: [[0, alpha], [1, 0]] }),
    ]);
  });
}

// ── Cobra d'or ──────────────────────────────────────────────────────────

const NECK: P = [116, 62];

function cobraBody() {
  const coil = [168, 150, 130, 110, 90, 70, 50, 32, 16].map((degrees, index) => polar(52 + (index % 2) * 1.4, degrees));
  const spine: P[] = [...coil, [118, 72], NECK];
  const widths = spine.map((_, index) => 1 + (index / (spine.length - 1)) * 7.4);
  const body = path(taper(spine, widths));
  return [
    shadow([body], [1, 2.2], 40),
    art([body], [linear([[0, NILE.goldDeep], [0.5, NILE.gold], [1, NILE.goldLight]], polar(60, 120), [118, 60]), stroke(NILE.goldDeep, 0.6)]),
    art([path(smoothShape(spine.slice(2), false))], [stroke(NILE.lapis, 1.6, 85, [1.4, 3.2])]),
    art([path(smoothShape(spine.slice(3).map((point) => add(point, [-0.6, -1])), false))], [stroke(NILE.goldLight, 0.6, 80)]),
  ];
}

function cobraHead() {
  const hood = path(smoothShape([[116, 64, 'corner'], [106, 54], [104, 40], [110, 26], [116, 21], [122, 26], [128, 40], [126, 54]]));
  const bands = [30, 37, 44, 51].map((y) => path(smoothShape([[109 + (y - 30) * 0.05, y], [116, y + 1.6], [123 - (y - 30) * 0.05, y]], false)));
  const head = path(smoothShape([[111, 24], [116, 15], [121, 24], [116, 27]]));
  const tongue = art([path(sharpShape([[116, 15], [116, 10], [114.4, 7.6]], false)), path(sharpShape([[116, 10], [117.6, 7.6]], false))], [stroke(NILE.carnelian, 0.7)], {
    o: animated(keys([[0, 0], [1.2, 0], [1.4, 100], [1.8, 0], [4.4, 0], [4.6, 100], [5, 0], [6, 0]]), LINEAR),
  });
  return stack(
    [
      tongue,
      stack(
        [
          shadow([hood], [1, 2], 38),
          art([hood], [linear([[0, NILE.gold], [0.5, NILE.goldLight], [1, NILE.gold]], [104, 40], [128, 40]), stroke(NILE.goldDeep, 0.7)]),
          art([path(smoothShape([[116, 58, 'corner'], [111, 48], [112, 34], [116, 28], [120, 34], [121, 48]]))], [linear([[0, NILE.lapis], [1, NILE.lapisLight]], [116, 58], [116, 28])]),
          art(bands, [stroke(NILE.goldLight, 0.8, 90)]),
        ],
        around(NECK, { s: animated(keys([[0, [70, 100]], [1.5, [104, 102]], [3, [96, 100]], [4.6, [100, 100]], [6, [70, 100]]])) }),
      ),
      art([head], [radial([[0, NILE.goldLight], [1, NILE.gold]], [115, 20], 7), stroke(NILE.goldDeep, 0.6)]),
      art([circle(0.9, [114.2, 21.6]), circle(0.9, [117.8, 21.6])], [fill(NILE.night)]),
    ],
    around(NECK, { r: animated(keys([[0, 4], [1.5, -6], [3, 3], [4.5, -3], [6, 4]])) }),
  );
}

function cobraFront() {
  return film('cobra-dore-avant', 6, [...cobraBody(), cobraHead()]);
}

function cobraBack() {
  const seconds = 6;
  return film('cobra-dore-arriere', seconds, [
    glow([C, C], 69, NILE.sand, 0.75, animated(keys([[0, 60], [2, 100], [4, 75], [6, 60]])), 0.55),
    stack(rays(10, 46, 68, 4, [NILE.goldLight, NILE.gold], 0.55), around([C, C], { r: spin(seconds, 36) })),
  ]);
}

const cobraStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NILE.gold, NILE.goldDeep, NILE.goldLight, NILE.lapis] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.6)}`, color: 1, opacity: 1, width: 0.8 },
      { d: ringTicks(24, 44, 48, -90), color: 3, opacity: 0.9, width: 1.2 },
      { d: ringDiamonds(1, 46, 3.4, -45), color: 2, opacity: 1 },
    ],
  },
};

export const COBRA_DORE: IllustratedFrame = { key: 'cobra-dore', still: cobraStill, back: cobraBack, front: cobraFront };

// ── Scarabée ailé ───────────────────────────────────────────────────────

const SHOULDER: P = [78, 18];

/** L'aile droite du scarabée : trois rangs de plumes rectangulaires, du lapis à l'or. */
function scarabWing() {
  const rowOf = (count: number, y: number, length: number, color: string, tip: string) =>
    Array.from({ length: count }, (_, index) => {
      const x = SHOULDER[0] + 2 + index * 5.2;
      const drop = index * index * 0.22;
      const top = y + drop;
      const shape = smoothShape([[x, top, 'corner'], [x + 4.6, top + 0.6, 'corner'], [x + 4.8, top + length - index * 0.6], [x + 2.4, top + length + 1.6 - index * 0.6], [x, top + length - index * 0.6]]);
      return art([path(shape)], [linear([[0, color], [1, tip]], [x, top], [x, top + length]), stroke(NILE.goldDeep, 0.4, 80)]);
    });
  return stack(
    [
      art([path(smoothShape([[78, 14], [104, 12], [126, 20], [134, 30], [120, 28], [96, 26], [78, 26]]))], [fill('#000000', 30)], { p: still([1, 2.4]) }),
      ...rowOf(10, 22, 15, NILE.lapis, NILE.lapisLight),
      ...rowOf(9, 18, 9, NILE.turquoise, NILE.turquoiseLight),
      ...rowOf(8, 14, 6, NILE.gold, NILE.goldLight),
    ],
    around(SHOULDER, { r: animated(keys([[0, 28], [1.6, 0], [3, -4], [4, 0], [6.4, 0], [8, 28]])) }),
  );
}

function scarabFront() {
  const seconds = 8;
  const frames = seconds * FPS;
  const body = path(smoothShape([[70, 6], [77, 11], [78, 20], [70, 27], [62, 20], [63, 11]]));
  const head = path(smoothShape([[66, 4], [70, 0.6], [74, 4], [70, 6.4]]));
  const legs = [-1, 1].flatMap((side) =>
    [8, 14, 20].map((y, index) => path(sharpShape([[70 + 6 * side, y], [70 + (11 + index) * side, y - 2 + index * 2], [70 + (12 + index) * side, y + 2 + index * 2]], false))),
  );
  const glints = (
    [
      [[50, 10], 0],
      [[96, 12], 0.4],
      [[70, 30], 0.7],
    ] as const
  ).map(([at, phase]) => art([path(sparkle([0, 0], 3))], [fill(NILE.goldLight)], { p: still(at), s: animated(cycle([[0, [10, 10]], [0.12, [110, 110]], [0.3, [10, 10]], [1, [10, 10]]], phase, frames)) }));
  return film('scarabee-aile-avant', seconds, [
    scarabWing(),
    stack([scarabWing()], { a: still([C, C]), p: still([C, C]), s: still([-100, 100]) }),
    art(legs, [stroke(NILE.goldDeep, 1.1)]),
    shadow([body, head], [0.8, 1.8], 40),
    art([body], [linear([[0, NILE.turquoiseLight], [0.45, NILE.turquoise], [1, NILE.lapis]], [64, 8], [76, 26]), stroke(NILE.gold, 1)]),
    art([path(sharpShape([[70, 11], [70, 26]], false))], [stroke(NILE.gold, 0.8)]),
    art([head], [linear([[0, NILE.goldLight], [1, NILE.gold]], [70, 0], [70, 6]), stroke(NILE.goldDeep, 0.5)]),
    art([ellipse([3, 6], [66.6, 15])], [fill('#FFFFFF', 45)]),
    ...glints,
  ]);
}

function scarabBack() {
  const seconds = 8;
  return film('scarabee-aile-arriere', seconds, [
    glow([C, 22], 50, NILE.goldLight, 0.6, animated(keys([[0, 50], [1.6, 100], [5, 70], [8, 50]]))),
    glow([C, C], 68, NILE.lapisLight, 0.55, 100, 0.6),
    stack(rays(14, 44, 69, 3.6, [NILE.goldLight, NILE.gold], 0.5), around([C, C], { r: spin(seconds, 25.7) })),
  ]);
}

const scarabStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NILE.lapis, NILE.turquoise, NILE.gold, NILE.goldLight] },
  gradients: [ringGradient([[1, 0], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.6)}`, color: 2, opacity: 1, width: 0.9 },
      { d: ringArc(46, -170, -10), color: 1, opacity: 0.9, width: 2.4 },
      { d: ringDiamonds(1, 46, 3.6, -90), color: 3, opacity: 1 },
    ],
  },
};

export const SCARABEE_AILE: IllustratedFrame = { key: 'scarabee-aile', still: scarabStill, back: scarabBack, front: scarabFront };

// ── Soleil du désert ────────────────────────────────────────────────────

function sunBack() {
  const seconds = 10;
  return film('soleil-desert-arriere', seconds, [
    glow([C, C], 70, NILE.goldLight, 0.85, animated(keys([[0, 70], [2.5, 100], [6, 80], [10, 70]])), 0.5),
    stack(rays(18, 52, 70, 5, [NILE.goldLight, NILE.carnelian], 0.85), around([C, C], { r: spin(seconds, 20) })),
    art([circle(54)], [radial([[0, NILE.gold], [0.8, NILE.gold], [1, NILE.carnelian]], [C, C], 54)]),
  ]);
}

/** Le grand collier : trois rangs de perles et des pendeloques sur la moitié basse. */
function sunFront() {
  const seconds = 10;
  const frames = seconds * FPS;
  const beads = (r: number, size: number, count: number, palette: readonly string[]) =>
    Array.from({ length: count }, (_, index) => {
      const at = polar(r, 18 + (index * 144) / (count - 1));
      const color = palette[index % palette.length]!;
      return art([circle(size, at)], [radial([[0, '#FFFFFF'], [0.35, color], [1, color]], add(at, [-size * 0.4, -size * 0.4]), size * 1.3), stroke(NILE.goldDeep, 0.4)]);
    });
  const drops = Array.from({ length: 11 }, (_, index) => {
    const degrees = 22 + index * 13.6;
    const shape = path(taper([polar(55, degrees), polar(59, degrees), polar(64, degrees)], [4.4, 4.2, 0.6]));
    return art([shape], [linear([[0, NILE.gold], [1, index % 2 === 0 ? NILE.carnelian : NILE.lapis]], polar(55, degrees), polar(64, degrees)), stroke(NILE.goldDeep, 0.4)], {
      o: animated(cycle([[0, [75]], [0.08, [100]], [0.2, [75]], [1, [75]]], index / 11, frames)),
    });
  });
  const band = path(smoothShape([...[16, 52, 90, 128, 164].map((degrees) => polar(44, degrees)), ...[164, 128, 90, 52, 16].map((degrees) => polar(54, degrees))].map((point, index) => (index === 0 || index === 4 || index === 5 || index === 9 ? [point[0], point[1], 'corner'] as const : point))));
  return film('soleil-desert-avant', seconds, [
    shadow([band], [0, 2.4], 40),
    art([band], [linear([[0, NILE.gold], [1, NILE.goldDeep]], [70, 110], [70, 124]), stroke(NILE.goldDeep, 0.6)]),
    ...drops,
    ...beads(46.4, 1.7, 15, [NILE.lapis, NILE.turquoise, NILE.carnelian]),
    ...beads(51.4, 1.9, 17, [NILE.turquoise, NILE.goldLight, NILE.lapis]),
    art([path(sparkle([0, 0], 4))], [fill('#FFFFFF')], {
      p: animated(keys([[0, polar(50, 160)], [5, polar(50, 20)], [10, polar(50, 160)]])),
      s: animated(keys([[0, [0, 0]], [1, [100, 100]], [4, [100, 100]], [5, [0, 0]], [6, [100, 100]], [9, [100, 100]], [10, [0, 0]]])),
    }),
  ]);
}

const sunStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NILE.gold, NILE.carnelian, NILE.goldLight, NILE.lapis, NILE.turquoise] },
  gradients: [ringGradient([[2, 0], [0, 0.45], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.6, gradient: 0 },
      { d: ringTicks(36, 49.4, 50, -90), color: 2, opacity: 1, width: 1 },
      { d: ringArc(45, 20, 160), color: 3, opacity: 1, width: 2 },
      { d: ringArc(48, 20, 160), color: 4, opacity: 1, width: 1.4 },
    ],
  },
};

export const SOLEIL_DESERT: IllustratedFrame = { key: 'soleil-du-desert', still: sunStill, back: sunBack, front: sunFront };

// ── Lotus du Nil ────────────────────────────────────────────────────────

/** Une fleur de lotus : sept pétales en éventail qui s'ouvrent depuis le bouton. */
function lotus(base: P, size: number, seconds: number, delay: number) {
  const petal = (degrees: number, length: number, color: string) => {
    const tip = polar(length, degrees, [0, 0]);
    const side = polar(length * 0.28, degrees + 90, [0, 0]);
    const shape = smoothShape([[0, 0, 'corner'], add(mix([0, 0], tip, 0.5), side), [tip[0], tip[1], 'corner'], add(mix([0, 0], tip, 0.5), [-side[0], -side[1]])]);
    const open = animated(keys([[0, 0], [delay, 0], [delay + 1.8, 1], [seconds - 1.2, 1], [seconds, 0]]).map((key) => ({ ...key, s: [(degrees + 90) * (key.s[0]! - 1)] })));
    return art([path(shape)], [linear([[0, NILE.lotusLight], [1, color]], [0, 0], tip), stroke('#BE185D', 0.4, 70)], { r: open });
  };
  const petals = [-90, -116, -64, -140, -40, -160, -20].map((degrees, index) => petal(degrees, size * (index < 3 ? 1 : 0.84), index < 3 ? NILE.lotus : '#EC4899'));
  return stack(
    [
      art([ellipse([size * 0.9, size * 0.3], [0, 0.6])], [linear([[0, NILE.papyrusLight], [1, NILE.papyrus]], [0, 0], [0, size * 0.3])]),
      ...[...petals].reverse(),
      art([circle(size * 0.12, [0, -size * 0.2])], [fill(NILE.goldLight)]),
    ],
    { p: still(base) },
  );
}

/** Une ombelle de papyrus qui se balance au bout de sa tige. */
function papyrus(base: P, top: P, seconds: number, phase: number) {
  const stem = path(taper([base, mix(base, top, 0.5), top], [2.4, 1.8, 1.2]));
  const umbel = Array.from({ length: 7 }, (_, index) => {
    const degrees = -150 + index * 20;
    return path(taper([top, polar(7, degrees, top), polar(12, degrees, top)], [0.6, 1.6, 0.2]));
  });
  return stack(
    [art([stem], [linear([[0, NILE.papyrus], [1, NILE.papyrusLight]], base, top)]), art(umbel, [linear([[0, NILE.papyrus], [1, NILE.papyrusLight]], top, add(top, [0, -12]))])],
    around(base, { r: animated(keys([[0, 0], [phase, 5], [seconds / 2 + phase / 2, -4], [seconds, 0]])) }),
  );
}

function lotusFront() {
  const seconds = 8;
  return film('lotus-nil-avant', seconds, [
    papyrus([14, 140], [8, 86], seconds, 1.4),
    papyrus([126, 140], [134, 90], seconds, 2.6),
    art([path(smoothShape([[22, 140], [40, 118], [56, 112]], false)), path(smoothShape([[118, 140], [100, 118], [84, 112]], false))], [stroke(NILE.papyrus, 1.6)]),
    lotus(polar(55, 127), 13, seconds, 1),
    lotus(polar(55, 53), 13, seconds, 1.6),
    lotus(polar(58, 90), 17, seconds, 0.4),
  ]);
}

function lotusBack() {
  const seconds = 8;
  const frames = seconds * FPS;
  const ripples = [0, 0.33, 0.66].map((phase) =>
    art([ellipse([90, 22], [C, 122])], [stroke(NILE.turquoiseLight, 1.4)], {
      a: still([C, 122]),
      p: still([C, 122]),
      s: animated(cycle([[0, [30, 30]], [1, [150, 150]]], phase, frames)),
      o: animated(cycle([[0, [0]], [0.2, [80]], [1, [0]]], phase, frames)),
    }),
  );
  return film('lotus-nil-arriere', seconds, [glow([C, C], 69, NILE.water, 0.7, 100, 0.55), glow([C, 122], 40, NILE.turquoise, 0.6), ...ripples]);
}

const lotusStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [NILE.water, NILE.turquoise, NILE.lotus, NILE.papyrus, NILE.gold] },
  gradients: [ringGradient([[1, 0], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.6)}`, color: 4, opacity: 0.9, width: 0.7 },
      { d: ringDiamonds(3, 46, 2.8, 55), color: 2, opacity: 1 },
      { d: ringArc(46, -150, -30), color: 3, opacity: 0.8, width: 1.6 },
    ],
  },
};

export const LOTUS_NIL: IllustratedFrame = { key: 'lotus-du-nil', still: lotusStill, back: lotusBack, front: lotusFront };

// ── Le pack ─────────────────────────────────────────────────────────────

export const CADRES_EGYPTIENS: IllustratedPack = {
  slug: 'cadres-egyptiens',
  order: 14,
  names: {
    fr: { name: 'Cadres égyptiens', description: 'Quatre cadres d’or et de lapis : un cobra qui se dresse, un scarabée qui ouvre ses ailes, un soleil du désert au grand collier, des lotus du Nil qui s’ouvrent.' },
    en: { name: 'Egyptian frames', description: 'Four frames of gold and lapis: a rising cobra, a scarab opening its wings, a desert sun with a broad collar and Nile lotuses that bloom.' },
    es: { name: 'Marcos egipcios', description: 'Cuatro marcos de oro y lapislázuli: una cobra que se yergue, un escarabajo que abre sus alas, un sol del desierto con gran collar y lotos del Nilo que se abren.' },
    pt: { name: 'Molduras egípcias', description: 'Quatro molduras de ouro e lápis-lazúli: uma naja que se ergue, um escaravelho que abre as asas, um sol do deserto com grande colar e lótus do Nilo que se abrem.' },
    de: { name: 'Ägyptische Rahmen', description: 'Vier Rahmen aus Gold und Lapislazuli: eine sich aufrichtende Kobra, ein Skarabäus, der die Flügel öffnet, eine Wüstensonne mit breitem Halskragen und aufblühende Nil-Lotusblüten.' },
    it: { name: 'Cornici egizie', description: 'Quattro cornici d’oro e lapislazzuli: un cobra che si erge, uno scarabeo che apre le ali, un sole del deserto dal grande collare e loti del Nilo che sbocciano.' },
    ar: { name: 'إطارات مصرية', description: 'أربعة إطارات من الذهب واللازورد: كوبرا تنتصب، وجُعَل يفتح جناحيه، وشمس الصحراء بقلادة عريضة، وزهور لوتس النيل تتفتّح.' },
  },
  frames: [
    { ...COBRA_DORE, names: { fr: 'Cobra d’or', en: 'Golden cobra', es: 'Cobra dorada', pt: 'Naja dourada', de: 'Goldene Kobra', it: 'Cobra d’oro', ar: 'الكوبرا الذهبية' } },
    { ...SCARABEE_AILE, names: { fr: 'Scarabée ailé', en: 'Winged scarab', es: 'Escarabajo alado', pt: 'Escaravelho alado', de: 'Geflügelter Skarabäus', it: 'Scarabeo alato', ar: 'الجُعَل المجنّح' } },
    { ...SOLEIL_DESERT, names: { fr: 'Soleil du désert', en: 'Desert sun', es: 'Sol del desierto', pt: 'Sol do deserto', de: 'Wüstensonne', it: 'Sole del deserto', ar: 'شمس الصحراء' } },
    { ...LOTUS_NIL, names: { fr: 'Lotus du Nil', en: 'Nile lotus', es: 'Loto del Nilo', pt: 'Lótus do Nilo', de: 'Nil-Lotus', it: 'Loto del Nilo', ar: 'لوتس النيل' } },
  ],
};
