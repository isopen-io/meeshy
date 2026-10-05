import { useState } from 'react';

import { navigate, useOptionalRoute } from '@/lib/router';

/**
 * **LA MODALE OUVERTE, DANS L'ADRESSE** (`?open=<id>`, spec 2026-10-04 § 1) —
 * la jumelle de `useAdminTab` (`components/admin/tabs.tsx`) pour le patron
 * « synthèse → modale » : une carte résumée ouvre le détail de sa zone dans une
 * `AdminDetailSheet`, et l'adresse dit laquelle.
 *
 * - Lue avec une LISTE BLANCHE : un `?open=` inconnu n'ouvre rien.
 * - **Ouvrir POUSSE une entrée** marquée (`history.state.adminOpen`) : le retour
 *   du navigateur — ou le retour matériel d'Android — consomme cette entrée,
 *   l'adresse perd `?open=` et la modale se démonte. Un lien copié rouvre la
 *   même modale.
 * - **Fermer** (croix, Échap) rend NOTRE entrée par `history.back()` quand elle
 *   est l'entrée courante — sinon (la modale est arrivée par un lien, ou une
 *   navigation s'est intercalée) l'adresse est RÉÉCRITE en place : reculer
 *   quitterait l'écran.
 * - `legacyTab` : un `?tab=<id>` connu ouvre la modale du même nom — les liens
 *   des fiches à onglets d'hier restent bons. Fermer l'efface aussi, sans quoi
 *   la modale se rouvrirait aussitôt.
 *
 * Hors routeur (un témoin qui monte un panneau seul), l'état reste LOCAL : la
 * même interface, sans adresse.
 */
export type AdminOpen<T extends string> = {
  /** La modale ouverte, ou `null`. */
  readonly active: T | null;
  readonly open: (id: T) => void;
  readonly close: () => void;
  /** `true` quand l'ouverture vit dans l'adresse (sous le routeur) : la feuille n'a pas à poser sa propre entrée. */
  readonly inAddress: boolean;
};

type OpenMarker = { readonly adminOpen?: unknown };

const markerOf = (state: unknown): unknown => (typeof state === 'object' && state !== null ? (state as OpenMarker).adminOpen : undefined);

const hrefWith = (search: URLSearchParams): string => {
  const chain = search.toString();
  return `${window.location.pathname}${chain === '' ? '' : `?${chain}`}`;
};

export function useAdminOpen<T extends string>(ids: readonly T[], options: { readonly legacyTab?: boolean } = {}): AdminOpen<T> {
  const route = useOptionalRoute();
  const [local, setLocal] = useState<T | null>(null);
  const legacyTab = options.legacyTab === true;

  const pick = (value: string | null): T | null => ids.find((id) => id === value) ?? null;

  if (route === null) {
    return { active: local, open: setLocal, close: () => setLocal(null), inAddress: false };
  }

  const search = route.search;
  const active = pick(search.get('open')) ?? (legacyTab ? pick(search.get('tab')) : null);

  const without = (): URLSearchParams => {
    const next = new URLSearchParams(window.location.search);
    next.delete('open');
    if (legacyTab && pick(next.get('tab')) !== null) next.delete('tab');
    return next;
  };

  const open = (id: T) => {
    const next = without();
    next.set('open', id);
    const href = hrefWith(next);
    navigate(href);
    window.history.replaceState({ ...(window.history.state as object | null), adminOpen: id }, '', href);
  };

  const close = () => {
    const current = new URLSearchParams(window.location.search);
    const shown = pick(current.get('open')) ?? (legacyTab ? pick(current.get('tab')) : null);
    if (shown === null) return;
    if (markerOf(window.history.state) === shown) {
      window.history.back();
      return;
    }
    navigate(hrefWith(without()), true);
  };

  return { active, open, close, inAddress: true };
}
