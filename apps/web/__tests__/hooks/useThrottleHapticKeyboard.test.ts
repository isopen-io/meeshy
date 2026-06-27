/**
 * Tests for hooks/useThrottle.ts, hooks/useHapticFeedback.ts,
 * hooks/use-virtual-keyboard.ts, and hooks/use-user-search.ts
 */

jest.mock('sonner', () => ({
  toast: { error: jest.fn() },
}));

jest.mock('@/services/users.service', () => ({
  usersService: {
    searchUsers: jest.fn(),
  },
}));

jest.mock('@/hooks/useI18n', () => ({
  useI18n: jest.fn(() => ({
    t: (key: string) => key,
  })),
}));

import { renderHook, act, waitFor } from '@testing-library/react';
import { useThrottle, useThrottledCallback } from '@/hooks/useThrottle';
import { useHapticFeedback } from '@/hooks/useHapticFeedback';
import { useVirtualKeyboard } from '@/hooks/use-virtual-keyboard';
import { useUserSearch, useUserSelection } from '@/hooks/use-user-search';
import { usersService } from '@/services/users.service';
import { useI18n } from '@/hooks/useI18n';
import { toast } from 'sonner';
import type { User } from '@/types';

const mockUseI18n = useI18n as jest.MockedFunction<typeof useI18n>;

const mockSearchUsers = usersService.searchUsers as jest.MockedFunction<
  typeof usersService.searchUsers
>;

const makeUser = (id: string, overrides: Partial<User> = {}): User =>
  ({ id, username: id, displayName: id, ...overrides } as User);

// ─── useThrottle ──────────────────────────────────────────────────────────────

describe('useThrottle', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value immediately', () => {
    const { result } = renderHook(() => useThrottle('hello', 100));
    expect(result.current).toBe('hello');
  });

  it('returns the same value before delay elapses', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 100),
      { initialProps: { value: 'hello' } }
    );

    rerender({ value: 'world' });

    // Not yet advanced enough time
    jest.advanceTimersByTime(50);
    expect(result.current).toBe('hello');
  });

  it('updates value after delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 100),
      { initialProps: { value: 'hello' } }
    );

    rerender({ value: 'world' });
    act(() => {
      jest.advanceTimersByTime(200);
    });

    expect(result.current).toBe('world');
  });

  it('works with numeric values', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useThrottle(value, 50),
      { initialProps: { value: 1 } }
    );

    rerender({ value: 99 });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    expect(result.current).toBe(99);
  });

  it('clears timeout on unmount', () => {
    const { unmount } = renderHook(() => useThrottle('test', 100));
    expect(() => unmount()).not.toThrow();
  });
});

// ─── useThrottledCallback ─────────────────────────────────────────────────────

describe('useThrottledCallback', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });
  afterEach(() => {
    jest.useRealTimers();
  });

  it('does not call callback synchronously (waits for delay)', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(cb, 100));

    act(() => {
      result.current();
    });

    expect(cb).toHaveBeenCalledTimes(0);
  });

  it('calls callback after the delay elapses', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(cb, 100));

    act(() => {
      result.current();
      jest.advanceTimersByTime(100);
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('throttles multiple calls into a single execution', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(cb, 100));

    act(() => {
      result.current();
      result.current();
      result.current();
      jest.advanceTimersByTime(100);
    });

    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('allows a second call after sufficient time has passed', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(cb, 100));

    act(() => {
      result.current();
      jest.advanceTimersByTime(200);
    });

    act(() => {
      result.current();
      jest.advanceTimersByTime(200);
    });

    expect(cb).toHaveBeenCalledTimes(2);
  });

  it('passes arguments through to callback', () => {
    const cb = jest.fn();
    const { result } = renderHook(() => useThrottledCallback(cb, 100));

    act(() => {
      result.current('arg1', 42);
      jest.advanceTimersByTime(100);
    });

    expect(cb).toHaveBeenCalledWith('arg1', 42);
  });
});

// ─── useHapticFeedback ────────────────────────────────────────────────────────

describe('useHapticFeedback', () => {
  const mockVibrate = jest.fn();

  beforeEach(() => {
    jest.resetAllMocks();
    Object.defineProperty(navigator, 'vibrate', {
      configurable: true,
      writable: true,
      value: mockVibrate,
    });
  });

  it('returns vibrate, vibrateCustom, and cancel functions', () => {
    const { result } = renderHook(() => useHapticFeedback());
    expect(typeof result.current.vibrate).toBe('function');
    expect(typeof result.current.vibrateCustom).toBe('function');
    expect(typeof result.current.cancel).toBe('function');
  });

  it('calls navigator.vibrate with the right pattern for light', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('light');
    expect(mockVibrate).toHaveBeenCalledWith(10);
  });

  it('calls navigator.vibrate with array pattern for success', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('success');
    expect(mockVibrate).toHaveBeenCalledWith([10, 50, 10]);
  });

  it('calls navigator.vibrate with array pattern for error', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('error');
    expect(mockVibrate).toHaveBeenCalledWith([20, 100, 20, 100, 20]);
  });

  it('calls navigator.vibrate with array pattern for warning', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrate('warning');
    expect(mockVibrate).toHaveBeenCalledWith([30, 50, 30]);
  });

  it('does nothing when navigator.vibrate is unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });

    const { result } = renderHook(() => useHapticFeedback());
    expect(() => result.current.vibrate('light')).not.toThrow();
    expect(mockVibrate).not.toHaveBeenCalled();
  });

  it('vibrateCustom passes duration to navigator.vibrate', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrateCustom(200);
    expect(mockVibrate).toHaveBeenCalledWith(200);
  });

  it('vibrateCustom passes array to navigator.vibrate', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.vibrateCustom([100, 50, 100]);
    expect(mockVibrate).toHaveBeenCalledWith([100, 50, 100]);
  });

  it('cancel calls navigator.vibrate(0)', () => {
    const { result } = renderHook(() => useHapticFeedback());
    result.current.cancel();
    expect(mockVibrate).toHaveBeenCalledWith(0);
  });

  it('cancel does nothing when vibrate unavailable', () => {
    Object.defineProperty(navigator, 'vibrate', { configurable: true, value: undefined });

    const { result } = renderHook(() => useHapticFeedback());
    expect(() => result.current.cancel()).not.toThrow();
  });

  it('vibrate silently catches exceptions from navigator.vibrate', () => {
    mockVibrate.mockImplementation(() => { throw new Error('not allowed'); });
    const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

    const { result } = renderHook(() => useHapticFeedback());
    expect(() => result.current.vibrate('heavy')).not.toThrow();

    consoleSpy.mockRestore();
  });
});

// ─── useVirtualKeyboard ───────────────────────────────────────────────────────

describe('useVirtualKeyboard', () => {
  let capturedListeners: Map<string, () => void>;
  let mockVisualViewport: {
    height: number;
    addEventListener: jest.Mock;
    removeEventListener: jest.Mock;
  };

  beforeEach(() => {
    capturedListeners = new Map();

    mockVisualViewport = {
      height: 800,
      addEventListener: jest.fn((type: string, handler: () => void) => {
        capturedListeners.set(type, handler);
      }),
      removeEventListener: jest.fn(),
    };

    Object.defineProperty(window, 'innerHeight', { configurable: true, value: 800 });
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: mockVisualViewport,
    });
  });

  afterEach(() => {
    Object.defineProperty(window, 'visualViewport', {
      configurable: true,
      value: undefined,
    });
  });

  it('starts with keyboard closed state', () => {
    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.isOpen).toBe(false);
  });

  it('detects keyboard as open when viewport height drops significantly', () => {
    const { result } = renderHook(() => useVirtualKeyboard());

    act(() => {
      // Simulate keyboard opening: viewportHeight shrinks
      mockVisualViewport.height = 550; // 800 - 550 = 250 > 150 → open
      const handler = capturedListeners.get('resize');
      handler?.();
    });

    expect(result.current.isOpen).toBe(true);
    expect(result.current.keyboardHeight).toBe(250);
    expect(result.current.viewportHeight).toBe(550);
  });

  it('detects keyboard as closed when height difference is small', () => {
    const { result } = renderHook(() => useVirtualKeyboard());

    act(() => {
      mockVisualViewport.height = 700; // 800 - 700 = 100 ≤ 150 → closed
      const handler = capturedListeners.get('resize');
      handler?.();
    });

    expect(result.current.isOpen).toBe(false);
    expect(result.current.keyboardHeight).toBe(0);
  });

  it('listens to scroll events on visualViewport', () => {
    renderHook(() => useVirtualKeyboard());
    expect(mockVisualViewport.addEventListener).toHaveBeenCalledWith(
      'scroll',
      expect.any(Function)
    );
  });

  it('removes listeners on unmount', () => {
    const { unmount } = renderHook(() => useVirtualKeyboard());
    unmount();
    expect(mockVisualViewport.removeEventListener).toHaveBeenCalled();
  });

  it('does nothing when visualViewport is not available', () => {
    Object.defineProperty(window, 'visualViewport', { configurable: true, value: undefined });

    const { result } = renderHook(() => useVirtualKeyboard());
    expect(result.current.isOpen).toBe(false);
  });
});

// ─── useUserSearch ────────────────────────────────────────────────────────────

describe('useUserSearch', () => {
  beforeEach(() => {
    jest.resetAllMocks();
    mockUseI18n.mockReturnValue({ t: (key: string) => key } as ReturnType<typeof useI18n>);
  });

  it('starts with empty availableUsers and isLoading false', () => {
    const { result } = renderHook(() => useUserSearch('me', []));
    expect(result.current.availableUsers).toEqual([]);
    expect(result.current.isLoading).toBe(false);
  });

  it('does not search when query is empty', async () => {
    const { result } = renderHook(() => useUserSearch('me', []));

    await act(async () => {
      await result.current.searchUsers('');
    });

    expect(mockSearchUsers).not.toHaveBeenCalled();
    expect(result.current.availableUsers).toEqual([]);
  });

  it('does not search when query is less than 2 chars', async () => {
    const { result } = renderHook(() => useUserSearch('me', []));

    await act(async () => {
      await result.current.searchUsers('a');
    });

    expect(mockSearchUsers).not.toHaveBeenCalled();
  });

  it('does not search when query is only whitespace', async () => {
    const { result } = renderHook(() => useUserSearch('me', []));

    await act(async () => {
      await result.current.searchUsers('  ');
    });

    expect(mockSearchUsers).not.toHaveBeenCalled();
  });

  it('searches when query >= 2 chars', async () => {
    mockSearchUsers.mockResolvedValueOnce([makeUser('u1')]);

    const { result } = renderHook(() => useUserSearch('me', []));

    await act(async () => {
      await result.current.searchUsers('al');
    });

    expect(mockSearchUsers).toHaveBeenCalledWith('al');
  });

  it('filters out the current user from results', async () => {
    mockSearchUsers.mockResolvedValueOnce([makeUser('me'), makeUser('other')]);

    const { result } = renderHook(() => useUserSearch('me', []));

    await act(async () => {
      await result.current.searchUsers('al');
    });

    expect(result.current.availableUsers.every(u => u.id !== 'me')).toBe(true);
  });

  it('filters out already selected users', async () => {
    const selected = makeUser('sel-1');
    mockSearchUsers.mockResolvedValueOnce([selected, makeUser('other')]);

    const { result } = renderHook(() => useUserSearch('me', [selected]));

    await act(async () => {
      await result.current.searchUsers('al');
    });

    expect(result.current.availableUsers.some(u => u.id === 'sel-1')).toBe(false);
  });

  it('sets isLoading to true during search and false after', async () => {
    let resolveSearch!: (users: User[]) => void;
    mockSearchUsers.mockReturnValueOnce(
      new Promise<User[]>(resolve => { resolveSearch = resolve; })
    );

    const { result } = renderHook(() => useUserSearch('me', []));

    act(() => {
      void result.current.searchUsers('al');
    });

    await waitFor(() => expect(result.current.isLoading).toBe(true));

    await act(async () => {
      resolveSearch([]);
    });

    expect(result.current.isLoading).toBe(false);
  });

  it('shows error toast and sets isLoading false on exception', async () => {
    const consoleSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    mockSearchUsers.mockRejectedValueOnce(new Error('Network'));

    const { result } = renderHook(() => useUserSearch('me', []));

    await act(async () => {
      await result.current.searchUsers('al');
    });

    expect(toast.error).toHaveBeenCalled();
    expect(result.current.isLoading).toBe(false);
    consoleSpy.mockRestore();
  });

  it('clears results when query is too short', async () => {
    mockSearchUsers.mockResolvedValueOnce([makeUser('u1')]);

    const { result } = renderHook(() => useUserSearch('me', []));

    await act(async () => {
      await result.current.searchUsers('al');
    });

    await act(async () => {
      await result.current.searchUsers('a');
    });

    expect(result.current.availableUsers).toEqual([]);
  });
});

// ─── useUserSelection ─────────────────────────────────────────────────────────

describe('useUserSelection', () => {
  beforeEach(() => {
    mockUseI18n.mockReturnValue({ t: (key: string) => key } as ReturnType<typeof useI18n>);
  });

  it('starts with empty selectedUsers', () => {
    const { result } = renderHook(() => useUserSelection());
    expect(result.current.selectedUsers).toEqual([]);
  });

  it('adds user when not already selected', () => {
    const user = makeUser('u1');
    const { result } = renderHook(() => useUserSelection());

    act(() => {
      result.current.toggleUserSelection(user);
    });

    expect(result.current.selectedUsers).toContain(user);
  });

  it('removes user when already selected', () => {
    const user = makeUser('u1');
    const { result } = renderHook(() => useUserSelection());

    act(() => {
      result.current.toggleUserSelection(user);
      result.current.toggleUserSelection(user);
    });

    expect(result.current.selectedUsers).toHaveLength(0);
  });

  it('clearSelection empties the list', () => {
    const { result } = renderHook(() => useUserSelection());

    act(() => {
      result.current.toggleUserSelection(makeUser('u1'));
      result.current.toggleUserSelection(makeUser('u2'));
    });

    act(() => {
      result.current.clearSelection();
    });

    expect(result.current.selectedUsers).toHaveLength(0);
  });
});
