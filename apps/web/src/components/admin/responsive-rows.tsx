import type { ReactNode } from 'react';

import type { AdminTarget } from '@/lib/admin/admin-routes';
import { PlainTh, Td } from '@/routes/admin-table';

import { AdminCardMode, AdminLink } from './entity-chip';
import { EDGE, INK, INK2, SURFACE } from './tone';

export type AdminColumn<Row> = {
  readonly id: string;
  readonly header: string;
  readonly cell: (row: Row) => ReactNode;
  /** Doit appartenir à `spec.sortKeys` : la colonne devient triable (`aria-sort`). Une colonne n'est triable que si la passerelle trie sur ce champ. */
  readonly sortKey?: string;
  /** Le nom du tri dans le « Trier par » des cartes, quand l'en-tête ne le dit pas assez (« Membre » trie par pseudonyme). */
  readonly sortLabel?: string;
  /** UNE colonne : le NOM, qui porte le lien de 44 px vers la fiche. Sa cellule ne contient donc aucun lien (`AdminEntityIdentity`, pas `AdminEntityChip`). */
  readonly primary?: true;
  readonly align?: 'start' | 'end';
  /** 1 toujours ; 2 (défaut) dans la carte sous le seuil ; 3 seulement sur un contenu très large. */
  readonly priority?: 1 | 2 | 3;
};

export const columnPriority = <Row,>(column: AdminColumn<Row>): 1 | 2 | 3 => column.priority ?? (column.primary === true ? 1 : 2);

function PrimaryCell({ target, children }: { readonly target: AdminTarget | null; readonly children: ReactNode }) {
  if (target === null) return <div style={{ minHeight: 44 }} className="flex min-w-0 items-center">{children}</div>;
  return (
    <AdminLink target={target} className="flex min-w-0 items-center" style={{ minHeight: 44, color: INK }}>
      {children}
    </AdminLink>
  );
}

/**
 * **TABLEAU OU CARTES, SELON LA LARGEUR DU CONTENU** (#8876) — le gabarit COMMUN des listes
 * d'administration : un tableau dès `@3xl` (le conteneur posé par le cadre et par la colonne
 * principale d'une fiche), des cartes dessous. Il ne sait ni charger, ni paginer, ni trier : la
 * liste d'entités (`AdminEntityList`) lui ajoute la recherche, le tri et les états ; un onglet de
 * dossier (contacts, communautés, sessions, signalements) lui ajoute les siens. Un seul dessin, donc
 * aucun onglet qui défile de côté à 375 px pendant que les listes voisines se plient en cartes.
 *
 * `header` remplace l'en-tête simple d'une colonne (la liste d'entités y pose les têtes triables) ;
 * `rowAttributes` pose les ancres de recette (`data-admin-contact="…"`) sur la rangée ET sur la carte.
 */
export function AdminResponsiveRows<Row>({
  columns,
  rows,
  rowKey,
  rowTarget = () => null,
  caption,
  stale = false,
  header,
  rowAttributes,
}: {
  readonly columns: readonly AdminColumn<Row>[];
  readonly rows: readonly Row[];
  readonly rowKey: (row: Row) => string;
  readonly rowTarget?: (row: Row) => AdminTarget | null;
  readonly caption: string;
  /** La page précédente reste affichée, atténuée, pendant que la suivante arrive. */
  readonly stale?: boolean;
  readonly header?: (column: AdminColumn<Row>) => ReactNode;
  readonly rowAttributes?: (row: Row) => Readonly<Record<string, string>>;
}) {
  const tableColumns = columns.filter((column) => columnPriority(column) <= 3);
  const cardColumns = columns.filter((column) => columnPriority(column) <= 2);
  const primary = columns.find((column) => column.primary === true);
  const plainHeader = (column: AdminColumn<Row>) => (
    <PlainTh key={column.id} className={`${column.align === 'end' ? 'text-end' : ''} ${columnPriority(column) === 3 ? 'hidden @5xl:table-cell' : ''}`.trim()}>
      {column.header}
    </PlainTh>
  );

  return (
    <>
      <div className="hidden overflow-x-auto rounded-card @3xl:block" style={{ border: `1px solid ${EDGE}`, backgroundColor: SURFACE }}>
        <table className="w-full border-collapse text-start">
          <caption className="sr-only">{caption}</caption>
          <thead>
            <tr>{tableColumns.map(header ?? plainHeader)}</tr>
          </thead>
          <tbody aria-busy={stale} style={{ opacity: stale ? 0.6 : 1 }}>
            {rows.map((row) => (
              <tr
                key={rowKey(row)}
                data-admin-row={rowKey(row)}
                {...(rowAttributes?.(row) ?? {})}
                className="transition-colors hover:bg-[color-mix(in_srgb,var(--color-ios-ink-3)_6%,transparent)]"
                style={{ height: 52 }}
              >
                {tableColumns.map((column) => (
                  <Td key={column.id} className={`${column.align === 'end' ? 'text-end tabular-nums' : ''} ${columnPriority(column) === 3 ? 'hidden @5xl:table-cell' : ''}`.trim()}>
                    {column.primary === true ? <PrimaryCell target={rowTarget(row)}>{column.cell(row)}</PrimaryCell> : column.cell(row)}
                  </Td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <AdminCardMode value>
        <ul className="grid gap-3 @3xl:hidden" aria-busy={stale} style={{ opacity: stale ? 0.6 : 1 }}>
          {rows.map((row) => (
            <li
              key={rowKey(row)}
              data-admin-card={rowKey(row)}
              {...(rowAttributes?.(row) ?? {})}
              className="grid gap-2 rounded-card p-4"
              style={{ backgroundColor: SURFACE, border: `1px solid ${EDGE}` }}
            >
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
      </AdminCardMode>
    </>
  );
}
