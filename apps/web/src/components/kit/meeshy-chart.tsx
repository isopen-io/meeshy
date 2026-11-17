import '@/styles/kit-chart.css';
import '@/styles/kit-motion.css';
import { memo, type ReactNode } from 'react';

import { impact } from '@/lib/view/haptics';

import { MeeshyChartScale, foldIntoOthers, linearScale } from './meeshy-chart-scale';
import {
  meeshyChartBubbleDiameter,
  meeshyChartRecipe,
  meeshyChartStripLevel,
  meeshyChartStyle,
  type MeeshyChartKind,
  type MeeshyChartLayout,
  type MeeshyChartRecipe,
  type MeeshyChartSize,
} from './meeshy-chart-recipe';
import { MeeshyMeter } from './meeshy-meter';
import { MeeshySkeleton } from './meeshy-skeleton';

export * from './meeshy-chart-recipe';
export { MeeshyChartScale } from './meeshy-chart-scale';

export type MeeshyChartPoint = {
  readonly id: string;
  readonly value: number;
  readonly label: string;
  readonly spoken: string;
  readonly tint?: string | undefined;
  readonly position?: { readonly x: number; readonly y: number } | undefined;
};

export type MeeshyChartMarker =
  | { readonly kind: 'peak' }
  | { readonly kind: 'today' }
  | { readonly kind: 'band'; readonly from: string; readonly to: string }
  | { readonly kind: 'ticks'; readonly values: readonly number[] };

export type MeeshyChartCallout = { readonly title: string; readonly value: string; readonly note?: string | undefined };

export type MeeshyChartProps = {
  readonly kind: MeeshyChartKind;
  readonly points: readonly MeeshyChartPoint[];
  readonly summary: string;
  readonly tint?: string | undefined;
  readonly size?: MeeshyChartSize | undefined;
  readonly markers?: readonly MeeshyChartMarker[] | undefined;
  readonly axisLabels?: readonly string[] | undefined;
  readonly selection?: string | null | undefined;
  readonly onSelect?: ((id: string | null) => void) | undefined;
  readonly callout?: ((id: string) => MeeshyChartCallout | null) | undefined;
  readonly center?: ReactNode;
  readonly rowLeading?: ((point: MeeshyChartPoint) => ReactNode) | undefined;
  readonly background?: ReactNode;
  readonly layout?: MeeshyChartLayout | undefined;
  readonly isLoading?: boolean | undefined;
  readonly emptyText?: string | undefined;
  readonly othersLabel?: string | undefined;
  readonly animatesEntry?: boolean | undefined;
  readonly className?: string | undefined;
};

type Flags = { readonly peakId: string | null; readonly todayId: string | null; readonly bandIds: ReadonlySet<string> };

type Pick = {
  readonly selectable: boolean;
  readonly selection: string | null | undefined;
  readonly choose: (id: string) => void;
};

const WIDTH = 300;

const flagsOf = (points: readonly MeeshyChartPoint[], markers: readonly MeeshyChartMarker[]): Flags => {
  const peak = MeeshyChartScale.peak(points);
  const kinds = new Set(markers.map((marker) => marker.kind));
  const band = markers.find((marker): marker is Extract<MeeshyChartMarker, { kind: 'band' }> => marker.kind === 'band');
  const ids = points.map((point) => point.id);
  const from = band === undefined ? -1 : ids.indexOf(band.from);
  const to = band === undefined ? -1 : ids.indexOf(band.to);
  return {
    peakId: kinds.has('peak') && peak !== null && peak.value > 0 ? (points[peak.index]?.id ?? null) : null,
    todayId: kinds.has('today') ? (points[points.length - 1]?.id ?? null) : null,
    bandIds: new Set(from < 0 || to < 0 ? [] : ids.slice(Math.min(from, to), Math.max(from, to) + 1)),
  };
};

const flagAttrs = (flags: Flags, id: string): Record<string, string | undefined> => ({
  'data-peak': flags.peakId === id ? '' : undefined,
  'data-today': flags.todayId === id ? '' : undefined,
  'data-band': flags.bandIds.has(id) ? '' : undefined,
});

function Hit({ point, pick, className, style, children, extra }: { readonly point: MeeshyChartPoint; readonly pick: Pick; readonly className: string; readonly style?: object | undefined; readonly children?: ReactNode; readonly extra?: Record<string, string | undefined> }) {
  const common = { className, 'data-point': point.id, 'data-selected': pick.selection === point.id ? '' : undefined, style: style as never, ...extra };
  if (!pick.selectable) return <div {...common}>{children}</div>;
  return (
    <button type="button" aria-label={point.spoken} aria-pressed={pick.selection === point.id} onClick={() => pick.choose(point.id)} {...common}>
      {children}
    </button>
  );
}

function Bars({ points, flags, pick, recipe }: { readonly points: readonly MeeshyChartPoint[]; readonly flags: Flags; readonly pick: Pick; readonly recipe: MeeshyChartRecipe }) {
  const levels = MeeshyChartScale.normalized(points.map((point) => point.value));
  return (
    <div className="kit-chart__bars" style={{ blockSize: `${recipe.height / 16}rem` }}>
      {points.map((point, index) => (
        <Hit key={point.id} point={point} pick={pick} className="kit-chart__bar" style={{ '--kit-chart-level': levels[index] ?? 0, ...(point.tint === undefined ? {} : { '--kit-chart-tint': point.tint }) }} extra={{ 'data-kit-chart-bar': '', ...flagAttrs(flags, point.id) }}>
          <span className="kit-chart__bar-fill" aria-hidden="true" />
        </Hit>
      ))}
    </div>
  );
}

function Line({ points, flags, pick, recipe }: { readonly points: readonly MeeshyChartPoint[]; readonly flags: Flags; readonly pick: Pick; readonly recipe: MeeshyChartRecipe }) {
  const values = points.map((point) => Math.max(point.value, 0));
  const top = Math.max(1, ...values);
  const x = linearScale([0, Math.max(values.length - 1, 1)], [4, WIDTH - 4]);
  const y = linearScale([0, top], [recipe.height - 6, 6]);
  const coordinates = values.map((value, index) => ({ x: x(index), y: y(value) }));
  const round = (value: number): number => Math.round(value * 100) / 100;
  const line = coordinates.map((point, index) => `${index === 0 ? 'M' : 'L'}${round(point.x)} ${round(point.y)}`).join(' ');
  const area = coordinates.length === 0 ? '' : `${line} L${round(WIDTH - 4)} ${recipe.height} L4 ${recipe.height} Z`;
  return (
    <div className="kit-chart__plot" style={{ blockSize: `${recipe.height / 16}rem` }}>
      <svg viewBox={`0 0 ${WIDTH} ${recipe.height}`} preserveAspectRatio="none" aria-hidden="true" className="kit-chart__svg">
        {MeeshyChartScale.niceTicks(top, 2).map((tick) => (
          <line key={tick} x1="0" x2={WIDTH} y1={y(tick)} y2={y(tick)} className="kit-chart__grid" vectorEffect="non-scaling-stroke" />
        ))}
        <path d={area} className="kit-chart__area" />
        <path d={line} className="kit-chart__line" data-kit-chart-line="" pathLength={1} vectorEffect="non-scaling-stroke" />
      </svg>
      {points.map((point, index) => (
        <Hit
          key={point.id}
          point={point}
          pick={pick}
          className="kit-chart__dot"
          style={{ insetInlineStart: `${((coordinates[index]?.x ?? 0) / WIDTH) * 100}%`, insetBlockStart: `${((coordinates[index]?.y ?? 0) / recipe.height) * 100}%` }}
          extra={{ 'data-kit-chart-dot': '', ...flagAttrs(flags, point.id) }}
        />
      ))}
    </div>
  );
}

function Donut({ points, center, pick, recipe, rowLeading, othersLabel }: { readonly othersLabel: string; readonly points: readonly MeeshyChartPoint[]; readonly center: ReactNode; readonly pick: Pick; readonly recipe: MeeshyChartRecipe; readonly rowLeading: MeeshyChartProps['rowLeading'] }) {
  const folded = foldIntoOthers(
    points.map((point) => ({ key: point.id, label: point.label, value: Math.max(point.value, 0) })),
    recipe.foldsOthers ? recipe.maxSegments - 1 : recipe.maxSegments,
    othersLabel,
  );
  const segments = MeeshyChartScale.segments(folded.map((item) => item.value));
  const radius = recipe.height / 2;
  const total = folded.reduce((sum, item) => sum + item.value, 0);
  return (
    <div className="kit-chart__donut">
      <div className="kit-chart__ring" style={{ inlineSize: `${recipe.height / 16}rem`, blockSize: `${recipe.height / 16}rem` }}>
        <svg viewBox={`0 0 ${recipe.height} ${recipe.height}`} aria-hidden="true">
          <circle cx={radius} cy={radius} r={radius - 7} className="kit-chart__track" />
          {segments.map((segment, index) =>
            segment.share <= 0 ? null : (
              <path key={folded[index]?.key} d={MeeshyChartScale.arc(segment.start, Math.min(segment.end, 0.9999), radius, 14)} className="kit-chart__arc" data-kit-chart-arc="" data-slice={index} style={{ opacity: 1 - index * 0.14 }} />
            ),
          )}
        </svg>
        {center === undefined ? null : <span className="kit-chart__center">{center}</span>}
      </div>
      <ul className="kit-chart__legend" role="list">
        {folded.map((item, index) => {
          const point = points.find((candidate) => candidate.id === item.key);
          const share = total === 0 ? 0 : Math.round((item.value / total) * 100);
          const row = (
            <>
              <span className="kit-chart__swatch" aria-hidden="true" style={{ opacity: 1 - index * 0.14 }} />
              {point === undefined || rowLeading === undefined ? null : rowLeading(point)}
              <span className="kit-chart__legend-label" aria-hidden="true">{item.label}</span>
              <span className="kit-chart__legend-value" aria-hidden="true">{share} %</span>
            </>
          );
          return (
            <li key={item.key} className="kit-chart__legend-row" data-kit-chart-row="">
              {point !== undefined && pick.selectable ? (
                <button type="button" className="kit-chart__legend-hit" aria-label={point.spoken} aria-pressed={pick.selection === point.id} onClick={() => pick.choose(point.id)}>{row}</button>
              ) : (
                row
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

function Funnel({ points, pick }: { readonly points: readonly MeeshyChartPoint[]; readonly pick: Pick }) {
  const levels = MeeshyChartScale.normalized(points.map((point) => point.value), Math.max(0, points[0]?.value ?? 0));
  return (
    <div className="kit-chart__funnel">
      {points.map((point, index) => (
        <Hit key={point.id} point={point} pick={pick} className="kit-chart__stage" style={{ '--kit-chart-level': levels[index] ?? 0, '--kit-chart-density': 0.35 + 0.65 * (1 - index / Math.max(points.length, 1)) }} extra={{ 'data-kit-chart-stage': '' }}>
          <span className="kit-chart__stage-label" aria-hidden="true">{point.label}</span>
          <span className="kit-chart__stage-value" aria-hidden="true">{point.value}</span>
        </Hit>
      ))}
    </div>
  );
}

function Breakdown({ points, pick, rowLeading }: { readonly points: readonly MeeshyChartPoint[]; readonly pick: Pick; readonly rowLeading: MeeshyChartProps['rowLeading'] }) {
  const top = Math.max(1, ...points.map((point) => Math.max(point.value, 0)));
  return (
    <ul className="kit-chart__rows" role="list">
      {points.map((point) => (
        <li key={point.id} className="kit-chart__row" data-kit-chart-row="" data-point={point.id} data-selected={pick.selection === point.id ? '' : undefined}>
          <Row point={point} pick={pick}>
            {rowLeading === undefined ? null : <span className="kit-chart__row-lead" aria-hidden="true">{rowLeading(point)}</span>}
            <MeeshyMeter value={Math.max(point.value, 0)} total={top} label={point.spoken} title={point.label} valueText={String(point.value)} tint={point.tint} />
          </Row>
        </li>
      ))}
    </ul>
  );
}

function Row({ point, pick, children }: { readonly point: MeeshyChartPoint; readonly pick: Pick; readonly children: ReactNode }) {
  if (!pick.selectable) return <>{children}</>;
  return (
    <button type="button" className="kit-chart__row-hit" aria-label={point.spoken} aria-pressed={pick.selection === point.id} onClick={() => pick.choose(point.id)}>
      {children}
    </button>
  );
}

function Strip({ points, flags, pick }: { readonly points: readonly MeeshyChartPoint[]; readonly flags: Flags; readonly pick: Pick }) {
  const levels = MeeshyChartScale.normalized(points.map((point) => point.value));
  return (
    <div className="kit-chart__strip">
      {points.map((point, index) => {
        const level = meeshyChartStripLevel(levels[index] ?? 0);
        return (
          <Hit key={point.id} point={point} pick={pick} className="kit-chart__cell" style={{ '--kit-chart-level': level }} extra={{ 'data-kit-chart-cell': '', 'data-level': String(level), ...flagAttrs(flags, point.id) }} />
        );
      })}
    </div>
  );
}

function Bubbles({ points, pick, background }: { readonly points: readonly MeeshyChartPoint[]; readonly pick: Pick; readonly background: ReactNode }) {
  const top = Math.max(1, ...points.map((point) => Math.max(point.value, 0)));
  return (
    <div className="kit-chart__bubbles">
      {background === undefined ? null : <div className="kit-chart__backdrop" aria-hidden="true">{background}</div>}
      {points.map((point, index) => {
        const diameter = meeshyChartBubbleDiameter(Math.max(point.value, 0) / top);
        const at = point.position ?? { x: (index + 1) / (points.length + 1), y: 0.5 };
        return (
          <Hit key={point.id} point={point} pick={pick} className="kit-chart__bubble" style={{ inlineSize: `${diameter / 16}rem`, blockSize: `${diameter / 16}rem`, insetInlineStart: `${at.x * 100}%`, insetBlockStart: `${at.y * 100}%` }} extra={{ 'data-kit-chart-bubble': '', 'data-diameter': String(diameter) }}>
            <span aria-hidden="true">{point.label}</span>
          </Hit>
        );
      })}
    </div>
  );
}

/**
 * Un graphique en sept genres, une seule grammaire : une teinte par série, un seul point
 * éclairé, des bornes d'axe, une étiquette pour le point choisi. Une image nommée par la
 * phrase de l'hôte — jamais une suite de nombres — et chaque valeur dite par `spoken`. En
 * lecture seule : aucune cible. Avec `onSelect` : un bouton par point, qui se relâche au
 * second toucher. En chargement : le squelette du genre ; sans donnée : la phrase de l'hôte,
 * l'axe reste, ni illustration ni bouton.
 */
export const MeeshyChart = memo(function MeeshyChart(props: MeeshyChartProps) {
  const { kind, points, summary, tint, size, markers = [{ kind: 'peak' }], axisLabels = [], selection, onSelect, callout, center, rowLeading, background, layout, isLoading = false, emptyText, othersLabel = '…', animatesEntry = true, className } = props;
  const recipe = meeshyChartRecipe({ kind, size, pointCount: points.length, layout });
  const selectable = onSelect !== undefined;
  const pick: Pick = {
    selectable,
    selection,
    choose: (id) => {
      impact('light');
      onSelect?.(selection === id ? null : id);
    },
  };
  const flags = flagsOf(points, markers);
  const classes = ['kit-chart', className].filter((part): part is string => part !== undefined).join(' ');
  const axis = recipe.hasAxis && axisLabels.length >= 2 ? (
    <div className="kit-chart__axis" data-kit-chart-axis="" aria-hidden="true">
      {axisLabels.slice(0, 5).map((label) => (
        <span key={label}>{label}</span>
      ))}
    </div>
  ) : null;
  const picked = selection === null || selection === undefined ? null : (callout?.(selection) ?? null);
  const root = { className: classes, 'data-kit-chart': '', 'data-kind': kind, 'data-enters': animatesEntry ? '' : undefined, style: meeshyChartStyle(recipe, tint) };

  if (isLoading) {
    return (
      <div {...root} aria-busy="true">
        <MeeshySkeleton shape={{ kind: 'card', aspect: WIDTH / Math.max(recipe.height, 26), radius: 14 }} />
      </div>
    );
  }
  if (recipe.isEmpty) {
    return (
      <div {...root} role="img" aria-label={summary} data-empty="">
        {recipe.keepsTrack ? <span className="kit-chart__ring kit-chart__ring--empty" aria-hidden="true" /> : null}
        {emptyText === undefined ? null : <p className="kit-chart__empty">{emptyText}</p>}
        {axis}
      </div>
    );
  }
  const body =
    kind === 'bars' ? <Bars points={points} flags={flags} pick={pick} recipe={recipe} />
    : kind === 'line' ? <Line points={points} flags={flags} pick={pick} recipe={recipe} />
    : kind === 'donut' ? <Donut othersLabel={othersLabel} points={points} center={center} pick={pick} recipe={recipe} rowLeading={rowLeading} />
    : kind === 'funnel' ? <Funnel points={points} pick={pick} />
    : kind === 'breakdown' ? <Breakdown points={points} pick={pick} rowLeading={rowLeading} />
    : kind === 'strip' ? <Strip points={points} flags={flags} pick={pick} />
    : <Bubbles points={points} pick={pick} background={background} />;
  return (
    <div {...root} role={selectable ? 'group' : 'img'} aria-label={summary}>
      {body}
      {axis}
      {picked === null ? null : (
        <div className="kit-chart__callout" data-kit-chart-callout="" role="status">
          <span className="kit-chart__callout-title">{picked.title}</span>
          <span className="kit-chart__callout-value">{picked.value}</span>
          {picked.note === undefined ? null : <span className="kit-chart__callout-note">{picked.note}</span>}
        </div>
      )}
      <ul className="sr-only" data-kit-chart-spoken="">
        {points.map((point) => (
          <li key={point.id}>{point.spoken}</li>
        ))}
      </ul>
    </div>
  );
});
