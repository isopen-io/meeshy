import type { InfiniteData } from '@tanstack/react-query';
import * as z from 'zod/mini';

import { unwrap } from './client';
import { decodePerson, type FriendRequestsDeps, type PersonSummary } from './friend-requests';
import type { ApiResult } from './http';

/**
 * **LE PORT DES PERSONNES BLOQUÉES** (#6363) — miroir `BlockService` (iOS,
 * `DirectoryEndpoint.blocks`) : `GET /api/v1/directory/blocks?limit=&cursor=`
 * et `DELETE /api/v1/directory/blocks/:userId`
 * (`services/gateway/src/routes/directory/blocks.ts`). Débloquer est une
 * appartenance à un ensemble : le second appel ne refuse rien.
 *
 * La clé vit sous le préfixe `['friends']` : une invalidation de la famille
 * (retour de connexion, événement d'amitié) couvre les bloqués avec le reste.
 */

export const BLOCKED_PAGE_SIZE = 100;
export const BLOCKED_USERS_QUERY_KEY = ['friends', 'blocked'] as const;

export type BlockedPage = { readonly users: readonly PersonSummary[]; readonly nextCursor: string | null };
export type BlockedData = InfiniteData<BlockedPage, unknown>;

const WirePagination = z.object({ hasMore: z.optional(z.boolean()), nextCursor: z.optional(z.nullable(z.string())) });

const nextCursorOf = (pagination: unknown): string | null => {
  const parsed = WirePagination.safeParse(pagination);
  if (!parsed.success || parsed.data.hasMore !== true) return null;
  const cursor = parsed.data.nextCursor ?? null;
  return cursor === null || cursor === '' ? null : cursor;
};

const blocksPath = (cursor: string | null): string => {
  const query = new URLSearchParams({ limit: String(BLOCKED_PAGE_SIZE) });
  if (cursor !== null) query.set('cursor', cursor);
  return `/api/v1/directory/blocks?${query.toString()}`;
};

export async function loadBlockedUsers(
  params: FriendRequestsDeps & { readonly cursor: string | null; readonly signal?: AbortSignal },
): Promise<ApiResult<BlockedPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureBlockedUsers } = await import('./fixtures-friends');
    return { ok: true, data: { users: fixtureBlockedUsers(), nextCursor: null } };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: blocksPath(params.cursor),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  const users = (Array.isArray(result.data) ? result.data : []).flatMap((raw) => {
    const person = decodePerson(raw);
    return person === null ? [] : [person];
  });
  return { ok: true, data: { users, nextCursor: nextCursorOf(result.pagination) } };
}

type PageContext = { readonly pageParam: string | null; readonly signal?: AbortSignal };

export function blockedUsersQueryOptions(deps: FriendRequestsDeps) {
  return {
    queryKey: BLOCKED_USERS_QUERY_KEY,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(await loadBlockedUsers({ ...deps, cursor: pageParam, ...(signal === undefined ? {} : { signal }) })),
    getNextPageParam: (page: BlockedPage) => page.nextCursor ?? undefined,
  };
}

export const flattenBlockedUsers = (data: BlockedData | undefined): readonly PersonSummary[] =>
  data?.pages.flatMap((page) => page.users) ?? [];

export async function unblockUser(deps: FriendRequestsDeps, userId: string): Promise<ApiResult<null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureUnblockUser } = await import('./fixtures-friends');
    return fixtureUnblockUser(userId);
  }
  const result = await deps.transport.request<unknown>({
    method: 'DELETE',
    path: `/api/v1/directory/blocks/${encodeURIComponent(userId)}`,
  });
  return result.ok ? { ...result, data: null } : result;
}
