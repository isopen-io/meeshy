import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import path from 'path';
import fs from 'fs/promises';
import { randomUUID } from 'crypto';

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
    const authContext = (request as any).authContext;
    if (!authContext?.registeredUser) {
      return reply.status(401).send({ success: false, error: 'Authentication required' });
    }

    const data = await (request as any).file();
    if (!data) {
      return reply.status(400).send({ success: false, error: 'No file provided' });
    }
    if (!ALLOWED_MIME.has(data.mimetype)) {
      return reply.status(400).send({ success: false, error: 'Invalid audio format. Supported: mp3, mp4, wav, m4a, aac, ogg' });
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

    return reply.status(201).send({ success: true, data: audio });
  });

  // GET /stories/audio — Liste bibliothèque publique (triée par popularité)
  fastify.get('/stories/audio', {
    preValidation: [requiredAuth],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, error: 'Invalid query parameters' });
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

    return reply.send({ success: true, data: audios });
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

    return reply.send({ success: true });
  });
}
