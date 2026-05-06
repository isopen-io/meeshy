/**
 * Download and streaming routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AttachmentService } from '../../services/attachments';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { resolve as pathResolve, sep as pathSep } from 'path';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { enhancedLogger } from '../../utils/logger-enhanced';
import type { AttachmentParams } from './types';

const log = enhancedLogger.child({ module: 'AttachmentDownload' });

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

        const uploadBasePath = process.env.UPLOAD_PATH || 'uploads/attachments';
        // Sandbox check : path.join() collapses `..` segments WITHOUT
        // verifying the result still lies inside uploadBasePath. A request
        // like `/attachments/file/%2F..%2F..%2Fetc%2Fpasswd` would resolve
        // to /etc/passwd. We resolve both base and candidate, then require
        // a strict prefix match (with separator) to reject every form of
        // traversal. Without this guard, the route is a textbook
        // path-traversal vulnerability.
        const baseAbs = pathResolve(uploadBasePath);
        const filePath = pathResolve(uploadBasePath, decodedPath);
        if (filePath !== baseAbs && !filePath.startsWith(baseAbs + pathSep)) {
          log.warn('Path traversal attempt rejected', { decodedPath });
          return reply.status(403).send({
            success: false,
            error: 'Forbidden',
          });
        }

        // Single stat() — was previously called twice with a race window
        // between the existence probe and the metadata read.
        let fileStats;
        try {
          fileStats = await stat(filePath);
        } catch (statError: any) {
          log.info('File not found on disk', {
            filePath,
            code: statError?.code,
          });
          return reply.status(404).send({
            success: false,
            error: 'File not found',
          });
        }
        const fileSize = fileStats.size;

        const ext = decodedPath.toLowerCase().slice(decodedPath.lastIndexOf('.'));
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
          '.mov': 'video/quicktime',
          '.webm': 'audio/webm',
          '.ogg': 'audio/ogg',
          '.mp3': 'audio/mpeg',
          '.wav': 'audio/wav',
          '.m4a': 'audio/mp4',
        };
        const mimeType = mimeTypes[ext] || 'application/octet-stream';

        // Weak ETag based on mtime+size — sufficient for HTTP cache
        // revalidation (If-None-Match → 304). The Cache-Control directive
        // intentionally drops `immutable` here : `immutable` tells the
        // client never to revalidate during max-age, which makes the ETag
        // moot. Snapshot files (UUID-named, never overwritten) ARE
        // semantically immutable, but the route also serves user-uploaded
        // originals which may legitimately change. Keep the long max-age
        // for browser cache reuse, but allow ETag revalidation.
        const etag = `W/"${fileSize}-${Math.floor(fileStats.mtimeMs)}"`;
        const cacheControl = 'public, max-age=31536000';

        const ifNoneMatch = request.headers['if-none-match'];
        if (ifNoneMatch && ifNoneMatch === etag) {
          reply.header('ETag', etag);
          reply.header('Cache-Control', cacheControl);
          return reply.code(304).send();
        }

        const isMediaFile = mimeType.startsWith('audio/') || mimeType.startsWith('video/');
        if (isMediaFile) {
          reply.header('Accept-Ranges', 'bytes');

          const range = request.headers.range;
          if (range) {
            // Parse + validate per RFC 7233. Reject malformed / out-of-bounds
            // ranges with 416 instead of crashing on negative chunkSize or
            // streaming junk.
            const match = /^bytes=(\d*)-(\d*)$/.exec(range);
            if (!match) {
              reply.header('Content-Range', `bytes */${fileSize}`);
              return reply.status(416).send({
                success: false,
                error: 'Range Not Satisfiable',
              });
            }
            const startStr = match[1];
            const endStr = match[2];
            const start = startStr === '' ? 0 : parseInt(startStr, 10);
            const end = endStr === '' ? fileSize - 1 : parseInt(endStr, 10);
            if (
              !Number.isFinite(start)
              || !Number.isFinite(end)
              || start < 0
              || end >= fileSize
              || start > end
            ) {
              reply.header('Content-Range', `bytes */${fileSize}`);
              return reply.status(416).send({
                success: false,
                error: 'Range Not Satisfiable',
              });
            }
            const chunkSize = (end - start) + 1;

            reply.code(206);
            reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            reply.header('Content-Length', chunkSize);
            reply.header('Content-Type', mimeType);
            reply.header('ETag', etag);
            reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
            reply.header('Access-Control-Allow-Origin', '*');
            reply.header('Cache-Control', cacheControl);

            const stream = createReadStream(filePath, { start, end });
            return reply.send(stream);
          }
        }

        reply.header('Content-Type', mimeType);
        reply.header('Content-Length', fileSize);
        reply.header('ETag', etag);
        reply.header('Content-Disposition', 'inline');
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', cacheControl);

        const stream = createReadStream(filePath);
        return reply.send(stream);
      } catch (error: any) {
        log.error('Error serving file by path', { error: error?.message });
        return reply.status(500).send({
          success: false,
          error: 'Error serving file',
        });
      }
    }
  );
}
