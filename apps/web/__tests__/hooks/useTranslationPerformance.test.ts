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
    clearCache: (...args: unknown[]) => mockClearCache(...args),
    flush: (...args: unknown[]) => mockFlush(...args),
    getStats: (...args: unknown[]) => mockGetStats(...args),
    on: (...args: unknown[]) => mockOn(...args),
    off: (...args: unknown[]) => mockOff(...args),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useTranslationPerformance } from '@/hooks/use-translation-performance';

const makeStats = (overrides: Record<string, unknown> = {}) => ({
  totalRequests: 0,
  batchedRequests: 0,
  cacheHits: 0,
  errors: 0,
  avgBatchSize: 0,
  avgProcessingTime: 0,
  cacheHitRate: 0,
  pendingRequests: 0,
  activeBatches: 0,
  cacheSize: 0,
  ...overrides,
});

beforeEach(() => {
  jest.resetAllMocks();
  mockGetStats.mockReturnValue(makeStats());
  mockRequestTranslation.mockResolvedValue([]);
});

// ─── initial state ────────────────────────────────────────────────────────────

describe('initial state', () => {
  it('starts with empty requests Map', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.requests.size).toBe(0);
  });

  it('starts with isProcessing=false', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.isProcessing).toBe(false);
  });

  it('starts with hasErrors=false', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.hasErrors).toBe(false);
  });

  it('starts with zero metrics', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.metrics.totalRequests).toBe(0);
    expect(result.current.metrics.cacheHits).toBe(0);
  });
});

// ─── getBatchInfo ─────────────────────────────────────────────────────────────

describe('getBatchInfo', () => {
  it('returns default batch configuration', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    const info = result.current.getBatchInfo();
    expect(info.size).toBe(10);
    expect(info.timeout).toBe(500);
    expect(info.enabled).toBe(true);
  });

  it('returns custom batch configuration', () => {
    const { result } = renderHook(() =>
      useTranslationPerformance({ batchSize: 5, batchTimeout: 200, enableBatching: false })
    );
    const info = result.current.getBatchInfo();
    expect(info.size).toBe(5);
    expect(info.timeout).toBe(200);
    expect(info.enabled).toBe(false);
  });
});

// ─── getRequestStatus ─────────────────────────────────────────────────────────

describe('getRequestStatus', () => {
  it('returns null for unknown messageId', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.getRequestStatus('unknown')).toBeNull();
  });
});

// ─── getProcessingTime ───────────────────────────────────────────────────────

describe('getProcessingTime', () => {
  it('returns null for unknown messageId', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(result.current.getProcessingTime('unknown')).toBeNull();
  });
});

// ─── requestTranslation ───────────────────────────────────────────────────────

describe('requestTranslation', () => {
  it('calls advancedTranslationService.requestTranslation', async () => {
    mockRequestTranslation.mockResolvedValueOnce([{ language: 'fr', text: 'Bonjour' }]);
    const { result } = renderHook(() => useTranslationPerformance());

    await act(async () => {
      await result.current.requestTranslation('msg-1', 'Hello', 'en', ['fr']);
    });

    expect(mockRequestTranslation).toHaveBeenCalledWith(
      'msg-1', 'Hello', 'en', ['fr'], expect.any(Object)
    );
  });

  it('adds request to requests Map', async () => {
    const { result } = renderHook(() => useTranslationPerformance());

    await act(async () => {
      await result.current.requestTranslation('msg-2', 'Hi', 'en', ['fr']);
    });

    expect(result.current.requests.has('msg-2')).toBe(true);
  });

  it('sets request status to processing', async () => {
    let resolveFn!: (val: unknown) => void;
    mockRequestTranslation.mockReturnValueOnce(new Promise(r => { resolveFn = r; }));
    const { result } = renderHook(() => useTranslationPerformance());

    act(() => {
      void result.current.requestTranslation('msg-3', 'Hi', 'en', ['fr']);
    });

    expect(result.current.requests.get('msg-3')?.status).toBe('processing');
    await act(async () => { resolveFn([]); });
  });

  it('sets hasErrors=true on failure', async () => {
    mockRequestTranslation.mockRejectedValueOnce(new Error('translate error'));
    const { result } = renderHook(() => useTranslationPerformance());

    await act(async () => {
      try {
        await result.current.requestTranslation('msg-err', 'Hi', 'en', ['fr']);
      } catch {
        // expected
      }
    });

    expect(result.current.hasErrors).toBe(true);
    expect(result.current.requests.get('msg-err')?.status).toBe('error');
    expect(result.current.requests.get('msg-err')?.error).toBe('translate error');
  });

  it('throws on failure', async () => {
    mockRequestTranslation.mockRejectedValueOnce(new Error('fail'));
    const { result } = renderHook(() => useTranslationPerformance());

    await expect(
      act(async () => {
        await result.current.requestTranslation('msg-throw', 'Hi', 'en', ['fr']);
      })
    ).rejects.toThrow('fail');
  });
});

// ─── cancelRequest ────────────────────────────────────────────────────────────

describe('cancelRequest', () => {
  it('removes request from Map', async () => {
    const { result } = renderHook(() => useTranslationPerformance());

    await act(async () => {
      await result.current.requestTranslation('to-cancel', 'Hi', 'en', ['fr']);
    });

    expect(result.current.requests.has('to-cancel')).toBe(true);

    act(() => {
      result.current.cancelRequest('to-cancel');
    });

    expect(result.current.requests.has('to-cancel')).toBe(false);
  });

  it('does not throw for unknown id', () => {
    const { result } = renderHook(() => useTranslationPerformance());
    expect(() => {
      act(() => { result.current.cancelRequest('nonexistent'); });
    }).not.toThrow();
  });
});

// ─── clearErrors ─────────────────────────────────────────────────────────────

describe('clearErrors', () => {
  it('removes only error requests', async () => {
    mockRequestTranslation
      .mockResolvedValueOnce([])
      .mockRejectedValueOnce(new Error('bad'));

    const { result } = renderHook(() => useTranslationPerformance());

    await act(async () => {
      await result.current.requestTranslation('ok-msg', 'Hi', 'en', ['fr']);
    });

    await act(async () => {
      try {
        await result.current.requestTranslation('err-msg', 'Bye', 'en', ['fr']);
      } catch {
        // expected
      }
    });

    act(() => { result.current.clearErrors(); });

    expect(result.current.requests.has('ok-msg')).toBe(true);
    expect(result.current.requests.has('err-msg')).toBe(false);
    expect(result.current.hasErrors).toBe(false);
  });
});

// ─── retryRequest ─────────────────────────────────────────────────────────────

describe('retryRequest', () => {
  it('throws when request not found', async () => {
    const { result } = renderHook(() => useTranslationPerformance());

    await expect(
      act(async () => {
        await result.current.retryRequest('unknown-msg');
      })
    ).rejects.toThrow('non trouvée');
  });

  it('retries failed request', async () => {
    mockRequestTranslation
      .mockRejectedValueOnce(new Error('first fail'))
      .mockResolvedValueOnce([{ language: 'fr', text: 'Bonjour' }]);

    const { result } = renderHook(() => useTranslationPerformance());

    await act(async () => {
      try {
        await result.current.requestTranslation('retry-msg', 'Hello', 'en', ['fr']);
      } catch {
        // expected
      }
    });

    await act(async () => {
      await result.current.retryRequest('retry-msg');
    });

    expect(mockRequestTranslation).toHaveBeenCalledTimes(2);
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
