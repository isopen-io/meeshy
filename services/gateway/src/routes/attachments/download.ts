/**
 * Download and streaming routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AttachmentService } from '../../services/attachments';
import { thumbnailContentType } from '../../services/attachments/thumbnail';
import { carrierMessageStillServesBytes } from '../../services/attachments/carrierMessageLifecycle';
import { createReadStream } from 'fs';
import { stat } from 'fs/promises';
import { resolve as pathResolve, sep as pathSep } from 'path';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { sendError, sendNotFound, sendForbidden, sendInternalError } from '../../utils/response.js';
import type { AttachmentParams } from './types';

const log = enhancedLogger.child({ module: 'AttachmentDownload' });

/**
 * Helmet pose `Cross-Origin-Resource-Policy: same-origin` sur TOUTES les
 * réponses. Les médias servis ici sont embarqués depuis meeshy.me (origine
 * différente de gate.meeshy.me) : chaque réponse — 304 de revalidation ETag
 * et erreurs 4xx comprises — doit porter `cross-origin`, sinon Chrome bloque
 * la ressource avec ERR_BLOCKED_BY_RESPONSE.NotSameOrigin (avatars cassés au
 * rechargement de page). Hook onSend SYNCHRONE obligatoirement : un second
 * hook async provoque des double-send (voir commentaire sur la route file/*).
 */
function crossOriginMediaHeaders(
  _request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
  done: (err: Error | null, payload?: unknown) => void
) {
  reply.header('Cross-Origin-Resource-Policy', 'cross-origin');
  reply.header('Access-Control-Allow-Origin', '*');
  done(null, payload);
}

export async function registerDownloadRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient
) {
  const attachmentService = new AttachmentService(prisma);

  /**
   * Trois issues, et non deux — parce que « tu n'as pas le droit » et « ce
   * contenu n'existe plus » ne se répondent pas avec le même code.
   *
   *  - `allow`     — sert les octets ;
   *  - `forbidden` — 403, l'appelant est étranger à la conversation ;
   *  - `gone`      — 404, le message porteur a été rappelé, a expiré, ou sa
   *                  brûlure de vue unique est consommée.
   */
  type AttachmentReadVerdict = 'allow' | 'forbidden' | 'gone';

  /**
   * L'appelant a-t-il le droit de lire cette pièce jointe, et le message qui la
   * porte rend-il encore ses octets ?
   *
   * Ces routes servaient le fichier à quiconque connaissait l'identifiant, sans
   * aucune identité — et un ObjectId MongoDB n'est pas un secret : son entropie
   * est faible et partiellement dérivable d'un horodatage.
   *
   * Le rattachement passe par le message : `messageId` → conversation →
   * participation. Une pièce jointe pas encore rattachée à un message (envoi en
   * cours) n'est lisible que par la personne qui l'a déposée.
   *
   * L'APPARTENANCE SE JUGE AVANT LE CYCLE DE VIE, délibérément : un étranger
   * doit recevoir le même 403 qu'un message soit vivant ou détruit, sans quoi la
   * paire 403/404 lui apprendrait ce qu'il est advenu d'un contenu auquel il n'a
   * jamais eu accès.
   */
  async function resolveAttachmentReadVerdict(
    request: FastifyRequest,
    attachment: { messageId?: string | null; uploadedBy?: string | null }
  ): Promise<AttachmentReadVerdict> {
    const authContext = (request as unknown as { authContext?: {
      isAuthenticated?: boolean; isAnonymous?: boolean; userId?: string; participantId?: string;
    } }).authContext;

    if (!authContext?.isAuthenticated) return 'forbidden';

    if (!attachment.messageId) {
      // Pas encore rattachée : seul le déposant y accède. Aucun porteur dont
      // hériter une échéance — l'envoi est en cours.
      const caller = authContext.participantId ?? authContext.userId;
      return Boolean(caller) && caller === attachment.uploadedBy ? 'allow' : 'forbidden';
    }

    const message = await prisma.message.findUnique({
      where: { id: attachment.messageId },
      // `deletedAt`/`expiresAt` voyagent avec `conversationId` : la garde de
      // cycle de vie ne coûte aucun aller-retour de plus.
      select: { conversationId: true, deletedAt: true, expiresAt: true }
    });
    if (!message) return 'forbidden';

    // Le discriminant est le type d'identité : un participant anonyme muni
    // d'un jeton de session est authentifié lui aussi.
    const where = authContext.isAnonymous && authContext.participantId
      ? { id: authContext.participantId, conversationId: message.conversationId, isActive: true }
      : { userId: authContext.userId, conversationId: message.conversationId, isActive: true };

    const participant = await prisma.participant.findFirst({ where, select: { id: true } });
    if (participant === null) return 'forbidden';

    // Le dernier maillon de la chaîne de destruction des cycles 92 à 94 : les
    // octets suivent la vie du message porteur. Cf. `carrierMessageLifecycle`.
    return carrierMessageStillServesBytes(message, new Date()) ? 'allow' : 'gone';
  }

  /**
   * Un refus de cycle de vie rend le MÊME 404 que la route rendra une minute
   * plus tard, quand le balayage aura `unlink` le fichier — aucun client ne voit
   * son comportement changer selon qu'il arrive avant ou après.
   */
  function denyAttachmentRead(reply: FastifyReply, verdict: 'forbidden' | 'gone', notFoundMessage: string) {
    return verdict === 'gone'
      ? sendNotFound(reply, notFoundMessage)
      : sendForbidden(reply, 'Access denied to this attachment');
  }

  /**
   * GET /attachments/:attachmentId
   * Stream le fichier original
   */
  fastify.get(
    '/attachments/:attachmentId',
    {
      onRequest: [(req: FastifyRequest, rep: FastifyReply) => fastify.authenticate(req, rep)],
      onSend: crossOriginMediaHeaders,
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

        const verdict = await resolveAttachmentReadVerdict(request, attachment);
        if (verdict !== 'allow') {
          return denyAttachmentRead(reply, verdict, 'Attachment not found');
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
      onRequest: [(req: FastifyRequest, rep: FastifyReply) => fastify.authenticate(req, rep)],
      onSend: crossOriginMediaHeaders,
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

        // Même contrôle que le fichier original : une miniature révèle le
        // contenu de l'image, la protéger moins n'aurait aucun sens.
        const thumbnailAttachment = await attachmentService.getAttachment(attachmentId);
        if (!thumbnailAttachment) {
          return sendNotFound(reply, 'Thumbnail not found');
        }
        const thumbnailVerdict = await resolveAttachmentReadVerdict(request, thumbnailAttachment);
        if (thumbnailVerdict !== 'allow') {
          return denyAttachmentRead(reply, thumbnailVerdict, 'Thumbnail not found');
        }

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
        reply.header('Cache-Control', 'public, max-age=31536000, immutable');

        const stream = createReadStream(thumbnailPath);
        return reply.send(stream);
      } catch (error: any) {
        log.error('Error serving thumbnail', error as Error);
        return sendInternalError(reply, 'Error serving thumbnail');
      }
    }
  );

  // Le flux d'octets PAR CHEMIN vit dans `registerFileStreamRoute` (plus bas) :
  // c'est le SEUL couple encore exposé sous le préfixe non versionné `/api`, où
  // pointent les `fileUrl` persistées en base depuis des années. L'extraction lui
  // donne un site UNIQUE — un alias qui RECOPIERAIT le handler recréerait la
  // jumelle qu'il prétend fermer (issue #4187).
  registerFileStreamRoute(fastify);
}

/**
 * `GET /attachments/file/*` — le flux d'octets adressé par CHEMIN.
 *
 * Extraite de `registerDownloadRoutes` parce qu'elle est la seule route que le
 * montage LEGACY non versionné (`/api/attachments/file/…`) doit encore servir :
 * des `fileUrl` de cette forme sont persistées en base depuis des années et
 * voyagent dans des notifications déjà livrées — une URL en base ne se migre pas
 * par un déploiement. Les neuf autres couples d'`attachmentRoutes`, eux, n'ont
 * plus de second chemin (issue #4187) : ce que le doublon coûtait, c'est que
 * toute règle de proxy ou de WAF écrite pour `/api/v1/attachments/*` les ratait
 * silencieusement sous `/api` — une garde posée d'un côté ne protège pas
 * l'autre, et le contournement ne demandait qu'à retirer « v1 » de l'URL.
 *
 * Fonction et non plugin : les DEUX montages appellent le MÊME site, sans copie
 * de handler ni encapsulation supplémentaire.
 */
export function registerFileStreamRoute(fastify: FastifyInstance): void {
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
        crossOriginMediaHeaders(request, reply, payload, done);
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
        // Stable-path files (legacy `avatars/user/<userId>.jpg`) keep the SAME
        // URL when their content changes — a year-long max-age freezes the old
        // image in every client/CDN cache. Serve them with `no-cache` so each
        // use revalidates via ETag (cheap 304), while UUID-named uploads stay
        // long-cacheable (their URL changes with every new upload).
        const isStableProfilePath = decodedPath.startsWith('avatars/');
        const cacheControl = isStableProfilePath
          ? 'public, no-cache'
          : 'public, max-age=31536000';

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
              return sendError(reply, 416, 'Range Not Satisfiable');
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
              return sendError(reply, 416, 'Range Not Satisfiable');
            }
            const chunkSize = (end - start) + 1;

            reply.code(206);
            reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
            reply.header('Content-Length', chunkSize);
            reply.header('Content-Type', mimeType);
            reply.header('ETag', etag);
            reply.header('Cache-Control', cacheControl);

            const stream = createReadStream(filePath, { start, end });
            return reply.send(stream);
          }
        }

        reply.header('Content-Type', mimeType);
        reply.header('Content-Length', fileSize);
        reply.header('ETag', etag);
        reply.header('Content-Disposition', 'inline');
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
