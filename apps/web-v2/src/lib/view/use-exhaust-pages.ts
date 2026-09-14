import { useEffect } from 'react';
import type { UseInfiniteQueryResult } from '@tanstack/react-query';

/**
 * **UN PANIER SANS SENTINELLE VISIBLE DOIT SE CHARGER SEUL** (#6421) — miroir
 * de `FriendshipCache.fetchAllPages` (iOS,
 * `packages/MeeshySDK/Sources/MeeshySDK/Cache/FriendshipCache.swift`). Un
 * panier utilisé pour construire un INDEX de relation (« cette personne
 * est-elle un contact ? un bloqué ? ») décide d'un geste pour TOUTE la
 * recherche — pas seulement pour les cent premières lignes. La sentinelle de
 * défilement (`use-load-more-sentinel.ts`) ne le charge que si une LISTE le
 * rend visible ; `accepted` (jamais rendu en liste) et `blocked` (rendu
 * seulement sous l'onglet Bloqués) restent alors tronqués à leur première
 * page tant que personne n'a fait défiler la bonne liste.
 */
export type ExhaustibleQuery = Pick<
  UseInfiniteQueryResult,
  'data' | 'hasNextPage' | 'isFetchingNextPage' | 'isFetchNextPageError' | 'fetchNextPage'
>;

export function useExhaustPages(query: ExhaustibleQuery, enabled: boolean): void {
  const { data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage } = query;
  useEffect(() => {
    if (!enabled || data === undefined || !hasNextPage || isFetchingNextPage || isFetchNextPageError) return;
    void fetchNextPage();
  }, [enabled, data, hasNextPage, isFetchingNextPage, isFetchNextPageError, fetchNextPage]);
}
