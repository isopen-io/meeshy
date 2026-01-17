/**
 * ResetPasswordForm Component Tests
 *
 * Tests the reset password form including:
 * - Token verification
 * - Password validation and strength
 * - Password matching
 * - 2FA support
 * - Successful password reset
 * - Error handling
 * - Loading states
 * - Accessibility
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { ResetPasswordForm } from '../../../components/auth/ResetPasswordForm';

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
        'resetPassword.verifyingToken': 'Verifying reset link...',
        'resetPassword.errors.tokenMissing': 'Reset token is missing',
        'resetPassword.errors.tokenInvalid': 'Invalid or expired reset token',
        'resetPassword.errors.verificationFailed': 'Failed to verify reset token',
        'resetPassword.errors.passwordRequired': 'Password is required',
        'resetPassword.errors.passwordMismatch': 'Passwords do not match',
        'resetPassword.errors.twoFactorRequired': '2FA code is required',
        'resetPassword.errors.twoFactorInvalid': '2FA code must be 6 digits',
        'resetPassword.errors.resetFailed': 'Failed to reset password',
        'resetPassword.success.passwordReset': 'Password reset successfully',
        'resetPassword.tokenVerified': 'Identity verified. Please enter your new password.',
        'resetPassword.tokenExpiredHelp': 'Your reset link may have expired. Please request a new one.',
        'resetPassword.requestNewLink': 'Request New Reset Link',
        'resetPassword.newPasswordLabel': 'New Password',
        'resetPassword.newPasswordPlaceholder': 'Enter new password',
        'resetPassword.confirmPasswordLabel': 'Confirm Password',
        'resetPassword.confirmPasswordPlaceholder': 'Re-enter new password',
        'resetPassword.passwordsMatch': 'Passwords match',
        'resetPassword.passwordsDontMatch': 'Passwords do not match',
        'resetPassword.twoFactorLabel': '2FA Code',
        'resetPassword.twoFactorPlaceholder': '000000',
        'resetPassword.twoFactorHelp': 'Enter the 6-digit code from your authenticator app',
        'resetPassword.resetting': 'Resetting Password...',
        'resetPassword.submitButton': 'Reset Password',
        'resetPassword.backToLogin': 'Back to Login',
        'resetPassword.strength.weak': 'Weak',
        'resetPassword.strength.fair': 'Fair',
        'resetPassword.strength.strong': 'Strong',
        'resetPassword.strength.veryStrong': 'Very Strong',
      };
      return translations[key] || key;
    },
    locale: 'en',
  }),
}));

// Mock password reset store
const mockPasswordResetStore = {
  requires2FA: false,
  setRequires2FA: jest.fn(),
  setPasswordReset: jest.fn(),
  setError: jest.fn(),
  setSuccessMessage: jest.fn(),
  setIsResettingPassword: jest.fn(),
};
jest.mock('@/stores/password-reset-store', () => ({
  usePasswordResetStore: () => mockPasswordResetStore,
}));

// Mock password reset service
const mockVerifyToken = jest.fn();
const mockResetPassword = jest.fn();
const mockValidatePasswordStrength = jest.fn();
jest.mock('@/services/password-reset.service', () => ({
  passwordResetService: {
    verifyToken: mockVerifyToken,
    resetPassword: mockResetPassword,
    validatePasswordStrength: mockValidatePasswordStrength,
    calculatePasswordStrength: jest.fn().mockReturnValue(3),
    getPasswordStrengthLabel: jest.fn().mockReturnValue('Strong'),
    getPasswordStrengthColor: jest.fn().mockReturnValue('bg-blue-600'),
  },
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

// Mock PasswordStrengthMeter
jest.mock('../../../components/auth/PasswordStrengthMeter', () => ({
  PasswordStrengthMeter: ({ password }: { password: string }) => (
    <div data-testid="password-strength-meter">Strength: {password.length > 8 ? 'Strong' : 'Weak'}</div>
  ),
}));

// Mock PasswordRequirementsChecklist
jest.mock('../../../components/auth/PasswordRequirementsChecklist', () => ({
  PasswordRequirementsChecklist: ({ password }: { password: string }) => (
    <div data-testid="password-requirements">Requirements for: {password}</div>
  ),
}));

describe('ResetPasswordForm', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockPasswordResetStore.requires2FA = false;
    mockValidatePasswordStrength.mockReturnValue({ isValid: true, errors: [] });
  });

  describe('Token Verification', () => {
    it('shows loading state while verifying token', async () => {
      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockVerifyToken.mockReturnValueOnce(pendingPromise);

      render(<ResetPasswordForm token="test-token" />);

      expect(screen.getByText('Verifying reset link...')).toBeInTheDocument();

      // Cleanup
      await act(async () => {
        resolvePromise!({ success: true, valid: true });
      });
    });

    it('shows error when token is missing', async () => {
      render(<ResetPasswordForm token="" />);

      await waitFor(() => {
        expect(screen.getByText('Reset token is missing')).toBeInTheDocument();
      });
    });

    it('shows error when token is invalid', async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: false,
        error: 'Token has expired',
      });

      render(<ResetPasswordForm token="invalid-token" />);

      await waitFor(() => {
        expect(screen.getByText('Token has expired')).toBeInTheDocument();
      });
    });

    it('shows request new link button when token is invalid', async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: false,
      });

      render(<ResetPasswordForm token="invalid-token" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Request New Reset Link/i })).toBeInTheDocument();
      });
    });

    it('redirects to forgot password when request new link is clicked', async () => {
      const user = userEvent.setup();
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: false,
      });

      render(<ResetPasswordForm token="invalid-token" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Request New Reset Link/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /Request New Reset Link/i }));

      expect(mockPush).toHaveBeenCalledWith('/forgot-password');
    });

    it('shows form when token is valid', async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });
    });

    it('shows verified banner on successful token verification', async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByText('Identity verified. Please enter your new password.')).toBeInTheDocument();
      });
    });

    it('sets requires2FA in store when token requires 2FA', async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
        requires2FA: true,
      });

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(mockPasswordResetStore.setRequires2FA).toHaveBeenCalledWith(true);
      });
    });
  });

  describe('Password Form', () => {
    beforeEach(async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });
    });

    it('renders password inputs', async () => {
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
        expect(screen.getByPlaceholderText(/Re-enter new password/i)).toBeInTheDocument();
      });
    });

    it('shows password strength meter when password is entered', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      await user.type(passwordInput, 'TestPassword123!');

      expect(screen.getByTestId('password-strength-meter')).toBeInTheDocument();
    });

    it('shows password match indicator when confirm password matches', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'TestPassword123!');
      await user.type(confirmInput, 'TestPassword123!');

      expect(screen.getByText('Passwords match')).toBeInTheDocument();
    });

    it('shows password mismatch indicator when passwords differ', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'TestPassword123!');
      await user.type(confirmInput, 'DifferentPassword!');

      expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
    });
  });

  describe('Password Visibility Toggle', () => {
    beforeEach(async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });
    });

    it('initially hides passwords', async () => {
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
        expect(passwordInput).toHaveAttribute('type', 'password');
      });
    });

    it('toggles new password visibility', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const toggleButtons = screen.getAllByRole('button', { name: /Show password|Hide password/i });
      await user.click(toggleButtons[0]);

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      expect(passwordInput).toHaveAttribute('type', 'text');
    });

    it('toggles confirm password visibility', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Re-enter new password/i)).toBeInTheDocument();
      });

      const toggleButtons = screen.getAllByRole('button', { name: /Show password|Hide password/i });
      await user.click(toggleButtons[1]);

      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);
      expect(confirmInput).toHaveAttribute('type', 'text');
    });
  });

  describe('Form Validation', () => {
    beforeEach(async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });
    });

    it('shows error when password is empty', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /Reset Password/i })).toBeInTheDocument();
      });

      // Fill only confirm password
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);
      await user.type(confirmInput, 'SomePassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Password is required')).toBeInTheDocument();
      });
    });

    it('shows error when passwords do not match', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'TestPassword123!');
      await user.type(confirmInput, 'DifferentPassword!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Passwords do not match')).toBeInTheDocument();
      });
    });

    it('shows error when password strength validation fails', async () => {
      const user = userEvent.setup();
      mockValidatePasswordStrength.mockReturnValue({
        isValid: false,
        errors: ['Password must be at least 8 characters', 'Password must contain uppercase'],
      });

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'weak');
      await user.type(confirmInput, 'weak');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText(/Password must be at least 8 characters/)).toBeInTheDocument();
      });
    });
  });

  describe('2FA Support', () => {
    beforeEach(async () => {
      mockPasswordResetStore.requires2FA = true;
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
        requires2FA: true,
      });
    });

    it('shows 2FA input when required', async () => {
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      });
    });

    it('validates 2FA code is required', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'StrongPassword123!');
      await user.type(confirmInput, 'StrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('2FA code is required')).toBeInTheDocument();
      });
    });

    it('validates 2FA code must be 6 digits', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);
      const twoFactorInput = screen.getByPlaceholderText('000000');

      await user.type(passwordInput, 'StrongPassword123!');
      await user.type(confirmInput, 'StrongPassword123!');
      await user.type(twoFactorInput, '123');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('2FA code must be 6 digits')).toBeInTheDocument();
      });
    });

    it('only accepts numeric input for 2FA code', async () => {
      const user = userEvent.setup();
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      });

      const twoFactorInput = screen.getByPlaceholderText('000000');
      await user.type(twoFactorInput, 'abc123def');

      expect(twoFactorInput).toHaveValue('123');
    });
  });

  describe('Successful Password Reset', () => {
    beforeEach(async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });
    });

    it('submits form with correct data', async () => {
      const user = userEvent.setup();
      mockResetPassword.mockResolvedValueOnce({ success: true });

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'NewStrongPassword123!');
      await user.type(confirmInput, 'NewStrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockResetPassword).toHaveBeenCalledWith({
          token: 'valid-token',
          newPassword: 'NewStrongPassword123!',
          confirmPassword: 'NewStrongPassword123!',
          twoFactorCode: undefined,
        });
      });
    });

    it('updates store on success', async () => {
      const user = userEvent.setup();
      mockResetPassword.mockResolvedValueOnce({
        success: true,
        message: 'Password updated',
      });

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'NewStrongPassword123!');
      await user.type(confirmInput, 'NewStrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockPasswordResetStore.setPasswordReset).toHaveBeenCalledWith(true);
        expect(mockPasswordResetStore.setSuccessMessage).toHaveBeenCalled();
      });
    });

    it('shows success toast', async () => {
      const user = userEvent.setup();
      mockResetPassword.mockResolvedValueOnce({ success: true });

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'NewStrongPassword123!');
      await user.type(confirmInput, 'NewStrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.success).toHaveBeenCalledWith('Password reset successfully!');
      });
    });

    it('calls onSuccess callback if provided', async () => {
      const user = userEvent.setup();
      const onSuccess = jest.fn();
      mockResetPassword.mockResolvedValueOnce({ success: true });

      render(<ResetPasswordForm token="valid-token" onSuccess={onSuccess} />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'NewStrongPassword123!');
      await user.type(confirmInput, 'NewStrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(onSuccess).toHaveBeenCalled();
      });
    });
  });

  describe('Error Handling', () => {
    beforeEach(async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });
    });

    it('displays API error message', async () => {
      const user = userEvent.setup();
      mockResetPassword.mockResolvedValueOnce({
        success: false,
        error: 'Token expired',
      });

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'NewStrongPassword123!');
      await user.type(confirmInput, 'NewStrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(screen.getByText('Token expired')).toBeInTheDocument();
      });
    });

    it('shows error toast', async () => {
      const user = userEvent.setup();
      mockResetPassword.mockRejectedValueOnce(new Error('Network error'));

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'NewStrongPassword123!');
      await user.type(confirmInput, 'NewStrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      await waitFor(() => {
        expect(mockToast.error).toHaveBeenCalled();
      });
    });
  });

  describe('Loading State', () => {
    beforeEach(async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });
    });

    it('shows loading state during submission', async () => {
      const user = userEvent.setup();

      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockResetPassword.mockReturnValueOnce(pendingPromise);

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'NewStrongPassword123!');
      await user.type(confirmInput, 'NewStrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      expect(screen.getByText('Resetting Password...')).toBeInTheDocument();

      // Cleanup
      await act(async () => {
        resolvePromise!({ success: true });
      });
    });

    it('disables submit button during submission', async () => {
      const user = userEvent.setup();

      let resolvePromise: (value: any) => void;
      const pendingPromise = new Promise((resolve) => {
        resolvePromise = resolve;
      });
      mockResetPassword.mockReturnValueOnce(pendingPromise);

      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/Enter new password/i)).toBeInTheDocument();
      });

      const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
      const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

      await user.type(passwordInput, 'NewStrongPassword123!');
      await user.type(confirmInput, 'NewStrongPassword123!');

      const submitButton = screen.getByRole('button', { name: /Reset Password/i });
      await user.click(submitButton);

      expect(submitButton).toBeDisabled();

      // Cleanup
      await act(async () => {
        resolvePromise!({ success: true });
      });
    });
  });

  describe('Accessibility', () => {
    beforeEach(async () => {
      mockVerifyToken.mockResolvedValueOnce({
        success: true,
        valid: true,
      });
    });

    it('has proper labels for inputs', async () => {
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        expect(screen.getByLabelText(/New Password/i)).toBeInTheDocument();
        expect(screen.getByLabelText(/Confirm Password/i)).toBeInTheDocument();
      });
    });

    it('has proper autocomplete attributes', async () => {
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        const passwordInput = screen.getByPlaceholderText(/Enter new password/i);
        const confirmInput = screen.getByPlaceholderText(/Re-enter new password/i);

        expect(passwordInput).toHaveAttribute('autocomplete', 'new-password');
        expect(confirmInput).toHaveAttribute('autocomplete', 'new-password');
      });
    });

    it('has back to login link', async () => {
      render(<ResetPasswordForm token="valid-token" />);

      await waitFor(() => {
        const backLink = screen.getByText('Back to Login');
        expect(backLink).toBeInTheDocument();
        expect(backLink).toHaveAttribute('href', '/login');
      });
    });
  });
});
