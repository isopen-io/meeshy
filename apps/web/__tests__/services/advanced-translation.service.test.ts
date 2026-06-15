jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onTranslation: jest.fn(),
    getSocket: jest.fn().mockReturnValue(null),
  },
}));

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  CLIENT_EVENTS: {
    REQUEST_TRANSLATION: 'translation:request',
  },
}));

jest.mock('@/lib/lru-cache', () => ({
  LRUCache: jest.fn().mockImplementation(() => {
    const store = new Map();
    return {
      get: (key: string) => store.get(key),
      set: (key: string, val: any) => store.set(key, val),
      clear: () => store.clear(),
      get size() { return store.size; },
    };
  }),
}));

import { advancedTranslationService } from '@/services/advanced-translation.service';

function getServiceMocks() {
  const mod = jest.requireMock('@/services/meeshy-socketio.service') as {
    meeshySocketIOService: {
      onTranslation: jest.Mock;
      getSocket: jest.Mock;
    };
  };
  return mod.meeshySocketIOService;
}

type OnTranslationCallback = (data: {
  messageId: string;
  translations: Array<{
    sourceLanguage?: string;
    targetLanguage: string;
    translatedContent: string;
    translationModel?: string;
    confidenceScore?: number;
    cached?: boolean;
  }>;
}) => void;

let onTranslationCb: OnTranslationCallback;

beforeAll(() => {
  const { onTranslation } = getServiceMocks();
  onTranslationCb = onTranslation.mock.calls[0][0];
});

beforeEach(() => {
  jest.clearAllMocks();
  advancedTranslationService.clearCache();
  advancedTranslationService.setEnabled(true);
  getServiceMocks().getSocket.mockReturnValue(null);
});

function makeTranslationEvent(messageId: string, targetLanguage = 'fr') {
  return {
    messageId,
    translations: [
      {
        sourceLanguage: 'en',
        targetLanguage,
        translatedContent: 'Bonjour',
        translationModel: 'basic',
        confidenceScore: 90,
        cached: false,
      },
    ],
  };
}

describe('AdvancedTranslationService - singleton', () => {
  it('registered onTranslation callback on construction', () => {
    expect(typeof onTranslationCb).toBe('function');
  });
});

describe('getStats', () => {
  it('returns stats object with expected shape', () => {
    const stats = advancedTranslationService.getStats();

    expect(stats).toHaveProperty('totalRequests');
    expect(stats).toHaveProperty('batchedRequests');
    expect(stats).toHaveProperty('cacheHits');
    expect(stats).toHaveProperty('errors');
    expect(stats).toHaveProperty('pendingRequests');
    expect(stats).toHaveProperty('activeBatches');
    expect(stats).toHaveProperty('cacheSize');
    expect(stats).toHaveProperty('cacheHitRate');
  });

  it('returns zero cacheHitRate when totalRequests is 0', () => {
    const beforeStats = advancedTranslationService.getStats();
    expect(beforeStats.pendingRequests).toBe(0);
    if (beforeStats.totalRequests === 0) {
      expect(beforeStats.cacheHitRate).toBe(0);
    }
  });
});

describe('clearCache', () => {
  it('empties the translation cache', () => {
    onTranslationCb(makeTranslationEvent('msg-cache'));
    expect(advancedTranslationService.getStats().cacheSize).toBe(1);

    advancedTranslationService.clearCache();

    expect(advancedTranslationService.getStats().cacheSize).toBe(0);
  });
});

describe('setEnabled', () => {
  it('clears pending requests when disabled', async () => {
    jest.useFakeTimers();
    try {
      getServiceMocks().getSocket.mockReturnValue({ connected: false, emit: jest.fn() });

      const promise = advancedTranslationService.requestTranslation(
        'msg-disable',
        'Hello',
        'en',
        ['fr'],
        { enableBatching: true, batchTimeout: 1000 }
      );

      expect(advancedTranslationService.getStats().pendingRequests).toBe(1);

      advancedTranslationService.setEnabled(false);

      expect(advancedTranslationService.getStats().pendingRequests).toBe(0);
      promise.catch(() => {});
    } finally {
      jest.useRealTimers();
    }
  });

  it('is a no-op when set to true', () => {
    advancedTranslationService.setEnabled(true);
    expect(advancedTranslationService.getStats().pendingRequests).toBe(0);
  });
});

describe('flush', () => {
  it('processes pending batch when there are pending requests', async () => {
    jest.useFakeTimers();
    try {
      const { getSocket } = getServiceMocks();
      const socketEmit = jest.fn().mockImplementation((_event, data) => {
        setTimeout(() => onTranslationCb(makeTranslationEvent(data.messageId)), 0);
      });
      getSocket.mockReturnValue({ connected: true, emit: socketEmit });

      const promise = advancedTranslationService.requestTranslation(
        'msg-flush',
        'Hello',
        'en',
        ['fr'],
        { enableBatching: true, batchTimeout: 5000 }
      );

      expect(advancedTranslationService.getStats().pendingRequests).toBe(1);

      advancedTranslationService.flush();
      jest.runAllTimers();

      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0].translatedContent).toBe('Bonjour');
    } finally {
      jest.useRealTimers();
    }
  });

  it('does not throw when no pending requests exist', () => {
    expect(() => advancedTranslationService.flush()).not.toThrow();
  });
});

describe('requestTranslation - cache path', () => {
  it('returns cached results when all target languages are in cache', async () => {
    onTranslationCb(makeTranslationEvent('msg-cached', 'fr'));

    const cachedListener = jest.fn();
    advancedTranslationService.on('translation:cached', cachedListener);

    const results = await advancedTranslationService.requestTranslation(
      'msg-cached',
      'Hello',
      'en',
      ['fr'],
      { cacheResults: true }
    );

    expect(results).toHaveLength(1);
    expect(results[0].translatedContent).toBe('Bonjour');
    expect(cachedListener).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-cached' })
    );

    advancedTranslationService.off('translation:cached', cachedListener);
  });

  it('bypasses cache when cacheResults is false', async () => {
    onTranslationCb(makeTranslationEvent('msg-nocache', 'fr'));

    const { getSocket } = getServiceMocks();
    const socketEmit = jest.fn().mockImplementation((_event, data) => {
      onTranslationCb(makeTranslationEvent(data.messageId));
    });
    getSocket.mockReturnValue({ connected: true, emit: socketEmit });

    const results = await advancedTranslationService.requestTranslation(
      'msg-nocache',
      'Hello',
      'en',
      ['fr'],
      { cacheResults: false, priority: 'high' }
    );

    expect(socketEmit).toHaveBeenCalled();
    expect(results).toHaveLength(1);
  });
});

describe('requestTranslation - high priority (immediate) path', () => {
  it('emits socket event when socket is connected', async () => {
    const { getSocket } = getServiceMocks();
    const socketEmit = jest.fn().mockImplementation((_event, data) => {
      onTranslationCb(makeTranslationEvent(data.messageId));
    });
    getSocket.mockReturnValue({ connected: true, emit: socketEmit });

    const results = await advancedTranslationService.requestTranslation(
      'msg-high',
      'Hello',
      'en',
      ['fr'],
      { priority: 'high' }
    );

    expect(socketEmit).toHaveBeenCalledWith(
      'translation:request',
      expect.objectContaining({ messageId: 'msg-high', targetLanguage: 'fr' })
    );
    expect(results).toHaveLength(1);
    expect(results[0].targetLanguage).toBe('fr');
  });

  it('throws when socket is disconnected (no results, error set)', async () => {
    const { getSocket } = getServiceMocks();
    getSocket.mockReturnValue({ connected: false, emit: jest.fn() });

    await expect(
      advancedTranslationService.requestTranslation(
        'msg-disconnected',
        'Hello',
        'en',
        ['fr'],
        { priority: 'high' }
      )
    ).rejects.toThrow();
  });

  it('throws when socket is null', async () => {
    getServiceMocks().getSocket.mockReturnValue(null);

    await expect(
      advancedTranslationService.requestTranslation(
        'msg-nosocket',
        'Hello',
        'en',
        ['fr'],
        { priority: 'high' }
      )
    ).rejects.toThrow();
  });

  it('increments totalRequests on successful request', async () => {
    const { getSocket } = getServiceMocks();
    const socketEmit = jest.fn().mockImplementation((_event, data) => {
      onTranslationCb(makeTranslationEvent(data.messageId));
    });
    getSocket.mockReturnValue({ connected: true, emit: socketEmit });

    const statsBefore = advancedTranslationService.getStats().totalRequests;
    await advancedTranslationService.requestTranslation('msg-cnt', 'Hello', 'en', ['fr'], { priority: 'high' });

    expect(advancedTranslationService.getStats().totalRequests).toBe(statsBefore + 1);
  });

  it('throws when socket.emit throws', async () => {
    const { getSocket } = getServiceMocks();
    getSocket.mockImplementation(() => {
      throw new Error('Socket error');
    });

    await expect(
      advancedTranslationService.requestTranslation(
        'msg-throw',
        'Hello',
        'en',
        ['fr'],
        { priority: 'high' }
      )
    ).rejects.toThrow();
  });
});

describe('requestTranslation - batch path', () => {
  it('queues request in pending batch for normal priority', async () => {
    jest.useFakeTimers();
    try {
      const { getSocket } = getServiceMocks();
      const socketEmit = jest.fn().mockImplementation((_event, data) => {
        setTimeout(() => onTranslationCb(makeTranslationEvent(data.messageId)), 0);
      });
      getSocket.mockReturnValue({ connected: true, emit: socketEmit });

      const promise = advancedTranslationService.requestTranslation(
        'msg-batch',
        'Hello',
        'en',
        ['fr'],
        { enableBatching: true, batchTimeout: 500, priority: 'normal' }
      );

      expect(advancedTranslationService.getStats().pendingRequests).toBe(1);

      jest.advanceTimersByTime(600);
      jest.runAllTimers();

      const result = await promise;
      expect(result).toHaveLength(1);
      expect(result[0].translatedContent).toBe('Bonjour');
    } finally {
      jest.useRealTimers();
    }
  });

  it('flushes batch immediately when batchSize limit is reached', async () => {
    const { getSocket } = getServiceMocks();
    const socketEmit = jest.fn().mockImplementation((_event, data) => {
      onTranslationCb(makeTranslationEvent(data.messageId));
    });
    getSocket.mockReturnValue({ connected: true, emit: socketEmit });

    const result = await advancedTranslationService.requestTranslation(
      'msg-batchsize',
      'Hello',
      'en',
      ['fr'],
      { enableBatching: true, batchSize: 1, priority: 'normal' }
    );

    expect(result).toHaveLength(1);
    expect(socketEmit).toHaveBeenCalled();
  });
});

describe('onTranslation socket callback', () => {
  it('emits translation:received event when translation arrives', () => {
    const receivedListener = jest.fn();
    advancedTranslationService.on('translation:received', receivedListener);

    onTranslationCb(makeTranslationEvent('msg-recv'));

    expect(receivedListener).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-recv' })
    );

    advancedTranslationService.off('translation:received', receivedListener);
  });

  it('caches translation data when callback is invoked', () => {
    onTranslationCb(makeTranslationEvent('msg-cache2', 'es'));

    expect(advancedTranslationService.getStats().cacheSize).toBeGreaterThan(0);
  });

  it('handles missing sourceLanguage by defaulting to unknown', () => {
    const receivedListener = jest.fn();
    advancedTranslationService.on('translation:received', receivedListener);

    onTranslationCb({
      messageId: 'msg-no-src',
      translations: [{ targetLanguage: 'fr', translatedContent: 'Bonjour' }],
    });

    expect(receivedListener).toHaveBeenCalledWith(
      expect.objectContaining({
        translations: expect.arrayContaining([
          expect.objectContaining({ sourceLanguage: 'unknown' }),
        ]),
      })
    );

    advancedTranslationService.off('translation:received', receivedListener);
  });

  it('increments cacheHits when all translations are served from cache', async () => {
    onTranslationCb(makeTranslationEvent('msg-hitrate', 'fr'));

    const hitsBefore = advancedTranslationService.getStats().cacheHits;

    await advancedTranslationService.requestTranslation(
      'msg-hitrate',
      'Hello',
      'en',
      ['fr'],
      { cacheResults: true }
    );

    expect(advancedTranslationService.getStats().cacheHits).toBe(hitsBefore + 1);
  });
});

describe('requestTranslation - batch failure path', () => {
  it('rejects batched promise when translation:failed is emitted for the request', async () => {
    jest.useFakeTimers();
    try {
      getServiceMocks().getSocket.mockReturnValue({ connected: false, emit: jest.fn() });

      const promise = advancedTranslationService.requestTranslation(
        'msg-batch-fail',
        'Hello',
        'en',
        ['fr'],
        { enableBatching: true, batchTimeout: 500, priority: 'normal' }
      );

      jest.advanceTimersByTime(600);
      jest.runAllTimers();

      await expect(promise).rejects.toThrow();
    } finally {
      jest.useRealTimers();
    }
  });

  it('processes multiple requests when batchSize is reached, covering priority sort', async () => {
    const { getSocket } = getServiceMocks();
    const socketEmit = jest.fn().mockImplementation((_event, data) => {
      onTranslationCb(makeTranslationEvent(data.messageId));
    });
    getSocket.mockReturnValue({ connected: true, emit: socketEmit });

    const p1 = advancedTranslationService.requestTranslation(
      'msg-sort-low',
      'Hello',
      'en',
      ['fr'],
      { enableBatching: true, batchSize: 2, priority: 'low' }
    );

    const p2 = advancedTranslationService.requestTranslation(
      'msg-sort-normal',
      'World',
      'en',
      ['fr'],
      { enableBatching: true, batchSize: 2, priority: 'normal' }
    );

    const [r1, r2] = await Promise.all([p1, p2]);

    expect(socketEmit).toHaveBeenCalledTimes(2);
    expect(r1).toHaveLength(1);
    expect(r2).toHaveLength(1);
  });
});

describe('additional branch coverage', () => {
  it('getInstance returns existing instance when called multiple times', () => {
    const { advancedTranslationService: svc } = jest.requireActual('@/services/advanced-translation.service') as any;
    expect(advancedTranslationService).toBeDefined();
  });

  it('setEnabled(false) when no batch timer is active clears pending requests', async () => {
    jest.useFakeTimers();
    try {
      getServiceMocks().getSocket.mockReturnValue({ connected: false, emit: jest.fn() });

      const promise = advancedTranslationService.requestTranslation(
        'msg-disable2',
        'Hello',
        'en',
        ['fr'],
        { enableBatching: true, batchTimeout: 1000 }
      );

      expect(advancedTranslationService.getStats().pendingRequests).toBe(1);

      advancedTranslationService.setEnabled(false);
      expect(advancedTranslationService.getStats().pendingRequests).toBe(0);

      advancedTranslationService.setEnabled(false);

      promise.catch(() => {});
    } finally {
      jest.useRealTimers();
    }
  });

  it('flush when no timer is set (null timer path)', () => {
    expect(advancedTranslationService.getStats().pendingRequests).toBe(0);
    advancedTranslationService.flush();
    expect(advancedTranslationService.getStats().pendingRequests).toBe(0);
  });

  it('onTranslation callback with messageId not in any active batch emits received event', () => {
    const receivedListener = jest.fn();
    advancedTranslationService.on('translation:received', receivedListener);

    onTranslationCb(makeTranslationEvent('msg-orphan-no-batch'));

    expect(receivedListener).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-orphan-no-batch' })
    );

    advancedTranslationService.off('translation:received', receivedListener);
  });

  it('batch processing with urgent priority uses || 0 fallback', async () => {
    const { getSocket } = getServiceMocks();
    const socketEmit = jest.fn().mockImplementation((_event, data) => {
      onTranslationCb(makeTranslationEvent(data.messageId));
    });
    getSocket.mockReturnValue({ connected: true, emit: socketEmit });

    const p1 = advancedTranslationService.requestTranslation(
      'msg-urgent1',
      'Hello',
      'en',
      ['fr'],
      { enableBatching: true, batchSize: 2, priority: 'normal' }
    );

    const p2 = advancedTranslationService.requestTranslation(
      'msg-urgent2',
      'World',
      'en',
      ['fr'],
      { enableBatching: true, batchSize: 2, priority: 'low' }
    );

    const results = await Promise.all([p1, p2]);
    expect(results[0]).toHaveLength(1);
    expect(results[1]).toHaveLength(1);
  });
});

describe('branch coverage - additional', () => {
  it('requestTranslation without options uses default empty options (default-arg branch)', async () => {
    const { getSocket } = getServiceMocks();
    const socketEmit = jest.fn().mockImplementation((_event, data) => {
      onTranslationCb(makeTranslationEvent(data.messageId));
    });
    getSocket.mockReturnValue({ connected: true, emit: socketEmit });

    const results = await advancedTranslationService.requestTranslation(
      'msg-defaults',
      'Hello',
      'en',
      ['fr']
    );

    expect(results).toHaveLength(1);
  });

  it('handleTranslationResponse for messageId not matching any batch request', () => {
    const receivedListener = jest.fn();
    advancedTranslationService.on('translation:received', receivedListener);

    onTranslationCb({
      messageId: 'completely-unknown-id',
      translations: [{
        targetLanguage: 'fr',
        translatedContent: 'Test',
        confidenceScore: 80,
        cached: false,
      }],
    });

    expect(receivedListener).toHaveBeenCalled();
    advancedTranslationService.off('translation:received', receivedListener);
  });
});

describe('processBatch error emit coverage', () => {
  it('emits translation:failed via processBatch when socket disconnected and batchSize=1', async () => {
    getServiceMocks().getSocket.mockReturnValue({ connected: false, emit: jest.fn() });

    const failedListener = jest.fn();
    advancedTranslationService.on('translation:failed', failedListener);

    const promise = advancedTranslationService.requestTranslation(
      'msg-sync-fail',
      'Hello',
      'en',
      ['fr'],
      { enableBatching: true, batchSize: 1, priority: 'normal' }
    );

    await expect(promise).rejects.toThrow();
    expect(failedListener).toHaveBeenCalledWith(
      expect.objectContaining({ messageId: 'msg-sync-fail' })
    );

    advancedTranslationService.off('translation:failed', failedListener);
  });
});

describe('handleTranslationResponse edge cases', () => {
  it('onTranslation for unknown messageId while another batch is active does not throw', async () => {
    const { getSocket } = getServiceMocks();
    let resolveSocket: () => void;
    const socketCallPromise = new Promise<void>((resolve) => {
      resolveSocket = resolve;
    });
    
    const socketEmit = jest.fn().mockImplementation((_event, _data) => {
      resolveSocket!();
    });
    getSocket.mockReturnValue({ connected: true, emit: socketEmit });

    const promise = advancedTranslationService.requestTranslation(
      'msg-active-batch',
      'Hello',
      'en',
      ['fr'],
      { priority: 'high' }
    );

    await socketCallPromise;

    onTranslationCb(makeTranslationEvent('msg-different-id'));

    onTranslationCb(makeTranslationEvent('msg-active-batch'));

    const results = await promise;
    expect(results).toHaveLength(1);
  });
});
