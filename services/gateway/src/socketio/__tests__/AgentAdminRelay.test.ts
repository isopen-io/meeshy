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
    connect: jest.fn().mockResolvedValue(undefined),
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

  it('rejects non-object JSON primitives (null, number)', () => {
    expect(parseAgentAdminEvent('null')).toBeNull();
    expect(parseAgentAdminEvent('42')).toBeNull();
    expect(parseAgentAdminEvent('"a string"')).toBeNull();
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

  it('does nothing on stop when never started', async () => {
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);
    await expect(relay.stop()).resolves.toBeUndefined();
    expect(subscriber.unsubscribe).not.toHaveBeenCalled();
  });

  it('does not start twice when start() is called again', async () => {
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);
    await relay.start();
    await relay.start();
    expect(subscriber.subscribe).toHaveBeenCalledTimes(1);
  });

  it('returns without subscribing when factory returns null', async () => {
    const relay = new AgentAdminRelay(mockIO.io, () => null);
    await expect(relay.start()).resolves.toBeUndefined();
    expect(subscriber.subscribe).not.toHaveBeenCalled();
  });

  it('uses createDefaultSubscriber (no REDIS_URL) and returns without subscribing', async () => {
    const saved = process.env.REDIS_URL;
    delete process.env.REDIS_URL;
    try {
      const relay = new AgentAdminRelay(mockIO.io);
      await expect(relay.start()).resolves.toBeUndefined();
      expect(subscriber.subscribe).not.toHaveBeenCalled();
    } finally {
      if (saved !== undefined) process.env.REDIS_URL = saved;
    }
  });

  it('connects the lazy subscriber before subscribing (enableOfflineQueue:false rejects otherwise)', async () => {
    // Reproduit la sémantique ioredis de prod : le subscriber est créé avec
    // lazyConnect:true + enableOfflineQueue:false → tout subscribe() émis
    // avant que connect() ait établi le stream est rejeté. C'est l'erreur
    // observée à CHAQUE boot gateway en prod (relay admin jamais démarré).
    let connected = false;
    const listeners = new Map<string, Array<(...args: unknown[]) => void>>();
    const lazySubscriber = {
      connect: jest.fn(async () => {
        connected = true;
      }),
      subscribe: jest.fn(async (_channel: string) => {
        if (!connected) {
          throw new Error("Stream isn't writeable and enableOfflineQueue options is false");
        }
        return 1;
      }),
      unsubscribe: jest.fn().mockResolvedValue(1),
      quit: jest.fn().mockResolvedValue('OK'),
      on: jest.fn((event: string, listener: (...args: unknown[]) => void) => {
        const list = listeners.get(event) ?? [];
        list.push(listener);
        listeners.set(event, list);
      }),
    };
    const relay = new AgentAdminRelay(mockIO.io, () => lazySubscriber as never);

    await expect(relay.start()).resolves.toBeUndefined();

    expect(lazySubscriber.connect).toHaveBeenCalled();
    expect(lazySubscriber.subscribe).toHaveBeenCalledWith(AGENT_ADMIN_EVENT_CHANNEL);
  });

  it('logs redis error events without throwing', async () => {
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);
    await relay.start();
    expect(() => subscriber._emit('error', new Error('connection refused'))).not.toThrow();
  });

  it('handles unsubscribe rejection gracefully on stop', async () => {
    subscriber.unsubscribe.mockRejectedValueOnce(new Error('unsubscribe failed'));
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);
    await relay.start();
    await expect(relay.stop()).resolves.toBeUndefined();
    expect(subscriber.quit).toHaveBeenCalled();
  });

  it('handles quit rejection gracefully on stop', async () => {
    subscriber.quit.mockRejectedValueOnce(new Error('quit failed'));
    const relay = new AgentAdminRelay(mockIO.io, () => subscriber as never);
    await relay.start();
    await expect(relay.stop()).resolves.toBeUndefined();
  });
});
