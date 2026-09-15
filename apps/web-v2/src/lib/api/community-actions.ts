import type { InfiniteData, QueryClient } from '@tanstack/react-query';

import {
  COMMUNITIES_QUERY_PREFIX,
  communitiesQueryKey,
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
