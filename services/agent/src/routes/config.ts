import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const agentConfigSchema = z.object({
  conversationId: z.string(),
  enabled: z.boolean(),
  manualUserIds: z.array(z.string()).default([]),
  autoPickupEnabled: z.boolean().default(false),
  inactivityThresholdHours: z.number().default(72),
  minHistoricalMessages: z.number().default(0),
  maxControlledUsers: z.number().default(5),
  excludedRoles: z.array(z.string()).default([]),
  excludedUserIds: z.array(z.string()).default([]),
  triggerOnTimeout: z.boolean().default(true),
  timeoutSeconds: z.number().default(300),
  triggerOnUserMessage: z.boolean().default(false),
  triggerFromUserIds: z.array(z.string()).default([]),
  triggerOnReplyTo: z.boolean().default(true),
  agentType: z.string().default('personal'),
  contextWindowSize: z.number().default(50),
  useFullHistory: z.boolean().default(false),
});

export async function configRoutes(fastify: FastifyInstance) {
  fastify.get('/api/agent/config/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    const config = await prisma.agentConfig.findUnique({ where: { conversationId } });
    return { success: true, data: config };
  });

  fastify.put('/api/agent/config', async (req) => {
    const body = agentConfigSchema.parse(req.body);
    const config = await prisma.agentConfig.upsert({
      where: { conversationId: body.conversationId },
      create: { ...body, configuredBy: 'admin' },
      update: body,
    });
    return { success: true, data: config };
  });

  fastify.delete('/api/agent/config/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    await prisma.agentConfig.delete({ where: { conversationId } });
    return { success: true };
  });

  fastify.get('/api/agent/analytics/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    const analytics = await prisma.agentAnalytic.findUnique({ where: { conversationId } });
    return { success: true, data: analytics };
  });
}
