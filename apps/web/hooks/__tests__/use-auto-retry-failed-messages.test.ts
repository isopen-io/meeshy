import { act, renderHook } from '@testing-library/react';

const mockUseConnectionStatus = jest.fn();
jest.mock('@/hooks/use-connection-status', () => ({
  useConnectionStatus: () => mockUseConnectionStatus(),
}));

const mockGetState = jest.fn();
jest.mock('@/stores/failed-messages-store', () => ({
  useFailedMessagesStore: { getState: () => mockGetState() },
}));

const mockSendMessage = jest.fn();
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  },
}));

import { useAutoRetryFailedMessages } from '../use-auto-retry-failed-messages';

/**
 * The real `meeshySocketIOService.sendMessage` resolves with a
 * `MessageAckResponse` and NEVER rejects: every failure path — socket absent,
 * ack timeout, orchestrator queue full/expired, encryption failure, server
 * error — returns `{ success: false }`. These helpers pin the tests to that
 * contract; mocking failure as a rejection (as an earlier revision did) exercises
 * a branch the service cannot reach.
 */
const ackOk = (messageId = 'srv-1') => ({ success: true, messageId });
const ackFailed = () => ({ success: false });
const ackTimedOut = () => ({ success: false, timedOut: true });

/** Connection readiness, the single trigger the hook subscribes to. */
function connection(overrides: Partial<{ isOnline: boolean; isSocketConnected: boolean }> = {}) {
  const isOnline = overrides.isOnline ?? true;
  const isSocketConnected = overrides.isSocketConnected ?? true;
  return {
    isOnline,
    isSocketConnected,
    hasSocket: isSocketConnected,
    isReady: isOnline && isSocketConnected,
  };
}

function makeFailedMessage(overrides: Partial<{
  id: string;
  conversationId: string;
  content: string;
  originalLanguage: string;
  attachmentIds: string[];
  replyToId: string | undefined;
  clientMessageId: string | undefined;
  retryCount: number;
  error: string;
  timestamp: number;
}> = {}) {
  return {
    id: 'msg-1',
    conversationId: 'conv-1',
    content: 'hello',
    originalLanguage: 'en',
    attachmentIds: [],
    replyToId: undefined,
    clientMessageId: 'cid-msg-1',
    retryCount: 0,
    error: 'Network error',
    timestamp: Date.now(),
    ...overrides,
  };
}

function makeStore(failedMessages: ReturnType<typeof makeFailedMessage>[] = []) {
  return {
    failedMessages,
    incrementRetryCount: jest.fn(),
    removeFailedMessage: jest.fn(),
    updateFailedMessage: jest.fn(),
  };
}

/**
 * `makeStore` freezes a snapshot: its actions record calls without ever changing
 * `failedMessages`, so a test written against it cannot observe what a SECOND
 * sweep of the queue would see. This one mirrors the real zustand store —
 * immutable updates that replace the entry — which is what makes the retry
 * budget, and work queued mid-sweep, observable at all.
 */
function makeLiveStore(initial: ReturnType<typeof makeFailedMessage>[] = []) {
  const store = {
    failedMessages: initial,
    incrementRetryCount: jest.fn((id: string) => {
      store.failedMessages = store.failedMessages.map(
        (m) => (m.id === id ? { ...m, retryCount: m.retryCount + 1 } : m),
      );
    }),
    removeFailedMessage: jest.fn((id: string) => {
      store.failedMessages = store.failedMessages.filter((m) => m.id !== id);
    }),
    updateFailedMessage: jest.fn((id: string, updates: Record<string, unknown>) => {
      store.failedMessages = store.failedMessages.map(
        (m) => (m.id === id ? { ...m, ...updates } : m),
      );
    }),
    enqueue: (message: ReturnType<typeof makeFailedMessage>) => {
      store.failedMessages = [...store.failedMessages, message];
    },
  };
  return store;
}

/**
 * Drives the hook to a standstill. A sweep that re-arms does so from an async
 * callback: React only picks the update up when `act` flushes, and the fresh
 * sweep it schedules is a timer that did not exist during the previous advance.
 * One advance can therefore only ever observe one sweep — alternating flush and
 * advance is what lets the queue run to completion.
 */
async function settle(rounds = 8) {
  for (let i = 0; i < rounds; i += 1) {
    await act(async () => { await jest.advanceTimersByTimeAsync(5_000); });
  }
}

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockUseConnectionStatus.mockReturnValue(connection());
  mockSendMessage.mockResolvedValue(ackOk());
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAutoRetryFailedMessages', () => {
  it('does not retry when offline', () => {
    mockUseConnectionStatus.mockReturnValue(connection({ isOnline: false, isSocketConnected: false }));
    const store = makeStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    jest.advanceTimersByTime(5000);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not retry when no failed messages', () => {
    const store = makeStore([]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    jest.advanceTimersByTime(5000);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not retry when the socket is not connected yet', () => {
    mockUseConnectionStatus.mockReturnValue(connection({ isSocketConnected: false }));
    const store = makeStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    jest.advanceTimersByTime(5000);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('retries failed messages sequentially when online and connected', async () => {
    const msg1 = makeFailedMessage({ id: 'msg-1', content: 'first', clientMessageId: 'cid-1' });
    const msg2 = makeFailedMessage({ id: 'msg-2', content: 'second', clientMessageId: 'cid-2' });
    const store = makeStore([msg1, msg2]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    // Advance past the initial delay
    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'first', 'en', undefined, undefined, undefined, undefined, 'cid-1',
    );
    expect(store.incrementRetryCount).toHaveBeenCalledWith('msg-1');

    // Advance past the inter-message delay
    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'second', 'en', undefined, undefined, undefined, undefined, 'cid-2',
    );
    expect(store.incrementRetryCount).toHaveBeenCalledWith('msg-2');
  });

  it('reuses the original clientMessageId so the gateway can dedup a retried send', async () => {
    const msg = makeFailedMessage({ clientMessageId: 'cid-original' });
    const store = makeStore([msg]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'hello', 'en', undefined, undefined, undefined, undefined, 'cid-original',
    );
  });

  it('forwards an undefined clientMessageId for pre-Phase-4 entries lacking the field', async () => {
    const msg = makeFailedMessage({ clientMessageId: undefined });
    const store = makeStore([msg]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'hello', 'en', undefined, undefined, undefined, undefined, undefined,
    );
  });

  it('removes message from store when the ack reports success', async () => {
    const store = makeStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(store.removeFailedMessage).toHaveBeenCalledWith('msg-1');
  });

  it('stops retrying after MAX_RETRY_COUNT (3)', () => {
    const store = makeStore([makeFailedMessage({ retryCount: 3 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    jest.advanceTimersByTime(5000);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('uses null-safe attachmentIds check', async () => {
    const msg = makeFailedMessage({ attachmentIds: ['att-1', 'att-2'] });
    const store = makeStore([msg]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'hello', 'en', undefined, undefined, ['att-1', 'att-2'], undefined, 'cid-msg-1',
    );
  });

  it('passes undefined for empty attachmentIds', async () => {
    const msg = makeFailedMessage({ attachmentIds: [] });
    const store = makeStore([msg]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'hello', 'en', undefined, undefined, undefined, undefined, 'cid-msg-1',
    );
  });

  // ---------------------------------------------------------------------------
  // D1 — a `{ success: false }` ack is a FAILURE, not a success.
  // ---------------------------------------------------------------------------

  it('keeps the message queued when the ack reports failure', async () => {
    mockSendMessage.mockResolvedValue(ackFailed());
    const store = makeStore([makeFailedMessage({ retryCount: 0 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(store.incrementRetryCount).toHaveBeenCalledWith('msg-1');
    expect(store.removeFailedMessage).not.toHaveBeenCalled();
  });

  it('keeps the message queued when the ack times out', async () => {
    mockSendMessage.mockResolvedValue(ackTimedOut());
    const store = makeStore([makeFailedMessage({ retryCount: 0 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(store.removeFailedMessage).not.toHaveBeenCalled();
  });

  it('marks max retries exceeded when the failing ack is the last allowed attempt', async () => {
    mockSendMessage.mockResolvedValue(ackFailed());
    const store = makeStore([makeFailedMessage({ retryCount: 2 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(store.updateFailedMessage).toHaveBeenCalledWith('msg-1', {
      error: 'Max retries exceeded',
    });
    expect(store.removeFailedMessage).not.toHaveBeenCalled();
  });

  it('does not mark max retries exceeded while attempts remain', async () => {
    mockSendMessage.mockResolvedValue(ackFailed());
    const store = makeStore([makeFailedMessage({ retryCount: 0 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(store.updateFailedMessage).not.toHaveBeenCalled();
  });

  it('treats an unexpected rejection as a failure rather than aborting the queue', async () => {
    mockSendMessage
      .mockRejectedValueOnce(new Error('boom'))
      .mockResolvedValue(ackOk());
    const store = makeStore([
      makeFailedMessage({ id: 'msg-1', content: 'first' }),
      makeFailedMessage({ id: 'msg-2', content: 'second' }),
    ]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);
    expect(store.removeFailedMessage).not.toHaveBeenCalledWith('msg-1');

    await jest.advanceTimersByTimeAsync(2000);
    expect(store.removeFailedMessage).toHaveBeenCalledWith('msg-2');
  });

  // ---------------------------------------------------------------------------
  // D2 — the flush must be driven by socket readiness, not by navigator.onLine.
  // ---------------------------------------------------------------------------

  it('flushes the queue when the socket connects after the network is already back', async () => {
    mockUseConnectionStatus.mockReturnValue(connection({ isOnline: true, isSocketConnected: false }));
    const store = makeStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    const { rerender } = renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(5000);
    expect(mockSendMessage).not.toHaveBeenCalled();

    // `online` fired seconds ago; the Socket.IO handshake only completes now.
    // `isOnline` never changed, so an isOnline-only dependency would leave the
    // queue stranded for the whole session.
    mockUseConnectionStatus.mockReturnValue(connection({ isOnline: true, isSocketConnected: true }));
    rerender();

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });

  // ---------------------------------------------------------------------------
  // D3 — readiness flapping must not start a second concurrent flush.
  // ---------------------------------------------------------------------------

  it('does not start a second concurrent flush when readiness flaps mid-run', async () => {
    let resolveSend: ((value: unknown) => void) | undefined;
    mockSendMessage.mockImplementation(
      () => new Promise((resolve) => { resolveSend = resolve; }),
    );
    const store = makeStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    const { rerender } = renderHook(() => useAutoRetryFailedMessages());

    // The flush is in flight, parked on the first send.
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // Readiness flaps while that send is still awaiting its ack. The old
    // effect's cleanup runs and a fresh effect run is scheduled: neither may
    // re-send a message the in-flight loop already owns.
    mockUseConnectionStatus.mockReturnValue(connection({ isSocketConnected: false }));
    rerender();
    mockUseConnectionStatus.mockReturnValue(connection());
    rerender();

    resolveSend?.(ackOk());
    await jest.advanceTimersByTimeAsync(4000);

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(store.incrementRetryCount).toHaveBeenCalledTimes(1);
  });

  it('allows a new flush once the previous one has finished', async () => {
    const store = makeStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    const { rerender } = renderHook(() => useAutoRetryFailedMessages());

    // 1st advance fires the initial delay and sends; 2nd drains the
    // inter-message delay so the loop completes and releases its slot.
    await jest.advanceTimersByTimeAsync(2000);
    await jest.advanceTimersByTimeAsync(2000);
    expect(mockSendMessage).toHaveBeenCalledTimes(1);

    // A later reconnect with the message still queued (its ack never removed it)
    // must be free to try again.
    mockUseConnectionStatus.mockReturnValue(connection({ isSocketConnected: false }));
    rerender();
    mockUseConnectionStatus.mockReturnValue(connection());
    rerender();

    await jest.advanceTimersByTimeAsync(2000);
    expect(mockSendMessage).toHaveBeenCalledTimes(2);
  });

  // ---------------------------------------------------------------------------
  // D4 — MAX_RETRY_COUNT is a budget, and a live connection has to be able to
  // spend it. Every test above pins a SINGLE sweep, and the one right above buys
  // its second attempt with a reconnect: none of them can see that the queue was
  // only ever swept once per readiness transition.
  // ---------------------------------------------------------------------------

  it('spends the whole retry budget on a connection that never drops', async () => {
    mockSendMessage.mockResolvedValue(ackFailed());
    const store = makeLiveStore([makeFailedMessage({ retryCount: 0 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await settle();

    expect(mockSendMessage).toHaveBeenCalledTimes(3);
    expect(store.updateFailedMessage).toHaveBeenCalledWith('msg-1', {
      error: 'Max retries exceeded',
    });
  });

  it('stops sweeping once the queue is empty', async () => {
    const store = makeLiveStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await settle();

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
    expect(store.failedMessages).toEqual([]);
  });

  it('picks up a message that failed while a flush was already in flight', async () => {
    const store = makeLiveStore([
      makeFailedMessage({ id: 'msg-1', content: 'first', clientMessageId: 'cid-1' }),
    ]);
    mockGetState.mockReturnValue(store);
    // The sweep works off a snapshot taken before this message existed, so
    // nothing in the run that is already flying will ever look at it.
    mockSendMessage.mockImplementationOnce(async () => {
      store.enqueue(makeFailedMessage({ id: 'msg-2', content: 'second', clientMessageId: 'cid-2' }));
      return ackOk();
    });

    renderHook(() => useAutoRetryFailedMessages());

    await settle();

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'second', 'en', undefined, undefined, undefined, undefined, 'cid-2',
    );
  });
});
