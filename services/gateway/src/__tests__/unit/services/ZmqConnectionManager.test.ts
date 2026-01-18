import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { ZmqConnectionManager, ConnectionManagerConfig } from '../../../services/zmq-translation/ZmqConnectionManager';
import * as zmq from 'zeromq';

// Mock zeromq
jest.mock('zeromq');

describe('ZmqConnectionManager', () => {
  let manager: ZmqConnectionManager;
  let mockPushSocket: any;
  let mockSubSocket: any;
  let mockContext: any;
  const config: ConnectionManagerConfig = {
    host: 'localhost',
    pushPort: 5555,
    subPort: 5556
  };

  beforeEach(() => {
    // Mock console methods to avoid test noise
    jest.spyOn(console, 'log').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});

    // Create mock sockets
    mockPushSocket = {
      connect: jest.fn(() => Promise.resolve()),
      send: jest.fn(() => Promise.resolve()),
      close: jest.fn(() => Promise.resolve())
    } as any;

    mockSubSocket = {
      connect: jest.fn(() => Promise.resolve()),
      subscribe: jest.fn(() => Promise.resolve()),
      receive: jest.fn(() => Promise.resolve([Buffer.from('test')])),
      close: jest.fn(() => Promise.resolve())
    } as any;

    mockContext = {};

    // Mock zmq module
    (zmq.Context as jest.MockedClass<typeof zmq.Context>) = jest.fn(() => mockContext) as any;
    (zmq.Push as jest.MockedClass<typeof zmq.Push>) = jest.fn(() => mockPushSocket) as any;
    (zmq.Subscriber as jest.MockedClass<typeof zmq.Subscriber>) = jest.fn(() => mockSubSocket) as any;

    manager = new ZmqConnectionManager(config);
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('constructor', () => {
    it('should create instance with provided config', () => {
      expect(manager).toBeDefined();
      expect(manager.getIsConnected()).toBe(false);
    });
  });

  describe('initialize', () => {
    it('should initialize ZMQ context and sockets successfully', async () => {
      await manager.initialize();

      expect(zmq.Context).toHaveBeenCalled();
      expect(zmq.Push).toHaveBeenCalled();
      expect(zmq.Subscriber).toHaveBeenCalled();
      expect(mockPushSocket.connect).toHaveBeenCalledWith(`tcp://${config.host}:${config.pushPort}`);
      expect(mockSubSocket.connect).toHaveBeenCalledWith(`tcp://${config.host}:${config.subPort}`);
      expect(mockSubSocket.subscribe).toHaveBeenCalledWith('');
      expect(manager.getIsConnected()).toBe(true);
    });

    it('should throw error when push socket connection fails', async () => {
      mockPushSocket.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(manager.initialize()).rejects.toThrow('Connection failed');
    });

    it('should throw error when sub socket connection fails', async () => {
      mockSubSocket.connect.mockRejectedValue(new Error('Connection failed'));

      await expect(manager.initialize()).rejects.toThrow('Connection failed');
    });

    it('should throw error when subscription fails', async () => {
      mockSubSocket.subscribe.mockRejectedValue(new Error('Subscribe failed'));

      await expect(manager.initialize()).rejects.toThrow('Subscribe failed');
    });
  });

  describe('send', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should send JSON payload successfully', async () => {
      const payload = { type: 'translate', text: 'Hello' };

      await manager.send(payload);

      expect(mockPushSocket.send).toHaveBeenCalledWith(JSON.stringify(payload));
    });

    it('should throw error when push socket is not initialized', async () => {
      const uninitializedManager = new ZmqConnectionManager(config);

      await expect(uninitializedManager.send({ test: 'data' })).rejects.toThrow('Socket PUSH non initialisé');
    });

    it('should throw error when send fails', async () => {
      mockPushSocket.send.mockRejectedValue(new Error('Send failed'));

      await expect(manager.send({ test: 'data' })).rejects.toThrow('Send failed');
    });

    it('should handle complex payloads', async () => {
      const complexPayload = {
        type: 'translate',
        data: {
          text: 'Hello',
          language: 'fr',
          metadata: { nested: { value: 123 } }
        }
      };

      await manager.send(complexPayload);

      expect(mockPushSocket.send).toHaveBeenCalledWith(JSON.stringify(complexPayload));
    });
  });

  describe('sendMultipart', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should send multipart message with JSON and binary frames', async () => {
      const jsonPayload = { type: 'audio_translate', format: 'wav' };
      const binaryFrames = [Buffer.from('audio data'), Buffer.from('metadata')];

      await manager.sendMultipart(jsonPayload, binaryFrames);

      expect(mockPushSocket.send).toHaveBeenCalled();
      const sentFrames = mockPushSocket.send.mock.calls[0][0];
      expect(Array.isArray(sentFrames)).toBe(true);
      expect(sentFrames.length).toBe(3); // JSON + 2 binary frames
    });

    it('should throw error when push socket is not initialized', async () => {
      const uninitializedManager = new ZmqConnectionManager(config);

      await expect(
        uninitializedManager.sendMultipart({ test: 'data' }, [Buffer.from('test')])
      ).rejects.toThrow('Socket PUSH non initialisé');
    });

    it('should handle empty binary frames array', async () => {
      const jsonPayload = { type: 'test' };
      const binaryFrames: Buffer[] = [];

      await manager.sendMultipart(jsonPayload, binaryFrames);

      const sentFrames = mockPushSocket.send.mock.calls[0][0];
      expect(sentFrames.length).toBe(1); // Only JSON frame
    });

    it('should handle single binary frame', async () => {
      const jsonPayload = { type: 'test' };
      const binaryFrames = [Buffer.from('single frame')];

      await manager.sendMultipart(jsonPayload, binaryFrames);

      const sentFrames = mockPushSocket.send.mock.calls[0][0];
      expect(sentFrames.length).toBe(2);
    });

    it('should handle large binary frames', async () => {
      const jsonPayload = { type: 'test' };
      const largeBinary = Buffer.alloc(1024 * 1024); // 1MB
      const binaryFrames = [largeBinary];

      await manager.sendMultipart(jsonPayload, binaryFrames);

      expect(mockPushSocket.send).toHaveBeenCalled();
    });
  });

  describe('receive', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should receive single frame message', async () => {
      const testBuffer = Buffer.from('test message');
      mockSubSocket.receive.mockResolvedValue([testBuffer]);

      const result = await manager.receive();

      expect(result).toEqual(testBuffer);
    });

    it('should receive multipart message', async () => {
      const frame1 = Buffer.from('frame1');
      const frame2 = Buffer.from('frame2');
      mockSubSocket.receive.mockResolvedValue([frame1, frame2]);

      const result = await manager.receive();

      expect(Array.isArray(result)).toBe(true);
      expect((result as Buffer[]).length).toBe(2);
    });

    it('should throw error when sub socket is not initialized', async () => {
      const uninitializedManager = new ZmqConnectionManager(config);

      await expect(uninitializedManager.receive()).rejects.toThrow('Socket SUB non initialisé');
    });

    it('should throw error when no message available', async () => {
      mockSubSocket.receive.mockResolvedValue([]);

      await expect(manager.receive()).rejects.toThrow('No message available');
    });

    it('should throw error when receive returns null', async () => {
      mockSubSocket.receive.mockResolvedValue(null);

      await expect(manager.receive()).rejects.toThrow('No message available');
    });
  });

  describe('getIsConnected', () => {
    it('should return false before initialization', () => {
      expect(manager.getIsConnected()).toBe(false);
    });

    it('should return true after successful initialization', async () => {
      await manager.initialize();
      expect(manager.getIsConnected()).toBe(true);
    });

    it('should return false after close', async () => {
      await manager.initialize();
      await manager.close();
      expect(manager.getIsConnected()).toBe(false);
    });
  });

  describe('sendPing', () => {
    beforeEach(async () => {
      await manager.initialize();
    });

    it('should send ping message successfully', async () => {
      await manager.sendPing();

      expect(mockPushSocket.send).toHaveBeenCalled();
      const sentMessage = JSON.parse(mockPushSocket.send.mock.calls[0][0]);
      expect(sentMessage.type).toBe('ping');
      expect(sentMessage.timestamp).toBeDefined();
    });

    it('should throw error when push socket is not initialized', async () => {
      const uninitializedManager = new ZmqConnectionManager(config);

      await expect(uninitializedManager.sendPing()).rejects.toThrow('Socket PUSH non initialisé');
    });

    it('should include current timestamp in ping', async () => {
      const beforePing = Date.now();
      await manager.sendPing();
      const afterPing = Date.now();

      const sentMessage = JSON.parse(mockPushSocket.send.mock.calls[0][0]);
      expect(sentMessage.timestamp).toBeGreaterThanOrEqual(beforePing);
      expect(sentMessage.timestamp).toBeLessThanOrEqual(afterPing);
    });
  });

  describe('close', () => {
    it('should close all sockets and clean up resources', async () => {
      await manager.initialize();
      await manager.close();

      expect(mockPushSocket.close).toHaveBeenCalled();
      expect(mockSubSocket.close).toHaveBeenCalled();
      expect(manager.getIsConnected()).toBe(false);
    });

    it('should handle close when not initialized', async () => {
      await expect(manager.close()).resolves.not.toThrow();
    });

    it('should handle errors during close gracefully', async () => {
      await manager.initialize();
      mockPushSocket.close.mockRejectedValue(new Error('Close failed'));

      await expect(manager.close()).resolves.not.toThrow();
      expect(manager.getIsConnected()).toBe(false);
    });

    it('should set sockets to null after closing', async () => {
      await manager.initialize();
      await manager.close();

      const sockets = manager.getSockets();
      expect(sockets.pushSocket).toBeNull();
      expect(sockets.subSocket).toBeNull();
    });
  });

  describe('getSockets', () => {
    it('should return null sockets before initialization', () => {
      const sockets = manager.getSockets();

      expect(sockets.pushSocket).toBeNull();
      expect(sockets.subSocket).toBeNull();
    });

    it('should return initialized sockets after initialization', async () => {
      await manager.initialize();
      const sockets = manager.getSockets();

      expect(sockets.pushSocket).toBe(mockPushSocket);
      expect(sockets.subSocket).toBe(mockSubSocket);
    });

    it('should return null sockets after close', async () => {
      await manager.initialize();
      await manager.close();
      const sockets = manager.getSockets();

      expect(sockets.pushSocket).toBeNull();
      expect(sockets.subSocket).toBeNull();
    });
  });

  describe('integration scenarios', () => {
    it('should handle complete initialization, send, receive, close workflow', async () => {
      // Initialize
      await manager.initialize();
      expect(manager.getIsConnected()).toBe(true);

      // Send
      await manager.send({ type: 'test', data: 'hello' });
      expect(mockPushSocket.send).toHaveBeenCalled();

      // Receive
      const testBuffer = Buffer.from('response');
      mockSubSocket.receive.mockResolvedValue([testBuffer]);
      const response = await manager.receive();
      expect(response).toEqual(testBuffer);

      // Close
      await manager.close();
      expect(manager.getIsConnected()).toBe(false);
    });

    it('should handle multiple send/receive cycles', async () => {
      await manager.initialize();

      for (let i = 0; i < 10; i++) {
        await manager.send({ type: 'test', index: i });
        mockSubSocket.receive.mockResolvedValue([Buffer.from(`response-${i}`)]);
        await manager.receive();
      }

      expect(mockPushSocket.send).toHaveBeenCalledTimes(10);
    });

    it('should maintain connection state through operations', async () => {
      await manager.initialize();
      expect(manager.getIsConnected()).toBe(true);

      await manager.send({ type: 'test' });
      expect(manager.getIsConnected()).toBe(true);

      await manager.sendPing();
      expect(manager.getIsConnected()).toBe(true);

      mockSubSocket.receive.mockResolvedValue([Buffer.from('test')]);
      await manager.receive();
      expect(manager.getIsConnected()).toBe(true);
    });
  });

  describe('error handling', () => {
    it('should throw meaningful error for uninitialized send', async () => {
      await expect(manager.send({ test: 'data' })).rejects.toThrow('Socket PUSH non initialisé');
    });

    it('should throw meaningful error for uninitialized sendMultipart', async () => {
      await expect(
        manager.sendMultipart({ test: 'data' }, [Buffer.from('test')])
      ).rejects.toThrow('Socket PUSH non initialisé');
    });

    it('should throw meaningful error for uninitialized receive', async () => {
      await expect(manager.receive()).rejects.toThrow('Socket SUB non initialisé');
    });

    it('should throw meaningful error for uninitialized sendPing', async () => {
      await expect(manager.sendPing()).rejects.toThrow('Socket PUSH non initialisé');
    });
  });
});
