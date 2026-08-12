/**
 * PostAudioService
 * Handles audio processing pipeline for PostMedia:
 * - Sends audio to the translator (Whisper transcription via ZMQ)
 * - Sends audio for translation to platform languages (TTS via ZMQ)
 * - Receives transcription_ready event and persists it to PostMedia
 * - Receives audioProcessCompleted event and persists translations to PostMedia
 * - Broadcasts post:updated to clients via SocialEventsHandler
 */

import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { parseAttachmentTranscription } from '@meeshy/shared/utils/attachment-validators';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { ZMQSingleton } from '../ZmqSingleton';
import type { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';
import { getLanguagesWithTranslation } from '../../utils/languages';
import { postInclude, commentMediaInclude, NOT_DELETED } from './postIncludes';

const log = enhancedLogger.child({ module: 'PostAudioService' });

// postInclude is the canonical shape from ./postIncludes — same shape used by
// PostService and PostFeedService so the `post:updated` broadcast emitted
// after a TTS pipeline completes carries the SAME payload structure as a
// fresh REST fetch. Drift here previously stripped Prisme fields from
// reposts and filtered out legacy comments without parentId — see R3.

type ProcessPostAudioParams = {
  postId: string;
  postMediaId: string;
  fileUrl: string;
  authorId: string;
  /** When true, triggers full translation pipeline (transcription + TTS for platform languages) */
  translateToAllLanguages?: boolean;
};

type HandleTranscriptionReadyParams = {
  postId: string;
  postMediaId: string;
  transcription: {
    text: string;
    language: string;
    confidence?: number;
    durationMs?: number;
    source?: string;
    model?: string;
    segments?: Array<{ text: string; startMs: number; endMs: number; confidence?: number }>;
    speakerCount?: number;
    primarySpeakerId?: string;
    senderVoiceIdentified?: boolean;
    senderSpeakerId?: string | null;
  };
};

type HandleAudioTranslationsReadyParams = {
  postId: string;
  postMediaId: string;
  translations: Record<string, {
    type: string;
    transcription: string;
    path: string;
    url: string;
    durationMs: number;
    format: string;
    cloned: boolean;
    quality: number;
    ttsModel: string;
    segments?: Array<{ text: string; startMs: number; endMs: number }>;
  }>;
};

export class PostAudioService {
  private static _shared: PostAudioService | null = null;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly socialEvents: SocialEventsHandler,
  ) {}

  static init(prisma: PrismaClient, socialEvents: SocialEventsHandler): PostAudioService {
    PostAudioService._shared = new PostAudioService(prisma, socialEvents);
    return PostAudioService._shared;
  }

  static get shared(): PostAudioService {
    if (!PostAudioService._shared) {
      throw new Error('PostAudioService not initialized — call PostAudioService.init() first');
    }
    return PostAudioService._shared;
  }

  /**
   * Returns the list of platform language codes for translation.
   * Posts/stories destined to all users should be translated to these languages.
   */
  private getPlatformTargetLanguages(sourceLanguage?: string): string[] {
    const translatable = getLanguagesWithTranslation();
    const codes = translatable.map(l => l.code);
    if (sourceLanguage) {
      return codes.filter(c => c !== sourceLanguage);
    }
    return codes;
  }

  /**
   * Enqueue a post audio file for processing via ZMQ.
   *
   * When translateToAllLanguages is true (default for posts/stories),
   * the full pipeline runs: Whisper transcription → NLLB translation → TTS for all platform languages.
   * When false, only transcription is performed (backward-compatible behavior).
   */
  async processPostAudio(params: ProcessPostAudioParams): Promise<void> {
    const zmqClient = ZMQSingleton.getInstanceSync();
    if (!zmqClient) {
      log.error('ZMQ client not available for post audio processing', undefined, { postId: params.postId });
      return;
    }

    // Resolve the absolute file path from the URL.
    const uploadsBase = process.env.UPLOADS_DIR ?? '/opt/meeshy/uploads';
    const urlPath = params.fileUrl.startsWith('http')
      ? new URL(params.fileUrl).pathname
      : params.fileUrl;
    const audioPath = urlPath.startsWith('/uploads/')
      ? `${uploadsBase}${urlPath.slice('/uploads'.length)}`
      : urlPath;

    const enableTranslation = params.translateToAllLanguages !== false;
    const targetLanguages = enableTranslation ? this.getPlatformTargetLanguages() : [];

    log.info('Sending post audio for processing', {
      postId: params.postId,
      postMediaId: params.postMediaId,
      audioPath,
      translateToAllLanguages: enableTranslation,
      targetLanguageCount: targetLanguages.length,
    });

    try {
      await zmqClient.sendAudioProcessRequest({
        messageId: params.postMediaId,
        attachmentId: params.postMediaId,
        conversationId: `post_${params.postId}`,
        senderId: params.authorId,
        audioPath,
        audioDurationMs: 0,
        targetLanguages,
        generateVoiceClone: enableTranslation,
        modelType: 'medium',
        postId: params.postId,
        postMediaId: params.postMediaId,
      });

      log.info('Post audio enqueued', {
        postId: params.postId,
        postMediaId: params.postMediaId,
        targetLanguages: enableTranslation ? targetLanguages.length : 0,
      });
    } catch (err) {
      log.error('Failed to enqueue post audio', err, { postId: params.postId });
    }
  }

  /**
   * Called when the translator returns a transcription_ready event for a post.
   * Persists the transcription in PostMedia and broadcasts post:updated.
   */
  async handleTranscriptionReady(params: HandleTranscriptionReadyParams): Promise<void> {
    const { postId, postMediaId, transcription } = params;

    try {
      log.info('Post transcription ready — persisting', { postId, postMediaId, lang: transcription.language });

      const transcriptionPayload: Prisma.InputJsonValue = {
        // `type` discriminator aligns persistence with the Fastify response
        // schema (api-schemas.ts:343 declares enum ['audio','video',
        // 'document','image']). Was missing pre-R6, leaving the
        // discriminator implicit (clients inferred from mimeType).
        type: 'audio',
        text: transcription.text,
        language: transcription.language,
        confidence: transcription.confidence ?? 0,
        durationMs: transcription.durationMs ?? 0,
        source: transcription.source ?? 'whisper',
        model: transcription.model ?? 'whisper_medium',
        segments: transcription.segments ?? [],
        speakerCount: transcription.speakerCount,
        primarySpeakerId: transcription.primarySpeakerId,
        senderVoiceIdentified: transcription.senderVoiceIdentified,
        senderSpeakerId: transcription.senderSpeakerId,
      };

      // Defense-in-depth: validate the payload against the shared Zod
      // schema before persisting. We TRUST the translator service (this
      // path is server-server, not user-facing) so a validation failure
      // doesn't block the write — but it surfaces a structured warning
      // so any contract drift on the translator side is caught instantly.
      const validation = parseAttachmentTranscription(transcriptionPayload);
      if (validation.ok === false) {
        log.warn('Transcription payload failed Zod validation — persisting anyway', {
          postId,
          postMediaId,
          code: validation.code,
          issues: validation.issues,
        });
      }

      const updated = await this.prisma.postMedia.update({
        where: { id: postMediaId },
        data: { transcription: transcriptionPayload },
        select: { commentId: true },
      });

      log.info('Transcription persisted — broadcasting media owner update', { postId, postMediaId });

      await this.broadcastMediaOwnerUpdate(postId, updated.commentId);
    } catch (err: unknown) {
      log.error('handleTranscriptionReady failed', err, { postId, postMediaId });
    }
  }

  /**
   * Called when the translator returns audioProcessCompleted with translations for a post.
   * Persists translated audio files + text translations to PostMedia.translations.
   */
  async handleAudioTranslationsReady(params: HandleAudioTranslationsReadyParams): Promise<void> {
    const { postId, postMediaId, translations } = params;

    try {
      const langCount = Object.keys(translations).length;
      log.info('Post audio translations ready — persisting', { postId, postMediaId, langCount });

      const translationsPayload: Prisma.InputJsonValue = translations as unknown as Prisma.InputJsonValue;

      const updated = await this.prisma.postMedia.update({
        where: { id: postMediaId },
        data: { translations: translationsPayload },
        select: { commentId: true },
      });

      log.info('Translations persisted — broadcasting media owner update', { postId, postMediaId, langCount });

      await this.broadcastMediaOwnerUpdate(postId, updated.commentId);
    } catch (err: unknown) {
      log.error('handleAudioTranslationsReady failed', err, { postId, postMediaId });
    }
  }

  /**
   * Route the post-processing broadcast to the media's actual owner.
   * When the PostMedia belongs to a comment (`commentId` set), emit
   * `comment:media-updated` carrying the enriched comment. Otherwise fall back to
   * the regular `post:updated` broadcast for post/story/status media.
   */
  private async broadcastMediaOwnerUpdate(postId: string, commentId: string | null): Promise<void> {
    if (commentId) {
      await this.broadcastCommentMediaUpdate(commentId);
      return;
    }
    await this.broadcastPostUpdate(postId);
  }

  /**
   * Fetch the comment (with its media + author) and broadcast comment:media-updated.
   */
  private async broadcastCommentMediaUpdate(commentId: string): Promise<void> {
    const comment = await this.prisma.postComment.findFirst({
      where: { id: commentId, deletedAt: NOT_DELETED },
      select: {
        id: true,
        postId: true,
        content: true,
        originalLanguage: true,
        translations: true,
        likeCount: true,
        replyCount: true,
        effectFlags: true,
        parentId: true,
        createdAt: true,
        metadata: true,
        author: { select: { id: true, username: true, displayName: true, avatar: true } },
        media: commentMediaInclude,
      },
    });

    if (!comment) {
      log.warn('Comment not found after media update — skipping broadcast', { commentId });
      return;
    }

    const post = await this.prisma.post.findFirst({
      where: { id: comment.postId, deletedAt: NOT_DELETED },
      select: { authorId: true, visibility: true, visibilityUserIds: true },
    });
    if (!post) {
      log.warn('Post not found for comment media broadcast — skipping', { commentId, postId: comment.postId });
      return;
    }

    await this.socialEvents.broadcastCommentMediaUpdated(
      {
        postId: comment.postId,
        commentId: comment.id,
        comment: comment as unknown as Parameters<SocialEventsHandler['broadcastCommentMediaUpdated']>[0]['comment'],
      },
      post.authorId,
      post.visibility,
      post.visibilityUserIds ?? [],
    );
    log.info('comment:media-updated broadcast sent', { commentId, postId: comment.postId });
  }

  /**
   * Fetch the post and broadcast post:updated to all connected clients.
   */
  private async broadcastPostUpdate(postId: string): Promise<void> {
    const post = await this.prisma.post.findFirst({
      where: { id: postId, deletedAt: NOT_DELETED },
      include: postInclude,
    });

    if (!post) {
      log.warn('Post not found after update — skipping broadcast', { postId });
      return;
    }

    await this.socialEvents.broadcastPostUpdated(post as unknown as Post, post.authorId);
    log.info('post:updated broadcast sent', { postId });
  }
}
