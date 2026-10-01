import type { ReactNode } from 'react';

import { ApiError } from '@/lib/api/client';
import type { AdminSectionId, AdminTarget } from '@/lib/admin/admin-routes';
import type { AdminListController } from '@/lib/admin/use-admin-list';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import { AdminPager, PlainTh, SortableTh } from '@/routes/admin-table';

import { AdminResponsiveRows, columnPriority, type AdminColumn } from './responsive-rows';
import { AdminSortControl, type AdminSortOption } from './sort-control';
import { AdminDeniedInline, AdminEmptyState, AdminErrorState, AdminInlineNotice, AdminLoading } from './states';
import { BRAND } from './tone';

export type { AdminColumn };

const SKELETON_ROWS = 6;

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
 *
 * **Tableau ou cartes se décide sur la largeur du CONTENU** (`@container`, posé par le cadre de
 * l'administration et par la colonne principale d'une fiche), jamais sur celle de la fenêtre : le
 * menu latéral déplié retire 248 px, et à 768 px de fenêtre il ne restait que 456 px au tableau.
 * Sous le seuil, un « Trier par » (`AdminSortControl`) rend aux cartes les tris que les en-têtes
 * du tableau portent — `extraSorts` y ajoute les tris que la passerelle sert sans colonne.
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
  extraSorts = [],
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
  /** Des tris que la passerelle sert et qu'aucune colonne ne porte (« Prénom », « Nom ») : ils n'existent que dans le « Trier par » des cartes. */
  readonly extraSorts?: readonly AdminSortOption[];
}) {
  const { query, state } = list;
  const data = query.data;
  const filtered = state.q !== '' || Object.keys(state.filters).length > 0 || Object.keys(state.ids).length > 0;
  const sortOptions: readonly AdminSortOption[] = [
    ...columns
      .filter((column) => column.sortKey !== undefined)
      .map((column) => ({ value: column.sortKey ?? '', label: column.sortLabel ?? column.header })),
    ...extraSorts,
  ];

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
    const visibility = columnPriority(column) === 3 ? 'hidden @5xl:table-cell' : '';
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
          <AdminLoading language={language} anchor="list-skeleton" className="grid gap-2">
            {Array.from({ length: SKELETON_ROWS }, (_, index) => (
              <div key={index} className="rounded-card" style={{ height: 52, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 12%, transparent)' }} />
            ))}
          </AdminLoading>
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
        <AdminSortControl
          language={language}
          options={sortOptions}
          sort={state.sort}
          order={state.order}
          /* Les clés viennent des colonnes déclarées sur `spec.sortKeys` (contrat de `AdminColumn`) : le retour au type de la spécification est fait ICI, une fois. */
          onSort={(key) => list.sort(key as S)}
        />

        <AdminResponsiveRows columns={columns} rows={data.rows} rowKey={rowKey} rowTarget={rowTarget} caption={caption} stale={stale} header={header} />

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
