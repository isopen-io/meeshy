import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ConfigCache } from '../config/config-cache';

const cacheInvalidateSchema = z.object({
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/).optional(),
  global: z.boolean().optional(),
}).refine((d) => d.conversationId || d.global, {
  message: 'Either conversationId or global=true is required',
});

const conversationIdParamSchema = z.object({
  conversationId: z.string().regex(/^[0-9a-fA-F]{24}$/),
});

/**
 * The agent service exposes a tiny HTTP surface meant for the gateway only.
 * Everything CRUD-shaped (configs, global config, analytics) lives in the
 * gateway under /admin/agent/* — keeping that flow single-source-of-truth
 * is what guarantees the cache-invalidation contract holds. The endpoints
 * below exist because the gateway needs to push live signals into the
 * agent process (stop a scan, bust an in-process cache).
 */
export async function configRoutes(
  fastify: FastifyInstance,
  prisma: PrismaClient,
  redis: any,
  configCache?: ConfigCache,
) {
  // Direct cache-busting endpoint called by the gateway after a config write.
  // Provides a reliable backup path when Redis pub/sub fails silently
  // (circuit breaker open, subscriber not connected, partition).
  fastify.post('/api/agent/cache/invalidate', async (req, reply) => {
    const parsed = cacheInvalidateSchema.safeParse(req.body);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, message: 'Invalid payload', errors: parsed.error.flatten() });
    }
    if (!configCache) {
      const targets: string[] = [];
      if (parsed.data.conversationId) targets.push(`agent:config:${parsed.data.conversationId}`);
      if (parsed.data.global) targets.push('agent:global-config');
      if (targets.length > 0) await redis.del(...targets);
      fastify.log.info({ targets }, '[Agent] Cache invalidated via direct HTTP (no ConfigCache instance)');
      return { success: true, data: { invalidated: targets } };
    }
    if (parsed.data.conversationId) {
      await configCache.invalidate(parsed.data.conversationId);
    }
    if (parsed.data.global) {
      await configCache.invalidateGlobal();
    }
    fastify.log.info({ body: parsed.data }, '[Agent] Cache invalidated via direct HTTP');
    return { success: true, data: { invalidated: parsed.data } };
  });

  // Stops an in-flight scan for a conversation. Used by the gateway's
  // POST /admin/agent/configs/:id/stop. Sets a Redis flag the scan loop
  // checks at each node boundary, and clears the in-DB scan marker so the
  // admin UI flips back to PLAY immediately.
  fastify.post('/api/agent/config/:conversationId/stop', async (req, reply) => {
    const parsed = conversationIdParamSchema.safeParse(req.params);
    if (!parsed.success) {
      return reply.status(400).send({ success: false, message: 'Invalid conversationId' });
    }
    const { conversationId } = parsed.data;
    await Promise.all([
      redis.set(`agent:scan-stop:${conversationId}`, '1', 'EX', 60),
      prisma.agentConfig.updateMany({
        where: { conversationId },
        data: { scanStartedAt: null, currentNode: null },
      }),
    ]);
    return { success: true };
  });
}
