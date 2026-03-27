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
      scanIntervalMinutes: config?.scanIntervalMinutes ?? 3,
      minResponsesPerCycle: config?.minResponsesPerCycle ?? 2,
      maxResponsesPerCycle: config?.maxResponsesPerCycle ?? 12,
      reactionsEnabled: config?.reactionsEnabled ?? true,
      maxReactionsPerCycle: config?.maxReactionsPerCycle ?? 8,
      contextWindowSize: config?.contextWindowSize ?? 50,
      useFullHistory: config?.useFullHistory ?? false,
      agentType: config?.agentType ?? 'personal',
      inactivityThresholdHours: config?.inactivityThresholdHours ?? 30,
      excludedRoles: config?.excludedRoles ?? [],
      excludedUserIds: config?.excludedUserIds ?? [],
      agentInstructions: config?.agentInstructions ?? null,
      webSearchEnabled: config?.webSearchEnabled ?? false,
      minWordsPerMessage: config?.minWordsPerMessage ?? 3,
      maxWordsPerMessage: config?.maxWordsPerMessage ?? 400,
      generationTemperature: config?.generationTemperature ?? 0.8,
      qualityGateEnabled: config?.qualityGateEnabled ?? true,
      qualityGateMinScore: config?.qualityGateMinScore ?? 0.5,
      weekdayMaxMessages: config?.weekdayMaxMessages ?? 10,
      weekendMaxMessages: config?.weekendMaxMessages ?? 25,
      weekdayMaxUsers: config?.weekdayMaxUsers ?? 4,
      weekendMaxUsers: config?.weekendMaxUsers ?? 6,
      burstEnabled: config?.burstEnabled ?? true,
      burstSize: config?.burstSize ?? 4,
      burstIntervalMinutes: config?.burstIntervalMinutes ?? 5,
      quietIntervalMinutes: config?.quietIntervalMinutes ?? 90,
      inactivityDaysThreshold: config?.inactivityDaysThreshold ?? 3,
      prioritizeTaggedUsers: config?.prioritizeTaggedUsers ?? true,
      prioritizeRepliedUsers: config?.prioritizeRepliedUsers ?? true,
      reactionBoostFactor: config?.reactionBoostFactor ?? 1.5,
    };
  });
}
