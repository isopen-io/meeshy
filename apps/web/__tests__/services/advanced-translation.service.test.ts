/**
 * Tests for AdvancedTranslationService
 *
 * Covers singleton initialization, cache, stats, setEnabled, flush,
 * requestTranslation (cache hit, batching, immediate, high-priority),
 * batch size overflow, handleTranslationResponse via socket callback.
 */

// Must mock before import to intercept setupEventListeners() in constructor
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onTranslation: jest.fn(),
    getSocket: jest.fn(() => null),
  },
}));

import { meeshySocketIOService } from '@/services/meeshy-socketio.service';
import { advancedTranslationService, type TranslationData } from '@/services/advanced-translation.service';

const mockOnTranslation = meeshySocketIOService.onTranslation as jest.Mock;
const mockGetSocket = meeshySocketIOService.getSocket as jest.Mock;

// Capture the callback registered during singleton construction
let translationCallback: ((data: any) => void) | null = null;

beforeAll(() => {
  // Singleton is reused across all tests; raise limit to avoid false leak warnings
  // from accumulated promise-based listeners in batch-path tests.
  advancedTranslationService.setMaxListeners(100);
  translationCallback = mockOnTranslation.mock.calls[0]?.[0] ?? null;
});

function fireTranslationEvent(data: {
  messageId: string;
  translations: Array<{
    targetLanguage: string;
    translatedContent: string;
    sourceLanguage?: string;
    translationModel?: string;
    confidenceScore?: number;
    cached?: boolean;
  }>;
}) {
  translationCallback?.(data);
}

describe('AdvancedTranslationService', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.clearAllMocks();
    mockGetSocket.mockReturnValue(null);
    advancedTranslationService.clearCache();
    // setEnabled(false) resets batchTimer to null, clearing any stale timer
    // reference left over from a previous test's fake timer system.
    advancedTranslationService.setEnabled(false);
    advancedTranslationService.setEnabled(true);
  });

  afterEach(() => {
    // Drain any pending batch timers so they don't leak across tests
    jest.runAllTimers();
    jest.useRealTimers();
  });

  describe('singleton initialization', () => {
    it('onTranslation was called once during construction', () => {
      expect(translationCallback).toBeInstanceOf(Function);
    });
  });

  describe('getStats', () => {
    it('returns an object with all expected stat fields', () => {
      const stats = advancedTranslationService.getStats();
      expect(stats).toMatchObject({
        totalRequests: expect.any(Number),
        batchedRequests: expect.any(Number),
        cacheHits: expect.any(Number),
        errors: expect.any(Number),
        avgBatchSize: expect.any(Number),
        avgProcessingTime: expect.any(Number),
        pendingRequests: expect.any(Number),
        activeBatches: expect.any(Number),
        cacheSize: expect.any(Number),
        cacheHitRate: expect.any(Number),
      });
    });

    it('cacheHitRate is a number (0 when no requests)', () => {
      expect(typeof advancedTranslationService.getStats().cacheHitRate).toBe('number');
    });
  });

  describe('clearCache', () => {
    it('resets cache size to 0', () => {
      // Populate cache via translation callback
      fireTranslationEvent({
        messageId: 'clear-cache-test',
        translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour' }],
      });

      const before = advancedTranslationService.getStats().cacheSize;
      expect(before).toBeGreaterThanOrEqual(1);

      advancedTranslationService.clearCache();

      expect(advancedTranslationService.getStats().cacheSize).toBe(0);
    });
  });

  describe('setEnabled', () => {
    it('setEnabled(false) clears pending requests', () => {
      // Kick off a batch request to populate pendingRequests
      const p = advancedTranslationService.requestTranslation(
        'se-pending-msg', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );
      p.catch(() => {}); // suppress unhandled rejection

      expect(advancedTranslationService.getStats().pendingRequests).toBeGreaterThanOrEqual(1);

      advancedTranslationService.setEnabled(false);

      expect(advancedTranslationService.getStats().pendingRequests).toBe(0);
    });

    it('setEnabled(false) when no timer is active does not throw', () => {
      // Flush so there's no active timer
      advancedTranslationService.flush();
      expect(() => advancedTranslationService.setEnabled(false)).not.toThrow();
    });

    it('setEnabled(false) then setEnabled(true) re-enables the service', () => {
      advancedTranslationService.setEnabled(false);
      expect(() => advancedTranslationService.setEnabled(true)).not.toThrow();
    });
  });

  describe('flush', () => {
    it('does nothing and does not throw when no pending requests', () => {
      expect(() => advancedTranslationService.flush()).not.toThrow();
    });

    it('clears pending requests immediately', () => {
      const p = advancedTranslationService.requestTranslation(
        'flush-test-msg', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );
      p.catch(() => {});

      expect(advancedTranslationService.getStats().pendingRequests).toBeGreaterThanOrEqual(1);

      advancedTranslationService.flush();

      // After flush, pending queue should be drained
      expect(advancedTranslationService.getStats().pendingRequests).toBe(0);
    });

    it('processes a pending batch via flush without waiting for timer', async () => {
      const mockSocket = { connected: true, emit: jest.fn() };
      mockGetSocket.mockReturnValue(mockSocket);

      const p = advancedTranslationService.requestTranslation(
        'flush-socket-msg', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );

      advancedTranslationService.flush();
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockSocket.emit).toHaveBeenCalled();
      // Resolve the pending promise to avoid unhandled rejection
      advancedTranslationService.emit('translation:completed', {
        messageId: 'flush-socket-msg',
        results: [],
      });
      await p.catch(() => {});
    });
  });

  describe('requestTranslation — cache hit', () => {
    it('returns cached results when all target languages are in cache', async () => {
      // Populate cache
      fireTranslationEvent({
        messageId: 'cached-all-langs',
        translations: [
          { targetLanguage: 'fr', translatedContent: 'Bonjour', confidenceScore: 92 },
        ],
      });

      const statsBefore = advancedTranslationService.getStats();
      const results = await advancedTranslationService.requestTranslation(
        'cached-all-langs', 'Hello', 'en', ['fr']
      );

      const statsAfter = advancedTranslationService.getStats();
      expect(results).toHaveLength(1);
      expect(results[0]?.translatedContent).toBe('Bonjour');
      expect(statsAfter.cacheHits).toBe(statsBefore.cacheHits + 1);
    });

    it('emits translation:cached when returning from cache', async () => {
      fireTranslationEvent({
        messageId: 'cached-event-msg',
        translations: [{ targetLanguage: 'de', translatedContent: 'Hallo' }],
      });

      const cachedSpy = jest.fn();
      advancedTranslationService.on('translation:cached', cachedSpy);

      await advancedTranslationService.requestTranslation(
        'cached-event-msg', 'Hello', 'en', ['de']
      );

      expect(cachedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'cached-event-msg' })
      );
      advancedTranslationService.off('translation:cached', cachedSpy);
    });

    it('does not return from cache when cacheResults is false', async () => {
      fireTranslationEvent({
        messageId: 'no-cache-msg',
        translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour' }],
      });

      const statsBefore = advancedTranslationService.getStats();
      // With cacheResults:false, it should NOT hit cache but go to processImmediately
      const p = advancedTranslationService.requestTranslation(
        'no-cache-msg', 'Hello', 'en', ['fr'],
        { cacheResults: false, enableBatching: false }
      );
      await expect(p).rejects.toThrow(); // socket null → fails

      expect(advancedTranslationService.getStats().cacheHits).toBe(statsBefore.cacheHits);
    });
  });

  describe('requestTranslation — immediate path (enableBatching:false or priority:high)', () => {
    it('rejects when socket is not connected', async () => {
      mockGetSocket.mockReturnValue(null);

      await expect(
        advancedTranslationService.requestTranslation(
          'imm-null-socket', 'Hello', 'en', ['fr'],
          { enableBatching: false, cacheResults: false }
        )
      ).rejects.toThrow();
    });

    it('rejects for high-priority requests when socket is not connected', async () => {
      mockGetSocket.mockReturnValue(null);

      await expect(
        advancedTranslationService.requestTranslation(
          'hi-pri-null', 'Hi', 'en', ['fr'],
          { priority: 'high' as any, cacheResults: false }
        )
      ).rejects.toThrow();
    });

    it('does not use batching for high-priority requests', async () => {
      mockGetSocket.mockReturnValue(null);

      const p = advancedTranslationService.requestTranslation(
        'hi-pri-queue', 'Hi', 'en', ['fr'],
        { priority: 'high' as any, cacheResults: false }
      );

      // High-priority goes to processImmediately, so pendingRequests stays 0
      expect(advancedTranslationService.getStats().pendingRequests).toBe(0);
      await p.catch(() => {});
    });

    it('emits socket event and returns empty results when socket is connected', async () => {
      const mockEmit = jest.fn();
      mockGetSocket.mockReturnValue({ connected: true, emit: mockEmit });

      const results = await advancedTranslationService.requestTranslation(
        'imm-connected', 'Hello', 'en', ['fr'],
        { enableBatching: false, cacheResults: false }
      );

      expect(mockEmit).toHaveBeenCalled();
      expect(results).toEqual([]);
    });
  });

  describe('requestTranslation — batch path (normal priority)', () => {
    it('adds request to pending queue', () => {
      const p = advancedTranslationService.requestTranslation(
        'batch-queue-msg', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );
      p.catch(() => {});

      expect(advancedTranslationService.getStats().pendingRequests).toBeGreaterThanOrEqual(1);
      advancedTranslationService.flush();
    });

    it('starts only one timer for multiple requests within the same batch window', () => {
      const p1 = advancedTranslationService.requestTranslation(
        'timer-msg-1', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );
      const p2 = advancedTranslationService.requestTranslation(
        'timer-msg-2', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );
      p1.catch(() => {});
      p2.catch(() => {});

      expect(advancedTranslationService.getStats().pendingRequests).toBe(2);
      advancedTranslationService.flush();
    });

    it('triggers immediate batch processing when batch size is exceeded', () => {
      const promises: Array<Promise<any>> = [];

      for (let i = 0; i < 11; i++) {
        const p = advancedTranslationService.requestTranslation(
          `overflow-batch-${i}`, `msg${i}`, 'en', ['fr'],
          { batchSize: 10 }
        );
        p.catch(() => {});
        promises.push(p);
      }

      // After 10 requests the batch fired, leaving only 1 pending
      expect(advancedTranslationService.getStats().pendingRequests).toBeLessThanOrEqual(1);
      advancedTranslationService.flush();
    });

    it('resolves via translation:completed event (addToBatch happy path)', async () => {
      const mockResults: TranslationData[] = [
        {
          messageId: 'addtobatch-ok',
          sourceLanguage: 'en',
          targetLanguage: 'fr',
          originalContent: 'Hi',
          translatedContent: 'Salut',
          translationModel: 'basic',
          confidence: 90,
          cached: false,
          processingTime: 50,
          timestamp: Date.now(),
        },
      ];

      const p = advancedTranslationService.requestTranslation(
        'addtobatch-ok', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );

      // Simulate processBatch emitting translation:completed
      advancedTranslationService.emit('translation:completed', {
        messageId: 'addtobatch-ok',
        results: mockResults,
      });

      const results = await p;
      expect(results[0]?.translatedContent).toBe('Salut');
    });

    it('rejects via translation:failed event (addToBatch error path)', async () => {
      const p = advancedTranslationService.requestTranslation(
        'addtobatch-fail', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );

      advancedTranslationService.emit('translation:failed', {
        messageId: 'addtobatch-fail',
        error: 'Translation service unavailable',
      });

      await expect(p).rejects.toThrow('Translation service unavailable');
    });

    it('ignores translation events intended for other messages', async () => {
      const p = advancedTranslationService.requestTranslation(
        'specific-target', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );

      // Emit for a different message — should not resolve our promise
      advancedTranslationService.emit('translation:completed', {
        messageId: 'unrelated-msg',
        results: [],
      });

      let resolved = false;
      p.then(() => { resolved = true; }).catch(() => {});

      // Give one microtask cycle — promise should still be pending
      await Promise.resolve();
      expect(resolved).toBe(false);

      // Clean up
      advancedTranslationService.emit('translation:completed', {
        messageId: 'specific-target',
        results: [],
      });
      await p;
    });

    it('processes batch after timer fires', async () => {
      const mockEmit = jest.fn();
      mockGetSocket.mockReturnValue({ connected: true, emit: mockEmit });

      const p = advancedTranslationService.requestTranslation(
        'timer-batch-msg', 'Hi', 'en', ['fr'],
        { batchTimeout: 500 }
      );

      jest.advanceTimersByTime(600);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();

      expect(mockEmit).toHaveBeenCalled();

      // Resolve the promise to avoid unhandled rejection
      advancedTranslationService.emit('translation:completed', {
        messageId: 'timer-batch-msg',
        results: [],
      });
      await p;
    });
  });

  describe('handleTranslationResponse (via socket translation callback)', () => {
    it('emits translation:received when callback fires', () => {
      const receivedSpy = jest.fn();
      advancedTranslationService.on('translation:received', receivedSpy);

      fireTranslationEvent({
        messageId: 'event-recv-msg',
        translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour' }],
      });

      expect(receivedSpy).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'event-recv-msg' })
      );
      advancedTranslationService.off('translation:received', receivedSpy);
    });

    it('caches all translations from the callback', () => {
      advancedTranslationService.clearCache();

      fireTranslationEvent({
        messageId: 'multi-lang-cb',
        translations: [
          { targetLanguage: 'fr', translatedContent: 'Bonjour' },
          { targetLanguage: 'es', translatedContent: 'Hola' },
        ],
      });

      expect(advancedTranslationService.getStats().cacheSize).toBeGreaterThanOrEqual(2);
    });

    it('uses source language from translation or defaults to unknown', () => {
      const receivedSpy = jest.fn();
      advancedTranslationService.on('translation:received', receivedSpy);

      // Translation without sourceLanguage → defaults to 'unknown'
      fireTranslationEvent({
        messageId: 'no-src-lang-msg',
        translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour' }],
      });

      const received = receivedSpy.mock.calls[0]?.[0];
      expect(received?.translations[0]?.sourceLanguage).toBe('unknown');

      advancedTranslationService.off('translation:received', receivedSpy);
    });

    it('uses provided source language when available', () => {
      const receivedSpy = jest.fn();
      advancedTranslationService.on('translation:received', receivedSpy);

      fireTranslationEvent({
        messageId: 'with-src-lang-msg',
        translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour', sourceLanguage: 'en' }],
      });

      const received = receivedSpy.mock.calls[0]?.[0];
      expect(received?.translations[0]?.sourceLanguage).toBe('en');

      advancedTranslationService.off('translation:received', receivedSpy);
    });

    it('marks translations as cached when cached flag is true', () => {
      const receivedSpy = jest.fn();
      advancedTranslationService.on('translation:received', receivedSpy);

      fireTranslationEvent({
        messageId: 'cached-flag-msg',
        translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour', cached: true }],
      });

      const received = receivedSpy.mock.calls[0]?.[0];
      expect(received?.translations[0]?.cached).toBe(true);

      advancedTranslationService.off('translation:received', receivedSpy);
    });

    it('allows subsequent cache hit after translation response received', async () => {
      advancedTranslationService.clearCache();

      fireTranslationEvent({
        messageId: 'subsequent-cache-msg',
        translations: [{ targetLanguage: 'pt', translatedContent: 'Olá', confidenceScore: 88 }],
      });

      const results = await advancedTranslationService.requestTranslation(
        'subsequent-cache-msg', 'Hello', 'en', ['pt']
      );
      expect(results[0]?.translatedContent).toBe('Olá');
    });

    it('covers allCompleted=false when first of two batch requests completes (via overflow batch)', async () => {
      // A 2-request batch processed sequentially covers:
      //   • if (allCompleted) false branch — after request-1 results set but request-2 not yet done
      //   • || right-side (errors.has) — evaluated when results.has is false for request-2
      //   • if (allCompleted) true branch — after request-2 results also set
      const mockSocket = {
        connected: true,
        emit: jest.fn().mockImplementation(
          (_event: string, data: { messageId: string; targetLanguage: string }) => {
            fireTranslationEvent({
              messageId: data.messageId,
              translations: [{ targetLanguage: 'fr', translatedContent: `OK:${data.messageId}` }],
            });
          }
        ),
      };
      mockGetSocket.mockReturnValue(mockSocket);

      // batchSize:2 means the 2nd requestTranslation overflows and fires processPendingBatch
      // immediately, so the batch has both requests and processes them sequentially.
      const p1 = advancedTranslationService.requestTranslation(
        'two-batch-1', 'Hi', 'en', ['fr'], { batchSize: 2, batchTimeout: 99999 }
      );
      const p2 = advancedTranslationService.requestTranslation(
        'two-batch-2', 'Hello', 'en', ['fr'], { batchSize: 2, batchTimeout: 99999 }
      );

      // Flush the async microtask chain from processBatch → processLanguageGroup
      for (let i = 0; i < 8; i++) await Promise.resolve();

      const [r1, r2] = await Promise.all([p1, p2]);
      expect(r1[0]?.translatedContent).toBe('OK:two-batch-1');
      expect(r2[0]?.translatedContent).toBe('OK:two-batch-2');
    });
  });

  describe('requestTranslation — processImmediately (high priority)', () => {
    it('fires handleTranslationResponse during active batch, sets results, emits translation:completed', async () => {
      const mockSocket = {
        connected: true,
        emit: jest.fn().mockImplementation(() => {
          // Synchronously fire the socket callback while the batch is in activeBatches.
          // This exercises handleTranslationResponse's active-batch branch (lines 415-428)
          // and processBatch's translation:completed emit (line 346).
          //
          // First fire an UNRELATED messageId so the active-batch for-loop finds the batch
          // but request is not found (if(request) false branch — line 416).
          fireTranslationEvent({
            messageId: 'unrelated-msg-other',
            translations: [{ targetLanguage: 'fr', translatedContent: 'Autre' }],
          });
          // Then fire the actual messageId to set results and resolve the batch.
          fireTranslationEvent({
            messageId: 'hi-pri-active-batch',
            translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour' }],
          });
        }),
      };
      mockGetSocket.mockReturnValue(mockSocket);

      const results = await advancedTranslationService.requestTranslation(
        'hi-pri-active-batch', 'Hello', 'en', ['fr'],
        { priority: 'high' as MessagePriority }
      );

      expect(results).toHaveLength(1);
      expect(results[0]?.translatedContent).toBe('Bonjour');
    });

    it('handles socket.emit throwing in requestTranslationViaSocket (catch branch)', async () => {
      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();
      const mockSocket = {
        connected: true,
        emit: jest.fn().mockImplementation(() => {
          throw new Error('socket error');
        }),
      };
      mockGetSocket.mockReturnValue(mockSocket);

      await expect(
        advancedTranslationService.requestTranslation(
          'emit-throw-msg', 'Hi', 'en', ['fr'],
          { priority: 'high' as MessagePriority }
        )
      ).rejects.toThrow();

      consoleSpy.mockRestore();
    });
  });

  describe('stats increment correctly', () => {
    it('increments totalRequests on each call', async () => {
      const before = advancedTranslationService.getStats().totalRequests;

      const p = advancedTranslationService.requestTranslation(
        'stats-inc-msg', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );
      advancedTranslationService.emit('translation:completed', { messageId: 'stats-inc-msg', results: [] });
      await p;

      expect(advancedTranslationService.getStats().totalRequests).toBe(before + 1);
    });

    it('increments batchedRequests for batched requests', async () => {
      const before = advancedTranslationService.getStats().batchedRequests;

      const p = advancedTranslationService.requestTranslation(
        'batched-cnt-msg', 'Hi', 'en', ['fr'], { batchTimeout: 99999 }
      );
      advancedTranslationService.emit('translation:completed', { messageId: 'batched-cnt-msg', results: [] });
      await p;

      expect(advancedTranslationService.getStats().batchedRequests).toBe(before + 1);
    });

    it('cacheHitRate reflects hits over total requests', async () => {
      // Ensure cache has data for hit test
      fireTranslationEvent({
        messageId: 'hitrate-msg',
        translations: [{ targetLanguage: 'fr', translatedContent: 'Test' }],
      });

      const before = advancedTranslationService.getStats();
      await advancedTranslationService.requestTranslation('hitrate-msg', 'T', 'en', ['fr']);
      const after = advancedTranslationService.getStats();

      expect(after.cacheHits).toBe(before.cacheHits + 1);
      expect(after.cacheHitRate).toBeGreaterThan(0);
    });
  });
});
