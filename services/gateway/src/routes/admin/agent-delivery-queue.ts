/**
 * Surface DELIVERY QUEUE des routes admin de l'agent — proxy HTTP vers la
 * file de livraison du service agent (liste, suppression, édition d'un
 * message en attente). Point d'entrée : `agent.ts` (#4284).
 */

import { auditAgentGesture } from './agent-audit';
import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { logError, logWarn } from '../../utils/logger';
import { sendSuccess, sendError, sendBadRequest, sendNotFound, sendInternalError } from '../../utils/response';
import { AgentHttpClient, AgentUnavailableError } from '../../services/AgentHttpClient';
import {
  requireAgentAdmin,
  successDataResponse,
  stdErrors,
  stdErrorsWithNotFound,
  securityBearerAuth,
  type AgentRouteDeps,
} from './agent-shared';
import { distinctObjectIds, loadAdminPeople } from './oversight-people';
import { adminViewer } from './oversight-viewer';
import { loadConversationNamePreviews, namePreviewSchema, servedNamePreview } from './conversation-name-preview';

type QueueItem = Record<string, unknown> & {
  readonly conversationId?: unknown;
  readonly action?: { readonly asUserId?: unknown } | null;
};

const asQueueItem = (value: unknown): QueueItem | null =>
  value !== null && typeof value === 'object' && !Array.isArray(value) ? (value as QueueItem) : null;

const personaIdOf = (item: QueueItem): string | null =>
  typeof item.action?.asUserId === 'string' ? item.action.asUserId : null;

const conversationIdOf = (item: QueueItem): string | null =>
  typeof item.conversationId === 'string' ? item.conversationId : null;

/**
 * Nomme les éléments de la file : `conversation` (titre, et l'aperçu des
 * membres d'une conversation sans titre — servi au seul rang d'administration,
 * cf. `conversation-name-preview.ts`) et `persona` (le membre joué). Trois
 * requêtes au plus pour toute la file, aucune pour une file vide.
 */
async function nameQueueItems(
  prisma: PrismaClient,
  items: ReadonlyArray<QueueItem>,
  options: { readonly canSeeMembers: boolean },
): Promise<QueueItem[]> {
  if (items.length === 0) return [];
  const conversationIds = distinctObjectIds(items.map(conversationIdOf));
  const [conversations, people] = await Promise.all([
    conversationIds.length === 0
      ? Promise.resolve([])
      : prisma.conversation.findMany({
          where: { id: { in: conversationIds } },
          select: { id: true, title: true },
          take: conversationIds.length,
        }),
    loadAdminPeople(prisma, items.map(personaIdOf)),
  ]);
  const previews = await loadConversationNamePreviews(prisma, conversations, { allowed: options.canSeeMembers });
  const byId = new Map(conversations.map((conversation) => [conversation.id, conversation]));

  return items.map((item) => {
    const conversationId = conversationIdOf(item);
    const conversation = conversationId ? byId.get(conversationId) : undefined;
    const personaId = personaIdOf(item);
    const persona = personaId ? people.get(personaId) : undefined;
    return {
      ...item,
      conversation: conversation
        ? { id: conversation.id, title: conversation.title ?? null, ...servedNamePreview(previews.get(conversation.id)) }
        : null,
      persona: persona ? { id: persona.id, username: persona.username, displayName: persona.displayName } : null,
    };
  });
}

/** Un élément de file : ses champs d'origine passent tels quels, les deux noms sont déclarés. */
const deliveryQueueListResponse = {
  type: 'object',
  properties: {
    success: { type: 'boolean', example: true },
    data: {
      type: 'array',
      items: {
        type: 'object',
        additionalProperties: true,
        properties: {
          conversation: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              title: { type: 'string', nullable: true },
              ...namePreviewSchema,
            },
          },
          persona: {
            type: 'object',
            nullable: true,
            properties: {
              id: { type: 'string' },
              username: { type: 'string' },
              displayName: { type: 'string', nullable: true },
            },
          },
        },
      },
    },
  },
} as const;

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
      description: 'List pending items in the agent delivery queue. Each item also carries `conversation` ({ id, title } plus a member preview for an untitled conversation, administration rank only) and `persona` ({ id, username, displayName } of the played member), or null when not found.',
      tags: ['admin-agent'],
      summary: 'List delivery queue',
      security: securityBearerAuth,
      querystring: {
        type: 'object',
        properties: {
          conversationId: { type: 'string' },
        },
      },
      response: { 200: deliveryQueueListResponse, ...stdErrors },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    const client = ensureAgentClient(reply);
    if (!client) return;

    try {
      const { conversationId } = request.query as { conversationId?: string };
      const data = await client.getQueue(conversationId);
      const items = (Array.isArray(data) ? data : []).map(asQueueItem).filter((item): item is QueueItem => item !== null);
      try {
        const named = await nameQueueItems(fastify.prisma, items, { canSeeMembers: adminViewer(request).hasAdminRank });
        return sendSuccess(reply, named);
      } catch (error) {
        // Les noms sont un confort : leur échec ne retire pas la file.
        logWarn(fastify.log, 'Delivery queue served without names:', error);
        return sendSuccess(reply, items);
      }
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
      await auditAgentGesture(request, { action: 'AGENT_QUEUE_ITEM_DELETED', entity: 'Agent', entityId: id });
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
      await auditAgentGesture(request, { action: 'AGENT_QUEUE_ITEM_EDITED', entity: 'Agent', entityId: id, changes: { content: { after: content } } });
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
