import type { ReactNode } from 'react';

import { translateAdmin, type AdminLanguage } from '@/lib/i18n-admin-catalog';
import type { AdminOption } from '@/routes/admin-table';

import { AdminGlyph } from './admin-glyph';
import { BRAND, EDGE, INK, INK2, SURFACE } from './tone';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-2';

const FIELD = { minHeight: 44, backgroundColor: SURFACE, border: `1px solid ${EDGE}`, color: INK, outlineColor: BRAND } as const;

export type AdminToolbarFilter = {
  readonly id: string;
  readonly label: string;
  readonly value: string;
  readonly options: readonly AdminOption[];
  readonly onChange: (value: string) => void;
};

/**
 * **LA BARRE D'UNE LISTE** (#8876) — recherche, filtres, « Réinitialiser »,
 * compteur. Elle ne DESSINE que ce que la passerelle sert : pas de `search` ⇒
 * pas de champ de recherche (un champ qui ne filtre rien est un contrôle sans
 * effet, loi 4) ; un filtre que la passerelle n'a pas n'est pas dans `filters`.
 *
 * « Réinitialiser » n'existe que si quelque chose est posé : un bouton qui ne
 * change rien n'a pas à être là. Tout passe à la ligne (`flex-wrap`) : à 375 px
 * la barre tient sur plusieurs lignes, jamais en défilement horizontal.
 */
export function AdminListToolbar({
  language,
  search,
  filters,
  onReset,
  trailing,
}: {
  readonly language: AdminLanguage;
  readonly search?: { readonly label: string; readonly value: string; readonly onChange: (q: string) => void };
  readonly filters?: readonly AdminToolbarFilter[];
  readonly onReset?: () => void;
  readonly trailing?: ReactNode;
}) {
  const active = (search?.value.trim() ?? '') !== '' || (filters ?? []).some((filter) => filter.value !== '');

  return (
    <div data-admin-toolbar className="flex flex-wrap items-end gap-3">
      {search === undefined ? null : (
        <label className="grid min-w-[12rem] flex-1 gap-1">
          <span className="text-caption" style={{ color: INK2 }}>
            {search.label}
          </span>
          <span className="relative flex items-center">
            <span aria-hidden="true" className="pointer-events-none absolute start-3" style={{ color: INK2 }}>
              <AdminGlyph name="magnifyingGlass" size={16} />
            </span>
            <input
              type="search"
              data-admin-search
              value={search.value}
              /* `onInput`, la convention des champs texte du dépôt (voir `sheet.tsx`) : un `onChange` n'y est jamais rappelé sous happy-dom. */
              onInput={(event) => search.onChange(event.currentTarget.value)}
              onChange={() => undefined}
              className={`w-full rounded-chip ps-10 pe-4 text-body ${FOCUS}`}
              style={FIELD}
            />
          </span>
        </label>
      )}
      {(filters ?? []).map((filter) => (
        <label key={filter.id} className="grid gap-1">
          <span className="text-caption" style={{ color: INK2 }}>
            {filter.label}
          </span>
          <select
            data-admin-filter={filter.id}
            value={filter.value}
            onChange={(event) => filter.onChange(event.target.value)}
            className={`rounded-chip px-3 text-body ${FOCUS}`}
            style={FIELD}
          >
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </label>
      ))}
      {active && onReset !== undefined ? (
        <button
          type="button"
          data-admin-list-reset
          onClick={onReset}
          className={`inline-flex items-center gap-1 rounded-chip px-4 text-body font-medium ${FOCUS}`}
          style={{ minHeight: 44, color: BRAND, outlineColor: BRAND }}
        >
          <AdminGlyph name="x" size={14} />
          {translateAdmin(language, 'admin.list.reset')}
        </button>
      ) : null}
      {trailing === undefined ? null : (
        <span data-admin-toolbar-count className="ms-auto text-caption tabular-nums" style={{ color: INK2 }}>
          {trailing}
        </span>
      )}
    </div>
  );
}

export type AdminChipOption = { readonly value: string; readonly label: string; readonly count?: string };

/**
 * **DES FILTRES RAPIDES EN PUCES** (#8876) — un seul choix actif à la fois, posé
 * en un geste (les statuts d'un signalement, les types d'une publication). Le
 * choix actif porte `aria-pressed` ET un fond : la sélection ne repose jamais sur
 * la seule couleur. Chaque puce est une cible de 44 px.
 */
export function AdminFilterChips({
  label,
  options,
  value,
  onChange,
}: {
  readonly label: string;
  readonly options: readonly AdminChipOption[];
  readonly value: string;
  readonly onChange: (value: string) => void;
}) {
  return (
    <div role="group" aria-label={label} data-admin-chips className="flex flex-wrap gap-2">
      {options.map((option) => {
        const pressed = option.value === value;
        return (
          <button
            key={option.value}
            type="button"
            aria-pressed={pressed}
            data-admin-chip={option.value}
            onClick={() => onChange(option.value)}
            className={`inline-flex items-center gap-2 rounded-chip px-4 text-body font-medium ${FOCUS}`}
            style={{
              minHeight: 44,
              outlineColor: BRAND,
              color: pressed ? BRAND : INK,
              border: `1px solid ${pressed ? BRAND : EDGE}`,
              backgroundColor: pressed ? 'color-mix(in srgb, var(--color-ios-brand) 12%, transparent)' : SURFACE,
            }}
          >
            {pressed ? <AdminGlyph name="check" size={14} /> : null}
            {option.label}
            {option.count === undefined ? null : (
              <span className="text-caption tabular-nums" style={{ color: INK2 }}>
                {option.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}
