import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import { COMMUNITIES_QUERY_PREFIX, type CommunitySummary } from './communities';
import type { CommunityActionDeps } from './community-actions';
import {
  changeCommunityMemberRole,
  communityMembersQueryKey,
  removeCommunityMember,
  type CommunityMember,
  type CommunityMemberPage,
  type CommunityMemberRole,
} from './community-members';

/**
 * **GÉRER UN MEMBRE, OPTIMISTE** (#6375) — miroir
 * `CommunityMembersViewModel.updateRole` / `removeMember` (iOS, qui attend la
 * réponse puis recharge) : ici la ligne change AU GESTE, et une réponse qui
 * refuse rend EXACTEMENT ce qui était en cache (la page de membres et la fiche
 * de la communauté, dont le compteur descend au retrait).
 *
 * Un 404 au retrait décrit en général l'état visé (la ligne est déjà partie :
 * un autre administrateur, un autre onglet) — mais il dit aussi « communauté
 * désactivée » : la liste et la fiche sont donc relues, et la vérité servie
 * remplace la supposition. Hors ligne, rien
 * ne part : le web n'a pas de file d'écriture (#6325).
 */

export type MemberGestureOutcome = { readonly status: 'changed' | 'removed' | 'refused' | 'offline' | 'error' };

type MembersData = InfiniteData<CommunityMemberPage, number>;
type CacheEntry = readonly [readonly unknown[], unknown];

export const DETAIL_PREFIX = [...COMMUNITIES_QUERY_PREFIX, 'detail'] as const;

const snapshotOf = (queryClient: QueryClient, communityId: string): readonly CacheEntry[] => [
  ...queryClient.getQueriesData({ queryKey: communityMembersQueryKey(communityId) }),
  ...queryClient.getQueriesData({ queryKey: DETAIL_PREFIX }),
];

const restore = (queryClient: QueryClient, snapshot: readonly CacheEntry[]) =>
  snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));

export const patchMembers = (queryClient: QueryClient, communityId: string, patch: (members: readonly CommunityMember[]) => readonly CommunityMember[]) => {
  const data = queryClient.getQueryData<MembersData>(communityMembersQueryKey(communityId));
  if (data === undefined) return;
  queryClient.setQueryData<MembersData>(communityMembersQueryKey(communityId), {
    ...data,
    pages: data.pages.map((page) => ({ ...page, members: patch(page.members) })),
  });
};

const isCommunitySummary = (value: unknown): value is CommunitySummary =>
  typeof value === 'object' && value !== null && 'id' in value && 'memberCount' in value;

export const shiftDetailCount = (queryClient: QueryClient, communityId: string, delta: number) =>
  queryClient.getQueriesData({ queryKey: DETAIL_PREFIX }).forEach(([key, data]) => {
    if (isCommunitySummary(data) && data.id === communityId) {
      queryClient.setQueryData(key, { ...data, memberCount: Math.max(0, data.memberCount + delta) });
    }
  });

const failureOf = (status: number): MemberGestureOutcome => ({ status: status === 403 ? 'refused' : 'error' });

export async function performChangeMemberRole({
  community,
  member,
  role,
  deps,
}: {
  readonly community: CommunitySummary;
  readonly member: CommunityMember;
  readonly role: CommunityMemberRole;
  readonly deps: CommunityActionDeps;
}): Promise<MemberGestureOutcome> {
  if (!deps.isOnline()) return { status: 'offline' };
  const { queryClient } = deps;
  const snapshot = snapshotOf(queryClient, community.id);
  patchMembers(queryClient, community.id, (members) => members.map((row) => (row.id === member.id ? { ...row, role } : row)));

  const result = await changeCommunityMemberRole(deps, { communityId: community.id, member, role });
  if (result.ok) return { status: 'changed' };
  restore(queryClient, snapshot);
  return failureOf(result.status);
}

export async function performRemoveMember({
  community,
  member,
  deps,
}: {
  readonly community: CommunitySummary;
  readonly member: CommunityMember;
  readonly deps: CommunityActionDeps;
}): Promise<MemberGestureOutcome> {
  if (!deps.isOnline()) return { status: 'offline' };
  const { queryClient } = deps;
  const snapshot = snapshotOf(queryClient, community.id);
  patchMembers(queryClient, community.id, (members) => members.filter((row) => row.userId !== member.userId));
  shiftDetailCount(queryClient, community.id, -1);

  const result = await removeCommunityMember(deps, { communityId: community.id, member });
  if (result.ok) return { status: 'removed' };
  if (result.status === 404) {
    void queryClient.invalidateQueries({ queryKey: communityMembersQueryKey(community.id) });
    void queryClient.invalidateQueries({ queryKey: DETAIL_PREFIX });
    return { status: 'removed' };
  }
  restore(queryClient, snapshot);
  return failureOf(result.status);
}
