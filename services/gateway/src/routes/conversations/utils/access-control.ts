import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { unsetOrNull } from '../../../utils/prisma-unset';

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
  //
  // `bannedAt: null` fermait cette porte à TOUT LE MONDE : aucun des créateurs de
  // `Participant` n'écrit la colonne, elle est donc absente du document de tout
  // participant jamais banni, et l'égalité à `null` n'appariait que les rares
  // lignes qu'un débannissement avait remises à zéro (`resolveUnbanWrite`). Les
  // anonymes venus par lien de partage — les seuls à porter un `participantId`
  // dans leur contexte d'auth — se voyaient refuser l'accès à leur propre
  // conversation. Voir `utils/prisma-unset.ts`.
  //
  // La garde reste porteuse malgré `isActive: true` : un bannissement écrit bien
  // `isActive: false`, mais une restauration de compte rallume `isActive` sans
  // regarder `bannedAt` (`routes/me/delete-account.ts`).
  if (authContext.participantId) {
    const participant = await prisma.participant.findFirst({
      where: {
        id: authContext.participantId,
        conversationId: conversationId,
        isActive: true,
        ...unsetOrNull('bannedAt')
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
