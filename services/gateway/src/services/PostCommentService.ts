import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import { decodeCursor, encodeCursor } from '../routes/posts/types';
import type { MobileTranscription } from '../routes/posts/types';
import { authorSelect, commentMediaInclude, NOT_DELETED } from './posts/postIncludes';
import { TrackingLinkService } from './TrackingLinkService';

export class PostCommentService {
  private readonly trackingLinkService: TrackingLinkService;

  constructor(
    private readonly prisma: PrismaClient,
    // Source UNIQUE du mapping `metadata.trackingLinks` partagée avec
    // messages/posts/stories. Injectable pour les tests ; défaut = même prisma.
    trackingLinkService?: TrackingLinkService,
  ) {
    this.trackingLinkService = trackingLinkService ?? new TrackingLinkService(prisma);
  }

  async addComment(
    postId: string,
    authorId: string,
    content: string,
    parentId?: string,
    effectFlags?: number,
    originalLanguage?: string,
    /// PostMedia déjà uploadé (pending) à rattacher au commentaire via `commentId`.
    /// Un commentaire ne porte QU'UN SEUL média.
    mediaId?: string,
    /// Transcription Whisper mobile pour un média audio — persistée sur le PostMedia
    /// (évite la re-transcription serveur, même mécanisme que les posts).
    mobileTranscription?: MobileTranscription,
  ) {
    // Verify post exists
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
    });
    if (!post) return null;

    // If parentId, verify parent exists
    if (parentId) {
      const parent = await this.prisma.postComment.findFirst({
        where: { id: parentId, postId, deletedAt: NOT_DELETED },
      });
      if (!parent) throw new Error('PARENT_NOT_FOUND');
    }

    // Verify the pending media belongs to no post/comment yet (anti-hijack) before linking.
    if (mediaId) {
      const media = await this.prisma.postMedia.findUnique({
        where: { id: mediaId },
        select: { id: true, postId: true, commentId: true },
      });
      if (!media || media.postId || media.commentId) {
        throw new Error('MEDIA_NOT_AVAILABLE');
      }
    }

    const comment = await this.prisma.postComment.create({
      data: {
        postId,
        authorId,
        content,
        parentId: parentId ?? null,
        effectFlags: effectFlags ?? 0,
        originalLanguage: originalLanguage ?? null,
      },
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        author: { select: authorSelect },
      },
    });

    // Lier le média pending au commentaire + persister la transcription mobile éventuelle.
    if (mediaId) {
      await this.prisma.postMedia.update({
        where: { id: mediaId },
        data: {
          commentId: comment.id,
          ...(mobileTranscription
            ? {
                transcription: {
                  ...mobileTranscription,
                  segments: mobileTranscription.segments ?? [],
                  source: 'mobile',
                } as Prisma.InputJsonValue,
              }
            : {}),
        },
      });
    }

    // Increment counters
    await this.prisma.post.update({
      where: { id: postId },
      data: { commentCount: { increment: 1 } },
    });

    if (parentId) {
      await this.prisma.postComment.update({
        where: { id: parentId },
        data: { replyCount: { increment: 1 } },
      });
    }

    // Le média lié est renvoyé top-level (`media: [PostMedia]`) — même forme que les
    // posts, décodé identiquement par les clients (viewers inline + plein écran).
    const media = mediaId
      ? await this.prisma.postMedia.findMany({
          where: { commentId: comment.id },
          ...commentMediaInclude,
        })
      : [];

    // Tracking des URLs brutes du commentaire : même mécanisme que les messages
    // et les posts — mapping `url → token` rangé dans `metadata.trackingLinks`
    // SANS réécrire le contenu (aperçu vidéo + URL lisible préservés). Le client
    // rend le lien vers `/l/<token>`. JAMAIS bloquant : le helper avale ses
    // erreurs (→ []) et l'écriture metadata est gardée.
    if (content) {
      try {
        const trackingLinks = await this.trackingLinkService.collectContentTrackingLinks({
          content,
          createdBy: authorId,
        });
        if (trackingLinks.length > 0) {
          const existingMetadata = (comment.metadata as Record<string, unknown> | null) ?? {};
          const metadata = { ...existingMetadata, trackingLinks } as Prisma.InputJsonValue;
          await this.prisma.postComment.update({
            where: { id: comment.id },
            data: { metadata },
          });
          return { ...comment, metadata, media };
        }
      } catch {
        // non-bloquant : un échec de tracking ne doit pas casser le commentaire
      }
    }

    return { ...comment, media };
  }

  async getComments(postId: string, cursor?: string, limit: number = 20, currentUserId?: string) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Top-level comments only — replies (parentId set) are loaded lazily via
    // getReplies. The parentId filter lives in AND so the cursor's own OR can
    // be appended without clobbering it (a bare `where.OR = …` on pagination
    // dropped the parentId guard and leaked replies into page 2+).
    const where: any = {
      postId,
      deletedAt: NOT_DELETED,
      AND: [
        { OR: [{ parentId: null }, { parentId: { isSet: false } }] },
      ],
    };

    if (cursorData) {
      where.AND.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    const comments = await this.prisma.postComment.findMany({
      where,
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        reactionCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        author: { select: authorSelect },
        media: commentMediaInclude,
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = comments.length > limit;
    const items = hasMore ? comments.slice(0, limit) : comments;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    const commentIds = items.map((c) => c.id);
    const userReactions = currentUserId && commentIds.length > 0
      ? await this.prisma.commentReaction.findMany({
          where: { userId: currentUserId, commentId: { in: commentIds } },
          select: { commentId: true, emoji: true },
        })
      : [];
    const userReactionsMap = new Map<string, string[]>();
    userReactions.forEach((r) => {
      const list = userReactionsMap.get(r.commentId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.commentId, list);
    });
    const enriched = items.map((c) => ({ ...c, currentUserReactions: userReactionsMap.get(c.id) ?? [] }));

    return { items: enriched, nextCursor, hasMore };
  }

  async getReplies(commentId: string, cursor?: string, limit: number = 20, currentUserId?: string) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      parentId: commentId,
      deletedAt: NOT_DELETED,
    };

    // Replies are ordered ASCENDING (oldest → newest, threaded reading order),
    // so the cursor must select rows strictly AFTER the last item of the
    // previous page (`gt`). `nextCursor` is the last item's (createdAt, id) —
    // the largest so far under asc ordering — so `lt` would walk BACKWARD,
    // re-yielding already-shown replies and permanently dropping the rest.
    // (Sibling `getComments` orders DESC and correctly pairs that with `lt`.)
    if (cursorData) {
      where.OR = [
        { createdAt: { gt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { gt: cursorData.id } },
      ];
    }

    const replies = await this.prisma.postComment.findMany({
      where,
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        reactionCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        author: { select: authorSelect },
        media: commentMediaInclude,
      },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
      take: limit + 1,
    });

    const hasMore = replies.length > limit;
    const items = hasMore ? replies.slice(0, limit) : replies;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    const replyIds = items.map((r) => r.id);
    const userReactions = currentUserId && replyIds.length > 0
      ? await this.prisma.commentReaction.findMany({
          where: { userId: currentUserId, commentId: { in: replyIds } },
          select: { commentId: true, emoji: true },
        })
      : [];
    const userReactionsMap = new Map<string, string[]>();
    userReactions.forEach((r) => {
      const list = userReactionsMap.get(r.commentId) ?? [];
      list.push(r.emoji);
      userReactionsMap.set(r.commentId, list);
    });
    const enriched = items.map((r) => ({ ...r, currentUserReactions: userReactionsMap.get(r.id) ?? [] }));

    return { items: enriched, nextCursor, hasMore };
  }

  async deleteComment(commentId: string, userId: string) {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
    });
    if (!comment) return null;
    if (comment.authorId !== userId) throw new Error('FORBIDDEN');

    // Soft-delete the WHOLE reply subtree, not just the target comment.
    // `addComment` increments `post.commentCount` for EVERY comment — top-level
    // AND reply (l.102) — so `commentCount` counts the full non-deleted thread.
    // The relation is `onDelete: NoAction` (schema l.3102) and `PostComment`
    // allows arbitrary-depth chains (any live comment can be a `parentId`), so a
    // decrement of 1 would (a) leave surviving replies orphaned — `getComments`
    // filters `parentId: null` and their now-deleted parent is never rendered, so
    // `getReplies` is never called for them — and (b) permanently over-count
    // `commentCount` by the number of surviving descendants. Collect the subtree
    // breadth-first and remove it atomically-in-count.
    const descendantIds: string[] = [];
    let frontier = [commentId];
    while (frontier.length > 0) {
      const children = await this.prisma.postComment.findMany({
        where: { parentId: { in: frontier }, deletedAt: NOT_DELETED },
        select: { id: true },
      });
      if (children.length === 0) break;
      const childIds = children.map((c) => c.id);
      descendantIds.push(...childIds);
      frontier = childIds;
    }

    const deletedAt = new Date();
    await this.prisma.postComment.updateMany({
      where: { id: { in: [commentId, ...descendantIds] } },
      data: { deletedAt },
    });

    await this.prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 + descendantIds.length } },
    });

    // Only the direct parent's `replyCount` moves: it counts direct children, and
    // exactly one direct child (this comment) disappears. Descendant reply counts
    // are irrelevant once their rows are soft-deleted.
    if (comment.parentId) {
      await this.prisma.postComment.update({
        where: { id: comment.parentId },
        data: { replyCount: { decrement: 1 } },
      });
    }

    return { success: true };
  }

  async likeComment(commentId: string, userId: string, emoji: string = '❤️') {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
      select: { id: true },
    });
    if (!comment) return null;

    // Source de vérité = table `CommentReaction` (comme le chemin socket).
    // Invariant « un seul like par user » : le chemin socket
    // (`CommentReactionService.addReaction`, MAX_REACTIONS_PER_USER = 1) refuse une
    // 2e réaction d'emoji différent. Le REST doit l'honorer identiquement, sinon un
    // like avec un autre emoji créerait une 2e ligne (commentId,userId,autreEmoji) et
    // doublerait le compte. On supprime donc d'abord toute réaction préexistante de
    // ce user portant un AUTRE emoji, puis on upsert l'emoji courant → au plus une
    // ligne par (commentId,userId). Idempotent sur le même emoji, remplaçant sur un
    // emoji différent : le REST reste un FALLBACK sûr sans double-comptage.
    await this.prisma.commentReaction.deleteMany({
      where: { commentId, userId, emoji: { not: emoji } },
    });
    await this.prisma.commentReaction.upsert({
      where: { comment_user_reaction_unique: { commentId, userId, emoji } },
      create: { commentId, userId, emoji },
      update: {},
    });
    return this.syncCommentLikeCounters(commentId);
  }

  async unlikeComment(commentId: string, userId: string, emoji: string = '❤️') {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
      select: { id: true },
    });
    if (!comment) return null;

    await this.prisma.commentReaction.deleteMany({ where: { commentId, userId, emoji } });
    return this.syncCommentLikeCounters(commentId);
  }

  /// Recalcule les compteurs dénormalisés du commentaire DEPUIS la table (source de
  /// vérité) : `likeCount` = `reactionCount` = nombre total de réactions, et
  /// `reactionSummary` = comptes par emoji. Identique au chemin socket (CS1) → REST
  /// et socket restent parfaitement cohérents, ce qui autorise le REST comme fallback.
  private async syncCommentLikeCounters(commentId: string) {
    const grouped = await this.prisma.commentReaction.groupBy({
      by: ['emoji'],
      where: { commentId },
      _count: { emoji: true },
    });
    const summary: Record<string, number> = {};
    let total = 0;
    for (const g of grouped) {
      summary[g.emoji] = g._count.emoji;
      total += g._count.emoji;
    }
    return this.prisma.postComment.update({
      where: { id: commentId },
      data: {
        likeCount: total,
        reactionCount: total,
        reactionSummary: summary as Prisma.InputJsonValue,
      },
      select: {
        id: true,
        postId: true,
        authorId: true,
        content: true,
        likeCount: true,
        reactionSummary: true,
      },
    });
  }
}
