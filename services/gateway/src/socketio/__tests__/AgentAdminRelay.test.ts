import { describe, it, expect, beforeEach } from '@jest/globals';
import { AgentAdminRelay, parseAgentAdminEvent } from '../AgentAdminRelay';
import {
  AGENT_ADMIN_EVENT_CHANNEL,
  ROOMS,
  SERVER_EVENTS,
} from '@meeshy/shared/types/socketio-events';

function createMockSubscriber() {
  const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
  return {
    subscribe: jest.fn().mockResolvedValue(1),
    unsubscribe: jest.fn().mockResolvedValue(1),
    quit: jest.fn().mockResolvedValue('OK'),
    on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
      const list = listeners.get(event) ?? [];
      list.push(listener);
      listeners.set(event, list);
    }),
    _emit(event: string, ...args: unknown[]) {
      for (const listener of listeners.get(event) ?? []) listener(...args);
    },
  };
}

function createMockIO() {
  const emit = jest.fn();
  const to = jest.fn().mockReturnValue({ emit });
  return { io: { to } as never, to, emit };
}

describe('parseAgentAdminEvent', () => {
  it('parses a valid event with conversationId', () => {
    expect(parseAgentAdminEvent('{"kind":"scan","conversationId":"c1"}')).toEqual({
      kind: 'scan',
      conversationId: 'c1',
    });
  });

  it('parses a valid event without conversationId', () => {
    expect(parseAgentAdminEvent('{"kind":"delivery-queue"}')).toEqual({
      kind: 'delivery-queue',
      conversationId: undefined,
    });
  });

  it('parses topic catalog events', () => {
    expect(parseAgentAdminEvent('{"kind":"topics"}')).toEqual({
      kind: 'topics',
      conversationId: undefined,
    });
  });

  it('rejects unknown kinds, malformed JSON and bad conversationId types', () => {
    expect(parseAgentAdminEvent('{"kind":"nope"}')).toBeNull();
    expect(parseAgentAdminEvent('not json')).toBeNull();
    expect(parseAgentAdminEvent('{"kind":"scan","conversationId":42}')).toBeNull();
  });
});

describe('AgentAdminRelay', () => {
  let subscriber: ReturnType<typeof createMockSubscriber>;
  let mockIO: ReturnType<typeof createMockIO>;

  beforeEach(() => {
    subscriber = createMockSubscriber();
    mockIO = createMockIO();
  });

  it('subscribes to the agent admin channel on start', async () => {
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);

    await relay.start();

    expect(subscriber.subscribe).toHaveBeenCalledWith(AGENT_ADMIN_EVENT_CHANNEL);
  });

  it('relays valid Redis messages to the admin:agent room', async () => {
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);
    await relay.start();

    subscriber._emit('message', AGENT_ADMIN_EVENT_CHANNEL, '{"kind":"delivery-queue","conversationId":"c1"}');

    expect(mockIO.to).toHaveBeenCalledWith(ROOMS.adminAgent());
    expect(mockIO.emit).toHaveBeenCalledWith(SERVER_EVENTS.AGENT_ADMIN_EVENT, {
      kind: 'delivery-queue',
      conversationId: 'c1',
    });
  });

  it('ignores messages from other channels and invalid payloads', async () => {
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);
    await relay.start();

    subscriber._emit('message', 'other:channel', '{"kind":"scan"}');
    subscriber._emit('message', AGENT_ADMIN_EVENT_CHANNEL, '{"kind":"invalid"}');
    subscriber._emit('message', AGENT_ADMIN_EVENT_CHANNEL, '{{{');

    expect(mockIO.emit).not.toHaveBeenCalled();
  });

  it('unsubscribes and quits on stop', async () => {
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);
    await relay.start();
    await relay.stop();

    expect(subscriber.unsubscribe).toHaveBeenCalledWith(AGENT_ADMIN_EVENT_CHANNEL);
    expect(subscriber.quit).toHaveBeenCalled();
  });
});
