import { z } from 'zod';

export const agentNewMessageSchema = z.object({
  type: z.literal('agent:new-message'),
  conversationId: z.string(),
  messageId: z.string(),
  senderId: z.string(),
  senderDisplayName: z.string().optional(),
  senderUsername: z.string().optional(),
  content: z.string(),
  originalLanguage: z.string(),
  replyToId: z.string().optional(),
  mentionedUserIds: z.array(z.string()).default([]),
  timestamp: z.number(),
});

export const agentConfigUpdatedSchema = z.object({
  type: z.literal('agent:config-updated'),
  conversationId: z.string(),
  config: z.record(z.string(), z.unknown()),
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

export const agentResponseSchema = z.object({
  type: z.literal('agent:response'),
  conversationId: z.string().min(1),
  asUserId: z.string().min(1),
  content: z.string().min(1),
  originalLanguage: z.string().min(1),
  replyToId: z.string().optional(),
  mentionedUsernames: z.array(z.string()).optional(),
  messageSource: z.literal('agent'),
  illustration: z.object({ sourceUrl: z.string().url() }).optional(),
  metadata: z.object({
    agentType: z.enum(['impersonator', 'animator', 'orchestrator']),
    roleConfidence: z.number().min(0).max(1),
    archetypeId: z.string().optional(),
  }),
});

export const agentReactionSchema = z.object({
  type: z.literal('agent:reaction'),
  conversationId: z.string().min(1),
  asUserId: z.string().min(1),
  targetMessageId: z.string().min(1),
  emoji: z.string().min(1),
});

export const agentMessageSchema = z.discriminatedUnion('type', [agentResponseSchema, agentReactionSchema]);

export type AgentEvent = z.infer<typeof agentEventSchema>;
export type AgentEventInput = z.input<typeof agentEventSchema>;
export type AgentNewMessage = z.infer<typeof agentNewMessageSchema>;
export type AgentResponse = z.infer<typeof agentResponseSchema>;
export type AgentReaction = z.infer<typeof agentReactionSchema>;
export type AgentMessage = z.infer<typeof agentMessageSchema>;
