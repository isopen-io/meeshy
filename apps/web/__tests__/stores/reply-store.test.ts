/**
 * Reply Store Tests
 * Tests for reply state management with Zustand
 */

import { act } from '@testing-library/react';
import { useReplyStore, ReplyingToMessage } from '../../stores/reply-store';

describe('ReplyStore', () => {
  const mockReplyingToMessage: ReplyingToMessage = {
    id: 'msg-123',
    content: 'This is the original message',
    originalLanguage: 'en',
    sender: {
      id: 'user-456',
      username: 'johndoe',
      displayName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      avatar: 'https://example.com/avatar.png',
    },
    createdAt: new Date('2024-01-15T10:30:00Z'),
    translations: [
      {
        targetLanguage: 'fr',
        translatedContent: "C'est le message original",
      },
    ],
    attachments: [
      {
        id: 'att-1',
        filename: 'document.pdf',
        mimeType: 'application/pdf',
        size: 1024,
        url: 'https://example.com/document.pdf',
      },
    ],
  };

  const mockSimpleReplyMessage: ReplyingToMessage = {
    id: 'msg-456',
    content: 'Simple message',
    originalLanguage: 'es',
    createdAt: new Date('2024-01-16T14:00:00Z'),
  };

  beforeEach(() => {
    // Reset the store to initial state
    act(() => {
      useReplyStore.setState({
        replyingTo: null,
      });
    });
    jest.clearAllMocks();
  });

  describe('Initial State', () => {
    it('should have null replyingTo state', () => {
      const state = useReplyStore.getState();
      expect(state.replyingTo).toBeNull();
    });
  });

  describe('setReplyingTo', () => {
    it('should set the message being replied to', () => {
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
      });

      const state = useReplyStore.getState();
      expect(state.replyingTo).toEqual(mockReplyingToMessage);
    });

    it('should preserve all message properties', () => {
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
      });

      const replyingTo = useReplyStore.getState().replyingTo;

      expect(replyingTo?.id).toBe('msg-123');
      expect(replyingTo?.content).toBe('This is the original message');
      expect(replyingTo?.originalLanguage).toBe('en');
      expect(replyingTo?.sender?.id).toBe('user-456');
      expect(replyingTo?.sender?.displayName).toBe('John Doe');
      expect(replyingTo?.translations).toHaveLength(1);
      expect(replyingTo?.attachments).toHaveLength(1);
    });

    it('should replace existing reply message', () => {
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
        useReplyStore.getState().setReplyingTo(mockSimpleReplyMessage);
      });

      const state = useReplyStore.getState();
      expect(state.replyingTo?.id).toBe('msg-456');
      expect(state.replyingTo?.content).toBe('Simple message');
    });

    it('should clear reply when set to null', () => {
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
        useReplyStore.getState().setReplyingTo(null);
      });

      expect(useReplyStore.getState().replyingTo).toBeNull();
    });

    it('should handle message without optional fields', () => {
      act(() => {
        useReplyStore.getState().setReplyingTo(mockSimpleReplyMessage);
      });

      const replyingTo = useReplyStore.getState().replyingTo;

      expect(replyingTo?.id).toBe('msg-456');
      expect(replyingTo?.content).toBe('Simple message');
      expect(replyingTo?.sender).toBeUndefined();
      expect(replyingTo?.translations).toBeUndefined();
      expect(replyingTo?.attachments).toBeUndefined();
    });

    it('should handle message with partial sender info', () => {
      const messageWithPartialSender: ReplyingToMessage = {
        id: 'msg-789',
        content: 'Message with partial sender',
        originalLanguage: 'en',
        sender: {
          id: 'user-789',
          displayName: 'Jane',
          // username and other fields omitted
        },
        createdAt: new Date(),
      };

      act(() => {
        useReplyStore.getState().setReplyingTo(messageWithPartialSender);
      });

      const replyingTo = useReplyStore.getState().replyingTo;
      expect(replyingTo?.sender?.id).toBe('user-789');
      expect(replyingTo?.sender?.displayName).toBe('Jane');
      expect(replyingTo?.sender?.username).toBeUndefined();
    });
  });

  describe('clearReply', () => {
    it('should clear the reply state', () => {
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
      });

      expect(useReplyStore.getState().replyingTo).not.toBeNull();

      act(() => {
        useReplyStore.getState().clearReply();
      });

      expect(useReplyStore.getState().replyingTo).toBeNull();
    });

    it('should be safe to call when already null', () => {
      expect(useReplyStore.getState().replyingTo).toBeNull();

      act(() => {
        useReplyStore.getState().clearReply();
      });

      expect(useReplyStore.getState().replyingTo).toBeNull();
    });

    it('should clear multiple times without issue', () => {
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
        useReplyStore.getState().clearReply();
        useReplyStore.getState().clearReply();
        useReplyStore.getState().clearReply();
      });

      expect(useReplyStore.getState().replyingTo).toBeNull();
    });
  });

  describe('Workflow Scenarios', () => {
    it('should support typical reply workflow', () => {
      // User clicks reply on a message
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
      });
      expect(useReplyStore.getState().replyingTo).not.toBeNull();

      // User sends the reply (clear the state)
      act(() => {
        useReplyStore.getState().clearReply();
      });
      expect(useReplyStore.getState().replyingTo).toBeNull();
    });

    it('should support cancel reply workflow', () => {
      // User clicks reply
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
      });

      // User clicks cancel
      act(() => {
        useReplyStore.getState().clearReply();
      });

      expect(useReplyStore.getState().replyingTo).toBeNull();
    });

    it('should support changing reply target', () => {
      // User clicks reply on first message
      act(() => {
        useReplyStore.getState().setReplyingTo(mockReplyingToMessage);
      });
      expect(useReplyStore.getState().replyingTo?.id).toBe('msg-123');

      // User clicks reply on different message
      act(() => {
        useReplyStore.getState().setReplyingTo(mockSimpleReplyMessage);
      });
      expect(useReplyStore.getState().replyingTo?.id).toBe('msg-456');
    });
  });

  describe('Date Handling', () => {
    it('should preserve Date objects', () => {
      const specificDate = new Date('2024-06-15T12:00:00Z');
      const messageWithDate: ReplyingToMessage = {
        id: 'msg-date',
        content: 'Message with specific date',
        originalLanguage: 'en',
        createdAt: specificDate,
      };

      act(() => {
        useReplyStore.getState().setReplyingTo(messageWithDate);
      });

      const replyingTo = useReplyStore.getState().replyingTo;
      expect(replyingTo?.createdAt).toEqual(specificDate);
      expect(replyingTo?.createdAt.getFullYear()).toBe(2024);
      expect(replyingTo?.createdAt.getMonth()).toBe(5); // June (0-indexed)
    });
  });

  describe('Translations Array', () => {
    it('should handle multiple translations', () => {
      const messageWithMultipleTranslations: ReplyingToMessage = {
        id: 'msg-trans',
        content: 'Hello, world!',
        originalLanguage: 'en',
        createdAt: new Date(),
        translations: [
          { targetLanguage: 'fr', translatedContent: 'Bonjour, monde!' },
          { targetLanguage: 'es', translatedContent: 'Hola, mundo!' },
          { targetLanguage: 'de', translatedContent: 'Hallo, Welt!' },
        ],
      };

      act(() => {
        useReplyStore.getState().setReplyingTo(messageWithMultipleTranslations);
      });

      const translations = useReplyStore.getState().replyingTo?.translations;
      expect(translations).toHaveLength(3);
      expect(translations?.find(t => t.targetLanguage === 'fr')?.translatedContent).toBe('Bonjour, monde!');
      expect(translations?.find(t => t.targetLanguage === 'es')?.translatedContent).toBe('Hola, mundo!');
    });

    it('should handle empty translations array', () => {
      const messageWithEmptyTranslations: ReplyingToMessage = {
        id: 'msg-empty-trans',
        content: 'No translations',
        originalLanguage: 'en',
        createdAt: new Date(),
        translations: [],
      };

      act(() => {
        useReplyStore.getState().setReplyingTo(messageWithEmptyTranslations);
      });

      const translations = useReplyStore.getState().replyingTo?.translations;
      expect(translations).toEqual([]);
    });
  });

  describe('Attachments Array', () => {
    it('should handle multiple attachments', () => {
      const messageWithMultipleAttachments: ReplyingToMessage = {
        id: 'msg-att',
        content: 'Message with files',
        originalLanguage: 'en',
        createdAt: new Date(),
        attachments: [
          { id: 'att-1', filename: 'doc.pdf', mimeType: 'application/pdf', size: 1024 },
          { id: 'att-2', filename: 'image.png', mimeType: 'image/png', size: 2048 },
          { id: 'att-3', filename: 'audio.mp3', mimeType: 'audio/mpeg', size: 3072 },
        ],
      };

      act(() => {
        useReplyStore.getState().setReplyingTo(messageWithMultipleAttachments);
      });

      const attachments = useReplyStore.getState().replyingTo?.attachments;
      expect(attachments).toHaveLength(3);
      expect(attachments?.find(a => a.id === 'att-2')?.mimeType).toBe('image/png');
    });
  });
});
