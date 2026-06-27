/**
 * Tests for hooks/use-anonymous-session.ts
 */

const mockGetAnonymousSession = jest.fn();

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAnonymousSession: () => mockGetAnonymousSession(),
  },
}));

const mockInitialize = jest.fn();
const mockRefreshSession = jest.fn();

jest.mock('@/services/anonymous-chat.service', () => ({
  anonymousChatService: {
    initialize: (...args: unknown[]) => mockInitialize(...args),
    refreshSession: () => mockRefreshSession(),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useAnonymousSession } from '@/hooks/use-anonymous-session';

const REFRESH_INTERVAL = 5 * 60 * 1000;

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();
  mockGetAnonymousSession.mockReturnValue(null);
  mockRefreshSession.mockResolvedValue(undefined);
});

afterEach(() => {
  jest.useRealTimers();
});

// ─── disabled / missing linkId ────────────────────────────────────────────────

describe('when disabled or no linkId', () => {
  it('does not initialize when enabled=false', () => {
    renderHook(() => useAnonymousSession({ enabled: false, linkId: 'link-1' }));
    jest.runAllTimers();
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('does not initialize when linkId is absent', () => {
    renderHook(() => useAnonymousSession({ enabled: true }));
    jest.runAllTimers();
    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('does not initialize when no session token', () => {
    mockGetAnonymousSession.mockReturnValue(null);
    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-1' }));
    jest.runAllTimers();
    expect(mockInitialize).not.toHaveBeenCalled();
  });
});

// ─── enabled with session ─────────────────────────────────────────────────────

describe('when enabled with session token', () => {
  beforeEach(() => {
    mockGetAnonymousSession.mockReturnValue({ token: 'session-tok' });
  });

  it('calls anonymousChatService.initialize with linkId', () => {
    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-1' }));
    expect(mockInitialize).toHaveBeenCalledWith('link-1');
  });

  it('does not call refreshSession immediately (waits for interval)', () => {
    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-1' }));
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('calls refreshSession after 5 minutes', async () => {
    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-1' }));
    await act(async () => {
      jest.advanceTimersByTime(REFRESH_INTERVAL);
      await Promise.resolve();
    });
    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('calls refreshSession multiple times over multiple intervals', async () => {
    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-1' }));
    await act(async () => {
      jest.advanceTimersByTime(REFRESH_INTERVAL * 3);
      await Promise.resolve();
    });
    expect(mockRefreshSession).toHaveBeenCalledTimes(3);
  });

  it('clears interval on unmount', async () => {
    const { unmount } = renderHook(() =>
      useAnonymousSession({ enabled: true, linkId: 'link-1' })
    );
    unmount();
    await act(async () => {
      jest.advanceTimersByTime(REFRESH_INTERVAL * 2);
      await Promise.resolve();
    });
    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('gracefully handles refresh errors without throwing', async () => {
    mockRefreshSession.mockRejectedValue(new Error('network error'));
    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-1' }));
    await act(async () => {
      jest.advanceTimersByTime(REFRESH_INTERVAL);
      await Promise.resolve();
    });
    // No error propagated to render
    expect(mockRefreshSession).toHaveBeenCalled();
  });
});
