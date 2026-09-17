/**
 * MediaAltTranslationService
 *
 * Traduit le texte ALTERNATIF d'accessibilité (`PostMedia.alt`) d'un média —
 * post OU commentaire (#6737, suite de la décision produit #6534). Jumelle
 * EXACTE de `MediaCaptionTranslationService` sur un champ DISTINCT : `alt`
 * décrit le média pour un lecteur d'écran (VoiceOver/TalkBack/NVDA), `caption`
 * est une légende éditoriale — les deux se traduisent indépendamment, sans
 * jamais se lire l'une l'autre.
 *
 * Le `messageId` du bus ZMQ est namespacé `media-alt:<mediaId>`
 * (`translationTargetId`/`translationTargetNamespace`, zmq-helpers.ts) —
 * distinct de `media-caption:`, pour que le routage ZMQ ne confonde jamais
 * les deux traductions d'un même média.
 */

import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../zmq-translation/ZmqTranslationClient';
import type { TranslationCompletedEvent } from '../zmq-translation/types';
import type { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { translationTargetId, translationTargetNamespace } from '../zmq-translation/utils/zmq-helpers';

const log = enhancedLogger.child({ module: 'MediaAltTranslationService' });

const TOP_LANGUAGES = ['fr', 'en', 'es', 'ar', 'pt'];

function detectLanguage(text: string): string {
  if (!text) return 'en';
  const lower = text.toLowerCase();
  const langPatterns: Record<string, RegExp> = {
    fr: /\b(le|la|les|un|une|des|je|tu|il|nous|vous|est|sont|avec|pour|dans|que|qui|pas|mais)\b/,
    es: /\b(el|la|los|las|un|una|es|son|con|para|en|que|por|del|como|pero|más)\b/,
    de: /\b(der|die|das|ein|eine|ist|sind|mit|für|und|ich|nicht|auf|dem|den)\b/,
    pt: /\b(o|a|os|as|um|uma|é|são|com|para|em|que|por|do|da|não|mas)\b/,
    ar: /[؀-ۿ]/,
  };
  for (const [lang, pattern] of Object.entries(langPatterns)) {
    if (pattern.test(lower)) return lang;
  }
  return 'en';
}

export class MediaAltTranslationService {
  private static _shared: MediaAltTranslationService | null = null;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly zmqClient: ZmqTranslationClient,
    private readonly socialEvents: SocialEventsHandler,
  ) {}

  static init(
    prisma: PrismaClient,
    zmqClient: ZmqTranslationClient,
    socialEvents: SocialEventsHandler,
  ): MediaAltTranslationService {
    const instance = new MediaAltTranslationService(prisma, zmqClient, socialEvents);
    instance.setupZmqListeners();
    MediaAltTranslationService._shared = instance;
    return instance;
  }

  static get shared(): MediaAltTranslationService {
    if (!MediaAltTranslationService._shared) {
      throw new Error('MediaAltTranslationService not initialized — call MediaAltTranslationService.init() first');
    }
    return MediaAltTranslationService._shared;
  }

  /**
   * Appelée après `applyMediaText('alt', …)`, à la création ET à l'édition
   * d'un post (`PostService.ts`). Fire-and-forget : les résultats arrivent
   * via l'événement ZMQ `translationCompleted`.
   *
   * INVALIDE toujours `altLanguage`/`altTranslations` avant de relancer — une
   * édition qui change le texte rend les traductions précédentes fausses pour
   * le NOUVEAU texte.
   *
   * `alt === null` (texte alternatif retiré) efface les deux champs et
   * n'émet aucun job — il n'y a plus rien à traduire.
   */
  async triggerMediaAltTranslation(mediaId: string, alt: string | null): Promise<void> {
    try {
      if (!alt || !alt.trim()) {
        await this.prisma.postMedia.update({
          where: { id: mediaId },
          data: { altLanguage: null, altTranslations: null },
        });
        return;
      }

      const sourceLanguage = detectLanguage(alt);

      await this.prisma.postMedia.update({
        where: { id: mediaId },
        data: { altLanguage: sourceLanguage, altTranslations: null },
      });

      const targetLanguages = TOP_LANGUAGES.filter(l => l !== sourceLanguage);
      if (targetLanguages.length === 0) {
        log.info('MediaAltTranslation: no target languages after filtering source', { mediaId, sourceLanguage });
        return;
      }

      const messageId = translationTargetId('media-alt', mediaId);
      log.info('MediaAltTranslation: sending ZMQ request', { mediaId, sourceLanguage, targetLanguages });

      await this.zmqClient.translateToMultipleLanguages(
        alt,
        sourceLanguage,
        targetLanguages,
        messageId,
        `media_alt_context:${mediaId}`,
      );
    } catch (err) {
      log.error('MediaAltTranslation: trigger failed', err, { mediaId });
    }
  }

  /**
   * Traduction à la demande vers UNE langue — miroir de
   * `MediaCaptionTranslationService.translateOnDemand`. `force` rejoue une
   * langue déjà traduite (bouton « Retraduire »).
   */
  async translateOnDemand(
    mediaId: string,
    targetLanguage: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const force = options.force === true;
    const media = await this.prisma.postMedia.findUnique({
      where: { id: mediaId },
      select: { alt: true, altLanguage: true, altTranslations: true },
    });

    if (!media || !media.alt) {
      log.warn('MediaAltTranslation: media not found or has no alt text', { mediaId });
      return;
    }

    const sourceLang = media.altLanguage ?? detectLanguage(media.alt);
    if (sourceLang === targetLanguage) {
      log.info('MediaAltTranslation: target same as source, skipping', { mediaId, targetLanguage });
      return;
    }

    const translations = (media.altTranslations ?? null) as Record<string, unknown> | null;
    if (!force && translations?.[targetLanguage]) {
      log.info('MediaAltTranslation: translation already cached', { mediaId, targetLanguage });
      return;
    }

    const messageId = translationTargetId('media-alt', mediaId);
    log.info('MediaAltTranslation: on-demand request', { mediaId, sourceLang, targetLanguage });

    try {
      await this.zmqClient.translateToMultipleLanguages(
        media.alt,
        sourceLang,
        [targetLanguage],
        messageId,
        `media_alt_context:${mediaId}`,
      );
    } catch (err) {
      log.error('MediaAltTranslation: on-demand ZMQ send failed', err, { mediaId });
    }
  }

  /**
   * Écoute `translationCompleted`, filtre sur le préfixe `media-alt:` — même
   * discipline de routage que `MediaCaptionTranslationService`.
   */
  private setupZmqListeners(): void {
    this.zmqClient.on('translationCompleted', (event: TranslationCompletedEvent) => {
      const messageId = event.result?.messageId;
      if (!messageId) return;

      if (translationTargetNamespace(messageId) !== 'media-alt') return;

      const mediaId = messageId.slice('media-alt:'.length);
      this.handleMediaAltTranslationCompleted(mediaId, event).catch((err) => {
        log.error('handleMediaAltTranslationCompleted failed', err, { mediaId });
      });
    });

    log.info('MediaAltTranslationService: ZMQ listeners configured');
  }

  private async handleMediaAltTranslationCompleted(mediaId: string, event: TranslationCompletedEvent): Promise<void> {
    const { targetLanguage } = event;
    const { translatedText, confidenceScore, translatorModel } = event.result;

    log.info('MediaAltTranslation: received translation', { mediaId, targetLanguage });

    const translationData = {
      text: translatedText,
      translationModel: translatorModel ?? 'nllb',
      confidenceScore: confidenceScore ?? 1,
      createdAt: new Date().toISOString(),
    };

    try {
      // Mise à jour en PIPELINE (même garde que #6558 pour la légende) : un
      // `$set` pointé (`altTranslations.<langue>`) sur un `altTranslations`
      // null est refusé par MongoDB, qui le rend dans `writeErrors` d'une
      // réponse `ok: 1` SANS lever. La fusion part d'une carte vide quand le
      // champ est null ou absent ; la valeur voyage en `$literal`.
      const result = await (this.prisma as unknown as {
        $runCommandRaw: (cmd: Prisma.InputJsonObject) => Promise<{ n?: number; writeErrors?: unknown[] }>;
      }).$runCommandRaw({
        update: 'PostMedia',
        updates: [{
          q: { _id: { $oid: mediaId } },
          u: [{
            $set: {
              altTranslations: {
                $mergeObjects: [
                  { $ifNull: ['$altTranslations', {}] },
                  { [targetLanguage]: { $literal: translationData } },
                ],
              },
            },
          }],
        }],
      });

      const writeErrors = result?.writeErrors ?? [];
      if (writeErrors.length > 0 || (result?.n ?? 0) === 0) {
        log.error('MediaAltTranslation: persist refused', new Error('altTranslations not written'), {
          mediaId, targetLanguage, matched: result?.n ?? 0, writeErrors,
        });
        return;
      }

      log.info('MediaAltTranslation: persisted', { mediaId, targetLanguage });

      const media = await this.prisma.postMedia.findUnique({
        where: { id: mediaId },
        select: { postId: true, commentId: true },
      });
      if (!media) return;

      const postId = media.postId ?? (media.commentId
        ? (await this.prisma.postComment.findUnique({ where: { id: media.commentId }, select: { postId: true } }))?.postId
        : undefined);
      if (!postId) return;

      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true, visibility: true, visibilityUserIds: true },
      });
      if (!post) return;

      this.socialEvents.broadcastMediaAltTranslationUpdated({
        mediaId,
        postId,
        ...(media.commentId ? { commentId: media.commentId } : {}),
        language: targetLanguage,
        translation: translationData,
      }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err: unknown) => {
        log.error('MediaAltTranslation: broadcast failed', err instanceof Error ? err : new Error(String(err)), { mediaId, targetLanguage });
      });
    } catch (err) {
      log.error('MediaAltTranslation: persist failed', err, { mediaId, targetLanguage });
    }
  }
}
