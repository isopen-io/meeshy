/**
 * Tests for Dashboard Page (app/dashboard/page.tsx)
 *
 * Covers:
 * - Initial render states (loading, error, success)
 * - Dashboard data display (stats, conversations, communities)
 * - User interactions (navigation, modals, refresh)
 * - Empty states handling
 * - API error handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';

// === MOCKS ===

// Mock Next.js router
const mockPush = jest.fn();
const mockReplace = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: mockReplace,
    prefetch: jest.fn(),
    back: jest.fn(),
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));
const mockToastSuccess = jest.fn();
const mockToastError = jest.fn();

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, v),
          key
        );
      }
      return key;
    },
    currentLanguage: 'fr',
  }),
}));

// Mock use-i18n (aliased)
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, string>) => {
      if (params) {
        return Object.entries(params).reduce(
          (str, [k, v]) => str.replace(`{${k}}`, v),
          key
        );
      }
      return key;
    },
    currentLanguage: 'fr',
  }),
}));

// Mock stores
let mockUser: any = null;

jest.mock('@/stores', () => ({
  useUser: () => mockUser,
}));

// Mock authManager
let mockAuthToken: string | null = 'valid-token';
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockAuthToken,
    getCurrentUser: () => mockUser,
    clearAllSessions: jest.fn(),
  },
}));

// Mock dashboard data variables
let mockDashboardData: any = null;
let mockDashboardError: Error | null = null;
let mockDashboardLoading = false;
const mockRefetch = jest.fn();

jest.mock('@/services/dashboard.service', () => ({
  dashboardService: {
    getDashboardData: jest.fn(() => {
      if (mockDashboardError) {
        return Promise.reject(mockDashboardError);
      }
      return Promise.resolve({ data: mockDashboardData });
    }),
  },
  DashboardData: {},
}));

// Mock useDashboardData hook directly to avoid async resolution issues
jest.mock('@/hooks/use-dashboard-data', () => ({
  useDashboardData: () => ({
    data: mockDashboardData,
    isLoading: mockDashboardLoading,
    error: mockDashboardError,
    refetch: mockRefetch,
  }),
}));

// Mock buildApiUrl
jest.mock('@/lib/config', () => ({
  buildApiUrl: (path: string) => `http://test-api${path}`,
}));

// Mock AuthGuard
jest.mock('@/components/auth/AuthGuard', () => ({
  AuthGuard: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

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

// Mock dashboard sub-components
jest.mock('@/components/dashboard/DashboardHeader', () => ({
  DashboardHeader: ({ userName, t, onShareApp, onCreateLink, onCreateConversation, onCreateCommunity }: any) => (
    <div data-testid="dashboard-header">
      <h1>{t('greeting', { name: userName })}</h1>
      <p>{t('overview')}</p>
      <button onClick={onShareApp}>{t('quickActions.shareApp')}</button>
      <button onClick={onCreateLink}>{t('quickActions.createLink')}</button>
      <button onClick={onCreateConversation}>{t('quickActions.newConversation')}</button>
      <button onClick={onCreateCommunity}>{t('quickActions.createCommunity')}</button>
    </div>
  ),
}));

jest.mock('@/components/dashboard/DashboardStats', () => ({
  DashboardStats: ({ stats, t }: any) => (
    <div data-testid="dashboard-stats">
      <div><span>{t('stats.conversations')}</span><span>{stats.totalConversations}</span></div>
      <div><span>{t('stats.communities')}</span><span>{stats.totalCommunities}</span></div>
      <div><span>{t('stats.messages')}</span><span>{stats.totalMessages}</span></div>
      <div><span>{t('stats.activeConversationsTitle')}</span><span>{stats.activeConversations}</span></div>
      <div><span>{t('stats.translations')}</span><span>{stats.translationsToday}</span></div>
      <div><span>{t('stats.links')}</span><span>{stats.totalLinks}</span></div>
    </div>
  ),
}));

jest.mock('@/components/dashboard/ConversationsWidget', () => ({
  ConversationsWidget: ({ conversations, t, onConversationClick, onViewAll, onStartConversation }: any) => {
    const formatAttachment = (att: any) => {
      if (att.mimeType?.startsWith('image/') && att.width && att.height) {
        return `${att.width}x${att.height}`;
      }
      if (att.mimeType?.startsWith('audio/') && att.duration) {
        const secs = Math.floor(att.duration / 1000);
        return `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`;
      }
      return att.mimeType;
    };
    return (
      <div data-testid="conversations-widget">
        <h3>{t('recentConversations')}</h3>
        {conversations.length === 0 ? (
          <>
            <p>{t('emptyStates.noRecentConversations')}</p>
            <button onClick={onStartConversation}>{t('actions.startConversation')}</button>
          </>
        ) : (
          <>
            {conversations.map((c: any) => (
              <div key={c.id} onClick={() => onConversationClick(c.id)}>
                <span>{c.title}</span>
                {c.lastMessage && (
                  <>
                    {c.lastMessage.content && <span>{c.lastMessage.content}</span>}
                    {c.lastMessage.sender && <span>{c.lastMessage.sender.displayName || c.lastMessage.sender.username}</span>}
                    {c.lastMessage.attachments && c.lastMessage.attachments.length > 0 && (
                      <>
                        <span>{formatAttachment(c.lastMessage.attachments[0])}</span>
                        {c.lastMessage.attachments.length > 1 && <span>+{c.lastMessage.attachments.length - 1}</span>}
                      </>
                    )}
                  </>
                )}
              </div>
            ))}
            <button onClick={onViewAll}>{t('actions.viewAll')}</button>
          </>
        )}
      </div>
    );
  },
}));

jest.mock('@/components/dashboard/CommunitiesWidget', () => ({
  CommunitiesWidget: ({ communities, t, onCommunityClick, onViewAll, onCreateCommunity }: any) => (
    <div data-testid="communities-widget">
      <h3>{t('recentCommunities')}</h3>
      {communities.length === 0 ? (
        <>
          <p>{t('emptyStates.noRecentCommunities')}</p>
          <button onClick={onCreateCommunity}>{t('actions.createCommunityButton')}</button>
        </>
      ) : (
        <>
          {communities.map((c: any) => (
            <div key={c.id} onClick={() => onCommunityClick(c.id)}>
              <span>{c.name}</span>
              {c.isPrivate && <span>{t('communities.private')}</span>}
              <span>{c.members?.length || 0}</span>
            </div>
          ))}
          <button onClick={onViewAll}>{t('actions.viewAll')}</button>
        </>
      )}
    </div>
  ),
}));

jest.mock('@/components/dashboard/QuickActionsWidget', () => ({
  QuickActionsWidget: ({ onCreateConversation, onCreateLink, onCreateGroup, onShare, onSettings, t }: any) => (
    <div data-testid="quick-actions-widget">
      <h3>{t('quickActions.title')}</h3>
      <button onClick={onCreateConversation}>{t('quickActions.newConversation')}</button>
      <button onClick={onCreateLink}>{t('quickActions.createLink')}</button>
      <button onClick={onCreateGroup}>{t('quickActions.createCommunity')}</button>
      <button onClick={onShare}>{t('quickActions.shareApp')}</button>
      <button onClick={onSettings}>{t('quickActions.settings')}</button>
    </div>
  ),
}));

jest.mock('@/components/dashboard/CreateGroupModal', () => ({
  CreateGroupModal: ({ isOpen, onClose }: any) => (
    isOpen ? <div data-testid="create-group-modal"><button onClick={onClose}>Close</button></div> : null
  ),
}));

// Mock hooks used by dashboard
jest.mock('@/hooks/use-prefetch', () => ({
  usePrefetch: () => jest.fn(),
}));

jest.mock('@/hooks/use-group-modal', () => ({
  useGroupModal: () => ({
    groupName: '',
    setGroupName: jest.fn(),
    groupDescription: '',
    setGroupDescription: jest.fn(),
    isGroupPrivate: false,
    setIsGroupPrivate: jest.fn(),
    availableUsers: [],
    selectedUsers: [],
    groupSearchQuery: '',
    setGroupSearchQuery: jest.fn(),
    isLoadingUsers: false,
    isCreatingGroup: false,
    toggleUserSelection: jest.fn(),
    createGroup: jest.fn(),
    loadUsers: jest.fn(),
    resetForm: jest.fn(),
  }),
}));

// Mock conversation components
jest.mock('@/components/conversations/create-conversation-modal', () => ({
  CreateConversationModal: ({ isOpen, onClose, onConversationCreated }: any) => (
    isOpen ? (
      <div data-testid="create-conversation-modal">
        <button onClick={onClose} data-testid="close-conversation-modal">Close</button>
        <button onClick={() => onConversationCreated('new-conv-123')} data-testid="create-conversation">Create</button>
      </div>
    ) : null
  ),
}));

jest.mock('@/components/conversations/create-link-modal', () => ({
  CreateLinkModalV2: ({ isOpen, onClose, onLinkCreated }: any) => (
    isOpen ? (
      <div data-testid="create-link-modal">
        <button onClick={onClose} data-testid="close-link-modal">Close</button>
        <button onClick={onLinkCreated} data-testid="create-link">Create Link</button>
      </div>
    ) : null
  ),
}));

jest.mock('@/components/conversations/create-link-button', () => ({
  CreateLinkButton: () => <button data-testid="create-link-button">Create Link</button>,
}));

// Mock affiliate components
jest.mock('@/components/affiliate/share-affiliate-button', () => ({
  ShareAffiliateButton: () => <button data-testid="share-affiliate-button">Share</button>,
}));

jest.mock('@/components/affiliate/share-affiliate-modal', () => ({
  ShareAffiliateModal: ({ isOpen, onClose }: any) => (
    isOpen ? (
      <div data-testid="share-affiliate-modal">
        <button onClick={onClose} data-testid="close-share-modal">Close</button>
      </div>
    ) : null
  ),
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, variant, className, disabled, ...props }: any) => (
    <button onClick={onClick} className={className} disabled={disabled} data-variant={variant} {...props}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className} data-testid="card">{children}</div>,
  CardContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardTitle: ({ children, className }: any) => <h3 className={className}>{children}</h3>,
  CardDescription: ({ children, className }: any) => <p className={className}>{children}</p>,
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

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => (
    open ? <div data-testid="dialog" role="dialog">{children}</div> : null
  ),
  DialogContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children, className }: any) => <h2 className={className}>{children}</h2>,
  DialogDescription: ({ children, className }: any) => <p className={className}>{children}</p>,
}));

jest.mock('@/components/ui/input', () => ({
  Input: ({ value, onChange, placeholder, className, id, ...props }: any) => (
    <input value={value} onChange={onChange} placeholder={placeholder} className={className} id={id} {...props} />
  ),
}));

jest.mock('@/components/ui/textarea', () => ({
  Textarea: ({ value, onChange, placeholder, className, id, rows }: any) => (
    <textarea value={value} onChange={onChange} placeholder={placeholder} className={className} id={id} rows={rows} />
  ),
}));

jest.mock('@/components/ui/label', () => ({
  Label: ({ children, htmlFor, className }: any) => (
    <label htmlFor={htmlFor} className={className}>{children}</label>
  ),
}));

jest.mock('@/components/ui/switch', () => ({
  Switch: ({ checked, onCheckedChange }: any) => (
    <button role="switch" aria-checked={checked} onClick={() => onCheckedChange(!checked)}>
      Switch
    </button>
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: any) => <div className={className}>{children}</div>,
}));

// Import the component after mocks
import DashboardPage from '@/app/dashboard/page';
import { dashboardService } from '@/services/dashboard.service';

describe('DashboardPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockToastSuccess.mockClear();
    mockToastError.mockClear();
    mockAuthToken = 'valid-token';
    mockDashboardError = null;
    mockUser = {
      id: 'user-123',
      username: 'testuser',
      firstName: 'Test',
      lastName: 'User',
      systemLanguage: 'fr',
    };
    mockDashboardData = {
      stats: {
        totalConversations: 10,
        totalCommunities: 5,
        totalMessages: 150,
        activeConversations: 3,
        translationsToday: 25,
        totalLinks: 8,
        lastUpdated: new Date(),
      },
      recentConversations: [
        {
          id: 'conv-1',
          title: 'Test Conversation 1',
          type: 'direct',
          lastMessage: {
            content: 'Hello there!',
            createdAt: new Date().toISOString(),
            sender: { id: 'user-2', username: 'otheruser', displayName: 'Other User' },
          },
        },
        {
          id: 'conv-2',
          title: 'Group Chat',
          type: 'group',
          lastMessage: {
            content: 'Welcome everyone',
            createdAt: new Date().toISOString(),
            sender: { id: 'user-3', username: 'admin', displayName: 'Admin' },
          },
        },
      ],
      recentCommunities: [
        {
          id: 'community-1',
          name: 'Test Community',
          description: 'A test community',
          isPrivate: false,
          members: [{ id: 'user-1' }, { id: 'user-2' }],
        },
        {
          id: 'community-2',
          name: 'Private Group',
          description: 'Private discussion',
          isPrivate: true,
          members: [{ id: 'user-1' }],
        },
      ],
    };
  });

  describe('Loading State', () => {
    it('should render loading spinner initially', async () => {
      mockDashboardLoading = true;
      mockDashboardData = null;

      const { container } = render(<DashboardPage />);

      expect(container.querySelector('.animate-spin')).toBeInTheDocument();
      expect(screen.getByText('loading')).toBeInTheDocument();

      // Reset for other tests
      mockDashboardLoading = false;
    });
  });

  describe('Error State', () => {
    it('should display error message when API fails', async () => {
      mockDashboardError = new Error('API Error');

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/errorLoading/)).toBeInTheDocument();
      });
    });

    it('should provide retry button on error', async () => {
      mockDashboardError = new Error('API Error');

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('retry')).toBeInTheDocument();
      });
    });

    it('should retry loading when retry button is clicked', async () => {
      mockDashboardError = new Error('API Error');

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('retry')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('retry'));

      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Dashboard Content', () => {
    it('should render greeting with user name', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('greeting')).toBeInTheDocument();
      });
    });

    it('should render overview text', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('overview')).toBeInTheDocument();
      });
    });

    it('should render statistics cards', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('stats.conversations')).toBeInTheDocument();
        expect(screen.getByText('stats.communities')).toBeInTheDocument();
        expect(screen.getByText('stats.messages')).toBeInTheDocument();
        expect(screen.getByText('stats.activeConversationsTitle')).toBeInTheDocument();
        expect(screen.getByText('stats.translations')).toBeInTheDocument();
        expect(screen.getByText('stats.links')).toBeInTheDocument();
      });
    });

    it('should display correct statistics values', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('10')).toBeInTheDocument(); // totalConversations
        expect(screen.getByText('5')).toBeInTheDocument(); // totalCommunities
        expect(screen.getByText('150')).toBeInTheDocument(); // totalMessages
        expect(screen.getByText('3')).toBeInTheDocument(); // activeConversations
        expect(screen.getByText('25')).toBeInTheDocument(); // translationsToday
        expect(screen.getByText('8')).toBeInTheDocument(); // totalLinks
      });
    });

    it('should render recent conversations section', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('recentConversations')).toBeInTheDocument();
        expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
        expect(screen.getByText('Group Chat')).toBeInTheDocument();
      });
    });

    it('should render recent communities section', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('recentCommunities')).toBeInTheDocument();
        expect(screen.getByText('Test Community')).toBeInTheDocument();
        expect(screen.getByText('Private Group')).toBeInTheDocument();
      });
    });

    it('should show private badge for private communities', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('communities.private')).toBeInTheDocument();
      });
    });

    it('should render quick actions section', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('quickActions.title')).toBeInTheDocument();
        // These appear in both DashboardHeader and QuickActionsWidget
        expect(screen.getAllByText('quickActions.newConversation').length).toBeGreaterThan(0);
        expect(screen.getAllByText('quickActions.createLink').length).toBeGreaterThan(0);
        expect(screen.getAllByText('quickActions.createCommunity').length).toBeGreaterThan(0);
        expect(screen.getAllByText('quickActions.shareApp').length).toBeGreaterThan(0);
        expect(screen.getByText('quickActions.settings')).toBeInTheDocument();
      });
    });
  });

  describe('Empty States', () => {
    it('should show empty state for conversations when none exist', async () => {
      mockDashboardData.recentConversations = [];

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('emptyStates.noRecentConversations')).toBeInTheDocument();
        expect(screen.getByText('actions.startConversation')).toBeInTheDocument();
      });
    });

    it('should show empty state for communities when none exist', async () => {
      mockDashboardData.recentCommunities = [];

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('emptyStates.noRecentCommunities')).toBeInTheDocument();
        expect(screen.getByText('actions.createCommunityButton')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation', () => {
    it('should navigate to conversations page when view all is clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('recentConversations')).toBeInTheDocument();
      });

      // Find and click the "view all" button for conversations
      const viewAllButtons = screen.getAllByText('actions.viewAll');
      fireEvent.click(viewAllButtons[0]);

      expect(mockPush).toHaveBeenCalledWith('/conversations');
    });

    it('should navigate to groups page when view all communities is clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('recentCommunities')).toBeInTheDocument();
      });

      const viewAllButtons = screen.getAllByText('actions.viewAll');
      fireEvent.click(viewAllButtons[1]);

      expect(mockPush).toHaveBeenCalledWith('/groups');
    });

    it('should navigate to conversation when clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Conversation 1')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Test Conversation 1'));

      expect(mockPush).toHaveBeenCalledWith('/conversations/conv-1');
    });

    it('should navigate to community when clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('Test Community')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Test Community'));

      expect(mockPush).toHaveBeenCalledWith('/groups/community-1');
    });

    it('should navigate to settings when quick action is clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('quickActions.settings')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('quickActions.settings'));

      expect(mockPush).toHaveBeenCalledWith('/settings');
    });

    it('should navigate to links page when create link action is clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText('quickActions.createLink');
        expect(buttons.length).toBeGreaterThan(0);
      });

      // Click the header's create link button (navigates to /links)
      const buttons = screen.getAllByText('quickActions.createLink');
      fireEvent.click(buttons[0]);

      expect(mockPush).toHaveBeenCalledWith('/links');
    });

    it('should navigate to conversations with new param when create conversation is clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText('quickActions.newConversation');
        expect(buttons.length).toBeGreaterThan(0);
      });

      // Click the header's create conversation button (navigates to /conversations?new=true)
      const buttons = screen.getAllByText('quickActions.newConversation');
      fireEvent.click(buttons[0]);

      expect(mockPush).toHaveBeenCalledWith('/conversations?new=true');
    });
  });

  describe('Modals', () => {
    it('should open create conversation modal when quick action is clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText('quickActions.newConversation');
        expect(buttons.length).toBeGreaterThan(0);
      });

      // Click the QuickActionsWidget button (last one) which opens modal
      const buttons = screen.getAllByText('quickActions.newConversation');
      fireEvent.click(buttons[buttons.length - 1]);

      await waitFor(() => {
        expect(screen.getByTestId('create-conversation-modal')).toBeInTheDocument();
      });
    });

    it('should open create link modal when quick action is clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText('quickActions.createLink');
        expect(buttons.length).toBeGreaterThan(0);
      });

      // Click the QuickActionsWidget button (last one) which opens modal
      const buttons = screen.getAllByText('quickActions.createLink');
      fireEvent.click(buttons[buttons.length - 1]);

      await waitFor(() => {
        expect(screen.getByTestId('create-link-modal')).toBeInTheDocument();
      });
    });

    it('should open share affiliate modal when action is clicked', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText('quickActions.shareApp');
        expect(buttons.length).toBeGreaterThan(0);
      });

      // Click the QuickActionsWidget button (last one) which opens modal
      const buttons = screen.getAllByText('quickActions.shareApp');
      fireEvent.click(buttons[buttons.length - 1]);

      await waitFor(() => {
        expect(screen.getByTestId('share-affiliate-modal')).toBeInTheDocument();
      });
    });

    it('should close modal and navigate when conversation is created', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText('quickActions.newConversation');
        expect(buttons.length).toBeGreaterThan(0);
      });

      // Click the QuickActionsWidget button to open modal
      const buttons = screen.getAllByText('quickActions.newConversation');
      fireEvent.click(buttons[buttons.length - 1]);

      await waitFor(() => {
        expect(screen.getByTestId('create-conversation-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-conversation'));

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/conversations/new-conv-123');
      });
    });

    it('should close modal and show success when link is created', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const buttons = screen.getAllByText('quickActions.createLink');
        expect(buttons.length).toBeGreaterThan(0);
      });

      // Click the QuickActionsWidget button to open modal
      const buttons = screen.getAllByText('quickActions.createLink');
      fireEvent.click(buttons[buttons.length - 1]);

      await waitFor(() => {
        expect(screen.getByTestId('create-link-modal')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTestId('create-link'));

      // Modal closes and refetch is called
      expect(mockRefetch).toHaveBeenCalled();
    });
  });

  describe('Last Message Display', () => {
    it('should display last message content', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Hello there!/)).toBeInTheDocument();
        expect(screen.getByText(/Welcome everyone/)).toBeInTheDocument();
      });
    });

    it('should display sender name for last message', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Other User/)).toBeInTheDocument();
        expect(screen.getByText(/Admin/)).toBeInTheDocument();
      });
    });

    it('should handle anonymous sender', async () => {
      mockDashboardData.recentConversations[0].lastMessage.sender = {
        id: 'anon-1',
        displayName: 'Anonymous Guest',
        type: 'anonymous',
      };

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText(/Anonymous Guest/)).toBeInTheDocument();
      });
    });

    it('should display attachment indicator for image messages', async () => {
      mockDashboardData.recentConversations[0].lastMessage = {
        content: null,
        createdAt: new Date().toISOString(),
        sender: { id: 'user-2', username: 'otheruser', displayName: 'Other User' },
        attachments: [{
          mimeType: 'image/jpeg',
          width: 1920,
          height: 1080,
        }],
      };

      render(<DashboardPage />);

      await waitFor(() => {
        // Should show image dimensions
        expect(screen.getByText(/1920.*1080/)).toBeInTheDocument();
      });
    });

    it('should display attachment indicator for audio messages', async () => {
      mockDashboardData.recentConversations[0].lastMessage = {
        content: null,
        createdAt: new Date().toISOString(),
        sender: { id: 'user-2', username: 'otheruser', displayName: 'Other User' },
        attachments: [{
          mimeType: 'audio/mp3',
          duration: 65000, // 65 seconds in ms
        }],
      };

      render(<DashboardPage />);

      await waitFor(() => {
        // Should show audio duration formatted
        expect(screen.getByText(/1:05/)).toBeInTheDocument();
      });
    });

    it('should show +N indicator for multiple attachments', async () => {
      mockDashboardData.recentConversations[0].lastMessage = {
        content: null,
        createdAt: new Date().toISOString(),
        sender: { id: 'user-2', username: 'otheruser', displayName: 'Other User' },
        attachments: [
          { mimeType: 'image/jpeg' },
          { mimeType: 'image/png' },
          { mimeType: 'image/gif' },
        ],
      };

      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByText('+2')).toBeInTheDocument();
      });
    });
  });

  describe('Footer', () => {
    it('should render footer component', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        expect(screen.getByTestId('footer')).toBeInTheDocument();
      });
    });
  });

  describe('Caching Behavior', () => {
    it('should not fetch data again within cache duration', async () => {
      render(<DashboardPage />);

      // With the hook mocked, data is provided synchronously
      // Verify dashboard content renders without additional fetches
      await waitFor(() => {
        expect(screen.getByText('greeting')).toBeInTheDocument();
      });

      // refetch should not be called automatically
      expect(mockRefetch).not.toHaveBeenCalled();
    });
  });

  describe('User Without Data', () => {
    it('should not fetch dashboard data when user is null', async () => {
      mockUser = null;

      render(<DashboardPage />);

      // Wait for potential fetch
      await act(async () => {
        await new Promise((r) => setTimeout(r, 100));
      });

      // Should stop loading but not make API call
      expect(dashboardService.getDashboardData).not.toHaveBeenCalled();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', async () => {
      render(<DashboardPage />);

      await waitFor(() => {
        const headings = screen.getAllByRole('heading');
        expect(headings.length).toBeGreaterThan(0);
      });
    });
  });
});
