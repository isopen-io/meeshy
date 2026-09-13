import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { enhancedLogger } from '../utils/logger-enhanced';
import { applyMessageRemovalEffects } from './messaging/messageRemovalEffects';

const logger = enhancedLogger.child({ module: 'AccountMessagePurgeService' });

/**
 * Borne le nombre de messages traités par tour de boucle — chaque message du
 * lot déclenche ensuite `applyMessageRemovalEffects` (quatre effets, dont un
 * recalcul de `lastMessageAt`) : un lot trop large en ferait un fan-out
 * inutilement large sur une seule passe.
 */
const BATCH_SIZE = 200;

/** Le seul contrat dont ce module a besoin d'un service d'attachments. */
export interface AttachmentPhysicalRemover {
  deleteAttachment(attachmentId: string): Promise<void>;
}

export type MessageAnonymizationSummary = {
  readonly messagesAnonymized: number;
  readonly attachmentsDeleted: number;
};

/**
 * Anonymise, pour un compte supprimé (#3632, suite de #5689), chaque message
 * encore VIVANT qu'il a envoyé — reprend EXACTEMENT la sémantique déjà en
 * place pour « supprimer un message pour tout le monde »
 * (`routes/messages-writes.ts` : `translations: null` + `deletedAt`, jamais
 * un effacement de `content` — les clients gatent le rendu sur `deletedAt`).
 * Ce n'est pas une nouvelle sémantique de suppression, c'est la même,
 * appliquée en lot à un compte entier.
 *
 * `Message.senderId` référence un `Participant.id`, PAS un `User.id`
 * (cf. `services/gateway/CLAUDE.md` § authentification unifiée) — les
 * messages du compte se résolvent donc via ses lignes `Participant`.
 *
 * Chaque message vivant a ses pièces jointes supprimées PHYSIQUEMENT
 * (`attachmentRemover.deleteAttachment`, AVANT la mutation — même ordre que
 * `routes/messages-writes.ts`) puis reçoit les mêmes effets qu'une
 * suppression individuelle (`applyMessageRemovalEffects` : décompte des
 * statistiques de conversation, retrait des notifications, désactivation des
 * liens de partage `/l/<token>`, recalcul de `lastMessageAt`) — site UNIQUE
 * du dépôt pour ces quatre effets, jamais réimplémenté ici.
 *
 * Drainé par lots BORNÉS : chaque lot relit les messages encore
 * `deletedAt: null` de ce compte, donc un lot déjà traité ne peut jamais être
 * relu — la boucle termine par construction, sans `skip`.
 *
 * Volontairement HORS DE PORTÉE : les posts/commentaires de l'auteur (le
 * critère de fin de #3632 nomme les messages, pas les posts) et
 * `Participant.displayName` (copie dénormalisée par conversation — question
 * ouverte partagée avec #5691, non tranchée ici).
 */
export async function anonymizeAccountMessages(
  prisma: PrismaClient,
  attachmentRemover: AttachmentPhysicalRemover,
  userId: string
): Promise<MessageAnonymizationSummary> {
  const participants = await prisma.participant.findMany({
    where: { userId },
    select: { id: true },
  });
  const participantIds = participants.map((p) => p.id);

  let messagesAnonymized = 0;
  let attachmentsDeleted = 0;

  if (participantIds.length === 0) {
    return { messagesAnonymized, attachmentsDeleted };
  }

  for (;;) {
    const batch = await prisma.message.findMany({
      where: { senderId: { in: participantIds }, deletedAt: null },
      select: {
        id: true,
        conversationId: true,
        senderId: true,
        messageType: true,
        content: true,
        metadata: true,
        attachments: { select: { id: true, mimeType: true } },
      },
      take: BATCH_SIZE,
    });

    if (batch.length === 0) break;

    for (const message of batch) {
      for (const attachment of message.attachments) {
        try {
          await attachmentRemover.deleteAttachment(attachment.id);
          attachmentsDeleted++;
        } catch (error) {
          logger.warn(`[MessagePurge] suppression attachment échouée id=${attachment.id}`, error as Error);
        }
      }
    }

    await prisma.message.updateMany({
      where: { id: { in: batch.map((m) => m.id) } },
      data: { translations: null, deletedAt: new Date() },
    });
    messagesAnonymized += batch.length;

    for (const message of batch) {
      try {
        await applyMessageRemovalEffects(prisma, {
          id: message.id,
          conversationId: message.conversationId,
          senderId: message.senderId,
          senderUserId: userId,
          messageType: message.messageType,
          attachmentMimeTypes: message.attachments.map((a) => a.mimeType ?? ''),
          content: message.content,
          metadata: message.metadata,
        });
      } catch (error) {
        logger.warn(`[MessagePurge] effets de retrait échoués message=${message.id}`, error as Error);
      }
    }

    if (batch.length < BATCH_SIZE) break;
  }

  logger.info(`[MessagePurge] user=${userId} messages=${messagesAnonymized} attachments=${attachmentsDeleted}`);

  return { messagesAnonymized, attachmentsDeleted };
}
