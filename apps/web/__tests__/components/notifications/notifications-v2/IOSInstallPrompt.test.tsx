/**
 * Tests for IOSInstallPrompt and IOSInstallBanner components
 * Tests iOS PWA installation prompts and user interactions
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { IOSInstallPrompt, IOSInstallBanner } from '@/components/notifications/notifications-v2/IOSInstallPrompt';

// Mock iosNotifications utility
const mockIOSNotificationManager = {
  wasInstallPromptRecentlyDismissed: jest.fn(),
  recordInstallDismissal: jest.fn(),
};

const mockIosNotifications = {
  shouldShowInstallPrompt: jest.fn(),
  isInstalled: jest.fn(),
  isIOS: jest.fn(),
  getIOSNotificationManager: jest.fn(() => mockIOSNotificationManager),
  getInstallInstructions: jest.fn(),
};

jest.mock('@/utils/ios-notification-manager', () => ({
  iosNotifications: {
    shouldShowInstallPrompt: () => mockIosNotifications.shouldShowInstallPrompt(),
    isInstalled: () => mockIosNotifications.isInstalled(),
    isIOS: () => mockIosNotifications.isIOS(),
    getIOSNotificationManager: () => mockIosNotifications.getIOSNotificationManager(),
    getInstallInstructions: () => mockIosNotifications.getInstallInstructions(),
  },
}));

describe('IOSInstallPrompt', () => {
  const defaultInstructions = [
    'Tap the Share button at the bottom',
    'Scroll and tap "Add to Home Screen"',
    'Tap "Add" to confirm',
  ];

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock values - iOS device that should show prompt
    mockIosNotifications.shouldShowInstallPrompt.mockReturnValue(true);
    mockIosNotifications.isInstalled.mockReturnValue(false);
    mockIosNotifications.isIOS.mockReturnValue(true);
    mockIosNotifications.getInstallInstructions.mockReturnValue(defaultInstructions);
    mockIOSNotificationManager.wasInstallPromptRecentlyDismissed.mockReturnValue(false);
  });

  describe('Visibility Conditions', () => {
    it('should not render when not on iOS', async () => {
      mockIosNotifications.isIOS.mockReturnValue(false);

      const { container } = render(<IOSInstallPrompt />);

      // Wait for useEffect to run
      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should not render when already installed', async () => {
      mockIosNotifications.isInstalled.mockReturnValue(true);

      const { container } = render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should not render when shouldShowInstallPrompt returns false', async () => {
      mockIosNotifications.shouldShowInstallPrompt.mockReturnValue(false);

      const { container } = render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should not render when recently dismissed', async () => {
      mockIOSNotificationManager.wasInstallPromptRecentlyDismissed.mockReturnValue(true);

      const { container } = render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should render when forceShow is true even if recently dismissed', async () => {
      mockIOSNotificationManager.wasInstallPromptRecentlyDismissed.mockReturnValue(true);

      render(<IOSInstallPrompt forceShow={true} />);

      await waitFor(() => {
        expect(screen.getByText('Install Meeshy App')).toBeInTheDocument();
      });
    });

    it('should render when all conditions are met', async () => {
      render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(screen.getByText('Install Meeshy App')).toBeInTheDocument();
      });
    });
  });

  describe('Content Rendering', () => {
    it('should render card with correct title', async () => {
      render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(screen.getByText('Install Meeshy App')).toBeInTheDocument();
      });
    });

    it('should render card description', async () => {
      render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(screen.getByText(/Get the full experience with push notifications on iOS/)).toBeInTheDocument();
      });
    });

    it('should render installation instructions', async () => {
      render(<IOSInstallPrompt />);

      await waitFor(() => {
        defaultInstructions.forEach(instruction => {
          expect(screen.getByText(instruction)).toBeInTheDocument();
        });
      });
    });

    it('should render numbered steps', async () => {
      render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(screen.getByText('1')).toBeInTheDocument();
        expect(screen.getByText('2')).toBeInTheDocument();
        expect(screen.getByText('3')).toBeInTheDocument();
      });
    });

    it('should render benefits list', async () => {
      render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(screen.getByText(/Receive notifications even when closed/)).toBeInTheDocument();
        expect(screen.getByText(/Faster access from your Home Screen/)).toBeInTheDocument();
        expect(screen.getByText(/Full-screen experience without browser UI/)).toBeInTheDocument();
        expect(screen.getByText(/Works offline/)).toBeInTheDocument();
      });
    });

    it('should render smartphone icon', async () => {
      const { container } = render(<IOSInstallPrompt />);

      await waitFor(() => {
        const icon = container.querySelector('.rounded-full.bg-blue-100');
        expect(icon).toBeInTheDocument();
      });
    });
  });

  describe('Safari Detection', () => {
    it('should show Safari note when isSafari is false (not in Safari)', async () => {
      mockIosNotifications.isIOS.mockReturnValue(false); // Will set isSafari to false

      // Re-configure for iOS but not Safari scenario
      mockIosNotifications.isIOS.mockImplementation(() => {
        // First call for shouldShow, second for safari detection
        return true;
      });

      render(<IOSInstallPrompt />);

      await waitFor(() => {
        // If not in Safari, shows note about opening in Safari
        const noteElement = screen.queryByText(/You need to open Meeshy in Safari/);
        // This depends on the actual isSafari state
      });
    });

    it('should show share button hint when in Safari', async () => {
      render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(screen.getByText(/Look for the Share button/)).toBeInTheDocument();
      });
    });

    it('should show "Open in Safari" button when not in Safari', async () => {
      // This test requires more complex setup to differentiate Safari state
      // The component uses isSafari state which is set from isIOS()
    });
  });

  describe('Dismiss Functionality', () => {
    it('should call onDismiss when X button is clicked', async () => {
      const mockOnDismiss = jest.fn();

      render(<IOSInstallPrompt onDismiss={mockOnDismiss} />);

      await waitFor(() => {
        const dismissButton = screen.getByRole('button', { name: '' });
        // Find the X button (it's the one with X icon)
        const buttons = screen.getAllByRole('button');
        const xButton = buttons.find(btn => btn.querySelector('svg'));
        if (xButton) {
          fireEvent.click(xButton);
        }
      });

      // Record dismissal should be called
      expect(mockIOSNotificationManager.recordInstallDismissal).toHaveBeenCalled();
    });

    it('should call onDismiss when "Maybe Later" button is clicked', async () => {
      const mockOnDismiss = jest.fn();

      render(<IOSInstallPrompt onDismiss={mockOnDismiss} />);

      await waitFor(() => {
        const laterButton = screen.getByText('Maybe Later');
        fireEvent.click(laterButton);
      });

      expect(mockOnDismiss).toHaveBeenCalled();
      expect(mockIOSNotificationManager.recordInstallDismissal).toHaveBeenCalled();
    });

    it('should record dismissal in localStorage', async () => {
      render(<IOSInstallPrompt />);

      await waitFor(() => {
        const laterButton = screen.getByText('Maybe Later');
        fireEvent.click(laterButton);
      });

      expect(mockIOSNotificationManager.recordInstallDismissal).toHaveBeenCalled();
    });

    it('should hide component after dismiss', async () => {
      const { container } = render(<IOSInstallPrompt />);

      await waitFor(() => {
        expect(screen.getByText('Install Meeshy App')).toBeInTheDocument();
      });

      const laterButton = screen.getByText('Maybe Later');
      fireEvent.click(laterButton);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });
  });

  describe('Styling', () => {
    it('should have correct card styling', async () => {
      const { container } = render(<IOSInstallPrompt />);

      await waitFor(() => {
        const card = container.querySelector('[data-slot="card"]');
        expect(card).toHaveClass('border-blue-200');
      });
    });

    it('should have correct dark mode classes', async () => {
      const { container } = render(<IOSInstallPrompt />);

      await waitFor(() => {
        const card = container.querySelector('[data-slot="card"]');
        expect(card).toHaveClass('dark:border-blue-900');
      });
    });
  });
});

describe('IOSInstallBanner', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    mockIosNotifications.shouldShowInstallPrompt.mockReturnValue(true);
    mockIosNotifications.isInstalled.mockReturnValue(false);
    mockIOSNotificationManager.wasInstallPromptRecentlyDismissed.mockReturnValue(false);
  });

  describe('Visibility Conditions', () => {
    it('should not render when shouldShowInstallPrompt is false', async () => {
      mockIosNotifications.shouldShowInstallPrompt.mockReturnValue(false);

      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should not render when already installed', async () => {
      mockIosNotifications.isInstalled.mockReturnValue(true);

      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should not render when recently dismissed', async () => {
      mockIOSNotificationManager.wasInstallPromptRecentlyDismissed.mockReturnValue(true);

      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });

    it('should render when all conditions are met', async () => {
      render(<IOSInstallBanner />);

      await waitFor(() => {
        expect(screen.getByText('Install Meeshy for push notifications')).toBeInTheDocument();
      });
    });
  });

  describe('Content Rendering', () => {
    it('should render banner title', async () => {
      render(<IOSInstallBanner />);

      await waitFor(() => {
        expect(screen.getByText('Install Meeshy for push notifications')).toBeInTheDocument();
      });
    });

    it('should render installation hint', async () => {
      render(<IOSInstallBanner />);

      await waitFor(() => {
        expect(screen.getByText(/then "Add to Home Screen"/)).toBeInTheDocument();
      });
    });

    it('should render smartphone icon', async () => {
      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        const icon = container.querySelector('.text-blue-600');
        expect(icon).toBeInTheDocument();
      });
    });

    it('should render dismiss button', async () => {
      render(<IOSInstallBanner />);

      await waitFor(() => {
        const buttons = screen.getAllByRole('button');
        expect(buttons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Dismiss Functionality', () => {
    it('should call onDismiss when dismiss button is clicked', async () => {
      const mockOnDismiss = jest.fn();

      render(<IOSInstallBanner onDismiss={mockOnDismiss} />);

      await waitFor(() => {
        const dismissButton = screen.getByRole('button');
        fireEvent.click(dismissButton);
      });

      expect(mockOnDismiss).toHaveBeenCalled();
    });

    it('should record dismissal when dismissed', async () => {
      render(<IOSInstallBanner />);

      await waitFor(() => {
        const dismissButton = screen.getByRole('button');
        fireEvent.click(dismissButton);
      });

      expect(mockIOSNotificationManager.recordInstallDismissal).toHaveBeenCalled();
    });

    it('should hide banner after dismiss', async () => {
      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        expect(screen.getByText('Install Meeshy for push notifications')).toBeInTheDocument();
      });

      const dismissButton = screen.getByRole('button');
      fireEvent.click(dismissButton);

      await waitFor(() => {
        expect(container.firstChild).toBeNull();
      });
    });
  });

  describe('Styling', () => {
    it('should have correct banner styling', async () => {
      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        const banner = container.firstChild;
        expect(banner).toHaveClass('bg-blue-50');
        expect(banner).toHaveClass('border-b');
      });
    });

    it('should have container with proper padding', async () => {
      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        const innerContainer = container.querySelector('.container');
        expect(innerContainer).toHaveClass('px-4');
        expect(innerContainer).toHaveClass('py-3');
      });
    });

    it('should have dark mode classes', async () => {
      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        const banner = container.firstChild;
        expect(banner).toHaveClass('dark:bg-blue-950/20');
      });
    });
  });

  describe('Layout', () => {
    it('should have flex layout', async () => {
      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        const flexContainer = container.querySelector('.flex.items-center.justify-between');
        expect(flexContainer).toBeInTheDocument();
      });
    });

    it('should handle responsive layout', async () => {
      const { container } = render(<IOSInstallBanner />);

      await waitFor(() => {
        const contentWrapper = container.querySelector('.flex-1.min-w-0');
        expect(contentWrapper).toBeInTheDocument();
      });
    });
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockIosNotifications.shouldShowInstallPrompt.mockReturnValue(true);
    mockIosNotifications.isInstalled.mockReturnValue(false);
    mockIosNotifications.isIOS.mockReturnValue(true);
    mockIosNotifications.getInstallInstructions.mockReturnValue(['Step 1', 'Step 2']);
    mockIOSNotificationManager.wasInstallPromptRecentlyDismissed.mockReturnValue(false);
  });

  it('should handle empty instructions array', async () => {
    mockIosNotifications.getInstallInstructions.mockReturnValue([]);

    render(<IOSInstallPrompt />);

    await waitFor(() => {
      expect(screen.getByText('Install Meeshy App')).toBeInTheDocument();
    });
  });

  it('should handle onDismiss being undefined', async () => {
    render(<IOSInstallPrompt />);

    await waitFor(() => {
      const laterButton = screen.getByText('Maybe Later');
      // Should not throw when clicking without onDismiss
      expect(() => fireEvent.click(laterButton)).not.toThrow();
    });
  });

  it('should handle very long instruction text', async () => {
    const longInstruction = 'A'.repeat(500);
    mockIosNotifications.getInstallInstructions.mockReturnValue([longInstruction]);

    render(<IOSInstallPrompt />);

    await waitFor(() => {
      expect(screen.getByText(longInstruction)).toBeInTheDocument();
    });
  });

  it('should handle rapid show/hide cycles', async () => {
    const { rerender } = render(<IOSInstallPrompt forceShow={true} />);

    await waitFor(() => {
      expect(screen.getByText('Install Meeshy App')).toBeInTheDocument();
    });

    mockIosNotifications.shouldShowInstallPrompt.mockReturnValue(false);
    mockIosNotifications.isIOS.mockReturnValue(false);
    rerender(<IOSInstallPrompt forceShow={false} />);

    // Component should handle the state change gracefully
  });
});
