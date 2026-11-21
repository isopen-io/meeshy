import type { InfiniteData, QueryClient, QueryKey } from '@tanstack/react-query';

import {
  COMMUNITIES_QUERY_PREFIX,
  communityConversationsQueryKey,
  communityPostsQueryKey,
  type CommunityPage,
  type CommunitySummary,
} from './communities';
import { communityMembersQueryKey } from './community-members';

/**
 * **UNE COMMUNAUTÉ DISPARUE QUITTE L'ÉCRAN DE SES MEMBRES** (#19590) —
 * `community:deleted`, posé par la passerelle sur la room personnelle de
 * chaque membre actif et du créateur quand le créateur la supprime ou que
 * l'équipe la désactive.
 *
 * Sans lui, la communauté restait dans la liste et son détail ouvert restait
 * actionnable jusqu'à la péremption du cache, puis chaque geste échouait.
 * Désormais elle sort de chaque liste en cache ; le détail REGARDÉ se relit —
 * la passerelle rend 404, que l'écran dessine déjà en refus, au lieu de laisser
 * la page se vider sous les yeux du lecteur — et tout ce que personne ne
 * regarde (détail, membres, salons, publications) est oublié. Le détail est
 * cherché par l'id de la communauté dans TOUTES ses entrées : l'écran est
 * indexé par l'adresse, qui peut être l'identifiant `mshy_…`.
 */

const asRecord = (value: unknown): Readonly<Record<string, unknown>> | null =>
  typeof value === 'object' && value !== null ? (value as Readonly<Record<string, unknown>>) : null;

const communityIdOf = (payload: unknown): string | null => {
  const communityId = asRecord(payload)?.['communityId'];
  return typeof communityId === 'string' && communityId !== '' ? communityId : null;
};

const isCommunityList = (data: unknown): data is InfiniteData<CommunityPage, number> =>
  Array.isArray(asRecord(data)?.['pages']);

const LIST_KEY = [COMMUNITIES_QUERY_PREFIX[0], 'list'] as const;
const DETAIL_KEY = [COMMUNITIES_QUERY_PREFIX[0], 'detail'] as const;

const detailKeysOf = (queryClient: QueryClient, communityId: string): readonly QueryKey[] =>
  queryClient
    .getQueriesData<CommunitySummary>({ queryKey: DETAIL_KEY })
    .filter(([queryKey, data]) => queryKey[2] === communityId || data?.id === communityId)
    .map(([queryKey]) => queryKey);

const forget = (queryClient: QueryClient, queryKey: QueryKey): void => {
  void queryClient.invalidateQueries({ queryKey });
  queryClient.removeQueries({ queryKey, type: 'inactive' });
};

export function applyCommunityDeletedEvent(queryClient: QueryClient, payload: unknown): void {
  const communityId = communityIdOf(payload);
  if (communityId === null) return;

  queryClient.getQueriesData<InfiniteData<CommunityPage, number>>({ queryKey: LIST_KEY }).forEach(([queryKey, list]) => {
    if (!isCommunityList(list) || !list.pages.some((page) => page.communities.some((c) => c.id === communityId))) return;
    const pages = list.pages.map((page) => ({ ...page, communities: page.communities.filter((c) => c.id !== communityId) }));
    queryClient.setQueryData<InfiniteData<CommunityPage, number>>(queryKey, { ...list, pages });
  });

  [
    ...detailKeysOf(queryClient, communityId),
    communityMembersQueryKey(communityId),
    communityConversationsQueryKey(communityId),
    communityPostsQueryKey(communityId),
  ].forEach((queryKey) => forget(queryClient, queryKey));
}
