/**
 * Download and streaming routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AttachmentService } from '../../services/attachments';
import { thumbnailContentType } from '../../services/attachments/thumbnail';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { resolve as pathResolve, sep as pathSep } from 'path';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendNotFound, sendForbidden, sendInternalError } from '../../utils/response.js';
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
      // Never compress this route: media is already compressed and text
      // attachments are served via Range (206) where re-compression would
      // corrupt Content-Range/Content-Length. Enforced at the proxy layer
      // (Traefik compress@file excludedContentTypes), not in-app.
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
          return sendNotFound(reply, 'Attachment not found');
        }

        const filePath = await attachmentService.getFilePath(attachmentId);
        if (!filePath) {
          return sendNotFound(reply, 'File not found');
        }

        try {
          await stat(filePath);
        } catch {
          return sendNotFound(reply, 'File not found on disk');
        }

        reply.header('Content-Type', attachment.mimeType);
        // RFC 5987 filename* form encodes the original name as UTF-8 percent-
        // escaped, eliminating the header-injection surface that exists when
        // the unsanitized DB value is interpolated into a quoted-string.
        // The legacy `filename=` is kept for older clients but uses an
        // ASCII-safe fallback (the file extension) so a hostile filename
        // cannot smuggle quotes / CRLF / parameter separators.
        const safeFilename = sanitizeAsciiFilename(attachment.originalName);
        const utf8Filename = encodeRFC5987(attachment.originalName);
        reply.header(
          'Content-Disposition',
          `inline; filename="${safeFilename}"; filename*=UTF-8''${utf8Filename}`,
        );
        // SVG can contain JavaScript and would execute in the gateway origin
        // when served inline. Force download for SVG and add nosniff to
        // prevent MIME-sniffing attacks across all attachment types.
        if (attachment.mimeType === 'image/svg+xml') {
          reply.header('Content-Disposition', `attachment; filename="${safeFilename}"`);
          reply.header('Content-Security-Policy', "default-src 'none'; sandbox");
        }
        reply.header('X-Content-Type-Options', 'nosniff');
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

        const stream = createReadStream(filePath);
        return reply.send(stream);
      } catch (error: any) {
        log.error('Error serving file', { error: error?.message });
        return sendInternalError(reply, 'Error serving file');
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
      // already-compressed JPEG thumbnail — never recompressed (Traefik excludedContentTypes)
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
            description: 'Thumbnail stream returned successfully (image/webp for new uploads, image/jpeg for legacy)',
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
          return sendNotFound(reply, 'Thumbnail not found');
        }

        try {
          await stat(thumbnailPath);
        } catch {
          return sendNotFound(reply, 'Thumbnail not found on disk');
        }

        // WebP thumbnails (sprint D4) advertise image/webp; legacy thumbnails
        // (always JPEG bytes whatever their extension) stay image/jpeg.
        reply.header('Content-Type', thumbnailContentType(thumbnailPath));
        reply.header('Content-Disposition', 'inline');
        reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
        reply.header('Access-Control-Allow-Origin', '*');
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

        const stream = createReadStream(thumbnailPath);
        return reply.send(stream);
      } catch (error: any) {
        log.error('Error serving thumbnail', error as Error);
        return sendInternalError(reply, 'Error serving thumbnail');
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
      // Never compress: binary/media stream with Range (206) support
      // (Traefik excludedContentTypes keeps media uncompressed at the proxy).
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
      // SYNCHRONOUS on purpose. This route already carries the app-wide async
      // `conditionalGetOnSend` onSend hook; a SECOND *async* onSend hook makes a
      // void-returning handler (e.g. `return sendNotFound(reply, …)` when the
      // file is missing) resolve `undefined`, so Fastify issues a duplicate
      // `reply.send(undefined)` → `ERR_HTTP_HEADERS_SENT` crash bursts (frequent
      // on missing avatars). Keeping this hook synchronous leaves cgo as the
      // only async onSend hook — the proven-safe state every other route has.
      onSend: (request, reply, payload, done) => {
        reply.removeHeader('X-Frame-Options');
        reply.header('Content-Security-Policy', "frame-ancestors *");
        done(null, payload);
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
          return sendForbidden(reply, 'Forbidden');
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
          return sendNotFound(reply, 'File not found');
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
        return sendInternalError(reply, 'Error serving file');
      }
    }
  );
}

// MARK: - Filename safety helpers (RFC 5987 / 6266)

/// Strips characters that can break the Content-Disposition quoted-string
/// grammar (double-quote, CR, LF, semicolon) and any non-printable byte.
/// Keeps the result ASCII-only so the legacy `filename=` parameter stays
/// valid for older clients that ignore `filename*`.
function sanitizeAsciiFilename(name: string): string {
  // eslint-disable-next-line no-control-regex
  return name.replace(/[\x00-\x1f\x7f"\\;]/g, '_');
}

/// RFC 5987 percent-encoding of a UTF-8 filename for the
/// `filename*=UTF-8''<encoded>` Content-Disposition extension. We
/// percent-escape every byte that is NOT in the RFC 5987 attr-char set
/// (ALPHA / DIGIT / "!" / "#" / "$" / "&" / "+" / "-" / "." / "^" / "_" /
/// "`" / "|" / "~"). encodeURIComponent covers all the unsafe printable
/// chars plus all non-ASCII; we additionally escape the few safe-by-default
/// chars that happen to be reserved for filename* (``*'(){}<>@,;:\?/[]=``).
function encodeRFC5987(name: string): string {
  return encodeURIComponent(name)
    .replace(/['()*]/g, (c) => '%' + c.charCodeAt(0).toString(16).toUpperCase());
}
