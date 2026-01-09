/**
 * Routes API pour la gestion des attachements
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { AttachmentService } from '../services/AttachmentService';
import { AttachmentTranslateService } from '../services/AttachmentTranslateService';
import { createUnifiedAuthMiddleware } from '../middleware/auth';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';

export async function attachmentRoutes(fastify: FastifyInstance) {
  const attachmentService = new AttachmentService((fastify as any).prisma);

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
      onRequest: [authOptional], // Utiliser authOptional au lieu de fastify.authenticate
      schema: {
        body: {
          type: 'object',
          required: ['content'],
          properties: {
            content: { type: 'string' },
            messageId: { type: 'string' },
          },
        },
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
      onRequest: [authOptional], // Support auth normale ET anonyme
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
        querystring: {
          type: 'object',
          properties: {
            type: { type: 'string', enum: ['image', 'document', 'audio', 'video', 'text'] },
            limit: { type: 'number' },
            offset: { type: 'number' },
          },
        },
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
        body: {
          type: 'object',
          required: ['targetLanguages'],
          properties: {
            targetLanguages: {
              type: 'array',
              items: { type: 'string' },
              minItems: 1
            },
            sourceLanguage: { type: 'string' },
            generateVoiceClone: { type: 'boolean' },
            async: { type: 'boolean' },
            webhookUrl: { type: 'string', format: 'uri' },
            priority: { type: 'number', minimum: 1, maximum: 10 }
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

}
