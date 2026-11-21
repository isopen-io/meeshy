import type { QueryClient } from '@tanstack/react-query';
import * as communitiesEndpoints from '@meeshy/shared/api/endpoints/communities';

import { COMMUNITY_LINKS_QUERY_KEY, type CommunityLink, type CommunityLinksDeps } from './community-links';
import type { ApiResult } from './http';
import type { LinkFamilyOutcome } from './link-family-actions';

/**
 * **METTRE EN PAUSE LE LIEN D'ENTRÉE D'UNE COMMUNAUTÉ** (#20255) — la fiche du
 * lien d'un intendant (créateur, admin, modérateur) suspend ou relance les
 * arrivées PAR LE LIEN (`PUT communities/:id/join-link { paused }`, #19661).
 * La communauté, ses membres et les invitations nominatives n'en dépendent pas.
 *
 * **Optimiste, avec retour arrière** : la fiche et la liste lisent le même
 * cache, changent au geste, et seule la ligne refusée revient à son état
 * d'avant — une bascule d'une AUTRE communauté réussie entre-temps reste. La
 * RÉPONSE fait foi : elle dit l'état que la passerelle a écrit. Une bascule
 * contraire à celle en vol rend `busy`. Hors ligne, rien ne part (#6325).
 */

export type CommunityJoinLinkDeps = CommunityLinksDeps & { readonly queryClient: QueryClient; readonly isOnline: () => boolean };

type Served = { readonly joinLinkPausedAt?: unknown };

export async function setCommunityJoinLinkPaused(deps: CommunityLinksDeps, communityId: string, paused: boolean): Promise<ApiResult<{ readonly paused: boolean }>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: { paused } };
  const result = await deps.transport.request<Served>({ method: 'PUT', path: communitiesEndpoints.byIdJoinLink(communityId), body: { paused } });
  if (!result.ok) return result;
  const pausedAt = result.data?.joinLinkPausedAt;
  return { ok: true, data: { paused: pausedAt === undefined ? paused : typeof pausedAt === 'string' } };
}

const withPaused = (links: readonly CommunityLink[] | undefined, communityId: string, paused: boolean): readonly CommunityLink[] | undefined =>
  links?.map((link) => (link.id === communityId ? { ...link, joinLinkPaused: paused } : link));

const inFlight = new Map<string, { readonly paused: boolean; readonly outcome: Promise<LinkFamilyOutcome> }>();

export function performSetCommunityJoinLinkPaused({
  link,
  paused,
  deps,
}: {
  readonly link: CommunityLink;
  readonly paused: boolean;
  readonly deps: CommunityJoinLinkDeps;
}): Promise<LinkFamilyOutcome> {
  const pending = inFlight.get(link.id);
  if (pending !== undefined) return pending.paused === paused ? pending.outcome : Promise.resolve('busy');
  const outcome = (async (): Promise<LinkFamilyOutcome> => {
    if (!deps.isOnline()) return 'offline';
    const { queryClient } = deps;
    queryClient.setQueryData<readonly CommunityLink[]>(COMMUNITY_LINKS_QUERY_KEY, (links) => withPaused(links, link.id, paused));
    const result = await setCommunityJoinLinkPaused(deps, link.id, paused);
    if (!result.ok) {
      queryClient.setQueryData<readonly CommunityLink[]>(COMMUNITY_LINKS_QUERY_KEY, (links) => withPaused(links, link.id, link.joinLinkPaused === true));
      void queryClient.invalidateQueries({ queryKey: COMMUNITY_LINKS_QUERY_KEY });
      return 'failed';
    }
    queryClient.setQueryData<readonly CommunityLink[]>(COMMUNITY_LINKS_QUERY_KEY, (links) => withPaused(links, link.id, result.data.paused));
    return 'done';
  })().finally(() => inFlight.delete(link.id));
  inFlight.set(link.id, { paused, outcome });
  return outcome;
}
