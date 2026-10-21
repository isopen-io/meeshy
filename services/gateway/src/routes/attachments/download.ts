/**
 * Download and streaming routes for attachments
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { AttachmentService } from '../../services/attachments';
import { thumbnailContentType } from '../../services/attachments/thumbnail';
import { resolveAttachmentReadVerdict, denyAttachmentRead } from '../../services/attachments/attachmentReadVerdict';
import {
  immutableWhenWriteOnce,
  resolveAttachmentByIdCacheControl,
  resolveFileRouteVerdict,
  type FileRouteVerdictPrisma,
} from '../../services/attachments/fileRouteVerdict';
import { admitUnsignedFile, resolveSignedFileAccess } from '../../services/attachments/readerFileGate';
import { readSigningKeys, readerFileSignatureEnforced, SIGNED_FILE_ROUTE } from '../../services/attachments/readerFileSignature';
import { createReadStream, type Stats } from 'fs';
import { stat } from 'fs/promises';
import { relative as pathRelative, resolve as pathResolve, sep as pathSep } from 'path';
import { errorResponseSchema } from '@meeshy/shared/types/api-schemas';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { ifNoneMatchMatches } from '../../utils/etag';
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
 *
 * La seconde ligne est une porte CORS à elle seule, et elle n'obéit pas à la
 * règle unique des origines (#4538). Ce n'est pas un oubli : `'*'` sert
 * l'embarquement des médias depuis meeshy.me, et il est inerte pour une requête
 * créditée — `'*'` et `Access-Control-Allow-Credentials: true` s'excluent par
 * spécification, donc aucun cookie ni jeton ne voyage ici. Ce qui garde les
 * octets est `resolveAttachmentReadVerdict`, pas l'origine.
 *
 * L'arbitrage est DÉCLARÉ en donnée — `PORTES_HORS_REGLE` dans
 * `config/cors-origins.ts` — et non ici : un commentaire n'aurait rien
 * confronté au code le jour où quelqu'un resserre les origines. La valeur `'*'`
 * ci-dessous est comparée à la valeur déclarée par
 * `__tests__/cors-origin-emitter-sweep.test.ts` ; la faire passer sous la règle
 * SANS retirer sa déclaration fait rougir ce cliquet, et l'inverse aussi.
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
        description: 'Stream the original file by attachment ID. Returns the file with appropriate content-type headers for inline display. Supports cross-origin requests with CORS headers. Ordinary files are cached for 1 year (immutable); view-once and ephemeral files get the same Cache-Control as the by-path route.',
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
          206: { description: 'Partial content (Range request, #11265)', type: 'string', format: 'binary' },
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

        const verdict = await resolveAttachmentReadVerdict(request, attachment, prisma);
        if (verdict !== 'allow') {
          return denyAttachmentRead(reply, verdict, 'Attachment not found');
        }

        const filePath = await attachmentService.getFilePath(attachmentId);
        if (!filePath) {
          return sendNotFound(reply, 'File not found');
        }

        const fileStats = await statOrNull(filePath);
        if (!fileStats) {
          return sendNotFound(reply, 'File not found on disk');
        }

        // #9478 — le même cache que la route par chemin pour un média protégé.
        // #11265 — même transport que la route par chemin : plages, ETag, 304.
        return streamStoredFile(request, reply, {
          filePath,
          fileStats,
          cacheControl: await resolveAttachmentByIdCacheControl(attachmentId, prisma, new Date()),
          representation: attachmentRepresentation(attachment),
        });
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
          206: { description: 'Partial content (Range request, #11265)', type: 'string', format: 'binary' },
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
        const thumbnailVerdict = await resolveAttachmentReadVerdict(request, thumbnailAttachment, prisma);
        if (thumbnailVerdict !== 'allow') {
          return denyAttachmentRead(reply, thumbnailVerdict, 'Thumbnail not found');
        }

        const thumbnailPath = await attachmentService.getThumbnailPath(attachmentId);
        if (!thumbnailPath) {
          return sendNotFound(reply, 'Thumbnail not found');
        }

        const thumbnailStats = await statOrNull(thumbnailPath);
        if (!thumbnailStats) {
          return sendNotFound(reply, 'Thumbnail not found on disk');
        }

        // WebP thumbnails (sprint D4) advertise image/webp; legacy thumbnails
        // (always JPEG bytes whatever their extension) stay image/jpeg.
        return streamStoredFile(request, reply, {
          filePath: thumbnailPath,
          fileStats: thumbnailStats,
          cacheControl: await resolveAttachmentByIdCacheControl(attachmentId, prisma, new Date()),
          representation: { contentType: thumbnailContentType(thumbnailPath), headers: { 'Content-Disposition': 'inline' } },
        });
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
  registerFileStreamRoute(fastify, prisma);
  registerSignedFileRoute(fastify, prisma);
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
export function registerFileStreamRoute(fastify: FastifyInstance, prisma: FileRouteVerdictPrisma): void {
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
      onSend: frameableMediaHeaders
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const decodedPath = decodeURIComponent((request.params as { '*': string })['*']);
        const located = locateStoredFile(decodedPath);
        if (located.kind === 'outside') {
          log.warn('Path traversal attempt rejected', { decodedPath });
          return sendForbidden(reply, 'Forbidden');
        }
        if (located.kind === 'hidden') return sendNotFound(reply, 'File not found');

        const fileStats = await statOrNull(located.filePath);
        if (!fileStats) return sendNotFound(reply, 'File not found');

        // #9315 — le même cycle de vie que les routes par identifiant. La clé
        // est relue sur le chemin RÉSOLU : double barre, `./`, remontée ou
        // double encodage atteignent le même fichier, donc le même verdict. Un
        // refus rend la réponse exacte d'un fichier déjà effacé du disque.
        const { storageKey } = located;
        const isStableProfilePath = storageKey.split('/')[0] === 'avatars';
        const verdict = isStableProfilePath
          ? { kind: 'not-an-attachment' as const }
          : await resolveFileRouteVerdict(storageKey, prisma, new Date());
        if (verdict.kind === 'gone') {
          return sendNotFound(reply, 'File not found');
        }

        // #9600 — l'adresse NUE d'un fichier dont tous les porteurs vivants
        // disparaissent : comptée pendant la transition, refusée après.
        const unsigned = admitUnsignedFile({
          verdict,
          enforced: readerFileSignatureEnforced(),
          storageKey,
          request: {
            route: request.routeOptions?.url,
            platformHeader: headerOf(request, 'x-meeshy-platform') ?? headerOf(request, 'x-app-platform'),
            versionHeader: headerOf(request, 'x-meeshy-version') ?? headerOf(request, 'x-app-version'),
            userAgent: headerOf(request, 'user-agent'),
          },
        });
        if (unsigned === 'refuse') return sendNotFound(reply, 'File not found');

        // Stable-path files (legacy `avatars/user/<userId>.jpg`) keep the SAME
        // URL when their content changes — a year-long max-age freezes the old
        // image in every client/CDN cache. Serve them with `no-cache` so each
        // use revalidates via ETag (cheap 304), while UUID-named uploads stay
        // long-cacheable (their URL changes with every new upload) — in the
        // client's OWN cache only (#9315): `private` keeps a proxy or CDN from
        // holding a conversation's bytes and replaying them to someone else.
        //
        // Un fichier de message reçoit le cache que son porteur autorise : une
        // vue unique n'est jamais stockée, un éphémère se revalide à chaque
        // usage (#9315).
        // #11265 — une clé UUID n'est écrite qu'une fois : son cache long est
        // `immutable`, comme celui de l'identifiant.
        const cacheControl = immutableWhenWriteOnce(storageKey, verdict.kind === 'serve'
          ? verdict.cacheControl
          : isStableProfilePath
            ? 'public, no-cache'
            : 'private, max-age=31536000');

        return streamStoredFile(request, reply, { filePath: located.filePath, fileStats, cacheControl, representation: pathRepresentation(decodedPath) });
      } catch (error: unknown) {
        log.error('Error serving file by path', { error: error instanceof Error ? error.message : String(error) });
        return sendInternalError(reply, 'Error serving file');
      }
    }
  );
}

/**
 * `GET /attachments/signed/:token/*` — le fichier d'une ADRESSE SIGNÉE pour
 * son lecteur (#9600).
 *
 * Servie sous `/api/v1` seulement : aucune adresse de cette forme n'a jamais
 * été persistée, elle n'a donc pas d'alias legacy à honorer. Le jeton porte la
 * pièce, le participant lecteur et l'échéance ; le chemin, la clé de stockage
 * que la signature couvre. Tout refus — signature fausse ou échue, fichier
 * mort, lecteur sorti ou dont le contenu a disparu — rend la réponse d'un
 * fichier absent : la route ne dit jamais laquelle des portes a fermé.
 *
 * Mêmes octets, mêmes en-têtes et même lecture par plages que la route par
 * chemin (`streamStoredFile`), sous le cache que le fichier autorise.
 */
function registerSignedFileRoute(fastify: FastifyInstance, prisma: PrismaClient): void {
  fastify.get(
    `${SIGNED_FILE_ROUTE}/:token/*`,
    {
      schema: {
        description: 'Stream a protected file through a reader-signed address (#9600). The token binds the attachment, the reading participant and an expiry to the storage key; the route then replays the carrier message lifecycle and this reader\'s own deadline. Supports Range requests. Any refusal is a 404.',
        tags: ['attachments'],
        summary: 'Get file by reader-signed address',
        params: {
          type: 'object',
          properties: {
            token: { type: 'string', description: '<attachmentId>.<participantId>.<expiresAt>.<signature>' },
            '*': { type: 'string', description: 'Storage key, encoded once' },
          },
        },
        response: {
          200: { description: 'File stream returned successfully', type: 'string', format: 'binary' },
          206: { description: 'Partial content (Range request for media files)', type: 'string', format: 'binary' },
          404: { description: 'File not found, or address refused', ...errorResponseSchema },
          500: { description: 'Internal server error', ...errorResponseSchema },
        },
      },
      onSend: frameableMediaHeaders,
    },
    async (request: FastifyRequest, reply: FastifyReply) => {
      try {
        const params = request.params as { token: string; '*': string };
        const decodedPath = decodeURIComponent(params['*']);
        const located = locateStoredFile(decodedPath);
        if (located.kind !== 'file') return sendNotFound(reply, 'File not found');

        const access = await resolveSignedFileAccess(prisma, {
          token: params.token,
          storageKey: located.storageKey,
          keys: readSigningKeys(),
          now: new Date(),
        });
        if (access.kind === 'refuse') {
          log.debug('Signed file address refused', { reason: access.reason });
          return sendNotFound(reply, 'File not found');
        }

        const fileStats = await statOrNull(located.filePath);
        if (!fileStats) return sendNotFound(reply, 'File not found');

        return streamStoredFile(request, reply, {
          filePath: located.filePath,
          fileStats,
          cacheControl: immutableWhenWriteOnce(located.storageKey, access.cacheControl),
          representation: pathRepresentation(decodedPath),
        });
      } catch (error: unknown) {
        log.error('Error serving signed file', { error: error instanceof Error ? error.message : String(error) });
        return sendInternalError(reply, 'Error serving file');
      }
    }
  );
}

/**
 * SYNCHRONOUS on purpose — see the by-path route : a second *async* onSend hook
 * next to the app-wide `conditionalGetOnSend` makes a void-returning handler
 * resolve `undefined` and Fastify double-sends. #3627 : a SVG keeps the
 * `sandbox` CSP its handler set; everything else may be framed.
 */
function frameableMediaHeaders(
  request: FastifyRequest,
  reply: FastifyReply,
  payload: unknown,
  done: (err: Error | null, payload?: unknown) => void
) {
  reply.removeHeader('X-Frame-Options');
  if (reply.getHeader('Content-Type') !== 'image/svg+xml') {
    reply.header('Content-Security-Policy', "frame-ancestors *");
  }
  crossOriginMediaHeaders(request, reply, payload, done);
}

const headerOf = (request: FastifyRequest, name: string): string | undefined => {
  const value = request.headers[name];
  return typeof value === 'string' ? value : undefined;
};

type LocatedFile =
  | { readonly kind: 'file'; readonly filePath: string; readonly storageKey: string }
  | { readonly kind: 'outside' }
  | { readonly kind: 'hidden' };

/**
 * Le fichier qu'un chemin demandé désigne dans le volume des dépôts.
 *
 * Sandbox check : path.join() collapses `..` segments WITHOUT verifying the
 * result still lies inside uploadBasePath. A request like
 * `/attachments/file/%2F..%2F..%2Fetc%2Fpasswd` would resolve to /etc/passwd.
 * We resolve both base and candidate, then require a strict prefix match (with
 * separator) to reject every form of traversal.
 *
 * #9315 — un segment caché n'est jamais un média : `.tus-resumable/` porte les
 * envois EN COURS, pas encore rattachés à un message. Refusé avant tout accès
 * disque, pour que leur existence ne se lise pas.
 */
function locateStoredFile(decodedPath: string): LocatedFile {
  const uploadBasePath = process.env.UPLOAD_PATH || 'uploads/attachments';
  const baseAbs = pathResolve(uploadBasePath);
  const filePath = pathResolve(uploadBasePath, decodedPath);
  if (filePath !== baseAbs && !filePath.startsWith(baseAbs + pathSep)) return { kind: 'outside' };
  const segments = pathRelative(baseAbs, filePath).split(pathSep);
  if (segments.some((segment) => segment.startsWith('.'))) return { kind: 'hidden' };
  return { kind: 'file', filePath, storageKey: segments.join('/') };
}

/** Single stat() — was previously called twice with a race window between the existence probe and the metadata read. */
async function statOrNull(filePath: string): Promise<Stats | null> {
  try {
    return await stat(filePath);
  } catch (statError: unknown) {
    log.info('File not found on disk', { filePath, code: (statError as { code?: string } | null)?.code });
    return null;
  }
}

const MIME_TYPES: Readonly<Record<string, string>> = {
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
  // #9693 — sans type média, ces fichiers partaient en octet-stream et SANS
  // réponse 206 : Safari et la WebView Android refusent alors de les lire.
  '.aac': 'audio/aac',
  '.oga': 'audio/ogg',
  '.opus': 'audio/ogg',
  '.m4v': 'video/mp4',
};

/**
 * La REPRÉSENTATION d'un fichier — ce que la réponse dit de ses octets (type,
 * disposition, garde SVG). Le TRANSPORT (plages, ETag, 304, cache) est commun à
 * toutes les routes de fichier et vit dans `streamStoredFile` (#11265).
 */
type StoredFileRepresentation = {
  readonly contentType: string;
  readonly headers: Readonly<Record<string, string>>;
};

/** Représentation de la route PAR CHEMIN : type déduit de l'extension (#4187). */
function pathRepresentation(decodedPath: string): StoredFileRepresentation {
  const contentType = MIME_TYPES[decodedPath.toLowerCase().slice(decodedPath.lastIndexOf('.'))] || 'application/octet-stream';
  // #3627 — un SVG peut porter du JavaScript et l'exécuterait dans l'origine
  // de la passerelle s'il était servi `inline` : téléchargement forcé + sandbox.
  if (contentType === 'image/svg+xml') {
    return {
      contentType,
      headers: {
        'Content-Disposition': `attachment; filename="${sanitizeAsciiFilename(decodedPath.split('/').pop() || 'file.svg')}"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    };
  }
  return { contentType, headers: { 'Content-Disposition': 'inline', 'X-Content-Type-Options': 'nosniff' } };
}

/**
 * Représentation de la route PAR IDENTIFIANT : type et nom de la pièce jointe.
 * Le nom RFC 5987 (`filename*`) est encodé en UTF-8 ; le `filename=` hérité est
 * un repli ASCII qu'un nom hostile ne peut pas faire sortir de ses guillemets.
 */
function attachmentRepresentation(attachment: { readonly mimeType: string; readonly originalName: string }): StoredFileRepresentation {
  const safeFilename = sanitizeAsciiFilename(attachment.originalName);
  const utf8Filename = encodeRFC5987(attachment.originalName);
  // SVG peut porter du JavaScript : téléchargement forcé + sandbox.
  if (attachment.mimeType === 'image/svg+xml') {
    return {
      contentType: attachment.mimeType,
      headers: {
        'Content-Disposition': `attachment; filename="${safeFilename}"`,
        'Content-Security-Policy': "default-src 'none'; sandbox",
        'X-Content-Type-Options': 'nosniff',
      },
    };
  }
  return {
    contentType: attachment.mimeType,
    headers: {
      'Content-Disposition': `inline; filename="${safeFilename}"; filename*=UTF-8''${utf8Filename}`,
      'X-Content-Type-Options': 'nosniff',
    },
  };
}

/**
 * Le flux d'octets d'un fichier déjà admis — partagé par toutes les routes de
 * fichier (par identifiant, miniature, par chemin, adresse signée), qui servent
 * les mêmes octets sous les mêmes gardes (#11265).
 *
 * Toute réponse porte `Vary: Accept` et `Accept-Ranges` ; une réponse RÉUSSIE
 * (200, 206, 304) y ajoute `ETag` (faible, mtime + taille) et le
 * `cacheControl` que le fichier autorise, jamais un 416. Une plage
 * valide rend 206 — un lecteur vidéo peut démarrer avant la fin du
 * téléchargement. Le cache n'est jamais assoupli ici : `immutable` ou
 * `no-store` viennent de `fileRouteVerdict.ts`, pas d'une décision de transport.
 */
function streamStoredFile(
  request: FastifyRequest,
  reply: FastifyReply,
  input: {
    readonly filePath: string;
    readonly fileStats: Stats;
    readonly cacheControl: string;
    readonly representation: StoredFileRepresentation;
  }
) {
  const { filePath, cacheControl, representation } = input;
  const fileSize = input.fileStats.size;

  // Weak ETag based on mtime+size — revalidation (If-None-Match → 304).
  const etag = `W/"${fileSize}-${Math.floor(input.fileStats.mtimeMs)}"`;
  reply.header('Accept-Ranges', 'bytes');
  appendVary(reply, 'Accept');

  // Le validateur et le cache ne décrivent qu'une réponse RÉUSSIE : un 416
  // gardé un an, ou porteur d'un ETag, ne décrit aucun octet.
  const describeServedBytes = () => reply.header('ETag', etag).header('Cache-Control', cacheControl);

  if (ifNoneMatchMatches(request.headers['if-none-match'], etag)) {
    describeServedBytes();
    return reply.code(304).send();
  }

  const range = honouredRange(request, etag);
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
    // `bytes=-N` (RFC 7233 §2.1) désigne les N DERNIERS octets — là où un MP4
    // non optimisé range son index `moov`.
    const isSuffix = startStr === '' && endStr !== '';
    const start = isSuffix ? Math.max(0, fileSize - parseInt(endStr, 10)) : parseInt(startStr, 10);
    const end = isSuffix || endStr === '' ? fileSize - 1 : parseInt(endStr, 10);
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

    describeServedBytes();
    reply.code(206);
    reply.header('Content-Range', `bytes ${start}-${end}/${fileSize}`);
    reply.header('Content-Length', chunkSize);
    reply.header('Content-Type', representation.contentType);
    reply.headers(representation.headers);

    return reply.send(createReadStream(filePath, { start, end }));
  }

  describeServedBytes();
  reply.header('Content-Type', representation.contentType);
  reply.header('Content-Length', fileSize);
  reply.headers(representation.headers);

  return reply.send(createReadStream(filePath));
}

/**
 * La plage à servir, ou rien. `If-Range` (RFC 7233 §3.2) qui ne désigne pas la
 * version servie demande le fichier ENTIER : recoller la fin d'une nouvelle
 * version au début d'une ancienne corromprait le média.
 */
function honouredRange(request: FastifyRequest, etag: string): string | undefined {
  const range = request.headers.range;
  const ifRange = request.headers['if-range'];
  if (!range) return undefined;
  return ifRange === undefined || ifRange === etag ? range : undefined;
}

/** Ajoute un nom d'en-tête à `Vary` sans effacer ceux qu'un hook a déjà posés (`Origin` de CORS). */
function appendVary(reply: FastifyReply, headerName: string): void {
  const current = reply.getHeader('vary');
  const listed = (Array.isArray(current) ? current.join(',') : String(current ?? ''))
    .split(',')
    .map((value) => value.trim())
    .filter((value) => value.length > 0);
  if (listed.some((value) => value === '*' || value.toLowerCase() === headerName.toLowerCase())) return;
  reply.header('Vary', [...listed, headerName].join(', '));
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
