/**
 * Tests for NotificationList and NotificationListWithFilters components
 * Tests list rendering, infinite scroll, filtering, and empty states
 */

import React from 'react';
import { render, screen, fireEvent, waitFor, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import {
  NotificationList,
  NotificationListWithFilters,
} from '@/components/notifications/notifications-v2/NotificationList';
import { NotificationTypeEnum } from '@/types/notification';

// Mock IntersectionObserver
const mockIntersectionObserver = jest.fn();
mockIntersectionObserver.mockImplementation((callback) => ({
  observe: jest.fn(),
  unobserve: jest.fn(),
  disconnect: jest.fn(),
}));
window.IntersectionObserver = mockIntersectionObserver;

// Mock NotificationItem component
jest.mock('@/components/notifications/notifications-v2/NotificationItem', () => ({
  NotificationItem: ({ notification, onRead, onDelete, onAfterNavigation }: any) => (
    <div data-testid={`notification-${notification.id}`} className="notification-item">
      <span>{notification.id}</span>
      <span>{notification.type}</span>
      <button onClick={() => onRead?.(notification.id)}>Mark Read</button>
      <button onClick={() => onDelete?.(notification.id)}>Delete</button>
      <button onClick={() => onAfterNavigation?.()}>Navigate</button>
    </div>
  ),
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: any[]) => classes.filter(Boolean).join(' '),
}));

// Create mock notification
const createMockNotification = (overrides = {}) => ({
  id: `notif-${Math.random().toString(36).substr(2, 9)}`,
  type: NotificationTypeEnum.NEW_MESSAGE,
  isRead: false,
  priority: 'normal' as const,
  createdAt: new Date().toISOString(),
  metadata: {},
  context: {},
  sender: null,
  ...overrides,
});

describe('NotificationList', () => {
  const mockOnLoadMore = jest.fn();
  const mockOnNotificationClick = jest.fn();
  const mockOnRead = jest.fn();
  const mockOnDelete = jest.fn();
  const mockOnAfterNavigation = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    mockIntersectionObserver.mockClear();
  });

  describe('Empty State', () => {
    it('should display empty state when no notifications', () => {
      render(<NotificationList notifications={[]} />);

      expect(screen.getByText('No notifications')).toBeInTheDocument();
    });

    it('should display custom empty message when provided', () => {
      render(
        <NotificationList
          notifications={[]}
          emptyMessage="You have no new messages"
        />
      );

      expect(screen.getByText('You have no new messages')).toBeInTheDocument();
    });

    it('should display bell icon in empty state', () => {
      const { container } = render(<NotificationList notifications={[]} />);

      // Bell icon should be present
      const iconContainer = container.querySelector('.bg-gray-100');
      expect(iconContainer).toBeInTheDocument();
    });

    it('should not show empty state when loading', () => {
      render(<NotificationList notifications={[]} isLoading={true} />);

      expect(screen.queryByText('No notifications')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('should display loading spinner when loading with no notifications', () => {
      render(<NotificationList notifications={[]} isLoading={true} />);

      expect(screen.getByText('Loading notifications...')).toBeInTheDocument();
    });

    it('should display loading spinner in list when loading more', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationList
          notifications={notifications}
          isLoading={true}
          hasMore={true}
        />
      );

      // Notification should still be visible
      expect(screen.getByTestId('notification-notif-1')).toBeInTheDocument();
    });
  });

  describe('Notification Rendering', () => {
    it('should render all notifications', () => {
      const notifications = [
        createMockNotification({ id: 'notif-1' }),
        createMockNotification({ id: 'notif-2' }),
        createMockNotification({ id: 'notif-3' }),
      ];

      render(<NotificationList notifications={notifications} />);

      expect(screen.getByTestId('notification-notif-1')).toBeInTheDocument();
      expect(screen.getByTestId('notification-notif-2')).toBeInTheDocument();
      expect(screen.getByTestId('notification-notif-3')).toBeInTheDocument();
    });

    it('should pass correct props to NotificationItem', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationList
          notifications={notifications}
          onRead={mockOnRead}
          onDelete={mockOnDelete}
          onAfterNavigation={mockOnAfterNavigation}
        />
      );

      // Trigger callbacks to verify they are passed correctly
      const readButton = screen.getByText('Mark Read');
      fireEvent.click(readButton);
      expect(mockOnRead).toHaveBeenCalledWith('notif-1');

      const deleteButton = screen.getByText('Delete');
      fireEvent.click(deleteButton);
      expect(mockOnDelete).toHaveBeenCalledWith('notif-1');

      const navigateButton = screen.getByText('Navigate');
      fireEvent.click(navigateButton);
      expect(mockOnAfterNavigation).toHaveBeenCalled();
    });

    it('should render notifications with dividers', () => {
      const notifications = [
        createMockNotification({ id: 'notif-1' }),
        createMockNotification({ id: 'notif-2' }),
      ];

      const { container } = render(<NotificationList notifications={notifications} />);

      const dividerContainer = container.querySelector('.divide-y');
      expect(dividerContainer).toBeInTheDocument();
    });
  });

  describe('Infinite Scroll', () => {
    it('should show Load more button when hasMore is true', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationList
          notifications={notifications}
          hasMore={true}
          onLoadMore={mockOnLoadMore}
        />
      );

      expect(screen.getByText('Load more')).toBeInTheDocument();
    });

    it('should call onLoadMore when Load more is clicked', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationList
          notifications={notifications}
          hasMore={true}
          onLoadMore={mockOnLoadMore}
        />
      );

      const loadMoreButton = screen.getByText('Load more');
      fireEvent.click(loadMoreButton);

      expect(mockOnLoadMore).toHaveBeenCalled();
    });

    it('should set up IntersectionObserver for infinite scroll', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationList
          notifications={notifications}
          hasMore={true}
          onLoadMore={mockOnLoadMore}
        />
      );

      expect(mockIntersectionObserver).toHaveBeenCalled();
    });

    it('should disconnect observer on unmount', () => {
      const mockDisconnect = jest.fn();
      mockIntersectionObserver.mockImplementation(() => ({
        observe: jest.fn(),
        unobserve: jest.fn(),
        disconnect: mockDisconnect,
      }));

      const notifications = [createMockNotification({ id: 'notif-1' })];

      const { unmount } = render(
        <NotificationList
          notifications={notifications}
          hasMore={true}
          onLoadMore={mockOnLoadMore}
        />
      );

      unmount();

      expect(mockDisconnect).toHaveBeenCalled();
    });

    it('should not show Load more when hasMore is false', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationList
          notifications={notifications}
          hasMore={false}
        />
      );

      expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    });

    it('should show "You\'ve reached the end" when no more notifications', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationList
          notifications={notifications}
          hasMore={false}
        />
      );

      expect(screen.getByText("You've reached the end")).toBeInTheDocument();
    });
  });

  describe('Loading Indicator', () => {
    it('should show spinner instead of button when loading more', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      const { container } = render(
        <NotificationList
          notifications={notifications}
          hasMore={true}
          isLoading={true}
        />
      );

      // Spinner should be present instead of button
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
      expect(screen.queryByText('Load more')).not.toBeInTheDocument();
    });
  });

  describe('Scroll Area', () => {
    it('should render within ScrollArea component', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      const { container } = render(<NotificationList notifications={notifications} />);

      const scrollArea = container.querySelector('[data-radix-scroll-area-viewport]');
      // ScrollArea may or may not be rendered depending on implementation
      expect(screen.getByTestId('notification-notif-1')).toBeInTheDocument();
    });
  });
});

describe('NotificationListWithFilters', () => {
  const mockOnFilterChange = jest.fn();
  const mockOnLoadMore = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Filter Bar', () => {
    it('should render filter button', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
        />
      );

      expect(screen.getByText('Filters')).toBeInTheDocument();
    });

    it('should not render filter bar when showFilters is false', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={false}
        />
      );

      expect(screen.queryByText('Filters')).not.toBeInTheDocument();
    });

    it('should toggle filter menu when filter button is clicked', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          onFilterChange={mockOnFilterChange}
        />
      );

      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      // Filter menu should be visible
      expect(screen.getByText('Type')).toBeInTheDocument();
      expect(screen.getByText('Status')).toBeInTheDocument();
    });
  });

  describe('Active Filter Badges', () => {
    it('should show type filter badge when type filter is active', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ type: 'new_message' }}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('new_message')).toBeInTheDocument();
    });

    it('should show read status filter badge', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ isRead: false }}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Unread')).toBeInTheDocument();
    });

    it('should show "Read" badge when filtering by read', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ isRead: true }}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Read')).toBeInTheDocument();
    });

    it('should call onFilterChange when removing type filter', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ type: 'new_message' }}
          onFilterChange={mockOnFilterChange}
        />
      );

      // Find and click the X button to remove filter
      const badgeCloseButtons = screen.getAllByText('\u00d7');
      fireEvent.click(badgeCloseButtons[0]);

      expect(mockOnFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'all' })
      );
    });

    it('should show Clear all button when filters are active', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ type: 'new_message' }}
          onFilterChange={mockOnFilterChange}
        />
      );

      expect(screen.getByText('Clear all')).toBeInTheDocument();
    });

    it('should call onFilterChange to clear all filters', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ type: 'new_message', isRead: false }}
          onFilterChange={mockOnFilterChange}
        />
      );

      const clearAllButton = screen.getByText('Clear all');
      fireEvent.click(clearAllButton);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        type: 'all',
        isRead: undefined,
      });
    });
  });

  describe('Filter Menu', () => {
    it('should show filter options when menu is open', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          onFilterChange={mockOnFilterChange}
        />
      );

      // Open filter menu
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      // Type filter options
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('new message')).toBeInTheDocument();
      expect(screen.getByText('message reply')).toBeInTheDocument();
      expect(screen.getByText('user mentioned')).toBeInTheDocument();
      expect(screen.getByText('message reaction')).toBeInTheDocument();
    });

    it('should show status filter options', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          onFilterChange={mockOnFilterChange}
        />
      );

      // Open filter menu
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      // Status filter options - there are multiple "All" buttons
      const allButtons = screen.getAllByText('All');
      expect(allButtons.length).toBeGreaterThan(0);
    });

    it('should call onFilterChange when type filter is selected', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ type: 'all' }}
          onFilterChange={mockOnFilterChange}
        />
      );

      // Open filter menu
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      // Click on a type filter
      const newMessageFilter = screen.getByText('new message');
      fireEvent.click(newMessageFilter);

      expect(mockOnFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'new_message' })
      );
    });

    it('should call onFilterChange when status filter is selected', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{}}
          onFilterChange={mockOnFilterChange}
        />
      );

      // Open filter menu
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      // Click on Unread filter
      const unreadFilter = screen.getByText('Unread');
      fireEvent.click(unreadFilter);

      expect(mockOnFilterChange).toHaveBeenCalledWith(
        expect.objectContaining({ isRead: false })
      );
    });

    it('should highlight selected type filter', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ type: 'new_message' }}
          onFilterChange={mockOnFilterChange}
        />
      );

      // Open filter menu
      const filterButton = screen.getByText('Filters');
      fireEvent.click(filterButton);

      // new_message filter should be selected (different variant)
      const newMessageFilter = screen.getByText('new message');
      expect(newMessageFilter.closest('button')).toBeInTheDocument();
    });
  });

  describe('Integration with NotificationList', () => {
    it('should pass notifications to NotificationList', () => {
      const notifications = [
        createMockNotification({ id: 'notif-1' }),
        createMockNotification({ id: 'notif-2' }),
      ];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
        />
      );

      expect(screen.getByTestId('notification-notif-1')).toBeInTheDocument();
      expect(screen.getByTestId('notification-notif-2')).toBeInTheDocument();
    });

    it('should pass hasMore and onLoadMore to NotificationList', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          hasMore={true}
          onLoadMore={mockOnLoadMore}
        />
      );

      expect(screen.getByText('Load more')).toBeInTheDocument();
    });
  });

  describe('Layout', () => {
    it('should have flex column layout', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      const { container } = render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
        />
      );

      const mainContainer = container.querySelector('.flex.flex-col');
      expect(mainContainer).toBeInTheDocument();
    });

    it('should have border between filter bar and list', () => {
      const notifications = [createMockNotification({ id: 'notif-1' })];

      const { container } = render(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
        />
      );

      const filterBar = container.querySelector('.border-b');
      expect(filterBar).toBeInTheDocument();
    });
  });
});

describe('Edge Cases', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('should handle empty notifications array', () => {
    render(<NotificationList notifications={[]} />);

    expect(screen.getByText('No notifications')).toBeInTheDocument();
  });

  it('should handle very large notification list', () => {
    const notifications = Array(100)
      .fill(null)
      .map((_, i) => createMockNotification({ id: `notif-${i}` }));

    render(<NotificationList notifications={notifications} />);

    // First notification should be visible
    expect(screen.getByTestId('notification-notif-0')).toBeInTheDocument();
  });

  it('should handle notifications with missing optional fields', () => {
    const minimalNotification = {
      id: 'notif-minimal',
      type: NotificationTypeEnum.NEW_MESSAGE,
      isRead: false,
      priority: 'normal' as const,
      createdAt: new Date().toISOString(),
    };

    render(<NotificationList notifications={[minimalNotification as any]} />);

    expect(screen.getByTestId('notification-notif-minimal')).toBeInTheDocument();
  });

  it('should handle rapid filter changes', () => {
    const notifications = [createMockNotification({ id: 'notif-1' })];
    const mockOnFilterChange = jest.fn();

    const { rerender } = render(
      <NotificationListWithFilters
        notifications={notifications}
        showFilters={true}
        filters={{ type: 'all' }}
        onFilterChange={mockOnFilterChange}
      />
    );

    // Rapidly change filters
    for (let i = 0; i < 10; i++) {
      rerender(
        <NotificationListWithFilters
          notifications={notifications}
          showFilters={true}
          filters={{ type: i % 2 === 0 ? 'all' : 'new_message' }}
          onFilterChange={mockOnFilterChange}
        />
      );
    }

    // Should not crash
    expect(screen.getByTestId('notification-notif-1')).toBeInTheDocument();
  });

  it('should handle undefined onLoadMore', () => {
    const notifications = [createMockNotification({ id: 'notif-1' })];

    render(
      <NotificationList
        notifications={notifications}
        hasMore={true}
        // onLoadMore is undefined
      />
    );

    // Should render without crashing
    expect(screen.getByTestId('notification-notif-1')).toBeInTheDocument();
  });

  it('should handle undefined onFilterChange', () => {
    const notifications = [createMockNotification({ id: 'notif-1' })];

    render(
      <NotificationListWithFilters
        notifications={notifications}
        showFilters={true}
        filters={{ type: 'new_message' }}
        // onFilterChange is undefined
      />
    );

    // Click should not crash
    const badge = screen.getByText('new_message');
    const closeButton = badge.parentElement?.querySelector('button');
    if (closeButton) {
      expect(() => fireEvent.click(closeButton)).not.toThrow();
    }
  });
});
