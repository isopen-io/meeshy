import { useInfiniteQuery } from '@tanstack/react-query';
import { useStore } from 'zustand/react';

import { apiDeps } from '@/lib/api/deps';
import { friendRequestsQueryOptions, pendingRequestsOf } from '@/lib/api/friend-requests';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';

/**
 * **LE COMPTE DES DEMANDES REÇUES** (#6321) — miroir de
 * `FriendshipCache.shared.pendingReceivedCount` que `RootView.menuBadgeCount`
 * pose sur le barreau « Découvrir » (`RootView.swift:1740-1745`).
 *
 * Il lit le panier `received` de `friend-requests.ts` — la MÊME entrée de cache
 * que l'onglet « Demandes » et le compte du profil (D-62) : accepter ou refuser
 * retire la ligne de ce panier au tap (`friend-actions.ts`), et la pastille
 * baisse dans la même image ; `friend-request:*` l'invalide (`socket.ts`).
 *
 * La page porte cent lignes : au-delà, le compte vaut 100 et la pastille dit
 * « 99+ » (`unreadBadgeText`) — jamais un nombre exact qu'on n'a pas lu.
 *
 * Sans session sur la passerelle, aucune requête : un 401 fermerait une
 * session qui n'existe pas.
 */
export function usePendingFriendRequestCount(): number {
  const authenticated = useStore(sessionStore, (state) => state.session.status === 'authenticated');
  const received = useInfiniteQuery(
    {
      ...friendRequestsQueryOptions(apiDeps, 'received'),
      enabled: apiDeps.source === 'fixtures' || authenticated,
      staleTime: 30_000,
    },
    appQueryClient,
  );
  return pendingRequestsOf(received.data)?.count ?? 0;
}
