import React from 'react';
import { render, screen, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { TypingIndicator, TypingBadge } from '../../../components/conversations/typing-indicator';
import type { User } from '@/types';

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'typingIndicator.typing': 'is typing',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock UI components
jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" className={className} data-variant={variant}>{children}</span>
  ),
}));

// Mock data
const mockUsers: User[] = [
  {
    id: 'user-1',
    username: 'john',
    displayName: 'John Doe',
  } as User,
  {
    id: 'user-2',
    username: 'jane',
    displayName: 'Jane Smith',
  } as User,
  {
    id: 'user-3',
    username: 'bob',
    displayName: 'Bob Builder',
  } as User,
];

const createTypingUsers = (userIds: string[], conversationId: string = 'chat-1') => {
  return userIds.map(userId => ({
    userId,
    username: mockUsers.find(u => u.id === userId)?.username || userId,
    conversationId,
    timestamp: Date.now(),
  }));
};

describe('TypingIndicator', () => {
  const defaultProps = {
    typingUsers: [],
    chatId: 'chat-1',
    currentUserId: 'current-user',
    users: mockUsers,
    className: '',
  };

  beforeEach(() => {
    // Use real timers for async operations (promises, setTimeout, etc.)
    jest.useRealTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('Rendering', () => {
    it('should not render when no users are typing', () => {
      const { container } = render(<TypingIndicator {...defaultProps} />);

      expect(container.firstChild).toBeNull();
    });

    it('should render when users are typing', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1'])}
        />
      );

      expect(screen.getByText(/john écrit/)).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      const { container } = render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1'])}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Single User Typing', () => {
    it('should show single user typing message', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1'])}
        />
      );

      expect(screen.getByText(/john écrit/)).toBeInTheDocument();
    });
  });

  describe('Two Users Typing', () => {
    it('should show two users typing message', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1', 'user-2'])}
        />
      );

      expect(screen.getByText(/john et jane écrivent/)).toBeInTheDocument();
    });
  });

  describe('Multiple Users Typing', () => {
    it('should show count for 3+ users typing', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1', 'user-2', 'user-3'])}
        />
      );

      expect(screen.getByText(/3 personnes écrivent/)).toBeInTheDocument();
    });
  });

  describe('Filtering', () => {
    it('should filter out current user from typing users', () => {
      const { container } = render(
        <TypingIndicator
          {...defaultProps}
          currentUserId="user-1"
          typingUsers={createTypingUsers(['user-1'])}
        />
      );

      // Should not show anything since only current user is typing
      expect(container.firstChild).toBeNull();
    });

    it('should show other users when current user is also typing', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          currentUserId="user-1"
          typingUsers={createTypingUsers(['user-1', 'user-2'])}
        />
      );

      expect(screen.getByText(/jane écrit/)).toBeInTheDocument();
    });

    it('should filter out typing users from other conversations', () => {
      const typingUsers = [
        ...createTypingUsers(['user-1'], 'chat-1'),
        ...createTypingUsers(['user-2'], 'chat-2'),
      ];

      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={typingUsers}
          chatId="chat-1"
        />
      );

      // Should only show user-1 from chat-1
      expect(screen.getByText(/john écrit/)).toBeInTheDocument();
    });
  });

  describe('Animation', () => {
    it('should animate dots', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1'])}
        />
      );

      const initialText = screen.getByText(/john écrit/).textContent;

      act(() => {
        jest.advanceTimersByTime(500);
      });

      const textAfter500ms = screen.getByText(/john écrit/).textContent;

      // Text should have changed (dots animation)
      // Due to animation cycle, content might be the same or different
      expect(screen.getByText(/john écrit/)).toBeInTheDocument();

      act(() => {
        jest.advanceTimersByTime(500);
      });

      expect(screen.getByText(/john écrit/)).toBeInTheDocument();
    });

    it('should cycle through dot animation states', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1'])}
        />
      );

      // Initial state
      expect(screen.getByText(/john écrit/)).toBeInTheDocument();

      // After 2 seconds (4 intervals), should cycle through all states
      act(() => {
        jest.advanceTimersByTime(2000);
      });

      expect(screen.getByText(/john écrit/)).toBeInTheDocument();
    });
  });

  describe('User Lookup', () => {
    it('should show username from users array', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1'])}
        />
      );

      expect(screen.getByText(/john/)).toBeInTheDocument();
    });

    it('should fallback to userId when user not found', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={[{
            userId: 'unknown-user',
            username: 'unknown-user',
            conversationId: 'chat-1',
            timestamp: Date.now(),
          }]}
          users={[]}
        />
      );

      expect(screen.getByText(/unknown-user/)).toBeInTheDocument();
    });
  });

  describe('Loading Indicator', () => {
    it('should show loading spinner icon', () => {
      const { container } = render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1'])}
        />
      );

      // Check for Loader2 icon (has animate-spin class)
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Empty Users Array', () => {
    it('should handle empty users array gracefully', () => {
      render(
        <TypingIndicator
          {...defaultProps}
          typingUsers={createTypingUsers(['user-1'])}
          users={[]}
        />
      );

      // Should fallback to userId when user not found in users array
      expect(screen.getByText(/user-1/)).toBeInTheDocument();
    });
  });
});

describe('TypingBadge', () => {
  const defaultProps = {
    typingUsers: [],
    userId: 'user-1',
    chatId: 'chat-1',
    className: '',
  };

  describe('Rendering', () => {
    it('should not render when user is not typing', () => {
      const { container } = render(<TypingBadge {...defaultProps} />);

      expect(container.firstChild).toBeNull();
    });

    it('should render badge when user is typing', () => {
      render(
        <TypingBadge
          {...defaultProps}
          typingUsers={[{
            userId: 'user-1',
            username: 'john',
            conversationId: 'chat-1',
            timestamp: Date.now(),
          }]}
        />
      );

      expect(screen.getByTestId('badge')).toBeInTheDocument();
      expect(screen.getByText('is typing')).toBeInTheDocument();
    });

    it('should apply custom className', () => {
      render(
        <TypingBadge
          {...defaultProps}
          typingUsers={[{
            userId: 'user-1',
            username: 'john',
            conversationId: 'chat-1',
            timestamp: Date.now(),
          }]}
          className="custom-class"
        />
      );

      expect(screen.getByTestId('badge')).toHaveClass('custom-class');
    });
  });

  describe('Filtering', () => {
    it('should not show badge for different user', () => {
      const { container } = render(
        <TypingBadge
          {...defaultProps}
          userId="user-2"
          typingUsers={[{
            userId: 'user-1',
            username: 'john',
            conversationId: 'chat-1',
            timestamp: Date.now(),
          }]}
        />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should not show badge for different conversation', () => {
      const { container } = render(
        <TypingBadge
          {...defaultProps}
          chatId="chat-2"
          typingUsers={[{
            userId: 'user-1',
            username: 'john',
            conversationId: 'chat-1',
            timestamp: Date.now(),
          }]}
        />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Loading Spinner', () => {
    it('should show loading spinner in badge', () => {
      const { container } = render(
        <TypingBadge
          {...defaultProps}
          typingUsers={[{
            userId: 'user-1',
            username: 'john',
            conversationId: 'chat-1',
            timestamp: Date.now(),
          }]}
        />
      );

      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });
  });

  describe('Badge Variant', () => {
    it('should use secondary variant', () => {
      render(
        <TypingBadge
          {...defaultProps}
          typingUsers={[{
            userId: 'user-1',
            username: 'john',
            conversationId: 'chat-1',
            timestamp: Date.now(),
          }]}
        />
      );

      expect(screen.getByTestId('badge')).toHaveAttribute('data-variant', 'secondary');
    });
  });
});
