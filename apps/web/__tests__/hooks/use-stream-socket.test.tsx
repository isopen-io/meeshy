/**
 * Tests for useStreamSocket hook
 *
 * Focus: remote typing indicator safety timeout. A dropped `typing:stop`
 * event (network blip that doesn't trigger a socket disconnect, sender tab
 * killed before its own auto-stop timer fires...) must not leave "X is
 * typing…" stuck until the socket's ping-timeout disconnect (~45-60s).
 */

import { renderHook, act } from '@testing-library/react';
import { useStreamSocket } from '@/hooks/use-stream-socket';
import type { User } from '@meeshy/shared/types';

jest.useFakeTimers();

const mockStartTyping = jest.fn();
const mockStopTyping = jest.fn();
const mockSendMessage = jest.fn();
const mockReconnect = jest.fn();
const mockGetDiagnostics = jest.fn();

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: (options: any) => {
    if (options.onUserTyping) {
      (global as any).__mockOnUserTyping = options.onUserTyping;
    }
    return {
      isConnected: true,
      sendMessage: mockSendMessage,
      startTyping: mockStartTyping,
      stopTyping: mockStopTyping,
      reconnect: mockReconnect,
      getDiagnostics: mockGetDiagnostics,
      connectionStatus: { isConnected: true, hasSocket: true },
    };
  },
}));

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    onConversationJoined: jest.fn(() => () => {}),
    getCurrentConversationId: jest.fn(() => 'conv-123'),
  },
}));

describe('useStreamSocket', () => {
  const mockUser: User = {
    id: 'user-123',
    username: 'me',
  } as User;

  beforeEach(() => {
    jest.clearAllMocks();
  });

  afterEach(() => {
    jest.clearAllTimers();
  });

  const renderStreamSocketHook = () =>
    renderHook(() =>
      useStreamSocket({
        conversationId: 'conv-123',
        user: mockUser,
        activeUsers: [],
        isLoadingTranslations: false,
        onNewMessage: jest.fn(),
        onMessageEdited: jest.fn(),
        onMessageDeleted: jest.fn(),
        onTranslation: jest.fn(),
        onActiveUsersUpdate: jest.fn(),
      })
    );

  const emitUserTyping = (userId: string, username: string, isTyping: boolean, conversationId = 'conv-123') => {
    act(() => {
      (global as any).__mockOnUserTyping(userId, username, isTyping, conversationId);
    });
  };

  it('adds a remote typing user', () => {
    const { result } = renderStreamSocketHook();

    emitUserTyping('user-456', 'otheruser', true);

    expect(result.current.typingUsers).toHaveLength(1);
    expect(result.current.typingUsers[0].id).toBe('user-456');
  });

  it('removes a remote typing user on explicit stop', () => {
    const { result } = renderStreamSocketHook();

    emitUserTyping('user-456', 'otheruser', true);
    emitUserTyping('user-456', 'otheruser', false);

    expect(result.current.typingUsers).toHaveLength(0);
  });

  it('auto-removes a remote typing user if no stop event arrives (safety timeout)', () => {
    const { result } = renderStreamSocketHook();

    emitUserTyping('user-456', 'otheruser', true);
    expect(result.current.typingUsers).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(8000);
    });

    expect(result.current.typingUsers).toHaveLength(0);
  });

  it('refreshes the safety timeout on a repeated typing:true keepalive', () => {
    const { result } = renderStreamSocketHook();

    emitUserTyping('user-456', 'otheruser', true);

    act(() => {
      jest.advanceTimersByTime(6000);
    });

    emitUserTyping('user-456', 'otheruser', true);

    act(() => {
      jest.advanceTimersByTime(6000);
    });

    expect(result.current.typingUsers).toHaveLength(1);

    act(() => {
      jest.advanceTimersByTime(2000);
    });

    expect(result.current.typingUsers).toHaveLength(0);
  });

  it('clears pending safety timeouts on unmount', () => {
    const { unmount } = renderStreamSocketHook();

    emitUserTyping('user-456', 'otheruser', true);

    unmount();

    act(() => {
      jest.advanceTimersByTime(8000);
    });
  });
});
