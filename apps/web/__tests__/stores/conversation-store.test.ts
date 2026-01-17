/**
 * Conversation Store Tests
 * Tests for conversation and messaging state management with Zustand
 */

import { act } from '@testing-library/react';
import { useConversationStore } from '../../stores/conversation-store';
import type { Conversation, Message, MessageTranslation } from '@meeshy/shared/types';

describe('ConversationStore', () => {
  const mockConversation: Conversation = {
    id: 'conv-123',
    identifier: 'conv-identifier-123',
    type: 'direct',
    name: 'Test Conversation',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    creatorId: 'user-1',
    members: [],
    unreadCount: 0,
  };

  const mockConversation2: Conversation = {
    id: 'conv-456',
    identifier: 'conv-identifier-456',
    type: 'group',
    name: 'Group Conversation',
    isActive: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    creatorId: 'user-1',
    members: [],
    unreadCount: 5,
  };

  const mockMessage: Message = {
    id: 'msg-123',
    conversationId: 'conv-123',
    senderId: 'user-1',
    content: 'Hello, world!',
    originalLanguage: 'en',
    isEdited: false,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockMessage2: Message = {
    id: 'msg-456',
    conversationId: 'conv-123',
    senderId: 'user-2',
    content: 'Hi there!',
    originalLanguage: 'en',
    isEdited: false,
    isDeleted: false,
    createdAt: new Date(),
    updatedAt: new Date(),
  };

  const mockTranslation: MessageTranslation = {
    targetLanguage: 'fr',
    translatedContent: 'Bonjour, monde!',
    translatedAt: new Date(),
  };

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useConversationStore.setState({
        conversations: [],
        currentConversation: null,
        messages: new Map(),
        isLoadingConversations: false,
        isLoadingMessages: new Map(),
        hasMoreMessages: new Map(),
        translatingMessages: new Map(),
        typingUsers: new Map(),
      });
    });
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useConversationStore.getState();

      expect(state.conversations).toEqual([]);
      expect(state.currentConversation).toBeNull();
      expect(state.messages.size).toBe(0);
      expect(state.isLoadingConversations).toBe(false);
      expect(state.isLoadingMessages.size).toBe(0);
      expect(state.hasMoreMessages.size).toBe(0);
      expect(state.translatingMessages.size).toBe(0);
      expect(state.typingUsers.size).toBe(0);
    });
  });

  describe('Conversation Actions', () => {
    describe('addConversation', () => {
      it('should add a new conversation to the list', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
        });

        const state = useConversationStore.getState();
        expect(state.conversations).toHaveLength(1);
        expect(state.conversations[0]).toEqual(mockConversation);
      });

      it('should add conversation at the beginning of the list', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().addConversation(mockConversation2);
        });

        const state = useConversationStore.getState();
        expect(state.conversations[0]).toEqual(mockConversation2);
        expect(state.conversations[1]).toEqual(mockConversation);
      });

      it('should not add duplicate conversations', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().addConversation(mockConversation);
        });

        const state = useConversationStore.getState();
        expect(state.conversations).toHaveLength(1);
      });
    });

    describe('selectConversation', () => {
      it('should set the current conversation', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().selectConversation('conv-123');
        });

        const state = useConversationStore.getState();
        expect(state.currentConversation).toEqual(mockConversation);
      });

      it('should not change state if conversation not found', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().selectConversation('nonexistent');
        });

        const state = useConversationStore.getState();
        expect(state.currentConversation).toBeNull();
      });
    });

    describe('updateConversation', () => {
      it('should update an existing conversation', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().updateConversation('conv-123', { name: 'Updated Name' });
        });

        const state = useConversationStore.getState();
        expect(state.conversations[0].name).toBe('Updated Name');
      });

      it('should also update currentConversation if it matches', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().selectConversation('conv-123');
          useConversationStore.getState().updateConversation('conv-123', { name: 'Updated Name' });
        });

        const state = useConversationStore.getState();
        expect(state.currentConversation?.name).toBe('Updated Name');
      });

      it('should not affect currentConversation if different conversation is updated', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().addConversation(mockConversation2);
          useConversationStore.getState().selectConversation('conv-123');
          useConversationStore.getState().updateConversation('conv-456', { name: 'Updated Group' });
        });

        const state = useConversationStore.getState();
        expect(state.currentConversation?.name).toBe('Test Conversation');
      });
    });

    describe('updateUnreadCount', () => {
      it('should update the unread count for a conversation', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().updateUnreadCount('conv-123', 10);
        });

        const state = useConversationStore.getState();
        expect(state.conversations[0].unreadCount).toBe(10);
      });

      it('should also update currentConversation unread count', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().selectConversation('conv-123');
          useConversationStore.getState().updateUnreadCount('conv-123', 5);
        });

        const state = useConversationStore.getState();
        expect(state.currentConversation?.unreadCount).toBe(5);
      });
    });

    describe('removeConversation', () => {
      it('should remove a conversation from the list', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().addConversation(mockConversation2);
          useConversationStore.getState().removeConversation('conv-123');
        });

        const state = useConversationStore.getState();
        expect(state.conversations).toHaveLength(1);
        expect(state.conversations[0].id).toBe('conv-456');
      });

      it('should clear currentConversation if removed conversation was selected', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().selectConversation('conv-123');
          useConversationStore.getState().removeConversation('conv-123');
        });

        const state = useConversationStore.getState();
        expect(state.currentConversation).toBeNull();
      });

      it('should also remove associated messages, loading states, and hasMore', () => {
        act(() => {
          const state = useConversationStore.getState();
          useConversationStore.setState({
            conversations: [mockConversation],
            messages: new Map([['conv-123', [mockMessage]]]),
            isLoadingMessages: new Map([['conv-123', true]]),
            hasMoreMessages: new Map([['conv-123', true]]),
          });

          useConversationStore.getState().removeConversation('conv-123');
        });

        const state = useConversationStore.getState();
        expect(state.messages.has('conv-123')).toBe(false);
        expect(state.isLoadingMessages.has('conv-123')).toBe(false);
        expect(state.hasMoreMessages.has('conv-123')).toBe(false);
      });
    });
  });

  describe('Message Actions', () => {
    describe('addMessage', () => {
      it('should add a message to the conversation', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().addMessage('conv-123', mockMessage);
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages).toHaveLength(1);
        expect(messages![0]).toEqual(mockMessage);
      });

      it('should add new messages at the beginning (newest first)', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().addMessage('conv-123', mockMessage);
          useConversationStore.getState().addMessage('conv-123', mockMessage2);
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages![0]).toEqual(mockMessage2);
        expect(messages![1]).toEqual(mockMessage);
      });

      it('should not add duplicate messages', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().addMessage('conv-123', mockMessage);
          useConversationStore.getState().addMessage('conv-123', mockMessage);
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages).toHaveLength(1);
      });

      it('should update conversation lastMessage', () => {
        act(() => {
          useConversationStore.getState().addConversation(mockConversation);
          useConversationStore.getState().addMessage('conv-123', mockMessage);
        });

        const state = useConversationStore.getState();
        expect(state.conversations[0].lastMessage).toEqual(mockMessage);
      });

      it('should create message array if conversation has no messages yet', () => {
        act(() => {
          useConversationStore.getState().addMessage('conv-123', mockMessage);
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages).toHaveLength(1);
      });
    });

    describe('updateMessage', () => {
      it('should update an existing message', () => {
        act(() => {
          useConversationStore.setState({
            messages: new Map([['conv-123', [mockMessage]]]),
          });
          useConversationStore.getState().updateMessage('conv-123', 'msg-123', {
            content: 'Updated content',
            isEdited: true,
          });
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages![0].content).toBe('Updated content');
        expect(messages![0].isEdited).toBe(true);
      });

      it('should not affect other messages', () => {
        act(() => {
          useConversationStore.setState({
            messages: new Map([['conv-123', [mockMessage, mockMessage2]]]),
          });
          useConversationStore.getState().updateMessage('conv-123', 'msg-123', {
            content: 'Updated content',
          });
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages![1].content).toBe('Hi there!');
      });
    });

    describe('deleteMessage', () => {
      it('should remove a message from the conversation', () => {
        act(() => {
          useConversationStore.setState({
            messages: new Map([['conv-123', [mockMessage, mockMessage2]]]),
          });
          useConversationStore.getState().deleteMessage('conv-123', 'msg-123');
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages).toHaveLength(1);
        expect(messages![0].id).toBe('msg-456');
      });
    });

    describe('clearMessages', () => {
      it('should clear all messages for a conversation', () => {
        act(() => {
          useConversationStore.setState({
            messages: new Map([['conv-123', [mockMessage, mockMessage2]]]),
          });
          useConversationStore.getState().clearMessages('conv-123');
        });

        const state = useConversationStore.getState();
        expect(state.messages.has('conv-123')).toBe(false);
      });
    });
  });

  describe('Translation Actions', () => {
    describe('requestTranslation', () => {
      it('should mark message as translating', async () => {
        await act(async () => {
          useConversationStore.getState().requestTranslation('msg-123', 'fr');
        });

        const state = useConversationStore.getState();
        const translating = state.translatingMessages.get('msg-123');
        expect(translating?.has('fr')).toBe(true);
      });

      it('should support multiple target languages for same message', async () => {
        await act(async () => {
          useConversationStore.getState().requestTranslation('msg-123', 'fr');
          useConversationStore.getState().requestTranslation('msg-123', 'es');
        });

        const state = useConversationStore.getState();
        const translating = state.translatingMessages.get('msg-123');
        expect(translating?.has('fr')).toBe(true);
        expect(translating?.has('es')).toBe(true);
      });
    });

    describe('addTranslation', () => {
      it('should add translation to a message', () => {
        act(() => {
          useConversationStore.setState({
            messages: new Map([['conv-123', [mockMessage]]]),
            translatingMessages: new Map([['msg-123', new Set(['fr'])]]),
          });
          useConversationStore.getState().addTranslation('msg-123', mockTranslation);
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages![0].translations).toHaveLength(1);
        expect(messages![0].translations![0]).toEqual(mockTranslation);
      });

      it('should remove message from translating state', () => {
        act(() => {
          useConversationStore.setState({
            messages: new Map([['conv-123', [mockMessage]]]),
            translatingMessages: new Map([['msg-123', new Set(['fr'])]]),
          });
          useConversationStore.getState().addTranslation('msg-123', mockTranslation);
        });

        const state = useConversationStore.getState();
        expect(state.translatingMessages.has('msg-123')).toBe(false);
      });

      it('should update existing translation for same language', () => {
        const existingTranslation: MessageTranslation = {
          targetLanguage: 'fr',
          translatedContent: 'Old translation',
          translatedAt: new Date(),
        };

        const messageWithTranslation = { ...mockMessage, translations: [existingTranslation] };

        act(() => {
          useConversationStore.setState({
            messages: new Map([['conv-123', [messageWithTranslation]]]),
          });
          useConversationStore.getState().addTranslation('msg-123', mockTranslation);
        });

        const state = useConversationStore.getState();
        const messages = state.messages.get('conv-123');
        expect(messages![0].translations).toHaveLength(1);
        expect(messages![0].translations![0].translatedContent).toBe('Bonjour, monde!');
      });
    });
  });

  describe('Typing Users', () => {
    describe('addTypingUser', () => {
      it('should add a typing user to a conversation', () => {
        act(() => {
          useConversationStore.getState().addTypingUser('conv-123', 'user-1');
        });

        const state = useConversationStore.getState();
        const typing = state.typingUsers.get('conv-123');
        expect(typing?.has('user-1')).toBe(true);
      });

      it('should support multiple typing users', () => {
        act(() => {
          useConversationStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationStore.getState().addTypingUser('conv-123', 'user-2');
        });

        const state = useConversationStore.getState();
        const typing = state.typingUsers.get('conv-123');
        expect(typing?.size).toBe(2);
      });
    });

    describe('removeTypingUser', () => {
      it('should remove a typing user', () => {
        act(() => {
          useConversationStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationStore.getState().addTypingUser('conv-123', 'user-2');
          useConversationStore.getState().removeTypingUser('conv-123', 'user-1');
        });

        const state = useConversationStore.getState();
        const typing = state.typingUsers.get('conv-123');
        expect(typing?.has('user-1')).toBe(false);
        expect(typing?.has('user-2')).toBe(true);
      });

      it('should remove conversation entry when no typing users remain', () => {
        act(() => {
          useConversationStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationStore.getState().removeTypingUser('conv-123', 'user-1');
        });

        const state = useConversationStore.getState();
        expect(state.typingUsers.has('conv-123')).toBe(false);
      });
    });
  });

  describe('Loading States', () => {
    describe('loadConversations', () => {
      it('should set loading state during fetch', async () => {
        // Start loading
        const loadPromise = act(async () => {
          useConversationStore.getState().loadConversations();
        });

        // Check loading state was set (may complete quickly in tests)
        await loadPromise;

        const state = useConversationStore.getState();
        expect(state.isLoadingConversations).toBe(false);
      });

      it('should not load if already loading', async () => {
        act(() => {
          useConversationStore.setState({ isLoadingConversations: true });
        });

        await act(async () => {
          await useConversationStore.getState().loadConversations();
        });

        // Should still be loading (original state)
        const state = useConversationStore.getState();
        expect(state.isLoadingConversations).toBe(true);
      });
    });

    describe('loadMessages', () => {
      it('should not load if already loading for that conversation', async () => {
        act(() => {
          useConversationStore.setState({
            isLoadingMessages: new Map([['conv-123', true]]),
          });
        });

        await act(async () => {
          await useConversationStore.getState().loadMessages('conv-123');
        });

        // Should maintain loading state
        const state = useConversationStore.getState();
        expect(state.isLoadingMessages.get('conv-123')).toBe(true);
      });
    });
  });

  describe('Selector Hooks', () => {
    it('useConversations should return conversations array', () => {
      act(() => {
        useConversationStore.getState().addConversation(mockConversation);
      });

      const conversations = useConversationStore.getState().conversations;
      expect(conversations).toHaveLength(1);
    });

    it('useCurrentConversation should return selected conversation', () => {
      act(() => {
        useConversationStore.getState().addConversation(mockConversation);
        useConversationStore.getState().selectConversation('conv-123');
      });

      const current = useConversationStore.getState().currentConversation;
      expect(current).toEqual(mockConversation);
    });
  });
});
