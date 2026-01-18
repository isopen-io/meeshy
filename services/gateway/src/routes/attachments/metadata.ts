/**
 * Metadata and management routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
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
          return reply.status(404).send({
            success: false,
            error: 'ATTACHMENT_NOT_FOUND',
            message: 'Attachment not found',
          });
        }

        return reply.status(200).send({
          success: true,
          data: {
            attachment
          }
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error fetching attachment metadata:', error);
        return reply.status(500).send({
          success: false,
          error: 'METADATA_FETCH_FAILED',
          message: error.message || 'Failed to fetch attachment metadata',
        });
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
        const authContext = (request as any).authContext;

        if (!authContext || (!authContext.isAuthenticated && !authContext.isAnonymous)) {
          return reply.status(401).send({
            success: false,
            error: 'Authentication required',
          });
        }

        const { attachmentId } = request.params as AttachmentParams;
        const userId = authContext.userId;
        const isAnonymous = authContext.isAnonymous;

        const attachment = await attachmentService.getAttachment(attachmentId);
        if (!attachment) {
          return reply.status(404).send({
            success: false,
            error: 'Attachment not found',
          });
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
          return reply.status(403).send({
            success: false,
            error: 'Insufficient permissions - You can only delete your own attachments',
          });
        }

        await attachmentService.deleteAttachment(attachmentId);

        return reply.send({
          success: true,
          data: { message: 'Attachment deleted successfully' },
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error deleting attachment:', error);
        return reply.status(500).send({
          success: false,
          error: error.message || 'Error deleting attachment',
        });
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
        const authContext = (request as any).authContext;

        if (!authContext || (!authContext.isAuthenticated && !authContext.isAnonymous)) {
          console.error('[AttachmentRoutes] Authentification requise');
          return reply.status(401).send({
            success: false,
            error: 'Authentication required',
          });
        }

        const { conversationId } = request.params as ConversationParams;
        const query = request.query as ConversationAttachmentsQuery;

        if (authContext.isAuthenticated) {
          const member = await prisma.conversationMember.findFirst({
            where: {
              conversationId,
              userId: authContext.userId,
              isActive: true,
            },
          });

          if (!member) {
            return reply.status(403).send({
              success: false,
              error: 'Access denied to this conversation',
            });
          }
        } else if (authContext.isAnonymous && authContext.anonymousParticipant) {
          const participant = await prisma.anonymousParticipant.findUnique({
            where: { id: authContext.anonymousParticipant.id },
            select: {
              conversationId: true,
              shareLink: {
                select: {
                  allowViewHistory: true,
                },
              },
            },
          });

          if (!participant) {
            console.error('[AttachmentRoutes] Participant non trouvé');
            return reply.status(403).send({
              success: false,
              error: 'Participant not found',
            });
          }

          if (participant.conversationId !== conversationId) {
            console.error('[AttachmentRoutes] Mauvaise conversation:', {
              participantConversationId: participant.conversationId,
              requestedConversationId: conversationId
            });
            return reply.status(403).send({
              success: false,
              error: 'Access denied to this conversation',
            });
          }

          if (!participant.shareLink.allowViewHistory) {
            console.error('[AttachmentRoutes] Historique non autorisé');
            return reply.status(403).send({
              success: false,
              error: 'History viewing not allowed on this link',
            });
          }
        }

        const attachments = await attachmentService.getConversationAttachments(
          conversationId,
          {
            type: query.type,
            limit: query.limit,
            offset: query.offset,
          }
        );

        return reply.send({
          success: true,
          data: { attachments },
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error fetching conversation attachments:', error);
        return reply.status(500).send({
          success: false,
          error: error.message || 'Error fetching attachments',
        });
      }
    }
  );
}
