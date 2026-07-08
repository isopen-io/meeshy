/**
 * Branch-coverage gap-filler for useSocketIOMessaging
 *
 * Targets uncovered lines/branches:
 * - Lines 79-84: tryReconnectIfTokensAvailable body inside setTimeout
 * - Line 126: onTranslation callback wrapper (data.translations spread)
 * - Line 134: event.displayName || event.username fallback
 * - Line 141: onUserStatus invocation
 * - Lines 147-148: onConversationStats if-block
 * - Lines 152-153: onConversationOnlineStats if-block
 * - Line 167: "return prev" branch in status-change handler
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';

// ─── Mock auth manager ────────────────────────────────────────────────────────

const mockGetAuthToken = jest.fn<string | null, []>(() => null);
const mockGetAnonymousSession = jest.fn<{ token: string } | null, []>(() => null);

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    getAnonymousSession: () => mockGetAnonymousSession(),
  },
}));

// ─── Socket service mock with callback capture ────────────────────────────────

// We need to capture every callback passed to the on* methods so we can invoke them
let capturedTranslationCb: ((data: any) => void) | null = null;
let capturedTypingCb: ((event: any) => void) | null = null;
let capturedUserStatusCb: ((event: any) => void) | null = null;
let capturedConversationStatsCb: ((data: any) => void) | null = null;
let capturedConversationOnlineStatsCb: ((data: any) => void) | null = null;
let capturedStatusChangeCb: ((diag: { isConnected: boolean; hasSocket: boolean }) => void) | null = null;

const mockReconnect = jest.fn();
const mockStartTyping = jest.fn();
const mockStopTyping = jest.fn();
const mockGetCurrentConversationId = jest.fn<string | null, []>(() => null);
const mockGetConnectionDiagnostics = jest.fn(() => ({
  isConnected: true,
  hasSocket: true,
  isConnecting: false,
}));

const mockOnTranslation = jest.fn((cb: (data: any) => void) => {
  capturedTranslationCb = cb;
  return jest.fn();
});
const mockOnTyping = jest.fn((cb: (event: any) => void) => {
  capturedTypingCb = cb;
  return jest.fn();
});
const mockOnUserStatus = jest.fn((cb: (event: any) => void) => {
  capturedUserStatusCb = cb;
  return jest.fn();
});
const mockOnConversationStats = jest.fn((cb: (data: any) => void) => {
  capturedConversationStatsCb = cb;
  return jest.fn();
});
const mockOnConversationOnlineStats = jest.fn((cb: (data: any) => void) => {
  capturedConversationOnlineStatsCb = cb;
  return jest.fn();
});
const mockOnStatusChange = jest.fn((cb: (diag: { isConnected: boolean; hasSocket: boolean }) => void) => {
  capturedStatusChangeCb = cb;
  return jest.fn();
});

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    joinConversation: jest.fn(),
    leaveConversation: jest.fn(),
    sendMessage: jest.fn(),
    editMessage: jest.fn(),
    deleteMessage: jest.fn(),
    startTyping: (...args: any[]) => mockStartTyping(...args),
    stopTyping: (...args: any[]) => mockStopTyping(...args),
    reconnect: (...args: any[]) => mockReconnect(...args),
    setCurrentUser: jest.fn(),
    getCurrentConversationId: (...args: any[]) => mockGetCurrentConversationId(...args),
    getConnectionDiagnostics: (...args: any[]) => mockGetConnectionDiagnostics(...args),
    onNewMessage: jest.fn(() => jest.fn()),
    onMessageEdited: jest.fn(() => jest.fn()),
    onMessageDeleted: jest.fn(() => jest.fn()),
    onTranslation: (...args: any[]) => mockOnTranslation(...args),
    onTyping: (...args: any[]) => mockOnTyping(...args),
    onUserStatus: (...args: any[]) => mockOnUserStatus(...args),
    onConversationStats: (...args: any[]) => mockOnConversationStats(...args),
    onConversationOnlineStats: (...args: any[]) => mockOnConversationOnlineStats(...args),
    onStatusChange: (...args: any[]) => mockOnStatusChange(...args),
  },
}));

// ─── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  jest.useFakeTimers();

  capturedTranslationCb = null;
  capturedTypingCb = null;
  capturedUserStatusCb = null;
  capturedConversationStatsCb = null;
  capturedConversationOnlineStatsCb = null;
  capturedStatusChangeCb = null;

  // Re-wire captures after clearAllMocks
  mockOnTranslation.mockImplementation((cb) => { capturedTranslationCb = cb; return jest.fn(); });
  mockOnTyping.mockImplementation((cb) => { capturedTypingCb = cb; return jest.fn(); });
  mockOnUserStatus.mockImplementation((cb) => { capturedUserStatusCb = cb; return jest.fn(); });
  mockOnConversationStats.mockImplementation((cb) => { capturedConversationStatsCb = cb; return jest.fn(); });
  mockOnConversationOnlineStats.mockImplementation((cb) => { capturedConversationOnlineStatsCb = cb; return jest.fn(); });
  mockOnStatusChange.mockImplementation((cb) => { capturedStatusChangeCb = cb; return jest.fn(); });

  mockGetConnectionDiagnostics.mockReturnValue({ isConnected: true, hasSocket: true, isConnecting: false });
  mockGetAuthToken.mockReturnValue(null);
  mockGetAnonymousSession.mockReturnValue(null);
});

afterEach(() => {
  jest.useRealTimers();
  jest.restoreAllMocks();
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('useSocketIOMessaging – branch gap coverage', () => {

  // ── Lines 79-84: tryReconnectIfTokensAvailable inside setTimeout ──────────

  describe('tryReconnectIfTokensAvailable (1500ms timeout)', () => {
    it('does NOT reconnect when no auth token and no session token', async () => {
      mockGetAuthToken.mockReturnValue(null);
      mockGetAnonymousSession.mockReturnValue(null);

      renderHook(() => useSocketIOMessaging());

      act(() => { jest.advanceTimersByTime(1500); });

      // reconnect should only have been called from the mount effect (if token present)
      // With no token at all, mount effect also skips, and setTimeout also skips
      expect(mockReconnect).not.toHaveBeenCalled();
    });

    it('does NOT reconnect when token available but already connected', async () => {
      mockGetAuthToken.mockReturnValue('tok-123');
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: true,
        hasSocket: true,
        isConnecting: false,
      });

      renderHook(() => useSocketIOMessaging());

      // Clear the mount-time reconnect call (from ÉTAPE 1A)
      mockReconnect.mockClear();

      act(() => { jest.advanceTimersByTime(1500); });

      // setTimeout fires but diagnostics.isConnected=true → no reconnect
      expect(mockReconnect).not.toHaveBeenCalled();
    });

    it('does NOT reconnect when token available but currently connecting', async () => {
      mockGetAuthToken.mockReturnValue('tok-123');
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: false,
        hasSocket: false,
        isConnecting: true,
      });

      renderHook(() => useSocketIOMessaging());
      mockReconnect.mockClear();

      act(() => { jest.advanceTimersByTime(1500); });

      expect(mockReconnect).not.toHaveBeenCalled();
    });

    it('DOES reconnect when token available, not connected, and not connecting', async () => {
      mockGetAuthToken.mockReturnValue('tok-123');
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: false,
        hasSocket: false,
        isConnecting: false,
      });

      renderHook(() => useSocketIOMessaging());
      mockReconnect.mockClear();

      act(() => { jest.advanceTimersByTime(1500); });

      expect(mockReconnect).toHaveBeenCalledTimes(1);
    });

    it('uses session token when auth token is absent', async () => {
      mockGetAuthToken.mockReturnValue(null);
      mockGetAnonymousSession.mockReturnValue({ token: 'anon-tok' });
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: false,
        hasSocket: false,
        isConnecting: false,
      });

      renderHook(() => useSocketIOMessaging());
      mockReconnect.mockClear();

      act(() => { jest.advanceTimersByTime(1500); });

      expect(mockReconnect).toHaveBeenCalledTimes(1);
    });

    it('clears timeout on unmount to avoid running after cleanup', () => {
      mockGetAuthToken.mockReturnValue('tok');
      mockGetConnectionDiagnostics.mockReturnValue({ isConnected: false, hasSocket: false, isConnecting: false });

      const { unmount } = renderHook(() => useSocketIOMessaging());
      mockReconnect.mockClear();

      unmount();

      // Advance timers — callback should NOT fire because timeout was cleared
      act(() => { jest.advanceTimersByTime(1500); });

      expect(mockReconnect).not.toHaveBeenCalled();
    });
  });

  // ── Line 126: onTranslation callback wrapper ──────────────────────────────

  describe('onTranslation callback (line 126)', () => {
    it('calls the provided onTranslation with messageId and spread translations array', () => {
      const onTranslation = jest.fn();
      const translations = [
        { language: 'fr', text: 'Bonjour' },
        { language: 'es', text: 'Hola' },
      ];

      renderHook(() => useSocketIOMessaging({ onTranslation }));

      expect(capturedTranslationCb).not.toBeNull();

      act(() => {
        capturedTranslationCb!({ messageId: 'msg-abc', translations });
      });

      expect(onTranslation).toHaveBeenCalledTimes(1);
      expect(onTranslation).toHaveBeenCalledWith('msg-abc', translations);
    });

    it('passes a new array copy (spread) of translations, not the original reference', () => {
      const onTranslation = jest.fn();
      const originalTranslations = [{ language: 'fr', text: 'Bonjour' }];

      renderHook(() => useSocketIOMessaging({ onTranslation }));

      act(() => {
        capturedTranslationCb!({ messageId: 'msg-1', translations: originalTranslations });
      });

      const receivedTranslations = onTranslation.mock.calls[0][1];
      // The spread creates a new array
      expect(receivedTranslations).not.toBe(originalTranslations);
      expect(receivedTranslations).toEqual(originalTranslations);
    });

    it('handles empty translations array', () => {
      const onTranslation = jest.fn();

      renderHook(() => useSocketIOMessaging({ onTranslation }));

      act(() => {
        capturedTranslationCb!({ messageId: 'msg-empty', translations: [] });
      });

      expect(onTranslation).toHaveBeenCalledWith('msg-empty', []);
    });
  });

  // ── Line 134: event.displayName || event.username fallback ───────────────

  describe('onUserTyping displayName/username fallback (line 134)', () => {
    it('uses displayName when present', () => {
      const onUserTyping = jest.fn();

      renderHook(() => useSocketIOMessaging({ onUserTyping }));

      act(() => {
        capturedTypingCb!({
          userId: 'u-1',
          username: 'alice',
          displayName: 'Alice Smith',
          isTyping: true,
          conversationId: 'conv-1',
        });
      });

      expect(onUserTyping).toHaveBeenCalledWith('u-1', 'Alice Smith', true, 'conv-1');
    });

    it('falls back to username when displayName is absent', () => {
      const onUserTyping = jest.fn();

      renderHook(() => useSocketIOMessaging({ onUserTyping }));

      act(() => {
        capturedTypingCb!({
          userId: 'u-2',
          username: 'bob',
          displayName: undefined,
          isTyping: false,
          conversationId: 'conv-2',
        });
      });

      expect(onUserTyping).toHaveBeenCalledWith('u-2', 'bob', false, 'conv-2');
    });

    it('falls back to username when displayName is empty string', () => {
      const onUserTyping = jest.fn();

      renderHook(() => useSocketIOMessaging({ onUserTyping }));

      act(() => {
        capturedTypingCb!({
          userId: 'u-3',
          username: 'carol',
          displayName: '',
          isTyping: true,
          conversationId: 'conv-3',
        });
      });

      // '' is falsy → falls back to 'carol'
      expect(onUserTyping).toHaveBeenCalledWith('u-3', 'carol', true, 'conv-3');
    });

    it('defaults isTyping to false when not provided', () => {
      const onUserTyping = jest.fn();

      renderHook(() => useSocketIOMessaging({ onUserTyping }));

      act(() => {
        capturedTypingCb!({
          userId: 'u-4',
          username: 'dave',
          displayName: 'Dave',
          isTyping: undefined,
          conversationId: 'conv-4',
        });
      });

      expect(onUserTyping).toHaveBeenCalledWith('u-4', 'Dave', false, 'conv-4');
    });
  });

  // ── Line 141: onUserStatus invocation ────────────────────────────────────

  describe('onUserStatus callback (line 141)', () => {
    it('calls onUserStatus with userId, username, isOnline', () => {
      const onUserStatus = jest.fn();

      renderHook(() => useSocketIOMessaging({ onUserStatus }));

      act(() => {
        capturedUserStatusCb!({ userId: 'u-1', username: 'alice', isOnline: true });
      });

      expect(onUserStatus).toHaveBeenCalledWith('u-1', 'alice', true, undefined);
    });

    it('calls onUserStatus with isOnline: false for offline transitions', () => {
      const onUserStatus = jest.fn();

      renderHook(() => useSocketIOMessaging({ onUserStatus }));

      act(() => {
        capturedUserStatusCb!({ userId: 'u-2', username: 'bob', isOnline: false });
      });

      expect(onUserStatus).toHaveBeenCalledWith('u-2', 'bob', false, undefined);
    });

    it('forwards the event lastActiveAt so consumers can refresh stale presence timestamps', () => {
      const onUserStatus = jest.fn();
      const lastActiveAt = new Date('2026-07-08T10:00:00Z');

      renderHook(() => useSocketIOMessaging({ onUserStatus }));

      act(() => {
        capturedUserStatusCb!({ userId: 'u-3', username: 'carol', isOnline: true, lastActiveAt });
      });

      expect(onUserStatus).toHaveBeenCalledWith('u-3', 'carol', true, lastActiveAt);
    });

    it('does not call onUserStatus when callback not provided', () => {
      // Renders without onUserStatus — service callback registered but onUserStatus not called
      // This is covered by the `if (onUserStatus)` guard
      renderHook(() => useSocketIOMessaging({}));

      // capturedUserStatusCb is the wrapper function — calling it should not throw
      if (capturedUserStatusCb) {
        expect(() => capturedUserStatusCb!({ userId: 'u', username: 'x', isOnline: true })).not.toThrow();
      }
    });
  });

  // ── Lines 147-148: onConversationStats if-block ───────────────────────────

  describe('onConversationStats (lines 147-148)', () => {
    it('registers onConversationStats listener and delivers data', () => {
      const onConversationStats = jest.fn();

      renderHook(() => useSocketIOMessaging({ onConversationStats }));

      expect(mockOnConversationStats).toHaveBeenCalledTimes(1);

      const statsData = { totalMessages: 42, activeUsers: 5 };
      act(() => {
        capturedConversationStatsCb!(statsData);
      });

      expect(onConversationStats).toHaveBeenCalledWith(statsData);
    });

    it('does not register onConversationStats listener when callback not provided', () => {
      renderHook(() => useSocketIOMessaging({}));

      expect(mockOnConversationStats).not.toHaveBeenCalled();
    });
  });

  // ── Lines 152-153: onConversationOnlineStats if-block ─────────────────────

  describe('onConversationOnlineStats (lines 152-153)', () => {
    it('registers onConversationOnlineStats listener and delivers data', () => {
      const onConversationOnlineStats = jest.fn();

      renderHook(() => useSocketIOMessaging({ onConversationOnlineStats }));

      expect(mockOnConversationOnlineStats).toHaveBeenCalledTimes(1);

      const onlineStats = { onlineCount: 3, userIds: ['u1', 'u2', 'u3'] };
      act(() => {
        capturedConversationOnlineStatsCb!(onlineStats);
      });

      expect(onConversationOnlineStats).toHaveBeenCalledWith(onlineStats);
    });

    it('does not register onConversationOnlineStats listener when callback not provided', () => {
      renderHook(() => useSocketIOMessaging({}));

      expect(mockOnConversationOnlineStats).not.toHaveBeenCalled();
    });
  });

  // ── Line 167: "return prev" branch in status-change handler ──────────────
  //
  // In the hook, ÉTAPE 4 uses:
  //   const sync = () => {
  //     const diag = meeshySocketIOService.getConnectionDiagnostics();
  //     setConnectionStatus(prev => {
  //       if (prev.isConnected === diag.isConnected && prev.hasSocket === diag.hasSocket) return prev;
  //       return { isConnected: diag.isConnected, hasSocket: diag.hasSocket };
  //     });
  //   };
  //   return meeshySocketIOService.onStatusChange(sync);
  //
  // So capturedStatusChangeCb IS sync(); calling it re-reads getConnectionDiagnostics().

  describe('status change handler – stable reference (line 167)', () => {
    it('does NOT trigger re-render when diagnostics are unchanged', () => {
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: true,
        hasSocket: true,
        isConnecting: false,
      });

      const { result } = renderHook(() => useSocketIOMessaging());
      const statusBefore = result.current.connectionStatus;

      // Trigger sync() — diagnostics still return same values
      act(() => {
        capturedStatusChangeCb!({} as any);  // argument is ignored; sync() re-reads getConnectionDiagnostics
      });

      // Same object reference means "return prev" path taken (no re-render)
      expect(result.current.connectionStatus).toBe(statusBefore);
    });

    it('DOES produce new object when diagnostics change', () => {
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: true,
        hasSocket: true,
        isConnecting: false,
      });

      const { result } = renderHook(() => useSocketIOMessaging());
      const statusBefore = result.current.connectionStatus;

      // Change diagnostics, then trigger sync()
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: false,
        hasSocket: false,
        isConnecting: false,
      });

      act(() => {
        capturedStatusChangeCb!({} as any);
      });

      expect(result.current.connectionStatus).not.toBe(statusBefore);
      expect(result.current.connectionStatus.isConnected).toBe(false);
      expect(result.current.connectionStatus.hasSocket).toBe(false);
    });
  });

  // ── Combined scenarios ─────────────────────────────────────────────────────

  describe('all event callbacks wired simultaneously', () => {
    it('sets up all callbacks without conflict', () => {
      const onTranslation = jest.fn();
      const onUserTyping = jest.fn();
      const onUserStatus = jest.fn();
      const onConversationStats = jest.fn();
      const onConversationOnlineStats = jest.fn();

      renderHook(() => useSocketIOMessaging({
        onTranslation,
        onUserTyping,
        onUserStatus,
        onConversationStats,
        onConversationOnlineStats,
      }));

      act(() => {
        capturedTranslationCb!({ messageId: 'm1', translations: [{ language: 'fr', text: 'ok' }] });
        capturedTypingCb!({ userId: 'u1', username: 'alice', displayName: 'Alice', isTyping: true, conversationId: 'c1' });
        capturedUserStatusCb!({ userId: 'u2', username: 'bob', isOnline: false });
        capturedConversationStatsCb!({ count: 10 });
        capturedConversationOnlineStatsCb!({ onlineCount: 2 });
      });

      expect(onTranslation).toHaveBeenCalledWith('m1', [{ language: 'fr', text: 'ok' }]);
      expect(onUserTyping).toHaveBeenCalledWith('u1', 'Alice', true, 'c1');
      expect(onUserStatus).toHaveBeenCalledWith('u2', 'bob', false, undefined);
      expect(onConversationStats).toHaveBeenCalledWith({ count: 10 });
      expect(onConversationOnlineStats).toHaveBeenCalledWith({ onlineCount: 2 });
    });
  });

  // ── startTyping / stopTyping no-op branch (lines 221-235) ─────────────────
  //
  // Coverage gaps: when normalizedId=null AND conversationId=undefined/null,
  // `idToUse` is falsy → the `if (idToUse)` guard is false → startTyping/stopTyping NOT called.
  // Also: when normalizedId=null but conversationId IS set, idToUse = conversationId (covered elsewhere).
  // Here we cover the "both null" branch.

  describe('startTyping / stopTyping no-op when no conversationId available', () => {
    it('does NOT call startTyping when both normalizedId and conversationId are absent', () => {
      mockGetCurrentConversationId.mockReturnValue(null);

      const { result } = renderHook(() => useSocketIOMessaging({ conversationId: undefined }));

      act(() => { result.current.startTyping(); });

      expect(mockStartTyping).not.toHaveBeenCalled();
    });

    it('does NOT call stopTyping when both normalizedId and conversationId are absent', () => {
      mockGetCurrentConversationId.mockReturnValue(null);

      const { result } = renderHook(() => useSocketIOMessaging({ conversationId: undefined }));

      act(() => { result.current.stopTyping(); });

      expect(mockStopTyping).not.toHaveBeenCalled();
    });

    it('uses normalizedId from service when conversationId is null', () => {
      mockGetCurrentConversationId.mockReturnValue('normalized-id');

      const { result } = renderHook(() => useSocketIOMessaging({ conversationId: null }));

      act(() => { result.current.startTyping(); });

      expect(mockStartTyping).toHaveBeenCalledWith('normalized-id');
    });

    it('falls back to conversationId when normalizedId is null', () => {
      mockGetCurrentConversationId.mockReturnValue(null);

      const { result } = renderHook(() => useSocketIOMessaging({ conversationId: 'conv-fallback' }));

      act(() => { result.current.startTyping(); });

      expect(mockStartTyping).toHaveBeenCalledWith('conv-fallback');
    });
  });
});
