/**
 * Tests for utils/optimistic-message.ts
 */

jest.mock('@/utils/client-message-id', () => ({
  generateClientMessageId: jest.fn(() => 'cid_00000000-0000-4000-8000-000000000001'),
}));

import { createOptimisticMessage } from '@/utils/optimistic-message';

const BASE_OPTS = {
  content: 'Hello',
  senderId: 'user-1',
  conversationId: 'conv-1',
  language: 'fr',
};

// ─── createOptimisticMessage (options form) ───────────────────────────────────

describe('createOptimisticMessage (options object)', () => {
  it('sets _tempId and id from generateClientMessageId', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg._tempId).toBe('cid_00000000-0000-4000-8000-000000000001');
    expect(msg.id).toBe(msg._tempId);
  });

  it('sets _localStatus to sending', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg._localStatus).toBe('sending');
  });

  it('copies content, senderId, conversationId, originalLanguage', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.content).toBe('Hello');
    expect(msg.senderId).toBe('user-1');
    expect(msg.conversationId).toBe('conv-1');
    expect(msg.originalLanguage).toBe('fr');
  });

  it('defaults messageType to text', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.messageType).toBe('text');
  });

  it('respects explicit messageType', () => {
    const msg = createOptimisticMessage({ ...BASE_OPTS, messageType: 'image' as any });
    expect(msg.messageType).toBe('image');
  });

  it('sets messageSource to user', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.messageSource).toBe('user');
  });

  it('sets boolean flags to false', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.isEdited).toBe(false);
    expect(msg.isEncrypted).toBe(false);
    expect(msg.isViewOnce).toBe(false);
    expect(msg.isBlurred).toBe(false);
  });

  it('sets count fields to 0', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.deliveredCount).toBe(0);
    expect(msg.readCount).toBe(0);
    expect(msg.reactionCount).toBe(0);
    expect(msg.viewOnceCount).toBe(0);
  });

  it('has createdAt, updatedAt, timestamp set to Date instances', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.createdAt).toBeInstanceOf(Date);
    expect(msg.updatedAt).toBeInstanceOf(Date);
    expect(msg.timestamp).toBeInstanceOf(Date);
  });

  it('sets replyToId when provided', () => {
    const msg = createOptimisticMessage({ ...BASE_OPTS, replyToId: 'reply-99' });
    expect(msg.replyToId).toBe('reply-99');
  });

  it('sets forwardedFromId when provided', () => {
    const msg = createOptimisticMessage({ ...BASE_OPTS, forwardedFromId: 'orig-1', forwardedFromConversationId: 'conv-orig' });
    expect(msg.forwardedFromId).toBe('orig-1');
    expect(msg.forwardedFromConversationId).toBe('conv-orig');
  });

  it('sets sender with full participant shape when provided', () => {
    const sender = { id: 'p1', userId: 'user-1', username: 'alice', displayName: 'Alice', avatar: '/a.jpg' };
    const msg = createOptimisticMessage({ ...BASE_OPTS, sender });
    expect(msg.sender).toBeDefined();
    expect((msg.sender as any)?.user.displayName).toBe('Alice');
    expect((msg.sender as any)?.isOnline).toBe(true);
  });

  it('leaves sender undefined when not provided', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.sender).toBeUndefined();
  });

  it('sets _sendPayload from provided value', () => {
    const sendPayload = { attachmentIds: ['a1'] };
    const msg = createOptimisticMessage({ ...BASE_OPTS, sendPayload });
    expect(msg._sendPayload).toEqual(sendPayload);
  });

  it('defaults _sendPayload to empty object', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg._sendPayload).toEqual({});
  });

  it('initialises translations as empty array', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.translations).toEqual([]);
  });
});

// ─── createOptimisticMessage (positional form) ────────────────────────────────

describe('createOptimisticMessage (positional arguments)', () => {
  it('accepts positional content/senderId/conversationId/language', () => {
    const msg = createOptimisticMessage('Hi', 'user-2', 'conv-2', 'en');
    expect(msg.content).toBe('Hi');
    expect(msg.senderId).toBe('user-2');
    expect(msg.conversationId).toBe('conv-2');
    expect(msg.originalLanguage).toBe('en');
  });

  it('accepts optional replyToId as 5th positional arg', () => {
    const msg = createOptimisticMessage('Hi', 'u', 'c', 'fr', 'reply-id');
    expect(msg.replyToId).toBe('reply-id');
  });
});
