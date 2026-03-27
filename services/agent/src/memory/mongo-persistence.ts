import type { PrismaClient, UserRole } from '@meeshy/shared/prisma/client';
import type { ToneProfile, ControlledUser } from '../graph/state';
import { toneProfileToGlobalFields } from './profile-merger';

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
        commonEmojis: profile.commonEmojis,
        reactionPatterns: profile.reactionPatterns,
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
        commonEmojis: profile.commonEmojis,
        reactionPatterns: profile.reactionPatterns,
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

  async getControlledUsers(conversationId: string): Promise<ControlledUser[]> {
    const roles = await this.prisma.agentUserRole.findMany({ where: { conversationId } });
    if (roles.length === 0) return [];

    const userIds = roles.map((r) => r.userId);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, username: true, systemLanguage: true },
    });
    const userMap = new Map(users.map((u) => [u.id, { displayName: u.displayName ?? u.username ?? u.id, username: u.username ?? u.id, systemLanguage: u.systemLanguage }]));

    return roles.map((r) => ({
      userId: r.userId,
      displayName: userMap.get(r.userId)?.displayName ?? r.userId,
      username: userMap.get(r.userId)?.username ?? r.userId,
      systemLanguage: userMap.get(r.userId)?.systemLanguage ?? 'fr',
      source: 'manual' as const,
      role: {
        userId: r.userId,
        displayName: userMap.get(r.userId)?.displayName ?? r.userId,
        origin: r.origin as ToneProfile['origin'],
        archetypeId: r.archetypeId ?? undefined,
        personaSummary: r.personaSummary,
        tone: r.tone,
        vocabularyLevel: r.vocabularyLevel,
        typicalLength: r.typicalLength,
        emojiUsage: r.emojiUsage,
        topicsOfExpertise: r.topicsOfExpertise,
        topicsAvoided: r.topicsAvoided,
        relationshipMap: r.relationshipMap as Record<string, string>,
        catchphrases: r.catchphrases,
        responseTriggers: r.responseTriggers,
        silenceTriggers: r.silenceTriggers,
        commonEmojis: r.commonEmojis,
        reactionPatterns: r.reactionPatterns,
        messagesAnalyzed: r.messagesAnalyzed,
        confidence: r.confidence,
        locked: r.locked,
      },
    }));
  }

  async getInactiveUsers(conversationId: string, thresholdHours: number, excludedRoles: string[], excludedUserIds: string[]) {
    const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const participants = await this.prisma.participant.findMany({
      where: {
        conversationId,
        isActive: true,
        lastActiveAt: { lt: threshold },
        userId: { not: null, notIn: excludedUserIds },
        user: { role: { notIn: excludedRoles as UserRole[] } },
      },
      select: {
        user: { select: { id: true, displayName: true, username: true, bio: true, systemLanguage: true } },
      },
    });
    return participants
      .filter((p): p is typeof p & { user: NonNullable<typeof p.user> } => p.user != null)
      .map((p) => p.user);
  }

  async getPotentialControlledUsers(
    conversationId: string,
    limit: number,
    thresholdHours: number,
    excludedRoles: string[],
    excludedUserIds: string[],
  ) {
    const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const existingRoles = await this.prisma.agentUserRole.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    const existingRoleUserIds = existingRoles.map((r) => r.userId);

    const participants = await this.prisma.participant.findMany({
      where: {
        conversationId,
        isActive: true,
        lastActiveAt: { lt: threshold },
        userId: { not: null, notIn: [...excludedUserIds, ...existingRoleUserIds] },
        user: { role: { notIn: excludedRoles as UserRole[] } },
      },
      select: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            systemLanguage: true,
            agentGlobalProfile: true,
          },
        },
      },
      orderBy: { lastActiveAt: 'asc' },
      take: limit,
    });

    return participants
      .filter((p): p is typeof p & { user: NonNullable<typeof p.user> } => p.user != null)
      .map((p) => p.user);
  }

  async getLeastActiveParticipants(
    conversationId: string,
    limit: number,
    excludedUserIds: string[],
    existingControlledUserIds: string[],
  ) {
    const participants = await this.prisma.participant.findMany({
      where: {
        conversationId,
        isActive: true,
        userId: { not: null, notIn: [...excludedUserIds, ...existingControlledUserIds] },
      },
      select: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            systemLanguage: true,
            agentGlobalProfile: true,
          },
        },
      },
      orderBy: { lastActiveAt: 'asc' },
      take: limit,
    });

    return participants
      .filter((p): p is typeof p & { user: NonNullable<typeof p.user> } => p.user != null)
      .map((p) => p.user);
  }

  async getGlobalProfile(userId: string) {
    return this.prisma.agentGlobalProfile.findUnique({ where: { userId } });
  }

  async upsertGlobalProfile(userId: string, data: ReturnType<typeof toneProfileToGlobalFields>) {
    return this.prisma.agentGlobalProfile.upsert({
      where: { userId },
      create: { userId, ...data },
      update: data,
    });
  }

  async getEligibleConversations(options?: {
    eligibleTypes?: string[];
    freshnessHours?: number;
    maxConversations?: number;
  }) {
    const types = options?.eligibleTypes ?? ['group', 'channel', 'public', 'global'];
    const freshnessHours = options?.freshnessHours ?? 24;
    const maxConversations = options?.maxConversations ?? 0;

    const freshnessThreshold = new Date(Date.now() - freshnessHours * 60 * 60 * 1000);

    const conversations = await this.prisma.conversation.findMany({
      where: {
        type: { in: types },
        isActive: true,
        lastMessageAt: { gte: freshnessThreshold },
      },
      include: {
        agentConfig: true,
      },
      orderBy: { lastMessageAt: 'desc' },
      ...(maxConversations > 0 ? { take: maxConversations } : {}),
    });

    // No config = eligible (auto-pickup). enabled: false = manually disabled = skip.
    return conversations.filter((conv) => !conv.agentConfig || conv.agentConfig.enabled !== false);
  }

  async getConversationContext(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, description: true },
    });
  }

  async getRecentMessageCount(conversationId: string, withinMinutes: number, excludeAgent = false): Promise<number> {
    const since = new Date(Date.now() - withinMinutes * 60 * 1000);
    return this.prisma.message.count({
      where: {
        conversationId,
        createdAt: { gte: since },
        deletedAt: null,
        ...(excludeAgent ? { messageSource: { not: 'agent' } } : {}),
      },
    });
  }

  async getRecentUniqueAuthors(conversationId: string, withinMinutes: number, excludeAgent = false): Promise<number> {
    const since = new Date(Date.now() - withinMinutes * 60 * 1000);
    const messages = await this.prisma.message.findMany({
      where: {
        conversationId,
        createdAt: { gte: since },
        deletedAt: null,
        ...(excludeAgent ? { messageSource: { not: 'agent' } } : {}),
      },
      select: { senderId: true },
      distinct: ['senderId'],
    });
    return messages.length;
  }

  async getAnalytics(conversationId: string) {
    return this.prisma.agentAnalytic.findUnique({ where: { conversationId } });
  }

  async updateAnalytics(conversationId: string, data: { messagesSent: number; wordsSent: number; avgConfidence: number }) {
    return this.prisma.agentAnalytic.upsert({
      where: { conversationId },
      create: {
        conversationId,
        messagesSent: data.messagesSent,
        totalWordsSent: data.wordsSent,
        avgConfidence: data.avgConfidence,
        lastResponseAt: new Date(),
      },
      update: {
        messagesSent: { increment: data.messagesSent },
        totalWordsSent: { increment: data.wordsSent },
        avgConfidence: data.avgConfidence,
        lastResponseAt: new Date(),
      },
    });
  }

  async getGlobalConfig() {
    return this.prisma.agentGlobalConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
  }

  async getSummaryRecord(conversationId: string) {
    return this.prisma.agentConversationSummary.findUnique({ where: { conversationId } });
  }

  async getRecentMessages(conversationId: string, limit: number) {
    return this.prisma.message.findMany({
      where: {
        conversationId,
        deletedAt: null,
      },
      include: {
        sender: {
          select: {
            id: true,
            displayName: true,
            user: { select: { username: true } },
          },
        },
      },
      orderBy: { createdAt: 'desc' },
      take: limit,
    });
  }
}
