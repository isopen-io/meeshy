import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { PostVisibility, PostType } from '@meeshy/shared/prisma/client';
import { PostReactionService } from './PostReactionService';
import type { MobileTranscription } from '../routes/posts/types';
import { PostAudioService } from './posts/PostAudioService';
import { MediaService } from './MediaService';
import type { MediaStorage, MediaDuplicateResult } from './storage/MediaStorage';
import type { OrphanMediaCleanupService } from './storage/OrphanMediaCleanupService';
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

function computeExpiresAt(type: PostType): Date | undefined {
  if (type === PostType.STORY) return new Date(Date.now() + STORY_EXPIRY_HOURS * 3600_000);
  if (type === PostType.STATUS) return new Date(Date.now() + STATUS_EXPIRY_HOURS * 3600_000);
  return undefined;
}

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
  thumbHash: true,
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
    where: { isDeleted: false, OR: [{ parentId: null }, { parentId: { isSet: false } }] },
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
      type: true,
      content: true,
      originalLanguage: true,
      translations: true,
      storyEffects: true,
      audioUrl: true,
      originalRepostOfId: true,
      author: { select: authorSelect },
      media: { select: mediaSelect, orderBy: { order: 'asc' as const } },
      createdAt: true,
      likeCount: true,
      commentCount: true,
    },
  },
};

export class PostService {
  private readonly postReactionService: PostReactionService;

  constructor(
    private readonly prisma: PrismaClient,
    // Typed against the MediaStorage interface so a future swap to MinIO/R2
    // (Pilier 7 SOTA migration path) does not need to touch this class.
    // The default value remains the local-filesystem implementation.
    private readonly mediaService: MediaStorage = new MediaService(),
    // Optional outbox tracker — when injected (production server bootstrap),
    // every snapshot file produced inside `repostPost` is registered before
    // the surrounding transaction commits, and the registration is removed
    // on commit. If the process crashes mid-call, the worker reaps the
    // orphan files. When omitted (unit tests, ad-hoc invocations), the
    // path-based inline rollback in the catch block remains the only
    // safety net — same behavior as before the outbox was introduced.
    // Reference: SOTA audit Pilier 4.
    private readonly orphanCleanup?: OrphanMediaCleanupService,
    postReactionService?: PostReactionService,
  ) {
    this.postReactionService = postReactionService ?? new PostReactionService(prisma);
  }

  async createPost(data: {
    type: PostType;
    visibility: PostVisibility;
    visibilityUserIds?: string[];
    content?: string;
    originalLanguage?: string;
    communityId?: string;
    storyEffects?: Record<string, unknown>;
    moodEmoji?: string;
    audioUrl?: string;
    audioDuration?: number;
    mediaIds?: string[];
    mobileTranscription?: MobileTranscription;
    repostOfId?: string;
  }, userId: string) {
    const now = new Date();
    let expiresAt: Date | undefined;

    if (data.type === PostType.STORY) {
      expiresAt = new Date(now.getTime() + STORY_EXPIRY_HOURS * 3600_000);
    } else if (data.type === PostType.STATUS) {
      expiresAt = new Date(now.getTime() + STATUS_EXPIRY_HOURS * 3600_000);
    }

    const originalLanguage = data.originalLanguage ?? (data.content ? detectLanguage(data.content) : undefined);

    let repostOfId: string | undefined;
    let originalRepostOfId: string | undefined;

    if (data.repostOfId) {
      const sourcePost = await this.prisma.post.findFirst({
        where: { id: data.repostOfId, isDeleted: false },
        select: { id: true, repostOfId: true, originalRepostOfId: true },
      });
      if (!sourcePost) {
        const err: any = new Error('Repost source not found');
        err.statusCode = 404;
        throw err;
      }
      repostOfId = sourcePost.id;
      originalRepostOfId = (sourcePost.originalRepostOfId as string | null)
        ?? (sourcePost.repostOfId as string | null)
        ?? sourcePost.id;
    }

    const post = await this.prisma.post.create({
      data: {
        authorId: userId,
        type: data.type,
        visibility: data.visibility,
        visibilityUserIds: data.visibilityUserIds ?? [],
        content: data.content,
        originalLanguage,
        communityId: data.communityId,
        storyEffects: (data.storyEffects as any) ?? undefined,
        moodEmoji: data.moodEmoji,
        audioUrl: data.audioUrl,
        audioDuration: data.audioDuration,
        expiresAt,
        ...(repostOfId !== undefined ? { repostOfId, originalRepostOfId } : {}),
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
    if (data.type === PostType.STORY && data.content) {
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
      const contacts = await this.prisma.participant.findMany({
        where: {
          conversation: { participants: { some: { userId: authorId } } },
          userId: { not: authorId },
        },
        include: { user: { select: { systemLanguage: true } } },
        take: 100,
      });

      const targetLanguages: string[] = [...new Set(
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

      // Subscribe to the per-messageId scoped event instead of the global
      // `translationCompleted`. Avoids O(active_stories × global_events) filter
      // overhead — previously every translation across the entire gateway
      // (messages, comments, etc.) fanned out to every active story listener
      // which then filtered by messageId. With 100 active stories and 1000
      // messages/min that was ~100k listener invocations/min.
      const scopedEvent = `translationCompleted:${storyMessageId}`;

      const removeListener = () => {
        zmqClient.off(scopedEvent, handleResult);
        if (timeoutHandle) {
          clearTimeout(timeoutHandle);
          timeoutHandle = null;
        }
      };

      const handleResult = async (event: { taskId: string; result: { messageId: string; translatedText: string; confidenceScore?: number; translatorModel?: string }; targetLanguage: string; metadata: Record<string, unknown> }) => {
        // The scoped event guarantees messageId match, but keep the guard for
        // defense in depth (the event payload is reused).
        if (event.result.messageId !== storyMessageId) return;

        // Reject malformed `targetLanguage` before interpolating into the
        // raw Mongo `$set` field path. A value like `"a.b.$inject"` would
        // otherwise let a compromised translator write arbitrary fields.
        if (!/^[a-z]{2,5}$/.test(event.targetLanguage)) {
          log.warn('StoryTranslation: rejected malformed targetLanguage', { postId, targetLanguage: event.targetLanguage });
          return;
        }

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

      zmqClient.on(scopedEvent, handleResult);

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
    // TODO: query audience's actual languages (like triggerStoryTextTranslation does for message content)
    const allTargetLanguages = this.getActiveTargetLanguages();

    textObjects.forEach((obj, index) => {
      const text = obj.content?.trim();
      if (!text) return;

      const zmqClient = ZMQSingleton.getInstanceSync();
      if (!zmqClient) {
        log.warn('StoryTextObjectTranslation: ZMQ client not available', { postId, index });
        return;
      }

      const sourceLanguage = obj.sourceLanguage ?? detectLanguage(text);
      const targetLanguages = allTargetLanguages.filter(l => l !== sourceLanguage);

      if (targetLanguages.length === 0) {
        log.info('StoryTextObjectTranslation: no target languages after filtering source', { postId, index, sourceLanguage });
        return;
      }

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

  /// Returns the post if and only if `viewerUserId` is allowed to see it,
  /// according to the post's `visibility` and `visibilityUserIds`. Unauthenticated
  /// callers (`viewerUserId === undefined`) can only see PUBLIC posts. The 404 is
  /// indistinguishable from "doesn't exist" by design (no enumeration leak).
  ///
  /// View recording is NOT triggered here — callers that want to record a view
  /// must call `recordView()` explicitly (e.g., the dedicated POST /:id/view
  /// route). Previously, every fetch silently inflated viewCount.
  async getPostById(postId: string, viewerUserId?: string) {
    const visibilityFilter = await this.buildVisibilityFilter(viewerUserId);
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false, ...visibilityFilter },
      include: postInclude,
    });
    if (!post) return null;

    const userReactions = viewerUserId
      ? await this.prisma.postReaction.findMany({
          where: { userId: viewerUserId, postId: post.id },
          select: { postId: true, emoji: true },
        })
      : [];
    const currentUserReactions = userReactions.map((r) => r.emoji);

    return { ...post, currentUserReactions };
  }

  /// Builds the Prisma `where` fragment that enforces post visibility for a viewer.
  /// Mirrors `PostFeedService.buildVisibilityFilter` so single-post fetches and feed
  /// queries apply the same rules.
  private async buildVisibilityFilter(viewerUserId?: string) {
    if (!viewerUserId) {
      return { visibility: PostVisibility.PUBLIC };
    }
    const friendIds = await this.getFriendIdsForViewer(viewerUserId);
    return {
      OR: [
        { authorId: viewerUserId },
        { visibility: PostVisibility.PUBLIC },
        { visibility: PostVisibility.FRIENDS, authorId: { in: friendIds } },
        { visibility: PostVisibility.EXCEPT, authorId: { in: friendIds }, NOT: { visibilityUserIds: { has: viewerUserId } } },
        { visibility: PostVisibility.ONLY, visibilityUserIds: { has: viewerUserId } },
      ],
    };
  }

  private async getFriendIdsForViewer(userId: string): Promise<string[]> {
    try {
      const friendRequests = await this.prisma.friendRequest.findMany({
        where: {
          status: 'accepted',
          OR: [{ senderId: userId }, { receiverId: userId }],
        },
        select: { senderId: true, receiverId: true },
      });
      return Array.from(new Set(friendRequests.flatMap((fr) => [fr.senderId, fr.receiverId])
        .filter((id) => id !== userId)));
    } catch {
      return [];
    }
  }

  async updatePost(postId: string, userId: string, data: {
    content?: string;
    visibility?: PostVisibility;
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
      visibility: data.visibility,
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
    try {
      await this.postReactionService.addReaction({ postId, userId, emoji });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : '';
      if (message.includes('not found') || message.includes('deleted')) {
        return null;
      }
      throw err;
    }

    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      include: postInclude,
    });
    if (!post) return null;

    const reactions = await this.prisma.postReaction.findMany({
      where: { postId },
      select: { userId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const reactionsJson = reactions.map(r => ({
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt.toISOString(),
    }));

    await this.prisma.post.update({
      where: { id: postId },
      data: {
        reactions: reactionsJson as Prisma.InputJsonValue,
        likeCount: reactions.length,
      },
    });

    return this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      include: postInclude,
    });
  }

  async unlikePost(postId: string, userId: string) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      include: postInclude,
    });
    if (!post) return null;

    const userReactions = await this.prisma.postReaction.findMany({
      where: { postId, userId },
      select: { userId: true, emoji: true, createdAt: true },
    });

    if (userReactions.length === 0) return post;

    const foundEmoji = userReactions[0].emoji;
    await this.postReactionService.removeReaction({ postId, userId, emoji: foundEmoji });

    const remainingReactions = await this.prisma.postReaction.findMany({
      where: { postId },
      select: { userId: true, emoji: true, createdAt: true },
      orderBy: { createdAt: 'asc' },
    });

    const reactionsJson = remainingReactions.map(r => ({
      userId: r.userId,
      emoji: r.emoji,
      createdAt: r.createdAt.toISOString(),
    }));

    await this.prisma.post.update({
      where: { id: postId },
      data: {
        reactions: reactionsJson as Prisma.InputJsonValue,
        likeCount: remainingReactions.length,
      },
    });

    return this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
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
      // Enforce visibility before recording — without this, any authenticated
      // user could increment viewCount on any private story by ID, and have
      // their userId surface in the author's `/posts/:id/views` response
      // (information disclosure + view inflation).
      const visibilityFilter = await this.buildVisibilityFilter(userId);
      const post = await this.prisma.post.findFirst({
        where: { id: postId, isDeleted: false, ...visibilityFilter },
        select: { id: true, authorId: true },
      });
      if (!post) return;

      // Author re-opening their own story shouldn't inflate viewCount.
      if (post.authorId === userId) return;

      // Sanitize duration: client-supplied → cap at 5 minutes (way past any
      // reasonable story).
      const safeDuration = duration !== undefined
        ? Math.max(0, Math.min(300_000, Math.round(duration)))
        : undefined;

      const existing = await this.prisma.postView.findUnique({
        where: { postId_userId: { postId, userId } },
      });

      if (existing) {
        if (safeDuration !== undefined) {
          await this.prisma.postView.update({
            where: { id: existing.id },
            data: { duration: safeDuration },
          });
        }
        return;
      }

      await this.prisma.postView.create({
        data: { postId, userId, duration: safeDuration },
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

  async getPostInteractions(postId: string, userId: string, limit: number = 50, offset: number = 0) {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      select: { id: true, authorId: true, reactions: true },
    });
    if (!post) return null;
    if (post.authorId !== userId) throw new Error('FORBIDDEN');

    const [views, total] = await Promise.all([
      this.prisma.postView.findMany({
        where: { postId },
        include: { user: { select: authorSelect } },
        orderBy: { viewedAt: 'desc' },
        take: limit,
        skip: offset,
      }),
      this.prisma.postView.count({ where: { postId } }),
    ]);

    const reactions = (post.reactions as any[] | null) ?? [];
    const reactionByUser = new Map<string, string>();
    for (const r of reactions) {
      reactionByUser.set(r.userId, r.emoji);
    }

    const viewers = views.map((v) => ({
      id: v.user.id,
      username: v.user.username,
      displayName: v.user.displayName,
      avatarUrl: v.user.avatar,
      viewedAt: v.viewedAt,
      reaction: reactionByUser.get(v.user.id) ?? null,
    }));

    return { viewers, total, hasMore: offset + limit < total };
  }

  async repostPost(
    postId: string,
    userId: string,
    opts: {
      targetType?: PostType;
      content?: string;
      isQuote?: boolean;
    } = {},
  ) {
    const original = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      include: { media: { select: mediaSelect, orderBy: { order: 'asc' as const } } },
    });
    if (!original) return null;

    if (original.expiresAt && (original.expiresAt as Date).getTime() < Date.now()) {
      return null;
    }

    if (original.visibility !== 'PUBLIC') {
      const err: any = new Error('Cannot repost private content');
      err.statusCode = 403;
      throw err;
    }

    const targetType = opts.targetType ?? original.type;
    const content = opts.content;
    const isQuote = opts.isQuote ?? false;

    const originalLanguage = content ? detectLanguage(content) : undefined;

    const originalRepostOfId = original.originalRepostOfId
      ?? original.repostOfId
      ?? original.id;

    const expiresAt = computeExpiresAt(targetType);

    const isStoryToPostRepost = original.type === PostType.STORY && targetType === PostType.POST;

    type SnapshotMediaCreate = {
      fileName: string;
      originalName: string;
      mimeType: string;
      fileSize: number;
      filePath: string;
      fileUrl: string;
      thumbnailUrl?: string;
      order: number;
    };

    let snapshotMedia: SnapshotMediaCreate[] | undefined;
    let snapshotAudioUrl: string | undefined;
    let snapshotStoryEffects: Prisma.InputJsonValue | undefined;

    if (isStoryToPostRepost) {
      const duplicatedMedia: SnapshotMediaCreate[] = [];
      let duplicatedAudioUrl: string | undefined;
      // Outbox row IDs to release once the surrounding transaction commits.
      // If we crash before reaching the untrack call, the worker will reap
      // the snapshot files on the next sweep cycle.
      const orphanRowIds: string[] = [];

      // Helper that runs the producer pattern correctly : when an outbox
      // is wired, register the destination URL BEFORE writing the file so
      // a crash mid-write is recoverable. When no outbox, fall back to the
      // simple single-shot duplicate() + post-hoc track that this code
      // path used previously (no producer guarantee, but the inline catch
      // still cleans up on synchronous failure).
      const trackedDuplicate = async (sourceUrl: string): Promise<MediaDuplicateResult> => {
        if (!this.orphanCleanup) {
          return await this.mediaService.duplicate(sourceUrl);
        }
        const plan = this.mediaService.planDuplicate(sourceUrl);
        const trackId = await this.orphanCleanup.track(plan.plannedFileUrl, 'repost-snapshot');
        orphanRowIds.push(trackId);
        return await plan.commit();
      };

      try {
        const originalMedia = (original.media ?? []) as Array<{
          fileUrl: string;
          mimeType: string;
          thumbnailUrl?: string | null;
          order?: number;
        }>;

        for (const [idx, m] of originalMedia.entries()) {
          const dup = await trackedDuplicate(m.fileUrl);
          let dupThumbUrl: string | undefined;
          if (m.thumbnailUrl) {
            const dupThumb = await trackedDuplicate(m.thumbnailUrl);
            dupThumbUrl = dupThumb.fileUrl;
          }
          duplicatedMedia.push({
            fileName: dup.fileName,
            originalName: dup.fileName,
            mimeType: dup.mimeType,
            fileSize: dup.fileSize,
            filePath: dup.filePath,
            fileUrl: dup.fileUrl,
            thumbnailUrl: dupThumbUrl,
            order: idx,
          });
        }

        const audioUrl = original.audioUrl as string | null | undefined;
        if (audioUrl) {
          const dupAudio = await trackedDuplicate(audioUrl);
          duplicatedAudioUrl = dupAudio.fileUrl;
          snapshotAudioUrl = dupAudio.fileUrl;
        }

        snapshotMedia = duplicatedMedia;
        snapshotStoryEffects = original.storyEffects as Prisma.InputJsonValue | undefined;

        const repost = await this.prisma.post.create({
          data: {
            authorId: userId,
            type: targetType,
            visibility: original.visibility,
            content: content ?? undefined,
            originalLanguage,
            repostOfId: postId,
            originalRepostOfId,
            isQuote,
            ...(expiresAt !== undefined ? { expiresAt } : {}),
            ...(snapshotAudioUrl !== undefined ? { audioUrl: snapshotAudioUrl } : {}),
            ...(snapshotStoryEffects !== undefined ? { storyEffects: snapshotStoryEffects } : {}),
            ...(snapshotMedia !== undefined ? { media: { create: snapshotMedia } } : {}),
          },
          include: postInclude,
        });

        await this.prisma.post.update({
          where: { id: postId },
          data: { repostCount: { increment: 1 } },
        });

        // Post created — release the outbox rows. Done in a fire-and-forget
        // catch since failure here only means the worker will still see the
        // rows past their cleanup window and try to delete files that are
        // now legitimately referenced by the new Post. The worker handles
        // that case via MediaStorage.delete idempotence + the row's TTL,
        // but to be safe we use the typed batch helper.
        if (this.orphanCleanup && orphanRowIds.length > 0) {
          await this.orphanCleanup.untrackBatch(orphanRowIds);
        }

        return repost;
      } catch (err) {
        // Inline (best-effort) compensation. Same as before — fast-path
        // cleanup. The outbox rows stay registered, so the worker provides
        // a second-line safety net if a delete here fails (or if the
        // process dies before reaching this catch).
        for (const dup of duplicatedMedia) {
          await this.mediaService.delete(dup.fileUrl).catch(() => {});
        }
        if (duplicatedAudioUrl) {
          await this.mediaService.delete(duplicatedAudioUrl).catch(() => {});
        }
        // Note : on failure we deliberately do NOT untrack the outbox
        // rows. They remain so the worker can verify the files are
        // actually gone (idempotent delete) and reap any that the inline
        // compensation missed.
        throw err instanceof Error
          ? new Error('Media snapshot or post creation failed during repost', { cause: err })
          : new Error('Media snapshot failed during repost');
      }
    }

    const repost = await this.prisma.post.create({
      data: {
        authorId: userId,
        type: targetType,
        visibility: original.visibility,
        content: content ?? undefined,
        originalLanguage,
        repostOfId: postId,
        originalRepostOfId,
        isQuote,
        ...(expiresAt !== undefined ? { expiresAt } : {}),
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
