/**
 * ForgotPasswordForm Component Tests
 *
 * Tests the forgot password form including:
 * - Form rendering
 * - Email validation
 * - Successful reset request
 * - Error handling
 * - Bot protection
 * - Loading states
 * - Navigation
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ForgotPasswordForm } from '../../../components/auth/ForgotPasswordForm';

// Mock next/navigation
const mockPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({
    push: mockPush,
    replace: jest.fn(),
    prefetch: jest.fn(),
  }),
}));

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'forgotPassword.emailLabel': 'Email Address',
        'forgotPassword.emailPlaceholder': 'your.email@example.com',
        'forgotPassword.emailHelp': 'Enter the email address associated with your account',
        'forgotPassword.errors.emailRequired': 'Email is required',
        'forgotPassword.errors.invalidEmail': 'Please enter a valid email address',
        'forgotPassword.errors.requestFailed': 'Failed to request password reset',
        'forgotPassword.success.emailSent': 'Password reset link sent',
        'forgotPassword.sending': 'Sending...',
        'forgotPassword.submitButton': 'Send Reset Link',
        'forgotPassword.backToLogin': 'Back to Login',
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

// Mock password reset store
const mockPasswordResetStore = {
  email: '',
  setEmail: jest.fn(),
  setResetRequested: jest.fn(),
  setError: jest.fn(),
  setSuccessMessage: jest.fn(),
  setIsRequestingReset: jest.fn(),
};
jest.mock('@/stores/password-reset-store', () => ({
  usePasswordResetStore: () => mockPasswordResetStore,
}));

// Mock auth form store
const mockAuthFormStore = {
  identifier: '',
  setIdentifier: jest.fn(),
};
jest.mock('@/stores/auth-form-store', () => ({
  useAuthFormStore: () => mockAuthFormStore,
}));

// Mock password reset service
jest.mock('@/services/password-reset.service', () => ({
  passwordResetService: {
    requestReset: jest.fn(),
  },
}));
const mockRequestReset = jest.fn();

// Mock useBotProtection hook
const mockValidateSubmission = jest.fn().mockReturnValue({ isHuman: true, botError: null });
const mockResetBotProtection = jest.fn();
jest.mock('@/hooks/use-bot-protection', () => ({
  useBotProtection: () => ({
    honeypotProps: {
      name: 'website',
      value: '',
      onChange: jest.fn(),
      style: { display: 'none' },
      tabIndex: -1,
      autoComplete: 'off',
      'aria-hidden': true,
    },
    validateSubmission: mockValidateSubmission,
    reset: mockResetBotProtection,
  }),
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));
const mockToast = jest.requireMock('sonner').toast;

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

describe('ForgotPasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPasswordResetStore.email = '';
    mockAuthFormStore.identifier = '';
    mockValidateSubmission.mockReturnValue({ isHuman: true, botError: null });
  });

  describe('Initial Rendering', () => {
    it('renders the form correctly', () => {
      render(<ForgotPasswordForm />);

      expect(screen.getByText('Email Address')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('your.email@example.com')).toBeInTheDocument();
      expect(screen.getByText('Enter the email address associated with your account')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Send Reset Link/i })).toBeInTheDocument();
    });

    it('renders back to login link', () => {
      render(<ForgotPasswordForm />);

      const backLink = screen.getByText('Back to Login');
      expect(backLink).toBeInTheDocument();
      expect(backLink).toHaveAttribute('href', '/login');
    });

    it('has honeypot field hidden from users', () => {
      const { container } = render(<ForgotPasswordForm />);

      const honeypotInput = container.querySelector('input[name="website"]');
      expect(honeypotInput).toBeInTheDocument();
      expect(honeypotInput).toHaveStyle('display: none');
    });

    it('applies custom className', () => {
      const { container } = render(<ForgotPasswordForm className="custom-class" />);

      const form = container.querySelector('form');
      expect(form).toHaveClass('custom-class');
    });
  });

  describe('Pre-filled Email', () => {
    it('pre-fills email from password reset store', () => {
      mockPasswordResetStore.email = 'stored@example.com';

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      expect(emailInput).toHaveValue('stored@example.com');
    });

    it('pre-fills email from auth form store if looks like email', () => {
      mockAuthFormStore.identifier = 'shared@example.com';

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      expect(emailInput).toHaveValue('shared@example.com');
    });

    it('does not pre-fill from auth form store if not an email', () => {
      mockAuthFormStore.identifier = 'username123';

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      expect(emailInput).toHaveValue('');
    });
  });

  describe('Email Validation', () => {
    it('shows error when email is empty', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Email is required')).toBeInTheDocument();
      });
    });

    it('shows error for invalid email format', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'invalid-email');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });
    });

    it('shows error for email without domain', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Please enter a valid email address')).toBeInTheDocument();
      });
    });

    it('accepts valid email format', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockResolvedValueOnce({ message: 'Email sent' });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'valid@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockRequestReset).toHaveBeenCalled();
      });
    });
  });

  describe('Bot Protection', () => {
    it('shows bot detection error', async () => {
      const user = userEvent.setup();
      mockValidateSubmission.mockReturnValue({ isHuman: false, botError: 'Bot detected' });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Bot detected');
      });
    });
  });

  describe('Successful Reset Request', () => {
    it('submits request with correct email', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockResolvedValueOnce({ message: 'Reset email sent' });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockRequestReset).toHaveBeenCalledWith({
          email: 'test@example.com',
        });
      });
    });

    it('updates password reset store on success', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockResolvedValueOnce({ message: 'Reset email sent' });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockPasswordResetStore.setEmail).toHaveBeenCalledWith('test@example.com');
        expect(mockPasswordResetStore.setResetRequested).toHaveBeenCalledWith(true);
        expect(mockPasswordResetStore.setSuccessMessage).toHaveBeenCalledWith('Reset email sent');
      });
    });

    it('shows success toast', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockResolvedValueOnce({ message: 'Reset email sent' });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Password reset link sent');
      });
    });

    it('redirects to check email page on success', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockResolvedValueOnce({ message: 'Reset email sent' });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockPush).toHaveBeenCalledWith('/forgot-password/check-email');
      });
    });

    it('calls onSuccess callback if provided', async () => {
      const user = userEvent.setup();
      const onSuccess = jest.fn();
      mockRequestReset.mockResolvedValueOnce({ message: 'Reset email sent' });

      render(<ForgotPasswordForm onSuccess={onSuccess} />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
        expect(mockPush).not.toHaveBeenCalled();
      });
    });

    it('resets bot protection on success', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockResolvedValueOnce({ message: 'Reset email sent' });

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockResetBotProtection).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    it('displays API error message', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockRejectedValueOnce(new Error('User not found'));

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('User not found')).toBeInTheDocument();
      });
    });

    it('displays generic error for unknown errors', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockRejectedValueOnce('Unknown error');

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Failed to request password reset')).toBeInTheDocument();
      });
    });

    it('updates store with error', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockRejectedValueOnce(new Error('Server error'));

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockPasswordResetStore.setError).toHaveBeenCalledWith('Server error');
      });
    });

    it('shows error toast', async () => {
      const user = userEvent.setup();
      mockRequestReset.mockRejectedValueOnce(new Error('Network error'));

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalledWith('Network error');
      });
    });
  });

  describe('Loading State', () => {
    it('shows loading state during submission', async () => {
      const user = userEvent.setup();

      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockRequestReset.mockReturnValueOnce(pendingPromise);

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      // Check loading state
      expect(screen.getByText('Sending...')).toBeInTheDocument();
      expect(submitButton).toBeDisabled();

      // Cleanup
      resolvePromise!({ message: 'Success' });
    });

    it('disables email input during submission', async () => {
      const user = userEvent.setup();

      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockRequestReset.mockReturnValueOnce(pendingPromise);

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      expect(emailInput).toBeDisabled();

      // Cleanup
      resolvePromise!({ message: 'Success' });
    });

    it('updates loading state in store', async () => {
      const user = userEvent.setup();

      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockRequestReset.mockReturnValueOnce(pendingPromise);

      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      await user.click(submitButton);

      expect(mockPasswordResetStore.setIsRequestingReset).toHaveBeenCalledWith(true);

      // Cleanup
      resolvePromise!({ message: 'Success' });

      await waitFor(() => {
        expect(mockPasswordResetStore.setIsRequestingReset).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Submit Button State', () => {
    it('disables button when email is empty', () => {
      render(<ForgotPasswordForm />);

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      expect(submitButton).toBeDisabled();
    });

    it('enables button when email is entered', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'test@example.com');

      const submitButton = screen.getByRole('button', { name: /Send Reset Link/i });
      expect(submitButton).not.toBeDisabled();
    });
  });

  describe('Accessibility', () => {
    it('has proper label for email input', () => {
      render(<ForgotPasswordForm />);

      expect(screen.getByLabelText(/Email Address/i)).toBeInTheDocument();
    });

    it('has proper autocomplete attribute', () => {
      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      expect(emailInput).toHaveAttribute('autocomplete', 'email');
    });

    it('has proper type attribute', () => {
      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      expect(emailInput).toHaveAttribute('type', 'email');
    });

    it('has spellCheck disabled for email', () => {
      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      expect(emailInput).toHaveAttribute('spellcheck', 'false');
    });
  });

  describe('Store Updates', () => {
    it('syncs email to auth form store on change', async () => {
      const user = userEvent.setup();
      render(<ForgotPasswordForm />);

      const emailInput = screen.getByPlaceholderText('your.email@example.com');
      await user.type(emailInput, 'new@example.com');

      expect(mockAuthFormStore.setIdentifier).toHaveBeenCalled();
    });
  });
});
