import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { decodeCursor, encodeCursor } from '../routes/posts/types';

const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
};

const mediaSelect = {
  id: true,
  fileName: true,
  originalName: true,
  mimeType: true,
  fileSize: true,
  fileUrl: true,
  width: true,
  height: true,
  thumbnailUrl: true,
  duration: true,
  order: true,
  caption: true,
  alt: true,
};

const feedPostInclude = {
  author: { select: authorSelect },
  media: { select: mediaSelect, orderBy: { order: 'asc' as const } },
  repostOf: {
    select: {
      id: true,
      content: true,
      author: { select: authorSelect },
      media: { select: mediaSelect, orderBy: { order: 'asc' as const } },
      createdAt: true,
      likeCount: true,
      commentCount: true,
    },
  },
};

// ============================================
// SCORING FUNCTIONS
// ============================================

function recencyScore(createdAt: Date): number {
  const hoursAge = (Date.now() - createdAt.getTime()) / 3_600_000;
  return 1 / (1 + hoursAge / 6); // half-life = 6 hours
}

function engagementScore(post: any): number {
  const raw =
    (post.likeCount ?? 0) * 1 +
    (post.commentCount ?? 0) * 3 +
    (post.repostCount ?? 0) * 5 +
    (post.viewCount ?? 0) * 0.1 +
    (post.bookmarkCount ?? 0) * 2;
  return Math.log10(1 + raw) / 6;
}

function diversityScore(authorId: string, authorCounts: Map<string, number>): number {
  const count = authorCounts.get(authorId) ?? 0;
  return 1 / (1 + count * 0.5);
}

export class PostFeedService {
  constructor(private readonly prisma: PrismaClient) {}

  /**
   * Main feed with recommendation scoring.
   * Phase 1: Fetch candidates from DB (3x limit)
   * Phase 2: Score & rank in-app
   */
  async getFeed(userId: string, cursor?: string, limit: number = 20) {
    const candidateLimit = limit * 3;
    const cursorData = cursor ? decodeCursor(cursor) : null;

    // Phase 1 — Fetch candidates
    const where: any = {
      isDeleted: false,
      type: 'POST',
      visibility: { in: ['PUBLIC', 'FRIENDS'] },
      // Exclude expired
      OR: [
        { expiresAt: null },
        { expiresAt: { gt: new Date() } },
      ],
    };

    if (cursorData) {
      // Cursor-based: get posts before cursor
      where.AND = [
        {
          OR: [
            { createdAt: { lt: new Date(cursorData.createdAt) } },
            { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
          ],
        },
      ];
    }

    const candidates = await this.prisma.post.findMany({
      where,
      include: feedPostInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: candidateLimit,
    });

    if (candidates.length === 0) {
      return { items: [], nextCursor: null, hasMore: false };
    }

    // Fetch affinity data: friends list
    const friendIds = await this.getFriendIds(userId);

    // Phase 2 — Score candidates
    const authorCounts = new Map<string, number>();
    const scored = candidates.map((post) => {
      const affinity = this.affinityScore(post.authorId, userId, friendIds);
      const diversity = diversityScore(post.authorId, authorCounts);

      const score =
        recencyScore(post.createdAt) * 0.35 +
        engagementScore(post) * 0.25 +
        affinity * 0.25 +
        diversity * 0.15;

      // Track author counts for diversity penalty
      authorCounts.set(post.authorId, (authorCounts.get(post.authorId) ?? 0) + 1);

      return { post, score };
    });

    // Sort by score descending
    scored.sort((a, b) => b.score - a.score);

    // Take top `limit` + check hasMore
    const topItems = scored.slice(0, limit + 1);
    const hasMore = topItems.length > limit;
    const items = hasMore ? topItems.slice(0, limit) : topItems;

    const lastItem = items[items.length - 1];
    const nextCursor = hasMore && lastItem
      ? encodeCursor(lastItem.post.createdAt, lastItem.post.id)
      : null;

    return {
      items: items.map((s) => s.post),
      nextCursor,
      hasMore,
    };
  }

  async getStories(userId: string) {
    const now = new Date();
    const friendIds = await this.getFriendIds(userId);
    const viewerIds = [userId, ...friendIds];

    const stories = await this.prisma.post.findMany({
      where: {
        isDeleted: false,
        type: 'STORY',
        authorId: { in: viewerIds },
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: now } },
        ],
      },
      include: feedPostInclude,
      orderBy: { createdAt: 'desc' },
      take: 50,
    });

    return stories;
  }

  async getStatuses(userId: string, cursor?: string, limit: number = 20) {
    const now = new Date();
    const cursorData = cursor ? decodeCursor(cursor) : null;
    const friendIds = await this.getFriendIds(userId);
    const visibilityFilter = this.buildVisibilityFilter(userId, friendIds);

    const whereClause: any = {
      isDeleted: false,
      type: 'STATUS',
      AND: [
        visibilityFilter,
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
      ],
    };

    if (cursorData) {
      whereClause.AND.push({
        OR: [
          { createdAt: { lt: new Date(cursorData.createdAt) } },
          { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
        ],
      });
    }

    const statuses = await this.prisma.post.findMany({
      where: whereClause,
      include: {
        author: { select: authorSelect },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = statuses.length > limit;
    const items = hasMore ? statuses.slice(0, limit) : statuses;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    return { items, nextCursor, hasMore };
  }

  async getDiscoverStatuses(userId: string, cursor?: string, limit: number = 20) {
    const now = new Date();
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      isDeleted: false,
      type: 'STATUS',
      visibility: 'PUBLIC',
      AND: [
        { OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
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

    const statuses = await this.prisma.post.findMany({
      where,
      include: {
        author: { select: authorSelect },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = statuses.length > limit;
    const items = hasMore ? statuses.slice(0, limit) : statuses;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    return { items, nextCursor, hasMore };
  }

  async getUserPosts(targetUserId: string, viewerUserId: string | undefined, cursor?: string, limit: number = 20) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      authorId: targetUserId,
      isDeleted: false,
      type: 'POST',
    };

    // Visibility filter
    if (viewerUserId !== targetUserId) {
      where.visibility = 'PUBLIC';
    }

    if (cursorData) {
      where.OR = [
        { createdAt: { lt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
      ];
    }

    const posts = await this.prisma.post.findMany({
      where,
      include: feedPostInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    return { items, nextCursor, hasMore };
  }

  async getCommunityFeed(communityId: string, viewerUserId: string | undefined, cursor?: string, limit: number = 20) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = {
      communityId,
      isDeleted: false,
      type: 'POST',
      visibility: { in: ['PUBLIC', 'COMMUNITY'] },
    };

    if (cursorData) {
      where.OR = [
        { createdAt: { lt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
      ];
    }

    const posts = await this.prisma.post.findMany({
      where,
      include: feedPostInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = posts.length > limit;
    const items = hasMore ? posts.slice(0, limit) : posts;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    return { items, nextCursor, hasMore };
  }

  async getBookmarks(userId: string, cursor?: string, limit: number = 20) {
    const cursorData = cursor ? decodeCursor(cursor) : null;

    const where: any = { userId };

    if (cursorData) {
      where.OR = [
        { createdAt: { lt: new Date(cursorData.createdAt) } },
        { createdAt: new Date(cursorData.createdAt), id: { lt: cursorData.id } },
      ];
    }

    const bookmarks = await this.prisma.postBookmark.findMany({
      where,
      include: {
        post: {
          include: feedPostInclude,
        },
      },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit + 1,
    });

    const hasMore = bookmarks.length > limit;
    const items = hasMore ? bookmarks.slice(0, limit) : bookmarks;
    const nextCursor = hasMore && items.length > 0
      ? encodeCursor(items[items.length - 1].createdAt, items[items.length - 1].id)
      : null;

    return {
      items: items.map((b) => b.post).filter((p) => p && !p.isDeleted),
      nextCursor,
      hasMore,
    };
  }

  // ============================================
  // PRIVATE HELPERS
  // ============================================

  private buildVisibilityFilter(viewerId: string, friendIds: string[]) {
    return {
      OR: [
        { authorId: viewerId },
        { visibility: 'PUBLIC' },
        { visibility: 'FRIENDS', authorId: { in: friendIds } },
        { visibility: 'EXCEPT', authorId: { in: friendIds }, NOT: { visibilityUserIds: { has: viewerId } } },
        { visibility: 'ONLY', visibilityUserIds: { has: viewerId } },
      ],
    };
  }

  private async getFriendIds(userId: string): Promise<string[]> {
    try {
      const friendRequests = await this.prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [
            { senderId: userId },
            { receiverId: userId },
          ],
        },
        select: { senderId: true, receiverId: true },
      });

      return friendRequests.map((f) =>
        f.senderId === userId ? f.receiverId : f.senderId
      );
    } catch {
      return [];
    }
  }

  private affinityScore(authorId: string, viewerId: string, friendIds: string[]): number {
    if (authorId === viewerId) return 0.8;
    if (friendIds.includes(authorId)) return 0.5;
    return 0;
  }
}
