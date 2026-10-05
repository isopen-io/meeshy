/**
 * GET /admin/conversations/:conversationId/participants — les membres d'une
 * conversation, paginés (modale des membres de la fiche d'administration).
 * Seuil `canViewUsers` ; la présence n'est servie qu'à `canViewPresence`.
 *
 * Extrait de `admin/users.ts`, qui avait franchi le budget de taille des
 * fichiers de routes (`route-file-size-budget.test.ts`, < 1000 lignes).
 *
 * ## `removedByAdmin`
 *
 * Le modèle `Participant` dit QUAND un membre est sorti (`leftAt`), pas QUI
 * l'a fait sortir. Le geste d'administration
 * (`conversation-settings-sovereign.ts`, `…/participants/:userId/remove`) est
 * tracé dans `AdminAuditLog` (`ADMIN_CONVERSATION_MEMBER_REMOVED`, entité
 * `Conversation`, `userId` du retiré). Le champ se calcule depuis ce journal,
 * en UNE requête groupée pour la page entière : pour chaque membre sorti, la
 * dernière trace de retrait. Il est vrai quand cette trace est postérieure
 * (ou égale) à son départ — un membre retiré, revenu puis parti de lui-même
 * a une trace ANTÉRIEURE à son `leftAt`, et n'est pas dit retiré.
 */
import type { FastifyInstance } from 'fastify';
import type { UserRoleEnum } from '@meeshy/shared/types';
import { permissionsService } from '../../services/admin/permissions.service';
import type { UnifiedAuthContext, UnifiedAuthRequest } from '../../middleware/auth';
import { requireUserViewAccess } from '../../middleware/admin-user-auth.middleware';
import { validatePagination } from '../../utils/pagination';
import { sendInternalError, sendNotFound, sendPaginatedSuccess } from '../../utils/response';
import { logError } from '../../utils/logger.js';

/** L'action que `withAudit` écrit au retrait d'un membre par l'administration. */
export const ADMIN_MEMBER_REMOVAL_ACTION = 'ADMIN_CONVERSATION_MEMBER_REMOVED';

type LeftMember = { readonly userId: string | null; readonly isActive: boolean; readonly leftAt: Date | string | null };

/**
 * Les `userId` de la page qu'un administrateur a fait sortir — une requête
 * `groupBy` (aucune quand personne n'est sorti).
 */
async function membersRemovedByAdmin(
  fastify: FastifyInstance,
  conversationId: string,
  participants: readonly LeftMember[]
): Promise<ReadonlySet<string>> {
  const left = participants.filter((p) => !p.isActive && p.userId && p.leftAt);
  if (left.length === 0) return new Set();

  const removals = await fastify.prisma.adminAuditLog.groupBy({
    by: ['userId'],
    where: {
      action: ADMIN_MEMBER_REMOVAL_ACTION,
      entity: 'Conversation',
      entityId: conversationId,
      userId: { in: [...new Set(left.map((p) => p.userId as string))] },
    },
    _max: { createdAt: true },
  });
  const lastRemoval = new Map(
    removals.map((r) => [r.userId, r._max.createdAt ? new Date(r._max.createdAt).getTime() : null])
  );

  return new Set(
    left
      .filter((p) => {
        const removedAt = lastRemoval.get(p.userId as string);
        return removedAt != null && removedAt >= new Date(p.leftAt as Date | string).getTime();
      })
      .map((p) => p.userId as string)
  );
}

export function registerConversationParticipantsRoute(fastify: FastifyInstance): void {
  fastify.get<{
    Params: { conversationId: string };
    Querystring: { offset?: string; limit?: string };
  }>('/admin/conversations/:conversationId/participants', {
    preHandler: [fastify.authenticate, requireUserViewAccess]
  }, async (request, reply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext as UnifiedAuthContext;
      const viewerRole = authContext.registeredUser!.role as UserRoleEnum;
      // Directive produit 2026-08-25 : `requireUserViewAccess` laisse passer
      // MODERATOR/AUDIT (canViewUsers), qui n'ont plus le droit de voir la
      // présence — seuil `canViewPresence` (ADMIN/BIGBOSS uniquement).
      const canSeePresence = permissionsService.canViewPresence(viewerRole);

      const { conversationId } = request.params;
      const { offset = '0', limit } = request.query;
      const { offset: offsetNum, limit: limitNum } = validatePagination(offset, limit, { defaultLimit: 30, maxLimit: 100 });

      const conversation = await fastify.prisma.conversation.findUnique({
        where: { id: conversationId },
        select: { id: true }
      });
      if (!conversation) {
        return sendNotFound(reply, 'Conversation non trouvée');
      }

      const where = { conversationId };
      const [participants, total] = await Promise.all([
        fastify.prisma.participant.findMany({
          where,
          select: {
            id: true,
            userId: true,
            type: true,
            displayName: true,
            avatar: true,
            role: true,
            isActive: true,
            isOnline: true,
            joinedAt: true, leftAt: true, bannedAt: true,
            nickname: true,
            user: { select: { id: true, username: true, displayName: true, avatar: true } }
          },
          orderBy: { joinedAt: 'asc' },
          skip: offsetNum,
          take: limitNum
        }),
        fastify.prisma.participant.count({ where })
      ]);

      const removedByAdmin = await membersRemovedByAdmin(fastify, conversation.id, participants);
      const data = participants.map((p) => ({
        ...p,
        isOnline: canSeePresence ? p.isOnline : false,
        removedByAdmin: p.userId != null && removedByAdmin.has(p.userId),
      }));

      return sendPaginatedSuccess(reply, data, {
        total,
        offset: offsetNum,
        limit: limitNum,
        hasMore: offsetNum + participants.length < total
      });
    } catch (error) {
      logError(fastify.log, 'Error fetching conversation participants', error);
      return sendInternalError(reply, 'Internal server error', { message: 'Failed to fetch conversation participants' });
    }
  });
}
