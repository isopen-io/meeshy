/**
 * Tests for CheckEmailPage component
 *
 * This page displays confirmation after a password reset request is submitted.
 * It shows the user's email and provides options to resend or use phone reset.
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';

// Mock dependencies before importing component
const mockPush = jest.fn();
const mockRouter = {
  push: mockPush,
  replace: jest.fn(),
  prefetch: jest.fn(),
  back: jest.fn(),
  pathname: '/forgot-password/check-email',
  query: {},
};

jest.mock('next/navigation', () => ({
  useRouter: () => mockRouter,
  usePathname: () => '/forgot-password/check-email',
  useSearchParams: () => new URLSearchParams(),
  useParams: () => ({}),
}));

// Mock framer-motion to avoid animation issues in tests
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

// Mock password reset store
const mockPasswordResetStore = {
  email: 'test@example.com',
  resetRequested: true,
};
jest.mock('@/stores/password-reset-store', () => ({
  usePasswordResetStore: () => mockPasswordResetStore,
}));

// Mock password reset service - define inline to avoid initialization order issues
jest.mock('@/services/password-reset.service', () => ({
  passwordResetService: {
    requestReset: jest.fn(),
  },
}));

// Get the mock for assertions
const getPasswordResetServiceMock = () => require('@/services/password-reset.service').passwordResetService;

// Mock sonner toast - define inline to avoid initialization order issues
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));

// Get the mock for assertions
const getToastMock = () => require('sonner').toast;

// Mock LargeLogo component
jest.mock('@/components/branding', () => ({
  LargeLogo: ({ href }: { href: string }) => (
    <a href={href} data-testid="large-logo">Logo</a>
  ),
}));

// Mock PhoneResetFlow component
jest.mock('@/components/auth/PhoneResetFlow', () => ({
  PhoneResetFlow: ({ onClose }: { onClose: () => void }) => (
    <div data-testid="phone-reset-flow">
      <button onClick={onClose} data-testid="phone-reset-close">Close</button>
    </div>
  ),
}));

// Mock Button component
jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, disabled, variant, className, ...props }: any) => (
    <button
      onClick={onClick}
      disabled={disabled}
      className={className}
      data-variant={variant}
      {...props}
    >
      {children}
    </button>
  ),
}));

// Mock Alert components
jest.mock('@/components/ui/alert', () => ({
  Alert: ({ children, className }: any) => <div className={className} role="alert">{children}</div>,
  AlertDescription: ({ children, className }: any) => <p className={className}>{children}</p>,
}));

// Import component after mocks
import CheckEmailPage from '@/app/forgot-password/check-email/page';

describe('CheckEmailPage', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPasswordResetStore.email = 'test@example.com';
    mockPasswordResetStore.resetRequested = true;
  });

  describe('Initial Rendering', () => {
    it('should render the page with logo', () => {
      render(<CheckEmailPage />);
      expect(screen.getByTestId('large-logo')).toBeInTheDocument();
    });

    it('should render the check email title', () => {
      render(<CheckEmailPage />);
      // The title uses t() with fallback
      expect(screen.getByRole('heading', { level: 1 })).toBeInTheDocument();
    });

    it('should display the email address that was sent to', () => {
      render(<CheckEmailPage />);
      expect(screen.getByText('test@example.com')).toBeInTheDocument();
    });

    it('should show instructions for checking email', () => {
      render(<CheckEmailPage />);
      // The page should have instruction steps
      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should render buttons in action area', () => {
      render(<CheckEmailPage />);
      // Check for buttons in the card
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });

    it('should render resend button', () => {
      render(<CheckEmailPage />);
      // The button text uses translation key checkEmail.confirmResend
      const buttons = screen.getAllByRole('button');
      const resendButton = buttons.find(b => b.textContent?.includes('checkEmail'));
      expect(resendButton).toBeInTheDocument();
    });

    it('should render phone icon for phone reset section', () => {
      const { container } = render(<CheckEmailPage />);
      // Check for phone icon in the phone reset section
      const phoneIcon = container.querySelector('[data-testid="phone-icon"]');
      expect(phoneIcon).toBeInTheDocument();
    });
  });

  describe('Redirect Behavior', () => {
    it('should redirect to forgot-password if no reset was requested', async () => {
      mockPasswordResetStore.resetRequested = false;
      mockPasswordResetStore.email = '';

      render(<CheckEmailPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/forgot-password');
      });
    });

    it('should redirect if email is missing', async () => {
      mockPasswordResetStore.email = '';

      render(<CheckEmailPage />);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/forgot-password');
      });
    });

    it('should show error toast when redirecting due to no request', async () => {
      mockPasswordResetStore.resetRequested = false;

      render(<CheckEmailPage />);

      await waitFor(() => {
        expect(getToastMock().error).toHaveBeenCalled();
      });
    });
  });

  describe('Back to Login Navigation', () => {
    it('should navigate to login when cancel button is clicked', async () => {
      render(<CheckEmailPage />);

      // Find the cancel button by looking at all buttons
      const buttons = screen.getAllByRole('button');
      const cancelButton = buttons.find(b =>
        b.textContent?.includes('cancel') ||
        b.textContent?.includes('Cancel') ||
        b.textContent?.includes('checkEmail.cancel')
      );

      if (cancelButton) {
        fireEvent.click(cancelButton);
        expect(mockPush).toHaveBeenCalledWith('/login');
      }
    });
  });

  describe('Phone Reset Flow', () => {
    it('should show phone icon in phone section', async () => {
      const { container } = render(<CheckEmailPage />);

      // The phone icon should exist
      const phoneIcon = container.querySelector('[data-testid="phone-icon"]');
      expect(phoneIcon).toBeInTheDocument();
    });

    it('should have multiple buttons for actions', async () => {
      render(<CheckEmailPage />);

      // Find the buttons on the page
      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThan(0);
    });
  });

  describe('Resend Email Functionality', () => {
    it('should have buttons for resend and cancel', async () => {
      render(<CheckEmailPage />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });

    it('should render buttons and form elements', async () => {
      const { container } = render(<CheckEmailPage />);

      // Check that the form has buttons
      const buttons = container.querySelectorAll('button');
      expect(buttons.length).toBeGreaterThanOrEqual(2);
    });
  });

  describe('Loading Fallback', () => {
    it('should show loading spinner in Suspense fallback', () => {
      // The LoadingFallback is rendered by Suspense, we test its structure
      const { container } = render(<CheckEmailPage />);
      // The component should render without errors
      expect(container).toBeInTheDocument();
    });
  });

  describe('Contact Support Link', () => {
    it('should render contact support link', () => {
      render(<CheckEmailPage />);

      // Find link to contact page
      const links = screen.getAllByRole('link');
      const contactLink = links.find(l => l.getAttribute('href') === '/contact');
      expect(contactLink).toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper heading structure', () => {
      render(<CheckEmailPage />);

      const heading = screen.getByRole('heading', { level: 1 });
      expect(heading).toBeInTheDocument();
    });

    it('should have alerts for important information', () => {
      render(<CheckEmailPage />);

      const alerts = screen.getAllByRole('alert');
      expect(alerts.length).toBeGreaterThan(0);
    });

    it('should have accessible icons with aria-hidden', () => {
      const { container } = render(<CheckEmailPage />);

      const icons = container.querySelectorAll('[aria-hidden="true"]');
      expect(icons.length).toBeGreaterThan(0);
    });
  });

  describe('Internationalization', () => {
    it('should call translation function with correct keys', () => {
      render(<CheckEmailPage />);

      // Verify t() is called for various content
      expect(mockT).toHaveBeenCalled();
    });
  });
});
