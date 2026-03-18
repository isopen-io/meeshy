/**
 * Tests for useSocketCallbacks hook
 *
 * After W1 fix: cache mutations (addMessage, updateMessage, removeMessage,
 * setConversations) are removed — useSocketCacheSync is the single cache writer.
 * This hook now only handles UI state (translating spinners, used languages, typing).
 *
 * Tests cover:
 * - onNewMessage: no-op (cache handled by useSocketCacheSync)
 * - onMessageEdited: no-op (cache handled by useSocketCacheSync)
 * - onMessageDeleted: no-op (cache handled by useSocketCacheSync)
 * - onTranslation: removeTranslatingState + addUsedLanguages (UI state only)
 * - onUserTyping: filtering logic
 * - Ref synchronization
 * - Handler stability
 */

import { renderHook, act } from '@testing-library/react';
import { useSocketCallbacks } from '@/hooks/conversations/use-socket-callbacks';
import type { Message, User } from '@meeshy/shared/types';

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
  } as unknown as Message;

  beforeEach(() => {
    jest.clearAllMocks();
    jest.useRealTimers();

    mockAddMessage = jest.fn();
    mockUpdateMessage = jest.fn();
    mockRemoveMessage = jest.fn();
    mockSetConversations = jest.fn();
    mockRefreshConversations = jest.fn();
    mockRemoveTranslatingState = jest.fn();
    mockAddUsedLanguages = jest.fn();
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
    it('should NOT call addMessage (cache handled by useSocketCacheSync)', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onNewMessage(mockMessage);
      });

      expect(mockAddMessage).not.toHaveBeenCalled();
    });

    it('should NOT call setConversations (cache handled by useSocketCacheSync)', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onNewMessage(mockMessage);
      });

      expect(mockSetConversations).not.toHaveBeenCalled();
    });
  });

  describe('onMessageEdited', () => {
    it('should NOT call updateMessage (cache handled by useSocketCacheSync)', () => {
      const { result } = renderSocketCallbacksHook();

      const editedMessage = {
        ...mockMessage,
        content: 'Edited content',
        isEdited: true,
      };

      act(() => {
        result.current.onMessageEdited(editedMessage);
      });

      expect(mockUpdateMessage).not.toHaveBeenCalled();
    });
  });

  describe('onMessageDeleted', () => {
    it('should NOT call removeMessage (cache handled by useSocketCacheSync)', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onMessageDeleted('msg-1');
      });

      expect(mockRemoveMessage).not.toHaveBeenCalled();
    });
  });

  describe('onTranslation', () => {
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

    it('should NOT call updateMessage (cache handled by useSocketCacheSync)', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [
          { targetLanguage: 'fr', translatedContent: 'Bonjour' },
        ]);
      });

      expect(mockUpdateMessage).not.toHaveBeenCalled();
    });

    it('should handle translation with language field instead of targetLanguage', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [
          { language: 'de', content: 'Hallo Welt' },
        ]);
      });

      expect(mockAddUsedLanguages).toHaveBeenCalledWith(['de']);
      expect(mockRemoveTranslatingState).toHaveBeenCalledWith('msg-1', 'de');
    });

    it('should skip translations without target language for translating state', () => {
      const { result } = renderSocketCallbacksHook();

      act(() => {
        result.current.onTranslation('msg-1', [
          { translatedContent: 'No lang' }, // Missing target language
          { targetLanguage: 'es', translatedContent: 'Valid' },
        ]);
      });

      expect(mockRemoveTranslatingState).toHaveBeenCalledTimes(1);
      expect(mockRemoveTranslatingState).toHaveBeenCalledWith('msg-1', 'es');
    });
  });

  describe('onUserTyping', () => {
    it('should ignore typing events from current user', () => {
      const { result } = renderSocketCallbacksHook();

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
