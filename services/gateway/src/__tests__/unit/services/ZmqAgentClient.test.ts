/**
 * Unit tests for ZmqAgentClient
 *
 * Covers:
 * - Constructor defaults and custom host/ports
 * - initialize(): PUSH + SUB socket creation and connection
 * - sendEvent(): JSON serialization over PUSH socket
 * - sendEvent() throws when not initialized
 * - onResponse() / onReaction() handler registration
 * - startListening(): early return when not initialized
 * - startListening(): dispatches agent:response to response handler
 * - startListening(): dispatches agent:reaction to reaction handler
 * - startListening(): silently drops messages with no registered handler
 * - startListening(): logs warning for invalid Zod schema (missing fields)
 * - startListening(): logs warning for unknown type (discriminated union mismatch)
 * - startListening(): logs error and continues on JSON parse failure
 * - startListening(): logs error and continues when handler throws
 * - startListening(): processes multiple messages in order
 * - startListening(): validates optional agent:response fields
 * - startListening(): rejects invalid agentType enum value
 * - startListening(): rejects roleConfidence out of [0,1] range
 * - close(): closes both sockets and nullifies references
 * - close(): sets running to false
 * - close(): does not throw when sockets are already null
 * - close(): handles socket close error gracefully
 * - initialize() propagates PUSH connect failure
 * - initialize() propagates SUB connect failure
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── zeromq mocks (declared before jest.mock, see hoisting note below) ────────
//
// Jest transforms jest.mock() calls to the top of the file (before imports),
// but factory functions are executed LAZILY when the mocked module is first
// required — at which point all module-level variable declarations have run.
// This is safe with ts-jest/CommonJS transformation.

const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
};

let testMessages: Array<[Buffer]> = [];

const mockPushSocket = {
  connect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockSubSocket = {
  connect: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  [Symbol.asyncIterator](): AsyncIterator<[Buffer]> {
    const snapshot = [...testMessages];
    let index = 0;
    return {
      async next(): Promise<IteratorResult<[Buffer]>> {
        if (index < snapshot.length) {
          return { value: snapshot[index++] as [Buffer], done: false };
        }
        return { value: undefined as unknown as [Buffer], done: true };
      },
    };
  },
};

jest.mock('zeromq', () => ({
  Push: jest.fn().mockImplementation(() => mockPushSocket),
  Subscriber: jest.fn().mockImplementation(() => mockSubSocket),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue(mockLogger),
  },
}));

// Import AFTER jest.mock declarations
import { ZmqAgentClient } from '../../../services/zmq-agent/ZmqAgentClient';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makeAgentResponse(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'agent:response',
    conversationId: 'conv-001',
    asUserId: 'user-001',
    content: 'Hello from agent',
    originalLanguage: 'en',
    messageSource: 'agent',
    metadata: {
      agentType: 'impersonator',
      roleConfidence: 0.9,
    },
    ...overrides,
  };
}

function makeAgentReaction(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    type: 'agent:reaction',
    conversationId: 'conv-001',
    asUserId: 'user-001',
    targetMessageId: 'msg-001',
    emoji: '👍',
    ...overrides,
  };
}

function msgBuffer(payload: Record<string, unknown>): [Buffer] {
  return [Buffer.from(JSON.stringify(payload))];
}

function makeSUT(): ZmqAgentClient {
  return new ZmqAgentClient();
}

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  testMessages = [];
  mockPushSocket.connect.mockResolvedValue(undefined);
  mockPushSocket.send.mockResolvedValue(undefined);
  mockPushSocket.close.mockResolvedValue(undefined);
  mockSubSocket.connect.mockResolvedValue(undefined);
  mockSubSocket.subscribe.mockResolvedValue(undefined);
  mockSubSocket.close.mockResolvedValue(undefined);
});

// ─── Constructor ──────────────────────────────────────────────────────────────

describe('ZmqAgentClient — constructor', () => {
  it('connects to default host and ports', async () => {
    const client = makeSUT();
    await client.initialize();

    expect(mockPushSocket.connect).toHaveBeenCalledWith('tcp://localhost:5560');
    expect(mockSubSocket.connect).toHaveBeenCalledWith('tcp://localhost:5561');
  });

  it('accepts custom host and ports', async () => {
    const client = new ZmqAgentClient('10.0.0.1', 6660, 6661);
    await client.initialize();

    expect(mockPushSocket.connect).toHaveBeenCalledWith('tcp://10.0.0.1:6660');
    expect(mockSubSocket.connect).toHaveBeenCalledWith('tcp://10.0.0.1:6661');
  });
});

// ─── initialize() ────────────────────────────────────────────────────────────

describe('ZmqAgentClient — initialize()', () => {
  it('creates Push and Subscriber sockets and connects both', async () => {
    const client = makeSUT();
    await client.initialize();

    const zmq = jest.requireMock('zeromq') as { Push: jest.Mock; Subscriber: jest.Mock };
    expect(zmq.Push).toHaveBeenCalledTimes(1);
    expect(zmq.Subscriber).toHaveBeenCalledTimes(1);
    expect(mockPushSocket.connect).toHaveBeenCalledTimes(1);
    expect(mockSubSocket.connect).toHaveBeenCalledTimes(1);
  });

  it('subscribes to all messages on the SUB socket', async () => {
    const client = makeSUT();
    await client.initialize();

    expect(mockSubSocket.subscribe).toHaveBeenCalledWith('');
  });

  it('propagates PUSH connect failure', async () => {
    mockPushSocket.connect.mockRejectedValueOnce(new Error('PUSH bind failed'));

    const client = makeSUT();
    await expect(client.initialize()).rejects.toThrow('PUSH bind failed');
  });

  it('propagates SUB connect failure', async () => {
    mockSubSocket.connect.mockRejectedValueOnce(new Error('SUB bind failed'));

    const client = makeSUT();
    await expect(client.initialize()).rejects.toThrow('SUB bind failed');
  });
});

// ─── sendEvent() ──────────────────────────────────────────────────────────────

describe('ZmqAgentClient — sendEvent()', () => {
  it('sends JSON-serialized event over the PUSH socket', async () => {
    const client = makeSUT();
    await client.initialize();

    const event = { type: 'conversation:created', conversationId: 'c-1', userId: 'u-1' };
    await client.sendEvent(event);

    expect(mockPushSocket.send).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it('sends complex nested event objects', async () => {
    const client = makeSUT();
    await client.initialize();

    const event = { type: 'message:send', payload: { id: 'm-1', content: 'hello', nested: { key: true } } };
    await client.sendEvent(event);

    expect(mockPushSocket.send).toHaveBeenCalledWith(JSON.stringify(event));
  });

  it('throws when PUSH socket is not initialized', async () => {
    const client = makeSUT(); // no initialize()

    await expect(client.sendEvent({ type: 'test' })).rejects.toThrow(
      'Agent PUSH socket not initialized',
    );
  });
});

// ─── onResponse() / onReaction() ─────────────────────────────────────────────

describe('ZmqAgentClient — handler registration', () => {
  it('onResponse() registers handler invoked on agent:response', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(handler);

    testMessages = [msgBuffer(makeAgentResponse({ content: 'registered' }))];
    await client.startListening();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent:response', content: 'registered' }),
    );
  });

  it('onReaction() registers handler invoked on agent:reaction', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onReaction(handler);

    testMessages = [msgBuffer(makeAgentReaction({ emoji: '🔥' }))];
    await client.startListening();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ type: 'agent:reaction', emoji: '🔥' }),
    );
  });
});

// ─── startListening() ────────────────────────────────────────────────────────

describe('ZmqAgentClient — startListening()', () => {
  it('returns immediately when subSocket is null (not initialized)', async () => {
    const client = makeSUT();
    await expect(client.startListening()).resolves.toBeUndefined();
  });

  it('does not call response handler when no agent:response messages arrive', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(handler);

    testMessages = [];
    await client.startListening();

    expect(handler).not.toHaveBeenCalled();
  });

  it('silently drops agent:response when no response handler is registered', async () => {
    const client = makeSUT();
    await client.initialize();

    testMessages = [msgBuffer(makeAgentResponse())];
    await expect(client.startListening()).resolves.toBeUndefined();
  });

  it('silently drops agent:reaction when no reaction handler is registered', async () => {
    const client = makeSUT();
    await client.initialize();

    testMessages = [msgBuffer(makeAgentReaction())];
    await expect(client.startListening()).resolves.toBeUndefined();
  });

  it('dispatches agent:response and not agent:reaction to response handler', async () => {
    const client = makeSUT();
    await client.initialize();
    const responseHandler = jest.fn().mockResolvedValue(undefined);
    const reactionHandler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(responseHandler);
    client.onReaction(reactionHandler);

    testMessages = [msgBuffer(makeAgentResponse())];
    await client.startListening();

    expect(responseHandler).toHaveBeenCalledTimes(1);
    expect(reactionHandler).not.toHaveBeenCalled();
  });

  it('dispatches agent:reaction and not agent:response to reaction handler', async () => {
    const client = makeSUT();
    await client.initialize();
    const responseHandler = jest.fn().mockResolvedValue(undefined);
    const reactionHandler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(responseHandler);
    client.onReaction(reactionHandler);

    testMessages = [msgBuffer(makeAgentReaction())];
    await client.startListening();

    expect(reactionHandler).toHaveBeenCalledTimes(1);
    expect(responseHandler).not.toHaveBeenCalled();
  });

  it('processes multiple messages in FIFO order', async () => {
    const client = makeSUT();
    await client.initialize();
    const callOrder: string[] = [];

    client.onResponse(async (msg) => { callOrder.push(`response:${msg.content}`); });
    client.onReaction(async (msg) => { callOrder.push(`reaction:${msg.emoji}`); });

    testMessages = [
      msgBuffer(makeAgentResponse({ content: 'first' })),
      msgBuffer(makeAgentReaction({ emoji: '👍' })),
      msgBuffer(makeAgentResponse({ content: 'second' })),
    ];
    await client.startListening();

    expect(callOrder).toEqual(['response:first', 'reaction:👍', 'response:second']);
  });

  it('logs warning and skips message when Zod schema validation fails', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(handler);

    // Missing required fields: content, originalLanguage, messageSource, metadata
    testMessages = [msgBuffer({ type: 'agent:response', conversationId: 'x', asUserId: 'y' })];
    await client.startListening();

    expect(handler).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalledWith(
      'Invalid message schema',
      expect.objectContaining({ issues: expect.any(Array) }),
    );
  });

  it('logs warning and skips message with unknown type', async () => {
    const client = makeSUT();
    await client.initialize();
    const responseHandler = jest.fn().mockResolvedValue(undefined);
    const reactionHandler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(responseHandler);
    client.onReaction(reactionHandler);

    testMessages = [msgBuffer({ type: 'agent:unknown', conversationId: 'c', asUserId: 'u' })];
    await client.startListening();

    expect(responseHandler).not.toHaveBeenCalled();
    expect(reactionHandler).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('logs error and continues when JSON.parse fails', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(handler);

    const malformed: [Buffer] = [Buffer.from('not-valid-json!!!')];
    testMessages = [malformed, msgBuffer(makeAgentResponse({ content: 'after-error' }))];
    await client.startListening();

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({ content: 'after-error' }),
    );
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error processing message',
      expect.any(SyntaxError),
    );
  });

  it('logs error and continues when response handler throws', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn()
      .mockRejectedValueOnce(new Error('handler boom'))
      .mockResolvedValue(undefined);
    client.onResponse(handler);

    testMessages = [
      msgBuffer(makeAgentResponse({ content: 'first' })),
      msgBuffer(makeAgentResponse({ content: 'second' })),
    ];
    await client.startListening();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(mockLogger.error).toHaveBeenCalledWith(
      'Error processing message',
      expect.any(Error),
    );
  });

  it('logs error and continues when reaction handler throws', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn()
      .mockRejectedValueOnce(new Error('reaction boom'))
      .mockResolvedValue(undefined);
    client.onReaction(handler);

    testMessages = [
      msgBuffer(makeAgentReaction()),
      msgBuffer(makeAgentReaction({ emoji: '❤️' })),
    ];
    await client.startListening();

    expect(handler).toHaveBeenCalledTimes(2);
  });

  it('accepts valid optional fields on agent:response', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(handler);

    const full = makeAgentResponse({
      replyToId: 'msg-parent-001',
      mentionedUsernames: ['alice', 'bob'],
      metadata: {
        agentType: 'orchestrator',
        roleConfidence: 0.75,
        archetypeId: 'archetype-x',
      },
    });
    testMessages = [msgBuffer(full)];
    await client.startListening();

    expect(handler).toHaveBeenCalledWith(
      expect.objectContaining({
        replyToId: 'msg-parent-001',
        mentionedUsernames: ['alice', 'bob'],
        metadata: expect.objectContaining({ archetypeId: 'archetype-x' }),
      }),
    );
  });

  it('rejects agent:response with invalid agentType enum value', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(handler);

    testMessages = [msgBuffer(makeAgentResponse({
      metadata: { agentType: 'rogue-agent', roleConfidence: 0.5 },
    }))];
    await client.startListening();

    expect(handler).not.toHaveBeenCalled();
    expect(mockLogger.warn).toHaveBeenCalled();
  });

  it('rejects agent:response with roleConfidence above 1', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(handler);

    testMessages = [msgBuffer(makeAgentResponse({
      metadata: { agentType: 'animator', roleConfidence: 1.5 },
    }))];
    await client.startListening();

    expect(handler).not.toHaveBeenCalled();
  });

  it('rejects agent:response with roleConfidence below 0', async () => {
    const client = makeSUT();
    await client.initialize();
    const handler = jest.fn().mockResolvedValue(undefined);
    client.onResponse(handler);

    testMessages = [msgBuffer(makeAgentResponse({
      metadata: { agentType: 'animator', roleConfidence: -0.1 },
    }))];
    await client.startListening();

    expect(handler).not.toHaveBeenCalled();
  });

  it('accepts all three valid agentType enum values', async () => {
    const agentTypes = ['impersonator', 'animator', 'orchestrator'] as const;

    for (const agentType of agentTypes) {
      jest.clearAllMocks();
      testMessages = [];

      const client = makeSUT();
      await client.initialize();
      const handler = jest.fn().mockResolvedValue(undefined);
      client.onResponse(handler);

      testMessages = [msgBuffer(makeAgentResponse({ metadata: { agentType, roleConfidence: 0.5 } }))];
      await client.startListening();

      expect(handler).toHaveBeenCalledTimes(1);
    }
  });
});

// ─── close() ─────────────────────────────────────────────────────────────────

describe('ZmqAgentClient — close()', () => {
  it('closes both sockets', async () => {
    const client = makeSUT();
    await client.initialize();
    await client.close();

    expect(mockPushSocket.close).toHaveBeenCalledTimes(1);
    expect(mockSubSocket.close).toHaveBeenCalledTimes(1);
  });

  it('sets running to false', async () => {
    const client = makeSUT();
    await client.initialize();
    await client.close();

    expect((client as unknown as Record<string, unknown>).running).toBe(false);
  });

  it('nullifies pushSocket and subSocket references after close', async () => {
    const client = makeSUT();
    await client.initialize();
    await client.close();

    const internal = client as unknown as Record<string, unknown>;
    expect(internal.pushSocket).toBeNull();
    expect(internal.subSocket).toBeNull();
  });

  it('does not throw when sockets are never initialized', async () => {
    const client = makeSUT();
    await expect(client.close()).resolves.toBeUndefined();
  });

  it('handles push socket close error gracefully', async () => {
    mockPushSocket.close.mockRejectedValueOnce(new Error('push already closed'));

    const client = makeSUT();
    await client.initialize();

    await expect(client.close()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('handles sub socket close error gracefully', async () => {
    mockSubSocket.close.mockRejectedValueOnce(new Error('sub already closed'));

    const client = makeSUT();
    await client.initialize();

    await expect(client.close()).resolves.toBeUndefined();
    expect(mockLogger.error).toHaveBeenCalled();
  });

  it('calling close twice does not throw', async () => {
    const client = makeSUT();
    await client.initialize();
    await client.close();

    await expect(client.close()).resolves.toBeUndefined();
  });
});
