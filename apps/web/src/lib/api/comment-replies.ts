import * as postsEndpoints from '@meeshy/shared/api/endpoints/posts';

import type { ApiResult } from './http';
import { postQueryKey } from './publication-detail';
import type {
  CommentDeps,
  CommentInfiniteData,
  CommentPage,
  CommentPageParam,
  PostComment,
} from './publication-comments';

/**
 * **LES RÉPONSES D'UN COMMENTAIRE** (#8583, tranche « répondre » de #7118) —
 * miroir de `ThreadedCommentSection.swift` : répondre à un commentaire le
 * rattache à sa RACINE, et le fil se lit à DEUX niveaux.
 *
 * Route RÉELLE, lue avant d'être appelée :
 *
 *  - `GET posts.byPostIdCommentsByCommentIdReplies?limit=&cursor=`
 *    (`services/gateway/src/routes/posts/comments.ts:127`, `requiredAuth`).
 *    Les réponses sont servies `createdAt ASC` (ordre de lecture d'un fil,
 *    `PostCommentService.getReplies`) — l'inverse du premier niveau : une
 *    réponse qu'on vient d'écrire va donc en QUEUE, jamais en tête. Curseur
 *    opaque, `hasMore` + `nextCursor` comme la liste. Hors audience ⇒ 404.
 *
 * **LA CAISSE DES RÉPONSES A LA FORME ET LE PRÉFIXE DE CELLE DU FIL** —
 * `[...commentsQueryKey(postId), 'replies', parentId]`, des pages de
 * `PostComment`. C'est ce qui laisse les lois temps réel (édition, cœur,
 * traduction, suppression) parcourir TOUTES les caisses d'une publication par
 * UN préfixe, au lieu d'un second inventaire à tenir d'accord avec le premier.
 *
 * **RÉPONDRE À UNE RÉPONSE reste au niveau 2** — le `parentId` envoyé est
 * celui de la RACINE (`FeedCommentsSheet.submitComment`, iOS :
 * `replyingTo.parentId ?? replyingTo.id`) ; l'auteur visé est prévenu par une
 * @mention préremplie (`comment-reply-target.ts`).
 */

export const commentRepliesQueryKey = (postId: string, parentId: string) =>
  [...postQueryKey(postId), 'comments', 'replies', parentId] as const;

/** Le défaut de `FeedQuerySchema`, même valeur que la liste. */
export const REPLIES_PAGE_SIZE = 20;

type RawPagination = { readonly hasMore?: boolean; readonly nextCursor?: string | null };

export async function loadRepliesPage(
  params: CommentDeps & {
    readonly postId: string;
    readonly parentId: string;
    readonly cursor?: CommentPageParam;
    readonly signal?: AbortSignal;
  },
): Promise<ApiResult<CommentPage>> {
  if (__FIXTURES__ && params.source === 'fixtures') {
    const { pageOfReplies } = await import('./fixtures-comments');
    return { ok: true, data: pageOfReplies(params.parentId, params.cursor) };
  }
  const query = new URLSearchParams({
    limit: String(REPLIES_PAGE_SIZE),
    ...(params.cursor !== undefined ? { cursor: params.cursor } : {}),
  });
  const result = await params.transport.request<readonly PostComment[]>({
    method: 'GET',
    path: `${postsEndpoints.byPostIdCommentsByCommentIdReplies(params.postId, params.parentId)}?${query.toString()}`,
    ...(params.signal !== undefined ? { signal: params.signal } : {}),
  });
  if (!result.ok) return result;
  const raw = result.pagination as unknown as RawPagination | undefined;
  return {
    ok: true,
    data: {
      comments: result.data,
      pagination: { limit: REPLIES_PAGE_SIZE, hasMore: raw?.hasMore ?? false, nextCursor: raw?.nextCursor ?? null },
    },
  };
}

const nextRepliesCursor = (page: CommentPage): CommentPageParam => {
  const { hasMore, nextCursor } = page.pagination;
  return hasMore && typeof nextCursor === 'string' && nextCursor !== '' ? nextCursor : undefined;
};

export function repliesInfiniteOptions(deps: CommentDeps & { readonly postId: string; readonly parentId: string }) {
  return {
    queryKey: commentRepliesQueryKey(deps.postId, deps.parentId),
    queryFn: async ({ pageParam, signal }: { readonly pageParam?: CommentPageParam; readonly signal?: AbortSignal }) => {
      const result = await loadRepliesPage({
        source: deps.source,
        transport: deps.transport,
        postId: deps.postId,
        parentId: deps.parentId,
        ...(pageParam !== undefined ? { cursor: pageParam } : {}),
        ...(signal !== undefined ? { signal } : {}),
      });
      if (!result.ok) throw new Error(result.error);
      return result.data;
    },
    initialPageParam: undefined as CommentPageParam,
    getNextPageParam: nextRepliesCursor,
  };
}

/**
 * UNE RÉPONSE NEUVE VA EN QUEUE (ordre ASC) — sur la DERNIÈRE page chargée.
 * Une caisse absente est AMORCÉE d'une page qui ne porte qu'elle : la réponse
 * se voit tout de suite, et l'appelant marque la caisse périmée pour que les
 * réponses plus anciennes arrivent à la prochaine lecture.
 */
export function appendReply(data: CommentInfiniteData | undefined, reply: PostComment): CommentInfiniteData {
  if (data === undefined || data.pages.length === 0) {
    return {
      pages: [{ comments: [reply], pagination: { limit: REPLIES_PAGE_SIZE, hasMore: false, nextCursor: null } }],
      pageParams: [undefined],
    };
  }
  if (data.pages.some((page) => page.comments.some((c) => c.id === reply.id))) return data;
  const last = data.pages.length - 1;
  return {
    ...data,
    pages: data.pages.map((page, i) => (i === last ? { ...page, comments: [...page.comments, reply] } : page)),
  };
}

/**
 * LE SERVI PREND LA PLACE DU PROVISOIRE — et s'il n'y est plus (une relecture
 * est passée entre l'envoi et la réponse), il est AJOUTÉ, jamais perdu ni
 * doublé.
 */
export function settleReply(
  data: CommentInfiniteData | undefined,
  tempId: string,
  served: PostComment,
): CommentInfiniteData {
  const held = data?.pages.some((page) => page.comments.some((c) => c.id === tempId)) === true;
  if (!held || data === undefined) return appendReply(data, served);
  const withoutDuplicate = data.pages.some((page) => page.comments.some((c) => c.id === served.id));
  return {
    ...data,
    pages: data.pages.map((page) => ({
      ...page,
      comments: withoutDuplicate
        ? page.comments.filter((c) => c.id !== tempId)
        : page.comments.map((c) => (c.id === tempId ? served : c)),
    })),
  };
}

export function dropReply(data: CommentInfiniteData | undefined, tempId: string): CommentInfiniteData | undefined {
  if (data === undefined) return data;
  const pages = data.pages.map((page) => {
    const comments = page.comments.filter((c) => c.id !== tempId);
    return comments.length === page.comments.length ? page : { ...page, comments };
  });
  return pages.every((page, i) => page === data.pages[i]) ? data : { ...data, pages };
}
