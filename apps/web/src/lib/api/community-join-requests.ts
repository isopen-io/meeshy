import * as z from 'zod/mini';
import * as communitiesEndpoints from '@meeshy/shared/api/endpoints/communities';

import { unwrap } from './client';
import { COMMUNITIES_QUERY_PREFIX, COMMUNITIES_STALE_TIME, type CommunitiesDeps, type CommunitySummary } from './communities';
import type { ApiResult } from './http';

/**
 * **LES DEMANDES D'ENTRÉE EN ATTENTE** (#19871) — celles d'une communauté qui
 * valide chaque entrée (#19429), lues et tranchées par ceux qui l'animent.
 *
 * - `GET communities.byIdJoinRequests?limit=&cursor=` — les plus récentes
 *   d'abord, par pages continuées avec `pagination.nextCursor`. Tout autre
 *   lecteur qu'un intendant reçoit le 404 générique : la liste ne se demande
 *   donc qu'à un intendant (`isCommunityStewardOf`), jamais pour voir.
 * - `POST …/join-requests/:requestId/accept` rend le membre entré ;
 *   `POST …/reject` ne fait entrer personne (et ouvre, chez le demandeur, un
 *   délai de sept jours avant une nouvelle demande).
 *
 * **Une demande décodée est une PROJECTION** : nom, avatar, pays (code ISO à
 * deux lettres, jamais la ville) et date. La passerelle ne sert ni la
 * présence ni les coordonnées du demandeur, et rien de plus ne se garde.
 */

export type CommunityJoinRequest = {
  readonly id: string;
  readonly userId: string;
  readonly name: string;
  readonly username: string;
  readonly avatar: string | null;
  readonly country: string | null;
  readonly createdAt: string;
};

export type CommunityJoinRequestPage = { readonly requests: readonly CommunityJoinRequest[]; readonly nextCursor: string | null };

export const COMMUNITY_JOIN_REQUESTS_PAGE_SIZE = 50;

export const communityJoinRequestsQueryKey = (communityId: string) => [...COMMUNITIES_QUERY_PREFIX, 'join-requests', communityId] as const;

const optionalText = z.optional(z.nullable(z.string()));

const WireRequest = z.object({
  id: z.string().check(z.minLength(1)),
  userId: z.string().check(z.minLength(1)),
  status: z.literal('pending'),
  country: optionalText,
  createdAt: z.string().check(z.minLength(1)),
  user: z.object({
    username: z.string(),
    displayName: optionalText,
    avatar: optionalText,
  }),
});

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

const COUNTRY = /^[A-Z]{2}$/;

export function decodeCommunityJoinRequest(raw: unknown): CommunityJoinRequest | null {
  const parsed = WireRequest.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  const country = textOrNull(wire.country);
  return {
    id: wire.id,
    userId: wire.userId,
    name: textOrNull(wire.user.displayName) ?? wire.user.username,
    username: wire.user.username,
    avatar: textOrNull(wire.user.avatar),
    country: country !== null && COUNTRY.test(country) ? country : null,
    createdAt: wire.createdAt,
  };
}

/**
 * Qui tranche : l'administrateur, le modérateur et le créateur — la règle de
 * la passerelle (`isCommunitySteward`). Lu dans ce que le détail SERT
 * (`currentUserRole`, `createdBy`), jamais deviné d'une page de membres.
 */
export function isCommunityStewardOf(community: Pick<CommunitySummary, 'viewerRole' | 'createdBy'>, viewerId: string | null): boolean {
  if (viewerId === null) return false;
  return community.createdBy === viewerId || community.viewerRole === 'admin' || community.viewerRole === 'moderator';
}

const WirePagination = z.object({ hasMore: z.optional(z.boolean()), nextCursor: optionalText });

const withSignal = (signal: AbortSignal | undefined) => (signal === undefined ? {} : { signal });

export async function loadCommunityJoinRequests(
  params: CommunitiesDeps & { readonly communityId: string; readonly cursor: string | null; readonly signal?: AbortSignal },
): Promise<ApiResult<CommunityJoinRequestPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') return { ok: true, data: { requests: [], nextCursor: null } };
  const query = new URLSearchParams({ limit: String(COMMUNITY_JOIN_REQUESTS_PAGE_SIZE) });
  if (params.cursor !== null) query.set('cursor', params.cursor);
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: `${communitiesEndpoints.byIdJoinRequests(params.communityId)}?${query.toString()}`,
    ...withSignal(params.signal),
  });
  if (!result.ok) return result;
  const rows = Array.isArray(result.data) ? result.data : [];
  const requests = rows.flatMap((raw) => {
    const decoded = decodeCommunityJoinRequest(raw);
    return decoded === null ? [] : [decoded];
  });
  const pagination = WirePagination.safeParse(result.pagination);
  const nextCursor = pagination.success && pagination.data.hasMore === true ? textOrNull(pagination.data.nextCursor) : null;
  return { ok: true, data: { requests, nextCursor } };
}

export type JoinRequestDecision = 'accept' | 'reject';

export async function decideCommunityJoinRequest(
  deps: CommunitiesDeps,
  { communityId, requestId, decision }: { readonly communityId: string; readonly requestId: string; readonly decision: JoinRequestDecision },
): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') return { ok: true, data: null };
  return deps.transport.request<unknown>({
    method: 'POST',
    path:
      decision === 'accept'
        ? communitiesEndpoints.byIdJoinRequestsByRequestIdAccept(communityId, requestId)
        : communitiesEndpoints.byIdJoinRequestsByRequestIdReject(communityId, requestId),
  });
}

export function communityJoinRequestsQueryOptions(deps: CommunitiesDeps, communityId: string) {
  return {
    queryKey: communityJoinRequestsQueryKey(communityId),
    staleTime: COMMUNITIES_STALE_TIME,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }: { readonly pageParam: string | null; readonly signal?: AbortSignal }) =>
      unwrap(await loadCommunityJoinRequests({ ...deps, communityId, cursor: pageParam, ...withSignal(signal) })),
    getNextPageParam: (page: CommunityJoinRequestPage) => page.nextCursor ?? undefined,
  };
}
