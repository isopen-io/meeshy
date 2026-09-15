/**
 * MessageAttachmentCaptionTranslationService
 *
 * Déclenche la traduction de la légende d'un ATTACHEMENT DE CONVERSATION
 * (`MessageAttachment.caption`) — #6533, suite de #6280
 * (`services/posts/MediaCaptionTranslationService.ts`, qui traite la même
 * légende côté `PostMedia`, sans protection).
 *
 * ## Garde fail-closed — le cœur de ce fichier
 *
 * Décision #6533 (`packages/shared/decisions.md`, 2026-09-14) : un attachement
 * à VUE UNIQUE (`isViewOnce`), FLOUTÉ (`isBlurred`) ou CHIFFRÉ (`isEncrypted`)
 * ne déclenche JAMAIS de traduction de sa légende — ni à l'écriture, ni à la
 * demande. `messageAttachmentCaptionMayTranslate()` est le SEUL point de
 * décision, relu à chaque déclenchement depuis la base (jamais depuis un
 * paramètre que l'appelant pourrait omettre — gateway/CLAUDE.md § « Une garde
 * de confidentialité se relit CHEZ ELLE, pas dans ses paramètres »), et
 * fail-closed sur l'ABSENCE de signal : un `select` qui aurait oublié un des
 * trois champs referme la porte, il ne l'ouvre jamais.
 *
 * ## Portée de ce lot
 *
 * `MessageAttachment.caption` n'a AUJOURD'HUI aucun chemin d'écriture
 * utilisateur dans le dépôt (vérifié : ni `routes/attachments/upload.ts` ni
 * `metadata.ts` ne l'exposent) — le seul écrivain est la copie de transfert
 * (`MessageProcessor.copyForwardedAttachments`), qui recopie verbatim et ne
 * doit RIEN redéclencher (un transfert copie une traduction déjà faite, comme
 * le fait déjà #6280 pour `PostMedia` sur un repost sans édition).
 *
 * Ce fichier livre donc le DÉCLENCHEUR, prêt à être appelé par la route qui
 * donnera à `caption` son premier chemin d'écriture. Le service de
 * persistance ZMQ (écoute de `translationCompleted`, écriture
 * `captionTranslations.<lang>`, événement socket, route à la demande) — même
 * calque que `MediaCaptionTranslationService` — est un suivi explicite, pas
 * un oubli : sans écriture utilisateur de `caption`, ce serait de la
 * machinerie sans appelant.
 */

import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../zmq-translation/ZmqTranslationClient';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { translationTargetId } from '../zmq-translation/utils/zmq-helpers';

const log = enhancedLogger.child({ module: 'MessageAttachmentCaptionTranslationService' });

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

/**
 * Les trois signaux de protection d'un attachement de conversation. Fail-closed :
 * `true` (ou absent) sur N'IMPORTE LEQUEL des trois suffit à refuser la
 * traduction — seul `false` explicite lève un signal.
 */
export type MessageAttachmentProtectionSignals = {
  readonly isViewOnce: boolean | null | undefined;
  readonly isBlurred: boolean | null | undefined;
  readonly isEncrypted: boolean | null | undefined;
  readonly encryptionMode?: string | null;
};

/**
 * `true` seulement quand les trois signaux sont explicitement désarmés. Un
 * champ manquant (`undefined`, `select` incomplet) est traité comme protégé —
 * jamais comme autorisé.
 */
export function messageAttachmentCaptionMayTranslate(
  attachment: MessageAttachmentProtectionSignals,
): boolean {
  if (attachment.isViewOnce !== false) return false;
  if (attachment.isBlurred !== false) return false;
  if (attachment.isEncrypted !== false) return false;
  if (attachment.encryptionMode) return false;
  return true;
}

export class MessageAttachmentCaptionTranslationService {
  private static _shared: MessageAttachmentCaptionTranslationService | null = null;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly zmqClient: ZmqTranslationClient,
  ) {}

  static init(
    prisma: PrismaClient,
    zmqClient: ZmqTranslationClient,
  ): MessageAttachmentCaptionTranslationService {
    const instance = new MessageAttachmentCaptionTranslationService(prisma, zmqClient);
    MessageAttachmentCaptionTranslationService._shared = instance;
    return instance;
  }

  static get shared(): MessageAttachmentCaptionTranslationService {
    if (!MessageAttachmentCaptionTranslationService._shared) {
      throw new Error('MessageAttachmentCaptionTranslationService not initialized — call MessageAttachmentCaptionTranslationService.init() first');
    }
    return MessageAttachmentCaptionTranslationService._shared;
  }

  /**
   * Appelée après l'écriture réussie d'une NOUVELLE légende sur un
   * `MessageAttachment` — jamais après une copie verbatim (transfert). Fire-and-forget :
   * les résultats arrivent via l'événement ZMQ `translationCompleted`, consommés
   * par le service de persistance à venir (voir doc-comment de fichier).
   *
   * Relit TOUJOURS les trois signaux de protection depuis la base avant de
   * décider quoi que ce soit — la garde n'est jamais contournable par un
   * appelant qui omettrait de les passer.
   */
  async triggerMessageAttachmentCaptionTranslation(attachmentId: string, caption: string | null): Promise<void> {
    try {
      const attachment = await this.prisma.messageAttachment.findUnique({
        where: { id: attachmentId },
        select: { isViewOnce: true, isBlurred: true, isEncrypted: true, encryptionMode: true },
      });

      if (!attachment) {
        log.warn('MessageAttachmentCaptionTranslation: attachment not found', { attachmentId });
        return;
      }

      if (!messageAttachmentCaptionMayTranslate(attachment)) {
        log.info('MessageAttachmentCaptionTranslation: skipped — attachment is protected', {
          attachmentId,
          isViewOnce: attachment.isViewOnce,
          isBlurred: attachment.isBlurred,
          isEncrypted: attachment.isEncrypted,
        });
        return;
      }

      if (!caption || !caption.trim()) {
        await this.prisma.messageAttachment.update({
          where: { id: attachmentId },
          data: { captionLanguage: null, captionTranslations: null },
        });
        return;
      }

      const sourceLanguage = detectLanguage(caption);

      // Invalidation + pose de la nouvelle langue source EN UNE écriture —
      // même discipline que #6280 : pas d'état intermédiaire où
      // `captionTranslations` porterait encore la carte de l'ancien texte
      // sous une `captionLanguage` neuve.
      await this.prisma.messageAttachment.update({
        where: { id: attachmentId },
        data: { captionLanguage: sourceLanguage, captionTranslations: null },
      });

      const targetLanguages = TOP_LANGUAGES.filter(l => l !== sourceLanguage);
      if (targetLanguages.length === 0) {
        log.info('MessageAttachmentCaptionTranslation: no target languages after filtering source', { attachmentId, sourceLanguage });
        return;
      }

      const messageId = translationTargetId('message-attachment-caption', attachmentId);
      log.info('MessageAttachmentCaptionTranslation: sending ZMQ request', { attachmentId, sourceLanguage, targetLanguages });

      await this.zmqClient.translateToMultipleLanguages(
        caption,
        sourceLanguage,
        targetLanguages,
        messageId,
        `message_attachment_caption_context:${attachmentId}`,
      );
    } catch (err) {
      log.error('MessageAttachmentCaptionTranslation: trigger failed', err, { attachmentId });
    }
  }
}
