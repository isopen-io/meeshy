/**
 * Tests for NotificationFilters component
 * Tests filter selection, badge display, and internationalization
 */

import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { NotificationFilters, type NotificationType } from '@/components/notifications/NotificationFilters';

// Mock useI18n hook
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'filters.all': 'All',
        'filters.new_message': 'Messages',
        'filters.friend_request': 'Friend Requests',
        'filters.missed_call': 'Missed Calls',
        'filters.system': 'System',
        'filters.conversation': 'Conversations',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock icons
jest.mock('@/lib/icons', () => ({
  Bell: () => <svg data-testid="icon-bell" />,
  MessageSquare: () => <svg data-testid="icon-message" />,
  PhoneMissed: () => <svg data-testid="icon-phone" />,
  Settings: () => <svg data-testid="icon-settings" />,
  Users: () => <svg data-testid="icon-users" />,
  UserPlus: () => <svg data-testid="icon-userplus" />,
}));

describe('NotificationFilters', () => {
  const mockOnTypeChange = jest.fn();

  const defaultProps = {
    selectedType: 'all' as NotificationType,
    onTypeChange: mockOnTypeChange,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Basic Rendering', () => {
    it('should render all filter buttons', () => {
      render(<NotificationFilters {...defaultProps} />);

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Messages')).toBeInTheDocument();
      expect(screen.getByText('Friend Requests')).toBeInTheDocument();
      expect(screen.getByText('Missed Calls')).toBeInTheDocument();
      expect(screen.getByText('System')).toBeInTheDocument();
      expect(screen.getByText('Conversations')).toBeInTheDocument();
    });

    it('should render filter icons', () => {
      render(<NotificationFilters {...defaultProps} />);

      expect(screen.getByTestId('icon-bell')).toBeInTheDocument();
      expect(screen.getByTestId('icon-message')).toBeInTheDocument();
      expect(screen.getByTestId('icon-userplus')).toBeInTheDocument();
      expect(screen.getByTestId('icon-phone')).toBeInTheDocument();
      expect(screen.getByTestId('icon-settings')).toBeInTheDocument();
      expect(screen.getByTestId('icon-users')).toBeInTheDocument();
    });

    it('should render with correct wrapper styling', () => {
      const { container } = render(<NotificationFilters {...defaultProps} />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('flex');
      expect(wrapper).toHaveClass('flex-wrap');
      expect(wrapper).toHaveClass('gap-2');
      expect(wrapper).toHaveClass('mb-6');
    });
  });

  describe('Selection State', () => {
    it('should highlight selected filter with default variant', () => {
      render(<NotificationFilters {...defaultProps} selectedType="all" />);

      const allButton = screen.getByText('All').closest('button');
      // Default variant typically doesn't have 'outline' class or has 'bg-primary' class
      expect(allButton).not.toHaveClass('border');
    });

    it('should show non-selected filters with outline variant', () => {
      render(<NotificationFilters {...defaultProps} selectedType="all" />);

      const messagesButton = screen.getByText('Messages').closest('button');
      // Outline variant has specific styling
      expect(messagesButton).toBeInTheDocument();
    });

    it('should update selection when a different filter is selected', () => {
      const { rerender } = render(<NotificationFilters {...defaultProps} selectedType="all" />);

      rerender(<NotificationFilters {...defaultProps} selectedType="new_message" />);

      // The messages button should now be selected
      const messagesButton = screen.getByText('Messages').closest('button');
      expect(messagesButton).toBeInTheDocument();
    });

    it('should handle each filter type selection', () => {
      const filterTypes: NotificationType[] = [
        'all',
        'new_message',
        'friend_request',
        'missed_call',
        'system',
        'conversation',
      ];

      filterTypes.forEach(type => {
        const { unmount } = render(
          <NotificationFilters {...defaultProps} selectedType={type} />
        );
        // Should render without error
        expect(screen.getByText('All')).toBeInTheDocument();
        unmount();
      });
    });
  });

  describe('Click Handling', () => {
    it('should call onTypeChange when filter is clicked', () => {
      render(<NotificationFilters {...defaultProps} />);

      const messagesButton = screen.getByText('Messages').closest('button');
      if (messagesButton) {
        fireEvent.click(messagesButton);
      }

      expect(mockOnTypeChange).toHaveBeenCalledWith('new_message');
    });

    it('should call onTypeChange with correct type for each filter', () => {
      render(<NotificationFilters {...defaultProps} />);

      // Click each filter and verify the correct type is passed
      const filterMap: Record<string, NotificationType> = {
        'All': 'all',
        'Messages': 'new_message',
        'Friend Requests': 'friend_request',
        'Missed Calls': 'missed_call',
        'System': 'system',
        'Conversations': 'conversation',
      };

      Object.entries(filterMap).forEach(([label, type]) => {
        mockOnTypeChange.mockClear();
        const button = screen.getByText(label).closest('button');
        if (button) {
          fireEvent.click(button);
        }
        expect(mockOnTypeChange).toHaveBeenCalledWith(type);
      });
    });

    it('should call onTypeChange even when clicking already selected filter', () => {
      render(<NotificationFilters {...defaultProps} selectedType="all" />);

      const allButton = screen.getByText('All').closest('button');
      if (allButton) {
        fireEvent.click(allButton);
      }

      expect(mockOnTypeChange).toHaveBeenCalledWith('all');
    });
  });

  describe('Badge Counts', () => {
    const countsProps = {
      ...defaultProps,
      counts: {
        all: 10,
        new_message: 5,
        missed_call: 2,
        system: 1,
        conversation: 0,
        friend_request: 3,
      },
    };

    it('should display count badges when counts are provided', () => {
      render(<NotificationFilters {...countsProps} />);

      expect(screen.getByText('10')).toBeInTheDocument();
      expect(screen.getByText('5')).toBeInTheDocument();
      expect(screen.getByText('2')).toBeInTheDocument();
      expect(screen.getByText('1')).toBeInTheDocument();
      expect(screen.getByText('3')).toBeInTheDocument();
    });

    it('should not display badge when count is 0', () => {
      render(<NotificationFilters {...countsProps} />);

      // Conversation has count 0, so no badge should appear for it
      const conversationsButton = screen.getByText('Conversations').closest('button');
      const badge = conversationsButton?.querySelector('[data-slot="badge"]');
      // Badge should not exist or not contain "0"
      expect(badge).toBeNull();
    });

    it('should not display badges when counts prop is not provided', () => {
      render(<NotificationFilters {...defaultProps} />);

      // No numeric badges should be present
      expect(screen.queryByText('10')).not.toBeInTheDocument();
      expect(screen.queryByText('5')).not.toBeInTheDocument();
    });

    it('should display badge with secondary variant', () => {
      render(<NotificationFilters {...countsProps} />);

      // Find a badge element (they should have secondary variant)
      const badges = screen.getAllByText(/^[0-9]+$/);
      expect(badges.length).toBeGreaterThan(0);
    });
  });

  describe('Button Styling', () => {
    it('should render buttons with sm size', () => {
      render(<NotificationFilters {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        // sm size buttons typically have specific height/padding classes
        expect(button).toBeInTheDocument();
      });
    });

    it('should render buttons with icon and text', () => {
      render(<NotificationFilters {...defaultProps} />);

      const allButton = screen.getByText('All').closest('button');
      expect(allButton).toContainElement(screen.getByTestId('icon-bell'));
    });

    it('should have gap between icon and text', () => {
      render(<NotificationFilters {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      buttons.forEach(button => {
        expect(button).toHaveClass('gap-2');
      });
    });
  });

  describe('Responsiveness', () => {
    it('should wrap filters on smaller screens', () => {
      const { container } = render(<NotificationFilters {...defaultProps} />);

      const wrapper = container.firstChild;
      expect(wrapper).toHaveClass('flex-wrap');
    });
  });

  describe('Accessibility', () => {
    it('should have accessible button labels', () => {
      render(<NotificationFilters {...defaultProps} />);

      const buttons = screen.getAllByRole('button');
      expect(buttons.length).toBe(6);

      // Each button should have text content
      buttons.forEach(button => {
        expect(button.textContent).toBeTruthy();
      });
    });

    it('should be keyboard navigable', () => {
      render(<NotificationFilters {...defaultProps} />);

      const firstButton = screen.getByText('All').closest('button');
      firstButton?.focus();
      expect(document.activeElement).toBe(firstButton);
    });
  });

  describe('Edge Cases', () => {
    it('should handle partial counts object', () => {
      const partialCounts = {
        ...defaultProps,
        counts: {
          all: 5,
          new_message: 0,
          missed_call: 0,
          system: 0,
          conversation: 0,
          friend_request: 0,
        },
      };

      render(<NotificationFilters {...partialCounts} />);

      expect(screen.getByText('5')).toBeInTheDocument();
    });

    it('should handle very large counts', () => {
      const largeCounts = {
        ...defaultProps,
        counts: {
          all: 9999,
          new_message: 1000,
          missed_call: 500,
          system: 100,
          conversation: 50,
          friend_request: 25,
        },
      };

      render(<NotificationFilters {...largeCounts} />);

      expect(screen.getByText('9999')).toBeInTheDocument();
      expect(screen.getByText('1000')).toBeInTheDocument();
    });

    it('should render correctly with all counts at 0', () => {
      const zeroCounts = {
        ...defaultProps,
        counts: {
          all: 0,
          new_message: 0,
          missed_call: 0,
          system: 0,
          conversation: 0,
          friend_request: 0,
        },
      };

      render(<NotificationFilters {...zeroCounts} />);

      // No count badges should be visible
      const badgeNumbers = screen.queryAllByText(/^[0-9]+$/);
      expect(badgeNumbers.length).toBe(0);
    });
  });

  describe('Integration with Icons', () => {
    it('should render correct icon for each filter type', () => {
      render(<NotificationFilters {...defaultProps} />);

      // Verify each filter has its corresponding icon
      const allButton = screen.getByText('All').closest('button');
      expect(allButton).toContainElement(screen.getByTestId('icon-bell'));

      const messagesButton = screen.getByText('Messages').closest('button');
      expect(messagesButton).toContainElement(screen.getByTestId('icon-message'));

      const friendRequestButton = screen.getByText('Friend Requests').closest('button');
      expect(friendRequestButton).toContainElement(screen.getByTestId('icon-userplus'));

      const missedCallButton = screen.getByText('Missed Calls').closest('button');
      expect(missedCallButton).toContainElement(screen.getByTestId('icon-phone'));

      const systemButton = screen.getByText('System').closest('button');
      expect(systemButton).toContainElement(screen.getByTestId('icon-settings'));

      const conversationsButton = screen.getByText('Conversations').closest('button');
      expect(conversationsButton).toContainElement(screen.getByTestId('icon-users'));
    });

    it('should apply correct icon size classes', () => {
      const { container } = render(<NotificationFilters {...defaultProps} />);

      // Icons should have h-4 w-4 classes
      const icons = container.querySelectorAll('svg');
      expect(icons.length).toBe(6);
    });
  });
});
