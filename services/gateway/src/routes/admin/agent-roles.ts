/**
 * Surface RÔLES des routes admin de l'agent — assignation d'un archétype à un
 * utilisateur, déverrouillage d'un rôle et catalogue des archétypes.
 * Point d'entrée : `agent.ts` (#4284).
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { z } from 'zod';
import { listArchetypes, getArchetype } from '@meeshy/shared/agent/archetypes';
import { logError } from '../../utils/logger';
import { sendSuccess, sendBadRequest, sendNotFound, sendInternalError } from '../../utils/response';
import {
  requireAgentAdmin,
  validateObjectId,
  objectIdParam,
  successDataResponse,
  successArrayResponse,
  stdErrors,
  stdErrorsWithNotFound,
  securityBearerAuth,
  type AgentRouteDeps,
} from './agent-shared';

const conversationUserParams = {
  type: 'object',
  required: ['conversationId', 'userId'],
  properties: { conversationId: objectIdParam, userId: objectIdParam },
} as const;

export function registerAgentRolesRoutes(fastify: FastifyInstance, deps: AgentRouteDeps): void {
  const { notifyAdminDashboards } = deps;

  // POST /roles/:conversationId/:userId/assign
  fastify.post('/roles/:conversationId/:userId/assign', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Assign an archetype to a user role in a conversation.',
      tags: ['admin-agent'],
      summary: 'Assign archetype to role',
      security: securityBearerAuth,
      params: conversationUserParams,
      body: {
        type: 'object',
        required: ['archetypeId'],
        properties: { archetypeId: { type: 'string', minLength: 1 } },
      },
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId, userId } = request.params as { conversationId: string; userId: string };
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(userId, 'userId', reply)) return;
      const assignBody = z.object({ archetypeId: z.string().min(1) }).safeParse(request.body);
      /* istanbul ignore next -- Fastify body schema (required archetypeId, minLength: 1) rejects invalid body before handler runs */
      if (!assignBody.success) {
        return sendBadRequest(reply, 'archetypeId requis');
      }
      const { archetypeId } = assignBody.data;

      const archetype = getArchetype(archetypeId);
      if (!archetype) {
        return sendNotFound(reply, 'Archétype non trouvé');
      }

      const role = await fastify.prisma.agentUserRole.upsert({
        where: { userId_conversationId: { userId, conversationId } },
        create: {
          userId,
          conversationId,
          origin: 'archetype',
          archetypeId,
          personaSummary: archetype.personaSummary,
          tone: archetype.tone,
          vocabularyLevel: archetype.vocabularyLevel,
          typicalLength: archetype.typicalLength,
          emojiUsage: archetype.emojiUsage,
          topicsOfExpertise: [...archetype.topicsOfExpertise],
          topicsAvoided: [],
          relationshipMap: {},
          catchphrases: [...archetype.catchphrases],
          responseTriggers: [...archetype.responseTriggers],
          silenceTriggers: [...archetype.silenceTriggers],
          confidence: archetype.confidence,
        },
        update: {
          origin: 'archetype',
          archetypeId,
          personaSummary: archetype.personaSummary,
          tone: archetype.tone,
          vocabularyLevel: archetype.vocabularyLevel,
          typicalLength: archetype.typicalLength,
          emojiUsage: archetype.emojiUsage,
          topicsOfExpertise: [...archetype.topicsOfExpertise],
          catchphrases: [...archetype.catchphrases],
          responseTriggers: [...archetype.responseTriggers],
          silenceTriggers: [...archetype.silenceTriggers],
        },
      });

      notifyAdminDashboards('config', conversationId);
      return sendSuccess(reply, role);
    } catch (error) {
      logError(fastify.log, 'Error assigning archetype:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // POST /roles/:conversationId/:userId/unlock
  fastify.post('/roles/:conversationId/:userId/unlock', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'Unlock a user role, resetting confidence to 0 to allow re-observation.',
      tags: ['admin-agent'],
      summary: 'Unlock user role',
      security: securityBearerAuth,
      params: conversationUserParams,
      response: { 200: successDataResponse, ...stdErrorsWithNotFound },
    },
  }, async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      const { conversationId, userId } = request.params as { conversationId: string; userId: string };
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(conversationId, 'conversationId', reply)) return;
      /* istanbul ignore next -- Fastify schema validates the ObjectId pattern before the handler runs */
      if (!validateObjectId(userId, 'userId', reply)) return;
      const role = await fastify.prisma.agentUserRole.update({
        where: { userId_conversationId: { userId, conversationId } },
        data: { locked: false, confidence: 0 },
      });
      notifyAdminDashboards('config', conversationId);
      return sendSuccess(reply, role);
    } catch (error) {
      logError(fastify.log, 'Error unlocking role:', error);
      return sendInternalError(reply, 'Erreur serveur');
    }
  });

  // GET /archetypes
  fastify.get('/archetypes', {
    onRequest: [fastify.authenticate, requireAgentAdmin],
    schema: {
      description: 'List all available agent archetypes (hardcoded catalogue).',
      tags: ['admin-agent'],
      summary: 'List archetypes',
      security: securityBearerAuth,
      response: { 200: successArrayResponse, ...stdErrors },
    },
  }, async (_request: FastifyRequest, reply: FastifyReply) => {
    return sendSuccess(reply, listArchetypes());
  });
}
