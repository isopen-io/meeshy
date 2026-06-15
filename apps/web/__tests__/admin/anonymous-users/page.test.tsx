import React from 'react';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { adminService, AnonymousUser } from '../../../services/admin.service';
import { toast } from 'sonner';

// Mock the next/navigation module
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
}));

// Mock the admin service
jest.mock('../../../services/admin.service', () => ({
  adminService: {
    getAnonymousUsers: jest.fn(),
  },
}));

// Mock useI18n to return English strings synchronously
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, any>) => {
      const translations: Record<string, string> = {
        'anonUsers.loading': 'Loading anonymous users...',
        'anonUsers.loadError': 'Error loading anonymous users',
        'anonUsers.backButton': 'Back',
        'anonUsers.pageTitle': 'Anonymous users',
        'anonUsers.pageSubtitle': 'Management of anonymous participants',
        'anonUsers.statTotal': 'Total',
        'anonUsers.statTotalDesc': 'Anonymous users',
        'anonUsers.statActive': 'Active',
        'anonUsers.statActiveDesc': 'Currently online',
        'anonUsers.statMessages': 'Messages',
        'anonUsers.statMessagesDesc': 'Messages sent',
        'anonUsers.filtersTitle': 'Filters and search',
        'anonUsers.searchPlaceholder': 'Search by name, email...',
        'anonUsers.filterAll': 'All',
        'anonUsers.filterActive': 'Active',
        'anonUsers.filterInactive': 'Inactive',
        'anonUsers.perPage': '{count} per page',
        'anonUsers.searchButton': 'Search',
        'anonUsers.listTitle': 'Anonymous users list',
        'anonUsers.emptyTitle': 'No anonymous user found',
        'anonUsers.messageCount': '{count} messages',
        'anonUsers.joinedAt': 'Joined {date}',
        'anonUsers.actionDetails': 'Details',
        'anonUsers.conversationLabel': 'Conversation:',
        'anonUsers.noTitle': 'No title',
        'anonUsers.linkLabel': 'Link:',
        'anonUsers.permissionsLabel': 'Permissions:',
        'anonUsers.paginationInfo': 'Page {page} of {total} ({count} users)',
        'anonUsers.prevPage': 'Previous',
        'anonUsers.nextPage': 'Next',
        'anonUsers.statusActive': 'Active',
        'anonUsers.statusInactive': 'Inactive',
        'anonUsers.statusDisabled': 'Disabled',
        'anonUsers.detailTitle': 'Anonymous user details',
        'anonUsers.infoGeneral': 'General information',
        'anonUsers.labelFullName': 'Full name',
        'anonUsers.labelUsername': 'Username',
        'anonUsers.labelEmail': 'Email',
        'anonUsers.labelStatus': 'Status',
        'anonUsers.labelCountry': 'Country',
        'anonUsers.labelLanguage': 'Language',
        'anonUsers.labelJoinDate': 'Registration date',
        'anonUsers.labelLastActivity': 'Last activity',
        'anonUsers.notProvided': 'Not provided',
        'anonUsers.never': 'Never',
        'anonUsers.permissionsTitle': 'Permissions and rights',
        'anonUsers.permSendMessages': 'Sending messages',
        'anonUsers.permSendFiles': 'Sending files',
        'anonUsers.permSendImages': 'Sending images',
        'anonUsers.permOnline': 'Online',
        'anonUsers.permAllowed': 'Allowed',
        'anonUsers.permDenied': 'Denied',
        'anonUsers.permYes': 'Yes',
        'anonUsers.permNo': 'No',
        'anonUsers.statsTitle': 'Message statistics',
        'anonUsers.statsMsgSent': 'Messages sent',
        'anonUsers.statsReactions': 'Reactions',
        'anonUsers.statsMsgPerDay': 'Messages/day',
        'anonUsers.shareLinkTitle': 'Share link and conversation',
        'anonUsers.usedLink': 'Link used',
        'anonUsers.noName': 'No name',
        'anonUsers.joinedConversation': 'Joined conversation',
        'anonUsers.viewConversation': 'View conversation',
        'anonUsers.adminActions': 'Administrator actions',
        'anonUsers.viewMessages': 'View messages',
        'anonUsers.accessConversation': 'Access conversation',
        'anonUsers.comingSoon': 'Feature coming soon',
      };
      const template = translations[key] ?? key;
      if (params) {
        return template.replace(/\{(\w+)\}/g, (_: string, k: string) => String(params[k] ?? `{${k}}`));
      }
      return template;
    },
    locale: 'en',
    currentLanguage: 'en',
    setLocale: jest.fn(),
    isLoading: false,
  }),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock AdminLayout component
jest.mock('@/components/admin/AdminLayout', () => {
  return function MockAdminLayout({ children }: { children: React.ReactNode }) {
    return <div data-testid="admin-layout">{children}</div>;
  };
});

// Mock UI components
jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div data-testid="card" className={className}>{children}</div>,
  CardContent: ({ children, className }: any) => <div data-testid="card-content" className={className}>{children}</div>,
  CardHeader: ({ children, className }: any) => <div data-testid="card-header" className={className}>{children}</div>,
  CardTitle: ({ children, className }: any) => <div data-testid="card-title" className={className}>{children}</div>,
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, className, variant }: any) => (
    <button data-testid="button" onClick={onClick} disabled={disabled} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/input', () => ({
  Input: (props: any) => <input data-testid="input" {...props} />,
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open }: { children: React.ReactNode; open: boolean }) =>
    open ? <div data-testid="dialog">{children}</div> : null,
  DialogContent: ({ children }: { children: React.ReactNode }) =>
    <div data-testid="dialog-content">{children}</div>,
  DialogHeader: ({ children }: { children: React.ReactNode }) =>
    <div data-testid="dialog-header">{children}</div>,
  DialogTitle: ({ children }: { children: React.ReactNode }) =>
    <h2 data-testid="dialog-title">{children}</h2>,
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children }: { children: React.ReactNode }) =>
    <div data-testid="scroll-area">{children}</div>,
}));

jest.mock('@/components/ui/select', () => ({
  Select: ({ children, value, onValueChange }: any) => (
    <div data-testid="select" data-value={value}>
      {typeof children === 'function' ? children({ value, onValueChange }) : children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => (
    <button data-testid="select-trigger">{children}</button>
  ),
  SelectValue: ({ placeholder }: any) => (
    <span data-testid="select-value">{placeholder}</span>
  ),
  SelectContent: ({ children }: any) => (
    <div data-testid="select-content">{children}</div>
  ),
  SelectItem: ({ children, value }: any) => (
    <div data-testid={`select-item-${value}`} data-value={value}>
      {children}
    </div>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: any) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: any) => (
    <img data-testid="avatar-image" src={src} alt={alt} />
  ),
  AvatarFallback: ({ children }: any) => (
    <div data-testid="avatar-fallback">{children}</div>
  ),
}));

// Import after mocks
import AdminAnonymousUsersPage from '../../../app/admin/anonymous-users/page';

const mockAdminService = adminService as jest.Mocked<typeof adminService>;
const mockToast = toast as jest.Mocked<typeof toast>;

// Factory function for creating mock anonymous users
const createMockAnonymousUser = (overrides: Partial<AnonymousUser> = {}): AnonymousUser => ({
  id: 'anon-1',
  firstName: 'John',
  lastName: 'Doe',
  username: 'johndoe',
  email: 'john@example.com',
  sessionToken: 'token-123',
  ipAddress: '192.168.1.1',
  country: 'France',
  language: 'fr',
  isActive: true,
  isOnline: true,
  lastActiveAt: new Date(),
  joinedAt: new Date('2024-01-15'),
  canSendMessages: true,
  canSendFiles: true,
  canSendImages: true,
  shareLink: {
    id: 'link-1',
    linkId: 'share-123',
    identifier: 'conv-link',
    name: 'Test Link',
    conversation: {
      id: 'conv-1',
      identifier: 'conv-identifier',
      title: 'Test Conversation',
    },
  },
  _count: {
    sentMessages: 50,
  },
  ...overrides,
});

describe('AdminAnonymousUsersPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
  });

  describe('Loading State', () => {
    it('should display loading spinner initially', () => {
      mockAdminService.getAnonymousUsers.mockImplementation(() => new Promise(() => {})); // Never resolves

      render(<AdminAnonymousUsersPage />);

      expect(screen.getByText('Loading anonymous users...')).toBeInTheDocument();
    });

    it('should show loading animation during data fetch', () => {
      mockAdminService.getAnonymousUsers.mockImplementation(() => new Promise(() => {}));

      const { container } = render(<AdminAnonymousUsersPage />);

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Successful Data Load', () => {
    const mockUsers: AnonymousUser[] = [
      createMockAnonymousUser({ id: 'anon-1', firstName: 'John', lastName: 'Doe' }),
      createMockAnonymousUser({
        id: 'anon-2',
        firstName: 'Jane',
        lastName: 'Smith',
        isOnline: false,
        _count: { sentMessages: 25 }
      }),
      createMockAnonymousUser({
        id: 'anon-3',
        firstName: 'Bob',
        lastName: 'Wilson',
        isActive: false,
        isOnline: false,
        _count: { sentMessages: 10 }
      }),
    ];

    beforeEach(() => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: mockUsers,
          pagination: {
            offset: 0,
            limit: 20,
            total: 3,
            hasMore: false,
          },
        },
      });
    });

    it('should render the page title and description', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        const matches = screen.getAllByText('Anonymous users');
        expect(matches.length).toBeGreaterThan(0);
      });
      expect(screen.getByText('Management of anonymous participants')).toBeInTheDocument();
    });

    it('should display statistics cards', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Total')).toBeInTheDocument();
      });
      expect(screen.getByText('3')).toBeInTheDocument(); // Total count
      const actifs = screen.getAllByText('Active');
      expect(actifs.length).toBeGreaterThan(0);
      const messages = screen.getAllByText('Messages');
      expect(messages.length).toBeGreaterThan(0);
    });

    it('should display the list of anonymous users', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('Bob Wilson')).toBeInTheDocument();
    });

    it('should display user details like email, country, and language', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        const emails = screen.getAllByText('john@example.com');
        expect(emails.length).toBeGreaterThan(0);
      });
      expect(screen.getAllByText('France')[0]).toBeInTheDocument();
      expect(screen.getAllByText('fr')[0]).toBeInTheDocument();
    });

    it('should calculate and display total messages correctly', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        // Total messages = 50 + 25 + 10 = 85
        expect(screen.getByText('85')).toBeInTheDocument();
      });
    });

    it('should display correct status badges', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getAllByText('Active').length).toBeGreaterThan(0); // Active + Online user
      });
      expect(screen.getAllByText('Inactive').length).toBeGreaterThan(0); // Active but offline user
      expect(screen.getByText('Disabled')).toBeInTheDocument(); // Inactive user
    });

    it('should display user permissions badges', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getAllByText('Messages')[0]).toBeInTheDocument();
      });
      expect(screen.getAllByText('Fichiers')[0]).toBeInTheDocument();
      expect(screen.getAllByText('Images')[0]).toBeInTheDocument();
    });
  });

  describe('Empty State', () => {
    it('should display empty state message when no users found', async () => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [],
          pagination: {
            offset: 0,
            limit: 20,
            total: 0,
            hasMore: false,
          },
        },
      });

      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('No anonymous user found')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display toast error when API fails', async () => {
      mockAdminService.getAnonymousUsers.mockRejectedValue(new Error('Network error'));

      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Error loading anonymous users');
      });
    });

    it('should handle null response data gracefully', async () => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: null as any,
      });

      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('No anonymous user found')).toBeInTheDocument();
      });
    });
  });

  describe('Search and Filtering', () => {
    beforeEach(() => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [createMockAnonymousUser()],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });
    });

    it('should render search input', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search by name, email...')).toBeInTheDocument();
      });
    });

    it('should update search term on input change', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search by name, email...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name, email...');
      await user.type(searchInput, 'John');

      expect(searchInput).toHaveValue('John');
    });

    it('should trigger search on Enter key press', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Search by name, email...')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name, email...');
      await user.type(searchInput, 'John{enter}');

      await waitFor(() => {
        expect(mockAdminService.getAnonymousUsers).toHaveBeenCalledWith(0, 20, 'John', undefined);
      });
    });

    it('should trigger search on button click', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Search')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText('Search by name, email...');
      await user.type(searchInput, 'Test');

      const searchButton = screen.getByText('Search');
      await user.click(searchButton);

      await waitFor(() => {
        expect(mockAdminService.getAnonymousUsers).toHaveBeenCalledWith(0, 20, 'Test', undefined);
      });
    });

    it('should filter by active status', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        const matches = screen.getAllByText('Active');
        expect(matches.length).toBeGreaterThan(0);
      });

      // Find and click the "Active" filter button (not the status badge)
      const filterButtons = screen.getAllByRole('button');
      const actifButton = filterButtons.find(btn => btn.textContent === 'Active');
      if (actifButton) {
        await user.click(actifButton);
      }

      await waitFor(() => {
        expect(mockAdminService.getAnonymousUsers).toHaveBeenCalledWith(0, 20, undefined, 'active');
      });
    });

    it('should filter by inactive status', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Inactive')).toBeInTheDocument();
      });

      const filterButtons = screen.getAllByRole('button');
      const inactifButton = filterButtons.find(btn => btn.textContent === 'Inactive');
      if (inactifButton) {
        await user.click(inactifButton);
      }

      await waitFor(() => {
        expect(mockAdminService.getAnonymousUsers).toHaveBeenCalledWith(0, 20, undefined, 'inactive');
      });
    });

    it('should clear filter when clicking "All"', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      const allButton = screen.getByRole('button', { name: 'All' });
      await user.click(allButton);

      await waitFor(() => {
        expect(mockAdminService.getAnonymousUsers).toHaveBeenCalledWith(0, 20, undefined, undefined);
      });
    });
  });

  describe('Page Size Selection', () => {
    beforeEach(() => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [createMockAnonymousUser()],
          pagination: {
            offset: 0,
            limit: 20,
            total: 100,
            hasMore: true,
          },
        },
      });
    });

    it('should render page size selector', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('20 per page')).toBeInTheDocument();
      });
    });
  });

  describe('Pagination', () => {
    beforeEach(() => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [createMockAnonymousUser()],
          pagination: {
            offset: 0,
            limit: 20,
            total: 50,
            hasMore: true,
          },
        },
      });
    });

    it('should display pagination info when multiple pages exist', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText(/Page 1 of/)).toBeInTheDocument();
      });
    });

    it('should render pagination buttons', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Previous')).toBeInTheDocument();
      });
      expect(screen.getByText('Next')).toBeInTheDocument();
    });

    it('should disable "Previous" button on first page', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        const prevButton = screen.getByText('Previous');
        expect(prevButton).toBeDisabled();
      });
    });

    it('should enable "Next" button when hasMore is true', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        const nextButton = screen.getByText('Next');
        expect(nextButton).not.toBeDisabled();
      });
    });

    it('should load next page when clicking "Next"', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Next')).toBeInTheDocument();
      });

      const nextButton = screen.getByText('Next');
      await user.click(nextButton);

      await waitFor(() => {
        expect(mockAdminService.getAnonymousUsers).toHaveBeenCalledWith(20, 20, undefined, undefined);
      });
    });
  });

  describe('Navigation', () => {
    beforeEach(() => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [createMockAnonymousUser()],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });
    });

    it('should navigate back to admin page when clicking "Back"', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Back')).toBeInTheDocument();
      });

      const backButton = screen.getByText('Back');
      await user.click(backButton);

      expect(mockPush).toHaveBeenCalledWith('/admin');
    });
  });

  describe('User Details Modal', () => {
    const mockUser = createMockAnonymousUser();

    beforeEach(() => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [mockUser],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });
    });

    it('should open details modal when clicking "Details" button', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Details')).toBeInTheDocument();
      });

      const detailsButton = screen.getByText('Details');
      await user.click(detailsButton);

      await waitFor(() => {
        expect(screen.getByTestId('dialog')).toBeInTheDocument();
      });
    });

    it('should display user information in the modal', async () => {
      const user = userEvent.setup();
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Details')).toBeInTheDocument();
      });

      const detailsButton = screen.getByText('Details');
      await user.click(detailsButton);

      await waitFor(() => {
        expect(screen.getByText('Anonymous user details')).toBeInTheDocument();
      });
    });
  });

  describe('Conversation Link Display', () => {
    beforeEach(() => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [createMockAnonymousUser()],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });
    });

    it('should display conversation title', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Conversation')).toBeInTheDocument();
      });
    });

    it('should display share link identifier', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('conv-link')).toBeInTheDocument();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle user without email', async () => {
      const userWithoutEmail = createMockAnonymousUser({ email: undefined });

      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [userWithoutEmail],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });

      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      expect(screen.queryByText('john@example.com')).not.toBeInTheDocument();
    });

    it('should handle user without country', async () => {
      const userWithoutCountry = createMockAnonymousUser({ country: undefined });

      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [userWithoutCountry],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });

      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });
      expect(screen.queryByText('France')).not.toBeInTheDocument();
    });

    it('should handle conversation without title', async () => {
      const userWithUntitledConv = createMockAnonymousUser({
        shareLink: {
          id: 'link-1',
          linkId: 'share-123',
          identifier: 'conv-link',
          name: 'Test Link',
          conversation: {
            id: 'conv-1',
            identifier: 'conv-identifier',
            title: undefined,
          },
        },
      });

      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [userWithUntitledConv],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });

      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        expect(screen.getByText('conv-identifier')).toBeInTheDocument();
      });
    });
  });

  describe('Date Formatting', () => {
    it('should format dates in French locale', async () => {
      const mockUser = createMockAnonymousUser({
        joinedAt: new Date('2024-06-15T14:30:00'),
      });

      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [mockUser],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });

      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        // The date should be formatted using the joinedAt translation key
        expect(screen.getByText(/Joined/)).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockAdminService.getAnonymousUsers.mockResolvedValue({
        success: true,
        message: 'Success',
        data: {
          anonymousUsers: [createMockAnonymousUser()],
          pagination: {
            offset: 0,
            limit: 20,
            total: 1,
            hasMore: false,
          },
        },
      });
    });

    it('should have accessible search input with placeholder', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        const searchInput = screen.getByPlaceholderText('Search by name, email...');
        expect(searchInput).toBeInTheDocument();
      });
    });

    it('should have accessible buttons', async () => {
      render(<AdminAnonymousUsersPage />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });
});
