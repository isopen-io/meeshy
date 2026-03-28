import { renderHook } from '@testing-library/react';

const mockUseNetworkStatus = jest.fn<boolean, []>();
jest.mock('@/hooks/use-network-status', () => ({
  useNetworkStatus: () => mockUseNetworkStatus(),
}));

const mockGetState = jest.fn();
jest.mock('@/stores/failed-messages-store', () => ({
  useFailedMessagesStore: { getState: () => mockGetState() },
}));

const mockSendMessage = jest.fn();
const mockGetConnectionDiagnostics = jest.fn();
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
    getConnectionDiagnostics: () => mockGetConnectionDiagnostics(),
  },
}));

import { useAutoRetryFailedMessages } from '../use-auto-retry-failed-messages';

function makeFailedMessage(overrides: Partial<{
  id: string;
  conversationId: string;
  content: string;
  originalLanguage: string;
  attachmentIds: string[];
  replyToId: string | undefined;
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

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockUseNetworkStatus.mockReturnValue(true);
  mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true });
  mockSendMessage.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

describe('useAutoRetryFailedMessages', () => {
  it('does not retry when offline', () => {
    mockUseNetworkStatus.mockReturnValue(false);
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

  it('does not retry when socket not connected', () => {
    mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false });
    const store = makeStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    jest.advanceTimersByTime(5000);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('retries failed messages sequentially when online and connected', async () => {
    const msg1 = makeFailedMessage({ id: 'msg-1', content: 'first' });
    const msg2 = makeFailedMessage({ id: 'msg-2', content: 'second' });
    const store = makeStore([msg1, msg2]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    // Advance past the initial delay
    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'first', 'en', undefined, undefined, undefined,
    );
    expect(store.incrementRetryCount).toHaveBeenCalledWith('msg-1');

    // Advance past the inter-message delay
    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'second', 'en', undefined, undefined, undefined,
    );
    expect(store.incrementRetryCount).toHaveBeenCalledWith('msg-2');
  });

  it('removes message from store on successful retry', async () => {
    const store = makeStore([makeFailedMessage()]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(store.removeFailedMessage).toHaveBeenCalledWith('msg-1');
  });

  it('increments retryCount on failure', async () => {
    mockSendMessage.mockRejectedValue(new Error('send failed'));
    const store = makeStore([makeFailedMessage({ retryCount: 0 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(store.incrementRetryCount).toHaveBeenCalledWith('msg-1');
    expect(store.removeFailedMessage).not.toHaveBeenCalled();
  });

  it('stops retrying after MAX_RETRY_COUNT (3)', () => {
    const store = makeStore([makeFailedMessage({ retryCount: 3 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    jest.advanceTimersByTime(5000);
    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('sets max retries error when retryCount + 1 reaches MAX_RETRY_COUNT', async () => {
    mockSendMessage.mockRejectedValue(new Error('send failed'));
    const store = makeStore([makeFailedMessage({ retryCount: 2 })]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(store.updateFailedMessage).toHaveBeenCalledWith('msg-1', {
      error: 'Max retries exceeded',
    });
  });

  it('uses null-safe attachmentIds check', async () => {
    const msg = makeFailedMessage({ attachmentIds: ['att-1', 'att-2'] });
    const store = makeStore([msg]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'hello', 'en', undefined, undefined, ['att-1', 'att-2'],
    );
  });

  it('passes undefined for empty attachmentIds', async () => {
    const msg = makeFailedMessage({ attachmentIds: [] });
    const store = makeStore([msg]);
    mockGetState.mockReturnValue(store);

    renderHook(() => useAutoRetryFailedMessages());

    await jest.advanceTimersByTimeAsync(2000);

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-1', 'hello', 'en', undefined, undefined, undefined,
    );
  });
});
