import type { FastifyInstance } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { listArchetypes, getArchetype } from '../archetypes/catalog';

export async function rolesRoutes(fastify: FastifyInstance, prisma: PrismaClient) {
  fastify.get('/api/agent/archetypes', async () => {
    return { success: true, data: listArchetypes() };
  });

  fastify.get('/api/agent/roles/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    const roles = await prisma.agentUserRole.findMany({ where: { conversationId } });
    return { success: true, data: roles };
  });

  fastify.post('/api/agent/roles/:conversationId/:userId/assign-archetype', async (req) => {
    const { conversationId, userId } = req.params as { conversationId: string; userId: string };
    const { archetypeId } = req.body as { archetypeId: string };

    const archetype = getArchetype(archetypeId);
    if (!archetype) return { success: false, error: { code: 'NOT_FOUND', message: 'Archetype not found' } };

    const role = await prisma.agentUserRole.upsert({
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

    return { success: true, data: role };
  });

  fastify.post('/api/agent/roles/:conversationId/:userId/unlock', async (req) => {
    const { conversationId, userId } = req.params as { conversationId: string; userId: string };
    const role = await prisma.agentUserRole.update({
      where: { userId_conversationId: { userId, conversationId } },
      data: { locked: false, confidence: 0 },
    });
    return { success: true, data: role };
  });
}
