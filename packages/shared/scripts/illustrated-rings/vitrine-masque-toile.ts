/**
 * Vitrine des cadres illustrés (#13960) — le MASQUE FÉLIN et la TOILE D'ARAIGNÉE.
 */
import type { IllustratedFrame } from './frame.js';
import {
  C,
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
  fillAnimated,
  film,
  glow,
  keys,
  linear,
  mirror,
  mix,
  oscillate,
  quad,
  path,
  pathAnimated,
  polar,
  radial,
  ringArc,
  ringCircle,
  ringGradient,
  ringPolygon,
  shadow,
  sharpShape,
  smoothShape,
  stack,
  still,
  stroke,
} from './kit.js';

// ── Masque félin ────────────────────────────────────────────────────────

const MASK = { night: '#140A24', violet: '#3B1F66', plum: '#7444B8', gold: '#E2B04A', goldLight: '#FFE7A6', inner: '#C084FC', socket: '#07040D', amber: '#FFB43A', red: '#FF2238', ember: '#3A2410' } as const;

/** La moitié droite du masque, du haut du front au bas du nez ; la gauche en est le miroir. */
const MASK_RIGHT: readonly Vertex[] = [
  [70, 31],
  [83, 27],
  [101, 3, 'corner'],
  [113, 29],
  [121, 47],
  [119, 66],
  [108, 82, 'corner'],
  [105, 62],
  [96, 49],
  [81, 46],
];

const mirrorVertex = (vertex: Vertex): Vertex => (vertex.length === 3 ? [140 - vertex[0], vertex[1], 'corner'] : mirror(vertex));
const maskOutline = (): Vertex[] => [...MASK_RIGHT, [70, 52, 'corner'], ...[...MASK_RIGHT].slice(1).reverse().map(mirrorVertex)];

const earInner = (side: 1 | -1) => {
  const points: P[] = [
    [86, 26],
    [100, 9],
    [108, 28],
  ];
  return sharpShape(side === 1 ? points : points.map(mirror));
};

const eyeShape = (center: P, side: 1 | -1, width = 17, height = 7.4) => {
  const [x, y] = center;
  const tilt = 2.6 * side;
  return smoothShape([
    [x - (width / 2) * side, y + tilt, 'corner'],
    [x, y - height / 2],
    [x + (width / 2) * side, y - tilt, 'corner'],
    [x, y + height / 2],
  ]);
};

function felineMaskFront() {
  const seconds = 6;
  const outline = path(smoothShape(maskOutline()));
  const eyes: readonly (readonly [P, 1 | -1])[] = [
    [[89, 38.5], 1],
    [[51, 38.5], -1],
  ];
  const iris = fillAnimated([
    [0, MASK.ember],
    [0.8, MASK.ember],
    [1.8, MASK.amber],
    [2.6, MASK.amber],
    [3.4, MASK.red],
    [5, MASK.red],
    [6, MASK.ember],
  ]);
  const amberGlow = animated(keys([[0, 0], [0.8, 0], [1.8, 85], [2.6, 70], [3.4, 0], [6, 0]]));
  const redGlow = animated(keys([[0, 0], [2.6, 0], [3.4, 90], [4.2, 100], [5, 70], [6, 0]]));
  const pupil = animated(keys([[0, [100, 100]], [1.8, [100, 100]], [2.6, [60, 100]], [3.6, [35, 100]], [5, [45, 100]], [6, [100, 100]]]));
  const stripes = [
    [[70, 33], [70, 37], [70, 42]],
    [[64, 34], [62, 37], [63, 40]],
    [[76, 34], [78, 37], [77, 40]],
  ] as const;
  const browStripes = [
    [[101, 33], [108, 37], [113, 44]],
    [[106, 50], [111, 53], [115, 58]],
  ] as const;
  const face = stack(
    [
      shadow([outline], [0, 3.2], 42),
      art([outline], [linear([[0, MASK.plum], [0.45, MASK.violet], [1, MASK.night]], [70, 4], [70, 84]), stroke(MASK.gold, 2.2)]),
      art([path(earInner(1)), path(earInner(-1))], [linear([[0, MASK.inner], [1, MASK.violet]], [70, 9], [70, 30])]),
      art([ellipse([46, 12], [70, 33])], [radial([[0, '#FFFFFF'], [1, '#FFFFFF']], [70, 33], 23, { alphas: [[0, 0.28], [1, 0]] })]),
      art(
        [...stripes, ...browStripes, ...browStripes.map((stripe) => stripe.map((point) => mirror(point as P)))].map((points) => path(smoothShape(points as readonly P[], false))),
        [stroke(MASK.gold, 1.6, 90)],
      ),
      art([path(smoothShape([[34, 47], [50, 33], [70, 31], [90, 33], [106, 47]], false))], [stroke(MASK.goldLight, 0.9, 70)]),
      ...eyes.flatMap(([center, side]) => [
        glow(center, 16, MASK.amber, 0.85, amberGlow),
        glow(center, 19, MASK.red, 0.9, redGlow),
        art([path(eyeShape(center, side, 20, 9.6))], [fill(MASK.socket), stroke(MASK.gold, 1.1)]),
        art([path(eyeShape(center, side))], [iris]),
        art([ellipse([2.6, 6.4], [0, 0])], [fill(MASK.socket)], { p: still(center), s: pupil }),
        art([ellipse([2, 1.4], [center[0] + 3 * side, center[1] - 1.6])], [fill('#FFFFFF', 85)]),
      ]),
      art([path(sharpShape([[70, 23], [74, 29], [70, 35], [66, 29]]))], [linear([[0, MASK.goldLight], [1, MASK.gold]], [70, 23], [70, 35]), stroke('#8A5A12', 0.6)]),
    ],
    around([70, 40], { s: animated(keys([[0, [100, 100]], [3, [101.6, 101.6]], [6, [100, 100]]])) }),
  );
  return film('masque-felin-avant', seconds, [face]);
}

function felineMaskBack() {
  const seconds = 6;
  const aura = animated(keys([[0, 55], [3, 100], [6, 55]]));
  return film('masque-felin-arriere', seconds, [
    art([circle(68)], [radial([[0, MASK.inner], [1, MASK.violet]], [C, C], 68, { alphas: [[0, 0], [0.6, 0], [0.72, 0.75], [1, 0]], opacity: aura })]),
  ]);
}

const felineStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [MASK.violet, MASK.night, MASK.gold, MASK.goldLight, MASK.red] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 0, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.3)}${ringCircle(42.8)}`, color: 2, opacity: 1, width: 0.9 },
      { d: ringPolygon([[37, 4.6], [43, 1.2], [45.6, 7.6]]) + ringPolygon([[63, 4.6], [57, 1.2], [54.4, 7.6]]), color: 2, opacity: 1 },
      { d: ringPolygon([[50, 1], [52.6, 4.4], [50, 7.8], [47.4, 4.4]]), color: 3, opacity: 1 },
      { d: ringArc(46, -150, -132) + ringArc(46, -48, -30), color: 4, opacity: 0.95, width: 2.2 },
    ],
  },
};

export const MASQUE_FELIN: IllustratedFrame = { key: 'masque-felin', still: felineStill, back: felineMaskBack, front: felineMaskFront };

// ── Toile d'araignée ────────────────────────────────────────────────────

const WEB = { night: '#0E1220', steel: '#4B5568', silver: '#E8EEF7', dew: '#BDEBFF', body: '#1C1219', bodyLight: '#5A3550', mark: '#C8323C' } as const;
const ANCHOR: P = [10, 12];
const SPOKES = [8, 20, 33, 46, 58, 70, 82].map((degrees, index) => ({ degrees, reach: [62, 78, 88, 92, 88, 78, 62][index]! }));
const RINGS = [11, 20, 30, 41, 52, 63, 74];

function webStrands() {
  const spokes = SPOKES.map(({ degrees, reach }) => path(smoothShape([ANCHOR, polar(reach, degrees, ANCHOR)], false)));
  const sag = (points: readonly P[], center: P) =>
    path(sharpShape(points.flatMap((point, index) => (index === 0 ? [point] : quad(points[index - 1]!, mix(mix(points[index - 1]!, point, 0.5), center, 0.12), point, 5).slice(1))), false));
  const spirals = RINGS.map((distance) => sag(SPOKES.filter(({ reach }) => reach > distance + 2).map(({ degrees }) => polar(distance, degrees, ANCHOR)), ANCHOR));
  const corner: P = [134, 126];
  const loose = [200, 222, 246, 262].map((degrees, index) => path(smoothShape([corner, polar([30, 40, 34, 24][index]!, degrees, corner)], false)));
  const looseRings = [10, 19].map((distance) => sag([200, 222, 246, 262].filter((_, index) => [30, 40, 34, 24][index]! > distance).map((degrees) => polar(distance, degrees, corner)), corner));
  return { spokes, spirals, loose: [...loose, ...looseRings] };
}

const DEW: readonly (readonly [number, number, number])[] = [
  [30, 20, 0],
  [41, 46, 0.18],
  [52, 33, 0.36],
  [63, 58, 0.52],
  [20, 33, 0.7],
  [74, 46, 0.86],
];

function spiderBody() {
  const leg = (side: 1 | -1, index: number) => {
    const root: P = [0, -2 + index * 1.6];
    const spread = [-58, -22, 14, 44][index]!;
    const knee = polar(8, spread - 34 * side + (side === -1 ? 180 : 0), root);
    const foot = polar(14, spread + 22 * side + (side === -1 ? 180 : 0), root);
    return path(smoothShape([root, knee, foot], false, 0.12));
  };
  const legs = (side: 1 | -1) =>
    art([0, 1, 2, 3].map((index) => leg(side, index)), [stroke(WEB.body, 1.25)], {
      r: animated(oscillate(6 * side, 1, 10)),
    });
  return [
    legs(1),
    legs(-1),
    art([ellipse([9.4, 11.6], [0, 5])], [radial([[0, WEB.bodyLight], [1, WEB.body]], [-1.6, 2.4], 7.4), stroke('#000000', 0.5, 60)]),
    art([path(sharpShape([[0, 3.4], [1.6, 5.6], [0, 8.6], [-1.6, 5.6]]))], [fill(WEB.mark)]),
    art([ellipse([6.4, 6], [0, -2.6])], [radial([[0, WEB.bodyLight], [1, WEB.body]], [-1, -3.6], 4)]),
    art([ellipse([1.4, 1.4], [-1.2, -4.2]), ellipse([1.4, 1.4], [1.2, -4.2])], [fill('#FFFFFF', 80)]),
  ];
}

function spiderWebFront() {
  const seconds = 10;
  const frames = seconds * 30;
  const { spokes, spirals, loose } = webStrands();
  const all = [...spokes, ...spirals, ...loose];
  const tremble = animated(keys([[0, [100, 100]], [3.6, [100, 100]], [4, [102, 102]], [4.4, [99.2, 99.2]], [4.8, [100.8, 100.8]], [5.4, [100, 100]], [10, [100, 100]]]));
  const web = stack(
    [
      art(all, [stroke('#000000', 1.7, 30)], { p: still([0.6, 0.9]) }),
      art(all, [stroke(WEB.silver, 0.85, 82)]),
      art(spokes.slice(2, 5), [stroke('#FFFFFF', 0.5, animated(keys([[0, 20], [2.5, 90], [5, 20], [7.5, 70], [10, 20]])))]),
      ...DEW.map(([distance, degrees, phase]) => {
        const at = polar(distance, degrees, ANCHOR);
        return art([circle(1.7, at)], [radial([[0, '#FFFFFF'], [1, WEB.dew]], add(at, [-0.5, -0.5]), 1.8)], {
          o: animated(cycle([[0, [35]], [0.2, [100]], [0.4, [35]], [1, [35]]], phase, frames)),
        });
      }),
    ],
    around(ANCHOR, { s: tremble, r: animated(keys([[0, 0], [4, 0.8], [4.6, -0.6], [5.4, 0], [10, 0]])) }),
  );
  const drop = (y: number) => [y] as const;
  const fall = keys([[0, drop(-14)], [1, drop(-14)], [3.6, drop(56)], [6.2, drop(56)], [8.8, drop(-14)], [10, drop(-14)]]);
  const x = 104;
  const thread = pathAnimated(fall.map((key) => [key.t / 30, smoothShape([[x, -4], [x, key.s[0]! - 8]], false)] as const));
  const spider = stack(spiderBody(), {
    p: animated(fall.map((key) => ({ t: key.t, s: [x, key.s[0]!] }))),
    r: animated(keys([[0, 0], [3.6, 0], [4.4, 9], [5.2, -7], [6.2, 0], [10, 0]])),
  });
  return film('toile-araignee-avant', seconds, [web, art([thread], [stroke(WEB.silver, 0.6, 90)]), spider]);
}

function spiderWebBack() {
  const seconds = 10;
  return film('toile-araignee-arriere', seconds, [
    art([circle(66)], [radial([[0, WEB.steel], [1, WEB.night]], [C, C], 66, { alphas: [[0, 0], [0.62, 0], [0.74, 0.7], [1, 0]], opacity: animated(keys([[0, 60], [5, 100], [10, 60]])) })]),
  ]);
}

const webStill = {
  stroke: { style: 'none' as const, width: 0.04, colors: [WEB.steel, WEB.night, WEB.silver, WEB.mark] },
  gradients: [ringGradient([[0, 0], [1, 1]])],
  ornament: {
    paths: [
      { d: ringCircle(46), color: 1, opacity: 1, width: 6.4, gradient: 0 },
      { d: `${ringCircle(49.3)}${ringCircle(42.8)}`, color: 2, opacity: 0.8, width: 0.6 },
      {
        d: [-170, -152, -134, -116, -98].map((degrees) => `M${polar(42.8, degrees, [50, 50]).map((n) => Math.round(n * 100) / 100).join(' ')}L${polar(49.3, degrees, [50, 50]).map((n) => Math.round(n * 100) / 100).join(' ')}`).join(''),
        color: 2,
        opacity: 0.9,
        width: 0.5,
      },
      { d: ringArc(45, -170, -98) + ringArc(47.2, -170, -98), color: 2, opacity: 0.75, width: 0.45 },
      { d: ringPolygon([[50, 3.2], [51.5, 4.8], [50, 6.6], [48.5, 4.8]]), color: 3, opacity: 1 },
    ],
  },
};

export const TOILE_ARAIGNEE: IllustratedFrame = { key: 'toile-araignee', still: webStill, back: spiderWebBack, front: spiderWebFront };
