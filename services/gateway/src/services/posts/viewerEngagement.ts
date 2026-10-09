import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { PostViewerEngagement } from '@meeshy/shared/types/publication-viewers';
import { isGlobalAdmin } from '@meeshy/shared/types/role-types';
import { authorSelect } from './postIncludes';
import { NOT_DELETED } from './softDelete';

/**
 * La liste des vues d'un contenu, enrichie de ce que CHAQUE personne y a fait
 * (#9727) — réactions, partages par lien, republications, commentaires,
 * réponses, favori. Extrait de `PostService` (hors budget de taille) : le
 * service n'y garde qu'un appel.
 *
 * **Une lecture agrégée par source, jamais une requête par personne.** Les six
 * sources se lisent en parallèle, bornées aux identifiants de la PAGE servie
 * (`in: viewerIds`) : le coût suit le nombre de sources, pas la taille de la
 * page, et une page vide ne déclenche aucune lecture.
 *
 * **Un compteur à zéro n'est pas servi.** Chaque champ d'engagement est absent
 * quand il vaut zéro (et `bookmarked` absent quand il est faux) : le client
 * n'a rien à filtrer, et un ancien client continue de lire `reaction`.
 */
export type ViewerEngagementPrisma = Pick<
  PrismaClient,
  'post' | 'postView' | 'postReaction' | 'trackingLink' | 'postComment' | 'postBookmark'
>;

/**
 * Un favori posé AVANT cette date l'a été quand le geste était privé : il
 * n'est jamais montré à l'auteur (avis `conformite-juridique` sur #9727 — pas
 * d'effet rétroactif, RGPD art. 5(1)(a) et 13(3)). Seuls les favoris posés
 * depuis la mise en service de la liste enrichie le sont.
 */
export const BOOKMARKS_DISCLOSED_SINCE = new Date('2026-10-10T00:00:00.000Z');

/** Qui demande la liste : son identifiant et son rôle GLOBAL. */
export type InteractionsReader = {
  readonly id: string;
  readonly role?: string | null;
};

export type ViewerInteractionRow = {
  readonly id: string;
  readonly username: string;
  readonly displayName: string | null;
  readonly avatarUrl: string | null;
  readonly viewedAt: Date;
  readonly reaction: string | null;
} & PostViewerEngagement;

export type ViewerInteractionsPage = {
  readonly viewers: readonly ViewerInteractionRow[];
  readonly total: number;
  readonly hasMore: boolean;
};

/**
 * La porte : l'AUTEUR du contenu, ou un administrateur global (ADMIN/BIGBOSS).
 * Fail-closed — un rôle absent, inconnu ou de modération ne l'ouvre pas.
 */
export function mayReadViewerInteractions(postAuthorId: string, reader: InteractionsReader): boolean {
  if (postAuthorId === reader.id) return true;
  return typeof reader.role === 'string' && isGlobalAdmin(reader.role);
}

type Counts = ReadonlyMap<string, number>;

const countsBy = <K extends string>(
  rows: ReadonlyArray<Record<K, string | null> & { readonly _count: { readonly _all: number } }>,
  key: K,
): Counts =>
  new Map(
    rows.flatMap((row) => {
      const id = row[key];
      return id === null ? [] : [[id, row._count._all] as const];
    }),
  );

const positive = (value: number | undefined): number | undefined =>
  value !== undefined && value > 0 ? value : undefined;

/** Projette les sources d'UNE personne ; tout ce qui vaut zéro disparaît. */
export function engagementOf(input: {
  readonly reactions: readonly string[];
  readonly shares?: number;
  readonly reposts?: number;
  readonly comments?: number;
  readonly replies?: number;
  readonly bookmarked: boolean;
}): PostViewerEngagement {
  const shareCount = positive(input.shares);
  const repostCount = positive(input.reposts);
  const commentCount = positive(input.comments);
  const replyCount = positive(input.replies);
  return {
    ...(input.reactions.length > 0 ? { reactions: input.reactions } : {}),
    ...(shareCount !== undefined ? { shareCount } : {}),
    ...(repostCount !== undefined ? { repostCount } : {}),
    ...(commentCount !== undefined ? { commentCount } : {}),
    ...(replyCount !== undefined ? { replyCount } : {}),
    ...(input.bookmarked ? { bookmarked: true as const } : {}),
  };
}

/**
 * Les engagements des personnes nommées, sur UN contenu. Six lectures
 * groupées, en parallèle, quel que soit le nombre de personnes.
 */
export async function loadViewerEngagement(
  prisma: ViewerEngagementPrisma,
  postId: string,
  viewerIds: readonly string[],
): Promise<ReadonlyMap<string, PostViewerEngagement & { readonly reaction: string | null }>> {
  if (viewerIds.length === 0) return new Map();
  const ids = [...viewerIds];

  const [reactionRows, shareRows, repostRows, commentRows, replyRows, bookmarkRows] = await Promise.all([
    prisma.postReaction.findMany({
      where: { postId, userId: { in: ids } },
      select: { userId: true, emoji: true },
      orderBy: { createdAt: 'asc' },
    }),
    prisma.trackingLink.groupBy({
      by: ['createdBy'],
      where: { targetId: postId, createdBy: { in: ids } },
      _count: { _all: true },
    }),
    prisma.post.groupBy({
      by: ['authorId'],
      where: { repostOfId: postId, authorId: { in: ids }, deletedAt: NOT_DELETED },
      _count: { _all: true },
    }),
    prisma.postComment.groupBy({
      by: ['authorId'],
      where: { postId, authorId: { in: ids }, deletedAt: NOT_DELETED },
      _count: { _all: true },
    }),
    // Une RÉPONSE porte un `parentId` présent et non nul — le complément exact
    // du filtre « premier niveau » de `PostCommentService` (`parentId: null`
    // OU absent). Les commentaires de premier niveau se déduisent par
    // différence : une lecture de moins.
    prisma.postComment.groupBy({
      by: ['authorId'],
      where: {
        postId,
        authorId: { in: ids },
        deletedAt: NOT_DELETED,
        AND: [{ parentId: { isSet: true } }, { NOT: { parentId: null } }],
      },
      _count: { _all: true },
    }),
    prisma.postBookmark.findMany({
      where: { postId, userId: { in: ids }, createdAt: { gte: BOOKMARKS_DISCLOSED_SINCE } },
      select: { userId: true },
    }),
  ]);

  const reactionsByUser = reactionRows.reduce<ReadonlyMap<string, readonly string[]>>(
    (acc, row) => new Map(acc).set(row.userId, [...(acc.get(row.userId) ?? []), row.emoji]),
    new Map(),
  );
  const shares = countsBy(shareRows, 'createdBy');
  const reposts = countsBy(repostRows, 'authorId');
  const allComments = countsBy(commentRows, 'authorId');
  const replies = countsBy(replyRows, 'authorId');
  const bookmarked = new Set(bookmarkRows.map((row) => row.userId));

  return new Map(
    ids.map((id) => {
      const reactions = reactionsByUser.get(id) ?? [];
      const replyCount = replies.get(id) ?? 0;
      return [
        id,
        {
          reaction: reactions.length > 0 ? reactions[reactions.length - 1] : null,
          ...engagementOf({
            reactions,
            shares: shares.get(id),
            reposts: reposts.get(id),
            comments: Math.max(0, (allComments.get(id) ?? 0) - replyCount),
            replies: replyCount,
            bookmarked: bookmarked.has(id),
          }),
        },
      ] as const;
    }),
  );
}

/**
 * `GET /posts/:postId/interactions` — la page des vues (ordre et pagination
 * inchangés), chaque ligne enrichie. `null` ⇒ contenu introuvable ; lève
 * `FORBIDDEN` pour tout lecteur que la porte refuse.
 */
export async function readViewerInteractions(
  prisma: ViewerEngagementPrisma,
  postId: string,
  reader: InteractionsReader,
  limit: number,
  offset: number,
): Promise<ViewerInteractionsPage | null> {
  const post = await prisma.post.findFirst({
    where: { id: postId, deletedAt: NOT_DELETED },
    select: { id: true, authorId: true },
  });
  if (!post) return null;
  if (!mayReadViewerInteractions(post.authorId, reader)) throw new Error('FORBIDDEN');

  const [views, total] = await Promise.all([
    prisma.postView.findMany({
      where: { postId },
      include: { user: { select: authorSelect } },
      orderBy: { viewedAt: 'desc' },
      take: limit,
      skip: offset,
    }),
    prisma.postView.count({ where: { postId } }),
  ]);

  const engagement = await loadViewerEngagement(prisma, postId, views.map((view) => view.user.id));

  const viewers = views.map((view) => ({
    id: view.user.id,
    username: view.user.username,
    displayName: view.user.displayName,
    avatarUrl: view.user.avatar,
    viewedAt: view.viewedAt,
    reaction: null,
    ...engagement.get(view.user.id),
  }));

  return { viewers, total, hasMore: offset + limit < total };
}
