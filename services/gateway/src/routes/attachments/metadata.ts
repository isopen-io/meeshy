/**
 * Metadata and management routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AttachmentService } from '../../services/attachments';
import {
  messageAttachmentSchema,
  messageAttachmentMinimalSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';
import type {
  AttachmentParams,
  ConversationParams,
  ConversationAttachmentsQuery,
} from './types';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { enhancedLogger } from '../../utils/logger-enhanced.js';
import { sendSuccess, sendUnauthorized, sendForbidden, sendNotFound, sendInternalError } from '../../utils/response.js';
import { HISTORY_FLOOR_PARTICIPANT_SELECT, loadHistoryFloor } from '../../services/historyFloor';
import { applyPersonalHistoryHiding, loadPersonalHistoryHiding } from '../../services/personalHistoryFilter';

const logger = enhancedLogger.child({ module: 'AttachmentMetadataRoutes' });

export async function registerMetadataRoutes(
  fastify: FastifyInstance,
  authRequired: any,
  authOptional: any,
  prisma: PrismaClient
) {
  const attachmentService = new AttachmentService(prisma);

  /**
   * GET /attachments/:attachmentId/metadata
   * Get attachment metadata including transcription, translations, and voice analysis
   */
  fastify.get(
    '/attachments/:attachmentId/metadata',
    {
      preHandler: authRequired,
      schema: {
        description: 'Get comprehensive attachment metadata including transcription (with voice quality analysis), translated audios, and all metadata fields. Returns the complete attachment object with all relations.',
        tags: ['attachments'],
        summary: 'Get attachment metadata',
        params: {
          type: 'object',
          required: ['attachmentId'],
          properties: {
            attachmentId: {
              type: 'string',
              description: 'Unique attachment identifier'
            }
          }
        },
        response: {
          200: {
            description: 'Attachment metadata retrieved successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  attachment: messageAttachmentSchema
                }
              }
            }
          },
          404: {
            description: 'Attachment not found',
            ...errorResponseSchema
          },
          500: {
            description: 'Internal server error',
            ...errorResponseSchema
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const { attachmentId } = request.params as AttachmentParams;

        const attachment = await attachmentService.getAttachmentWithMetadata(attachmentId);
        if (!attachment) {
          return sendNotFound(reply, 'ATTACHMENT_NOT_FOUND', { message: 'Attachment not found' });
        }

        const etag = `"${attachment.id}-${(attachment as { updatedAt?: Date }).updatedAt?.getTime() ?? 0}"`;
        if (request.headers['if-none-match'] === etag) {
          return reply.code(304).send();
        }

        reply.header('Cache-Control', 'private, max-age=3600, stale-while-revalidate=86400');
        reply.header('ETag', etag);

        return sendSuccess(reply, { attachment });
      } catch (error: unknown) {
        logger.error('error fetching attachment metadata', { error });
        return sendInternalError(reply, 'METADATA_FETCH_FAILED', { message: error instanceof Error ? error.message : 'Failed to fetch attachment metadata' });
      }
    }
  );

  /**
   * DELETE /attachments/:attachmentId
   * Supprime un attachment (support utilisateurs authentifiés ET anonymes)
   */
  fastify.delete(
    '/attachments/:attachmentId',
    {
      onRequest: [authOptional],
      schema: {
        description: 'Delete an attachment and its associated files (original and thumbnail). Authorization rules: attachment owner can delete their own files, admins/moderators can delete any attachment, anonymous users can only delete their own attachments. This permanently removes the file from storage.',
        tags: ['attachments'],
        summary: 'Delete attachment',
        params: {
          type: 'object',
          required: ['attachmentId'],
          properties: {
            attachmentId: {
              type: 'string',
              description: 'Unique attachment identifier'
            }
          }
        },
        response: {
          200: {
            description: 'Attachment deleted successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  message: { type: 'string', example: 'Attachment deleted successfully' }
                }
              }
            }
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Insufficient permissions - can only delete own attachments',
            ...errorResponseSchema
          },
          404: {
            description: 'Attachment not found',
            ...errorResponseSchema
          },
          500: {
            description: 'Internal server error',
            ...errorResponseSchema
          }
        }
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;

        // `isAnonymous` vaut `true` sur le contexte d'un VISITEUR NU : la garde
        // `!isAuthenticated && !isAnonymous` était donc toujours fausse et ne
        // rejetait personne. Un participant anonyme réellement identifié par un
        // jeton de session porte `isAuthenticated: true` — c'est le seul test utile.
        if (!authContext || !authContext.isAuthenticated) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { attachmentId } = request.params as AttachmentParams;
        const userId = authContext.userId;
        const isAnonymous = authContext.isAnonymous;

        const attachment = await attachmentService.getAttachment(attachmentId);
        if (!attachment) {
          return sendNotFound(reply, 'Attachment not found');
        }

        let hasPermission = false;

        if (isAnonymous) {
          hasPermission = attachment.uploadedBy === userId && attachment.isAnonymous;
        } else {
          const isAdmin = authContext.registeredUser?.role === 'ADMIN' ||
                         authContext.registeredUser?.role === 'BIGBOSS';

          hasPermission = attachment.uploadedBy === userId || isAdmin;
        }

        if (!hasPermission) {
          return sendForbidden(reply, 'Insufficient permissions - You can only delete your own attachments');
        }

        await attachmentService.deleteAttachment(attachmentId);

        return sendSuccess(reply, { message: 'Attachment deleted successfully' });
      } catch (error: unknown) {
        logger.error('error deleting attachment', { error });
        return sendInternalError(reply, error instanceof Error ? error.message : 'Error deleting attachment');
      }
    }
  );

  /**
   * GET /conversations/:conversationId/attachments
   * Récupère les attachments d'une conversation (support authentifiés ET anonymes)
   */
  fastify.get(
    '/conversations/:conversationId/attachments',
    {
      onRequest: [authOptional],
      schema: {
        description: 'Get all attachments from a conversation with optional filtering by type. Supports pagination. Authenticated users must be members of the conversation. Anonymous users must have view history permission on their share link.',
        tags: ['attachments', 'conversations'],
        summary: 'List conversation attachments',
        params: {
          type: 'object',
          required: ['conversationId'],
          properties: {
            conversationId: {
              type: 'string',
              description: 'Conversation unique identifier'
            }
          }
        },
        querystring: {
          type: 'object',
          properties: {
            type: {
              type: 'string',
              enum: ['image', 'document', 'audio', 'video', 'text'],
              description: 'Filter by attachment type'
            },
            limit: {
              type: 'number',
              minimum: 1,
              maximum: 100,
              default: 50,
              description: 'Maximum number of attachments to return'
            },
            offset: {
              type: 'number',
              minimum: 0,
              default: 0,
              description: 'Number of attachments to skip (for pagination)'
            },
          },
        },
        response: {
          200: {
            description: 'Attachments retrieved successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  attachments: {
                    type: 'array',
                    items: messageAttachmentMinimalSchema
                  }
                }
              }
            }
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Access denied to this conversation',
            ...errorResponseSchema
          },
          500: {
            description: 'Internal server error',
            ...errorResponseSchema
          }
        }
      },
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const authContext = (request as UnifiedAuthRequest).authContext;

        // `isAnonymous` vaut `true` sur le contexte d'un VISITEUR NU : la garde
        // `!isAuthenticated && !isAnonymous` était donc toujours fausse et ne
        // rejetait personne. Un participant anonyme réellement identifié par un
        // jeton de session porte `isAuthenticated: true` — c'est le seul test utile.
        if (!authContext || !authContext.isAuthenticated) {
          return sendUnauthorized(reply, 'Authentication required');
        }

        const { conversationId } = request.params as ConversationParams;
        const query = request.query as ConversationAttachmentsQuery;

        // Le discriminant est le TYPE d'identité, pas `isAuthenticated` : un
        // participant anonyme muni d'un jeton de session est authentifié lui
        // aussi. Tester `isAuthenticated` en premier le faisait tomber dans la
        // branche « utilisateur enregistré », où la recherche par `userId`
        // échoue — et rendait la branche anonyme ci-dessous inatteignable.
        //
        // La galerie est un SECOND LECTEUR des messages de la conversation :
        // elle en sert les pièces jointes, avec leur URL, leur nom d'origine et
        // la transcription des audios. Elle doit donc s'arrêter aux mêmes
        // bornes que le premier lecteur (`GET /conversations/:id/messages`), et
        // les tenir des mêmes modules — sans quoi la règle a deux énoncés qui
        // dérivent l'un de l'autre.
        const isAnonymous = Boolean(authContext.isAnonymous && authContext.participantId);
        // La projection du plancher est PARTAGÉE avec `GET messages` et `/sync`
        // — l'omettre d'un champ ferait retomber ce lecteur sur le lien
        // pendant que les deux autres appliquent la ligne, soit la règle à
        // deux énoncés que ce bloc s'interdit.
        const participantSelect = {
          conversationId: true,
          ...HISTORY_FLOOR_PARTICIPANT_SELECT,
        } as const;

        const participant = isAnonymous
          ? await prisma.participant.findUnique({
              where: { id: authContext.participantId },
              select: participantSelect,
            })
          : await prisma.participant.findFirst({
              where: {
                conversationId,
                userId: authContext.userId,
                isActive: true,
              },
              select: participantSelect,
            });

        if (!participant) {
          return sendForbidden(reply, isAnonymous ? 'Participant not found' : 'Access denied to this conversation');
        }

        if (isAnonymous && participant.conversationId !== conversationId) {
          return sendForbidden(reply, 'Access denied to this conversation');
        }

        // `participant.shareLinkId` et non la copie embarquée dans
        // `anonymousSession` : la jointure anonyme écrit le fait DEUX fois
        // (`routes/anonymous.ts`), et la colonne est celle que lisent
        // `messages.ts`, `/sync` et le module de plancher. Elle est aussi la
        // seule des deux qu'un utilisateur INSCRIT entré par un lien porte —
        // c'est par là que la galerie servait tout l'avant-jointure.
        //
        // Le plancher RÉTRÉCIT la lecture, il ne la refuse pas : ce participant
        // voit les messages postés depuis son arrivée, donc leurs médias.
        //
        // Les deux lectures sont indépendantes et recouvertes. `Promise.all`
        // est sûr ici bien que leurs postures d'échec diffèrent : le masquage
        // personnel ne rejette jamais (il se dégrade en « on sert »), donc le
        // seul rejet possible est celui du plancher, et il n'abandonne aucune
        // promesse sans écouteur.
        const [historyFloor, personalHiding] = await Promise.all([
          loadHistoryFloor(prisma, participant),
          loadPersonalHistoryHiding(prisma, {
            userId: isAnonymous ? null : authContext.userId,
            conversationId,
          }),
        ]);

        const messageFilter = applyPersonalHistoryHiding(
          historyFloor ? { createdAt: { gte: historyFloor } } : {},
          personalHiding
        );

        const attachments = await attachmentService.getConversationAttachments(
          conversationId,
          {
            type: query.type,
            limit: query.limit,
            offset: query.offset,
            messageFilter,
          }
        );

        return sendSuccess(reply, { attachments });
      } catch (error: unknown) {
        logger.error('error fetching conversation attachments', { conversationId: (request.params as ConversationParams)?.conversationId, error });
        return sendInternalError(reply, error instanceof Error ? error.message : 'Error fetching attachments');
      }
    }
  );
}
