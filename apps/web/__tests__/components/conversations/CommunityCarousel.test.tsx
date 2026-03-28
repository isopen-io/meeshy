import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommunityCarousel, CommunityFilter } from '../../../components/conversations/CommunityCarousel';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';

const mockUseCommunitiesQuery = jest.fn();

jest.mock('@/hooks/queries', () => ({
  useCommunitiesQuery: (...args: unknown[]) => mockUseCommunitiesQuery(...args),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
  AvatarImage: ({ src, className }: { src?: string; className?: string }) => (
    src ? <img data-testid="avatar-image" src={src} className={className} alt="" /> : null
  ),
}));

jest.mock('@/components/ui/scroll-area', () => ({
  ScrollArea: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="scroll-area" className={className}>{children}</div>
  ),
  ScrollBar: ({ orientation }: { orientation?: string }) => (
    <div data-testid="scroll-bar" data-orientation={orientation} />
  ),
}));

jest.mock('@/lib/utils', () => ({
  cn: (...classes: (string | undefined | boolean)[]) => classes.filter(Boolean).join(' '),
}));

const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    title: 'Conversation 1',
    type: 'group',
    communityId: 'community-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Conversation,
  {
    id: 'conv-2',
    title: 'Conversation 2',
    type: 'direct',
    communityId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Conversation,
  {
    id: 'conv-3',
    title: 'Conversation 3',
    type: 'group',
    communityId: 'community-2',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as unknown as Conversation,
];

const mockCommunities = [
  {
    id: 'community-1',
    name: 'Test Community 1',
    avatar: 'https://example.com/avatar1.jpg',
    _count: { members: 10, conversations: 5 },
  },
  {
    id: 'community-2',
    name: 'Test Community 2',
    avatar: null,
    _count: { members: 25, conversations: 3 },
  },
];

const mockPreferencesMap = new Map<string, UserConversationPreferences>([
  ['conv-1', { conversationId: 'conv-1', isArchived: false, reaction: null } as unknown as UserConversationPreferences],
  ['conv-2', { conversationId: 'conv-2', isArchived: true, reaction: null } as unknown as UserConversationPreferences],
  ['conv-3', { conversationId: 'conv-3', isArchived: false, reaction: 'heart' } as unknown as UserConversationPreferences],
]);

const mockT = (key: string) => {
  const translations: Record<string, string> = {
    'conversationsList.all': 'All',
    'conversationsList.archived': 'Archived',
    'conversationsList.reacted': 'Favorites',
  };
  return translations[key] || key;
};

describe('CommunityCarousel', () => {
  const mockOnFilterChange = jest.fn();
  const defaultProps = {
    conversations: mockConversations,
    selectedFilter: { type: 'all' } as CommunityFilter,
    onFilterChange: mockOnFilterChange,
    t: mockT,
    preferencesMap: mockPreferencesMap,
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockUseCommunitiesQuery.mockReturnValue({
      data: mockCommunities,
      isLoading: false,
      isSuccess: true,
    });
  });

  describe('Initial Render', () => {
    it('should show loading spinner when data is loading', () => {
      mockUseCommunitiesQuery.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      const { container } = render(<CommunityCarousel {...defaultProps} />);
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should render cards after loading', () => {
      render(<CommunityCarousel {...defaultProps} />);

      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Test Community 1')).toBeInTheDocument();
      expect(screen.getByText('Test Community 2')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    it('should show Favorites card when there are reacted conversations', () => {
      render(<CommunityCarousel {...defaultProps} />);
      expect(screen.getByText('Favorites')).toBeInTheDocument();
    });

    it('should not show Favorites card when no conversations have reactions', () => {
      const noReactionsMap = new Map<string, UserConversationPreferences>([
        ['conv-1', { conversationId: 'conv-1', isArchived: false, reaction: null } as unknown as UserConversationPreferences],
        ['conv-2', { conversationId: 'conv-2', isArchived: false, reaction: null } as unknown as UserConversationPreferences],
      ]);

      render(<CommunityCarousel {...defaultProps} preferencesMap={noReactionsMap} />);
      expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onFilterChange with "all" filter when All card is clicked', () => {
      render(<CommunityCarousel {...defaultProps} />);

      const allCard = screen.getByText('All').closest('button');
      fireEvent.click(allCard!);

      expect(mockOnFilterChange).toHaveBeenCalledWith({ type: 'all' });
    });

    it('should call onFilterChange with "archived" filter when Archived card is clicked', () => {
      render(<CommunityCarousel {...defaultProps} />);

      const archivedCard = screen.getByText('Archived').closest('button');
      fireEvent.click(archivedCard!);

      expect(mockOnFilterChange).toHaveBeenCalledWith({ type: 'archived' });
    });

    it('should call onFilterChange with community filter when community card is clicked', () => {
      render(<CommunityCarousel {...defaultProps} />);

      const communityCard = screen.getByText('Test Community 1').closest('button');
      fireEvent.click(communityCard!);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        type: 'community',
        communityId: 'community-1',
      });
    });
  });

  describe('Selection State', () => {
    it('should show selection indicator for "all" filter', () => {
      render(<CommunityCarousel {...defaultProps} selectedFilter={{ type: 'all' }} />);

      const allCard = screen.getByText('All').closest('button');
      expect(allCard).toHaveClass('border-primary');
    });

    it('should show selection indicator for community filter', () => {
      render(
        <CommunityCarousel
          {...defaultProps}
          selectedFilter={{ type: 'community', communityId: 'community-1' }}
        />
      );

      const communityCard = screen.getByText('Test Community 1').closest('button');
      expect(communityCard).toHaveClass('border-primary');
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty communities', () => {
      mockUseCommunitiesQuery.mockReturnValue({
        data: [],
        isLoading: false,
      });

      render(<CommunityCarousel {...defaultProps} />);
      expect(screen.getByText('All')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    it('should handle empty conversations array', () => {
      render(<CommunityCarousel {...defaultProps} conversations={[]} />);
      expect(screen.getByText('All')).toBeInTheDocument();
    });

    it('should handle rapid filter changes', () => {
      render(<CommunityCarousel {...defaultProps} />);

      const allCard = screen.getByText('All').closest('button');
      const archivedCard = screen.getByText('Archived').closest('button');

      fireEvent.click(allCard!);
      fireEvent.click(archivedCard!);
      fireEvent.click(allCard!);

      expect(mockOnFilterChange).toHaveBeenCalledTimes(3);
    });
  });
});
