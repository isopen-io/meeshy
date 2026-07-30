import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { z } from 'zod';
import { UnifiedAuthRequest } from '../../middleware/auth';
import { sendSuccess, sendUnauthorized, sendBadRequest, sendNotFound, sendForbidden, sendError } from '../../utils/response';

const OBJECT_ID = /^[a-f0-9]{24}$/;
const MineQuerySchema = z.object({
  cursor: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
});
const PatchBodySchema = z.object({ isPublic: z.boolean() });

/**
 * Projection explicite : `contentHash` et `uploaderId` ne sortent jamais.
 * Exportée pour `audio.ts` : les routes héritées `/stories/audio` renvoyaient
 * l'entité Prisma brute et fuiteraient les mêmes champs.
 */
export function toDTO(s: Record<string, unknown>) {
  return {
    id: s['id'], title: s['title'], fileUrl: s['fileUrl'],
    durationMs: s['durationMs'] ?? null, waveform: s['waveform'] ?? [],
    usageCount: s['usageCount'] ?? 0, isPublic: s['isPublic'] ?? false,
    createdAt: s['createdAt'] ?? null,
  };
}

export function registerSoundRoutes(fastify: FastifyInstance, prisma: PrismaClient, requiredAuth: any) {
  fastify.get('/sounds/mine', {
    preValidation: [requiredAuth],
    config: { rateLimit: { max: 60, timeWindow: '1 minute' } },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const ctx = (request as UnifiedAuthRequest).authContext;
    if (!ctx?.registeredUser) return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    const parsed = MineQuerySchema.safeParse(request.query);
    if (!parsed.success) return sendBadRequest(reply, 'Invalid query parameters', { code: 'VALIDATION_ERROR' });
    const { cursor, limit } = parsed.data;

    const rows = await prisma.sound.findMany({
      where: {
        uploaderId: ctx.registeredUser.id, mutedAt: null,
        ...(cursor ? { createdAt: { lt: new Date(cursor) } } : {}),
      },
      orderBy: { createdAt: 'desc' },
      take: limit + 1,
    });
    const hasMore = rows.length > limit;
    const page = hasMore ? rows.slice(0, limit) : rows;
    const last = page[page.length - 1] as { createdAt?: Date } | undefined;

    return sendSuccess(reply, page.map((s) => toDTO(s as unknown as Record<string, unknown>)), {
      pagination: { limit, hasMore, nextCursor: hasMore && last?.createdAt ? last.createdAt.toISOString() : null },
    });
  });

  fastify.get<{ Params: { id: string } }>('/sounds/:id', {
    preValidation: [requiredAuth],
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const ctx = (request as unknown as UnifiedAuthRequest).authContext;
    if (!ctx?.registeredUser) return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    if (!OBJECT_ID.test(request.params.id)) return sendBadRequest(reply, 'Invalid sound id', { code: 'VALIDATION_ERROR' });

    const sound = await prisma.sound.findUnique({ where: { id: request.params.id } });
    if (!sound) return sendNotFound(reply, 'Sound not found', { code: 'SOUND_NOT_FOUND' });
    if ((sound as { mutedAt?: Date | null }).mutedAt) {
      return sendError(reply, 410, 'Sound is no longer available', { code: 'SOUND_MUTED' });
    }
    const s = sound as unknown as Record<string, unknown>;
    if (!s['isPublic'] && s['uploaderId'] !== ctx.registeredUser.id) {
      return sendForbidden(reply, 'This sound is private', { code: 'SOUND_FORBIDDEN' });
    }
    return sendSuccess(reply, toDTO(s));
  });

  fastify.patch<{ Params: { id: string } }>('/sounds/:id', {
    preValidation: [requiredAuth],
    config: { rateLimit: { max: 30, timeWindow: '1 minute' } },
  }, async (request, reply) => {
    const ctx = (request as unknown as UnifiedAuthRequest).authContext;
    if (!ctx?.registeredUser) return sendUnauthorized(reply, 'Authentication required', { code: 'UNAUTHORIZED' });
    if (!OBJECT_ID.test(request.params.id)) return sendBadRequest(reply, 'Invalid sound id', { code: 'VALIDATION_ERROR' });
    const parsed = PatchBodySchema.safeParse(request.body);
    if (!parsed.success) return sendBadRequest(reply, 'Invalid body', { code: 'VALIDATION_ERROR' });

    const sound = await prisma.sound.findUnique({
      where: { id: request.params.id }, select: { id: true, uploaderId: true },
    });
    if (!sound) return sendNotFound(reply, 'Sound not found', { code: 'SOUND_NOT_FOUND' });
    if (sound.uploaderId !== ctx.registeredUser.id) return sendForbidden(reply, 'Not the sound owner', { code: 'NOT_SOUND_OWNER' });

    const updated = await prisma.sound.update({
      where: { id: request.params.id }, data: { isPublic: parsed.data.isPublic },
    });
    return sendSuccess(reply, toDTO(updated as unknown as Record<string, unknown>));
  });
}
