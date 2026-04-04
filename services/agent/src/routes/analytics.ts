import type { FastifyInstance } from 'fastify';
import type { RedisStateManager } from '../memory/redis-state';
import type { MongoPersistence } from '../memory/mongo-persistence';
import { detectActivity } from '../scheduler/activity-detector';

type AnalyticsDeps = {
  stateManager: RedisStateManager;
  persistence: MongoPersistence;
};

export async function analyticsRoutes(fastify: FastifyInstance, deps: AnalyticsDeps) {
  const { stateManager, persistence } = deps;

  fastify.get('/api/agent/live/:conversationId', async (req) => {
    const { conversationId } = req.params as { conversationId: string };

    const [summary, toneProfiles, messages, activity, analytics, summaryRecord, controlledUsers, config] = await Promise.all([
      stateManager.getSummary(conversationId),
      stateManager.getToneProfiles(conversationId),
      stateManager.getMessages(conversationId),
      detectActivity(persistence, conversationId),
      persistence.getAnalytics(conversationId),
      persistence.getSummaryRecord(conversationId),
      persistence.getControlledUsers(conversationId),
      persistence.getAgentConfig(conversationId),
    ]);

    return {
      success: true,
      data: {
        conversationId,
        summary,
        toneProfiles,
        cachedMessageCount: messages.length,
        activity,
        isScanning: config?.isScanning ?? false,
        currentNode: config?.currentNode ?? null,
        analytics: analytics
          ? {
              messagesSent: analytics.messagesSent,
              totalWordsSent: analytics.totalWordsSent,
              avgConfidence: analytics.avgConfidence,
              lastResponseAt: analytics.lastResponseAt?.toISOString() ?? null,
            }
          : null,
        summaryRecord: summaryRecord
          ? {
              summary: summaryRecord.summary,
              currentTopics: summaryRecord.currentTopics,
              overallTone: summaryRecord.overallTone,
              messageCount: summaryRecord.messageCount,
            }
          : null,
        controlledUsers: controlledUsers.map((cu: { userId: string; displayName: string; systemLanguage: string; role: { confidence: number; locked: boolean } }) => ({
          userId: cu.userId,
          displayName: cu.displayName,
          systemLanguage: cu.systemLanguage,
          confidence: cu.role.confidence,
          locked: cu.role.locked,
        })),
      },
    };
  });
}
