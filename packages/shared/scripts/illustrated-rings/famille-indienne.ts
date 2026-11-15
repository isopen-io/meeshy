/**
 * Famille INDIENNE des cadres illustrés (#13968) — le MANDALA FLORAL, le PAON QUI FAIT LA ROUE et la
 * GUIRLANDE DE SOUCIS. Motifs ornementaux seulement (pétales, ocelles, boteh, fleurs de souci et de
 * jasmin) : aucune divinité, aucun signe sacré.
 */
import type { IllustratedFrame } from './frame.js';
import type { IllustratedPack } from './packs.js';
import {
  C,
  FPS,
  LINEAR,
  type P,
  type Vertex,
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
  taper,
} from './kit.js';

const corner = (point: P): Vertex => [point[0], point[1], 'corner'];
const spinBy = (degrees: number, seconds: number) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);
/** Un balancement d'amplitude `amplitude`, décalé de `phase` dans le cycle. */
const sway = (amplitude: number, phase: number, frames: number) =>
  animated(cycle([[0, [0]], [0.25, [amplitude]], [0.5, [0]], [0.75, [-amplitude]], [1, [0]]], phase, frames));
/** Des éclats qui naissent et s'éteignent, chacun à sa phase. */
const glints = (points: readonly (readonly [P, number, number])[], hex: string, frames: number) =>
  points.map(([at, size, phase]) =>
    art([path(sparkle([0, 0], size))], [fill(hex)], {
      p: still(at),
      s: animated(cycle([[0, [0, 0]], [0.12, [110, 110]], [0.3, [0, 0]], [1, [0, 0]]], phase, frames)),
    }),
  );
/** Un point exprimé dans le repère d'un rayon : `r` le long de l'angle, `across` de côté. */
const along = (degrees: number, r: number, across = 0): P => add(polar(r, degrees), scale(polar(1, degrees + 90, [0, 0]), across));
/** Pose des points locaux en `at`, tournés de `degrees`. */
const place = (points: readonly P[], at: P, degrees: number): P[] => {
  const [cos, sin] = [Math.cos((degrees * Math.PI) / 180), Math.sin((degrees * Math.PI) / 180)];
  return points.map(([x, y]) => [at[0] + x * cos - y * sin, at[1] + x * sin + y * cos]);
};

// ── Mandala floral ──────────────────────────────────────────────────────

const IND = { deep: '#7C2D12', marigold: '#F97316', gold: '#FACC15', goldLight: '#FEF3C7', magenta: '#BE185D', pink: '#F9A8D4', plum: '#4A0D2E' } as const;

/** Un pétale pointu de `inner` à `outer`, ouvert de `spread` degrés. */
const petal = (inner: number, outer: number, degrees: number, spread: number) =>
  smoothShape([
    corner(polar(inner, degrees)),
    polar(inner + (outer - inner) * 0.42, degrees - spread),
    corner(polar(outer, degrees)),
    polar(inner + (outer - inner) * 0.42, degrees + spread),
  ]);

function mandalaFront() {
  const seconds = 8;
  const frames = seconds * FPS;
  const angles = Array.from({ length: 16 }, (_, index) => index * 22.5 - 90);
  const outer = angles.map((degrees) => path(petal(45, 64, degrees, 8.5)));
  const inner = angles.map((degrees) => path(petal(42.5, 55, degrees + 11.25, 7.4)));
  const veins = angles.map((degrees) => path(sharpShape([polar(48, degrees), polar(60, degrees)], false)));
  const tips = angles.map((degrees) => circle(1.5, polar(67.2, degrees)));
  const open = animated(keys([[0, [100, 100]], [2, [106, 106]], [4, [100, 100]], [6, [104, 104]], [8, [100, 100]]]));
  const outerRing = stack(
    [
      shadow(outer, [0, 2], 32),
      art(outer, [radial([[0, IND.goldLight], [0.7, IND.gold], [0.86, IND.marigold], [1, IND.deep]], [C, C], 66), stroke(IND.deep, 0.7)]),
      art(veins, [stroke(IND.goldLight, 0.6, 75)]),
      art(tips, [fill(IND.gold), stroke(IND.deep, 0.4)]),
    ],
    around([C, C], { s: open, r: spinBy(22.5, seconds) }),
  );
  const innerRing = stack(
    [shadow(inner, [0, 1.4], 30), art(inner, [radial([[0, IND.pink], [0.8, IND.pink], [1, IND.magenta]], [C, C], 56), stroke(IND.plum, 0.6)])],
    around([C, C], { r: spinBy(-22.5, seconds) }),
  );
  const bead = art([circle(43)], [stroke(IND.gold, 1.6), stroke(IND.goldLight, 0.5, 80, [0.1, 2.4])]);
  const shine = glints([[polar(66, -128), 4, 0], [polar(64, -40), 3.2, 0.3], [polar(65, 60), 3.6, 0.55], [polar(66, 150), 3, 0.8]], '#FFFFFF', frames);
  return film('mandala-floral-avant', seconds, [outerRing, innerRing, bead, ...shine]);
}

function mandalaBack() {
  const seconds = 8;
  const leaves = Array.from({ length: 24 }, (_, index) => path(petal(54, 69, index * 15 - 90, 5)));
  return film('mandala-floral-arriere', seconds, [
    glow([C, C], 70, IND.marigold, 0.85, animated(keys([[0, 60], [2, 100], [5, 72], [8, 60]])), 0.55),
    art(leaves, [radial([[0, IND.deep], [0.78, IND.magenta], [1, IND.plum]], [C, C], 70, { alphas: [[0, 0.9], [0.78, 0.9], [1, 0.55]] })], around([C, C], { r: spinBy(-15, seconds) })),
    art([circle(51)], [stroke(IND.gold, 1.3, 85, [1.2, 3])], around([C, C], { r: spinBy(30, seconds) })),
  ]);
}

const mandalaStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [IND.marigold, IND.deep, IND.gold, IND.magenta] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 1, opacity: 1, width: 0.8 },
      { d: ringDiamonds(16, 46, 2.2), color: 2, opacity: 1 },
      { d: ringTicks(16, 44, 48, -78.75), color: 3, opacity: 0.9, width: 1 },
    ],
  },
};

export const MANDALA_FLORAL: IllustratedFrame = { key: 'mandala-floral', still: mandalaStill, back: mandalaBack, front: mandalaFront };

// ── Paon qui fait la roue ───────────────────────────────────────────────

const PEA = { teal: '#0F766E', green: '#15803D', lime: '#A3E635', gold: '#FACC15', blue: '#1D4ED8', navy: '#1E1B4B', sky: '#38BDF8', bronze: '#92400E' } as const;
const FAN = Array.from({ length: 13 }, (_, index) => -172.5 + index * 13.75);

function plume(degrees: number, index: number, frames: number) {
  const vane = path(smoothShape([corner(along(degrees, 36)), along(degrees, 52, 5.4), along(degrees, 64, 6.8), corner(along(degrees, 71)), along(degrees, 64, -6.8), along(degrees, 52, -5.4)]));
  const shaft = path(smoothShape([along(degrees, 30), along(degrees, 68)], false));
  const eye = art(
    [ellipse([11.4, 13.6])],
    [radial([[0, PEA.navy], [0.22, PEA.navy], [0.3, PEA.blue], [0.48, PEA.sky], [0.6, PEA.teal], [0.84, PEA.teal], [0.9, PEA.gold], [1, PEA.gold]], [0, 1.6], 7.6)],
    { p: still(along(degrees, 62)), r: still(degrees + 90), o: animated(cycle([[0, [100]], [0.15, [55]], [0.3, [100]], [1, [100]]], index / FAN.length, frames)) },
  );
  const fold = (-90 - degrees) * 0.55;
  return stack(
    [art([vane], [linear([[0, PEA.green], [1, PEA.lime]], along(degrees, 36), along(degrees, 71)), stroke(PEA.teal, 0.5)]), art([shaft], [stroke(PEA.bronze, 0.6)]), eye],
    around([C, C], { r: animated(keys([[0, 0], [3.6, 0], [4.4, fold], [5.2, fold * 0.15], [5.6, fold * 0.3], [6.4, 0], [8, 0]])) }),
  );
}

function peacockBack() {
  const seconds = 8;
  const frames = seconds * FPS;
  return film('paon-roue-arriere', seconds, [
    glow([C, C - 8], 70, PEA.teal, 0.7, animated(keys([[0, 60], [3, 100], [8, 60]])), 0.5),
    ...FAN.map((degrees, index) => plume(degrees, index, frames)),
  ]);
}

function peacockFront() {
  const seconds = 8;
  const frames = seconds * FPS;
  const neckSpine = quad([106, 140], [98, 116], [115, 99], 7);
  const neck = path(taper(neckSpine, [14, 11, 9, 8, 7.4, 7.2, 7]));
  const head = ellipse([11, 9], [117, 96]);
  const beak = path(sharpShape([[122, 94.6], [128.6, 97.4], [122, 99]]));
  const crest = [[110, 80], [115, 77.5], [120, 80]] as const;
  const crestGroup = stack(
    [
      art(crest.map((tip) => path(smoothShape([[115, 91.5], tip], false))), [stroke(PEA.navy, 0.8)]),
      art(crest.map((tip) => ellipse([2.6, 3.4], tip)), [radial([[0, PEA.sky], [1, PEA.blue]], [114, 78], 6), stroke(PEA.navy, 0.4)]),
    ],
    around([115, 91.5], { r: sway(8, 0.1, frames) }),
  );
  const bust = stack(
    [
      shadow([neck, head], [1.2, 2.2], 36),
      art([neck], [linear([[0, PEA.navy], [0.4, PEA.blue], [1, PEA.sky]], [104, 140], [115, 99]), stroke(PEA.navy, 0.6)]),
      art([path(smoothShape(neckSpine.slice(1, 6).map((point) => add(point, [-2.4, 0])), false))], [stroke('#FFFFFF', 0.8, 45)]),
      crestGroup,
      art([head], [radial([[0, PEA.sky], [1, PEA.blue]], [115, 93], 7), stroke(PEA.navy, 0.6)]),
      art([beak], [fill('#E7C79A'), stroke(PEA.bronze, 0.4)]),
      art([path(smoothShape([[113, 94.6], [117, 93.2], [121, 94.6], [117, 95.6]]))], [fill('#FFFFFF')]),
      art([circle(1.1, [117.4, 94.6])], [fill(PEA.navy)]),
    ],
    around([106, 140], { r: animated(keys([[0, 0], [1.4, -4], [2.2, 1.5], [3, 0], [5.4, 0], [6.2, -5], [7, 1], [8, 0]])) }),
  );
  const shine = glints([[polar(66, -150), 3.6, 0], [polar(67, -100), 4.2, 0.28], [polar(66, -55), 3.4, 0.5], [polar(64, -20), 3, 0.76]], '#FFFFFF', frames);
  return film('paon-roue-avant', seconds, [bust, ...shine]);
}

const peacockStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [PEA.teal, PEA.navy, PEA.gold, PEA.sky, PEA.green] },
  gradients: [ringGradient([[4, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 2, opacity: 1, width: 0.8 },
      { d: ringDiamonds(8, 46, 2.6, -90), color: 3, opacity: 1 },
      { d: ringTicks(24, 44.4, 47.6), color: 2, opacity: 0.7, width: 0.5 },
    ],
  },
};

export const PAON_ROUE: IllustratedFrame = { key: 'paon-roue', still: peacockStill, back: peacockBack, front: peacockFront };

// ── Guirlande de soucis ─────────────────────────────────────────────────

const GAR = { orange: '#F97316', saffron: '#FBBF24', deep: '#C2410C', leaf: '#15803D', leafLight: '#4ADE80', jasmine: '#FFFBEB', thread: '#7C2D12', magenta: '#BE185D', teal: '#0D9488' } as const;
const MARIGOLDS = [155, 133, 111, 90, 69, 47, 25];
const GARLAND_R = 52;

/** Une fleur de souci centrée sur l'origine : collerette dentelée, cœur, ombre. */
const ruffle = (radius: number, teeth: number): P[] =>
  Array.from({ length: teeth * 2 }, (_, index) => polar(index % 2 === 0 ? radius : radius * 0.8, (index * 180) / teeth, [0, 0]));

function marigold(at: P, phase: number, frames: number) {
  const outer = path(smoothShape(ruffle(7.2, 8)));
  return art(
    [outer],
    [radial([[0, GAR.deep], [0.2, GAR.deep], [0.28, '#FDE68A'], [0.62, GAR.saffron], [1, GAR.orange]], [0, 0], 7.4), stroke(GAR.deep, 0.5)],
    { p: still(at), r: sway(12, phase, frames) },
  );
}

const jasminePetals = (at: P) =>
  Array.from({ length: 5 }, (_, index) => {
    const degrees = index * 72 - 90;
    return path(smoothShape([corner(polar(0.4, degrees, at)), polar(2.2, degrees - 20, at), corner(polar(3.8, degrees, at)), polar(2.2, degrees + 20, at)]));
  });

function garlandFront() {
  const seconds = 8;
  const frames = seconds * FPS;
  const thread = path(smoothShape(Array.from({ length: 15 }, (_, index) => polar(GARLAND_R, 160 - index * 10)), false));
  const leaves = MARIGOLDS.slice(0, -1).flatMap((degrees) => {
    const at = polar(GARLAND_R + 1.5, degrees - 10.8);
    return [path(smoothShape(place([[0, 0], [3, -1.6], [6.4, 0], [3, 1.6]], at, degrees + 60)))];
  });
  const buds = MARIGOLDS.slice(0, -1).map((degrees) => polar(GARLAND_R - 2.6, degrees - 10.8));
  const jasmines = [art(buds.flatMap(jasminePetals), [fill(GAR.jasmine), stroke('#D6C7A1', 0.3)]), art(buds.map((at) => circle(0.8, at)), [fill(GAR.saffron)])];
  const tassel = (degrees: number, phase: number) => {
    const top = polar(GARLAND_R, degrees);
    return stack(
      [art([path(smoothShape([[0, 0], [0, 9]], false))], [stroke(GAR.thread, 0.7)]), art([circle(2.2, [0, 11])], [radial([[0, '#FDE68A'], [1, GAR.orange]], [-0.6, 10.4], 2.6)]), art([path(sharpShape([[-1.6, 12.4], [1.6, 12.4], [0, 18]]))], [fill(GAR.magenta)])],
      { p: still(top), r: sway(10, phase, frames) },
    );
  };
  const garland = stack(
    [
      art([thread], [stroke(GAR.thread, 1)]),
      art(leaves, [linear([[0, GAR.leafLight], [1, GAR.leaf]], [C, 100], [C, 130]), stroke(GAR.leaf, 0.3)]),
      ...jasmines,
      ...MARIGOLDS.map((degrees, index) => marigold(polar(GARLAND_R, degrees), index / MARIGOLDS.length, frames)),
      tassel(160, 0.2),
      tassel(20, 0.7),
    ],
    around([C, 30], { r: animated(keys([[0, 0], [2, 2], [4, 0], [6, -2], [8, 0]])) }),
  );
  const shine = glints([[polar(64, -140), 3.4, 0.05], [polar(66, -90), 4, 0.35], [polar(64, -40), 3.2, 0.62]], '#FFF7D6', frames);
  return film('guirlande-soucis-avant', seconds, [garland, ...shine]);
}

/** Un boteh (motif paisley), pointe recourbée, en coordonnées locales. */
const BOTEH: readonly P[] = [
  [0, 7],
  [-5, 3.6],
  [-5.6, -1.4],
  [-3, -5.6],
  [0.6, -8],
  [3.8, -9.6],
  [2.8, -6.6],
  [4.6, -2.4],
  [3.6, 2.8],
];

function garlandBack() {
  const seconds = 8;
  const botehs = (from: number, hex: string, inner: string) => {
    const at = (index: number) => polar(61, from + index * 90);
    const outer = [0, 1, 2, 3].map((index) => path(smoothShape(place(BOTEH, at(index), from + index * 90 + 90))));
    const core = [0, 1, 2, 3].map((index) => path(smoothShape(place(BOTEH.map((point) => scale(point, 0.5)), at(index), from + index * 90 + 90))));
    return [shadow(outer, [0.6, 1.4], 30), art(outer, [fill(hex), stroke(GAR.thread, 0.5)]), art(core, [fill(inner)])];
  };
  return film('guirlande-soucis-arriere', seconds, [
    glow([C, C], 70, GAR.saffron, 0.8, animated(keys([[0, 62], [3, 100], [8, 62]])), 0.55),
    stack([...botehs(-90, GAR.magenta, GAR.saffron), ...botehs(-45, GAR.teal, GAR.jasmine)], around([C, C], { r: spinBy(45, seconds) })),
    art([circle(52.5)], [stroke(GAR.deep, 1.1, 80, [0.1, 3.2])], around([C, C], { r: spinBy(-20, seconds) })),
  ]);
}

const garlandStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [GAR.orange, GAR.deep, GAR.saffron, GAR.leaf, GAR.jasmine] },
  gradients: [ringGradient([[2, 0], [0, 0.55], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 1, width: 0.8 },
      { d: ringDiamonds(12, 46, 2.4), color: 4, opacity: 1 },
      { d: ringTicks(12, 44.6, 47.4, -75), color: 1, opacity: 0.8, width: 1.2 },
    ],
  },
};

export const GUIRLANDE_SOUCIS: IllustratedFrame = { key: 'guirlande-soucis', still: garlandStill, back: garlandBack, front: garlandFront };

// ── Le pack ─────────────────────────────────────────────────────────────

export const CADRES_INDIENS: IllustratedPack = {
  slug: 'cadres-indiens',
  order: 16,
  names: {
    fr: { name: 'Cadres indiens', description: 'Trois cadres inspirés des motifs de l’Inde : un mandala floral qui s’ouvre, un paon qui fait la roue, une guirlande de soucis et de jasmin qui se balance.' },
    en: { name: 'Indian frames', description: 'Three frames inspired by Indian motifs: a floral mandala that unfolds, a peacock fanning its tail, a swaying garland of marigolds and jasmine.' },
    es: { name: 'Marcos indios', description: 'Tres marcos inspirados en los motivos de la India: un mandala floral que se abre, un pavo real que despliega la cola y una guirnalda de caléndulas y jazmín que se balancea.' },
    pt: { name: 'Molduras indianas', description: 'Três molduras inspiradas nos motivos da Índia: uma mandala floral que se abre, um pavão que abre a cauda e uma grinalda de cravos-de-defunto e jasmim que balança.' },
    de: { name: 'Indische Rahmen', description: 'Drei Rahmen nach indischen Motiven: ein florales Mandala, das sich öffnet, ein Pfau, der ein Rad schlägt, und eine schwingende Girlande aus Ringelblumen und Jasmin.' },
    it: { name: 'Cornici indiane', description: 'Tre cornici ispirate ai motivi dell’India: un mandala floreale che si apre, un pavone che fa la ruota e una ghirlanda di calendule e gelsomino che ondeggia.' },
    ar: { name: 'إطارات هندية', description: 'ثلاثة إطارات مستوحاة من زخارف الهند: ماندالا زهرية تتفتح، وطاووس يفرد ذيله، وإكليل من القطيفة والياسمين يتمايل.' },
  },
  frames: [
    { ...MANDALA_FLORAL, names: { fr: 'Mandala floral', en: 'Floral mandala', es: 'Mandala floral', pt: 'Mandala floral', de: 'Blumenmandala', it: 'Mandala floreale', ar: 'ماندالا زهرية' } },
    { ...PAON_ROUE, names: { fr: 'Paon qui fait la roue', en: 'Fanning peacock', es: 'Pavo real en abanico', pt: 'Pavão em leque', de: 'Radschlagender Pfau', it: 'Pavone che fa la ruota', ar: 'طاووس يفرد ذيله' } },
    { ...GUIRLANDE_SOUCIS, names: { fr: 'Guirlande de soucis', en: 'Marigold garland', es: 'Guirnalda de caléndulas', pt: 'Grinalda de cravos', de: 'Ringelblumengirlande', it: 'Ghirlanda di calendule', ar: 'إكليل القطيفة' } },
  ],
};
