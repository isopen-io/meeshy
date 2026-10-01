import type { SortOrder } from '@/lib/admin/list-state';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { BRAND, EDGE, INK, INK2, SURFACE } from './tone';

export type AdminSortOption = { readonly value: string; readonly label: string };

/**
 * **LE TRI DES CARTES** (#8876) — une liste d'entités se trie par un clic sur l'en-tête de sa
 * colonne ; sous le seuil du tableau il n'y a plus d'en-tête, et une liste dont le tri ne se
 * faisait qu'au tableau devenait immuable sur un téléphone. Un seul composant, pour toutes les
 * listes : un « Trier par » étiqueté (les colonnes triables, que la passerelle trie vraiment)
 * et un bouton qui inverse l'ordre.
 *
 * Il n'est PAS un filtre : il ne compte pas dans « quelque chose est posé », donc il ne fait
 * jamais apparaître « Réinitialiser » sur une liste intacte. Il disparaît avec le tableau, qui
 * porte alors les mêmes tris dans ses en-têtes.
 */
export function AdminSortControl({
  language,
  options,
  sort,
  order,
  onSort,
}: {
  readonly language: AdminLanguage;
  readonly options: readonly AdminSortOption[];
  readonly sort: string;
  readonly order: SortOrder;
  /** Une autre clé : la liste adopte son ordre par défaut ; la même clé : elle inverse l'ordre. */
  readonly onSort: (key: string) => void;
}) {
  if (options.length === 0) return null;
  const current = translateAdmin(language, order === 'asc' ? 'admin.kit.sort.ascending' : 'admin.kit.sort.descending');

  return (
    <div data-admin-sort-control className="flex items-end gap-2 @3xl:hidden">
      <label className="grid min-w-0 flex-1 gap-1">
        <span className="text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.kit.sort.label')}
        </span>
        <select
          data-admin-sort-select
          value={sort}
          onChange={(event) => {
            if (event.target.value !== sort) onSort(event.target.value);
          }}
          className="rounded-chip px-3 text-body focus-visible:outline-2 focus-visible:outline-offset-2"
          style={{ minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND }}
        >
          {options.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>
      <button
        type="button"
        data-admin-sort-direction={order}
        aria-label={translateAdmin(language, 'admin.kit.sort.reverse', { order: current })}
        onClick={() => onSort(sort)}
        className="inline-flex shrink-0 items-center gap-1 rounded-chip px-3 text-body font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, minWidth: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND }}
      >
        <span aria-hidden="true" className="tabular-nums">
          {order === 'asc' ? '▲' : '▼'}
        </span>
        <span aria-hidden="true">{current}</span>
      </button>
    </div>
  );
}
