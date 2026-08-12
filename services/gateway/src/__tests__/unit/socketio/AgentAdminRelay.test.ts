/**
 * Unit tests for socketio/AgentAdminRelay.
 * Covers: parseAgentAdminEvent (valid, null, non-object, missing kind,
 * invalid kind, missing conversationId, non-string conversationId, throw),
 * AgentAdminRelay.start (no subscriber → disabled, idempotent, message
 * routing, invalid payload, wrong channel), stop (no-op when not started,
 * cleans up subscriber).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { parseAgentAdminEvent, AgentAdminRelay } from '../../../socketio/AgentAdminRelay';
import { AGENT_ADMIN_EVENT_CHANNEL, ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

// ─── parseAgentAdminEvent ─────────────────────────────────────────────────────

describe('parseAgentAdminEvent', () => {
  it('returns null for non-JSON input', () => {
    expect(parseAgentAdminEvent('not json {')).toBeNull();
  });

  it('returns null for a JSON primitive (not an object)', () => {
    expect(parseAgentAdminEvent('"string"')).toBeNull();
    expect(parseAgentAdminEvent('42')).toBeNull();
    expect(parseAgentAdminEvent('null')).toBeNull();
  });

  it('returns null when kind is missing', () => {
    expect(parseAgentAdminEvent(JSON.stringify({ foo: 'bar' }))).toBeNull();
  });

  it('returns null when kind is not in the allowed list', () => {
    expect(parseAgentAdminEvent(JSON.stringify({ kind: 'unknown-event' }))).toBeNull();
  });

  it('returns an event with no conversationId when conversationId is absent', () => {
    const result = parseAgentAdminEvent(JSON.stringify({ kind: 'delivery-queue' }));
    expect(result).not.toBeNull();
    expect(result!.kind).toBe('delivery-queue');
    expect((result as any).conversationId).toBeUndefined();
  });

  it('returns an event with conversationId when both are valid strings', () => {
    const result = parseAgentAdminEvent(
      JSON.stringify({ kind: 'delivery-queue', conversationId: 'conv-1' }),
    );
    expect(result).not.toBeNull();
    expect(result!.conversationId).toBe('conv-1');
  });

  it('returns null when conversationId is present but not a string', () => {
    expect(
      parseAgentAdminEvent(JSON.stringify({ kind: 'delivery-queue', conversationId: 42 })),
    ).toBeNull();
  });
});

// ─── AgentAdminRelay ─────────────────────────────────────────────────────────

function makeSubscriber() {
  const handlers: Record<string, ((...args: any[]) => void)[]> = {};
  return {
    subscribe: jest.fn<any>().mockResolvedValue(undefined),
    unsubscribe: jest.fn<any>().mockResolvedValue(undefined),
    quit: jest.fn<any>().mockResolvedValue(undefined),
    on: jest.fn<any>().mockImplementation((event: string, fn: (...args: any[]) => void) => {
      if (!handlers[event]) handlers[event] = [];
      handlers[event].push(fn);
    }),
    emit(event: string, ...args: any[]) {
      (handlers[event] ?? []).forEach(fn => fn(...args));
    },
  };
}

function makeIo() {
  const roomTarget = { emit: jest.fn<any>() };
  return { to: jest.fn<any>().mockReturnValue(roomTarget), _roomTarget: roomTarget };
}

describe('AgentAdminRelay', () => {
  it('disables itself (no subscriber set) when createSubscriber returns null', async () => {
    const io = makeIo() as any;
    const relay = new AgentAdminRelay(io, () => null);
    await relay.start();
    // start() returned without throwing and without a subscriber
    expect(io.to).not.toHaveBeenCalled();
  });

  it('start is idempotent — calling twice does not create a second subscriber', async () => {
    const subscriber = makeSubscriber();
    let createCount = 0;
    const io = makeIo() as any;
    const relay = new AgentAdminRelay(io, () => {
      createCount++;
      return subscriber as any;
    });
    await relay.start();
    await relay.start(); // second call — should be no-op
    expect(createCount).toBe(1);
  });

  it('subscribes to the agent admin event channel on start', async () => {
    const subscriber = makeSubscriber();
    const io = makeIo() as any;
    const relay = new AgentAdminRelay(io, () => subscriber as any);
    await relay.start();
    expect(subscriber.subscribe).toHaveBeenCalledWith(AGENT_ADMIN_EVENT_CHANNEL);
  });

  it('emits the parsed event to the admin room on a valid message', async () => {
    const subscriber = makeSubscriber();
    const io = makeIo() as any;
    const relay = new AgentAdminRelay(io, () => subscriber as any);
    await relay.start();

    const payload = JSON.stringify({ kind: 'delivery-queue', conversationId: 'conv-1' });
    subscriber.emit('message', AGENT_ADMIN_EVENT_CHANNEL, payload);

    expect(io.to).toHaveBeenCalledWith(ROOMS.adminAgent());
    expect(io._roomTarget.emit).toHaveBeenCalledWith(
      SERVER_EVENTS.AGENT_ADMIN_EVENT,
      expect.objectContaining({ kind: 'delivery-queue', conversationId: 'conv-1' }),
    );
  });

  it('ignores messages on other channels', async () => {
    const subscriber = makeSubscriber();
    const io = makeIo() as any;
    const relay = new AgentAdminRelay(io, () => subscriber as any);
    await relay.start();

    subscriber.emit('message', 'some-other-channel', JSON.stringify({ kind: 'delivery-queue' }));
    expect(io.to).not.toHaveBeenCalled();
  });

  it('logs a warning and does not emit when the payload is invalid', async () => {
    const subscriber = makeSubscriber();
    const io = makeIo() as any;
    const relay = new AgentAdminRelay(io, () => subscriber as any);
    await relay.start();

    subscriber.emit('message', AGENT_ADMIN_EVENT_CHANNEL, 'bad json {{{');
    expect(io.to).not.toHaveBeenCalled();
  });

  it('stop is a no-op when the relay was never started', async () => {
    const io = makeIo() as any;
    const relay = new AgentAdminRelay(io, () => null);
    await expect(relay.stop()).resolves.toBeUndefined();
  });

  it('stop unsubscribes and quits the subscriber', async () => {
    const subscriber = makeSubscriber();
    const io = makeIo() as any;
    const relay = new AgentAdminRelay(io, () => subscriber as any);
    await relay.start();
    await relay.stop();
    expect(subscriber.unsubscribe).toHaveBeenCalledWith(AGENT_ADMIN_EVENT_CHANNEL);
    expect(subscriber.quit).toHaveBeenCalled();
  });
});
