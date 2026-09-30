import type { AdminTarget } from '@/lib/admin/admin-routes';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

import { AdminLink } from '../entity-chip';
import { AdminChartCard, seriesColor, type AdminChartState } from './chart-card';

type Datum = { readonly key: string; readonly label: string; readonly value: number; readonly target?: AdminTarget };

const INK = 'var(--color-ios-ink)';
const INK3 = 'var(--color-ios-ink-3)';
const ROW_HEIGHT = 14;
const COLUMN_HEIGHT = 140;

/**
 * **COMPARER DES GRANDEURS** (#8876) — des barres horizontales dès que les
 * libellés sont des NOMS (conversations, membres, langues), verticales pour une
 * suite ordonnée (les 24 heures). Une seule couleur : c'est la LONGUEUR qui
 * parle, pas la teinte.
 *
 * Les barres sont ancrées à la ligne de base (bord de départ, ou pied), arrondies
 * de 4 px du côté de la donnée seulement : le rectangle déborde de 4 px derrière
 * la base et le cadre le coupe. Une ligne qui a une cible (`target`) rend son nom
 * en lien — 44 px — si le lecteur peut l'ouvrir.
 */
export function AdminBarChart({
  language,
  id,
  title,
  data,
  format,
  summary,
  orientation = 'horizontal',
  state = 'ready',
  onRetry,
}: {
  readonly language: InterfaceLanguage;
  readonly id: string;
  readonly title: string;
  readonly data: readonly Datum[];
  readonly format: (value: number) => string;
  readonly summary: string;
  readonly orientation?: 'horizontal' | 'vertical';
  readonly state?: AdminChartState;
  readonly onRetry?: () => void;
}) {
  const max = Math.max(0, ...data.map((datum) => datum.value));
  const share = (value: number): number => (max === 0 ? 0 : Math.max(0, value) / max);

  const table = {
    caption: title,
    columns: [translateAdmin(language, 'admin.kit.chart.columnLabel'), translateAdmin(language, 'admin.kit.chart.columnValue')],
    rows: data.map((datum) => [datum.label, format(datum.value)]),
  };

  const name = (datum: Datum) =>
    datum.target === undefined ? (
      <span className="min-w-0 truncate text-body" style={{ color: INK }}>
        {datum.label}
      </span>
    ) : (
      <AdminLink target={datum.target} className="flex min-w-0 items-center truncate text-body" style={{ minHeight: 44, color: INK }}>
        {datum.label}
      </AdminLink>
    );

  return (
    <AdminChartCard
      language={language}
      id={id}
      title={title}
      summary={summary}
      state={state}
      {...(onRetry === undefined ? {} : { onRetry })}
      empty={data.length === 0}
      height={orientation === 'vertical' ? COLUMN_HEIGHT : Math.max(ROW_HEIGHT * data.length, ROW_HEIGHT)}
      table={table}
    >
      {orientation === 'horizontal' ? (
        <ul className="grid gap-2">
          {data.map((datum) => (
            <li key={datum.key} data-admin-bar={datum.key} className="grid gap-1">
              <div className="flex items-baseline justify-between gap-3">
                {name(datum)}
                <span className="shrink-0 text-body font-semibold tabular-nums" style={{ color: INK }}>
                  {format(datum.value)}
                </span>
              </div>
              <svg aria-hidden="true" width="100%" height={ROW_HEIGHT} className="rtl:-scale-x-100" style={{ display: 'block', overflow: 'hidden' }}>
                <rect x={-4} y={0} height={ROW_HEIGHT} rx={4} fill={seriesColor(0)} style={{ width: `calc(${Math.round(share(datum.value) * 10_000) / 100}% + 4px)` }} />
              </svg>
            </li>
          ))}
        </ul>
      ) : (
        <ul className="flex items-end gap-2" dir="ltr">
          {data.map((datum) => {
            const bar = Math.round(share(datum.value) * COLUMN_HEIGHT);
            return (
              <li key={datum.key} data-admin-bar={datum.key} className="grid min-w-0 flex-1 gap-1 text-center" title={`${datum.label} : ${format(datum.value)}`}>
                <svg aria-hidden="true" width="100%" height={COLUMN_HEIGHT} style={{ display: 'block', overflow: 'hidden' }}>
                  <rect x={0} y={COLUMN_HEIGHT - bar} height={bar + 4} ry={4} fill={seriesColor(0)} style={{ width: '100%' }} />
                </svg>
                <span className="truncate text-caption" style={{ color: INK3 }}>
                  {datum.label}
                </span>
              </li>
            );
          })}
        </ul>
      )}
    </AdminChartCard>
  );
}
