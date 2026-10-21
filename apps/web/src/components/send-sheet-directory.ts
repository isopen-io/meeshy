import { useEffect, useMemo, useState } from 'react';
import { useInfiniteQuery, useQuery } from '@tanstack/react-query';

import { COMMUNITIES_STALE_TIME } from '@/lib/api/communities';
import { apiDeps } from '@/lib/api/deps';
import { flattenFriendRequests, friendRequestsQueryOptions, type PersonSummary } from '@/lib/api/friend-requests';
import { useConversations } from '@/lib/api/query';
import { appQueryClient } from '@/lib/api/query-client';
import { loadMyCommunities, myCommunitiesQueryKey, searchConversations } from '@/lib/api/share-directory';
import type { Conversation } from '@/lib/api/types';
import { searchUsers } from '@/lib/api/users-search';
import { friendsOf } from '@/lib/conversation-new/candidates';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';

import type { CommunityNames } from './send-sheet-model';

/**
 * À QUI ENVOYER — les sources de l'écran de partage (#8884, #10948), lues dans
 * les MÊMES caches que la Lentille et « Nouvelle conversation ». CACHE D'ABORD :
 * les conversations et les amis s'affichent aussitôt, même anciens, et se
 * mettent à jour sans bruit ; un squelette seulement sur un cache VIDE.
 *
 * - les conversations : `useConversations()` (la liste de la Lentille) ;
 * - les amis : le panier persisté des amitiés acceptées — les contacts du
 *   carnet que l'app a déjà appariés y sont, inscrits et amis ;
 * - la recherche SERVEUR, amortie, dès deux caractères, FUSIONNÉE : les
 *   personnes (`['users', 'search', q]`, la clé de « Nouvelle conversation »)
 *   et les conversations hors cache (`/conversations/search`) ;
 * - les communautés dont on est membre (`/communities/mine`) : leur nom, pour
 *   ranger dessous les canaux où l'on écrit (D11).
 *
 * Monté SEULEMENT pendant que l'écran est ouvert.
 */
export type SendSheetDirectory = {
  readonly conversations: readonly Conversation[];
  readonly friends: readonly PersonSummary[];
  readonly searchResults: readonly PersonSummary[] | undefined;
  readonly conversationResults?: readonly Conversation[];
  readonly communities?: CommunityNames;
  /** Vrai seulement sur un cache VIDE (démarrage à froid) — jamais un squelette sur des données. */
  readonly loading: boolean;
};

export type UseSendSheetDirectory = (params: { readonly viewerId: string; readonly query: string }) => SendSheetDirectory;

const SEARCH_DEBOUNCE_MS = 250;
const MIN_QUERY_LENGTH = 2;

const unwrapped = async <T,>(result: Promise<{ readonly ok: true; readonly data: T } | { readonly ok: false; readonly error: string }>): Promise<T> => {
  const settled = await result;
  if (!settled.ok) throw new Error(settled.error);
  return settled.data;
};

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

  const people = useQuery({ queryKey: ['users', 'search', trimmed], queryFn: () => unwrapped(searchUsers(apiDeps, trimmed)), enabled: enabled && searching }, appQueryClient);
  const found = useQuery(
    { queryKey: ['conversations', 'search', trimmed], queryFn: () => unwrapped(searchConversations(apiDeps, trimmed)), enabled: enabled && searching },
    appQueryClient,
  );
  const mine = useQuery(
    { queryKey: myCommunitiesQueryKey, queryFn: () => unwrapped(loadMyCommunities(apiDeps)), enabled, staleTime: COMMUNITIES_STALE_TIME },
    appQueryClient,
  );
  const communities = useMemo(
    (): CommunityNames => Object.fromEntries((mine.data ?? []).map((community) => [community.id, { name: community.name, avatar: community.avatar }])),
    [mine.data],
  );

  return {
    conversations: conversations.data ?? [],
    friends,
    searchResults: searching ? people.data : undefined,
    conversationResults: searching ? (found.data ?? []) : [],
    communities,
    loading: conversations.isPending,
  };
};
