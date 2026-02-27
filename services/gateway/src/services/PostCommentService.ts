import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { decodeCursor, encodeCursor } from '../routes/posts/types';

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
};

export class PostCommentService {
  constructor(private readonly prisma: PrismaClient) {}

  async addComment(postId: string, authorId: string, content: string, parentId?: string) {
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
        parentId: parentId ?? undefined,
      },
      select: {
        id: true,
        content: true,
        originalLanguage: true,
        translations: true,
        likeCount: true,
        replyCount: true,
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

  async getComments(postId: string, cursor?: string, limit: number = 20) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      postId,
      isDeleted: false,
      parentId: null, // top-level only
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

    return { items, nextCursor, hasMore };
  }

  async getReplies(commentId: string, cursor?: string, limit: number = 20) {
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

    return { items, nextCursor, hasMore };
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
        reactionSummary: summary as any,
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
        reactionSummary: summary as any,
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
