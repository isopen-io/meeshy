import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

import { UnifiedAuthRequest } from '../../middleware/auth';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendInternalError, sendNotFound, sendForbidden, sendBadRequest } from '../../utils/response';
import { invalidateParticipantLookup } from '../../utils/participant-lookup-cache';
import { unsetOrNull } from '../../utils/prisma-unset';
import { SERVER_EVENTS, type ConversationRestoredEventData } from '@meeshy/shared/types/socketio-events';
import { broadcastToUser } from '../../utils/socket-broadcast';
import { announceConversationLanguageChange } from '../../services/message-translation/conversationLanguageChanges';
import { mayReturnToSalon } from '../../services/conversations/communityMembershipSync';
import { rejoinRestoredMembership } from './utils/rejoin-restored-membership';

const logger = enhancedLogger.child({ module: 'ConversationRestoreForMe' });

function refuseBannedRestore(reply: FastifyReply): void {
  return sendForbidden(reply, 'You are banned from this conversation', { code: 'BANNED' });
}

/**
 * **Le NOYAU du geste « restaurer cette conversation pour moi »** — jumeau
 * exact de `performConversationDeleteForMe` (`delete-for-me.ts`), qui porte
 * l'autre moitié.
 *
 * Extrait de `routes/user-deletions.ts` par #16964, et pour la raison que le
 * dépôt impose : ce fichier était à 999 lignes, soit le seuil au-delà duquel
 * un découpage se justifie sans se discuter, et « ajouter à un fichier déjà
 * hors budget est interdit — on extrait d'abord, on ajoute ensuite ». Le geste
 * est le même, à la jonction de room près.
 *
 * Les quatre refus, dans cet ordre, et chacun pour sa raison :
 * ligne non supprimée · banni (#10436) · conversation CLOSE (un geste
 * personnel ne rouvre jamais un fil que la route canonique a fermé pour tout
 * le monde) · salon dont l'appelant n'est plus membre.
 */
export async function restoreConversationForMe(
  ctx: { readonly fastify: FastifyInstance; readonly prisma: PrismaClient },
  request: FastifyRequest<{ Params: { conversationId: string } }>,
  reply: FastifyReply,
): Promise<unknown> {
  const { fastify, prisma } = ctx;
    try {
      const { conversationId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      const participant = await prisma.participant.findFirst({
        where: { conversationId, userId },
        select: {
          id: true,
          deletedForMe: true,
          bannedAt: true,
          language: true,
          conversation: { select: { isActive: true, communityId: true } },
        },
      });

      if (!participant || !participant.deletedForMe) {
        return sendBadRequest(reply, 'Conversation is not deleted');
      }

      // #10436 — un banni ne se restaure pas. Supprimer pour soi désactive la
      // ligne ; un bannissement posé ENSUITE n'écrit que `bannedAt`
      // (`resolveBanWrite`, la ligne étant déjà inactive). Rallumer
      // `isActive` ici rendait la ligne active ET bannie, lue comme vivante
      // par toute lecture `userId + isActive: true` (liste, envoi, push).
      // Même refus que l'entrée par lien (`linkAdmission.ts`, code BANNED).
      if (participant.bannedAt) {
        return refuseBannedRestore(reply);
      }

      // Restaurer un participant dont la conversation a été CLOSE (dernier
      // membre parti, ou DM vide clos — les deux branches de
      // `performConversationDeleteForMe`) rouvrirait pour tout le monde un
      // fil que la route canonique a fermé délibérément : un geste
      // personnel ne doit jamais avoir un effet collectif. La conversation
      // reste irrécupérable par ce chemin — seule une action
      // d'administration distincte peut rouvrir une conversation fermée.
      if (!participant.conversation.isActive) {
        return sendBadRequest(reply, 'Conversation is closed and cannot be restored');
      }

      if (!(await mayReturnToSalon(prisma, { communityId: participant.conversation.communityId, userId }))) return sendForbidden(reply, 'Only members of this community can return to its conversations', { code: 'COMMUNITY_MEMBERS_ONLY' });

      // La garde est AUSSI dans le `where` : un bannissement tombé entre la
      // lecture ci-dessus et cette écriture ne doit pas être rallumé. La
      // ligne ne s'apparie plus, Prisma lève P2025, et la route refuse.
      // #10443 — P2025 dit seulement « plus d'appariement » : bannie, OU
      // disparue. La route relit la ligne pour rendre la vraie cause.
      try {
        await prisma.participant.update({
          where: { id: participant.id, ...unsetOrNull('bannedAt') },
          data: { deletedForMe: null, isActive: true },
        });
      } catch (error) {
        if ((error as { code?: unknown } | null)?.code === 'P2025') {
          const current = await prisma.participant.findFirst({
            where: { id: participant.id },
            select: { bannedAt: true },
          });
          if (current?.bannedAt) return refuseBannedRestore(reply);
          return sendNotFound(reply, 'Participation not found', { code: 'NOT_FOUND' });
        }
        throw error;
      }
      // Miroir exact du DELETE ci-dessus : sans cette invalidation, le
      // cache de lookup continuerait de répondre "inactif" pour CE
      // participant jusqu'à l'expiration de son TTL, alors que la ligne
      // vient d'être réactivée.
      invalidateParticipantLookup(participant.id, conversationId);
      announceConversationLanguageChange({ kind: 'arrival', conversationId, language: participant.language, readerUserId: userId });

      // #4344 — jumeau de l'émission `CONVERSATION_DELETED` que
      // `performConversationDeleteForMe` diffuse après SA persistance
      // (`conversations/delete-for-me.ts`) : sans elle, restaurer une
      // conversation sur UN appareil ne l'annonçait à AUCUN autre — la ligne
      // `Participant` venait d'être réactivée en base, mais rien ne le
      // disait aux autres sessions du même utilisateur. Diffusée sur SA
      // SEULE room personnelle (`ROOMS.user`, via `broadcastToUser`),
      // jamais celle de la conversation : c'est un fait PERSONNEL (ce que
      // CE participant voit), symétrique à `CONVERSATION_DELETED`, pas un
      // fait partagé par le fil — aucun autre membre n'a besoin de le
      // savoir, la conversation ne les a jamais quittés. Émise APRÈS la
      // persistance et son invalidation de cache ci-dessus, jamais avant :
      // une annonce ne précède pas la durabilité du fait qu'elle annonce
      // (même discipline que `delete-for-me.ts`). `broadcastToUser` est la
      // porte typée (`socketio/serverEmit.ts`) qu'emprunte déjà sa jumelle
      // `restoreMessageForUser` (`services/personalMessageVisibilitySync.ts`)
      // pour le même verbe côté message — jamais un `Server` nu de
      // socket.io, et jamais un échec de diffusion ne fait échouer cette
      // route (best-effort, comme documenté sur `broadcastToUser`).
      // #16964 — l'inverse exact de l'éviction que `delete-for-me` a
      // faite, appelé APRÈS une restauration effective et AVANT la
      // diffusion. Les deux règles et ce que coûtait l'oubli :
      // `utils/rejoin-restored-membership.ts`.
      await rejoinRestoredMembership(fastify, { roomKey: userId, conversationId });

      const restoredPayload: ConversationRestoredEventData = { userId, conversationId };
      broadcastToUser(fastify, userId, SERVER_EVENTS.CONVERSATION_RESTORED, restoredPayload);

      logger.info('Conversation restored', { conversationId });

      return sendSuccess(reply, { message: 'Conversation restored' });
    } catch (error) {
      logger.error('Error restoring conversation for user', error as Error);
      return sendInternalError(reply, 'Internal server error');
    }
}
