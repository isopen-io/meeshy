import * as z from 'zod/mini';
import * as communitiesEndpoints from '@meeshy/shared/api/endpoints/communities';
import type { ServedProfileDecorItem } from '@meeshy/shared/types/profile-decor';

import { servedRingOf } from '@/lib/profile-decor/served-ring';

import { unwrap } from './client';
import { COMMUNITIES_QUERY_PREFIX, COMMUNITIES_STALE_TIME, type CommunitiesDeps, type CommunityViewerRole } from './communities';
import type { ApiResult } from './http';

/**
 * **LES MEMBRES D'UNE COMMUNAUTÉ** (#6375) — miroir `CommunityService.getMembers`
 * / `updateMemberRole` / `removeMember` (iOS) et `CommunityMembersScreen`.
 *
 * - `GET communities.byIdMembers?offset=&limit=` — actifs seulement, par ordre
 *   d'arrivée ; 403 pour une communauté privée dont le lecteur n'est pas
 *   membre (`services/gateway/src/routes/communities/members.ts`).
 * - `PATCH …/members/:memberId/role` — `memberId` est l'identifiant de LIGNE.
 * - `DELETE …/members/:memberId` — `memberId` est l'identifiant d'UTILISATEUR.
 *   Les deux adresses ne nomment pas la même chose : c'est la passerelle qui le
 *   veut, et iOS fait de même.
 * Les deux écritures sont réservées aux administrateurs, et la passerelle
 * protège le créateur (403 `COMMUNITY_CREATOR_PROTECTED`).
 *
 * **Un membre décodé est une PROJECTION** : le cache est persisté, et seuls
 * les champs peints y entrent. La présence est celle que la passerelle SERT
 * (`resolvePresenceVisibility` : ami accepté, soi, administrateur global) —
 * `isOnline` absent ou faux ne dessine aucun point, et rien ne la prolonge.
 */

export type CommunityMemberRole = CommunityViewerRole;

export type CommunityMember = {
  readonly id: string;
  readonly userId: string;
  readonly role: CommunityMemberRole;
  readonly name: string;
  readonly username: string;
  readonly avatar: string | null;
  readonly online: boolean;
  /** Le contour équipé (#10945), servi avec la personne ; absent sans contour. */
  readonly ring?: ServedProfileDecorItem;
};

export type CommunityMemberPage = { readonly members: readonly CommunityMember[]; readonly nextOffset: number | null };

export const COMMUNITY_MEMBERS_PAGE_SIZE = 30;

export const communityMembersQueryKey = (communityId: string) => [...COMMUNITIES_QUERY_PREFIX, 'members', communityId] as const;

const MEMBER_ROLES: readonly CommunityMemberRole[] = ['admin', 'moderator', 'member'];

const optionalText = z.optional(z.nullable(z.string()));

const WireMember = z.object({
  id: z.string().check(z.minLength(1)),
  userId: z.string().check(z.minLength(1)),
  role: optionalText,
  user: z.object({
    id: z.string().check(z.minLength(1)),
    username: z.string(),
    displayName: optionalText,
    avatar: optionalText,
    isOnline: z.optional(z.nullable(z.boolean())),
  }),
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

export function decodeCommunityMember(raw: unknown): CommunityMember | null {
  const parsed = WireMember.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const ring = servedRingOf((raw as { readonly user?: unknown }).user);
  return {
    id: wire.id,
    userId: wire.userId,
    role: MEMBER_ROLES.find((role) => role === wire.role) ?? 'member',
    name: textOrNull(wire.user.displayName) ?? wire.user.username,
    username: wire.user.username,
    avatar: textOrNull(wire.user.avatar),
    online: wire.user.isOnline === true,
    ...(ring === null ? {} : { ring }),
  };
}

const WirePagination = z.object({ hasMore: z.optional(z.boolean()) });

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadCommunityMembers(
  params: CommunitiesDeps & { readonly communityId: string; readonly offset: number; readonly signal?: AbortSignal },
): Promise<ApiResult<CommunityMemberPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureCommunityMembers } = await import('./fixtures-community-members');
    return fixtureCommunityMembers(params.communityId, params.offset);
  }
  const query = new URLSearchParams({ offset: String(params.offset), limit: String(COMMUNITY_MEMBERS_PAGE_SIZE) });
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${communitiesEndpoints.byIdMembers(params.communityId)}?${query.toString()}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  const members = rows.flatMap((raw) => {
    const member = decodeCommunityMember(raw);
    return member === null ? [] : [member];
  });
  const pagination = WirePagination.safeParse(result.pagination);
  const hasMore = pagination.success && pagination.data.hasMore === true;
  return { ok: true, data: { members, nextOffset: hasMore ? params.offset + rows.length : null } };
}

type MemberTarget = { readonly communityId: string; readonly member: CommunityMember };

export async function changeCommunityMemberRole(
  deps: CommunitiesDeps,
  { communityId, member, role }: MemberTarget & { readonly role: CommunityMemberRole },
): Promise<ApiResult<null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureChangeMemberRole } = await import('./fixtures-community-members');
    return fixtureChangeMemberRole(communityId, member.id, role);
  }
  const result = await deps.transport.request<unknown>({
    method: 'PATCH',
    path: communitiesEndpoints.byIdMembersByMemberIdRole(communityId, member.id),
    body: { role },
  });
  return result.ok ? { ok: true, data: null } : result;
}

export async function removeCommunityMember(deps: CommunitiesDeps, { communityId, member }: MemberTarget): Promise<ApiResult<null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureRemoveMember } = await import('./fixtures-community-members');
    return fixtureRemoveMember(communityId, member.userId);
  }
  const result = await deps.transport.request<unknown>({
    method: 'DELETE',
    path: communitiesEndpoints.byIdMembersByMemberId(communityId, member.userId),
  });
  return result.ok ? { ok: true, data: null } : result;
}

export function communityMembersQueryOptions(deps: CommunitiesDeps, communityId: string) {
  return {
    queryKey: communityMembersQueryKey(communityId),
    staleTime: COMMUNITIES_STALE_TIME,
    initialPageParam: 0,
    queryFn: async ({ pageParam, signal }: { readonly pageParam: number; readonly signal?: AbortSignal }) =>
      unwrap(await loadCommunityMembers({ ...deps, communityId, offset: pageParam, ...withSignal(signal) })),
    getNextPageParam: (page: CommunityMemberPage) => page.nextOffset ?? undefined,
  };
}

export type CommunityMemberSection = { readonly role: CommunityMemberRole; readonly members: readonly CommunityMember[] };

/** Miroir `CommunityMemberSection.sections(from:)` : par rôle, du plus haut au plus bas, sections vides tues. */
export function memberSectionsOf(members: readonly CommunityMember[]): readonly CommunityMemberSection[] {
  return MEMBER_ROLES.map((role) => ({ role, members: members.filter((member) => member.role === role) })).filter(
    (section) => section.members.length > 0,
  );
}

export type MemberGestures = { readonly roles: readonly CommunityMemberRole[]; readonly canRemove: boolean };

const NO_GESTURE: MemberGestures = { roles: [], canRemove: false };

/**
 * Ce qu'un lecteur peut faire d'une ligne. Seul un ADMINISTRATEUR gère (la
 * passerelle refuse tout autre rôle), jamais sur sa propre ligne — on QUITTE
 * une communauté depuis son détail — ni sur celle du créateur, que la
 * passerelle protège. Un rôle non servi n'offre rien : mieux vaut aucun menu
 * qu'un menu qui échoue.
 */
export function memberGesturesOf({
  member,
  viewerRole,
  viewerId,
  createdBy,
}: {
  readonly member: CommunityMember;
  readonly viewerRole: CommunityViewerRole | null | undefined;
  readonly viewerId: string | null;
  readonly createdBy: string | null;
}): MemberGestures {
  if (viewerRole !== 'admin' || member.userId === viewerId || member.userId === createdBy) return NO_GESTURE;
  return { roles: MEMBER_ROLES.filter((role) => role !== member.role), canRemove: true };
}
