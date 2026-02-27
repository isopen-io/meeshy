/**
 * PostAudioService
 * Handles audio processing pipeline for PostMedia:
 * - Sends audio to the translator (Whisper transcription via ZMQ)
 * - Receives transcription_ready event and persists it to PostMedia
 * - Broadcasts post:updated to clients via SocialEventsHandler
 */

import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import type { Post } from '@meeshy/shared/types/post';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { ZMQSingleton } from '../ZmqSingleton';
import type { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';

const log = enhancedLogger.child({ module: 'PostAudioService' });

// Select used when fetching a post after updating PostMedia transcription,
// mirrors PostService.postInclude to produce a consistent Post shape.
const authorSelect = {
  id: true,
  username: true,
  displayName: true,
  avatar: true,
} as const;

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
} as const;

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
} as const;

type ProcessPostAudioParams = {
  postId: string;
  postMediaId: string;
  fileUrl: string;
  authorId: string;
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
   * Enqueue a post audio file for Whisper transcription via ZMQ.
   * Fire-and-forget: the result arrives later as a transcription_ready event.
   */
  async processPostAudio(params: ProcessPostAudioParams): Promise<void> {
    const zmqClient = ZMQSingleton.getInstanceSync();
    if (!zmqClient) {
      log.error('ZMQ client not available for post audio processing', undefined, { postId: params.postId });
      return;
    }

    // Resolve the absolute file path from the URL.
    // PostMedia.fileUrl is typically a public URL like /uploads/... — derive the local path
    // from the uploads directory the same way attachment processing does.
    const uploadsBase = process.env.UPLOADS_DIR ?? '/opt/meeshy/uploads';
    const urlPath = params.fileUrl.startsWith('http')
      ? new URL(params.fileUrl).pathname
      : params.fileUrl;
    const audioPath = urlPath.startsWith('/uploads/')
      ? `${uploadsBase}${urlPath.slice('/uploads'.length)}`
      : urlPath;

    log.info('Sending post audio for transcription', { postId: params.postId, postMediaId: params.postMediaId, audioPath });

    try {
      await zmqClient.sendAudioProcessRequest({
        // Use postMediaId as both messageId and attachmentId so the translator
        // echoes them back in the transcription_ready event.
        messageId: params.postMediaId,
        attachmentId: params.postMediaId,
        conversationId: '',
        senderId: params.authorId,
        audioPath,
        audioDurationMs: 0,
        targetLanguages: [],
        generateVoiceClone: false,
        modelType: 'medium',
        postId: params.postId,
        postMediaId: params.postMediaId,
      });

      log.info('Post audio enqueued', { postId: params.postId, postMediaId: params.postMediaId });
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

    log.info('Post transcription ready — persisting', { postId, postMediaId, lang: transcription.language });

    const transcriptionPayload: Prisma.InputJsonValue = {
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

    await this.prisma.postMedia.update({
      where: { id: postMediaId },
      data: { transcription: transcriptionPayload },
    });

    log.info('Transcription persisted — fetching post for broadcast', { postId, postMediaId });

    const post = await this.prisma.post.findFirst({
      where: { id: postId, isDeleted: false },
      include: postInclude,
    });

    if (!post) {
      log.warn('Post not found after transcription update — skipping broadcast', { postId });
      return;
    }

    await this.socialEvents.broadcastPostUpdated(post as unknown as Post, post.authorId);

    log.info('post:updated broadcast sent after transcription', { postId });
  }
}
