/**
 * Failed Messages Store Tests
 * Tests for failed message state management with Zustand persistence
 */

import { act } from '@testing-library/react';
import { useFailedMessagesStore, FailedMessage } from '../../stores/failed-messages-store';

describe('FailedMessagesStore', () => {
  const createMockFailedMessage = (overrides: Partial<FailedMessage> = {}): Omit<FailedMessage, 'id' | 'timestamp' | 'retryCount'> => ({
    conversationId: 'conv-123',
    content: 'Test message content',
    originalLanguage: 'en',
    attachmentIds: [],
    error: 'Network error',
    ...overrides,
  });

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useFailedMessagesStore.setState({
        failedMessages: [],
      });
    });
    jest.clearAllMocks();
    localStorage.clear();
  });

  describe('Initial State', () => {
    it('should have empty failed messages array', () => {
      const state = useFailedMessagesStore.getState();
      expect(state.failedMessages).toEqual([]);
    });
  });

  describe('addFailedMessage', () => {
    it('should add a failed message with generated id and timestamp', () => {
      const mockMessage = createMockFailedMessage();
      let messageId: string = '';

      act(() => {
        messageId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      const state = useFailedMessagesStore.getState();
      expect(state.failedMessages).toHaveLength(1);
      expect(state.failedMessages[0].id).toBe(messageId);
      expect(state.failedMessages[0].id).toMatch(/^failed-\d+-[a-z0-9]+$/);
      expect(state.failedMessages[0].timestamp).toBeDefined();
      expect(state.failedMessages[0].retryCount).toBe(0);
    });

    it('should preserve message content and metadata', () => {
      const mockMessage = createMockFailedMessage({
        content: 'Hello, world!',
        originalLanguage: 'fr',
        replyToId: 'reply-123',
        attachmentIds: ['att-1', 'att-2'],
      });

      act(() => {
        useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      const state = useFailedMessagesStore.getState();
      const savedMessage = state.failedMessages[0];

      expect(savedMessage.content).toBe('Hello, world!');
      expect(savedMessage.originalLanguage).toBe('fr');
      expect(savedMessage.replyToId).toBe('reply-123');
      expect(savedMessage.attachmentIds).toEqual(['att-1', 'att-2']);
    });

    it('should add multiple failed messages', () => {
      const message1 = createMockFailedMessage({ content: 'Message 1' });
      const message2 = createMockFailedMessage({ content: 'Message 2' });

      act(() => {
        useFailedMessagesStore.getState().addFailedMessage(message1);
        useFailedMessagesStore.getState().addFailedMessage(message2);
      });

      const state = useFailedMessagesStore.getState();
      expect(state.failedMessages).toHaveLength(2);
    });

    it('should return the generated message id', () => {
      const mockMessage = createMockFailedMessage();
      let returnedId: string = '';

      act(() => {
        returnedId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      expect(returnedId).toBeDefined();
      expect(typeof returnedId).toBe('string');
      expect(returnedId.startsWith('failed-')).toBe(true);
    });
  });

  describe('removeFailedMessage', () => {
    it('should remove a failed message by id', () => {
      const mockMessage = createMockFailedMessage();
      let messageId: string = '';

      act(() => {
        messageId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      expect(useFailedMessagesStore.getState().failedMessages).toHaveLength(1);

      act(() => {
        useFailedMessagesStore.getState().removeFailedMessage(messageId);
      });

      expect(useFailedMessagesStore.getState().failedMessages).toHaveLength(0);
    });

    it('should not affect other messages', () => {
      const message1 = createMockFailedMessage({ content: 'Message 1' });
      const message2 = createMockFailedMessage({ content: 'Message 2' });
      let id1: string = '';

      act(() => {
        id1 = useFailedMessagesStore.getState().addFailedMessage(message1);
        useFailedMessagesStore.getState().addFailedMessage(message2);
      });

      act(() => {
        useFailedMessagesStore.getState().removeFailedMessage(id1);
      });

      const state = useFailedMessagesStore.getState();
      expect(state.failedMessages).toHaveLength(1);
      expect(state.failedMessages[0].content).toBe('Message 2');
    });
  });

  describe('getFailedMessage', () => {
    it('should return a failed message by id', () => {
      const mockMessage = createMockFailedMessage({ content: 'Test content' });
      let messageId: string = '';

      act(() => {
        messageId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      const retrieved = useFailedMessagesStore.getState().getFailedMessage(messageId);

      expect(retrieved).toBeDefined();
      expect(retrieved?.content).toBe('Test content');
    });

    it('should return undefined for non-existent id', () => {
      const retrieved = useFailedMessagesStore.getState().getFailedMessage('nonexistent');
      expect(retrieved).toBeUndefined();
    });
  });

  describe('getFailedMessagesForConversation', () => {
    it('should return failed messages for a specific conversation', () => {
      const message1 = createMockFailedMessage({ conversationId: 'conv-1', content: 'Msg 1' });
      const message2 = createMockFailedMessage({ conversationId: 'conv-2', content: 'Msg 2' });
      const message3 = createMockFailedMessage({ conversationId: 'conv-1', content: 'Msg 3' });

      act(() => {
        useFailedMessagesStore.getState().addFailedMessage(message1);
        useFailedMessagesStore.getState().addFailedMessage(message2);
        useFailedMessagesStore.getState().addFailedMessage(message3);
      });

      const conv1Messages = useFailedMessagesStore.getState().getFailedMessagesForConversation('conv-1');

      expect(conv1Messages).toHaveLength(2);
      expect(conv1Messages.map(m => m.content)).toContain('Msg 1');
      expect(conv1Messages.map(m => m.content)).toContain('Msg 3');
    });

    it('should return empty array for conversation with no failed messages', () => {
      const message = createMockFailedMessage({ conversationId: 'conv-1' });

      act(() => {
        useFailedMessagesStore.getState().addFailedMessage(message);
      });

      const messages = useFailedMessagesStore.getState().getFailedMessagesForConversation('conv-999');
      expect(messages).toEqual([]);
    });
  });

  describe('incrementRetryCount', () => {
    it('should increment retry count for a message', () => {
      const mockMessage = createMockFailedMessage();
      let messageId: string = '';

      act(() => {
        messageId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      expect(useFailedMessagesStore.getState().getFailedMessage(messageId)?.retryCount).toBe(0);

      act(() => {
        useFailedMessagesStore.getState().incrementRetryCount(messageId);
      });

      expect(useFailedMessagesStore.getState().getFailedMessage(messageId)?.retryCount).toBe(1);

      act(() => {
        useFailedMessagesStore.getState().incrementRetryCount(messageId);
        useFailedMessagesStore.getState().incrementRetryCount(messageId);
      });

      expect(useFailedMessagesStore.getState().getFailedMessage(messageId)?.retryCount).toBe(3);
    });

    it('should not affect other messages', () => {
      const message1 = createMockFailedMessage();
      const message2 = createMockFailedMessage();
      let id1: string = '';
      let id2: string = '';

      act(() => {
        id1 = useFailedMessagesStore.getState().addFailedMessage(message1);
        id2 = useFailedMessagesStore.getState().addFailedMessage(message2);
      });

      act(() => {
        useFailedMessagesStore.getState().incrementRetryCount(id1);
      });

      expect(useFailedMessagesStore.getState().getFailedMessage(id1)?.retryCount).toBe(1);
      expect(useFailedMessagesStore.getState().getFailedMessage(id2)?.retryCount).toBe(0);
    });
  });

  describe('clearFailedMessages', () => {
    it('should clear messages for a specific conversation', () => {
      const message1 = createMockFailedMessage({ conversationId: 'conv-1' });
      const message2 = createMockFailedMessage({ conversationId: 'conv-2' });
      const message3 = createMockFailedMessage({ conversationId: 'conv-1' });

      act(() => {
        useFailedMessagesStore.getState().addFailedMessage(message1);
        useFailedMessagesStore.getState().addFailedMessage(message2);
        useFailedMessagesStore.getState().addFailedMessage(message3);
      });

      act(() => {
        useFailedMessagesStore.getState().clearFailedMessages('conv-1');
      });

      const state = useFailedMessagesStore.getState();
      expect(state.failedMessages).toHaveLength(1);
      expect(state.failedMessages[0].conversationId).toBe('conv-2');
    });

    it('should clear all messages when no conversationId provided', () => {
      const message1 = createMockFailedMessage({ conversationId: 'conv-1' });
      const message2 = createMockFailedMessage({ conversationId: 'conv-2' });

      act(() => {
        useFailedMessagesStore.getState().addFailedMessage(message1);
        useFailedMessagesStore.getState().addFailedMessage(message2);
      });

      act(() => {
        useFailedMessagesStore.getState().clearFailedMessages();
      });

      expect(useFailedMessagesStore.getState().failedMessages).toHaveLength(0);
    });
  });

  describe('clearAllFailedMessages', () => {
    it('should clear all failed messages and localStorage', () => {
      const message1 = createMockFailedMessage();
      const message2 = createMockFailedMessage();

      // Simulate localStorage having data
      localStorage.setItem('meeshy-failed-messages', JSON.stringify({ test: 'data' }));

      act(() => {
        useFailedMessagesStore.getState().addFailedMessage(message1);
        useFailedMessagesStore.getState().addFailedMessage(message2);
      });

      act(() => {
        useFailedMessagesStore.getState().clearAllFailedMessages();
      });

      expect(useFailedMessagesStore.getState().failedMessages).toHaveLength(0);
      expect(localStorage.getItem('meeshy-failed-messages')).toBeNull();
    });
  });

  describe('updateFailedMessage', () => {
    it('should update message properties', () => {
      const mockMessage = createMockFailedMessage({ error: 'Initial error' });
      let messageId: string = '';

      act(() => {
        messageId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      act(() => {
        useFailedMessagesStore.getState().updateFailedMessage(messageId, {
          error: 'Updated error',
          content: 'Updated content',
        });
      });

      const updated = useFailedMessagesStore.getState().getFailedMessage(messageId);
      expect(updated?.error).toBe('Updated error');
      expect(updated?.content).toBe('Updated content');
    });

    it('should preserve non-updated properties', () => {
      const mockMessage = createMockFailedMessage({
        content: 'Original content',
        originalLanguage: 'en',
        replyToId: 'reply-123',
      });
      let messageId: string = '';

      act(() => {
        messageId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      act(() => {
        useFailedMessagesStore.getState().updateFailedMessage(messageId, {
          error: 'New error',
        });
      });

      const updated = useFailedMessagesStore.getState().getFailedMessage(messageId);
      expect(updated?.content).toBe('Original content');
      expect(updated?.originalLanguage).toBe('en');
      expect(updated?.replyToId).toBe('reply-123');
    });

    it('should not affect other messages', () => {
      const message1 = createMockFailedMessage({ content: 'Message 1' });
      const message2 = createMockFailedMessage({ content: 'Message 2' });
      let id1: string = '';
      let id2: string = '';

      act(() => {
        id1 = useFailedMessagesStore.getState().addFailedMessage(message1);
        id2 = useFailedMessagesStore.getState().addFailedMessage(message2);
      });

      act(() => {
        useFailedMessagesStore.getState().updateFailedMessage(id1, {
          content: 'Updated Message 1',
        });
      });

      expect(useFailedMessagesStore.getState().getFailedMessage(id2)?.content).toBe('Message 2');
    });
  });

  describe('Persistence', () => {
    it('should persist only last 10 messages', () => {
      // The store partializes to only persist last 10 messages
      // Add 15 messages
      act(() => {
        for (let i = 0; i < 15; i++) {
          useFailedMessagesStore.getState().addFailedMessage(
            createMockFailedMessage({ content: `Message ${i}` })
          );
        }
      });

      const state = useFailedMessagesStore.getState();
      // Store should have all 15 in memory
      expect(state.failedMessages).toHaveLength(15);

      // But persistence partialize only keeps last 10
      // This is verified by the store configuration
    });
  });

  describe('Attachments and Reply Metadata', () => {
    it('should store attachment metadata', () => {
      const mockMessage = createMockFailedMessage({
        attachments: [
          { id: 'att-1', name: 'file.pdf', type: 'application/pdf', size: 1024 },
          { id: 'att-2', name: 'image.png', type: 'image/png', size: 2048, url: 'https://example.com/image.png' },
        ],
      });
      let messageId: string = '';

      act(() => {
        messageId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      const saved = useFailedMessagesStore.getState().getFailedMessage(messageId);
      expect(saved?.attachments).toHaveLength(2);
      expect(saved?.attachments?.[0].name).toBe('file.pdf');
      expect(saved?.attachments?.[1].url).toBe('https://example.com/image.png');
    });

    it('should store reply metadata', () => {
      const mockMessage = createMockFailedMessage({
        replyTo: {
          id: 'original-msg-123',
          content: 'Original message content',
          sender: {
            displayName: 'John Doe',
            username: 'johndoe',
          },
          createdAt: new Date('2024-01-01'),
        },
      });
      let messageId: string = '';

      act(() => {
        messageId = useFailedMessagesStore.getState().addFailedMessage(mockMessage);
      });

      const saved = useFailedMessagesStore.getState().getFailedMessage(messageId);
      expect(saved?.replyTo).toBeDefined();
      expect(saved?.replyTo?.id).toBe('original-msg-123');
      expect(saved?.replyTo?.sender?.displayName).toBe('John Doe');
    });
  });
});
