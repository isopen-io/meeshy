import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Controllable async-iterable message queue ───────────────────────────────
let pendingMessages: string[] = [];
let mockPushInstance: any;
let mockSubInstance: any;

jest.mock('zeromq', () => {
  return {
    Push: jest.fn().mockImplementation(() => {
      mockPushInstance = {
        connect: jest.fn<any>().mockResolvedValue(undefined),
        send: jest.fn<any>().mockResolvedValue(undefined),
        close: jest.fn<any>().mockResolvedValue(undefined),
      };
      return mockPushInstance;
    }),
    Subscriber: jest.fn().mockImplementation(() => {
      mockSubInstance = {
        connect: jest.fn<any>().mockResolvedValue(undefined),
        subscribe: jest.fn<any>().mockResolvedValue(undefined),
        close: jest.fn<any>().mockResolvedValue(undefined),
        [Symbol.asyncIterator]: async function* () {
          for (const msg of pendingMessages) {
            yield [Buffer.from(msg)];
          }
        },
      };
      return mockSubInstance;
    }),
  };
});

// ─── Logger mock — single shared child logger object per test run ─────────────
const mockChildLogger = {
  trace: jest.fn<any>(),
  debug: jest.fn<any>(),
  info: jest.fn<any>(),
  warn: jest.fn<any>(),
  error: jest.fn<any>(),
};

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => mockChildLogger),
  },
}));

// Import AFTER mocks are set up
import { ZmqAgentClient } from '../../../services/zmq-agent/ZmqAgentClient';

// ─── Valid message fixtures ───────────────────────────────────────────────────
const validResponse = JSON.stringify({
  type: 'agent:response',
  conversationId: 'conv1',
  asUserId: 'user1',
  content: 'Hello!',
  originalLanguage: 'en',
  messageSource: 'agent',
  metadata: { agentType: 'impersonator', roleConfidence: 0.9 },
});

const validReaction = JSON.stringify({
  type: 'agent:reaction',
  conversationId: 'conv1',
  asUserId: 'user1',
  targetMessageId: 'msg1',
  emoji: '👍',
});

// ─────────────────────────────────────────────────────────────────────────────

describe('ZmqAgentClient', () => {
  let client: ZmqAgentClient;

  beforeEach(() => {
    pendingMessages = [];
    jest.clearAllMocks();
    // Re-attach methods after clearAllMocks wipes them on the shared child logger
    mockChildLogger.trace = jest.fn<any>();
    mockChildLogger.debug = jest.fn<any>();
    mockChildLogger.info = jest.fn<any>();
    mockChildLogger.warn = jest.fn<any>();
    mockChildLogger.error = jest.fn<any>();

    client = new ZmqAgentClient('localhost', 5560, 5561);
  });

  // ── 1. onResponse() ────────────────────────────────────────────────────────
  describe('onResponse()', () => {
    it('stores the handler and invokes it for valid agent:response messages', async () => {
      const handler = jest.fn<any>().mockResolvedValue(undefined);
      client.onResponse(handler);

      pendingMessages = [validResponse];
      await client.initialize();
      await client.startListening();

      expect(handler).toHaveBeenCalledTimes(1);
      const arg = handler.mock.calls[0][0];
      expect(arg.type).toBe('agent:response');
      expect(arg.conversationId).toBe('conv1');
    });
  });

  // ── 2. onReaction() ───────────────────────────────────────────────────────
  describe('onReaction()', () => {
    it('stores the handler and invokes it for valid agent:reaction messages', async () => {
      const handler = jest.fn<any>().mockResolvedValue(undefined);
      client.onReaction(handler);

      pendingMessages = [validReaction];
      await client.initialize();
      await client.startListening();

      expect(handler).toHaveBeenCalledTimes(1);
      const arg = handler.mock.calls[0][0];
      expect(arg.type).toBe('agent:reaction');
      expect(arg.emoji).toBe('👍');
    });
  });

  // ── 3. initialize() — creates sockets with correct host/port ──────────────
  describe('initialize()', () => {
    it('connects PUSH socket to the correct host and push port', async () => {
      await client.initialize();
      expect(mockPushInstance.connect).toHaveBeenCalledWith('tcp://localhost:5560');
    });

    it('connects SUB socket to the correct host and sub port and subscribes to all messages', async () => {
      await client.initialize();
      expect(mockSubInstance.connect).toHaveBeenCalledWith('tcp://localhost:5561');
      expect(mockSubInstance.subscribe).toHaveBeenCalledWith('');
    });

    it('uses custom constructor arguments for socket addresses', async () => {
      const customClient = new ZmqAgentClient('10.0.0.1', 9000, 9001);
      await customClient.initialize();
      expect(mockPushInstance.connect).toHaveBeenCalledWith('tcp://10.0.0.1:9000');
      expect(mockSubInstance.connect).toHaveBeenCalledWith('tcp://10.0.0.1:9001');
      await customClient.close();
    });

    // ── 4. initialize() — propagates errors ───────────────────────────────
    it('propagates error when PUSH socket connect throws', async () => {
      // initialize() calls `new zmq.Push()` internally, which triggers the
      // factory and sets mockPushInstance to a fresh object. We therefore need
      // to override the factory's return value BEFORE calling initialize() by
      // injecting a failing connect into the factory itself.
      const zmq = await import('zeromq');
      (zmq.Push as jest.Mock<any>).mockImplementationOnce(() => ({
        connect: jest.fn<any>().mockRejectedValue(new Error('PUSH connect failed')),
        send: jest.fn<any>().mockResolvedValue(undefined),
        close: jest.fn<any>().mockResolvedValue(undefined),
      }));

      const errorClient = new ZmqAgentClient();
      await expect(errorClient.initialize()).rejects.toThrow('PUSH connect failed');
    });

    it('propagates error when SUB socket connect throws', async () => {
      const zmq = await import('zeromq');
      (zmq.Subscriber as jest.Mock<any>).mockImplementationOnce(() => ({
        connect: jest.fn<any>().mockRejectedValue(new Error('SUB connect failed')),
        subscribe: jest.fn<any>().mockResolvedValue(undefined),
        close: jest.fn<any>().mockResolvedValue(undefined),
        [Symbol.asyncIterator]: async function* () {},
      }));

      const errorClient = new ZmqAgentClient();
      await expect(errorClient.initialize()).rejects.toThrow('SUB connect failed');
    });
  });

  // ── 5. sendEvent() — sends JSON-serialized event ──────────────────────────
  describe('sendEvent()', () => {
    it('sends the event as a JSON string via the push socket', async () => {
      await client.initialize();
      const event = { action: 'ping', data: 42 };
      await client.sendEvent(event);

      expect(mockPushInstance.send).toHaveBeenCalledTimes(1);
      const sent = mockPushInstance.send.mock.calls[0][0];
      expect(JSON.parse(sent)).toEqual(event);
    });

    // ── 6. sendEvent() — throws when not initialized ──────────────────────
    it('throws when pushSocket is null (not initialized)', async () => {
      await expect(client.sendEvent({ foo: 'bar' })).rejects.toThrow(
        'Agent PUSH socket not initialized',
      );
    });
  });

  // ── 7–12. startListening() ────────────────────────────────────────────────
  describe('startListening()', () => {
    // ── 7. returns early when subSocket is null ───────────────────────────
    it('returns immediately without throwing when subSocket is not initialized', async () => {
      // Do NOT call initialize() — sockets remain null
      await expect(client.startListening()).resolves.toBeUndefined();
    });

    // ── 8. calls responseHandler for valid agent:response ─────────────────
    it('calls responseHandler with parsed agent:response payload', async () => {
      const handler = jest.fn<any>().mockResolvedValue(undefined);
      client.onResponse(handler);

      pendingMessages = [validResponse];
      await client.initialize();
      await client.startListening();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].content).toBe('Hello!');
    });

    // ── 9. calls reactionHandler for valid agent:reaction ─────────────────
    it('calls reactionHandler with parsed agent:reaction payload', async () => {
      const handler = jest.fn<any>().mockResolvedValue(undefined);
      client.onReaction(handler);

      pendingMessages = [validReaction];
      await client.initialize();
      await client.startListening();

      expect(handler).toHaveBeenCalledTimes(1);
      expect(handler.mock.calls[0][0].targetMessageId).toBe('msg1');
    });

    // ── 10. logs warn for invalid schema ──────────────────────────────────
    it('logs a warning and continues for a message that fails schema validation', async () => {
      const invalidMsg = JSON.stringify({ type: 'agent:response' }); // missing required fields
      pendingMessages = [invalidMsg];

      await client.initialize();
      await client.startListening();

      expect(mockChildLogger.warn).toHaveBeenCalledWith(
        'Invalid message schema',
        expect.objectContaining({ issues: expect.any(Array) }),
      );
    });

    // ── 11. logs error for invalid JSON ───────────────────────────────────
    it('logs an error and continues when a message contains invalid JSON', async () => {
      pendingMessages = ['not-valid-json{{{'];

      await client.initialize();
      await client.startListening();

      expect(mockChildLogger.error).toHaveBeenCalledWith(
        'Error processing message',
        expect.any(Error),
      );
    });

    // ── 12. no handler called when responseHandler is null ────────────────
    it('does not throw when a valid agent:response arrives but responseHandler is null', async () => {
      // No onResponse() call — handler stays null
      pendingMessages = [validResponse];
      await client.initialize();

      await expect(client.startListening()).resolves.toBeUndefined();
    });

    it('does not throw when a valid agent:reaction arrives but reactionHandler is null', async () => {
      pendingMessages = [validReaction];
      await client.initialize();

      await expect(client.startListening()).resolves.toBeUndefined();
    });

    it('processes both response and reaction messages in a single listening pass', async () => {
      const responseHandler = jest.fn<any>().mockResolvedValue(undefined);
      const reactionHandler = jest.fn<any>().mockResolvedValue(undefined);
      client.onResponse(responseHandler);
      client.onReaction(reactionHandler);

      pendingMessages = [validResponse, validReaction];
      await client.initialize();
      await client.startListening();

      expect(responseHandler).toHaveBeenCalledTimes(1);
      expect(reactionHandler).toHaveBeenCalledTimes(1);
    });
  });

  // ── 13–15. close() ────────────────────────────────────────────────────────
  describe('close()', () => {
    it('closes both push and sub sockets after initialize', async () => {
      await client.initialize();
      await client.close();

      expect(mockPushInstance.close).toHaveBeenCalledTimes(1);
      expect(mockSubInstance.close).toHaveBeenCalledTimes(1);
    });

    it('sets running to false', async () => {
      await client.initialize();
      await client.close();

      expect((client as any).running).toBe(false);
    });

    it('sets pushSocket to null after closing', async () => {
      await client.initialize();
      await client.close();

      expect((client as any).pushSocket).toBeNull();
    });

    it('sets subSocket to null after closing', async () => {
      await client.initialize();
      await client.close();

      expect((client as any).subSocket).toBeNull();
    });

    // ── 14. safe when called before initialize ────────────────────────────
    it('resolves without error when called before initialize (sockets are null)', async () => {
      await expect(client.close()).resolves.toBeUndefined();
    });

    // ── 15. logs error when socket.close() throws ─────────────────────────
    it('logs an error (does not throw) when pushSocket.close() rejects', async () => {
      await client.initialize();
      mockPushInstance.close = jest.fn<any>().mockRejectedValue(new Error('close failed'));

      await expect(client.close()).resolves.toBeUndefined();
      expect(mockChildLogger.error).toHaveBeenCalledWith('Error during close', expect.any(Error));
    });

    it('logs an error (does not throw) when subSocket.close() rejects', async () => {
      await client.initialize();
      mockSubInstance.close = jest.fn<any>().mockRejectedValue(new Error('sub close failed'));

      await expect(client.close()).resolves.toBeUndefined();
      expect(mockChildLogger.error).toHaveBeenCalledWith('Error during close', expect.any(Error));
    });
  });
});
