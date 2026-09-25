import { useEffect, useState } from 'react';

import { useSearch } from '@/lib/router';

import { parseListState, serializeListState, withSearch, type ListSpec, type ListState } from './list-state';

/**
 * L'état d'une liste d'administration, LU dans l'adresse et RÉÉCRIT en place
 * (`replace` : trier dix fois ne doit pas coûter dix retours arrière).
 *
 * La recherche a son BROUILLON : l'adresse porte la requête nettoyée, le champ
 * garde ce qu'on tape (espaces compris) et ne l'écrit qu'après une courte
 * pause — une frappe n'est pas une navigation.
 */
export function useAdminListState<S extends string, F extends string>(spec: ListSpec<S, F>) {
  const [search, setSearch] = useSearch();
  const state = parseListState(search, spec);
  const [brouillon, setBrouillon] = useState(state.q);

  const ecrire = (suivant: ListState<S, F>) => setSearch(serializeListState(suivant, spec), true);

  useEffect(() => {
    if (brouillon.trim() === state.q) return undefined;
    const minuteur = setTimeout(() => ecrire(withSearch(state, brouillon.trim())), 250);
    return () => clearTimeout(minuteur);
  });

  return { state, write: ecrire, draft: brouillon, setDraft: setBrouillon, address: serializeListState(state, spec).toString() };
}
