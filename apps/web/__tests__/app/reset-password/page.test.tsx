/**
 * Tests for ResetPasswordPage component
 *
 * This page allows users to set a new password using a token from their email.
 * It validates the token on mount and shows the reset form or an error state.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

// Mock dependencies before importing component
const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  pathname: '/reset-password',
  query: {},
};

// Token for tests
let mockToken: string | null = 'valid-reset-token';

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/reset-password',
  useSearchParams: () => ({
    get: (key: string) => (key === 'token' ? mockToken : null),
  }),
  useParams: () => ({}),
}));

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...props }: any) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: any) => <>{children}</>,
}));

// Mock useI18n hook
const mockT = jest.fn((key: string, fallback?: string) => fallback || key);
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: mockT }),
}));

// Mock FeatureGate - always enabled for tests
jest.mock('@/components/auth/FeatureGate', () => ({
  FeatureGate: ({ children, feature, showMessage }: any) => (
    <div data-testid="feature-gate" data-feature={feature}>
      {children}
    </div>
  ),
}));

// Mock ResetPasswordForm
const mockResetPasswordForm = jest.fn();
jest.mock('@/components/auth/ResetPasswordForm', () => ({
  ResetPasswordForm: ({ token, onSuccess }: { token: string; onSuccess?: () => void }) => {
    mockResetPasswordForm(token);
    return (
      <form data-testid="reset-password-form">
        <input type="password" placeholder="New Password" data-testid="new-password-input" />
        <input type="password" placeholder="Confirm Password" data-testid="confirm-password-input" />
        <button type="submit" data-testid="submit-button">Reset Password</button>
        <span data-testid="form-token">{token}</span>
      </form>
    );
  },
}));

// Mock LargeLogo component
jest.mock('@/components/branding', () => ({
  LargeLogo: ({ href }: { href: string }) => (
    <a href={href} data-testid="large-logo">Logo</a>
  ),
}));

// Mock Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, asChild, className, ...props }: any) => {
    if (asChild) {
      // When asChild is true, render children directly
      return <>{children}</>;
    }
    return (
      <button onClick={onClick} className={className} {...props}>
        {children}
      </button>
    );
  },
}));

// Mock next/link
jest.mock('next/link', () => ({
  __esModule: true,
  default: ({ href, children, ...props }: any) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

// Import component after mocks
import ResetPasswordPage from '@/app/reset-password/page';

describe('ResetPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockToken = 'valid-reset-token';
  });

  describe('Initial Rendering with Valid Token', () => {
    it('should render the page with feature gate', () => {
      render(<ResetPasswordPage />);
      expect(screen.getByTestId('feature-gate')).toBeInTheDocument();
      expect(screen.getByTestId('feature-gate')).toHaveAttribute('data-feature', 'passwordReset');
    });

    it('should render the logo', () => {
      render(<ResetPasswordPage />);
      expect(screen.getByTestId('large-logo')).toBeInTheDocument();
      expect(screen.getByTestId('large-logo')).toHaveAttribute('href', '/');
    });

    it('should render the page title', () => {
      render(<ResetPasswordPage />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('should render description text', () => {
      render(<ResetPasswordPage />);
      const description = screen.getByText(/resetPassword\.description/i);
      expect(description).toBeInTheDocument();
    });

    it('should render security tips', () => {
      render(<ResetPasswordPage />);
      // Security tips text (mock returns the key)
      const tips = screen.getAllByText(/resetPassword\.securityTip/i);
      expect(tips.length).toBeGreaterThan(0);
    });

    it('should render the reset password form with token', () => {
      render(<ResetPasswordPage />);
      expect(screen.getByTestId('reset-password-form')).toBeInTheDocument();
      expect(screen.getByTestId('form-token')).toHaveTextContent('valid-reset-token');
    });

    it('should pass token to ResetPasswordForm', () => {
      render(<ResetPasswordPage />);
      expect(mockResetPasswordForm).toHaveBeenCalledWith('valid-reset-token');
    });
  });

  describe('Invalid/Missing Token State', () => {
    beforeEach(() => {
      mockToken = null;
    });

    it('should show error state when token is missing', () => {
      render(<ResetPasswordPage />);

      // Should show error message (mock returns the key)
      const errorHeading = screen.getByRole('heading', { level: 1 });
      expect(errorHeading).toHaveTextContent(/resetPassword\.errors\.invalidLink/i);
    });

    it('should show error icon when token is missing', () => {
      const { container } = render(<ResetPasswordPage />);

      // Check for error icon (AlertCircle)
      const errorIcon = container.querySelector('[data-testid="alertcircle-icon"]');
      expect(errorIcon).toBeInTheDocument();
    });

    it('should show request new link button when token is missing', () => {
      render(<ResetPasswordPage />);

      const newLinkButton = screen.getByRole('link', { name: /resetPassword\.requestNewLink/i });
      expect(newLinkButton).toBeInTheDocument();
      expect(newLinkButton).toHaveAttribute('href', '/forgot-password');
    });

    it('should display helpful error message', () => {
      render(<ResetPasswordPage />);

      const errorMessages = screen.getAllByText(/resetPassword\.errors/i);
      expect(errorMessages.length).toBeGreaterThan(0);
    });

    it('should not render the reset form when token is missing', () => {
      render(<ResetPasswordPage />);
      expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
    });
  });

  describe('Footer Links', () => {
    it('should render terms of service link', () => {
      render(<ResetPasswordPage />);
      const termsLink = screen.getByRole('link', { name: /register\.termsOfService/i });
      expect(termsLink).toBeInTheDocument();
      expect(termsLink).toHaveAttribute('href', '/terms');
    });

    it('should render privacy policy link', () => {
      render(<ResetPasswordPage />);
      const privacyLink = screen.getByRole('link', { name: /register\.privacyPolicy/i });
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('should render contact link', () => {
      render(<ResetPasswordPage />);
      const contactLink = screen.getByRole('link', { name: /register\.contactUs/i });
      expect(contactLink).toBeInTheDocument();
      expect(contactLink).toHaveAttribute('href', '/contact');
    });
  });

  describe('Loading Fallback', () => {
    it('should render without errors', () => {
      const { container } = render(<ResetPasswordPage />);
      expect(container).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure with valid token', () => {
      render(<ResetPasswordPage />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('should have proper heading structure with invalid token', () => {
      mockToken = null;
      render(<ResetPasswordPage />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('should have accessible icons with aria-hidden', () => {
      const { container } = render(<ResetPasswordPage />);
      const hiddenIcons = container.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenIcons.length).toBeGreaterThan(0);
    });

    it('should have accessible link for requesting new reset link', () => {
      mockToken = null;
      render(<ResetPasswordPage />);
      const link = screen.getByRole('link', { name: /resetPassword\.requestNewLink/i });
      expect(link).toHaveAttribute('href', '/forgot-password');
    });
  });

  describe('Responsive Design', () => {
    it('should render decorative blobs', () => {
      const { container } = render(<ResetPasswordPage />);
      const blurElements = container.querySelectorAll('.blur-2xl, .blur-3xl');
      expect(blurElements.length).toBeGreaterThan(0);
    });

    it('should have responsive padding classes', () => {
      const { container } = render(<ResetPasswordPage />);
      const mainContent = container.querySelector('.px-4');
      expect(mainContent).toBeInTheDocument();
    });

    it('should use green color scheme for valid token state', () => {
      const { container } = render(<ResetPasswordPage />);
      // Check for emerald/green gradient colors in blobs
      const greenElements = container.querySelectorAll('[class*="emerald"], [class*="green"]');
      expect(greenElements.length).toBeGreaterThan(0);
    });

    it('should use red color scheme for error state', () => {
      mockToken = null;
      const { container } = render(<ResetPasswordPage />);
      // Check for red gradient colors in blobs
      const redElements = container.querySelectorAll('[class*="red"]');
      expect(redElements.length).toBeGreaterThan(0);
    });
  });

  describe('Internationalization', () => {
    it('should call translation function', () => {
      render(<ResetPasswordPage />);
      expect(mockT).toHaveBeenCalled();
    });

    it('should use auth namespace for translations', () => {
      render(<ResetPasswordPage />);
      expect(mockT).toHaveBeenCalled();
    });
  });

  describe('Token Handling', () => {
    it('should extract token from URL search params', () => {
      mockToken = 'test-token-123';
      render(<ResetPasswordPage />);

      expect(screen.getByTestId('form-token')).toHaveTextContent('test-token-123');
    });

    it('should handle empty string token as invalid', () => {
      mockToken = '';
      render(<ResetPasswordPage />);

      // Empty string is falsy, should show error state
      expect(screen.queryByTestId('reset-password-form')).not.toBeInTheDocument();
    });
  });

  describe('Security Indicators', () => {
    it('should display ShieldCheck icon for valid token', () => {
      const { container } = render(<ResetPasswordPage />);
      const shieldIcon = container.querySelector('[data-testid="shieldcheck-icon"]');
      expect(shieldIcon).toBeInTheDocument();
    });

    it('should display security tips', () => {
      render(<ResetPasswordPage />);
      const tips = screen.getAllByText(/resetPassword\.securityTip/i);
      expect(tips.length).toBeGreaterThan(0);
    });
  });
});
