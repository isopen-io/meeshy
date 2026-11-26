/**
 * L'écriture d'un message HORS de `MessagingService.handleMessage`, par
 * `MessageTranslationService.handleNewMessage` (nouveau message sans `id`).
 *
 * #14643 — elle porte le second verrou de l'obsolescence, comme REST et
 * socket : dans une conversation obsolète, le message naît effacé, ne repousse
 * pas l'horloge de la liste, et l'appelant ne l'envoie pas au traducteur.
 */
import type { PrismaClient, Message } from '@meeshy/shared/prisma/client';
import { generateConversationIdentifier } from '@meeshy/shared/utils/conversation-helpers';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { LIVE_MESSAGE_MARK } from '../messaging/liveMessage';
import { sealMessageIfConversationObsoleted } from '../conversations/obsoleteMessageSeal';
import { implicitConversationRegime } from '../conversations/creationRegime';
import type { MessageData } from './MessageTranslationService';

const logger = enhancedLogger.child({ module: 'MessageTranslationService' });

export const CONVERSATION_OBSOLETED_STATUS = 'conversation_obsoleted';

export type SavedTranslationPathMessage = {
  readonly message: Message;
  readonly obsoleted: boolean;
};

export async function saveTranslationPathMessage(
  prisma: PrismaClient,
  messageData: MessageData,
): Promise<SavedTranslationPathMessage> {
  try {
    const existingConversation = await prisma.conversation.findFirst({
      where: { id: messageData.conversationId }
    });

    if (!existingConversation) {
      const conversationIdentifier = generateConversationIdentifier(`Conversation ${messageData.conversationId}`);

      await prisma.conversation.create({
        data: {
          ...(await implicitConversationRegime(prisma, { enabledBy: messageData.senderId ?? 'system', conversationId: messageData.conversationId })),
          id: messageData.conversationId,
          identifier: conversationIdentifier,
          title: `Conversation ${messageData.conversationId}`,
          type: 'group',
          createdAt: new Date(),
          lastMessageAt: new Date()
        }
      });
    }

    const message = await prisma.message.create({
      data: {
        conversationId: messageData.conversationId,
        senderId: messageData.senderId!,
        content: messageData.content,
        originalLanguage: messageData.originalLanguage,
        messageType: messageData.messageType || 'text',
        replyToId: messageData.replyToId || null,
        ...LIVE_MESSAGE_MARK
      }
    });

    // #14643 — second verrou de l'obsolescence, comme sur REST et socket :
    // dans une conversation obsolète, le message naît effacé, ne repousse
    // pas l'horloge de la liste et ne part pas au traducteur.
    if (await sealMessageIfConversationObsoleted(prisma, { conversationId: messageData.conversationId, messageId: message.id })) {
      logger.info('message sealed: conversation obsoleted while writing', { conversationId: messageData.conversationId, messageId: message.id });
      return { message, obsoleted: true };
    }

    await prisma.conversation.update({
      where: { id: messageData.conversationId },
      data: { lastMessageAt: new Date() }
    });

    // Flip gardé, séparé du bump ci-dessus — celui-ci doit rester
    // inconditionnel, il pilote l'ordre de liste/le curseur/le delta sync
    // pour TOUS les messages, pas seulement le premier. Ne concerne que les
    // DM créés vides (Prisme design doc 2026-08-04) ; `count` à 0 signifie
    // "pas le premier message" ou "conversation non concernée" — no-op.
    // Ce chemin crée le message HORS
    // `MessagingService.handleMessage` — ex: `POST /translate-blocking`
    // (cas nouveau message) — donc il porte sa propre copie du flip plutôt
    // que d'hériter de celui de `runMessagePostSaveEffects`.
    //
    // Isolé dans son propre try/catch, contrairement au reste de cette
    // fonction : le message ET le bump `lastMessageAt` ci-dessus ont DÉJÀ
    // committé avec succès à ce stade. Laisser une panne ici remonter au
    // catch englobant transformerait un envoi réussi en 500 côté route
    // (`POST /translate-blocking`) — exactement ce que le commentaire
    // jumeau de `runMessagePostSaveEffects.ts` interdit ("aucune ne doit
    // transformer un envoi réussi en 500").
    try {
      await prisma.conversation.updateMany({
        where: { id: messageData.conversationId, firstMessageSentAt: null },
        data: { firstMessageSentAt: new Date() }
      });
    } catch (flipError) {
      logger.error(`❌ Erreur flip firstMessageSentAt: ${flipError}`);
    }

    return { message, obsoleted: false };
  } catch (error) {
    logger.error(`❌ Erreur sauvegarde message: ${error}`);
    throw error;
  }
}
