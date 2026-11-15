/**
 * **LE CUBE QUI TOURNE D'UN AUTEUR À L'AUTRE** (#11198) — miroir de
 * `StoryGroupCube` et `StoryGroupSwipeDecision`
 * (`StoryViewerCardTransform.swift`, iOS #11192), constantes comprises.
 *
 * La géométrie est celle d'un vrai cube de côté `largeur`, centré derrière
 * l'écran : la face à l'angle `θ` y est tournée autour de l'axe vertical du
 * cube, et le cube entier recule exactement de ce dont son arête la plus
 * proche avancerait — l'arête commune reste dans le plan de l'écran, jamais
 * plus haute que lui. Chaque face reçoit sa transformation COMPLÈTE,
 * perspective comprise (`matrix3d`) : l'hôte n'a ni `perspective` ni
 * `transform-style` à poser, seulement `transform-origin: 0 0`.
 *
 * Les matrices suivent la convention de `CATransform3D` (vecteur LIGNE,
 * translation en `m41..m43`) : ses seize valeurs, dans l'ordre `m11..m44`,
 * sont exactement celles que `matrix3d()` attend.
 *
 * Module PUR, sans DOM ni horloge : l'hôte (`use-story-group-cube.ts`) mesure
 * le doigt et l'écran, ce module décide et calcule.
 */

/** 90° pile rend une projection SINGULIÈRE (`m11 = cos 90° = 0`) : à 89,5° la face est déjà de profil. */
export const CUBE_EDGE_DEGREES = 89.5;
export const CUBE_CAMERA_DISTANCE_IN_WIDTHS = 2.2;
export const CUBE_MAXIMUM_SHADE = 0.45;
/** `commitDuration` d'iOS : la face entrante est à plat AVANT que le contenu ne change. */
export const CUBE_COMMIT_DURATION_MS = 340;
/** Le retour d'un glissé annulé — l'amorti critique d'iOS (réponse 0,3 s), sans dépassement. */
export const CUBE_SETTLE_DURATION_MS = 300;
/** `timingCurve(0.25, 0.8, 0.35, 1)` d'iOS, la courbe du commit comme du retour. */
export const CUBE_EASING = [0.25, 0.8, 0.35, 1] as const;

export const CUBE_COMMIT_FRACTION = 0.5;
/** Un tremblement du doigt au relâchement n'est pas un retour en arrière. */
export const CUBE_REVERSAL_TOLERANCE = 0.04;
export const CUBE_EDGE_RESISTANCE_IN_WIDTHS = 0.22;

/** Seize valeurs `m11..m44`, vecteur ligne — l'ordre de `matrix3d()`. */
export type Matrix4 = readonly [
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
  number, number, number, number,
];

export type CubeFace = {
  readonly matrix: Matrix4;
  /** `matrix3d(...)`, prêt pour `style.transform`. */
  readonly transform: string;
  /**
   * Le navigateur n'élimine pas une face vue de DOS (`backface-visibility` ne
   * vaut que pour l'élément même, pas pour une projection qui s'inverse) : au
   * tout début d'un glissé, la face entrante est encore tournée vers
   * l'extérieur du cube. Une face de dos se masque, et sa transformation est
   * remplacée par une transformation INVERSIBLE.
   */
  readonly isFacingViewer: boolean;
  /** Une face qui se détourne de la lumière s'assombrit : c'est ce qui fait lire un VOLUME. */
  readonly shade: number;
};

const IDENTITY: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
const COLLAPSED: Matrix4 = [0.001, 0, 0, 0, 0, 0.001, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

export function faceDegrees(offsetX: number, width: number): number {
  const degrees = (offsetX / Math.max(width, 1)) * 90;
  return Math.min(Math.max(degrees, -CUBE_EDGE_DEGREES), CUBE_EDGE_DEGREES);
}

/** `CATransform3DConcat(a, b)` — `a` d'abord, puis `b`. */
export function multiply(a: Matrix4, b: Matrix4): Matrix4 {
  const c = (row: number, column: number): number =>
    [0, 1, 2, 3].reduce((sum, k) => sum + (a[row * 4 + k] ?? 0) * (b[k * 4 + column] ?? 0), 0);
  return [
    c(0, 0), c(0, 1), c(0, 2), c(0, 3),
    c(1, 0), c(1, 1), c(1, 2), c(1, 3),
    c(2, 0), c(2, 1), c(2, 2), c(2, 3),
    c(3, 0), c(3, 1), c(3, 2), c(3, 3),
  ];
}

/** Un point du plan de la face (z = 0) vu à travers sa transformation. */
export function projectPoint(point: { readonly x: number; readonly y: number }, m: Matrix4): { readonly x: number; readonly y: number } {
  const w = point.x * m[3] + point.y * m[7] + m[15];
  return {
    x: (point.x * m[0] + point.y * m[4] + m[12]) / w,
    y: (point.x * m[1] + point.y * m[5] + m[13]) / w,
  };
}

const translation = (x: number, y: number, z: number): Matrix4 => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, x, y, z, 1];

function cubeMatrix(degrees: number, width: number, height: number): Matrix4 {
  const half = Math.max(width, 1) / 2;
  const radians = (degrees * Math.PI) / 180;
  const sine = Math.sin(radians);
  const cosine = Math.cos(radians);
  const pushBack = half * (Math.abs(cosine) + Math.abs(sine) - 1);
  const rotation: Matrix4 = [cosine, 0, -sine, 0, 0, 1, 0, 0, sine, 0, cosine, 0, 0, 0, 0, 1];
  const perspective: Matrix4 = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, -1 / (half * 2 * CUBE_CAMERA_DISTANCE_IN_WIDTHS), 0, 0, 0, 1];
  return [
    translation(-half, -height / 2, half),
    rotation,
    translation(0, 0, -half - pushBack),
    perspective,
    translation(half, height / 2, 0),
  ].reduce(multiply, IDENTITY);
}

const css = (m: Matrix4): string => `matrix3d(${m.join(',')})`;

/**
 * `offsetX` : position de la face en pixels écran — `0` au repos, `±largeur`
 * pour la face voisine qui attend de l'autre côté de l'arête. Au repos, la
 * matrice est l'IDENTITÉ exacte (et non une perspective sans effet sur le
 * plan) : une story posée ne quitte pas son rendu 2D.
 */
export function cubeFace(params: { readonly offsetX: number; readonly width: number; readonly height: number }): CubeFace {
  const degrees = faceDegrees(params.offsetX, params.width);
  if (degrees === 0) return { matrix: IDENTITY, transform: css(IDENTITY), isFacingViewer: true, shade: 0 };
  const matrix = cubeMatrix(degrees, params.width, params.height);
  const left = projectPoint({ x: 0, y: params.height / 2 }, matrix);
  const right = projectPoint({ x: params.width, y: params.height / 2 }, matrix);
  const isFacingViewer = right.x > left.x;
  const shown = isFacingViewer ? matrix : COLLAPSED;
  return {
    matrix: shown,
    transform: css(shown),
    isFacingViewer,
    shade: CUBE_MAXIMUM_SHADE * Math.abs(Math.sin((degrees * Math.PI) / 180)),
  };
}

export type CubeSide = 'left' | 'right';

/**
 * Les deux faces d'un glissé : la story en cours à `offsetX`, et la voisine
 * de l'autre côté de l'arête — à DROITE quand le doigt part vers la gauche,
 * à GAUCHE sinon. `incoming: null` au repos.
 */
export function cubeFaces(params: { readonly offsetX: number; readonly width: number; readonly height: number }): {
  readonly current: CubeFace;
  readonly incoming: { readonly from: CubeSide; readonly face: CubeFace } | null;
} {
  const { offsetX, width, height } = params;
  const current = cubeFace({ offsetX, width, height });
  if (offsetX === 0) return { current, incoming: null };
  const from: CubeSide = offsetX < 0 ? 'right' : 'left';
  const incomingOffset = from === 'right' ? offsetX + width : offsetX - width;
  return { current, incoming: { from, face: cubeFace({ offsetX: incomingOffset, width, height }) } };
}

export type GroupSwipeOutcome = 'next' | 'previous' | 'cancel';

/**
 * La loi du relâchement : progressif et annulable jusqu'au bout. Le doigt qui
 * REPART vers l'origine annule, à n'importe quel point de la course ; un
 * lancer qui retraverse l'origine annule ; sans voisin, rien ne tourne.
 * `translation` et `predictedEnd` sont LOGIQUES : négatif = vers l'auteur
 * suivant (l'hôte retourne le signe en écriture de droite à gauche).
 */
export function decideGroupSwipe(params: {
  readonly translation: number;
  readonly predictedEnd: number;
  readonly width: number;
  readonly hasNext: boolean;
  readonly hasPrevious: boolean;
}): GroupSwipeOutcome {
  const width = Math.max(params.width, 1);
  const progress = -params.translation / width;
  const projected = -params.predictedEnd / width;
  const direction = progress !== 0 ? progress : projected;
  if (direction === 0) return 'cancel';
  const forward = direction > 0;
  const reach = forward ? projected : -projected;
  const momentum = forward ? projected - progress : progress - projected;
  if (reach < CUBE_COMMIT_FRACTION || momentum < -CUBE_REVERSAL_TOLERANCE) return 'cancel';
  if (forward) return params.hasNext ? 'next' : 'cancel';
  return params.hasPrevious ? 'previous' : 'cancel';
}

/** Sans voisin dans le sens du geste, la carte résiste comme un défilement en butée : rien derrière, sans tourner sur du noir. */
export function displayedTranslation(translation: number, width: number, hasNeighbor: boolean): number {
  if (hasNeighbor) return translation;
  const limit = Math.max(width, 1) * CUBE_EDGE_RESISTANCE_IN_WIDTHS;
  const resisted = (1 - 1 / ((Math.abs(translation) / limit) * 0.55 + 1)) * limit;
  return translation < 0 ? -resisted : resisted;
}

/**
 * La courbe `cubic-bezier(x1, y1, x2, y2)` en fonction du temps normalisé —
 * les animations du cube sont écrites image par image (la matrice d'un cube
 * ne s'interpole pas entre deux `matrix3d`), donc la courbe se calcule ici.
 */
export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (t: number) => number {
  const axis = (a: number, b: number) => (s: number) => 3 * (1 - s) * (1 - s) * s * a + 3 * (1 - s) * s * s * b + s * s * s;
  const x = axis(x1, x2);
  const y = axis(y1, y2);
  return (t) => {
    if (t <= 0) return 0;
    if (t >= 1) return 1;
    const solve = (low: number, high: number, depth: number): number => {
      const middle = (low + high) / 2;
      if (depth === 0) return middle;
      return x(middle) < t ? solve(middle, high, depth - 1) : solve(low, middle, depth - 1);
    };
    return Math.min(1, y(solve(0, 1, 30)));
  };
}
