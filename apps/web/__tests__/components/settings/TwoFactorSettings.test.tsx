/**
 * Tests for TwoFactorSettings component
 * Tests the 2FA setup, enable, disable, and backup codes flows
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TwoFactorSettings } from '@/components/settings/TwoFactorSettings';

// Mock i18n hook — handle both t(key, fallback) and t(key, interpolation) signatures
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string, fallbackOrParams?: string | Record<string, string>) => {
      if (typeof fallbackOrParams === 'string') return fallbackOrParams;
      if (typeof fallbackOrParams === 'object') return `${key}`;
      return key;
    },
  }),
}));

// Mock accessibility hook
jest.mock('@/hooks/use-accessibility', () => ({
  useReducedMotion: () => false,
}));

// Mock toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock two-factor service
const mockGetStatus = jest.fn();
const mockSetup = jest.fn();
const mockEnable = jest.fn();
const mockDisable = jest.fn();
const mockRegenerateBackupCodes = jest.fn();
const mockCancelSetup = jest.fn();

jest.mock('@/services/two-factor.service', () => ({
  twoFactorService: {
    getStatus: (...args: unknown[]) => mockGetStatus(...args),
    setup: (...args: unknown[]) => mockSetup(...args),
    enable: (...args: unknown[]) => mockEnable(...args),
    disable: (...args: unknown[]) => mockDisable(...args),
    regenerateBackupCodes: (...args: unknown[]) => mockRegenerateBackupCodes(...args),
    cancelSetup: (...args: unknown[]) => mockCancelSetup(...args),
  },
}));

describe('TwoFactorSettings', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('when 2FA is disabled', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({
        success: true,
        data: { enabled: false, backupCodesCount: 0 },
      });
    });

    it('renders "Enable 2FA" button', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
      });
    });

    it('renders "Inactive" badge', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Inactive')).toBeInTheDocument();
      });
    });

    it('renders disabled status text', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('2FA is not enabled')).toBeInTheDocument();
      });
    });
  });

  describe('when 2FA is enabled', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({
        success: true,
        data: { enabled: true, backupCodesCount: 8 },
      });
    });

    it('renders "Active" badge', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Active')).toBeInTheDocument();
      });
    });

    it('renders enabled status text', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('2FA is active')).toBeInTheDocument();
      });
    });

    it('renders "Disable 2FA" button', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
      });
    });

    it('renders "Regenerate Backup Codes" button', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Regenerate Backup Codes')).toBeInTheDocument();
      });
    });
  });

  describe('setup flow', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({
        success: true,
        data: { enabled: false, backupCodesCount: 0 },
      });
    });

    it('clicking enable triggers setup and shows QR code', async () => {
      mockSetup.mockResolvedValue({
        success: true,
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/Meeshy:test?secret=JBSWY3DPEHPK3PXP',
          qrCodeDataUrl: 'data:image/png;base64,fakeqr',
        },
      });

      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Enable 2FA'));

      await waitFor(() => {
        expect(mockSetup).toHaveBeenCalled();
        expect(screen.getByText('Set Up Authenticator')).toBeInTheDocument();
        expect(screen.getByAltText('2FA QR Code')).toBeInTheDocument();
      });
    });

    it('shows error toast when setup fails', async () => {
      const { toast } = require('sonner');
      mockSetup.mockResolvedValue({
        success: false,
        error: 'Server error',
      });

      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Enable 2FA'));

      await waitFor(() => {
        expect(toast.error).toHaveBeenCalledWith('Server error');
      });
    });
  });

  describe('enable flow (after setup)', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({
        success: true,
        data: { enabled: false, backupCodesCount: 0 },
      });
      mockSetup.mockResolvedValue({
        success: true,
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/Meeshy:test?secret=JBSWY3DPEHPK3PXP',
          qrCodeDataUrl: 'data:image/png;base64,fakeqr',
        },
      });
    });

    it('shows backup codes after successful enable', async () => {
      mockEnable.mockResolvedValue({
        success: true,
        data: {
          message: 'Enabled',
          backupCodes: ['CODE-001', 'CODE-002', 'CODE-003', 'CODE-004'],
        },
      });

      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
      });

      // Start setup
      fireEvent.click(screen.getByText('Enable 2FA'));

      await waitFor(() => {
        expect(screen.getByText('Set Up Authenticator')).toBeInTheDocument();
      });

      // Enter verification code
      const codeInput = screen.getByPlaceholderText('000000');
      fireEvent.change(codeInput, { target: { value: '123456' } });

      // Click verify
      fireEvent.click(screen.getByText('Verify & Enable'));

      await waitFor(() => {
        expect(mockEnable).toHaveBeenCalledWith('123456');
        expect(screen.getByText('Backup Codes')).toBeInTheDocument();
        expect(screen.getByText('CODE-001')).toBeInTheDocument();
        expect(screen.getByText('CODE-004')).toBeInTheDocument();
      });
    });
  });

  describe('disable flow', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({
        success: true,
        data: { enabled: true, backupCodesCount: 8 },
      });
    });

    it('shows disable form when clicking disable', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Disable 2FA'));

      await waitFor(() => {
        expect(screen.getByText('Disable Two-Factor Authentication')).toBeInTheDocument();
        expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      });
    });

    it('calls disable with password', async () => {
      mockDisable.mockResolvedValue({ success: true });

      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Disable 2FA')).toBeInTheDocument();
      });

      // Open disable form
      fireEvent.click(screen.getByText('Disable 2FA'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter your password')).toBeInTheDocument();
      });

      // Enter password
      fireEvent.change(screen.getByPlaceholderText('Enter your password'), {
        target: { value: 'mypassword' },
      });

      // Find the confirm disable button (there are two "Disable 2FA" texts now)
      const confirmButtons = screen.getAllByRole('button').filter(
        (btn) => btn.textContent?.includes('Disable 2FA')
      );
      const confirmButton = confirmButtons[confirmButtons.length - 1];
      fireEvent.click(confirmButton);

      await waitFor(() => {
        expect(mockDisable).toHaveBeenCalledWith('mypassword', undefined);
      });
    });
  });

  describe('cancel flow', () => {
    beforeEach(() => {
      mockGetStatus.mockResolvedValue({
        success: true,
        data: { enabled: false, backupCodesCount: 0 },
      });
      mockSetup.mockResolvedValue({
        success: true,
        data: {
          secret: 'JBSWY3DPEHPK3PXP',
          otpauthUrl: 'otpauth://totp/Meeshy:test?secret=JBSWY3DPEHPK3PXP',
          qrCodeDataUrl: 'data:image/png;base64,fakeqr',
        },
      });
    });

    it('cancels setup flow and calls cancelSetup', async () => {
      render(<TwoFactorSettings />);

      await waitFor(() => {
        expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Enable 2FA'));

      await waitFor(() => {
        expect(screen.getByText('Cancel')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Cancel'));

      expect(mockCancelSetup).toHaveBeenCalled();

      await waitFor(() => {
        expect(screen.getByText('Enable 2FA')).toBeInTheDocument();
      });
    });
  });

  describe('loading state', () => {
    it('shows loader while fetching status', () => {
      mockGetStatus.mockImplementation(() => new Promise(() => {})); // never resolves

      render(<TwoFactorSettings />);

      // Should show loading spinner (Loader2 icon) - the Card with centered content
      expect(screen.queryByText('Enable 2FA')).not.toBeInTheDocument();
      expect(screen.queryByText('Active')).not.toBeInTheDocument();
    });
  });
});
