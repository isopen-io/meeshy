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
    if (options.onUserStatus) {
      (global as any).__mockOnUserStatus = options.onUserStatus;
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
  // ─── Présence : la liste des présents suit `user:status` ───────────────────
  //
  // Elle est SEMÉE au join par `conversation:stats` (`stats.onlineUsers`). Son
  // seul autre écrivain écoutait `conversation:online-stats`, canal que la
  // passerelle n'a jamais émis et que le cycle 77 a retiré — laissant la liste
  // avec un unique écrivain et ce gestionnaire-ci VIDE. Qui arrivait après vous
  // n'apparaissait pas ; qui partait restait affiché toute la session.

  const renderWithActiveUsers = (activeUsers: User[], onActiveUsersUpdate: jest.Mock) =>
    renderHook(() =>
      useStreamSocket({
        conversationId: 'conv-123',
        user: mockUser,
        activeUsers,
        isLoadingTranslations: false,
        onNewMessage: jest.fn(),
        onMessageEdited: jest.fn(),
        onMessageDeleted: jest.fn(),
        onTranslation: jest.fn(),
        onActiveUsersUpdate,
      })
    );

  const emitUserStatus = (userId: string, username: string, isOnline: boolean) => {
    act(() => {
      (global as any).__mockOnUserStatus(userId, username, isOnline);
    });
  };

  it('adds a newly online user to the active list', () => {
    const onActiveUsersUpdate = jest.fn();
    renderWithActiveUsers([], onActiveUsersUpdate);

    emitUserStatus('user-456', 'otheruser', true);

    expect(onActiveUsersUpdate).toHaveBeenCalledTimes(1);
    const next = onActiveUsersUpdate.mock.calls[0][0] as User[];
    expect(next.map(u => u.id)).toEqual(['user-456']);
    expect(next[0].username).toBe('otheruser');
  });

  it('removes a user from the active list when they go offline', () => {
    const onActiveUsersUpdate = jest.fn();
    const known = { id: 'user-456', username: 'otheruser' } as User;
    renderWithActiveUsers([known], onActiveUsersUpdate);

    emitUserStatus('user-456', 'otheruser', false);

    expect(onActiveUsersUpdate).toHaveBeenCalledTimes(1);
    expect((onActiveUsersUpdate.mock.calls[0][0] as User[]).map(u => u.id)).toEqual([]);
  });

  // Confidentialité de la présence : la passerelle sert une présence MASQUÉE
  // comme `isOnline:false` + `lastActiveAt:null` sur `user:status`. La liste
  // des présents ne lit que `isOnline` — le `null` transporté à côté ne doit
  // ni retenir l'entrée ni la re-dater : la pastille disparaît.
  it('retire un utilisateur dont la présence arrive MASQUÉE (isOnline:false, lastActiveAt:null)', () => {
    const onActiveUsersUpdate = jest.fn();
    const known = { id: 'user-456', username: 'otheruser', isOnline: true, lastActiveAt: new Date() } as User;
    renderWithActiveUsers([known], onActiveUsersUpdate);

    act(() => {
      (global as any).__mockOnUserStatus('user-456', 'otheruser', false, null);
    });

    expect(onActiveUsersUpdate).toHaveBeenCalledTimes(1);
    expect((onActiveUsersUpdate.mock.calls[0][0] as User[]).map(u => u.id)).toEqual([]);
  });

  // Deux arrivées dans le MÊME tick. `activeUsersRef` ne se resynchronise que
  // par l'effet monté sur la prop `activeUsers` — donc sans réécriture immédiate
  // de la ref, les deux trames liraient la même liste d'avant et la seconde
  // écraserait la première : deux personnes qui se connectent ensemble, une
  // seule qui apparaît.
  it('keeps both arrivals when two presence frames land in the same tick', () => {
    const onActiveUsersUpdate = jest.fn();
    renderWithActiveUsers([], onActiveUsersUpdate);

    emitUserStatus('user-456', 'alice', true);
    emitUserStatus('user-789', 'bob', true);

    expect(onActiveUsersUpdate).toHaveBeenCalledTimes(2);
    const last = onActiveUsersUpdate.mock.calls[1][0] as User[];
    expect(last.map(u => u.id)).toEqual(['user-456', 'user-789']);
  });

  // Trois no-ops, et chacun compte : sans eux le gestionnaire remplacerait la
  // liste à CHAQUE trame de présence, et chaque remplacement remonte au parent.
  it('ignores its own status, already-known arrivals and unknown departures', () => {
    const onActiveUsersUpdate = jest.fn();
    const known = { id: 'user-456', username: 'otheruser' } as User;
    renderWithActiveUsers([known], onActiveUsersUpdate);

    emitUserStatus(mockUser.id, 'me', true);
    emitUserStatus('user-456', 'otheruser', true);
    emitUserStatus('user-789', 'ghost', false);

    expect(onActiveUsersUpdate).not.toHaveBeenCalled();
  });
});
