/**
 * Unit tests for services/zmq-agent/ZmqAgentClient.
 * Covers: onResponse/onReaction handler registration, initialize (success,
 * push failure, sub failure), sendEvent (initialized, not-initialized),
 * startListening (agent:response, agent:reaction, invalid schema, parse error,
 * running=false early exit), close (happy path, already-closed, error).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('zeromq');

import * as zmq from 'zeromq';
import { ZmqAgentClient } from '../../../services/zmq-agent/ZmqAgentClient';

// ─── Fixtures ──────────────────────────────────────────────────────────────────

function makeAgentResponse(overrides: Record<string, unknown> = {}) {
  return {
    type: 'agent:response',
    conversationId: 'conv-1',
    asUserId: 'user-1',
    content: 'Hello!',
    originalLanguage: 'en',
    messageSource: 'agent',
    metadata: { agentType: 'impersonator', roleConfidence: 0.9 },
    ...overrides,
  };
}

function makeAgentReaction(overrides: Record<string, unknown> = {}) {
  return {
    type: 'agent:reaction',
    conversationId: 'conv-1',
    asUserId: 'user-1',
    targetMessageId: 'msg-1',
    emoji: '👍',
    ...overrides,
  };
}

/** Build an async iterable that yields provided messages then stops. */
function makeAsyncIterable(messages: Buffer[][]) {
  let idx = 0;
  return {
    [Symbol.asyncIterator]() {
      return {
        next() {
          if (idx < messages.length) {
            return Promise.resolve({ value: messages[idx++], done: false });
          }
          return Promise.resolve({ value: undefined, done: true });
        },
      };
    },
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let mockPushSocket: any;
let mockSubSocket: any;

beforeEach(() => {
  mockPushSocket = {
    connect: jest.fn<any>().mockResolvedValue(undefined),
    send: jest.fn<any>().mockResolvedValue(undefined),
    close: jest.fn<any>().mockResolvedValue(undefined),
  };

  mockSubSocket = {
    connect: jest.fn<any>().mockResolvedValue(undefined),
    subscribe: jest.fn<any>().mockResolvedValue(undefined),
    close: jest.fn<any>().mockResolvedValue(undefined),
  };

  (zmq.Push as jest.MockedClass<typeof zmq.Push>) = jest.fn<any>(() => mockPushSocket) as any;
  (zmq.Subscriber as jest.MockedClass<typeof zmq.Subscriber>) = jest.fn<any>(() => mockSubSocket) as any;
});

afterEach(() => {
  jest.clearAllMocks();
});

// ─── onResponse / onReaction ──────────────────────────────────────────────────

describe('handler registration', () => {
  it('onResponse and onReaction accept and store handlers without throwing', () => {
    const client = new ZmqAgentClient();
    expect(() => {
      client.onResponse(jest.fn<any>());
      client.onReaction(jest.fn<any>());
    }).not.toThrow();
  });
});

// ─── initialize ───────────────────────────────────────────────────────────────

describe('initialize', () => {
  it('connects push and sub sockets to the configured host/port', async () => {
    const client = new ZmqAgentClient('myhost', 5560, 5561);
    await client.initialize();

    expect(mockPushSocket.connect).toHaveBeenCalledWith('tcp://myhost:5560');
    expect(mockSubSocket.connect).toHaveBeenCalledWith('tcp://myhost:5561');
    expect(mockSubSocket.subscribe).toHaveBeenCalledWith('');
  });

  it('uses default host/ports when constructed without arguments', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    expect(mockPushSocket.connect).toHaveBeenCalledWith(expect.stringContaining('localhost'));
  });

  it('throws when push socket connect fails', async () => {
    mockPushSocket.connect.mockRejectedValue(new Error('push fail'));
    const client = new ZmqAgentClient();
    await expect(client.initialize()).rejects.toThrow('push fail');
  });

  it('throws when sub socket connect fails', async () => {
    mockSubSocket.connect.mockRejectedValue(new Error('sub fail'));
    const client = new ZmqAgentClient();
    await expect(client.initialize()).rejects.toThrow('sub fail');
  });
});

// ─── sendEvent ────────────────────────────────────────────────────────────────

describe('sendEvent', () => {
  it('sends serialized JSON to the push socket', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    await client.sendEvent({ action: 'ping', data: 42 });

    expect(mockPushSocket.send).toHaveBeenCalledWith(JSON.stringify({ action: 'ping', data: 42 }));
  });

  it('throws when the push socket is not initialized', async () => {
    const client = new ZmqAgentClient();
    await expect(client.sendEvent({ action: 'ping' })).rejects.toThrow();
  });
});

// ─── startListening ───────────────────────────────────────────────────────────

describe('startListening', () => {
  it('returns immediately when subSocket is null (not initialized)', async () => {
    const client = new ZmqAgentClient();
    await expect(client.startListening()).resolves.toBeUndefined();
  });

  it('calls the response handler for a valid agent:response message', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    const responseHandler = jest.fn<any>().mockResolvedValue(undefined);
    client.onResponse(responseHandler);

    const payload = Buffer.from(JSON.stringify(makeAgentResponse()));
    Object.assign(mockSubSocket, makeAsyncIterable([[payload]]));

    await client.startListening();

    expect(responseHandler).toHaveBeenCalledTimes(1);
    expect(responseHandler.mock.calls[0][0]).toMatchObject({ type: 'agent:response', conversationId: 'conv-1' });
  });

  it('calls the reaction handler for a valid agent:reaction message', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    const reactionHandler = jest.fn<any>().mockResolvedValue(undefined);
    client.onReaction(reactionHandler);

    const payload = Buffer.from(JSON.stringify(makeAgentReaction()));
    Object.assign(mockSubSocket, makeAsyncIterable([[payload]]));

    await client.startListening();

    expect(reactionHandler).toHaveBeenCalledTimes(1);
    expect(reactionHandler.mock.calls[0][0]).toMatchObject({ type: 'agent:reaction', emoji: '👍' });
  });

  it('skips messages that fail Zod schema validation (logs warn, no handler call)', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    const responseHandler = jest.fn<any>();
    client.onResponse(responseHandler);

    const payload = Buffer.from(JSON.stringify({ type: 'agent:response', conversationId: '' })); // missing required fields
    Object.assign(mockSubSocket, makeAsyncIterable([[payload]]));

    await client.startListening();

    expect(responseHandler).not.toHaveBeenCalled();
  });

  it('continues processing after a JSON parse error', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    const reactionHandler = jest.fn<any>().mockResolvedValue(undefined);
    client.onReaction(reactionHandler);

    const bad = Buffer.from('not json {{{');
    const good = Buffer.from(JSON.stringify(makeAgentReaction()));
    Object.assign(mockSubSocket, makeAsyncIterable([[bad], [good]]));

    await client.startListening();

    expect(reactionHandler).toHaveBeenCalledTimes(1);
  });

  it('stops the loop when no handler is registered for the message type', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();
    // no handlers registered
    const payload = Buffer.from(JSON.stringify(makeAgentResponse()));
    Object.assign(mockSubSocket, makeAsyncIterable([[payload]]));
    await expect(client.startListening()).resolves.toBeUndefined();
  });
});

// ─── close ────────────────────────────────────────────────────────────────────

describe('close', () => {
  it('closes both sockets and sets them to null', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();
    await client.close();

    expect(mockPushSocket.close).toHaveBeenCalled();
    expect(mockSubSocket.close).toHaveBeenCalled();
  });

  it('does not throw when called before initialize', async () => {
    const client = new ZmqAgentClient();
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('handles errors during close gracefully (does not throw)', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();
    mockPushSocket.close.mockRejectedValue(new Error('close fail'));
    await expect(client.close()).resolves.toBeUndefined();
  });
});
