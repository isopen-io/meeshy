import { Server } from '@tus/server';
import { FileStore } from '@tus/file-store';
import type { FastifyInstance } from 'fastify';
import { promises as fs } from 'fs';
import path from 'path';
import { v4 as uuidv4 } from 'uuid';
import {
  getAttachmentType,
  getSizeLimit,
  UPLOAD_LIMITS,
} from '@meeshy/shared/types/attachment';
import jwt from 'jsonwebtoken';
import { MetadataManager } from '../../services/attachments/MetadataManager';
import { ThumbHashGenerator } from '../../services/attachments/ThumbHashGenerator';
import { isPostMediaUploadContext, postMediaUploaderOrNull } from '../../services/posts/mediaOwnership';
import {
  resolveAnonymousUploadIdentity,
  fetchShareLinkAnonymousFlags,
  readFilePrefix,
} from '../../services/attachments/AnonymousUploadIdentity';
import { classifyAnonymousAttachment, RECOMMENDED_SIGNATURE_PREFIX_BYTES } from '../../services/attachments/ContentSignature';
import { enhancedLogger } from '../../utils/logger-enhanced';

const logger = enhancedLogger.child({ module: 'TusHandler' });

const UPLOAD_PATH = process.env.UPLOAD_PATH || '/app/uploads';
const TUS_TEMP_PATH = path.join(UPLOAD_PATH, '.tus-resumable');

function getMaxFileSize(): number {
  return Math.max(...Object.values(UPLOAD_LIMITS));
}

function buildPublicUrl(): string {
  if (process.env.PUBLIC_URL) return process.env.PUBLIC_URL;
  const isProduction = process.env.NODE_ENV === 'production';
  if (isProduction) {
    const domain = process.env.DOMAIN || 'meeshy.me';
    return `https://gate.${domain}`;
  }
  return process.env.BACKEND_URL || `http://localhost:${process.env.PORT || '3000'}`;
}

export async function registerTusRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  if (!prisma) {
    throw new Error('[TUS] Prisma client not available');
  }

  await fs.mkdir(TUS_TEMP_PATH, { recursive: true });

  const metadataManager = new MetadataManager(UPLOAD_PATH);
  const publicUrl = buildPublicUrl();

  const tusServer = new Server({
    path: '/api/v1/uploads',
    datastore: new FileStore({ directory: TUS_TEMP_PATH }),
    maxSize: getMaxFileSize(),
    respectForwardedHeaders: true,
    async onUploadCreate(req, upload) {
      const headers = req.headers as any;
      const authHeader = headers?.get?.('authorization') ?? headers?.authorization;
      const sessionToken = headers?.get?.('x-session-token') ?? headers?.['x-session-token'];

      if (!authHeader && !sessionToken) {
        throw { status_code: 401, body: 'Authentication required\n' };
      }

      // Extract userId from JWT or sessionToken
      let userId = 'anonymous';
      let isAnonymous = false;
      // Lien de partage du participant anonyme résolu ci-dessous — seule
      // source qui permette, à `onUploadFinish`, de consulter
      // `allowAnonymousFiles`/`allowAnonymousImages` (task-1-fix-round-2,
      // Critical 1 : ce chemin ne les consultait auparavant JAMAIS).
      let anonymousShareLinkId: string | null = null;
      if (authHeader) {
        const token = String(authHeader).replace(/^Bearer\s+/i, '');
        // Une identité ne s'établit jamais par un décodage non vérifié.
        // AVANT : quand `jwt.verify` échouait (signature invalide, jeton
        // forgé, jeton expiré), le code retombait sur `jwt.decode` — qui NE
        // VÉRIFIE AUCUNE SIGNATURE — et faisait confiance au `userId` qu'il
        // contenait. Il suffisait de fabriquer un jeton `{ userId: "<x>" }`
        // signé avec n'importe quel secret pour usurper l'identité de
        // n'importe quel compte enregistré sur cette route de création de
        // pièces jointes. Contrairement à `middleware/auth.ts` (jeton expiré
        // rattrapable via une session de confiance vérifiée en base), ce
        // chemin n'a pas cette mécanique : tout échec de `jwt.verify`, y
        // compris l'expiration, est donc refusé sans repli.
        let jwtPayload: { userId?: string; sub?: string };
        try {
          jwtPayload = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string; sub?: string };
        } catch (err) {
          logger.warn('[TUS] JWT verification failed — rejecting upload', {
            reason: err instanceof Error ? err.message : 'unknown',
          });
          throw { status_code: 401, body: 'Invalid or expired token\n' };
        }
        userId = jwtPayload.userId || jwtPayload.sub || 'anonymous';
      } else if (sessionToken) {
        // Round 2 sécurité — AVANT : `userId = String(sessionToken)` traitait
        // le jeton comme une identité de fait, sans jamais vérifier qu'il
        // correspondait à un `Participant` actif ni consulter son lien de
        // partage. Un jeton forgé/expiré/révoqué passait tel quel, et même
        // un jeton valide ne donnait accès à AUCUNE autorisation : le chemin
        // entier était donc aveugle à `allowAnonymousFiles`/`allowAnonymousImages`.
        // Même résolution que `AuthMiddleware.createAnonymousUserContext`
        // (`middleware/auth.ts`) — via `resolveAnonymousUploadIdentity`.
        const identity = await resolveAnonymousUploadIdentity(prisma, String(sessionToken));
        if (!identity) {
          throw { status_code: 401, body: 'Invalid session token\n' };
        }
        userId = identity.participantId;
        isAnonymous = true;
        anonymousShareLinkId = identity.shareLinkId;
      }

      // PHASE 3 (2026-08-02) — un upload destiné à PostMedia sans uploadeur
      // identifiable est REFUSÉ avant le premier octet. Le laisser passer
      // créait un média que l'égalité stricte du claim rend irréclamable à
      // vie : un orphelin garanti (constaté en prod le 2026-07-31, jeton
      // indécodable → `2026/07/anonymous/…`, 0 octet, jamais purgé). Les
      // pièces jointes de MESSAGE (participants anonymes compris) ne passent
      // pas par ce contexte — leur propre garde (`allowAnonymousFiles`/
      // `allowAnonymousImages`) vit plus bas, dans `onUploadFinish`
      // (task-1-fix-round-2, Critical 1).
      if (isPostMediaUploadContext(upload.metadata?.uploadcontext)
          && postMediaUploaderOrNull({ userId, isAnonymous }) === null) {
        throw {
          status_code: 403,
          body: 'Post media upload requires an identifiable registered account\n',
        };
      }

      const mimeType = upload.metadata?.filetype || 'application/octet-stream';
      const attachmentType = getAttachmentType(mimeType, upload.metadata?.filename ?? undefined);
      const sizeLimit = getSizeLimit(attachmentType);

      if (upload.size && upload.size > sizeLimit) {
        throw {
          status_code: 413,
          body: `File too large. Max size for ${attachmentType}: ${(sizeLimit / (1024 * 1024 * 1024)).toFixed(1)} GB\n`,
        };
      }

      return {
        metadata: {
          ...upload.metadata,
          userId,
          isAnonymous: isAnonymous ? 'true' : 'false',
          anonymousShareLinkId: anonymousShareLinkId ?? '',
          uploadedAt: new Date().toISOString(),
        },
      };
    },
    async onUploadFinish(_req, upload) {
      const filename = upload.metadata?.filename || 'unknown';
      const mimeType = upload.metadata?.filetype || 'application/octet-stream';
      const userId = upload.metadata?.userId || 'anonymous';
      const isAnonymous = upload.metadata?.isAnonymous === 'true';
      const anonymousShareLinkId = upload.metadata?.anonymousShareLinkId || null;

      const now = new Date();
      const year = now.getFullYear().toString();
      const month = (now.getMonth() + 1).toString().padStart(2, '0');
      const destDir = path.join(UPLOAD_PATH, year, month, userId);
      await fs.mkdir(destDir, { recursive: true });

      const ext = path.extname(filename);
      const baseName = path.basename(filename, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
      const storedName = `${baseName}_${uuidv4()}${ext}`;
      const destPath = path.join(destDir, storedName);

      const sourcePath = upload.storage?.path
        ? upload.storage.path
        : path.join(TUS_TEMP_PATH, upload.id);

      try {
        await fs.rename(sourcePath, destPath);
      } catch {
        await fs.copyFile(sourcePath, destPath);
        await fs.unlink(sourcePath).catch((err) => logger.debug('tus: temp file unlink failed after copy', { sourcePath, err }));
      }

      const fileSize = upload.size || 0;
      const relPath = path.join(year, month, userId, storedName);
      const fileUrl = `${publicUrl}/api/v1/attachments/file/${relPath}`;

      const attachmentType = getAttachmentType(mimeType, filename);
      let metadata: Record<string, any> = {};
      try {
        metadata = await metadataManager.extractMetadata(
          relPath,
          attachmentType,
          mimeType,
          undefined,
          fileSize
        );
      } catch (err) {
        logger.warn('[TUS] Metadata extraction failed:', err);
      }

      let thumbnailUrl: string | undefined;
      let thumbnailRelPath: string | undefined;
      try {
        if (attachmentType === 'image') {
          thumbnailRelPath = await metadataManager.generateThumbnail(relPath) ?? undefined;
        } else if (attachmentType === 'video') {
          thumbnailRelPath = await metadataManager.generateVideoThumbnail(relPath) ?? undefined;
        }
        if (thumbnailRelPath) {
          thumbnailUrl = `${publicUrl}/api/v1/attachments/file/${thumbnailRelPath}`;
        }
      } catch (err) {
        logger.warn('[TUS] Thumbnail generation failed:', err);
      }

      // Generate thumbHash for visual media (images/videos)
      // Client may provide thumbHash via TUS metadata; backend generates as fallback.
      // Defense-in-depth length cap: ThumbHash base64 is ~28-33 chars; reject
      // anything over MAX_THUMBHASH_LENGTH to avoid storing malformed/malicious
      // blobs in the DB document.
      const MAX_THUMBHASH_LENGTH = 100;
      const rawClientThumbHash = upload.metadata?.thumbhash || null;
      let thumbHash: string | null =
        (rawClientThumbHash && rawClientThumbHash.length <= MAX_THUMBHASH_LENGTH)
          ? rawClientThumbHash
          : null;
      if (rawClientThumbHash && rawClientThumbHash.length > MAX_THUMBHASH_LENGTH) {
        logger.warn(`[TUS] Rejecting oversized client thumbHash (${rawClientThumbHash.length} chars)`);
      }
      if (!thumbHash && (attachmentType === 'image' || attachmentType === 'video')) {
        try {
          thumbHash = await ThumbHashGenerator.generate(destPath, mimeType);
        } catch (err) {
          logger.warn('[TUS] ThumbHash generation failed:', err);
        }
      }

      const uploadContext = upload.metadata?.uploadcontext;
      // Les commentaires réutilisent PostMedia (FK `commentId`) — même pipeline
      // d'upload/transcription/traduction que les posts. Le média est créé en
      // pending (postId=null, commentId=null) puis lié au commentaire à sa création.
      const isPostMedia = isPostMediaUploadContext(uploadContext);

      let recordId: string;
      if (isPostMedia) {
        // Upload destiné à un post/story/status : créer PostMedia directement (postId=null = pending)
        // Propriétaire de l'upload — la seule chose qui empêchera un tiers de
        // revendiquer ce média en devinant son id.
        const uploaderId = postMediaUploaderOrNull({ userId, isAnonymous });
        if (!uploaderId) {
          // PHASE 3 — BLOQUANT. `onUploadCreate` rejette déjà ce cas avant le
          // premier octet ; n'atteignent cette branche que les uploads créés
          // AVANT le déploiement et finis après. Créer la ligne produirait un
          // média irréclamable à vie (égalité stricte du claim) : on détruit
          // la copie déjà posée et on refuse.
          await fs.unlink(destPath).catch((err) =>
            logger.debug('[TUS] Ownerless post media cleanup failed', { destPath, err }));
          logger.error(`[TUS] PostMedia sans uploadeur identifiable REFUSÉ (context=${uploadContext}, userId=${userId})`);
          throw {
            status_code: 403,
            body: 'Post media upload requires an identifiable registered account\n',
          };
        }
        const postMedia = await prisma.postMedia.create({
          data: {
            postId: null,
            uploaderId,
            fileName: storedName,
            originalName: filename,
            mimeType,
            fileSize,
            filePath: relPath,
            fileUrl,
            thumbnailPath: thumbnailRelPath || null,
            thumbnailUrl: thumbnailUrl || null,
            thumbHash,
            width: metadata.width || null,
            height: metadata.height || null,
            duration: metadata.duration || null,
            codec: metadata.codec || null,
          },
        });
        recordId = postMedia.id;
        logger.info(`[TUS] PostMedia created: ${storedName} (${fileSize} bytes, postId=null pending)`);
      } else {
        // Upload destiné à un message : créer MessageAttachment
        //
        // Round 2 sécurité (task-1-fix-round-2, Critical 1) — AVANT : ce
        // chemin créait la pièce jointe pour un participant anonyme sans
        // JAMAIS consulter `allowAnonymousFiles`/`allowAnonymousImages` du
        // lien de partage. Un invité dont le lien interdit tout pouvait
        // téléverser ici et attacher le résultat à un message — le contrôle
        // qu'exerce `routes/attachments/upload.ts` (REST) était entièrement
        // court-circuité par ce second chemin. Même décision UNIQUE
        // (`classifyAnonymousAttachment`, `ContentSignature.ts`) que la
        // route REST, pour que les deux chemins ne puissent pas diverger.
        //
        // Placé ici (bytes déjà sur disque à `destPath`, comme pour la garde
        // PostMedia ci-dessus) plutôt qu'à `onUploadCreate` : la
        // classification audio/image se mérite par les octets (round 1), et
        // aucun octet n'existe encore à la création de l'upload resumable.
        if (isAnonymous) {
          const shareLinkFlags = anonymousShareLinkId
            ? await fetchShareLinkAnonymousFlags(prisma, anonymousShareLinkId)
            : null;

          if (!shareLinkFlags) {
            await fs.unlink(destPath).catch((err) =>
              logger.debug('[TUS] Anonymous message attachment cleanup failed (share link not found)', { destPath, err }));
            logger.warn(`[TUS] Anonymous message attachment REFUSED — share link not found (userId=${userId})`);
            throw { status_code: 403, body: 'Share link not found\n' };
          }

          const signaturePrefix = await readFilePrefix(destPath, RECOMMENDED_SIGNATURE_PREFIX_BYTES);
          const verdict = classifyAnonymousAttachment(mimeType, signaturePrefix, shareLinkFlags);
          if (verdict.allowed === false) {
            await fs.unlink(destPath).catch((err) =>
              logger.debug('[TUS] Anonymous message attachment cleanup failed (policy)', { destPath, err }));
            logger.warn(`[TUS] Anonymous message attachment REFUSED — ${verdict.reason} (userId=${userId})`);
            throw { status_code: 403, body: `${verdict.reason}\n` };
          }
        }

        const attachment = await prisma.messageAttachment.create({
          data: {
            fileName: storedName,
            originalName: filename,
            mimeType,
            fileSize,
            filePath: relPath,
            fileUrl,
            thumbnailPath: thumbnailRelPath || null,
            thumbnailUrl: thumbnailUrl || null,
            thumbHash,
            width: metadata.width || null,
            height: metadata.height || null,
            duration: metadata.duration || null,
            bitrate: metadata.bitrate || null,
            sampleRate: metadata.sampleRate || null,
            codec: metadata.codec || null,
            channels: metadata.channels || null,
            fps: metadata.fps || null,
            videoCodec: metadata.videoCodec || null,
            pageCount: metadata.pageCount || null,
            lineCount: metadata.lineCount || null,
            uploadedBy: userId,
            isAnonymous,
          },
        });
        recordId = attachment.id;
        logger.info(`[TUS] MessageAttachment created: ${storedName} (${fileSize} bytes)`);
      }

      return {
        status_code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: {
            attachment: {
              id: recordId,
              fileName: storedName,
              originalName: filename,
              mimeType,
              fileSize,
              fileUrl,
              thumbnailUrl,
              thumbHash,
              width: metadata.width,
              height: metadata.height,
              duration: metadata.duration,
              bitrate: metadata.bitrate,
              sampleRate: metadata.sampleRate,
              codec: metadata.codec,
              channels: metadata.channels,
            },
          },
        }),
      };
    },
  });

  fastify.addContentTypeParser(
    'application/offset+octet-stream',
    (_request: any, _payload: any, done: (err: null) => void) => done(null)
  );

  const TUS_METHODS = ['GET', 'HEAD', 'POST', 'PATCH', 'DELETE', 'OPTIONS'] as const;

  fastify.route({
    method: [...TUS_METHODS],
    url: '/api/v1/uploads',
    handler: (req, reply) => {
      tusServer.handle(req.raw, reply.raw);
    },
  });

  fastify.route({
    method: [...TUS_METHODS],
    url: '/api/v1/uploads/*',
    handler: (req, reply) => {
      tusServer.handle(req.raw, reply.raw);
    },
  });

  logger.info('[TUS] Resumable upload routes registered at /api/v1/uploads/*');
}
