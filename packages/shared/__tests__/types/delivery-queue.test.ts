import { describe, it, expect } from 'vitest';
import {
  DELIVERY_QUEUE_PREFIX,
  DELIVERY_QUEUE_TTL_SECONDS,
  type QueuedMessagePayload,
} from '../../types/delivery-queue';

describe('DELIVERY_QUEUE_PREFIX', () => {
  it('is the expected Redis key prefix', () => {
    expect(DELIVERY_QUEUE_PREFIX).toBe('delivery:queue:');
  });

  it('does not contain spaces or special chars that break Redis keys', () => {
    expect(DELIVERY_QUEUE_PREFIX).toMatch(/^[a-z:]+$/);
  });

  it('ends with a colon separator for key composition', () => {
    expect(DELIVERY_QUEUE_PREFIX.endsWith(':')).toBe(true);
  });
});

describe('DELIVERY_QUEUE_TTL_SECONDS', () => {
  it('is 48 hours in seconds', () => {
    expect(DELIVERY_QUEUE_TTL_SECONDS).toBe(48 * 60 * 60);
  });

  it('equals 172800', () => {
    expect(DELIVERY_QUEUE_TTL_SECONDS).toBe(172800);
  });

  it('is a positive integer', () => {
    expect(Number.isInteger(DELIVERY_QUEUE_TTL_SECONDS)).toBe(true);
    expect(DELIVERY_QUEUE_TTL_SECONDS).toBeGreaterThan(0);
  });
});

describe('QueuedMessagePayload shape', () => {
  it('accepts a valid payload object', () => {
    const payload: QueuedMessagePayload = {
      messageId: 'msg_abc123',
      conversationId: 'conv_def456',
      payload: { type: 'text', content: 'hello' },
      enqueuedAt: new Date().toISOString(),
    };
    expect(payload.messageId).toBe('msg_abc123');
    expect(payload.conversationId).toBe('conv_def456');
    expect(payload.enqueuedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });

  it('accepts an empty payload object', () => {
    const payload: QueuedMessagePayload = {
      messageId: 'm1',
      conversationId: 'c1',
      payload: {},
      enqueuedAt: '2026-01-01T00:00:00.000Z',
    };
    expect(payload.payload).toEqual({});
  });
});
