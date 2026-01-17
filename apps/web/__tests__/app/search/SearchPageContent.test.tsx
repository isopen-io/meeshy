/**
 * Tests for Search Page Content (app/search/SearchPageContent.tsx)
 *
 * Covers:
 * - Initial render and search form
 * - Search functionality across users, conversations, communities
 * - Tab navigation between result types
 * - User interactions (friend requests, start conversation, join community)
 * - Empty states and loading states
 * - URL parameter handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// === MOCKS ===

// Mock Next.js router and search params
const mockPush = jest.fn();
let mockSearchParams = new URLSearchParams();

jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/search',
  useSearchParams: () => mockSearchParams,
  useParams: () => ({}),
}));

// Mock sonner toast
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();
jest.mock('sonner', () => ({
  toast: {
    success: mockToastSuccess,
    error: mockToastError,
    info: jest.fn(),
  },
}));

// Mock buildApiUrl
jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://test-api${path}`,
}));

// Mock stores
let mockCurrentUser: any = null;

jest.mock('@/stores', () => ({
  useUser: () => mockCurrentUser,
}));

// Mock authManager
let mockAuthToken: string | null = 'valid-token';
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockAuthToken,
    getCurrentUser: () => mockCurrentUser,
  },
}));

// Mock user status
jest.mock('@/lib/user-status', () => ({
  getUserStatus: (user: any) => user?.isOnline ? 'online' : 'offline',
}));

// Mock fetch responses
let mockUsersResponse: any = { ok: true, json: () => Promise.resolve({ data: [] }) };
let mockConversationsResponse: any = { ok: true, json: () => Promise.resolve({ data: [] }) };
let mockCommunitiesResponse: any = { ok: true, json: () => Promise.resolve({ data: [] }) };
let mockFriendRequestsResponse: any = { ok: true, json: () => Promise.resolve({ data: [] }) };

global.fetch = jest.fn((url: string) => {
  if (url.includes('/users/search')) {
    return Promise.resolve(mockUsersResponse);
  }
  if (url.includes('/users/friend-requests')) {
    if (url.includes('PATCH') || url.includes('POST')) {
      return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
    }
    return Promise.resolve(mockFriendRequestsResponse);
  }
  if (url.includes('/conversations/search')) {
    return Promise.resolve(mockConversationsResponse);
  }
  if (url.includes('/conversations')) {
    return Promise.resolve({
      ok: true,
      json: () => Promise.resolve({ success: true, data: { id: 'new-conv-123' } }),
    });
  }
  if (url.includes('/communities/search')) {
    return Promise.resolve(mockCommunitiesResponse);
  }
  if (url.includes('/communities') && url.includes('/join')) {
    return Promise.resolve({ ok: true, json: () => Promise.resolve({ success: true }) });
  }
  return Promise.resolve({ ok: false });
}) as jest.Mock;

// Mock DashboardLayout
jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children, title, className }: { children: React.ReactNode; title?: string; className?: string }) => (
    <div data-testid="dashboard-layout" data-title={title} className={className}>
      {children}
    </div>
  ),
}));

// Mock Footer
jest.mock('@/components/layout/Footer', () => ({
  Footer: () => <footer data-testid="footer">Footer</footer>,
}));

// Mock OnlineIndicator
jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ isOnline, status, size, className }: any) => (
    <span data-testid="online-indicator" data-online={isOnline} data-status={status}></span>
  ),
}));

// Mock ConversationDropdown
jest.mock('@/components/contacts/ConversationDropdown', () => ({
  ConversationDropdown: ({ userId, onCreateNew }: any) => (
    <button data-testid={`conversation-dropdown-${userId}`} onClick={onCreateNew}>
      Start Chat
    </button>
  ),
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, className, disabled, size, type, ...props }: any) => (
    <button onClick={onClick} className={className} disabled={disabled} type={type} data-variant={variant} data-size={size} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className, onClick }: any) => (
    <div className={className} onClick={onClick} data-testid="card">{children}</div>
  ),
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: React.forwardRef(({ value, onChange, placeholder, className, type, ...props }: any, ref: any) => (
    <input
      ref={ref}
      value={value}
      onChange={onChange}
      placeholder={placeholder}
      className={className}
      type={type}
      data-testid="search-input"
      {...props}
    />
  )),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: any) => <div className={className}>{children}</div>,
  AvatarFallback: ({ children, className }: any) => <span className={className}>{children}</span>,
  AvatarImage: ({ src, alt }: any) => <img src={src} alt={alt} />,
}));

jest.mock('@/components/ui/tabs', () => ({
  Tabs: ({ children, value, onValueChange }: any) => (
    <div data-testid="tabs" data-value={value}>
      {React.Children.map(children, (child) =>
        React.isValidElement(child)
          ? React.cloneElement(child as React.ReactElement<any>, { onValueChange, currentValue: value })
          : child
      )}
    </div>
  ),
  TabsList: ({ children, className }: any) => <div className={className}>{children}</div>,
  TabsTrigger: ({ children, value, className, onValueChange, currentValue }: any) => (
    <button
      className={className}
      data-testid={`tab-${value}`}
      data-selected={currentValue === value}
      onClick={() => onValueChange?.(value)}
    >
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/dropdown-menu', () => ({
  DropdownMenu: ({ children }: any) => <div>{children}</div>,
  DropdownMenuContent: ({ children, className }: any) => (
    <div className={className} data-testid="dropdown-content">{children}</div>
  ),
  DropdownMenuItem: ({ children, onClick, className }: any) => (
    <button onClick={onClick} className={className}>{children}</button>
  ),
  DropdownMenuTrigger: ({ children, asChild }: any) => <>{children}</>,
}));

// Import the component after mocks
import { SearchPageContent } from '@/app/search/SearchPageContent';

describe('SearchPageContent', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    mockSearchParams = new URLSearchParams();
    mockAuthToken = 'valid-token';
    mockCurrentUser = {
      id: 'current-user-123',
      username: 'currentuser',
      firstName: 'Current',
      lastName: 'User',
    };

    // Reset fetch mock responses
    mockUsersResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
    mockConversationsResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
    mockCommunitiesResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
    mockFriendRequestsResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
  });

  describe('Initial Render', () => {
    it('should render search page with hero section', () => {
      render(<SearchPageContent />);

      expect(screen.getByText('Recherche')).toBeInTheDocument();
      expect(screen.getByText(/Decouvrez des utilisateurs/i)).toBeInTheDocument();
    });

    it('should render search form with input and button', () => {
      render(<SearchPageContent />);

      expect(screen.getByTestId('search-input')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Rechercher/i })).toBeInTheDocument();
    });

    it('should focus search input on mount', () => {
      render(<SearchPageContent />);

      expect(screen.getByTestId('search-input')).toHaveFocus();
    });

    it('should not show tabs when no query is entered', () => {
      render(<SearchPageContent />);

      expect(screen.queryByTestId('tabs')).not.toBeInTheDocument();
    });

    it('should render footer', () => {
      render(<SearchPageContent />);

      expect(screen.getByTestId('footer')).toBeInTheDocument();
    });
  });

  describe('URL Parameter Handling', () => {
    it('should initialize search from URL query parameter', async () => {
      mockSearchParams = new URLSearchParams('q=test%20search');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByTestId('search-input')).toHaveValue('test search');
      });
    });

    it('should set active tab from URL parameter', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=conversations');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByTestId('tabs')).toHaveAttribute('data-value', 'conversations');
      });
    });

    it('should default to users tab when no tab parameter', async () => {
      mockSearchParams = new URLSearchParams('q=test');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByTestId('tabs')).toHaveAttribute('data-value', 'users');
      });
    });
  });

  describe('Search Functionality', () => {
    it('should perform search when form is submitted', async () => {
      render(<SearchPageContent />);

      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'test query' } });

      const submitButton = screen.getByRole('button', { name: /Rechercher/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalled();
      });
    });

    it('should update URL when search is performed', async () => {
      render(<SearchPageContent />);

      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'test query' } });

      const submitButton = screen.getByRole('button', { name: /Rechercher/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('q=test%20query'));
      });
    });

    it('should not search if query is less than 2 characters', async () => {
      render(<SearchPageContent />);

      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'a' } });

      const submitButton = screen.getByRole('button', { name: /Rechercher/i });
      fireEvent.click(submitButton);

      // fetch should only be called for friend requests, not for search
      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/users/friend-requests'),
          expect.anything()
        );
      });
    });

    it('should not search if query is empty', async () => {
      render(<SearchPageContent />);

      const submitButton = screen.getByRole('button', { name: /Rechercher/i });
      fireEvent.click(submitButton);

      // Should not update URL or make search API calls
      expect(mockPush).not.toHaveBeenCalled();
    });

    it('should redirect to login if not authenticated', async () => {
      mockAuthToken = null;

      render(<SearchPageContent />);

      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'test query' } });

      const submitButton = screen.getByRole('button', { name: /Rechercher/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('connecte'));
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('should search users, conversations, and communities in parallel', async () => {
      mockSearchParams = new URLSearchParams('q=test');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/users/search?q=test'),
          expect.anything()
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/conversations/search?q=test'),
          expect.anything()
        );
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/communities/search?q=test'),
          expect.anything()
        );
      });
    });
  });

  describe('Loading State', () => {
    it('should show loading indicator during search', async () => {
      // Make fetch hang
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

      render(<SearchPageContent />);

      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'test query' } });

      const submitButton = screen.getByRole('button', { name: /Rechercher/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Recherche en cours/i)).toBeInTheDocument();
      });
    });

    it('should show loading spinner in button during search', async () => {
      (global.fetch as jest.Mock).mockImplementation(() => new Promise(() => {}));

      render(<SearchPageContent />);

      const input = screen.getByTestId('search-input');
      fireEvent.change(input, { target: { value: 'test query' } });

      const submitButton = screen.getByRole('button', { name: /Rechercher/i });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Recherche.../i })).toBeInTheDocument();
      });
    });
  });

  describe('Search Results - Users', () => {
    beforeEach(() => {
      mockUsersResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'user-1',
              username: 'johndoe',
              firstName: 'John',
              lastName: 'Doe',
              displayName: 'John Doe',
              avatar: 'https://example.com/avatar1.jpg',
              isOnline: true,
            },
            {
              id: 'user-2',
              username: 'janedoe',
              firstName: 'Jane',
              lastName: 'Doe',
              displayName: 'Jane Doe',
              avatar: 'https://example.com/avatar2.jpg',
              isOnline: false,
            },
          ],
        }),
      };
    });

    it('should display user results', async () => {
      mockSearchParams = new URLSearchParams('q=doe');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Jane Doe')).toBeInTheDocument();
      });
    });

    it('should display username with @ prefix', async () => {
      mockSearchParams = new URLSearchParams('q=doe');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('@johndoe')).toBeInTheDocument();
        expect(screen.getByText('@janedoe')).toBeInTheDocument();
      });
    });

    it('should display online status badge', async () => {
      mockSearchParams = new URLSearchParams('q=doe');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('En ligne')).toBeInTheDocument();
        expect(screen.getByText('Hors ligne')).toBeInTheDocument();
      });
    });

    it('should show add friend button', async () => {
      mockSearchParams = new URLSearchParams('q=doe');

      render(<SearchPageContent />);

      await waitFor(() => {
        const addButtons = screen.getAllByText('Ajouter');
        expect(addButtons.length).toBeGreaterThan(0);
      });
    });

    it('should filter out current user from results', async () => {
      mockUsersResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'current-user-123', username: 'currentuser' },
            { id: 'user-1', username: 'johndoe', displayName: 'John Doe' },
          ],
        }),
      };
      mockSearchParams = new URLSearchParams('q=user');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('currentuser')).not.toBeInTheDocument();
      });
    });

    it('should show empty state when no users found', async () => {
      mockUsersResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
      mockSearchParams = new URLSearchParams('q=nonexistent');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Aucun utilisateur trouve')).toBeInTheDocument();
      });
    });
  });

  describe('Search Results - Conversations', () => {
    beforeEach(() => {
      mockConversationsResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'conv-1',
              title: 'Project Discussion',
              type: 'direct',
              lastMessageAt: '2024-01-20T10:00:00Z',
              unreadCount: 2,
            },
            {
              id: 'conv-2',
              title: 'Team Chat',
              type: 'group',
              lastMessageAt: '2024-01-19T15:30:00Z',
              unreadCount: 0,
            },
          ],
        }),
      };
    });

    it('should display conversation results when tab is selected', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=conversations');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Project Discussion')).toBeInTheDocument();
        expect(screen.getByText('Team Chat')).toBeInTheDocument();
      });
    });

    it('should display conversation type badge', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=conversations');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText(/Direct/)).toBeInTheDocument();
        expect(screen.getByText(/Groupe/)).toBeInTheDocument();
      });
    });

    it('should display unread count badge', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=conversations');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText(/2 message.*non lu/i)).toBeInTheDocument();
      });
    });

    it('should navigate to conversation on click', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=conversations');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Project Discussion')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Project Discussion'));

      expect(mockPush).toHaveBeenCalledWith('/conversations/conv-1');
    });

    it('should show empty state when no conversations found', async () => {
      mockConversationsResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
      mockSearchParams = new URLSearchParams('q=nonexistent&tab=conversations');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Aucune conversation trouvee')).toBeInTheDocument();
      });
    });
  });

  describe('Search Results - Communities', () => {
    beforeEach(() => {
      mockCommunitiesResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [
            {
              id: 'community-1',
              name: 'Developers Hub',
              description: 'A community for developers',
              memberCount: 150,
              isPrivate: false,
              avatar: 'https://example.com/community1.jpg',
            },
            {
              id: 'community-2',
              name: 'Private Club',
              description: 'Exclusive members only',
              memberCount: 25,
              isPrivate: true,
            },
          ],
        }),
      };
    });

    it('should display community results when tab is selected', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=communities');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Developers Hub')).toBeInTheDocument();
        expect(screen.getByText('Private Club')).toBeInTheDocument();
      });
    });

    it('should display community description', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=communities');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('A community for developers')).toBeInTheDocument();
      });
    });

    it('should display member count', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=communities');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText(/150 membre/)).toBeInTheDocument();
        expect(screen.getByText(/25 membre/)).toBeInTheDocument();
      });
    });

    it('should display private/public badge', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=communities');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Public')).toBeInTheDocument();
        expect(screen.getByText('Prive')).toBeInTheDocument();
      });
    });

    it('should show join button', async () => {
      mockSearchParams = new URLSearchParams('q=test&tab=communities');

      render(<SearchPageContent />);

      await waitFor(() => {
        const joinButtons = screen.getAllByText('Rejoindre');
        expect(joinButtons.length).toBeGreaterThan(0);
      });
    });

    it('should show empty state when no communities found', async () => {
      mockCommunitiesResponse = { ok: true, json: () => Promise.resolve({ data: [] }) };
      mockSearchParams = new URLSearchParams('q=nonexistent&tab=communities');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Aucune communaute trouvee')).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    beforeEach(() => {
      mockUsersResponse = { ok: true, json: () => Promise.resolve({ data: [{ id: 'user-1', username: 'test', displayName: 'Test' }] }) };
      mockConversationsResponse = { ok: true, json: () => Promise.resolve({ data: [{ id: 'conv-1', title: 'Test Conv', type: 'direct' }] }) };
      mockCommunitiesResponse = { ok: true, json: () => Promise.resolve({ data: [{ id: 'comm-1', name: 'Test Community', memberCount: 10 }] }) };
    });

    it('should display result counts in tabs', async () => {
      mockSearchParams = new URLSearchParams('q=test');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText(/Utilisateurs \(1\)/)).toBeInTheDocument();
        expect(screen.getByText(/Conversations \(1\)/)).toBeInTheDocument();
        expect(screen.getByText(/Communautes \(1\)/)).toBeInTheDocument();
      });
    });

    it('should update URL when tab is changed', async () => {
      mockSearchParams = new URLSearchParams('q=test');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByTestId('tab-conversations')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('tab-conversations'));

      expect(mockPush).toHaveBeenCalledWith(expect.stringContaining('tab=conversations'));
    });

    it('should display total results count', async () => {
      mockSearchParams = new URLSearchParams('q=test');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText(/3 resultat.*pour "test"/i)).toBeInTheDocument();
      });
    });
  });

  describe('User Interactions - Friend Requests', () => {
    beforeEach(() => {
      mockUsersResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'user-1', username: 'johndoe', displayName: 'John Doe' }],
        }),
      };
    });

    it('should send friend request when add button is clicked', async () => {
      mockSearchParams = new URLSearchParams('q=john');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Ajouter')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Ajouter'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/users/friend-requests'),
          expect.objectContaining({
            method: 'POST',
            body: JSON.stringify({ receiverId: 'user-1' }),
          })
        );
        expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('ami envoyee'));
      });
    });

    it('should show cancel button for pending requests', async () => {
      mockFriendRequestsResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'req-1', senderId: 'current-user-123', receiverId: 'user-1', status: 'pending' },
          ],
        }),
      };
      mockSearchParams = new URLSearchParams('q=john');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Annuler')).toBeInTheDocument();
      });
    });

    it('should cancel friend request when cancel button is clicked', async () => {
      mockFriendRequestsResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [
            { id: 'req-1', senderId: 'current-user-123', receiverId: 'user-1', status: 'pending' },
          ],
        }),
      };
      mockSearchParams = new URLSearchParams('q=john');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Annuler')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Annuler'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/users/friend-requests/req-1'),
          expect.objectContaining({
            method: 'PATCH',
          })
        );
      });
    });
  });

  describe('User Interactions - Start Conversation', () => {
    beforeEach(() => {
      mockUsersResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'user-1', username: 'johndoe', displayName: 'John Doe' }],
        }),
      };
    });

    it('should create conversation and navigate when chat is started', async () => {
      mockSearchParams = new URLSearchParams('q=john');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByTestId('conversation-dropdown-user-1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('conversation-dropdown-user-1'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/conversations'),
          expect.objectContaining({
            method: 'POST',
          })
        );
        expect(mockToastSuccess).toHaveBeenCalledWith('Conversation creee');
        expect(mockPush).toHaveBeenCalledWith('/conversations/new-conv-123');
      });
    });
  });

  describe('User Interactions - Join Community', () => {
    beforeEach(() => {
      mockCommunitiesResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'community-1', name: 'Developers Hub', memberCount: 100 }],
        }),
      };
    });

    it('should join community when join button is clicked', async () => {
      mockSearchParams = new URLSearchParams('q=dev&tab=communities');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Rejoindre')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Rejoindre'));

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/communities/community-1/join'),
          expect.objectContaining({
            method: 'POST',
          })
        );
        expect(mockToastSuccess).toHaveBeenCalledWith(expect.stringContaining('rejoint'));
      });
    });
  });

  describe('Error Handling', () => {
    it('should show error toast when search fails', async () => {
      (global.fetch as jest.Mock).mockImplementation(() =>
        Promise.reject(new Error('Network error'))
      );

      mockSearchParams = new URLSearchParams('q=test');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('recherche'));
      });
    });

    it('should show error toast when friend request fails', async () => {
      mockUsersResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'user-1', username: 'johndoe', displayName: 'John Doe' }],
        }),
      };
      mockSearchParams = new URLSearchParams('q=john');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Ajouter')).toBeInTheDocument();
      });

      // Make the friend request fail
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'Failed' }) })
      );

      fireEvent.click(screen.getByText('Ajouter'));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalled();
      });
    });

    it('should show error toast when joining community fails', async () => {
      mockCommunitiesResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'community-1', name: 'Test', memberCount: 10 }],
        }),
      };
      mockSearchParams = new URLSearchParams('q=test&tab=communities');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('Rejoindre')).toBeInTheDocument();
      });

      // Make join fail
      (global.fetch as jest.Mock).mockImplementationOnce(() =>
        Promise.resolve({ ok: false })
      );

      fireEvent.click(screen.getByText('Rejoindre'));

      await waitFor(() => {
        expect(mockToastError).toHaveBeenCalledWith(expect.stringContaining('rejoindre'));
      });
    });
  });

  describe('Accessibility', () => {
    it('should have proper form structure', () => {
      render(<SearchPageContent />);

      const form = screen.getByRole('form') || screen.getByTestId('search-input').closest('form');
      expect(form).toBeInTheDocument();
    });

    it('should have proper heading structure', () => {
      render(<SearchPageContent />);

      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });
  });

  describe('User Profile Navigation', () => {
    beforeEach(() => {
      mockUsersResponse = {
        ok: true,
        json: () => Promise.resolve({
          data: [{ id: 'user-1', username: 'johndoe', displayName: 'John Doe' }],
        }),
      };
    });

    it('should navigate to user profile when username is clicked', async () => {
      mockSearchParams = new URLSearchParams('q=john');

      render(<SearchPageContent />);

      await waitFor(() => {
        expect(screen.getByText('@johndoe')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('@johndoe'));

      expect(mockPush).toHaveBeenCalledWith('/u/user-1');
    });
  });
});
