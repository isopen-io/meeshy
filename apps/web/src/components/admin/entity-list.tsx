import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { AdminSectionId, AdminTarget } from '@/lib/admin/admin-routes';
import type { AdminListController } from '@/lib/admin/use-admin-list';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { AdminPager, PlainTh, SortableTh, Td } from '@/routes/admin-table';

import { AdminLink } from './entity-chip';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice } from './states';
import { BRAND, EDGE, INK, INK2, SURFACE } from './tone';

export type AdminColumn<Row> = {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** Doit appartenir à `spec.sortKeys` : la colonne devient triable (`aria-sort`). Une colonne n'est triable que si la passerelle trie sur ce champ. */
  readonly sortKey?: string;
  /** UNE colonne : le NOM, qui porte le lien de 44 px vers la fiche. Sa cellule ne contient donc aucun lien (`AdminEntityIdentity`, pas `AdminEntityChip`). */
  readonly primary?: true;
  readonly align?: 'start' | 'end';
  /** 1 toujours ; 2 (défaut) dans la carte sous `md` ; 3 seulement dès `lg`. */
  readonly priority?: 1 | 2 | 3;
};

const SKELETON_ROWS = 6;
const priorityOf = <Row,>(column: AdminColumn<Row>): 1 | 2 | 3 => column.priority ?? (column.primary === true ? 1 : 2);

function PrimaryCell({ target, children }: { readonly target: AdminTarget | null; readonly children: ReactNode }) {
  if (target === null) return <div style={{ minHeight: 44 }} className="flex min-w-0 items-center">{children}</div>;
  return (
    <AdminLink target={target} className="flex min-w-0 items-center" style={{ minHeight: 44, color: INK }}>
      {children}
    </AdminLink>
  );
}

/**
 * **LA LISTE D'ENTITÉS** (#8876) — recherche et filtres (`toolbar`), tableau dès
 * `md`, CARTES dessous, pagination, et les états dessinés : squelette de six
 * rangées, erreur avec « Réessayer » (ou refus pour un 403), erreur AVEC
 * données en cache (les données restent, un avis dit que la mise à jour a
 * échoué), vide absolu, vide FILTRÉ avec « Réinitialiser ».
 *
 * Pendant un changement de tri ou de page, la page précédente reste à l'écran,
 * atténuée (`aria-busy`) : jamais un spinner sur des données déjà là. La colonne
 * primaire porte le lien vers la fiche ; ses cellules voisines sont du contenu.
 */
export function AdminEntityList<Row, S extends string, F extends string, I extends string = never>({
  language,
  section,
  list,
  columns,
  rowKey,
  rowTarget,
  caption,
  toolbar,
  empty,
  filteredEmpty,
  pageSizes = [20, 50, 100],
}: {
  readonly language: AdminLanguage;
  readonly section: AdminSectionId;
  readonly list: AdminListController<Row, S, F, I>;
  readonly columns: readonly AdminColumn<Row>[];
  readonly rowKey: (row: Row) => string;
  readonly rowTarget: (row: Row) => AdminTarget | null;
  readonly caption: string;
  readonly toolbar?: ReactNode;
  readonly empty: { readonly title: string; readonly hint?: string };
  readonly filteredEmpty: { readonly title: string };
  readonly pageSizes?: readonly number[];
}) {
  const { query, state } = list;
  const data = query.data;
  const filtered = state.q !== '' || Object.keys(state.filters).length > 0 || Object.keys(state.ids).length > 0;
  const tableColumns = columns.filter((column) => priorityOf(column) <= 3);
  const cardColumns = columns.filter((column) => priorityOf(column) <= 2);
  const primary = columns.find((column) => column.primary === true);

  const reset = (
    <button
      type="button"
      data-admin-list-reset
      onClick={list.reset}
      className="rounded-chip px-4 text-body font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
      style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
    >
      {translateAdmin(language, 'admin.list.reset')}
    </button>
  );

  const header = (column: AdminColumn<Row>) => {
    const visibility = priorityOf(column) === 3 ? 'hidden lg:table-cell' : '';
    const align = column.align === 'end' ? 'text-end' : '';
    if (column.sortKey === undefined) {
      return (
        <PlainTh key={column.id} className={`${align} ${visibility}`.trim()}>
          {column.header}
        </PlainTh>
      );
    }
    const sortKey = column.sortKey;
    return (
      <SortableTh
        key={column.id}
        language={language}
        label={column.header}
        column={sortKey}
        sort={state.sort}
        order={state.order}
        /* `sortKey` est déclaré par l'appelant comme appartenant à `spec.sortKeys` (contrat de
           `AdminColumn`) : la colonne n'est pas générique sur les clés de la liste, donc le
           retour au type de la spécification est fait ICI, une fois, plutôt que chez chaque lot. */
        onSort={() => list.sort(sortKey as S)}
        className={`${align} ${visibility}`.trim()}
      />
    );
  };

  const body = (): ReactNode => {
    if (data === undefined) {
      if (query.isPending) {
        return (
          <div data-admin-list-skeleton aria-busy="true" aria-label={translateAdmin(language, 'admin.kit.loading')} className="grid gap-2">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <div key={index} aria-hidden="true" className="rounded-card" style={{ height: 52, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }} />
            ))}
          </div>
        );
      }
      const denied = query.error instanceof ApiError && query.error.status === 403;
      return denied ? <AdminDeniedInline language={language} /> : <AdminErrorState language={language} onRetry={() => void query.refetch()} />;
    }

    if (data.rows.length === 0) {
      return filtered ? (
        <AdminEmptyState title={filteredEmpty.title} glyph="funnel" action={reset} />
      ) : (
        <AdminEmptyState title={empty.title} {...(empty.hint === undefined ? {} : { hint: empty.hint })} glyph="list" />
      );
    }

    const stale = query.isPlaceholderData;
    return (
      <>
        <div className="hidden overflow-x-auto rounded-card md:block" style={{ border: `1px solid ${EDGE}`, backgroundColor: SURFACE }}>
          <table className="w-full border-collapse text-start">
            <caption className="sr-only">{caption}</caption>
            <thead>
              <tr>{tableColumns.map(header)}</tr>
            </thead>
            <tbody aria-busy={stale} style={{ opacity: stale ? 0.6 : 1 }}>
              {data.rows.map((row) => (
                <tr
                  key={rowKey(row)}
                  data-admin-row={rowKey(row)}
                  className="transition-colors hover:bg-[color-mix(in_srgb,var(--color-ios-ink-3)_6%,transparent)]"
                  style={{ height: 52 }}
                >
                  {tableColumns.map((column) => (
                    <Td key={column.id} className={`${column.align === 'end' ? 'text-end tabular-nums' : ''} ${priorityOf(column) === 3 ? 'hidden lg:table-cell' : ''}`.trim()}>
                      {column.primary === true ? <PrimaryCell target={rowTarget(row)}>{column.cell(row)}</PrimaryCell> : column.cell(row)}
                    </Td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <ul className="grid gap-3 md:hidden" aria-busy={stale} style={{ opacity: stale ? 0.6 : 1 }}>
          {data.rows.map((row) => (
            <li key={rowKey(row)} data-admin-card={rowKey(row)} className="grid gap-2 rounded-card p-4" style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}>
              {primary === undefined ? null : <PrimaryCell target={rowTarget(row)}>{primary.cell(row)}</PrimaryCell>}
              <dl className="grid gap-2">
                {cardColumns
                  .filter((column) => column.primary !== true)
                  .map((column) => (
                    <div key={column.id} className="flex items-baseline justify-between gap-3">
                      <dt className="shrink-0 text-caption" style={{ color: INK2 }}>
                        {column.header}
                      </dt>
                      <dd className="min-w-0 break-words text-end text-body" style={{ color: INK }}>
                        {column.cell(row)}
                      </dd>
                    </div>
                  ))}
              </dl>
            </li>
          ))}
        </ul>

        <AdminPager
          language={language}
          offset={state.offset}
          limit={state.limit}
          count={data.rows.length}
          total={data.total}
          hasMore={data.hasMore}
          pageSizes={pageSizes}
          onPage={list.page}
        />
      </>
    );
  };

  return (
    <div data-admin-list={section} className="grid gap-4">
      {toolbar}
      {data !== undefined && query.isError ? (
        <AdminInlineNotice
          tone="warning"
          text={translateAdmin(language, 'admin.kit.cached')}
          action={
            <button
              type="button"
              data-admin-retry
              onClick={() => void query.refetch()}
              className="rounded-chip px-3 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
              style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
            >
              {translateAdmin(language, 'admin.kit.retry')}
            </button>
          }
        />
      ) : null}
      {body()}
    </div>
  );
}
