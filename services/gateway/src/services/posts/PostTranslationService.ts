/**
 * PostTranslationService
 * Handles text translation for posts and comments via the ZMQ pipeline:
 * - Sends post/comment content to the translator for top 5 languages
 * - Receives translation_completed events and persists translations in MongoDB
 * - Broadcasts post:translation-updated / comment:translation-updated via SocialEventsHandler
 */

import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../zmq-translation/ZmqTranslationClient';
import type { TranslationCompletedEvent } from '../zmq-translation/types';
import type { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';
import { enhancedLogger } from '../../utils/logger-enhanced';

const log = enhancedLogger.child({ module: 'PostTranslationService' });

const TOP_LANGUAGES = ['fr', 'en', 'es', 'ar', 'pt'];

function detectLanguage(text: string): string {
  if (!text) return 'en';
  const lower = text.toLowerCase();
  const langPatterns: Record<string, RegExp> = {
    fr: /\b(le|la|les|un|une|des|je|tu|il|nous|vous|est|sont|avec|pour|dans|que|qui|pas|mais)\b/,
    es: /\b(el|la|los|las|un|una|es|son|con|para|en|que|por|del|como|pero|más)\b/,
    de: /\b(der|die|das|ein|eine|ist|sind|mit|für|und|ich|nicht|auf|dem|den)\b/,
    pt: /\b(o|a|os|as|um|uma|é|são|com|para|em|que|por|do|da|não|mas)\b/,
    ar: /[\u0600-\u06FF]/,
  };
  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(lower)) return lang;
  }
  return 'en';
}

export class PostTranslationService {
  private static _shared: PostTranslationService | null = null;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly zmqClient: ZmqTranslationClient,
    private readonly socialEvents: SocialEventsHandler,
  ) {}

  static init(
    prisma: PrismaClient,
    zmqClient: ZmqTranslationClient,
    socialEvents: SocialEventsHandler,
  ): PostTranslationService {
    const instance = new PostTranslationService(prisma, zmqClient, socialEvents);
    instance.setupZmqListeners();
    PostTranslationService._shared = instance;
    return instance;
  }

  static get shared(): PostTranslationService {
    if (!PostTranslationService._shared) {
      throw new Error('PostTranslationService not initialized — call PostTranslationService.init() first');
    }
    return PostTranslationService._shared;
  }

  /**
   * Translate a post's content to top 5 languages (minus original).
   * Fire-and-forget: results arrive via ZMQ events.
   */
  async translatePost(postId: string, content: string, originalLanguage?: string, authorId?: string): Promise<void> {
    const sourceLang = originalLanguage ?? detectLanguage(content);
    const targetLanguages = TOP_LANGUAGES.filter(l => l !== sourceLang);

    if (targetLanguages.length === 0) {
      log.info('PostTranslation: no target languages after filtering source', { postId, sourceLang });
      return;
    }

    const messageId = `post:${postId}`;

    log.info('PostTranslation: sending ZMQ request', { postId, sourceLang, targetLanguages });

    try {
      await this.zmqClient.translateToMultipleLanguages(
        content,
        sourceLang,
        targetLanguages,
        messageId,
        `post_context:${postId}`,
      );
    } catch (err) {
      log.error('PostTranslation: ZMQ send failed', err, { postId });
    }
  }

  /**
   * Translate a post on-demand for a specific language.
   */
  async translateOnDemand(postId: string, targetLanguage: string): Promise<void> {
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { content: true, originalLanguage: true },
    });

    if (!post?.content) {
      log.warn('PostTranslation: post not found or has no content', { postId });
      return;
    }

    const sourceLang = post.originalLanguage ?? detectLanguage(post.content);

    if (sourceLang === targetLanguage) {
      log.info('PostTranslation: target same as source, skipping', { postId, targetLanguage });
      return;
    }

    // Check if translation already exists
    const translations = (post as any).translations as Record<string, unknown> | null;
    if (translations?.[targetLanguage]) {
      log.info('PostTranslation: translation already cached', { postId, targetLanguage });
      return;
    }

    const messageId = `post:${postId}`;

    log.info('PostTranslation: on-demand request', { postId, sourceLang, targetLanguage });

    try {
      await this.zmqClient.translateToMultipleLanguages(
        post.content,
        sourceLang,
        [targetLanguage],
        messageId,
        `post_context:${postId}`,
      );
    } catch (err) {
      log.error('PostTranslation: on-demand ZMQ send failed', err, { postId });
    }
  }

  /**
   * Translate a comment's content to top 5 languages (minus original).
   * Fire-and-forget: results arrive via ZMQ events.
   */
  async translateComment(commentId: string, postId: string, content: string, originalLanguage?: string): Promise<void> {
    const sourceLang = originalLanguage ?? detectLanguage(content);
    const targetLanguages = TOP_LANGUAGES.filter(l => l !== sourceLang);

    if (targetLanguages.length === 0) {
      log.info('CommentTranslation: no target languages after filtering source', { commentId, sourceLang });
      return;
    }

    const messageId = `comment:${commentId}`;

    log.info('CommentTranslation: sending ZMQ request', { commentId, postId, sourceLang, targetLanguages });

    try {
      await this.zmqClient.translateToMultipleLanguages(
        content,
        sourceLang,
        targetLanguages,
        messageId,
        `comment_context:${postId}`,
      );
    } catch (err) {
      log.error('CommentTranslation: ZMQ send failed', err, { commentId });
    }
  }

  /**
   * Listen for translation completed events from the ZMQ pipeline.
   * Filters on messageId prefix to distinguish post/comment translations.
   */
  private setupZmqListeners(): void {
    this.zmqClient.on('translationCompleted', (event: TranslationCompletedEvent) => {
      const messageId = event.result?.messageId;
      if (!messageId) return;

      if (messageId.startsWith('post:')) {
        const postId = messageId.slice('post:'.length);
        this.handlePostTranslationCompleted(postId, event).catch((err) => {
          log.error('handlePostTranslationCompleted failed', err, { postId });
        });
      } else if (messageId.startsWith('comment:')) {
        const commentId = messageId.slice('comment:'.length);
        this.handleCommentTranslationCompleted(commentId, event).catch((err) => {
          log.error('handleCommentTranslationCompleted failed', err, { commentId });
        });
      }
    });

    log.info('PostTranslationService: ZMQ listeners configured');
  }

  private async handlePostTranslationCompleted(postId: string, event: TranslationCompletedEvent): Promise<void> {
    const { targetLanguage } = event;
    const { translatedText, confidenceScore, translatorModel } = event.result;

    log.info('PostTranslation: received translation', { postId, targetLanguage });

    const translationData = {
      text: translatedText,
      translationModel: translatorModel ?? 'nllb',
      confidenceScore: confidenceScore ?? 1,
      createdAt: new Date().toISOString(),
    };

    try {
      await (this.prisma as unknown as { $runCommandRaw: (cmd: Prisma.InputJsonObject) => Promise<unknown> }).$runCommandRaw({
        update: 'Post',
        updates: [{
          q: { _id: { $oid: postId } },
          u: { $set: { [`translations.${targetLanguage}`]: translationData } },
        }],
      });

      log.info('PostTranslation: persisted', { postId, targetLanguage });

      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true },
      });

      if (post) {
        this.socialEvents.broadcastPostTranslationUpdated({
          postId,
          language: targetLanguage,
          translation: {
            text: translatedText,
            translationModel: translatorModel ?? 'nllb',
            confidenceScore: confidenceScore ?? 1,
          },
        }, post.authorId).catch(() => {});
      }
    } catch (err) {
      log.error('PostTranslation: persist failed', err, { postId, targetLanguage });
    }
  }

  private async handleCommentTranslationCompleted(commentId: string, event: TranslationCompletedEvent): Promise<void> {
    const { targetLanguage } = event;
    const { translatedText, confidenceScore, translatorModel } = event.result;

    log.info('CommentTranslation: received translation', { commentId, targetLanguage });

    const translationData = {
      text: translatedText,
      translationModel: translatorModel ?? 'nllb',
      confidenceScore: confidenceScore ?? 1,
      createdAt: new Date().toISOString(),
    };

    try {
      await (this.prisma as unknown as { $runCommandRaw: (cmd: Prisma.InputJsonObject) => Promise<unknown> }).$runCommandRaw({
        update: 'PostComment',
        updates: [{
          q: { _id: { $oid: commentId } },
          u: { $set: { [`translations.${targetLanguage}`]: translationData } },
        }],
      });

      log.info('CommentTranslation: persisted', { commentId, targetLanguage });

      const comment = await this.prisma.postComment.findUnique({
        where: { id: commentId },
        select: { postId: true },
      });

      if (comment) {
        const post = await this.prisma.post.findUnique({
          where: { id: comment.postId },
          select: { authorId: true },
        });

        if (post) {
          this.socialEvents.broadcastCommentTranslationUpdated({
            postId: comment.postId,
            commentId,
            language: targetLanguage,
            translation: {
              text: translatedText,
              translationModel: translatorModel ?? 'nllb',
              confidenceScore: confidenceScore ?? 1,
            },
          }, post.authorId).catch(() => {});
        }
      }
    } catch (err) {
      log.error('CommentTranslation: persist failed', err, { commentId, targetLanguage });
    }
  }
}
