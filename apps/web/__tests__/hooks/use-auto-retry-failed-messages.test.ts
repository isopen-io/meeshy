/**
 * Tests for hooks/use-auto-retry-failed-messages.ts
 */

const mockUseNetworkStatus = jest.fn<boolean, []>();

jest.mock('@/hooks/use-network-status', () => ({
  useNetworkStatus: () => mockUseNetworkStatus(),
}));

const mockGetState = jest.fn();
const mockIncrementRetryCount = jest.fn();
const mockRemoveFailedMessage = jest.fn();
const mockUpdateFailedMessage = jest.fn();

jest.mock('@/stores/failed-messages-store', () => ({
  useFailedMessagesStore: {
    getState: () => mockGetState(),
  },
}));

const mockGetConnectionDiagnostics = jest.fn();
const mockSendMessage = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getConnectionDiagnostics: () => mockGetConnectionDiagnostics(),
    sendMessage: (...args: unknown[]) => mockSendMessage(...args),
  },
}));

import { renderHook } from '@testing-library/react';
import { useAutoRetryFailedMessages } from '@/hooks/use-auto-retry-failed-messages';

const makeFailedMessage = (id: string, retryCount = 0) => ({
  id,
  conversationId: 'conv-1',
  content: `content-${id}`,
  originalLanguage: 'fr',
  replyToId: undefined,
  attachmentIds: [],
  retryCount,
  error: null,
});

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true });
  mockGetState.mockReturnValue({
    failedMessages: [],
    incrementRetryCount: mockIncrementRetryCount,
    removeFailedMessage: mockRemoveFailedMessage,
    updateFailedMessage: mockUpdateFailedMessage,
  });
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── offline / disconnected guard ─────────────────────────────────────────────

describe('offline guard', () => {
  it('does not attempt retry when offline', async () => {
    mockUseNetworkStatus.mockReturnValue(false);
    mockGetState.mockReturnValue({
      failedMessages: [makeFailedMessage('m1')],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not attempt retry when socket is not connected', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false });
    mockGetState.mockReturnValue({
      failedMessages: [makeFailedMessage('m1')],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('does not retry when there are no failed messages', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockGetState.mockReturnValue({
      failedMessages: [],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});

// ─── retry count filter ───────────────────────────────────────────────────────

describe('retry count filter', () => {
  it('skips messages that have reached max retry count (3)', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockGetState.mockReturnValue({
      failedMessages: [makeFailedMessage('m1', 3)], // maxed out
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockSendMessage).not.toHaveBeenCalled();
  });

  it('retries messages with retryCount below max', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockSendMessage.mockResolvedValue(undefined);
    const msg = makeFailedMessage('m1', 2); // below max of 3
    mockGetState.mockReturnValue({
      failedMessages: [msg],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockSendMessage).toHaveBeenCalledTimes(1);
  });
});

// ─── successful retry ─────────────────────────────────────────────────────────

describe('successful retry', () => {
  it('increments retry count before sending', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockSendMessage.mockResolvedValue(undefined);
    const msg = makeFailedMessage('m1');
    mockGetState.mockReturnValue({
      failedMessages: [msg],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockIncrementRetryCount).toHaveBeenCalledWith('m1');
  });

  it('removes the message from store on success', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockSendMessage.mockResolvedValue(undefined);
    const msg = makeFailedMessage('m1');
    mockGetState.mockReturnValue({
      failedMessages: [msg],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockRemoveFailedMessage).toHaveBeenCalledWith('m1');
  });

  it('calls sendMessage with correct arguments', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockSendMessage.mockResolvedValue(undefined);
    const msg = {
      ...makeFailedMessage('m1'),
      conversationId: 'conv-42',
      content: 'Hello',
      originalLanguage: 'en',
      replyToId: 'reply-1',
      attachmentIds: ['att-1'],
    };
    mockGetState.mockReturnValue({
      failedMessages: [msg],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockSendMessage).toHaveBeenCalledWith(
      'conv-42',
      'Hello',
      'en',
      'reply-1',
      undefined,
      ['att-1']
    );
  });

  it('passes undefined for attachmentIds when the array is empty', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockSendMessage.mockResolvedValue(undefined);
    const msg = makeFailedMessage('m1'); // attachmentIds: []
    mockGetState.mockReturnValue({
      failedMessages: [msg],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    const call = mockSendMessage.mock.calls[0];
    expect(call[5]).toBeUndefined();
  });
});

// ─── failed retry ─────────────────────────────────────────────────────────────

describe('failed retry', () => {
  it('marks message with max-retry error when retryCount reaches max', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockSendMessage.mockRejectedValue(new Error('network'));
    const msg = makeFailedMessage('m1', 2); // one more failure → 3 = max
    mockGetState.mockReturnValue({
      failedMessages: [msg],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockUpdateFailedMessage).toHaveBeenCalledWith('m1', { error: 'Max retries exceeded' });
  });

  it('does not remove the message on failure', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockSendMessage.mockRejectedValue(new Error('network'));
    const msg = makeFailedMessage('m1', 2);
    mockGetState.mockReturnValue({
      failedMessages: [msg],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockRemoveFailedMessage).not.toHaveBeenCalled();
  });

  it('does not call updateFailedMessage when retryCount is below max', async () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockSendMessage.mockRejectedValue(new Error('transient'));
    const msg = makeFailedMessage('m1', 0); // 0 + 1 < 3
    mockGetState.mockReturnValue({
      failedMessages: [msg],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    renderHook(() => useAutoRetryFailedMessages());
    await jest.runAllTimersAsync();

    expect(mockUpdateFailedMessage).not.toHaveBeenCalled();
  });
});

// ─── cleanup ──────────────────────────────────────────────────────────────────

describe('cleanup', () => {
  it('clears timeout on unmount', () => {
    mockUseNetworkStatus.mockReturnValue(true);
    mockGetState.mockReturnValue({
      failedMessages: [makeFailedMessage('m1')],
      incrementRetryCount: mockIncrementRetryCount,
      removeFailedMessage: mockRemoveFailedMessage,
      updateFailedMessage: mockUpdateFailedMessage,
    });

    const { unmount } = renderHook(() => useAutoRetryFailedMessages());
    unmount();

    // After unmount the timer should be cleared — advancing it should not trigger sends
    jest.runAllTimers();
    expect(mockSendMessage).not.toHaveBeenCalled();
  });
});
