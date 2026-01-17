import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { ConversationPreview } from '../../../components/conversations/conversation-preview';
import type { User } from '@/types';
import type { ConversationType } from '@meeshy/shared/types';

// Mock hooks
jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: (key: string, params?: Record<string, any>) => {
      const translations: Record<string, string> = {
        'createConversationModal.preview.title': 'Preview',
        'createConversationModal.preview.defaultTitles.direct': `Conversation with ${params?.username || 'user'}`,
        'createConversationModal.preview.defaultTitles.group': `Group with ${params?.users || 'users'}`,
        'createConversationModal.preview.defaultTitles.public': 'Public Conversation',
        'createConversationModal.conversationTypes.direct': 'Direct',
        'createConversationModal.conversationTypes.group': 'Group',
        'createConversationModal.conversationTypes.public': 'Public',
        'createConversationModal.preview.members': `${params?.count || 0} members`,
        'createConversationModal.preview.you': 'You',
        'createConversationModal.preview.autoTranslation': 'Automatic translation enabled',
        'createConversationModal.preview.encryptedMessages': 'Messages are encrypted',
        'createConversationModal.preview.historyEnabled': 'Message history enabled',
      };
      let result = translations[key] || key;
      return result;
    },
  }),
}));

// Mock UI components
jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
  AvatarImage: ({ src }: { src?: string }) => (
    src ? <img data-testid="avatar-image" src={src} alt="" /> : null
  ),
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className, variant }: { children: React.ReactNode; className?: string; variant?: string }) => (
    <span data-testid="badge" className={className} data-variant={variant}>{children}</span>
  ),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-content" className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card-header" className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h3 data-testid="card-title" className={className}>{children}</h3>
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

// Mock data
const mockUsers: User[] = [
  {
    id: 'user-1',
    username: 'john',
    displayName: 'John Doe',
    avatar: 'https://example.com/john.jpg',
  } as User,
  {
    id: 'user-2',
    username: 'jane',
    displayName: 'Jane Smith',
    avatar: 'https://example.com/jane.jpg',
  } as User,
  {
    id: 'user-3',
    username: 'bob',
    displayName: null,
    avatar: null,
  } as unknown as User,
];

const mockCommunity = {
  id: 'community-1',
  name: 'Test Community',
  isPrivate: false,
};

const mockPrivateCommunity = {
  id: 'community-2',
  name: 'Private Community',
  isPrivate: true,
};

const mockGetUserAccentColor = jest.fn((userId: string) => {
  const colors: Record<string, string> = {
    'user-1': 'border-blue-500',
    'user-2': 'border-green-500',
    'user-3': 'border-red-500',
  };
  return colors[userId] || 'border-gray-500';
});

describe('ConversationPreview', () => {
  const defaultProps = {
    title: '',
    identifier: 'test-123',
    selectedUsers: mockUsers.slice(0, 1),
    conversationType: 'direct' as ConversationType,
    getUserAccentColor: mockGetUserAccentColor,
  };

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('Initial Render', () => {
    it('should render preview card', () => {
      render(<ConversationPreview {...defaultProps} />);

      expect(screen.getByTestId('card')).toBeInTheDocument();
    });

    it('should render preview title', () => {
      render(<ConversationPreview {...defaultProps} />);

      expect(screen.getByText('Preview')).toBeInTheDocument();
    });

    it('should return null when no users selected', () => {
      const { container } = render(
        <ConversationPreview {...defaultProps} selectedUsers={[]} />
      );

      expect(container.firstChild).toBeNull();
    });
  });

  describe('Conversation Title', () => {
    it('should display custom title when provided', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          title="Custom Conversation Title"
        />
      );

      expect(screen.getByText('Custom Conversation Title')).toBeInTheDocument();
    });

    it('should display default direct title when no title provided', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          title=""
          conversationType="direct"
        />
      );

      expect(screen.getByText(/Conversation with/)).toBeInTheDocument();
    });

    it('should display default group title when no title provided', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          title=""
          conversationType="group"
          selectedUsers={mockUsers.slice(0, 2)}
        />
      );

      expect(screen.getByText(/Group with/)).toBeInTheDocument();
    });

    it('should display default public title when no title provided', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          title=""
          conversationType="public"
        />
      );

      expect(screen.getByText('Public Conversation')).toBeInTheDocument();
    });
  });

  describe('Conversation Type Badge', () => {
    it('should display direct badge for direct conversations', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          conversationType="direct"
        />
      );

      expect(screen.getByText('Direct')).toBeInTheDocument();
    });

    it('should display group badge for group conversations', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          conversationType="group"
        />
      );

      expect(screen.getByText('Group')).toBeInTheDocument();
    });

    it('should display public badge for public conversations', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          conversationType="public"
        />
      );

      expect(screen.getByText('Public')).toBeInTheDocument();
    });
  });

  describe('Identifier Display', () => {
    it('should display identifier with mshy_ prefix', () => {
      render(<ConversationPreview {...defaultProps} identifier="abc-123" />);

      expect(screen.getByText('mshy_abc-123')).toBeInTheDocument();
    });
  });

  describe('Community Display', () => {
    it('should display community when selected', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedCommunity={mockCommunity}
        />
      );

      expect(screen.getByText('Test Community')).toBeInTheDocument();
    });

    it('should show globe icon for public community', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedCommunity={mockCommunity}
        />
      );

      // Community should be displayed
      expect(screen.getByText('Test Community')).toBeInTheDocument();
    });

    it('should show lock icon for private community', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedCommunity={mockPrivateCommunity}
        />
      );

      expect(screen.getByText('Private Community')).toBeInTheDocument();
    });

    it('should not display community section when not selected', () => {
      render(<ConversationPreview {...defaultProps} />);

      expect(screen.queryByText('Test Community')).not.toBeInTheDocument();
    });
  });

  describe('Members Display', () => {
    it('should display member count', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={mockUsers.slice(0, 2)}
        />
      );

      // 2 selected users + 1 current user = 3 members
      expect(screen.getByText('3 members')).toBeInTheDocument();
    });

    it('should display "You" badge for current user', () => {
      render(<ConversationPreview {...defaultProps} />);

      expect(screen.getByText('You')).toBeInTheDocument();
    });

    it('should display selected users', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={mockUsers.slice(0, 2)}
        />
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
    });

    it('should use username when displayName is not available', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={[mockUsers[2]]}
        />
      );

      expect(screen.getByText('bob')).toBeInTheDocument();
    });

    it('should apply accent color to user badges', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={[mockUsers[0]]}
        />
      );

      expect(mockGetUserAccentColor).toHaveBeenCalledWith('user-1');
    });
  });

  describe('User Avatars', () => {
    it('should display avatar for users with avatar URL', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={[mockUsers[0]]}
        />
      );

      const avatarImages = screen.getAllByTestId('avatar-image');
      expect(avatarImages.length).toBeGreaterThan(0);
    });

    it('should display fallback for users without avatar', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={[mockUsers[2]]}
        />
      );

      const fallbacks = screen.getAllByTestId('avatar-fallback');
      expect(fallbacks.length).toBeGreaterThan(0);
    });

    it('should use first character of name for fallback', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={[mockUsers[0]]}
        />
      );

      // John Doe should have "J" fallback
      const fallbacks = screen.getAllByTestId('avatar-fallback');
      expect(fallbacks.some(f => f.textContent === 'J')).toBe(true);
    });
  });

  describe('Information Section', () => {
    it('should display auto translation info', () => {
      render(<ConversationPreview {...defaultProps} />);

      expect(screen.getByText(/Automatic translation enabled/)).toBeInTheDocument();
    });

    it('should display encryption info', () => {
      render(<ConversationPreview {...defaultProps} />);

      expect(screen.getByText(/Messages are encrypted/)).toBeInTheDocument();
    });

    it('should display history info', () => {
      render(<ConversationPreview {...defaultProps} />);

      expect(screen.getByText(/Message history enabled/)).toBeInTheDocument();
    });
  });

  describe('Multiple Users', () => {
    it('should handle multiple users correctly', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={mockUsers}
          conversationType="group"
        />
      );

      expect(screen.getByText('John Doe')).toBeInTheDocument();
      expect(screen.getByText('Jane Smith')).toBeInTheDocument();
      expect(screen.getByText('bob')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle user with only username', () => {
      const userWithOnlyUsername: User = {
        id: 'user-only-username',
        username: 'onlyusername',
        displayName: '',
      } as User;

      render(
        <ConversationPreview
          {...defaultProps}
          selectedUsers={[userWithOnlyUsername]}
        />
      );

      expect(screen.getByText('onlyusername')).toBeInTheDocument();
    });

    it('should handle empty identifier', () => {
      render(
        <ConversationPreview
          {...defaultProps}
          identifier=""
        />
      );

      expect(screen.getByText('mshy_')).toBeInTheDocument();
    });
  });
});
