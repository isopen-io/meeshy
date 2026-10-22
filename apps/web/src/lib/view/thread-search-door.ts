import { useEffect } from 'react';

import { navigate } from '@/lib/router';

/**
 * LA PORTE « RECHERCHER » DU MENU D'UNE LIGNE (#11226) — `/c/<id>?search=1`
 * ouvre le fil sur sa recherche, comme `openConversation(_, searching: true)`
 * d'iOS arme `pendingOpenSearch` avant d'ouvrir la conversation.
 *
 * La demande se CONSOMME : une fois la recherche ouverte, l'adresse la perd
 * (`replace`, sans entrée d'historique), en gardant ses autres paramètres —
 * un retour, un rechargement ou un partage du lien ne rouvrent pas une
 * recherche qu'on a refermée.
 */
export const THREAD_SEARCH_PARAM = 'search';

export function threadSearchRequested(search: URLSearchParams | undefined): boolean {
  return search?.get(THREAD_SEARCH_PARAM) === '1';
}

export function useThreadSearchDoor(input: { readonly search: URLSearchParams | undefined; readonly openSearch: () => void }): void {
  const requested = threadSearchRequested(input.search);
  const { openSearch } = input;
  useEffect(() => {
    if (!requested || typeof window === 'undefined') return;
    openSearch();
    const rest = new URLSearchParams(window.location.search);
    rest.delete(THREAD_SEARCH_PARAM);
    const chain = rest.toString();
    navigate(`${window.location.pathname}${chain === '' ? '' : `?${chain}`}`, true);
    // UNE demande, UNE ouverture : la fonction d'ouverture n'est pas une
    // demande, et son identité neuve ne doit pas rouvrir la recherche.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [requested]);
}
