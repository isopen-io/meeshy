/**
 * Tests for useSocketCallbacks hook
 *
 * Tests cover:
 * - onNewMessage callback behavior
 * - onMessageEdited callback behavior
 * - onMessageDeleted callback behavior
 * - onTranslation callback behavior
 * - onUserTyping callback behavior
 * - Conversation list updates
 * - Unread count management
 * - Translation merging logic
 * - Ref synchronization
 */

import { renderHook, act } from '@testing-library/react';
import { useSocketCallbacks } from '@/hooks/conversations/use-socket-callbacks';
import type { Message, Conversation, User } from '@meeshy/shared/types';

// Mock meeshy socket service
const mockGetCurrentConversationId = jest.fn();

jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    getCurrentConversationId: () => mockGetCurrentConversationId(),
  },
}));

describe('useSocketCallbacks', () => {
  // Mock callbacks
  let mockAddMessage: jest.Mock;
  let mockUpdateMessage: jest.Mock;
  let mockRemoveMessage: jest.Mock;
  let mockSetConversations: jest.Mock;
  let mockRefreshConversations: jest.Mock;
  let mockRemoveTranslatingState: jest.Mock;
  let mockAddUsedLanguages: jest.Mock;

  const mockConversationId = 'conv-123';

  const mockCurrentUser: User = {
    id: 'user-123',
    username: 'testuser',
    displayName: 'Test User',
    email: 'test@example.com',
    systemLanguage: 'en',
    regionalLanguage: 'en',
    role: 'USER',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as User;

  const mockMessage: Message = {
    id: 'msg-1',
    conversationId: mockConversationId,
    senderId: 'other-user',
    content: 'Hello world',
    originalLanguage: 'en',
    createdAt: new Date(),
    translations: [],
  } as Message;

  const mockConversation: Conversation = {
    id: mockConversationId,
    title: 'Test Conversation',
    type: 'direct',
    unreadCount: 0,
    lastMessage: null,
    createdAt: new Date(),
    updatedAt: new Date(),
  } as Conversation;

  beforeEach(() => {
    jest.clearAllMocks();
    // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

    mockAddMessage = jest.fn();
    mockUpdateMessage = jest.fn();
    mockRemoveMessage = jest.fn();
    mockSetConversations = jest.fn((updater) => {
      // Execute the updater to test its logic
      if (typeof updater === 'function') {
        return updater([mockConversation]);
      }
      return updater;
    });
    mockRefreshConversations = jest.fn();
    mockRemoveTranslatingState = jest.fn();
    mockAddUsedLanguages = jest.fn();

    mockGetCurrentConversationId.mockReturnValue(mockConversationId);
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
  });

  const renderSocketCallbacksHook = (overrides = {}) => {
    return renderHook(() =>
      useSocketCallbacks({
        conversationId: mockConversationId,
        currentUser: mockCurrentUser,
        addMessage: mockAddMessage,
        updateMessage: mockUpdateMessage,
        removeMessage: mockRemoveMessage,
        setConversations: mockSetConversations,
        refreshConversations: mockRefreshConversations,
        removeTranslatingState: mockRemoveTranslatingState,
        addUsedLanguages: mockAddUsedLanguages,
        ...overrides,
      })
    );
  };

  describe('Initial State', () => {
    it('should return all callback functions', () => {
      const { result } = renderSocketCallbacksHook();

      expect(typeof result.current.onNewMessage).toBe('function');
      expect(typeof result.current.onMessageEdited).toBe('function');
      expect(typeof result.current.onMessageDeleted).toBe('function');
      expect(typeof result.current.onTranslation).toBe('function');
      expect(typeof result.current.onUserTyping).toBe('function');
    });
  });

  describe('onNewMessage', () => {
    it('should add message when it belongs to current conversation', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onNewMessage(mockMessage);
      });

      expect(mockAddMessage).toHaveBeenCalledWith(mockMessage);
    });

    it('should not add message when conversation ID does not match', () => {
      const { result } = renderSocketCallbacksHook();

      const otherMessage = {
        ...mockMessage,
        conversationId: 'other-conv-id',
      };

      act(() => {
        result.current.onNewMessage(otherMessage);
      });

      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('should update conversations list', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onNewMessage(mockMessage);
      });

      expect(mockSetConversations).toHaveBeenCalled();
    });

    it('should move conversation to top of list', () => {
      const conversations = [
        { ...mockConversation, id: 'other-conv' },
        mockConversation,
      ];

      mockSetConversations.mockImplementation((updater) => {
        const result = updater(conversations);
        // First conversation should be the one that received the message
        expect(result[0].id).toBe(mockConversationId);
        return result;
      });

      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onNewMessage(mockMessage);
      });
    });

    it('should not increment unread count for own messages', () => {
      mockSetConversations.mockImplementation((updater) => {
        const result = updater([mockConversation]);
        expect(result[0].unreadCount).toBe(0);
        return result;
      });

      const { result } = renderSocketCallbacksHook();

      const ownMessage = {
        ...mockMessage,
        senderId: mockCurrentUser.id,
      };

      act(() => {
        result.current.onNewMessage(ownMessage);
      });
    });

    it('should increment unread count for messages from others when not viewing', () => {
      // Different conversation being viewed
      mockGetCurrentConversationId.mockReturnValue('different-conv');

      mockSetConversations.mockImplementation((updater) => {
        const result = updater([mockConversation]);
        expect(result[0].unreadCount).toBe(1);
        return result;
      });

      const { result } = renderSocketCallbacksHook({
        conversationId: 'different-conv',
      });

      act(() => {
        result.current.onNewMessage({
          ...mockMessage,
          senderId: 'other-user',
          conversationId: mockConversationId,
        });
      });
    });

    it('should refresh conversations when conversation not found', () => {
      mockSetConversations.mockImplementation((updater) => {
        return updater([]); // Empty conversations list
      });

      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onNewMessage(mockMessage);
      });

      act(() => {
        jest.advanceTimersByTime(100);
      });

      expect(mockRefreshConversations).toHaveBeenCalled();
    });

    it('should update lastMessage on conversation', () => {
      mockSetConversations.mockImplementation((updater) => {
        const result = updater([mockConversation]);
        expect(result[0].lastMessage).toEqual(mockMessage);
        return result;
      });

      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onNewMessage(mockMessage);
      });
    });
  });

  describe('onMessageEdited', () => {
    it('should update message when it belongs to current conversation', () => {
      const { result } = renderSocketCallbacksHook();

      const editedMessage = {
        ...mockMessage,
        content: 'Edited content',
        isEdited: true,
      };

      act(() => {
        result.current.onMessageEdited(editedMessage);
      });

      expect(mockUpdateMessage).toHaveBeenCalledWith(editedMessage.id, editedMessage);
    });

    it('should not update message from different conversation', () => {
      const { result } = renderSocketCallbacksHook();

      const otherMessage = {
        ...mockMessage,
        conversationId: 'other-conv',
      };

      act(() => {
        result.current.onMessageEdited(otherMessage);
      });

      expect(mockUpdateMessage).not.toHaveBeenCalled();
    });
  });

  describe('onMessageDeleted', () => {
    it('should remove message by ID', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onMessageDeleted('msg-1');
      });

      expect(mockRemoveMessage).toHaveBeenCalledWith('msg-1');
    });

    it('should handle deletion without conversation context', () => {
      const { result } = renderSocketCallbacksHook({
        conversationId: null,
      });

      act(() => {
        result.current.onMessageDeleted('msg-1');
      });

      expect(mockRemoveMessage).toHaveBeenCalledWith('msg-1');
    });
  });

  describe('onTranslation', () => {
    const mockTranslation = {
      id: 'trans-1',
      targetLanguage: 'fr',
      translatedContent: 'Bonjour monde',
      sourceLanguage: 'en',
    };

    it('should update message with new translations', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [mockTranslation]);
      });

      expect(mockUpdateMessage).toHaveBeenCalledWith(
        'msg-1',
        expect.any(Function)
      );
    });

    it('should merge translations with existing ones', () => {
      let capturedUpdater: Function;
      mockUpdateMessage.mockImplementation((id, updater) => {
        capturedUpdater = updater;
      });

      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [mockTranslation]);
      });

      // Call the updater with a message that has existing translations
      const existingMessage = {
        ...mockMessage,
        translations: [
          { targetLanguage: 'es', translatedContent: 'Hola mundo' },
        ],
      };

      const updatedMessage = capturedUpdater!(existingMessage);

      // Should have both translations
      expect(updatedMessage.translations).toHaveLength(2);
      expect(updatedMessage.translations.some((t: any) => t.targetLanguage === 'fr')).toBe(true);
      expect(updatedMessage.translations.some((t: any) => t.targetLanguage === 'es')).toBe(true);
    });

    it('should replace existing translation for same language', () => {
      let capturedUpdater: Function;
      mockUpdateMessage.mockImplementation((id, updater) => {
        capturedUpdater = updater;
      });

      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [mockTranslation]);
      });

      const existingMessage = {
        ...mockMessage,
        translations: [
          { targetLanguage: 'fr', translatedContent: 'Old translation' },
        ],
      };

      const updatedMessage = capturedUpdater!(existingMessage);

      // Should still have one FR translation but with new content
      const frTranslation = updatedMessage.translations.find(
        (t: any) => t.targetLanguage === 'fr'
      );
      expect(frTranslation.translatedContent).toBe('Bonjour monde');
    });

    it('should add used languages', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [
          { targetLanguage: 'fr', translatedContent: 'Bonjour' },
          { targetLanguage: 'es', translatedContent: 'Hola' },
        ]);
      });

      expect(mockAddUsedLanguages).toHaveBeenCalledWith(['fr', 'es']);
    });

    it('should remove translating state for each translation', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [
          { targetLanguage: 'fr', translatedContent: 'Bonjour' },
          { targetLanguage: 'es', translatedContent: 'Hola' },
        ]);
      });

      expect(mockRemoveTranslatingState).toHaveBeenCalledWith('msg-1', 'fr');
      expect(mockRemoveTranslatingState).toHaveBeenCalledWith('msg-1', 'es');
    });

    it('should handle translation with language field instead of targetLanguage', () => {
      let capturedUpdater: Function;
      mockUpdateMessage.mockImplementation((id, updater) => {
        capturedUpdater = updater;
      });

      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [
          { language: 'de', content: 'Hallo Welt' },
        ]);
      });

      const updatedMessage = capturedUpdater!({
        ...mockMessage,
        translations: [],
      });

      expect(updatedMessage.translations[0].targetLanguage).toBe('de');
      expect(updatedMessage.translations[0].translatedContent).toBe('Hallo Welt');
    });

    it('should skip translations without content or target language', () => {
      let capturedUpdater: Function;
      mockUpdateMessage.mockImplementation((id, updater) => {
        capturedUpdater = updater;
      });

      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [
          { targetLanguage: 'fr' }, // Missing content
          { translatedContent: 'Content' }, // Missing target language
          { targetLanguage: 'es', translatedContent: 'Valid' },
        ]);
      });

      const updatedMessage = capturedUpdater!({
        ...mockMessage,
        translations: [],
      });

      // Only the valid translation should be added
      expect(updatedMessage.translations).toHaveLength(1);
      expect(updatedMessage.translations[0].targetLanguage).toBe('es');
    });

    it('should handle message without existing translations array', () => {
      let capturedUpdater: Function;
      mockUpdateMessage.mockImplementation((id, updater) => {
        capturedUpdater = updater;
      });

      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [mockTranslation]);
      });

      const messageWithoutTranslations = {
        ...mockMessage,
        translations: undefined,
      };

      const updatedMessage = capturedUpdater!(messageWithoutTranslations);

      expect(updatedMessage.translations).toHaveLength(1);
    });
  });

  describe('onUserTyping', () => {
    it('should ignore typing events from current user', () => {
      const { result } = renderSocketCallbacksHook();

      // This callback currently just validates and filters
      // The actual typing user management is in useConversationTyping
      act(() => {
        result.current.onUserTyping(
          mockCurrentUser.id,
          'testuser',
          true,
          mockConversationId
        );
      });

      // No error should be thrown
    });

    it('should ignore typing events from different conversations', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onUserTyping(
          'other-user',
          'otheruser',
          true,
          'different-conv'
        );
      });

      // No error should be thrown
    });

    it('should handle typing events when currentUser is null', () => {
      const { result } = renderSocketCallbacksHook({
        currentUser: null,
      });

      act(() => {
        result.current.onUserTyping(
          'other-user',
          'otheruser',
          true,
          mockConversationId
        );
      });

      // No error should be thrown
    });
  });

  describe('Ref Synchronization', () => {
    it('should update conversationIdRef when conversationId changes', () => {
      const { result, rerender } = renderHook(
        ({ conversationId }) =>
          useSocketCallbacks({
            conversationId,
            currentUser: mockCurrentUser,
            addMessage: mockAddMessage,
            updateMessage: mockUpdateMessage,
            removeMessage: mockRemoveMessage,
            setConversations: mockSetConversations,
            refreshConversations: mockRefreshConversations,
            removeTranslatingState: mockRemoveTranslatingState,
            addUsedLanguages: mockAddUsedLanguages,
          }),
        { initialProps: { conversationId: 'conv-1' } }
      );

      mockGetCurrentConversationId.mockReturnValue('conv-2');

      rerender({ conversationId: 'conv-2' });

      // Message for new conversation should be processed correctly
      act(() => {
        result.current.onNewMessage({
          ...mockMessage,
          conversationId: 'conv-2',
        });
      });

      expect(mockAddMessage).toHaveBeenCalled();
    });
  });

  describe('Handler Stability', () => {
    it('should return stable callback references', () => {
      const { result, rerender } = renderSocketCallbacksHook();

      const firstCallbacks = { ...result.current };

      rerender();

      expect(result.current.onNewMessage).toBe(firstCallbacks.onNewMessage);
      expect(result.current.onMessageEdited).toBe(firstCallbacks.onMessageEdited);
      expect(result.current.onMessageDeleted).toBe(firstCallbacks.onMessageDeleted);
      expect(result.current.onTranslation).toBe(firstCallbacks.onTranslation);
      expect(result.current.onUserTyping).toBe(firstCallbacks.onUserTyping);
    });
  });
});
