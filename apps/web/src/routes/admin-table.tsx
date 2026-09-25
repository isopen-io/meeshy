import type { ReactNode } from 'react';

import type { SortOrder } from '@/lib/admin/list-state';
import { translateAdmin } from '@/lib/i18n-admin-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES PIÈCES D'UNE LISTE D'ADMINISTRATION** (#7873) — barre de filtres,
 * en-tête triable, pagination. Une liste de comptes, d'anonymes ou de
 * conversations se lit de la MÊME façon : même geste pour trier, même place
 * pour filtrer, même pied de page.
 *
 * L'en-tête triable porte `aria-sort` sur la cellule et un vrai `<button>`
 * dedans : un lecteur d'écran annonce l'ordre courant, et le clavier trie sans
 * souris.
 */

const INK = 'var(--color-ios-ink)';
const INK2 = 'var(--color-ios-ink-2)';
const SURFACE = 'var(--color-ios-surface)';
const EDGE = 'var(--color-edge)';
const BRAND = 'var(--color-ios-brand)';

const CHAMP = {
  minHeight: 40,
  backgroundColor: SURFACE,
  border: `1px solid ${EDGE}`,
  color: INK,
} as const;

export function AdminFilterBar({ children }: { readonly children: ReactNode }) {
  return <div className="flex flex-wrap items-end gap-3 pb-4">{children}</div>;
}

export function AdminSearchField({
  label,
  value,
  onChange,
  anchor,
}: {
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly anchor: string;
}) {
  return (
    <label className="grid min-w-[12rem] flex-1 gap-1">
      <span className="text-caption" style={{ color: INK2 }}>
        {label}
      </span>
      <input
        type="search"
        value={value}
        {...{ [`data-${anchor}`]: '' }}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-chip px-4 text-body"
        style={CHAMP}
      />
    </label>
  );
}

export type AdminOption = { readonly value: string; readonly label: string };

export function AdminSelect({
  label,
  value,
  options,
  onChange,
  anchor,
}: {
  readonly label: string;
  readonly value: string;
  readonly options: readonly AdminOption[];
  readonly onChange: (value: string) => void;
  readonly anchor: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-caption" style={{ color: INK2 }}>
        {label}
      </span>
      <select
        value={value}
        {...{ [`data-${anchor}`]: '' }}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-chip px-3 text-body"
        style={CHAMP}
      >
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

export function AdminResetButton({ language, onReset }: { readonly language: InterfaceLanguage; readonly onReset: () => void }) {
  return (
    <button
      type="button"
      data-admin-list-reset
      onClick={onReset}
      className="rounded-chip px-4 text-body font-medium"
      style={{ minHeight: 40, color: BRAND }}
    >
      {translateAdmin(language, 'admin.list.reset')}
    </button>
  );
}

export function AdminTable({ children }: { readonly children: ReactNode }) {
  return (
    <div className="overflow-x-auto rounded-card" style={{ border: `1px solid ${EDGE}`, backgroundColor: SURFACE }}>
      <table className="w-full min-w-[40rem] border-collapse text-left">{children}</table>
    </div>
  );
}

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
  readonly language: InterfaceLanguage;
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
        style={{ minHeight: 40, color: actif ? BRAND : INK2, outlineColor: BRAND }}
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

export function AdminPager({
  language,
  offset,
  limit,
  count,
  total,
  hasMore,
  pageSizes,
  onPage,
}: {
  readonly language: InterfaceLanguage;
  readonly offset: number;
  readonly limit: number;
  readonly count: number;
  readonly total: number;
  readonly hasMore: boolean;
  readonly pageSizes: readonly number[];
  readonly onPage: (page: { readonly offset?: number; readonly limit?: number }) => void;
}) {
  const bouton = 'rounded-chip px-4 text-body font-semibold disabled:opacity-40';
  const fond = { minHeight: 40, backgroundColor: 'color-mix(in srgb, var(--color-ios-ink-3) 16%, transparent)', color: INK };
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 pt-4">
      <p className="text-caption tabular-nums" style={{ color: INK2 }} data-admin-list-range>
        {translateAdmin(language, 'admin.list.range', {
          from: String(count === 0 ? 0 : offset + 1),
          to: String(offset + count),
          total: String(total),
        })}
      </p>
      <div className="flex items-center gap-2">
        <label className="flex items-center gap-2 text-caption" style={{ color: INK2 }}>
          {translateAdmin(language, 'admin.list.pageSize')}
          <select
            value={String(limit)}
            data-admin-page-size
            onChange={(event) => onPage({ limit: Number(event.target.value) })}
            className="rounded-chip px-2 text-body"
            style={CHAMP}
          >
            {pageSizes.map((taille) => (
              <option key={taille} value={String(taille)}>
                {taille}
              </option>
            ))}
          </select>
        </label>
        <button type="button" data-admin-list-prev disabled={offset === 0} onClick={() => onPage({ offset: offset - limit })} className={bouton} style={fond}>
          {translateAdmin(language, 'admin.users.previous')}
        </button>
        <button type="button" data-admin-list-next disabled={!hasMore} onClick={() => onPage({ offset: offset + limit })} className={bouton} style={fond}>
          {translateAdmin(language, 'admin.users.next')}
        </button>
      </div>
    </div>
  );
}
