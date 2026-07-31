import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendError } from '../../utils/response';
import { toDTO } from './sounds';
import {
  ALLOWED_UPLOAD_MIME as ALLOWED_MIME,
  ALLOWED_AUDIO_EXT,
  EXT_TO_MIME,
  staticFileUrl,
} from '../../services/posts/soundFormats';

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
    config: { rateLimit: { max: 20, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const authContext = (request as UnifiedAuthRequest).authContext;
    if (!authContext?.registeredUser) {
      return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    }

    const data = await request.file();
    if (!data) {
      return sendBadRequest(reply, 'No file provided', { code: 'NO_FILE' });
    }
    if (!ALLOWED_MIME.has(data.mimetype)) {
      return sendBadRequest(reply, 'Invalid audio format. Supported: mp3, mp4, wav, m4a, aac, ogg', { code: 'INVALID_AUDIO_FORMAT' });
    }

    const title = String((data.fields['title'] as any)?.value ?? 'Son sans titre').slice(0, 100);
    const isPublic = (data.fields['isPublic'] as any)?.value !== 'false';
    const durationRaw = parseInt((data.fields['duration'] as any)?.value ?? '0', 10);
    // Aucun plafond de durée (directive produit 2026-07-30).
    const duration = isNaN(durationRaw) ? 0 : durationRaw;

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const ext = path.extname(data.filename || '') || '.m4a';
    const filename = `story_audio_${randomUUID()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    const buffer = await data.toBuffer();
    await fs.writeFile(filePath, buffer);

    const fileUrl = staticFileUrl(filename);

    // OBLIGATOIRE : MongoDB traite l'absence comme `null` dans un index unique.
    // Sans `contentHash`, le SECOND upload d'un même utilisateur violerait
    // `@@unique([uploaderId, contentHash])` et renverrait 500.
    // Haché sur le buffer DÉJÀ en mémoire (`toBuffer()` l'a matérialisé de toute
    // façon) : même SHA-256 que `SoundCaptureService.hashFile`, donc les deux
    // chemins de création dédoublonnent ensemble, sans relire le disque.
    const contentHash = createHash('sha256').update(buffer).digest('hex');

    const audio = await prisma.sound.create({
      data: {
        uploaderId: authContext.registeredUser.id,
        fileUrl,
        title,
        duration,
        isPublic,
        contentHash,
      },
    });

    return sendSuccess(reply, toDTO(audio as unknown as Record<string, unknown>), { statusCode: 201 });
  });

  // GET /stories/audio — Liste bibliothèque publique (triée par popularité)
  fastify.get('/stories/audio', {
    preValidation: [requiredAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    }

    const { q, limit } = parsed.data;
    // `mutedAt` retire de la DÉCOUVERTE en plus d'arrêter la diffusion.
    const where: any = { isPublic: true, mutedAt: null };
    if (q) {
      where.title = { contains: q, mode: 'insensitive' };
    }

    const audios = await prisma.sound.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      take: limit,
    });

    return sendSuccess(reply, audios.map((a) => toDTO(a as unknown as Record<string, unknown>)));
  });

  // GET /static/:filename — Serve uploaded story audio files (JWT-protected)
  fastify.get<{ Params: { filename: string } }>('/static/:filename', {
    preValidation: [requiredAuth],
    // already-compressed audio binary — never recompressed (Traefik excludedContentTypes)
    // Généreux : une story enchaîne plusieurs pistes, et le client ne met en
    // cache que `private, max-age=3600`.
    config: { rateLimit: { max: 240, timeWindow: '1 minute' } },
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
