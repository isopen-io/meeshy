import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import {
  changeMembership,
  COMMUNITIES_QUERY_PREFIX,
  communitiesQueryKey,
  communityConversationsQueryKey,
  communityQueryKey,
  createCommunity,
  validateCommunityDraft,
  type CommunitiesDeps,
  type CommunityDraft,
  type CommunityPage,
  type CommunitySummary,
} from './communities';

/**
 * **CRÉER UNE COMMUNAUTÉ** (#6364) — miroir `CommunityCreateViewModel.createCommunity`.
 *
 * **Pas d'insertion optimiste, et c'est délibéré** (D-60). L'identité d'une
 * communauté est attribuée par la passerelle (son `id`, et son identifiant
 * `mshy_…` qu'un conflit peut refuser) : une carte posée avant la réponse
 * mènerait à un détail qui n'existe pas, et disparaîtrait sur un 409 — un
 * contrôle qui ment, le temps d'un aller-retour. Le retour instantané est
 * ailleurs : le bouton passe « Création… » au geste, et la réponse écrit
 * ENSEMBLE le détail (ouvert sans squelette) et la tête de la liste.
 *
 * Hors ligne, rien ne part : iOS non plus n'a pas de file pour cette écriture,
 * et le web n'a pas de file d'écriture du tout (#6325).
 */

export type CommunityActionDeps = CommunitiesDeps & {
  readonly queryClient: QueryClient;
  readonly isOnline: () => boolean;
};

export type CreateCommunityOutcome =
  | { readonly status: 'created'; readonly community: CommunitySummary }
  | { readonly status: 'invalid'; readonly field: keyof CommunityDraft }
  | { readonly status: 'conflict'; readonly field: 'identifier' }
  | { readonly status: 'offline' }
  | { readonly status: 'error' };

const prepend = (data: InfiniteData<CommunityPage, number>, community: CommunitySummary): InfiniteData<CommunityPage, number> => ({
  ...data,
  pages: data.pages.map((page, index) =>
    index === 0 ? { ...page, communities: [community, ...page.communities.filter((row) => row.id !== community.id)] } : page,
  ),
});

export async function performCreateCommunity({
  draft,
  deps,
}: {
  readonly draft: CommunityDraft;
  readonly deps: CommunityActionDeps;
}): Promise<CreateCommunityOutcome> {
  const validated = validateCommunityDraft(draft);
  if (!validated.ok) return { status: 'invalid', field: validated.field };
  if (!deps.isOnline()) return { status: 'offline' };

  const result = await createCommunity(deps, draft);
  if (!result.ok) return result.status === 409 ? { status: 'conflict', field: 'identifier' } : { status: 'error' };

  const community = result.data;
  deps.queryClient.setQueryData(communityQueryKey(community.id), community);
  const list = deps.queryClient.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''));
  if (list !== undefined) deps.queryClient.setQueryData(communitiesQueryKey(''), prepend(list, community));
  void deps.queryClient.invalidateQueries({ queryKey: [...COMMUNITIES_QUERY_PREFIX, 'list'], refetchType: 'none' });
  return { status: 'created', community };
}

/**
 * **REJOINDRE ET QUITTER** (#6378) — miroir `CommunityDetailViewModel.joinCommunity`
 * / `leaveCommunity`, mais OPTIMISTE, comme le veut le web : le détail bascule
 * au geste (rôle et compteur), quitter retire la carte de CHAQUE liste en cache
 * (la complète et chaque recherche), rejoindre la met en tête de « mes
 * communautés ». Une réponse qui refuse rend EXACTEMENT ce qui était en cache.
 *
 * Le détail est cherché par l'`id` de la communauté dans TOUTES les entrées
 * `['communities', 'detail', …]` : l'écran est indexé par l'adresse, qui peut
 * être l'identifiant `mshy_…` aussi bien que l'id.
 *
 * Deux réponses « en erreur » sont des succès, parce qu'elles décrivent l'état
 * VISÉ : 409 à la jonction (déjà membre), 404 au départ (déjà parti) — un
 * double geste sur deux onglets ne doit pas rendre une erreur qui ment.
 */

export type JoinCommunityOutcome = { readonly status: 'joined' | 'refused' | 'offline' | 'error' };
export type LeaveCommunityOutcome = { readonly status: 'left' | 'offline' | 'error' };

type CacheEntry = readonly [readonly unknown[], unknown];

const DETAIL_PREFIX = [...COMMUNITIES_QUERY_PREFIX, 'detail'] as const;
const LIST_PREFIX = [...COMMUNITIES_QUERY_PREFIX, 'list'] as const;

const snapshotOf = (queryClient: QueryClient): readonly CacheEntry[] => [
  ...queryClient.getQueriesData({ queryKey: DETAIL_PREFIX }),
  ...queryClient.getQueriesData({ queryKey: LIST_PREFIX }),
];

const restore = (queryClient: QueryClient, snapshot: readonly CacheEntry[]) =>
  snapshot.forEach(([key, data]) => queryClient.setQueryData(key, data));

const isCommunitySummary = (value: unknown): value is CommunitySummary =>
  typeof value === 'object' && value !== null && 'id' in value && 'memberCount' in value;

const patchDetail = (queryClient: QueryClient, communityId: string, patch: (community: CommunitySummary) => CommunitySummary) =>
  queryClient
    .getQueriesData({ queryKey: DETAIL_PREFIX })
    .forEach(([key, data]) => {
      if (isCommunitySummary(data) && data.id === communityId) queryClient.setQueryData(key, patch(data));
    });

const withoutCommunity = (data: InfiniteData<CommunityPage, number>, communityId: string): InfiniteData<CommunityPage, number> => ({
  ...data,
  pages: data.pages.map((page) => ({ ...page, communities: page.communities.filter((row) => row.id !== communityId) })),
});

const removeFromLists = (queryClient: QueryClient, communityId: string) =>
  queryClient.getQueriesData<InfiniteData<CommunityPage, number>>({ queryKey: LIST_PREFIX }).forEach(([key, data]) => {
    if (data !== undefined) queryClient.setQueryData(key, withoutCommunity(data, communityId));
  });

export async function performJoinCommunity({
  community,
  deps,
}: {
  readonly community: CommunitySummary;
  readonly deps: CommunityActionDeps;
}): Promise<JoinCommunityOutcome> {
  if (!deps.isOnline()) return { status: 'offline' };
  const { queryClient } = deps;
  const snapshot = snapshotOf(queryClient);
  const joined: CommunitySummary = { ...community, viewerRole: 'member', memberCount: community.memberCount + 1 };
  patchDetail(queryClient, community.id, (cached) => ({ ...cached, viewerRole: 'member', memberCount: cached.memberCount + 1 }));

  const result = await changeMembership(deps, community.id, 'join');
  if (!result.ok && result.status !== 409) {
    restore(queryClient, snapshot);
    return { status: result.status === 403 ? 'refused' : 'error' };
  }
  if (!result.ok) {
    restore(queryClient, snapshot);
    patchDetail(queryClient, community.id, (cached) => ({ ...cached, viewerRole: 'member' }));
  }
  const list = queryClient.getQueryData<InfiniteData<CommunityPage, number>>(communitiesQueryKey(''));
  if (list !== undefined) queryClient.setQueryData(communitiesQueryKey(''), prepend(list, joined));
  void queryClient.invalidateQueries({ queryKey: [...LIST_PREFIX], refetchType: 'none' });
  void queryClient.invalidateQueries({ queryKey: communityConversationsQueryKey(community.id) });
  return { status: 'joined' };
}

export async function performLeaveCommunity({
  community,
  deps,
}: {
  readonly community: CommunitySummary;
  readonly deps: CommunityActionDeps;
}): Promise<LeaveCommunityOutcome> {
  if (!deps.isOnline()) return { status: 'offline' };
  const { queryClient } = deps;
  const snapshot = snapshotOf(queryClient);
  patchDetail(queryClient, community.id, (cached) => ({ ...cached, viewerRole: null, memberCount: Math.max(0, cached.memberCount - 1) }));
  removeFromLists(queryClient, community.id);

  const result = await changeMembership(deps, community.id, 'leave');
  if (!result.ok && result.status !== 404) {
    restore(queryClient, snapshot);
    return { status: 'error' };
  }
  queryClient.removeQueries({ queryKey: communityConversationsQueryKey(community.id) });
  void queryClient.invalidateQueries({ queryKey: [...LIST_PREFIX], refetchType: 'none' });
  return { status: 'left' };
}
