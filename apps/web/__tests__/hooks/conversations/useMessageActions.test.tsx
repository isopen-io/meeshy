/**
 * Tests for useMessageActions hook
 *
 * Tests cover:
 * - handleEditMessage functionality
 * - handleDeleteMessage functionality
 * - handleNavigateToMessage (with lazy loading)
 * - imageAttachments extraction
 * - Optimistic updates
 * - Rollback on error
 * - Input sanitization
 * - Toast notifications
 */

import { renderHook, act, waitFor } from '@testing-library/react';
import { useMessageActions } from '@/hooks/conversations/useMessageActions';
import type { Message, Attachment } from '@meeshy/shared/types';

// Mock toast
const mockToastError = jest.fn();
const mockToastSuccess = jest.fn();
const mockToastInfo = jest.fn();

jest.mock('sonner', () => ({
  toast: {
    error: (msg: string) => mockToastError(msg),
    success: (msg: string) => mockToastSuccess(msg),
    info: (msg: string) => mockToastInfo(msg),
  },
}));

// Mock message service
const mockEditMessage = jest.fn();
const mockDeleteMessage = jest.fn();

jest.mock('@/services/message.service', () => ({
  messageService: {
    editMessage: (...args: any[]) => mockEditMessage(...args),
    deleteMessage: (...args: any[]) => mockDeleteMessage(...args),
  },
}));

// Mock sanitizeText
jest.mock('@/utils/xss-protection', () => ({
  sanitizeText: (text: string) => text.replace(/<script>/g, '').replace(/<\/script>/g, ''),
}));

describe('useMessageActions', () => {
  const mockConversationId = 'conv-123';
  const mockSelectedLanguage = 'en';

  const mockMessages: Message[] = [
    {
      id: 'msg-1',
      conversationId: mockConversationId,
      senderId: 'user-1',
      content: 'Hello world',
      originalLanguage: 'en',
      createdAt: new Date(),
      attachments: [
        { id: 'att-1', mimeType: 'image/png', url: 'http://example.com/1.png' } as Attachment,
        { id: 'att-2', mimeType: 'application/pdf', url: 'http://example.com/doc.pdf' } as Attachment,
      ],
    } as Message,
    {
      id: 'msg-2',
      conversationId: mockConversationId,
      senderId: 'user-2',
      content: 'Response',
      originalLanguage: 'fr',
      createdAt: new Date(),
      attachments: [
        { id: 'att-3', mimeType: 'image/jpeg', url: 'http://example.com/2.jpg' } as Attachment,
      ],
    } as Message,
    {
      id: 'msg-3',
      conversationId: mockConversationId,
      senderId: 'user-1',
      content: 'No attachments',
      originalLanguage: 'en',
      createdAt: new Date(),
      attachments: [],
    } as Message,
  ];

  const mockUpdateMessage = jest.fn();
  const mockRemoveMessage = jest.fn();
  const mockRefreshMessages = jest.fn();
  const mockT = jest.fn((key: string) => key);
  const mockLoadMore = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockEditMessage.mockResolvedValue({});
    mockDeleteMessage.mockResolvedValue({});
    mockRefreshMessages.mockResolvedValue(undefined);
    mockLoadMore.mockResolvedValue(undefined);
  });

  const renderMessageActionsHook = (overrides = {}) => {
    return renderHook(() =>
      useMessageActions({
        conversationId: mockConversationId,
        messages: mockMessages,
        selectedLanguage: mockSelectedLanguage,
        updateMessage: mockUpdateMessage,
        removeMessage: mockRemoveMessage,
        refreshMessages: mockRefreshMessages,
        t: mockT,
        loadMore: mockLoadMore,
        hasMore: false,
        ...overrides,
      })
    );
  };

  describe('handleEditMessage', () => {
    it('should perform optimistic update', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleEditMessage('msg-1', 'Updated content');
      });

      expect(mockUpdateMessage).toHaveBeenCalledWith('msg-1', expect.any(Function));

      // Verify the updater function
      const updater = mockUpdateMessage.mock.calls[0][1];
      const updatedMessage = updater({
        id: 'msg-1',
        content: 'Original content',
      });

      expect(updatedMessage.content).toBe('Updated content');
      expect(updatedMessage.isEdited).toBe(true);
      expect(updatedMessage.editedAt).toBeInstanceOf(Date);
    });

    it('should call message service with correct params', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleEditMessage('msg-1', 'New content');
      });

      expect(mockEditMessage).toHaveBeenCalledWith(
        mockConversationId,
        'msg-1',
        {
          content: 'New content',
          originalLanguage: mockSelectedLanguage,
        }
      );
    });

    it('should show success toast on edit', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleEditMessage('msg-1', 'New content');
      });

      expect(mockToastSuccess).toHaveBeenCalledWith('messages.messageEdited');
    });

    it('should sanitize content before editing', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleEditMessage(
          'msg-1',
          '<script>alert("xss")</script>Safe content'
        );
      });

      expect(mockEditMessage).toHaveBeenCalledWith(
        mockConversationId,
        'msg-1',
        {
          content: 'alert("xss")Safe content',
          originalLanguage: mockSelectedLanguage,
        }
      );
    });

    it('should show error for empty content', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleEditMessage('msg-1', '   ');
      });

      expect(mockToastError).toHaveBeenCalledWith('messages.contentRequired');
      expect(mockEditMessage).not.toHaveBeenCalled();
    });

    it('should do nothing if conversationId is null', async () => {
      const { result } = renderMessageActionsHook({ conversationId: null });

      await act(async () => {
        await result.current.handleEditMessage('msg-1', 'New content');
      });

      expect(mockUpdateMessage).not.toHaveBeenCalled();
      expect(mockEditMessage).not.toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      mockEditMessage.mockRejectedValue(new Error('Network error'));

      const { result } = renderMessageActionsHook();

      await expect(
        act(async () => {
          await result.current.handleEditMessage('msg-1', 'New content');
        })
      ).rejects.toThrow();

      expect(mockToastError).toHaveBeenCalledWith('messages.editError');
      expect(mockRefreshMessages).toHaveBeenCalled();
    });
  });

  describe('handleDeleteMessage', () => {
    it('should perform optimistic delete', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleDeleteMessage('msg-1');
      });

      expect(mockRemoveMessage).toHaveBeenCalledWith('msg-1');
    });

    it('should call message service', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleDeleteMessage('msg-1');
      });

      expect(mockDeleteMessage).toHaveBeenCalledWith(mockConversationId, 'msg-1');
    });

    it('should show success toast on delete', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleDeleteMessage('msg-1');
      });

      expect(mockToastSuccess).toHaveBeenCalledWith('messages.messageDeleted');
    });

    it('should do nothing if conversationId is null', async () => {
      const { result } = renderMessageActionsHook({ conversationId: null });

      await act(async () => {
        await result.current.handleDeleteMessage('msg-1');
      });

      expect(mockRemoveMessage).not.toHaveBeenCalled();
      expect(mockDeleteMessage).not.toHaveBeenCalled();
    });

    it('should rollback on error', async () => {
      mockDeleteMessage.mockRejectedValue(new Error('Network error'));

      const { result } = renderMessageActionsHook();

      await expect(
        act(async () => {
          await result.current.handleDeleteMessage('msg-1');
        })
      ).rejects.toThrow();

      expect(mockToastError).toHaveBeenCalledWith('messages.deleteError');
      expect(mockRefreshMessages).toHaveBeenCalled();
    });
  });

  describe('handleNavigateToMessage', () => {
    it('should scroll to message if already in DOM', async () => {
      const mockElement = {
        scrollIntoView: jest.fn(),
        classList: {
          add: jest.fn(),
          remove: jest.fn(),
        },
      } as unknown as HTMLElement;

      const spy = jest.spyOn(document, 'getElementById').mockReturnValue(mockElement);

      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleNavigateToMessage('msg-1');
      });

      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'center',
      });

      spy.mockRestore();
    });

    it('should show success toast when message found', async () => {
      const mockElement = {
        scrollIntoView: jest.fn(),
        classList: { add: jest.fn(), remove: jest.fn() },
      } as unknown as HTMLElement;

      const spy = jest.spyOn(document, 'getElementById').mockReturnValue(mockElement);

      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleNavigateToMessage('msg-1');
      });

      expect(mockToastSuccess).toHaveBeenCalledWith('messages.messageFound');

      spy.mockRestore();
    });

    it('should show error if message not found and no loadMore', async () => {
      const spy = jest.spyOn(document, 'getElementById').mockReturnValue(null);

      const { result } = renderMessageActionsHook({
        messages: [],
        hasMore: false,
        loadMore: undefined,
      });

      await act(async () => {
        await result.current.handleNavigateToMessage('non-existent');
      });

      expect(mockToastError).toHaveBeenCalledWith('messages.messageNotFound');

      spy.mockRestore();
    });

    it('should add highlight classes to message element', async () => {
      const mockClassList = {
        add: jest.fn(),
        remove: jest.fn(),
      };

      const mockElement = {
        scrollIntoView: jest.fn(),
        classList: mockClassList,
      } as unknown as HTMLElement;

      const spy = jest.spyOn(document, 'getElementById').mockReturnValue(mockElement);

      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleNavigateToMessage('msg-1');
      });

      expect(mockClassList.add).toHaveBeenCalledWith(
        'ring-2',
        'ring-blue-500',
        'ring-offset-2'
      );

      spy.mockRestore();
    });
  });

  describe('imageAttachments', () => {
    it('should extract only image attachments', () => {
      const { result } = renderMessageActionsHook();

      expect(result.current.imageAttachments).toHaveLength(2);
      expect(result.current.imageAttachments[0].mimeType).toBe('image/png');
      expect(result.current.imageAttachments[1].mimeType).toBe('image/jpeg');
    });

    it('should not include non-image attachments', () => {
      const { result } = renderMessageActionsHook();

      const pdfAttachment = result.current.imageAttachments.find(
        a => a.mimeType === 'application/pdf'
      );
      expect(pdfAttachment).toBeUndefined();
    });

    it('should return empty array when no messages', () => {
      const { result } = renderMessageActionsHook({ messages: [] });

      expect(result.current.imageAttachments).toEqual([]);
    });

    it('should return empty array when no image attachments', () => {
      const messagesWithoutImages: Message[] = [
        {
          id: 'msg-1',
          conversationId: mockConversationId,
          content: 'Text only',
          attachments: [
            { id: 'att-1', mimeType: 'application/pdf' } as Attachment,
          ],
        } as Message,
      ];

      const { result } = renderMessageActionsHook({
        messages: messagesWithoutImages,
      });

      expect(result.current.imageAttachments).toEqual([]);
    });

    it('should handle messages without attachments array', () => {
      const messagesWithoutAttachments: Message[] = [
        {
          id: 'msg-1',
          conversationId: mockConversationId,
          content: 'No attachments',
          attachments: undefined,
        } as Message,
      ];

      const { result } = renderMessageActionsHook({
        messages: messagesWithoutAttachments,
      });

      expect(result.current.imageAttachments).toEqual([]);
    });

    it('should memoize imageAttachments', () => {
      const { result, rerender } = renderMessageActionsHook();

      const firstAttachments = result.current.imageAttachments;

      rerender();

      expect(result.current.imageAttachments).toBe(firstAttachments);
    });

    it('should update when messages change', () => {
      const { result, rerender } = renderHook(
        ({ messages }) =>
          useMessageActions({
            conversationId: mockConversationId,
            messages,
            selectedLanguage: mockSelectedLanguage,
            updateMessage: mockUpdateMessage,
            removeMessage: mockRemoveMessage,
            refreshMessages: mockRefreshMessages,
            t: mockT,
          }),
        { initialProps: { messages: mockMessages } }
      );

      expect(result.current.imageAttachments).toHaveLength(2);

      // Add new message with image
      const newMessages = [
        ...mockMessages,
        {
          id: 'msg-4',
          conversationId: mockConversationId,
          content: 'New',
          attachments: [
            { id: 'att-4', mimeType: 'image/gif' } as Attachment,
          ],
        } as Message,
      ];

      rerender({ messages: newMessages });

      expect(result.current.imageAttachments).toHaveLength(3);
    });
  });

  describe('Handler Stability', () => {
    it('should return stable handleEditMessage reference', () => {
      const { result, rerender } = renderMessageActionsHook();

      const firstHandler = result.current.handleEditMessage;

      rerender();

      expect(result.current.handleEditMessage).toBe(firstHandler);
    });

    it('should return stable handleDeleteMessage reference', () => {
      const { result, rerender } = renderMessageActionsHook();

      const firstHandler = result.current.handleDeleteMessage;

      rerender();

      expect(result.current.handleDeleteMessage).toBe(firstHandler);
    });

    it('should return stable handleNavigateToMessage reference', () => {
      const { result, rerender } = renderMessageActionsHook();

      const firstHandler = result.current.handleNavigateToMessage;

      rerender();

      expect(result.current.handleNavigateToMessage).toBe(firstHandler);
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent edit operations', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        const p1 = result.current.handleEditMessage('msg-1', 'Edit 1');
        const p2 = result.current.handleEditMessage('msg-2', 'Edit 2');
        await Promise.all([p1, p2]);
      });

      expect(mockEditMessage).toHaveBeenCalledTimes(2);
    });

    it('should handle t function returning different values', async () => {
      const customT = jest.fn((key: string) => {
        if (key === 'messages.contentRequired') return 'Content is required!';
        return key;
      });

      const { result } = renderMessageActionsHook({ t: customT });

      await act(async () => {
        await result.current.handleEditMessage('msg-1', '');
      });

      expect(mockToastError).toHaveBeenCalledWith('Content is required!');
    });

    it('should handle special characters in message content', async () => {
      const { result } = renderMessageActionsHook();

      await act(async () => {
        await result.current.handleEditMessage('msg-1', 'Hello & "world" <test>');
      });

      expect(mockEditMessage).toHaveBeenCalledWith(
        mockConversationId,
        'msg-1',
        expect.objectContaining({
          content: 'Hello & "world" <test>',
        })
      );
    });

    it('should handle unicode content', async () => {
      const { result } = renderMessageActionsHook();

      const unicodeContent = 'Hello! Just testing.';

      await act(async () => {
        await result.current.handleEditMessage('msg-1', unicodeContent);
      });

      expect(mockEditMessage).toHaveBeenCalledWith(
        mockConversationId,
        'msg-1',
        expect.objectContaining({
          content: unicodeContent,
        })
      );
    });
  });
});
