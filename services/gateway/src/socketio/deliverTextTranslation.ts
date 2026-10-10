import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS, type TranslationEvent } from '@meeshy/shared/types/socketio-events';
import { isMessageTranslationTarget } from '../services/zmq-translation/utils/zmq-helpers';
import { enhancedLogger } from '../utils/logger-enhanced';
import { buildTranslationEvent } from './buildTranslationEvent';
import { emitConversationPreviewUpdate } from './emitConversationPreviewUpdate';
import type { OfflineParticipantQueueParams } from './offlineParticipantQueue';
import { translationReaders } from './translationReaders';
import type { MeeshyIOServer } from './typed-socket';

const logger = enhancedLogger.child({ module: 'TextTranslationDelivery' });

export type TextTranslationReady = {
  taskId: string;
  result: any;
  targetLanguage: string;
  translationId?: string;
  id?: string;
};

export type TextTranslationDeliveryDeps = {
  readonly prisma: PrismaClient;
  readonly io: MeeshyIOServer;
  readonly normalizeConversationId: (conversationId: string) => Promise<string>;
  readonly enqueueForOfflineParticipants: (params: OfflineParticipantQueueParams) => Promise<void>;
  readonly stats: { translations_sent: number; errors: number };
};

/**
 * Livre la traduction TEXTE d'un message que le traducteur vient de rendre :
 * la room de conversation (ou ses seuls lecteurs autorisés), la file hors
 * ligne, puis l'aperçu de liste. Extrait de `MeeshySocketIOManager`
 * (`_handleTextTranslationReady`), qui y délègue.
 */
export async function deliverTextTranslation(
  deps: TextTranslationDeliveryDeps,
  data: TextTranslationReady,
): Promise<void> {
  try {
    const { result, targetLanguage} = data;

    // Une traduction de post/commentaire/story emprunte le même bus que celle
    // d'un message, sous un identifiant namespacé (`post:<id>`) : elle n'a ni
    // ligne `Message`, ni room de conversation. La chercher ici envoyait
    // `post:<24-hex>` à Prisma comme ObjectId (P2023) puis loggait un « No
    // conversation found » alarmant pour un cas parfaitement normal — le
    // broadcast social est fait par `SocialEventsHandler`.
    if (!isMessageTranslationTarget(result?.messageId ?? '')) {
      return;
    }

    // Récupérer la conversation du message pour broadcast
    let conversationIdForBroadcast: string | null = null;
    // `senderId` ne sert qu'à remplir `updatedBy`, OBLIGATOIRE dans
    // ConversationUpdatedEventData, sur le rafraîchissement d'aperçu ci-dessous.
    // Une traduction n'a pas d'acteur humain : l'auteur du message traduit est
    // la seule identité honnête à porter là, et c'est déjà le repli que le
    // chemin d'envoi utilise (`senderUserId ?? message.senderId`). La colonne
    // est non-nullable et la ligne a forcément été lue quand on arrive au
    // rafraîchissement — `conversationIdForBroadcast` sort du MÊME `msg`.
    let senderIdForPreview = '';
    let messageCreatedAt: Date | null = null;
    try {
      const msg = await deps.prisma.message.findUnique({
        where: { id: result.messageId },
        select: { conversationId: true, senderId: true, createdAt: true }
      });
      conversationIdForBroadcast = msg?.conversationId || null;
      messageCreatedAt = msg?.createdAt ?? null;
      senderIdForPreview = msg?.senderId ?? '';
    } catch (error) {
      logger.error(`❌ [SocketIOManager] Erreur récupération conversation:`, error);
    }
    
    // Préparer les données de traduction au format correct pour le frontend
    // FORMAT: TranslationEvent avec un tableau de traductions
    const translationData: TranslationEvent = buildTranslationEvent({
      messageId: result.messageId,
      targetLanguage,
      translatedText: result.translatedText,
      sourceLanguage: result.sourceLanguage,
      translationModel: result.translationModel || result.modelType,
      confidenceScore: result.confidenceScore,
      cached: false,
      translationId: data.translationId || data.id,
    });
    
    
    // Diffuser dans la room de conversation (méthode principale et UNIQUE)
    if (conversationIdForBroadcast) {
      // Normaliser l'ID de conversation
      const normalizedId = await deps.normalizeConversationId(conversationIdForBroadcast);
      const roomName = ROOMS.conversation(normalizedId);
      const roomClients = deps.io.sockets.adapter.rooms.get(roomName);
      const clientCount = roomClients ? roomClients.size : 0;
      
      
      // #9709 — la room entière, ou ses seuls lecteurs autorisés : un
      // participant dont le plancher d'historique est postérieur au message
      // ne reçoit pas sa traduction (`translationReaders`, fail-closed).
      const readers = await translationReaders(deps.prisma, conversationIdForBroadcast, messageCreatedAt);
      if (readers.kind === 'room') {
        deps.io.to(roomName).emit(SERVER_EVENTS.MESSAGE_TRANSLATION, translationData);
      } else if (readers.rooms.length > 0) {
        deps.io.to([...readers.rooms]).emit(SERVER_EVENTS.MESSAGE_TRANSLATION, translationData);
      }
      deps.stats.translations_sent += clientCount;

      // Troisième audience, la seule que rien ne servait : les participants
      // HORS LIGNE à l'instant où NLLB répond. La room ne contient que des
      // sockets connectées, et le `message:new` mis en file à l'ENVOI porte
      // `translations: []` — la traduction atterrit une seconde plus tard, par
      // ZMQ. Sans cette entrée, le message rejoué au reconnect reste
      // définitivement dans la langue de l'expéditeur : aucun client ne
      // refetch spontanément. Le Prisme devenait fonction de la CONNECTIVITÉ
      // du lecteur — exactement le défaut que `emitAttachmentUpdated` ferme
      // pour la transcription d'une note vocale, ici pour le texte.
      //
      // Aucun acteur à exclure : NLLB n'est pas une personne, et l'auteur du
      // message est précisément un participant dont la copie ne porte aucune
      // traduction à l'envoi.
      //
      // `dedupKey` scopé à la LANGUE CIBLE : un message se traduit vers autant
      // de langues que la conversation compte de langues de lecture, et
      // l'identité de dédup par défaut (messageId, eventType) les écraserait
      // l'une après l'autre — le lecteur hors ligne ne convergerait que sur la
      // dernière arrivée.
      // Borné aux lecteurs dont le Prisme porte CETTE langue — la même règle
      // que `emitConversationPreviewUpdate` applique juste en dessous avec
      // `onlyIfPreviewCarriesLanguage`. Sans ce bornage, un message d'une
      // conversation à L langues déposait L entrées chez CHAQUE absent, dont
      // L−1 dans des langues qu'il ne peut pas afficher : la file qui porte
      // les vrais messages était diluée d'autant, et le repli mémoire
      // (plafonné à 50 entrées par utilisateur) évinçait des messages réels
      // au profit de traductions illisibles.
      await deps.enqueueForOfflineParticipants({
        conversationId: normalizedId,
        eventType: 'translation',
        messageId: result.messageId,
        payload: translationData,
        dedupKey: `${result.messageId}:${targetLanguage}`,
        restrictToReadersOfLanguage: targetLanguage,
        ...(readers.kind === 'readers' ? { excludedQueueKeys: readers.excludedQueueKeys } : {}),
      });

      // `message:translation` ne porte QUE la room de conversation. Un lecteur
      // resté sur l'écran de liste n'y apprend rien : sa ligne garde l'aperçu
      // servi à l'ENVOI, quand aucune traduction n'existait encore, et rien ne
      // repasse jamais. Le Prisme devenait donc fonction de l'ordre d'arrivée —
      // ouvrir la conversation traduisait la ligne, ne pas l'ouvrir la laissait
      // dans la langue de l'expéditeur, indéfiniment.
      //
      // Borné aux deux seuls cas où la ligne change VRAIMENT : le message
      // traduit est encore le dernier de la conversation, et le destinataire
      // lit la langue qui vient d'atterrir (cf. `PreviewUpdateScope`).
      await emitConversationPreviewUpdate(
        deps.prisma,
        deps.io,
        normalizedId,
        senderIdForPreview,
        (error) => logger.warn('preview refresh after translation failed (best-effort)', {
          messageId: result.messageId,
          targetLanguage,
          error,
        }),
        { onlyIfLatestIs: result.messageId, onlyIfPreviewCarriesLanguage: targetLanguage },
      );
    } else {
      logger.warn(`⚠️ [SocketIOManager] No conversation found for message ${result.messageId} — translation dropped (no room to broadcast to)`);
    }

  } catch (error) {
    logger.error(`❌ Erreur envoi traduction: ${error}`);
    deps.stats.errors++;
  }
}
