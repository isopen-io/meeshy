import { useEffect, useRef, useState } from 'react';

import { useSearch } from '@/lib/router';

import { parseListState, serializeListState, withSearch, type ListSpec, type ListState } from './list-state';

/**
 * L'état d'une liste d'administration, LU dans l'adresse et RÉÉCRIT en place
 * (`replace` : trier dix fois ne doit pas coûter dix retours arrière).
 *
 * La recherche a son BROUILLON : l'adresse porte la requête nettoyée, le champ
 * garde ce qu'on tape (espaces compris) et ne l'écrit qu'après une courte
 * pause — une frappe n'est pas une navigation.
 *
 * **Le brouillon suit l'adresse quand c'est l'ADRESSE qui bouge.** Une navigation vers la
 * même liste sans `?q=` (un lien du tableau de bord, le retour arrière) laissait l'ancien
 * brouillon dans le champ, et la pause d'écriture le RÉÉCRIVAIT dans l'adresse 250 ms plus
 * tard : la recherche qu'on venait de quitter revenait seule. La dernière requête que le
 * crochet a lui-même écrite est retenue ; une adresse qui change POUR UNE AUTRE valeur
 * est une navigation extérieure, et le brouillon la reprend.
 */
export function useAdminListState<S extends string, F extends string, I extends string = never>(spec: ListSpec<S, F, I>) {
  const [search, setSearch] = useSearch();
  const state = parseListState(search, spec);
  const [brouillon, setBrouillon] = useState(state.q);
  const derniereRequete = useRef(state.q);

  const ecrire = (suivant: ListState<S, F, I>) => {
    derniereRequete.current = suivant.q;
    setSearch(serializeListState(suivant, spec), true);
  };

  useEffect(() => {
    if (state.q === derniereRequete.current) return;
    derniereRequete.current = state.q;
    setBrouillon(state.q);
  }, [state.q]);

  useEffect(() => {
    if (brouillon.trim() === state.q) return undefined;
    const minuteur = setTimeout(() => ecrire(withSearch(state, brouillon.trim())), 250);
    return () => clearTimeout(minuteur);
  });

  return { state, write: ecrire, draft: brouillon, setDraft: setBrouillon, address: serializeListState(state, spec).toString() };
}
