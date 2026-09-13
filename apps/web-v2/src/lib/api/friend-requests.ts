import type { InfiniteData } from '@tanstack/react-query';

import type { DataSource } from './config';
import type { ApiResult, HttpTransport } from './http';

/**
 * **LE PORT DES DEMANDES D'AMITIÉ** (#6363, #6321) — squelette : les types et
 * les signatures réservent les chemins du lot, aucune logique n'est écrite.
 */

export const FRIEND_REQUEST_BUCKETS = ['received', 'sent', 'accepted'] as const;
export type FriendRequestBucket = (typeof FRIEND_REQUEST_BUCKETS)[number];

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
export type FriendRequestsData = InfiniteData<FriendRequestsPage, string | null>;
export type PendingRequests = { readonly count: number; readonly more: boolean };

export type FriendRequestsDeps = { readonly source: DataSource; readonly transport: HttpTransport };

export const FRIENDS_QUERY_PREFIX = ['friends'] as const;
export const friendRequestsQueryKey = (bucket: FriendRequestBucket) => ['friends', 'requests', bucket] as const;

export function decodePerson(_raw: unknown): PersonSummary | null {
  return null;
}

export function decodeFriendRequest(_raw: unknown): FriendRequestRecord | null {
  return null;
}

export async function loadFriendRequests(
  _params: FriendRequestsDeps & { readonly bucket: FriendRequestBucket; readonly cursor: string | null; readonly signal?: AbortSignal },
): Promise<ApiResult<FriendRequestsPage>> {
  return { ok: true, data: { requests: [], nextCursor: null } };
}

export function pendingRequestsOf(_data: FriendRequestsData | undefined): PendingRequests | null {
  return null;
}

export type FriendRequestAction = 'accept' | 'reject' | 'cancel';

export async function respondToFriendRequest(
  _deps: FriendRequestsDeps,
  _id: string,
  _action: FriendRequestAction,
): Promise<ApiResult<FriendRequestRecord | null>> {
  return { ok: false, status: 0, error: 'squelette' };
}

export async function sendFriendRequest(_deps: FriendRequestsDeps, _receiverId: string): Promise<ApiResult<FriendRequestRecord>> {
  return { ok: false, status: 0, error: 'squelette' };
}
