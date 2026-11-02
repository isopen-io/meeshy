/**
 * Famille AFRICAINE des cadres illustrés (#13963) — un MASQUE D'ÉBÈNE (original, aucune reproduction)
 * dont les yeux s'illuminent devant un soleil de savane, des BANDES TISSÉES aux couleurs franches qui
 * ondulent, un COLLIER DE PERLES qui roule. Géométries de tissage inventées : aucun signe à sens codifié.
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
  evenOdd,
  fill,
  fillAnimated,
  film,
  glow,
  keys,
  linear,
  mirror,
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
  stack,
  still,
  stroke,
  taper,
  type Vertex,
} from './kit.js';

const spin = (seconds: number, degrees: number) => animated(keys([[0, 0], [seconds, degrees]]), LINEAR);

/** Un secteur d'anneau entre `r1` et `r2`, de `from` à `to` degrés, aux bords légèrement arrondis. */
const sector = (r1: number, r2: number, from: number, to: number) =>
  sharpShape([polar(r1, from), polar(r1, (from + to) / 2), polar(r1, to), polar(r2, to), polar(r2, (from + to) / 2), polar(r2, from)]);

// ── Masque d'ébène ──────────────────────────────────────────────────────

const EBONY = { wood: '#4A2C17', dark: '#1C0F07', ochre: '#D08A2E', gold: '#F2C14E', cream: '#F3E3C3', ember: '#3A1C08', amber: '#FFB43A', sun: '#F59E0B', red: '#B8432A' } as const;

/** La moitié droite du masque, du sommet du front au menton ; la gauche en est le miroir. */
const MASK_RIGHT: readonly Vertex[] = [
  [76, 3],
  [86, 9],
  [92, 21],
  [91, 34],
  [85, 46],
  [76, 54],
];
const mirrorVertex = (vertex: Vertex): Vertex => (vertex.length === 3 ? [140 - vertex[0], vertex[1], 'corner'] : mirror(vertex));
const maskOutline = (): Vertex[] => [[70, 1.4, 'corner'], ...MASK_RIGHT, [70, 57, 'corner'], ...[...MASK_RIGHT].reverse().map(mirrorVertex)];

const slit = (center: P, side: 1 | -1, width = 9, height = 2.6) =>
  smoothShape([
    [center[0] - (width / 2) * side, center[1] + 0.8, 'corner'],
    [center[0], center[1] - height / 2],
    [center[0] + (width / 2) * side, center[1] - 0.8, 'corner'],
    [center[0], center[1] + height / 2],
  ]);

function maskFront() {
  const seconds = 8;
  const outline = path(smoothShape(maskOutline()));
  const eyes: readonly (readonly [P, 1 | -1])[] = [
    [[80, 25], 1],
    [[60, 25], -1],
  ];
  const iris = fillAnimated([[0, EBONY.ember], [1, EBONY.ember], [2.2, EBONY.amber], [4, EBONY.gold], [5.4, EBONY.amber], [6.6, EBONY.ember], [8, EBONY.ember]]);
  const shine = animated(keys([[0, 0], [1, 0], [2.4, 90], [4, 100], [5.6, 60], [6.8, 0], [8, 0]]));
  const chevrons = [0, 1, 2].flatMap((index) => {
    const y = 33 + index * 4;
    const right: P[] = [[78, y], [82, y + 2.4], [86, y]];
    return [right, right.map(mirror)];
  });
  const dots = [62, 66, 70, 74, 78].map((x, index) => circle(index === 2 ? 1.5 : 1.1, [x, index === 2 ? 11 : 12]));
  const earrings = ([[49, 36], [91, 36]] as const).map((at, index) =>
    stack(
      [
        art([path(sharpShape([[0, 0], [0, 7]], false))], [stroke(EBONY.cream, 0.6)]),
        ...[3, 7, 11].map((y, bead) => art([circle(bead === 2 ? 2.2 : 1.6, [0, y])], [radial([[0, '#FFFFFF'], [0.4, [EBONY.red, EBONY.gold, EBONY.ochre][bead]!], [1, EBONY.dark]], [-0.6, y - 0.6], 2.4)])),
      ],
      { p: still(at), r: animated(oscillate(index === 0 ? 9 : -9, 4, seconds)) },
    ),
  );
  return film('masque-ebene-avant', seconds, [stack([
    shadow([outline], [0, 2.6], 44),
    art([outline], [linear([[0, '#7A4A26'], [0.5, EBONY.wood], [1, EBONY.dark]], [56, 4], [84, 56]), stroke(EBONY.ochre, 1.6)]),
    art([ellipse([14, 30], [64, 24])], [radial([[0, '#FFFFFF'], [1, '#FFFFFF']], [64, 20], 14, { alphas: [[0, 0.22], [1, 0]] })]),
    art([path(smoothShape([[70, 15], [70, 44]], false))], [stroke(EBONY.ochre, 1.2, 80)]),
    art(dots, [radial([[0, '#FFFFFF'], [1, EBONY.cream]], [69, 10], 3)]),
    art(chevrons.map((points) => path(smoothShape(points, false))), [stroke(EBONY.cream, 1, 85)]),
    ...eyes.flatMap(([center, side]) => [
      glow(center, 11, EBONY.amber, 0.9, shine),
      art([path(slit(center, side, 11, 4.4))], [fill(EBONY.dark), stroke(EBONY.ochre, 0.8)]),
      art([path(slit(center, side))], [iris]),
    ]),
    art([path(sharpShape([[66.4, 47], [73.6, 47], [72, 50.4], [68, 50.4]]))], [fill(EBONY.dark), stroke(EBONY.ochre, 0.6)]),
    ...earrings,
  ], { p: still([0, 4]) })]);
}

function maskBack() {
  const seconds = 8;
  const rays = Array.from({ length: 12 }, (_, index) => {
    const degrees = index * 30;
    const reach = index % 2 === 0 ? 70 : 62;
    return art([path(sharpShape([polar(44, degrees - 5), polar(reach, degrees), polar(44, degrees + 5)]))], [
      linear([[0, EBONY.gold], [1, EBONY.red]], polar(44, degrees), polar(reach, degrees), { alphas: [[0, 0.95], [1, 0.15]] }),
    ]);
  });
  return film('masque-ebene-arriere', seconds, [
    glow([C, C], 68, EBONY.sun, 0.8, animated(keys([[0, 60], [2.5, 100], [5, 75], [8, 60]])), 0.58),
    stack(rays, around([C, C], { r: spin(seconds, 30) })),
  ]);
}

const maskStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [EBONY.wood, EBONY.dark, EBONY.ochre, EBONY.gold, EBONY.cream] },
  gradients: [ringGradient([[2, 0], [0, 0.5], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 1, width: 0.8 },
      { d: ringTicks(24, 44.2, 47.8), color: 4, opacity: 0.8, width: 0.7 },
      { d: ringDiamonds(1, 46, 3.4, -90), color: 3, opacity: 1 },
    ],
  },
};

export const MASQUE_EBENE = { key: 'masque-ebene', still: maskStill, back: maskBack, front: maskFront };

// ── Bandes tissées ──────────────────────────────────────────────────────

const WEAVE = { gold: '#F2B705', green: '#1E7B45', red: '#C0392B', black: '#17120E', indigo: '#1E2A5A', cream: '#F6E7C1' } as const;
const BAND_COLORS = [WEAVE.gold, WEAVE.green, WEAVE.gold, WEAVE.red, WEAVE.gold, WEAVE.black] as const;
const SEGMENTS = 18;

function weaveSegment(index: number, frames: number) {
  const step = 360 / SEGMENTS;
  const from = -90 + index * step + 0.6;
  const to = from + step - 1.2;
  const color = BAND_COLORS[index % BAND_COLORS.length]!;
  const stripe = color === WEAVE.gold ? WEAVE.black : WEAVE.gold;
  const out = polar(2.4, (from + to) / 2, [0, 0]);
  return stack(
    [
      art([path(sector(49.5, 58.5, from, to))], [fill(color), stroke(WEAVE.black, 0.4, 70)]),
      art([path(sector(51.4, 52.6, from, to)), path(sector(55.4, 56.6, from, to))], [fill(stripe, 90)]),
    ],
    { p: animated(cycle([[0, [0, 0]], [0.5, [out[0], out[1]]], [1, [0, 0]]], index / SEGMENTS, frames)) },
  );
}

const tail = (side: 1 | -1, seconds: number) => {
  const root = polar(57, side === 1 ? 48 : 132);
  const spine: P[] = [root, add(root, [6 * side, 7]), add(root, [8 * side, 14]), add(root, [13 * side, 20])];
  const body = path(taper(spine, [9, 8.4, 7.6, 7]));
  const bars = [1, 2, 3].map((index) => path(smoothShape([add(spine[index]!, [-4.2, 0]), add(spine[index]!, [4.2, 0])], false)));
  return stack(
    [shadow([body], [0.8, 1.6], 32), art([body], [linear([[0, WEAVE.green], [0.5, WEAVE.gold], [1, WEAVE.red]], root, spine[3]!), stroke(WEAVE.black, 0.5)]), art(bars, [stroke(WEAVE.black, 1.4, 85)])],
    around(root, { r: animated(oscillate(7 * side, seconds / 2, seconds)) }),
  );
};

function weaveFront() {
  const seconds = 6;
  const frames = seconds * 30;
  const segments = Array.from({ length: SEGMENTS }, (_, index) => weaveSegment(index, frames));
  return film('bandes-tissees-avant', seconds, [
    tail(1, seconds),
    tail(-1, seconds),
    art([circle(58.8), circle(49.2)], [evenOdd('#000000', 30)], { p: still([0, 2]) }),
    ...segments,
  ]);
}

function weaveBack() {
  const seconds = 12;
  const crosses = Array.from({ length: 24 }, (_, index) => {
    const at = polar(64, index * 15);
    return path(sharpShape([add(at, [-1.6, 0]), add(at, [1.6, 0]), at, add(at, [0, -1.6]), add(at, [0, 1.6])], false));
  });
  return film('bandes-tissees-arriere', seconds, [
    art([circle(68)], [radial([[0, WEAVE.indigo], [1, WEAVE.indigo]], [C, C], 68, { alphas: [[0, 0], [0.62, 0], [0.74, 0.9], [1, 0.2]] })]),
    stack([art(crosses, [stroke(WEAVE.cream, 0.8, 85)]), art([circle(61)], [stroke(WEAVE.cream, 0.6, 60, [1.2, 2.4])])], around([C, C], { r: spin(seconds, 15) })),
    glow([C, C], 66, WEAVE.gold, 0.5, animated(keys([[0, 40], [4, 100], [9, 60], [12, 40]])), 0.62),
  ]);
}

const weaveStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [WEAVE.gold, WEAVE.green, WEAVE.red, WEAVE.black] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4 },
      ...[0, 1, 2].map((part) => ({
        d: Array.from({ length: 8 }, (_, index) => ringArc(46, -90 + (index * 3 + part) * 15 + 0.8, -90 + (index * 3 + part) * 15 + 14.2)).join(''),
        color: [1, 2, 3][part]!,
        opacity: 1,
        width: 6.4,
      })),
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 3, opacity: 1, width: 0.8 },
    ],
  },
};

export const BANDES_TISSEES = { key: 'bandes-tissees', still: weaveStill, back: weaveBack, front: weaveFront };

// ── Collier de perles ───────────────────────────────────────────────────

const BEAD = { ochre: '#D08A2E', terracotta: '#B4532A', indigo: '#25337A', cream: '#F3E3C3', gold: '#F2C14E', turquoise: '#1FA5A0', dark: '#1C0F07', earth: '#3B2414' } as const;

function bead(at: P, radius: number, color: string) {
  return art([circle(radius, at)], [radial([[0, '#FFFFFF'], [0.35, color], [1, BEAD.dark]], add(at, [-radius * 0.4, -radius * 0.45]), radius * 1.5), stroke(BEAD.dark, 0.3, 60)]);
}

const strand = (count: number, radius: number, size: number, palette: readonly string[]) =>
  Array.from({ length: count }, (_, index) => bead(polar(radius, -90 + (index * 360) / count), size, palette[index % palette.length]!));

function pendant(seconds: number) {
  const shell = path(smoothShape([[0, 0], [4.4, 4], [4.8, 10], [0, 15, 'corner'], [-4.8, 10], [-4.4, 4]]));
  const slitLine = path(smoothShape([[0, 3], [0.8, 8], [0, 13]], false));
  const teeth = [5, 7, 9, 11].map((y) => path(smoothShape([[-1.2, y], [1.2, y]], false)));
  return stack(
    [shadow([shell], [0.6, 1.4], 36), art([shell], [radial([[0, '#FFFFFF'], [0.5, BEAD.cream], [1, '#BFA27A']], [-1.4, 5], 9), stroke(BEAD.earth, 0.6)]), art([slitLine], [stroke(BEAD.earth, 1)]), art(teeth, [stroke(BEAD.earth, 0.5, 70)])],
    { p: still(polar(51, 90)), r: animated(keys([[0, 0], [1.5, 8], [4, -6], [6.5, 4], [seconds, 0]])) },
  );
}

function beadFront() {
  const seconds = 10;
  const inner = strand(30, 52.5, 2.6, [BEAD.ochre, BEAD.terracotta, BEAD.cream, BEAD.indigo, BEAD.gold]);
  const outer = strand(36, 59.5, 2.1, [BEAD.turquoise, BEAD.cream, BEAD.terracotta, BEAD.gold]);
  return film('collier-perles-avant', seconds, [
    art([circle(59.5)], [stroke(BEAD.earth, 0.8, 80)]),
    stack(outer, around([C, C], { r: spin(seconds, -40) })),
    art([circle(52.5)], [stroke(BEAD.earth, 0.8, 80)]),
    stack(inner, around([C, C], { r: spin(seconds, 60) })),
    pendant(seconds),
  ]);
}

function beadBack() {
  const seconds = 10;
  return film('collier-perles-arriere', seconds, [
    glow([C, C], 68, BEAD.ochre, 0.75, animated(keys([[0, 55], [3, 100], [7, 70], [10, 55]])), 0.6),
    art([circle(65)], [stroke(BEAD.cream, 1.2, 70, [0.1, 3.2])], around([C, C], { r: spin(seconds, 36) })),
  ]);
}

const beadStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [BEAD.earth, BEAD.ochre, BEAD.terracotta, BEAD.cream, BEAD.indigo] },
  gradients: [ringGradient([[1, 0], [0, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: ringDiamonds(20, 46, 2.2, -90), color: 1, opacity: 1 },
      { d: ringDiamonds(20, 46, 1.4, -81), color: 3, opacity: 1 },
      { d: `${ringCircle(49.4)}${ringCircle(42.7)}`, color: 2, opacity: 1, width: 0.7 },
    ],
  },
};

export const COLLIER_PERLES = { key: 'collier-perles', still: beadStill, back: beadBack, front: beadFront };

export const CADRES_AFRICAINS: IllustratedPack = {
  slug: 'cadres-africains',
  order: 11,
  names: {
    fr: { name: 'Cadres d’Afrique', description: 'Trois cadres inspirés de l’Afrique : un masque d’ébène aux yeux qui s’illuminent devant un soleil de savane, des bandes tissées qui ondulent, un collier de perles qui roule.' },
    en: { name: 'African frames', description: 'Three frames inspired by Africa: an ebony mask whose eyes light up before a savanna sun, rippling woven bands and a rolling bead necklace.' },
    es: { name: 'Marcos de África', description: 'Tres marcos inspirados en África: una máscara de ébano cuyos ojos se iluminan ante un sol de sabana, bandas tejidas que ondulan y un collar de cuentas que gira.' },
    pt: { name: 'Molduras de África', description: 'Três molduras inspiradas em África: uma máscara de ébano cujos olhos se iluminam diante de um sol de savana, faixas tecidas que ondulam e um colar de contas que gira.' },
    de: { name: 'Afrikanische Rahmen', description: 'Drei von Afrika inspirierte Rahmen: eine Ebenholzmaske, deren Augen vor einer Savannensonne aufleuchten, wogende Webbänder und eine rollende Perlenkette.' },
    it: { name: 'Cornici d’Africa', description: 'Tre cornici ispirate all’Africa: una maschera d’ebano dagli occhi che si accendono davanti a un sole di savana, bande tessute che ondeggiano e una collana di perle che ruota.' },
    ar: { name: 'إطارات أفريقية', description: 'ثلاثة إطارات مستوحاة من أفريقيا: قناع من الأبنوس تتوهّج عيناه أمام شمس السافانا، وأشرطة منسوجة تتموّج، وعقد من الخرز يدور.' },
  },
  frames: [
    { ...MASQUE_EBENE, names: { fr: 'Masque d’ébène', en: 'Ebony mask', es: 'Máscara de ébano', pt: 'Máscara de ébano', de: 'Ebenholzmaske', it: 'Maschera d’ebano', ar: 'قناع الأبنوس' } },
    { ...BANDES_TISSEES, names: { fr: 'Bandes tissées', en: 'Woven bands', es: 'Bandas tejidas', pt: 'Faixas tecidas', de: 'Webbänder', it: 'Bande tessute', ar: 'أشرطة منسوجة' } },
    { ...COLLIER_PERLES, names: { fr: 'Collier de perles', en: 'Bead necklace', es: 'Collar de cuentas', pt: 'Colar de contas', de: 'Perlenkette', it: 'Collana di perle', ar: 'عقد الخرز' } },
  ],
};
