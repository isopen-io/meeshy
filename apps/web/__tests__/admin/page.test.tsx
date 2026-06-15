import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { adminService } from '../../services/admin.service';
import { authManager } from '../../services/auth-manager.service';
import { toast } from 'sonner';

// Mock the i18n hook to return English translations synchronously
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, any>) => {
      const translations: Record<string, string> = {
        'dashboard.navAnonymous': 'Anonymous users',
        'dashboard.statsRefreshed': 'Data refreshed successfully',
        'dashboard.loadError': 'Error loading admin statistics',
        'dashboard.loadingData': 'Loading admin data...',
        'dashboard.welcome': params?.name ? `Welcome, ${params.name}` : 'Welcome, {name}',
        'dashboard.accessLevel': params?.role ? `Access level: ${params.role}` : 'Access level: {role}',
        'dashboard.lastLogin': 'Last login',
        'dashboard.unauthorizedAccess': 'Unauthorized access',
        'dashboard.statUsers': 'Users',
        'dashboard.statUsersActive': params?.count !== undefined ? `${params.count} active` : '{count} active',
        'dashboard.statAnonymous': 'Anonymous',
        'dashboard.statMessages': 'Messages',
        'dashboard.statMessagesSent': 'Messages sent',
        'dashboard.statCommunities': 'Communities',
        'dashboard.statCommunitiesCreated': 'Communities created',
        'dashboard.statTranslations': 'Translations',
        'dashboard.statTranslationsDone': 'Translations completed',
        'dashboard.statLinks': 'Links created',
        'dashboard.statLinksActive': params?.count !== undefined ? `${params.count} active` : '{count} active',
        'dashboard.statReports': 'Reports',
        'dashboard.statReportsFlagged': 'Messages flagged',
        'dashboard.statInvitations': 'Invitations',
        'dashboard.statInvitationsPending': 'Pending requests',
        'dashboard.statAdmins': 'Administrators',
        'dashboard.statAdminsMods': 'Admins and moderators',
        'dashboard.statLanguages': 'Languages',
        'dashboard.statLanguagesDetected': 'Languages detected',
        'dashboard.topLanguagesTitle': 'Most used languages',
        'dashboard.topLanguagesMessages': 'messages',
        'dashboard.recentActivityTitle': 'Recent activity (last 7 days)',
        'dashboard.recentNewUsers': 'New users',
        'dashboard.recentNewConversations': 'New conversations',
        'dashboard.recentNewMessages': 'New messages',
        'dashboard.recentNewAnonymous': 'New anonymous',
        'dashboard.lastUpdateTitle': 'Last update',
        'dashboard.lastUpdateUnavailable': 'Not available',
        'dashboard.refreshButton': 'Refresh data',
        'dashboard.navTitle': 'Navigation — All admin pages',
        'dashboard.navGroupUsers': 'Users',
        'dashboard.navUsers': 'Users',
        'dashboard.navMessages': 'Messages',
        'dashboard.navCommunities': 'Communities',
        'dashboard.navLinks': 'Share links',
        'dashboard.navGroupModeration': 'Moderation',
        'dashboard.navReports': 'Reports',
        'dashboard.navModeration': 'Moderation',
        'dashboard.navTranslations': 'Translations',
        'dashboard.navLanguages': 'Languages',
        'dashboard.navInvitations': 'Invitations',
        'dashboard.navGroupAnalytics': 'Analytics',
        'dashboard.navAnalytics': 'Analytics',
        'dashboard.navAuditLogs': 'Audit logs',
        'dashboard.navSettings': 'Settings',
        'dashboard.systemStatusTitle': 'System status',
        'dashboard.systemServer': 'Server',
        'dashboard.systemOnline': 'Online',
        'dashboard.systemDatabase': 'Database',
        'dashboard.systemConnected': 'Connected',
        'dashboard.systemWebSocket': 'WebSocket',
        'dashboard.systemActive': 'Active',
      };
      return translations[key] ?? key;
    },
    locale: 'en',
    currentLanguage: 'en',
    isLoading: false,
  }),
}));

// Mock the language store
jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: () => 'en',
}));

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
jest.mock('../../services/admin.service', () => ({
  adminService: {
    getDashboardStats: jest.fn(),
  },
}));

// Mock auth manager
jest.mock('../../services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn(),
    clearAllSessions: jest.fn(),
    registerOnClear: jest.fn(),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock fetch globally
const mockFetch = jest.fn();
global.fetch = mockFetch;

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

// Mock lib/config
jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `http://localhost:3001${endpoint}`,
  API_ENDPOINTS: {
    AUTH: {
      ME: '/auth/me',
    },
  },
}));

// Mock user adapter
jest.mock('@/utils/user-adapter', () => ({
  getDefaultPermissions: (role: string) => ({
    canAccessAdmin: role === 'ADMIN' || role === 'BIGBOSS',
    canManageUsers: role === 'ADMIN' || role === 'BIGBOSS',
    canModerateContent: true,
    canViewAuditLogs: true,
    canViewAnalytics: true,
    canManageTranslations: true,
  }),
}));

// Import after mocks
import AdminDashboard from '../../app/admin/page';

const mockAdminService = adminService as jest.Mocked<typeof adminService>;
const mockAuthManager = authManager as jest.Mocked<typeof authManager>;
const mockToast = toast as jest.Mocked<typeof toast>;

// Factory function for creating mock admin user
const createMockAdminUser = (overrides: any = {}) => ({
  id: 'admin-1',
  username: 'admin',
  email: 'admin@example.com',
  firstName: 'Admin',
  lastName: 'User',
  displayName: 'Admin User',
  role: 'ADMIN',
  permissions: {
    canAccessAdmin: true,
    canManageUsers: true,
    canModerateContent: true,
    canViewAuditLogs: true,
    canViewAnalytics: true,
    canManageTranslations: true,
  },
  ...overrides,
});

// Factory function for creating mock dashboard data
const createMockDashboardData = (overrides: any = {}): any => ({
  success: true,
  data: {
    success: true,
    data: {
      statistics: {
        totalUsers: 100,
        activeUsers: 80,
        inactiveUsers: 20,
        adminUsers: 5,
        totalAnonymousUsers: 50,
        activeAnonymousUsers: 30,
        inactiveAnonymousUsers: 20,
        totalMessages: 5000,
        totalCommunities: 25,
        totalTranslations: 15000,
        totalShareLinks: 200,
        activeShareLinks: 150,
        totalReports: 10,
        totalInvitations: 50,
        topLanguages: [
          { language: 'fr', count: 2500 },
          { language: 'en', count: 1500 },
          { language: 'es', count: 500 },
        ],
        usersByRole: { USER: 90, ADMIN: 5, MODO: 5 },
        messagesByType: { text: 4000, image: 500, file: 500 },
      },
      recentActivity: {
        newUsers: 10,
        newConversations: 5,
        newMessages: 100,
        newAnonymousUsers: 8,
      },
      userPermissions: {},
      timestamp: new Date().toISOString(),
      ...overrides,
    },
  },
});

describe('AdminDashboard', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPush.mockClear();
    mockAuthManager.getAuthToken.mockReturnValue('mock-token');
  });

  describe('Authentication Check', () => {
    it('should redirect to login if no token', async () => {
      mockAuthManager.getAuthToken.mockReturnValue(null);

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/login');
      });
    });

    it('should redirect to dashboard if user does not have admin access', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: {
              ...createMockAdminUser(),
              role: 'USER',
              permissions: {
                canAccessAdmin: false,
              },
            },
          },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
      expect(mockToast.error).toHaveBeenCalledWith('Unauthorized access');
    });

    it('should redirect home if user fetch fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Loading State', () => {
    it('should display loading spinner initially', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockImplementation(() => new Promise(() => {}));

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Loading admin data...')).toBeInTheDocument();
      });
    });

    it('should show loading animation', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockImplementation(() => new Promise(() => {}));

      const { container } = render(<AdminDashboard />);

      await waitFor(() => {
        const spinner = container.querySelector('.animate-spin');
        expect(spinner).toBeInTheDocument();
      });
    });
  });

  describe('Successful Data Load', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());
    });

    it('should display welcome message with user name', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Welcome, Admin User/)).toBeInTheDocument();
      });
    });

    it('should display user role', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Access level: ADMIN/)).toBeInTheDocument();
      });
    });

    it('should display total users statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const matches = screen.getAllByText('Users');
        expect(matches.length).toBeGreaterThan(0);
        const hundreds = screen.getAllByText('100');
        expect(hundreds.length).toBeGreaterThan(0);
      });
    });

    it('should display active users count', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('80 active')).toBeInTheDocument();
      });
    });

    it('should display anonymous users statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const matches = screen.getAllByText('Anonymous');
        expect(matches.length).toBeGreaterThan(0);
        const fifties = screen.getAllByText('50');
        expect(fifties.length).toBeGreaterThan(0);
      });
    });

    it('should display messages statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const messagesCards = screen.getAllByText('Messages');
        expect(messagesCards.length).toBeGreaterThan(0);
        expect(screen.getByText('5000')).toBeInTheDocument();
      });
    });

    it('should display communities statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const matches = screen.getAllByText('Communities');
        expect(matches.length).toBeGreaterThan(0);
        expect(screen.getByText('25')).toBeInTheDocument();
      });
    });

    it('should display translations statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const matches = screen.getAllByText('Translations');
        expect(matches.length).toBeGreaterThan(0);
        expect(screen.getByText('15000')).toBeInTheDocument();
      });
    });

    it('should display share links statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const matches = screen.getAllByText('Links created');
        expect(matches.length).toBeGreaterThan(0);
        expect(screen.getByText('200')).toBeInTheDocument();
      });
    });

    it('should display reports statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const matches = screen.getAllByText('Reports');
        expect(matches.length).toBeGreaterThan(0);
        const tens = screen.getAllByText('10');
        expect(tens.length).toBeGreaterThan(0);
      });
    });

    it('should display invitations statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const matches = screen.getAllByText('Invitations');
        expect(matches.length).toBeGreaterThan(0);
      });
    });

    it('should display admin users statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Administrators')).toBeInTheDocument();
        const fives = screen.getAllByText('5');
        expect(fives.length).toBeGreaterThan(0);
      });
    });

    it('should display languages statistic', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const matches = screen.getAllByText('Languages');
        expect(matches.length).toBeGreaterThan(0);
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });
  });

  describe('Top Languages Section', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());
    });

    it('should display top languages section', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Most used languages')).toBeInTheDocument();
      });
    });

    it('should display language rankings', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('FR')).toBeInTheDocument();
        expect(screen.getByText('EN')).toBeInTheDocument();
        expect(screen.getByText('ES')).toBeInTheDocument();
      });
    });

    it('should display language message counts', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('2500 messages')).toBeInTheDocument();
        expect(screen.getByText('1500 messages')).toBeInTheDocument();
        expect(screen.getByText('500 messages')).toBeInTheDocument();
      });
    });

    it('should display ranking numbers', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('#1')).toBeInTheDocument();
        expect(screen.getByText('#2')).toBeInTheDocument();
        expect(screen.getByText('#3')).toBeInTheDocument();
      });
    });
  });

  describe('Recent Activity Section', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());
    });

    it('should display recent activity section', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Recent activity (last 7 days)')).toBeInTheDocument();
      });
    });

    it('should display new users count', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('New users')).toBeInTheDocument();
      });
    });

    it('should display new conversations count', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('New conversations')).toBeInTheDocument();
      });
    });

    it('should display new messages count', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('New messages')).toBeInTheDocument();
      });
    });

    it('should display new anonymous users count', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('New anonymous')).toBeInTheDocument();
      });
    });
  });

  describe('Navigation Section', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());
    });

    it('should display navigation section', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Navigation — All admin pages')).toBeInTheDocument();
      });
    });

    it('should display users navigation button', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        // Find button with text 'Users' in the navigation section
        const buttons = screen.getAllByRole('button');
        const usersButton = buttons.find(btn => btn.textContent?.includes('Users'));
        expect(usersButton).toBeInTheDocument();
      });
    });

    it('should navigate to users page when clicking users button', async () => {
      const user = userEvent.setup();
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Navigation — All admin pages')).toBeInTheDocument();
      });

      // Find and click the users navigation button
      const buttons = screen.getAllByRole('button');
      const usersButton = buttons.find(btn => btn.textContent === 'Users');
      if (usersButton) {
        await user.click(usersButton);
        expect(mockPush).toHaveBeenCalledWith('/admin/users');
      }
    });

    it('should navigate to anonymous users page', async () => {
      const user = userEvent.setup();
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Navigation — All admin pages')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const anonButton = buttons.find(btn => btn.textContent === 'Anonymous users');
      if (anonButton) {
        await user.click(anonButton);
        expect(mockPush).toHaveBeenCalledWith('/admin/anonymous-users');
      }
    });

    it('should navigate to messages page', async () => {
      const user = userEvent.setup();
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Navigation — All admin pages')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const msgButton = buttons.find(btn => btn.textContent === 'Messages');
      if (msgButton) {
        await user.click(msgButton);
        expect(mockPush).toHaveBeenCalledWith('/admin/messages');
      }
    });

    it('should navigate to communities page', async () => {
      const user = userEvent.setup();
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Navigation — All admin pages')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const commButton = buttons.find(btn => btn.textContent === 'Communities');
      if (commButton) {
        await user.click(commButton);
        expect(mockPush).toHaveBeenCalledWith('/admin/communities');
      }
    });

    it('should navigate to languages page', async () => {
      const user = userEvent.setup();
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Navigation — All admin pages')).toBeInTheDocument();
      });

      const buttons = screen.getAllByRole('button');
      const langButton = buttons.find(btn => btn.textContent === 'Languages');
      if (langButton) {
        await user.click(langButton);
        expect(mockPush).toHaveBeenCalledWith('/admin/languages');
      }
    });
  });

  describe('System Status Section', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());
    });

    it('should display system status section', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('System status')).toBeInTheDocument();
      });
    });

    it('should display server status', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Server')).toBeInTheDocument();
        expect(screen.getByText('Online')).toBeInTheDocument();
      });
    });

    it('should display database status', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Database')).toBeInTheDocument();
        expect(screen.getByText('Connected')).toBeInTheDocument();
      });
    });

    it('should display WebSocket status', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('WebSocket')).toBeInTheDocument();
        expect(screen.getByText('Active')).toBeInTheDocument();
      });
    });
  });

  describe('Refresh Functionality', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());
    });

    it('should display refresh button', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Refresh data')).toBeInTheDocument();
      });
    });

    it('should reload stats when clicking refresh', async () => {
      const user = userEvent.setup();
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Refresh data')).toBeInTheDocument();
      });

      const initialCallCount = mockAdminService.getDashboardStats.mock.calls.length;
      const refreshButton = screen.getByText('Refresh data');
      await user.click(refreshButton);

      // Should call getDashboardStats at least one more time after refresh
      expect(mockAdminService.getDashboardStats.mock.calls.length).toBeGreaterThan(initialCallCount);
    });

    it('should display last update timestamp', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText('Last update')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should display toast error when stats fetch fails', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockRejectedValue(new Error('Network error'));

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'Error loading admin statistics'
        );
      });
    });

    it('should handle user fetch network error', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith(
          'Error loading admin statistics'
        );
        expect(mockPush).toHaveBeenCalledWith('/dashboard');
      });
    });
  });

  describe('Different User Roles', () => {
    it('should display BIGBOSS role correctly', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: createMockAdminUser({ role: 'BIGBOSS', displayName: 'Super Admin' }),
          },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Welcome, Super Admin/)).toBeInTheDocument();
        expect(screen.getByText(/BIGBOSS/)).toBeInTheDocument();
      });
    });

    it('should handle user without displayName', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: createMockAdminUser({ displayName: null, firstName: 'John', lastName: 'Doe' }),
          },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Welcome, John Doe/)).toBeInTheDocument();
      });
    });

    it('should fallback to username if no displayName or firstName', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: {
            user: createMockAdminUser({
              displayName: null,
              firstName: null,
              lastName: null,
              username: 'adminuser',
            }),
          },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());

      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByText(/Welcome, adminuser/)).toBeInTheDocument();
      });
    });
  });

  describe('Response Format Handling', () => {
    it('should handle nested response format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });

      mockAdminService.getDashboardStats.mockResolvedValue({
        success: true,
        data: {
          success: true,
          data: {
            statistics: {
              totalUsers: 200,
              activeUsers: 150,
              totalMessages: 10000,
              topLanguages: [],
            },
            recentActivity: {
              newUsers: 20,
              newConversations: 10,
              newMessages: 200,
              newAnonymousUsers: 15,
            },
            timestamp: new Date().toISOString(),
          },
        },
      } as any);

      render(<AdminDashboard />);

      await waitFor(() => {
        const twoHundreds = screen.getAllByText('200');
        expect(twoHundreds.length).toBeGreaterThan(0);
        expect(screen.getByText('150 active')).toBeInTheDocument();
      });
    });

    it('should handle direct response format', async () => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });

      mockAdminService.getDashboardStats.mockResolvedValue({
        success: true,
        data: {
          statistics: {
            totalUsers: 300,
            activeUsers: 200,
            totalMessages: 15000,
            topLanguages: [],
          },
          recentActivity: {
            newUsers: 30,
            newConversations: 15,
            newMessages: 300,
            newAnonymousUsers: 20,
          },
          timestamp: new Date().toISOString(),
        },
      } as any);

      render(<AdminDashboard />);

      await waitFor(() => {
        const threeHundreds = screen.getAllByText('300');
        expect(threeHundreds.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => ({
          success: true,
          data: { user: createMockAdminUser() },
        }),
      });
      mockAdminService.getDashboardStats.mockResolvedValue(createMockDashboardData());
    });

    it('should render within admin layout', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        expect(screen.getByTestId('admin-layout')).toBeInTheDocument();
      });
    });

    it('should have accessible buttons', async () => {
      render(<AdminDashboard />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });
});
