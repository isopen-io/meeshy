/**
 * Surface DELIVERY QUEUE des routes admin de l'agent — proxy HTTP vers la
 * file de livraison du service agent (liste, suppression, édition d'un
 * message en attente). Point d'entrée : `agent.ts` (#4284).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { logError } from '../../utils/logger';
import { sendSuccess, sendError, sendBadRequest, sendNotFound, sendInternalError } from '../../utils/response';
import { AgentHttpClient, AgentUnavailableError } from '../../services/AgentHttpClient';
import {
  requireAgentAdmin,
  successDataResponse,
  successArrayResponse,
  stdErrors,
  stdErrorsWithNotFound,
  securityBearerAuth,
  type AgentRouteDeps,
} from './agent-shared';

export function registerAgentDeliveryQueueRoutes(fastify: FastifyInstance, deps: AgentRouteDeps): void {
  const { agentClient } = deps;

  // ── Delivery Queue Proxy (Agent HTTP) ─────────────────────────────────────

  const ensureAgentClient = (reply: FastifyReply): AgentHttpClient | null => {
    if (!agentClient) {
      sendError(reply, 503, 'Agent service not configured');
      return null;
    }
    return agentClient;
  };

  // GET /delivery-queue
  fastify.get('/delivery-queue', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'List pending items in the agent delivery queue.',
      tags: ['admin-agent'],
      summary: 'List delivery queue',
      security: securityBearerAuth,
      querystring: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
        },
      },
      response: { 200: successArrayResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = ensureAgentClient(reply);
    if (!client) return;

    try {
      const { conversationId } = request.query as { conversationId?: string };
      const data = await client.getQueue(conversationId);
      return sendSuccess(reply, Array.isArray(data) ? data : []);
    } catch (error) {
      if (error instanceof AgentUnavailableError) {
        return sendError(reply, 502, 'Agent service unavailable');
      }
      logError(fastify.log, 'Error fetching delivery queue:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // DELETE /delivery-queue/:id
  fastify.delete('/delivery-queue/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Delete a pending item from the delivery queue.',
      tags: ['admin-agent'],
      summary: 'Delete delivery queue item',
      security: securityBearerAuth,
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = ensureAgentClient(reply);
    if (!client) return;

    try {
      const { id } = request.params as { id: string };
      const data = await client.deleteQueueItem(id);
      return sendSuccess(reply, data);
    } catch (error) {
      if (error instanceof AgentUnavailableError) {
        return sendError(reply, 502, 'Agent service unavailable');
      }
      const statusCode = (error as Error & { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        return sendNotFound(reply, 'Item not found or already delivered');
      }
      logError(fastify.log, 'Error deleting delivery queue item:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // PATCH /delivery-queue/:id
  fastify.patch('/delivery-queue/:id', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Edit the content of a pending message in the delivery queue.',
      tags: ['admin-agent'],
      summary: 'Edit delivery queue item',
      security: securityBearerAuth,
      params: {
        type: 'object',
        required: ['id'],
        properties: { id: { type: 'string' } },
      },
      body: {
        type: 'object',
        required: ['content'],
        properties: { content: { type: 'string', minLength: 1, maxLength: 5000 } },
      },
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = ensureAgentClient(reply);
    if (!client) return;

    try {
      const { id } = request.params as { id: string };
      const { content } = request.body as { content: string };
      const data = await client.editQueueItem(id, content);
      return sendSuccess(reply, data);
    } catch (error) {
      if (error instanceof AgentUnavailableError) {
        return sendError(reply, 502, 'Agent service unavailable');
      }
      const statusCode = (error as Error & { statusCode?: number }).statusCode;
      if (statusCode === 404) {
        return sendNotFound(reply, 'Item not found or already delivered');
      }
      if (statusCode === 400) {
        return sendBadRequest(reply, 'Cannot edit reaction content');
      }
      logError(fastify.log, 'Error editing delivery queue item:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });
}
