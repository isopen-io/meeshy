import { z } from 'zod';

export const agentNewMessageSchema = z.object({
  type: z.literal('agent:new-message'),
  conversationId: z.string(),
  messageId: z.string(),
  senderId: z.string(),
  senderDisplayName: z.string().optional(),
  content: z.string(),
  originalLanguage: z.string(),
  replyToId: z.string().optional(),
  timestamp: z.number(),
});

export const agentConfigUpdatedSchema = z.object({
  type: z.literal('agent:config-updated'),
  conversationId: z.string(),
  config: z.record(z.unknown()),
});

export const agentUserStatusSchema = z.object({
  type: z.literal('agent:user-status-changed'),
  userId: z.string(),
  isOnline: z.boolean(),
  lastActiveAt: z.string(),
});

export const agentEventSchema = z.discriminatedUnion('type', [
  agentNewMessageSchema,
  agentConfigUpdatedSchema,
  agentUserStatusSchema,
]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentNewMessage = z.infer<typeof agentNewMessageSchema>;

export type AgentResponse = {
  type: 'agent:response';
  conversationId: string;
  asUserId: string;
  content: string;
  originalLanguage: string;
  replyToId?: string;
  mentionedUsernames?: string[];
  messageSource: 'agent';
  metadata: {
    agentType: 'impersonator' | 'animator' | 'orchestrator';
    roleConfidence: number;
    archetypeId?: string;
  };
};

export type AgentReaction = {
  type: 'agent:reaction';
  conversationId: string;
  asUserId: string;
  targetMessageId: string;
  emoji: string;
};
