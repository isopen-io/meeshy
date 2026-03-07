import type { MongoPersistence } from '../memory/mongo-persistence';

export type EligibleConversation = {
  conversationId: string;
  conversationType: string;
  title: string | null;
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
};

export async function findEligibleConversations(persistence: MongoPersistence): Promise<EligibleConversation[]> {
  const configs = await persistence.getEligibleConversations();

  return configs.map((config) => ({
    conversationId: config.conversationId,
    conversationType: config.conversation.type,
    title: config.conversation.title,
    lastMessageAt: config.conversation.lastMessageAt,
    memberCount: config.conversation.memberCount,
    scanIntervalMinutes: config.scanIntervalMinutes,
    minResponsesPerCycle: config.minResponsesPerCycle,
    maxResponsesPerCycle: config.maxResponsesPerCycle,
    reactionsEnabled: config.reactionsEnabled,
    maxReactionsPerCycle: config.maxReactionsPerCycle,
    contextWindowSize: config.contextWindowSize,
    useFullHistory: config.useFullHistory,
    agentType: config.agentType,
    inactivityThresholdHours: config.inactivityThresholdHours,
    excludedRoles: config.excludedRoles,
    excludedUserIds: config.excludedUserIds,
  }));
}
