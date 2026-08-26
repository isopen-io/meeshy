/**
 * Tests for useConnectionStatus and useIsOnline hooks
 *
 * Covers:
 * - Initial state derived from navigator.onLine + meeshySocketIOService diagnostics
 * - isOnline = navigator.onLine OR a connected socket (the socket is the proof;
 *   navigator.onLine is a hint honoured only while the socket is down)
 * - online/offline window events (online resyncs the socket flag from diagnostics)
 * - Socket status change via onStatusChange callback
 * - No re-render when state is identical (stable reference optimization)
 * - Cleanup on unmount
 * - useIsOnline sugar
 * - SSR path (typeof window === 'undefined')
 */

import { renderHook, act } from '@testing-library/react';
import { useConnectionStatus, useIsOnline } from '@/hooks/use-connection-status';

// ─── Mock meeshySocketIOService ───────────────────────────────────────────────

let capturedStatusCallback: ((diag: { isConnected: boolean; hasSocket: boolean }) => void) | null = null;
const mockUnsubSocket = jest.fn();

const mockGetConnectionDiagnostics = jest.fn(() => ({
  isConnected: true,
  hasSocket: true,
}));

const mockOnStatusChange = jest.fn((cb: (diag: { isConnected: boolean; hasSocket: boolean }) => void) => {
  capturedStatusCallback = cb;
  return mockUnsubSocket;
});

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getConnectionDiagnostics: (...args: any[]) => mockGetConnectionDiagnostics(...args),
    onStatusChange: (...args: any[]) => mockOnStatusChange(...args),
  },
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fireOnline() {
  act(() => {
    window.dispatchEvent(new Event('online'));
  });
}

function fireOffline() {
  act(() => {
    window.dispatchEvent(new Event('offline'));
  });
}

function triggerStatusChange(diag: { isConnected: boolean; hasSocket: boolean }) {
  act(() => {
    capturedStatusCallback!(diag);
  });
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('useConnectionStatus', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedStatusCallback = null;
    mockUnsubSocket.mockReset();

    // Re-wire the mock capture after clearAllMocks
    mockOnStatusChange.mockImplementation((cb) => {
      capturedStatusCallback = cb;
      return mockUnsubSocket;
    });

    // Default: socket connected
    mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

    // jsdom defaults navigator.onLine = true
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  // ── Initial state ─────────────────────────────────────────────────────────

  describe('initial state', () => {
    it('returns { isOnline: true, isSocketConnected: true, hasSocket: true, isReady: true } when everything is up', () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());

      expect(result.current).toEqual({
        isOnline: true,
        isSocketConnected: true,
        hasSocket: true,
        isReady: true,
      });
    });

    it('returns isSocketConnected: false and isReady: false when socket not connected', () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: false });

      const { result } = renderHook(() => useConnectionStatus());

      expect(result.current.isSocketConnected).toBe(false);
      expect(result.current.isReady).toBe(false);
    });

    it('keeps isOnline: true and isReady: true when navigator.onLine is false but the socket is connected — a live socket is the proof of connectivity', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());

      expect(result.current.isOnline).toBe(true);
      expect(result.current.isReady).toBe(true);
    });

    it('returns isOnline: false and isReady: false when navigator is offline AND the socket is down', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());

      expect(result.current.isOnline).toBe(false);
      expect(result.current.isReady).toBe(false);
    });

    it('hasSocket reflects the diagnostics hasSocket value', () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());

      expect(result.current.hasSocket).toBe(true);
      expect(result.current.isSocketConnected).toBe(false);
    });
  });

  // ── online / offline events ───────────────────────────────────────────────

  describe('window online/offline events', () => {
    it('sets isOnline: true and updates isReady when online event fires', () => {
      // Start offline
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: false });

      const { result } = renderHook(() => useConnectionStatus());
      expect(result.current.isOnline).toBe(false);

      // Simulate going online
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      fireOnline();

      expect(result.current.isOnline).toBe(true);
    });

    it("does not declare the app offline on an offline event while the socket is still connected — the socket's own disconnect does", () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());
      expect(result.current.isOnline).toBe(true);

      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      fireOffline();

      expect(result.current.isOnline).toBe(true);
      expect(result.current.isSocketConnected).toBe(true);
      expect(result.current.isReady).toBe(true);

      triggerStatusChange({ isConnected: false, hasSocket: true });

      expect(result.current.isOnline).toBe(false);
      expect(result.current.isSocketConnected).toBe(false);
      expect(result.current.isReady).toBe(false);
    });

    it('resyncs isSocketConnected from the socket diagnostics on the online event — a socket that survived the blip is not left reported as disconnected', () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());
      expect(result.current.isSocketConnected).toBe(false);

      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });
      fireOnline();

      expect(result.current.isSocketConnected).toBe(true);
      expect(result.current.isReady).toBe(true);
    });

    it('sets isReady: true when back online and socket is connected', () => {
      // Start offline, socket connected
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());

      // Note: after offline, apply forces isSocketConnected: false
      // Simulate the socket reconnecting first
      triggerStatusChange({ isConnected: true, hasSocket: true });

      // Now go online
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      fireOnline();

      expect(result.current.isOnline).toBe(true);
      expect(result.current.isReady).toBe(true);
    });
  });

  // ── Socket status change ──────────────────────────────────────────────────

  describe('socket status change via onStatusChange', () => {
    it('updates isSocketConnected when socket connects', () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: false });

      const { result } = renderHook(() => useConnectionStatus());
      expect(result.current.isSocketConnected).toBe(false);

      triggerStatusChange({ isConnected: true, hasSocket: true });

      expect(result.current.isSocketConnected).toBe(true);
      expect(result.current.hasSocket).toBe(true);
    });

    it('updates isReady to true when socket connects and online', () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: false });

      const { result } = renderHook(() => useConnectionStatus());

      triggerStatusChange({ isConnected: true, hasSocket: true });

      expect(result.current.isReady).toBe(true);
    });

    it('updates isSocketConnected to false when socket disconnects', () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());
      expect(result.current.isSocketConnected).toBe(true);

      triggerStatusChange({ isConnected: false, hasSocket: false });

      expect(result.current.isSocketConnected).toBe(false);
      expect(result.current.isReady).toBe(false);
    });

    it('does NOT update state when values are identical (stable reference optimization)', () => {
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());
      const firstStatus = result.current;

      // Trigger with same values — should return prev (no re-render)
      triggerStatusChange({ isConnected: true, hasSocket: true });

      // The reference should be the same object (prev returned)
      expect(result.current).toBe(firstStatus);
    });

    it('calls onStatusChange with a callback during mount', () => {
      renderHook(() => useConnectionStatus());

      expect(mockOnStatusChange).toHaveBeenCalledTimes(1);
      expect(typeof mockOnStatusChange.mock.calls[0][0]).toBe('function');
    });
  });

  // ── Cleanup on unmount ────────────────────────────────────────────────────

  describe('cleanup', () => {
    it('removes online/offline event listeners on unmount', () => {
      const removeEventListener = jest.spyOn(window, 'removeEventListener');

      const { unmount } = renderHook(() => useConnectionStatus());
      unmount();

      const calls = removeEventListener.mock.calls.map(([event]) => event);
      expect(calls).toContain('online');
      expect(calls).toContain('offline');

      removeEventListener.mockRestore();
    });

    it('calls the socket unsubscribe returned by onStatusChange on unmount', () => {
      const { unmount } = renderHook(() => useConnectionStatus());
      unmount();

      expect(mockUnsubSocket).toHaveBeenCalledTimes(1);
    });

    it('stops reacting to online events after unmount', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: false });

      const { result, unmount } = renderHook(() => useConnectionStatus());
      expect(result.current.isOnline).toBe(false);

      unmount();

      // After unmount, online event should not change the result
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      act(() => { window.dispatchEvent(new Event('online')); });

      // result.current should still reflect the pre-unmount state
      // (renderHook freezes after unmount)
      expect(result.current.isOnline).toBe(false);
    });
  });

  // ── isReady computation ───────────────────────────────────────────────────

  describe('isReady computation', () => {
    it('is true when the socket is connected even if navigator.onLine is false', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());
      expect(result.current.isReady).toBe(true);
    });

    it('is false when socket is not connected even if online', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());
      // After initial apply both become false since socket is not connected
      expect(result.current.isReady).toBe(false);
    });

    it('is true only when both isOnline and isSocketConnected are true', () => {
      Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });

      const { result } = renderHook(() => useConnectionStatus());
      expect(result.current.isReady).toBe(true);
    });
  });
});


// ─── useIsOnline ─────────────────────────────────────────────────────────────

describe('useIsOnline', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    capturedStatusCallback = null;
    mockOnStatusChange.mockImplementation((cb) => {
      capturedStatusCallback = cb;
      return mockUnsubSocket;
    });
    mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true });
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => true });
  });

  it('returns true when navigator is online', () => {
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);
  });

  it('returns false when navigator goes offline', () => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: false });

    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(false);
  });

  it('returns a boolean', () => {
    const { result } = renderHook(() => useIsOnline());
    expect(typeof result.current).toBe('boolean');
  });

  it('updates when offline event fires and no socket is connected', () => {
    mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: false });
    const { result } = renderHook(() => useIsOnline());
    expect(result.current).toBe(true);

    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
    act(() => { window.dispatchEvent(new Event('offline')); });

    expect(result.current).toBe(false);
  });
});

