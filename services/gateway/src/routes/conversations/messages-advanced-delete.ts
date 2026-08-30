/**
 * Suppression d'un message — `DELETE /conversations/:id/messages/:messageId`.
 *
 * Fichier extrait de `messages-advanced.ts` (issue #4284, découpage par
 * responsabilité — aucun changement de comportement). Point d'entrée :
 * `messages-advanced.ts`.
 */
import { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AttachmentService } from '../../services/attachments';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { conversationStatsMetaSchema } from './messages-advanced-shared';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { admitMessageDelete } from '../../services/messaging/messageDeleteAdmission';
import { applyMessageRemovalEffects } from '../../services/messaging/messageRemovalEffects';
import { broadcastMessageMutation } from '../../socketio/broadcastMessageMutation';
import type { ConversationParams } from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';

// Logger dédié pour messages-advanced
const logger = enhancedLogger.child({ module: 'messages-advanced' });

/** Dépendances construites une seule fois par `registerMessagesAdvancedRoutes`. */
type DeleteRouteDeps = {
  socketIOHandler: FastifyInstance['socketIOHandler'];
  attachmentService: AttachmentService;
};

/**
 * `DELETE /conversations/:id/messages/:messageId` — suppression douce d'un
 * message (marque `deletedAt`, ne purge pas la ligne).
 */
export function registerDeleteMessageRoute(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any,
  { socketIOHandler, attachmentService }: DeleteRouteDeps
) {
  fastify.delete<{
    Params: ConversationParams & { messageId: string };
  }>('/conversations/:id/messages/:messageId', {
    schema: {
      description: 'Delete a message from a conversation (soft delete - marks as deleted)',
      tags: ['conversations', 'messages'],
      summary: 'Delete message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to delete' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              // Le `message` déclaré ici — une STRING — n'a jamais été servi :
              // le handler acquitte `{messageId, deleted, meta}`. Aucune clé ne
              // matchait, donc `data` sortait VIDE, et le client n'apprenait
              // même pas que la suppression avait eu lieu.
              properties: {
                messageId: { type: 'string', description: 'ID of the deleted message' },
                deleted: { type: 'boolean', description: 'Always true on success', example: true },
                meta: conversationStatsMetaSchema
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id, messageId } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Vérifier que le message existe
      const existingMessage = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          deletedAt: null
        },
        include: {
          sender: {
            select: { id: true, userId: true }
          },
          attachments: {
            select: { id: true, mimeType: true }
          }
        }
      });

      if (!existingMessage) {
        return sendNotFound(reply, 'Message not found');
      }

      // Qui peut supprimer : `admitMessageDelete`, l'unique énoncé de la règle.
      // Cette copie-ci lisait `membership.user.role` — le rôle GLOBAL — alors
      // que le commentaire qu'elle portait annonçait « les modérateurs/admins de
      // CETTE conversation ». Un admin de conversation qui n'est qu'un `USER`
      // global supprimait donc depuis Android et depuis le composer web, et
      // recevait 403 ici : c'est-à-dire depuis iOS et depuis la vue web, les
      // deux clients qui passent par cette route.
      const { admitted: canDelete } = await admitMessageDelete({
        prisma,
        deleterUserId: userId,
        message: {
          authorUserId: existingMessage.sender?.userId,
          conversationId,
        },
        onError: (err) => logger.error('[CONVERSATIONS] delete admission read failed', err),
      });

      if (!canDelete) {
        return sendForbidden(reply, 'Vous n\'êtes pas autorisé à supprimer ce message');
      }

      // Supprimer les attachments et leurs fichiers physiques
      if (existingMessage.attachments && existingMessage.attachments.length > 0) {
        for (const attachment of existingMessage.attachments) {
          try {
            await attachmentService.deleteAttachment(attachment.id);
          } catch (error) {
            logger.error(`❌ [CONVERSATIONS] Erreur lors de la suppression de l'attachment ${attachment.id}:`, error);
            // Continuer même en cas d'erreur pour supprimer les autres
          }
        }
      }

      // UNE écriture, et c'est le même argument que la ROUTE D'ÉDITION de ce
      // fichier porte trois cents lignes plus haut — « `translations: null`
      // appartient à CETTE écriture ». La famille d'édition a été balayée en
      // entier ; celle de suppression est restée coupée en deux.
      //
      // Séparées, elles ouvraient une fenêtre où la ligne est VIVANTE et
      // dépouillée de ses traductions. Deux prix, et le second est le vrai :
      //
      //   • pendant la fenêtre, tout lecteur d'une autre langue retombe sur
      //     l'original — le Prisme rompu le temps d'un aller-retour ;
      //   • si la SECONDE écriture échoue, cet état est DÉFINITIF. Le message
      //     reste vivant, sans aucune traduction, et rien ne les recalcule :
      //     `MessageTranslationService` le dit de lui-même — « la traduction
      //     correcte était perdue DÉFINITIVEMENT : aucun chemin ne retente une
      //     traduction absente ».
      //
      // L'ordre choisi faisait donc échouer du MAUVAIS côté : l'écriture
      // destructrice committait la première, celle qui la rend inoffensive
      // ensuite. Le dépôt raisonne partout dans l'autre sens (« Échouer ICI
      // laisse le lien ACTIF : c'est le sens sûr »). Fusionner supprime la
      // question plutôt que de choisir un ordre.
      //
      // Elle ferme aussi une course avec l'édition : la garde optimiste de
      // l'édition (`where: { id, deletedAt: null }`) voyait `deletedAt` encore
      // nul dans la fenêtre, acceptait donc l'édition, répondait succès et
      // diffusait `message:edited` — pour une ligne que la seconde écriture
      // effaçait juste après.
      //
      // Forme reprise du handler socket, qui la porte déjà et l'annonce :
      // « Soft delete: atomically clear translations and set deletedAt in one
      // write ».
      await prisma.message.update({
        where: { id: messageId },
        data: { translations: null, deletedAt: new Date() }
      });

      // Les effets DURABLES du retrait — recalcul de `lastMessageAt` et
      // désactivation des `/l/<token>` que ce message emporte. Cette route ne
      // recalculait PAS `lastMessageAt`, alors que les deux autres chemins de
      // suppression le faisaient mot pour mot : supprimer le dernier message
      // depuis iOS ou depuis la vue web — les deux clients qui passent par ici
      // — laissait la liste des conversations triée sur un message devenu
      // invisible. La liste vit désormais dans `applyMessageRemovalEffects`.
      // Le décompte des compteurs a rejoint cette même unité. Il ne vivait
      // qu'ICI, alors que le COMPTAGE ne vivait que dans le handler socket :
      // un message envoyé par REST puis supprimé depuis iOS décrémentait un
      // compteur qu'il n'avait jamais incrémenté.
      await applyMessageRemovalEffects(prisma, {
        id: messageId,
        conversationId,
        senderId: existingMessage.senderId,
        senderUserId: existingMessage.sender?.userId ?? null,
        messageType: existingMessage.messageType,
        attachmentMimeTypes: (existingMessage.attachments ?? []).map((att) => att.mimeType ?? ''),
        content: existingMessage.content,
        metadata: existingMessage.metadata,
      });

      // Invalider et recalculer les stats
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        conversationId,
        () => []
      );

      // Diffuser la suppression via Socket.IO (room + aperçu de liste + file
      // de livraison hors ligne — voir broadcastMessageMutation)
      await broadcastMessageMutation({
        prisma,
        manager: socketIOHandler?.getManager(),
        conversationId,
        actorUserId: userId,
        eventType: 'deleted',
        // L'AUTEUR, pas l'acteur : la pastille de l'acteur bouge aussi quand un
        // modérateur retire le message de quelqu'un d'autre.
        authorId: existingMessage.senderId,
        messageId,
        payload: { messageId, conversationId },
        onError: (err) => logger.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO', err),
      });

      return sendSuccess(reply, { messageId, deleted: true, meta: { conversationStats: stats } });

    } catch (error) {
      logger.error('Error deleting message', error);
      sendInternalError(reply, 'Erreur lors de la suppression du message');
    }
  });

  // NOTE: ancienne route /conversations/create-link supprimée (remplacée par /links)


}
