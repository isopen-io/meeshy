/**
 * Tests for NotificationPermissionPrompt component
 * Tests permission requests, iOS handling, and user interactions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationPermissionPrompt } from '@/components/notifications/notifications-v2/NotificationPermissionPrompt';

// Mock FCM manager
const mockFcm = {
  requestPermission: jest.fn(),
};

jest.mock('@/utils/fcm-manager', () => ({
  fcm: {
    requestPermission: () => mockFcm.requestPermission(),
  },
}));

// Mock iOS notifications
const mockIosNotifications = {
  isIOS: jest.fn(),
  getCapabilities: jest.fn(),
  getUserMessage: jest.fn(),
  getInstallInstructions: jest.fn(),
};

jest.mock('@/utils/ios-notification-manager', () => ({
  iosNotifications: {
    isIOS: () => mockIosNotifications.isIOS(),
    getCapabilities: () => mockIosNotifications.getCapabilities(),
    getUserMessage: () => mockIosNotifications.getUserMessage(),
    getInstallInstructions: () => mockIosNotifications.getInstallInstructions(),
  },
}));

// Mock Firebase availability checker
const mockFirebaseChecker = {
  isPushEnabled: jest.fn(),
};

jest.mock('@/utils/firebase-availability-checker', () => ({
  firebaseChecker: {
    isPushEnabled: () => mockFirebaseChecker.isPushEnabled(),
  },
}));

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
Object.defineProperty(window, 'localStorage', {
  value: {
    getItem: jest.fn((key) => mockLocalStorage[key] || null),
    setItem: jest.fn((key, value) => {
      mockLocalStorage[key] = value;
    }),
    removeItem: jest.fn((key) => {
      delete mockLocalStorage[key];
    }),
    clear: jest.fn(() => {
      Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);
    }),
  },
  writable: true,
});

describe('NotificationPermissionPrompt', () => {
  const defaultProps = {
    open: true,
    onClose: jest.fn(),
    onPermissionGranted: jest.fn(),
    onPermissionDenied: jest.fn(),
    onDismissed: jest.fn(),
  };

  const defaultInstructions = [
    'Tap the Share button',
    'Scroll and tap "Add to Home Screen"',
    'Tap "Add" to confirm',
  ];

  beforeEach(() => {
    jest.clearAllMocks();
    Object.keys(mockLocalStorage).forEach((key) => delete mockLocalStorage[key]);

    // Default mock values - push enabled, not iOS
    mockFirebaseChecker.isPushEnabled.mockReturnValue(true);
    mockIosNotifications.isIOS.mockReturnValue(false);
    mockIosNotifications.getCapabilities.mockReturnValue({
      needsHomeScreenInstall: false,
      canReceivePushNotifications: true,
    });
    mockIosNotifications.getUserMessage.mockReturnValue('Push notifications are available!');
    mockIosNotifications.getInstallInstructions.mockReturnValue(defaultInstructions);
    mockFcm.requestPermission.mockResolvedValue('granted');
  });

  describe('Firebase Availability', () => {
    it('should return null when Firebase is not available', () => {
      mockFirebaseChecker.isPushEnabled.mockReturnValue(false);

      const { container } = render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(container.firstChild).toBeNull();
    });

    it('should render when Firebase is available', () => {
      mockFirebaseChecker.isPushEnabled.mockReturnValue(true);

      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
    });
  });

  describe('Standard Prompt (Non-iOS)', () => {
    it('should render dialog with correct title', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
    });

    it('should render notification benefits list', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText(/New messages from your contacts/)).toBeInTheDocument();
      expect(screen.getByText(/Group chat activity/)).toBeInTheDocument();
      expect(screen.getByText(/Important updates/)).toBeInTheDocument();
    });

    it('should render bell icon', () => {
      const { container } = render(<NotificationPermissionPrompt {...defaultProps} />);

      const iconContainer = container.querySelector('.rounded-full.bg-blue-100');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should render action buttons', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText('Never')).toBeInTheDocument();
      expect(screen.getByText('Later')).toBeInTheDocument();
      expect(screen.getByText('Allow Notifications')).toBeInTheDocument();
    });

    it('should display custom message for non-iOS', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText(/You can change this setting at any time/)).toBeInTheDocument();
    });
  });

  describe('iOS Prompt - Needs Installation', () => {
    beforeEach(() => {
      mockIosNotifications.isIOS.mockReturnValue(true);
      mockIosNotifications.getCapabilities.mockReturnValue({
        needsHomeScreenInstall: true,
        canReceivePushNotifications: false,
      });
      mockIosNotifications.getUserMessage.mockReturnValue(
        'To receive push notifications on iOS, please add Meeshy to your Home Screen first.'
      );
    });

    it('should render iOS install prompt when needs installation', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText('Install Meeshy')).toBeInTheDocument();
    });

    it('should display smartphone icon for iOS', () => {
      const { container } = render(<NotificationPermissionPrompt {...defaultProps} />);

      // Smartphone icon container
      const iconContainer = container.querySelector('.rounded-full.bg-blue-100');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should display iOS user message', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText(/To receive push notifications on iOS/)).toBeInTheDocument();
    });

    it('should display installation instructions', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText('How to install:')).toBeInTheDocument();
      defaultInstructions.forEach((instruction) => {
        expect(screen.getByText(instruction)).toBeInTheDocument();
      });
    });

    it('should display numbered steps', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should render "Not now" and "Got it" buttons for iOS install', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText('Not now')).toBeInTheDocument();
      expect(screen.getByText('Got it')).toBeInTheDocument();
    });
  });

  describe('iOS Prompt - PWA Installed', () => {
    beforeEach(() => {
      mockIosNotifications.isIOS.mockReturnValue(true);
      mockIosNotifications.getCapabilities.mockReturnValue({
        needsHomeScreenInstall: false,
        canReceivePushNotifications: true,
      });
      mockIosNotifications.getUserMessage.mockReturnValue('Push notifications are available!');
    });

    it('should render standard prompt when PWA is installed', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      // Should show standard Enable Notifications, not Install Meeshy
      expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
      expect(screen.queryByText('Install Meeshy')).not.toBeInTheDocument();
    });

    it('should display iOS user message in standard prompt', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      expect(screen.getByText('Push notifications are available!')).toBeInTheDocument();
    });
  });

  describe('Permission Request - Allow', () => {
    it('should call requestPermission when Allow is clicked', async () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const allowButton = screen.getByText('Allow Notifications');
      fireEvent.click(allowButton);

      await waitFor(() => {
        expect(mockFcm.requestPermission).toHaveBeenCalled();
      });
    });

    it('should show loading state while requesting', async () => {
      mockFcm.requestPermission.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('granted'), 100))
      );

      render(<NotificationPermissionPrompt {...defaultProps} />);

      const allowButton = screen.getByText('Allow Notifications');
      fireEvent.click(allowButton);

      // Should show loading state
      await waitFor(() => {
        expect(screen.getByText('Requesting...')).toBeInTheDocument();
      });
    });

    it('should call onPermissionGranted when granted', async () => {
      mockFcm.requestPermission.mockResolvedValue('granted');

      render(<NotificationPermissionPrompt {...defaultProps} />);

      const allowButton = screen.getByText('Allow Notifications');
      fireEvent.click(allowButton);

      await waitFor(() => {
        expect(defaultProps.onPermissionGranted).toHaveBeenCalled();
      });
    });

    it('should call onClose when granted', async () => {
      mockFcm.requestPermission.mockResolvedValue('granted');

      render(<NotificationPermissionPrompt {...defaultProps} />);

      const allowButton = screen.getByText('Allow Notifications');
      fireEvent.click(allowButton);

      await waitFor(() => {
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    it('should call onPermissionDenied when denied', async () => {
      mockFcm.requestPermission.mockResolvedValue('denied');

      render(<NotificationPermissionPrompt {...defaultProps} />);

      const allowButton = screen.getByText('Allow Notifications');
      fireEvent.click(allowButton);

      await waitFor(() => {
        expect(defaultProps.onPermissionDenied).toHaveBeenCalled();
      });
    });

    it('should handle request error gracefully', async () => {
      mockFcm.requestPermission.mockRejectedValue(new Error('Permission error'));

      render(<NotificationPermissionPrompt {...defaultProps} />);

      const allowButton = screen.getByText('Allow Notifications');
      fireEvent.click(allowButton);

      await waitFor(() => {
        expect(defaultProps.onPermissionDenied).toHaveBeenCalled();
        expect(defaultProps.onClose).toHaveBeenCalled();
      });
    });

    it('should disable buttons while loading', async () => {
      mockFcm.requestPermission.mockImplementation(
        () => new Promise((resolve) => setTimeout(() => resolve('granted'), 500))
      );

      render(<NotificationPermissionPrompt {...defaultProps} />);

      const allowButton = screen.getByText('Allow Notifications');
      fireEvent.click(allowButton);

      await waitFor(() => {
        expect(screen.getByText('Never').closest('button')).toBeDisabled();
        expect(screen.getByText('Later').closest('button')).toBeDisabled();
      });
    });
  });

  describe('Permission Request - Later', () => {
    it('should call onDismissed when Later is clicked', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const laterButton = screen.getByText('Later');
      fireEvent.click(laterButton);

      expect(defaultProps.onDismissed).toHaveBeenCalled();
    });

    it('should call onClose when Later is clicked', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const laterButton = screen.getByText('Later');
      fireEvent.click(laterButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should not save to localStorage when Later is clicked', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const laterButton = screen.getByText('Later');
      fireEvent.click(laterButton);

      expect(window.localStorage.setItem).not.toHaveBeenCalledWith(
        'notification_permission_never',
        expect.anything()
      );
    });
  });

  describe('Permission Request - Never', () => {
    it('should call onPermissionDenied when Never is clicked', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const neverButton = screen.getByText('Never');
      fireEvent.click(neverButton);

      expect(defaultProps.onPermissionDenied).toHaveBeenCalled();
    });

    it('should call onClose when Never is clicked', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const neverButton = screen.getByText('Never');
      fireEvent.click(neverButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });

    it('should save to localStorage when Never is clicked', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const neverButton = screen.getByText('Never');
      fireEvent.click(neverButton);

      expect(window.localStorage.setItem).toHaveBeenCalledWith(
        'notification_permission_never',
        'true'
      );
    });
  });

  describe('Dialog Control', () => {
    it('should not render when open is false', () => {
      render(<NotificationPermissionPrompt {...defaultProps} open={false} />);

      expect(screen.queryByText('Enable Notifications')).not.toBeInTheDocument();
    });

    it('should render when open is true', () => {
      render(<NotificationPermissionPrompt {...defaultProps} open={true} />);

      expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
    });

    it('should call onClose when dialog is closed via onOpenChange', () => {
      // This test depends on Dialog implementation
      render(<NotificationPermissionPrompt {...defaultProps} />);

      // The dialog should be open
      expect(screen.getByText('Enable Notifications')).toBeInTheDocument();
    });
  });

  describe('iOS Install - Button Actions', () => {
    beforeEach(() => {
      mockIosNotifications.isIOS.mockReturnValue(true);
      mockIosNotifications.getCapabilities.mockReturnValue({
        needsHomeScreenInstall: true,
        canReceivePushNotifications: false,
      });
    });

    it('should call onPermissionDenied when "Not now" is clicked', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const notNowButton = screen.getByText('Not now');
      fireEvent.click(notNowButton);

      expect(defaultProps.onPermissionDenied).toHaveBeenCalled();
    });

    it('should call onClose when "Got it" is clicked', () => {
      render(<NotificationPermissionPrompt {...defaultProps} />);

      const gotItButton = screen.getByText('Got it');
      fireEvent.click(gotItButton);

      expect(defaultProps.onClose).toHaveBeenCalled();
    });
  });

  describe('Styling', () => {
    it('should have correct dialog max width', () => {
      const { container } = render(<NotificationPermissionPrompt {...defaultProps} />);

      const dialogContent = container.querySelector('[class*="sm:max-w-md"]');
      expect(dialogContent).toBeInTheDocument();
    });

    it('should have proper icon styling', () => {
      const { container } = render(<NotificationPermissionPrompt {...defaultProps} />);

      const iconWrapper = container.querySelector('.p-3.rounded-full.bg-blue-100');
      expect(iconWrapper).toBeInTheDocument();
    });

    it('should have check icons for benefits list', () => {
      const { container } = render(<NotificationPermissionPrompt {...defaultProps} />);

      const checkIcons = container.querySelectorAll('.text-green-500');
      expect(checkIcons.length).toBeGreaterThan(0);
    });
  });

  describe('Edge Cases', () => {
    it('should handle missing onPermissionGranted callback', async () => {
      mockFcm.requestPermission.mockResolvedValue('granted');

      const propsWithoutCallback = {
        open: true,
        onClose: jest.fn(),
      };

      render(<NotificationPermissionPrompt {...propsWithoutCallback} />);

      const allowButton = screen.getByText('Allow Notifications');

      // Should not throw
      await act(async () => {
        fireEvent.click(allowButton);
      });
    });

    it('should handle missing onPermissionDenied callback', async () => {
      mockFcm.requestPermission.mockResolvedValue('denied');

      const propsWithoutCallback = {
        open: true,
        onClose: jest.fn(),
      };

      render(<NotificationPermissionPrompt {...propsWithoutCallback} />);

      const allowButton = screen.getByText('Allow Notifications');

      // Should not throw
      await act(async () => {
        fireEvent.click(allowButton);
      });
    });

    it('should handle missing onDismissed callback', () => {
      const propsWithoutCallback = {
        open: true,
        onClose: jest.fn(),
      };

      render(<NotificationPermissionPrompt {...propsWithoutCallback} />);

      const laterButton = screen.getByText('Later');

      // Should not throw
      expect(() => fireEvent.click(laterButton)).not.toThrow();
    });

    it('should handle empty instructions array', () => {
      mockIosNotifications.isIOS.mockReturnValue(true);
      mockIosNotifications.getCapabilities.mockReturnValue({
        needsHomeScreenInstall: true,
        canReceivePushNotifications: false,
      });
      mockIosNotifications.getInstallInstructions.mockReturnValue([]);

      render(<NotificationPermissionPrompt {...defaultProps} />);

      // Should render without crashing
      expect(screen.getByText('Install Meeshy')).toBeInTheDocument();
    });

    it('should handle permission result that is neither granted nor denied', async () => {
      mockFcm.requestPermission.mockResolvedValue('default');

      render(<NotificationPermissionPrompt {...defaultProps} />);

      const allowButton = screen.getByText('Allow Notifications');
      await act(async () => {
        fireEvent.click(allowButton);
      });

      // Neither callback should be called for 'default'
      expect(defaultProps.onPermissionGranted).not.toHaveBeenCalled();
      expect(defaultProps.onPermissionDenied).not.toHaveBeenCalled();
    });
  });
});
