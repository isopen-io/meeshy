import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { unsetOrNull } from '../../../utils/prisma-unset';

/**
 * The two identities an auth context can name a `Participant` row with.
 *
 * `userId` is NOT a `User.id` for everyone: the anonymous branch of
 * `UnifiedAuthService` sets `userId: participant.id` (middleware/auth.ts), so a
 * shared-link guest carries a **Participant.id** in the field every route reads
 * as a user id. That is why `participantId` exists alongside it, and why it wins
 * whenever it is present.
 */
export interface CallerParticipantIdentity {
  readonly userId?: string;
  readonly participantId?: string;
}

/**
 * The caller's `Participant` row in this conversation — the one query that must
 * never be written by hand again.
 *
 * `canAccessConversation` below has resolved anonymous callers by
 * `authContext.participantId` since the `bannedAt` fix, but every route that
 * needed the participant's **id** (read cursors are keyed by `Participant.id`,
 * never by `User.id`) re-derived it with a hand-written
 * `findFirst({ where: { conversationId, userId, isActive: true } })`. For a
 * shared-link guest that `userId` IS a `Participant.id`, so the filter compared
 * a participant id against the `userId` column and matched nothing: the route
 * passed access control and then answered 403 to a participant that exists.
 *
 * The whole read/unread REST surface was in that state, which is the half of the
 * unread badge nobody could see: the server counts unread messages for an
 * accountless participant (`getUnreadCount` resolves `id` OR `userId`) and
 * pushes the count to their personal room (`ROOMS.user(userId ?? id)`, joined by
 * `AuthHandler` for anonymous sockets) — but every route that could CLEAR the
 * count refused them. A shared-link guest's badge could only ever go up.
 *
 * Precedence mirrors `canAccessConversation` exactly — `participantId` first,
 * `userId` second — because the two answers must not disagree about who the
 * caller is. Registered contexts never carry `participantId` (see the `type:
 * 'user'` branch of `UnifiedAuthService`), so the order is unambiguous rather
 * than merely conventional.
 */
export async function resolveCallerParticipant(
  prisma: Pick<PrismaClient, 'participant'>,
  authContext: CallerParticipantIdentity | null | undefined,
  conversationId: string
): Promise<{ id: string; role: string } | null> {
  const participantId = authContext?.participantId;
  if (participantId) {
    return prisma.participant.findFirst({
      where: {
        id: participantId,
        conversationId,
        isActive: true,
        ...unsetOrNull('bannedAt')
      },
      select: { id: true, role: true }
    });
  }

  const userId = authContext?.userId;
  if (!userId) return null;

  return prisma.participant.findFirst({
    where: { conversationId, userId, isActive: true },
    select: { id: true, role: true }
  });
}

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
