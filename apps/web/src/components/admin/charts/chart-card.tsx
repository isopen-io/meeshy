import { useId, useState, type ReactNode } from 'react';

import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { AdminGlyph } from '../admin-glyph';
import { AdminErrorState } from '../states';
import { BRAND, EDGE, INK, INK2, SURFACE } from '../tone';

/**
 * **LES COULEURS D'UN GRAPHIQUE, PAR LA FONCTION** (#8876) — l'ordre est FIXE :
 * la couleur suit l'ENTITÉ, jamais son rang, donc un filtre ne repeint pas les
 * survivantes. La cinquième catégorie et les suivantes se replient dans
 * « Autres » (`ADMIN_OTHERS_TOKEN`).
 *
 * Chaque jeton retenu contraste au moins 3:1 avec `--ios-surface`, en clair ET
 * en sombre (`chart-palette.test.ts`, valeurs lues dans `ios.css`). Deux jetons
 * du plan d'origine — `--ios-tile-location` (vert, 2,1:1 en clair) et
 * `--ios-tile-file` (cyan, 2,4:1 en clair) — ne passaient pas : ils sont RETIRÉS,
 * remplacés par `--ios-tile-photo` et `--ios-pinned`, qui passent dans les deux
 * schémas. Les couleurs d'état (succès, alerte, danger) sont RÉSERVÉES aux
 * distributions d'état et portent toujours leur mot.
 */
export const ADMIN_SERIES_TOKENS = ['--ios-indigo-500', '--ios-tile-voice', '--ios-tile-photo', '--ios-pinned'] as const;

export const ADMIN_OTHERS_TOKEN = '--ios-neutral-500' as const;

export const seriesColor = (index: number): string => `var(${ADMIN_SERIES_TOKENS[index] ?? ADMIN_OTHERS_TOKEN})`;

export type AdminChartState = 'ready' | 'loading' | 'error';

export type AdminChartLegendItem = { readonly key: string; readonly label: string; readonly color: string };

export type AdminChartTableData = {
  readonly caption: string;
  readonly columns: readonly string[];
  readonly rows: readonly (readonly string[])[];
};

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

/** Le tableau accessible d'un graphique : les mêmes valeurs, formatées, que l'œil lit — et le chemin clavier et lecteur d'écran. */
export function AdminChartTable({ id, table }: { readonly id?: string; readonly table: AdminChartTableData }) {
  return (
    <div {...(id === undefined ? {} : { id })} className="overflow-x-auto">
      <table data-admin-chart-table className="w-full border-collapse text-start text-caption">
        <caption className="sr-only">{table.caption}</caption>
        <thead>
          <tr>
            {table.columns.map((column) => (
              <th key={column} scope="col" className="px-2 py-2 text-start font-medium" style={{ color: INK2, borderBottom: `1px solid ${EDGE}` }}>
                {column}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {table.rows.map((row, index) => (
            <tr key={`${index}-${row[0] ?? ''}`}>
              {row.map((cell, column) =>
                column === 0 ? (
                  <th key={column} scope="row" className="px-2 py-2 text-start font-medium" style={{ color: INK, borderBottom: `1px solid ${EDGE}` }}>
                    {cell}
                  </th>
                ) : (
                  <td key={column} className="px-2 py-2 tabular-nums" style={{ color: INK, borderBottom: `1px solid ${EDGE}` }}>
                    {cell}
                  </td>
                ),
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * **LE CADRE D'UN GRAPHIQUE** (#8876) — `<figure>` + `<figcaption>` (le titre et
 * UNE phrase de synthèse calculée), le dessin (aria-hidden : c'est le tableau qui
 * parle), la légende dès deux séries, et « Voir les données ».
 *
 * Il porte les trois ÉTATS : squelette de même hauteur que le dessin (jamais un
 * graphique plat qui ferait croire à zéro), erreur avec « Réessayer », et VIDE
 * dit en mots par l'appelant (`children` est alors `null`).
 */
export function AdminChartCard({
  language,
  id,
  title,
  summary,
  state = 'ready',
  onRetry,
  legend,
  table,
  height,
  empty,
  children,
}: {
  readonly language: AdminLanguage;
  readonly id: string;
  readonly title: string;
  readonly summary: string;
  readonly state?: AdminChartState;
  readonly onRetry?: () => void;
  readonly legend?: readonly AdminChartLegendItem[];
  readonly table: AdminChartTableData;
  readonly height: number;
  /** Vrai quand il n'y a aucun point à dessiner : le cadre dit « Aucune donnée sur la période ». */
  readonly empty: boolean;
  readonly children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const uid = useId();
  const tableId = `${id}-${uid}`;

  return (
    <figure data-admin-chart={id} aria-busy={state === 'loading'} className="grid gap-3 rounded-card p-4 md:p-5" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}`, margin: 0 }}>
      <figcaption className="grid gap-1">
        <span className="text-body font-semibold" style={{ color: INK }}>
          {title}
        </span>
        {state === 'ready' && !empty ? (
          <span data-admin-chart-summary className="text-caption" style={{ color: INK2 }}>
            {summary}
          </span>
        ) : null}
      </figcaption>

      {state === 'loading' ? (
        <div
          aria-hidden="true"
          data-admin-chart-skeleton
          className="rounded-chip"
          style={{ height, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }}
        />
      ) : state === 'error' ? (
        <AdminErrorState language={language} onRetry={onRetry ?? (() => undefined)} />
      ) : empty ? (
        <p data-admin-chart-empty className="grid place-items-center text-caption" style={{ minHeight: height, color: INK2 }}>
          {translateAdmin(language, 'admin.kit.chart.empty')}
        </p>
      ) : (
        <>
          <div data-admin-chart-body>{children}</div>

          {legend !== undefined && legend.length >= 2 ? (
            <ul data-admin-chart-legend aria-label={translateAdmin(language, 'admin.kit.chart.legend')} className="flex flex-wrap gap-x-4 gap-y-1 text-caption" style={{ color: INK }}>
              {legend.map((item) => (
                <li key={item.key} className="flex items-center gap-2">
                  <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                  {item.label}
                </li>
              ))}
            </ul>
          ) : null}

          <div>
            <button
              type="button"
              data-admin-action="chart-table"
              aria-expanded={open}
              aria-controls={tableId}
              onClick={() => setOpen((value) => !value)}
              className={`inline-flex items-center gap-1 rounded-chip px-3 text-caption font-medium ${FOCUS}`}
              style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
            >
              <AdminGlyph name={open ? 'caretUp' : 'table'} size={14} />
              {translateAdmin(language, open ? 'admin.kit.chart.hideTable' : 'admin.kit.chart.showTable')}
            </button>
            <div id={tableId} hidden={!open}>
              {open ? <AdminChartTable table={table} /> : null}
            </div>
          </div>
        </>
      )}
    </figure>
  );
}
