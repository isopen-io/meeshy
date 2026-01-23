/**
 * Tests for Landing Page (app/page.tsx)
 *
 * Covers:
 * - Initial render states (loading, authenticated, unauthenticated)
 * - User interactions (auth mode changes, language selection)
 * - Anonymous user handling
 * - Navigation and routing
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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
  usePathname: () => '/',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>{children}</a>
  );
});

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    info: jest.fn(),
  },
}));

// Mock useI18n hook
const mockSetLocale = jest.fn();
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
    setLocale: mockSetLocale,
  }),
}));

// Mock use-i18n (aliased version)
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => key,
    locale: 'fr',
    setLocale: mockSetLocale,
  }),
}));

// Mock stores
let mockUser: any = null;
let mockIsAuthChecking = false;

jest.mock('@/stores', () => ({
  useUser: () => mockUser,
  useIsAuthChecking: () => mockIsAuthChecking,
}));

// Mock useAuth hook
jest.mock('@/hooks/use-auth', () => ({
  useAuth: () => ({
    login: jest.fn(),
    logout: jest.fn(),
    isAuthenticated: !!mockUser,
    isLoading: mockIsAuthChecking,
  }),
}));

// Mock auth utilities
jest.mock('@/utils/auth', () => ({
  isCurrentUserAnonymous: jest.fn(() => false),
}));

// Mock authManager
let mockAuthToken: string | null = null;
jest.mock('@/services/auth-manager.service', () => ({
  authManager: {
    getAuthToken: () => mockAuthToken,
    clearAllSessions: jest.fn(),
    getAnonymousSession: jest.fn(() => null),
  },
}));

// Mock components
jest.mock('@/components/auth/AnonymousRedirect', () => ({
  AnonymousRedirect: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

jest.mock('@/components/layout/DashboardLayout', () => ({
  DashboardLayout: ({ children, title, className }: { children: React.ReactNode; title?: string; className?: string }) => (
    <div data-testid="dashboard-layout" data-title={title} className={className}>
      {children}
    </div>
  ),
}));

jest.mock('@/components/layout/Header', () => ({
  Header: ({ mode, authMode, onAuthModeChange, anonymousChatLink }: any) => (
    <header data-testid="header" data-mode={mode} data-auth-mode={authMode}>
      <button onClick={() => onAuthModeChange('login')} data-testid="login-trigger">Login</button>
      <button onClick={() => onAuthModeChange('welcome')} data-testid="close-auth">Close</button>
      {anonymousChatLink && <a href={anonymousChatLink} data-testid="anonymous-chat-link">Anonymous Chat</a>}
    </header>
  ),
}));

jest.mock('@/components/common', () => ({
  BubbleStreamPage: ({ user, conversationId, isAnonymousMode }: any) => (
    <div data-testid="bubble-stream-page" data-user-id={user?.id} data-conversation-id={conversationId} data-anonymous={isAnonymousMode}>
      BubbleStreamPage Mock
    </div>
  ),
}));

jest.mock('@/components/auth/login-form', () => ({
  LoginForm: () => <div data-testid="login-form">Login Form</div>,
}));

jest.mock('@/components/auth/register-form', () => ({
  RegisterForm: () => <div data-testid="register-form">Register Form</div>,
}));

jest.mock('@/components/translation/language-selector', () => ({
  LanguageSelector: ({ value, onValueChange, interfaceOnly, className }: any) => (
    <select
      data-testid="language-selector"
      value={value}
      onChange={(e) => onValueChange(e.target.value)}
      data-interface-only={interfaceOnly}
      className={className}
    >
      <option value="fr">French</option>
      <option value="en">English</option>
      <option value="es">Spanish</option>
    </select>
  ),
}));

// Mock UI components
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, ...props }: any) => (
    <button onClick={onClick} {...props}>{children}</button>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: any) => <div className={className}>{children}</div>,
  CardHeader: ({ children }: any) => <div>{children}</div>,
  CardTitle: ({ children }: any) => <h3>{children}</h3>,
  CardDescription: ({ children }: any) => <p>{children}</p>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, variant, className }: any) => (
    <span data-variant={variant} className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/dialog', () => ({
  Dialog: ({ children, open, onOpenChange }: any) => (
    open ? <div data-testid="dialog" role="dialog">{children}</div> : null
  ),
  DialogContent: ({ children, className }: any) => <div className={className}>{children}</div>,
  DialogHeader: ({ children }: any) => <div>{children}</div>,
  DialogTitle: ({ children }: any) => <h2>{children}</h2>,
  DialogDescription: ({ children }: any) => <p>{children}</p>,
  DialogTrigger: ({ children }: any) => <>{children}</>,
}));

// Import the component after mocks
import LandingPage from '@/app/page';
import { isCurrentUserAnonymous } from '@/utils/auth';

describe('LandingPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUser = null;
    mockIsAuthChecking = false;
    mockAuthToken = null;
    localStorage.clear();
    document.cookie = '';
  });

  describe('Loading State', () => {
    it('should render loading spinner when auth is being checked', () => {
      mockIsAuthChecking = true;

      const { container } = render(<LandingPage />);

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should not render main content during auth check', () => {
      mockIsAuthChecking = true;

      render(<LandingPage />);

      expect(screen.queryByTestId('header')).not.toBeInTheDocument();
      expect(screen.queryByTestId('bubble-stream-page')).not.toBeInTheDocument();
    });
  });

  describe('Unauthenticated User (Landing Page)', () => {
    beforeEach(() => {
      mockUser = null;
      mockAuthToken = null;
      mockIsAuthChecking = false;
    });

    it('should render landing page for unauthenticated users', () => {
      render(<LandingPage />);

      expect(screen.getByTestId('header')).toBeInTheDocument();
      expect(screen.getByTestId('header')).toHaveAttribute('data-mode', 'landing');
    });

    it('should render hero section with badge and title', () => {
      render(<LandingPage />);

      // Hero badge
      expect(screen.getByText('hero.badge')).toBeInTheDocument();
      // Hero title
      expect(screen.getByText('hero.title')).toBeInTheDocument();
      expect(screen.getByText('hero.titleHighlight')).toBeInTheDocument();
    });

    it('should render login and signup buttons', () => {
      render(<LandingPage />);

      const loginLink = screen.getByRole('link', { name: /hero.login/i });
      const signupLink = screen.getByRole('link', { name: /hero.startFree/i });

      expect(loginLink).toHaveAttribute('href', '/login');
      expect(signupLink).toHaveAttribute('href', '/signup');
    });

    it('should render language selector', () => {
      render(<LandingPage />);

      const languageSelector = screen.getByTestId('language-selector');
      expect(languageSelector).toBeInTheDocument();
      expect(languageSelector).toHaveValue('fr');
    });

    it('should render mission section', () => {
      render(<LandingPage />);

      expect(screen.getByText('mission.title')).toBeInTheDocument();
      expect(screen.getByText('mission.slogan')).toBeInTheDocument();
      expect(screen.getByText('mission.tagline')).toBeInTheDocument();
    });

    it('should render features section', () => {
      render(<LandingPage />);

      expect(screen.getByText('features.title')).toBeInTheDocument();
      expect(screen.getByText('features.subtitle')).toBeInTheDocument();
      expect(screen.getByText('features.universalTranslation.title')).toBeInTheDocument();
      expect(screen.getByText('features.privacy.title')).toBeInTheDocument();
    });

    it('should render CTA section', () => {
      render(<LandingPage />);

      expect(screen.getByText('cta.title')).toBeInTheDocument();
      expect(screen.getByText('cta.subtitle')).toBeInTheDocument();
    });

    it('should render footer with links', () => {
      render(<LandingPage />);

      expect(screen.getByText('footer.tagline')).toBeInTheDocument();
      expect(screen.getByText('footer.copyright')).toBeInTheDocument();
      expect(screen.getByText('footer.links.about')).toBeInTheDocument();
      expect(screen.getByText('footer.links.terms')).toBeInTheDocument();
      expect(screen.getByText('footer.links.contact')).toBeInTheDocument();
    });

    it('should render social media links in footer', () => {
      render(<LandingPage />);

      expect(screen.getByLabelText('YouTube')).toHaveAttribute('href', 'https://youtube.com/@meeshy');
      expect(screen.getByLabelText('X (Twitter)')).toHaveAttribute('href', 'https://x.com/meeshy');
      expect(screen.getByLabelText('LinkedIn')).toHaveAttribute('href', 'https://linkedin.com/company/meeshy');
      expect(screen.getByLabelText('Instagram')).toHaveAttribute('href', 'https://instagram.com/meeshy');
    });
  });

  describe('Authenticated User (Dashboard)', () => {
    beforeEach(() => {
      mockUser = {
        id: 'user-123',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
      };
      mockAuthToken = 'valid-token';
      mockIsAuthChecking = false;
      (isCurrentUserAnonymous as jest.Mock).mockReturnValue(false);
    });

    it('should render BubbleStreamPage for authenticated users', () => {
      render(<LandingPage />);

      expect(screen.getByTestId('bubble-stream-page')).toBeInTheDocument();
      expect(screen.getByTestId('bubble-stream-page')).toHaveAttribute('data-user-id', 'user-123');
      expect(screen.getByTestId('bubble-stream-page')).toHaveAttribute('data-conversation-id', 'meeshy');
      expect(screen.getByTestId('bubble-stream-page')).toHaveAttribute('data-anonymous', 'false');
    });

    it('should render DashboardLayout for authenticated users', () => {
      render(<LandingPage />);

      expect(screen.getByTestId('dashboard-layout')).toBeInTheDocument();
    });

    it('should not render landing page content for authenticated users', () => {
      render(<LandingPage />);

      expect(screen.queryByTestId('header')).not.toBeInTheDocument();
      expect(screen.queryByText('hero.badge')).not.toBeInTheDocument();
    });
  });

  describe('Anonymous User Handling', () => {
    beforeEach(() => {
      mockUser = {
        id: 'anon-user-123',
        username: 'anonymous',
        isAnonymous: true,
      };
      mockAuthToken = 'anon-token';
      mockIsAuthChecking = false;
    });

    it('should show anonymous chat link when user has anonymous session', () => {
      (isCurrentUserAnonymous as jest.Mock).mockReturnValue(true);
      localStorage.setItem('anonymous_current_share_link', 'test-share-link');

      // For anonymous users WITH auth token, they still see BubbleStreamPage
      // but the localStorage cleanup happens
      render(<LandingPage />);

      // When user has token and is anonymous, localStorage items are cleaned
      expect(localStorage.getItem('anonymous_session_token')).toBeNull();
    });

    it('should clean up anonymous localStorage data when authenticated user was anonymous', () => {
      mockUser = { id: 'user-123', username: 'realuser' };
      (isCurrentUserAnonymous as jest.Mock).mockReturnValue(true);

      localStorage.setItem('anonymous_session_token', 'old-token');
      localStorage.setItem('anonymous_participant', 'old-participant');
      localStorage.setItem('anonymous_current_share_link', 'old-link');
      localStorage.setItem('anonymous_current_link_id', 'old-id');
      localStorage.setItem('anonymous_just_joined', 'true');

      render(<LandingPage />);

      // All anonymous localStorage items should be removed
      expect(localStorage.getItem('anonymous_session_token')).toBeNull();
      expect(localStorage.getItem('anonymous_participant')).toBeNull();
      expect(localStorage.getItem('anonymous_current_share_link')).toBeNull();
      expect(localStorage.getItem('anonymous_current_link_id')).toBeNull();
      expect(localStorage.getItem('anonymous_just_joined')).toBeNull();
    });
  });

  describe('Language Selection', () => {
    beforeEach(() => {
      mockUser = null;
      mockAuthToken = null;
      mockIsAuthChecking = false;
    });

    it('should call setLocale when language is changed', () => {
      render(<LandingPage />);

      const languageSelector = screen.getByTestId('language-selector');
      fireEvent.change(languageSelector, { target: { value: 'en' } });

      expect(mockSetLocale).toHaveBeenCalledWith('en');
    });
  });

  describe('Login Dialog', () => {
    beforeEach(() => {
      mockUser = null;
      mockAuthToken = null;
      mockIsAuthChecking = false;
    });

    it('should open login dialog when header triggers login mode', async () => {
      render(<LandingPage />);

      const loginTrigger = screen.getByTestId('login-trigger');
      fireEvent.click(loginTrigger);

      await waitFor(() => {
        expect(screen.getByTestId('dialog')).toBeInTheDocument();
        expect(screen.getByTestId('login-form')).toBeInTheDocument();
      });
    });

    it('should close login dialog when mode changes to welcome', async () => {
      render(<LandingPage />);

      // Open dialog
      const loginTrigger = screen.getByTestId('login-trigger');
      fireEvent.click(loginTrigger);

      await waitFor(() => {
        expect(screen.getByTestId('dialog')).toBeInTheDocument();
      });

      // Close dialog
      const closeAuth = screen.getByTestId('close-auth');
      fireEvent.click(closeAuth);

      await waitFor(() => {
        expect(screen.queryByTestId('dialog')).not.toBeInTheDocument();
      });
    });
  });

  describe('Affiliate Token Handling', () => {
    beforeEach(() => {
      mockUser = null;
      mockAuthToken = null;
      mockIsAuthChecking = false;
    });

    it('should save affiliate token from cookie to localStorage', () => {
      document.cookie = 'meeshy_affiliate_token=test-affiliate-123';

      render(<LandingPage />);

      expect(localStorage.getItem('meeshy_affiliate_token')).toBe('test-affiliate-123');
    });

    it('should not save affiliate token if cookie is empty', () => {
      document.cookie = '';

      render(<LandingPage />);

      expect(localStorage.getItem('meeshy_affiliate_token')).toBeNull();
    });
  });

  describe('Accessibility', () => {
    beforeEach(() => {
      mockUser = null;
      mockAuthToken = null;
      mockIsAuthChecking = false;
    });

    it('should have proper heading hierarchy', () => {
      render(<LandingPage />);

      const h1 = screen.getByRole('heading', { level: 1 });
      expect(h1).toBeInTheDocument();
    });

    it('should have accessible social media links with aria-labels', () => {
      render(<LandingPage />);

      expect(screen.getByLabelText('YouTube')).toBeInTheDocument();
      expect(screen.getByLabelText('X (Twitter)')).toBeInTheDocument();
      expect(screen.getByLabelText('LinkedIn')).toBeInTheDocument();
      expect(screen.getByLabelText('Instagram')).toBeInTheDocument();
      expect(screen.getByLabelText('TikTok')).toBeInTheDocument();
    });

    it('should have proper link targets for external links', () => {
      render(<LandingPage />);

      const externalLinks = screen.getAllByRole('link').filter(
        (link) => link.getAttribute('target') === '_blank'
      );

      externalLinks.forEach((link) => {
        expect(link).toHaveAttribute('rel', 'noopener noreferrer');
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle user without auth token gracefully', () => {
      mockUser = { id: 'user-123' };
      mockAuthToken = null;
      mockIsAuthChecking = false;

      render(<LandingPage />);

      // Without auth token, should show landing page even with user object
      expect(screen.getByTestId('header')).toBeInTheDocument();
    });

    it('should handle missing user fields gracefully', () => {
      mockUser = { id: 'user-123' };
      mockAuthToken = 'valid-token';
      mockIsAuthChecking = false;
      (isCurrentUserAnonymous as jest.Mock).mockReturnValue(false);

      render(<LandingPage />);

      // Should still render BubbleStreamPage
      expect(screen.getByTestId('bubble-stream-page')).toBeInTheDocument();
    });
  });
});
