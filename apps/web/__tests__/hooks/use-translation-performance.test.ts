/**
 * Tests for hooks/use-translation-performance.ts
 */

const mockRequestTranslation = jest.fn();
const mockClearCache = jest.fn();
const mockFlush = jest.fn();
const mockGetStats = jest.fn();
const mockOn = jest.fn();
const mockOff = jest.fn();

jest.mock('@/services/advanced-translation.service', () => ({
  advancedTranslationService: {
    requestTranslation: (...args: unknown[]) => mockRequestTranslation(...args),
    clearCache: () => mockClearCache(),
    flush: () => mockFlush(),
    getStats: () => mockGetStats(),
    on: (...args: unknown[]) => mockOn(...args),
    off: (...args: unknown[]) => mockOff(...args),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useTranslationPerformance } from '@/hooks/use-translation-performance';

const defaultMetrics = {
  totalRequests: 0, batchedRequests: 0, cacheHits: 0, errors: 0,
  avgBatchSize: 0, avgProcessingTime: 0, cacheHitRate: 0,
  pendingRequests: 0, activeBatches: 0, cacheSize: 0,
};

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGetStats.mockReturnValue(defaultMetrics);
  mockRequestTranslation.mockResolvedValue([]);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('requests map is empty', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.requests.size).toBe(0);
  });

  it('isProcessing starts false', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.isProcessing).toBe(false);
  });

  it('hasErrors starts false', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.hasErrors).toBe(false);
  });

  it('registers three event listeners on mount', () => {
    renderHook(() => useTranslationPerformance());
    expect(mockOn).toHaveBeenCalledWith('translation:completed', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('translation:failed', expect.any(Function));
    expect(mockOn).toHaveBeenCalledWith('translation:cached', expect.any(Function));
  });

  it('unregisters event listeners on unmount', () => {
    const { unmount } = renderHook(() => useTranslationPerformance());
    unmount();
    expect(mockOff).toHaveBeenCalledWith('translation:completed', expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith('translation:failed', expect.any(Function));
    expect(mockOff).toHaveBeenCalledWith('translation:cached', expect.any(Function));
  });

  it('clears metrics interval on unmount', () => {
    const clearIntervalSpy = jest.spyOn(global, 'clearInterval');
    const { unmount } = renderHook(() => useTranslationPerformance({ trackMetrics: true }));
    unmount();
    expect(clearIntervalSpy).toHaveBeenCalled();
    clearIntervalSpy.mockRestore();
  });
});

// ─── requestTranslation ───────────────────────────────────────────────────────

describe('requestTranslation', () => {
  it('adds request to the requests map', async () => {
    mockRequestTranslation.mockResolvedValue([{ targetLanguage: 'fr', translatedContent: 'Bonjour' }]);
    const { result } = renderHook(() => useTranslationPerformance());
    await act(async () => {
      await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr']);
    });
    expect(result.current.requests.has('msg-1')).toBe(true);
  });

  it('calls advancedTranslationService.requestTranslation with correct args', async () => {
    mockRequestTranslation.mockResolvedValue([]);
    const { result } = renderHook(() => useTranslationPerformance());
    await act(async () => {
      await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr', 'de']);
    });
    expect(mockRequestTranslation).toHaveBeenCalledWith(
      'msg-1', 'Hello', 'en', ['fr', 'de'], expect.any(Object)
    );
  });

  it('returns translation results', async () => {
    const results = [{ targetLanguage: 'fr', translatedContent: 'Bonjour' }];
    mockRequestTranslation.mockResolvedValue(results);
    const { result } = renderHook(() => useTranslationPerformance());
    let returnValue: any;
    await act(async () => {
      returnValue = await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr']);
    });
    expect(returnValue).toEqual(results);
  });

  it('sets request status=error and rethrows on failure', async () => {
    mockRequestTranslation.mockRejectedValue(new Error('service error'));
    const { result } = renderHook(() => useTranslationPerformance());
    let caughtError: Error | undefined;
    await act(async () => {
      try {
        await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr']);
      } catch (e) {
        caughtError = e as Error;
      }
    });
    expect(caughtError?.message).toBe('service error');
    expect(result.current.requests.get('msg-1')?.status).toBe('error');
  });

  it('passes through custom options to the service', async () => {
    mockRequestTranslation.mockResolvedValue([]);
    const { result } = renderHook(() => useTranslationPerformance());
    await act(async () => {
      await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr'], { priority: 'high' });
    });
    expect(mockRequestTranslation).toHaveBeenCalledWith(
      'msg-1', 'Hello', 'en', ['fr'],
      expect.objectContaining({ priority: 'high' })
    );
  });
});

// ─── getRequestStatus ─────────────────────────────────────────────────────────

describe('getRequestStatus', () => {
  it('returns null for unknown messageId', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.getRequestStatus('unknown')).toBeNull();
  });

  it('returns request status after requesting', async () => {
    mockRequestTranslation.mockResolvedValue([]);
    const { result } = renderHook(() => useTranslationPerformance());
    await act(async () => {
      await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr']);
    });
    const status = result.current.getRequestStatus('msg-1');
    expect(['pending', 'processing', 'completed', 'error', 'cached']).toContain(status);
  });
});

// ─── cancelRequest ────────────────────────────────────────────────────────────

describe('cancelRequest', () => {
  it('removes request from the map', async () => {
    mockRequestTranslation.mockResolvedValue([]);
    const { result } = renderHook(() => useTranslationPerformance());
    await act(async () => {
      await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr']);
    });
    act(() => { result.current.cancelRequest('msg-1'); });
    expect(result.current.requests.has('msg-1')).toBe(false);
  });
});

// ─── clearErrors ──────────────────────────────────────────────────────────────

describe('clearErrors', () => {
  it('removes only error requests', async () => {
    mockRequestTranslation
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('fail'));

    const { result } = renderHook(() => useTranslationPerformance());

    await act(async () => {
      await result.current.requestTranslation('msg-ok', 'Hi', 'en', ['fr']);
    });
    await act(async () => {
      try { await result.current.requestTranslation('msg-err', 'Hi', 'en', ['fr']); }
      catch {}
    });

    act(() => { result.current.clearErrors(); });
    expect(result.current.requests.has('msg-ok')).toBe(true);
    expect(result.current.requests.has('msg-err')).toBe(false);
  });
});

// ─── clearCache ───────────────────────────────────────────────────────────────

describe('clearCache', () => {
  it('calls advancedTranslationService.clearCache', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    act(() => { result.current.clearCache(); });
    expect(mockClearCache).toHaveBeenCalled();
  });
});

// ─── flushBatches ─────────────────────────────────────────────────────────────

describe('flushBatches', () => {
  it('calls advancedTranslationService.flush', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    act(() => { result.current.flushBatches(); });
    expect(mockFlush).toHaveBeenCalled();
  });
});

// ─── getBatchInfo ─────────────────────────────────────────────────────────────

describe('getBatchInfo', () => {
  it('returns default batchSize=10, batchTimeout=500, enabled=true', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.getBatchInfo()).toEqual({
      size: 10,
      timeout: 500,
      enabled: true,
    });
  });

  it('reflects custom options', () => {
    const { result } = renderHook(() =>
      useTranslationPerformance({ batchSize: 5, batchTimeout: 250, enableBatching: false })
    );
    expect(result.current.getBatchInfo()).toEqual({
      size: 5,
      timeout: 250,
      enabled: false,
    });
  });
});

// ─── retryRequest ─────────────────────────────────────────────────────────────

describe('retryRequest', () => {
  it('throws when messageId not found', async () => {
    const { result } = renderHook(() => useTranslationPerformance());
    await expect(
      act(async () => { await result.current.retryRequest('nonexistent'); })
    ).rejects.toThrow('non trouvée');
  });

  it('throws when max retries exceeded', async () => {
    mockRequestTranslation.mockRejectedValue(new Error('fail'));
    const { result } = renderHook(() => useTranslationPerformance({ maxRetries: 1 }));
    try {
      await act(async () => {
        await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr']);
      });
    } catch {}

    mockRequestTranslation.mockResolvedValue([]);
    // First retry — should succeed
    await act(async () => { await result.current.retryRequest('msg-1'); });

    // Second retry exceeds maxRetries=1
    await expect(
      act(async () => { await result.current.retryRequest('msg-1'); })
    ).rejects.toThrow('maximum');
  });
});
