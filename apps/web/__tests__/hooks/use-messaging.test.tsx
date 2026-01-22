/**
 * Tests for useMessaging hook
 *
 * Tests cover:
 * - Message sending (with and without attachments)
 * - Message editing
 * - Message deletion
 * - Typing indicators (start/stop)
 * - Typing users management
 * - Error handling for failed messages
 * - Integration with Socket.IO messaging
 * - Cleanup on unmount
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useMessaging } from '@/hooks/use-messaging';

// Mock timer functions
// Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

// Mock toast
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    error: (msg: string, opts?: any) => mockToastError(msg, opts),
    success: (msg: string) => mockToastSuccess(msg),
  },
}));

// Mock Socket.IO messaging hook
const mockSendMessage = jest.fn();
const mockEditMessage = jest.fn();
const mockDeleteMessage = jest.fn();
const mockStartTyping = jest.fn();
const mockStopTyping = jest.fn();

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: (options: any) => {
    // Store callbacks for testing
    if (options.onUserTyping) {
      (global as any).__mockOnUserTyping = options.onUserTyping;
    }
    if (options.onNewMessage) {
      (global as any).__mockOnNewMessage = options.onNewMessage;
    }

    return {
      isConnected: true,
      sendMessage: mockSendMessage,
      editMessage: mockEditMessage,
      deleteMessage: mockDeleteMessage,
      startTyping: mockStartTyping,
      stopTyping: mockStopTyping,
      connectionStatus: { isConnected: true, hasSocket: true },
    };
  },
}));

// Mock failed messages store
const mockAddFailedMessage = jest.fn(() => 'failed-msg-id');

jest.mock('@/stores/failed-messages-store', () => ({
  useFailedMessagesStore: () => ({
    addFailedMessage: mockAddFailedMessage,
  }),
}));

// Mock messaging utils
jest.mock('@/utils/messaging-utils', () => ({
  validateMessageContent: jest.fn(() => true),
  prepareMessageMetadata: jest.fn((content, lang) => ({ content, language: lang })),
  logMessageSend: jest.fn(),
  logMessageSuccess: jest.fn(),
  handleMessageError: jest.fn((error) => error?.message || 'Send failed'),
  createStandardMessageCallbacks: jest.fn(() => ({})),
}));

describe('useMessaging', () => {
  const mockUser = {
    id: 'user-123',
    username: 'testuser',
    email: 'test@example.com',
    systemLanguage: 'en',
  };

  const mockConversationId = 'conv-456';

  beforeEach(() => {
    jest.clearAllMocks();
    mockSendMessage.mockResolvedValue(true);
    mockEditMessage.mockResolvedValue(true);
    mockDeleteMessage.mockResolvedValue(true);

    // Suppress console warnings
    jest.spyOn(console, 'warn').mockImplementation(() => {});
    jest.spyOn(console, 'error').mockImplementation(() => {});
  });

  afterEach(() => {
    jest.restoreAllMocks();
    jest.clearAllTimers();
  });

  describe('Initial State', () => {
    it('should return isSending false initially', () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      expect(result.current.isSending).toBe(false);
    });

    it('should return sendError null initially', () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      expect(result.current.sendError).toBeNull();
    });

    it('should return empty typingUsers initially', () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      expect(result.current.typingUsers).toEqual([]);
    });

    it('should return isTyping false initially', () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      expect(result.current.isTyping).toBe(false);
    });
  });

  describe('Send Message', () => {
    it('should send message successfully', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      let success: boolean = false;

      await act(async () => {
        success = await result.current.sendMessage('Hello world', 'en');
      });

      expect(success).toBe(true);
      expect(mockSendMessage).toHaveBeenCalledWith(
        'Hello world',
        'en',
        undefined,
        undefined,
        undefined,
        undefined
      );
    });

    it('should send message with reply', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      await act(async () => {
        await result.current.sendMessage('Reply message', 'en', 'original-msg-id');
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        'Reply message',
        'en',
        'original-msg-id',
        undefined,
        undefined,
        undefined
      );
    });

    it('should send message with mentions', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      await act(async () => {
        await result.current.sendMessage('Hey @user', 'en', undefined, ['user-789']);
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
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
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      await act(async () => {
        await result.current.sendMessage(
          'Check this file',
          'en',
          undefined,
          undefined,
          ['attachment-1'],
          ['image/png']
        );
      });

      expect(mockSendMessage).toHaveBeenCalledWith(
        'Check this file',
        'en',
        undefined,
        undefined,
        ['attachment-1'],
        ['image/png']
      );
    });

    it('should fail when conversationId is missing', async () => {
      const { result } = renderHook(() =>
        useMessaging({ currentUser: mockUser })
      );

      let success: boolean = true;

      await act(async () => {
        success = await result.current.sendMessage('Hello', 'en');
      });

      expect(success).toBe(false);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should fail when currentUser is missing', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId })
      );

      let success: boolean = true;

      await act(async () => {
        success = await result.current.sendMessage('Hello', 'en');
      });

      expect(success).toBe(false);
      expect(mockSendMessage).not.toHaveBeenCalled();
    });

    it('should fail when message is empty without attachments', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      let success: boolean = true;

      await act(async () => {
        success = await result.current.sendMessage('', 'en');
      });

      expect(success).toBe(false);
      expect(mockToastError).toHaveBeenCalled();
    });

    it('should call onMessageSent callback on success', async () => {
      const onMessageSent = jest.fn();

      const { result } = renderHook(() =>
        useMessaging({
          conversationId: mockConversationId,
          currentUser: mockUser,
          onMessageSent,
        })
      );

      await act(async () => {
        await result.current.sendMessage('Hello', 'en');
      });

      expect(onMessageSent).toHaveBeenCalledWith('Hello', 'en');
    });

    it('should call onMessageFailed callback on error', async () => {
      mockSendMessage.mockResolvedValue(false);

      const onMessageFailed = jest.fn();

      const { result } = renderHook(() =>
        useMessaging({
          conversationId: mockConversationId,
          currentUser: mockUser,
          onMessageFailed,
        })
      );

      await act(async () => {
        await result.current.sendMessage('Hello', 'en');
      });

      expect(onMessageFailed).toHaveBeenCalled();
    });

    it('should save failed message to store on error', async () => {
      mockSendMessage.mockResolvedValue(false);

      const { result } = renderHook(() =>
        useMessaging({
          conversationId: mockConversationId,
          currentUser: mockUser,
        })
      );

      await act(async () => {
        await result.current.sendMessage('Failed message', 'en');
      });

      expect(mockAddFailedMessage).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: mockConversationId,
          content: 'Failed message',
          originalLanguage: 'en',
        })
      );
    });
  });

  describe('Edit Message', () => {
    it('should edit message successfully', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      let success: boolean = false;

      await act(async () => {
        success = await result.current.editMessage('msg-123', 'Updated content');
      });

      expect(success).toBe(true);
      expect(mockEditMessage).toHaveBeenCalledWith('msg-123', 'Updated content');
      expect(mockToastSuccess).toHaveBeenCalledWith('Message edited successfully');
    });

    it('should handle edit message failure', async () => {
      mockEditMessage.mockResolvedValue(false);

      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      let success: boolean = true;

      await act(async () => {
        success = await result.current.editMessage('msg-123', 'Updated content');
      });

      expect(success).toBe(false);
    });
  });

  describe('Delete Message', () => {
    it('should delete message successfully', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      let success: boolean = false;

      await act(async () => {
        success = await result.current.deleteMessage('msg-123');
      });

      expect(success).toBe(true);
      expect(mockDeleteMessage).toHaveBeenCalledWith('msg-123');
      expect(mockToastSuccess).toHaveBeenCalledWith('Message deleted successfully');
    });

    it('should handle delete message failure', async () => {
      mockDeleteMessage.mockResolvedValue(false);

      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      let success: boolean = true;

      await act(async () => {
        success = await result.current.deleteMessage('msg-123');
      });

      expect(success).toBe(false);
    });
  });

  describe('Typing Indicators', () => {
    it('should start typing', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      act(() => {
        result.current.startTyping();
      });

      expect(result.current.isTyping).toBe(true);
      expect(mockStartTyping).toHaveBeenCalled();
    });

    it('should stop typing', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      // Start typing first
      act(() => {
        result.current.startTyping();
      });

      expect(result.current.isTyping).toBe(true);

      // Stop typing
      act(() => {
        result.current.stopTyping();
      });

      expect(result.current.isTyping).toBe(false);
      expect(mockStopTyping).toHaveBeenCalled();
    });

    it('should not call startTyping if already typing', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      act(() => {
        result.current.startTyping();
      });

      act(() => {
        result.current.startTyping();
      });

      // Should only be called once
      expect(mockStartTyping).toHaveBeenCalledTimes(1);
    });

    it('should stop typing when message is sent', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      // Start typing
      act(() => {
        result.current.startTyping();
      });

      expect(result.current.isTyping).toBe(true);

      // Send message
      await act(async () => {
        await result.current.sendMessage('Hello', 'en');
      });

      expect(result.current.isTyping).toBe(false);
    });
  });

  describe('Typing Users Management', () => {
    it('should add typing user on event', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      // Simulate typing event
      const onUserTyping = (global as any).__mockOnUserTyping;
      if (onUserTyping) {
        act(() => {
          onUserTyping('other-user-id', 'OtherUser', true, mockConversationId);
        });
      }

      // Check that typing user was added
      expect(result.current.typingUsers.some(u => u.userId === 'other-user-id')).toBe(true);
    });

    it('should remove typing user when they stop typing', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      const onUserTyping = (global as any).__mockOnUserTyping;
      if (onUserTyping) {
        // Add typing user
        act(() => {
          onUserTyping('other-user-id', 'OtherUser', true, mockConversationId);
        });

        expect(result.current.typingUsers.length).toBe(1);

        // Remove typing user
        act(() => {
          onUserTyping('other-user-id', 'OtherUser', false, mockConversationId);
        });

        expect(result.current.typingUsers.length).toBe(0);
      }
    });

    it('should clean up stale typing users after 5 seconds', async () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      const onUserTyping = (global as any).__mockOnUserTyping;
      if (onUserTyping) {
        // Add typing user
        act(() => {
          onUserTyping('stale-user', 'StaleUser', true, mockConversationId);
        });

        expect(result.current.typingUsers.length).toBe(1);

        // Advance time by 6 seconds (cleanup runs every second, removes after 5s)
        act(() => {
          jest.advanceTimersByTime(6000);
        });

        expect(result.current.typingUsers.length).toBe(0);
      }
    });
  });

  describe('Cleanup', () => {
    it('should clean up on unmount without errors', () => {
      const { result, unmount } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      // Start typing to create state that needs cleanup
      act(() => {
        result.current.startTyping();
      });

      // Unmount should not throw any errors
      expect(() => unmount()).not.toThrow();
    });
  });

  describe('Socket Messaging Reference', () => {
    it('should expose socketMessaging object', () => {
      const { result } = renderHook(() =>
        useMessaging({ conversationId: mockConversationId, currentUser: mockUser })
      );

      expect(result.current.socketMessaging).toBeDefined();
      expect(result.current.socketMessaging.isConnected).toBe(true);
    });
  });
});
