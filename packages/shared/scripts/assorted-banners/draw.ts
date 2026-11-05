/**
 * La boîte à outils des BANNIÈRES ASSORTIES (#15553) : les formes du kit des cadres illustrés
 * (`smoothShape`, `taper`, `sparkle`…, sommets et tangentes relatives à la Lottie) traduites en chemins
 * SVG du gabarit de bannière (viewBox 0 0 300 100), posées par une transformation SIMPLE — translation,
 * échelle uniforme, miroirs — puis réunies en cadre (`banner`).
 *
 * Un motif se dessine UNE fois, dans le repère de son emplacement : le coin haut-gauche (`corner`), le
 * cartouche haut-centre centré sur x = 0 (`cartouche`), le montant gauche (`side`) ou la bande haute d'une
 * frise (`frieze`). Le cadre le reporte aux quatre coins, au montant droit et à la bande basse par miroir.
 * Aucun cartouche en bas : la bannière y porte niveau et compteurs.
 */
import { type P, sharpShape, smoothShape, taper, type Vertex } from '../illustrated-rings/kit.js';

export type Shape = { readonly c: boolean; readonly v: readonly P[]; readonly i: readonly P[]; readonly o: readonly P[] };

export type Place = { readonly at: P; readonly k?: number; readonly flipX?: boolean; readonly flipY?: boolean };

const n2 = (value: number): string => String(Math.round(value * 100) / 100);
const pt = ([x, y]: P): string => `${n2(x)} ${n2(y)}`;

const mapper = ({ at, k = 1, flipX = false, flipY = false }: Place) => {
  const sx = flipX ? -k : k;
  const sy = flipY ? -k : k;
  return {
    point: ([x, y]: P): P => [at[0] + sx * x, at[1] + sy * y],
    vector: ([x, y]: P): P => [sx * x, sy * y],
  };
};

const isZero = ([x, y]: P): boolean => x === 0 && y === 0;

/** Une forme du kit en chemin SVG : `C` là où une tangente existe, `L` sinon. */
export function shapeD(shape: Shape, place: Place): string {
  const { point, vector } = mapper(place);
  const v = shape.v.map(point);
  const o = shape.o.map(vector);
  const i = shape.i.map(vector);
  const segment = (from: number, to: number): string => {
    if (isZero(o[from]!) && isZero(i[to]!)) return `L${pt(v[to]!)}`;
    const c1: P = [v[from]![0] + o[from]![0], v[from]![1] + o[from]![1]];
    const c2: P = [v[to]![0] + i[to]![0], v[to]![1] + i[to]![1]];
    return `C${pt(c1)} ${pt(c2)} ${pt(v[to]!)}`;
  };
  const body = v.slice(1).map((_, index) => segment(index, index + 1)).join('');
  const close = shape.c ? `${segment(v.length - 1, 0)}Z` : '';
  return `M${pt(v[0]!)}${body}${close}`;
}

// ── Les formes ──────────────────────────────────────────────────────────

const KAPPA = 0.5523;

export const circle = (r: number, [x, y]: P): Shape => {
  const k = r * KAPPA;
  return { c: true, v: [[x, y - r], [x + r, y], [x, y + r], [x - r, y]], o: [[k, 0], [0, k], [-k, 0], [0, -k]], i: [[-k, 0], [0, -k], [k, 0], [0, k]] };
};

export const ellipseShape = ([rx, ry]: P, [x, y]: P): Shape => {
  const kx = rx * KAPPA;
  const ky = ry * KAPPA;
  return { c: true, v: [[x, y - ry], [x + rx, y], [x, y + ry], [x - rx, y]], o: [[kx, 0], [0, ky], [-kx, 0], [0, -ky]], i: [[-kx, 0], [0, -ky], [kx, 0], [0, ky]] };
};

export const poly = (points: readonly P[]): Shape => sharpShape(points);
export const line = (points: readonly P[]): Shape => sharpShape(points, false);
export const smooth = (points: readonly Vertex[]): Shape => smoothShape(points);
export const curve = (points: readonly Vertex[]): Shape => smoothShape(points, false);
export const rect = ([x, y]: P, [w, h]: P): Shape => poly([[x, y], [x + w, y], [x + w, y + h], [x, y + h]]);

/** Une feuille en amande de `from` à `to`, bombée de `bulge`. */
export const leaf = (from: P, to: P, bulge: number): Shape => {
  const mid: P = [(from[0] + to[0]) / 2, (from[1] + to[1]) / 2];
  const dx = to[0] - from[0];
  const dy = to[1] - from[1];
  const length = Math.hypot(dx, dy) || 1;
  const nx = (-dy / length) * bulge;
  const ny = (dx / length) * bulge;
  return smooth([[from[0], from[1], 'corner'], [mid[0] + nx, mid[1] + ny], [to[0], to[1], 'corner'], [mid[0] - nx, mid[1] - ny]]);
};

/** Une étoile à `points` branches de rayon `r`, creusée à `waist`. */
export const star = ([x, y]: P, r: number, points = 5, waist = 0.45, start = -90): Shape =>
  poly(Array.from({ length: points * 2 }, (_, index): P => {
    const radius = index % 2 === 0 ? r : r * waist;
    const angle = ((start + (index * 180) / points) * Math.PI) / 180;
    return [x + radius * Math.cos(angle), y + radius * Math.sin(angle)];
  }));

export const diamond = ([x, y]: P, rx: number, ry = rx): Shape => poly([[x, y - ry], [x + rx, y], [x, y + ry], [x - rx, y]]);

/** Un point à `r` de `center`, à `degrees` (0 = à droite, 90 = en bas). */
export const at = (r: number, degrees: number, [x, y]: P): P => [x + r * Math.cos((degrees * Math.PI) / 180), y + r * Math.sin((degrees * Math.PI) / 180)];

/** `count` angles réguliers de `from` à `to` inclus. */
export const spread = (count: number, from: number, to: number): number[] =>
  Array.from({ length: count }, (_, index) => (count === 1 ? from : from + ((to - from) * index) / (count - 1)));

// ── Le cadre ────────────────────────────────────────────────────────────

export type Mark = {
  readonly shapes: readonly Shape[];
  readonly color: number;
  readonly opacity?: number;
  readonly width?: number;
  readonly gradient?: number;
  readonly evenOdd?: boolean;
  /** Le groupe des mouvements ; aux coins, `corner` donne un groupe PAR coin (`c0` haut-gauche, `c1` haut-droit, `c2` bas-droit, `c3` bas-gauche). */
  readonly group?: string;
};

type FramePath = { readonly d: string; readonly color: number; readonly opacity: number; readonly width?: number; readonly gradient?: number; readonly fillRule?: 'evenodd'; readonly group?: string };
type Piece = { readonly anchor: 'start' | 'center' | 'end'; readonly paths: readonly FramePath[] };

export type Motion = {
  readonly kind: 'rotate' | 'pulse' | 'sweep' | 'twinkle' | 'skew';
  readonly targets: readonly string[];
  readonly duration: number;
  readonly delay?: number;
  readonly stagger?: number;
  readonly direction?: 'normal' | 'reverse' | 'alternate';
  readonly amplitude?: number;
  readonly origin?: 'frame' | 'self' | 'top' | 'bottom';
};

export type Filet = { readonly inset: number; readonly width: number; readonly color: number; readonly opacity: number; readonly gradient?: number };

export type BannerSpec = {
  readonly key: string;
  readonly palette: readonly string[];
  readonly gradients?: readonly unknown[];
  readonly border: { readonly width: number; readonly color: number; readonly opacity: number; readonly gradient?: number; readonly filets?: readonly Filet[] };
  readonly corner: { readonly size: number; readonly marks: readonly Mark[] };
  readonly cartouche?: { readonly width: number; readonly depth: number; readonly marks: readonly Mark[] };
  readonly side?: readonly Mark[];
  readonly frieze?: { readonly module: number; readonly from: number; readonly to?: number; readonly fit?: 'repeat' | 'justify'; readonly marks: readonly Mark[]; readonly bottom?: boolean };
  readonly motion?: readonly Motion[];
};

const W = 300;
const H = 100;

const CORNERS = [
  { anchor: 'start', place: { at: [0, 0] }, group: 'c0' },
  { anchor: 'end', place: { at: [W, 0], flipX: true }, group: 'c1' },
  { anchor: 'end', place: { at: [W, H], flipX: true, flipY: true }, group: 'c2' },
  { anchor: 'start', place: { at: [0, H], flipY: true }, group: 'c3' },
] as const;

const drawn = (mark: Mark, places: readonly Place[], group?: string): FramePath => {
  const resolved = mark.group === 'corner' ? group : mark.group;
  return {
    d: places.flatMap((place) => mark.shapes.map((shape) => shapeD(shape, place))).join(''),
    color: mark.color,
    opacity: mark.opacity ?? 1,
    ...(mark.width === undefined ? {} : { width: mark.width }),
    ...(mark.gradient === undefined ? {} : { gradient: mark.gradient }),
    ...(mark.evenOdd ? { fillRule: 'evenodd' as const } : {}),
    ...(resolved === undefined ? {} : { group: resolved }),
  };
};

/** Les pièces d'un même ancrage réunies, dans l'ordre : montants, coins, cartouche. */
const merge = (pieces: readonly Piece[]): readonly Piece[] =>
  (['start', 'center', 'end'] as const).flatMap((anchor) => {
    const paths = pieces.filter((piece) => piece.anchor === anchor).flatMap((piece) => piece.paths);
    return paths.length === 0 ? [] : [{ anchor, paths }];
  });

/** Le cadre : un motif dessiné une fois par emplacement, reporté par miroir. */
export function banner(spec: BannerSpec) {
  const sides: readonly Piece[] = (spec.side ?? []).length === 0
    ? []
    : [
        { anchor: 'start', paths: (spec.side ?? []).map((mark) => drawn(mark, [{ at: [0, 0] }])) },
        { anchor: 'end', paths: (spec.side ?? []).map((mark) => drawn(mark, [{ at: [W, 0], flipX: true }])) },
      ];
  const corners: readonly Piece[] = CORNERS.map(({ anchor, place, group }) => ({ anchor, paths: spec.corner.marks.map((mark) => drawn(mark, [place as Place], group)) }));
  const cartouche: readonly Piece[] = spec.cartouche === undefined ? [] : [{ anchor: 'center', paths: spec.cartouche.marks.map((mark) => drawn(mark, [{ at: [W / 2, 0] }])) }];
  const frieze = spec.frieze;
  return {
    key: spec.key,
    viewBox: [0, 0, W, H] as const,
    palette: spec.palette,
    ...(spec.gradients === undefined ? {} : { gradients: spec.gradients }),
    border: { width: spec.border.width, color: spec.border.color, ...(spec.border.gradient === undefined ? {} : { gradient: spec.border.gradient }), opacity: spec.border.opacity, filets: spec.border.filets ?? [] },
    reach: {
      corner: spec.corner.size,
      ...(spec.cartouche === undefined ? {} : { cartouche: { width: spec.cartouche.width, depth: spec.cartouche.depth, edge: 'top' as const } }),
    },
    pieces: merge([...sides, ...corners, ...cartouche]),
    ...(frieze === undefined
      ? {}
      : {
          friezes: [
            {
              module: frieze.module,
              from: frieze.from,
              to: frieze.to ?? frieze.from,
              fit: frieze.fit ?? 'justify',
              paths: frieze.marks.map((mark) => drawn(mark, [{ at: [frieze.from, 0] }, ...(frieze.bottom === false ? [] : [{ at: [frieze.from, H], flipY: true }])])),
            },
          ],
        }),
    ...(spec.motion === undefined || spec.motion.length === 0 ? {} : { motion: spec.motion }),
  };
}

export type AssortedBanner = ReturnType<typeof banner>;

/** Les quatre coins, dans l'ordre d'un scintillement qui fait le tour. */
export const CORNER_GROUPS = ['c0', 'c1', 'c2', 'c3'] as const;

export const twinkleCorners = (duration: number, amplitude = 0.6): Motion => ({ kind: 'twinkle', targets: [...CORNER_GROUPS], duration, stagger: duration / 4, amplitude });

export const mirrorShape = (shape: Shape): Shape => ({
  ...shape,
  v: shape.v.map(([x, y]): P => [-x, y]),
  i: shape.i.map(([x, y]): P => [-x, y]),
  o: shape.o.map(([x, y]): P => [-x, y]),
});

/** Une aile qui s'ouvre depuis `root`, plumes en éventail de `from` à `to` degrés. */
export const wing = (root: P, size: number, from: number, to: number, count: number): Shape[] =>
  spread(count, from, to).map((degrees, index) => {
    const length = size * (0.62 + 0.38 * Math.sin(((index + 1) / (count + 1)) * Math.PI));
    const tip = at(length, degrees, root);
    const mid = at(length * 0.5, degrees - 4, root);
    return taper([root, mid, tip], [length * 0.2, length * 0.24, 0.2]);
  });

/** Une pièce effilée le long d'une courbe quadratique de `from` à `to`, bombée vers `control`. */
export const tapered = (from: P, control: P, to: P, widths: readonly [number, number, number]): Shape => taper([from, control, to], widths);
