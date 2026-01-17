/**
 * Tests for NotificationItem component
 * Tests notification display, actions, and navigation
 */

import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationItem } from '../../../components/notifications/notifications-v2/NotificationItem';
import { NotificationTypeEnum } from '@/types/notification';

// Mock useI18n hook
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'actions.accept': 'Accept',
        'actions.decline': 'Decline',
        'actions.callBack': 'Call Back',
        'actions.join': 'Join',
        'priorities.urgent': 'Urgent',
        'priorities.high': 'High',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock notification helpers
jest.mock('@/utils/notification-helpers', () => ({
  getNotificationIcon: jest.fn().mockReturnValue({
    emoji: '🔔',
    bgColor: 'bg-blue-100',
    color: 'text-blue-600',
  }),
  formatNotificationContext: jest.fn().mockReturnValue('2 minutes ago'),
  formatMessagePreview: jest.fn().mockReturnValue('Preview text'),
  getNotificationLink: jest.fn().mockReturnValue(null),
  requiresUserAction: jest.fn().mockReturnValue(false),
  buildNotificationTitle: jest.fn().mockReturnValue('Notification Title'),
  buildNotificationContent: jest.fn().mockReturnValue('Notification content here'),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href, onClick, className, ...props }: any) => (
    <a href={href} onClick={onClick} className={className} {...props}>
      {children}
    </a>
  );
});

// Create mock notification
const createMockNotification = (overrides = {}) => ({
  id: 'notif-123',
  type: NotificationTypeEnum.NEW_MESSAGE,
  isRead: false,
  priority: 'normal' as const,
  createdAt: new Date().toISOString(),
  metadata: {},
  context: {},
  sender: null,
  ...overrides,
});

describe('NotificationItem', () => {
  const mockOnRead = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnClick = jest.fn();
  const mockOnAfterNavigation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();

    // Reset mock implementations
    const helpers = require('@/utils/notification-helpers');
    helpers.getNotificationIcon.mockReturnValue({
      emoji: '🔔',
      bgColor: 'bg-blue-100',
      color: 'text-blue-600',
    });
    helpers.formatNotificationContext.mockReturnValue('2 minutes ago');
    helpers.getNotificationLink.mockReturnValue(null);
    helpers.requiresUserAction.mockReturnValue(false);
    helpers.buildNotificationTitle.mockReturnValue('Notification Title');
    helpers.buildNotificationContent.mockReturnValue('Notification content here');
  });

  describe('Basic Rendering', () => {
    it('should render notification item', () => {
      const notification = createMockNotification();

      render(<NotificationItem notification={notification} />);

      expect(screen.getByText('Notification Title')).toBeInTheDocument();
    });

    it('should render notification content', () => {
      const notification = createMockNotification();

      render(<NotificationItem notification={notification} />);

      expect(screen.getByText('Notification content here')).toBeInTheDocument();
    });

    it('should render context (timestamp)', () => {
      const notification = createMockNotification();

      render(<NotificationItem notification={notification} />);

      expect(screen.getByText('2 minutes ago')).toBeInTheDocument();
    });

    it('should render notification icon emoji when no sender', () => {
      const notification = createMockNotification({ sender: null });

      render(<NotificationItem notification={notification} />);

      // Icon emoji should be rendered
      expect(screen.getByText('🔔')).toBeInTheDocument();
    });
  });

  describe('Sender Avatar', () => {
    it('should render sender avatar when sender exists', () => {
      const notification = createMockNotification({
        sender: {
          id: 'user-123',
          username: 'johndoe',
          avatar: '/avatar.jpg',
        },
      });

      const { container } = render(<NotificationItem notification={notification} />);

      // Avatar component should be present (either img or span for fallback)
      // The Avatar component uses AvatarFallback when image fails to load
      const avatar = container.querySelector('[data-slot="avatar"]') || container.querySelector('img') || screen.getByText('J');
      expect(avatar).toBeTruthy();
    });

    it('should render sender initial in fallback', () => {
      const notification = createMockNotification({
        sender: {
          id: 'user-123',
          username: 'johndoe',
          avatar: null,
        },
      });

      render(<NotificationItem notification={notification} />);

      expect(screen.getByText('J')).toBeInTheDocument();
    });
  });

  describe('Unread Indicator', () => {
    it('should show unread indicator for unread notifications', () => {
      const notification = createMockNotification({ isRead: false });

      const { container } = render(<NotificationItem notification={notification} />);

      // Should have the blue dot indicator
      const unreadIndicator = container.querySelector('.bg-blue-600');
      expect(unreadIndicator).toBeInTheDocument();
    });

    it('should not show unread indicator for read notifications', () => {
      const notification = createMockNotification({ isRead: true });

      const { container } = render(<NotificationItem notification={notification} />);

      // Should not have unread styling
      const unreadIndicator = container.querySelector('.bg-blue-600.rounded-full.absolute');
      expect(unreadIndicator).toBeNull();
    });

    it('should have different background for unread vs read', () => {
      const unreadNotification = createMockNotification({ isRead: false });

      const { container: unreadContainer } = render(
        <NotificationItem notification={unreadNotification} />
      );

      // Unread should have blue background tint
      const unreadElement = unreadContainer.querySelector('.bg-blue-50\\/50');
      expect(unreadElement).toBeInTheDocument();
    });
  });

  describe('Priority Badges', () => {
    it('should show urgent badge for urgent priority', () => {
      const notification = createMockNotification({ priority: 'urgent' });

      render(<NotificationItem notification={notification} />);

      expect(screen.getByText('Urgent')).toBeInTheDocument();
    });

    it('should show high badge for high priority', () => {
      const notification = createMockNotification({ priority: 'high' });

      render(<NotificationItem notification={notification} />);

      expect(screen.getByText('High')).toBeInTheDocument();
    });

    it('should not show badge for normal priority', () => {
      const notification = createMockNotification({ priority: 'normal' });

      render(<NotificationItem notification={notification} />);

      expect(screen.queryByText('Urgent')).not.toBeInTheDocument();
      expect(screen.queryByText('High')).not.toBeInTheDocument();
    });
  });

  describe('Click Handling', () => {
    it('should call onRead when clicking unread notification', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue('/conversations/123');

      const notification = createMockNotification({ isRead: false });

      render(
        <NotificationItem
          notification={notification}
          onRead={mockOnRead}
          onAfterNavigation={mockOnAfterNavigation}
        />
      );

      const item = screen.getByRole('link');
      fireEvent.click(item);

      expect(mockOnRead).toHaveBeenCalledWith('notif-123');
    });

    it('should not call onRead when clicking already read notification', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue('/conversations/123');

      const notification = createMockNotification({ isRead: true });

      render(
        <NotificationItem
          notification={notification}
          onRead={mockOnRead}
          onAfterNavigation={mockOnAfterNavigation}
        />
      );

      const item = screen.getByRole('link');
      fireEvent.click(item);

      expect(mockOnRead).not.toHaveBeenCalled();
    });

    it('should call onAfterNavigation when link exists', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue('/conversations/123');

      const notification = createMockNotification();

      render(
        <NotificationItem
          notification={notification}
          onAfterNavigation={mockOnAfterNavigation}
        />
      );

      const item = screen.getByRole('link');
      fireEvent.click(item);

      expect(mockOnAfterNavigation).toHaveBeenCalled();
    });

    it('should call onClick when no link exists', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue(null);

      const notification = createMockNotification();

      render(
        <NotificationItem
          notification={notification}
          onClick={mockOnClick}
        />
      );

      // Should be rendered as div with button role when no link
      const item = screen.getByRole('button');
      fireEvent.click(item);

      expect(mockOnClick).toHaveBeenCalledWith(notification);
    });
  });

  describe('Navigation', () => {
    it('should render as link when notification has link', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue('/conversations/456');

      const notification = createMockNotification();

      render(<NotificationItem notification={notification} />);

      const link = screen.getByRole('link');
      expect(link).toHaveAttribute('href', '/conversations/456');
    });

    it('should render as div when notification has no link', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue(null);

      const notification = createMockNotification();

      render(<NotificationItem notification={notification} />);

      // Should not be a link
      expect(screen.queryByRole('link')).not.toBeInTheDocument();
      // Should be a div with button role
      expect(screen.getByRole('button')).toBeInTheDocument();
    });
  });

  describe('Quick Actions', () => {
    describe('Contact Request', () => {
      it('should show accept/decline buttons for contact request', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.CONTACT_REQUEST,
        });

        render(<NotificationItem notification={notification} showActions={true} />);

        expect(screen.getByText('Accept')).toBeInTheDocument();
        expect(screen.getByText('Decline')).toBeInTheDocument();
      });
    });

    describe('Missed Call', () => {
      it('should show call back button for missed call with conversation', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.MISSED_CALL,
          context: { conversationId: 'conv-123' },
        });

        render(<NotificationItem notification={notification} showActions={true} />);

        expect(screen.getByText('Call Back')).toBeInTheDocument();
      });

      it('should not show call back button without conversation', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.MISSED_CALL,
          context: {},
        });

        render(<NotificationItem notification={notification} showActions={true} />);

        expect(screen.queryByText('Call Back')).not.toBeInTheDocument();
      });
    });

    describe('New Conversation Group', () => {
      it('should show join button when not a member', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.NEW_CONVERSATION_GROUP,
          metadata: { isMember: false },
          context: { conversationId: 'conv-123' },
        });

        render(<NotificationItem notification={notification} showActions={true} />);

        expect(screen.getByText('Join')).toBeInTheDocument();
      });

      it('should not show join button when already a member', () => {
        const notification = createMockNotification({
          type: NotificationTypeEnum.NEW_CONVERSATION_GROUP,
          metadata: { isMember: true },
          context: { conversationId: 'conv-123' },
        });

        render(<NotificationItem notification={notification} showActions={true} />);

        expect(screen.queryByText('Join')).not.toBeInTheDocument();
      });
    });

    it('should not show actions when showActions is false', () => {
      const notification = createMockNotification({
        type: NotificationTypeEnum.CONTACT_REQUEST,
      });

      render(<NotificationItem notification={notification} showActions={false} />);

      expect(screen.queryByText('Accept')).not.toBeInTheDocument();
      expect(screen.queryByText('Decline')).not.toBeInTheDocument();
    });
  });

  describe('Compact Mode', () => {
    it('should apply compact styling when compact is true', () => {
      const notification = createMockNotification();

      const { container } = render(
        <NotificationItem notification={notification} compact={true} />
      );

      // Should have smaller padding
      const item = container.firstChild;
      expect(item).toHaveClass('p-1.5');
    });

    it('should apply regular styling when compact is false', () => {
      const notification = createMockNotification();

      const { container } = render(
        <NotificationItem notification={notification} compact={false} />
      );

      // Should have regular padding
      const item = container.firstChild;
      expect(item).toHaveClass('p-2');
    });

    it('should have smaller avatar in compact mode', () => {
      const notification = createMockNotification({
        sender: {
          id: 'user-123',
          username: 'johndoe',
          avatar: null,
        },
      });

      const { container } = render(
        <NotificationItem notification={notification} compact={true} />
      );

      // Avatar should have smaller classes
      const avatar = container.querySelector('.w-7');
      expect(avatar).toBeInTheDocument();
    });
  });

  describe('Keyboard Navigation', () => {
    it('should handle Enter key for activation', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue(null);

      const notification = createMockNotification();

      render(
        <NotificationItem
          notification={notification}
          onRead={mockOnRead}
        />
      );

      const item = screen.getByRole('button');
      fireEvent.keyDown(item, { key: 'Enter' });

      expect(mockOnRead).toHaveBeenCalledWith('notif-123');
    });

    it('should handle Space key for activation', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue(null);

      const notification = createMockNotification();

      render(
        <NotificationItem
          notification={notification}
          onRead={mockOnRead}
        />
      );

      const item = screen.getByRole('button');
      fireEvent.keyDown(item, { key: ' ' });

      expect(mockOnRead).toHaveBeenCalledWith('notif-123');
    });

    it('should have tabIndex for div elements', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue(null);

      const notification = createMockNotification();

      render(<NotificationItem notification={notification} />);

      const item = screen.getByRole('button');
      expect(item).toHaveAttribute('tabIndex', '0');
    });
  });

  describe('Hover States', () => {
    it('should have hover styling', () => {
      const notification = createMockNotification();

      const { container } = render(<NotificationItem notification={notification} />);

      const item = container.firstChild;
      expect(item).toHaveClass('hover:bg-gray-50');
    });
  });

  describe('Message Indicator', () => {
    it('should show message indicator on hover when link exists', () => {
      const helpers = require('@/utils/notification-helpers');
      helpers.getNotificationLink.mockReturnValue('/conversations/123');

      const notification = createMockNotification();

      const { container } = render(<NotificationItem notification={notification} />);

      // Should have the message square icon (hidden until hover)
      const indicatorIcon = container.querySelector('[data-testid="messagesquare-icon"]');
      expect(indicatorIcon).toBeInTheDocument();
    });
  });
});
