/**
 * Verifies the offline-queue dedup contract on the wire: every payload
 * emitted by `MessagingService.sendMessage` MUST include a `clientMessageId`
 * matching `cid_<uuid v4 lowercase>`. The gateway uses
 * `(conversationId, clientMessageId)` as the unique dedup key, so any drift
 * silently breaks retries from the offline queue.
 */

// Match the order used by orchestrator-e2ee.test.ts so jest module mocks resolve.
jest.mock('@/utils/logger', () => ({
  logger: {
    debug: jest.fn(),
    error: jest.fn(),
    warn: jest.fn(),
    info: jest.fn(),
  },
}));

import { MessagingService } from '@/services/socketio/messaging.service';
import type { TypedSocket } from '@/services/socketio/types';

const CLIENT_MESSAGE_ID_REGEX =
  /^cid_[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

interface MockSocket {
  connected: boolean;
  emit: jest.Mock;
}

function buildSocket(): MockSocket {
  return {
    connected: true,
    emit: jest.fn((_event: string, _data: unknown, ack: (response: unknown) => void) => {
      // Echo back a successful ack with the same clientMessageId the client
      // emitted — mirrors the gateway behaviour.
      const sent = _data as { clientMessageId?: string };
      ack({
        success: true,
        data: { messageId: 'srv-1', clientMessageId: sent.clientMessageId },
      });
    }),
  };
}

describe('MessagingService.sendMessage — clientMessageId propagation', () => {
  it('includes clientMessageId in the WS payload (text message)', async () => {
    const service = new MessagingService();
    const socket = buildSocket();

    const cid = 'cid_aaaaaaaa-bbbb-4ccc-8ddd-eeeeeeeeeeee';
    const result = await service.sendMessage(socket as unknown as TypedSocket, {
      conversationId: 'conv-1',
      content: 'Hello',
      clientMessageId: cid,
    });

    expect(result.success).toBe(true);
    expect(socket.emit).toHaveBeenCalledTimes(1);
    const [, payload] = socket.emit.mock.calls[0];
    expect(payload).toEqual(
      expect.objectContaining({
        conversationId: 'conv-1',
        content: 'Hello',
        clientMessageId: cid,
      })
    );
    expect(CLIENT_MESSAGE_ID_REGEX.test(payload.clientMessageId)).toBe(true);
    expect(result.clientMessageId).toBe(cid);
  });

  it('includes clientMessageId in the WS payload (with attachments)', async () => {
    const service = new MessagingService();
    const socket = buildSocket();

    const cid = 'cid_11111111-2222-4333-8444-555555555555';
    await service.sendMessage(socket as unknown as TypedSocket, {
      conversationId: 'conv-1',
      content: '',
      clientMessageId: cid,
      attachmentIds: ['att-1'],
      attachmentMimeTypes: ['image/png'],
    });

    expect(socket.emit).toHaveBeenCalledTimes(1);
    const [event, payload] = socket.emit.mock.calls[0];
    expect(event).toContain('with-attachments');
    expect(payload.clientMessageId).toBe(cid);
    expect(CLIENT_MESSAGE_ID_REGEX.test(payload.clientMessageId)).toBe(true);
    expect(payload.attachmentIds).toEqual(['att-1']);
  });
});
