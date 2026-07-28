/**
 * Tests for the `message:send` ACK + `message:new` broadcast shaping contract
 * (Phase 4 §6.2).
 *
 * These exercise the REAL production helpers imported from
 * `utils/message-ack-shaping` — the same functions `MessageHandler` calls — so
 * a regression in the ack/broadcast data-flow (e.g. dropping the
 * `clientMessageId` echo, or leaking it into the peers' broadcast) fails here.
 *
 * Verifies:
 * - ACK echoes the server `messageId` (renamed from `id`)
 * - ACK echoes `clientMessageId` when provided, omits it otherwise
 * - ACK normalizes a `Date` `createdAt` to an ISO string, passes a string through
 * - `clientMessageId` is stripped from the peers' `message:new` broadcast
 * - stripping never mutates the sender's own payload
 */

import { describe, it, expect } from '@jest/globals';
import {
  buildMessageAckData,
  stripClientMessageId,
} from '../utils/message-ack-shaping';

describe('buildMessageAckData (message:send ack)', () => {
  it('renames the server id to messageId and echoes clientMessageId when provided', () => {
    const data = buildMessageAckData({ id: 'server-msg-123', clientMessageId: 'client-temp-abc' });

    expect(data.messageId).toBe('server-msg-123');
    expect(data.clientMessageId).toBe('client-temp-abc');
  });

  it('omits clientMessageId when not provided', () => {
    const data = buildMessageAckData({ id: 'server-msg-456' });

    expect(data.messageId).toBe('server-msg-456');
    expect(data).not.toHaveProperty('clientMessageId');
  });

  it('normalizes a Date createdAt to an ISO string', () => {
    const when = new Date('2026-07-28T12:00:00.000Z');
    const data = buildMessageAckData({ id: 'server-msg-789', createdAt: when });

    expect(data.createdAt).toBe('2026-07-28T12:00:00.000Z');
  });

  it('passes a string createdAt through unchanged', () => {
    const data = buildMessageAckData({ id: 'server-msg-789', createdAt: '2026-07-28T12:00:00.000Z' });

    expect(data.createdAt).toBe('2026-07-28T12:00:00.000Z');
  });

  it('omits createdAt when not provided', () => {
    const data = buildMessageAckData({ id: 'server-msg-000' });

    expect(data).not.toHaveProperty('createdAt');
  });
});

describe('stripClientMessageId (message:new broadcast to peers)', () => {
  it('removes clientMessageId while keeping every other field', () => {
    const senderPayload = {
      id: 'server-msg-789',
      content: 'Hello world',
      senderId: 'user-1',
      conversationId: 'conv-1',
      clientMessageId: 'client-temp-xyz',
      createdAt: '2026-07-28T12:00:00.000Z',
    };

    const broadcast = stripClientMessageId(senderPayload);

    expect(broadcast.id).toBe('server-msg-789');
    expect(broadcast.content).toBe('Hello world');
    expect(broadcast.senderId).toBe('user-1');
    expect(broadcast.conversationId).toBe('conv-1');
    expect(broadcast).not.toHaveProperty('clientMessageId');
  });

  it('is a no-op strip when no clientMessageId exists', () => {
    const senderPayload = {
      id: 'server-msg-000',
      content: 'No client ID',
      senderId: 'user-2',
      conversationId: 'conv-2',
    };

    const broadcast = stripClientMessageId(senderPayload);

    expect(broadcast).toEqual(senderPayload);
    expect(broadcast).not.toHaveProperty('clientMessageId');
  });

  it('does not mutate the sender payload (sender keeps its cid-aware copy)', () => {
    const senderPayload = {
      id: 'server-msg-789',
      clientMessageId: 'client-temp-xyz',
    };

    stripClientMessageId(senderPayload);

    expect(senderPayload.clientMessageId).toBe('client-temp-xyz');
  });
});
