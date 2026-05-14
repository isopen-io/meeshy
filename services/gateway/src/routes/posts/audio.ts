import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound } from '../../utils/response';

const UPLOAD_DIR = process.env.UPLOAD_DIR ?? '/tmp/meeshy-uploads';
const MAX_AUDIO_DURATION_SEC = 60;
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

    const data = await (request as any).file();
    if (!data) {
      return sendBadRequest(reply, 'No file provided', { code: 'NO_FILE' });
    }
    if (!ALLOWED_MIME.has(data.mimetype)) {
      return sendBadRequest(reply, 'Invalid audio format. Supported: mp3, mp4, wav, m4a, aac, ogg', { code: 'INVALID_AUDIO_FORMAT' });
    }

    const title = String((data.fields['title'] as any)?.value ?? 'Son sans titre').slice(0, 100);
    const isPublic = (data.fields['isPublic'] as any)?.value !== 'false';
    const durationRaw = parseInt((data.fields['duration'] as any)?.value ?? '0', 10);
    const duration = isNaN(durationRaw) ? 0 : Math.min(durationRaw, MAX_AUDIO_DURATION_SEC);

    await fs.mkdir(UPLOAD_DIR, { recursive: true });
    const ext = path.extname(data.filename || '') || '.m4a';
    const filename = `story_audio_${randomUUID()}${ext}`;
    const filePath = path.join(UPLOAD_DIR, filename);
    await fs.writeFile(filePath, await data.toBuffer());

    const fileUrl = `/api/v1/static/${filename}`;

    const audio = await prisma.storyBackgroundAudio.create({
      data: {
        uploaderId: authContext.registeredUser.id,
        fileUrl,
        title,
        duration,
        isPublic,
      },
      include: {
        uploader: { select: { username: true } },
      },
    });

    return sendSuccess(reply, audio, { statusCode: 201 });
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
    const where: any = { isPublic: true };
    if (q) {
      where.title = { contains: q, mode: 'insensitive' };
    }

    const audios = await prisma.storyBackgroundAudio.findMany({
      where,
      orderBy: { usageCount: 'desc' },
      take: limit,
      include: { uploader: { select: { username: true } } },
    });

    return sendSuccess(reply, audios);
  });

  // POST /stories/audio/:audioId/use — Incrémenter le compteur d'utilisation
  fastify.post<{ Params: { audioId: string } }>('/stories/audio/:audioId/use', {
    preValidation: [requiredAuth],
  }, async (request, reply) => {
    const { audioId } = request.params;
    await prisma.storyBackgroundAudio.update({
      where: { id: audioId },
      data: { usageCount: { increment: 1 } },
    }).catch(() => null); // Silencieux si l'audio n'existe pas

    return sendSuccess(reply, null);
  });

  // GET /static/:filename — Serve uploaded story audio files (JWT-protected)
  fastify.get<{ Params: { filename: string } }>('/static/:filename', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest<{ Params: { filename: string } }>, reply: FastifyReply) => {
    const { filename } = request.params;

    const ext = path.extname(filename).toLowerCase();
    if (!ALLOWED_AUDIO_EXT.has(ext)) {
      return sendBadRequest(reply, 'Invalid file type', { code: 'INVALID_FILE_TYPE' });
    }

    const safeName = path.basename(filename);
    const filePath = path.join(UPLOAD_DIR, safeName);

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
