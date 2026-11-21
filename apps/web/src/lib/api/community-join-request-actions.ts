import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import type { CommunitySummary } from './communities';
import type { CommunityActionDeps } from './community-actions';
import {
  communityJoinRequestsQueryKey,
  decideCommunityJoinRequest,
  type CommunityJoinRequest,
  type CommunityJoinRequestPage,
  type JoinRequestDecision,
} from './community-join-requests';
import { DETAIL_PREFIX, patchMembers, shiftDetailCount } from './community-member-actions';
import { communityMembersQueryKey, decodeCommunityMember } from './community-members';

/**
 * **TRANCHER UNE DEMANDE D'ENTRÉE, OPTIMISTE** (#19871) — la ligne quitte la
 * liste AU GESTE ; accepter fait monter le compteur de la fiche aussitôt, et
 * le membre que la passerelle sert entre dans l'effectif. Une réponse qui
 * échoue rend EXACTEMENT ce qui était en cache.
 *
 * Un 404 dit que la demande n'est plus tranchable PAR CE LECTEUR : un autre
 * intendant l'a déjà tranchée, le demandeur a fermé son compte ou un blocage
 * s'est posé entre eux. La ligne reste partie, le compteur revient, et la
 * liste, l'effectif et la fiche se relisent : la vérité servie remplace la
 * supposition. Hors ligne, rien ne part (le web n'a pas de file d'écriture, #6325).
 */

export type JoinRequestOutcome = { readonly status: 'accepted' | 'rejected' | 'gone' | 'offline' | 'error' };

type RequestsData = InfiniteData<CommunityJoinRequestPage, string | null>;
type CacheEntry = readonly [readonly unknown[], unknown];

const snapshotOf = (queryClient: QueryClient, communityId: string): readonly CacheEntry[] => [
  ...queryClient.getQueriesData({ queryKey: communityJoinRequestsQueryKey(communityId) }),
  ...queryClient.getQueriesData({ queryKey: communityMembersQueryKey(communityId) }),
  ...queryClient.getQueriesData({ queryKey: DETAIL_PREFIX }),
];

const restore = (queryClient: QueryClient, snapshot: readonly CacheEntry[]) =>
  snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));

const dropRequest = (queryClient: QueryClient, communityId: string, requestId: string) => {
  const data = queryClient.getQueryData<RequestsData>(communityJoinRequestsQueryKey(communityId));
  if (data === undefined) return;
  queryClient.setQueryData<RequestsData>(communityJoinRequestsQueryKey(communityId), {
    ...data,
    pages: data.pages.map((page) => ({ ...page, requests: page.requests.filter((row) => row.id !== requestId) })),
  });
};

const relaunch = (queryClient: QueryClient, communityId: string) => {
  void queryClient.invalidateQueries({ queryKey: communityJoinRequestsQueryKey(communityId) });
  void queryClient.invalidateQueries({ queryKey: communityMembersQueryKey(communityId) });
  void queryClient.invalidateQueries({ queryKey: DETAIL_PREFIX });
};

export async function performDecideJoinRequest({
  community,
  request,
  decision,
  deps,
}: {
  readonly community: CommunitySummary;
  readonly request: CommunityJoinRequest;
  readonly decision: JoinRequestDecision;
  readonly deps: CommunityActionDeps;
}): Promise<JoinRequestOutcome> {
  if (!deps.isOnline()) return { status: 'offline' };
  const { queryClient } = deps;
  const snapshot = snapshotOf(queryClient, community.id);
  dropRequest(queryClient, community.id, request.id);
  if (decision === 'accept') shiftDetailCount(queryClient, community.id, 1);

  const result = await decideCommunityJoinRequest(deps, { communityId: community.id, requestId: request.id, decision });
  if (result.ok) {
    const entered = decision === 'accept' ? decodeCommunityMember(result.data) : null;
    if (entered !== null) patchMembers(queryClient, community.id, (members) => (members.some((row) => row.userId === entered.userId) ? members : [...members, entered]));
    return { status: decision === 'accept' ? 'accepted' : 'rejected' };
  }
  if (result.status === 404) {
    if (decision === 'accept') shiftDetailCount(queryClient, community.id, -1);
    relaunch(queryClient, community.id);
    return { status: 'gone' };
  }
  restore(queryClient, snapshot);
  return { status: 'error' };
}
