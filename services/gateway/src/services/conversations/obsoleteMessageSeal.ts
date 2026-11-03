/**
 * #14643 — le second verrou de la course entre l'obsolescence et un envoi.
 *
 * Un site qui vient d'ÉCRIRE un message relit `Conversation.deletedAt` (posé
 * par la seule obsolescence) : s'il est posé, le message naît effacé, et
 * l'appelant ne le diffuse pas. Le premier verrou, le rejeu de l'effacement
 * après la transaction, est dans `obsoleteConversation.ts`.
 */
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { unsetOrNull } from '../../utils/prisma-unset';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'ObsoleteMessageSeal' });

export type ObsoleteMessageSealPrisma = {
  readonly conversation: Pick<PrismaClient['conversation'], 'findUnique'>;
  readonly message: Pick<PrismaClient['message'], 'updateMany'>;
};

/**
 * Rend `true` si la conversation est obsolète : le message est alors effacé, et
 * ne doit partir nulle part. Ne rejette jamais : une relecture en échec rend
 * `false` (le message est déjà écrit, et le rejeu de l'obsolescence reste le
 * premier verrou).
 */
export async function sealMessageIfConversationObsoleted(
  prisma: ObsoleteMessageSealPrisma,
  params: { readonly conversationId: string; readonly messageId: string },
): Promise<boolean> {
  try {
    return await seal(prisma, params);
  } catch (error) {
    logger.warn('obsolescence not re-read after a message write', {
      conversationId: params.conversationId,
      messageId: params.messageId,
      error: error instanceof Error ? error.message : String(error),
    });
    return false;
  }
}

async function seal(
  prisma: ObsoleteMessageSealPrisma,
  params: { readonly conversationId: string; readonly messageId: string },
): Promise<boolean> {
  const conversation = await prisma.conversation.findUnique({
    where: { id: params.conversationId },
    select: { deletedAt: true },
  });
  if (!conversation?.deletedAt) return false;
  await prisma.message.updateMany({
    where: { id: params.messageId, ...unsetOrNull('deletedAt') },
    data: { deletedAt: conversation.deletedAt },
  });
  return true;
}
