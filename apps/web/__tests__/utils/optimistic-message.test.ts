/**
 * Tests for utils/optimistic-message.ts
 */

import { createOptimisticMessage, OptimisticMessage } from '@/utils/optimistic-message';
import { isValidClientMessageId } from '@/utils/client-message-id';

const BASE_OPTS = {
  content: 'Hello world',
  senderId: 'sender-1',
  conversationId: 'conv-1',
  language: 'fr',
};

// ─── object-options overload ──────────────────────────────────────────────────

describe('createOptimisticMessage (object options)', () => {
  it('returns a message with the correct content', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.content).toBe('Hello world');
  });

  it('sets _localStatus to "sending"', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg._localStatus).toBe('sending');
  });

  it('generates a valid clientMessageId for _tempId', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(isValidClientMessageId(msg._tempId)).toBe(true);
  });

  it('uses _tempId as the message id', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.id).toBe(msg._tempId);
  });

  it('sets conversationId correctly', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.conversationId).toBe('conv-1');
  });

  it('sets senderId correctly', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.senderId).toBe('sender-1');
  });

  it('sets originalLanguage correctly', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.originalLanguage).toBe('fr');
  });

  it('defaults messageType to "text"', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.messageType).toBe('text');
  });

  it('allows custom messageType', () => {
    const msg = createOptimisticMessage({ ...BASE_OPTS, messageType: 'audio' as any });
    expect(msg.messageType).toBe('audio');
  });

  it('sets isEdited to false', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.isEdited).toBe(false);
  });

  it('sets isEncrypted to false', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.isEncrypted).toBe(false);
  });

  it('sets translations to an empty array', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(Array.isArray(msg.translations)).toBe(true);
    expect(msg.translations).toHaveLength(0);
  });

  it('sets replyToId when provided', () => {
    const msg = createOptimisticMessage({ ...BASE_OPTS, replyToId: 'msg-99' });
    expect(msg.replyToId).toBe('msg-99');
  });

  it('sets _sendPayload to empty object by default', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg._sendPayload).toEqual({});
  });

  it('stores custom sendPayload in _sendPayload', () => {
    const sendPayload = { attachmentIds: ['att-1'], mentionedUserIds: ['u-1'] };
    const msg = createOptimisticMessage({ ...BASE_OPTS, sendPayload });
    expect(msg._sendPayload).toEqual(sendPayload);
  });

  it('builds sender participant when sender is provided', () => {
    const sender = { id: 'p-1', userId: 'u-1', username: 'alice', displayName: 'Alice', avatar: 'a.png' };
    const msg = createOptimisticMessage({ ...BASE_OPTS, sender });
    expect(msg.sender).toBeDefined();
    expect(msg.sender?.displayName).toBe('Alice');
    expect(msg.sender?.user?.username).toBe('alice');
  });

  it('leaves sender undefined when not provided', () => {
    const msg = createOptimisticMessage(BASE_OPTS);
    expect(msg.sender).toBeUndefined();
  });

  it('each call produces a unique id', () => {
    const ids = new Set(
      Array.from({ length: 50 }, () => createOptimisticMessage(BASE_OPTS)._tempId)
    );
    expect(ids.size).toBe(50);
  });
});

// ─── positional-args overload ─────────────────────────────────────────────────

describe('createOptimisticMessage (positional args)', () => {
  it('accepts positional arguments', () => {
    const msg = createOptimisticMessage('Hi', 'sender-1', 'conv-1', 'en');
    expect(msg.content).toBe('Hi');
    expect(msg.senderId).toBe('sender-1');
    expect(msg.conversationId).toBe('conv-1');
    expect(msg.originalLanguage).toBe('en');
  });

  it('sets replyToId when passed as 5th arg', () => {
    const msg = createOptimisticMessage('Hi', 'sender-1', 'conv-1', 'en', 'reply-1');
    expect(msg.replyToId).toBe('reply-1');
  });
});
