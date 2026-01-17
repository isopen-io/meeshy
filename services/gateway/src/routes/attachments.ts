/**
 * Routes API pour la gestion des attachements
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AttachmentService } from '../services/AttachmentService';
import { AttachmentTranslateService } from '../services/AttachmentTranslateService';
import { UserFeaturesService } from '../services/UserFeaturesService';
import { createUnifiedAuthMiddleware } from '../middleware/auth';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import {
  messageAttachmentSchema,
  messageAttachmentMinimalSchema,
  errorResponseSchema,
} from '@meeshy/shared/types/api-schemas';

export async function attachmentRoutes(fastify: FastifyInstance) {
  const attachmentService = new AttachmentService((fastify as any).prisma);
  const userFeaturesService = new UserFeaturesService((fastify as any).prisma);

  // Initialize translate service if ZMQ client is available
  let translateService: AttachmentTranslateService | null = null;
  if ((fastify as any).zmqClient) {
    translateService = new AttachmentTranslateService(
      (fastify as any).prisma,
      (fastify as any).zmqClient
    );
  }

  // Middleware d'authentification optionnel (supporte JWT + Session anonyme)
  const authOptional = createUnifiedAuthMiddleware((fastify as any).prisma, {
    requireAuth: false,
    allowAnonymous: true
  });

  // Middleware d'authentification requise
  const authRequired = createUnifiedAuthMiddleware((fastify as any).prisma, {
    requireAuth: true,
    allowAnonymous: false
  });

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
        // Note: body schema removed for multipart routes - validation is handled manually via request.parts()
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
        // Récupérer le contexte d'authentification (authentifié OU anonyme)
        const authContext = (request as any).authContext;
        if (!authContext || (!authContext.isAuthenticated && !authContext.isAnonymous)) {
          return reply.status(401).send({
            success: false,
            error: 'Authentication required',
          });
        }

        const userId = authContext.userId;
        const isAnonymous = authContext.isAnonymous;

        // Récupérer les fichiers uploadés et leurs métadonnées
        const parts = request.parts();
        const files: Array<{
          buffer: Buffer;
          filename: string;
          mimeType: string;
          size: number;
        }> = [];
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
            // Récupérer les métadonnées pour un fichier spécifique
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

        // Log détaillé des fichiers reçus
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

        // Vérifier les permissions pour les utilisateurs anonymes
        if (isAnonymous && authContext.anonymousParticipant) {
          const shareLink = await fastify.prisma.conversationShareLink.findUnique({
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

          // Vérifier chaque fichier
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


        // Upload tous les fichiers avec métadonnées si fournies
        const results = await attachmentService.uploadMultiple(
          files,
          userId,
          isAnonymous,
          undefined, // messageId
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
   * Support utilisateurs authentifiés ET anonymes (pour BubbleStream)
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

        const { content, messageId } = request.body as {
          content: string;
          messageId?: string;
        };

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

  /**
   * GET /attachments/:attachmentId
   * Stream le fichier original
   */
  fastify.get(
    '/attachments/:attachmentId',
    {
      schema: {
        description: 'Stream the original file by attachment ID. Returns the file with appropriate content-type headers for inline display. Supports cross-origin requests with CORS headers. Files are cached for 1 year (immutable).',
        tags: ['attachments'],
        summary: 'Get attachment file',
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
            description: 'File stream returned successfully',
            type: 'string',
            format: 'binary'
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
        const { attachmentId } = request.params as { attachmentId: string };

        const attachment = await attachmentService.getAttachment(attachmentId);
        if (!attachment) {
          return reply.status(404).send({
            success: false,
            error: 'Attachment not found',
          });
        }

        const filePath = await attachmentService.getFilePath(attachmentId);
        if (!filePath) {
          return reply.status(404).send({
            success: false,
            error: 'File not found',
          });
        }

        // Vérifier que le fichier existe
        try {
          await stat(filePath);
        } catch {
          return reply.status(404).send({
            success: false,
            error: 'File not found on disk',
          });
        }

        // Définir les headers appropriés
        reply.header('Content-Type', attachment.mimeType);
        reply.header('Content-Disposition', `inline; filename="${attachment.originalName}"`);

        // Headers CORS/CORP pour permettre le chargement cross-origin
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

        // Stream le fichier
        const stream = createReadStream(filePath);
        return reply.send(stream);
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error serving file:', error);
        return reply.status(500).send({
          success: false,
          error: 'Error serving file',
        });
      }
    }
  );

  /**
   * GET /attachments/:attachmentId/thumbnail
   * Stream la miniature (images uniquement)
   */
  fastify.get(
    '/attachments/:attachmentId/thumbnail',
    {
      schema: {
        description: 'Stream the thumbnail image for an attachment. Only available for image attachments. Thumbnails are JPEG format, optimized for fast loading in lists and previews. Supports CORS and aggressive caching.',
        tags: ['attachments'],
        summary: 'Get attachment thumbnail',
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
            description: 'Thumbnail stream returned successfully (image/jpeg)',
            type: 'string',
            format: 'binary'
          },
          404: {
            description: 'Thumbnail not found (attachment may not be an image)',
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
        const { attachmentId } = request.params as { attachmentId: string };

        const thumbnailPath = await attachmentService.getThumbnailPath(attachmentId);
        if (!thumbnailPath) {
          return reply.status(404).send({
            success: false,
            error: 'Thumbnail not found',
          });
        }

        // Vérifier que le fichier existe
        try {
          await stat(thumbnailPath);
        } catch {
          return reply.status(404).send({
            success: false,
            error: 'Thumbnail not found on disk',
          });
        }

        // Définir les headers appropriés
        reply.header('Content-Type', 'image/jpeg');
        reply.header('Content-Disposition', 'inline');

        // Headers CORS/CORP pour permettre le chargement cross-origin
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

        // Stream le fichier
        const stream = createReadStream(thumbnailPath);
        return reply.send(stream);
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error serving thumbnail:', error);
        return reply.status(500).send({
          success: false,
          error: 'Error serving thumbnail',
        });
      }
    }
  );

  /**
   * GET /attachments/file/:filePath
   * Stream un fichier via son chemin (utilisé pour les URLs générées)
   */
  fastify.get(
    '/attachments/file/*',
    {
      schema: {
        description: 'Stream a file by its file path. Supports Range requests for audio/video seeking. Determines MIME type from file extension. Allows iframe embedding for PDFs and other documents. CORS-enabled for cross-origin access.',
        tags: ['attachments'],
        summary: 'Get file by path',
        params: {
          type: 'object',
          properties: {
            '*': {
              type: 'string',
              description: 'Relative file path from uploads directory'
            }
          }
        },
        response: {
          200: {
            description: 'File stream returned successfully',
            type: 'string',
            format: 'binary'
          },
          206: {
            description: 'Partial content (Range request for media files)',
            type: 'string',
            format: 'binary'
          },
          404: {
            description: 'File not found',
            ...errorResponseSchema
          },
          500: {
            description: 'Internal server error',
            ...errorResponseSchema
          }
        }
      },
      // Use onSend hook to remove restrictive headers
      // This allows PDFs and other attachments to be embedded in iframes
      onSend: async (request, reply, payload) => {
        // Remove X-Frame-Options to allow iframe embedding
        reply.removeHeader('X-Frame-Options');
        // Set permissive CSP for iframe embedding
        reply.header('Content-Security-Policy', "frame-ancestors *");
        return payload;
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        // Extraire le chemin du fichier
        const fullPath = (request.params as any)['*'];
        const decodedPath = decodeURIComponent(fullPath);

        // Log pour debug
        console.log('[AttachmentRoutes] GET /attachments/file/*', {
          fullPath,
          decodedPath,
          UPLOAD_PATH: process.env.UPLOAD_PATH,
        });

        // Construire le chemin complet
        const uploadBasePath = process.env.UPLOAD_PATH || 'uploads/attachments';
        const filePath = require('path').join(uploadBasePath, decodedPath);

        console.log('[AttachmentRoutes] Resolved file path:', {
          uploadBasePath,
          decodedPath,
          filePath,
        });

        // Vérifier que le fichier existe
        try {
          const stats = await stat(filePath);
          console.log('[AttachmentRoutes] File found:', {
            filePath,
            size: stats.size,
            isFile: stats.isFile(),
          });
        } catch (statError: any) {
          console.error('[AttachmentRoutes] File not found on disk:', {
            filePath,
            error: statError.message,
            code: statError.code,
          });
          return reply.status(404).send({
            success: false,
            error: 'File not found',
          });
        }

        // Déterminer le type MIME depuis l'extension
        const ext = require('path').extname(decodedPath).toLowerCase();
        const mimeTypes: Record<string, string> = {
          '.jpg': 'image/jpeg',
          '.jpeg': 'image/jpeg',
          '.png': 'image/png',
          '.gif': 'image/gif',
          '.webp': 'image/webp',
          '.svg': 'image/svg+xml',
          '.pdf': 'application/pdf',
          '.txt': 'text/plain',
          '.mp4': 'video/mp4',
          '.webm': 'audio/webm', // Support WebM audio
          '.ogg': 'audio/ogg',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.m4a': 'audio/mp4',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        // Obtenir les informations du fichier pour les Range requests
        const fileStats = await stat(filePath);
        const fileSize = fileStats.size;

        // Support des Range requests pour audio/vidéo (seeking)
        const isMediaFile = mimeType.startsWith('audio/') || mimeType.startsWith('video/');
        if (isMediaFile) {
          reply.header('Accept-Ranges', 'bytes');

          const range = request.headers.range;
          if (range) {
            // Parse le header Range (ex: "bytes=0-1024")
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            // Définir les headers pour partial content
            reply.code(206); // Partial Content
            reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            reply.header('Content-Length', chunkSize);
            reply.header('Content-Type', mimeType);

            // Headers CORS
            reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Cache-Control', 'public, max-age=31536000, immutable');

            // Stream la partie demandée
            const stream = createReadStream(filePath, { start, end });
            return reply.send(stream);
          }
        }

        // Définir les headers appropriés (requête sans Range)
        reply.header('Content-Type', mimeType);
        reply.header('Content-Length', fileSize);
        reply.header('Content-Disposition', 'inline');

        // Headers CORS/CORP pour permettre le chargement cross-origin
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

        // Stream le fichier complet
        const stream = createReadStream(filePath);
        return reply.send(stream);
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error serving file by path:', error);
        return reply.status(500).send({
          success: false,
          error: 'Error serving file',
        });
      }
    }
  );

  /**
   * DELETE /attachments/:attachmentId
   * Supprime un attachment (support utilisateurs authentifiés ET anonymes)
   *
   * Droits d'accès:
   * - L'auteur de l'attachment peut le supprimer
   * - Les admins/modérateurs peuvent supprimer n'importe quel attachment
   * - Les utilisateurs anonymes peuvent supprimer leurs propres attachments
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

        // Vérifier qu'il y a une authentification (normale ou anonyme)
        if (!authContext || (!authContext.isAuthenticated && !authContext.isAnonymous)) {
          return reply.status(401).send({
            success: false,
            error: 'Authentication required',
          });
        }

        const { attachmentId } = request.params as { attachmentId: string };
        const userId = authContext.userId;
        const isAnonymous = authContext.isAnonymous;

        // Vérifier que l'attachment existe
        const attachment = await attachmentService.getAttachment(attachmentId);
        if (!attachment) {
          return reply.status(404).send({
            success: false,
            error: 'Attachment not found',
          });
        }

        // Vérifier les permissions selon le type d'utilisateur
        let hasPermission = false;

        if (isAnonymous) {
          // Utilisateur anonyme: peut supprimer uniquement ses propres attachments
          hasPermission = attachment.uploadedBy === userId && attachment.isAnonymous;

          if (!hasPermission) {
          }
        } else {
          // Utilisateur authentifié:
          // 1. Propriétaire peut supprimer
          // 2. Admin/BigBoss peuvent tout supprimer
          const isAdmin = authContext.registeredUser?.role === 'ADMIN' ||
                         authContext.registeredUser?.role === 'BIGBOSS';

          hasPermission = attachment.uploadedBy === userId || isAdmin;

          if (!hasPermission) {
          }
        }

        if (!hasPermission) {
          return reply.status(403).send({
            success: false,
            error: 'Insufficient permissions - You can only delete your own attachments',
          });
        }

        // Supprimer l'attachment (fichier physique + DB entry)
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

        const { conversationId } = request.params as { conversationId: string };
        const query = request.query as {
          type?: 'image' | 'document' | 'audio' | 'video' | 'text';
          limit?: number;
          offset?: number;
        };


        // Vérifier que l'utilisateur a accès à cette conversation
        if (authContext.isAuthenticated) {
          // Utilisateur authentifié - vérifier qu'il est membre de la conversation
          const member = await (fastify as any).prisma.conversationMember.findFirst({
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
          // Utilisateur anonyme - vérifier qu'il a accès à cette conversation via son shareLink

          const participant = await (fastify as any).prisma.anonymousParticipant.findUnique({
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

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACHMENT TRANSLATION
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /attachments/:attachmentId/translate
   * Translate an attachment based on its type:
   * - audio/* → AudioTranslateService
   * - image/* → ImageTranslateService (not implemented)
   * - video/* → VideoTranslateService (not implemented)
   * - application/pdf, text/* → DocumentTranslateService (not implemented)
   */
  fastify.post(
    '/attachments/:attachmentId/translate',
    {
      onRequest: [authRequired],
      schema: {
        description: 'Translate an attachment to one or more target languages. Currently supports audio files with speech-to-text, translation, and text-to-speech (with optional voice cloning). Image, video, and document translation are planned but not yet implemented. Translation can be async with webhook notification.',
        tags: ['attachments', 'translation'],
        summary: 'Translate attachment',
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
        body: {
          type: 'object',
          required: ['targetLanguages'],
          properties: {
            targetLanguages: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1,
              description: 'Array of target language codes (ISO 639-1: en, fr, es, etc.)',
              example: ['en', 'es', 'fr']
            },
            sourceLanguage: {
              type: 'string',
              description: 'Source language code (auto-detected if not provided)',
              example: 'fr'
            },
            generateVoiceClone: {
              type: 'boolean',
              description: 'Whether to clone the original voice in translated audio',
              default: false
            },
            async: {
              type: 'boolean',
              description: 'Whether to process translation asynchronously',
              default: false
            },
            webhookUrl: {
              type: 'string',
              format: 'uri',
              description: 'Webhook URL for async translation completion notification'
            },
            priority: {
              type: 'number',
              minimum: 1,
              maximum: 10,
              description: 'Translation priority (1=lowest, 10=highest)',
              default: 5
            }
          }
        },
        response: {
          200: {
            description: 'Translation completed or queued successfully',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  status: { type: 'string', description: 'Translation status', example: 'completed' },
                  jobId: { type: 'string', description: 'Job ID for async translations' },
                  translations: {
                    type: 'array',
                    description: 'Translated attachment results (for sync translations)',
                    items: messageAttachmentSchema
                  }
                }
              }
            }
          },
          400: {
            description: 'Bad request - invalid parameters',
            ...errorResponseSchema
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Access denied - user does not own attachment',
            ...errorResponseSchema
          },
          404: {
            description: 'Attachment not found',
            ...errorResponseSchema
          },
          501: {
            description: 'Not implemented - attachment type not supported for translation',
            ...errorResponseSchema
          },
          503: {
            description: 'Service unavailable - translation service not initialized',
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
        if (!translateService) {
          return reply.status(503).send({
            success: false,
            error: 'SERVICE_UNAVAILABLE',
            message: 'Translation service not available'
          });
        }

        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const { attachmentId } = request.params as { attachmentId: string };
        const body = request.body as {
          targetLanguages: string[];
          sourceLanguage?: string;
          generateVoiceClone?: boolean;
          async?: boolean;
          webhookUrl?: string;
          priority?: number;
        };

        const userId = authContext.userId;

        // Get attachment to determine type for feature validation
        const attachment = await (fastify as any).prisma.attachment.findUnique({
          where: { id: attachmentId },
          select: { mimeType: true }
        });

        if (!attachment) {
          return reply.status(404).send({
            success: false,
            error: 'ATTACHMENT_NOT_FOUND',
            message: 'Attachment not found'
          });
        }

        // Validate user features based on attachment type
        const mimeType = attachment.mimeType || '';

        if (mimeType.startsWith('audio/')) {
          // Audio translation requires: audioTranscription + textTranslation + audioTranslation
          const audioValidation = await userFeaturesService.canTranslateAudio(userId);
          if (!audioValidation.allowed) {
            return reply.status(403).send({
              success: false,
              error: 'FEATURE_NOT_ENABLED',
              message: audioValidation.reason || 'Audio translation not enabled',
              details: {
                missingConsents: audioValidation.missingConsents,
                missingFeatures: audioValidation.missingFeatures
              }
            });
          }

          // If voice cloning is requested, validate that feature too
          if (body.generateVoiceClone) {
            const voiceCloningValidation = await userFeaturesService.canUseVoiceCloning(userId);
            if (!voiceCloningValidation.allowed) {
              return reply.status(403).send({
                success: false,
                error: 'VOICE_CLONING_NOT_ENABLED',
                message: voiceCloningValidation.reason || 'Voice cloning not enabled',
                details: {
                  missingConsents: voiceCloningValidation.missingConsents,
                  missingFeatures: voiceCloningValidation.missingFeatures
                }
              });
            }
          }
        } else if (mimeType.startsWith('image/')) {
          // Image text translation requires: textTranslation + imageTextTranslation
          const textValidation = await userFeaturesService.canTranslateText(userId);
          if (!textValidation.allowed) {
            return reply.status(403).send({
              success: false,
              error: 'FEATURE_NOT_ENABLED',
              message: textValidation.reason || 'Text translation not enabled',
              details: {
                missingConsents: textValidation.missingConsents,
                missingFeatures: textValidation.missingFeatures
              }
            });
          }
        } else if (mimeType.startsWith('video/')) {
          // Video subtitle translation requires: audioTranscription + textTranslation
          const audioValidation = await userFeaturesService.canTranslateAudio(userId);
          if (!audioValidation.allowed) {
            return reply.status(403).send({
              success: false,
              error: 'FEATURE_NOT_ENABLED',
              message: audioValidation.reason || 'Video subtitle translation not enabled',
              details: {
                missingConsents: audioValidation.missingConsents,
                missingFeatures: audioValidation.missingFeatures
              }
            });
          }
        } else if (mimeType === 'application/pdf' || mimeType.startsWith('text/')) {
          // Document translation requires: textTranslation + documentTranslation
          const textValidation = await userFeaturesService.canTranslateText(userId);
          if (!textValidation.allowed) {
            return reply.status(403).send({
              success: false,
              error: 'FEATURE_NOT_ENABLED',
              message: textValidation.reason || 'Document translation not enabled',
              details: {
                missingConsents: textValidation.missingConsents,
                missingFeatures: textValidation.missingFeatures
              }
            });
          }
        }

        // Use AttachmentTranslateService for all attachment types
        // It dispatches to the appropriate service based on mimeType
        const result = await translateService.translate(userId, attachmentId, {
          targetLanguages: body.targetLanguages,
          sourceLanguage: body.sourceLanguage,
          generateVoiceClone: body.generateVoiceClone,
          async: body.async,
          webhookUrl: body.webhookUrl,
          priority: body.priority
        });

        if (!result.success) {
          const statusCode = result.errorCode === 'ATTACHMENT_NOT_FOUND' ? 404 :
                            result.errorCode === 'ACCESS_DENIED' ? 403 :
                            result.errorCode === 'NOT_IMPLEMENTED' ? 501 :
                            400;
          return reply.status(statusCode).send({
            success: false,
            error: result.errorCode,
            message: result.error
          });
        }

        return reply.send({
          success: true,
          data: result.data
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error translating attachment:', error);
        return reply.status(500).send({
          success: false,
          error: 'TRANSLATION_FAILED',
          message: error.message || 'Error translating attachment'
        });
      }
    }
  );

  // ═══════════════════════════════════════════════════════════════════════════
  // ATTACHMENT TRANSCRIPTION (Audio only)
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * POST /attachments/:attachmentId/transcribe
   * Transcribe an audio attachment to text only (no translation, no TTS)
   */
  fastify.post(
    '/attachments/:attachmentId/transcribe',
    {
      onRequest: [authRequired],
      schema: {
        description: 'Transcribe an audio attachment to text only, without translation or voice synthesis. Uses Whisper for accurate speech-to-text. Returns the attachment enriched with transcription data including text, detected language, confidence score, and word-level timestamps.',
        tags: ['attachments', 'transcription'],
        summary: 'Transcribe audio attachment',
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
            description: 'Transcription completed or processing started',
            type: 'object',
            properties: {
              success: { type: 'boolean', example: true },
              data: {
                type: 'object',
                properties: {
                  taskId: { type: 'string', nullable: true, description: 'Task ID for tracking (null if already completed)' },
                  status: { type: 'string', description: 'Processing status', enum: ['completed', 'processing'] },
                  attachment: {
                    type: 'object',
                    properties: {
                      id: { type: 'string' },
                      messageId: { type: 'string' },
                      fileName: { type: 'string' },
                      fileUrl: { type: 'string' },
                      duration: { type: 'number', nullable: true },
                      mimeType: { type: 'string' }
                    }
                  },
                  transcription: {
                    type: 'object',
                    nullable: true,
                    description: 'Transcription data (null if still processing)',
                    properties: {
                      id: { type: 'string' },
                      text: { type: 'string' },
                      language: { type: 'string' },
                      confidence: { type: 'number' },
                      source: { type: 'string' },
                      segments: { type: 'array' },
                      durationMs: { type: 'number' }
                    }
                  },
                  translatedAudios: {
                    type: 'array',
                    description: 'Translated audio versions (if any)'
                  }
                }
              }
            }
          },
          400: {
            description: 'Bad request - not an audio attachment',
            ...errorResponseSchema
          },
          401: {
            description: 'Authentication required',
            ...errorResponseSchema
          },
          403: {
            description: 'Feature not enabled',
            ...errorResponseSchema
          },
          404: {
            description: 'Attachment not found',
            ...errorResponseSchema
          },
          503: {
            description: 'Service unavailable - transcription service not initialized',
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
        const translationService = (fastify as any).translationService;
        if (!translationService) {
          return reply.status(503).send({
            success: false,
            error: 'SERVICE_UNAVAILABLE',
            message: 'Translation service not available'
          });
        }

        const authContext = (request as any).authContext;
        if (!authContext?.isAuthenticated) {
          return reply.status(401).send({
            success: false,
            error: 'UNAUTHORIZED',
            message: 'Authentication required'
          });
        }

        const { attachmentId } = request.params as { attachmentId: string };
        const userId = authContext.userId;

        // Get attachment to validate type
        const attachment = await (fastify as any).prisma.messageAttachment.findUnique({
          where: { id: attachmentId },
          select: { id: true, mimeType: true, uploadedBy: true }
        });

        if (!attachment) {
          return reply.status(404).send({
            success: false,
            error: 'ATTACHMENT_NOT_FOUND',
            message: 'Attachment not found'
          });
        }

        // Only audio files can be transcribed
        if (!attachment.mimeType?.startsWith('audio/')) {
          return reply.status(400).send({
            success: false,
            error: 'INVALID_ATTACHMENT_TYPE',
            message: 'Only audio attachments can be transcribed'
          });
        }

        // Validate user features - transcription requires only audioTranscription feature (not full translation)
        const audioValidation = await userFeaturesService.canTranscribeAudio(userId);
        if (!audioValidation.allowed) {
          return reply.status(403).send({
            success: false,
            error: 'FEATURE_NOT_ENABLED',
            message: audioValidation.reason || 'Audio transcription not enabled',
            details: {
              missingConsents: audioValidation.missingConsents,
              missingFeatures: audioValidation.missingFeatures
            }
          });
        }

        // Check if transcription already exists
        const existingData = await translationService.getAttachmentWithTranscription(attachmentId);

        if (!existingData) {
          return reply.status(404).send({
            success: false,
            error: 'ATTACHMENT_NOT_FOUND',
            message: 'Attachment not found'
          });
        }

        // If transcription already exists, return it
        if (existingData.transcription) {
          return reply.send({
            success: true,
            data: {
              taskId: null,
              status: 'completed',
              attachment: existingData.attachment,
              transcription: existingData.transcription,
              translatedAudios: existingData.translatedAudios
            }
          });
        }

        // Otherwise, start transcription
        const result = await translationService.transcribeAttachment(attachmentId);

        if (!result) {
          return reply.status(500).send({
            success: false,
            error: 'TRANSCRIPTION_FAILED',
            message: 'Failed to start transcription'
          });
        }

        return reply.send({
          success: true,
          data: {
            taskId: result.taskId,
            status: 'processing',
            attachment: result.attachment,
            transcription: null,
            translatedAudios: []
          }
        });
      } catch (error: any) {
        console.error('[AttachmentRoutes] Error transcribing attachment:', error);
        return reply.status(500).send({
          success: false,
          error: 'TRANSCRIPTION_FAILED',
          message: error.message || 'Error transcribing attachment'
        });
      }
    }
  );

}
