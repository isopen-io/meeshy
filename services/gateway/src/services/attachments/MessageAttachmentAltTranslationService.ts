/**
 * MessageAttachmentAltTranslationService (#12333)
 *
 * Traduit la DESCRIPTION d'une pièce de conversation (`MessageAttachment.alt`)
 * dans les langues du pipeline, pour que le Prisme la serve dans la langue du
 * lecteur (`resolveMediaDescription`). Jumelle de `MediaAltTranslationService`
 * (`PostMedia.alt`) et de `MessageAttachmentCaptionTranslationService` (dont
 * elle reprend la garde) :
 *
 * - **jamais avant que le message soit connu** (audit #12333, A3) : à l'envoi,
 *   une pièce n'a pas encore de message, donc ni sa protection ni le chiffrement
 *   de sa conversation ne sont connus. La traduction part au RATTACHEMENT
 *   (`settleLinkedDescriptions`), jamais à l'upload ;
 * - **garde fail-closed relue en base**, à la demande ET à la réception :
 *   pièce à vue unique, floutée ou chiffrée (`messageAttachmentCaptionMayTranslate`,
 *   décision #6533), message protégé (`mediaSideContentMayTravel`, la loi des
 *   contenus d'à-côté), conversation chiffrée — jamais traduite ;
 * - namespace ZMQ distinct (`message-attachment-alt:`) ;
 * - persistance par `$mergeObjects` (une langue à la fois, sans écraser les
 *   autres), puis `onTranslated` : la passerelle diffuse la pièce relue par
 *   `message:attachment-updated`, sous la loi de `servedDescription`.
 */
import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import type { ZmqTranslationClient } from '../zmq-translation/ZmqTranslationClient';
import type { TranslationCompletedEvent } from '../zmq-translation/types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { translationTargetId, translationTargetNamespace } from '../zmq-translation/utils/zmq-helpers';
import { detectContentLanguage } from '../../utils/content-language';
import { messageAttachmentCaptionMayTranslate } from './MessageAttachmentCaptionTranslationService';
import { MESSAGE_SIDE_PROTECTION_SELECT, mediaSideContentMayTravel } from './mediaSideContent';

const GUARD_SELECT = {
  alt: true,
  isViewOnce: true,
  isBlurred: true,
  effectFlags: true,
  isEncrypted: true,
  encryptionMode: true,
  messageId: true,
  message: { select: { ...MESSAGE_SIDE_PROTECTION_SELECT, conversation: { select: { encryptionMode: true } } } },
} as const;

type GuardRow = {
  readonly alt: string | null;
  readonly isViewOnce: boolean | null;
  readonly isBlurred: boolean | null;
  readonly effectFlags: number | null;
  readonly isEncrypted: boolean | null;
  readonly encryptionMode: string | null;
  readonly messageId: string | null;
  readonly message: (Parameters<typeof mediaSideContentMayTravel>[1] & { readonly conversation?: { readonly encryptionMode: string | null } | null }) | null;
};

/** La description de cette pièce peut-elle partir au traducteur ? Fail-closed sur toute inconnue. */
export function messageAttachmentAltMayTranslate(row: GuardRow | null): boolean {
  if (!row || !row.messageId || !row.message) return false;
  if (!messageAttachmentCaptionMayTranslate(row)) return false;
  if (!mediaSideContentMayTravel(row, row.message)) return false;
  return !row.message.conversation?.encryptionMode;
}

const log = enhancedLogger.child({ module: 'MessageAttachmentAltTranslationService' });

export const MESSAGE_ATTACHMENT_ALT_TARGET_LANGUAGES = ['fr', 'en', 'es', 'ar', 'pt'] as const;
const NAMESPACE = 'message-attachment-alt';

type ZmqPort = Pick<ZmqTranslationClient, 'translateToMultipleLanguages' | 'on'>;

export class MessageAttachmentAltTranslationService {
  private static _shared: MessageAttachmentAltTranslationService | null = null;

  constructor(
    private readonly prisma: PrismaClient,
    private readonly zmqClient: ZmqPort,
    private readonly onTranslated: (attachmentId: string) => Promise<void>,
  ) {}

  static init(prisma: PrismaClient, zmqClient: ZmqPort, onTranslated: (attachmentId: string) => Promise<void>): MessageAttachmentAltTranslationService {
    const instance = new MessageAttachmentAltTranslationService(prisma, zmqClient, onTranslated);
    instance.listen();
    MessageAttachmentAltTranslationService._shared = instance;
    return instance;
  }

  static get shared(): MessageAttachmentAltTranslationService | null {
    return MessageAttachmentAltTranslationService._shared;
  }

  /** Après l'écriture d'une description neuve. Fire-and-forget, ne lève jamais. */
  async trigger(attachmentId: string): Promise<void> {
    try {
      const row = await this.prisma.messageAttachment.findUnique({ where: { id: attachmentId }, select: GUARD_SELECT }) as GuardRow | null;
      if (!row || !messageAttachmentAltMayTranslate(row)) return;
      if (!row.alt || !row.alt.trim()) return;

      const sourceLanguage = detectContentLanguage(row.alt);
      await this.prisma.messageAttachment.update({
        where: { id: attachmentId },
        data: { altLanguage: sourceLanguage, altTranslations: null },
      });
      const targets = MESSAGE_ATTACHMENT_ALT_TARGET_LANGUAGES.filter((lang) => lang !== sourceLanguage);
      await this.zmqClient.translateToMultipleLanguages(
        row.alt,
        sourceLanguage,
        [...targets],
        translationTargetId(NAMESPACE, attachmentId),
        `message_attachment_alt_context:${attachmentId}`,
      );
    } catch (error) {
      log.error('MessageAttachmentAltTranslation: trigger failed', error, { attachmentId });
    }
  }

  private listen(): void {
    this.zmqClient.on('translationCompleted', (event: TranslationCompletedEvent) => {
      const messageId = event.result?.messageId;
      if (!messageId || translationTargetNamespace(messageId) !== NAMESPACE) return;
      const attachmentId = messageId.slice(`${NAMESPACE}:`.length);
      this.persist(attachmentId, event).catch((error: unknown) => log.error('MessageAttachmentAltTranslation: persist failed', error, { attachmentId }));
    });
  }

  /** Persiste UNE langue, relit la garde (la pièce a pu devenir protégée), puis prévient. */
  async persist(attachmentId: string, event: Pick<TranslationCompletedEvent, 'targetLanguage' | 'result'>): Promise<void> {
    const guard = await this.prisma.messageAttachment.findUnique({ where: { id: attachmentId }, select: GUARD_SELECT }) as GuardRow | null;
    if (!messageAttachmentAltMayTranslate(guard)) return;

    const entry = {
      text: event.result.translatedText,
      translationModel: event.result.translatorModel ?? 'nllb',
      confidenceScore: event.result.confidenceScore ?? 1,
      createdAt: new Date().toISOString(),
    };
    const result = await (this.prisma as unknown as {
      $runCommandRaw: (cmd: Prisma.InputJsonObject) => Promise<{ n?: number }>;
    }).$runCommandRaw({
      update: 'MessageAttachment',
      updates: [{
        q: { _id: { $oid: attachmentId } },
        u: [{ $set: { altTranslations: { $mergeObjects: [{ $ifNull: ['$altTranslations', {}] }, { [event.targetLanguage]: { $literal: entry } }] } } }],
      }],
    });
    if ((result?.n ?? 0) === 0) return;
    await this.onTranslated(attachmentId);
  }
}

/** Déclenche la traduction d'une description neuve, si le service tourne (harnais : non). */
export function triggerMessageAttachmentAltTranslation(attachmentId: string): void {
  const service = MessageAttachmentAltTranslationService.shared;
  if (!service) return;
  service.trigger(attachmentId).catch(() => undefined);
}
