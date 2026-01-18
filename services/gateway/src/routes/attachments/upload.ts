/**
 * Upload routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { AttachmentService } from '../../services/attachments';
import {
  messageAttachmentSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';
import type { UploadedFile, UploadTextBody } from './types';

export async function registerUploadRoutes(
  fastify: FastifyInstance,
  authOptional: any,
  prisma: PrismaClient
) {
  const attachmentService = new AttachmentService(prisma);

  /**
   * POST /attachments/upload
   * Upload un ou plusieurs fichiers (support utilisateurs authentifiés ET anonymes)
   */
  fastify.post(
    '/attachments/upload',
    {
      onRequest: [authOptional],
      schema: {
        description: 'Upload one or multiple files. Supports both authenticated and anonymous users. Files are processed with metadata extraction (dimensions for images, duration for audio/video). Anonymous users must have file/image upload permissions on their share link.',
        tags: ['attachments'],
        summary: 'Upload file attachments',
        consumes: ['multipart/form-data'],
        response: {
          200: {
            description: 'Files uploaded successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  attachments: {
                    type: 'array',
                    items: messageAttachmentSchema
                  }
                }
              }
            }
          },
          400: {
            description: 'Bad request - no files provided',
            ...errorResponseSchema
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Forbidden - anonymous users without upload permissions',
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

        const userId = authContext.userId;
        const isAnonymous = authContext.isAnonymous;

        const parts = request.parts();
        const files: UploadedFile[] = [];
        const metadataMap: Map<number, any> = new Map();

        let fileIndex = 0;
        for await (const part of parts) {
          if (part.type === 'file') {
            const buffer = await part.toBuffer();
            files.push({
              buffer,
              filename: part.filename,
              mimeType: part.mimetype,
              size: buffer.length,
            });
            fileIndex++;
          } else if (part.type === 'field' && part.fieldname.startsWith('metadata_')) {
            const index = parseInt(part.fieldname.replace('metadata_', ''), 10);
            const metadataValue = await part.value;
            try {
              const metadata = JSON.parse(metadataValue as string);
              console.log(`[AttachmentRoutes] Metadata received for file ${index}:`, {
                hasDuration: !!metadata.duration,
                duration: metadata.duration,
                fullMetadata: metadata
              });
              metadataMap.set(index, metadata);
            } catch (error) {
              console.warn('[AttachmentRoutes] Impossible de parser les métadonnées:', error);
            }
          }
        }

        console.log('[AttachmentRoutes] Files received:', files.map((f, i) => ({
          index: i,
          filename: f.filename,
          mimeType: f.mimeType,
          size: f.size,
          bufferLength: f.buffer.length
        })));

        if (files.length === 0) {
          return reply.status(400).send({
            success: false,
            error: 'No files provided',
          });
        }

        if (isAnonymous && authContext.anonymousParticipant) {
          const shareLink = await prisma.conversationShareLink.findUnique({
            where: { id: authContext.anonymousParticipant.shareLinkId },
            select: {
              allowAnonymousFiles: true,
              allowAnonymousImages: true,
            },
          });

          if (!shareLink) {
            return reply.status(403).send({
              success: false,
              error: 'Share link not found',
            });
          }

          for (const file of files) {
            const isImage = file.mimeType.startsWith('image/');

            if (isImage && !shareLink.allowAnonymousImages) {
              return reply.status(403).send({
                success: false,
                error: 'Images are not allowed for anonymous users on this conversation',
              });
            }

            if (!isImage && !shareLink.allowAnonymousFiles) {
              return reply.status(403).send({
                success: false,
                error: 'File uploads are not allowed for anonymous users on this conversation',
              });
            }
          }
        }

        const results = await attachmentService.uploadMultiple(
          files,
          userId,
          isAnonymous,
          undefined,
          metadataMap.size > 0 ? metadataMap : undefined
        );

        return reply.send({
          success: true,
          data: { attachments: results },
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error uploading files:', error);
        return reply.status(500).send({
          success: false,
          error: error.message || 'Error uploading files',
        });
      }
    }
  );

  /**
   * POST /attachments/upload-text
   * Crée un fichier texte à partir du contenu
   */
  fastify.post(
    '/attachments/upload-text',
    {
      onRequest: [authOptional],
      schema: {
        description: 'Create a text file attachment from provided content. Useful for BubbleStream and text-based messaging. The content is stored as a .txt file and treated as a standard attachment.',
        tags: ['attachments'],
        summary: 'Create text file attachment',
        body: {
          type: 'object',
          required: ['content'],
          properties: {
            content: {
              type: 'string',
              description: 'Text content to save as a file'
            },
            messageId: {
              type: 'string',
              description: 'Optional message ID to associate with this attachment'
            },
          },
        },
        response: {
          200: {
            description: 'Text attachment created successfully',
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
          401: {
            description: 'Authentication required',
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
        if (!authContext || !authContext.isAuthenticated) {
          return reply.status(401).send({
            success: false,
            error: 'Authentication required',
          });
        }

        const { content, messageId } = request.body as UploadTextBody;

        const userId = authContext.userId;
        const isAnonymous = authContext.isAnonymous;

        const result = await attachmentService.createTextAttachment(
          content,
          userId,
          isAnonymous,
          messageId
        );

        return reply.send({
          success: true,
          data: { attachment: result },
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error creating text attachment:', error);
        return reply.status(500).send({
          success: false,
          error: error.message || 'Error creating text attachment',
        });
      }
    }
  );
}
