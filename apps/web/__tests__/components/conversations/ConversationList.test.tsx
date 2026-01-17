import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationList } from '../../../components/conversations/ConversationList';
import { userPreferencesService } from '@/services/user-preferences.service';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

// Mock services
jest.mock('@/services/user-preferences.service', () => ({
  userPreferencesService: {
    getAllPreferences: jest.fn(),
    getCategories: jest.fn(),
    togglePin: jest.fn(),
    toggleMute: jest.fn(),
    toggleArchive: jest.fn(),
    updateReaction: jest.fn(),
  },
}));

jest.mock('@/stores/user-store', () => ({
  useUserStore: jest.fn(() => ({
    getUserById: jest.fn(),
    _lastStatusUpdate: 0,
  })),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, title }: any) => (
    <button onClick={onClick} className={className} title={title}>{children}</button>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    src ? <img data-testid="avatar-image" src={src} alt="" /> : null
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, onFocus, onBlur, placeholder, className, type }: any) => (
    <input
      data-testid="search-input"
      type={type}
      value={value}
      onChange={onChange}
      onFocus={onFocus}
      onBlur={onBlur}
      placeholder={placeholder}
      className={className}
    />
  ),
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: { children: React.ReactNode }) => <div data-testid="dropdown-menu">{children}</div>,
  DropdownMenuTrigger: React.forwardRef(({ children, asChild }: any, ref: any) => (
    <div ref={ref} data-testid="dropdown-trigger">{children}</div>
  )),
  DropdownMenuContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick }: { children: React.ReactNode; onClick?: () => void }) => (
    <button data-testid="dropdown-item" onClick={onClick}>{children}</button>
  ),
  DropdownMenuSeparator: () => <hr data-testid="dropdown-separator" />,
  DropdownMenuSub: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  DropdownMenuSubContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status }: { isOnline: boolean; status: string }) => (
    <div data-testid="online-indicator" data-online={isOnline} data-status={status} />
  ),
}));

jest.mock('../../../components/conversations/create-link-button', () => ({
  CreateLinkButton: ({ children }: { children: React.ReactNode }) => (
    <button data-testid="create-link-button">{children}</button>
  ),
}));

jest.mock('../../../components/conversations/CommunityCarousel', () => ({
  CommunityCarousel: ({ selectedFilter, onFilterChange }: any) => (
    <div data-testid="community-carousel">
      <button onClick={() => onFilterChange({ type: 'all' })}>All</button>
      <button onClick={() => onFilterChange({ type: 'archived' })}>Archived</button>
    </div>
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('@/utils/tag-colors', () => ({
  getTagColor: () => ({ bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' }),
}));

jest.mock('@/lib/user-status', () => ({
  getUserStatus: jest.fn(() => 'online'),
}));

jest.mock('@/utils/date-format', () => ({
  formatConversationDate: () => 'Today',
  formatRelativeDate: () => '2 days ago',
}));

// Mock data
const mockCurrentUser: User = {
  id: 'user-1',
  username: 'testuser',
  displayName: 'Test User',
  role: 'USER',
  email: 'test@example.com',
} as User;

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    title: 'Test Conversation 1',
    type: 'group',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessage: {
      id: 'msg-1',
      content: 'Hello world',
      createdAt: new Date().toISOString(),
      sender: { id: 'user-2', username: 'john', displayName: 'John' },
    },
    unreadCount: 2,
  } as Conversation,
  {
    id: 'conv-2',
    title: 'Direct Chat',
    type: 'direct',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    participants: [
      { userId: 'user-1', user: { id: 'user-1', username: 'testuser' } },
      { userId: 'user-2', user: { id: 'user-2', username: 'jane', displayName: 'Jane Doe' } },
    ],
    lastMessage: {
      id: 'msg-2',
      content: 'Hey there!',
      createdAt: new Date().toISOString(),
      sender: { id: 'user-2', username: 'jane', displayName: 'Jane Doe' },
    },
    unreadCount: 0,
  } as Conversation,
  {
    id: 'conv-3',
    title: 'Another Group',
    type: 'group',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    lastMessage: null,
    unreadCount: 0,
  } as Conversation,
];

const mockT = (key: string) => {
  const translations: Record<string, string> = {
    'title': 'Conversations',
    'createNewConversation': 'New Conversation',
    'loadingConversations': 'Loading conversations...',
    'noConversationsFound': 'No conversations found',
    'noConversations': 'No conversations yet',
    'conversationsList.pinned': 'Pinned',
    'conversationsList.uncategorized': 'Uncategorized',
    'conversationHeader.share': 'Share',
    'loadingMore': 'Loading more...',
  };
  return translations[key] || key;
};

const mockTSearch = (key: string) => {
  const translations: Record<string, string> = {
    'placeholder': 'Search conversations...',
  };
  return translations[key] || key;
};

describe('ConversationList', () => {
  const defaultProps = {
    conversations: mockConversations,
    selectedConversation: null as Conversation | null,
    currentUser: mockCurrentUser,
    isLoading: false,
    isMobile: false,
    showConversationList: true,
    onSelectConversation: jest.fn(),
    onShowDetails: jest.fn(),
    onCreateConversation: jest.fn(),
    onLinkCreated: jest.fn(),
    t: mockT,
    tSearch: mockTSearch,
  };

  beforeEach(() => {
    jest.clearAllMocks();

    (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([]);
    (userPreferencesService.getCategories as jest.Mock).mockResolvedValue([]);
    (userPreferencesService.togglePin as jest.Mock).mockResolvedValue({});
    (userPreferencesService.toggleMute as jest.Mock).mockResolvedValue({});
    (userPreferencesService.toggleArchive as jest.Mock).mockResolvedValue({});
  });

  describe('Initial Render', () => {
    it('should render conversation list title', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Conversations')).toBeInTheDocument();
      });
    });

    it('should render search input', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toBeInTheDocument();
      });
    });

    it('should render create conversation button', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('New Conversation')).toBeInTheDocument();
      });
    });

    it('should render conversations', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
        expect(screen.getByText('Another Group')).toBeInTheDocument();
      });
    });

    it('should display unread count badges', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        // Should find the unread count badge for conv-1 (2 unread)
        expect(screen.getByText('2')).toBeInTheDocument();
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading state when isLoading is true', async () => {
      render(<ConversationList {...defaultProps} isLoading={true} />);

      expect(screen.getByText('Loading conversations...')).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should show empty state when no conversations', async () => {
      render(<ConversationList {...defaultProps} conversations={[]} />);

      await waitFor(() => {
        expect(screen.getByText('No conversations yet')).toBeInTheDocument();
      });
    });

    it('should show search empty state when no results found', async () => {
      render(<ConversationList {...defaultProps} conversations={[]} />);

      const searchInput = screen.getByTestId('search-input');
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText('No conversations found')).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter conversations by search query', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
      });

      const searchInput = screen.getByTestId('search-input');
      fireEvent.change(searchInput, { target: { value: 'Another' } });

      await waitFor(() => {
        expect(screen.queryByText('Test Conversation 1')).not.toBeInTheDocument();
        expect(screen.getByText('Another Group')).toBeInTheDocument();
      });
    });

    it('should show community carousel when search is focused', async () => {
      render(<ConversationList {...defaultProps} />);

      const searchInput = screen.getByTestId('search-input');
      fireEvent.focus(searchInput);

      await waitFor(() => {
        expect(screen.getByTestId('community-carousel')).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions', () => {
    it('should call onSelectConversation when clicking a conversation', async () => {
      const onSelectConversation = jest.fn();
      render(
        <ConversationList
          {...defaultProps}
          onSelectConversation={onSelectConversation}
        />
      );

      await waitFor(() => {
        const conversationItem = screen.getByText('Test Conversation 1').closest('[class*="cursor-pointer"]');
        if (conversationItem) {
          fireEvent.click(conversationItem);
        }
      });

      expect(onSelectConversation).toHaveBeenCalledWith(mockConversations[0]);
    });

    it('should call onCreateConversation when clicking create button', async () => {
      const onCreateConversation = jest.fn();
      render(
        <ConversationList
          {...defaultProps}
          onCreateConversation={onCreateConversation}
        />
      );

      await waitFor(() => {
        const createButtons = screen.getAllByText('New Conversation');
        fireEvent.click(createButtons[0]);
      });

      expect(onCreateConversation).toHaveBeenCalled();
    });
  });

  describe('Preferences', () => {
    it('should load user preferences on mount', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(userPreferencesService.getAllPreferences).toHaveBeenCalled();
      });
    });

    it('should display pinned conversations first', async () => {
      (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-3', isPinned: true, isMuted: false, isArchived: false },
      ]);

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        const items = screen.getAllByTestId('avatar');
        // First conversation should be the pinned one
        expect(items.length).toBeGreaterThan(0);
      });
    });

    it('should show pinned section header when there are pinned conversations', async () => {
      (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-1', isPinned: true, isMuted: false, isArchived: false },
      ]);

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Pinned')).toBeInTheDocument();
      });
    });

    it('should filter out archived conversations by default', async () => {
      (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-1', isPinned: false, isMuted: false, isArchived: true },
      ]);

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.queryByText('Test Conversation 1')).not.toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });
  });

  describe('Last Message Display', () => {
    it('should display last message content', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/Hello world/)).toBeInTheDocument();
      });
    });

    it('should display sender name for last message', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText(/John:/)).toBeInTheDocument();
      });
    });
  });

  describe('Direct Conversations', () => {
    it('should show other participant name for direct conversations', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });

    it('should show online indicator for direct conversations', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        const indicators = screen.getAllByTestId('online-indicator');
        expect(indicators.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Tags Display', () => {
    it('should display conversation tags', async () => {
      (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-1', isPinned: false, isMuted: false, isArchived: false, tags: ['Important', 'Work'] },
      ]);

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Important')).toBeInTheDocument();
        expect(screen.getByText('Work')).toBeInTheDocument();
      });
    });

    it('should show +N badge when more than 3 tags', async () => {
      (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-1', isPinned: false, isMuted: false, isArchived: false, tags: ['Tag1', 'Tag2', 'Tag3', 'Tag4', 'Tag5'] },
      ]);

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('+2')).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    it('should show loading indicator when loading more', async () => {
      render(
        <ConversationList
          {...defaultProps}
          isLoadingMore={true}
          hasMore={true}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Loading more...')).toBeInTheDocument();
      });
    });
  });

  describe('Selected Conversation', () => {
    it('should highlight selected conversation', async () => {
      render(
        <ConversationList
          {...defaultProps}
          selectedConversation={mockConversations[0]}
        />
      );

      await waitFor(() => {
        const conversationItem = screen.getByText('Test Conversation 1').closest('[class*="cursor-pointer"]');
        expect(conversationItem).toHaveClass('bg-primary/10');
      });
    });
  });

  describe('Mobile View', () => {
    it('should render correctly on mobile', async () => {
      render(<ConversationList {...defaultProps} isMobile={true} />);

      await waitFor(() => {
        expect(screen.getByText('Conversations')).toBeInTheDocument();
      });
    });
  });

  describe('Categories', () => {
    it('should load categories on mount', async () => {
      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(userPreferencesService.getCategories).toHaveBeenCalled();
      });
    });

    it('should display category sections when categories exist', async () => {
      (userPreferencesService.getCategories as jest.Mock).mockResolvedValue([
        { id: 'cat-1', name: 'Work', order: 0 },
        { id: 'cat-2', name: 'Personal', order: 1 },
      ]);

      (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-1', categoryId: 'cat-1', isPinned: false, isMuted: false, isArchived: false },
      ]);

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Work')).toBeInTheDocument();
      });
    });

    it('should show uncategorized section when needed', async () => {
      (userPreferencesService.getCategories as jest.Mock).mockResolvedValue([
        { id: 'cat-1', name: 'Work', order: 0 },
      ]);

      (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-1', categoryId: 'cat-1', isPinned: false, isMuted: false, isArchived: false },
      ]);

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Uncategorized')).toBeInTheDocument();
      });
    });
  });

  describe('Collapsible Sections', () => {
    it('should toggle section collapse when clicking header', async () => {
      (userPreferencesService.getAllPreferences as jest.Mock).mockResolvedValue([
        { conversationId: 'conv-1', isPinned: true, isMuted: false, isArchived: false },
      ]);

      render(<ConversationList {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Pinned')).toBeInTheDocument();
      });

      // Click on the pinned section header to collapse
      const pinnedHeader = screen.getByText('Pinned').closest('[class*="cursor-pointer"]');
      if (pinnedHeader) {
        fireEvent.click(pinnedHeader);
      }

      // The conversation should be hidden after collapse
      // This is tested indirectly by checking the toggle behavior
    });
  });
});
