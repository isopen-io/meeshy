import type { PrismaClient } from '@meeshy/shared/prisma/client';
import type { ToneProfile } from '../graph/state';

export class MongoPersistence {
  constructor(private prisma: PrismaClient) {}

  async getAgentConfig(conversationId: string) {
    return this.prisma.agentConfig.findUnique({ where: { conversationId } });
  }

  async upsertUserRole(conversationId: string, profile: ToneProfile) {
    return this.prisma.agentUserRole.upsert({
      where: { userId_conversationId: { userId: profile.userId, conversationId } },
      create: {
        userId: profile.userId,
        conversationId,
        origin: profile.origin,
        archetypeId: profile.archetypeId ?? null,
        personaSummary: profile.personaSummary,
        tone: profile.tone,
        vocabularyLevel: profile.vocabularyLevel,
        typicalLength: profile.typicalLength,
        emojiUsage: profile.emojiUsage,
        topicsOfExpertise: profile.topicsOfExpertise,
        topicsAvoided: profile.topicsAvoided,
        relationshipMap: profile.relationshipMap,
        catchphrases: profile.catchphrases,
        responseTriggers: profile.responseTriggers,
        silenceTriggers: profile.silenceTriggers,
        messagesAnalyzed: profile.messagesAnalyzed,
        confidence: profile.confidence,
        locked: profile.locked,
      },
      update: {
        personaSummary: profile.personaSummary,
        tone: profile.tone,
        vocabularyLevel: profile.vocabularyLevel,
        typicalLength: profile.typicalLength,
        emojiUsage: profile.emojiUsage,
        topicsOfExpertise: profile.topicsOfExpertise,
        topicsAvoided: profile.topicsAvoided,
        relationshipMap: profile.relationshipMap,
        catchphrases: profile.catchphrases,
        responseTriggers: profile.responseTriggers,
        silenceTriggers: profile.silenceTriggers,
        messagesAnalyzed: profile.messagesAnalyzed,
        confidence: profile.confidence,
        locked: profile.locked,
      },
    });
  }

  async upsertSummary(conversationId: string, summary: string, topics: string[], tone: string, lastMessageId: string, messageCount: number) {
    return this.prisma.agentConversationSummary.upsert({
      where: { conversationId },
      create: { conversationId, summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount },
      update: { summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount },
    });
  }

  async getLlmConfig() {
    return this.prisma.agentLlmConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
  }

  async getInactiveUsers(conversationId: string, thresholdHours: number, excludedRoles: string[], excludedUserIds: string[]) {
    const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    return this.prisma.user.findMany({
      where: {
        conversations: { some: { conversationId } },
        lastActiveAt: { lt: threshold },
        role: { notIn: excludedRoles },
        id: { notIn: excludedUserIds },
      },
      select: { id: true, displayName: true, username: true, bio: true, systemLanguage: true },
    });
  }
}
