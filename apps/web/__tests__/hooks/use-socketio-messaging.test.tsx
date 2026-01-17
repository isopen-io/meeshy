/**
 * Tests for useSocketIOMessaging hook
 *
 * Tests cover:
 * - Connection state management
 * - Conversation join/leave
 * - Message sending
 * - Message editing
 * - Message deletion
 * - Typing indicators
 * - Event listeners setup and cleanup
 * - Reconnection logic
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useSocketIOMessaging } from '@/hooks/use-socketio-messaging';

// Mock auth manager
const mockGetAuthToken = jest.fn(() => 'auth-token-123');
const mockGetAnonymousSession = jest.fn(() => null);

jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockGetAuthToken(),
    getAnonymousSession: () => mockGetAnonymousSession(),
  },
}));

// Mock Socket.IO service
const mockJoinConversation = jest.fn();
const mockLeaveConversation = jest.fn();
const mockSendMessage = jest.fn();
const mockEditMessage = jest.fn();
const mockDeleteMessage = jest.fn();
const mockStartTyping = jest.fn();
const mockStopTyping = jest.fn();
const mockReconnect = jest.fn();
const mockSetCurrentUser = jest.fn();
const mockGetCurrentConversationId = jest.fn(() => null);
const mockGetConnectionDiagnostics = jest.fn(() => ({
  isConnected: true,
  hasSocket: true,
  isConnecting: false,
}));

const mockOnNewMessage = jest.fn(() => jest.fn());
const mockOnMessageEdited = jest.fn(() => jest.fn());
const mockOnMessageDeleted = jest.fn(() => jest.fn());
const mockOnTranslation = jest.fn(() => jest.fn());
const mockOnTyping = jest.fn(() => jest.fn());
const mockOnUserStatus = jest.fn(() => jest.fn());
const mockOnConversationStats = jest.fn(() => jest.fn());
const mockOnConversationOnlineStats = jest.fn(() => jest.fn());

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    joinConversation: (...args: any[]) => mockJoinConversation(...args),
    leaveConversation: (...args: any[]) => mockLeaveConversation(...args),
    sendMessage: (...args: any[]) => mockSendMessage(...args),
    editMessage: (...args: any[]) => mockEditMessage(...args),
    deleteMessage: (...args: any[]) => mockDeleteMessage(...args),
    startTyping: (...args: any[]) => mockStartTyping(...args),
    stopTyping: (...args: any[]) => mockStopTyping(...args),
    reconnect: () => mockReconnect(),
    setCurrentUser: (...args: any[]) => mockSetCurrentUser(...args),
    getCurrentConversationId: () => mockGetCurrentConversationId(),
    getConnectionDiagnostics: () => mockGetConnectionDiagnostics(),
    onNewMessage: (cb: any) => mockOnNewMessage(cb),
    onMessageEdited: (cb: any) => mockOnMessageEdited(cb),
    onMessageDeleted: (cb: any) => mockOnMessageDeleted(cb),
    onTranslation: (cb: any) => mockOnTranslation(cb),
    onTyping: (cb: any) => mockOnTyping(cb),
    onUserStatus: (cb: any) => mockOnUserStatus(cb),
    onConversationStats: (cb: any) => mockOnConversationStats(cb),
    onConversationOnlineStats: (cb: any) => mockOnConversationOnlineStats(cb),
  },
}));

describe('useSocketIOMessaging', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    systemLanguage: 'en',
  };

  const mockConversationId = 'conv-456';

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock implementations
    mockSendMessage.mockResolvedValue(true);
    mockEditMessage.mockResolvedValue(true);
    mockDeleteMessage.mockResolvedValue(true);

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
    jest.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Initial State', () => {
    it('should return connection status', () => {
      const { result } = renderHook(() => useSocketIOMessaging());

      expect(result.current.isConnected).toBeDefined();
      expect(result.current.connectionStatus).toBeDefined();
    });

    it('should return status object with isConnected and hasSocket', () => {
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: true,
        hasSocket: true,
      });

      const { result } = renderHook(() => useSocketIOMessaging());

      expect(result.current.status).toHaveProperty('isConnected');
      expect(result.current.status).toHaveProperty('hasSocket');
    });
  });

  describe('Connection Management', () => {
    it('should attempt reconnection on mount if token available', async () => {
      mockGetAuthToken.mockReturnValue('token-123');

      renderHook(() => useSocketIOMessaging());

      await waitFor(() => {
        expect(mockReconnect).toHaveBeenCalled();
      });
    });

    it('should set current user when provided', () => {
      renderHook(() =>
        useSocketIOMessaging({ currentUser: mockUser })
      );

      expect(mockSetCurrentUser).toHaveBeenCalledWith(mockUser);
    });

    it('should attempt reconnection if anonymous session available', async () => {
      mockGetAuthToken.mockReturnValue(null);
      mockGetAnonymousSession.mockReturnValue({ token: 'anon-token' });

      renderHook(() => useSocketIOMessaging());

      await waitFor(() => {
        expect(mockReconnect).toHaveBeenCalled();
      });
    });
  });

  describe('Conversation Join/Leave', () => {
    it('should join conversation when conversationId provided', () => {
      renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      expect(mockJoinConversation).toHaveBeenCalledWith(mockConversationId);
    });

    it('should leave conversation on unmount', () => {
      const { unmount } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      unmount();

      expect(mockLeaveConversation).toHaveBeenCalledWith(mockConversationId);
    });

    it('should not join if conversationId is null', () => {
      renderHook(() =>
        useSocketIOMessaging({ conversationId: null })
      );

      expect(mockJoinConversation).not.toHaveBeenCalled();
    });

    it('should leave and rejoin when conversationId changes', () => {
      const { rerender } = renderHook(
        ({ conversationId }) => useSocketIOMessaging({ conversationId }),
        { initialProps: { conversationId: 'conv-1' } }
      );

      expect(mockJoinConversation).toHaveBeenCalledWith('conv-1');

      rerender({ conversationId: 'conv-2' });

      expect(mockLeaveConversation).toHaveBeenCalledWith('conv-1');
      expect(mockJoinConversation).toHaveBeenCalledWith('conv-2');
    });
  });

  describe('Send Message', () => {
    it('should send message with content and language', async () => {
      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      let success: boolean = false;

      await act(async () => {
        success = await result.current.sendMessage('Hello world', 'en');
      });

      expect(success).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockConversationId,
        'Hello world',
        'en',
        undefined,
        undefined,
        undefined,
        undefined
      );
    });

    it('should send message with replyToId', async () => {
      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.sendMessage('Reply', 'en', 'original-msg-id');
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        mockConversationId,
        'Reply',
        'en',
        'original-msg-id',
        undefined,
        undefined,
        undefined
      );
    });

    it('should send message with mentions', async () => {
      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.sendMessage('Hey @user', 'en', undefined, ['user-789']);
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        mockConversationId,
        'Hey @user',
        'en',
        undefined,
        ['user-789'],
        undefined,
        undefined
      );
    });

    it('should send message with attachments', async () => {
      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.sendMessage(
          'Check this',
          'en',
          undefined,
          undefined,
          ['attach-1'],
          ['image/png']
        );
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        mockConversationId,
        'Check this',
        'en',
        undefined,
        undefined,
        ['attach-1'],
        ['image/png']
      );
    });

    it('should return false if no conversationId', async () => {
      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: undefined })
      );

      let success: boolean = true;

      await act(async () => {
        success = await result.current.sendMessage('Hello', 'en');
      });

      expect(success).toBe(false);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Edit Message', () => {
    it('should edit message', async () => {
      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      let success: boolean = false;

      await act(async () => {
        success = await result.current.editMessage('msg-123', 'Updated content');
      });

      expect(success).toBe(true);
      expect(mockEditMessage).toHaveBeenCalledWith('msg-123', 'Updated content');
    });
  });

  describe('Delete Message', () => {
    it('should delete message', async () => {
      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      let success: boolean = false;

      await act(async () => {
        success = await result.current.deleteMessage('msg-123');
      });

      expect(success).toBe(true);
      expect(mockDeleteMessage).toHaveBeenCalledWith('msg-123');
    });
  });

  describe('Typing Indicators', () => {
    it('should start typing', () => {
      mockGetCurrentConversationId.mockReturnValue(mockConversationId);

      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      act(() => {
        result.current.startTyping();
      });

      expect(mockStartTyping).toHaveBeenCalledWith(mockConversationId);
    });

    it('should stop typing', () => {
      mockGetCurrentConversationId.mockReturnValue(mockConversationId);

      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      act(() => {
        result.current.stopTyping();
      });

      expect(mockStopTyping).toHaveBeenCalledWith(mockConversationId);
    });

    it('should use normalized conversation ID if available', () => {
      mockGetCurrentConversationId.mockReturnValue('normalized-conv-id');

      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      act(() => {
        result.current.startTyping();
      });

      expect(mockStartTyping).toHaveBeenCalledWith('normalized-conv-id');
    });
  });

  describe('Event Listeners', () => {
    it('should setup onNewMessage listener', () => {
      const onNewMessage = jest.fn();

      renderHook(() =>
        useSocketIOMessaging({ onNewMessage })
      );

      expect(mockOnNewMessage).toHaveBeenCalled();
    });

    it('should setup onMessageEdited listener', () => {
      const onMessageEdited = jest.fn();

      renderHook(() =>
        useSocketIOMessaging({ onMessageEdited })
      );

      expect(mockOnMessageEdited).toHaveBeenCalled();
    });

    it('should setup onMessageDeleted listener', () => {
      const onMessageDeleted = jest.fn();

      renderHook(() =>
        useSocketIOMessaging({ onMessageDeleted })
      );

      expect(mockOnMessageDeleted).toHaveBeenCalled();
    });

    it('should setup onUserTyping listener', () => {
      const onUserTyping = jest.fn();

      renderHook(() =>
        useSocketIOMessaging({ onUserTyping })
      );

      expect(mockOnTyping).toHaveBeenCalled();
    });

    it('should setup onUserStatus listener', () => {
      const onUserStatus = jest.fn();

      renderHook(() =>
        useSocketIOMessaging({ onUserStatus })
      );

      expect(mockOnUserStatus).toHaveBeenCalled();
    });

    it('should setup onTranslation listener', () => {
      const onTranslation = jest.fn();

      renderHook(() =>
        useSocketIOMessaging({ onTranslation })
      );

      expect(mockOnTranslation).toHaveBeenCalled();
    });

    it('should cleanup listeners on unmount', () => {
      const unsubNewMessage = jest.fn();
      const unsubEdited = jest.fn();
      const unsubDeleted = jest.fn();

      mockOnNewMessage.mockReturnValue(unsubNewMessage);
      mockOnMessageEdited.mockReturnValue(unsubEdited);
      mockOnMessageDeleted.mockReturnValue(unsubDeleted);

      const { unmount } = renderHook(() =>
        useSocketIOMessaging({
          onNewMessage: jest.fn(),
          onMessageEdited: jest.fn(),
          onMessageDeleted: jest.fn(),
        })
      );

      unmount();

      expect(unsubNewMessage).toHaveBeenCalled();
      expect(unsubEdited).toHaveBeenCalled();
      expect(unsubDeleted).toHaveBeenCalled();
    });
  });

  describe('Reconnect', () => {
    it('should expose reconnect function', () => {
      const { result } = renderHook(() => useSocketIOMessaging());

      expect(typeof result.current.reconnect).toBe('function');

      act(() => {
        result.current.reconnect();
      });

      expect(mockReconnect).toHaveBeenCalled();
    });
  });

  describe('Get Diagnostics', () => {
    it('should return diagnostics with connection info', () => {
      const { result } = renderHook(() =>
        useSocketIOMessaging({
          conversationId: mockConversationId,
          currentUser: mockUser,
        })
      );

      const diagnostics = result.current.getDiagnostics();

      expect(diagnostics).toHaveProperty('isConnected');
      expect(diagnostics).toHaveProperty('conversationId', mockConversationId);
      expect(diagnostics).toHaveProperty('hasCurrentUser', true);
    });

    it('should merge service diagnostics', () => {
      mockGetConnectionDiagnostics.mockReturnValue({
        isConnected: true,
        hasSocket: true,
        socketId: 'socket-123',
      });

      const { result } = renderHook(() =>
        useSocketIOMessaging({ conversationId: mockConversationId })
      );

      const diagnostics = result.current.getDiagnostics();

      expect(diagnostics.socketId).toBe('socket-123');
    });
  });
});
