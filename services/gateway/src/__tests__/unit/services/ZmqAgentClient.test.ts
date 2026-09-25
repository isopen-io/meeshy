/**
 * Unit tests for services/zmq-agent/ZmqAgentClient.
 * Covers: onResponse/onReaction handler registration, initialize (success,
 * push failure, sub failure), sendEvent (initialized, not-initialized),
 * startListening (agent:response, agent:reaction, invalid schema, parse error,
 * running=false early exit, a rejecting handler costing exactly one message,
 * the roleConfidence bound at both ends, the agentType enum on both sides,
 * exclusive routing by discriminant), close (happy path, already-closed, error).
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

  it('hands the illustration source of a fresh-topic response to the handler (#6192)', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    const responseHandler = jest.fn<any>().mockResolvedValue(undefined);
    client.onResponse(responseHandler);

    const payload = Buffer.from(JSON.stringify(makeAgentResponse({
      illustration: { sourceUrl: 'https://www.camerounweb.com/faits-divers/bonaberi' },
    })));
    Object.assign(mockSubSocket, makeAsyncIterable([[payload]]));

    await client.startListening();

    expect(responseHandler).toHaveBeenCalledTimes(1);
    expect(responseHandler.mock.calls[0][0]).toMatchObject({
      illustration: { sourceUrl: 'https://www.camerounweb.com/faits-divers/bonaberi' },
    });
  });

  it('drops a response whose illustration source is not a URL', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    const responseHandler = jest.fn<any>().mockResolvedValue(undefined);
    client.onResponse(responseHandler);

    const payload = Buffer.from(JSON.stringify(makeAgentResponse({ illustration: { sourceUrl: 'not a url' } })));
    Object.assign(mockSubSocket, makeAsyncIterable([[payload]]));

    await client.startListening();

    expect(responseHandler).not.toHaveBeenCalled();
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

  it('survives a response handler that rejects: the next message is still served', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    // The handler blows up on the first message only. The loop wraps the handler
    // call in the same try/catch as JSON.parse (ZmqAgentClient.startListening), so
    // a poisonous message must cost exactly one message, never the whole stream —
    // this listener is the single point through which all agent traffic arrives.
    const responseHandler = jest.fn<any>()
      .mockRejectedValueOnce(new Error('handler blew up'))
      .mockResolvedValue(undefined);
    client.onResponse(responseHandler);

    const first = Buffer.from(JSON.stringify(makeAgentResponse({ conversationId: 'conv-that-fails' })));
    const second = Buffer.from(JSON.stringify(makeAgentResponse({ conversationId: 'conv-that-follows' })));
    Object.assign(mockSubSocket, makeAsyncIterable([[first], [second]]));

    await expect(client.startListening()).resolves.toBeUndefined();

    expect(responseHandler).toHaveBeenCalledTimes(2);
    expect(responseHandler.mock.calls[1][0]).toMatchObject({ conversationId: 'conv-that-follows' });
  });

  it('survives a reaction handler that rejects: the next message is still served', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    const reactionHandler = jest.fn<any>()
      .mockRejectedValueOnce(new Error('handler blew up'))
      .mockResolvedValue(undefined);
    client.onReaction(reactionHandler);

    const first = Buffer.from(JSON.stringify(makeAgentReaction({ targetMessageId: 'msg-that-fails' })));
    const second = Buffer.from(JSON.stringify(makeAgentReaction({ targetMessageId: 'msg-that-follows' })));
    Object.assign(mockSubSocket, makeAsyncIterable([[first], [second]]));

    await expect(client.startListening()).resolves.toBeUndefined();

    expect(reactionHandler).toHaveBeenCalledTimes(2);
    expect(reactionHandler.mock.calls[1][0]).toMatchObject({ targetMessageId: 'msg-that-follows' });
  });

  it('rejects a roleConfidence outside [0, 1] and accepts the boundary value 1', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    // `agentResponseSchema` declares `roleConfidence: z.number().min(0).max(1)`.
    // Both ends of that rule are asserted here: 1.4 never reaches the handler,
    // 1 does — so the bound is a real bound and not an exclusive one.
    const responseHandler = jest.fn<any>().mockResolvedValue(undefined);
    client.onResponse(responseHandler);

    const outOfRange = Buffer.from(JSON.stringify(makeAgentResponse({
      metadata: { agentType: 'impersonator', roleConfidence: 1.4 },
    })));
    const atBoundary = Buffer.from(JSON.stringify(makeAgentResponse({
      metadata: { agentType: 'impersonator', roleConfidence: 1 },
    })));
    Object.assign(mockSubSocket, makeAsyncIterable([[outOfRange], [atBoundary]]));

    await client.startListening();

    expect(responseHandler).toHaveBeenCalledTimes(1);
    expect(responseHandler.mock.calls[0][0]).toMatchObject({ metadata: { roleConfidence: 1 } });
  });

  it("rejects an unknown agentType and accepts all three of the enum's members", async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    // `agentResponseSchema` declares
    // `agentType: z.enum(['impersonator', 'animator', 'orchestrator'])`.
    // Both sides of that rule are asserted here: a value outside the enum never
    // reaches the handler, and each of the three members does. Without the second
    // half, dropping a member would silently stop that traffic — the message would
    // be counted an invalid schema and logged at warn, nothing more.
    const responseHandler = jest.fn<any>().mockResolvedValue(undefined);
    client.onResponse(responseHandler);

    const payloads = [
      { agentType: 'saboteur', roleConfidence: 0.9 },
      { agentType: 'impersonator', roleConfidence: 0.9 },
      { agentType: 'animator', roleConfidence: 0.9 },
      { agentType: 'orchestrator', roleConfidence: 0.9 },
    ].map((metadata) => [Buffer.from(JSON.stringify(makeAgentResponse({ metadata })))]);
    Object.assign(mockSubSocket, makeAsyncIterable(payloads));

    await client.startListening();

    expect(responseHandler).toHaveBeenCalledTimes(3);
    expect(responseHandler.mock.calls.map((c: any) => c[0].metadata.agentType))
      .toEqual(['impersonator', 'animator', 'orchestrator']);
  });

  it('routes by discriminant: a response never reaches the reaction handler, nor the reverse', async () => {
    const client = new ZmqAgentClient();
    await client.initialize();

    const responseHandler = jest.fn<any>().mockResolvedValue(undefined);
    const reactionHandler = jest.fn<any>().mockResolvedValue(undefined);
    client.onResponse(responseHandler);
    client.onReaction(reactionHandler);

    Object.assign(mockSubSocket, makeAsyncIterable([
      [Buffer.from(JSON.stringify(makeAgentResponse()))],
      [Buffer.from(JSON.stringify(makeAgentReaction()))],
    ]));

    await client.startListening();

    expect(responseHandler).toHaveBeenCalledTimes(1);
    expect(reactionHandler).toHaveBeenCalledTimes(1);
    expect(responseHandler.mock.calls[0][0]).toMatchObject({ type: 'agent:response' });
    expect(reactionHandler.mock.calls[0][0]).toMatchObject({ type: 'agent:reaction' });
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
