import type { QueryClient } from '@tanstack/react-query';

import { applyPostToggle, applyServedCount, type PostToggleKind } from '@/lib/feed/interactions';

import { newClientMessageId } from './client-message-id';
import type { DataSource } from './config';
import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';

/**
 * LE PORT DES GESTES D'UNE PUBLICATION (#6278) — aimer et enregistrer, le
 * SITE UNIQUE que la carte du fil appelle : plan → optimiste → appel → issue,
 * même forme que `performReaction` (`reactions.ts`).
 *
 * - AIMER : `POST|DELETE /api/v1/posts/:postId/like`
 *   (`services/gateway/src/routes/posts/interactions.ts:86,265`), sans corps —
 *   la passerelle pose « ❤️ » par défaut. Idempotent par
 *   `X-Client-Mutation-Id` (`middleware/clientMutationId.ts`, `cmid_<uuid>`) :
 *   un rejeu ne diffuse ni ne notifie deux fois (#6293).
 * - ENREGISTRER : `POST|DELETE /api/v1/posts/:postId/bookmark`
 *   (`bookmarks.ts:32,90`), qui rend le `bookmarkCount` ABSOLU.
 *
 * LES ISSUES :
 * - succès : l'optimiste reflète déjà la réalité ; un compte servi le remplace.
 * - panne passagère (réseau, 5xx, 408/425/429 — `outcomeOf`) : l'optimiste
 *   RESTE, ANNONCÉ. Aucune promesse de rejeu : la file de reprise est #5868.
 * - 409 sur « aimer » : le lecteur a déjà réagi d'un autre emoji ailleurs, le
 *   cache était périmé — l'optimiste est défait et le fil INVALIDÉ, sans
 *   annoncer un échec que le lecteur n'a pas commis.
 * - tout autre refus (404 hors audience, 401…) : l'optimiste est défait,
 *   l'échec annoncé avec le libellé d'iOS.
 *
 * UN GESTE À LA FOIS PAR PUBLICATION ET PAR SENS — miroir `isHeartInFlight`
 * (`FeedPostCard.swift:974`) : un second tap pendant l'appel enverrait un
 * `DELETE` qui croiserait le `POST` encore en route.
 */
export type PostGestureDeps = {
  readonly source: DataSource;
  readonly transport: HttpTransport;
  readonly queryClient: QueryClient;
};

export type PostGestureResult = { readonly ok: true; readonly notice?: string } | { readonly ok: false; readonly message: string };

/** `feed.like.error` et `post.bookmark.error` (`Localizable.xcstrings`). */
export const LIKE_FAILED_MESSAGE = 'Impossible d’aimer la publication';
export const BOOKMARK_FAILED_MESSAGE = 'Erreur lors de l’enregistrement';
export const GESTURE_PENDING_MESSAGE = 'Geste non confirmé — hors ligne';

const inFlight = new Set<string>();

const newClientMutationId = (): string => newClientMessageId().replace(/^cid_/, 'cmid_');

const findPost = (data: FeedInfiniteData | undefined, postId: string): FeedPost | undefined =>
  data?.pages.flatMap((page) => page.posts).find((p) => p.id === postId);

const isOn = (post: FeedPost | undefined, kind: PostToggleKind): boolean =>
  kind === 'like' ? post?.isLikedByMe === true : post?.isBookmarkedByMe === true;

function sendGesture(
  deps: PostGestureDeps,
  gesture: { readonly postId: string; readonly kind: PostToggleKind; readonly on: boolean },
): Promise<ApiResult<unknown>> {
  if (__FIXTURES__ && deps.source === 'fixtures') {
    return Promise.resolve({ ok: true, data: gesture.kind === 'like' ? { liked: gesture.on } : { bookmarked: gesture.on } });
  }
  return deps.transport.request<unknown>({
    method: gesture.on ? 'POST' : 'DELETE',
    path: `/api/v1/posts/${encodeURIComponent(gesture.postId)}/${gesture.kind}`,
    headers: { 'X-Client-Mutation-Id': newClientMutationId() },
  });
}

const servedBookmarkCount = (data: unknown): number | undefined => {
  const count = (data as { readonly bookmarkCount?: unknown } | null)?.bookmarkCount;
  return typeof count === 'number' && Number.isFinite(count) ? count : undefined;
};

export async function performPostGesture(params: {
  readonly postId: string;
  readonly kind: PostToggleKind;
  readonly deps: PostGestureDeps;
}): Promise<PostGestureResult> {
  const { postId, kind, deps } = params;
  const flightKey = `${kind}:${postId}`;
  if (inFlight.has(flightKey)) return { ok: true };

  const on = !isOn(findPost(deps.queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY), postId), kind);
  const setOn = (value: boolean) =>
    deps.queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) => applyPostToggle(data, { postId, kind, on: value }));

  setOn(on);
  inFlight.add(flightKey);
  try {
    const result = await sendGesture(deps, { postId, kind, on }).catch(() => null);
    if (result === null) return { ok: true, notice: GESTURE_PENDING_MESSAGE };

    if (result.ok) {
      const count = kind === 'bookmark' ? servedBookmarkCount(result.data) : undefined;
      if (count !== undefined) {
        deps.queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) => applyServedCount(data, { postId, kind, count }));
      }
      return { ok: true };
    }

    if (outcomeOf(result) !== 'permanent') return { ok: true, notice: GESTURE_PENDING_MESSAGE };

    setOn(!on);
    if (kind === 'like' && result.status === 409) {
      void deps.queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
      return { ok: true };
    }
    return { ok: false, message: kind === 'like' ? LIKE_FAILED_MESSAGE : BOOKMARK_FAILED_MESSAGE };
  } finally {
    inFlight.delete(flightKey);
  }
}
