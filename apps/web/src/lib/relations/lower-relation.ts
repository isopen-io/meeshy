import type { RelationLevel } from '@meeshy/shared/types/relation';
import type { QueryClient } from '@tanstack/react-query';

import { FRIENDS_QUERY_PREFIX, RELATION_LINKS_QUERY_KEY } from '@/lib/api/friends-keys';
import { PUBLIC_PROFILE_QUERY_PREFIX } from '@/lib/api/public-profile';
import { lowerRelation, type RelationDeps, type RelationLink } from '@/lib/api/relations';

/**
 * **RÉTROGRADER OU ANNULER LE LIEN, OPTIMISTE** (#14910) — le niveau change dans
 * le cache de « Mes cercles » AU GESTE (la fiche et l'onglet lisent ce même
 * cache), la passerelle confirme (`POST /relations/:userId/level`), et un refus
 * rend l'instantané d'avant. Dans les deux cas la famille `friends` et les fiches
 * se relisent : baisser un Ami en Connaissance change aussi la `relation` servie
 * avec le profil.
 */
export type LowerRelationOutcome = 'done' | 'failed';

type LowerDeps = RelationDeps & { readonly queryClient: QueryClient };

const withLink = (links: readonly RelationLink[] | undefined, userId: string, next: (link: RelationLink) => RelationLink) =>
  links?.map((link) => (link.userId === userId ? next(link) : link));

const refresh = (queryClient: QueryClient): void => {
  void queryClient.invalidateQueries({ queryKey: FRIENDS_QUERY_PREFIX });
  void queryClient.invalidateQueries({ queryKey: PUBLIC_PROFILE_QUERY_PREFIX });
};

export async function performLowerRelation(params: {
  readonly userId: string;
  readonly level: RelationLevel;
  readonly deps: LowerDeps;
}): Promise<LowerRelationOutcome> {
  const { userId, level, deps } = params;
  const { queryClient } = deps;
  await queryClient.cancelQueries({ queryKey: RELATION_LINKS_QUERY_KEY, exact: true });
  const snapshot = queryClient.getQueryData<readonly RelationLink[]>(RELATION_LINKS_QUERY_KEY);
  queryClient.setQueryData<readonly RelationLink[]>(RELATION_LINKS_QUERY_KEY, (links) =>
    withLink(links, userId, (link) => ({ ...link, effectiveLevel: level, grantedByMe: level })),
  );
  const result = await lowerRelation(deps, { userId, level });
  if (!result.ok) {
    if (snapshot === undefined) queryClient.removeQueries({ queryKey: RELATION_LINKS_QUERY_KEY, exact: true });
    else queryClient.setQueryData(RELATION_LINKS_QUERY_KEY, snapshot);
    refresh(queryClient);
    return 'failed';
  }
  const served = result.data;
  if (served !== null) queryClient.setQueryData<readonly RelationLink[]>(RELATION_LINKS_QUERY_KEY, (links) => withLink(links, userId, () => served));
  refresh(queryClient);
  return 'done';
}
