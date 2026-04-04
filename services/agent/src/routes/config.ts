import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

const agentConfigSchema = z.object({
  conversationId: z.string(),
  enabled: z.boolean().optional(),
  manualUserIds: z.array(z.string()).optional(),
  autoPickupEnabled: z.boolean().optional(),
  inactivityThresholdHours: z.number().optional(),
  minHistoricalMessages: z.number().optional(),
  maxControlledUsers: z.number().optional(),
  excludedRoles: z.array(z.string()).optional(),
  excludedUserIds: z.array(z.string()).optional(),
  triggerOnTimeout: z.boolean().optional(),
  timeoutSeconds: z.number().optional(),
  triggerOnUserMessage: z.boolean().optional(),
  triggerFromUserIds: z.array(z.string()).optional(),
  triggerOnReplyTo: z.boolean().optional(),
  agentType: z.string().optional(),
  contextWindowSize: z.number().optional(),
  useFullHistory: z.boolean().optional(),
  scanIntervalMinutes: z.number().optional(),
  minResponsesPerCycle: z.number().optional(),
  maxResponsesPerCycle: z.number().optional(),
  reactionsEnabled: z.boolean().optional(),
  maxReactionsPerCycle: z.number().optional(),
  agentInstructions: z.string().nullable().optional(),
  webSearchEnabled: z.boolean().optional(),
  minWordsPerMessage: z.number().optional(),
  maxWordsPerMessage: z.number().optional(),
  generationTemperature: z.number().optional(),
  qualityGateEnabled: z.boolean().optional(),
  qualityGateMinScore: z.number().optional(),
  weekdayMaxMessages: z.number().optional(),
  weekendMaxMessages: z.number().optional(),
  weekdayMaxUsers: z.number().optional(),
  weekendMaxUsers: z.number().optional(),
  burstEnabled: z.boolean().optional(),
  burstSize: z.number().optional(),
  burstIntervalMinutes: z.number().optional(),
  quietIntervalMinutes: z.number().optional(),
  inactivityDaysThreshold: z.number().optional(),
  prioritizeTaggedUsers: z.boolean().optional(),
  prioritizeRepliedUsers: z.boolean().optional(),
  reactionBoostFactor: z.number().optional(),
  eligibleConversationTypes: z.array(z.string()).optional(),
  maxConversationsPerCycle: z.number().optional(),
  messageFreshnessHours: z.number().optional(),
  globalScanEnabled: z.boolean().optional(),
  globalScanMinInterval: z.number().optional(),
  globalScanMaxInterval: z.number().optional(),
});

const globalConfigSchema = z.object({
  systemPrompt: z.string().optional(),
  enabled: z.boolean().optional(),
  globalScanEnabled: z.boolean().optional(),
  globalScanMinInterval: z.number().optional(),
  globalScanMaxInterval: z.number().optional(),
  defaultProvider: z.string().optional(),
  defaultModel: z.string().optional(),
  fallbackProvider: z.string().nullable().optional(),
  fallbackModel: z.string().nullable().optional(),
  globalDailyBudgetUsd: z.number().optional(),
  maxConcurrentCalls: z.number().optional(),
  eligibleConversationTypes: z.array(z.string()).optional(),
  messageFreshnessHours: z.number().optional(),
  maxConversationsPerCycle: z.number().optional(),
  weekdayMaxConversations: z.number().optional(),
  weekendMaxConversations: z.number().optional(),
});

export async function configRoutes(fastify: FastifyInstance, prisma: PrismaClient, redis: any) {
  fastify.get('/api/agent/config/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    const config = await prisma.agentConfig.findUnique({ where: { conversationId } });
    return { success: true, data: config };
  });

  fastify.put('/api/agent/config', async (req) => {
    const body = agentConfigSchema.parse(req.body);
    const { conversationId, ...fields } = body;
    const data = Object.fromEntries(
      Object.entries(fields).filter(([, v]) => v !== undefined),
    );
    const config = await prisma.agentConfig.upsert({
      where: { conversationId },
      create: { conversationId, ...data },
      update: data,
    });
    return { success: true, data: config };
  });

  fastify.delete('/api/agent/config/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    await prisma.agentConfig.delete({ where: { conversationId } });
    return { success: true };
  });

  fastify.post('/api/agent/config/:conversationId/stop', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    await redis.set(`agent:scan-stop:${conversationId}`, '1', 'EX', 60);
    return { success: true };
  });

  fastify.get('/api/agent/global-config', async () => {
    const config = await prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
    return { success: true, data: config };
  });

  fastify.put('/api/agent/global-config', async (req) => {
    const body = globalConfigSchema.parse(req.body);
    const existing = await prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
    const data = Object.fromEntries(
      Object.entries(body).filter(([, v]) => v !== undefined),
    );
    if (existing) {
      const updated = await prisma.agentGlobalConfig.update({
        where: { id: existing.id },
        data,
      });
      return { success: true, data: updated };
    }
    const created = await prisma.agentGlobalConfig.create({ data: data as any });
    return { success: true, data: created };
  });

  fastify.get('/api/agent/analytics/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };
    const [analytics, summary] = await Promise.all([
      prisma.agentAnalytic.findUnique({ where: { conversationId } }),
      prisma.agentConversationSummary.findUnique({ where: { conversationId } }),
    ]);
    return { success: true, data: { analytics, summary } };
  });
}
