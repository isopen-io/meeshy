import { useInfiniteQuery, useQuery } from '@tanstack/react-query';
import { useEffect, useMemo, useState } from 'react';
import { useStore } from 'zustand/react';

import type { CommunityActionDeps } from '@/lib/api/community-actions';
import { flattenFriendRequests, friendRequestsQueryOptions } from '@/lib/api/friend-requests';
import { sessionStore } from '@/lib/api/session';
import { searchUsers } from '@/lib/api/users-search';
import { resolveViewer } from '@/lib/api/viewer';
import { candidatesFor, friendsOf, type NewConversationCandidates } from '@/lib/conversation-new/candidates';
import { useExhaustPages } from '@/lib/view/use-exhaust-pages';

/**
 * **QUI PROPOSER À UNE COMMUNAUTÉ** (#6376) — la source UNIQUE des personnes
 * que l'on peut ajouter, lue par la feuille « Inviter » du détail ET par la
 * création. Les AMIS viennent du cache persisté (aucune attente réseau dès
 * qu'un écran les a chargés), filtrés localement à chaque lettre ; la
 * recherche de la passerelle ne part qu'à deux lettres, après une pause de
 * frappe, et n'apporte que ce que les amis ne contiennent pas. Le lecteur
 * n'est jamais proposé.
 */

const SEARCH_DEBOUNCE_MS = 250;
export const MIN_PEOPLE_QUERY_LENGTH = 2;

export type PeopleCandidates = NewConversationCandidates & {
  readonly searching: boolean;
  readonly fetching: boolean;
};

export function usePeopleCandidates({ deps, query }: { readonly deps: CommunityActionDeps; readonly query: string }): PeopleCandidates {
  const session = useStore(sessionStore, (state) => state.session);
  const viewerId = resolveViewer({ source: deps.source, session }).id ?? null;
  const [debounced, setDebounced] = useState('');

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query), SEARCH_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const accepted = useInfiniteQuery(friendRequestsQueryOptions(deps, 'accepted'), deps.queryClient);
  useExhaustPages(accepted, true);
  const friends = useMemo(() => friendsOf({ accepted: flattenFriendRequests(accepted.data), viewerId }), [accepted.data, viewerId]);

  const trimmed = debounced.trim();
  const searching = trimmed.length >= MIN_PEOPLE_QUERY_LENGTH;
  const results = useQuery(
    {
      queryKey: ['users', 'search', trimmed],
      queryFn: async () => {
        const result = await searchUsers(deps, trimmed);
        if (!result.ok) throw new Error(result.error);
        return result.data;
      },
      enabled: searching,
    },
    deps.queryClient,
  );

  const view = candidatesFor({ friends, query, searchResults: searching ? results.data : undefined, viewerId });
  return { ...view, searching, fetching: searching && results.isFetching };
}
