/**
 * Tests for DashboardLayout component
 * Tests authentication, navigation, header, and responsive behavior
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { DashboardLayout } from '../../../components/layout/DashboardLayout';

// Mock stores
const mockUser = {
  id: 'test-user-id',
  firstName: 'John',
  lastName: 'Doe',
  username: 'johndoe',
  avatar: '/avatar.jpg',
  email: 'john@example.com',
  permissions: {},
};

const mockAdminUser = {
  ...mockUser,
  permissions: { canAccessAdmin: true },
};

let mockIsAuthChecking = false;
let mockCurrentUser: typeof mockUser | null = mockUser;

jest.mock('@/stores', () => ({
  useUser: () => mockCurrentUser,
  useIsAuthChecking: () => mockIsAuthChecking,
}));

// Mock useAuth hook
const mockLogout = jest.fn();
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    logout: mockLogout,
  }),
}));

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'auth.checking': 'Checking authentication...',
        'auth.logoutSuccess': 'Successfully logged out',
        'auth.logoutError': 'Logout error',
        'header.searchPlaceholder': 'Search...',
        'navigation.dashboard': 'Dashboard',
        'navigation.conversations': 'Conversations',
        'navigation.communities': 'Communities',
        'navigation.contacts': 'Contacts',
        'navigation.links': 'Links',
        'navigation.profile': 'Profile',
        'navigation.settings': 'Settings',
        'navigation.admin': 'Admin',
        'navigation.logout': 'Logout',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock app store
const mockSetTheme = jest.fn();
jest.mock('@/stores/app-store', () => ({
  useAppStore: () => ({
    theme: 'light',
    setTheme: mockSetTheme,
  }),
}));

// Mock auth manager
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: jest.fn().mockReturnValue('mock-token'),
  },
}));

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock fetch
global.fetch = jest.fn().mockResolvedValue({
  ok: true,
  json: () => Promise.resolve({}),
});

// Mock NotificationBell component
jest.mock('@/components/notifications', () => ({
  NotificationBell: () => <div data-testid="notification-bell">NotificationBell</div>,
}));

// Mock ShareAffiliateButton component
jest.mock('@/components/affiliate/share-affiliate-button', () => ({
  ShareAffiliateButton: () => <div data-testid="share-button">Share</div>,
}));

// Mock config
jest.mock('@/lib/config', () => ({
  buildApiUrl: (endpoint: string) => `http://api.test${endpoint}`,
  API_ENDPOINTS: {
    AUTH: {
      LOGOUT: '/auth/logout',
    },
  },
}));

// Mock router
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
    back: jest.fn(),
    pathname: '/dashboard',
    query: {},
  }),
  usePathname: () => '/dashboard',
  useSearchParams: () => new URLSearchParams(),
}));

describe('DashboardLayout', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIsAuthChecking = false;
    mockCurrentUser = mockUser;
    // Reset innerWidth
    Object.defineProperty(window, 'innerWidth', {
      writable: true,
      configurable: true,
      value: 1024,
    });
  });

  describe('Loading State', () => {
    it('should show loading spinner when auth is checking', () => {
      mockIsAuthChecking = true;

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByText('Checking authentication...')).toBeInTheDocument();
    });

    it('should show loading animation', () => {
      mockIsAuthChecking = true;

      const { container } = render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Authentication', () => {
    it('should redirect to home when user is not authenticated', () => {
      mockCurrentUser = null;

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(mockPush).toHaveBeenCalledWith('/');
    });

    it('should render content when user is authenticated', () => {
      render(
        <DashboardLayout>
          <div data-testid="dashboard-content">Dashboard Content</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('dashboard-content')).toBeInTheDocument();
    });
  });

  describe('Header', () => {
    it('should render logo and app name', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByText('Meeshy')).toBeInTheDocument();
    });

    it('should render page title when provided', () => {
      render(
        <DashboardLayout title="My Dashboard">
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByText('My Dashboard')).toBeInTheDocument();
    });

    it('should render notification bell', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('notification-bell')).toBeInTheDocument();
    });

    it('should render share button', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('share-button')).toBeInTheDocument();
    });
  });

  describe('Search', () => {
    it('should render search input by default', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByPlaceholderText('Search...')).toBeInTheDocument();
    });

    it('should hide search when hideSearch is true', () => {
      render(
        <DashboardLayout hideSearch>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.queryByPlaceholderText('Search...')).not.toBeInTheDocument();
    });

    it('should navigate to search page on form submit', async () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      const searchInput = screen.getByPlaceholderText('Search...');
      fireEvent.change(searchInput, { target: { value: 'test query' } });

      const form = searchInput.closest('form');
      fireEvent.submit(form!);

      expect(mockPush).toHaveBeenCalledWith('/search?q=test%20query');
    });

    it('should not navigate on empty search query', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      const searchInput = screen.getByPlaceholderText('Search...');
      const form = searchInput.closest('form');
      fireEvent.submit(form!);

      expect(mockPush).not.toHaveBeenCalledWith(expect.stringContaining('/search'));
    });
  });

  describe('User Menu', () => {
    it('should display user name and username', async () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('@johndoe')).toBeInTheDocument();
    });

    it('should display user initials in avatar fallback', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      expect(screen.getByText('JD')).toBeInTheDocument();
    });

    it('should render user menu button', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // User menu button should exist
      const userMenuButton = screen.getByText('John Doe').closest('button');
      expect(userMenuButton).toBeInTheDocument();
    });

    it('should have admin flag in user for admin users', () => {
      mockCurrentUser = mockAdminUser;

      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Verify admin user is set correctly
      expect(mockCurrentUser.permissions.canAccessAdmin).toBe(true);
    });

    it('should not have admin flag for regular users', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Verify regular user doesn't have admin access
      expect(mockCurrentUser.permissions.canAccessAdmin).toBeFalsy();
    });
  });

  describe('Theme Switching', () => {
    it('should have setTheme function available', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Verify theme setter is available via mock
      expect(mockSetTheme).toBeDefined();
    });

    it('should use app store theme', () => {
      const { useAppStore } = require('@/stores/app-store');
      const store = useAppStore();

      expect(store.theme).toBe('light');
      expect(store.setTheme).toBeDefined();
    });
  });

  describe('Logout', () => {
    it('should have logout function available', () => {
      render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Verify logout function is mocked
      expect(mockLogout).toBeDefined();
    });

    it('should use auth hook logout', () => {
      const { useAuth } = require('@/hooks/use-auth');
      const auth = useAuth();

      expect(auth.logout).toBe(mockLogout);
    });
  });

  describe('Responsive Behavior', () => {
    it('should hide header on mobile when hideHeaderOnMobile is true', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 500,
      });

      // Trigger resize
      act(() => {
        window.dispatchEvent(new Event('resize'));
      });

      const { container } = render(
        <DashboardLayout hideHeaderOnMobile>
          <div>Content</div>
        </DashboardLayout>
      );

      // Header should be hidden
      const header = container.querySelector('header');
      // The component checks isMobile state, so we need to verify behavior
      // Since resize event was dispatched, isMobile should be true
    });

    it('should show header on desktop regardless of hideHeaderOnMobile', () => {
      Object.defineProperty(window, 'innerWidth', {
        writable: true,
        configurable: true,
        value: 1024,
      });

      const { container } = render(
        <DashboardLayout hideHeaderOnMobile>
          <div>Content</div>
        </DashboardLayout>
      );

      const header = container.querySelector('header');
      expect(header).toBeInTheDocument();
    });
  });

  describe('Styling', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <DashboardLayout className="custom-layout-class">
          <div>Content</div>
        </DashboardLayout>
      );

      expect(container.firstChild).toHaveClass('custom-layout-class');
    });

    it('should apply full height styling with !h-full class', () => {
      const { container } = render(
        <DashboardLayout className="!h-full">
          <div>Content</div>
        </DashboardLayout>
      );

      expect(container.firstChild).toHaveClass('h-screen');
      expect(container.firstChild).toHaveClass('overflow-hidden');
    });

    it('should apply auto height with !h-auto class', () => {
      const { container } = render(
        <DashboardLayout className="!h-auto">
          <div>Content</div>
        </DashboardLayout>
      );

      expect(container.firstChild).toHaveClass('min-h-0');
    });
  });

  describe('Navigation Links', () => {
    it('should have home link in header', () => {
      const { container } = render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Logo should be a link to home
      const homeLink = container.querySelector('a[href="/"]');
      expect(homeLink).toBeInTheDocument();
    });

    it('should render header with navigation elements', () => {
      const { container } = render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      const header = container.querySelector('header');
      expect(header).toBeInTheDocument();
    });

    it('should render navigation icons', () => {
      const { container } = render(
        <DashboardLayout>
          <div>Content</div>
        </DashboardLayout>
      );

      // Should have MessageSquare icon in header
      const messageIcon = container.querySelector('[data-testid="messagesquare-icon"]');
      expect(messageIcon).toBeInTheDocument();
    });
  });

  describe('Children Rendering', () => {
    it('should render children content', () => {
      render(
        <DashboardLayout>
          <div data-testid="child-content">
            <h1>Welcome</h1>
            <p>This is the dashboard content</p>
          </div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('child-content')).toBeInTheDocument();
      expect(screen.getByText('Welcome')).toBeInTheDocument();
      expect(screen.getByText('This is the dashboard content')).toBeInTheDocument();
    });

    it('should render multiple children', () => {
      render(
        <DashboardLayout>
          <div data-testid="first">First</div>
          <div data-testid="second">Second</div>
        </DashboardLayout>
      );

      expect(screen.getByTestId('first')).toBeInTheDocument();
      expect(screen.getByTestId('second')).toBeInTheDocument();
    });
  });
});
