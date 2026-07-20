import { ZmqAgentClient } from '../../../services/zmq-agent/ZmqAgentClient';

// Mock zeromq to avoid native socket connections
const mockPushSocket = {
  connect: jest.fn().mockResolvedValue(undefined),
  send: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
};

const mockSubSocket = {
  connect: jest.fn().mockResolvedValue(undefined),
  subscribe: jest.fn().mockResolvedValue(undefined),
  close: jest.fn().mockResolvedValue(undefined),
  [Symbol.asyncIterator]: jest.fn(),
};

jest.mock('zeromq', () => ({
  Push: jest.fn(() => mockPushSocket),
  Subscriber: jest.fn(() => mockSubSocket),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

describe('ZmqAgentClient', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constructor', () => {
    it('uses default host/ports when not specified', () => {
      const client = new ZmqAgentClient();
      expect(client).toBeDefined();
    });

    it('accepts custom host and ports', () => {
      const client = new ZmqAgentClient('agent-host', 6000, 6001);
      expect(client).toBeDefined();
    });
  });

  describe('onResponse / onReaction', () => {
    it('registers response handler', () => {
      const client = new ZmqAgentClient();
      const handler = jest.fn().mockResolvedValue(undefined);
      client.onResponse(handler);
    });

    it('registers reaction handler', () => {
      const client = new ZmqAgentClient();
      const handler = jest.fn().mockResolvedValue(undefined);
      client.onReaction(handler);
    });
  });

  describe('initialize', () => {
    it('connects PUSH and SUB sockets', async () => {
      const client = new ZmqAgentClient('localhost', 5560, 5561);
      await client.initialize();

      expect(mockPushSocket.connect).toHaveBeenCalledWith('tcp://localhost:5560');
      expect(mockSubSocket.connect).toHaveBeenCalledWith('tcp://localhost:5561');
      expect(mockSubSocket.subscribe).toHaveBeenCalledWith('');
    });

    it('throws when socket connection fails', async () => {
      mockPushSocket.connect.mockRejectedValueOnce(new Error('Connection refused'));
      const client = new ZmqAgentClient();

      await expect(client.initialize()).rejects.toThrow('Connection refused');
    });
  });

  describe('sendEvent', () => {
    it('sends JSON-serialized event via PUSH socket', async () => {
      const client = new ZmqAgentClient();
      await client.initialize();

      const event = { type: 'test', payload: 'data' };
      await client.sendEvent(event);

      expect(mockPushSocket.send).toHaveBeenCalledWith(JSON.stringify(event));
    });

    it('throws when PUSH socket is not initialized', async () => {
      const client = new ZmqAgentClient();

      await expect(client.sendEvent({ type: 'test' })).rejects.toThrow(
        'Agent PUSH socket not initialized'
      );
    });
  });

  describe('startListening', () => {
    it('does nothing when sub socket is not initialized', async () => {
      const client = new ZmqAgentClient();
      // Don't call initialize — subSocket is null
      await client.startListening();
    });

    it('processes valid agent:response messages', async () => {
      const client = new ZmqAgentClient();
      await client.initialize();

      const responseHandler = jest.fn().mockResolvedValue(undefined);
      client.onResponse(responseHandler);

      const validResponse = {
        type: 'agent:response',
        conversationId: 'conv-1',
        asUserId: 'user-1',
        content: 'Hello!',
        originalLanguage: 'fr',
        messageSource: 'agent',
        metadata: { agentType: 'impersonator', roleConfidence: 0.9 },
      };

      // Setup async iterator to yield one message then stop
      mockSubSocket[Symbol.asyncIterator] = jest.fn().mockReturnValue({
        next: jest.fn()
          .mockResolvedValueOnce({
            value: [Buffer.from(JSON.stringify(validResponse))],
            done: false,
          })
          .mockResolvedValueOnce({ value: undefined, done: true }),
        [Symbol.asyncIterator]() { return this; },
      });

      await client.startListening();
      expect(responseHandler).toHaveBeenCalledWith(validResponse);
    });

    it('processes valid agent:reaction messages', async () => {
      const client = new ZmqAgentClient();
      await client.initialize();

      const reactionHandler = jest.fn().mockResolvedValue(undefined);
      client.onReaction(reactionHandler);

      const validReaction = {
        type: 'agent:reaction',
        conversationId: 'conv-1',
        asUserId: 'user-1',
        targetMessageId: 'msg-1',
        emoji: '👍',
      };

      mockSubSocket[Symbol.asyncIterator] = jest.fn().mockReturnValue({
        next: jest.fn()
          .mockResolvedValueOnce({
            value: [Buffer.from(JSON.stringify(validReaction))],
            done: false,
          })
          .mockResolvedValueOnce({ value: undefined, done: true }),
        [Symbol.asyncIterator]() { return this; },
      });

      await client.startListening();
      expect(reactionHandler).toHaveBeenCalledWith(validReaction);
    });

    it('skips invalid messages that fail schema validation', async () => {
      const client = new ZmqAgentClient();
      await client.initialize();

      const responseHandler = jest.fn().mockResolvedValue(undefined);
      client.onResponse(responseHandler);

      const invalidMessage = { type: 'agent:response', conversationId: '' }; // missing required fields

      mockSubSocket[Symbol.asyncIterator] = jest.fn().mockReturnValue({
        next: jest.fn()
          .mockResolvedValueOnce({
            value: [Buffer.from(JSON.stringify(invalidMessage))],
            done: false,
          })
          .mockResolvedValueOnce({ value: undefined, done: true }),
        [Symbol.asyncIterator]() { return this; },
      });

      await client.startListening();
      expect(responseHandler).not.toHaveBeenCalled();
    });

    it('handles JSON parse errors gracefully', async () => {
      const client = new ZmqAgentClient();
      await client.initialize();

      mockSubSocket[Symbol.asyncIterator] = jest.fn().mockReturnValue({
        next: jest.fn()
          .mockResolvedValueOnce({
            value: [Buffer.from('not-valid-json{{{')],
            done: false,
          })
          .mockResolvedValueOnce({ value: undefined, done: true }),
        [Symbol.asyncIterator]() { return this; },
      });

      await expect(client.startListening()).resolves.not.toThrow();
    });
  });

  describe('close', () => {
    it('closes both sockets when initialized', async () => {
      const client = new ZmqAgentClient();
      await client.initialize();
      await client.close();

      expect(mockPushSocket.close).toHaveBeenCalled();
      expect(mockSubSocket.close).toHaveBeenCalled();
    });

    it('does not throw when sockets are not initialized', async () => {
      const client = new ZmqAgentClient();
      await expect(client.close()).resolves.not.toThrow();
    });

    it('handles errors during close gracefully', async () => {
      mockPushSocket.close.mockRejectedValueOnce(new Error('close error'));
      const client = new ZmqAgentClient();
      await client.initialize();
      await expect(client.close()).resolves.not.toThrow();
    });
  });
});
