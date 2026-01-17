/**
 * Tests for FailedMessageBanner component
 * Tests failed message display, retry, restore, and dismiss functionality
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { FailedMessageBanner } from '../../../components/messages/failed-message-banner';
import type { FailedMessage } from '@/stores/failed-messages-store';

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'bubbleStream.messageSendFailed': 'Message send failed',
        'bubbleStream.retries': 'retries',
        'bubbleStream.attachments': 'attachments',
        'bubbleStream.emptyMessage': 'Empty message',
        'bubbleStream.messageSentSuccessfully': 'Message sent successfully',
        'bubbleStream.retryFailed': 'Retry failed',
        'bubbleStream.retryError': 'Error during retry',
        'bubbleStream.messageRestored': 'Message restored to composer',
        'bubbleStream.messageDismissed': 'Message dismissed',
        'bubbleStream.allMessagesDismissed': 'All failed messages dismissed',
        'restoreMessage': 'Restore',
        'retryNow': 'Retry',
        'retrying': 'Retrying...',
        'dismiss': 'Dismiss',
        'dismissAll': 'Dismiss All',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock toast
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
const mockToastInfo = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    success: (...args: any[]) => mockToastSuccess(...args),
    error: (...args: any[]) => mockToastError(...args),
    info: (...args: any[]) => mockToastInfo(...args),
  },
}));

// Mock failed messages store
const mockGetFailedMessagesForConversation = jest.fn();
const mockRemoveFailedMessage = jest.fn();
const mockClearFailedMessages = jest.fn();
const mockIncrementRetryCount = jest.fn();

jest.mock('@/stores/failed-messages-store', () => ({
  useFailedMessagesStore: () => ({
    getFailedMessagesForConversation: mockGetFailedMessagesForConversation,
    removeFailedMessage: mockRemoveFailedMessage,
    clearFailedMessages: mockClearFailedMessages,
    incrementRetryCount: mockIncrementRetryCount,
  }),
}));

// Create mock failed message
const createMockFailedMessage = (overrides: Partial<FailedMessage> = {}): FailedMessage => ({
  id: 'failed-msg-1',
  conversationId: 'conv-123',
  content: 'This is a failed message',
  attachmentIds: [],
  retryCount: 0,
  timestamp: Date.now(),
  error: 'Network error',
  ...overrides,
});

describe('FailedMessageBanner', () => {
  const mockOnRetry = jest.fn();
  const mockOnRestore = jest.fn();
  const conversationId = 'conv-123';

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetFailedMessagesForConversation.mockReturnValue([]);
    mockOnRetry.mockResolvedValue(true);
  });

  describe('When no failed messages', () => {
    it('should render nothing when there are no failed messages', () => {
      mockGetFailedMessagesForConversation.mockReturnValue([]);

      const { container } = render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Single Failed Message', () => {
    it('should render failed message banner', () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('Message send failed')).toBeInTheDocument();
    });

    it('should display message content', () => {
      const failedMessage = createMockFailedMessage({
        content: 'My important message that failed',
      });
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('My important message that failed')).toBeInTheDocument();
    });

    it('should display attachment count when message has attachments', () => {
      const failedMessage = createMockFailedMessage({
        content: '',
        attachmentIds: ['att-1', 'att-2', 'att-3'],
      });
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('3 attachments')).toBeInTheDocument();
    });

    it('should display empty message text when no content or attachments', () => {
      const failedMessage = createMockFailedMessage({
        content: '',
        attachmentIds: [],
      });
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('Empty message')).toBeInTheDocument();
    });

    it('should display retry count when greater than 0', () => {
      const failedMessage = createMockFailedMessage({
        retryCount: 3,
      });
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('(3 retries)')).toBeInTheDocument();
    });
  });

  describe('Restore Button', () => {
    it('should render restore button', () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('Restore')).toBeInTheDocument();
    });

    it('should call onRestore and remove message when restore is clicked', async () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      fireEvent.click(screen.getByText('Restore'));

      expect(mockOnRestore).toHaveBeenCalledWith(failedMessage);
      expect(mockRemoveFailedMessage).toHaveBeenCalledWith('failed-msg-1');
      expect(mockToastInfo).toHaveBeenCalledWith('Message restored to composer');
    });
  });

  describe('Retry Button', () => {
    it('should render retry button', () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('Retry')).toBeInTheDocument();
    });

    it('should call onRetry when retry button is clicked', async () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      await waitFor(() => {
        expect(mockOnRetry).toHaveBeenCalledWith(failedMessage);
        expect(mockIncrementRetryCount).toHaveBeenCalledWith('failed-msg-1');
      });
    });

    it('should show success toast and remove message when retry succeeds', async () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);
      mockOnRetry.mockResolvedValue(true);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      await waitFor(() => {
        expect(mockRemoveFailedMessage).toHaveBeenCalledWith('failed-msg-1');
        expect(mockToastSuccess).toHaveBeenCalledWith('Message sent successfully');
      });
    });

    it('should show error toast when retry fails', async () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);
      mockOnRetry.mockResolvedValue(false);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Retry failed');
      });
    });

    it('should show loading state while retrying', async () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      // Make retry take some time
      let resolveRetry: (value: boolean) => void;
      mockOnRetry.mockImplementation(() => new Promise((resolve) => {
        resolveRetry = resolve;
      }));

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      // Click retry
      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      // Should show loading state
      expect(screen.getByText('Retrying...')).toBeInTheDocument();

      // Resolve the retry
      await act(async () => {
        resolveRetry!(true);
      });
    });

    it('should disable buttons while retrying', async () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      let resolveRetry: (value: boolean) => void;
      mockOnRetry.mockImplementation(() => new Promise((resolve) => {
        resolveRetry = resolve;
      }));

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      // Buttons should be disabled
      expect(screen.getByText('Restore').closest('button')).toBeDisabled();
      expect(screen.getByText('Dismiss').closest('button')).toBeDisabled();

      await act(async () => {
        resolveRetry!(true);
      });
    });
  });

  describe('Dismiss Button', () => {
    it('should render dismiss button', () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('Dismiss')).toBeInTheDocument();
    });

    it('should remove message when dismiss is clicked', () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      fireEvent.click(screen.getByText('Dismiss'));

      expect(mockRemoveFailedMessage).toHaveBeenCalledWith('failed-msg-1');
      expect(mockToastInfo).toHaveBeenCalledWith('Message dismissed');
    });
  });

  describe('Multiple Failed Messages', () => {
    it('should render multiple failed messages', () => {
      const failedMessages = [
        createMockFailedMessage({ id: 'msg-1', content: 'First failed message' }),
        createMockFailedMessage({ id: 'msg-2', content: 'Second failed message' }),
      ];
      mockGetFailedMessagesForConversation.mockReturnValue(failedMessages);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('First failed message')).toBeInTheDocument();
      expect(screen.getByText('Second failed message')).toBeInTheDocument();
    });

    it('should show dismiss all button when multiple messages', () => {
      const failedMessages = [
        createMockFailedMessage({ id: 'msg-1' }),
        createMockFailedMessage({ id: 'msg-2' }),
      ];
      mockGetFailedMessagesForConversation.mockReturnValue(failedMessages);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.getByText('Dismiss All')).toBeInTheDocument();
    });

    it('should not show dismiss all button for single message', () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(screen.queryByText('Dismiss All')).not.toBeInTheDocument();
    });

    it('should clear all messages when dismiss all is clicked', () => {
      const failedMessages = [
        createMockFailedMessage({ id: 'msg-1' }),
        createMockFailedMessage({ id: 'msg-2' }),
      ];
      mockGetFailedMessagesForConversation.mockReturnValue(failedMessages);

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      fireEvent.click(screen.getByText('Dismiss All'));

      expect(mockClearFailedMessages).toHaveBeenCalledWith(conversationId);
      expect(mockToastInfo).toHaveBeenCalledWith('All failed messages dismissed');
    });
  });

  describe('Error Handling', () => {
    it('should handle retry error gracefully', async () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);
      mockOnRetry.mockRejectedValue(new Error('Network error'));

      render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      await act(async () => {
        fireEvent.click(screen.getByText('Retry'));
      });

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith('Error during retry');
      });
    });
  });

  describe('Styling', () => {
    it('should have error styling', () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      const { container } = render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      // Should have red border indicating error
      const banner = container.querySelector('.border-red-500');
      expect(banner).toBeInTheDocument();
    });

    it('should have alert icon', () => {
      const failedMessage = createMockFailedMessage();
      mockGetFailedMessagesForConversation.mockReturnValue([failedMessage]);

      const { container } = render(
        <FailedMessageBanner
          conversationId={conversationId}
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      // Should have AlertCircle icon
      const alertIcon = container.querySelector('[data-testid="alertcircle-icon"]');
      expect(alertIcon).toBeInTheDocument();
    });
  });

  describe('Conversation Filtering', () => {
    it('should get failed messages for correct conversation', () => {
      mockGetFailedMessagesForConversation.mockReturnValue([]);

      render(
        <FailedMessageBanner
          conversationId="specific-conv-id"
          onRetry={mockOnRetry}
          onRestore={mockOnRestore}
        />
      );

      expect(mockGetFailedMessagesForConversation).toHaveBeenCalledWith('specific-conv-id');
    });
  });
});
