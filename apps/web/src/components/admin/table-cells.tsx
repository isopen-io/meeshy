import type { ReactNode } from 'react';

import type { SortOrder } from '@/lib/admin/list-state';
import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';

import { BRAND, EDGE, INK, INK2 } from './tone';

/**
 * **LES CELLULES D'UN TABLEAU D'ADMINISTRATION** (#7873, reprises par le kit en #9463) — en-tête
 * simple, en-tête triable, cellule. `AdminResponsiveRows` et `AdminEntityList` les posent, et les
 * tableaux d'un écran de pilotage (langues, surveillance, classement) aussi : une colonne se lit
 * et se trie de la MÊME façon partout.
 *
 * L'en-tête triable porte `aria-sort` sur la cellule et un vrai `<button>` dedans : un lecteur
 * d'écran annonce l'ordre courant, et le clavier trie sans souris. Le bouton fait 44 px (la cible
 * tactile minimale, WCAG 2.5.5).
 */

export function PlainTh({ children, className = '' }: { readonly children?: ReactNode; readonly className?: string }) {
  return (
    <th scope="col" className={`px-4 py-3 text-caption font-medium ${className}`} style={{ color: INK2, borderBottom: `1px solid ${EDGE}` }}>
      {children}
    </th>
  );
}

export function SortableTh({
  language,
  label,
  column,
  sort,
  order,
  onSort,
  className = '',
}: {
  readonly language: AdminLanguage;
  readonly label: string;
  readonly column: string;
  readonly sort: string;
  readonly order: SortOrder;
  readonly onSort: () => void;
  readonly className?: string;
}) {
  const actif = column === sort;
  const ariaSort = actif ? (order === 'asc' ? 'ascending' : 'descending') : 'none';
  return (
    <th scope="col" aria-sort={ariaSort} className={`px-2 py-1 ${className}`} style={{ borderBottom: `1px solid ${EDGE}` }}>
      <button
        type="button"
        data-admin-sort={column}
        onClick={onSort}
        aria-label={translateAdmin(language, 'admin.list.sortBy', { column: label })}
        className="flex items-center gap-1 rounded-chip px-2 text-caption font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
        style={{ minHeight: 44, color: actif ? BRAND : INK2, outlineColor: BRAND }}
      >
        <span>{label}</span>
        <span aria-hidden="true" className="tabular-nums">
          {actif ? (order === 'asc' ? '▲' : '▼') : '↕'}
        </span>
      </button>
    </th>
  );
}

export function Td({ children, className = '' }: { readonly children?: ReactNode; readonly className?: string }) {
  return (
    <td className={`px-4 py-3 align-middle text-body ${className}`} style={{ color: INK, borderBottom: `1px solid ${EDGE}` }}>
      {children}
    </td>
  );
}
