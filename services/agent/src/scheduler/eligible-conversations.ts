import type { MongoPersistence } from '../memory/mongo-persistence';

export type EligibleConversation = {
  conversationId: string;
  conversationType: string;
  title: string | null;
  description: string | null;
  lastMessageAt: Date;
  memberCount: number;
  scanIntervalMinutes: number;
  minResponsesPerCycle: number;
  maxResponsesPerCycle: number;
  reactionsEnabled: boolean;
  maxReactionsPerCycle: number;
  contextWindowSize: number;
  useFullHistory: boolean;
  agentType: string;
  inactivityThresholdHours: number;
  excludedRoles: string[];
  excludedUserIds: string[];
  agentInstructions: string | null;
  webSearchEnabled: boolean;
  minWordsPerMessage: number;
  maxWordsPerMessage: number;
  generationTemperature: number;
  qualityGateEnabled: boolean;
  qualityGateMinScore: number;
  weekdayMaxMessages: number;
  weekendMaxMessages: number;
  weekdayMaxUsers: number;
  weekendMaxUsers: number;
  burstEnabled: boolean;
  burstSize: number;
  burstIntervalMinutes: number;
  quietIntervalMinutes: number;
  inactivityDaysThreshold: number;
  prioritizeTaggedUsers: boolean;
  prioritizeRepliedUsers: boolean;
  reactionBoostFactor: number;
};

export async function findEligibleConversations(
  persistence: MongoPersistence,
  options?: { eligibleTypes?: string[]; freshnessHours?: number; maxConversations?: number },
): Promise<EligibleConversation[]> {
  const conversations = await persistence.getEligibleConversations({
    ...options,
    freshnessHours: options?.freshnessHours ?? 24,
  });

  return conversations.map((conv) => {
    const config = conv.agentConfig;
    return {
      conversationId: conv.id,
      conversationType: conv.type,
      title: conv.title,
      description: conv.description,
      lastMessageAt: conv.lastMessageAt,
      memberCount: conv.memberCount,
      scanIntervalMinutes: Math.max(1, config?.scanIntervalMinutes ?? 3),
      minResponsesPerCycle: Math.max(0, config?.minResponsesPerCycle ?? 2),
      maxResponsesPerCycle: Math.max(1, Math.min(config?.maxResponsesPerCycle ?? 12, 50)),
      reactionsEnabled: config?.reactionsEnabled ?? true,
      maxReactionsPerCycle: Math.max(0, config?.maxReactionsPerCycle ?? 8),
      contextWindowSize: Math.max(5, Math.min(config?.contextWindowSize ?? 50, 250)),
      useFullHistory: config?.useFullHistory ?? false,
      agentType: config?.agentType ?? 'personal',
      inactivityThresholdHours: Math.max(1, config?.inactivityThresholdHours ?? 30),
      excludedRoles: config?.excludedRoles ?? [],
      excludedUserIds: config?.excludedUserIds ?? [],
      agentInstructions: config?.agentInstructions ?? null,
      webSearchEnabled: config?.webSearchEnabled ?? false,
      minWordsPerMessage: Math.max(1, config?.minWordsPerMessage ?? 3),
      maxWordsPerMessage: Math.max(10, Math.min(config?.maxWordsPerMessage ?? 400, 2000)),
      generationTemperature: Math.max(0, Math.min(config?.generationTemperature ?? 0.8, 2.0)),
      qualityGateEnabled: config?.qualityGateEnabled ?? true,
      qualityGateMinScore: Math.max(0, Math.min(config?.qualityGateMinScore ?? 0.5, 1.0)),
      weekdayMaxMessages: Math.max(1, config?.weekdayMaxMessages ?? 10),
      weekendMaxMessages: Math.max(1, config?.weekendMaxMessages ?? 25),
      weekdayMaxUsers: Math.max(1, config?.weekdayMaxUsers ?? 4),
      weekendMaxUsers: Math.max(1, config?.weekendMaxUsers ?? 6),
      burstEnabled: config?.burstEnabled ?? true,
      burstSize: Math.max(2, config?.burstSize ?? 4),
      burstIntervalMinutes: Math.max(1, config?.burstIntervalMinutes ?? 5),
      quietIntervalMinutes: Math.max(1, config?.quietIntervalMinutes ?? 90),
      inactivityDaysThreshold: Math.max(1, config?.inactivityDaysThreshold ?? 3),
      prioritizeTaggedUsers: config?.prioritizeTaggedUsers ?? true,
      prioritizeRepliedUsers: config?.prioritizeRepliedUsers ?? true,
      reactionBoostFactor: Math.max(1, config?.reactionBoostFactor ?? 1.5),
    };
  });
}
