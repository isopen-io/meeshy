import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Vérifie si un utilisateur peut accéder à une conversation via le modèle Participant unifié
 */
export async function canAccessConversation(
  prisma: PrismaClient,
  authContext: any,
  conversationId: string,
  conversationIdentifier: string
): Promise<boolean> {
  if (!authContext.isAuthenticated) {
    return false;
  }

  // Cas spécial : conversation globale "meeshy"
  if (conversationIdentifier === "meeshy" || conversationId === "meeshy") {
    if (authContext.isAnonymous) {
      return false;
    }

    const participant = await prisma.participant.findFirst({
      where: {
        conversationId: conversationId,
        userId: authContext.userId,
        isActive: true
      }
    });

    return !!participant;
  }

  // Participant unifié : une seule requête pour tous les types
  if (authContext.participantId) {
    const participant = await prisma.participant.findFirst({
      where: {
        id: authContext.participantId,
        conversationId: conversationId,
        isActive: true,
        bannedAt: null
      }
    });
    return !!participant;
  }

  // Fallback: rechercher par userId (registered users)
  if (!authContext.isAnonymous && authContext.userId) {
    if (conversationIdentifier.startsWith('mshy_')) {
      const conversation = await prisma.conversation.findFirst({
        where: {
          OR: [
            { id: conversationId },
            { identifier: conversationIdentifier }
          ]
        }
      });

      if (!conversation) {
        return false;
      }

      const participant = await prisma.participant.findFirst({
        where: {
          conversationId: conversation.id,
          userId: authContext.userId,
          isActive: true
        }
      });
      return !!participant;
    }

    const participant = await prisma.participant.findFirst({
      where: {
        conversationId: conversationId,
        userId: authContext.userId,
        isActive: true
      }
    });
    return !!participant;
  }

  return false;
}
