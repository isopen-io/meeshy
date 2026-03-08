import { agentEventSchema, agentNewMessageSchema } from '../../zmq/types';

describe('ZMQ Types', () => {
  it('validates a new message event', () => {
    const event = {
      type: 'agent:new-message',
      conversationId: '507f1f77bcf86cd799439011',
      messageId: '507f1f77bcf86cd799439012',
      senderId: '507f1f77bcf86cd799439013',
      content: 'Bonjour tout le monde',
      originalLanguage: 'fr',
      timestamp: Date.now(),
    };
    const result = agentNewMessageSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('validates a config updated event', () => {
    const event = {
      type: 'agent:config-updated',
      conversationId: '507f1f77bcf86cd799439011',
      config: { enabled: true },
    };
    const result = agentEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('validates a user status event', () => {
    const event = {
      type: 'agent:user-status-changed',
      userId: '507f1f77bcf86cd799439013',
      isOnline: false,
      lastActiveAt: '2026-03-01T00:00:00Z',
    };
    const result = agentEventSchema.safeParse(event);
    expect(result.success).toBe(true);
  });

  it('accepts mentionedUserIds in agent:new-message', () => {
    const event = {
      type: 'agent:new-message',
      conversationId: '507f1f77bcf86cd799439011',
      messageId: '507f1f77bcf86cd799439012',
      senderId: '507f1f77bcf86cd799439013',
      content: 'Hey @alice check this out',
      originalLanguage: 'en',
      mentionedUserIds: ['user-alice-id'],
      timestamp: Date.now(),
    };
    const result = agentNewMessageSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mentionedUserIds).toEqual(['user-alice-id']);
    }
  });

  it('defaults mentionedUserIds to empty array when absent', () => {
    const event = {
      type: 'agent:new-message',
      conversationId: '507f1f77bcf86cd799439011',
      messageId: '507f1f77bcf86cd799439012',
      senderId: '507f1f77bcf86cd799439013',
      content: 'Hello everyone',
      originalLanguage: 'en',
      timestamp: Date.now(),
    };
    const result = agentNewMessageSchema.safeParse(event);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.mentionedUserIds).toEqual([]);
    }
  });

  it('rejects invalid event type', () => {
    const event = { type: 'unknown', data: 'test' };
    const result = agentEventSchema.safeParse(event);
    expect(result.success).toBe(false);
  });
});
