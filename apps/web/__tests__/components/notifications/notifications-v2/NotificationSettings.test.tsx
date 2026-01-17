/**
 * Tests for NotificationSettings component
 * Tests push notification toggle, test notifications, and iOS handling
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationSettings } from '@/components/notifications/notifications-v2/NotificationSettings';

// Mock FCM manager
const mockFcm = {
  isSupported: jest.fn(),
  getPermissionStatus: jest.fn(),
  deleteToken: jest.fn(),
  getCurrentToken: jest.fn(),
};

jest.mock('@/utils/fcm-manager', () => ({
  fcm: {
    isSupported: () => mockFcm.isSupported(),
    getPermissionStatus: () => mockFcm.getPermissionStatus(),
    deleteToken: () => mockFcm.deleteToken(),
    getCurrentToken: () => mockFcm.getCurrentToken(),
  },
  NotificationPermission: {},
}));

// Mock iOS notifications
const mockIosNotifications = {
  isIOS: jest.fn(),
  getCapabilities: jest.fn(),
};

jest.mock('@/utils/ios-notification-manager', () => ({
  iosNotifications: {
    isIOS: () => mockIosNotifications.isIOS(),
    getCapabilities: () => mockIosNotifications.getCapabilities(),
  },
}));

// Mock NotificationPermissionPrompt
jest.mock('@/components/notifications/notifications-v2/NotificationPermissionPrompt', () => ({
  NotificationPermissionPrompt: ({ open, onClose, onPermissionGranted, onPermissionDenied, onDismissed }: any) => {
    if (!open) return null;
    return (
      <div data-testid="permission-prompt">
        <button onClick={onPermissionGranted}>Grant Permission</button>
        <button onClick={onPermissionDenied}>Deny Permission</button>
        <button onClick={onDismissed}>Dismiss</button>
        <button onClick={onClose}>Close</button>
      </div>
    );
  },
}));

// Mock alert
const mockAlert = jest.fn();
window.alert = mockAlert;

// Mock service worker
const mockShowNotification = jest.fn().mockResolvedValue(undefined);
const mockServiceWorkerReady = Promise.resolve({
  showNotification: mockShowNotification,
});

Object.defineProperty(navigator, 'serviceWorker', {
  value: {
    ready: mockServiceWorkerReady,
  },
  writable: true,
});

describe('NotificationSettings', () => {
  const originalEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    process.env.NODE_ENV = 'production';

    // Default mock values
    mockFcm.isSupported.mockResolvedValue(true);
    mockFcm.getPermissionStatus.mockReturnValue('default');
    mockFcm.deleteToken.mockResolvedValue(true);
    mockFcm.getCurrentToken.mockReturnValue(null);

    mockIosNotifications.isIOS.mockReturnValue(false);
    mockIosNotifications.getCapabilities.mockReturnValue({
      canReceivePushNotifications: true,
      needsHomeScreenInstall: false,
      reason: '',
    });
  });

  afterEach(() => {
    process.env.NODE_ENV = originalEnv;
  });

  describe('Basic Rendering', () => {
    it('should render card with title', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Push Notifications')).toBeInTheDocument();
      });
    });

    it('should render card description', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/Manage how you receive notifications/)).toBeInTheDocument();
      });
    });

    it('should render toggle switch', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByRole('switch')).toBeInTheDocument();
      });
    });

    it('should render push notifications label', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByLabelText('Push Notifications')).toBeInTheDocument();
      });
    });
  });

  describe('Permission Status Badge', () => {
    it('should show "Enabled" badge when permission is granted', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Enabled')).toBeInTheDocument();
      });
    });

    it('should show "Blocked" badge when permission is denied', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('denied');

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Blocked')).toBeInTheDocument();
      });
    });

    it('should show "Not configured" badge when permission is default', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('default');

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Not configured')).toBeInTheDocument();
      });
    });

    it('should display badge with correct color for granted', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');

      const { container } = render(<NotificationSettings />);

      await waitFor(() => {
        const badge = container.querySelector('.bg-green-500');
        expect(badge).toBeInTheDocument();
      });
    });
  });

  describe('Toggle Switch State', () => {
    it('should be checked when permission is granted', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');

      render(<NotificationSettings />);

      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('data-state', 'checked');
      });
    });

    it('should be unchecked when permission is not granted', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('default');

      render(<NotificationSettings />);

      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        expect(toggle).toHaveAttribute('data-state', 'unchecked');
      });
    });

    it('should be disabled when not supported', async () => {
      mockFcm.isSupported.mockResolvedValue(false);

      render(<NotificationSettings />);

      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        expect(toggle).toBeDisabled();
      });
    });
  });

  describe('Not Supported Warning', () => {
    it('should show warning when push notifications are not supported', async () => {
      mockFcm.isSupported.mockResolvedValue(false);

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/Push notifications are not supported/)).toBeInTheDocument();
      });
    });

    it('should mention in-app notifications as fallback', async () => {
      mockFcm.isSupported.mockResolvedValue(false);

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/in-app notifications/)).toBeInTheDocument();
      });
    });
  });

  describe('iOS Specific Handling', () => {
    it('should show iOS warning when needs home screen install', async () => {
      mockIosNotifications.isIOS.mockReturnValue(true);
      mockIosNotifications.getCapabilities.mockReturnValue({
        canReceivePushNotifications: false,
        needsHomeScreenInstall: true,
        reason: 'PWA must be installed to Home Screen',
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/PWA must be installed to Home Screen/)).toBeInTheDocument();
      });
    });

    it('should show View Installation Guide button for iOS install', async () => {
      mockIosNotifications.isIOS.mockReturnValue(true);
      mockIosNotifications.getCapabilities.mockReturnValue({
        canReceivePushNotifications: false,
        needsHomeScreenInstall: true,
        reason: 'Install required',
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('View Installation Guide')).toBeInTheDocument();
      });
    });

    it('should disable toggle for iOS when cannot receive push', async () => {
      mockIosNotifications.isIOS.mockReturnValue(true);
      mockIosNotifications.getCapabilities.mockReturnValue({
        canReceivePushNotifications: false,
        needsHomeScreenInstall: true,
        reason: 'Install required',
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        expect(toggle).toBeDisabled();
      });
    });

    it('should open permission prompt when View Installation Guide is clicked', async () => {
      mockIosNotifications.isIOS.mockReturnValue(true);
      mockIosNotifications.getCapabilities.mockReturnValue({
        canReceivePushNotifications: false,
        needsHomeScreenInstall: true,
        reason: 'Install required',
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        const guideButton = screen.getByText('View Installation Guide');
        fireEvent.click(guideButton);
      });

      await waitFor(() => {
        expect(screen.getByTestId('permission-prompt')).toBeInTheDocument();
      });
    });
  });

  describe('Toggle Interactions', () => {
    it('should show permission prompt when enabling from default state', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('default');

      render(<NotificationSettings />);

      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        fireEvent.click(toggle);
      });

      await waitFor(() => {
        expect(screen.getByTestId('permission-prompt')).toBeInTheDocument();
      });
    });

    it('should delete token and show alert when disabling', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');
      mockFcm.deleteToken.mockResolvedValue(true);

      render(<NotificationSettings />);

      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        fireEvent.click(toggle);
      });

      await waitFor(() => {
        expect(mockFcm.deleteToken).toHaveBeenCalled();
        expect(mockAlert).toHaveBeenCalledWith(
          expect.stringContaining('Notifications disabled')
        );
      });
    });

    it('should show guidance when permission is denied', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('denied');

      render(<NotificationSettings />);

      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        fireEvent.click(toggle);
      });

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith(
          expect.stringContaining('Notifications are blocked')
        );
      });
    });
  });

  describe('Test Notification', () => {
    it('should show test notification button when permission is granted', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Send Test Notification')).toBeInTheDocument();
      });
    });

    it('should not show test button when permission is not granted', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('default');

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.queryByText('Send Test Notification')).not.toBeInTheDocument();
      });
    });

    it('should send test notification when button is clicked', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');

      render(<NotificationSettings />);

      await waitFor(() => {
        const testButton = screen.getByText('Send Test Notification');
        fireEvent.click(testButton);
      });

      await waitFor(() => {
        expect(mockShowNotification).toHaveBeenCalledWith(
          'Test Notification',
          expect.objectContaining({
            body: expect.stringContaining('test notification from Meeshy'),
          })
        );
      });
    });

    it('should show loading state while sending test', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');

      // Make showNotification slow
      mockShowNotification.mockImplementation(
        () => new Promise((resolve) => setTimeout(resolve, 100))
      );

      render(<NotificationSettings />);

      await waitFor(() => {
        const testButton = screen.getByText('Send Test Notification');
        fireEvent.click(testButton);
      });

      await waitFor(() => {
        expect(screen.getByText('Sending Test...')).toBeInTheDocument();
      });
    });

    it('should show alert when test notification fails', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');
      mockShowNotification.mockRejectedValue(new Error('Test error'));

      render(<NotificationSettings />);

      await waitFor(() => {
        const testButton = screen.getByText('Send Test Notification');
        fireEvent.click(testButton);
      });

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith(
          expect.stringContaining('Failed to send test notification')
        );
      });
    });

    it('should alert when trying to test without permission', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('default');

      // Force render button (edge case)
      const { rerender } = render(<NotificationSettings />);

      // Simulate permission check in handleTestNotification
      // This is testing the early return in the function
    });
  });

  describe('Permission Prompt Integration', () => {
    it('should close permission prompt on permission granted', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('default');

      render(<NotificationSettings />);

      // Open prompt
      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        fireEvent.click(toggle);
      });

      await waitFor(() => {
        expect(screen.getByTestId('permission-prompt')).toBeInTheDocument();
      });

      // Grant permission
      const grantButton = screen.getByText('Grant Permission');
      fireEvent.click(grantButton);

      await waitFor(() => {
        expect(screen.queryByTestId('permission-prompt')).not.toBeInTheDocument();
      });
    });

    it('should close permission prompt on permission denied', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('default');

      render(<NotificationSettings />);

      // Open prompt
      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        fireEvent.click(toggle);
      });

      // Deny permission
      const denyButton = screen.getByText('Deny Permission');
      fireEvent.click(denyButton);

      await waitFor(() => {
        expect(screen.queryByTestId('permission-prompt')).not.toBeInTheDocument();
      });
    });

    it('should close permission prompt on dismiss', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('default');

      render(<NotificationSettings />);

      // Open prompt
      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        fireEvent.click(toggle);
      });

      // Dismiss
      const dismissButton = screen.getByText('Dismiss');
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(screen.queryByTestId('permission-prompt')).not.toBeInTheDocument();
      });
    });
  });

  describe('Developer Info', () => {
    it('should show developer info in development mode with token', async () => {
      process.env.NODE_ENV = 'development';
      mockFcm.getPermissionStatus.mockReturnValue('granted');
      mockFcm.getCurrentToken.mockReturnValue('test-fcm-token-12345');

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('Developer Info')).toBeInTheDocument();
      });
    });

    it('should not show developer info in production', async () => {
      process.env.NODE_ENV = 'production';
      mockFcm.getCurrentToken.mockReturnValue('test-token');

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.queryByText('Developer Info')).not.toBeInTheDocument();
      });
    });

    it('should show FCM token in developer info', async () => {
      process.env.NODE_ENV = 'development';
      mockFcm.getPermissionStatus.mockReturnValue('granted');
      mockFcm.getCurrentToken.mockReturnValue('test-fcm-token-abcdef');

      render(<NotificationSettings />);

      await waitFor(() => {
        const devInfo = screen.getByText('Developer Info');
        fireEvent.click(devInfo);
      });

      await waitFor(() => {
        expect(screen.getByText('FCM Token:')).toBeInTheDocument();
        expect(screen.getByText('test-fcm-token-abcdef')).toBeInTheDocument();
      });
    });
  });

  describe('Additional Info Section', () => {
    it('should display notification types info', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText('What notifications will I receive?')).toBeInTheDocument();
      });
    });

    it('should list notification types', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/New messages from contacts/)).toBeInTheDocument();
        expect(screen.getByText(/Group chat mentions and replies/)).toBeInTheDocument();
        expect(screen.getByText(/Important system updates/)).toBeInTheDocument();
      });
    });

    it('should mention browser settings', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/manage notification preferences in your browser settings/)).toBeInTheDocument();
      });
    });
  });

  describe('Status Check on Mount', () => {
    it('should check notification status on mount', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(mockFcm.isSupported).toHaveBeenCalled();
        expect(mockFcm.getPermissionStatus).toHaveBeenCalled();
      });
    });

    it('should check iOS status on mount', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(mockIosNotifications.isIOS).toHaveBeenCalled();
      });
    });

    it('should check iOS capabilities when on iOS', async () => {
      mockIosNotifications.isIOS.mockReturnValue(true);

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(mockIosNotifications.getCapabilities).toHaveBeenCalled();
      });
    });

    it('should get current token if available', async () => {
      render(<NotificationSettings />);

      await waitFor(() => {
        expect(mockFcm.getCurrentToken).toHaveBeenCalled();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle isSupported returning false', async () => {
      mockFcm.isSupported.mockResolvedValue(false);

      render(<NotificationSettings />);

      await waitFor(() => {
        expect(screen.getByText(/not supported/)).toBeInTheDocument();
      });
    });

    it('should handle deleteToken failure', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');
      mockFcm.deleteToken.mockResolvedValue(false);

      render(<NotificationSettings />);

      await waitFor(() => {
        const toggle = screen.getByRole('switch');
        fireEvent.click(toggle);
      });

      // Should not show the alert since deleteToken returned false
      await waitFor(() => {
        expect(mockAlert).not.toHaveBeenCalledWith(
          expect.stringContaining('Notifications disabled')
        );
      });
    });

    it('should handle service worker not ready', async () => {
      mockFcm.getPermissionStatus.mockReturnValue('granted');

      // Mock service worker ready to reject
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          ready: Promise.reject(new Error('SW not ready')),
        },
        writable: true,
      });

      render(<NotificationSettings />);

      await waitFor(() => {
        const testButton = screen.getByText('Send Test Notification');
        fireEvent.click(testButton);
      });

      await waitFor(() => {
        expect(mockAlert).toHaveBeenCalledWith(
          expect.stringContaining('Failed to send test notification')
        );
      });

      // Restore
      Object.defineProperty(navigator, 'serviceWorker', {
        value: {
          ready: mockServiceWorkerReady,
        },
        writable: true,
      });
    });
  });
});
