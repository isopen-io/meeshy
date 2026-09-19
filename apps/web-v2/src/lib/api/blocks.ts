import type { InfiniteData } from '@tanstack/react-query';
import * as z from 'zod/mini';

import { unwrap } from './client';
import { FRIENDS_STALE_TIME, decodePerson, type FriendRequestsDeps, type PersonSummary } from './friend-requests';
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

/**
 * **LA FENÊTRE DE LA FAMILLE, jamais une seconde valeur** (#6974) — la clé
 * vit sous `['friends']` (§ doc-comment du fichier), donc `socket.ts:385` et
 * `:469` l'invalident avec le reste de la famille : le raisonnement qui
 * autorise les cinq minutes est celui de `FRIENDS_STALE_TIME`, écrit UNE fois
 * chez `friend-requests.ts`. Deux littéraux auraient divergé au premier
 * réglage de l'un des deux.
 *
 * Ce que la fenêtre coûte ici est encore plus mince qu'ailleurs : bloquer et
 * débloquer sont des gestes du PORTEUR, et `friend-actions.ts:182` écrit le
 * cache au tap. Personne d'autre ne modifie cette liste.
 */
export function blockedUsersQueryOptions(deps: FriendRequestsDeps) {
  return {
    queryKey: BLOCKED_USERS_QUERY_KEY,
    staleTime: FRIENDS_STALE_TIME,
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(await loadBlockedUsers({ ...deps, cursor: pageParam, ...(signal === undefined ? {} : { signal }) })),
    getNextPageParam: (page: BlockedPage) => page.nextCursor ?? undefined,
  };
}

export const flattenBlockedUsers = (data: BlockedData | undefined): readonly PersonSummary[] =>
  data?.pages.flatMap((page) => page.users) ?? [];

/**
 * **BLOQUER** (#7083) — `PUT /api/v1/directory/blocks/:userId`
 * (`services/gateway/src/routes/directory/blocks.ts:302`), la JUMELLE exacte
 * de `unblockUser` ci-dessous : même préfixe, même famille de clés, même
 * fichier. Un module à part aurait fabriqué deux vocabulaires pour les deux
 * sens d'un même geste.
 *
 * **IDEMPOTENTE** — le doc de la route le dit : « a second call returns the
 * same state and the same status ». Les alias `POST /users/:userId/block`
 * portent `depreciee(...)` : un client neuf ne s'y inscrit pas.
 */
export async function blockUser(deps: FriendRequestsDeps, userId: string): Promise<ApiResult<null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureBlockUser } = await import('./fixtures-friends');
    return fixtureBlockUser(userId);
  }
  const result = await deps.transport.request<unknown>({
    method: 'PUT',
    path: `/api/v1/directory/blocks/${encodeURIComponent(userId)}`,
  });
  return result.ok ? { ...result, data: null } : result;
}

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
