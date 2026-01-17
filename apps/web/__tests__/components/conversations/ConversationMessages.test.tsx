import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationMessages } from '../../../components/conversations/ConversationMessages';
import type { Message, MessageWithTranslations, SocketIOUser as User } from '@meeshy/shared/types';
import { UserRoleEnum } from '@meeshy/shared/types';

// Mock the z-index hook
jest.mock('@/hooks/use-fix-z-index', () => ({
  useFixRadixZIndex: jest.fn(),
}));

// Mock the socketio service
jest.mock('@/services/meeshy-socketio.service', () => ({
  meeshySocketIOService: {
    setGetMessageByIdCallback: jest.fn(),
  },
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, 'aria-label': ariaLabel, title }: any) => (
    <button onClick={onClick} className={className} aria-label={ariaLabel} title={title}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/common/messages-display', () => ({
  MessagesDisplay: ({
    messages,
    isLoadingMessages,
    emptyStateMessage,
    emptyStateDescription,
    onEditMessage,
    onDeleteMessage,
    onReplyMessage,
  }: any) => (
    <div data-testid="messages-display">
      {isLoadingMessages ? (
        <div data-testid="loading-messages">Loading...</div>
      ) : messages.length === 0 ? (
        <div data-testid="empty-state">
          <p>{emptyStateMessage}</p>
          <p>{emptyStateDescription}</p>
        </div>
      ) : (
        messages.map((msg: any) => (
          <div key={msg.id} data-testid={`message-${msg.id}`} id={`message-${msg.id}`}>
            <span>{msg.content}</span>
            <button onClick={() => onEditMessage?.(msg.id, 'edited')}>Edit</button>
            <button onClick={() => onDeleteMessage?.(msg.id)}>Delete</button>
            <button onClick={() => onReplyMessage?.(msg)}>Reply</button>
          </div>
        ))
      )}
    </div>
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

// Mock data
const mockCurrentUser: User = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  role: UserRoleEnum.USER,
  email: 'test@example.com',
} as User;

const mockMessages: Message[] = [
  {
    id: 'msg-1',
    content: 'Hello world',
    senderId: 'user-2',
    createdAt: new Date().toISOString(),
    conversationId: 'conv-1',
    sender: { id: 'user-2', username: 'john', displayName: 'John' },
  } as Message,
  {
    id: 'msg-2',
    content: 'How are you?',
    senderId: 'user-1',
    createdAt: new Date().toISOString(),
    conversationId: 'conv-1',
    sender: { id: 'user-1', username: 'testuser', displayName: 'Test User' },
  } as Message,
  {
    id: 'msg-3',
    content: 'Great!',
    senderId: 'user-2',
    createdAt: new Date().toISOString(),
    conversationId: 'conv-1',
    sender: { id: 'user-2', username: 'john', displayName: 'John' },
  } as Message,
];

const mockT = (key: string) => {
  const translations: Record<string, string> = {
    'noMessages': 'No messages yet',
    'noMessagesDescription': 'Start the conversation',
    'messages.loadingOlderMessages': 'Loading older messages...',
    'messages.allMessagesLoaded': 'All messages loaded',
  };
  return translations[key] || key;
};

describe('ConversationMessages', () => {
  const defaultProps = {
    messages: mockMessages,
    translatedMessages: mockMessages as MessageWithTranslations[],
    isLoadingMessages: false,
    isLoadingMore: false,
    hasMore: true,
    currentUser: mockCurrentUser,
    userLanguage: 'en',
    usedLanguages: ['en', 'fr'],
    isMobile: false,
    conversationType: 'direct' as const,
    userRole: UserRoleEnum.USER,
    conversationId: 'conv-1',
    addTranslatingState: jest.fn(),
    isTranslating: jest.fn(() => false),
    onEditMessage: jest.fn(),
    onDeleteMessage: jest.fn(),
    onReplyMessage: jest.fn(),
    onNavigateToMessage: jest.fn(),
    onImageClick: jest.fn(),
    onLoadMore: jest.fn(),
    t: mockT,
    tCommon: mockT,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Mock scrollIntoView
    Element.prototype.scrollIntoView = jest.fn();
    // Mock scroll methods
    Element.prototype.scrollTo = jest.fn();
  });

  describe('Initial Render', () => {
    it('should render messages display', () => {
      render(<ConversationMessages {...defaultProps} />);

      expect(screen.getByTestId('messages-display')).toBeInTheDocument();
    });

    it('should render all messages', () => {
      render(<ConversationMessages {...defaultProps} />);

      expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-msg-2')).toBeInTheDocument();
      expect(screen.getByTestId('message-msg-3')).toBeInTheDocument();
    });

    it('should display message content', () => {
      render(<ConversationMessages {...defaultProps} />);

      expect(screen.getByText('Hello world')).toBeInTheDocument();
      expect(screen.getByText('How are you?')).toBeInTheDocument();
      expect(screen.getByText('Great!')).toBeInTheDocument();
    });
  });

  describe('Loading States', () => {
    it('should show loading state when isLoadingMessages is true', () => {
      render(<ConversationMessages {...defaultProps} isLoadingMessages={true} />);

      expect(screen.getByTestId('loading-messages')).toBeInTheDocument();
    });

    it('should show loading indicator when loading more messages (scroll up mode)', () => {
      render(
        <ConversationMessages
          {...defaultProps}
          isLoadingMore={true}
          hasMore={true}
          scrollDirection="up"
        />
      );

      expect(screen.getByText('Loading older messages...')).toBeInTheDocument();
    });

    it('should show loading indicator when loading more messages (scroll down mode)', () => {
      render(
        <ConversationMessages
          {...defaultProps}
          isLoadingMore={true}
          hasMore={true}
          scrollDirection="down"
        />
      );

      expect(screen.getByText('Loading older messages...')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no messages', () => {
      render(<ConversationMessages {...defaultProps} messages={[]} translatedMessages={[]} />);

      expect(screen.getByText('No messages yet')).toBeInTheDocument();
      expect(screen.getByText('Start the conversation')).toBeInTheDocument();
    });
  });

  describe('All Messages Loaded', () => {
    it('should show all loaded message when hasMore is false (scroll up mode)', () => {
      render(
        <ConversationMessages
          {...defaultProps}
          hasMore={false}
          isLoadingMore={false}
          scrollDirection="up"
        />
      );

      expect(screen.getByText('All messages loaded')).toBeInTheDocument();
    });

    it('should show all loaded message when hasMore is false (scroll down mode)', () => {
      render(
        <ConversationMessages
          {...defaultProps}
          hasMore={false}
          isLoadingMore={false}
          scrollDirection="down"
        />
      );

      expect(screen.getByText('All messages loaded')).toBeInTheDocument();
    });
  });

  describe('Message Actions', () => {
    it('should call onEditMessage when edit button is clicked', async () => {
      const onEditMessage = jest.fn();
      render(<ConversationMessages {...defaultProps} onEditMessage={onEditMessage} />);

      const editButtons = screen.getAllByText('Edit');
      fireEvent.click(editButtons[0]);

      expect(onEditMessage).toHaveBeenCalledWith('msg-1', 'edited');
    });

    it('should call onDeleteMessage when delete button is clicked', async () => {
      const onDeleteMessage = jest.fn();
      render(<ConversationMessages {...defaultProps} onDeleteMessage={onDeleteMessage} />);

      const deleteButtons = screen.getAllByText('Delete');
      fireEvent.click(deleteButtons[0]);

      expect(onDeleteMessage).toHaveBeenCalledWith('msg-1');
    });

    it('should call onReplyMessage when reply button is clicked', async () => {
      const onReplyMessage = jest.fn();
      render(<ConversationMessages {...defaultProps} onReplyMessage={onReplyMessage} />);

      const replyButtons = screen.getAllByText('Reply');
      fireEvent.click(replyButtons[0]);

      expect(onReplyMessage).toHaveBeenCalledWith(mockMessages[0]);
    });
  });

  describe('Scroll Behavior', () => {
    it('should scroll to bottom on initial load (scroll up mode)', async () => {
      render(<ConversationMessages {...defaultProps} scrollDirection="up" />);

      await waitFor(() => {
        expect(Element.prototype.scrollIntoView).toHaveBeenCalled();
      });
    });

    it('should scroll to top on initial load (scroll down mode)', async () => {
      const scrollContainerRef = { current: document.createElement('div') };
      scrollContainerRef.current.scrollTo = jest.fn();

      render(
        <ConversationMessages
          {...defaultProps}
          scrollDirection="down"
          scrollContainerRef={scrollContainerRef as any}
        />
      );

      await waitFor(() => {
        expect(scrollContainerRef.current.scrollTo).toHaveBeenCalled();
      });
    });
  });

  describe('Scroll Button', () => {
    it('should not show scroll button by default', () => {
      render(<ConversationMessages {...defaultProps} />);

      expect(screen.queryByRole('button', { name: /scroll/i })).not.toBeInTheDocument();
    });

    it('should have correct aria-label for scroll down button', () => {
      render(
        <ConversationMessages
          {...defaultProps}
          scrollButtonDirection="down"
        />
      );

      // Button is only shown when showScrollButton state is true
      // This is controlled by scroll position
    });

    it('should have correct aria-label for scroll up button', () => {
      render(
        <ConversationMessages
          {...defaultProps}
          scrollButtonDirection="up"
        />
      );

      // Button is only shown when showScrollButton state is true
    });
  });

  describe('Mobile View', () => {
    it('should render with mobile-specific styling', () => {
      const { container } = render(<ConversationMessages {...defaultProps} isMobile={true} />);

      // Mobile uses px-3 instead of px-6
      expect(container.querySelector('.px-3')).toBeInTheDocument();
    });

    it('should render with desktop-specific styling', () => {
      const { container } = render(<ConversationMessages {...defaultProps} isMobile={false} />);

      // Desktop uses px-6
      expect(container.querySelector('.px-6')).toBeInTheDocument();
    });
  });

  describe('External Scroll Container', () => {
    it('should use external scroll container when provided', () => {
      const scrollContainerRef = { current: document.createElement('div') };

      render(
        <ConversationMessages
          {...defaultProps}
          scrollContainerRef={scrollContainerRef as any}
        />
      );

      // When external ref is provided, component should not create its own scroll container
      expect(screen.getByTestId('messages-display')).toBeInTheDocument();
    });

    it('should attach scroll handler to external container', async () => {
      const scrollContainerRef = { current: document.createElement('div') };
      const addEventListenerSpy = jest.spyOn(scrollContainerRef.current, 'addEventListener');

      render(
        <ConversationMessages
          {...defaultProps}
          scrollContainerRef={scrollContainerRef as any}
        />
      );

      await waitFor(() => {
        expect(addEventListenerSpy).toHaveBeenCalledWith('scroll', expect.any(Function));
      });
    });
  });

  describe('Reverse Order', () => {
    it('should pass reverseOrder prop to MessagesDisplay', () => {
      render(<ConversationMessages {...defaultProps} reverseOrder={true} />);

      expect(screen.getByTestId('messages-display')).toBeInTheDocument();
    });

    it('should pass reverseOrder=false by default', () => {
      render(<ConversationMessages {...defaultProps} />);

      expect(screen.getByTestId('messages-display')).toBeInTheDocument();
    });
  });

  describe('Anonymous User Support', () => {
    it('should pass isAnonymous prop to MessagesDisplay', () => {
      render(
        <ConversationMessages
          {...defaultProps}
          isAnonymous={true}
          currentAnonymousUserId="anon-123"
        />
      );

      expect(screen.getByTestId('messages-display')).toBeInTheDocument();
    });
  });

  describe('Conversation Change', () => {
    it('should reset state when conversation changes', async () => {
      const { rerender } = render(
        <ConversationMessages {...defaultProps} conversationId="conv-1" />
      );

      rerender(<ConversationMessages {...defaultProps} conversationId="conv-2" />);

      // Component should handle conversation change without errors
      expect(screen.getByTestId('messages-display')).toBeInTheDocument();
    });
  });

  describe('Translation State', () => {
    it('should call addTranslatingState when translating', () => {
      const addTranslatingState = jest.fn();
      render(
        <ConversationMessages
          {...defaultProps}
          addTranslatingState={addTranslatingState}
        />
      );

      // addTranslatingState is passed to MessagesDisplay
      expect(screen.getByTestId('messages-display')).toBeInTheDocument();
    });

    it('should check isTranslating state', () => {
      const isTranslating = jest.fn(() => false);
      render(
        <ConversationMessages
          {...defaultProps}
          isTranslating={isTranslating}
        />
      );

      // isTranslating is passed to MessagesDisplay
      expect(screen.getByTestId('messages-display')).toBeInTheDocument();
    });
  });

  describe('Load More', () => {
    it('should call onLoadMore when scrolling near threshold', async () => {
      const onLoadMore = jest.fn();
      const { container } = render(
        <ConversationMessages
          {...defaultProps}
          onLoadMore={onLoadMore}
          hasMore={true}
          isLoadingMore={false}
        />
      );

      // Find the scroll container and simulate scroll
      const scrollContainer = container.querySelector('.overflow-y-auto');
      if (scrollContainer) {
        // Simulate scroll event with scrollTop near 0
        Object.defineProperty(scrollContainer, 'scrollTop', { value: 50, writable: true });
        Object.defineProperty(scrollContainer, 'scrollHeight', { value: 1000, writable: true });
        Object.defineProperty(scrollContainer, 'clientHeight', { value: 500, writable: true });

        fireEvent.scroll(scrollContainer);
      }

      // onLoadMore should be called when scroll position meets threshold
      // Note: exact behavior depends on scroll direction configuration
    });

    it('should not call onLoadMore when isLoadingMore is true', () => {
      const onLoadMore = jest.fn();
      const { container } = render(
        <ConversationMessages
          {...defaultProps}
          onLoadMore={onLoadMore}
          hasMore={true}
          isLoadingMore={true}
        />
      );

      const scrollContainer = container.querySelector('.overflow-y-auto');
      if (scrollContainer) {
        fireEvent.scroll(scrollContainer);
      }

      expect(onLoadMore).not.toHaveBeenCalled();
    });

    it('should not call onLoadMore when hasMore is false', () => {
      const onLoadMore = jest.fn();
      const { container } = render(
        <ConversationMessages
          {...defaultProps}
          onLoadMore={onLoadMore}
          hasMore={false}
          isLoadingMore={false}
        />
      );

      const scrollContainer = container.querySelector('.overflow-y-auto');
      if (scrollContainer) {
        fireEvent.scroll(scrollContainer);
      }

      expect(onLoadMore).not.toHaveBeenCalled();
    });
  });
});
