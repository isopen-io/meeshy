import type { CSSProperties } from 'react';

/**
 * K54 · MeeshyMapTrace — LA LOI ET LA RECETTE (#18877, #18857).
 *
 * Un chemin entre des points d'écran déjà projetés par l'hôte, à la teinte donnée, sur un
 * liseré sombre qui le garde lisible sur toute carte. Le tracé relie, il ne sait pas par où
 * passer : calculer un itinéraire, une distance ou une durée, projeter des coordonnées, parler
 * à un fournisseur de carte — tout cela est à l'hôte, qui remet un texte déjà composé.
 */
export type MeeshyMapTraceKind = 'route' | 'link' | 'history';
export type MeeshyMapTraceWeight = 'regular' | 'large';
export type MeeshyMapTracePoint = { readonly x: number; readonly y: number };
export type MeeshyMapTraceStop = { readonly id: string; readonly pointIndex: number; readonly value: string; readonly title: string };

export const MEESHY_MAP_TRACE_MEASURE = {
  dot: { regular: 4, large: 4.5 },
  dotEvery: { regular: 10, large: 11 },
  casing: { regular: 7, large: 8 },
  link: 2.5,
  history: 7,
  halo: 16,
  casingOpacity: 0.55,
  casingOpacityLight: 0.7,
  staleOpacity: 0.6,
  minLength: 24,
  minMidLabelLength: 96,
  flowMs: 1400,
  midGap: 12,
  upcomingOpacity: 0.3,
  headSize: 14,
  nodeSize: 12,
} as const;

const SAMPLES = 16;
const round = (value: number): number => Math.round(value * 100) / 100;

const distance = (a: MeeshyMapTracePoint, b: MeeshyMapTracePoint): number => Math.hypot(b.x - a.x, b.y - a.y);

export type MeeshyMapTracePath = {
  readonly isDrawable: boolean;
  readonly d: string;
  readonly length: number;
  readonly fractions: readonly number[];
  readonly midpoint: MeeshyMapTracePoint;
  readonly at: (fraction: number) => MeeshyMapTracePoint;
};

const NOTHING: MeeshyMapTracePath = { isDrawable: false, d: '', length: 0, fractions: [], midpoint: { x: 0, y: 0 }, at: () => ({ x: 0, y: 0 }) };

type Segment = { readonly start: MeeshyMapTracePoint; readonly c1: MeeshyMapTracePoint; readonly c2: MeeshyMapTracePoint; readonly end: MeeshyMapTracePoint };

const bezier = (segment: Segment, t: number): MeeshyMapTracePoint => {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return {
    x: a * segment.start.x + b * segment.c1.x + c * segment.c2.x + d * segment.end.x,
    y: a * segment.start.y + b * segment.c1.y + c * segment.c2.y + d * segment.end.y,
  };
};

/** Un chemin lissé passant par chaque point (Catmull-Rom converti en courbes de Bézier cubiques). */
const smoothSegments = (points: readonly MeeshyMapTracePoint[]): readonly Segment[] =>
  points.slice(0, -1).map((start, index) => {
    const before = points[Math.max(index - 1, 0)] as MeeshyMapTracePoint;
    const end = points[index + 1] as MeeshyMapTracePoint;
    const after = points[Math.min(index + 2, points.length - 1)] as MeeshyMapTracePoint;
    return {
      start,
      c1: { x: start.x + (end.x - before.x) / 6, y: start.y + (end.y - before.y) / 6 },
      c2: { x: end.x - (after.x - start.x) / 6, y: end.y - (after.y - start.y) / 6 },
      end,
    };
  });

const straightSegments = (points: readonly MeeshyMapTracePoint[]): readonly Segment[] =>
  points.slice(0, -1).map((start, index) => ({ start, c1: start, c2: points[index + 1] as MeeshyMapTracePoint, end: points[index + 1] as MeeshyMapTracePoint }));

/** La loi pure du chemin : l'attribut `d`, la longueur, la fraction de chaque point, le milieu et la position à une fraction. Sous deux points, ou 24 de longueur à l'écran, rien n'est dessiné. */
export const meeshyMapTracePath = ({ points, kind, smoothing = true }: { readonly points: readonly MeeshyMapTracePoint[]; readonly kind: MeeshyMapTraceKind; readonly smoothing?: boolean | undefined }): MeeshyMapTracePath => {
  const usable = (kind === 'link' ? [points[0], points[points.length - 1]] : points).filter((point): point is MeeshyMapTracePoint => point !== undefined && Number.isFinite(point.x) && Number.isFinite(point.y));
  if (usable.length < 2) return NOTHING;
  const curved = smoothing && kind !== 'link' && usable.length > 2;
  const segments = curved ? smoothSegments(usable) : straightSegments(usable);
  const samples: readonly { readonly point: MeeshyMapTracePoint; readonly at: number }[] = segments.reduce<readonly { readonly point: MeeshyMapTracePoint; readonly at: number }[]>(
    (acc, segment, index) =>
      Array.from({ length: SAMPLES }, (_, step) => bezier(segment, (step + 1) / SAMPLES)).reduce((inner, point) => {
        const last = inner[inner.length - 1] as { readonly point: MeeshyMapTracePoint; readonly at: number };
        return [...inner, { point, at: last.at + distance(last.point, point) }];
      }, index === 0 ? [{ point: segment.start, at: 0 }] : acc),
    [],
  );
  const length = samples[samples.length - 1]?.at ?? 0;
  if (length < MEESHY_MAP_TRACE_MEASURE.minLength) return NOTHING;
  const at = (fraction: number): MeeshyMapTracePoint => {
    const target = Math.min(Math.max(fraction, 0), 1) * length;
    const next = samples.findIndex((sample) => sample.at >= target);
    if (next <= 0) return samples[0]?.point ?? { x: 0, y: 0 };
    const a = samples[next - 1] as { readonly point: MeeshyMapTracePoint; readonly at: number };
    const b = samples[next] as { readonly point: MeeshyMapTracePoint; readonly at: number };
    const span = b.at - a.at;
    const t = span === 0 ? 0 : (target - a.at) / span;
    return { x: a.point.x + (b.point.x - a.point.x) * t, y: a.point.y + (b.point.y - a.point.y) * t };
  };
  const d = curved
    ? `M${round(usable[0]?.x ?? 0)} ${round(usable[0]?.y ?? 0)}${segments.map((s) => `C${round(s.c1.x)} ${round(s.c1.y)} ${round(s.c2.x)} ${round(s.c2.y)} ${round(s.end.x)} ${round(s.end.y)}`).join('')}`
    : `M${round(usable[0]?.x ?? 0)} ${round(usable[0]?.y ?? 0)}${usable.slice(1).map((p) => `L${round(p.x)} ${round(p.y)}`).join('')}`;
  const fractions = usable.map((_, index) => (index === 0 ? 0 : (samples[index * SAMPLES]?.at ?? length) / length));
  const mid = at(0.5);
  return { isDrawable: true, d, length, fractions, midpoint: { x: round(mid.x), y: round(mid.y) }, at };
};

export type MeeshyMapTraceRecipeInput = {
  readonly kind: MeeshyMapTraceKind;
  readonly weight?: MeeshyMapTraceWeight | undefined;
  readonly progress?: number | null | undefined;
  readonly isStale?: boolean | undefined;
  readonly isAnimated?: boolean | undefined;
  readonly onLightMap?: boolean | undefined;
  readonly reduceMotion?: boolean | undefined;
  readonly length?: number | undefined;
};

export type MeeshyMapTraceRecipe = {
  readonly kind: MeeshyMapTraceKind;
  readonly dot: number;
  readonly dotEvery: number;
  readonly stroke: number;
  readonly casing: number;
  readonly halo: number;
  readonly casingOpacity: number;
  readonly opacity: number;
  readonly flows: boolean;
  readonly progress: number | null;
  readonly hasHead: boolean;
  readonly showsMidLabel: boolean;
  readonly flowMs: number;
};

export const meeshyMapTraceRecipe = (input: MeeshyMapTraceRecipeInput): MeeshyMapTraceRecipe => {
  const weight = input.weight ?? 'regular';
  const m = MEESHY_MAP_TRACE_MEASURE;
  const progress = input.progress === undefined || input.progress === null || !Number.isFinite(input.progress) ? null : Math.min(Math.max(input.progress, 0), 1);
  return {
    kind: input.kind,
    dot: m.dot[weight],
    dotEvery: m.dotEvery[weight],
    stroke: input.kind === 'link' ? m.link : input.kind === 'history' ? m.history : m.dot[weight],
    casing: m.casing[weight],
    halo: m.halo,
    casingOpacity: input.onLightMap === true ? m.casingOpacityLight : m.casingOpacity,
    opacity: input.isStale === true ? m.staleOpacity : 1,
    flows: input.kind === 'route' && input.isStale !== true && input.isAnimated !== false && input.reduceMotion !== true,
    progress,
    hasHead: progress !== null,
    showsMidLabel: input.length === undefined || input.length >= m.minMidLabelLength,
    flowMs: m.flowMs,
  };
};

const REM = 16;
const rem = (px: number): string => `${px / REM}rem`;

export const meeshyMapTraceStyle = (recipe: MeeshyMapTraceRecipe, tint: string | undefined): CSSProperties =>
  ({
    '--kit-trace-opacity': recipe.opacity,
    '--kit-trace-casing-opacity': recipe.casingOpacity,
    '--kit-trace-flow': `${recipe.flowMs}ms`,
    '--kit-trace-every': `${recipe.dotEvery}px`,
    '--kit-trace-head': rem(MEESHY_MAP_TRACE_MEASURE.headSize),
    '--kit-trace-node': rem(MEESHY_MAP_TRACE_MEASURE.nodeSize),
    ...(tint === undefined ? {} : { '--kit-trace-tint': tint }),
  }) as CSSProperties;
