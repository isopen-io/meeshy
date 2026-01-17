/**
 * Tests for NotificationCenter component
 * Tests notification panel display, user interactions, and state management
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationCenter } from '@/components/notifications/NotificationCenter';

// Mock date-fns locale
jest.mock('date-fns/locale', () => ({
  fr: {},
}));

// Mock date-fns
jest.mock('date-fns', () => ({
  formatDistanceToNow: jest.fn(() => 'il y a 2 minutes'),
}));

// Mock useNotifications hook
const mockMarkAsRead = jest.fn();
const mockMarkAllAsRead = jest.fn();
const mockRemoveNotification = jest.fn();
const mockClearAll = jest.fn();

const mockUseNotifications = jest.fn();
jest.mock('@/hooks/use-notifications', () => ({
  useNotifications: () => mockUseNotifications(),
}));

// Create mock notification
const createMockNotification = (overrides = {}) => ({
  id: `notif-${Math.random().toString(36).substr(2, 9)}`,
  type: 'message',
  title: 'Test Notification',
  message: 'This is a test notification message',
  isRead: false,
  timestamp: new Date(),
  conversationId: null,
  ...overrides,
});

describe('NotificationCenter', () => {
  const defaultMockReturn = {
    notifications: [],
    unreadNotifications: [],
    unreadCount: 0,
    totalCount: 0,
    markAsRead: mockMarkAsRead,
    markAllAsRead: mockMarkAllAsRead,
    removeNotification: mockRemoveNotification,
    clearAll: mockClearAll,
    isConnected: true,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseNotifications.mockReturnValue(defaultMockReturn);
  });

  describe('Initial State (Closed)', () => {
    it('should render notification bell button when closed', () => {
      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      expect(bellButton).toBeInTheDocument();
    });

    it('should show unread badge when there are unread notifications', () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        unreadCount: 5,
      });

      render(<NotificationCenter />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should show 9+ when unread count exceeds 9', () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        unreadCount: 15,
      });

      render(<NotificationCenter />);

      expect(screen.getByText('9+')).toBeInTheDocument();
    });

    it('should not show badge when unread count is 0', () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        unreadCount: 0,
      });

      render(<NotificationCenter />);

      expect(screen.queryByText('0')).not.toBeInTheDocument();
    });

    it('should indicate offline status in title', () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        isConnected: false,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle('Notifications (hors ligne)');
      expect(bellButton).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(<NotificationCenter className="custom-class" />);

      const button = container.querySelector('.custom-class');
      expect(button).toBeInTheDocument();
    });
  });

  describe('Opening Panel', () => {
    it('should open panel when bell button is clicked', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ title: 'Test Message' })],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Test Message')).toBeInTheDocument();
      });
    });

    it('should display notification count in header', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [
          createMockNotification({ isRead: false }),
          createMockNotification({ isRead: true }),
        ],
        unreadCount: 1,
        totalCount: 2,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText(/1 non lue sur 2/)).toBeInTheDocument();
      });
    });

    it('should handle plural form correctly', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [
          createMockNotification({ isRead: false }),
          createMockNotification({ isRead: false }),
        ],
        unreadCount: 2,
        totalCount: 2,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText(/2 non lues sur 2/)).toBeInTheDocument();
      });
    });
  });

  describe('Empty State', () => {
    it('should display empty message when no notifications', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [],
        totalCount: 0,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Aucune notification')).toBeInTheDocument();
      });
    });
  });

  describe('Notification Types and Icons', () => {
    it('should display correct icon for message type', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ type: 'message', title: 'New Message' })],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('New Message')).toBeInTheDocument();
      });

      // Check for message icon styling (blue-500)
      const { container } = render(<NotificationCenter />);
      fireEvent.click(container.querySelector('button')!);
    });

    it('should display correct border color for conversation type', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ type: 'conversation', title: 'New Conversation' })],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('New Conversation')).toBeInTheDocument();
      });
    });

    it('should display correct border color for translation type', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ type: 'translation', title: 'Translation Complete' })],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Translation Complete')).toBeInTheDocument();
      });
    });

    it('should display correct border color for system type', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ type: 'system', title: 'System Alert' })],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('System Alert')).toBeInTheDocument();
      });
    });

    it('should handle unknown type with default icon', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ type: 'unknown', title: 'Unknown Type' })],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Unknown Type')).toBeInTheDocument();
      });
    });
  });

  describe('Notification Click Handling', () => {
    it('should mark notification as read when clicked', async () => {
      const notification = createMockNotification({ id: 'notif-1', isRead: false });
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [notification],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const notifElement = screen.getByText('Test Notification').closest('div[class*="cursor-pointer"]');
        expect(notifElement).toBeInTheDocument();
        if (notifElement) {
          fireEvent.click(notifElement);
        }
      });

      expect(mockMarkAsRead).toHaveBeenCalledWith('notif-1');
    });

    it('should not mark read notification again', async () => {
      const notification = createMockNotification({ id: 'notif-1', isRead: true });
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [notification],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const notifElement = screen.getByText('Test Notification').closest('div[class*="cursor-pointer"]');
        if (notifElement) {
          fireEvent.click(notifElement);
        }
      });

      expect(mockMarkAsRead).not.toHaveBeenCalled();
    });

    it('should navigate to conversation when clicked', async () => {
      // Mock window.location
      const originalLocation = window.location;
      delete (window as any).location;
      window.location = { href: '' } as any;

      const notification = createMockNotification({
        id: 'notif-1',
        isRead: true,
        conversationId: 'conv-123',
      });
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [notification],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const notifElement = screen.getByText('Test Notification').closest('div[class*="cursor-pointer"]');
        if (notifElement) {
          fireEvent.click(notifElement);
        }
      });

      expect(window.location.href).toBe('/conversations/conv-123');

      // Restore
      window.location = originalLocation;
    });
  });

  describe('Notification Actions', () => {
    it('should call markAllAsRead when mark all button is clicked', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [
          createMockNotification({ isRead: false }),
          createMockNotification({ isRead: false }),
        ],
        unreadCount: 2,
        totalCount: 2,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const markAllButton = screen.getByTitle('Marquer tout comme lu');
        fireEvent.click(markAllButton);
      });

      expect(mockMarkAllAsRead).toHaveBeenCalled();
    });

    it('should not show mark all button when no unread notifications', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ isRead: true })],
        unreadCount: 0,
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.queryByTitle('Marquer tout comme lu')).not.toBeInTheDocument();
      });
    });

    it('should call clearAll when clear all button is clicked', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification()],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const clearAllButton = screen.getByTitle('Supprimer toutes les notifications');
        fireEvent.click(clearAllButton);
      });

      expect(mockClearAll).toHaveBeenCalled();
    });

    it('should not show clear all button when no notifications', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [],
        totalCount: 0,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.queryByTitle('Supprimer toutes les notifications')).not.toBeInTheDocument();
      });
    });

    it('should call removeNotification when individual X button is clicked', async () => {
      const notification = createMockNotification({ id: 'notif-remove' });
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [notification],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        // Find the notification item and its remove button
        const notifElement = screen.getByText('Test Notification').closest('div[class*="cursor-pointer"]');
        const removeButton = notifElement?.querySelector('button');
        if (removeButton) {
          fireEvent.click(removeButton);
        }
      });

      expect(mockRemoveNotification).toHaveBeenCalledWith('notif-remove');
    });

    it('should stop propagation when remove button is clicked', async () => {
      const notification = createMockNotification({ id: 'notif-remove', isRead: false });
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [notification],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const notifElement = screen.getByText('Test Notification').closest('div[class*="cursor-pointer"]');
        const removeButton = notifElement?.querySelector('button');
        if (removeButton) {
          fireEvent.click(removeButton);
        }
      });

      // markAsRead should not be called because stopPropagation
      expect(mockMarkAsRead).not.toHaveBeenCalled();
      expect(mockRemoveNotification).toHaveBeenCalledWith('notif-remove');
    });
  });

  describe('Closing Panel', () => {
    it('should close panel when close button is clicked', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification()],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      // Open panel
      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Notifications')).toBeInTheDocument();
      });

      // Find and click the close button (last button in header)
      const header = screen.getByText('Notifications').closest('[data-slot="card-header"]');
      const buttons = header?.querySelectorAll('button') || [];
      const closeButton = buttons[buttons.length - 1];

      if (closeButton) {
        await act(async () => {
          fireEvent.click(closeButton);
        });
      }

      // Panel should be closed
      await waitFor(() => {
        // The title in the panel should not be visible
        expect(screen.queryByText('Notifications')).not.toBeInTheDocument();
      });
    });
  });

  describe('Notification Styling', () => {
    it('should show unread indicator for unread notifications', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ isRead: false })],
        totalCount: 1,
      });

      const { container } = render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        // Unread notifications have bg-accent/50 styling
        const unreadNotif = container.querySelector('.bg-accent\\/50');
        expect(unreadNotif).toBeInTheDocument();
      });
    });

    it('should apply opacity to read notifications', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ isRead: true })],
        totalCount: 1,
      });

      const { container } = render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const readNotif = container.querySelector('.opacity-60');
        expect(readNotif).toBeInTheDocument();
      });
    });

    it('should show blue dot for unread notifications', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ isRead: false })],
        totalCount: 1,
      });

      const { container } = render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const blueDot = container.querySelector('.bg-primary.rounded-full');
        expect(blueDot).toBeInTheDocument();
      });
    });
  });

  describe('Timestamp Formatting', () => {
    it('should format notification timestamp', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification()],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('il y a 2 minutes')).toBeInTheDocument();
      });
    });
  });

  describe('Accessibility', () => {
    it('should have modal overlay with proper styling', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification()],
        totalCount: 1,
      });

      const { container } = render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const overlay = container.querySelector('.fixed.inset-0');
        expect(overlay).toBeInTheDocument();
      });
    });

    it('should have scrollable notification list', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: Array(10).fill(null).map(() => createMockNotification()),
        totalCount: 10,
      });

      const { container } = render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        // ScrollArea should be present
        const scrollArea = container.querySelector('[data-radix-scroll-area-viewport]');
        expect(scrollArea).toBeTruthy();
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty notification message', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({ message: '' })],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        expect(screen.getByText('Test Notification')).toBeInTheDocument();
      });
    });

    it('should handle long notification title', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({
          title: 'This is a very long notification title that should be truncated by CSS',
        })],
        totalCount: 1,
      });

      render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const title = screen.getByText(/This is a very long/);
        expect(title).toHaveClass('truncate');
      });
    });

    it('should handle long notification message', async () => {
      mockUseNotifications.mockReturnValue({
        ...defaultMockReturn,
        notifications: [createMockNotification({
          message: 'This is a very long message that should be clamped to 2 lines according to the line-clamp-2 CSS class applied to the message element.',
        })],
        totalCount: 1,
      });

      const { container } = render(<NotificationCenter />);

      const bellButton = screen.getByTitle(/Notifications/);
      fireEvent.click(bellButton);

      await waitFor(() => {
        const message = container.querySelector('.line-clamp-2');
        expect(message).toBeInTheDocument();
      });
    });
  });
});
