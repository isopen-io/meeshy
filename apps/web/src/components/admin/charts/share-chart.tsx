import type { AdminTone } from '@/lib/admin/interpret/types';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { TONE_MARK } from '../tone';
import { AdminChartCard, ADMIN_OTHERS_TOKEN, ADMIN_SERIES_TOKENS, seriesColor, type AdminChartState } from './chart-card';
import { arcPath, foldIntoOthers, stackSegments } from './chart-scale';

type Datum = { readonly key: string; readonly label: string; readonly value: number };

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const RADIUS = 56;
const THICKNESS = 14;

/**
 * **LES PARTS D'UN TOUT** (#8876) — une barre empilée de 12 px par défaut ;
 * l'anneau (`donut`) seulement pour quatre parts ou moins. Les quatre premières
 * catégories ont leur couleur, les suivantes se replient dans « Autres ».
 *
 * Avec `statusTones`, les couleurs sont celles de l'ÉTAT (succès, alerte,
 * danger) — réservées aux distributions d'état — et rien ne se replie : chaque
 * état garde son mot. Les segments sont séparés de 2 px de surface.
 */
export function AdminShareChart({
  language,
  id,
  title,
  data,
  format,
  summary,
  variant = 'bar',
  statusTones,
  state = 'ready',
  onRetry,
}: {
  readonly language: AdminLanguage;
  readonly id: string;
  readonly title: string;
  readonly data: readonly Datum[];
  readonly format: (value: number) => string;
  readonly summary: string;
  readonly variant?: 'bar' | 'donut';
  readonly statusTones?: Readonly<Record<string, AdminTone>>;
  readonly state?: AdminChartState;
  readonly onRetry?: () => void;
}) {
  const parts =
    statusTones === undefined
      ? foldIntoOthers(data, ADMIN_SERIES_TOKENS.length, translateAdmin(language, 'admin.kit.chart.others'))
      : data;
  const colorOf = (key: string, index: number): string => {
    if (statusTones !== undefined) return TONE_MARK[statusTones[key] ?? 'neutral'];
    return key === 'others' ? `var(${ADMIN_OTHERS_TOKEN})` : seriesColor(index);
  };
  const segments = stackSegments(parts.map((part) => part.value));
  const donut = variant === 'donut' && parts.length <= 4;
  const percent = new Intl.NumberFormat(language, { style: 'percent', maximumFractionDigits: 1 });

  const table = {
    caption: title,
    columns: [
      translateAdmin(language, 'admin.kit.chart.columnLabel'),
      translateAdmin(language, 'admin.kit.chart.columnValue'),
      translateAdmin(language, 'admin.kit.chart.columnShare'),
    ],
    rows: parts.map((part, index) => [part.label, format(part.value), percent.format(segments[index]?.share ?? 0)]),
  };

  const total = parts.reduce((sum, part) => sum + part.value, 0);

  return (
    <AdminChartCard
      language={language}
      id={id}
      title={title}
      summary={summary}
      state={state}
      {...(onRetry === undefined ? {} : { onRetry })}
      empty={parts.length === 0 || total === 0}
      height={donut ? RADIUS * 2 : 12}
      table={table}
    >
      <div className={donut ? 'flex flex-wrap items-center gap-6' : 'grid gap-3'}>
        {donut ? (
          <svg aria-hidden="true" data-admin-chart-svg viewBox={`0 0 ${RADIUS * 2} ${RADIUS * 2}`} width={RADIUS * 2} height={RADIUS * 2} className="shrink-0">
            {parts.map((part, index) => {
              const segment = segments[index];
              return segment === undefined || segment.share === 0 ? null : (
                <path
                  key={part.key}
                  data-admin-share={part.key}
                  d={arcPath(segment.start, segment.end, RADIUS, THICKNESS)}
                  fill={colorOf(part.key, index)}
                  stroke="var(--color-ios-surface)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
        ) : (
          <svg aria-hidden="true" data-admin-chart-svg width="100%" height={12} style={{ display: 'block' }}>
            {parts.map((part, index) => {
              const segment = segments[index];
              return segment === undefined || segment.share === 0 ? null : (
                <rect
                  key={part.key}
                  data-admin-share={part.key}
                  x={`${Math.round(segment.start * 10_000) / 100}%`}
                  y={0}
                  width={`${Math.round(segment.share * 10_000) / 100}%`}
                  height={12}
                  rx={4}
                  fill={colorOf(part.key, index)}
                  stroke="var(--color-ios-surface)"
                  strokeWidth={2}
                />
              );
            })}
          </svg>
        )}
        <ul data-admin-chart-legend className="grid min-w-0 flex-1 gap-1">
          {parts.map((part, index) => (
            <li key={part.key} className="flex items-center gap-2 text-caption">
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: colorOf(part.key, index) }} />
              <span className="min-w-0 flex-1 truncate" style={{ color: INK }}>
                {part.label}
              </span>
              <span className="tabular-nums" style={{ color: INK }}>
                {format(part.value)}
              </span>
              <span className="w-12 text-end tabular-nums" style={{ color: INK2 }}>
                {percent.format(segments[index]?.share ?? 0)}
              </span>
            </li>
          ))}
        </ul>
      </div>
    </AdminChartCard>
  );
}
