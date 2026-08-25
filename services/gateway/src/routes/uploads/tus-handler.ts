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

type UploadCallerIdentity = {
  readonly userId: string;
  readonly isAnonymous: boolean;
  readonly anonymousShareLinkId: string | null;
};


/**
 * La seule mesure que le CLIENT possède et que le serveur ne peut pas refaire.
 *
 * `MetadataManager.extractMetadata` porte une branche de repli explicite —
 * « Backend extraction failed, using frontend as fallback » — qui n'existe QUE
 * si un `providedMetadata` lui est passé. Ce handler passait `undefined` : la
 * branche était inatteignable par le chemin résumable, alors que c'est
 * précisément son cas nominal. Un WebM produit par `MediaRecorder` ne porte
 * pas de durée dans son en-tête ; sans repli, `duration` reste nul et la bulle
 * vocale affiche 0:00.
 *
 * Les métadonnées TUS sont des CHAÎNES (en-tête `Upload-Metadata`), là où
 * `UploadProcessor` reçoit du JSON. La conversion est donc STRICTE : `NaN`
 * traverserait `>= 0` sans rougir et s'écrirait tel quel en base, et une durée
 * nulle ou négative ne remplace rien par rien.
 */
function clientMeasuredMetadata(rawDuration: string | undefined): { duration: number } | undefined {
  if (!rawDuration) return undefined;
  const duration = Number(rawDuration);
  if (!Number.isFinite(duration) || duration <= 0) return undefined;
  return { duration };
}

export async function registerTusRoutes(fastify: FastifyInstance): Promise<void> {
  const prisma = fastify.prisma;
  if (!prisma) {
    throw new Error('[TUS] Prisma client not available');
  }

  await fs.mkdir(TUS_TEMP_PATH, { recursive: true });

  const metadataManager = new MetadataManager(UPLOAD_PATH);
  const publicUrl = buildPublicUrl();
  // Référence conservée séparément (plutôt que lue depuis `tusServer` une
  // fois construit) : `onIncomingRequest`, ci-dessous, doit pouvoir
  // interroger le magasin AVANT que `new Server({...})` ne rende l'instance
  // — la référence circulaire n'existe pas encore à ce point de la fermeture.
  const uploadDataStore = new FileStore({ directory: TUS_TEMP_PATH });

  /**
   * Résout l'identité de l'appelant à partir de `Authorization`/
   * `X-Session-Token` — politique UNIQUE, partagée par `onUploadCreate`
   * (établit l'identité qui sera figée dans les métadonnées) et
   * `onIncomingRequest` (task-1-fix-round-3, I1 : compare l'appelant au
   * propriétaire déjà figé, sur GET/HEAD/PATCH/DELETE d'un upload existant).
   *
   * task-1-fix-round-6 — AVANT (rounds 3 à 5) : un `jwt.TokenExpiredError`
   * accompagné d'un `X-Session-Token` retombait sur `findTrustedSession`
   * pour rattraper l'expiration, y compris PENDANT une reprise (PATCH) —
   * exactement le cas d'usage de ce protocole resumable pour un
   * téléversement long. Le propriétaire a explicitement écarté ce mélange de
   * DEUX FORMES de justificatif (« une forme de connexion à la fois ») : un
   * jeton d'authentification expiré est désormais refusé ici sans aucun
   * recours, quelle que soit la session de confiance présentée — CONSÉQUENCE
   * ACCEPTÉE : un téléversement long dont le JWT expire en cours de route
   * échoue désormais, là où il était rattrapé jusqu'ici. Une signature
   * invalide (jeton forgé) reste, comme avant, refusée sans aucun recours.
   *
   * Retourne `null` sur tout échec d'authentification — ne lève jamais
   * elle-même : chaque appelant choisit son propre code HTTP.
   */
  async function resolveUploadCallerIdentity(headers: unknown): Promise<UploadCallerIdentity | null> {
    const h = headers as any;
    const authHeader = h?.get?.('authorization') ?? h?.authorization;
    const sessionToken = h?.get?.('x-session-token') ?? h?.['x-session-token'];

    if (authHeader) {
      const token = String(authHeader).replace(/^Bearer\s+/i, '');
      let jwtPayload: { userId?: string; sub?: string };
      try {
        jwtPayload = jwt.verify(token, process.env.JWT_SECRET!) as { userId?: string; sub?: string };
      } catch (err) {
        logger.warn('[TUS] JWT verification failed — rejecting', {
          reason: err instanceof Error ? err.message : 'unknown',
        });
        return null;
      }
      const userId = jwtPayload.userId || jwtPayload.sub || null;
      if (!userId) return null;
      return { userId, isAnonymous: false, anonymousShareLinkId: null };
    }

    if (sessionToken) {
      // Round 2 sécurité — AVANT : `userId = String(sessionToken)` traitait
      // le jeton comme une identité de fait, sans jamais vérifier qu'il
      // correspondait à un `Participant` actif ni consulter son lien de
      // partage. Même résolution que `AuthMiddleware.createAnonymousUserContext`
      // (`middleware/auth.ts`) — via `resolveAnonymousUploadIdentity`.
      const identity = await resolveAnonymousUploadIdentity(prisma, String(sessionToken));
      if (!identity) return null;
      return { userId: identity.participantId, isAnonymous: true, anonymousShareLinkId: identity.shareLinkId };
    }

    return null;
  }

  const tusServer = new Server({
    path: '/api/v1/uploads',
    datastore: uploadDataStore,
    maxSize: getMaxFileSize(),
    respectForwardedHeaders: true,
    async onIncomingRequest(req, uploadId) {
      // task-1-fix-round-3, I1 — AVANT : ce serveur était construit SANS
      // `onIncomingRequest`. `onUploadCreate` n'est invoqué QUE par le
      // gestionnaire POST ; GET/HEAD/PATCH/DELETE n'appellent QUE ce point
      // d'accroche — jamais configuré, donc jamais vérifié. En connaissant
      // seulement l'identifiant d'upload (128 bits aléatoires), un tiers
      // pouvait poursuivre (PATCH), inspecter (HEAD) ou terminer (DELETE) le
      // téléversement D'AUTRUI. Ne ROUVRE PAS le contournement d'autorisation
      // fermé au round 2 : l'identité reste figée à la création — cette
      // garde compare seulement l'appelant au propriétaire déjà établi,
      // elle n'en établit jamais un nouveau.
      let existingUpload: Awaited<ReturnType<typeof uploadDataStore.getUpload>>;
      try {
        existingUpload = await uploadDataStore.getUpload(uploadId);
      } catch (err) {
        // task-1-fix-round-4 — AVANT : ce `catch` traitait TOUTE erreur (pas
        // seulement « introuvable ») comme « rien à protéger, laisser passer »
        // — une panne du magasin (E/S, permission, config indisponible…)
        // ouvrait donc l'accès PAR DÉFAUT à un upload qui EXISTE bel et bien,
        // faute d'avoir pu en lire les métadonnées. Seuls 404
        // (`ERRORS.FILE_NOT_FOUND` — id inconnu, cas du POST ; `onUploadCreate`
        // gère déjà sa propre authentification) et 410
        // (`ERRORS.FILE_NO_LONGER_EXISTS` — enregistrement présent mais
        // fichier disparu du disque, upload expiré) signifient réellement une
        // ABSENCE d'upload à protéger — les deux SEULS codes que
        // `FileStore.getUpload` (`@tus/file-store`, `dist/index.js`) documente
        // pour ce cas. Dans les deux cas, le gestionnaire réel de
        // `@tus/server` fait le même appel juste après et rend lui-même le
        // 404/410 approprié. Toute autre erreur est rethrow : `Server.handle`
        // (`@tus/server`, `server.js`) la convertit en réponse HTTP
        // (`error.status_code || 500`), jamais en laissez-passer silencieux.
        const statusCode = (err as { status_code?: number } | null)?.status_code;
        if (statusCode === 404 || statusCode === 410) {
          return;
        }
        throw err;
      }

      const ownerUserId = existingUpload.metadata?.userId;
      if (!ownerUserId) return; // upload sans métadonnée d'identité — rien à comparer

      const identity = await resolveUploadCallerIdentity(req.headers);
      if (!identity) {
        throw { status_code: 401, body: 'Authentication required\n' };
      }
      if (identity.userId !== ownerUserId) {
        logger.warn('[TUS] Upload access denied — caller does not own this upload', { uploadId });
        throw { status_code: 403, body: 'You do not own this upload\n' };
      }
    },
    async onUploadCreate(req, upload) {
      const headers = req.headers as any;
      const authHeader = headers?.get?.('authorization') ?? headers?.authorization;
      const sessionToken = headers?.get?.('x-session-token') ?? headers?.['x-session-token'];

      if (!authHeader && !sessionToken) {
        throw { status_code: 401, body: 'Authentication required\n' };
      }

      const identity = await resolveUploadCallerIdentity(headers);
      if (!identity) {
        throw {
          status_code: 401,
          body: authHeader ? 'Invalid or expired token\n' : 'Invalid session token\n',
        };
      }

      const { userId, isAnonymous, anonymousShareLinkId } = identity;

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
          clientMeasuredMetadata(upload.metadata?.duration),
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
            // La provenance déclarée par le client : ce fichier sort-il de la
            // caméra ou du micro de l'application ? Rien dans un fichier ne
            // permet de la déduire, et elle n'est connaissable qu'AU MOMENT de
            // la capture — non écrite ici, elle est perdue pour toujours.
            //
            // Les métadonnées TUS sont des CHAÎNES (en-tête `Upload-Metadata`),
            // là où `UploadProcessor` reçoit du JSON : la comparaison porte donc
            // sur `'true'` et non sur `true`. Elle reste STRICTE pour la même
            // raison — toute autre valeur, `'false'` comprise, vaut « pas une
            // capture », et une garde de confidentialité qu'une coercition
            // ouvre ne garde rien.
            // @see packages/shared/utils/forward-to-publication.ts
            capturedInApp: upload.metadata?.capturedinapp === 'true',
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
              // `UploadedAttachmentResponse` déclare ces trois champs REQUIS,
              // et ce corps ne les portait pas : le chemin résumable ne
              // servait que les fichiers > 50 Mo, jusqu'à ce que le transport
              // de publication en fasse le chemin UNIQUE de tout média de
              // post/story. Un client qui fait confiance au type lisait
              // `undefined`.
              uploadedBy: userId,
              isAnonymous,
              createdAt: now.toISOString(),
              // `messageId` reste ABSENT, et le type continue donc de mentir
              // d'un champ sur ce chemin : un `PostMedia` n'appartient à aucun
              // message. Dette de TYPE (scinder un `UploadedMediaResponse`
              // — le noyau que les deux chemins rendent vraiment — dont
              // `UploadedAttachmentResponse` hériterait les champs de
              // message), pas de handler : aucune valeur ne conviendrait ici.
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
