import type { InfiniteData } from '@tanstack/react-query';
import * as z from 'zod/mini';

import { unwrap } from './client';
import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES DEMANDES D'AMITIÉ** (#6363, #6321) — miroir `FriendService`
 * (iOS, `packages/MeeshySDK/Sources/MeeshySDK/Services/FriendService.swift`)
 * et de ce que `FriendshipCache.hydrate` en tire.
 *
 * `GET /api/v1/directory/friend-requests?direction=&status=&limit=&cursor=`,
 * `POST` pour envoyer, `PATCH …/:id {action}` pour accepter, refuser, annuler
 * (`services/gateway/src/routes/directory/friend-requests.ts`). La route
 * DÉPRÉCIÉE `/friend-requests` n'est pas appelée : un client neuf ne s'inscrit
 * pas sur la liste des appelants qui retardent son retrait.
 *
 * **TROIS PANIERS, trois questions** — les demandes REÇUES en attente (la liste
 * « Reçues », la pastille du barreau « Découvrir » et le compte du profil lisent
 * CE panier et nul autre), les ENVOYÉES en attente, et les ACCEPTÉES dans les
 * deux sens (qui est déjà un contact). Chaque page porte cent lignes, le plafond
 * de la route (`LIMITE_MAX_DEMANDES`) : la passerelle ne sert aucun compte.
 *
 * **Une partie décodée est une PROJECTION.** La route charge `isOnline` et
 * `lastActiveAt` de chaque partie (gatées par `servirParties`, mais servies en
 * clair pour un ami). Le cache de requêtes est persisté (`query-client.ts`) et
 * la présence d'autrui n'y entre jamais (D-60) ; l'écran n'en peint aucune.
 */

export const FRIEND_REQUEST_BUCKETS = ['received', 'sent', 'accepted'] as const;
export type FriendRequestBucket = (typeof FRIEND_REQUEST_BUCKETS)[number];

export const FRIEND_REQUESTS_PAGE_SIZE = 100;

export type PersonSummary = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatar: string | null;
};

export type FriendRequestRecord = {
  readonly id: string;
  readonly senderId: string;
  readonly receiverId: string;
  readonly status: string;
  readonly message: string | null;
  readonly createdAt: string;
  readonly sender: PersonSummary | null;
  readonly receiver: PersonSummary | null;
};

export type FriendRequestsPage = { readonly requests: readonly FriendRequestRecord[]; readonly nextCursor: string | null };
export type FriendRequestsData = InfiniteData<FriendRequestsPage, unknown>;
export type PendingRequests = { readonly count: number; readonly more: boolean };

export type FriendRequestsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export { FRIENDS_QUERY_PREFIX } from './friends-keys';
export const friendRequestsQueryKey = (bucket: FriendRequestBucket) => ['friends', 'requests', bucket] as const;

const optionalText = z.optional(z.nullable(z.string()));

const textOrNull = (value: string | null | undefined): string | null =>
  value === undefined || value === null || value.trim() === '' ? null : value;

const WirePerson = z.object({
  id: z.string().check(z.minLength(1)),
  username: z.string(),
  displayName: optionalText,
  avatar: optionalText,
});

export function decodePerson(raw: unknown): PersonSummary | null {
  const parsed = WirePerson.safeParse(raw);
  if (!parsed.success) return null;
  const { id, username, displayName, avatar } = parsed.data;
  return { id, username, displayName: textOrNull(displayName), avatar: textOrNull(avatar) };
}

const WireRequest = z.object({
  id: z.string().check(z.minLength(1)),
  senderId: z.string().check(z.minLength(1)),
  receiverId: z.string().check(z.minLength(1)),
  status: z.string(),
  message: optionalText,
  createdAt: z.string().check(z.refine((value) => Number.isFinite(Date.parse(value)))),
  sender: z.optional(z.unknown()),
  receiver: z.optional(z.unknown()),
});

export function decodeFriendRequest(raw: unknown): FriendRequestRecord | null {
  const parsed = WireRequest.safeParse(raw);
  if (!parsed.success) return null;
  const wire = parsed.data;
  return {
    id: wire.id,
    senderId: wire.senderId,
    receiverId: wire.receiverId,
    status: wire.status,
    message: textOrNull(wire.message),
    createdAt: new Date(wire.createdAt).toISOString(),
    sender: decodePerson(wire.sender),
    receiver: decodePerson(wire.receiver),
  };
}

const WirePagination = z.object({ hasMore: z.optional(z.boolean()), nextCursor: optionalText });

const nextCursorOf = (pagination: unknown): string | null => {
  const parsed = WirePagination.safeParse(pagination);
  return parsed.success && parsed.data.hasMore === true ? textOrNull(parsed.data.nextCursor) : null;
};

const BUCKET_QUERY: Readonly<Record<FriendRequestBucket, { readonly direction: string; readonly status: string }>> = {
  received: { direction: 'received', status: 'pending' },
  sent: { direction: 'sent', status: 'pending' },
  accepted: { direction: 'any', status: 'accepted' },
};

const listPath = (bucket: FriendRequestBucket, cursor: string | null): string => {
  const query = new URLSearchParams({ ...BUCKET_QUERY[bucket], limit: String(FRIEND_REQUESTS_PAGE_SIZE) });
  if (cursor !== null) query.set('cursor', cursor);
  return `/api/v1/directory/friend-requests?${query.toString()}`;
};

const decodeAll = (raw: unknown): readonly FriendRequestRecord[] =>
  (Array.isArray(raw) ? raw : []).flatMap((row) => {
    const request = decodeFriendRequest(row);
    return request === null ? [] : [request];
  });

export async function loadFriendRequests(
  params: FriendRequestsDeps & { readonly bucket: FriendRequestBucket; readonly cursor: string | null; readonly signal?: AbortSignal },
): Promise<ApiResult<FriendRequestsPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { fixtureFriendRequests } = await import('./fixtures-friends');
    return { ok: true, data: { requests: fixtureFriendRequests(params.bucket), nextCursor: null } };
  }
  const result = await params.transport.request<unknown>({
    method: 'GET',
    path: listPath(params.bucket, params.cursor),
    ...(params.signal === undefined ? {} : { signal: params.signal }),
  });
  if (!result.ok) return result;
  return { ok: true, data: { requests: decodeAll(result.data), nextCursor: nextCursorOf(result.pagination) } };
}

type PageContext = { readonly pageParam: string | null; readonly signal?: AbortSignal };

export function friendRequestsQueryOptions(deps: FriendRequestsDeps, bucket: FriendRequestBucket) {
  return {
    queryKey: friendRequestsQueryKey(bucket),
    initialPageParam: null as string | null,
    queryFn: async ({ pageParam, signal }: PageContext) =>
      unwrap(await loadFriendRequests({ ...deps, bucket, cursor: pageParam, ...(signal === undefined ? {} : { signal }) })),
    getNextPageParam: (page: FriendRequestsPage) => page.nextCursor ?? undefined,
  };
}

export const flattenFriendRequests = (data: FriendRequestsData | undefined): readonly FriendRequestRecord[] =>
  data?.pages.flatMap((page) => page.requests) ?? [];

/** Le compte des demandes REÇUES : la somme des pages chargées, « plus » tant qu'un curseur reste. */
export function pendingRequestsOf(data: FriendRequestsData | undefined): PendingRequests | null {
  if (data === undefined) return null;
  return { count: flattenFriendRequests(data).length, more: (data.pages.at(-1)?.nextCursor ?? null) !== null };
}

export type FriendRequestAction = 'accept' | 'reject' | 'cancel';

export async function respondToFriendRequest(
  deps: FriendRequestsDeps,
  id: string,
  action: FriendRequestAction,
): Promise<ApiResult<FriendRequestRecord | null>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureRespondFriendRequest } = await import('./fixtures-friends');
    return fixtureRespondFriendRequest(id, action);
  }
  const result = await deps.transport.request<unknown>({
    method: 'PATCH',
    path: `/api/v1/directory/friend-requests/${encodeURIComponent(id)}`,
    body: { action },
  });
  return result.ok ? { ...result, data: decodeFriendRequest(result.data) } : result;
}

export async function sendFriendRequest(deps: FriendRequestsDeps, receiverId: string): Promise<ApiResult<FriendRequestRecord>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    const { fixtureSendFriendRequest } = await import('./fixtures-friends');
    return fixtureSendFriendRequest(receiverId);
  }
  const result = await deps.transport.request<unknown>({ method: 'POST', path: '/api/v1/directory/friend-requests', body: { receiverId } });
  if (!result.ok) return result;
  const request = decodeFriendRequest(result.data);
  return request === null ? { ok: false, status: 0, error: 'Demande illisible' } : { ...result, data: request };
}
