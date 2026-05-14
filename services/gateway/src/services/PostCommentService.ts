import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import { decodeCursor, encodeCursor } from '../routes/posts/types';

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
};

export class PostCommentService {
  constructor(private readonly prisma: PrismaClient) {}

  async addComment(
    postId: string,
    authorId: string,
    content: string,
    parentId?: string,
    effectFlags?: number,
    originalLanguage?: string,
  ) {
    // Verify post exists
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return null;

    // If parentId, verify parent exists
    if (parentId) {
      const parent = await this.prisma.postComment.findFirst({
        where: { id: parentId, postId, isDeleted: false },
      });
      if (!parent) throw new Error('PARENT_NOT_FOUND');
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
        author: { select: authorSelect },
      },
    });

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

    return comment;
  }

  async getComments(postId: string, cursor?: string, limit: number = 20, currentUserId?: string) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      postId,
      isDeleted: false,
      OR: [{ parentId: null }, { parentId: { isSet: false } }],
    };

    if (cursorData) {
      where.OR = [
        { createdAt: { lt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
      ];
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
        author: { select: authorSelect },
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
      isDeleted: false,
    };

    if (cursorData) {
      where.OR = [
        { createdAt: { lt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
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
        author: { select: authorSelect },
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
      where: { id: commentId, isDeleted: false },
    });
    if (!comment) return null;
    if (comment.authorId !== userId) throw new Error('FORBIDDEN');

    await this.prisma.postComment.update({
      where: { id: commentId },
      data: { isDeleted: true, deletedAt: new Date() },
    });

    await this.prisma.post.update({
      where: { id: comment.postId },
      data: { commentCount: { decrement: 1 } },
    });

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
      where: { id: commentId, isDeleted: false },
    });
    if (!comment) return null;

    const summary = (comment.reactionSummary as Record<string, number> | null) ?? {};
    summary[emoji] = (summary[emoji] ?? 0) + 1;

    return this.prisma.postComment.update({
      where: { id: commentId },
      data: {
        likeCount: { increment: 1 },
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

  async unlikeComment(commentId: string, userId: string, emoji: string = '❤️') {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, isDeleted: false },
    });
    if (!comment) return null;

    const summary = (comment.reactionSummary as Record<string, number> | null) ?? {};
    if (summary[emoji]) {
      summary[emoji] = Math.max(0, summary[emoji] - 1);
      if (summary[emoji] === 0) delete summary[emoji];
    }

    return this.prisma.postComment.update({
      where: { id: commentId },
      data: {
        likeCount: { decrement: 1 },
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
