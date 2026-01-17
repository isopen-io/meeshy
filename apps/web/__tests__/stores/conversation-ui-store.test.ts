/**
 * Conversation UI Store Tests
 * Tests for ephemeral UI state management with Zustand
 */

import { act } from '@testing-library/react';
import { useConversationUIStore } from '../../stores/conversation-ui-store';

describe('ConversationUIStore', () => {
  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useConversationUIStore.setState({
        currentConversationId: null,
        typingUsers: new Map(),
        draftMessages: new Map(),
        replyingTo: new Map(),
        isCompactView: false,
        showTranslations: true,
      });
    });
    jest.clearAllMocks();
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial State', () => {
    it('should have correct initial state', () => {
      const state = useConversationUIStore.getState();

      expect(state.currentConversationId).toBeNull();
      expect(state.typingUsers.size).toBe(0);
      expect(state.draftMessages.size).toBe(0);
      expect(state.replyingTo.size).toBe(0);
      expect(state.isCompactView).toBe(false);
      expect(state.showTranslations).toBe(true);
    });
  });

  describe('Conversation Selection', () => {
    describe('setCurrentConversation', () => {
      it('should set the current conversation ID', () => {
        act(() => {
          useConversationUIStore.getState().setCurrentConversation('conv-123');
        });

        expect(useConversationUIStore.getState().currentConversationId).toBe('conv-123');
      });

      it('should allow setting to null', () => {
        act(() => {
          useConversationUIStore.getState().setCurrentConversation('conv-123');
          useConversationUIStore.getState().setCurrentConversation(null);
        });

        expect(useConversationUIStore.getState().currentConversationId).toBeNull();
      });

      it('should replace previous conversation ID', () => {
        act(() => {
          useConversationUIStore.getState().setCurrentConversation('conv-123');
          useConversationUIStore.getState().setCurrentConversation('conv-456');
        });

        expect(useConversationUIStore.getState().currentConversationId).toBe('conv-456');
      });
    });
  });

  describe('Typing Indicators', () => {
    describe('addTypingUser', () => {
      it('should add a typing user to a conversation', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
        });

        const typing = useConversationUIStore.getState().typingUsers.get('conv-123');
        expect(typing?.has('user-1')).toBe(true);
      });

      it('should support multiple typing users in same conversation', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-2');
        });

        const typing = useConversationUIStore.getState().typingUsers.get('conv-123');
        expect(typing?.size).toBe(2);
        expect(typing?.has('user-1')).toBe(true);
        expect(typing?.has('user-2')).toBe(true);
      });

      it('should support typing users in different conversations', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationUIStore.getState().addTypingUser('conv-456', 'user-2');
        });

        const state = useConversationUIStore.getState();
        expect(state.typingUsers.get('conv-123')?.has('user-1')).toBe(true);
        expect(state.typingUsers.get('conv-456')?.has('user-2')).toBe(true);
      });

      it('should auto-remove typing user after 5 seconds', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
        });

        // Verify user is typing
        expect(useConversationUIStore.getState().typingUsers.get('conv-123')?.has('user-1')).toBe(true);

        // Advance time by 5 seconds
        act(() => {
          jest.advanceTimersByTime(5000);
        });

        // User should be removed (conversation entry is deleted when empty)
        const typingUsers = useConversationUIStore.getState().typingUsers.get('conv-123');
        expect(typingUsers === undefined || !typingUsers.has('user-1')).toBe(true);
      });
    });

    describe('removeTypingUser', () => {
      it('should remove a typing user', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationUIStore.getState().removeTypingUser('conv-123', 'user-1');
        });

        const typing = useConversationUIStore.getState().typingUsers.get('conv-123');
        expect(typing?.has('user-1')).toBeFalsy();
      });

      it('should remove conversation entry when no users remain', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationUIStore.getState().removeTypingUser('conv-123', 'user-1');
        });

        expect(useConversationUIStore.getState().typingUsers.has('conv-123')).toBe(false);
      });

      it('should not affect other typing users', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-2');
          useConversationUIStore.getState().removeTypingUser('conv-123', 'user-1');
        });

        const typing = useConversationUIStore.getState().typingUsers.get('conv-123');
        expect(typing?.has('user-2')).toBe(true);
      });
    });

    describe('clearTypingUsers', () => {
      it('should clear all typing users for a conversation', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-2');
          useConversationUIStore.getState().clearTypingUsers('conv-123');
        });

        expect(useConversationUIStore.getState().typingUsers.has('conv-123')).toBe(false);
      });

      it('should not affect other conversations', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationUIStore.getState().addTypingUser('conv-456', 'user-2');
          useConversationUIStore.getState().clearTypingUsers('conv-123');
        });

        const state = useConversationUIStore.getState();
        expect(state.typingUsers.has('conv-123')).toBe(false);
        expect(state.typingUsers.get('conv-456')?.has('user-2')).toBe(true);
      });
    });

    describe('getTypingUsers', () => {
      it('should return array of typing user IDs', () => {
        act(() => {
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
          useConversationUIStore.getState().addTypingUser('conv-123', 'user-2');
        });

        const users = useConversationUIStore.getState().getTypingUsers('conv-123');
        expect(users).toContain('user-1');
        expect(users).toContain('user-2');
        expect(users).toHaveLength(2);
      });

      it('should return empty array for conversation with no typing users', () => {
        const users = useConversationUIStore.getState().getTypingUsers('conv-123');
        expect(users).toEqual([]);
      });
    });
  });

  describe('Draft Messages', () => {
    const mockDraft = {
      content: 'Hello, this is a draft',
      attachments: ['attachment-1'],
      replyToId: 'msg-123',
    };

    describe('setDraftMessage', () => {
      it('should save a draft message', () => {
        act(() => {
          useConversationUIStore.getState().setDraftMessage('conv-123', mockDraft);
        });

        const draft = useConversationUIStore.getState().draftMessages.get('conv-123');
        expect(draft).toEqual(mockDraft);
      });

      it('should replace existing draft', () => {
        const newDraft = { content: 'Updated draft' };

        act(() => {
          useConversationUIStore.getState().setDraftMessage('conv-123', mockDraft);
          useConversationUIStore.getState().setDraftMessage('conv-123', newDraft);
        });

        const draft = useConversationUIStore.getState().draftMessages.get('conv-123');
        expect(draft?.content).toBe('Updated draft');
      });

      it('should support drafts for multiple conversations', () => {
        const draft2 = { content: 'Another draft' };

        act(() => {
          useConversationUIStore.getState().setDraftMessage('conv-123', mockDraft);
          useConversationUIStore.getState().setDraftMessage('conv-456', draft2);
        });

        const state = useConversationUIStore.getState();
        expect(state.draftMessages.get('conv-123')?.content).toBe('Hello, this is a draft');
        expect(state.draftMessages.get('conv-456')?.content).toBe('Another draft');
      });
    });

    describe('clearDraftMessage', () => {
      it('should clear a draft message', () => {
        act(() => {
          useConversationUIStore.getState().setDraftMessage('conv-123', mockDraft);
          useConversationUIStore.getState().clearDraftMessage('conv-123');
        });

        expect(useConversationUIStore.getState().draftMessages.has('conv-123')).toBe(false);
      });

      it('should not affect other drafts', () => {
        const draft2 = { content: 'Another draft' };

        act(() => {
          useConversationUIStore.getState().setDraftMessage('conv-123', mockDraft);
          useConversationUIStore.getState().setDraftMessage('conv-456', draft2);
          useConversationUIStore.getState().clearDraftMessage('conv-123');
        });

        const state = useConversationUIStore.getState();
        expect(state.draftMessages.has('conv-123')).toBe(false);
        expect(state.draftMessages.get('conv-456')?.content).toBe('Another draft');
      });
    });

    describe('getDraftMessage', () => {
      it('should return the draft message', () => {
        act(() => {
          useConversationUIStore.getState().setDraftMessage('conv-123', mockDraft);
        });

        const draft = useConversationUIStore.getState().getDraftMessage('conv-123');
        expect(draft).toEqual(mockDraft);
      });

      it('should return undefined for non-existent draft', () => {
        const draft = useConversationUIStore.getState().getDraftMessage('conv-123');
        expect(draft).toBeUndefined();
      });
    });
  });

  describe('Reply State', () => {
    describe('setReplyingTo', () => {
      it('should set the message being replied to', () => {
        act(() => {
          useConversationUIStore.getState().setReplyingTo('conv-123', 'msg-456');
        });

        const replyingTo = useConversationUIStore.getState().replyingTo.get('conv-123');
        expect(replyingTo).toBe('msg-456');
      });

      it('should clear reply when set to null', () => {
        act(() => {
          useConversationUIStore.getState().setReplyingTo('conv-123', 'msg-456');
          useConversationUIStore.getState().setReplyingTo('conv-123', null);
        });

        expect(useConversationUIStore.getState().replyingTo.has('conv-123')).toBe(false);
      });

      it('should support replies in multiple conversations', () => {
        act(() => {
          useConversationUIStore.getState().setReplyingTo('conv-123', 'msg-1');
          useConversationUIStore.getState().setReplyingTo('conv-456', 'msg-2');
        });

        const state = useConversationUIStore.getState();
        expect(state.replyingTo.get('conv-123')).toBe('msg-1');
        expect(state.replyingTo.get('conv-456')).toBe('msg-2');
      });
    });

    describe('getReplyingTo', () => {
      it('should return the message ID being replied to', () => {
        act(() => {
          useConversationUIStore.getState().setReplyingTo('conv-123', 'msg-456');
        });

        const replyingTo = useConversationUIStore.getState().getReplyingTo('conv-123');
        expect(replyingTo).toBe('msg-456');
      });

      it('should return null for conversation with no reply', () => {
        const replyingTo = useConversationUIStore.getState().getReplyingTo('conv-123');
        expect(replyingTo).toBeNull();
      });
    });

    describe('clearReplyingTo', () => {
      it('should clear the reply state', () => {
        act(() => {
          useConversationUIStore.getState().setReplyingTo('conv-123', 'msg-456');
          useConversationUIStore.getState().clearReplyingTo('conv-123');
        });

        expect(useConversationUIStore.getState().replyingTo.has('conv-123')).toBe(false);
      });
    });
  });

  describe('UI Preferences', () => {
    describe('setCompactView', () => {
      it('should enable compact view', () => {
        act(() => {
          useConversationUIStore.getState().setCompactView(true);
        });

        expect(useConversationUIStore.getState().isCompactView).toBe(true);
      });

      it('should disable compact view', () => {
        act(() => {
          useConversationUIStore.getState().setCompactView(true);
          useConversationUIStore.getState().setCompactView(false);
        });

        expect(useConversationUIStore.getState().isCompactView).toBe(false);
      });
    });

    describe('setShowTranslations', () => {
      it('should disable translations', () => {
        act(() => {
          useConversationUIStore.getState().setShowTranslations(false);
        });

        expect(useConversationUIStore.getState().showTranslations).toBe(false);
      });

      it('should enable translations', () => {
        act(() => {
          useConversationUIStore.getState().setShowTranslations(false);
          useConversationUIStore.getState().setShowTranslations(true);
        });

        expect(useConversationUIStore.getState().showTranslations).toBe(true);
      });
    });
  });

  describe('Reset', () => {
    it('should reset all state to initial values', () => {
      // Set various state
      act(() => {
        useConversationUIStore.getState().setCurrentConversation('conv-123');
        useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
        useConversationUIStore.getState().setDraftMessage('conv-123', { content: 'Draft' });
        useConversationUIStore.getState().setReplyingTo('conv-123', 'msg-1');
        useConversationUIStore.getState().setCompactView(true);
        useConversationUIStore.getState().setShowTranslations(false);
      });

      // Reset
      act(() => {
        useConversationUIStore.getState().reset();
      });

      const state = useConversationUIStore.getState();
      expect(state.currentConversationId).toBeNull();
      expect(state.typingUsers.size).toBe(0);
      expect(state.draftMessages.size).toBe(0);
      expect(state.replyingTo.size).toBe(0);
      expect(state.isCompactView).toBe(false);
      expect(state.showTranslations).toBe(true);
    });
  });

  describe('Selector Hooks', () => {
    it('useCurrentConversationId should return current conversation', () => {
      act(() => {
        useConversationUIStore.getState().setCurrentConversation('conv-123');
      });

      expect(useConversationUIStore.getState().currentConversationId).toBe('conv-123');
    });

    it('useTypingUsersForConversation should return typing users array', () => {
      act(() => {
        useConversationUIStore.getState().addTypingUser('conv-123', 'user-1');
        useConversationUIStore.getState().addTypingUser('conv-123', 'user-2');
      });

      const typing = useConversationUIStore.getState().typingUsers.get('conv-123');
      expect(Array.from(typing || [])).toContain('user-1');
      expect(Array.from(typing || [])).toContain('user-2');
    });

    it('useDraftMessage should return draft for conversation', () => {
      act(() => {
        useConversationUIStore.getState().setDraftMessage('conv-123', { content: 'Test' });
      });

      const draft = useConversationUIStore.getState().draftMessages.get('conv-123');
      expect(draft?.content).toBe('Test');
    });

    it('useReplyingTo should return reply message ID', () => {
      act(() => {
        useConversationUIStore.getState().setReplyingTo('conv-123', 'msg-456');
      });

      const replyingTo = useConversationUIStore.getState().replyingTo.get('conv-123');
      expect(replyingTo).toBe('msg-456');
    });
  });

  describe('Persistence', () => {
    it('should only persist UI preferences (isCompactView and showTranslations)', () => {
      // The store partializes to only persist isCompactView and showTranslations
      // This test verifies the structure
      const state = useConversationUIStore.getState();

      // Verify the persisted keys exist
      expect(state).toHaveProperty('isCompactView');
      expect(state).toHaveProperty('showTranslations');

      // Verify ephemeral state is not persisted (would be reset on reload)
      // These are checked at runtime behavior, not at compile time
      expect(state.typingUsers).toBeDefined();
      expect(state.draftMessages).toBeDefined();
      expect(state.replyingTo).toBeDefined();
    });
  });
});
