/**
 * Download and streaming routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@prisma/client';
import { AttachmentService } from '../../services/attachments';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import type { AttachmentParams } from './types';

export async function registerDownloadRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient
) {
  const attachmentService = new AttachmentService(prisma);

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
        const { attachmentId } = request.params as AttachmentParams;

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

        try {
          await stat(filePath);
        } catch {
          return reply.status(404).send({
            success: false,
            error: 'File not found on disk',
          });
        }

        reply.header('Content-Type', attachment.mimeType);
        reply.header('Content-Disposition', `inline; filename="${attachment.originalName}"`);
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

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
        const { attachmentId } = request.params as AttachmentParams;

        const thumbnailPath = await attachmentService.getThumbnailPath(attachmentId);
        if (!thumbnailPath) {
          return reply.status(404).send({
            success: false,
            error: 'Thumbnail not found',
          });
        }

        try {
          await stat(thumbnailPath);
        } catch {
          return reply.status(404).send({
            success: false,
            error: 'Thumbnail not found on disk',
          });
        }

        reply.header('Content-Type', 'image/jpeg');
        reply.header('Content-Disposition', 'inline');
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

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
   * GET /attachments/file/*
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
      onSend: async (request, reply, payload) => {
        reply.removeHeader('X-Frame-Options');
        reply.header('Content-Security-Policy', "frame-ancestors *");
        return payload;
      }
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const fullPath = (request.params as any)['*'];
        const decodedPath = decodeURIComponent(fullPath);

        console.log('[AttachmentRoutes] GET /attachments/file/*', {
          fullPath,
          decodedPath,
          UPLOAD_PATH: process.env.UPLOAD_PATH,
        });

        const uploadBasePath = process.env.UPLOAD_PATH || 'uploads/attachments';
        const filePath = require('path').join(uploadBasePath, decodedPath);

        console.log('[AttachmentRoutes] Resolved file path:', {
          uploadBasePath,
          decodedPath,
          filePath,
        });

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
          '.webm': 'audio/webm',
          '.ogg': 'audio/ogg',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.m4a': 'audio/mp4',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        const fileStats = await stat(filePath);
        const fileSize = fileStats.size;

        const isMediaFile = mimeType.startsWith('audio/') || mimeType.startsWith('video/');
        if (isMediaFile) {
          reply.header('Accept-Ranges', 'bytes');

          const range = request.headers.range;
          if (range) {
            const parts = range.replace(/bytes=/, "").split("-");
            const start = parseInt(parts[0], 10);
            const end = parts[1] ? parseInt(parts[1], 10) : fileSize - 1;
            const chunkSize = (end - start) + 1;

            reply.code(206);
            reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            reply.header('Content-Length', chunkSize);
            reply.header('Content-Type', mimeType);
            reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Cache-Control', 'public, max-age=31536000, immutable');

            const stream = createReadStream(filePath, { start, end });
            return reply.send(stream);
          }
        }

        reply.header('Content-Type', mimeType);
        reply.header('Content-Length', fileSize);
        reply.header('Content-Disposition', 'inline');
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

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
}
