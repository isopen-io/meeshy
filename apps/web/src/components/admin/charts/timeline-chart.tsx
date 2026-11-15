import { useState, type PointerEvent } from 'react';

import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminChartCard, seriesColor, type AdminChartState } from './chart-card';
import { linearScale, niceTicks } from './chart-scale';

type Point = { readonly x: string; readonly value: number };
type Series = { readonly key: string; readonly label: string; readonly points: readonly Point[] };

const WIDTH = 640;
const HEIGHT = 180;
const INK2 = 'var(--color-ios-ink-2)';
const INK3 = 'var(--color-ios-ink-3)';

/**
 * **L'ÉVOLUTION DANS LE TEMPS** (#8876) — une ligne de 2 px par série (quatre au
 * plus), une aire à 12 % sous une série UNIQUE, une grille récessive, UN seul axe
 * vertical. L'axe du temps va TOUJOURS de gauche à droite, y compris en arabe
 * (`dir="ltr"` sur le dessin) ; la légende et les libellés suivent le sens du
 * document.
 *
 * Pas de valeur sur chaque point : deux libellés directs (début, fin) et une
 * infobulle au POINTEUR — au clavier et au lecteur d'écran, « Voir les données »
 * rend le tableau.
 */
export function AdminTimelineChart({
  language,
  id,
  title,
  series,
  format,
  summary,
  state = 'ready',
  onRetry,
}: {
  readonly language: AdminLanguage;
  readonly id: string;
  readonly title: string;
  readonly series: readonly Series[];
  readonly format: (value: number) => string;
  readonly summary: string;
  readonly state?: AdminChartState;
  readonly onRetry?: () => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const visible = series.slice(0, 4);
  const length = Math.max(0, ...visible.map((entry) => entry.points.length));
  const max = Math.max(0, ...visible.flatMap((entry) => entry.points.map((point) => point.value)));
  const ticks = niceTicks(max, 3);
  const top = ticks[ticks.length - 1] ?? 1;
  const x = linearScale([0, Math.max(length - 1, 1)], [0, WIDTH]);
  const y = linearScale([0, top], [HEIGHT - 4, 4]);
  const single = visible.length === 1;

  const pathOf = (points: readonly Point[]): string =>
    points.map((point, index) => `${index === 0 ? 'M' : 'L'}${Math.round(x(index) * 100) / 100} ${Math.round(y(point.value) * 100) / 100}`).join(' ');

  const labelAt = (index: number): string => visible.find((entry) => entry.points[index] !== undefined)?.points[index]?.x ?? '';

  const onMove = (event: PointerEvent<HTMLDivElement>) => {
    const box = event.currentTarget.getBoundingClientRect();
    if (box.width <= 0 || length === 0) return;
    const ratio = (event.clientX - box.left) / box.width;
    setHover(Math.min(length - 1, Math.max(0, Math.round(ratio * (length - 1)))));
  };

  const table = {
    caption: title,
    columns: [translateAdmin(language, 'admin.kit.chart.columnLabel'), ...visible.map((entry) => entry.label)],
    rows: Array.from({ length }, (_, index) => [
      labelAt(index),
      ...visible.map((entry) => {
        const point = entry.points[index];
        return point === undefined ? '—' : format(point.value);
      }),
    ]),
  };

  return (
    <AdminChartCard
      language={language}
      id={id}
      title={title}
      summary={summary}
      state={state}
      {...(onRetry === undefined ? {} : { onRetry })}
      empty={length === 0}
      height={HEIGHT}
      legend={visible.map((entry, index) => ({ key: entry.key, label: entry.label, color: seriesColor(index) }))}
      table={table}
    >
      <div className="relative" dir="ltr" onPointerMove={onMove} onPointerLeave={() => setHover(null)}>
        <span aria-hidden="true" data-admin-chart-max className="absolute start-0 top-0 text-caption tabular-nums" style={{ color: INK3 }}>
          {format(top)}
        </span>
        <svg aria-hidden="true" data-admin-chart-svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} preserveAspectRatio="none" width="100%" height={HEIGHT} fill="none" style={{ display: 'block' }}>
          {ticks.map((tick) => (
            <line key={tick} x1={0} x2={WIDTH} y1={y(tick)} y2={y(tick)} stroke="var(--color-edge)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
          ))}
          {visible.map((entry, index) =>
            entry.points.length === 0 ? null : (
              <g key={entry.key} data-admin-series={entry.key}>
                {single ? (
                  <path
                    d={`${pathOf(entry.points)} L${x(entry.points.length - 1)} ${y(0)} L${x(0)} ${y(0)} Z`}
                    fill={seriesColor(index)}
                    fillOpacity={0.12}
                    stroke="none"
                  />
                ) : null}
                <path
                  d={pathOf(entry.points)}
                  stroke={seriesColor(index)}
                  strokeWidth={2}
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  vectorEffect="non-scaling-stroke"
                />
              </g>
            ),
          )}
          {hover === null ? null : <line x1={x(hover)} x2={x(hover)} y1={0} y2={HEIGHT} stroke="var(--color-ios-ink-3)" strokeWidth={1} vectorEffect="non-scaling-stroke" />}
        </svg>
        {hover === null ? null : (
          <div
            data-admin-chart-tooltip
            aria-hidden="true"
            className="pointer-events-none absolute z-10 grid gap-1 rounded-chip px-3 py-2 text-caption"
            style={{
              top: 0,
              left: `${Math.min(88, Math.max(12, (x(hover) / WIDTH) * 100))}%`,
              transform: 'translateX(-50%)',
              backgroundColor: 'var(--color-ios-surface)',
              border: '1px solid var(--color-edge)',
              color: 'var(--color-ios-ink)',
            }}
          >
            <span style={{ color: INK2 }}>{labelAt(hover)}</span>
            {visible.map((entry, index) => {
              const point = entry.points[hover];
              return point === undefined ? null : (
                <span key={entry.key} className="flex items-center gap-2 tabular-nums">
                  <span className="size-2 rounded-full" style={{ backgroundColor: seriesColor(index) }} />
                  {visible.length > 1 ? `${entry.label} : ` : ''}
                  {format(point.value)}
                </span>
              );
            })}
          </div>
        )}
        <div className="flex justify-between pt-1 text-caption" style={{ color: INK3 }} aria-hidden="true">
          <span>{labelAt(0)}</span>
          <span>{labelAt(length - 1)}</span>
        </div>
      </div>
    </AdminChartCard>
  );
}
