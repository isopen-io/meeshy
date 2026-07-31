import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendError } from '../../utils/response';
import { toDTO, soundUploaderInclude } from './sounds';
import { loadSoundStats } from '../../services/posts/soundStats';
import {
  ALLOWED_UPLOAD_MIME as ALLOWED_MIME,
  ALLOWED_AUDIO_EXT,
  EXT_TO_MIME,
  servableExtension,
  staticFileUrl,
} from '../../services/posts/soundFormats';
import { createSoundRouteRateLimitConfig } from '../../middleware/rate-limiter';

/** Borne MÉMOIRE, pas une limite de durée : `toBuffer()` matérialise tout. */
const MAX_UPLOAD_BYTES = 100 * 1024 * 1024;

// Volume DÉDIÉ, servi uniquement par la route JWT `/static/:filename`.
// Surtout PAS sous UPLOAD_PATH : tout ce qui s'y trouve est exposé par
// `GET /attachments/file/*` (sans authentification, download.ts:256) et par le
// montage nginx en lecture seule sur `static.<domaine>`, en cache immutable un an.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/sounds';

const ListQuerySchema = z.object({
  q: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});

export function registerStoryAudioRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  requiredAuth: any
) {
  // POST /stories/audio — Upload d'un son d'arrière-plan
  fastify.post('/stories/audio', {
    preValidation: [requiredAuth],
    // La route la plus coûteuse du lot : elle écrit un fichier sans plafond de
    // durée. Sans limite propre, seul le quota global de 300 req/min la
    // protégeait — de quoi remplir le volume de sons en une minute.
    config: { rateLimit: createSoundRouteRateLimitConfig('upload') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    // PLAFOND D'OCTETS OBLIGATOIRE. Le multipart global autorise 4 Go
    // (server.ts:330) et `toBuffer()` matérialise tout en mémoire : un seul
    // envoi d'un gigaoctet tuait le conteneur. Ce n'est PAS un plafond de durée
    // — la directive produit du 2026-07-30 l'interdit — mais une borne mémoire :
    // 100 Mo laissent passer plusieurs heures de parole.
    let data;
    try {
      data = await request.file({ limits: { fileSize: MAX_UPLOAD_BYTES } });
    } catch {
      return sendError(reply, 413, 'Audio file too large (100 MB max)', { code: 'FILE_TOO_LARGE' });
    }
    if (!data) {
      return sendBadRequest(reply, 'No file provided', { code: 'NO_FILE' });
    }
    if (!ALLOWED_MIME.has(data.mimetype)) {
      return sendBadRequest(reply, 'Invalid audio format. Supported: mp3, mp4, wav, m4a, aac, ogg', { code: 'INVALID_AUDIO_FORMAT' });
    }

    // MÊME RÈGLE QUE LA CAPTURE : ce qui n'est pas servable n'entre pas. Prendre
    // l'extension du nom de fichier client sans la confronter aux six servies
    // laissait `song.mpga` (MIME `audio/mpeg`, accepté ci-dessus) créer une
    // ligne dont le `fileUrl` renvoie 400 à VIE.
    const ext = servableExtension(data.mimetype, data.filename || '');
    if (!ext) {
      return sendBadRequest(reply, 'Unsupported audio container', { code: 'INVALID_AUDIO_FORMAT' });
    }

    const title = String((data.fields['title'] as any)?.value ?? 'Son sans titre').slice(0, 100);
    const isPublic = (data.fields['isPublic'] as any)?.value !== 'false';
    const durationRaw = parseInt((data.fields['duration'] as any)?.value ?? '0', 10);
    // Aucun plafond de durée (directive produit 2026-07-30).
    const duration = isNaN(durationRaw) ? 0 : durationRaw;

    let buffer: Buffer;
    try {
      buffer = await data.toBuffer();
    } catch {
      // Le plafond ci-dessus se déclenche ICI quand la taille n'est connue qu'au
      // fil du flux — c'est le cas nominal d'un envoi sans `Content-Length`.
      return sendError(reply, 413, 'Audio file too large (100 MB max)', { code: 'FILE_TOO_LARGE' });
    }

    // OBLIGATOIRE : MongoDB traite l'absence comme `null` dans un index unique.
    // Sans `contentHash`, le SECOND upload d'un même utilisateur violerait
    // `@@unique([uploaderId, contentHash])` et renverrait 500.
    // Haché sur le buffer DÉJÀ en mémoire (`toBuffer()` l'a matérialisé de toute
    // façon) : même SHA-256 que `SoundCaptureService.hashFile`, donc les deux
    // chemins de création dédoublonnent ensemble, sans relire le disque.
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    // Ré-envoyer le même fichier est IDEMPOTENT, pas une erreur. Avant, le
    // second envoi violait l'index unique et renvoyait une 500 nue.
    const existing = await prisma.sound.findFirst({
      where: { uploaderId: authContext.registeredUser.id, contentHash },
      include: soundUploaderInclude,
    });
    if (existing) {
      return sendSuccess(reply, toDTO(existing as unknown as Record<string, unknown>));
    }

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const filename = `story_audio_${randomUUID()}${ext}`;
    await fs.writeFile(path.join(UPLOAD_DIR, filename), buffer);

    const audio = await prisma.sound.create({
      data: {
        uploaderId: authContext.registeredUser.id,
        fileUrl: staticFileUrl(filename),
        title,
        duration,
        isPublic,
        contentHash,
      },
      include: soundUploaderInclude,
    });

    return sendSuccess(reply, toDTO(audio as unknown as Record<string, unknown>), { statusCode: 201 });
  });

  // GET /stories/audio — Liste bibliothèque publique (triée par popularité)
  fastify.get('/stories/audio', {
    preValidation: [requiredAuth],
    config: { rateLimit: createSoundRouteRateLimitConfig('list') },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }

    const { q, limit } = parsed.data;
    // `mutedAt` retire de la DÉCOUVERTE en plus d'arrêter la diffusion.
    const where: any = { isPublic: true, mutedAt: null };
    if (q) {
      // Titre OU pseudo de l'uploadeur. Un son CAPTURÉ naît sans titre — le
      // libellé « Son original » est composé par le client dans sa langue —
      // donc chercher le titre seul rendrait introuvable tout ce que la
      // bibliothèque produit d'elle-même.
      where.OR = [
        { title: { contains: q, mode: 'insensitive' } },
        { uploader: { username: { contains: q, mode: 'insensitive' } } },
      ];
    }

    const audios = await prisma.sound.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      take: limit,
      include: soundUploaderInclude,
    });

    // Le tri reste sur `usageCount` (pistes) — c'est un classement interne.
    // Les compteurs AFFICHÉS sortent d'ailleurs et comptent des publications :
    // cf. `soundStats.ts` pour pourquoi les deux ne peuvent pas être le même
    // nombre.
    const stats = await loadSoundStats(prisma, audios.map((a) => a.id));

    return sendSuccess(reply, audios.map((a) => toDTO(a as unknown as Record<string, unknown>, stats.get(a.id))));
  });

  // GET /static/:filename — Serve uploaded story audio files (JWT-protected)
  fastify.get<{ Params: { filename: string } }>('/static/:filename', {
    preValidation: [requiredAuth],
    // already-compressed audio binary — never recompressed (Traefik excludedContentTypes)
    // Généreux : une story enchaîne plusieurs pistes, et le client ne met en
    // cache que `private, max-age=3600`.
    config: { rateLimit: createSoundRouteRateLimitConfig('stream') },
  }, async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
    const { filename } = request.params;

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_AUDIO_EXT.has(ext)) {
      return sendBadRequest(reply, 'Invalid file type', { code: 'INVALID_FILE_TYPE' });
    }

    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeName);

    // LIMITE ASSUMÉE : le PostMedia SOURCE reste servi par `/attachments/file/*`
    // (sans authentification) et par nginx en cache immutable. Couper un son
    // arrête la copie de bibliothèque, pas l'original du post. Le retrait
    // complet suppose de supprimer le média source — lot 2.
    // `mutedAt` doit arrêter la DIFFUSION, pas seulement masquer la métadonnée.
    //
    // ÉGALITÉ, pas `endsWith` : le suffixe n'est pas indexable et faisait un
    // SCAN DE COLLECTION à chaque lecture audio. Les deux chemins de création
    // (upload manuel et capture) écrivent `fileUrl` via `staticFileUrl`, donc
    // l'URL exacte se reconstruit ici — et `@@index([fileUrl])` la sert.
    let muted: { id: string } | null = null;
    try {
      muted = await prisma.sound.findFirst({
        where: { fileUrl: staticFileUrl(safeName), mutedAt: { not: null } },
        select: { id: true },
      });
    } catch (err) {
      // ÉCHEC FERMÉ, et assumé : `mutedAt` est un interrupteur DMCA/modération.
      // Servir le fichier parce que la base n'a pas répondu diffuserait
      // précisément ce qu'un ayant droit a fait couper. 503 explicite plutôt
      // qu'une 500 anonyme — et la route n'est de toute façon atteignable que
      // si l'authentification a abouti.
      request.log.error({ err, filename: safeName }, 'static: mute lookup failed');
      return sendError(reply, 503, 'Sound availability cannot be verified', { code: 'SOUND_LOOKUP_FAILED' });
    }
    if (muted) {
      return sendError(reply, 410, 'Sound is no longer available', { code: 'SOUND_MUTED' });
    }

    try {
      await fs.access(filePath);
    } catch {
      return sendNotFound(reply, 'Audio file not found', { code: 'FILE_NOT_FOUND' });
    }

    const contentType = EXT_TO_MIME[ext] ?? 'application/octet-stream';
    reply.header('Content-Type', contentType);
    reply.header('Cache-Control', 'private, max-age=3600');
    return reply.send(await fs.readFile(filePath));
  });
}
