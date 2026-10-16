import type { PlateFinish } from './author-plate';

/**
 * L'ANIMATION DE LA PLAQUE D'AUTEUR (#10816) — une animation Lottie GÉNÉRÉE
 * depuis le fini de la plaque, jamais un fichier dessiné par variante : le
 * moteur est l'unique de l'app (`LottieLayer`), qui la valide (`validateLottie`
 * partagé), la joue une fois à la première visibilité et ne monte RIEN sous
 * « Réduire les animations » — la plaque fixe, dessinée dessous, est déjà
 * l'état final. Aucune animation ne cache le nom : elle passe DESSUS.
 *
 *  - gravure : le burin, un point de lumière qui suit la ligne de base du pseudo ;
 *  - estampage : quatre éclats sur les lettres frappées ;
 *  - grattage : la pièce qui gratte en zigzag et les paillettes d'argent qui tombent ;
 *  - et pour tous, le lustre qui traverse la plaque en diagonale.
 *
 * La boîte est celle de la plaque (360 × 100, `author-plate.tsx`) : les mêmes
 * coordonnées, la couche se pose exactement sur le dessin.
 */

export const PLATE_BOX = { width: 360, height: 100 } as const;
export const PLATE_MOTION_FPS = 60;
/** 1,2 s : l'animation explique la gravure, puis se tait. */
export const PLATE_MOTION_FRAMES = 72;

type Vec = readonly number[];
type Key = { readonly t: number; readonly s: Vec };
type Shape = Readonly<Record<string, unknown>>;

const EASE = { i: { x: [0.4], y: [1] }, o: { x: [0.6], y: [0] } } as const;

const still = (k: number | Vec) => ({ a: 0, k });
const moving = (keys: readonly Key[]) => ({ a: 1, k: keys.map((key, index) => (index === keys.length - 1 ? key : { ...key, ...EASE })) });

/** Le blanc du reflet et l'argent des paillettes : des lumières, pas des couleurs de la charte. */
const GLINT: Vec = [1, 1, 1, 1];
const SILVER: Vec = [0.86, 0.88, 0.92, 1];
const GOLD: Vec = [0.99, 0.85, 0.45, 1];

const group = (items: readonly Shape[]): Shape => ({
  ty: 'gr',
  it: [...items, { ty: 'tr', p: still([0, 0]), a: still([0, 0]), s: still([100, 100]), r: still(0), o: still(100), sk: still(0), sa: still(0) }],
});
const fill = (color: Vec): Shape => ({ ty: 'fl', c: still(color), o: still(100), r: 1 });
const ellipse = (size: number): Shape => ({ ty: 'el', d: 1, s: still([size, size]), p: still([0, 0]) });
const rect = (w: number, h: number): Shape => ({ ty: 'rc', d: 1, s: still([w, h]), p: still([0, 0]), r: still(0) });

function layer(params: {
  readonly index: number;
  readonly name: string;
  readonly shapes: readonly Shape[];
  readonly position: ReturnType<typeof still> | ReturnType<typeof moving>;
  readonly opacity: ReturnType<typeof still> | ReturnType<typeof moving>;
  readonly rotation?: number;
  readonly scale?: ReturnType<typeof still> | ReturnType<typeof moving>;
}): Shape {
  return {
    ddd: 0,
    ind: params.index,
    ty: 4,
    nm: params.name,
    sr: 1,
    ks: { o: params.opacity, r: still(params.rotation ?? 0), p: params.position, a: still([0, 0, 0]), s: params.scale ?? still([100, 100, 100]) },
    ao: 0,
    shapes: [group(params.shapes)],
    ip: 0,
    op: PLATE_MOTION_FRAMES,
    st: 0,
    bm: 0,
  };
}

const sheen = (index: number): Shape =>
  layer({
    index,
    name: 'lustre',
    rotation: 18,
    shapes: [rect(34, 180), fill(GLINT)],
    position: moving([
      { t: 30, s: [-40, 50, 0] },
      { t: 70, s: [400, 50, 0] },
    ]),
    opacity: moving([
      { t: 30, s: [0] },
      { t: 44, s: [45] },
      { t: 70, s: [0] },
    ]),
  });

const burin = (index: number): Shape =>
  layer({
    index,
    name: 'burin',
    shapes: [ellipse(7), fill(GLINT)],
    position: moving([
      { t: 0, s: [126, 74, 0] },
      { t: 40, s: [302, 74, 0] },
    ]),
    opacity: moving([
      { t: 0, s: [0] },
      { t: 6, s: [95] },
      { t: 36, s: [95] },
      { t: 44, s: [0] },
    ]),
  });

const SPARKS: readonly (readonly [number, number, number])[] = [
  [140, 52, 4],
  [196, 80, 12],
  [248, 50, 20],
  [292, 78, 28],
];

const sparks = (from: number): Shape[] =>
  SPARKS.map(([x, y, start], offset) =>
    layer({
      index: from + offset,
      name: `éclat ${offset + 1}`,
      shapes: [ellipse(6), fill(GLINT)],
      position: still([x, y, 0]),
      scale: moving([
        { t: start, s: [0, 0, 100] },
        { t: start + 8, s: [140, 140, 100] },
        { t: start + 20, s: [0, 0, 100] },
      ]),
      opacity: still(90),
    }),
  );

const COIN_PATH: readonly (readonly [number, number])[] = [
  [118, 46],
  [308, 52],
  [122, 60],
  [310, 66],
  [120, 74],
];

const coin = (index: number): Shape =>
  layer({
    index,
    name: 'pièce',
    shapes: [ellipse(16), fill(GOLD)],
    position: moving(COIN_PATH.map(([x, y], step) => ({ t: step * 10, s: [x, y, 0] }))),
    opacity: moving([
      { t: 0, s: [100] },
      { t: 40, s: [100] },
      { t: 48, s: [0] },
    ]),
  });

const FLECKS: readonly (readonly [number, number])[] = [
  [150, 6],
  [184, 12],
  [222, 18],
  [258, 24],
  [290, 30],
];

const flecks = (from: number): Shape[] =>
  FLECKS.map(([x, start], offset) =>
    layer({
      index: from + offset,
      name: `paillette ${offset + 1}`,
      shapes: [ellipse(4), fill(SILVER)],
      position: moving([
        { t: start, s: [x, 62, 0] },
        { t: start + 30, s: [x + 6, 100, 0] },
      ]),
      opacity: moving([
        { t: start, s: [0] },
        { t: start + 4, s: [100] },
        { t: start + 30, s: [0] },
      ]),
    }),
  );

const FINISH_LAYERS: Readonly<Record<PlateFinish, () => Shape[]>> = {
  engrave: () => [burin(1), sheen(2)],
  emboss: () => [...sparks(1), sheen(1 + SPARKS.length)],
  scratch: () => [coin(1), ...flecks(2), sheen(2 + FLECKS.length)],
};

export function plateMotion(finish: PlateFinish): Readonly<Record<string, unknown>> {
  return {
    v: '5.7.4',
    fr: PLATE_MOTION_FPS,
    ip: 0,
    op: PLATE_MOTION_FRAMES,
    w: PLATE_BOX.width,
    h: PLATE_BOX.height,
    nm: `plaque d'auteur · ${finish}`,
    ddd: 0,
    assets: [],
    layers: FINISH_LAYERS[finish](),
  };
}

/** Les octets que `LottieLayer` attend : l'animation générée, encodée une fois par fini. */
export const plateMotionBytes = (finish: PlateFinish): Uint8Array => new TextEncoder().encode(JSON.stringify(plateMotion(finish)));
