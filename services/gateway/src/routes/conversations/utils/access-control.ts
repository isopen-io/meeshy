import type { PrismaClient } from '@meeshy/shared/prisma/client';

/**
 * Vérifie si un utilisateur peut accéder à une conversation
 * @param prisma - Instance Prisma
 * @param authContext - Contexte d'authentification
 * @param conversationId - ID de la conversation
 * @param conversationIdentifier - Identifiant de la conversation (peut avoir le préfixe mshy_)
 * @returns Promise<boolean>
 */
export async function canAccessConversation(
  prisma: PrismaClient,
  authContext: any,
  conversationId: string,
  conversationIdentifier: string
): Promise<boolean> {
  // Si l'utilisateur n'est pas authentifié (pas de session token, pas de JWT token), aucun accès
  if (!authContext.isAuthenticated) {
    return false;
  }

  // Cas spécial : conversation globale "meeshy" - vérifier l'appartenance
  if (conversationIdentifier === "meeshy" || conversationId === "meeshy") {
    // Pour la conversation meeshy, vérifier que l'utilisateur est membre
    if (authContext.isAnonymous) {
      // Les utilisateurs anonymes n'ont pas accès à la conversation globale meeshy
      return false;
    } else {
      // Vérifier l'appartenance à la conversation meeshy
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: authContext.userId,
          isActive: true
        }
      });

      return !!membership;
    }
  }

  if (authContext.isAnonymous) {
    // Utilisateurs anonymes authentifiés : vérifier l'accès via liens d'invitation
    // Le userId pour les anonymes est l'ID du participant anonyme
    const anonymousAccess = await prisma.anonymousParticipant.findFirst({
      where: {
        id: authContext.userId,
        isActive: true,
        conversationId: conversationId
      }
    });
    return !!anonymousAccess;
  } else {
    // Vérifier le préfixe mshy_ pour les identifiants de conversation
    if (conversationIdentifier.startsWith('mshy_')) {
      // Identifiant avec préfixe mshy_ - résoudre l'ID réel
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
      } else {
        // Vérifier l'appartenance à la conversation
        const membership = await prisma.conversationMember.findFirst({
          where: {
            conversationId: conversation.id,
            userId: authContext.userId,
            isActive: true
          }
        });
        return !!membership;
      }
    } else {
      // Identifiant direct - vérifier l'appartenance à la conversation
      const membership = await prisma.conversationMember.findFirst({
        where: {
          conversationId: conversationId,
          userId: authContext.userId,
          isActive: true
        }
      });
      return !!membership;
    }
  }
}
