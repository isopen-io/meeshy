/**
 * Tests for message:send ack callback behavior
 *
 * Verifies:
 * - Ack returns clientMessageId when provided
 * - Ack returns the saved message data
 * - clientMessageId is NOT included in message:new broadcast
 * - Backward compatible: works without clientMessageId
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

type AckCallback = (response: {
  success: boolean;
  data?: { messageId: string; clientMessageId?: string; message?: any };
  error?: string;
}) => void;

type BroadcastPayload = Record<string, unknown>;

/**
 * Simulates the ack callback extraction logic from MeeshySocketIOManager.
 * This tests the data-flow contract, not the full socket lifecycle.
 */
function buildAckResponse(
  savedMessageId: string,
  clientMessageId: string | undefined
): { success: boolean; data: { messageId: string; clientMessageId?: string } } {
  const response: { success: boolean; data: { messageId: string; clientMessageId?: string } } = {
    success: true,
    data: { messageId: savedMessageId },
  };
  if (clientMessageId) {
    response.data.clientMessageId = clientMessageId;
  }
  return response;
}

function buildBroadcastPayload(message: Record<string, unknown>): BroadcastPayload {
  const { clientMessageId: _removed, ...broadcastMessage } = message;
  return broadcastMessage;
}

describe('message:send ack callback', () => {
  it('returns clientMessageId in ack when provided in payload', () => {
    const response = buildAckResponse('server-msg-123', 'client-temp-abc');

    expect(response.success).toBe(true);
    expect(response.data.messageId).toBe('server-msg-123');
    expect(response.data.clientMessageId).toBe('client-temp-abc');
  });

  it('omits clientMessageId from ack when not provided in payload', () => {
    const response = buildAckResponse('server-msg-456', undefined);

    expect(response.success).toBe(true);
    expect(response.data.messageId).toBe('server-msg-456');
    expect(response.data.clientMessageId).toBeUndefined();
  });

  it('does NOT include clientMessageId in broadcast payload', () => {
    const fullMessage = {
      id: 'server-msg-789',
      content: 'Hello world',
      senderId: 'user-1',
      conversationId: 'conv-1',
      clientMessageId: 'client-temp-xyz',
      createdAt: new Date().toISOString(),
    };

    const broadcast = buildBroadcastPayload(fullMessage);

    expect(broadcast.id).toBe('server-msg-789');
    expect(broadcast.content).toBe('Hello world');
    expect(broadcast).not.toHaveProperty('clientMessageId');
  });

  it('broadcast payload is unchanged when no clientMessageId exists', () => {
    const fullMessage = {
      id: 'server-msg-000',
      content: 'No client ID',
      senderId: 'user-2',
      conversationId: 'conv-2',
      createdAt: new Date().toISOString(),
    };

    const broadcast = buildBroadcastPayload(fullMessage);

    expect(broadcast.id).toBe('server-msg-000');
    expect(broadcast.content).toBe('No client ID');
    expect(broadcast).not.toHaveProperty('clientMessageId');
  });
});
