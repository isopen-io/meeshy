/**
 * Tests for createOptimisticMessage type safety and _sendPayload (#3, #6)
 *
 * These tests validate:
 * - No `as any` cast — proper OptimisticMessage type
 * - _sendPayload captures attachmentIds, attachmentMimeTypes, mentionedUserIds
 * - sender.id === senderId (own-message invariant)
 */

import { createOptimisticMessage, OptimisticMessage } from '../../../utils/optimistic-message';

describe('createOptimisticMessage', () => {
  const baseSender = {
    id: 'user-123',
    username: 'testuser',
    displayName: 'Test User',
    avatar: 'https://example.com/avatar.jpg',
  };

  it('should return an OptimisticMessage with _tempId and _localStatus', () => {
    const result = createOptimisticMessage(
      'Hello world',
      'user-123',
      'conv-456',
      'en',
      undefined,
      baseSender,
    );

    expect(result._tempId).toBeDefined();
    expect(result._tempId).toMatch(/^temp-/);
    expect(result._localStatus).toBe('sending');
    expect(result.id).toBe(result._tempId);
  });

  it('should set senderId and sender.id to the same value (own-message invariant)', () => {
    const result = createOptimisticMessage(
      'Hello',
      'user-123',
      'conv-456',
      'en',
      undefined,
      baseSender,
    );

    expect(result.senderId).toBe('user-123');
    expect(result.sender?.id).toBe('user-123');
  });

  it('should include _sendPayload with attachment and mention data', () => {
    const result = createOptimisticMessage(
      'Check this out',
      'user-123',
      'conv-456',
      'en',
      undefined,
      baseSender,
      {
        attachmentIds: ['att-1', 'att-2'],
        attachmentMimeTypes: ['image/png', 'image/jpeg'],
        mentionedUserIds: ['user-789'],
      },
    );

    expect(result._sendPayload).toEqual({
      attachmentIds: ['att-1', 'att-2'],
      attachmentMimeTypes: ['image/png', 'image/jpeg'],
      mentionedUserIds: ['user-789'],
    });
  });

  it('should have empty _sendPayload when no attachments or mentions', () => {
    const result = createOptimisticMessage(
      'Simple message',
      'user-123',
      'conv-456',
      'en',
      undefined,
      baseSender,
    );

    expect(result._sendPayload).toEqual({});
  });

  it('should set correct message fields', () => {
    const result = createOptimisticMessage(
      'Hello',
      'user-123',
      'conv-456',
      'fr',
      'reply-to-id',
      baseSender,
    );

    expect(result.content).toBe('Hello');
    expect(result.conversationId).toBe('conv-456');
    expect(result.originalLanguage).toBe('fr');
    expect(result.messageType).toBe('text');
    expect(result.messageSource).toBe('user');
    expect(result.replyToId).toBe('reply-to-id');
  });

  it('should be properly typed as OptimisticMessage (no as any)', () => {
    const result: OptimisticMessage = createOptimisticMessage(
      'Typed message',
      'user-123',
      'conv-456',
      'en',
      undefined,
      baseSender,
    );

    // TypeScript compilation is the real test here
    expect(result._tempId).toBeDefined();
    expect(result._localStatus).toBeDefined();
    expect(result._sendPayload).toBeDefined();
    expect(result.senderId).toBeDefined();
  });
});
