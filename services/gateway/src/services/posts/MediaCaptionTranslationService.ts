/**
 * MediaCaptionTranslationService
 *
 * Traduit la LÉGENDE d'un média (`PostMedia.caption`) — post OU commentaire
 * (#6280). Calqué sur `PostTranslationService` (texte plat, pipeline générique
 * `ZmqTranslationClient.translateToMultipleLanguages`), PAS sur
 * `StoryTextObjectTranslationService` (gabarit v1/v3 du canvas, hors sujet ici
 * — voir `packages/shared/decisions.md` § 2026-09-14, point 3.3/3.4).
 *
 * DISTINCT de trois voisins qui partagent presque le même document :
 * - `PostTranslationService` traduit `Post.content`/`PostComment.content`,
 *   jamais la légende d'un média du carrousel ;
 * - `PostMedia.translations` porte les pistes audio/transcriptions traduites
 *   (forme `{lang: {type, transcription, path, url, durationMs, …}}`) —
 *   n'est jamais écrit ni lu ici ;
 * - `PostMedia.language` décrit le média (variantes TTS/sous-titres), pas la
 *   langue SOURCE de sa légende (`captionLanguage`, écrit ici).
 *
 * Le `messageId` du bus ZMQ est namespacé `media-caption:<mediaId>`
 * (`translationTargetId`/`translationTargetNamespace`, zmq-helpers.ts).
 */

import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../zmq-translation/ZmqTranslationClient';
import type { TranslationCompletedEvent } from '../zmq-translation/types';
import type { SocialEventsHandler } from '../../socketio/handlers/SocialEventsHandler';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { translationTargetId, translationTargetNamespace } from '../zmq-translation/utils/zmq-helpers';

const log = enhancedLogger.child({ module: 'MediaCaptionTranslationService' });

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

export class MediaCaptionTranslationService {
  private static _shared: MediaCaptionTranslationService | null = null;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly zmqClient: ZmqTranslationClient,
    private readonly socialEvents: SocialEventsHandler,
  ) {}

  static init(
    prisma: PrismaClient,
    zmqClient: ZmqTranslationClient,
    socialEvents: SocialEventsHandler,
  ): MediaCaptionTranslationService {
    const instance = new MediaCaptionTranslationService(prisma, zmqClient, socialEvents);
    instance.setupZmqListeners();
    MediaCaptionTranslationService._shared = instance;
    return instance;
  }

  static get shared(): MediaCaptionTranslationService {
    if (!MediaCaptionTranslationService._shared) {
      throw new Error('MediaCaptionTranslationService not initialized — call MediaCaptionTranslationService.init() first');
    }
    return MediaCaptionTranslationService._shared;
  }

  /**
   * Appelée après `applyMediaText('caption', …)`, à la création ET à
   * l'édition d'un post (`PostService.ts`). Fire-and-forget : les résultats
   * arrivent via l'événement ZMQ `translationCompleted`.
   *
   * INVALIDE toujours `captionLanguage`/`captionTranslations` avant de
   * relancer — une édition qui change le texte rend les traductions
   * précédentes fausses pour la NOUVELLE légende, et les laisser en place le
   * temps du round-trip NLLB servirait une traduction d'un autre texte.
   *
   * `caption === null` (légende retirée) efface les deux champs et n'émet
   * aucun job — il n'y a plus rien à traduire.
   */
  async triggerMediaCaptionTranslation(mediaId: string, caption: string | null): Promise<void> {
    try {
      if (!caption || !caption.trim()) {
        await this.prisma.postMedia.update({
          where: { id: mediaId },
          data: { captionLanguage: null, captionTranslations: null },
        });
        return;
      }

      const sourceLanguage = detectLanguage(caption);

      // Invalidation + pose de la nouvelle langue source EN UNE écriture : pas
      // d'état intermédiaire où `captionTranslations` porterait encore la
      // carte de l'ancien texte sous une `captionLanguage` neuve.
      await this.prisma.postMedia.update({
        where: { id: mediaId },
        data: { captionLanguage: sourceLanguage, captionTranslations: null },
      });

      const targetLanguages = TOP_LANGUAGES.filter(l => l !== sourceLanguage);
      if (targetLanguages.length === 0) {
        log.info('MediaCaptionTranslation: no target languages after filtering source', { mediaId, sourceLanguage });
        return;
      }

      const messageId = translationTargetId('media-caption', mediaId);
      log.info('MediaCaptionTranslation: sending ZMQ request', { mediaId, sourceLanguage, targetLanguages });

      await this.zmqClient.translateToMultipleLanguages(
        caption,
        sourceLanguage,
        targetLanguages,
        messageId,
        `media_caption_context:${mediaId}`,
      );
    } catch (err) {
      log.error('MediaCaptionTranslation: trigger failed', err, { mediaId });
    }
  }

  /**
   * Traduction à la demande vers UNE langue — miroir de
   * `PostTranslationService.translateOnDemand`. `force` rejoue une langue
   * déjà traduite (bouton « Retraduire »).
   */
  async translateOnDemand(
    mediaId: string,
    targetLanguage: string,
    options: { force?: boolean } = {},
  ): Promise<void> {
    const force = options.force === true;
    const media = await this.prisma.postMedia.findUnique({
      where: { id: mediaId },
      select: { caption: true, captionLanguage: true, captionTranslations: true },
    });

    if (!media || !media.caption) {
      log.warn('MediaCaptionTranslation: media not found or has no caption', { mediaId });
      return;
    }

    const sourceLang = media.captionLanguage ?? detectLanguage(media.caption);
    if (sourceLang === targetLanguage) {
      log.info('MediaCaptionTranslation: target same as source, skipping', { mediaId, targetLanguage });
      return;
    }

    const translations = (media.captionTranslations ?? null) as Record<string, unknown> | null;
    if (!force && translations?.[targetLanguage]) {
      log.info('MediaCaptionTranslation: translation already cached', { mediaId, targetLanguage });
      return;
    }

    const messageId = translationTargetId('media-caption', mediaId);
    log.info('MediaCaptionTranslation: on-demand request', { mediaId, sourceLang, targetLanguage });

    try {
      await this.zmqClient.translateToMultipleLanguages(
        media.caption,
        sourceLang,
        [targetLanguage],
        messageId,
        `media_caption_context:${mediaId}`,
      );
    } catch (err) {
      log.error('MediaCaptionTranslation: on-demand ZMQ send failed', err, { mediaId });
    }
  }

  /**
   * Écoute `translationCompleted`, filtre sur le préfixe `media-caption:` —
   * même discipline de routage que `PostTranslationService` (post:/comment:).
   */
  private setupZmqListeners(): void {
    this.zmqClient.on('translationCompleted', (event: TranslationCompletedEvent) => {
      const messageId = event.result?.messageId;
      if (!messageId) return;

      if (translationTargetNamespace(messageId) !== 'media-caption') return;

      const mediaId = messageId.slice('media-caption:'.length);
      this.handleMediaCaptionTranslationCompleted(mediaId, event).catch((err) => {
        log.error('handleMediaCaptionTranslationCompleted failed', err, { mediaId });
      });
    });

    log.info('MediaCaptionTranslationService: ZMQ listeners configured');
  }

  private async handleMediaCaptionTranslationCompleted(mediaId: string, event: TranslationCompletedEvent): Promise<void> {
    const { targetLanguage } = event;
    const { translatedText, confidenceScore, translatorModel } = event.result;

    log.info('MediaCaptionTranslation: received translation', { mediaId, targetLanguage });

    const translationData = {
      text: translatedText,
      translationModel: translatorModel ?? 'nllb',
      confidenceScore: confidenceScore ?? 1,
      createdAt: new Date().toISOString(),
    };

    try {
      // Mise à jour en PIPELINE (#6558). L'invalidation pose `captionTranslations`
      // à null ; un `$set` pointé (`captionTranslations.<langue>`) sur un null
      // est refusé par MongoDB, qui le rend dans `writeErrors` d'une réponse
      // `ok: 1` SANS lever — le service journalisait « persisted » et diffusait
      // une traduction jamais écrite. La fusion part d'une carte vide quand le
      // champ est null ou absent ; la valeur voyage en `$literal`, sans quoi un
      // texte traduit commençant par `$` serait lu comme un chemin de champ.
      const result = await (this.prisma as unknown as {
        $runCommandRaw: (cmd: Prisma.InputJsonObject) => Promise<{ n?: number; writeErrors?: unknown[] }>;
      }).$runCommandRaw({
        update: 'PostMedia',
        updates: [{
          q: { _id: { $oid: mediaId } },
          u: [{
            $set: {
              captionTranslations: {
                $mergeObjects: [
                  { $ifNull: ['$captionTranslations', {}] },
                  { [targetLanguage]: { $literal: translationData } },
                ],
              },
            },
          }],
        }],
      });

      const writeErrors = result?.writeErrors ?? [];
      if (writeErrors.length > 0 || (result?.n ?? 0) === 0) {
        log.error('MediaCaptionTranslation: persist refused', new Error('captionTranslations not written'), {
          mediaId, targetLanguage, matched: result?.n ?? 0, writeErrors,
        });
        return;
      }

      log.info('MediaCaptionTranslation: persisted', { mediaId, targetLanguage });

      const media = await this.prisma.postMedia.findUnique({
        where: { id: mediaId },
        select: { postId: true, commentId: true },
      });
      if (!media) return;

      // Un média de commentaire n'a pas de `postId` direct — le POST qui porte
      // la visibilité (donc l'audience de diffusion) est celui du commentaire.
      const postId = media.postId ?? (media.commentId
        ? (await this.prisma.postComment.findUnique({ where: { id: media.commentId }, select: { postId: true } }))?.postId
        : undefined);
      if (!postId) return;

      const post = await this.prisma.post.findUnique({
        where: { id: postId },
        select: { authorId: true, visibility: true, visibilityUserIds: true },
      });
      if (!post) return;

      this.socialEvents.broadcastMediaCaptionTranslationUpdated({
        mediaId,
        postId,
        ...(media.commentId ? { commentId: media.commentId } : {}),
        language: targetLanguage,
        translation: translationData,
      }, post.authorId, post.visibility, post.visibilityUserIds ?? []).catch((err: unknown) => {
        log.error('MediaCaptionTranslation: broadcast failed', err instanceof Error ? err : new Error(String(err)), { mediaId, targetLanguage });
      });
    } catch (err) {
      log.error('MediaCaptionTranslation: persist failed', err, { mediaId, targetLanguage });
    }
  }
}
