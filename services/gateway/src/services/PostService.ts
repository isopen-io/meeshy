import type { PrismaClient } from '@meeshy/shared/prisma/client';

const STORY_EXPIRY_HOURS = 21;
const STATUS_EXPIRY_HOURS = 1;

// Minimal language detection (first word heuristics + fallback)
function detectLanguage(text: string): string {
  if (!text) return 'en';
  const lower = text.toLowerCase();
  // Simple heuristic based on common words
  const langPatterns: Record<string, RegExp> = {
    fr: /\b(le|la|les|un|une|des|je|tu|il|nous|vous|est|sont|avec|pour|dans|que|qui|pas|mais)\b/,
    es: /\b(el|la|los|las|un|una|es|son|con|para|en|que|por|del|como|pero|más)\b/,
    de: /\b(der|die|das|ein|eine|ist|sind|mit|für|und|ich|nicht|auf|dem|den)\b/,
    pt: /\b(o|a|os|as|um|uma|é|são|com|para|em|que|por|do|da|não|mas)\b/,
    ar: /[\u0600-\u06FF]/,
    zh: /[\u4e00-\u9fff]/,
    ja: /[\u3040-\u309F\u30A0-\u30FF]/,
  };
  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(lower)) return lang;
  }
  return 'en';
}

// Select fields for author
const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
  avatarUrl: true,
};

// Select fields for media
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

// Base post include
const postInclude = {
  author: { select: authorSelect },
  media: { select: mediaSelect, orderBy: { order: 'asc' as const } },
  comments: {
    where: { isDeleted: false, parentId: null },
    select: {
      id: true,
      content: true,
      originalLanguage: true,
      translations: true,
      likeCount: true,
      replyCount: true,
      createdAt: true,
      author: { select: authorSelect },
    },
    orderBy: { likeCount: 'desc' as const },
    take: 3,
  },
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

export class PostService {
  constructor(private readonly prisma: PrismaClient) {}

  async createPost(data: {
    type: string;
    visibility: string;
    content?: string;
    communityId?: string;
    storyEffects?: Record<string, unknown>;
    moodEmoji?: string;
    audioUrl?: string;
    audioDuration?: number;
    mediaIds?: string[];
  }, userId: string) {
    const now = new Date();
    let expiresAt: Date | undefined;

    if (data.type === 'STORY') {
      expiresAt = new Date(now.getTime() + STORY_EXPIRY_HOURS * 3600_000);
    } else if (data.type === 'STATUS') {
      expiresAt = new Date(now.getTime() + STATUS_EXPIRY_HOURS * 3600_000);
    }

    const originalLanguage = data.content ? detectLanguage(data.content) : undefined;

    const post = await this.prisma.post.create({
      data: {
        authorId: userId,
        type: data.type as any,
        visibility: data.visibility as any,
        content: data.content,
        originalLanguage,
        communityId: data.communityId,
        storyEffects: (data.storyEffects as any) ?? undefined,
        moodEmoji: data.moodEmoji,
        audioUrl: data.audioUrl,
        audioDuration: data.audioDuration,
        expiresAt,
      },
      include: postInclude,
    });

    // Link pre-uploaded media if any
    if (data.mediaIds?.length) {
      await this.prisma.postMedia.updateMany({
        where: { id: { in: data.mediaIds } },
        data: { postId: post.id },
      });
    }

    return post;
  }

  async getPostById(postId: string, viewerUserId?: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      include: postInclude,
    });

    if (!post) return null;

    // Record view asynchronously (fire & forget)
    if (viewerUserId) {
      this.recordView(postId, viewerUserId).catch(() => {});
    }

    return post;
  }

  async updatePost(postId: string, userId: string, data: {
    content?: string;
    visibility?: string;
    storyEffects?: Record<string, unknown>;
    moodEmoji?: string;
  }) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) return null;
    if (post.authorId !== userId) {
      throw new Error('FORBIDDEN');
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        ...data,
        visibility: data.visibility as any,
        storyEffects: (data.storyEffects as any) ?? undefined,
        isEdited: true,
      },
      include: postInclude,
    });
  }

  async deletePost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });

    if (!post) return null;
    if (post.authorId !== userId) {
      throw new Error('FORBIDDEN');
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: { isDeleted: true, deletedAt: new Date() },
    });
  }

  async likePost(postId: string, userId: string, emoji: string = '❤️') {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return null;

    const reactions = (post.reactions as any[] | null) ?? [];
    const existing = reactions.find((r: any) => r.userId === userId);
    if (existing) return post; // Already liked

    const updatedReactions = [...reactions, { userId, emoji, createdAt: new Date().toISOString() }];

    // Update summary
    const summary = (post.reactionSummary as Record<string, number> | null) ?? {};
    summary[emoji] = (summary[emoji] ?? 0) + 1;

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        reactions: updatedReactions as any,
        reactionSummary: summary as any,
        reactionCount: { increment: 1 },
        likeCount: { increment: 1 },
      },
      include: postInclude,
    });
  }

  async unlikePost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return null;

    const reactions = (post.reactions as any[] | null) ?? [];
    const existing = reactions.find((r: any) => r.userId === userId);
    if (!existing) return post; // Not liked

    const updatedReactions = reactions.filter((r: any) => r.userId !== userId);
    const emoji = existing.emoji;

    const summary = (post.reactionSummary as Record<string, number> | null) ?? {};
    if (summary[emoji]) {
      summary[emoji] = Math.max(0, summary[emoji] - 1);
      if (summary[emoji] === 0) delete summary[emoji];
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: {
        reactions: updatedReactions as any,
        reactionSummary: summary as any,
        reactionCount: { decrement: 1 },
        likeCount: { decrement: 1 },
      },
      include: postInclude,
    });
  }

  async bookmarkPost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return null;

    // Upsert to handle duplicates
    await this.prisma.postBookmark.upsert({
      where: { postId_userId: { postId, userId } },
      create: { postId, userId },
      update: {},
    });

    await this.prisma.post.update({
      where: { id: postId },
      data: { bookmarkCount: { increment: 1 } },
    });

    return { success: true };
  }

  async unbookmarkPost(postId: string, userId: string) {
    try {
      await this.prisma.postBookmark.delete({
        where: { postId_userId: { postId, userId } },
      });

      await this.prisma.post.update({
        where: { id: postId },
        data: { bookmarkCount: { decrement: 1 } },
      });
    } catch {
      // Not bookmarked — ignore
    }

    return { success: true };
  }

  async recordView(postId: string, userId: string, duration?: number) {
    try {
      const existing = await this.prisma.postView.findUnique({
        where: { postId_userId: { postId, userId } },
      });

      if (existing) {
        // Update duration if provided
        if (duration) {
          await this.prisma.postView.update({
            where: { id: existing.id },
            data: { duration },
          });
        }
        return;
      }

      await this.prisma.postView.create({
        data: { postId, userId, duration },
      });

      await this.prisma.post.update({
        where: { id: postId },
        data: { viewCount: { increment: 1 } },
      });
    } catch {
      // Ignore race conditions
    }
  }

  async repostPost(postId: string, userId: string, content?: string, isQuote: boolean = false) {
    const original = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!original) return null;

    const originalLanguage = content ? detectLanguage(content) : undefined;

    const repost = await this.prisma.post.create({
      data: {
        authorId: userId,
        type: 'POST',
        visibility: original.visibility,
        content: content ?? undefined,
        originalLanguage,
        repostOfId: postId,
        isQuote,
      },
      include: postInclude,
    });

    await this.prisma.post.update({
      where: { id: postId },
      data: { repostCount: { increment: 1 } },
    });

    return repost;
  }
}
