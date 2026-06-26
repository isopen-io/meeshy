/**
 * Unit tests for socketio/AgentAdminRelay.ts
 * Covers: parseAgentAdminEvent, AgentAdminRelay (start/stop)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import { AGENT_ADMIN_EVENT_CHANNEL } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('ioredis', () => {
  return jest.fn().mockImplementation(() => ({
    subscribe: jest.fn<any>().mockResolvedValue(undefined),
    unsubscribe: jest.fn<any>().mockResolvedValue(undefined),
    quit: jest.fn<any>().mockResolvedValue(undefined),
    on: jest.fn(),
  }));
});

import { parseAgentAdminEvent, AgentAdminRelay } from '../../../socketio/AgentAdminRelay';

// ── parseAgentAdminEvent ───────────────────────────────────────────────────

describe('parseAgentAdminEvent', () => {
  it('returns null for invalid JSON', () => {
    expect(parseAgentAdminEvent('not-json')).toBeNull();
  });

  it('returns null for non-object JSON', () => {
    expect(parseAgentAdminEvent('"string"')).toBeNull();
    expect(parseAgentAdminEvent('null')).toBeNull();
  });

  it('returns null when kind is missing', () => {
    expect(parseAgentAdminEvent(JSON.stringify({ conversationId: 'c1' }))).toBeNull();
  });

  it('returns null when kind is not a recognized value', () => {
    expect(parseAgentAdminEvent(JSON.stringify({ kind: 'UNKNOWN_KIND' }))).toBeNull();
  });

  it('returns null when conversationId is not a string', () => {
    expect(parseAgentAdminEvent(JSON.stringify({ kind: 'delivery-queue', conversationId: 123 }))).toBeNull();
  });

  it('returns event without conversationId when conversationId is undefined', () => {
    const result = parseAgentAdminEvent(JSON.stringify({ kind: 'delivery-queue' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('delivery-queue');
    expect((result as any).conversationId).toBeUndefined();
  });

  it('returns event with conversationId when both fields are valid', () => {
    const result = parseAgentAdminEvent(JSON.stringify({ kind: 'scan', conversationId: 'conv-1' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('scan');
    expect(result!.conversationId).toBe('conv-1');
  });
});

// ── AgentAdminRelay ────────────────────────────────────────────────────────

describe('AgentAdminRelay', () => {
  let mockIO: any;
  let mockSubscriber: any;

  beforeEach(() => {
    jest.clearAllMocks();
    mockIO = {
      to: jest.fn().mockReturnValue({ emit: jest.fn() }),
    };
    mockSubscriber = {
      subscribe: jest.fn<any>().mockResolvedValue(undefined),
      unsubscribe: jest.fn<any>().mockResolvedValue(undefined),
      quit: jest.fn<any>().mockResolvedValue(undefined),
      on: jest.fn<any>(),
    };
  });

  it('start() subscribes to redis channel', async () => {
    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();

    expect(mockSubscriber.subscribe).toHaveBeenCalledWith(AGENT_ADMIN_EVENT_CHANNEL);
    expect(mockSubscriber.on).toHaveBeenCalledWith('message', expect.any(Function));
    expect(mockSubscriber.on).toHaveBeenCalledWith('error', expect.any(Function));
  });

  it('start() is idempotent — second call is a no-op', async () => {
    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();
    await relay.start();

    expect(mockSubscriber.subscribe).toHaveBeenCalledTimes(1);
  });

  it('start() logs warning when no subscriber available', async () => {
    const relay = new AgentAdminRelay(mockIO, () => null);
    await relay.start();

    expect(mockSubscriber.subscribe).not.toHaveBeenCalled();
  });

  it('message handler emits to admin room when payload is valid', async () => {
    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();

    const messageHandler = (mockSubscriber.on as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'message'
    )?.[1] as Function;

    const payload = JSON.stringify({ kind: 'delivery-queue', conversationId: 'conv-1' });
    messageHandler(AGENT_ADMIN_EVENT_CHANNEL, payload);

    expect(mockIO.to).toHaveBeenCalled();
  });

  it('message handler ignores wrong channel', async () => {
    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();

    const messageHandler = (mockSubscriber.on as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'message'
    )?.[1] as Function;

    messageHandler('wrong-channel', JSON.stringify({ kind: 'agent-connected' }));

    expect(mockIO.to).not.toHaveBeenCalled();
  });

  it('message handler logs warning for invalid payload', async () => {
    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();

    const messageHandler = (mockSubscriber.on as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'message'
    )?.[1] as Function;

    messageHandler(AGENT_ADMIN_EVENT_CHANNEL, 'invalid-json');

    expect(mockIO.to).not.toHaveBeenCalled();
  });

  it('error handler logs redis errors', async () => {
    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();

    const errorHandler = (mockSubscriber.on as jest.Mock).mock.calls.find(
      (call: any[]) => call[0] === 'error'
    )?.[1] as Function;

    errorHandler(new Error('redis connection lost'));
    // Does not throw
  });

  it('stop() unsubscribes and quits subscriber', async () => {
    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();
    await relay.stop();

    expect(mockSubscriber.unsubscribe).toHaveBeenCalledWith(AGENT_ADMIN_EVENT_CHANNEL);
    expect(mockSubscriber.quit).toHaveBeenCalled();
  });

  it('stop() is a no-op when not started', async () => {
    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.stop();

    expect(mockSubscriber.unsubscribe).not.toHaveBeenCalled();
  });

  it('stop() swallows unsubscribe errors', async () => {
    mockSubscriber.unsubscribe.mockRejectedValueOnce(new Error('unsub failed'));

    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();

    await expect(relay.stop()).resolves.toBeUndefined();
  });

  it('stop() swallows quit errors', async () => {
    mockSubscriber.quit.mockRejectedValueOnce(new Error('quit failed'));

    const relay = new AgentAdminRelay(mockIO, () => mockSubscriber);
    await relay.start();

    await expect(relay.stop()).resolves.toBeUndefined();
  });
});
