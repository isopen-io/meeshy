import { useId, type KeyboardEvent } from 'react';

import { useSearch } from '@/lib/router';

import { BRAND, EDGE, INK, INK2 } from './tone';

export type AdminTabDefinition<T extends string> = { readonly id: T; readonly label: string; readonly count?: string };

const isRtl = (): boolean => typeof document !== 'undefined' && document.documentElement.dir === 'rtl';

/**
 * **DES ONGLETS ARIA** (#8876) — `role="tablist"`, un seul onglet dans l'ordre de
 * tabulation (celui qui est actif : la tabulation traverse la liste d'un coup,
 * les flèches la parcourent), Début/Fin, et les flèches INVERSÉES en arabe — la
 * flèche droite avance dans le sens de la lecture, donc recule à droite-gauche.
 * Activation automatique : un onglet qui prend le focus est ouvert.
 *
 * L'onglet actif porte `aria-selected` ET un filet de 2 px sous son libellé : la
 * sélection ne repose jamais sur la seule couleur.
 */
export function AdminTabs<T extends string>({
  label,
  tabs,
  active,
  onChange,
}: {
  readonly label: string;
  readonly tabs: readonly AdminTabDefinition<T>[];
  readonly active: T;
  readonly onChange: (tab: T) => void;
}) {
  const uid = useId();

  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>, index: number) => {
    const step = isRtl() ? -1 : 1;
    const target =
      event.key === 'ArrowRight'
        ? index + step
        : event.key === 'ArrowLeft'
          ? index - step
          : event.key === 'Home'
            ? 0
            : event.key === 'End'
              ? tabs.length - 1
              : null;
    if (target === null) return;
    event.preventDefault();
    const next = tabs[(target + tabs.length) % tabs.length];
    if (next === undefined) return;
    onChange(next.id);
    document.getElementById(`${uid}-${next.id}`)?.focus();
  };

  return (
    <div role="tablist" aria-label={label} data-admin-tabs className="flex gap-1 overflow-x-auto" style={{ borderBottom: `1px solid ${EDGE}` }}>
      {tabs.map((tab, index) => {
        const selected = tab.id === active;
        return (
          <button
            key={tab.id}
            id={`${uid}-${tab.id}`}
            type="button"
            role="tab"
            aria-selected={selected}
            tabIndex={selected ? 0 : -1}
            data-admin-tab={tab.id}
            onClick={() => onChange(tab.id)}
            onKeyDown={(event) => onKeyDown(event, index)}
            className="inline-flex shrink-0 items-center gap-2 px-4 text-body font-medium focus-visible:outline-2 focus-visible:outline-offset-2"
            style={{
              minHeight: 44,
              outlineColor: BRAND,
              color: selected ? BRAND : INK2,
              borderBottomWidth: 2,
              borderBottomStyle: 'solid',
              borderBottomColor: selected ? BRAND : 'transparent',
              marginBottom: -1,
            }}
          >
            <span style={{ color: selected ? BRAND : INK }}>{tab.label}</span>
            {tab.count === undefined ? null : (
              <span className="text-caption tabular-nums" style={{ color: INK2 }}>
                {tab.count}
              </span>
            )}
          </button>
        );
      })}
    </div>
  );
}

/**
 * L'ONGLET ACTIF, DANS L'ADRESSE (`?tab=`) — lu avec une liste blanche (un onglet
 * inconnu retombe sur `fallback`), réécrit en place : changer d'onglet dix fois ne
 * coûte pas dix retours arrière, et un lien partagé rouvre le bon onglet.
 */
export function useAdminTab<T extends string>(ids: readonly T[], fallback: T): readonly [T, (tab: T) => void] {
  const [search, setSearch] = useSearch();
  const requested = search.get('tab') ?? '';
  const active = ids.find((id) => id === requested) ?? fallback;

  const change = (tab: T) => {
    const next = new URLSearchParams(search);
    if (tab === fallback) next.delete('tab');
    else next.set('tab', tab);
    setSearch(next, true);
  };
  return [active, change];
}
