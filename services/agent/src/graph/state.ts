import { Annotation } from '@langchain/langgraph';
import type { AgentResponse } from '../zmq/types';

export type MessageEntry = {
  id: string;
  senderId: string;
  senderName: string;
  content: string;
  timestamp: number;
  replyToId?: string;
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
  messagesAnalyzed: number;
  confidence: number;
  locked: boolean;
};

export type ControlledUser = {
  userId: string;
  displayName: string;
  source: 'manual' | 'auto_rule';
  role: ToneProfile;
};

export type TriggerContext = {
  type: 'timeout' | 'user_message' | 'reply_to' | 'periodic';
  triggeredByMessageId?: string;
  triggeredByUserId?: string;
};

export const ConversationStateAnnotation = Annotation.Root({
  conversationId: Annotation<string>,
  messages: Annotation<MessageEntry[]>({
    reducer: (current, update) => {
      const combined = [...current, ...update];
      // Keep up to 250 messages for sliding window flexibility
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
  pendingResponse: Annotation<AgentResponse | null>({
    reducer: (_current, update) => update,
    default: () => null,
  }),
  decision: Annotation<'impersonate' | 'animate' | 'skip'>({
    reducer: (_current, update) => update,
    default: () => 'skip',
  }),
  selectedUserId: Annotation<string | null>({
    reducer: (_current, update) => update,
    default: () => null,
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
});

export type ConversationState = typeof ConversationStateAnnotation.State;
