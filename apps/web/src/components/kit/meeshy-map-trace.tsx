import '@/styles/kit-map-trace.css';
import '@/styles/kit-motion.css';
import { memo, useId, type ReactNode } from 'react';

import { MeeshyBadge } from './meeshy-badge';
import {
  MEESHY_MAP_TRACE_MEASURE,
  meeshyMapTracePath,
  meeshyMapTraceRecipe,
  meeshyMapTraceStyle,
  type MeeshyMapTraceKind,
  type MeeshyMapTracePoint,
  type MeeshyMapTraceStop,
  type MeeshyMapTraceWeight,
} from './meeshy-map-trace-recipe';

export * from './meeshy-map-trace-recipe';

export type MeeshyMapTraceProps = {
  readonly label: string;
  readonly points: readonly MeeshyMapTracePoint[];
  readonly kind?: MeeshyMapTraceKind | undefined;
  readonly tint?: string | undefined;
  readonly weight?: MeeshyMapTraceWeight | undefined;
  readonly progress?: number | null | undefined;
  readonly stops?: readonly MeeshyMapTraceStop[] | undefined;
  readonly midLabel?: ReactNode;
  readonly midCaption?: string | undefined;
  readonly midGlyph?: ReactNode;
  readonly stopLabel?: ((stop: MeeshyMapTraceStop) => ReactNode) | undefined;
  readonly isStale?: boolean | undefined;
  readonly isAnimated?: boolean | undefined;
  readonly smoothing?: boolean | undefined;
  readonly onLightMap?: boolean | undefined;
  readonly onStopPress?: ((id: string) => void) | undefined;
  readonly className?: string | undefined;
};

const prefersReducedMotion = (): boolean => typeof window !== 'undefined' && typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/**
 * Un tracé : un chemin à la teinte de l'hôte sur son liseré, qui défile du premier point vers
 * le dernier (`route`), se relie en droite (`link`) ou se dessine du pâle au plein (`history`).
 * Une image nommée qui ne reçoit pas le toucher ; ses arrêts ne deviennent des boutons que
 * si l'hôte écoute. Trop court, ou sous deux points : rien, aucune place réservée.
 */
export const MeeshyMapTrace = memo(function MeeshyMapTrace(props: MeeshyMapTraceProps) {
  const { label, points, kind = 'route', tint, weight, progress, stops = [], midLabel, midCaption, midGlyph, stopLabel, isStale, isAnimated, smoothing = true, onLightMap, onStopPress, className } = props;
  const gradient = useId();
  const path = meeshyMapTracePath({ points, kind, smoothing });
  if (!path.isDrawable) return null;
  const recipe = meeshyMapTraceRecipe({ kind, weight, progress, isStale, isAnimated, onLightMap, reduceMotion: prefersReducedMotion(), length: path.length });
  const first = points[0] as MeeshyMapTracePoint;
  const last = points[points.length - 1] as MeeshyMapTracePoint;
  const head = recipe.progress === null ? null : path.at(recipe.progress);
  const visibleStops = stops.filter((stop) => points[stop.pointIndex] !== undefined);
  const hasMid = recipe.showsMidLabel && (midLabel !== undefined || midCaption !== undefined);
  const live = recipe.progress === null ? 1 : recipe.progress;
  const dash = kind === 'route' ? `0.01 ${recipe.dotEvery}` : undefined;
  const classes = className === undefined ? 'kit-trace' : `kit-trace ${className}`;
  return (
    <div className={classes} role={onStopPress === undefined ? 'img' : 'group'} aria-label={label} data-kit-map-trace="" data-kind={kind} data-stale={isStale === true ? '' : undefined} data-flows={recipe.flows ? '' : undefined} style={{ ...meeshyMapTraceStyle(recipe, tint), pointerEvents: 'none' }}>
      <svg className="kit-trace__svg" width="100%" height="100%" aria-hidden="true" focusable="false">
        {kind === 'history' ? (
          <defs>
            <linearGradient id={gradient} gradientUnits="userSpaceOnUse" x1={first.x} y1={first.y} x2={last.x} y2={last.y}>
              <stop offset="0" stopColor="currentColor" stopOpacity="0.12" />
              <stop offset="1" stopColor="currentColor" stopOpacity="1" />
            </linearGradient>
          </defs>
        ) : null}
        {kind === 'link' ? null : <path d={path.d} className="kit-trace__casing" strokeWidth={recipe.casing} fill="none" />}
        {kind === 'history' ? <path d={path.d} className="kit-trace__halo" strokeWidth={recipe.halo} fill="none" /> : null}
        <path
          d={path.d}
          pathLength={kind === 'history' ? 1 : undefined}
          className="kit-trace__stroke"
          data-kit-trace-stroke=""
          fill="none"
          strokeWidth={recipe.stroke}
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeDasharray={dash ?? (kind === 'history' ? `${live} 1` : undefined)}
          stroke={kind === 'history' ? `url(#${gradient})` : undefined}
        />
        {visibleStops.map((stop) => {
          const at = points[stop.pointIndex] as MeeshyMapTracePoint;
          const upcoming = recipe.progress !== null && (path.fractions[stop.pointIndex] ?? 0) > recipe.progress;
          return <circle key={stop.id} cx={at.x} cy={at.y} r={MEESHY_MAP_TRACE_MEASURE.nodeSize / 2} className="kit-trace__node" data-upcoming={upcoming ? '' : undefined} />;
        })}
        {head === null ? null : <circle cx={head.x} cy={head.y} r={MEESHY_MAP_TRACE_MEASURE.headSize / 2} className="kit-trace__head" data-kit-trace-head="" />}
      </svg>
      {hasMid ? (
        <span className="kit-trace__mid" data-kit-trace-mid="" style={{ left: path.midpoint.x, top: path.midpoint.y - MEESHY_MAP_TRACE_MEASURE.midGap }}>
          {midLabel ?? <MeeshyBadge content={{ label: midCaption ?? '' }} leading={midGlyph === undefined ? undefined : { glyph: midGlyph }} surface="glass" size={36} scheme={onLightMap === true ? 'light' : 'dark'} />}
        </span>
      ) : null}
      {visibleStops.map((stop) => {
        const at = points[stop.pointIndex] as MeeshyMapTracePoint;
        const upcoming = recipe.progress !== null && (path.fractions[stop.pointIndex] ?? 0) > recipe.progress;
        const body = stopLabel?.(stop) ?? (
          <>
            <span className="kit-trace__stop-value">{stop.value}</span>
            <span className="kit-trace__stop-title">{stop.title}</span>
          </>
        );
        const style = { left: at.x, top: at.y + 12 };
        return onStopPress === undefined ? (
          <span key={stop.id} className="kit-trace__stop" data-kit-trace-stop="" data-upcoming={upcoming ? '' : undefined} style={style}>
            {body}
          </span>
        ) : (
          <button key={stop.id} type="button" className="kit-trace__stop" data-kit-trace-stop="" data-upcoming={upcoming ? '' : undefined} style={style} aria-label={`${stop.value}, ${stop.title}`} onClick={() => onStopPress(stop.id)}>
            {body}
          </button>
        );
      })}
    </div>
  );
});
