import { Annotation } from '@langchain/langgraph';

export type MessageEntry = {
  id: string;
  senderId: string;
  senderName: string;
  senderUsername?: string;
  content: string;
  timestamp: number;
  replyToId?: string;
  originalLanguage?: string;
};

export type ToneProfile = {
  userId: string;
  displayName: string;
  origin: 'observed' | 'archetype' | 'hybrid';
  archetypeId?: string;
  personaSummary: string;
  tone: string;
  vocabularyLevel: string;
  typicalLength: string;
  emojiUsage: string;
  topicsOfExpertise: string[];
  topicsAvoided: string[];
  relationshipMap: Record<string, string>;
  catchphrases: string[];
  responseTriggers: string[];
  silenceTriggers: string[];
  commonEmojis: string[];
  reactionPatterns: string[];
  messagesAnalyzed: number;
  confidence: number;
  locked: boolean;
};

export type ControlledUser = {
  userId: string;
  displayName: string;
  username: string;
  systemLanguage: string;
  source: 'manual' | 'auto_rule';
  role: ToneProfile;
};

export type TriggerContext = {
  type: 'timeout' | 'user_message' | 'reply_to' | 'periodic' | 'scan';
  triggeredByMessageId?: string;
  triggeredByUserId?: string;
};

export type PendingMessage = {
  type: 'message';
  asUserId: string;
  content: string;
  originalLanguage: string;
  replyToId?: string;
  mentionedUsernames: string[];
  delaySeconds: number;
  messageSource: 'agent';
};

export type PendingReaction = {
  type: 'reaction';
  asUserId: string;
  targetMessageId: string;
  emoji: string;
  delaySeconds: number;
};

export type PendingAction = PendingMessage | PendingReaction;

export type MessageDirective = {
  type: 'message';
  asUserId: string;
  topic: string;
  replyToMessageId?: string;
  mentionUsernames: string[];
  delaySeconds: number;
  needsWebSearch?: boolean;
};

export type ReactionDirective = {
  type: 'reaction';
  asUserId: string;
  targetMessageId: string;
  emoji: string;
  delaySeconds: number;
};

export type InterventionDirective = MessageDirective | ReactionDirective;

export type AgentHistoryEntry = {
  userId: string;
  topic: string;
  contentHash: string;
  timestamp: number;
};

export type InterventionPlan = {
  shouldIntervene: boolean;
  reason: string;
  interventions: InterventionDirective[];
};

export const ConversationStateAnnotation = Annotation.Root({
  conversationId: Annotation<string>,
  messages: Annotation<MessageEntry[]>({
    reducer: (current, update) => {
      const combined = [...current, ...update];
      return combined.slice(-250);
    },
    default: () => [],
  }),
  summary: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  toneProfiles: Annotation<Record<string, ToneProfile>>({
    reducer: (current, update) => ({ ...current, ...update }),
    default: () => ({}),
  }),
  controlledUsers: Annotation<ControlledUser[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  triggerContext: Annotation<TriggerContext | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  pendingActions: Annotation<PendingAction[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
  interventionPlan: Annotation<InterventionPlan | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  activityScore: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  contextWindowSize: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 50,
  }),
  agentType: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => 'personal',
  }),
  useFullHistory: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  conversationTitle: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  conversationDescription: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  agentInstructions: Annotation<string>({
    reducer: (_current, update) => update,
    default: () => '',
  }),
  webSearchEnabled: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => false,
  }),
  minWordsPerMessage: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 3,
  }),
  maxWordsPerMessage: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 400,
  }),
  generationTemperature: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0.8,
  }),
  qualityGateEnabled: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  qualityGateMinScore: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0.5,
  }),
  minResponsesPerCycle: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 2,
  }),
  maxResponsesPerCycle: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 12,
  }),
  reactionsEnabled: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  maxReactionsPerCycle: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 8,
  }),
  budgetRemaining: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 10,
  }),
  todayUsersActive: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 0,
  }),
  maxUsersToday: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 4,
  }),
  burstMode: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  burstSize: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 4,
  }),
  prioritizeTaggedUsers: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  prioritizeRepliedUsers: Annotation<boolean>({
    reducer: (_current, update) => update,
    default: () => true,
  }),
  reactionBoostFactor: Annotation<number>({
    reducer: (_current, update) => update,
    default: () => 1.5,
  }),
  agentHistory: Annotation<AgentHistoryEntry[]>({
    reducer: (current, update) => {
      const combined = [...current, ...update];
      return combined.slice(-100);
    },
    default: () => [],
  }),
  todayActiveUserIds: Annotation<string[]>({
    reducer: (_current, update) => update,
    default: () => [],
  }),
});

export type ConversationState = typeof ConversationStateAnnotation.State;
