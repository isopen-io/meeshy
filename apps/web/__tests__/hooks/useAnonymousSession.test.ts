/**
 * Tests for hooks/use-anonymous-session.ts
 */

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAnonymousSession: jest.fn(),
  },
}));

jest.mock('@/services/anonymous-chat.service', () => ({
  anonymousChatService: {
    initialize: jest.fn(),
    refreshSession: jest.fn(),
  },
}));

import { renderHook, act } from '@testing-library/react';
import { useAnonymousSession } from '@/hooks/use-anonymous-session';
import { authManager } from '@/services/auth-manager.service';
import { anonymousChatService } from '@/services/anonymous-chat.service';

const mockGetAnonymousSession = authManager.getAnonymousSession as jest.MockedFunction<
  typeof authManager.getAnonymousSession
>;
const mockInitialize = anonymousChatService.initialize as jest.MockedFunction<
  typeof anonymousChatService.initialize
>;
const mockRefreshSession = anonymousChatService.refreshSession as jest.MockedFunction<
  typeof anonymousChatService.refreshSession
>;

describe('useAnonymousSession', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.resetAllMocks();
    mockRefreshSession.mockResolvedValue(undefined);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  it('does nothing when disabled', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' } as any);

    renderHook(() => useAnonymousSession({ enabled: false, linkId: 'link-123' }));

    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('does nothing when linkId is missing', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' } as any);

    renderHook(() => useAnonymousSession({ enabled: true }));

    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('does nothing when no anonymous session token', () => {
    mockGetAnonymousSession.mockReturnValue(null);

    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-123' }));

    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('does nothing when session has no token', () => {
    mockGetAnonymousSession.mockReturnValue({ token: null } as any);

    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-123' }));

    expect(mockInitialize).not.toHaveBeenCalled();
  });

  it('initializes anonymous chat service when enabled with session', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' } as any);

    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-123' }));

    expect(mockInitialize).toHaveBeenCalledWith('link-123');
  });

  it('schedules session refresh every 5 minutes', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' } as any);

    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-123' }));

    expect(mockRefreshSession).not.toHaveBeenCalled();

    act(() => {
      jest.advanceTimersByTime(5 * 60 * 1000);
    });

    expect(mockRefreshSession).toHaveBeenCalledTimes(1);
  });

  it('calls refreshSession repeatedly at 5-minute intervals', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' } as any);

    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-123' }));

    act(() => {
      jest.advanceTimersByTime(15 * 60 * 1000);
    });

    expect(mockRefreshSession).toHaveBeenCalledTimes(3);
  });

  it('clears interval on unmount', () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' } as any);

    const { unmount } = renderHook(() =>
      useAnonymousSession({ enabled: true, linkId: 'link-123' })
    );

    unmount();

    act(() => {
      jest.advanceTimersByTime(10 * 60 * 1000);
    });

    expect(mockRefreshSession).not.toHaveBeenCalled();
  });

  it('silently swallows refresh errors without crashing', async () => {
    mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' } as any);
    mockRefreshSession.mockRejectedValue(new Error('Auth failed'));

    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

    renderHook(() => useAnonymousSession({ enabled: true, linkId: 'link-123' }));

    await act(async () => {
      jest.advanceTimersByTime(5 * 60 * 1000);
      // Flush the rejected promise
      await Promise.resolve();
    });

    expect(consoleSpy).toHaveBeenCalledWith(
      '[useAnonymousSession] Session refresh failed:',
      expect.any(Error)
    );

    consoleSpy.mockRestore();
  });
});
