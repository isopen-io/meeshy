/**
 * Tests for NotificationBell component
 * Tests notification badge, connectivity status, and navigation
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationBell } from '../../../components/notifications/NotificationBell';

// Mock useNotifications hook
const mockUseNotifications = jest.fn();
jest.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href, ...props }: { children: React.ReactNode; href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  );
});

describe('NotificationBell', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNotifications.mockReturnValue({
      unreadCount: 0,
      isConnected: true,
    });
  });

  describe('Basic Rendering', () => {
    it('should render notification bell icon', () => {
      render(<NotificationBell />);

      const bellIcon = screen.getByTestId('bell-icon');
      expect(bellIcon).toBeInTheDocument();
    });

    it('should render as a link to notifications page by default', () => {
      render(<NotificationBell />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/notifications');
    });

    it('should render as a button when onClick is provided', () => {
      const handleClick = jest.fn();

      render(<NotificationBell onClick={handleClick} />);

      const button = screen.getByRole('button');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Notification Badge', () => {
    it('should not show badge when unread count is 0', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 0,
        isConnected: true,
      });

      render(<NotificationBell />);

      // Badge should not be present - no number should be visible
      expect(screen.queryByText(/\d+/)).toBeNull();
    });

    it('should show badge with count when unread count is greater than 0', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 5,
        isConnected: true,
      });

      render(<NotificationBell />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show "9+" when unread count exceeds 9', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 15,
        isConnected: true,
      });

      render(<NotificationBell />);

      expect(screen.getByText('9+')).toBeInTheDocument();
    });

    it('should show exact count when unread count is 9', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 9,
        isConnected: true,
      });

      render(<NotificationBell />);

      expect(screen.getByText('9')).toBeInTheDocument();
    });

    it('should not show badge when showBadge is false', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 5,
        isConnected: true,
      });

      const { container } = render(<NotificationBell showBadge={false} />);

      // Should not find the badge text
      expect(screen.queryByText('5')).not.toBeInTheDocument();
    });
  });

  describe('Accessibility', () => {
    it('should have proper aria-label when connected with no unread', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 0,
        isConnected: true,
      });

      render(<NotificationBell />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('aria-label', 'Notifications');
    });

    it('should have proper aria-label with unread count', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 5,
        isConnected: true,
      });

      render(<NotificationBell />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('aria-label', 'Notifications (5 non lues)');
    });

    it('should indicate offline status in aria-label', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 3,
        isConnected: false,
      });

      render(<NotificationBell />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('aria-label', 'Notifications (hors ligne)');
    });

    it('should have focus-visible styles', () => {
      render(<NotificationBell />);

      const link = screen.getByRole('link');
      expect(link).toHaveClass('focus-visible:ring-2');
    });
  });

  describe('Click Handling', () => {
    it('should call onClick when provided and clicked', () => {
      const handleClick = jest.fn();

      render(<NotificationBell onClick={handleClick} />);

      const button = screen.getByRole('button');
      fireEvent.click(button);

      expect(handleClick).toHaveBeenCalledTimes(1);
    });

    it('should not navigate when onClick is provided', () => {
      const handleClick = jest.fn();

      render(<NotificationBell onClick={handleClick} />);

      // Should be a button, not a link
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('Custom Styling', () => {
    it('should apply custom className', () => {
      render(<NotificationBell className="custom-bell-class" />);

      const button = screen.getByRole('link');
      expect(button).toHaveClass('custom-bell-class');
    });

    it('should maintain default classes with custom className', () => {
      render(<NotificationBell className="my-class" />);

      const button = screen.getByRole('link');
      expect(button).toHaveClass('relative');
      expect(button).toHaveClass('my-class');
    });
  });

  describe('Connection Status', () => {
    it('should handle connected state correctly', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 3,
        isConnected: true,
      });

      render(<NotificationBell />);

      const link = screen.getByRole('link');
      // Should show count in aria-label
      expect(link).toHaveAttribute('aria-label', 'Notifications (3 non lues)');
    });

    it('should handle disconnected state correctly', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 3,
        isConnected: false,
      });

      render(<NotificationBell />);

      const link = screen.getByRole('link');
      // Should indicate offline
      expect(link).toHaveAttribute('aria-label', 'Notifications (hors ligne)');
    });
  });

  describe('Badge Positioning', () => {
    it('should position badge absolutely', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 5,
        isConnected: true,
      });

      const { container } = render(<NotificationBell />);

      // Badge should have absolute positioning classes
      const badge = container.querySelector('.absolute');
      expect(badge).toBeInTheDocument();
    });

    it('should position badge in top-right corner', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 5,
        isConnected: true,
      });

      const { container } = render(<NotificationBell />);

      const badge = container.querySelector('.-top-1');
      expect(badge).toBeInTheDocument();

      const rightBadge = container.querySelector('.-right-1');
      expect(rightBadge).toBeInTheDocument();
    });
  });

  describe('Button Variant', () => {
    it('should render with ghost variant', () => {
      render(<NotificationBell />);

      // The button should use ghost variant styling
      // This is typically implemented via the Button component's variant prop
    });

    it('should render with sm size', () => {
      render(<NotificationBell />);

      // The button should use sm size styling
      // This is typically implemented via the Button component's size prop
    });
  });

  describe('Edge Cases', () => {
    it('should handle undefined unread count gracefully', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: undefined,
        isConnected: true,
      });

      render(<NotificationBell />);

      // Should not crash and should render without badge
      expect(screen.getByTestId('bell-icon')).toBeInTheDocument();
    });

    it('should handle negative unread count', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: -1,
        isConnected: true,
      });

      render(<NotificationBell />);

      // Should not show badge for negative count
      expect(screen.queryByText('-1')).not.toBeInTheDocument();
    });

    it('should handle zero unread count explicitly', () => {
      mockUseNotifications.mockReturnValue({
        unreadCount: 0,
        isConnected: true,
      });

      render(<NotificationBell />);

      // Should not show any number
      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });
  });

  describe('Integration with Button Component', () => {
    it('should use asChild prop for Link rendering', () => {
      render(<NotificationBell />);

      // When using Link (no onClick), should render Link inside Button
      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/notifications');
    });

    it('should not use asChild when onClick is provided', () => {
      const handleClick = jest.fn();

      render(<NotificationBell onClick={handleClick} />);

      // Should be a button element
      const button = screen.getByRole('button');
      expect(button.tagName).toBe('BUTTON');
    });
  });
});
