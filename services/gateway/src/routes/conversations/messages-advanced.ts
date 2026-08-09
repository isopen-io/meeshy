import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { transformTranslationsToArray, type MessageTranslationJSON } from '../../utils/translation-transformer';
import { MessageTranslationService } from '../../services/message-translation/MessageTranslationService';
import { TrackingLinkService } from '../../services/TrackingLinkService';
import { AttachmentService } from '../../services/attachments';
import { conversationStatsService } from '../../services/ConversationStatsService';
import { conversationMessageStatsService } from '../../services/ConversationMessageStatsService';
import { ErrorCode } from '@meeshy/shared/types';
import { createError, sendErrorResponse } from '@meeshy/shared/utils/errors';
import { normalizeLanguageCode } from '@meeshy/shared/utils/language-normalize';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { messageValidationHook } from '../../middleware/rate-limiter';
import {
  messageSchema,
  errorResponseSchema
} from '@meeshy/shared/types/api-schemas';
import { canAccessConversation } from './utils/access-control';
import { reconcileEditedMentions } from '../../services/messaging/messageMentions';
import {
  reconcileEditedLinks,
  mergeTrackingLinksIntoMetadata,
} from '../../services/messaging/messageLinks';
import { admitMessageEdit, isEditRefused } from '../../services/messaging/messageEditAdmission';
import { admitMessageDelete } from '../../services/messaging/messageDeleteAdmission';
import { applyMessageRemovalEffects } from '../../services/messaging/messageRemovalEffects';
import {
  admitEditedContent,
  isEditedContentRefused,
  EMPTY_EDIT_REFUSAL_MESSAGE,
} from '../../services/messaging/messageEditContent';
import { emitMentionCreated } from '../../socketio/emitMentionCreated';
import { resolveConversationId } from '../../utils/conversation-id-cache';
import { broadcastMessageMutation } from '../../socketio/broadcastMessageMutation';
import { broadcastReactionMutation } from '../../socketio/broadcastReactionMutation';
import type {
  ConversationParams,
  EditMessageBody
} from './types';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendSuccess, sendBadRequest, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response';
import { z } from 'zod';
import { CommonSchemas } from '@meeshy/shared/utils/validation';

// Editing allows empty content (unlike sending): the message may carry
// attachments whose caption is being cleared. The attachment-aware emptiness
// check below is the single source of truth, in parity with the socket edit
// path (SocketMessageEditSchema + MessageHandler.handleMessageEdit).
const EditMessageBodySchema = z.object({
  content: z.string().max(10000, 'Message trop long'),
  originalLanguage: CommonSchemas.language.optional(),
});
// Logger dédié pour messages-advanced
const logger = enhancedLogger.child({ module: 'messages-advanced' });


/**
 * Enregistre les routes avancées de gestion des messages (edit, delete, reactions, status)
 */
export function registerMessagesAdvancedRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  translationService: MessageTranslationService,
  optionalAuth: any,
  requiredAuth: any
) {
  const socketIOHandler = fastify.socketIOHandler;
  const trackingLinkService = new TrackingLinkService(prisma);
  const attachmentService = new AttachmentService(prisma);

  fastify.put<{
    Params: ConversationParams & { messageId: string };
    Body: EditMessageBody;
  }>('/conversations/:id/messages/:messageId', {
    schema: {
      description: 'Edit an existing message in a conversation (only by message sender)',
      tags: ['conversations', 'messages'],
      summary: 'Edit message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to edit' }
        }
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Updated message content', minLength: 1 },
          originalLanguage: { type: 'string', description: 'Language code', default: 'fr' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'object', description: 'Updated message object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const bodyResult = EditMessageBodySchema.safeParse(request.body);
      if (!bodyResult.success) {
        return sendBadRequest(reply, 'Validation error', { message: bodyResult.error.message });
      }

      const { id, messageId } = request.params;
      const { content, originalLanguage: claimedLanguage } = bodyResult.data;
      // Canonicalise the client-claimed locale at the write boundary. This REST
      // edit path re-persists `originalLanguage` from the request body (unlike
      // the socket edit path, which reuses the already-canonical stored value),
      // so a raw platform locale (`fr-FR`, `en_US`) would otherwise fragment the
      // stored value + the retranslation source. Irreducible codes kept verbatim.
      //
      // Le champ est OPTIONNEL, et il l'était déjà avec un défaut `'fr'` : une
      // omission RÉÉTIQUETAIT donc le message en français — en base ET comme
      // langue source de la retraduction. Cette route est la seule des quatre
      // entrées d'édition à écrire cette colonne, parce qu'elle est la seule
      // servie par une vue qui porte un sélecteur de langue ; l'omettre veut
      // dire « je n'affirme rien sur la langue », pas « c'est du français ».
      const claimedCanonicalLanguage = claimedLanguage === undefined
        ? undefined
        : normalizeLanguageCode(claimedLanguage) ?? claimedLanguage;
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
          attachments: { select: { id: true } }
        }
      });

      if (!existingMessage) {
        return sendNotFound(reply, 'Message not found');
      }

      // L'unique énoncé de « qui peut éditer, et jusqu'à quand »
      // (`messageEditAdmission`). C'est cette route qui portait la règle la plus
      // complète — fenêtre de 24h pour l'auteur, privilège de rôle GLOBAL,
      // modérateur membre actif admis sur le message d'autrui — et c'est donc
      // elle que l'unité partagée reprend. Les trois autres entrées n'en
      // tenaient qu'une partie chacune, et pas la même.
      const admission = await admitMessageEdit({
        prisma,
        editorUserId: userId,
        message: {
          authorUserId: existingMessage.sender?.userId,
          conversationId,
          createdAt: existingMessage.createdAt,
        },
        onError: (err) => logger.error('Edit - admission lookup failed', err),
      });

      if (isEditRefused(admission)) {
        return admission.reason === 'edit-window-expired'
          ? sendForbidden(reply, 'You can no longer edit this message (24-hour limit exceeded)')
          : sendForbidden(reply, 'Vous n\'êtes pas autorisé à modifier ce message');
      }

      // Ce qu'une édition a le droit d'ÉCRIRE (`admitEditedContent`) : le
      // contenu vide n'est admis que si une pièce jointe porte le message
      // (retrait de légende). La règle vivait ici dépliée, en trois exemplaires
      // sur les quatre transports — dont un qui ne l'avait pas du tout.
      const editedContent = admitEditedContent({
        content,
        hasAttachments: (existingMessage.attachments?.length ?? 0) > 0,
      });

      if (isEditedContentRefused(editedContent)) {
        return sendBadRequest(reply, EMPTY_EDIT_REFUSAL_MESSAGE);
      }

      // Ce que ce message doit à ses LIENS, après édition. La réécriture
      // `[[url]]` / `<url>` → `m+<token>` vivait ici, dépliée — donc absente du
      // chemin socket, qui est pourtant le transport d'édition PRIMAIRE et
      // écrivait le texte brut. Et la seconde moitié, le mapping des URLs
      // BRUTES (`metadata.trackingLinks`), n'était recomposée par AUCUN
      // transport : elle n'existait qu'à la création. Les deux sont désormais
      // soudées dans une unité que tous les écrivains appellent.
      const editedLinks = await reconcileEditedLinks({
        linkService: trackingLinkService,
        message: { id: messageId, conversationId },
        content: editedContent.content,
        editorUserId: userId,
        onError: (err) => logger.error('Error processing tracking links in edit', err),
      });
      const processedContent = editedLinks.processedContent;

      // `metadata` est un blob PARTAGÉ (`postReplyTo`, `location`) : fusion, pas
      // affectation. Et il n'est réécrit que si la réconciliation a établi
      // quelque chose — y compris l'ensemble vide, qui dit « ce texte ne porte
      // plus d'URL ». Sur panne, la base garde le mapping qu'elle avait.
      const nextMetadata = editedLinks.reconciled
        ? { metadata: mergeTrackingLinksIntoMetadata(existingMessage.metadata, editedLinks.trackingLinks) }
        : {};

      // Mettre à jour le message avec le contenu traité.
      // Garde de concurrence optimiste, jumelle de celle que portent déjà les
      // trois autres transports d'édition (socket `message:edit`,
      // `PUT /messages/:messageId`, `PATCH /messages/:messageId`) : une
      // suppression concurrente entre la lecture ci-dessus et cette écriture
      // ferait sinon RESSUSCITER la ligne avec un contenu neuf — un `update`
      // par id réussit quel que soit `deletedAt` — et `message:edited`
      // partirait vers des clients qui l'ont déjà retirée. Prisma lève P2025
      // quand rien ne matche : traduit en 404 plus bas, pas en 500.
      // `translations: null` appartient à CETTE écriture : un nouveau contenu
      // périme ses traductions à l'instant où il est écrit. L'invalidation
      // vivait plus bas, dans le bloc de retraduction — donc APRÈS la capture
      // de `updatedMessage`, qui compose la réponse HTTP ET la charge
      // `message:edited`. Les deux emportaient la traduction du texte d'AVANT,
      // et le Prisme Linguistique fait que la plupart des lecteurs ne voient
      // QUE celle-là : ils relisaient l'ancien message, présenté comme la
      // traduction du nouveau.
      const updatedMessage = await prisma.message.update({
        where: { id: messageId, deletedAt: null },
        data: {
          content: processedContent,
          ...(claimedCanonicalLanguage === undefined ? {} : { originalLanguage: claimedCanonicalLanguage }),
          isEdited: true,
          editedAt: new Date(),
          translations: null,
          ...nextMetadata
        },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              type: true,
              role: true,
              language: true,
              user: {
                select: {
                  id: true,
                  username: true,
                  displayName: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                  role: true
                }
              }
            }
          },
          replyTo: {
            include: {
              sender: {
                select: {
                  id: true,
                  userId: true,
                  displayName: true,
                  avatar: true,
                  type: true,
                  language: true,
                  user: {
                    select: {
                      id: true,
                      username: true,
                      displayName: true,
                      avatar: true
                    }
                  }
                }
              }
            }
          }
        }
      });

      // Ce que ce message doit à ceux qu'il NOMME, après édition : le lot de
      // mentions doit être RECOMPOSÉ, pas complété. Le corps vivait ici, en
      // double du chemin de création — et il extrayait moins bien : handles
      // bruts seulement, là où la création résout aussi `@Display Name`.
      // Éditer un message contenant `@John Doe` détruisait donc la mention que
      // la création avait validée. Deux extracteurs pour un même champ ne
      // peuvent pas rester d'accord ; il n'y en a plus qu'un.
      //
      // La notification, elle, ne concerne QUE les ENTRANTS : les destinataires
      // du premier envoi ont déjà été prévenus, et renotifier l'ensemble
      // complet ferait de dix corrections de frappe dix pushes pour quelqu'un
      // déjà nommé. Elle vivait ici, dépliée — donc absente du chemin socket,
      // qui ne réconciliait rien du tout ; elle est désormais soudée à la
      // réconciliation, dont elle consomme le seul produit non consommé.
      const editedMentions = await reconcileEditedMentions({
        prisma,
        mentionService: fastify.mentionService,
        notificationService: fastify.notificationService,
        message: { id: messageId, conversationId, senderId: existingMessage.senderId },
        content: processedContent,
        editorUserId: userId,
        onError: (err) => logger.error('Edit - Error processing mentions', err)
      });
      // Recopier `validatedUsernames` SANS ce garde-fou rejouerait dans la
      // réponse et dans la diffusion socket l'effacement que l'unité vient
      // d'empêcher en base : quand elle n'a rien pu établir, `updatedMessage`
      // porte déjà la valeur persistée, qui est la bonne.
      if (editedMentions.reconciled) {
        updatedMessage.validatedMentions = [...editedMentions.validatedUsernames];
      }

      // `mention:created` aux ENTRANTS, dans leur salon PERSONNEL. La diffusion
      // qui suit ne fan qu'à `conversation:<id>` : quelqu'un que cette édition
      // vient de nommer n'y est pas forcément. Cette route est la forme
      // CONVERSATION-scopée de l'édition ; le client iOS, lui, emploie
      // `PUT /messages/:messageId` (`routes/messages.ts`) — que les cycles
      // précédents ont désigné ici par erreur, et qui a reçu le même câblage.
      emitMentionCreated({
        io: socketIOHandler?.getManager()?.getIO(),
        newlyMentionedUserIds: editedMentions.newlyMentionedUserIds,
        messageId,
        conversationId,
        editorUserId: userId,
        content: processedContent,
        timestamp: updatedMessage.editedAt ?? new Date(),
        onError: (err) => logger.error('Edit - mention:created fanout failed', err),
      });

      // Déclencher la retraduction automatique du message modifié
      try {
        // Utiliser les instances déjà disponibles dans le contexte Fastify
        const translationService = fastify.translationService;

        // L'invalidation de `translations` en base n'est plus faite ici : elle
        // appartient à l'écriture du contenu, plus haut, et la refaire après la
        // capture de `updatedMessage` rouvrirait la fenêtre que cette écriture
        // vient de fermer. La purge du cache mémoire LRU, elle, vit dans
        // `_processRetranslationAsync`, en tête, pour les QUATRE transports.

        // Créer un objet message pour la retraduction (avec contenu traité incluant tracking links).
        // La langue source est celle qui vient d'être ÉCRITE — donc la valeur
        // stockée quand le corps n'en revendiquait aucune. Repartir d'un `'fr'`
        // par défaut ferait traduire un texte anglais comme du français.
        const messageForRetranslation = {
          id: messageId,
          content: processedContent,
          originalLanguage: claimedCanonicalLanguage ?? existingMessage.originalLanguage,
          conversationId: conversationId,
          senderId: existingMessage.senderId
        };

        // Entrée PUBLIQUE du service, comme sur le handler socket. Le `as any`
        // qui vivait ici visait `_processRetranslationAsync`, la méthode privée
        // que `retranslateMessageAsync` se contente d'exposer : deux vocabulaires
        // pour un même geste, dont un qui perçait l'encapsulation.
        await translationService.retranslateMessageAsync(messageId, messageForRetranslation);
        logger.info(`Edit - Retranslation queued for message ${messageId}`);

      } catch (translationError) {
        logger.error('Erreur lors de la retraduction', translationError);
        // Ne pas faire échouer l'édition si la retraduction échoue
      }

      // Invalider et recalculer les stats pour refléter l'édition
      const stats = await conversationStatsService.getOrCompute(
        prisma,
        id,
        () => []
      );

      conversationMessageStatsService.onMessageEdited(
        prisma, conversationId, existingMessage.sender?.userId ?? existingMessage.senderId, existingMessage.content ?? '', processedContent
      ).catch(err => logger.error('[MESSAGES] Stats edit update error:', err));

      // Construire la réponse avec mentions validées (PAS de traductions - elles arriveront via socket).
      // `translations` est stocké en MongoDB sous forme d'objet (clé = langue) mais le contrat API attend
      // un tableau (`[APITextTranslation]` côté iOS) : sans cette transformation, iOS échoue au décodage
      // avec "Type mismatch for type Array<Any> at path data.translations". L'écriture du contenu a déjà
      // invalidé `translations`, donc `updatedMessage` — son produit — porte bien `null`, et le payload
      // reflète cet état : `[]`. Cette phrase désignait auparavant la retraduction qui SUIT, qui invalidait
      // trop tard pour la charge déjà composée.
      const messageResponse = {
        ...updatedMessage,
        conversationId,
        translations: transformTranslationsToArray(
          messageId,
          (updatedMessage as unknown as { translations?: Record<string, MessageTranslationJSON> | null }).translations
        ),
        validatedMentions: updatedMessage.validatedMentions || [],
        meta: { conversationStats: stats }
      };

      logger.info(`Edit - Response includes ${(updatedMessage.validatedMentions || []).length} validated mentions`);

      // Diffuser la mise à jour via Socket.IO (room + aperçu de liste + file
      // de livraison hors ligne — voir broadcastMessageMutation)
      await broadcastMessageMutation({
        prisma,
        manager: socketIOHandler?.getManager(),
        conversationId,
        actorUserId: userId,
        eventType: 'edited',
        messageId,
        payload: messageResponse as unknown as Record<string, unknown>,
        onError: (err) => logger.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO', err),
      });

      return sendSuccess(reply, messageResponse);

    } catch (error) {
      // P2025 = la garde `deletedAt: null` de l'écriture a mordu : le message a
      // été supprimé entre la lecture et l'écriture. Ce n'est pas une panne, et
      // le rendre en 500 ferait retenter un client qui n'a rien à retenter.
      // Même traduction que sur le sibling `PATCH /messages/:messageId`.
      if ((error as { code?: string })?.code === 'P2025') {
        return sendNotFound(reply, 'Message not found');
      }
      logger.error('Error updating message', error);
      sendInternalError(reply, 'Erreur lors de la modification du message');
    }
  });


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
              properties: {
                message: { type: 'string', example: 'Message supprimé avec succès' }
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

      // Supprimer les traductions du message (vider le JSON)
      await prisma.message.update({
        where: { id: messageId },
        data: { translations: null }
      });

      // Soft delete du message
      await prisma.message.update({
        where: { id: messageId },
        data: {
          deletedAt: new Date()
        }
      });

      // Les effets DURABLES du retrait — recalcul de `lastMessageAt` et
      // désactivation des `/l/<token>` que ce message emporte. Cette route ne
      // recalculait PAS `lastMessageAt`, alors que les deux autres chemins de
      // suppression le faisaient mot pour mot : supprimer le dernier message
      // depuis iOS ou depuis la vue web — les deux clients qui passent par ici
      // — laissait la liste des conversations triée sur un message devenu
      // invisible. La liste vit désormais dans `applyMessageRemovalEffects`.
      await applyMessageRemovalEffects(prisma, {
        id: messageId,
        conversationId,
        content: existingMessage.content,
        metadata: existingMessage.metadata,
      });

      conversationMessageStatsService.onMessageDeleted(
        prisma, conversationId, existingMessage.sender?.userId ?? existingMessage.senderId, existingMessage.content ?? '',
        (existingMessage.attachments ?? []).map(a => {
          const mime = a.mimeType ?? '';
          if (mime.startsWith('image/')) return 'image';
          if (mime.startsWith('audio/')) return 'audio';
          if (mime.startsWith('video/')) return 'video';
          return 'file';
        }),
        existingMessage.messageType || 'text'
      ).catch(err => logger.error('[MESSAGES] Stats delete update error:', err));

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


  fastify.patch<{
    Params: { messageId: string };
    Body: { content: string };
  }>('/messages/:messageId', {
    schema: {
      description: 'Edit a message by message ID (alternative to PUT /conversations/:id/messages/:messageId)',
      tags: ['messages'],
      summary: 'Edit message by ID',
      params: {
        type: 'object',
        required: ['messageId'],
        properties: {
          messageId: { type: 'string', description: 'Message ID to edit' }
        }
      },
      // `minLength: 1` a vécu ici, et se trompait dans les deux sens : trois
      // espaces le satisfont (le message partait VIDÉ, voir `admitEditedContent`)
      // tandis que la chaîne vide LÉGITIME — celle qui retire la légende d'un
      // message à pièce jointe — était refusée au transport ANDROID seul.
      // La vacuité se décide APRÈS `trim` et en connaissant les pièces jointes ;
      // le schéma ne garde donc que le plafond, en parité avec
      // `EditMessageBodySchema`.
      body: {
        type: 'object',
        required: ['content'],
        properties: {
          content: { type: 'string', description: 'Updated message content', maxLength: 10000 }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                message: { type: 'object', description: 'Updated message object' }
              }
            }
          }
        },
        400: errorResponseSchema,
        401: errorResponseSchema,
        403: errorResponseSchema,
        404: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth],
    preHandler: [messageValidationHook]
  }, async (request, reply) => {
    try {
      const { messageId } = request.params;
      const { content } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // `deletedAt: null` manquait ici : ce transport lisait — puis réécrivait —
      // un message SUPPRIMÉ. Un `update` par id réussit quel que soit
      // `deletedAt`, donc la ligne ressuscitait avec un contenu neuf, un
      // `message:edited` partait vers des clients qui l'avaient déjà retirée, et
      // l'API répondait succès. Les trois autres entrées gardaient déjà leur
      // lecture ; celle-ci était la dernière sans garde.
      const message = await prisma.message.findFirst({
        where: { id: messageId, deletedAt: null },
        include: {
          sender: {
            select: { userId: true }
          },
          conversation: {
            include: {
              participants: {
                where: {
                  userId: userId,
                  isActive: true
                }
              }
            }
          },
          // Sans elles, la garde de vacuité ne peut pas trancher : c'est la
          // pièce jointe qui autorise un texte vide (retrait de légende).
          attachments: { select: { id: true } }
        }
      });

      if (!message) {
        return sendNotFound(reply, 'Message introuvable');
      }

      // L'unique énoncé de « qui peut éditer, et jusqu'à quand »
      // (`messageEditAdmission`). Cette entrée n'imposait AUCUNE fenêtre de 24h
      // et n'admettait aucun modérateur, là où la route conversation-scopée fait
      // les deux — pour le même geste, sur le même message.
      //
      // L'appartenance à la conversation n'est plus vérifiée pour l'AUTEUR : les
      // trois autres entrées tiennent l'authorship pour suffisant, et rendre la
      // règle commune plus stricte que les trois transports vivants serait une
      // restriction neuve déguisée en unification. « Un auteur qui a quitté la
      // conversation peut-il encore éditer ? » est une question produit à
      // trancher pour les quatre à la fois, pas en passant sur celle-ci.
      const admission = await admitMessageEdit({
        prisma,
        editorUserId: userId,
        message: {
          authorUserId: message.sender?.userId,
          conversationId: message.conversationId,
          createdAt: message.createdAt,
        },
        onError: (err) => logger.error('Patch edit - admission lookup failed', err),
      });

      if (isEditRefused(admission)) {
        if (admission.reason === 'edit-window-expired') {
          return sendForbidden(reply, 'You can no longer edit this message (24-hour limit exceeded)');
        }
        return admission.reason === 'not-a-member'
          ? sendForbidden(reply, 'Unauthorized access to this conversation')
          : sendForbidden(reply, 'Vous ne pouvez modifier que vos propres messages');
      }

      // Ce qu'une édition a le droit d'ÉCRIRE (`admitEditedContent`), désormais
      // énoncé une seule fois pour les quatre transports. Cette entrée était la
      // seule SANS garde : trois espaces suffisaient à vider un message, et un
      // `message:edited` vide partait vers toute la conversation par-dessus le
      // texte déjà écrasé.
      const editedContent = admitEditedContent({
        content,
        hasAttachments: (message.attachments?.length ?? 0) > 0,
      });

      if (isEditedContentRefused(editedContent)) {
        return sendBadRequest(reply, EMPTY_EDIT_REFUSAL_MESSAGE);
      }

      // Les liens `[[url]]` / `<url>` deviennent des `m+<token>` traçables AVANT
      // l'écriture, comme sur les deux autres transports d'édition. Ce PATCH est
      // celui du client ANDROID (`OutboxFlushWorker`, lane `EDIT_MESSAGE`) : il
      // écrivait les crochets en dur, pour toujours, là où le même texte ENVOYÉ
      // produit un lien.
      const patchedLinks = await reconcileEditedLinks({
        linkService: trackingLinkService,
        message: { id: messageId, conversationId: message.conversationId },
        content: editedContent.content,
        editorUserId: userId,
        onError: (err) => logger.error('Error processing tracking links in patch edit', err),
      });
      const processedContent = patchedLinks.processedContent;
      const patchedMetadata = patchedLinks.reconciled
        ? { metadata: mergeTrackingLinksIntoMetadata(message.metadata, patchedLinks.trackingLinks) }
        : {};

      // Mettre à jour le contenu du message (invalide aussi les traductions existantes :
      // la retraduction ci-dessous les recalcule, parité avec PUT /conversations/:id/messages/:messageId)
      // Garde de concurrence optimiste, jumelle de celle du sibling
      // `PUT /messages/:messageId` : une suppression concurrente entre la
      // lecture et cette écriture ferait sinon ressusciter la ligne. Prisma
      // accepte un filtre non-unique aux côtés de l'id et lève P2025 quand rien
      // ne matche — traduit en 404 plus bas, pas en 500.
      const editedAt = new Date();
      const updatedMessage = await prisma.message.update({
        where: { id: messageId, deletedAt: null },
        data: {
          content: processedContent,
          isEdited: true,
          editedAt,
          translations: null,
          ...patchedMetadata
        },
        include: {
          sender: {
            select: {
              id: true,
              userId: true,
              displayName: true,
              avatar: true,
              role: true,
              user: { select: { username: true } }
            }
          }
        }
      });

      // Ce que cette édition doit aux gens qu'elle NOMME. Même unité que le
      // sibling PUT et que le chemin socket : le lot est RECOMPOSÉ, et seuls
      // les ENTRANTS sont notifiés. Ce transport ne touchait aucune mention —
      // éditer « salut @alice » en « salut @bob » depuis le web laissait Alice
      // mentionnée et ne nommait jamais Bob.
      const editedMentions = await reconcileEditedMentions({
        prisma,
        mentionService: fastify.mentionService,
        notificationService: fastify.notificationService,
        message: { id: messageId, conversationId: message.conversationId, senderId: message.senderId },
        content: processedContent,
        editorUserId: userId,
        onError: (err) => logger.error('Patch edit - Error processing mentions', err)
      });
      // Même garde que le sibling PUT : quand la réconciliation n'a RIEN pu
      // établir, la valeur persistée que porte `updatedMessage` est la bonne,
      // et un `[]` recopié effacerait un surlignage vivant.
      if (editedMentions.reconciled) {
        (updatedMessage as { validatedMentions?: string[] }).validatedMentions = [...editedMentions.validatedUsernames];
      }

      // `mention:created` aux seuls ENTRANTS, dans leur salon PERSONNEL : la
      // diffusion qui suit ne fan qu'à `conversation:<id>`.
      emitMentionCreated({
        io: socketIOHandler?.getManager()?.getIO(),
        newlyMentionedUserIds: editedMentions.newlyMentionedUserIds,
        messageId,
        conversationId: message.conversationId,
        editorUserId: userId,
        content: processedContent,
        timestamp: editedAt,
        onError: (err) => logger.error('Patch edit - mention:created fanout failed', err),
      });

      // Déclencher la retraduction automatique du message modifié (parité avec le sibling PUT)
      try {
        const translationService = fastify.translationService;

        const messageForRetranslation = {
          id: messageId,
          content: processedContent,
          originalLanguage: message.originalLanguage,
          conversationId: message.conversationId,
          senderId: message.senderId
        };

        // Entrée PUBLIQUE du service (voir le sibling PUT) : `retranslateMessageAsync`
        // expose `_processRetranslationAsync`, que ce `as any` atteignait de force.
        await translationService.retranslateMessageAsync(messageId, messageForRetranslation);
      } catch (translationError) {
        logger.error('Erreur lors de la retraduction', translationError);
        // Ne pas faire échouer l'édition si la retraduction échoue
      }

      const messageResponse = {
        ...updatedMessage,
        conversationId: message.conversationId,
        translations: transformTranslationsToArray(
          messageId,
          (updatedMessage as unknown as { translations?: Record<string, MessageTranslationJSON> | null }).translations
        )
      };

      // Diffuser la mise à jour via Socket.IO (parité avec le sibling PUT :
      // room + aperçu de liste + file de livraison hors ligne)
      await broadcastMessageMutation({
        prisma,
        manager: socketIOHandler?.getManager(),
        conversationId: message.conversationId,
        actorUserId: userId,
        eventType: 'edited',
        messageId,
        payload: messageResponse as unknown as Record<string, unknown>,
        onError: (err) => logger.error('[CONVERSATIONS] Erreur lors de la diffusion Socket.IO', err),
      });

      return sendSuccess(reply, messageResponse);

    } catch (error) {
      // P2025 = la garde `deletedAt: null` de l'écriture a mordu : le message a
      // été supprimé entre la lecture et l'écriture. Ce n'est pas une panne, et
      // le rendre en 500 ferait retenter un client qui n'a rien à retenter.
      if ((error as { code?: string })?.code === 'P2025') {
        return sendNotFound(reply, 'Message introuvable');
      }
      logger.error('Error updating message', error);
      sendInternalError(reply, 'Erreur lors de la modification du message');
    }
  });


  fastify.get<{
    Params: ConversationParams;
  }>('/conversations/:id/reactions', {
    schema: {
      description: 'Get all reactions from all messages in a conversation. Returns reactions grouped by message ID with emoji counts and user information. Useful for loading full conversation context at once.',
      tags: ['conversations', 'reactions'],
      summary: 'Get all conversation reactions',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                reactions: {
                  type: 'array',
                  description: 'All reactions grouped by message'
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Récupérer toutes les réactions de tous les messages de la conversation
      const reactions = await prisma.reaction.findMany({
        where: {
          message: {
            conversationId: conversationId,
            deletedAt: null
          }
        },
        include: {
          participant: {
            select: {
              id: true,
              displayName: true,
              avatar: true,
              type: true,
              user: { select: { username: true } }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Grouper les réactions par messageId et emoji
      const reactionsByMessage = new Map<string, any>();

      for (const reaction of reactions) {
        if (!reactionsByMessage.has(reaction.messageId)) {
          reactionsByMessage.set(reaction.messageId, {});
        }

        const messageReactions = reactionsByMessage.get(reaction.messageId);
        if (!messageReactions[reaction.emoji]) {
          messageReactions[reaction.emoji] = {
            emoji: reaction.emoji,
            count: 0,
            users: []
          };
        }

        messageReactions[reaction.emoji].count++;
        messageReactions[reaction.emoji].users.push({
          participantId: reaction.participantId,
          isAnonymous: reaction.participant.type === 'anonymous',
          user: { ...reaction.participant, username: reaction.participant.user?.username }
        });
      }

      // Convertir en tableau
      const reactionsArray = Array.from(reactionsByMessage.entries()).map(([messageId, emojis]) => ({
        messageId,
        reactions: Object.values(emojis)
      }));

      return sendSuccess(reply, {
        reactions: reactionsArray,
        total: reactions.length
      });

    } catch (error) {
      logger.error('Error fetching conversation reactions', error);
      return sendInternalError(reply, 'Error retrieving reactions');
    }
  });

  /**
   * POST /conversations/:id/messages/:messageId/reactions
   * Add an emoji reaction to a specific message within a conversation.
   * Reuses the existing ReactionService for consistency with Socket.IO handlers.
   */
  fastify.post<{
    Params: ConversationParams & { messageId: string };
    Body: { emoji: string };
  }>('/conversations/:id/messages/:messageId/reactions', {
    schema: {
      description: 'Add an emoji reaction to a message in a conversation. Reuses the same logic as the Socket.IO reaction:add handler. The reaction will be broadcast to all conversation participants via Socket.IO.',
      tags: ['conversations', 'reactions'],
      summary: 'Add reaction to message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to react to' }
        }
      },
      body: {
        type: 'object',
        required: ['emoji'],
        properties: {
          emoji: { type: 'string', minLength: 1, maxLength: 10, description: 'Emoji character to add as reaction' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                added: { type: 'boolean', description: 'Whether the reaction was added' },
                emoji: { type: 'string', description: 'The emoji that was added' }
              }
            }
          }
        },
        400: errorResponseSchema,
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
      const { emoji } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const isAnonymous = authRequest.authContext.isAnonymous;
      const sessionToken = authRequest.authContext.sessionToken;

      // Validate emoji
      if (!emoji) {
        return sendBadRequest(reply, 'emoji is required');
      }

      // Resolve conversation ID
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Verify access to conversation
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Verify message belongs to the conversation
      const message = await prisma.message.findFirst({
        where: {
          id: messageId,
          conversationId: conversationId,
          deletedAt: null
        },
        select: { id: true }
      });

      if (!message) {
        return sendNotFound(reply, 'Message not found in this conversation');
      }

      // Resolve participantId for the current user
      const currentParticipant = isAnonymous
        ? { id: authRequest.authContext.participantId }
        : await prisma.participant.findFirst({
            where: { userId, conversationId, isActive: true },
            select: { id: true },
          });

      if (!currentParticipant?.id) {
        return sendForbidden(reply, 'You are not a participant of this conversation');
      }

      // Use ReactionService to add the reaction
      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(prisma);

      const addResult = await reactionService.addReaction({
        messageId,
        emoji,
        participantId: currentParticipant.id,
      });

      if (!addResult) {
        return sendInternalError(reply, 'Failed to add reaction');
      }

      if (addResult.unchanged) {
        // Idempotent no-op: the participant already had exactly this emoji.
        // Skip the REACTION_ADDED broadcast (nothing changed) but still report
        // success. Parity with the socket `reaction:add` handler.
        return sendSuccess(reply, { added: true, emoji });
      }

      // Broadcast via Socket.IO to all conversation participants
      try {
        const updateEvent = await reactionService.createUpdateEvent(
          messageId,
          emoji,
          'add',
          currentParticipant.id,
          conversationId,
          userId,
        );

        if (socketIOHandler) {
          const manager = socketIOHandler.getManager?.();
          // Swap 1-réaction-par-user : l'ancien emoji part avant que le
          // nouveau arrive (agrégations recalculées par event).
          for (const removedEmoji of addResult.replacedEmojis) {
            const removeEvent = await reactionService.createUpdateEvent(
              messageId,
              removedEmoji,
              'remove',
              currentParticipant.id,
              conversationId,
              userId,
            );
            await broadcastReactionMutation({
              manager,
              conversationId,
              actorParticipantId: currentParticipant.id,
              eventType: 'reaction-removed',
              messageId,
              emoji: removedEmoji,
              payload: removeEvent as unknown as Record<string, unknown>,
              onError: (error) => logger.warn('[REACTION-REST] swap-removal broadcast failed', error),
            });
          }
          await broadcastReactionMutation({
            manager,
            conversationId,
            actorParticipantId: currentParticipant.id,
            eventType: 'reaction-added',
            messageId,
            emoji,
            payload: updateEvent as unknown as Record<string, unknown>,
            onError: (error) => logger.warn('[REACTION-REST] broadcast failed', error),
          });
        }
      } catch (socketError) {
        logger.warn('[REACTION-REST] Error broadcasting reaction via Socket.IO', socketError);
        // Do not fail the response if broadcast fails
      }

      return sendSuccess(reply, { added: true, emoji });

    } catch (error: any) {
      logger.error('Error adding reaction via REST', error);

      // Handle specific error messages from ReactionService
      if (error.message === 'Invalid emoji format') {
        return sendBadRequest(reply, 'Invalid emoji format');
      }
      if (error.message === 'Message not found') {
        return sendNotFound(reply, 'Message not found');
      }
      if (error.message?.includes('not a member') || error.message?.includes('not a participant')) {
        return sendForbidden(reply, 'Access denied to this conversation');
      }
      if (error.message === 'Cannot react to a system message') {
        return sendBadRequest(reply, 'Cannot react to a system message');
      }

      return sendInternalError(reply, 'Failed to add reaction');
    }
  });

  /**
   * DELETE /conversations/:id/messages/:messageId/reactions
   * Remove an emoji reaction from a specific message within a conversation.
   * Reuses the existing ReactionService for consistency with Socket.IO handlers.
   */
  fastify.delete<{
    Params: ConversationParams & { messageId: string };
    Body: { emoji: string };
  }>('/conversations/:id/messages/:messageId/reactions', {
    schema: {
      description: 'Remove an emoji reaction from a message in a conversation. Users can only remove their own reactions. The removal will be broadcast to all conversation participants via Socket.IO.',
      tags: ['conversations', 'reactions'],
      summary: 'Remove reaction from message',
      params: {
        type: 'object',
        required: ['id', 'messageId'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' },
          messageId: { type: 'string', description: 'Message ID to remove reaction from' }
        }
      },
      body: {
        type: 'object',
        required: ['emoji'],
        properties: {
          emoji: { type: 'string', minLength: 1, maxLength: 10, description: 'Emoji character to remove' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                removed: { type: 'boolean', description: 'Whether the reaction was removed' }
              }
            }
          }
        },
        400: errorResponseSchema,
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
      const { emoji } = request.body;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;
      const isAnonymous = authRequest.authContext.isAnonymous;
      const sessionToken = authRequest.authContext.sessionToken;

      // Validate emoji
      if (!emoji) {
        return sendBadRequest(reply, 'emoji is required');
      }

      // Resolve conversation ID
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendNotFound(reply, 'Conversation not found');
      }

      // Verify access to conversation
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Resolve participantId for the current user
      const currentParticipant = isAnonymous
        ? { id: authRequest.authContext.participantId }
        : await prisma.participant.findFirst({
            where: { userId, conversationId, isActive: true },
            select: { id: true },
          });

      if (!currentParticipant?.id) {
        return sendForbidden(reply, 'You are not a participant of this conversation');
      }

      // Use ReactionService to remove the reaction
      const { ReactionService } = await import('../../services/ReactionService.js');
      const reactionService = new ReactionService(prisma);

      const removed = await reactionService.removeReaction({
        messageId,
        emoji,
        participantId: currentParticipant.id,
      });

      if (!removed) {
        return sendNotFound(reply, 'Reaction not found');
      }

      // Broadcast via Socket.IO to all conversation participants
      try {
        const updateEvent = await reactionService.createUpdateEvent(
          messageId,
          emoji,
          'remove',
          currentParticipant.id,
          conversationId,
          userId,
        );

        if (socketIOHandler) {
          await broadcastReactionMutation({
            manager: socketIOHandler.getManager?.(),
            conversationId,
            actorParticipantId: currentParticipant.id,
            eventType: 'reaction-removed',
            messageId,
            emoji,
            payload: updateEvent as unknown as Record<string, unknown>,
            onError: (error) => logger.warn('[REACTION-REST] removal broadcast failed', error),
          });
        }
      } catch (socketError) {
        logger.warn('[REACTION-REST] Error broadcasting reaction removal via Socket.IO', socketError);
        // Do not fail the response if broadcast fails
      }

      return sendSuccess(reply, { removed: true });

    } catch (error: any) {
      logger.error('Error removing reaction via REST', error);

      if (error.message === 'Invalid emoji format') {
        return sendBadRequest(reply, 'Invalid emoji format');
      }

      return sendInternalError(reply, 'Failed to remove reaction');
    }
  });

  /**
   * GET /conversations/:id/status
   * Récupère les statuts de lecture de tous les messages d'une conversation
   */
  fastify.get<{
    Params: ConversationParams;
  }>('/conversations/:id/status', {
    schema: {
      description: 'Get read/delivery status for all messages in a conversation. Returns aggregated counts and detailed per-user status for each message. Useful for displaying message receipts and read indicators.',
      tags: ['conversations', 'status'],
      summary: 'Get all conversation message statuses',
      params: {
        type: 'object',
        required: ['id'],
        properties: {
          id: { type: 'string', description: 'Conversation ID or identifier' }
        }
      },
      response: {
        200: {
          type: 'object',
          properties: {
            success: { type: 'boolean', example: true },
            data: {
              type: 'object',
              properties: {
                statuses: {
                  type: 'array',
                  description: 'Status information for all messages'
                }
              }
            }
          }
        },
        401: errorResponseSchema,
        403: errorResponseSchema,
        500: errorResponseSchema
      }
    },
    preValidation: [requiredAuth]
  }, async (request, reply) => {
    try {
      const { id } = request.params;
      const authRequest = request as UnifiedAuthRequest;
      const userId = authRequest.authContext.userId;

      // Résoudre l'ID de conversation réel
      const conversationId = await resolveConversationId(prisma, id);
      if (!conversationId) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Vérifier les permissions d'accès
      const canAccess = await canAccessConversation(prisma, authRequest.authContext, conversationId, id);
      if (!canAccess) {
        return sendForbidden(reply, 'Unauthorized access to this conversation');
      }

      // Récupérer tous les messages avec leurs statuts dénormalisés
      const messages = await prisma.message.findMany({
        where: {
          conversationId: conversationId,
          deletedAt: null
        },
        select: {
          id: true,
          senderId: true,
          deliveredCount: true,
          readCount: true,
          deliveredToAllAt: true,
          readByAllAt: true,
          createdAt: true,
          statusEntries: {
            select: {
              participantId: true,
              deliveredAt: true,
              readAt: true,
              participant: {
                select: {
                  id: true,
                  displayName: true,
                  avatar: true,
                  type: true,
                  user: { select: { username: true } }
                }
              }
            }
          }
        },
        orderBy: { createdAt: 'desc' }
      });

      // Formater les statuts
      const statuses = messages.map(message => ({
        messageId: message.id,
        senderId: message.senderId,
        summary: {
          deliveredCount: message.deliveredCount || 0,
          readCount: message.readCount || 0,
          deliveredToAllAt: message.deliveredToAllAt,
          readByAllAt: message.readByAllAt
        },
        entries: message.statusEntries.map(entry => ({
          participantId: entry.participantId,
          isAnonymous: entry.participant.type === 'anonymous',
          deliveredAt: entry.deliveredAt,
          readAt: entry.readAt,
          user: { ...entry.participant, username: entry.participant.user?.username }
        }))
      }));

      return sendSuccess(reply, {
        statuses,
        total: messages.length
      });

    } catch (error) {
      logger.error('Error fetching conversation statuses', error);
      return sendInternalError(reply, 'Error retrieving statuses');
    }
  });


}
