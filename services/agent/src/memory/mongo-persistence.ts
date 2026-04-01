import type { PrismaClient, UserRole } from '@meeshy/shared/prisma/client';
import type { ToneProfile, ControlledUser, TraitValue } from '../graph/state';
import { toneProfileToGlobalFields } from './profile-merger';

const TRAIT_FIELDS = [
  'verbosity', 'formality', 'responseSpeed', 'initiativeRate', 'clarity', 'argumentation',
  'socialStyle', 'assertiveness', 'agreeableness', 'humor', 'emotionality', 'openness',
  'confidence', 'creativity', 'patience', 'adaptability',
  'empathy', 'politeness', 'leadership', 'conflictStyle', 'supportiveness', 'diplomacy', 'trustLevel',
  'emotionalStability', 'positivity', 'sensitivity', 'stressResponse',
] as const;

const TRAIT_CATEGORY_MAP: Record<string, readonly string[]> = {
  communication: ['verbosity', 'formality', 'responseSpeed', 'initiativeRate', 'clarity', 'argumentation'],
  personality: ['socialStyle', 'assertiveness', 'agreeableness', 'humor', 'emotionality', 'openness', 'confidence', 'creativity', 'patience', 'adaptability'],
  interpersonal: ['empathy', 'politeness', 'leadership', 'conflictStyle', 'supportiveness', 'diplomacy', 'trustLevel'],
  emotional: ['emotionalStability', 'positivity', 'sensitivity', 'stressResponse'],
};

function capitalize(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

function flattenTraits(traits: ToneProfile['traits']): Record<string, unknown> {
  if (!traits) return {};
  const flat: Record<string, unknown> = {};
  for (const [category, fields] of Object.entries(TRAIT_CATEGORY_MAP)) {
    const categoryTraits = (traits as Record<string, Record<string, TraitValue> | undefined>)[category];
    if (!categoryTraits) continue;
    for (const field of fields) {
      const tv = categoryTraits[field];
      if (tv) {
        flat[`trait${capitalize(field)}`] = tv.label;
        flat[`trait${capitalize(field)}Score`] = Math.round(tv.score);
      }
    }
  }
  return flat;
}

function unflattenTraits(row: Record<string, unknown>): ToneProfile['traits'] {
  const traits: NonNullable<ToneProfile['traits']> = {};
  let hasAny = false;
  for (const [category, fields] of Object.entries(TRAIT_CATEGORY_MAP)) {
    const categoryTraits: Record<string, TraitValue> = {};
    let hasCategoryTrait = false;
    for (const field of fields) {
      const label = row[`trait${capitalize(field)}`];
      const score = row[`trait${capitalize(field)}Score`];
      if (typeof label === 'string' && typeof score === 'number') {
        categoryTraits[field] = { label, score };
        hasCategoryTrait = true;
      }
    }
    if (hasCategoryTrait) {
      (traits as Record<string, Record<string, TraitValue>>)[category] = categoryTraits;
      hasAny = true;
    }
  }
  return hasAny ? traits : undefined;
}

function migrateRelationshipMap(raw: unknown): ToneProfile['relationshipMap'] {
  if (!raw || typeof raw !== 'object') return {};
  const result: ToneProfile['relationshipMap'] = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === 'string') {
      result[key] = value;
    } else if (value && typeof value === 'object' && 'attitude' in value) {
      const v = value as { attitude: unknown; score: unknown; detail: unknown };
      if (typeof v.attitude === 'string' && typeof v.score === 'number' && typeof v.detail === 'string') {
        result[key] = { attitude: v.attitude, score: v.score, detail: v.detail };
      }
    }
  }
  return result;
}

export type SummaryExtra = {
  healthScore?: number;
  engagementLevel?: string;
  conflictLevel?: string;
  dynamique?: string;
  dominantEmotions?: string[];
};

export class MongoPersistence {
  constructor(private prisma: PrismaClient) {}

  async getAgentConfig(conversationId: string) {
    return this.prisma.agentConfig.findUnique({ where: { conversationId } });
  }

  async ensureAgentConfig(conversationId: string) {
    return this.prisma.agentConfig.upsert({
      where: { conversationId },
      create: { conversationId, enabled: true },
      update: {},
    });
  }

  async upsertUserRole(conversationId: string, profile: ToneProfile) {
    const traitFields = flattenTraits(profile.traits);
    const baseData = {
      origin: profile.origin,
      archetypeId: profile.archetypeId ?? null,
      personaSummary: profile.personaSummary,
      tone: profile.tone,
      vocabularyLevel: profile.vocabularyLevel,
      typicalLength: profile.typicalLength,
      emojiUsage: profile.emojiUsage,
      topicsOfExpertise: profile.topicsOfExpertise,
      topicsAvoided: profile.topicsAvoided,
      relationshipMap: profile.relationshipMap as any,
      catchphrases: profile.catchphrases,
      responseTriggers: profile.responseTriggers,
      silenceTriggers: profile.silenceTriggers,
      commonEmojis: profile.commonEmojis,
      reactionPatterns: profile.reactionPatterns,
      messagesAnalyzed: profile.messagesAnalyzed,
      confidence: profile.confidence,
      locked: profile.locked,
      dominantEmotions: profile.dominantEmotions ?? [],
      ...traitFields,
    };

    return this.prisma.agentUserRole.upsert({
      where: { userId_conversationId: { userId: profile.userId, conversationId } },
      create: {
        userId: profile.userId,
        conversationId,
        ...baseData,
      },
      update: baseData,
    });
  }

  async upsertSummary(conversationId: string, summary: string, topics: string[], tone: string, lastMessageId: string, messageCount: number, extra?: SummaryExtra) {
    const extraFields = extra ? {
      ...(extra.healthScore !== undefined ? { healthScore: extra.healthScore } : {}),
      ...(extra.engagementLevel !== undefined ? { engagementLevel: extra.engagementLevel } : {}),
      ...(extra.conflictLevel !== undefined ? { conflictLevel: extra.conflictLevel } : {}),
      ...(extra.dynamique !== undefined ? { dynamique: extra.dynamique } : {}),
      ...(extra.dominantEmotions !== undefined ? { dominantEmotions: extra.dominantEmotions } : {}),
    } : {};

    return this.prisma.agentConversationSummary.upsert({
      where: { conversationId },
      create: { conversationId, summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount, ...extraFields },
      update: { summary, currentTopics: topics, overallTone: tone, lastMessageId, messageCount, ...extraFields },
    });
  }

  async getLlmConfig() {
    return this.prisma.agentLlmConfig.findFirst({ orderBy: { updatedAt: 'desc' } });
  }

  async evictRecentlyActiveUsers(): Promise<number> {
    const recentLoginThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const roles = await this.prisma.agentUserRole.findMany({
      where: { user: { lastActiveAt: { gte: recentLoginThreshold } } },
      select: { id: true, userId: true, conversationId: true },
    });
    if (roles.length === 0) return 0;

    const manualConfigs = await this.prisma.agentConfig.findMany({
      where: { conversationId: { in: [...new Set(roles.map((r) => r.conversationId))] } },
      select: { conversationId: true, manualUserIds: true },
    });
    const manualMap = new Map(manualConfigs.map((c) => [c.conversationId, new Set((c.manualUserIds ?? []) as string[])]));

    const toDelete = roles.filter((r) => !manualMap.get(r.conversationId)?.has(r.userId));
    if (toDelete.length === 0) return 0;

    await this.prisma.agentUserRole.deleteMany({
      where: { id: { in: toDelete.map((r) => r.id) } },
    });

    return toDelete.length;
  }

  async getControlledUsers(conversationId: string): Promise<ControlledUser[]> {
    const [roles, config] = await Promise.all([
      this.prisma.agentUserRole.findMany({ where: { conversationId } }),
      this.prisma.agentConfig.findUnique({
        where: { conversationId },
        select: { manualUserIds: true },
      }),
    ]);

    const manualUserIds = new Set((config?.manualUserIds ?? []) as string[]);
    const roleUserIds = new Set(roles.map((r: { userId: string }) => r.userId));
    const missingManualIds = [...manualUserIds].filter((id) => !roleUserIds.has(id));

    const allUserIds = [...roleUserIds, ...missingManualIds];
    if (allUserIds.length === 0) return [];

    const users = await this.prisma.user.findMany({
      where: { id: { in: allUserIds } },
      select: { id: true, displayName: true, username: true, systemLanguage: true, lastActiveAt: true },
    });
    type UserInfo = { displayName: string; username: string; systemLanguage: string | null; lastActiveAt: Date };
    const userMap: Map<string, UserInfo> = new Map(users.map((u: { id: string; displayName: string | null; username: string | null; systemLanguage: string | null; lastActiveAt: Date }) => [u.id, { displayName: u.displayName ?? u.username ?? u.id, username: u.username ?? u.id, systemLanguage: u.systemLanguage, lastActiveAt: u.lastActiveAt }]));

    const recentLoginThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const results: ControlledUser[] = roles
      .filter((r: Record<string, any>) => {
        if (manualUserIds.has(r.userId as string)) return true;
        const userInfo = userMap.get(r.userId as string);
        if (!userInfo) return true;
        return userInfo.lastActiveAt < recentLoginThreshold;
      })
      .map((r: Record<string, any>) => ({
      userId: r.userId as string,
      displayName: userMap.get(r.userId as string)?.displayName ?? r.userId,
      username: userMap.get(r.userId as string)?.username ?? r.userId,
      systemLanguage: userMap.get(r.userId as string)?.systemLanguage ?? 'fr',
      source: manualUserIds.has(r.userId as string) ? 'manual' as const : 'auto_rule' as const,
      role: {
        userId: r.userId as string,
        displayName: userMap.get(r.userId as string)?.displayName ?? r.userId,
        origin: r.origin as ToneProfile['origin'],
        archetypeId: r.archetypeId ?? undefined,
        personaSummary: r.personaSummary,
        tone: r.tone,
        vocabularyLevel: r.vocabularyLevel,
        typicalLength: r.typicalLength,
        emojiUsage: r.emojiUsage,
        topicsOfExpertise: r.topicsOfExpertise,
        topicsAvoided: r.topicsAvoided,
        relationshipMap: migrateRelationshipMap(r.relationshipMap),
        catchphrases: r.catchphrases,
        responseTriggers: r.responseTriggers,
        silenceTriggers: r.silenceTriggers,
        commonEmojis: r.commonEmojis,
        reactionPatterns: r.reactionPatterns,
        messagesAnalyzed: r.messagesAnalyzed,
        confidence: r.confidence,
        locked: r.locked,
        traits: unflattenTraits(r),
        dominantEmotions: Array.isArray(r.dominantEmotions) ? r.dominantEmotions as string[] : [],
      },
    }));

    for (const uid of missingManualIds) {
      results.push({
        userId: uid,
        displayName: userMap.get(uid)?.displayName ?? uid,
        username: userMap.get(uid)?.username ?? uid,
        systemLanguage: userMap.get(uid)?.systemLanguage ?? 'fr',
        source: 'manual',
        role: {
          userId: uid,
          displayName: userMap.get(uid)?.displayName ?? uid,
          origin: 'archetype',
          personaSummary: '',
          tone: 'neutre',
          vocabularyLevel: 'courant',
          typicalLength: 'moyen',
          emojiUsage: 'occasionnel',
          topicsOfExpertise: [],
          topicsAvoided: [],
          relationshipMap: {},
          catchphrases: [],
          responseTriggers: [],
          silenceTriggers: [],
          commonEmojis: [],
          reactionPatterns: [],
          messagesAnalyzed: 0,
          confidence: 0.1,
          locked: false,
        },
      });
    }

    return results;
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
      .flatMap((p) => (p.user ? [p.user] : []));
  }

  async getPotentialControlledUsers(
    conversationId: string,
    limit: number,
    thresholdHours: number,
    excludedRoles: string[],
    excludedUserIds: string[],
  ) {
    const threshold = new Date(Date.now() - thresholdHours * 60 * 60 * 1000);
    const recentLoginThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const existingRoles = await this.prisma.agentUserRole.findMany({
      where: { conversationId },
      select: { userId: true },
    });
    const existingRoleUserIds = existingRoles.map((r: { userId: string }) => r.userId);

    const participants = await this.prisma.participant.findMany({
      where: {
        conversationId,
        isActive: true,
        lastActiveAt: { lt: threshold },
        userId: { not: null, notIn: [...excludedUserIds, ...existingRoleUserIds] },
        user: {
          role: { notIn: excludedRoles as UserRole[] },
          lastActiveAt: { lt: recentLoginThreshold },
        },
      },
      select: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            systemLanguage: true,
            agentGlobalProfile: true,
            lastActiveAt: true,
          },
        },
      },
      orderBy: { lastActiveAt: 'asc' },
      take: limit,
    });

    return participants
      .flatMap((p) => (p.user ? [p.user] : []));
  }

  async getLeastActiveParticipants(
    conversationId: string,
    limit: number,
    excludedUserIds: string[],
    existingControlledUserIds: string[],
  ) {
    const recentLoginThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
    const participants = await this.prisma.participant.findMany({
      where: {
        conversationId,
        isActive: true,
        userId: { not: null, notIn: [...excludedUserIds, ...existingControlledUserIds] },
        user: {
          lastActiveAt: { lt: recentLoginThreshold },
        },
      },
      select: {
        user: {
          select: {
            id: true,
            displayName: true,
            username: true,
            systemLanguage: true,
            agentGlobalProfile: true,
            lastActiveAt: true,
          },
        },
      },
      orderBy: { lastActiveAt: 'asc' },
      take: limit,
    });

    return participants
      .flatMap((p) => (p.user ? [p.user] : []));
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
    const recentLoginThreshold = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    const [configuredConversations, freshConversations] = await Promise.all([
      this.prisma.conversation.findMany({
        where: {
          type: { in: types },
          isActive: true,
          agentConfig: { enabled: true },
        },
        include: { agentConfig: true },
        orderBy: { lastMessageAt: 'desc' },
      }),
      this.prisma.conversation.findMany({
        where: {
          type: { in: types },
          isActive: true,
          lastMessageAt: { gte: freshnessThreshold },
          agentConfig: null,
        },
        include: { agentConfig: true },
        orderBy: { lastMessageAt: 'desc' },
      }),
    ]);

    const seen = new Set(configuredConversations.map((c: { id: string }) => c.id));
    const merged = [
      ...configuredConversations,
      ...freshConversations.filter((c: { id: string }) => !seen.has(c.id)),
    ];

    const allConvIds = merged.map((c: { id: string }) => c.id);

    const [existingRoles, eligibleParticipantCounts] = await Promise.all([
      this.prisma.agentUserRole.groupBy({
        by: ['conversationId'],
        where: { conversationId: { in: allConvIds } },
        _count: true,
      }),
      this.prisma.participant.groupBy({
        by: ['conversationId'],
        where: {
          conversationId: { in: allConvIds },
          isActive: true,
          userId: { not: null },
          user: { lastActiveAt: { lt: recentLoginThreshold } },
        },
        _count: true,
      }),
    ]);

    const roleCountMap = new Map(existingRoles.map((r) => [r.conversationId, r._count]));
    const eligibleCountMap = new Map(eligibleParticipantCounts.map((p) => [p.conversationId, p._count]));

    const filtered = merged.filter((c: { id: string; agentConfig: any }) => {
      const hasRoles = (roleCountMap.get(c.id) ?? 0) > 0;
      const hasEligible = (eligibleCountMap.get(c.id) ?? 0) > 0;
      const hasManualUsers = ((c.agentConfig?.manualUserIds as string[]) ?? []).length > 0;
      return hasRoles || hasEligible || hasManualUsers;
    });

    return maxConversations > 0 ? filtered.slice(0, maxConversations) : filtered;
  }

  async getConversationContext(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, description: true },
    });
  }

  async getConversationWithType(conversationId: string) {
    return this.prisma.conversation.findUnique({
      where: { id: conversationId },
      select: { title: true, description: true, type: true },
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
    const existing = await this.prisma.agentAnalytic.findUnique({ where: { conversationId } });
    const newTotal = (existing?.messagesSent ?? 0) + data.messagesSent;
    const blendedConfidence = existing
      ? (existing.avgConfidence * existing.messagesSent + data.avgConfidence * data.messagesSent) / Math.max(1, newTotal)
      : data.avgConfidence;

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
        avgConfidence: blendedConfidence,
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

  async getAgentMessageEngagement(conversationId: string, withinHours: number): Promise<{ userId: string; repliesReceived: number; reactionsReceived: number }[]> {
    const since = new Date(Date.now() - withinHours * 60 * 60 * 1000);
    const agentMessages = await this.prisma.message.findMany({
      where: {
        conversationId,
        messageSource: 'agent',
        createdAt: { gte: since },
        deletedAt: null,
      },
      select: {
        id: true,
        senderId: true,
        _count: { select: { reactions: true } },
        replies: { where: { messageSource: { not: 'agent' }, deletedAt: null }, select: { id: true } },
      },
    });

    const byUser = new Map<string, { repliesReceived: number; reactionsReceived: number }>();
    for (const msg of agentMessages) {
      const uid = msg.senderId ?? 'unknown';
      const existing = byUser.get(uid) ?? { repliesReceived: 0, reactionsReceived: 0 };
      existing.repliesReceived += msg.replies.length;
      existing.reactionsReceived += msg._count.reactions;
      byUser.set(uid, existing);
    }

    return [...byUser.entries()].map(([userId, stats]) => ({ userId, ...stats }));
  }

  async createScanLog(data: Record<string, unknown>) {
    return this.prisma.agentScanLog.create({ data: data as any });
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
