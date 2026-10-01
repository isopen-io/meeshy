import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { apiDeps } from '@/lib/api/deps';
import { flattenFriendRequests, friendRequestsQueryOptions, type PersonSummary } from '@/lib/api/friend-requests';
import { useConversations } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import type { Conversation } from '@/lib/api/types';
import { searchUsers } from '@/lib/api/users-search';
import { friendsOf } from '@/lib/conversation-new/candidates';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';

/**
 * À QUI ENVOYER — les trois sources de la feuille d'envoi (#8884), lues dans
 * les MÊMES caches que la Lentille et « Nouvelle conversation » : aucune route
 * neuve, aucune clé neuve.
 *
 * - les conversations : `useConversations()` — cache-first, la liste servie
 *   est celle que la Lentille montre (l'ancienne feuille de transfert en donnait la raison) ;
 * - les amis : le panier persisté des amitiés acceptées ;
 * - la recherche globale : amortie, dès deux caractères, sous la clé que
 *   « Nouvelle conversation » partage (`['users', 'search', q]`).
 *
 * Monté SEULEMENT pendant que la feuille est ouverte : ouvrir un écran ne
 * déclenche aucune de ces requêtes.
 */
export type SendSheetDirectory = {
  readonly conversations: readonly Conversation[];
  readonly friends: readonly PersonSummary[];
  readonly searchResults: readonly PersonSummary[] | undefined;
  /** Vrai seulement sur un cache VIDE (démarrage à froid) — jamais un squelette sur des données. */
  readonly loading: boolean;
};

export type UseSendSheetDirectory = (params: { readonly viewerId: string; readonly query: string }) => SendSheetDirectory;

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

export const useSendSheetDirectory: UseSendSheetDirectory = ({ viewerId, query }) => {
  const [debounced, setDebounced] = useState(query);
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);
  const trimmed = debounced.trim();
  const searching = trimmed.length >= MIN_QUERY_LENGTH;
  const enabled = viewerId !== '';

  const conversations = useConversations();
  const accepted = useInfiniteQuery({ ...friendRequestsQueryOptions(apiDeps, 'accepted'), enabled }, appQueryClient);
  useExhaustPages(accepted, enabled);
  const friends = useMemo(() => friendsOf({ accepted: flattenFriendRequests(accepted.data), viewerId }), [accepted.data, viewerId]);

  const results = useQuery({
    queryKey: ['users', 'search', trimmed],
    queryFn: async () => {
      const result = await searchUsers(apiDeps, trimmed);
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    enabled: enabled && searching,
  });

  return {
    conversations: conversations.data ?? [],
    friends,
    searchResults: searching ? results.data : undefined,
    loading: conversations.isPending,
  };
};
