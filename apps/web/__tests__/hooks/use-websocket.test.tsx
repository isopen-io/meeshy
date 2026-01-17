/**
 * Tests for useWebSocket hook
 *
 * Tests cover:
 * - Connection state management
 * - Conversation join/leave
 * - Message operations (send, edit, delete)
 * - Typing indicators
 * - Event listeners
 * - Reconnection
 * - Diagnostics
 */

import { renderHook, act } from '@testing-library/react';
import { useWebSocket } from '@/hooks/use-websocket';

// Mock WebSocket service
const mockJoinConversation = jest.fn();
const mockLeaveConversation = jest.fn();
const mockSendMessage = jest.fn();
const mockSendMessageWithAttachments = jest.fn();
const mockEditMessage = jest.fn();
const mockDeleteMessage = jest.fn();
const mockStartTyping = jest.fn();
const mockStopTyping = jest.fn();
const mockReconnect = jest.fn();
const mockIsConnected = jest.fn(() => true);
const mockGetDiagnostics = jest.fn(() => ({}));
const mockGetConnectionStatus = jest.fn(() => 'connected');

const mockOnNewMessage = jest.fn(() => jest.fn());
const mockOnMessageEdited = jest.fn(() => jest.fn());
const mockOnMessageDeleted = jest.fn(() => jest.fn());
const mockOnTranslation = jest.fn(() => jest.fn());
const mockOnTyping = jest.fn(() => jest.fn());
const mockOnUserStatus = jest.fn(() => jest.fn());

jest.mock('@/services/websocket.service', () => ({
  webSocketService: {
    joinConversation: (...args: any[]) => mockJoinConversation(...args),
    leaveConversation: (...args: any[]) => mockLeaveConversation(...args),
    sendMessage: (...args: any[]) => mockSendMessage(...args),
    sendMessageWithAttachments: (...args: any[]) => mockSendMessageWithAttachments(...args),
    editMessage: (...args: any[]) => mockEditMessage(...args),
    deleteMessage: (...args: any[]) => mockDeleteMessage(...args),
    startTyping: (...args: any[]) => mockStartTyping(...args),
    stopTyping: (...args: any[]) => mockStopTyping(...args),
    reconnect: () => mockReconnect(),
    isConnected: () => mockIsConnected(),
    getDiagnostics: () => mockGetDiagnostics(),
    getConnectionStatus: () => mockGetConnectionStatus(),
    onNewMessage: (cb: any) => mockOnNewMessage(cb),
    onMessageEdited: (cb: any) => mockOnMessageEdited(cb),
    onMessageDeleted: (cb: any) => mockOnMessageDeleted(cb),
    onTranslation: (cb: any) => mockOnTranslation(cb),
    onTyping: (cb: any) => mockOnTyping(cb),
    onUserStatus: (cb: any) => mockOnUserStatus(cb),
  },
}));

describe('useWebSocket', () => {
  const mockConversationId = 'conv-123';

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useFakeTimers();

    // Default mock implementations
    mockSendMessage.mockResolvedValue(true);
    mockSendMessageWithAttachments.mockResolvedValue(true);
    mockEditMessage.mockResolvedValue(true);
    mockDeleteMessage.mockResolvedValue(true);

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  describe('Initial State', () => {
    it('should return isConnected from service after polling', () => {
      mockIsConnected.mockReturnValue(true);

      const { result } = renderHook(() => useWebSocket());

      // Hook initializes to false and polls every 1000ms
      // Advance timer to trigger polling
      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.isConnected).toBe(true);
    });

    it('should return connection status', () => {
      mockGetConnectionStatus.mockReturnValue('connecting');

      const { result } = renderHook(() => useWebSocket());

      expect(result.current.status).toBe('connecting');
    });
  });

  describe('Conversation Join/Leave', () => {
    it('should join conversation when conversationId provided', () => {
      renderHook(() =>
        useWebSocket({ conversationId: mockConversationId })
      );

      expect(mockJoinConversation).toHaveBeenCalledWith(mockConversationId);
    });

    it('should leave conversation on unmount', () => {
      const { unmount } = renderHook(() =>
        useWebSocket({ conversationId: mockConversationId })
      );

      unmount();

      expect(mockLeaveConversation).toHaveBeenCalledWith(mockConversationId);
    });

    it('should not join if conversationId is null', () => {
      renderHook(() =>
        useWebSocket({ conversationId: null })
      );

      expect(mockJoinConversation).not.toHaveBeenCalled();
    });

    it('should rejoin when conversationId changes', () => {
      const { rerender } = renderHook(
        ({ conversationId }) => useWebSocket({ conversationId }),
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
        useWebSocket({ conversationId: mockConversationId })
      );

      let success: boolean = false;

      await act(async () => {
        success = await result.current.sendMessage('Hello', 'en');
      });

      expect(success).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(
        mockConversationId,
        'Hello',
        'en',
        undefined
      );
    });

    it('should send message with replyToId', async () => {
      const { result } = renderHook(() =>
        useWebSocket({ conversationId: mockConversationId })
      );

      await act(async () => {
        await result.current.sendMessage('Reply', 'en', 'reply-to-id');
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        mockConversationId,
        'Reply',
        'en',
        'reply-to-id'
      );
    });

    it('should return false if no conversationId', async () => {
      const { result } = renderHook(() =>
        useWebSocket({ conversationId: undefined })
      );

      let success: boolean = true;

      await act(async () => {
        success = await result.current.sendMessage('Hello', 'en');
      });

      expect(success).toBe(false);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });
  });

  describe('Send Message With Attachments', () => {
    it('should send message with attachments', async () => {
      const { result } = renderHook(() =>
        useWebSocket({ conversationId: mockConversationId })
      );

      let success: boolean = false;

      await act(async () => {
        success = await result.current.sendMessageWithAttachments(
          'Check this',
          ['attach-1'],
          'en',
          'reply-id'
        );
      });

      expect(success).toBe(true);
      expect(mockSendMessageWithAttachments).toHaveBeenCalledWith(
        mockConversationId,
        'Check this',
        ['attach-1'],
        'en',
        'reply-id'
      );
    });

    it('should return false if no conversationId', async () => {
      const { result } = renderHook(() =>
        useWebSocket({ conversationId: undefined })
      );

      let success: boolean = true;

      await act(async () => {
        success = await result.current.sendMessageWithAttachments(
          'Test',
          ['attach'],
          'en'
        );
      });

      expect(success).toBe(false);
    });
  });

  describe('Edit Message', () => {
    it('should edit message', async () => {
      const { result } = renderHook(() => useWebSocket());

      let success: boolean = false;

      await act(async () => {
        success = await result.current.editMessage('msg-123', 'Updated');
      });

      expect(success).toBe(true);
      expect(mockEditMessage).toHaveBeenCalledWith('msg-123', 'Updated');
    });
  });

  describe('Delete Message', () => {
    it('should delete message', async () => {
      const { result } = renderHook(() => useWebSocket());

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
      const { result } = renderHook(() =>
        useWebSocket({ conversationId: mockConversationId })
      );

      act(() => {
        result.current.startTyping();
      });

      expect(mockStartTyping).toHaveBeenCalledWith(mockConversationId);
    });

    it('should stop typing', () => {
      const { result } = renderHook(() =>
        useWebSocket({ conversationId: mockConversationId })
      );

      act(() => {
        result.current.stopTyping();
      });

      expect(mockStopTyping).toHaveBeenCalledWith(mockConversationId);
    });

    it('should not call typing if no conversationId', () => {
      const { result } = renderHook(() =>
        useWebSocket({ conversationId: undefined })
      );

      act(() => {
        result.current.startTyping();
        result.current.stopTyping();
      });

      expect(mockStartTyping).not.toHaveBeenCalled();
      expect(mockStopTyping).not.toHaveBeenCalled();
    });
  });

  describe('Event Listeners', () => {
    it('should setup onNewMessage listener', () => {
      const onNewMessage = jest.fn();

      renderHook(() => useWebSocket({ onNewMessage }));

      expect(mockOnNewMessage).toHaveBeenCalledWith(onNewMessage);
    });

    it('should setup onMessageEdited listener', () => {
      const onMessageEdited = jest.fn();

      renderHook(() => useWebSocket({ onMessageEdited }));

      expect(mockOnMessageEdited).toHaveBeenCalledWith(onMessageEdited);
    });

    it('should setup onMessageDeleted listener', () => {
      const onMessageDeleted = jest.fn();

      renderHook(() => useWebSocket({ onMessageDeleted }));

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(onMessageDeleted);
    });

    it('should setup onTranslation listener', () => {
      const onTranslation = jest.fn();

      renderHook(() => useWebSocket({ onTranslation }));

      expect(mockOnTranslation).toHaveBeenCalledWith(onTranslation);
    });

    it('should setup onTyping listener', () => {
      const onTyping = jest.fn();

      renderHook(() => useWebSocket({ onTyping }));

      expect(mockOnTyping).toHaveBeenCalledWith(onTyping);
    });

    it('should setup onUserStatus listener', () => {
      const onUserStatus = jest.fn();

      renderHook(() => useWebSocket({ onUserStatus }));

      expect(mockOnUserStatus).toHaveBeenCalledWith(onUserStatus);
    });

    it('should cleanup listeners on unmount', () => {
      const unsubNewMessage = jest.fn();
      const unsubEdited = jest.fn();

      mockOnNewMessage.mockReturnValue(unsubNewMessage);
      mockOnMessageEdited.mockReturnValue(unsubEdited);

      const { unmount } = renderHook(() =>
        useWebSocket({
          onNewMessage: jest.fn(),
          onMessageEdited: jest.fn(),
        })
      );

      unmount();

      expect(unsubNewMessage).toHaveBeenCalled();
      expect(unsubEdited).toHaveBeenCalled();
    });
  });

  describe('Connection State Polling', () => {
    it('should poll connection state', () => {
      const { result } = renderHook(() => useWebSocket());

      mockIsConnected.mockReturnValue(false);

      act(() => {
        jest.advanceTimersByTime(1000);
      });

      expect(result.current.isConnected).toBe(false);
    });

    it('should clear interval on unmount', () => {
      const clearIntervalSpy = jest.spyOn(global, 'clearInterval');

      const { unmount } = renderHook(() => useWebSocket());

      unmount();

      expect(clearIntervalSpy).toHaveBeenCalled();

      clearIntervalSpy.mockRestore();
    });
  });

  describe('Reconnect', () => {
    it('should call reconnect on service', () => {
      const { result } = renderHook(() => useWebSocket());

      act(() => {
        result.current.reconnect();
      });

      expect(mockReconnect).toHaveBeenCalled();
    });
  });

  describe('Get Diagnostics', () => {
    it('should return diagnostics from service', () => {
      mockGetDiagnostics.mockReturnValue({
        connected: true,
        socketId: 'socket-123',
      });

      const { result } = renderHook(() => useWebSocket());

      const diagnostics = result.current.getDiagnostics();

      expect(diagnostics).toEqual({
        connected: true,
        socketId: 'socket-123',
      });
    });
  });
});
