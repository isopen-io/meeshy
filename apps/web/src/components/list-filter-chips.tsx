import { useState } from 'react';

import { filterLabel, LIST_FILTERS, type ListFilter, type ListSelection } from '@/lib/lens/filters';
import { rowMenuText } from '@/lib/i18n-row-menu-catalog';
import type { InterfaceLanguage } from '@/lib/interface-language';

/**
 * **LES PUCES DE LA LISTE : QUATRE AU REPOS, LE RARE DERRIÈRE « PLUS »** (épure #18361, règle 6).
 *
 * Tous · Non lus · Personnel · Privée sont l'usage nominal ; Ouvertes, Globales, Channels, Favoris, Épinglés et
 * Archivées se rangent derrière « Plus » au lieu de déborder hors de l'écran. Rien n'est retiré : « Plus » les ouvre
 * dans l'ordre des puces, et une puce rangée qui est POSÉE reste à l'écran — jamais un filtre actif qu'on ne voit pas.
 *
 * La composition de la sélection (`toggleFilter`) reste l'affaire de l'hôte : ce composant ne fait que montrer.
 */
const AT_REST: readonly ListFilter[] = ['all', 'unread', 'personal', 'private'];

const chipClass = 'rounded-chip px-3 py-1.5 text-title font-medium whitespace-nowrap transition-colors';

const chipStyle = (active: boolean) =>
  active
    ? { backgroundColor: 'var(--color-ios-brand)', color: 'var(--color-ios-on-brand)' }
    : { backgroundColor: 'var(--color-ios-card)', color: 'var(--color-ios-ink-2)', border: '0.5px solid var(--color-edge)' };

export function ListFilterChips({
  selection,
  language,
  onToggle,
}: {
  readonly selection: ListSelection;
  readonly language: InterfaceLanguage;
  readonly onToggle: (filter: ListFilter) => void;
}) {
  const [opened, setOpened] = useState(false);
  const shown = opened ? LIST_FILTERS : LIST_FILTERS.filter((filter) => AT_REST.includes(filter) || selection.includes(filter));
  return (
    <ul className="flex gap-2 px-4 py-1.5">
      {shown.map((filter) => {
        const active = selection.includes(filter);
        return (
          <li key={filter}>
            <button type="button" data-list-filter={filter} onClick={() => onToggle(filter)} aria-pressed={active} className={`${chipClass} btn-press`} style={chipStyle(active)}>
              {filterLabel(filter, language)}
            </button>
          </li>
        );
      })}
      <li>
        <button
          type="button"
          data-list-filters-more
          onClick={() => setOpened(!opened)}
          aria-expanded={opened}
          className={`${chipClass} btn-press`}
          style={chipStyle(false)}
        >
          {rowMenuText(language, 'listFilter.more')}
        </button>
      </li>
    </ul>
  );
}
