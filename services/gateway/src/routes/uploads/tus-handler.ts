import { apiPath } from '@meeshy/shared/api/prefix';
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
import { z } from 'zod';
import type { Prisma } from '@meeshy/shared/prisma/client';
import { MetadataManager } from '../../services/attachments/MetadataManager';
import { produceMediaRenditions, imageVariantsJson, renditionsJson, type MediaRenditions } from '../../services/attachments/media-renditions';
import { runFfmpeg } from '../../services/attachments/ffmpeg-run';
import { UnconvertibleImageError } from '../../services/attachments/heif-conversion';
import { deferredMediaKinds, mediaJobsFor, type MediaJobTarget } from '../../services/attachments/media-processing/jobs';
import { mediaJobQueueFromEnv, type MediaJobQueue } from '../../services/attachments/media-processing/queue';
import { isPostMediaUploadContext, postMediaUploaderOrNull } from '../../services/posts/mediaOwnership';
import {
  resolveAnonymousUploadIdentity,
  fetchShareLinkAnonymousFlags,
  readFilePrefix,
  classifyGuestFileOnDisk,
  guestRefusalResponse,
  guestUploadSizeRefusal,
  shareLinkExpiredTusRefusal,
  guestAccessRevokedTusRefusal,
  GuestUploadAccessRevokedError,
} from '../../services/attachments/AnonymousUploadIdentity';
import { ShareLinkExpiredError } from '../../services/shareLinkReadGate';
import { SessionLookupUnavailableError, sessionAdmissionRefusal } from '../../services/auth/session-admission';
import {
  classifyAnonymousAttachment,
  guestAttachmentNeedsFullContent,
  verifyDeclaredMimeType,
  RECOMMENDED_SIGNATURE_PREFIX_BYTES,
} from '../../services/attachments/ContentSignature';
import { admittedUploadMimeType, audioOnlyContainerMimeType, mayBeAudioOnlyContainer } from '../../services/attachments/uploadMimeType';
import { canonicalMediaMimeType } from '@meeshy/shared/utils/media-mime-type';
import { stripStoredMediaMetadata } from '../../services/attachments/media-metadata-strip';
import { enhancedLogger } from '../../utils/logger-enhanced';
import { originIsAllowed } from '../../config/cors-origins';
import { TUS_COLLECTION_METHODS, TUS_UPLOAD_METHODS } from './tus-methods';

const logger = enhancedLogger.child({ module: 'TusHandler' });

const UPLOAD_PATH = process.env.UPLOAD_PATH || '/app/uploads';
const TUS_TEMP_PATH = path.join(UPLOAD_PATH, '.tus-resumable');

/**
 * Repli DÉFENSIF, jamais la source de vérité (#4277, critère 2). Sert
 * UNIQUEMENT si l'appelant ne fournit aucune `basePath` — un
 * `buildFakeFastify()` de test (aucune option). L'enregistrement réel fournit
 * la sienne depuis `route-registration.ts` (`${API_PREFIX}/uploads`), ce que
 * le manifeste confirme.
 *
 * CALCULÉ, plus littéral (#4317, point 3). Il restait le dernier module du
 * gateway à porter la chaîne `/api/v1` en dur, ce que le critère 2 de #4277
 * voulait précisément supprimer : la version d'API est une CONFIGURATION —
 * elle peut devenir `/api/v2`, ou se déplacer vers `api.domaine.tld/v2/` —
 * et un littéral la fige à l'insu de son module. Le repli suit désormais
 * `apiPath()`, source unique du préfixe, donc il suit la version partout où
 * elle bouge. La valeur RENDUE est identique tant que la version vaut `v1` :
 * ce point ne change aucun comportement, il retire la dernière déclaration
 * indépendante du préfixe.
 */
const DEFAULT_UPLOADS_PATH = apiPath('/uploads');

/**
 * Options du plugin. `basePath` est volontairement PAS nommée `prefix` :
 * Fastify réserve cette clé pour SA propre prépondération d'URLs relatives
 * (`fastify.get('/x', …)` → `<prefix>/x`) — un mécanisme que ce module
 * n'utilise pas, parce que le serveur TUS sous-jacent a besoin de la MÊME
 * chaîne absolue pour son option `path` (base du calcul du `Location` renvoyé
 * au client à la création d'un upload, `@tus/server` `BaseHandler.generateUrl`)
 * ET pour les deux routes Fastify qui l'exposent. Mélanger les deux
 * mécanismes de préfixage (`prefix` Fastify + URL déjà absolue) les
 * additionnerait silencieusement — vérifié : `/api/v1/uploads/api/v1/uploads`.
 * Une seule chaîne, construite ici, sert donc les deux consommateurs.
 */
export type TusRoutesOptions = {
  readonly basePath?: string;
  /** #11264 — la file de médias ; absente : celle du processus (`MEDIA_QUEUE`), `null` : éteinte. */
  readonly mediaQueue?: MediaJobQueue | null;
};

function getMaxFileSize(): number {
  return Math.max(...Object.values(UPLOAD_LIMITS));
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

/**
 * Transcription faite SUR L'APPAREIL, transportée par la clé `transcription`
 * d'`Upload-Metadata` (#4948, D-AUDIO-01).
 *
 * `MessageProcessor.processAudioAttachments` lisait déjà
 * `MessageAttachment.metadata.transcription` pour le remettre au translator
 * en passthrough (`mobileTranscription`) — mais aucun chemin d'upload iOS ne
 * l'écrivait : un vocal restait muet tant que Whisper n'avait pas répondu, et
 * pour toujours si le translator échouait. La forme validée est celle que le
 * translator lit (`startMs`/`endMs`), pas celle de `POST /posts`
 * (`MobileTranscriptionSchema`, `start`/`end`) : les deux consommateurs
 * diffèrent, et c'est le lecteur final qui dicte la forme.
 *
 * Bornée avant tout parsing (un en-tête n'est pas un corps : 16 Kio ici, borne
 * DÉFENSIVE — le client, lui, plafonne bien plus bas, à 4 Kio de JSON, parce
 * que c'est la LIGNE d'en-tête base64 qui a un budget, pas le JSON ; voir
 * `TusUploadTranscriptionMetadata.maxEncodedBytes`), validée
 * strictement (langue ISO, confiance dans [0,1], horodatages entiers) et
 * DÉPOUILLÉE de toute clé inconnue — `metadata` est un document Mongo, rien
 * d'arbitraire n'y entre. `source` est posée par le serveur, jamais par le
 * client. Toute charge invalide est IGNORÉE : l'audio arrive et le serveur
 * transcrit comme avant — un vocal ne doit jamais échouer à cause d'une
 * transcription facultative.
 */
const CLIENT_TRANSCRIPTION_MAX_BYTES = 16 * 1024;
const CLIENT_TRANSCRIPTION_LANGUAGE = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;
const ClientTranscriptionSchema = z.object({
  text: z.string().trim().min(1).max(CLIENT_TRANSCRIPTION_MAX_BYTES),
  language: z.string().regex(CLIENT_TRANSCRIPTION_LANGUAGE),
  confidence: z.number().min(0).max(1).optional(),
  durationMs: z.number().int().nonnegative().optional(),
  segments: z.array(z.object({
    text: z.string().max(4096),
    startMs: z.number().int().nonnegative(),
    endMs: z.number().int().nonnegative(),
  })).max(1000).optional(),
});

function clientDeclaredTranscription(raw: string | undefined): Prisma.InputJsonValue | undefined {
  if (!raw || Buffer.byteLength(raw, 'utf8') > CLIENT_TRANSCRIPTION_MAX_BYTES) return undefined;
  let candidate: unknown;
  try {
    candidate = JSON.parse(raw);
  } catch {
    return undefined;
  }
  const verdict = ClientTranscriptionSchema.safeParse(candidate);
  if (!verdict.success) return undefined;
  return { ...verdict.data, source: 'mobile' };
}

/**
 * Les colonnes que les rendus fixent, communes à `PostMedia` et à
 * `MessageAttachment` (#11260).
 *
 * #4324 — ce qui se PERSISTE est la clé de stockage, jamais une adresse : ni
 * hôte, ni préfixe d'API, ni version. Ce sont des décisions de déploiement, et
 * une donnée qui les porte devient fausse dès que l'une d'elles change. Les
 * trois clients posent la route : `buildAttachmentUrl` (web),
 * `MeeshyConfig.resolveMediaURL` (iOS), `me.meeshy.sdk.util.resolveMediaUrl`
 * (Android). `filePath` et `fileUrl` portent donc la MÊME valeur.
 *
 * `imageVariants` est un `Json?` : absent (jamais `null`, que Prisma refuse
 * pour ce type) quand aucune variante n'existe.
 */
function persistedRenditionFields(rendered: MediaRenditions) {
  return {
    fileName: path.basename(rendered.storedPath),
    mimeType: rendered.storedMimeType,
    fileSize: rendered.storedSize,
    filePath: rendered.storedPath,
    fileUrl: rendered.storedPath,
    thumbnailPath: rendered.thumbnailPath,
    thumbnailUrl: rendered.thumbnailPath,
    thumbHash: rendered.thumbHash,
    ...(rendered.imageVariants ? { imageVariants: imageVariantsJson(rendered.imageVariants) } : {}),
    ...(rendered.avifVariants ? { avifVariants: imageVariantsJson(rendered.avifVariants) } : {}),
    ...(rendered.renditions ? { renditions: renditionsJson(rendered.renditions) } : {}),
  };
}

export async function registerTusRoutes(fastify: FastifyInstance, opts: TusRoutesOptions = {}): Promise<void> {
  const prisma = fastify.prisma;
  if (!prisma) {
    throw new Error('[TUS] Prisma client not available');
  }

  await fs.mkdir(TUS_TEMP_PATH, { recursive: true });

  // Résolu UNE fois, réutilisé par `path` (options TUS, ci-dessous) et par les
  // deux enregistrements de route : une seule lecture de `opts.basePath`,
  // jamais une par site, pour qu'un futur repli ne puisse pas diverger entre
  // la construction du serveur TUS et les routes qui l'exposent.
  const uploadsPath = opts.basePath || DEFAULT_UPLOADS_PATH;
  const mediaQueue = opts.mediaQueue === undefined ? mediaJobQueueFromEnv() : opts.mediaQueue;

  const metadataManager = new MetadataManager(UPLOAD_PATH);
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
   * Retourne `null` sur tout échec d'authentification — chaque appelant
   * choisit son propre code HTTP. Une seule exception, levée sous la forme
   * que `@tus/server` rend telle quelle : l'invité dont le lien a expiré
   * (403 `SHARE_LINK_EXPIRED`, #10440).
   */
  async function resolveUploadCallerIdentity(headers: unknown): Promise<UploadCallerIdentity | null> {
    const h = headers as any;
    const authHeader = h?.get?.('authorization') ?? h?.authorization;
    const sessionToken = h?.get?.('x-session-token') ?? h?.['x-session-token'];

    if (authHeader) {
      const token = String(authHeader).replace(/^Bearer\s+/i, '');
      let jwtPayload: { userId?: string; sub?: string; sid?: unknown; iat?: unknown; action?: unknown; aud?: unknown };
      try {
        jwtPayload = jwt.verify(token, process.env.JWT_SECRET!) as typeof jwtPayload;
      } catch (err) {
        logger.warn('[TUS] JWT verification failed — rejecting', {
          reason: err instanceof Error ? err.message : 'unknown',
        });
        return null;
      }
      const userId = jwtPayload.userId || jwtPayload.sub || null;
      if (!userId) return null;

      // #10493 — la loi du REST (#10328) : la session NOMMÉE par le jeton doit
      // vivre, à la création comme à chaque reprise. Une lecture qui lève ne
      // prouve rien : 503, que le client rejoue, jamais 401.
      const refus = await sessionAdmissionRefusal(prisma, {
        claims: jwtPayload,
        userId,
        now: new Date(),
      }).catch((error: unknown) => {
        if (error instanceof SessionLookupUnavailableError) {
          throw { status_code: 503, body: 'Authentication temporarily unavailable\n' };
        }
        throw error;
      });
      if (refus) {
        logger.warn('[TUS] Session named by the JWT is not alive — rejecting', { motif: refus });
        return null;
      }
      return { userId, isAnonymous: false, anonymousShareLinkId: null };
    }

    if (sessionToken) {
      // Round 2 sécurité — AVANT : `userId = String(sessionToken)` traitait
      // le jeton comme une identité de fait, sans jamais vérifier qu'il
      // correspondait à un `Participant` actif ni consulter son lien de
      // partage. Même résolution que `AuthMiddleware.createAnonymousUserContext`
      // (`middleware/auth.ts`) — via `resolveAnonymousUploadIdentity`.
      // #10440 — un lien échu se refuse en 403 `SHARE_LINK_EXPIRED`, le code
      // des autres portes, jamais en 401 : le client doit savoir que rejouer
      // la session ne servira à rien. Toute autre levée remonte (500).
      const identity = await resolveAnonymousUploadIdentity(prisma, String(sessionToken)).catch((error: unknown) => {
        if (error instanceof ShareLinkExpiredError) throw shareLinkExpiredTusRefusal();
        // #10492 — un accès FINI se refuse en 410, comme aux autres portes.
        if (error instanceof GuestUploadAccessRevokedError) throw guestAccessRevokedTusRefusal();
        throw error;
      });
      if (!identity) return null;
      return { userId: identity.participantId, isAnonymous: true, anonymousShareLinkId: identity.shareLinkId };
    }

    return null;
  }

  const tusServer = new Server({
    path: uploadsPath,
    datastore: uploadDataStore,
    maxSize: getMaxFileSize(),
    respectForwardedHeaders: true,
    // #5298 — sans cette option, `@tus/server` 2.4.4 rend `'*'` sur CHAQUE
    // réponse (`getCorsOrigin` : `if (!allowedOrigins) return '*';`), et
    // c'est cette porte qui décide seule (`tusServer.handle` écrit sur la
    // réponse BRUTE : les en-têtes de `@fastify/cors` posés sur `reply` ne
    // l'atteignent jamais). Même règle que les portes HTTP et Socket.IO
    // (`config/cors-origins.ts`) : appelants réels mesurés — le web
    // (`tusUploadService.ts`, navigateur, sert un `Origin`) et les clients
    // natifs iOS/Android (aucun `Origin` envoyé, donc inertes à cette
    // option). La fonction est évaluée par requête, jamais figée à la
    // construction, pour suivre `CORS_ORIGINS` sans redémarrage de process.
    allowedOrigins: (origin: string) => originIsAllowed(origin),
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

      const mimeType = canonicalMediaMimeType({ mimeType: upload.metadata?.filetype, fileName: upload.metadata?.filename })
        || 'application/octet-stream';
      const attachmentType = getAttachmentType(mimeType, upload.metadata?.filename ?? undefined);
      const sizeLimit = getSizeLimit(attachmentType);

      if (upload.size && upload.size > sizeLimit) {
        throw {
          status_code: 413,
          body: `File too large. Max size for ${attachmentType}: ${(sizeLimit / (1024 * 1024 * 1024)).toFixed(1)} GB\n`,
        };
      }

      // #10001 — un invité d'un lien à familles (World Wide) ne téléverse pas
      // au-delà de `GUEST_ATTACHMENT_MAX_BYTES` : refusé avant le premier
      // octet quand la taille est annoncée, et de toute façon à la fin.
      if (isAnonymous && anonymousShareLinkId && upload.size) {
        const oversized = guestUploadSizeRefusal(await fetchShareLinkAnonymousFlags(prisma, anonymousShareLinkId), upload.size);
        if (oversized) throw guestRefusalResponse(oversized);
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
      const declaredMimeType = upload.metadata?.filetype || 'application/octet-stream';
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

      // #5615 — sniffing MIME étendu à TOUS les uploads TUS (inscrits ET
      // anonymes), pas seulement l'exemption anonyme ci-dessous : un mimeType
      // déclaré qui ne correspond pas au contenu réel (pour les familles dont
      // une signature fiable existe — image, audio, SVG, PDF, voir la
      // décision dans `ContentSignature.ts`) fait REJETER l'upload, avant
      // toute extraction de métadonnées et avant de savoir s'il s'agit d'un
      // PostMedia ou d'un MessageAttachment. Le préfixe est lu UNE FOIS et
      // réutilisé plus bas par `classifyAnonymousAttachment` (même octets).
      const signaturePrefix = await readFilePrefix(destPath, RECOMMENDED_SIGNATURE_PREFIX_BYTES);
      // #9693 — le type ADMIS est celui du média, comme sur la route
      // multipart : un alias se ramène au nom accepté, un type générique se
      // déduit de l'extension quand les octets le confirment, et un `.mp4`
      // sans piste vidéo est un son.
      const admittedMimeType = admittedUploadMimeType({ declared: declaredMimeType, fileName: filename, head: signaturePrefix });
      const mimeType = mayBeAudioOnlyContainer(admittedMimeType)
        ? audioOnlyContainerMimeType(admittedMimeType, await metadataManager.probeMediaStreams(destPath).catch(() => null))
        : admittedMimeType;
      const mimeVerdict = verifyDeclaredMimeType(mimeType, signaturePrefix);
      if (mimeVerdict.verified === false) {
        await fs.unlink(destPath).catch((err) =>
          logger.debug('[TUS] Upload cleanup failed (declared MIME type mismatch)', { destPath, err }));
        logger.warn(`[TUS] Upload REFUSED — ${mimeVerdict.reason} (userId=${userId})`);
        throw { status_code: 400, body: `${mimeVerdict.reason}\n` };
      }

      const attachmentType = getAttachmentType(mimeType, filename);
      // #3627, #11258 — GPS et métadonnées retirés des photos ET des vidéos
      // AVANT toute persistance : `destPath` est servi tel quel par
      // `GET /attachments/:id`. Décidé par le TYPE, pas par la catégorie : un
      // HEIC n'est pas une `image` du catalogue et porte pourtant un EXIF.
      const fileSize = (await stripStoredMediaMetadata({ filePath: destPath, mimeType })) ?? (upload.size || 0);
      const relPath = path.join(year, month, userId, storedName);

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

      // #11260 — les rendus (vignette, variantes WebP, plan de transcodage,
      // thumbhash) sont décidés par la fabrique que le multipart appelle aussi :
      // un même fichier laisse la même trace par les deux portes. Appelée
      // APRÈS les gardes de chaque branche, jamais avant : un upload refusé ne
      // laisse derrière lui ni variante ni sortie de transcodage.
      // #11263 — un HEIC/AVIF illisible par le serveur est REFUSÉ (415),
      // jamais servi tel quel aux lecteurs ; la copie posée est retirée.
      // #11264 — ce qui est différé au worker de médias (file allumée seulement).
      const deferred = deferredMediaKinds({
        attachmentType,
        fileSize,
        queueEnabled: mediaQueue !== null,
        compatRenditionEnabled: process.env.VIDEO_COMPAT_RENDITION === 'true',
      });
      const processingFields = deferred.length > 0 ? { processingState: 'pending' } : {};
      const scheduleDeferred = async (target: MediaJobTarget, id: string): Promise<void> => {
        if (mediaQueue === null) return;
        for (const job of mediaJobsFor(target, id, deferred)) {
          await mediaQueue.schedule(job).catch((error: unknown) =>
            logger.error('[TUS] Rendu différé non mis en file', { id, kind: job.kind, error }));
        }
      };
      const renderMedia = () =>
        produceMediaRenditions(
          { uploadBasePath: UPLOAD_PATH, metadataManager, runFfmpeg },
          { relPath, mimeType, attachmentType, fileSize, metadata, clientThumbHash: upload.metadata?.thumbhash ?? null },
          { defer: deferred },
        ).catch(async (error: unknown) => {
          if (!(error instanceof UnconvertibleImageError)) throw error;
          await fs.unlink(destPath).catch((err) => logger.debug('[TUS] Unconvertible image cleanup failed', { destPath, err }));
          logger.warn(`[TUS] Upload REFUSED — ${error.message} (userId=${userId})`);
          throw { status_code: 415, body: 'Image format not supported by the server\n' };
        });

      const uploadContext = upload.metadata?.uploadcontext;
      // Les commentaires réutilisent PostMedia (FK `commentId`) — même pipeline
      // d'upload/transcription/traduction que les posts. Le média est créé en
      // pending (postId=null, commentId=null) puis lié au commentaire à sa création.
      const isPostMedia = isPostMediaUploadContext(uploadContext);

      let recordId: string;
      let rendered: MediaRenditions;
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
        rendered = await renderMedia();
        metadata = rendered.metadata;
        const postMedia = await prisma.postMedia.create({
          data: {
            postId: null,
            uploaderId,
            originalName: filename,
            ...persistedRenditionFields(rendered),
            ...processingFields,
            width: metadata.width || null,
            height: metadata.height || null,
            duration: metadata.duration || null,
            codec: metadata.codec || null,
            videoCodec: metadata.videoCodec || null,
          },
        });
        recordId = postMedia.id;
        await scheduleDeferred('postMedia', postMedia.id);
        logger.info(`[TUS] PostMedia created: ${path.basename(rendered.storedPath)} (${rendered.storedSize} bytes, postId=null pending)`);
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

          // Mêmes octets que la vérification globale ci-dessus (#5615) — pas
          // de second aller-retour disque pour le même préfixe… sauf quand le
          // lien liste ses familles (#10001, World Wide) : un préfixe ne
          // prouve rien, la garde relit le fichier ENTIER, borné par
          // `GUEST_ATTACHMENT_MAX_BYTES` avant toute lecture.
          const verdict = guestAttachmentNeedsFullContent(shareLinkFlags)
            ? await classifyGuestFileOnDisk({ filePath: destPath, mimeType, fileName: filename, shareLink: shareLinkFlags })
            : classifyAnonymousAttachment(mimeType, signaturePrefix, shareLinkFlags);
          if (verdict.allowed === false) {
            await fs.unlink(destPath).catch((err) =>
              logger.debug('[TUS] Anonymous message attachment cleanup failed (policy)', { destPath, err }));
            logger.warn(`[TUS] Anonymous message attachment REFUSED — ${verdict.reason} (userId=${userId})`);
            throw guestRefusalResponse(verdict);
          }
        }

        rendered = await renderMedia();
        metadata = rendered.metadata;

        // Lue ici, sur la branche MESSAGE et pour un AUDIO seulement :
        // `MessageProcessor` ne la lit que là, ailleurs elle ne serait qu'un
        // blob mort dans la ligne.
        const clientTranscription = attachmentType === 'audio'
          ? clientDeclaredTranscription(upload.metadata?.transcription)
          : undefined;

        const attachment = await prisma.messageAttachment.create({
          data: {
            originalName: filename,
            ...persistedRenditionFields(rendered),
            ...processingFields,
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
            ...(clientTranscription ? { metadata: { transcription: clientTranscription } } : {}),
          },
        });
        recordId = attachment.id;
        await scheduleDeferred('messageAttachment', attachment.id);
        logger.info(`[TUS] MessageAttachment created: ${path.basename(rendered.storedPath)} (${rendered.storedSize} bytes)`);
      }

      return {
        status_code: 200,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          success: true,
          data: {
            attachment: {
              id: recordId,
              fileName: path.basename(rendered.storedPath),
              originalName: filename,
              mimeType: rendered.storedMimeType,
              fileSize: rendered.storedSize,
              fileUrl: rendered.storedPath,
              thumbnailUrl: rendered.thumbnailPath ?? undefined,
              // #11264 — `pending` : la vignette et les rendus arrivent par `attachment:ready`.
              processingState: deferred.length > 0 ? 'pending' : undefined,
              thumbHash: rendered.thumbHash,
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

  // #4190 — UN SEUL jeu de six méthodes était déclaré sur CHACUNE des deux URL,
  // soit douze couples pour un protocole qui en définit quatre. Quatre de ces
  // couples n'avaient aucun appelant, et trois d'entre eux — `GET`, `PATCH` et
  // `DELETE` sur la COLLECTION — ne traversaient AUCUNE garde : `onUploadCreate`
  // n'est invoqué que par le gestionnaire POST, et `onIncomingRequest` relâche
  // explicitement ce qu'il ne retrouve pas dans le magasin (`if (!ownerUserId)
  // return`). Une porte ouverte sur la plomberie interne de `@tus/server`,
  // offerte à personne : le coût n'était pas une fuite mesurée mais une surface
  // que rien ne justifiait — et qu'aucun inventaire ne pouvait attraper depuis
  // le CHEMIN seul, puisque `DELETE /api/v1/uploads/*` est, elle, bien vivante.
  //
  // Les deux URL portent donc chacune SES méthodes, celles du protocole :
  //  - la collection CRÉE une session (`POST`, extension Creation) et se décrit
  //    (`OPTIONS` : Tus-Version / Tus-Extension / Tus-Max-Size) ;
  //  - une session existante se sonde (`HEAD` — la reprise, seule méthode
  //    nominale de reprise du protocole, consommée par les trois clients), se
  //    poursuit (`PATCH`), se termine (`DELETE` — `tus-js-client` l'émet sur
  //    chaque `abort`/`pauseAll` du web) et se décrit (`OPTIONS`).
  //
  // `HEAD /api/v1/uploads` et `POST /api/v1/uploads/*` SURVIVENT volontairement :
  // l'inventaire qui a produit #4190 croise gateway × clients en ignorant `HEAD`
  // et n'a jamais énuméré ces deux couples-là. La règle du lot est que la
  // confirmation précède le retrait, couple par couple — les retirer ici serait
  // les retirer sur une SUPPOSITION, exactement le raisonnement que ce lot
  // corrige. Suivi séparé.

  fastify.route({
    method: [...TUS_COLLECTION_METHODS],
    url: uploadsPath,
    handler: (req, reply) => {
      tusServer.handle(req.raw, reply.raw);
    },
  });

  fastify.route({
    method: [...TUS_UPLOAD_METHODS],
    url: `${uploadsPath}/*`,
    handler: (req, reply) => {
      tusServer.handle(req.raw, reply.raw);
    },
  });

  logger.info(`[TUS] Resumable upload routes registered at ${uploadsPath}/*`);
}
