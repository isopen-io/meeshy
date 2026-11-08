import type { InfiniteData, QueryClient } from '@tanstack/react-query';
import * as communitiesEndpoints from '@meeshy/shared/api/endpoints/communities';

import type { CommunityDraft, CommunitySummary } from './communities';
import { performCreateCommunity, type CommunityActionDeps, type CreateCommunityOutcome } from './community-actions';
import { DETAIL_PREFIX, patchMembers, shiftDetailCount } from './community-member-actions';
import { communityMembersQueryKey, decodeCommunityMember, type CommunityMember, type CommunityMemberPage } from './community-members';
import type { PersonSummary } from './friend-requests';
import type { ApiResult } from './http';

/**
 * **INVITER DANS UNE COMMUNAUTÉ** (#6376) — miroir `CommunityService.invite`
 * et `CommunityInviteViewModel` (iOS) : `POST communities.byIdInvite` avec
 * `{ userId }`, une requête par personne. L'invitation AJOUTE la personne
 * (`services/gateway/src/routes/communities/membership.ts`) ; la passerelle
 * refuse un non-membre, un simple membre d'une communauté PRIVÉE, et rend 404
 * pour un inconnu, un compte désactivé ou un blocage dans un sens ou dans
 * l'autre — sans dire lequel.
 *
 * **Optimiste.** Chaque personne paraît AU GESTE dans la page de membres en
 * cache et le compteur du détail monte ; celle que la passerelle refuse en
 * repart seule, les autres restent. Une personne déjà présente dans le cache
 * n'y est pas dédoublée, et la ligne n'entre que dans une liste lue jusqu'au
 * bout. Un 409 (déjà membre) ou une panne (l'écriture a pu aboutir) font
 * relire la vérité. Hors ligne, rien ne part : le web n'a pas de file
 * d'écriture (#6325).
 *
 * La ligne servie remplace la provisoire par une PROJECTION
 * (`decodeCommunityMember`) : seule la présence servie (`isOnline`, gardée par
 * `resolvePresenceVisibility`) y entre, jamais l'activité ni les coordonnées.
 */

export type InviteOutcome =
  | { readonly status: 'offline' }
  | { readonly status: 'done'; readonly invited: number; readonly already: number; readonly refused: number; readonly failed: number };

export async function inviteToCommunity(
  deps: CommunityActionDeps,
  { communityId, userId }: { readonly communityId: string; readonly userId: string },
): Promise<ApiResult<CommunityMember | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureInviteMember } = await import('./fixtures-community-members');
    return fixtureInviteMember(communityId, userId);
  }
  const result = await deps.transport.request<unknown>({
    method: 'POST',
    path: communitiesEndpoints.byIdInvite(communityId),
    body: { userId },
  });
  return result.ok ? { ...result, data: decodeCommunityMember(result.data) } : result;
}

const provisionalOf = (person: PersonSummary): CommunityMember => ({
  id: `invite-${person.id}`,
  userId: person.id,
  role: 'member',
  name: person.displayName ?? person.username,
  username: person.username,
  avatar: person.avatar,
  online: false,
  ...(person.ring === undefined ? {} : { ring: person.ring }),
});

type MembersData = InfiniteData<CommunityMemberPage, number>;

const cachedMemberIds = (queryClient: QueryClient, communityId: string): ReadonlySet<string> => {
  const data = queryClient.getQueryData<MembersData>(communityMembersQueryKey(communityId));
  return new Set(data?.pages.flatMap((page) => page.members.map((member) => member.userId)) ?? []);
};

/**
 * La ligne n'entre que dans une liste lue JUSQU'AU BOUT : tant qu'une page
 * reste à lire, la suivante la servira (ordre d'arrivée), et l'ajouter ici la
 * dédoublerait. Rend vrai si la ligne a été posée.
 */
const appendToLastPage = (queryClient: QueryClient, communityId: string, rows: readonly CommunityMember[]): boolean => {
  const data = queryClient.getQueryData<MembersData>(communityMembersQueryKey(communityId));
  if (data === undefined || rows.length === 0 || data.pages.at(-1)?.nextOffset !== null) return false;
  const last = data.pages.length - 1;
  queryClient.setQueryData<MembersData>(communityMembersQueryKey(communityId), {
    ...data,
    pages: data.pages.map((page, index) => (index === last ? { ...page, members: [...page.members, ...rows] } : page)),
  });
  return true;
};

type Verdict = 'invited' | 'already' | 'refused' | 'failed';

const verdictOf = (result: ApiResult<unknown>): Verdict => {
  if (result.ok) return 'invited';
  if (result.status === 409) return 'already';
  return result.status === 403 || result.status === 404 ? 'refused' : 'failed';
};

export async function performInviteMembers({
  community,
  people,
  deps,
}: {
  readonly community: CommunitySummary;
  readonly people: readonly PersonSummary[];
  readonly deps: CommunityActionDeps;
}): Promise<InviteOutcome> {
  if (!deps.isOnline()) return { status: 'offline' };
  const { queryClient } = deps;
  void queryClient.cancelQueries({ queryKey: communityMembersQueryKey(community.id) });
  void queryClient.cancelQueries({ queryKey: DETAIL_PREFIX });
  const known = cachedMemberIds(queryClient, community.id);
  const fresh = people.filter((person) => !known.has(person.id));
  const listed = appendToLastPage(queryClient, community.id, fresh.map(provisionalOf));
  shiftDetailCount(queryClient, community.id, fresh.length);

  const settled = await Promise.all(
    people.map(async (person) => {
      const result = await inviteToCommunity(deps, { communityId: community.id, userId: person.id });
      const verdict = verdictOf(result);
      const optimistic = !known.has(person.id);
      if (verdict === 'invited' && result.ok && result.data !== null) {
        const served = result.data;
        patchMembers(queryClient, community.id, (members) => members.map((row) => (row.id === `invite-${person.id}` ? served : row)));
      }
      if (verdict !== 'invited' && optimistic) {
        patchMembers(queryClient, community.id, (members) => members.filter((row) => row.id !== `invite-${person.id}`));
        shiftDetailCount(queryClient, community.id, -1);
      }
      return verdict;
    }),
  );

  if (!listed || settled.some((verdict) => verdict === 'already' || verdict === 'failed')) {
    void queryClient.invalidateQueries({ queryKey: communityMembersQueryKey(community.id) });
    void queryClient.invalidateQueries({ queryKey: DETAIL_PREFIX });
  }
  const count = (verdicts: readonly Verdict[]) => settled.filter((verdict) => verdicts.includes(verdict)).length;
  return { status: 'done', invited: count(['invited']), already: count(['already']), refused: count(['refused']), failed: count(['failed']) };
}

export type CreateWithMembersOutcome =
  | Exclude<CreateCommunityOutcome, { readonly status: 'created' }>
  | { readonly status: 'created'; readonly community: CommunitySummary; readonly invited: InviteOutcome | null };

/**
 * **CRÉER PUIS AJOUTER** (#6376) — miroir `CommunityCreateViewModel.createCommunity`
 * (iOS) : la communauté d'abord, puis chaque personne choisie par le MÊME port
 * que la feuille « Inviter » (`performInviteMembers`), donc par la même garde
 * de la passerelle (`isAddableUser` : compte vivant, aucun blocage, 404 sans
 * dire pourquoi). Une création refusée n'invite personne ; sans personne
 * choisie, rien d'autre ne part. Une invitation refusée ne défait pas la
 * création : l'issue la compte, l'écran la dit.
 */
export async function performCreateCommunityWithMembers({
  draft,
  people,
  deps,
}: {
  readonly draft: CommunityDraft;
  readonly people: readonly PersonSummary[];
  readonly deps: CommunityActionDeps;
}): Promise<CreateWithMembersOutcome> {
  const created = await performCreateCommunity({ draft, deps });
  if (created.status !== 'created') return created;
  const invited = people.length === 0 ? null : await performInviteMembers({ community: created.community, people, deps });
  return { ...created, invited };
}
