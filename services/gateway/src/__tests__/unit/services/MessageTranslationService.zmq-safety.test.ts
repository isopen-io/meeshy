/**
 * Tests for _safeZmqHandler error isolation.
 *
 * Verifies that when a ZMQ event handler rejects, the error is absorbed
 * internally and does NOT leak as an unhandled promise rejection that
 * could crash the Node.js process.
 *
 * WHY these tests exist: prior to the _safeZmqHandler wrapper, every
 * `this.zmqClient.on('event', async handler)` registration was a latent
 * crash waiting to happen — any async throw inside a handler became an
 * unhandled rejection because EventEmitter.emit() does not await listeners.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import { EventEmitter } from 'events';

type MockFn = jest.Mock<any>;

// ---------------------------------------------------------------------------
// ZMQ mock — must be declared before jest.mock hoisting
// ---------------------------------------------------------------------------
class MockZMQClient extends EventEmitter {
  sendTranslationRequest: MockFn = jest.fn();
  healthCheck: MockFn = jest.fn();
  close: MockFn = jest.fn();
  testReception: MockFn = jest.fn();

  removeAllListeners(event?: string | symbol): this {
    super.removeAllListeners(event);
    return this;
  }
}

const mockZmqClient = new MockZMQClient();

jest.mock('../../../services/ZmqSingleton', () => ({
  ZMQSingleton: {
    getInstance: jest.fn().mockResolvedValue(mockZmqClient)
  }
}));

jest.mock('fs', () => ({
  promises: {
    mkdir: jest.fn().mockResolvedValue(undefined),
    writeFile: jest.fn().mockResolvedValue(undefined),
    readFile: jest.fn().mockResolvedValue(Buffer.from('mock-audio')),
    unlink: jest.fn().mockResolvedValue(undefined),
    stat: jest.fn().mockResolvedValue({ size: 1024 })
  },
  existsSync: jest.fn().mockReturnValue(false),
  readFileSync: jest.fn()
}));

jest.mock('@meeshy/shared/types/attachment-audio', () => ({
  toSocketIOTranslation: jest.fn()
}));

// Import AFTER jest.mock calls
import { MessageTranslationService } from '../../../services/message-translation/MessageTranslationService';

const createMockPrisma = () => ({
  conversation: {
    findFirst: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  message: {
    findFirst: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn
  },
  messageTranslation: {
    findFirst: jest.fn() as MockFn,
    findMany: jest.fn() as MockFn,
    create: jest.fn() as MockFn,
    update: jest.fn() as MockFn,
    upsert: jest.fn() as MockFn,
    deleteMany: jest.fn() as MockFn
  },
  participant: {
    findMany: jest.fn() as MockFn,
    findUnique: jest.fn() as MockFn
  },
  userStats: { upsert: jest.fn() as MockFn }
});

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Wait for all pending microtasks and macrotasks to drain. */
const flushAsync = () => new Promise<void>(resolve => setImmediate(resolve));

describe('MessageTranslationService — _safeZmqHandler error isolation', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;
  let unhandledError: Error | null;
  let unhandledListener: NodeJS.UncaughtExceptionListener;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();

    unhandledError = null;
    unhandledListener = (err: Error) => {
      unhandledError = err;
    };
    process.on('unhandledRejection', unhandledListener);

    mockPrisma = createMockPrisma();
    translationService = new MessageTranslationService(mockPrisma as any);
    await translationService.initialize();
  });

  afterEach(() => {
    process.removeListener('unhandledRejection', unhandledListener);
    jest.clearAllMocks();
  });

  // -------------------------------------------------------------------------
  // Core isolation guarantee
  // -------------------------------------------------------------------------

  it('should NOT emit unhandledRejection when translationError handler throws', async () => {
    // _handleTranslationError has no top-level try/catch — a throw propagates
    // directly to _safeZmqHandler's .catch(), which is exactly what we want to verify.
    (translationService as any).stats.incrementErrors = () => {
      throw new Error('injected stats failure');
    };

    mockZmqClient.emit('translationError', {
      taskId: 'safe-task-1',
      messageId: 'safe-msg-1',
      error: 'translation failed',
      conversationId: 'safe-conv-1'
    });

    await flushAsync();

    expect(unhandledError).toBeNull();
  });

  it('should NOT emit unhandledRejection when voiceTranslationFailed handler throws', async () => {
    // _handleVoiceTranslationFailed has no try/catch either.
    (translationService as any).stats.incrementErrors = () => {
      throw new Error('injected stats failure');
    };

    mockZmqClient.emit('voiceTranslationFailed', {
      jobId: 'job-safe-1',
      status: 'failed',
      userId: 'user-safe-1',
      timestamp: 1000
    });

    await flushAsync();

    expect(unhandledError).toBeNull();
  });

  it('should NOT emit unhandledRejection when audioProcessError handler throws', async () => {
    // _handleAudioProcessError has no top-level try/catch.
    (translationService as any).stats.incrementErrors = () => {
      throw new Error('injected stats failure');
    };

    mockZmqClient.emit('audioProcessError', {
      taskId: 'safe-task-2',
      messageId: 'safe-msg-2',
      attachmentId: 'safe-att-1',
      error: 'audio failed',
      errorCode: 'AUDIO_ERR'
    });

    await flushAsync();

    expect(unhandledError).toBeNull();
  });

  // -------------------------------------------------------------------------
  // Happy-path: wrapper does not break working handlers
  // -------------------------------------------------------------------------

  it('should still deliver translationReady when handler succeeds', done => {
    mockPrisma.messageTranslation.upsert.mockResolvedValue({ id: 'trans-safe-1' });
    mockPrisma.message.findFirst.mockResolvedValue({ id: 'safe-msg-3', senderId: null });

    translationService.on('translationReady', () => done());

    mockZmqClient.emit('translationCompleted', {
      taskId: 'safe-task-3',
      result: {
        messageId: 'safe-msg-3',
        translatedText: 'Bonjour',
        sourceLanguage: 'en',
        targetLanguage: 'fr',
        confidenceScore: 0.95,
        processingTime: 10,
        modelType: 'basic'
      },
      targetLanguage: 'fr'
    });
  });

  it('should increment stats.errors when translationError handler runs without throwing', async () => {
    // Baseline: confirm the handler still functions correctly through the wrapper.
    const statsBefore = translationService.getStats().errors;

    mockZmqClient.emit('translationError', {
      taskId: 'safe-task-4',
      messageId: 'safe-msg-4',
      error: 'translation pool full',
      conversationId: 'safe-conv-4'
    });

    await flushAsync();

    expect(translationService.getStats().errors).toBe(statsBefore + 1);
    expect(unhandledError).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// translateTextDirectly listener hygiene
//
// WHY these tests exist: the REST direct-translate path attaches a
// `translationCompleted` + `translationError` listener pair to the SHARED
// (singleton) zmqClient per call, and detaches them only when a response with
// the matching taskId arrives. The 10s-timeout branch rejected without
// detaching, so every timed-out request leaked two listeners on the singleton
// forever — unbounded growth, a MaxListenersExceededWarning past the default
// limit, and stale closures firing on every subsequent translation event.
// ---------------------------------------------------------------------------

describe('MessageTranslationService — translateTextDirectly listener hygiene', () => {
  let translationService: MessageTranslationService;
  let mockPrisma: ReturnType<typeof createMockPrisma>;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockZmqClient.removeAllListeners();
    mockPrisma = createMockPrisma();
    translationService = new MessageTranslationService(mockPrisma as any);
    await translationService.initialize();
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.clearAllMocks();
  });

  const listenerCounts = () => ({
    completed: mockZmqClient.listenerCount('translationCompleted'),
    error: mockZmqClient.listenerCount('translationError')
  });

  it('detaches both listeners on the 10s timeout (no leak on the shared zmqClient)', async () => {
    jest.useFakeTimers();
    mockZmqClient.sendTranslationRequest.mockResolvedValue('leak-task-timeout');

    const before = listenerCounts();

    const pending = translationService.translateTextDirectly('hello', 'en', 'fr');

    // Let the awaited sendTranslationRequest resolve so the pair is attached.
    await jest.advanceTimersByTimeAsync(0);
    expect(listenerCounts()).toEqual({
      completed: before.completed + 1,
      error: before.error + 1
    });

    // Cross the 10s timeout — the promise resolves to the fallback result
    // (the outer catch swallows the timeout rejection).
    await jest.advanceTimersByTimeAsync(10_000);
    const result = await pending;
    expect(result.modelType).toBe('fallback');

    // The leak: without cleanup on the timeout branch these stay attached.
    expect(listenerCounts()).toEqual(before);
  });

  it('detaches both listeners on a successful response', async () => {
    mockZmqClient.sendTranslationRequest.mockResolvedValue('ok-task');
    const before = listenerCounts();

    const pending = translationService.translateTextDirectly('hi', 'en', 'es');
    await flushAsync();

    mockZmqClient.emit('translationCompleted', {
      taskId: 'ok-task',
      result: {
        messageId: 'ok-msg',
        translatedText: 'hola',
        sourceLanguage: 'en',
        targetLanguage: 'es',
        confidenceScore: 0.9,
        processingTime: 5,
        modelType: 'basic'
      },
      targetLanguage: 'es'
    });

    await expect(pending).resolves.toMatchObject({ translatedText: 'hola' });
    expect(listenerCounts()).toEqual(before);
  });

  it('detaches both listeners on a matching translationError', async () => {
    mockZmqClient.sendTranslationRequest.mockResolvedValue('err-task');
    const before = listenerCounts();

    const pending = translationService.translateTextDirectly('hi', 'en', 'de');
    await flushAsync();

    mockZmqClient.emit('translationError', {
      taskId: 'err-task',
      messageId: 'err-msg',
      error: 'model unavailable',
      conversationId: 'rest-request'
    });

    // The error rejects internally; the outer catch returns the fallback.
    const result = await pending;
    expect(result.modelType).toBe('fallback');
    expect(listenerCounts()).toEqual(before);
  });
});
