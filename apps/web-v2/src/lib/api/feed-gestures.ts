import type { QueryClient } from '@tanstack/react-query';

import { applyPostToggle, applyServedCount, togglePost, withServedCount, type PostToggleKind } from '@/lib/feed/interactions';

import { newClientMessageId } from './client-message-id';
import type { DataSource } from './config';
import { FEED_QUERY_KEY } from './feed';
import type { FeedInfiniteData, FeedPost } from './feed-pages';
import type { ApiResult, HttpTransport } from './http';
import { outcomeOf } from './outcome';
import { postQueryKey } from './publication-detail';
import { REELS_QUERY_ROOT } from './reels';

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

/**
 * `notice`/`message` portent une CLÉ DE CATALOGUE, jamais un texte déjà
 * traduit (#6488) — cette couche n'a pas la langue d'interface, seul l'hôte
 * qui annonce (`usePostGesture`) l'a. Même patron que `INVITE_FEEDBACK`
 * (`routes/discover-parts.tsx`).
 *
 * UNE UNION LITTÉRALE, jamais `InterfaceCatalogKey` (le catalogue entier) :
 * `translate()` distribue ses paramètres sur CHAQUE clé du type qu'on lui
 * passe, et exigerait un troisième argument dès que le type couvre ne
 * serait-ce qu'UNE clé paramétrée du catalogue, même si ces trois-ci n'en
 * portent aucun.
 */
type PostGestureMessageKey = 'feed.like.error' | 'post.bookmark.error' | 'feed.gesture.pending';

export type PostGestureResult =
  | { readonly ok: true; readonly notice?: PostGestureMessageKey }
  | { readonly ok: false; readonly message: PostGestureMessageKey };

/** `feed.like.error` et `post.bookmark.error` (`Localizable.xcstrings`). */
export const LIKE_FAILED_MESSAGE: PostGestureMessageKey = 'feed.like.error';
export const BOOKMARK_FAILED_MESSAGE: PostGestureMessageKey = 'post.bookmark.error';
export const GESTURE_PENDING_MESSAGE: PostGestureMessageKey = 'feed.gesture.pending';

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

  /* Le fil d'abord, le détail sinon : un lien DIRECT vers `/post/:id` n'a
     jamais rempli le fil, et n'y lire que lui verrait « pas aimé » sur un post
     déjà aimé. Les DEUX caches basculent ensemble — la même publication ne
     peut pas porter deux cœurs selon l'écran qui la montre. */
  /* LES FILS DE RÉELS (#6457) suivent le même geste : un réel servi par le fil
     d'affinité n'est pas forcément dans le Flux, et le lecteur des Réels peint
     depuis ses propres pages — toutes les graines, une seule racine. */
  const known =
    findPost(deps.queryClient.getQueryData<FeedInfiniteData>(FEED_QUERY_KEY), postId) ??
    deps.queryClient
      .getQueriesData<FeedInfiniteData>({ queryKey: REELS_QUERY_ROOT })
      .map(([, data]) => findPost(data, postId))
      .find((post) => post !== undefined) ??
    deps.queryClient.getQueryData<FeedPost>(postQueryKey(postId));
  const on = !isOn(known, kind);
  const setOn = (value: boolean) => {
    const change = { postId, kind, on: value };
    deps.queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) => applyPostToggle(data, change));
    deps.queryClient.setQueriesData<FeedInfiniteData>({ queryKey: REELS_QUERY_ROOT }, (data) => applyPostToggle(data, change));
    deps.queryClient.setQueryData<FeedPost>(postQueryKey(postId), (post) => (post === undefined ? post : togglePost(post, change)));
  };

  setOn(on);
  inFlight.add(flightKey);
  try {
    const result = await sendGesture(deps, { postId, kind, on }).catch(() => null);
    if (result === null) return { ok: true, notice: GESTURE_PENDING_MESSAGE };

    if (result.ok) {
      const count = kind === 'bookmark' ? servedBookmarkCount(result.data) : undefined;
      if (count !== undefined) {
        const served = { postId, kind, count };
        deps.queryClient.setQueryData<FeedInfiniteData>(FEED_QUERY_KEY, (data) => applyServedCount(data, served));
        deps.queryClient.setQueriesData<FeedInfiniteData>({ queryKey: REELS_QUERY_ROOT }, (data) => applyServedCount(data, served));
        deps.queryClient.setQueryData<FeedPost>(postQueryKey(postId), (post) => (post === undefined ? post : withServedCount(post, served)));
      }
      return { ok: true };
    }

    if (outcomeOf(result) !== 'permanent') return { ok: true, notice: GESTURE_PENDING_MESSAGE };

    setOn(!on);
    if (kind === 'like' && result.status === 409) {
      void deps.queryClient.invalidateQueries({ queryKey: FEED_QUERY_KEY });
      void deps.queryClient.invalidateQueries({ queryKey: postQueryKey(postId) });
      return { ok: true };
    }
    return { ok: false, message: kind === 'like' ? LIKE_FAILED_MESSAGE : BOOKMARK_FAILED_MESSAGE };
  } finally {
    inFlight.delete(flightKey);
  }
}
