/**
 * La boîte à outils des CADRES ILLUSTRÉS (#13960) : des films Lottie composés en données pures —
 * chemins lissés, dégradés à arrêts d'opacité, ombres portées, groupes animés — et l'anneau fixe
 * de repli (`stroke` + `ornament`, viewBox 0 0 100 100).
 *
 * Repère d'un film : un carré de `CANVAS` unités centré sur l'avatar (`C`, `C`). Le contour y
 * occupe la boîte centrale de 100 unités (débordement `REACH` = 1,4) ; l'avatar est le cercle de
 * rayon `AVATAR` = 42, comme dans le viewBox du contour.
 *
 * Ordre de peinture : on écrit du FOND vers l'AVANT ; Lottie peignant le premier élément au-dessus,
 * `art()` et `layers` retournent les listes au moment d'émettre.
 */

export const FPS = 30;
export const REACH = 1.4;
export const CANVAS = 100 * REACH;
export const C = CANVAS / 2;
export const AVATAR = 42;

export type P = readonly [number, number];
type Vec = readonly number[];
export type Key = { readonly t: number; readonly s: Vec; readonly h?: 1 };
export type Profile = readonly (readonly [number, Vec])[];
type Shape = { readonly c: boolean; readonly v: readonly P[]; readonly i: readonly P[]; readonly o: readonly P[] };

export const round = (value: number): number => Math.round(value * 10) / 10;
const roundPoint = (point: P): P => [round(point[0]), round(point[1])];
const roundShape = (shape: Shape): Shape => ({ c: shape.c, v: shape.v.map(roundPoint), i: shape.i.map(roundPoint), o: shape.o.map(roundPoint) });

export const still = (k: number | Vec) => ({ a: 0, k: typeof k === 'number' ? round(k) : k.map(round) });
export const LINEAR = { i: { x: [1], y: [1] }, o: { x: [0], y: [0] } };
export const SOFT = { i: { x: [0.45], y: [1] }, o: { x: [0.55], y: [0] } };

export const animated = (keys: readonly Key[], ease: typeof LINEAR = SOFT) => ({
  a: 1,
  k: keys.map((key, index) =>
    index === keys.length - 1 ? { t: round(key.t), s: key.s.map(round) } : { t: round(key.t), s: key.s.map(round), ...(key.h ? { h: 1 } : ease) },
  ),
});

/** Des clés `[seconde, valeur]` sur un film de `frames` images. */
export const keys = (pairs: readonly (readonly [number, number | Vec])[]): Key[] =>
  pairs.map(([second, value]) => ({ t: second * FPS, s: typeof value === 'number' ? [value] : value }));

const lerp = (from: Vec, to: Vec, at: number): Vec => from.map((value, index) => value + ((to[index] ?? value) - value) * at);

const sample = (profile: Profile, u: number): Vec => {
  const next = profile.findIndex(([at]) => at >= u);
  if (next <= 0) return profile[Math.max(next, 0)]![1];
  const [fromAt, from] = profile[next - 1]!;
  const [toAt, to] = profile[next]!;
  return lerp(from, to, (u - fromAt) / (toAt - fromAt));
};

/** Un mouvement de cycle (`u` de 0 à 1) décalé de `phase` : le saut de fin de cycle se tient une image, là où le profil le cache. */
export function cycle(profile: Profile, phase: number, frames: number): Key[] {
  const at = (u: number) => ((u - phase + 1) % 1) * frames;
  const start: Key = { t: 0, s: sample(profile, phase) };
  if (phase === 0) return profile.map(([u, s]) => ({ t: u * frames, s }));
  const wrap = (1 - phase) * frames;
  const before = profile.filter(([u]) => u > phase).map(([u, s]): Key => ({ t: at(u), s }));
  const after = profile.filter(([u]) => u < phase).map(([u, s]): Key => ({ t: u === 0 ? wrap + 1 : at(u), s }));
  const held = before.length === 0 ? [] : [{ ...before[before.length - 1]!, t: wrap, h: 1 as const }];
  return [start, ...before.slice(0, -1), ...held, ...after, { t: frames, s: sample(profile, phase) }].filter(
    (key, index, list) => index === 0 || key.t > list[index - 1]!.t,
  );
}

// ── Géométrie ───────────────────────────────────────────────────────────

export const rad = (degrees: number): number => (degrees * Math.PI) / 180;
/** Un point à `r` du centre, à l'angle `degrees` (0 = à droite, 90 = en bas). */
export const polar = (r: number, degrees: number, center: P = [C, C]): P => [center[0] + r * Math.cos(rad(degrees)), center[1] + r * Math.sin(rad(degrees))];
export const add = (a: P, b: P): P => [a[0] + b[0], a[1] + b[1]];
export const sub = (a: P, b: P): P => [a[0] - b[0], a[1] - b[1]];
export const scale = (a: P, k: number): P => [a[0] * k, a[1] * k];
export const mix = (a: P, b: P, at: number): P => [a[0] + (b[0] - a[0]) * at, a[1] + (b[1] - a[1]) * at];
export const length = (a: P): number => Math.hypot(a[0], a[1]);
export const unit = (a: P): P => scale(a, 1 / (length(a) || 1));
export const normal = (a: P): P => [-a[1], a[0]];
export const mirror = (point: P): P => [CANVAS - point[0], point[1]];

/** Un sommet ; `corner` le garde anguleux. */
export type Vertex = P | readonly [number, number, 'corner'];

/** Un chemin lissé (Catmull-Rom) par ses sommets ; un sommet `corner` reste vif. */
export function smoothShape(points: readonly Vertex[], closed = true, tension = 1 / 6): Shape {
  const n = points.length;
  const at = (index: number): P => {
    const point = points[closed ? (index + n) % n : Math.max(0, Math.min(n - 1, index))]!;
    return [point[0], point[1]];
  };
  const tangents = points.map((point, index) => {
    if (point.length === 3 || (!closed && (index === 0 || index === n - 1))) return [0, 0] as P;
    return scale(sub(at(index + 1), at(index - 1)), tension);
  });
  return roundShape({ c: closed, v: points.map((_, index) => at(index)), i: tangents.map((t) => scale(t, -1)), o: tangents });
}

export const sharpShape = (points: readonly P[], closed = true): Shape =>
  roundShape({ c: closed, v: points, i: points.map((): P => [0, 0]), o: points.map((): P => [0, 0]) });

export const path = (shape: Shape) => ({ ty: 'sh', ks: { a: 0, k: shape } });
export const pathAnimated = (frames: readonly (readonly [number, Shape])[], ease = SOFT) => ({
  ty: 'sh',
  ks: {
    a: 1,
    k: frames.map(([second, shape], index) =>
      index === frames.length - 1 ? { t: round(second * FPS), s: [roundShape(shape)] } : { t: round(second * FPS), s: [roundShape(shape)], ...ease },
    ),
  },
});
export const ellipse = (size: P, at: P = [0, 0]) => ({ ty: 'el', p: still(at), s: still(size), d: 1 });
export const circle = (r: number, at: P = [C, C]) => ellipse([r * 2, r * 2], at);

/** Une pièce effilée le long d'une ligne médiane (corne, griffe, plume, rayon) : largeur `widths[k]` au point `spine[k]`. */
export function taper(spine: readonly P[], widths: readonly number[]): Shape {
  const sides = spine.map((point, index) => {
    const direction = unit(sub(spine[Math.min(index + 1, spine.length - 1)]!, spine[Math.max(index - 1, 0)]!));
    return [add(point, scale(normal(direction), widths[index]! / 2)), add(point, scale(normal(direction), -widths[index]! / 2))] as const;
  });
  const left = sides.map(([a]) => a);
  const right = sides.map(([, b]) => b).reverse();
  return smoothShape([...left.slice(0, -1), [spine[spine.length - 1]![0], spine[spine.length - 1]![1], 'corner'], ...right.slice(1)]);
}

/** Une courbe quadratique échantillonnée en `count` points. */
export const quad = (from: P, control: P, to: P, count = 6): P[] =>
  Array.from({ length: count }, (_, index) => {
    const t = index / (count - 1);
    return add(add(scale(from, (1 - t) ** 2), scale(control, 2 * t * (1 - t))), scale(to, t * t));
  });

// ── Peinture ────────────────────────────────────────────────────────────

export const rgba = (hex: string): number[] => [0, 2, 4].map((at) => Math.round((parseInt(hex.slice(1 + at, 3 + at), 16) / 255) * 1000) / 1000).concat(1);
const rgb = (hex: string): number[] => rgba(hex).slice(0, 3);

type Animated = ReturnType<typeof animated>;
const value = (input: number | Animated) => (typeof input === 'number' ? still(input) : input);

export const fill = (hex: string, opacity: number | Animated = 100) => ({ ty: 'fl', c: still(rgba(hex)), o: value(opacity), r: 1 });
export const fillAnimated = (colors: readonly (readonly [number, string])[], opacity: number | Animated = 100) => ({
  ty: 'fl',
  c: animated(colors.map(([second, hex]) => ({ t: second * FPS, s: rgba(hex) }))),
  o: value(opacity),
  r: 1,
});
export const evenOdd = (hex: string, opacity = 100) => ({ ...fill(hex, opacity), r: 2 });

export const stroke = (hex: string, width: number, opacity: number | Animated = 100, dash?: readonly [number, number]) => ({
  ty: 'st',
  c: still(rgba(hex)),
  o: value(opacity),
  w: still(width),
  lc: 2,
  lj: 2,
  ml: 4,
  ...(dash === undefined ? {} : { d: [{ n: 'd', nm: 'dash', v: still(dash[0]) }, { n: 'g', nm: 'gap', v: still(dash[1]) }] }),
});

/** Arrêts `[position, couleur]` et, facultatifs, arrêts d'opacité `[position, 0..1]`. */
export type Stops = readonly (readonly [number, string])[];
export type Alphas = readonly (readonly [number, number])[];

function gradientData(stops: Stops, alphas?: Alphas) {
  const colors = stops.flatMap(([at, hex]) => [at, ...rgb(hex)]);
  const opacity = alphas === undefined ? [] : alphas.flatMap(([at, alpha]) => [at, alpha]);
  return { p: stops.length, k: { a: 0, k: [...colors, ...opacity].map((n) => Math.round(n * 1000) / 1000) } };
}

export const linear = (stops: Stops, from: P, to: P, opts: { readonly alphas?: Alphas; readonly opacity?: number | Animated } = {}) => ({
  ty: 'gf',
  o: value(opts.opacity ?? 100),
  r: 1,
  s: still(from),
  e: still(to),
  t: 1,
  g: gradientData(stops, opts.alphas),
});

export const radial = (stops: Stops, center: P, radius: number, opts: { readonly alphas?: Alphas; readonly opacity?: number | Animated; readonly evenOdd?: boolean } = {}) => ({
  ty: 'gf',
  o: value(opts.opacity ?? 100),
  r: opts.evenOdd ? 2 : 1,
  s: still(center),
  e: still([center[0] + radius, center[1]]),
  t: 2,
  h: still(0),
  a: still(0),
  g: gradientData(stops, opts.alphas),
});

export const transform = (overrides: Record<string, unknown> = {}) => ({
  ty: 'tr',
  p: still([0, 0]),
  a: still([0, 0]),
  s: still([100, 100]),
  r: still(0),
  o: still(100),
  sk: still(0),
  sa: still(0),
  ...overrides,
});

/** Une pièce : ses formes, ses peintures du FOND vers l'AVANT (un trait sur un remplissage s'écrit après lui), sa transformation. */
export const art = (shapes: readonly unknown[], paints: readonly unknown[], tr: Record<string, unknown> = {}) => ({
  ty: 'gr',
  it: [...shapes, ...[...paints].reverse(), transform(tr)],
});

/** Un ensemble de pièces, du FOND vers l'AVANT. */
export const stack = (children: readonly unknown[], tr: Record<string, unknown> = {}) => ({ ty: 'gr', it: [...[...children].reverse(), transform(tr)] });

/** Pivoter autour de `pivot` (l'ancre et la position confondues). */
export const around = (pivot: P, extra: Record<string, unknown> = {}) => ({ a: still(pivot), p: still(pivot), ...extra });

/** L'ombre portée d'une pièce : sa forme en noir, décalée. */
export const shadow = (shapes: readonly unknown[], offset: P = [0.8, 1.8], opacity = 34, hex = '#000000') => art(shapes, [fill(hex, opacity)], { p: still(offset) });

/** Une lueur : un disque au dégradé radial qui s'éteint au bord. */
export const glow = (center: P, radius: number, hex: string, peak = 0.8, opacity: number | Animated = 100, inner = 0) =>
  art([ellipse([radius * 2, radius * 2], center)], [
    radial([[0, hex], [1, hex]], center, radius, { alphas: inner > 0 ? [[0, 0], [inner, peak], [1, 0]] : [[0, peak], [1, 0]], opacity }),
  ]);

/** Une étoile à quatre branches (éclat). */
export const sparkle = (center: P, size: number): Shape => {
  const [x, y] = center;
  const w = size * 0.18;
  return sharpShape([
    [x, y - size],
    [x + w, y - w],
    [x + size, y],
    [x + w, y + w],
    [x, y + size],
    [x - w, y + w],
    [x - size, y],
    [x - w, y - w],
  ]);
};

// ── Le film ─────────────────────────────────────────────────────────────

export const layer = (shapes: readonly unknown[], frames: number) => ({
  ddd: 0,
  ind: 1,
  ty: 4,
  sr: 1,
  ks: { o: still(100), r: still(0), p: still([0, 0, 0]), a: still([0, 0, 0]), s: still([100, 100, 100]) },
  ao: 0,
  shapes: [...shapes].reverse(),
  ip: 0,
  op: frames,
  st: 0,
  bm: 0,
});

/** Un film carré de `CANVAS` unités ; `pieces` du FOND vers l'AVANT, en un seul calque. */
export const film = (name: string, seconds: number, pieces: readonly unknown[]) => {
  const frames = seconds * FPS;
  return { v: '5.7.0', fr: FPS, ip: 0, op: frames, w: CANVAS, h: CANVAS, nm: name, ddd: 0, assets: [], layers: [layer(pieces, frames)], markers: [] };
};

// ── L'anneau fixe (viewBox 0 0 100 100) ─────────────────────────────────

export const RING_CENTER = 50;
const n2 = (value: number): string => String(Math.round(value * 100) / 100);
export const ringCircle = (r: number): string =>
  `M${n2(50 - r)} 50A${n2(r)} ${n2(r)} 0 1 0 ${n2(50 + r)} 50 ${n2(r)} ${n2(r)} 0 1 0 ${n2(50 - r)} 50Z`;
const ringPoint = (r: number, degrees: number): string => {
  const [x, y] = polar(r, degrees, [50, 50]);
  return `${n2(x)} ${n2(y)}`;
};
/** Des traits radiaux de `r1` à `r2`, `count` fois autour (premier à `start` degrés). */
export const ringTicks = (count: number, r1: number, r2: number, start = -90): string =>
  Array.from({ length: count }, (_, index) => start + (index * 360) / count)
    .map((degrees) => `M${ringPoint(r1, degrees)}L${ringPoint(r2, degrees)}`)
    .join('');
/** Un polygone fermé dans le viewBox du contour. */
export const ringPolygon = (points: readonly P[]): string => `M${points.map(([x, y]) => `${n2(x)} ${n2(y)}`).join('L')}Z`;
/** Un arc de `from` à `to` degrés, rayon `r`. */
export const ringArc = (r: number, from: number, to: number): string =>
  `M${ringPoint(r, from)}A${n2(r)} ${n2(r)} 0 ${Math.abs(to - from) > 180 ? 1 : 0} 1 ${ringPoint(r, to)}`;
/** Des losanges posés sur le cercle `r`, `count` fois autour. */
export const ringDiamonds = (count: number, r: number, size: number, start = -90): string =>
  Array.from({ length: count }, (_, index) => start + (index * 360) / count)
    .map((degrees) => ringPolygon([polar(r - size, degrees, [50, 50]), polar(r, degrees - (size * 40) / r, [50, 50]), polar(r + size, degrees, [50, 50]), polar(r, degrees + (size * 40) / r, [50, 50])]))
    .join('');

export type RingStill = {
  readonly stroke: { readonly style: 'none'; readonly width: number; readonly colors: readonly string[] };
  readonly ornament: { readonly paths: readonly { readonly d: string; readonly color: number; readonly opacity: number; readonly width?: number; readonly gradient?: number }[] };
  readonly gradients?: readonly unknown[];
};

/** Le dégradé vertical d'un anneau fixe : `stops` = `[index de couleur, position]`. */
export const ringGradient = (stops: readonly (readonly [number, number])[], vertical = true) => ({
  kind: 'linear',
  x1: 0,
  y1: 0,
  x2: vertical ? 0 : 1,
  y2: vertical ? 1 : 0,
  stops: stops.map(([color, at]) => ({ color, at })),
});

/** Une oscillation d'amplitude `amplitude` autour de `rest`, de période `period` secondes, répétée sur `seconds` (multiple de la période). */
export const oscillate = (amplitude: number, period: number, seconds: number, rest = 0): Key[] =>
  Array.from({ length: Math.round(seconds / period) * 4 + 1 }, (_, index) => ({
    t: (index * period * FPS) / 4,
    s: [rest + [0, amplitude, 0, -amplitude][index % 4]!],
  }));
