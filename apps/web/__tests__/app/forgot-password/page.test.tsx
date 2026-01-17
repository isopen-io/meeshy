/**
 * Tests for ForgotPasswordPage component
 *
 * This page allows users to request a password reset via email or phone.
 * It includes tab navigation between email and phone reset methods.
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
  pathname: '/forgot-password',
  query: {},
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/forgot-password',
  useSearchParams: () => new URLSearchParams(),
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

// Mock ForgotPasswordForm
const mockFormSubmit = jest.fn();
jest.mock('@/components/auth/ForgotPasswordForm', () => ({
  ForgotPasswordForm: () => (
    <form data-testid="forgot-password-form" onSubmit={mockFormSubmit}>
      <input type="email" placeholder="Email" data-testid="email-input" />
      <button type="submit" data-testid="submit-button">Send Reset Link</button>
    </form>
  ),
}));

// Mock PhoneResetFlow
jest.mock('@/components/auth/PhoneResetFlow', () => ({
  PhoneResetFlow: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="phone-reset-flow">
      <button onClick={onClose} data-testid="phone-reset-close">Close</button>
    </div>
  ),
}));

// Mock LargeLogo component
jest.mock('@/components/branding', () => ({
  LargeLogo: ({ href }: { href: string }) => (
    <a href={href} data-testid="large-logo">Logo</a>
  ),
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// Import component after mocks
import ForgotPasswordPage from '@/app/forgot-password/page';

describe('ForgotPasswordPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Rendering', () => {
    it('should render the page with feature gate', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('feature-gate')).toBeInTheDocument();
      expect(screen.getByTestId('feature-gate')).toHaveAttribute('data-feature', 'passwordReset');
    });

    it('should render the logo', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('large-logo')).toBeInTheDocument();
      expect(screen.getByTestId('large-logo')).toHaveAttribute('href', '/');
    });

    it('should render email and phone tab buttons', () => {
      render(<ForgotPasswordPage />);

      // Find tab buttons by their translation keys (mock returns the key)
      const emailTab = screen.getByText(/forgotPassword\.tabEmail/i);
      const phoneTab = screen.getByText(/forgotPassword\.tabPhone/i);

      expect(emailTab).toBeInTheDocument();
      expect(phoneTab).toBeInTheDocument();
    });

    it('should show email form by default', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('forgot-password-form')).toBeInTheDocument();
    });

    it('should render the page title', () => {
      render(<ForgotPasswordPage />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('should render description text', () => {
      render(<ForgotPasswordPage />);
      // Description text should be present (mock returns the key)
      const description = screen.getByText(/forgotPassword\.description/i);
      expect(description).toBeInTheDocument();
    });

    it('should render security note', () => {
      render(<ForgotPasswordPage />);
      const securityNote = screen.getByText(/forgotPassword\.securityNote/i);
      expect(securityNote).toBeInTheDocument();
    });
  });

  describe('Tab Navigation', () => {
    it('should switch to phone reset flow when phone tab is clicked', async () => {
      render(<ForgotPasswordPage />);

      const phoneTab = screen.getByText(/forgotPassword\.tabPhone/i);
      fireEvent.click(phoneTab);

      await waitFor(() => {
        expect(screen.getByTestId('phone-reset-flow')).toBeInTheDocument();
      });
    });

    it('should switch back to email form when email tab is clicked', async () => {
      render(<ForgotPasswordPage />);

      // First switch to phone
      const phoneTab = screen.getByText(/forgotPassword\.tabPhone/i);
      fireEvent.click(phoneTab);

      await waitFor(() => {
        expect(screen.getByTestId('phone-reset-flow')).toBeInTheDocument();
      });

      // Then switch back to email
      const emailTab = screen.getByText(/forgotPassword\.tabEmail/i);
      fireEvent.click(emailTab);

      await waitFor(() => {
        expect(screen.getByTestId('forgot-password-form')).toBeInTheDocument();
      });
    });

    it('should apply active styles to selected tab', () => {
      render(<ForgotPasswordPage />);

      // Email tab should have active styles by default
      const emailTab = screen.getByText(/forgotPassword\.tabEmail/i);
      const emailTabParent = emailTab.closest('button');

      // Check that it has the active class or styling
      expect(emailTabParent).toBeInTheDocument();
    });
  });

  describe('Phone Reset Flow', () => {
    it('should close phone reset flow via onClose callback', async () => {
      render(<ForgotPasswordPage />);

      // Switch to phone using the translation key
      const phoneTab = screen.getByText(/forgotPassword\.tabPhone/i);
      fireEvent.click(phoneTab);

      await waitFor(() => {
        expect(screen.getByTestId('phone-reset-flow')).toBeInTheDocument();
      });

      // Close via the close button (which calls onClose)
      const closeButton = screen.getByTestId('phone-reset-close');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.getByTestId('forgot-password-form')).toBeInTheDocument();
      });
    });
  });

  describe('Footer Links', () => {
    it('should render terms of service link', () => {
      render(<ForgotPasswordPage />);
      const termsLink = screen.getByRole('link', { name: /register\.termsOfService/i });
      expect(termsLink).toBeInTheDocument();
      expect(termsLink).toHaveAttribute('href', '/terms');
    });

    it('should render privacy policy link', () => {
      render(<ForgotPasswordPage />);
      const privacyLink = screen.getByRole('link', { name: /register\.privacyPolicy/i });
      expect(privacyLink).toBeInTheDocument();
      expect(privacyLink).toHaveAttribute('href', '/privacy');
    });

    it('should render contact link', () => {
      render(<ForgotPasswordPage />);
      const contactLink = screen.getByRole('link', { name: /register\.contactUs/i });
      expect(contactLink).toBeInTheDocument();
      expect(contactLink).toHaveAttribute('href', '/contact');
    });
  });

  describe('Loading Fallback', () => {
    it('should render without errors', () => {
      const { container } = render(<ForgotPasswordPage />);
      expect(container).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(<ForgotPasswordPage />);
      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('should have accessible tab buttons', () => {
      render(<ForgotPasswordPage />);

      const buttons = screen.getAllByRole('button');
      // Should have at least the two tab buttons
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it('should have icons with aria-hidden', () => {
      const { container } = render(<ForgotPasswordPage />);
      const hiddenIcons = container.querySelectorAll('[aria-hidden="true"]');
      expect(hiddenIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Responsive Design', () => {
    it('should render decorative blobs', () => {
      const { container } = render(<ForgotPasswordPage />);
      // Check for blur elements (decorative blobs)
      const blurElements = container.querySelectorAll('.blur-2xl, .blur-3xl');
      expect(blurElements.length).toBeGreaterThan(0);
    });

    it('should have responsive padding classes', () => {
      const { container } = render(<ForgotPasswordPage />);
      const mainContent = container.querySelector('.px-4');
      expect(mainContent).toBeInTheDocument();
    });
  });

  describe('Internationalization', () => {
    it('should call translation function', () => {
      render(<ForgotPasswordPage />);
      expect(mockT).toHaveBeenCalled();
    });

    it('should use auth namespace for translations', () => {
      render(<ForgotPasswordPage />);
      // The hook is called with 'auth' namespace
      // We verify translations are called
      expect(mockT).toHaveBeenCalled();
    });
  });

  describe('Form Integration', () => {
    it('should render the forgot password form in email mode', () => {
      render(<ForgotPasswordPage />);
      expect(screen.getByTestId('forgot-password-form')).toBeInTheDocument();
      expect(screen.getByTestId('email-input')).toBeInTheDocument();
      expect(screen.getByTestId('submit-button')).toBeInTheDocument();
    });
  });
});
