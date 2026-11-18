/**
 * Le mot d'une demande de connexion, traduit vers le Prisme de son DESTINATAIRE
 * (#19361, planche Etat-Demande : « On s'est croisées au festival ! · Traduit
 * de l'arabe »).
 *
 * La langue d'origine est écrite à l'envoi, dans la même écriture que la ligne
 * (`envoyerDemande`) ; ce service ne fait que remettre le mot au translator et
 * ranger ce qui revient. Les cibles sont les langues du destinataire, rangs 1→4
 * (`recipientLanguages`) : ce sont les seules que la descente servira jamais,
 * puisque seul le destinataire reçoit la traduction (`servirParties`).
 *
 * Le `messageId` du bus est namespacé `friend-request:<id>` : le pipeline des
 * messages ne s'en saisit pas (`isMessageTranslationTarget`).
 */

import type { PrismaClient, Prisma } from '@meeshy/shared/prisma/client';
import type { FriendRequestUpdatedEventData } from '@meeshy/shared/types/socketio-events';
import { normalizeLanguageForDedup } from '@meeshy/shared/utils/language-normalize';
import type { ZmqTranslationClient } from '../zmq-translation/ZmqTranslationClient';
import type { TranslationCompletedEvent } from '../zmq-translation/types';
import { translationTargetId, translationTargetNamespace } from '../zmq-translation/utils/zmq-helpers';
import { RECIPIENT_LANG_SELECT, recipientLanguages } from '../../utils/recipient-language';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { ZMQSingleton } from '../ZmqSingleton';

const log = enhancedLogger.child({ module: 'FriendRequestMessageTranslationService' });

const NAMESPACE = 'friend-request';

type ZmqTraduction = Pick<ZmqTranslationClient, 'translateToMultipleLanguages' | 'on'>;

/**
 * Le signal de `friend-request:updated` (#19361) remis au DESTINATAIRE seul,
 * sans contenu : la liste déjà ouverte relit la demande par la route.
 */
export type AnnonceTraduction = (receiverId: string, data: FriendRequestUpdatedEventData) => void;

export type DeclenchementTraduction = {
  readonly friendRequestId: string;
  readonly receiverId: string;
  readonly message: string;
  readonly sourceLanguage: string;
};

export class FriendRequestMessageTranslationService {
  private static _shared: FriendRequestMessageTranslationService | null = null;

  private constructor(
    private readonly prisma: PrismaClient,
    private readonly zmqClient: ZmqTraduction,
    private annonce: AnnonceTraduction | null,
  ) {}

  static init(prisma: PrismaClient, zmqClient: ZmqTraduction, annonce: AnnonceTraduction | null = null): FriendRequestMessageTranslationService {
    const instance = new FriendRequestMessageTranslationService(prisma, zmqClient, annonce);
    instance.ecouter();
    FriendRequestMessageTranslationService._shared = instance;
    return instance;
  }

  /**
   * Le service, branché PARESSEUSEMENT sur le client ZMQ du processus
   * (`ZMQSingleton`, celui que `MessageTranslationService` initialise) — son
   * écouteur est posé avant la première requête, donc avant tout retour.
   * `null` tant que le translator n'est pas joignable : l'envoi n'en dépend pas.
   */
  static maybeShared(prisma: PrismaClient, annonce: AnnonceTraduction | null = null): FriendRequestMessageTranslationService | null {
    const actuel = FriendRequestMessageTranslationService._shared;
    if (actuel) {
      if (annonce) actuel.annonce = annonce;
      return actuel;
    }
    const zmqClient = ZMQSingleton.getInstanceSync();
    return zmqClient ? FriendRequestMessageTranslationService.init(prisma, zmqClient, annonce) : null;
  }

  async trigger(params: DeclenchementTraduction): Promise<void> {
    const { friendRequestId, receiverId, message, sourceLanguage } = params;
    try {
      const receveur = await this.prisma.user.findUnique({
        where: { id: receiverId },
        select: RECIPIENT_LANG_SELECT,
      });
      const source = normalizeLanguageForDedup(sourceLanguage);
      const cibles = [...new Set(recipientLanguages(receveur))].filter((langue) => langue !== source);
      if (cibles.length === 0) return;

      await this.zmqClient.translateToMultipleLanguages(
        message,
        sourceLanguage,
        cibles,
        translationTargetId(NAMESPACE, friendRequestId),
        `friend_request_context:${friendRequestId}`,
      );
    } catch (err) {
      log.error('FriendRequestMessageTranslation: trigger failed', err, { friendRequestId });
    }
  }

  private ecouter(): void {
    this.zmqClient.on('translationCompleted', (event: TranslationCompletedEvent) => {
      const messageId = event.result?.messageId;
      if (!messageId || translationTargetNamespace(messageId) !== NAMESPACE) return;
      const friendRequestId = messageId.slice(NAMESPACE.length + 1);
      this.ranger(friendRequestId, event).catch((err) => {
        log.error('FriendRequestMessageTranslation: persist failed', err, { friendRequestId });
      });
    });
  }

  /**
   * Fusion en PIPELINE, même garde que `MediaAltTranslationService` : un `$set`
   * pointé sur un champ `null` est refusé par MongoDB sans lever.
   */
  private async ranger(friendRequestId: string, event: TranslationCompletedEvent): Promise<void> {
    const { targetLanguage } = event;
    const { translatedText, confidenceScore, translatorModel } = event.result;
    if (!targetLanguage || typeof translatedText !== 'string' || translatedText.trim() === '') return;

    const traduction = {
      text: translatedText,
      translationModel: translatorModel ?? 'nllb',
      confidenceScore: confidenceScore ?? 1,
      createdAt: new Date().toISOString(),
    };

    const resultat = await (this.prisma as unknown as {
      $runCommandRaw: (cmd: Prisma.InputJsonObject) => Promise<{ n?: number; writeErrors?: unknown[] }>;
    }).$runCommandRaw({
      update: 'FriendRequest',
      updates: [{
        q: { _id: { $oid: friendRequestId } },
        u: [{
          $set: {
            messageTranslations: {
              $mergeObjects: [
                { $ifNull: ['$messageTranslations', {}] },
                { [targetLanguage]: { $literal: traduction } },
              ],
            },
          },
        }],
      }],
    });

    if ((resultat?.writeErrors ?? []).length > 0 || (resultat?.n ?? 0) === 0) {
      log.warn('FriendRequestMessageTranslation: nothing written (request withdrawn?)', { friendRequestId, targetLanguage });
      return;
    }
    await this.annoncer(friendRequestId);
  }

  /** Le destinataire relit la demande : un identifiant, jamais le mot ni sa traduction. */
  private async annoncer(friendRequestId: string): Promise<void> {
    const annonce = this.annonce;
    if (!annonce) return;
    const demande = await this.prisma.friendRequest.findUnique({
      where: { id: friendRequestId },
      select: { receiverId: true },
    });
    if (!demande) return;
    annonce(demande.receiverId, { friendRequestId });
  }
}
