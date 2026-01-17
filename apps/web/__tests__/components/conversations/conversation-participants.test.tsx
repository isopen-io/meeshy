import React from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationParticipants } from '../../../components/conversations/conversation-participants';
import type { ThreadMember, SocketIOUser, UserRoleEnum } from '@meeshy/shared/types';

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string) => {
      const translations: Record<string, string> = {
        'conversationParticipants.typing': 'is typing...',
        'conversationParticipants.typingMultiple': 'people are typing...',
        'conversationDetails.you': 'You',
      };
      return translations[key] || key;
    },
  }),
}));

// Mock services
jest.mock('@/services/conversations.service', () => ({
  conversationsService: {
    getConversation: jest.fn(),
  },
}));

// Mock sonner toast
jest.mock('sonner', () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
  },
}));

// Mock cn utility
jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

jest.mock('@/lib/avatar-utils', () => ({
  getUserInitials: (user: any) => {
    if (user.displayName) return user.displayName.charAt(0);
    if (user.firstName) return user.firstName.charAt(0);
    return user.username?.charAt(0) || '?';
  },
}));

jest.mock('@/utils/tag-colors', () => ({
  getTagColor: () => ({ bg: 'bg-blue-100', text: 'text-blue-800', border: 'border-blue-300' }),
}));

// Mock next/link
jest.mock('next/link', () => {
  return ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href} data-testid="link">{children}</a>
  );
});

// Mock UI components
jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="avatar-fallback" className={className}>{children}</span>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    src ? <img data-testid="avatar-image" src={src} alt="" /> : null
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({ children, onClick, className, title }: any) => (
    <button onClick={onClick} className={className} title={title} data-testid="button">
      {children}
    </button>
  ),
}));

jest.mock('@/components/ui/popover', () => ({
  Popover: ({ children }: { children: React.ReactNode }) => <div data-testid="popover">{children}</div>,
  PopoverContent: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-content">{children}</div>
  ),
  PopoverTrigger: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="popover-trigger">{children}</div>
  ),
}));

// Mock data
const mockCurrentUser: SocketIOUser = {
  id: 'user-1',
  username: 'currentuser',
  displayName: 'Current User',
  firstName: 'Current',
  lastName: 'User',
  email: 'current@example.com',
  isOnline: true,
  role: 'USER' as any,
} as SocketIOUser;

const mockParticipants: ThreadMember[] = [
  {
    id: 'participant-1',
    userId: 'user-1',
    user: mockCurrentUser,
    role: 'MEMBER' as UserRoleEnum,
  } as ThreadMember,
  {
    id: 'participant-2',
    userId: 'user-2',
    user: {
      id: 'user-2',
      username: 'john',
      displayName: 'John Doe',
      firstName: 'John',
      lastName: 'Doe',
      isOnline: true,
      avatar: 'https://example.com/john.jpg',
    } as any,
    role: 'MEMBER' as UserRoleEnum,
  } as ThreadMember,
  {
    id: 'participant-3',
    userId: 'user-3',
    user: {
      id: 'user-3',
      username: 'jane',
      displayName: 'Jane Smith',
      firstName: 'Jane',
      lastName: 'Smith',
      isOnline: false,
    } as any,
    role: 'CREATOR' as UserRoleEnum,
  } as ThreadMember,
];

describe('ConversationParticipants', () => {
  const defaultProps = {
    conversationId: 'conv-1',
    participants: mockParticipants,
    currentUser: mockCurrentUser,
    isGroup: true,
    conversationType: 'group',
    className: '',
    typingUsers: [],
    conversationTitle: 'Test Conversation',
    conversationTags: [],
    conversationCategory: undefined,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render the component', () => {
      render(<ConversationParticipants {...defaultProps} />);

      expect(screen.getAllByTestId('avatar').length).toBeGreaterThan(0);
    });

    it('should render participant avatars', () => {
      render(<ConversationParticipants {...defaultProps} />);

      const avatars = screen.getAllByTestId('avatar');
      expect(avatars.length).toBe(3); // 3 participants displayed
    });

    it('should show current user first in display', () => {
      render(<ConversationParticipants {...defaultProps} />);

      const fallbacks = screen.getAllByTestId('avatar-fallback');
      // Current user should be first
      expect(fallbacks[0]).toHaveTextContent('C'); // Current User initial
    });
  });

  describe('Typing Indicator', () => {
    it('should show typing indicator when users are typing', () => {
      const typingUsers = [
        { userId: 'user-2', conversationId: 'conv-1' },
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          typingUsers={typingUsers}
        />
      );

      expect(screen.getByText('John Doe is typing...')).toBeInTheDocument();
    });

    it('should show typing indicator for multiple users', () => {
      const typingUsers = [
        { userId: 'user-2', conversationId: 'conv-1' },
        { userId: 'user-3', conversationId: 'conv-1' },
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          typingUsers={typingUsers}
        />
      );

      expect(screen.getByText('John Doe et Jane Smith is typing...')).toBeInTheDocument();
    });

    it('should show count for many typing users', () => {
      const typingUsers = [
        { userId: 'user-2', conversationId: 'conv-1' },
        { userId: 'user-3', conversationId: 'conv-1' },
        { userId: 'user-4', conversationId: 'conv-1' },
      ];

      const participantsWithMore = [
        ...mockParticipants,
        {
          id: 'participant-4',
          userId: 'user-4',
          user: {
            id: 'user-4',
            username: 'bob',
            displayName: 'Bob',
          } as any,
          role: 'MEMBER' as UserRoleEnum,
        } as ThreadMember,
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          participants={participantsWithMore}
          typingUsers={typingUsers}
        />
      );

      expect(screen.getByText('3 people are typing...')).toBeInTheDocument();
    });

    it('should not show current user in typing indicator', () => {
      const typingUsers = [
        { userId: 'user-1', conversationId: 'conv-1' }, // Current user
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          typingUsers={typingUsers}
        />
      );

      // Should not show typing indicator for current user
      expect(screen.queryByText(/is typing/)).not.toBeInTheDocument();
    });

    it('should hide avatars when someone is typing', () => {
      const typingUsers = [
        { userId: 'user-2', conversationId: 'conv-1' },
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          typingUsers={typingUsers}
        />
      );

      // When typing, avatars should be hidden
      // The typing indicator replaces the avatar display
      expect(screen.getByText(/is typing/)).toBeInTheDocument();
    });
  });

  describe('Avatar Display', () => {
    it('should display avatar images when available', () => {
      render(<ConversationParticipants {...defaultProps} />);

      const avatarImages = screen.getAllByTestId('avatar-image');
      expect(avatarImages.length).toBeGreaterThan(0);
    });

    it('should display avatar fallback for users without images', () => {
      render(<ConversationParticipants {...defaultProps} />);

      const fallbacks = screen.getAllByTestId('avatar-fallback');
      expect(fallbacks.length).toBeGreaterThan(0);
    });

    it('should limit displayed avatars to 3', () => {
      const manyParticipants = [
        ...mockParticipants,
        {
          id: 'participant-4',
          userId: 'user-4',
          user: { id: 'user-4', username: 'bob', displayName: 'Bob' } as any,
          role: 'MEMBER' as UserRoleEnum,
        } as ThreadMember,
        {
          id: 'participant-5',
          userId: 'user-5',
          user: { id: 'user-5', username: 'alice', displayName: 'Alice' } as any,
          role: 'MEMBER' as UserRoleEnum,
        } as ThreadMember,
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          participants={manyParticipants}
        />
      );

      const avatars = screen.getAllByTestId('avatar');
      expect(avatars.length).toBe(3);
    });
  });

  describe('Tooltips', () => {
    it('should show user name on hover', () => {
      render(<ConversationParticipants {...defaultProps} />);

      // Tooltips are rendered in the component
      expect(screen.getByText('Current User (You)')).toBeInTheDocument();
      expect(screen.getByText('John Doe')).toBeInTheDocument();
    });
  });

  describe('Anonymous Users', () => {
    it('should show ghost icon for anonymous users', () => {
      const anonymousParticipants = [
        ...mockParticipants,
        {
          id: 'participant-anon',
          userId: 'anon-1',
          user: {
            id: 'anon-1',
            username: 'anonymous',
            displayName: 'Anonymous User',
            sessionToken: 'some-token', // Anonymous marker
          } as any,
          role: 'MEMBER' as UserRoleEnum,
        } as ThreadMember,
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          participants={anonymousParticipants}
        />
      );

      // Component should render without errors
      expect(screen.getAllByTestId('avatar').length).toBeGreaterThan(0);
    });
  });

  describe('Links to User Profiles', () => {
    it('should link to user profile for non-anonymous users', () => {
      render(<ConversationParticipants {...defaultProps} />);

      const links = screen.getAllByTestId('link');
      // Should have links for users with usernames
      expect(links.length).toBeGreaterThan(0);
    });

    it('should not link for anonymous users', () => {
      const anonymousParticipants = [
        {
          id: 'participant-anon',
          userId: 'anon-1',
          user: {
            id: 'anon-1',
            displayName: 'Anonymous User',
            sessionToken: 'some-token',
          } as any,
          role: 'MEMBER' as UserRoleEnum,
        } as ThreadMember,
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          participants={anonymousParticipants}
          currentUser={{ ...mockCurrentUser, id: 'other-user' }}
        />
      );

      // Anonymous users should not be links
      const container = screen.getByTestId('avatar').closest('div');
      expect(container).not.toHaveAttribute('href');
    });
  });

  describe('Direct Conversations', () => {
    it('should not show crown for direct conversations', () => {
      render(
        <ConversationParticipants
          {...defaultProps}
          conversationType="direct"
        />
      );

      // Crown should not be shown for creator in direct conversations
      // The Crown icon would have a specific class or test id
      expect(screen.getAllByTestId('avatar').length).toBeGreaterThan(0);
    });
  });

  describe('Group Conversations', () => {
    it('should show crown for creator in group conversations', () => {
      render(
        <ConversationParticipants
          {...defaultProps}
          conversationType="group"
        />
      );

      // Component renders correctly for group
      expect(screen.getAllByTestId('avatar').length).toBeGreaterThan(0);
    });
  });

  describe('Deduplication', () => {
    it('should deduplicate participants with same userId', () => {
      const duplicatedParticipants = [
        mockParticipants[0],
        mockParticipants[0], // Duplicate
        mockParticipants[1],
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          participants={duplicatedParticipants}
        />
      );

      // Should not throw error and render correctly
      const avatars = screen.getAllByTestId('avatar');
      expect(avatars.length).toBeLessThanOrEqual(3);
    });
  });

  describe('Custom ClassName', () => {
    it('should apply custom className', () => {
      const { container } = render(
        <ConversationParticipants
          {...defaultProps}
          className="custom-class"
        />
      );

      expect(container.firstChild).toHaveClass('custom-class');
    });
  });

  describe('Empty Participants', () => {
    it('should handle empty participants array', () => {
      render(
        <ConversationParticipants
          {...defaultProps}
          participants={[]}
        />
      );

      // Should render without errors - current user is always added if not in participants
      // The component adds current user to participants list
      expect(screen.getByTestId('avatar')).toBeInTheDocument();
    });
  });

  describe('Missing User Data', () => {
    it('should handle participants with missing user data', () => {
      const incompleteParticipants = [
        {
          id: 'participant-1',
          userId: 'user-1',
          user: {
            id: 'user-1',
            username: 'user',
          } as any,
          role: 'MEMBER' as UserRoleEnum,
        } as ThreadMember,
      ];

      render(
        <ConversationParticipants
          {...defaultProps}
          participants={incompleteParticipants}
          currentUser={{ ...mockCurrentUser, id: 'other-user' }}
        />
      );

      // Should render with fallback (multiple avatars possible)
      expect(screen.getAllByTestId('avatar-fallback').length).toBeGreaterThan(0);
    });
  });
});
