import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { sendSuccess, sendError, sendBadRequest, sendNotFound, sendInternalError } from '../../utils/response';
import { getCacheStore } from '../../services/CacheStore';
import { AgentHttpClient } from '../../services/AgentHttpClient';
import { AGENT_ADMIN_EVENT_CHANNEL, type AgentAdminEventData } from '@meeshy/shared/types/socketio-events';

/**
 * Routes admin CRUD pour le catalogue de topics dynamiques utilisé par le
 * strategist agent. Réutilise le pattern existant `requireAgentAdmin` + Zod
 * validation + Redis pub/sub invalidation (canal `agent:config-invalidated`).
 *
 * Endpoints :
 *   GET    /admin/agent/topics              — list (query ?active=true|false|all)
 *   GET    /admin/agent/topics/:id          — détail
 *   POST   /admin/agent/topics              — create
 *   PATCH  /admin/agent/topics/:id          — update
 *   DELETE /admin/agent/topics/:id?hard=true — soft (isActive=false) or hard delete
 *   POST   /admin/agent/topics/:id/test     — test regex contre sampleText
 */

const OBJECT_ID_REGEX = /^[0-9a-fA-F]{24}$/;

const requireAgentAdmin = async (request: FastifyRequest, reply: FastifyReply) => {
  const user = (request as FastifyRequest & { user?: { role?: string } }).user;
  if (!user) {
    sendError(reply, 401, 'Authentification requise');
    return;
  }
  if (!['BIGBOSS', 'ADMIN'].includes(user.role ?? '')) {
    sendError(reply, 403, 'Permission insuffisante');
    return;
  }
};

const TopicInputSchema = z.object({
  slug: z.string().regex(/^[a-z0-9_-]+$/, 'kebab_case requis').min(2).max(40),
  label: z.string().min(1).max(80),
  description: z.string().max(280).optional().nullable(),
  keywordPatterns: z.array(
    z.string().refine((s) => {
      try { new RegExp(s); return true; } catch { return false; }
    }, 'Regex invalide')
  ).min(1).max(10),
  instructionTemplate: z.string().min(20).max(1000),
  searchHintTemplate: z.string().min(5).max(200),
  examples: z.array(z.string().max(300)).max(5).default([]),
  cooldownMinutes: z.number().int().min(0).max(10080).default(60),
  isActive: z.boolean().default(true),
});

const TopicPatchSchema = TopicInputSchema.partial();

const TestRegexBodySchema = z.object({ sampleText: z.string().min(1).max(5000) });

/**
 * Broadcast à tous les agents : invalide leur cache topic catalog.
 * Pattern belt-and-suspenders : Redis pub/sub (low-latency) + HTTP POST
 * direct au agent (résilient si pub/sub down). Best-effort, ne throw pas.
 */
async function broadcastTopicsInvalidation(fastify: FastifyInstance): Promise<void> {
  const agentHost = process.env.AGENT_HOST;
  const agentHttpPort = process.env.AGENT_HTTP_PORT || '3200';
  const agentClient = agentHost ? new AgentHttpClient(`http://${agentHost}:${agentHttpPort}`) : null;

  const payload = JSON.stringify({ scope: 'topics' });
  const tasks: Array<Promise<unknown>> = [
    getCacheStore().publish('agent:config-invalidated', payload).catch((err) =>
      fastify.log.warn({ err }, '[TopicCatalog] Redis publish failed'),
    ),
  ];
  if (agentClient) {
    tasks.push(
      agentClient.invalidateCache({ scope: 'topics' } as any).catch((err) =>
        fastify.log.warn({ err }, '[TopicCatalog] HTTP invalidate failed'),
      ),
    );
  }
  await Promise.allSettled(tasks);
}

/**
 * Push temps réel vers les dashboards admin (room `admin:agent` via
 * AgentAdminRelay) — même canal que les mutations configs/queue/scans.
 */
function notifyAdminDashboards(fastify: FastifyInstance): void {
  const payload: AgentAdminEventData = { kind: 'topics' };
  getCacheStore().publish(AGENT_ADMIN_EVENT_CHANNEL, JSON.stringify(payload)).catch((err) =>
    fastify.log.warn({ err }, '[TopicCatalog] admin-event publish failed'));
}

export async function agentTopicsRoutes(fastify: FastifyInstance) {
  // GET /admin/agent/topics
  fastify.get('/topics', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const query = request.query as { active?: string };
      const where: { isActive?: boolean } = {};
      if (query.active === 'true') where.isActive = true;
      else if (query.active === 'false') where.isActive = false;
      const topics = await fastify.prisma.agentTopicCatalog.findMany({
        where,
        orderBy: { slug: 'asc' },
      });
      sendSuccess(reply, topics);
    } catch (err) {
      sendInternalError(reply, 'Erreur récupération topics', err);
    }
  });

  // GET /admin/agent/topics/:id
  fastify.get('/topics/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    try {
      const topic = await fastify.prisma.agentTopicCatalog.findUnique({ where: { id } });
      if (!topic) {
        sendNotFound(reply, 'Topic introuvable');
        return;
      }
      sendSuccess(reply, topic);
    } catch (err) {
      sendInternalError(reply, 'Erreur récupération topic', err);
    }
  });

  // POST /admin/agent/topics
  fastify.post('/topics', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const parsed = TopicInputSchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      return;
    }
    try {
      // parsed.data has all required fields filled (Zod .default() applies at
      // parse-time) ; cast to satisfy Prisma's strict input typing.
      const created = await fastify.prisma.agentTopicCatalog.create({
        data: parsed.data as Required<typeof parsed.data>,
      });
      await broadcastTopicsInvalidation(fastify);
      notifyAdminDashboards(fastify);
      sendSuccess(reply, created);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2002') {
        sendBadRequest(reply, 'Slug déjà existant');
      } else {
        sendInternalError(reply, 'Erreur création topic', err);
      }
    }
  });

  // PATCH /admin/agent/topics/:id
  fastify.patch('/topics/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const parsed = TopicPatchSchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, parsed.error.issues.map((e) => `${e.path.join('.')}: ${e.message}`).join('; '));
      return;
    }
    try {
      const updated = await fastify.prisma.agentTopicCatalog.update({
        where: { id },
        data: parsed.data,
      });
      await broadcastTopicsInvalidation(fastify);
      notifyAdminDashboards(fastify);
      sendSuccess(reply, updated);
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2025') {
        sendNotFound(reply, 'Topic introuvable');
      } else {
        sendInternalError(reply, 'Erreur update topic', err);
      }
    }
  });

  // DELETE /admin/agent/topics/:id?hard=true
  fastify.delete('/topics/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const query = request.query as { hard?: string };
    const hard = query.hard === 'true';
    try {
      if (hard) {
        await fastify.prisma.agentTopicCatalog.delete({ where: { id } });
      } else {
        await fastify.prisma.agentTopicCatalog.update({
          where: { id },
          data: { isActive: false },
        });
      }
      await broadcastTopicsInvalidation(fastify);
      notifyAdminDashboards(fastify);
      sendSuccess(reply, { id, deleted: hard ? 'hard' : 'soft' });
    } catch (err: unknown) {
      const e = err as { code?: string };
      if (e?.code === 'P2025') {
        sendNotFound(reply, 'Topic introuvable');
      } else {
        sendInternalError(reply, 'Erreur suppression topic', err);
      }
    }
  });

  // POST /admin/agent/topics/:id/test
  fastify.post('/topics/:id/test', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const { id } = request.params as { id: string };
    if (!OBJECT_ID_REGEX.test(id)) {
      sendBadRequest(reply, 'id invalide');
      return;
    }
    const parsed = TestRegexBodySchema.safeParse(request.body);
    if (!parsed.success) {
      sendBadRequest(reply, 'sampleText requis');
      return;
    }
    try {
      const topic = await fastify.prisma.agentTopicCatalog.findUnique({ where: { id } });
      if (!topic) {
        sendNotFound(reply, 'Topic introuvable');
        return;
      }
      const matches: Record<string, number> = {};
      for (const src of topic.keywordPatterns) {
        try {
          const re = new RegExp(src, 'gi');
          const found = parsed.data.sampleText.match(re) ?? [];
          matches[src] = found.length;
        } catch {
          matches[src] = -1;
        }
      }
      sendSuccess(reply, { matches });
    } catch (err) {
      sendInternalError(reply, 'Erreur test regex', err);
    }
  });
}
