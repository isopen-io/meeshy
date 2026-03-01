import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import type { MobileTranscription } from '../routes/posts/types';
import { PostAudioService } from './posts/PostAudioService';
import { enhancedLogger } from '../utils/logger-enhanced';
import { ZMQSingleton } from './ZmqSingleton';

const log = enhancedLogger.child({ module: 'PostService' });

interface StoryTextObjectRaw {
  id?: string;
  content: string;
  sourceLanguage?: string;
  translations?: Record<string, string>;
  [key: string]: unknown;
}

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
  transcription: true,
  translations: true,
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
    visibilityUserIds?: string[];
    content?: string;
    communityId?: string;
    storyEffects?: Record<string, unknown>;
    moodEmoji?: string;
    audioUrl?: string;
    audioDuration?: number;
    mediaIds?: string[];
    mobileTranscription?: MobileTranscription;
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
        visibilityUserIds: data.visibilityUserIds ?? [],
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
    // mediaIds contains PostMedia IDs (created directly by TUS handler with postId=null)
    if (data.mediaIds?.length) {
      await this.prisma.postMedia.updateMany({
        where: { id: { in: data.mediaIds } },
        data: { postId: post.id },
      });

      // Locate the first audio PostMedia for transcription processing
      const audioMedia = await this.prisma.postMedia.findFirst({
        where: { id: { in: data.mediaIds }, mimeType: { startsWith: 'audio/' } },
        orderBy: { order: 'asc' },
        select: { id: true, fileUrl: true },
      });

      // If a mobileTranscription is provided, persist it in the audio PostMedia
      if (data.mobileTranscription && audioMedia) {
        const transcriptionPayload: Prisma.InputJsonValue = {
          ...data.mobileTranscription,
          segments: data.mobileTranscription.segments ?? [],
          source: 'mobile',
        };
        await this.prisma.postMedia.update({
          where: { id: audioMedia.id },
          data: { transcription: transcriptionPayload },
        });
      }

      // Trigger server-side Whisper transcription only when no mobile transcription was provided (fire-and-forget)
      if (audioMedia && !data.mobileTranscription) {
        PostAudioService.shared.processPostAudio({
          postId: post.id,
          postMediaId: audioMedia.id,
          fileUrl: audioMedia.fileUrl ?? '',
          authorId: post.authorId,
        }).catch((err: unknown) => {
          log.error('Post audio processing failed', err, { postId: post.id });
        });
      }
    }

    // Déclencher la traduction Prisme pour les stories avec texte (fire-and-forget)
    if (data.type === 'STORY' && data.content) {
      this.triggerStoryTextTranslation(post.id, data.content, userId).catch(() => {});
    }

    // Si story avec textObjects : remplir content comme index de recherche + déclencher traductions
    const effects = data.storyEffects as Record<string, unknown> | undefined;
    const rawTextObjects = effects?.textObjects;
    const textObjects = Array.isArray(rawTextObjects) ? (rawTextObjects as StoryTextObjectRaw[]) : undefined;

    if (textObjects?.length) {
      const searchContent = textObjects
        .map((t) => t.content)
        .filter(Boolean)
        .join(' ');

      if (searchContent && !data.content) {
        await this.prisma.post.update({
          where: { id: post.id },
          data: { content: searchContent },
        });
      }

      this.triggerStoryTextObjectTranslation(post.id, textObjects);
    }

    // Refetch pour inclure transcription et translations après toutes les opérations media
    const refreshed = await this.prisma.post.findUnique({
      where: { id: post.id },
      include: postInclude,
    });
    return refreshed ?? post;
  }

  private async triggerStoryTextTranslation(postId: string, content: string, authorId: string): Promise<void> {
    try {
      // 1. Résoudre les langues cibles depuis les contacts de l'auteur
      const contacts = await this.prisma.conversationMember.findMany({
        where: {
          conversation: { members: { some: { userId: authorId } } },
          userId: { not: authorId },
        },
        include: { user: { select: { systemLanguage: true } } },
        take: 100,
      });

      const targetLanguages = [...new Set(
        contacts
          .map((c) => c.user?.systemLanguage ?? undefined)
          .filter((l): l is string => !!l && l !== 'en')
      )].slice(0, 10);

      if (targetLanguages.length === 0) {
        log.info('StoryTranslation: no target languages', { postId });
        return;
      }

      // 2. Obtenir le client ZMQ
      const zmqClient = ZMQSingleton.getInstanceSync();
      if (!zmqClient) {
        log.warn('StoryTranslation: ZMQ client not available', { postId });
        return;
      }

      const storyMessageId = `story:${postId}`;
      const sourceLanguage = detectLanguage(content);

      log.info('StoryTranslation: sending ZMQ request', { postId, sourceLanguage, targetLanguages });

      // 3. Listener pour recevoir les résultats un par un
      let receivedCount = 0;
      const expectedCount = targetLanguages.length;
      let timeoutHandle: ReturnType<typeof setTimeout> | null = null;

      const removeListener = () => {
        zmqClient.off('translationCompleted', handleResult);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      const handleResult = async (event: { taskId: string; result: { messageId: string; translatedText: string; confidenceScore?: number; translatorModel?: string }; targetLanguage: string; metadata: Record<string, unknown> }) => {
        if (event.result.messageId !== storyMessageId) return;

        try {
          await (this.prisma as any).$runCommandRaw({
            update: 'Post',
            updates: [{
              q: { _id: { $oid: postId } },
              u: { $set: { [`translations.${event.targetLanguage}`]: {
                text: event.result.translatedText,
                translationModel: event.result.translatorModel ?? 'nllb',
                confidenceScore: event.result.confidenceScore ?? 1,
                createdAt: new Date().toISOString(),
              }}},
            }],
          });

          log.info('StoryTranslation: saved', { postId, lang: event.targetLanguage });
        } catch (err) {
          log.warn('StoryTranslation: save failed', { err, postId });
        }

        receivedCount++;
        if (receivedCount >= expectedCount) {
          log.info('StoryTranslation: all languages received, removing listener', { postId, receivedCount });
          removeListener();
        }
      };

      zmqClient.on('translationCompleted', handleResult);

      // 4. Envoyer la requête ZMQ
      try {
        await zmqClient.translateToMultipleLanguages(
          content,
          sourceLanguage,
          targetLanguages,
          storyMessageId,
          `story_context:${postId}`,
        );
      } catch (sendError) {
        removeListener();
        throw sendError;
      }

      // 5. Cleanup du listener après timeout (fallback si certaines langues échouent)
      timeoutHandle = setTimeout(() => {
        if (receivedCount < expectedCount) {
          log.warn('StoryTranslation: timeout, removing listener', { postId, receivedCount, expectedCount });
        }
        removeListener();
      }, 60_000);

    } catch (error) {
      log.warn('StoryTranslation failed', { err: error, postId });
    }
  }

  private triggerStoryTextObjectTranslation(
    postId: string,
    textObjects: StoryTextObjectRaw[]
  ): void {
    // Envoie les textObjects au pipeline de traduction.
    // La persistence des résultats est gérée par le handler ZMQ Task 15
    // (story_text_object_translation_completed → storyEffects.textObjects[n].translations).
    const targetLanguages = this.getActiveTargetLanguages();

    textObjects.forEach((obj, index) => {
      const text = obj.content?.trim();
      if (!text) return;

      const zmqClient = ZMQSingleton.getInstanceSync();
      if (!zmqClient) {
        log.warn('StoryTextObjectTranslation: ZMQ client not available', { postId, index });
        return;
      }

      const sourceLanguage = obj.sourceLanguage ?? detectLanguage(text);

      log.info('StoryTextObjectTranslation: sending ZMQ request', { postId, index, sourceLanguage, targetLanguages });

      zmqClient.translateTextObject({
        postId,
        textObjectIndex: index,
        text,
        sourceLanguage,
        targetLanguages,
      });
    });
  }

  private getActiveTargetLanguages(): string[] {
    return ['en', 'fr', 'es', 'de', 'pt', 'ar', 'zh', 'ja', 'ko', 'ru'];
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
    visibilityUserIds?: string[];
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

    const updateData: any = {
      ...data,
      visibility: data.visibility as any,
      storyEffects: (data.storyEffects as any) ?? undefined,
      isEdited: true,
    };
    if (data.visibilityUserIds !== undefined) {
      updateData.visibilityUserIds = data.visibilityUserIds;
    }

    return this.prisma.post.update({
      where: { id: postId },
      data: updateData,
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

  async sharePost(postId: string, userId: string, platform?: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return null;

    return this.prisma.post.update({
      where: { id: postId },
      data: { shareCount: { increment: 1 } },
      include: postInclude,
    });
  }

  async pinPost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    return this.prisma.post.update({
      where: { id: postId },
      data: { isPinned: true },
      include: postInclude,
    });
  }

  async unpinPost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    return this.prisma.post.update({
      where: { id: postId },
      data: { isPinned: false },
      include: postInclude,
    });
  }

  async getPostViews(postId: string, userId: string, limit: number = 50, offset: number = 0) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    const views = await this.prisma.postView.findMany({
      where: { postId },
      include: {
        user: { select: authorSelect },
      },
      orderBy: { viewedAt: 'desc' },
      take: limit,
      skip: offset,
    });

    const total = await this.prisma.postView.count({ where: { postId } });

    return { items: views, total, hasMore: offset + limit < total };
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
