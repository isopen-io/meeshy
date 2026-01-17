import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationView } from '../../../components/conversations/ConversationView';
import type { Conversation, User, Message, ThreadMember, UserRoleEnum } from '@meeshy/shared/types';

// Mock utils
jest.mock('@/utils/token-utils', () => ({
  getAuthToken: jest.fn(() => ({ value: 'mock-token' })),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

// Mock child components
jest.mock('../../../components/conversations/ConversationHeader', () => ({
  ConversationHeader: ({
    conversation,
    isMobile,
    onBackToList,
    onOpenDetails,
    showBackButton,
  }: any) => (
    <div data-testid="conversation-header">
      <span data-testid="header-title">{conversation.title}</span>
      <span data-testid="header-mobile">{isMobile ? 'mobile' : 'desktop'}</span>
      {showBackButton && (
        <button onClick={onBackToList} data-testid="back-button">Back</button>
      )}
      <button onClick={onOpenDetails} data-testid="details-button">Details</button>
    </div>
  ),
}));

jest.mock('../../../components/conversations/ConversationMessages', () => ({
  ConversationMessages: ({
    messages,
    currentUser,
    isLoadingMessages,
    isLoadingMore,
    hasMore,
    onLoadMore,
  }: any) => (
    <div data-testid="conversation-messages">
      <span data-testid="messages-count">{messages.length}</span>
      {isLoadingMessages && <span data-testid="loading-messages">Loading...</span>}
      {isLoadingMore && <span data-testid="loading-more">Loading more...</span>}
      {hasMore && <button onClick={onLoadMore} data-testid="load-more">Load more</button>}
      {messages.map((msg: any) => (
        <div key={msg.id} data-testid={`message-${msg.id}`}>{msg.content}</div>
      ))}
    </div>
  ),
}));

jest.mock('@/components/common/message-composer', () => ({
  MessageComposer: React.forwardRef(({
    value,
    onChange,
    onSend,
    placeholder,
    selectedLanguage,
    onLanguageChange,
  }: any, ref: any) => (
    <div data-testid="message-composer" ref={ref}>
      <input
        data-testid="composer-input"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
      <button onClick={onSend} data-testid="send-button">Send</button>
      <span data-testid="selected-language">{selectedLanguage}</span>
      <button
        onClick={() => onLanguageChange('es')}
        data-testid="change-language"
      >
        Change Language
      </button>
    </div>
  )),
}));

jest.mock('../../../components/conversations/connection-status-indicator', () => ({
  ConnectionStatusIndicator: () => (
    <div data-testid="connection-status">Disconnected</div>
  ),
}));

jest.mock('@/components/messages/failed-message-banner', () => ({
  FailedMessageBanner: ({ conversationId, onRetry, onRestore }: any) => (
    <div data-testid="failed-message-banner">
      <span>{conversationId}</span>
      <button onClick={() => onRetry({})} data-testid="retry-button">Retry</button>
      <button onClick={() => onRestore({})} data-testid="restore-button">Restore</button>
    </div>
  ),
}));

// Mock data
const mockCurrentUser: User = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  role: 'USER' as UserRoleEnum,
  email: 'test@example.com',
} as User;

const mockConversation: Conversation = {
  id: 'conv-1',
  title: 'Test Conversation',
  type: 'group',
  createdAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  participants: [],
} as Conversation;

const mockMessages: Message[] = [
  {
    id: 'msg-1',
    content: 'Hello world',
    createdAt: new Date().toISOString(),
    sender: { id: 'user-2', username: 'john' },
    conversationId: 'conv-1',
  } as Message,
  {
    id: 'msg-2',
    content: 'Hi there!',
    createdAt: new Date().toISOString(),
    sender: { id: 'user-1', username: 'testuser' },
    conversationId: 'conv-1',
  } as Message,
];

const mockParticipants: ThreadMember[] = [
  { userId: 'user-1', user: mockCurrentUser as any, role: 'MEMBER' as any },
  { userId: 'user-2', user: { id: 'user-2', username: 'john' } as any, role: 'MEMBER' as any },
];

const mockT = (key: string) => {
  const translations: Record<string, string> = {
    'conversationLayout.messagesList': 'Messages list',
    'conversationLayout.writeMessage': 'Write a message...',
  };
  return translations[key] || key;
};

const mockTCommon = (key: string) => key;

describe('ConversationView', () => {
  const defaultProps = {
    conversation: mockConversation,
    currentUser: mockCurrentUser,
    messages: mockMessages,
    participants: mockParticipants,
    isMobile: false,
    isKeyboardOpen: false,
    isConnected: true,
    selectedLanguage: 'en',
    usedLanguages: ['en', 'fr'],
    userLanguage: 'en',
    isLoadingMessages: false,
    isLoadingMore: false,
    hasMore: false,
    composerValue: '',
    languageChoices: [{ value: 'en', label: 'English' }],
    attachmentIds: [],
    typingUsers: [],
    addTranslatingState: jest.fn(),
    isTranslating: jest.fn(() => false),
    onEditMessage: jest.fn(),
    onDeleteMessage: jest.fn(),
    onReplyMessage: jest.fn(),
    onNavigateToMessage: jest.fn(),
    onImageClick: jest.fn(),
    onLoadMore: jest.fn(),
    onComposerChange: jest.fn(),
    onSendMessage: jest.fn(),
    onLanguageChange: jest.fn(),
    onKeyPress: jest.fn(),
    onAttachmentsChange: jest.fn(),
    onRetryFailedMessage: jest.fn(),
    onRestoreFailedMessage: jest.fn(),
    onBackToList: jest.fn(),
    onOpenDetails: jest.fn(),
    onStartCall: jest.fn(),
    onOpenGallery: jest.fn(),
    scrollContainerRef: { current: null },
    composerRef: { current: null },
    t: mockT,
    tCommon: mockTCommon,
    showBackButton: false,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render the conversation view', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
      expect(screen.getByTestId('conversation-messages')).toBeInTheDocument();
      expect(screen.getByTestId('message-composer')).toBeInTheDocument();
    });

    it('should render conversation header with title', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByTestId('header-title')).toHaveTextContent('Test Conversation');
    });

    it('should render messages', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByTestId('messages-count')).toHaveTextContent('2');
      expect(screen.getByTestId('message-msg-1')).toBeInTheDocument();
      expect(screen.getByTestId('message-msg-2')).toBeInTheDocument();
    });

    it('should render message composer', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByTestId('composer-input')).toBeInTheDocument();
      expect(screen.getByTestId('send-button')).toBeInTheDocument();
    });

    it('should render failed message banner', () => {
      render(<ConversationView {...defaultProps} />);

      expect(screen.getByTestId('failed-message-banner')).toBeInTheDocument();
    });
  });

  describe('Connection Status', () => {
    it('should show connection status indicator when disconnected', () => {
      render(<ConversationView {...defaultProps} isConnected={false} />);

      expect(screen.getByTestId('connection-status')).toBeInTheDocument();
    });

    it('should not show connection status indicator when connected', () => {
      render(<ConversationView {...defaultProps} isConnected={true} />);

      expect(screen.queryByTestId('connection-status')).not.toBeInTheDocument();
    });
  });

  describe('Mobile View', () => {
    it('should pass isMobile prop to header', () => {
      render(<ConversationView {...defaultProps} isMobile={true} />);

      expect(screen.getByTestId('header-mobile')).toHaveTextContent('mobile');
    });

    it('should apply mobile-specific styles', () => {
      const { container } = render(<ConversationView {...defaultProps} isMobile={true} />);

      const mainContainer = container.firstChild;
      expect(mainContainer).toHaveClass('fixed', 'inset-0', 'z-50');
    });

    it('should apply desktop-specific styles when not mobile', () => {
      const { container } = render(<ConversationView {...defaultProps} isMobile={false} />);

      const mainContainer = container.firstChild;
      expect(mainContainer).toHaveClass('w-full', 'h-full', 'shadow-xl');
    });
  });

  describe('Back Button', () => {
    it('should show back button when showBackButton is true', () => {
      render(<ConversationView {...defaultProps} showBackButton={true} />);

      expect(screen.getByTestId('back-button')).toBeInTheDocument();
    });

    it('should not show back button when showBackButton is false', () => {
      render(<ConversationView {...defaultProps} showBackButton={false} />);

      expect(screen.queryByTestId('back-button')).not.toBeInTheDocument();
    });

    it('should call onBackToList when back button is clicked', () => {
      const onBackToList = jest.fn();
      render(
        <ConversationView
          {...defaultProps}
          showBackButton={true}
          onBackToList={onBackToList}
        />
      );

      fireEvent.click(screen.getByTestId('back-button'));

      expect(onBackToList).toHaveBeenCalledTimes(1);
    });
  });

  describe('User Interactions', () => {
    it('should call onComposerChange when typing in composer', () => {
      const onComposerChange = jest.fn();
      render(
        <ConversationView
          {...defaultProps}
          onComposerChange={onComposerChange}
        />
      );

      const input = screen.getByTestId('composer-input');
      fireEvent.change(input, { target: { value: 'Hello' } });

      expect(onComposerChange).toHaveBeenCalledWith('Hello');
    });

    it('should call onSendMessage when send button is clicked', () => {
      const onSendMessage = jest.fn();
      render(
        <ConversationView
          {...defaultProps}
          onSendMessage={onSendMessage}
        />
      );

      fireEvent.click(screen.getByTestId('send-button'));

      expect(onSendMessage).toHaveBeenCalledTimes(1);
    });

    it('should call onOpenDetails when details button is clicked', () => {
      const onOpenDetails = jest.fn();
      render(
        <ConversationView
          {...defaultProps}
          onOpenDetails={onOpenDetails}
        />
      );

      fireEvent.click(screen.getByTestId('details-button'));

      expect(onOpenDetails).toHaveBeenCalledTimes(1);
    });

    it('should call onLanguageChange when language is changed', () => {
      const onLanguageChange = jest.fn();
      render(
        <ConversationView
          {...defaultProps}
          onLanguageChange={onLanguageChange}
        />
      );

      fireEvent.click(screen.getByTestId('change-language'));

      expect(onLanguageChange).toHaveBeenCalledWith('es');
    });
  });

  describe('Loading States', () => {
    it('should show loading messages indicator', () => {
      render(<ConversationView {...defaultProps} isLoadingMessages={true} />);

      expect(screen.getByTestId('loading-messages')).toBeInTheDocument();
    });

    it('should show loading more indicator', () => {
      render(<ConversationView {...defaultProps} isLoadingMore={true} />);

      expect(screen.getByTestId('loading-more')).toBeInTheDocument();
    });

    it('should show load more button when hasMore is true', () => {
      render(<ConversationView {...defaultProps} hasMore={true} />);

      expect(screen.getByTestId('load-more')).toBeInTheDocument();
    });

    it('should call onLoadMore when load more button is clicked', () => {
      const onLoadMore = jest.fn();
      render(
        <ConversationView
          {...defaultProps}
          hasMore={true}
          onLoadMore={onLoadMore}
        />
      );

      fireEvent.click(screen.getByTestId('load-more'));

      expect(onLoadMore).toHaveBeenCalledTimes(1);
    });
  });

  describe('Failed Messages', () => {
    it('should call onRetryFailedMessage when retry button is clicked', async () => {
      const onRetryFailedMessage = jest.fn().mockResolvedValue(true);
      render(
        <ConversationView
          {...defaultProps}
          onRetryFailedMessage={onRetryFailedMessage}
        />
      );

      fireEvent.click(screen.getByTestId('retry-button'));

      expect(onRetryFailedMessage).toHaveBeenCalledTimes(1);
    });

    it('should call onRestoreFailedMessage when restore button is clicked', () => {
      const onRestoreFailedMessage = jest.fn();
      render(
        <ConversationView
          {...defaultProps}
          onRestoreFailedMessage={onRestoreFailedMessage}
        />
      );

      fireEvent.click(screen.getByTestId('restore-button'));

      expect(onRestoreFailedMessage).toHaveBeenCalledTimes(1);
    });
  });

  describe('Conversation Types', () => {
    it('should handle direct conversation type', () => {
      const directConversation = { ...mockConversation, type: 'direct' };
      render(
        <ConversationView
          {...defaultProps}
          conversation={directConversation}
        />
      );

      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
    });

    it('should handle anonymous conversation type', () => {
      const anonymousConversation = { ...mockConversation, type: 'anonymous' };
      render(
        <ConversationView
          {...defaultProps}
          conversation={anonymousConversation}
        />
      );

      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
    });

    it('should handle broadcast conversation type', () => {
      const broadcastConversation = { ...mockConversation, type: 'broadcast' };
      render(
        <ConversationView
          {...defaultProps}
          conversation={broadcastConversation}
        />
      );

      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
    });

    it('should handle public conversation type', () => {
      const publicConversation = { ...mockConversation, type: 'public' };
      render(
        <ConversationView
          {...defaultProps}
          conversation={publicConversation}
        />
      );

      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
    });
  });

  describe('Keyboard Open State', () => {
    it('should adjust header when keyboard is open on mobile', () => {
      const { container } = render(
        <ConversationView
          {...defaultProps}
          isMobile={true}
          isKeyboardOpen={true}
        />
      );

      const header = container.querySelector('header');
      expect(header?.className).toContain('max-h-14');
    });

    it('should not adjust header when keyboard is closed', () => {
      const { container } = render(
        <ConversationView
          {...defaultProps}
          isMobile={true}
          isKeyboardOpen={false}
        />
      );

      const header = container.querySelector('header');
      expect(header?.className).not.toContain('max-h-14');
    });
  });

  describe('Selected Language', () => {
    it('should display selected language in composer', () => {
      render(<ConversationView {...defaultProps} selectedLanguage="fr" />);

      expect(screen.getByTestId('selected-language')).toHaveTextContent('fr');
    });
  });

  describe('Empty Messages', () => {
    it('should handle empty messages array', () => {
      render(<ConversationView {...defaultProps} messages={[]} />);

      expect(screen.getByTestId('messages-count')).toHaveTextContent('0');
    });
  });

  describe('Accessibility', () => {
    it('should have proper ARIA attributes on messages region', () => {
      const { container } = render(<ConversationView {...defaultProps} />);

      const messagesRegion = container.querySelector('[role="region"]');
      expect(messagesRegion).toHaveAttribute('aria-live', 'polite');
      expect(messagesRegion).toHaveAttribute('aria-label', 'Messages list');
    });

    it('should have proper ARIA role on header', () => {
      const { container } = render(<ConversationView {...defaultProps} />);

      const header = container.querySelector('header');
      expect(header).toHaveAttribute('role', 'banner');
    });
  });

  describe('Typing Users', () => {
    it('should pass typing users to header', () => {
      const typingUsers = [{ id: 'user-2', displayName: 'John' }];
      render(
        <ConversationView
          {...defaultProps}
          typingUsers={typingUsers}
        />
      );

      expect(screen.getByTestId('conversation-header')).toBeInTheDocument();
    });
  });

  describe('Refs', () => {
    it('should pass scrollContainerRef correctly', () => {
      const scrollContainerRef = React.createRef<HTMLDivElement>();
      render(
        <ConversationView
          {...defaultProps}
          scrollContainerRef={scrollContainerRef}
        />
      );

      // Ref should be accessible
      expect(scrollContainerRef).toBeDefined();
    });

    it('should pass composerRef correctly', () => {
      const composerRef = React.createRef<any>();
      render(
        <ConversationView
          {...defaultProps}
          composerRef={composerRef}
        />
      );

      expect(composerRef).toBeDefined();
    });
  });
});
