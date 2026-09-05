/**
 * La FERMETURE d'un lien de partage par l'administration de la plateforme
 * (#3734).
 *
 * ## Pourquoi cette porte existe alors que `DELETE /links/:linkId` existe
 *
 * Deux raisons MESURÉES — pas une préférence de rangement :
 *
 * 1. **La console ne détient pas la clé que l'autre route réclame.** Depuis
 *    #4157, `GET /admin/share-links` retire délibérément `linkId` de son
 *    `select` : le secret de jointure ne se distribue pas en liste, une ligne
 *    de liste n'a pas à porter de quoi rejoindre la conversation qu'elle
 *    énumère. La console n'a donc que `ConversationShareLink.id`, l'ObjectId
 *    OPAQUE sur lequel elle agit déjà. `DELETE /links/:linkId` prend le
 *    `mshy_*` PUBLIC. Elle est **inatteignable depuis la console par
 *    construction**, avant même toute question d'autorisation.
 * 2. **L'autre route pose la question de la CONVERSATION, celle-ci pose celle
 *    de la PLATEFORME.** `loadShareLinkForManagement` dérive son
 *    `isConversationAdmin` d'un `.some()` sur `conversation.participants` déjà
 *    filtré `where: { userId, isActive: true }` : un administrateur de
 *    plateforme ÉTRANGER à la conversation a une liste vide, donc `false`, donc
 *    **403** — voulu et écrit (`conversation-authority.ts` : « un
 *    administrateur de la plateforme étranger à la conversation reste
 *    étranger »). Cette route-ci n'interroge donc AUCUN rang de conversation :
 *    ce serait rejouer une loi qui a déjà sa source unique, et pour répondre à
 *    une autre question que la sienne.
 *
 * ## Le seuil
 *
 * `requireAdmin = requirePermission('canAccessAdmin')` admet BIGBOSS, ADMIN,
 * MODERATOR **et AUDIT** : ce n'est pas « ADMIN+ », quel que soit son nom. La
 * loi de CETTE ressource est `canManageConversations` — exactement celle que
 * `GET /admin/share-links` applique déjà dans son corps — soit BIGBOSS, ADMIN,
 * MODERATOR. Le choix est symétrique de la liste, et c'est la raison :
 *
 * > Une porte plus ÉTROITE que la liste montre à un modérateur des lignes sur
 * > lesquelles il ne peut pas agir ; une porte plus LARGE laisse AUDIT — rôle
 * > de lecture — fermer les liens de la plateforme. La porte d'un geste se
 * > calque sur la porte de la liste qu'il amende.
 *
 * ## Ce que le geste fait, et ne fait pas
 *
 * FERMETURE DOUCE, comme `DELETE /links/:linkId` depuis #4170 : la ligne
 * survit, seul `isActive` bascule. Deux portes sur une même ressource doivent
 * rendre le même état — une console qui DÉTRUIRAIT la ligne pendant que la
 * porte membre la conserve ferait dépendre l'historique (`currentUses`, les
 * agrégats de `GET /links?include=summary`) de QUI a cliqué.
 *
 * Les invités sont révoqués AVANT la fermeture, dans cet ordre et pas l'autre :
 * `Participant.shareLinkId` est une colonne NUE — aucune relation Prisma, donc
 * aucune cascade. Révoquer d'abord fait échouer FERMÉ (si la révocation lève,
 * le lien reste actif et la reprise est idempotente) ; l'ordre inverse laisse
 * un état où le lien est fermé et ses invités toujours connectés.
 *
 * La trace d'audit est écrite APRÈS la fermeture réussie, jamais avant :
 * `withAudit` est best-effort et ne doit pas conditionner un geste qui a déjà
 * eu lieu.
 *
 * ## Note de rangement
 *
 * `GET /admin/share-links` et `POST /admin/share-links/:id/reveal` vivent dans
 * `admin/content-share-links.ts`, enregistré via `admin/content.ts`. Ce module
 * est enregistré directement sous le même préfixe : le chemin servi est le
 * même, la ressource est la même. Les réunir dans un seul module est
 * souhaitable et reste à faire.
 */
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { permissionsService } from './services/PermissionsService';
import { type UserRole } from './types';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { requirePermission, withAudit } from '../../middleware/authorize';
import { revokeShareLinkGuests } from '../../socketio/revokeShareLinkGuests';

const requireAdmin = requirePermission('canAccessAdmin');

export function registerAdminShareLinkRoutes(fastify: FastifyInstance): void {

  fastify.delete('/share-links/:id', {
    onRequest: [fastify.authenticate, requireAdmin],
    schema: {
      description:
        'Close a conversation share link from the platform administration console (soft-close: the row survives, only isActive flips to false). Requires canManageConversations. Immediately revokes every anonymous guest who joined through this link. Takes the opaque ObjectId served by GET /admin/share-links — never the public mshy_* secret, which that list deliberately withholds (#4157).',
      tags: ['admin'],
      summary: 'Close a share link (admin, soft-close)',
      security: [{ bearerAuth: [] }],
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'ConversationShareLink.id (ObjectId), as served by GET /admin/share-links' }
        }
      },
      response: {
        // fast-json-stringify ÉJECTE toute clé non déclarée : `id` et
        // `isActive` sont nommés parce que la console relit l'état qu'elle
        // vient de poser, et un `data: {}` la laisserait sans preuve.
        200: {
          description: 'Share link closed',
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                id: { type: 'string' },
                isActive: { type: 'boolean', example: false }
              }
            },
            message: { type: 'string', example: 'Lien fermé avec succès' }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    }
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const authContext = (request as UnifiedAuthRequest).authContext;
      const actor = authContext.registeredUser;
      const permissions = permissionsService.getUserPermissions(actor.role as UserRole);

      if (!permissions.canManageConversations) {
        return sendForbidden(reply, 'Permission insuffisante pour gerer les liens de partage');
      }

      const { id } = request.params as { id: string };

      const shareLink = await fastify.prisma.conversationShareLink.findUnique({
        where: { id },
        select: { id: true, isActive: true }
      });

      if (!shareLink) {
        return sendNotFound(reply, 'Lien de partage non trouvé');
      }

      await revokeShareLinkGuests({
        prisma: fastify.prisma,
        io: fastify.socketIOHandler?.getManager()?.getIO(),
        manager: fastify.socketIOHandler?.getManager(),
        shareLinkId: shareLink.id,
      });

      await fastify.prisma.conversationShareLink.update({
        where: { id: shareLink.id },
        data: { isActive: false }
      });

      await withAudit(request, {
        action: 'ADMIN_SHARE_LINK_CLOSED',
        entity: 'ConversationShareLink',
        entityId: shareLink.id,
        userId: actor.id,
      });

      return sendSuccess(
        reply,
        { id: shareLink.id, isActive: false },
        { message: 'Lien fermé avec succès' }
      );
    } catch (error) {
      logError(fastify.log, 'Close admin share link error:', error);
      return sendInternalError(reply, 'Erreur interne du serveur');
    }
  });
}
