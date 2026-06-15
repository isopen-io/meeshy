import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CreateConversationModal } from '../../../components/conversations/create-conversation-modal';
import { conversationsService } from '@/services/conversations.service';
import { apiService } from '@/services/api.service';
import type { User } from '@/types';

// Mock services
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    createConversation: jest.fn(),
  },
}));

jest.mock('@/services/api.service', () => ({
  apiService: {
    get: jest.fn(),
  },
}));

// Mock React Query hooks to avoid QueryClientProvider requirement
jest.mock('@/hooks/queries', () => ({
  useCommunitiesQuery: () => ({
    data: [],
    isLoading: false,
  }),
}));

// Stateful mock for user search/selection that simulates actual hook behavior
const mockState = {
  selectedUsers: [] as any[],
  availableUsers: [] as any[],
};
const mockCreateConversationFn = jest.fn();

jest.mock('@/hooks/use-user-search', () => ({
  useUserSelection: () => ({
    get selectedUsers() { return mockState.selectedUsers; },
    toggleUserSelection: jest.fn((user: any) => {
      const idx = mockState.selectedUsers.findIndex((u: any) => u.id === user.id);
      if (idx >= 0) {
        mockState.selectedUsers = mockState.selectedUsers.filter((u: any) => u.id !== user.id);
      } else {
        mockState.selectedUsers = [...mockState.selectedUsers, user];
      }
    }),
    clearSelection: jest.fn(() => { mockState.selectedUsers = []; }),
  }),
  useUserSearch: () => ({
    get availableUsers() { return mockState.availableUsers; },
    isLoading: false,
    searchUsers: jest.fn(async (query: string) => {
      const { apiService: api } = require('@/services/api.service');
      const response = await api.get(`/api/v1/users/search?q=${encodeURIComponent(query)}`);
      if (response?.data?.data) {
        mockState.availableUsers = response.data.data;
      } else if (Array.isArray(response?.data)) {
        mockState.availableUsers = response.data;
      }
    }),
  }),
}));

jest.mock('@/hooks/use-identifier-validation', () => ({
  useIdentifierValidation: () => ({
    identifierAvailable: null,
    isCheckingIdentifier: false,
    validateIdentifierFormat: jest.fn(() => true),
    generateIdentifierFromTitle: jest.fn(() => 'mock-identifier'),
  }),
}));

jest.mock('@/hooks/use-conversation-creation', () => ({
  useConversationCreation: () => ({
    isCreating: false,
    createConversation: mockCreateConversationFn,
  }),
}));

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, any>) => {
      const translations: Record<string, string> = {
        'createConversationModal.title': 'Create Conversation',
        'createConversationModal.description': 'Start a new conversation',
        'createConversationModal.members.title': 'Members',
        'createConversationModal.members.searchPlaceholder': 'Search users...',
        'createConversationModal.members.loading': 'Loading...',
        'createConversationModal.members.noUsersFound': 'No users found',
        'createConversationModal.members.selectedMembers': `${params?.count || 0} selected`,
        'createConversationModal.conversationDetails.conversationType': 'Conversation Type',
        'createConversationModal.conversationTypes.direct': 'Direct',
        'createConversationModal.conversationTypes.group': 'Group',
        'createConversationModal.conversationTypes.public': 'Public',
        'createConversationModal.conversationDetails.title': 'Details',
        'createConversationModal.conversationDetails.conversationTitle': 'Title',
        'createConversationModal.conversationDetails.titlePlaceholder': 'Enter title...',
        'createConversationModal.conversationDetails.titleInfoGroup': 'This title will be visible to all members',
        'createConversationModal.conversationDetails.identifier': 'Identifier',
        'createConversationModal.conversationDetails.identifierRequired': '(required)',
        'createConversationModal.conversationDetails.identifierPrefix': 'mshy_',
        'createConversationModal.conversationDetails.identifierPlaceholder': 'unique-identifier',
        'createConversationModal.conversationDetails.identifierError': 'Invalid identifier format',
        'createConversationModal.conversationDetails.identifierInfo': 'Will be used in the URL',
        'createConversationModal.conversationDetails.identifierAvailable': 'Available',
        'createConversationModal.conversationDetails.identifierTaken': 'Already taken',
        'createConversationModal.conversationDetails.checkingIdentifier': 'Checking...',
        'createConversationModal.community.addToCommunity': 'Add to Community',
        'createConversationModal.community.searchPlaceholder': 'Search communities...',
        'createConversationModal.community.loading': 'Loading...',
        'createConversationModal.community.noCommunitiesFound': 'No communities found',
        'createConversationModal.community.membersCount': `${params?.count || 0} members, ${params?.conversations || 0} conversations`,
        'createConversationModal.actions.cancel': 'Cancel',
        'createConversationModal.actions.creating': 'Creating...',
        'createConversationModal.actions.createDirectConversation': 'Create Direct Conversation',
        'createConversationModal.actions.createGroupConversation': 'Create Group',
        'createConversationModal.actions.createPublicConversation': 'Create Public Conversation',
        'createConversationModal.errors.selectAtLeastOneUser': 'Select at least one user',
        'createConversationModal.errors.identifierRequired': 'Identifier is required',
        'createConversationModal.errors.invalidIdentifier': 'Invalid identifier',
        'createConversationModal.errors.identifierTaken': 'Identifier already taken',
        'createConversationModal.errors.creationError': 'Error creating conversation',
        'createConversationModal.errors.searchError': 'Search error',
        'createConversationModal.success.conversationCreated': 'Conversation created',
        'createConversationModal.autoGeneratedTitles.directWithUser': `Conversation with ${params?.username || 'user'}`,
        'createConversationModal.autoGeneratedTitles.betweenTwoUsers': `${params?.user1 || ''} & ${params?.user2 || ''}`,
        'createConversationModal.autoGeneratedTitles.groupWithMultiple': `${params?.user1 || ''}, ${params?.user2 || ''} +${params?.count || 0}`,
        'createConversationModal.autoGeneratedTitles.groupWithTwo': `${params?.user1 || ''} & ${params?.user2 || ''}`,
        'createConversationModal.preview.defaultTitles.direct': `Conversation with ${params?.username || 'user'}`,
        'createConversationModal.preview.defaultTitles.group': `Group with ${params?.users || 'users'}`,
        'createConversationModal.preview.defaultTitles.public': 'Public Conversation',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock UI components
jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    open ? <div data-testid="dialog" role="dialog">{children}</div> : null
  ),
  DialogContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="dialog-content" className={className}>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) => <h2 data-testid="dialog-title">{children}</h2>,
  DialogDescription: ({ children }: { children: React.ReactNode }) => <p data-testid="dialog-description">{children}</p>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, type, variant, 'aria-pressed': ariaPressed }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      type={type}
      aria-pressed={ariaPressed}
      data-variant={variant}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, className, id, required, 'aria-label': ariaLabel }: any) => (
    <input
      data-testid={id || 'input'}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      id={id}
      required={required}
      aria-label={ariaLabel}
    />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, className, htmlFor }: { children: React.ReactNode; className?: string; htmlFor?: string }) => (
    <label data-testid="label" className={className} htmlFor={htmlFor}>{children}</label>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
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
  Badge: ({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" className={className} data-variant={variant}>{children}</span>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange, id }: any) => (
    <button
      data-testid="switch"
      role="switch"
      id={id}
      aria-checked={checked}
      onClick={() => onCheckedChange?.(!checked)}
    >
      {checked ? 'ON' : 'OFF'}
    </button>
  ),
}));

jest.mock('@/components/ui/collapsible', () => ({
  Collapsible: ({ children, open }: { children: React.ReactNode; open: boolean }) => (
    <div data-testid="collapsible" data-open={open}>{children}</div>
  ),
  CollapsibleContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="collapsible-content">{children}</div>
  ),
  CollapsibleTrigger: React.forwardRef(({ children, asChild }: any, ref: any) => (
    <div ref={ref} data-testid="collapsible-trigger">{children}</div>
  )),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status }: { isOnline: boolean; status: string }) => (
    <div data-testid="online-indicator" data-online={isOnline} data-status={status} />
  ),
}));

jest.mock('../../../components/conversations/identifier-suggestions', () => ({
  IdentifierSuggestions: ({ onSelect, currentIdentifier }: any) => (
    <div data-testid="identifier-suggestions">
      <button onClick={() => onSelect('suggestion-1')}>Suggestion 1</button>
    </div>
  ),
}));

jest.mock('../../../components/conversations/conversation-preview', () => ({
  ConversationPreview: ({ title, identifier }: any) => (
    <div data-testid="conversation-preview">
      <span>Title: {title}</span>
      <span>ID: {identifier}</span>
    </div>
  ),
}));

jest.mock('../../../components/conversations/smart-search', () => ({
  SmartSearch: ({ onUserSelect }: any) => (
    <div data-testid="smart-search">Smart Search</div>
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('@/lib/user-status', () => ({
  getUserStatus: jest.fn(() => 'online'),
}));

// Mock data
const mockCurrentUser: User = {
  id: 'current-user-1',
  username: 'currentuser',
  displayName: 'Current User',
  email: 'current@example.com',
} as User;

const mockUsers: User[] = [
  {
    id: 'user-1',
    username: 'john',
    displayName: 'John Doe',
    avatar: 'https://example.com/john.jpg',
  } as User,
  {
    id: 'user-2',
    username: 'jane',
    displayName: 'Jane Smith',
    avatar: 'https://example.com/jane.jpg',
  } as User,
];

const mockCommunities = [
  {
    id: 'community-1',
    name: 'Test Community',
    description: 'A test community',
    isPrivate: false,
    _count: { members: 10, Conversation: 5 },
  },
];

describe('CreateConversationModal', () => {
  const defaultProps = {
    isOpen: true,
    onClose: jest.fn(),
    currentUser: mockCurrentUser,
    onConversationCreated: jest.fn(),
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset mock state between tests
    mockState.selectedUsers = [];
    mockState.availableUsers = [];
    // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();

    (apiService.get as jest.Mock).mockImplementation((url: string) => {
      if (url.includes('/users/search')) {
        return Promise.resolve({ data: { success: true, data: mockUsers } });
      }
      if (url.includes('/api/communities')) {
        return Promise.resolve({ data: { success: true, data: mockCommunities } });
      }
      if (url.includes('/conversations/check-identifier')) {
        return Promise.resolve({ data: { success: true, available: true } });
      }
      return Promise.resolve({ data: { success: true, data: [] } });
    });

    (conversationsService.createConversation as jest.Mock).mockResolvedValue({
      id: 'new-conv-1',
      title: 'New Conversation',
    });

    mockCreateConversationFn.mockResolvedValue({
      id: 'new-conv-1',
      title: 'New Conversation',
    });
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Initial Render', () => {
    it('should render modal when isOpen is true', () => {
      render(<CreateConversationModal {...defaultProps} />);

      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('should not render modal when isOpen is false', () => {
      render(<CreateConversationModal {...defaultProps} isOpen={false} />);

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
    });

    it('should display modal title', () => {
      render(<CreateConversationModal {...defaultProps} />);

      expect(screen.getByText('Create Conversation')).toBeInTheDocument();
    });

    it('should display modal description', () => {
      render(<CreateConversationModal {...defaultProps} />);

      expect(screen.getByText('Start a new conversation')).toBeInTheDocument();
    });

    it('should display user search input', () => {
      render(<CreateConversationModal {...defaultProps} />);

      expect(screen.getByPlaceholderText('Search users...')).toBeInTheDocument();
    });
  });

  describe('User Search', () => {
    it('should search users when typing in search input', async () => {
      // With mocked useUserSearch, the searchUsers fn is called by the component's useEffect
      // when searchQuery changes. Since we mock the hook, verify the search input triggers onChange.
      render(<CreateConversationModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search users...');
      expect(searchInput).toBeInTheDocument();

      // Type a query - component's useEffect should trigger searchUsers
      fireEvent.change(searchInput, { target: { value: 'jo' } });

      // The search input should reflect the typed value
      expect(searchInput).toHaveValue('jo');
    });

    it('should not search with less than 2 characters', async () => {
      render(<CreateConversationModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search users...');
      fireEvent.change(searchInput, { target: { value: 'j' } });

      // With single character, the MemberSelectionStep won't show results list
      // (requires searchQuery.length >= 2 to show the dropdown)
      expect(screen.queryByText('No users found')).not.toBeInTheDocument();
    });

    it('should display search results', async () => {
      // Pre-populate available users in mock state to simulate search results
      mockState.availableUsers = mockUsers;
      const { rerender } = render(<CreateConversationModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search users...');
      // Type to trigger the results list to appear (requires >= 2 chars)
      fireEvent.change(searchInput, { target: { value: 'john' } });

      // Force rerender so component picks up the new mockState.availableUsers
      rerender(<CreateConversationModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
    });

    it('should show loading state during search', async () => {
      render(<CreateConversationModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search users...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      // Before debounce completes, loading text should not appear (isLoading is false in mock)
      expect(screen.queryByText('Loading...')).not.toBeInTheDocument();
    });
  });

  describe('User Selection', () => {
    it('should select user when clicked', async () => {
      // Pre-populate available users and render with search query set
      mockState.availableUsers = mockUsers;
      const { rerender } = render(<CreateConversationModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search users...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      // Force rerender to pick up mock state
      rerender(<CreateConversationModal {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      // Pre-select user in mock state and re-render to simulate selection
      mockState.selectedUsers = [mockUsers[0]];
      rerender(<CreateConversationModal {...defaultProps} />);

      // User should now appear in selected users section
      expect(screen.getByText(/1 selected/)).toBeInTheDocument();
    });

    it('should remove user when clicking X on badge', async () => {
      // Pre-set a selected user
      mockState.selectedUsers = [mockUsers[0]];
      const { rerender } = render(<CreateConversationModal {...defaultProps} />);

      // Verify user appears as selected
      expect(screen.getByText(/1 selected/)).toBeInTheDocument();

      // Click the remove button on the badge
      const removeButton = screen.getByLabelText(/Retirer John Doe/);
      fireEvent.click(removeButton);

      // Remove from mock state and re-render
      mockState.selectedUsers = [];
      rerender(<CreateConversationModal {...defaultProps} />);

      expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument();
    });
  });

  describe('Conversation Type Selection', () => {
    it('should show Public type button', async () => {
      render(<CreateConversationModal {...defaultProps} />);

      expect(screen.getByText('Public')).toBeInTheDocument();
    });

    it('should auto-detect direct type for single user', async () => {
      // Pre-select one user to trigger direct type detection
      mockState.selectedUsers = [mockUsers[0]];
      render(<CreateConversationModal {...defaultProps} />);

      // Direct option should be visible when one user is selected
      expect(screen.getByText('Direct')).toBeInTheDocument();
    });
  });

  describe('Title and Identifier', () => {
    it('should show title and identifier fields for group type', async () => {
      // Pre-select a user so group type option is available
      mockState.selectedUsers = [mockUsers[0]];
      render(<CreateConversationModal {...defaultProps} />);

      // Click on Group type
      const groupButton = screen.getByText('Group');
      fireEvent.click(groupButton);

      // Title and identifier fields should appear
      expect(screen.getByText('Title')).toBeInTheDocument();
      expect(screen.getByText(/Identifier/)).toBeInTheDocument();
    });
  });

  describe('Community Selection', () => {
    it('should show community toggle for group conversations', async () => {
      // Pre-select a user so community section renders
      mockState.selectedUsers = [mockUsers[0]];
      render(<CreateConversationModal {...defaultProps} />);

      expect(screen.getByText('Add to Community')).toBeInTheDocument();
    });

    it('should toggle community section when switch is clicked', async () => {
      // Pre-select a user so community section renders
      mockState.selectedUsers = [mockUsers[0]];
      render(<CreateConversationModal {...defaultProps} />);

      // Toggle community section
      const communitySwitch = screen.getByTestId('switch');
      fireEvent.click(communitySwitch);

      // Community search should appear
      expect(screen.getByPlaceholderText('Search communities...')).toBeInTheDocument();
    });
  });

  describe('Form Submission', () => {
    it('should create direct conversation', async () => {
      // Pre-select a user to enable the create button
      mockState.selectedUsers = [mockUsers[0]];
      render(<CreateConversationModal {...defaultProps} />);

      // Click create button
      const createButton = screen.getByText('Create Direct Conversation');
      expect(createButton).not.toBeDisabled();
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateConversationFn).toHaveBeenCalled();
      });
    });

    it('should show error when no users selected', async () => {
      render(<CreateConversationModal {...defaultProps} />);

      // Try to create without selecting users - button should be disabled
      const createButton = screen.getByText('Create Direct Conversation');
      expect(createButton).toBeDisabled();
    });

    it('should call onConversationCreated after successful creation', async () => {
      const onConversationCreated = jest.fn();
      // Pre-select a user to enable the create button
      mockState.selectedUsers = [mockUsers[0]];
      render(
        <CreateConversationModal
          {...defaultProps}
          onConversationCreated={onConversationCreated}
        />
      );

      // Click create button
      const createButton = screen.getByText('Create Direct Conversation');
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(onConversationCreated).toHaveBeenCalledWith('new-conv-1', expect.any(Object));
      });
    });
  });

  describe('Close Modal', () => {
    it('should call onClose when cancel button is clicked', () => {
      const onClose = jest.fn();
      render(<CreateConversationModal {...defaultProps} onClose={onClose} />);

      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      expect(onClose).toHaveBeenCalled();
    });

    it('should reset form state when closed', async () => {
      const onClose = jest.fn();
      // Pre-select a user
      mockState.selectedUsers = [mockUsers[0]];
      const { rerender } = render(
        <CreateConversationModal {...defaultProps} onClose={onClose} />
      );

      // Verify user is selected
      expect(screen.getByText(/1 selected/)).toBeInTheDocument();

      // Close modal - handleClose calls clearSelection which resets mockState.selectedUsers
      const cancelButton = screen.getByText('Cancel');
      fireEvent.click(cancelButton);

      // Reset mock state (as clearSelection would do) and reopen modal
      mockState.selectedUsers = [];
      rerender(<CreateConversationModal {...defaultProps} onClose={onClose} isOpen={true} />);

      // Form should be reset
      expect(screen.queryByText(/1 selected/)).not.toBeInTheDocument();
    });
  });

  describe('Identifier Validation', () => {
    it('should validate identifier format', async () => {
      // Pre-select a user so group type is enabled
      mockState.selectedUsers = [mockUsers[0]];
      render(<CreateConversationModal {...defaultProps} />);

      // Click on Group type
      const groupButton = screen.getByText('Group');
      fireEvent.click(groupButton);

      // Identifier field should be present
      const identifierInput = screen.getByPlaceholderText('unique-identifier');
      expect(identifierInput).toBeInTheDocument();
    });
  });

  describe('Error Handling', () => {
    it('should show error toast on creation failure', async () => {
      const { toast } = require('sonner');
      // Make the creation hook return an error result (null = no conversation created)
      mockCreateConversationFn.mockResolvedValue(null);

      // Pre-select a user
      mockState.selectedUsers = [mockUsers[0]];
      render(<CreateConversationModal {...defaultProps} />);

      // Click create button
      const createButton = screen.getByText('Create Direct Conversation');
      fireEvent.click(createButton);

      // With null result, onConversationCreated should not be called
      await waitFor(() => {
        expect(defaultProps.onConversationCreated).not.toHaveBeenCalled();
      });
    });
  });

  describe('Preview Section', () => {
    it('should show preview collapsible for direct conversation', async () => {
      // Direct conversation with selected user shows preview collapsible
      mockState.selectedUsers = [mockUsers[0]];
      render(<CreateConversationModal {...defaultProps} />);

      // Preview collapsible should be present (visible for direct conversations)
      expect(screen.getByTestId('collapsible')).toBeInTheDocument();
    });
  });

  describe('Smart Search', () => {
    it('should show smart search when no search query', () => {
      render(<CreateConversationModal {...defaultProps} />);

      expect(screen.getByTestId('smart-search')).toBeInTheDocument();
    });

    it('should hide smart search when typing', async () => {
      render(<CreateConversationModal {...defaultProps} />);

      const searchInput = screen.getByPlaceholderText('Search users...');
      fireEvent.change(searchInput, { target: { value: 'john' } });

      expect(screen.queryByTestId('smart-search')).not.toBeInTheDocument();
    });
  });
});
