/**
 * Point d'entrée des routes admin de l'agent conversationnel — compose les
 * surfaces extraites (#4284) : configs, rôles, LLM, reset, observabilité,
 * delivery-queue. Construit ici les dépendances partagées entre elles (client
 * HTTP agent, invalidation de cache, notification temps réel des dashboards
 * admin) et les injecte via `AgentRouteDeps` (`agent-shared.ts`). Le détail de
 * chaque surface vit dans son fichier `agent-<surface>.ts` frère.
 */

import type { FastifyInstance } from 'fastify';
import { AGENT_ADMIN_EVENT_CHANNEL, type AgentAdminEventData, type AgentAdminEventKind } from '@meeshy/shared/types/socketio-events';
import { getCacheStore } from '../../services/CacheStore';
import { AgentHttpClient } from '../../services/AgentHttpClient';
import type { InvalidationStatus, AgentRouteDeps } from './agent-shared';
import { registerAgentObservabilityRoutes } from './agent-observability';
import { registerAgentConfigsRoutes } from './agent-configs';
import { registerAgentRolesRoutes } from './agent-roles';
import { registerAgentLlmRoutes } from './agent-llm';
import { registerAgentResetRoutes } from './agent-reset';
import { registerAgentDeliveryQueueRoutes } from './agent-delivery-queue';

export async function agentAdminRoutes(fastify: FastifyInstance) {
  const agentHost = process.env.AGENT_HOST;
  const agentHttpPort = process.env.AGENT_HTTP_PORT || '3200';
  const agentClient = agentHost ? new AgentHttpClient(`http://${agentHost}:${agentHttpPort}`) : null;

  // Belt-and-suspenders cache invalidation: publish on Redis (low-latency for
  // healthy paths) AND POST directly to the agent service (resilient when the
  // pub/sub channel is briefly down). Both are best-effort and never throw —
  // the route still succeeds, but the caller gets a status object so the
  // admin UI can surface partial failures.
  async function broadcastInvalidation(payload: { conversationId?: string; global?: boolean }): Promise<InvalidationStatus> {
    notifyAdminDashboards('config', payload.conversationId);
    const status: InvalidationStatus = {
      redisPublishOk: false,
      redisSubscribersNotified: 0,
      httpInvalidateOk: false,
      anyChannelSucceeded: false,
    };

    const [pub, http] = await Promise.allSettled([
      getCacheStore().publish('agent:config-invalidated', JSON.stringify(payload)),
      agentClient
        ? agentClient.invalidateCache(payload)
        : Promise.reject(new Error('AGENT_HOST not configured')),
    ]);

    if (pub.status === 'fulfilled') {
      status.redisPublishOk = true;
      status.redisSubscribersNotified = typeof pub.value === 'number' ? pub.value : 0;
    }
    if (http.status === 'fulfilled') {
      status.httpInvalidateOk = true;
    } else if (agentClient) {
      // Only warn if we tried HTTP and it failed — missing AGENT_HOST is
      // expected in some deployments and not worth a warning per request.
      fastify.log.warn({ err: http.reason }, '[AgentConfig] HTTP cache invalidation failed');
    }
    // "Succeeded" means at least one agent instance actually received the
    // invalidation. Redis PUBLISH returning 0 means the publish itself was
    // accepted but no subscriber was listening (agent down / not yet
    // connected / network partition), which is functionally a miss — the
    // cache will stay stale until TTL or the next mutation. Counting that
    // as success would make the toast lie to the admin.
    status.anyChannelSucceeded = status.redisSubscribersNotified > 0 || status.httpInvalidateOk;
    return status;
  }

  // Push temps réel vers les dashboards admin (room Socket.IO admin:agent via
  // AgentAdminRelay). Best-effort : un échec de publish ne fait pas échouer la route.
  function notifyAdminDashboards(kind: AgentAdminEventKind, conversationId?: string): void {
    const payload: AgentAdminEventData = conversationId ? { kind, conversationId } : { kind };
    getCacheStore().publish(AGENT_ADMIN_EVENT_CHANNEL, JSON.stringify(payload)).catch((err) =>
      fastify.log.warn({ err }, '[AgentAdmin] admin-event publish failed'));
  }

  const deps: AgentRouteDeps = { agentClient, broadcastInvalidation, notifyAdminDashboards };

  registerAgentObservabilityRoutes(fastify);
  registerAgentConfigsRoutes(fastify, deps);
  registerAgentRolesRoutes(fastify, deps);
  registerAgentLlmRoutes(fastify, deps);
  registerAgentResetRoutes(fastify, deps);
  registerAgentDeliveryQueueRoutes(fastify, deps);
}
