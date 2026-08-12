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
import { isUrlOnly } from '../../utils/url-content';
import { isContentDerivedFromTextObjects, storyTextObjectText } from './storyContentComposition';

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
    // Skip translation for URL-only posts: links carry no translatable text and
    // must be preserved verbatim (NLLB would corrupt them). Mixed content still
    // translates — the translator masks/restores the URLs.
    if (isUrlOnly(content)) {
      log.info('PostTranslation: skipping URL-only post (links preserved verbatim)', { postId });
      return;
    }

    const sourceLang = originalLanguage ?? detectLanguage(content);
    const targetLanguages = TOP_LANGUAGES.filter(l => l !== sourceLang);

    /* istanbul ignore next -- TOP_LANGUAGES always has >=5 elements; filtering one still yields >=4 */
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
   *
   * `force` rejoue une langue DÉJÀ traduite : c'est ce que demande le bouton
   * « Retraduire » de la feuille des langues du lecteur. Sans lui, ce bouton
   * appelait la même route que « Traduire » et sortait aussitôt sur les gardes
   * de cache — il ne faisait strictement rien, sans le moindre signal.
   *
   * Forcer rejoue ce qui PEUT l'être : les gardes de cache tombent, les gardes
   * de sens (langue source identique, index dérivé, URL seule) restent.
   */
  async translateOnDemand(
    postId: string,
    targetLanguage: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const force = options.force === true;
    const post = await this.prisma.post.findUnique({
      where: { id: postId },
      select: { content: true, originalLanguage: true, translations: true, storyEffects: true },
    });

    if (!post) {
      log.warn('PostTranslation: post not found', { postId });
      return;
    }

    // Une story est très souvent faite ENTIÈREMENT de texte posé sur le
    // canvas, sans la moindre légende. Sortir ici sur `!post.content` rendait
    // la feuille « Traductions » du lecteur totalement inerte sur ce cas :
    // aucun job émis, aucune traduction, et l'original servi sans un signal.
    await this.translateStoryTextObjectsOnDemand(postId, post.storyEffects, targetLanguage, force);

    if (!post.content) return;

    // Une story sans légende reçoit à la création un `content` qui n'est que la
    // concaténation des overlays (`PostService.createPost`). Le renvoyer au
    // traducteur en faisait une SECONDE source, traduite indépendamment des
    // overlays : les deux divergeaient dès qu'un pipeline bronchait — six
    // langues sur le `content`, zéro sur les overlays, constaté en production
    // le 2026-07-27. L'index se recompose désormais à partir des traductions
    // des overlays (`StoryTextObjectTranslationService`), il n'a plus rien à
    // demander pour lui-même. Une VRAIE légende, elle, garde son pipeline.
    if (isContentDerivedFromTextObjects(post.content, (post.storyEffects as { textObjects?: unknown } | null)?.textObjects)) {
      log.info('PostTranslation: content is the text-objects index — derived, not translated', { postId, targetLanguage });
      return;
    }

    // Skip URL-only posts on the on-demand path too: links carry no translatable
    // text and must be preserved verbatim (NLLB would corrupt them). Mirrors the
    // translatePost guard so a shared link is never mangled, whatever the path.
    if (isUrlOnly(post.content)) {
      log.info('PostTranslation: skipping URL-only post on-demand (links preserved verbatim)', { postId, targetLanguage });
      return;
    }

    const sourceLang = post.originalLanguage ?? detectLanguage(post.content);

    if (sourceLang === targetLanguage) {
      log.info('PostTranslation: target same as source, skipping', { postId, targetLanguage });
      return;
    }

    // Check if translation already exists
    const translations = (post.translations ?? null) as Record<string, unknown> | null;
    if (!force && translations?.[targetLanguage]) {
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
   * Demande la traduction des textes du CANVAS d'une story vers la SEULE
   * langue que le lecteur vient de choisir.
   *
   * Le pipeline de publication (`PostService.translateStoryTextObjects`)
   * diffuse déjà vers toute l'audience ; ici on est sur le chemin « à la
   * demande » — un viewer a ouvert la feuille « Traductions » et demandé une
   * langue que personne n'avait encore. Une seule cible, donc, et on saute
   * tout ce qui est déjà couvert.
   *
   * L'index passé au traducteur est la position dans `textObjects` : c'est la
   * clé que `StoryTextObjectTranslationService` utilise pour reposer le
   * résultat au bon endroit.
   */
  private async translateStoryTextObjectsOnDemand(
    postId: string,
    storyEffects: unknown,
    targetLanguage: string,
    force = false,
  ): Promise<void> {
    const effects = storyEffects as { textObjects?: unknown } | null | undefined;
    const textObjects = Array.isArray(effects?.textObjects) ? effects.textObjects : [];
    if (textObjects.length === 0) return;

    textObjects.forEach((raw, index) => {
      const obj = raw as {
        text?: unknown; content?: unknown;
        sourceLanguage?: unknown; translations?: unknown;
      };
      // `text` est la clé canonique du composer iOS ; `content` l'alias legacy
      // pré-renommage, encore présent en base et accepté par le décodeur SDK.
      const text = (storyTextObjectText(obj) ?? '').trim();
      if (!text) return;

      const sourceLanguage = typeof obj.sourceLanguage === 'string'
        ? obj.sourceLanguage
        : detectLanguage(text);
      if (sourceLanguage === targetLanguage) return;

      const existing = (obj.translations ?? null) as Record<string, unknown> | null;
      if (!force && existing?.[targetLanguage]) return;

      this.zmqClient.translateTextObject({
        postId,
        textObjectIndex: index,
        text,
        sourceLanguage,
        targetLanguages: [targetLanguage],
      });
    });
  }

  /**
   * Translate a comment's content to top 5 languages (minus original).
   * Fire-and-forget: results arrive via ZMQ events.
   */
  async translateComment(commentId: string, postId: string, content: string, originalLanguage?: string): Promise<void> {
    // Skip URL-only comments: links carry no translatable text and must be
    // preserved verbatim (NLLB would corrupt them). Mirrors the translatePost guard.
    if (isUrlOnly(content)) {
      log.info('CommentTranslation: skipping URL-only comment (links preserved verbatim)', { commentId });
      return;
    }

    const sourceLang = originalLanguage ?? detectLanguage(content);
    const targetLanguages = TOP_LANGUAGES.filter(l => l !== sourceLang);

    /* istanbul ignore next -- TOP_LANGUAGES always has >=5 elements; filtering one still yields >=4 */
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
   * Traduction d'un COMMENTAIRE à la demande, vers la SEULE langue que le
   * lecteur vient de choisir — miroir de `translateOnDemand` (posts). Sans
   * cette voie, un lecteur hors des 5 langues pré-générées (`TOP_LANGUAGES`)
   * n'avait AUCUN recours pour un commentaire, alors que le post en avait un.
   * `force` rejoue une langue déjà traduite (bouton « Retraduire »).
   */
  async translateCommentOnDemand(
    commentId: string,
    targetLanguage: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const force = options.force === true;
    const comment = await this.prisma.postComment.findUnique({
      where: { id: commentId },
      select: { content: true, originalLanguage: true, translations: true, postId: true },
    });

    if (!comment || !comment.content) {
      log.warn('CommentTranslation: comment not found or empty', { commentId });
      return;
    }

    if (isUrlOnly(comment.content)) {
      log.info('CommentTranslation: skipping URL-only comment on-demand', { commentId, targetLanguage });
      return;
    }

    const sourceLang = comment.originalLanguage ?? detectLanguage(comment.content);
    if (sourceLang === targetLanguage) {
      log.info('CommentTranslation: target same as source, skipping', { commentId, targetLanguage });
      return;
    }

    const translations = (comment.translations ?? null) as Record<string, unknown> | null;
    if (!force && translations?.[targetLanguage]) {
      log.info('CommentTranslation: translation already cached', { commentId, targetLanguage });
      return;
    }

    log.info('CommentTranslation: on-demand request', { commentId, sourceLang, targetLanguage });

    try {
      await this.zmqClient.translateToMultipleLanguages(
        comment.content,
        sourceLang,
        [targetLanguage],
        `comment:${commentId}`,
        `comment_context:${comment.postId}`,
      );
    } catch (err) {
      log.error('CommentTranslation: on-demand ZMQ send failed', err, { commentId });
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
        /* istanbul ignore next -- handlePostTranslationCompleted wraps its own errors; this .catch is belt-and-suspenders dead code */
        this.handlePostTranslationCompleted(postId, event).catch((err) => {
          log.error('handlePostTranslationCompleted failed', err, { postId });
        });
      } else if (messageId.startsWith('comment:')) {
        const commentId = messageId.slice('comment:'.length);
        /* istanbul ignore next -- handleCommentTranslationCompleted wraps its own errors; this .catch is belt-and-suspenders dead code */
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
        select: { authorId: true, visibility: true, visibilityUserIds: true },
      });

      if (post) {
        this.socialEvents.broadcastPostTranslationUpdated({
          postId,
          language: targetLanguage,
          translation: {
            text: translatedText,
            translationModel: translatorModel ?? 'nllb',
            confidenceScore: confidenceScore ?? 1,
            createdAt: new Date().toISOString(),
          },
        }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err: unknown) => {
          log.error('PostTranslation: broadcast failed', err instanceof Error ? err : new Error(String(err)), { postId, targetLanguage });
        });
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
          select: { authorId: true, visibility: true, visibilityUserIds: true },
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
              createdAt: new Date().toISOString(),
            },
          }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err: unknown) => {
            log.error('CommentTranslation: broadcast failed', err instanceof Error ? err : new Error(String(err)), { commentId, targetLanguage });
          });
        }
      }
    } catch (err) {
      log.error('CommentTranslation: persist failed', err, { commentId, targetLanguage });
    }
  }
}
