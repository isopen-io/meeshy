import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { createHash, randomUUID } from 'crypto';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendError } from '../../utils/response';
import { toDTO } from './sounds';

// Volume DÉDIÉ, servi uniquement par la route JWT `/static/:filename`.
// Surtout PAS sous UPLOAD_PATH : tout ce qui s'y trouve est exposé par
// `GET /attachments/file/*` (sans authentification, download.ts:256) et par le
// montage nginx en lecture seule sur `static.<domaine>`, en cache immutable un an.
const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/app/sounds';
const ALLOWED_MIME = new Set([
  'audio/mpeg',
  'audio/mp4',
  'audio/wav',
  'audio/x-m4a',
  'audio/aac',
  'audio/ogg',
]);
const ALLOWED_AUDIO_EXT = new Set(['.mp3', '.mp4', '.wav', '.m4a', '.aac', '.ogg']);
const EXT_TO_MIME: Record<string, string> = {
  '.mp3': 'audio/mpeg',
  '.mp4': 'audio/mp4',
  '.wav': 'audio/wav',
  '.m4a': 'audio/x-m4a',
  '.aac': 'audio/aac',
  '.ogg': 'audio/ogg',
};

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

    const fileUrl = `/api/v1/static/${filename}`;

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
    const muted = await prisma.sound.findFirst({
      where: { fileUrl: { endsWith: `/${safeName}` }, mutedAt: { not: null } },
      select: { id: true },
    });
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
