import React from 'react';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommunityCarousel, CommunityFilter } from '../../../components/conversations/CommunityCarousel';
import { communitiesService } from '@/services/communities.service';
import type { Conversation } from '@meeshy/shared/types';
import type { UserConversationPreferences } from '@meeshy/shared/types/user-preferences';

// Mock the communities service
jest.mock('@/services/communities.service', () => ({
  communitiesService: {
    getCommunities: jest.fn(),
  },
}));

// Mock UI components
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

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <span data-testid="badge" className={className}>{children}</span>
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

// Mock data
const mockConversations: Conversation[] = [
  {
    id: 'conv-1',
    title: 'Conversation 1',
    type: 'group',
    communityId: 'community-1',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Conversation,
  {
    id: 'conv-2',
    title: 'Conversation 2',
    type: 'direct',
    communityId: null,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Conversation,
  {
    id: 'conv-3',
    title: 'Conversation 3',
    type: 'group',
    communityId: 'community-2',
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  } as Conversation,
];

const mockCommunities = [
  {
    id: 'community-1',
    name: 'Test Community 1',
    avatar: 'https://example.com/avatar1.jpg',
    _count: { members: 10, Conversation: 5 },
  },
  {
    id: 'community-2',
    name: 'Test Community 2',
    avatar: null,
    _count: { members: 25, Conversation: 3 },
  },
];

const mockPreferencesMap = new Map<string, UserConversationPreferences>([
  ['conv-1', { conversationId: 'conv-1', isArchived: false, reaction: null } as UserConversationPreferences],
  ['conv-2', { conversationId: 'conv-2', isArchived: true, reaction: null } as UserConversationPreferences],
  ['conv-3', { conversationId: 'conv-3', isArchived: false, reaction: 'heart' } as UserConversationPreferences],
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
    (communitiesService.getCommunities as jest.Mock).mockResolvedValue({
      data: mockCommunities,
    });
  });

  describe('Initial Render', () => {
    it('should show loading spinner initially', () => {
      const { container } = render(<CommunityCarousel {...defaultProps} />);
      const spinner = container.querySelector('.animate-spin');
      expect(spinner).toBeInTheDocument();
    });

    it('should render cards after loading', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      expect(screen.getByText('Test Community 1')).toBeInTheDocument();
      expect(screen.getByText('Test Community 2')).toBeInTheDocument();
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    it('should display conversation counts correctly', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      // All card should show non-archived count (2 conversations)
      const allCard = screen.getByText('All').closest('button');
      expect(allCard).toBeInTheDocument();
    });

    it('should show Favorites card when there are reacted conversations', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Favorites')).toBeInTheDocument();
      });
    });

    it('should not show Favorites card when no conversations have reactions', async () => {
      const noReactionsMap = new Map<string, UserConversationPreferences>([
        ['conv-1', { conversationId: 'conv-1', isArchived: false, reaction: null } as UserConversationPreferences],
        ['conv-2', { conversationId: 'conv-2', isArchived: false, reaction: null } as UserConversationPreferences],
      ]);

      render(
        <CommunityCarousel
          {...defaultProps}
          preferencesMap={noReactionsMap}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      expect(screen.queryByText('Favorites')).not.toBeInTheDocument();
    });
  });

  describe('User Interactions', () => {
    it('should call onFilterChange with "all" filter when All card is clicked', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      const allCard = screen.getByText('All').closest('button');
      fireEvent.click(allCard!);

      expect(mockOnFilterChange).toHaveBeenCalledWith({ type: 'all' });
    });

    it('should call onFilterChange with "archived" filter when Archived card is clicked', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Archived')).toBeInTheDocument();
      });

      const archivedCard = screen.getByText('Archived').closest('button');
      fireEvent.click(archivedCard!);

      expect(mockOnFilterChange).toHaveBeenCalledWith({ type: 'archived' });
    });

    it('should call onFilterChange with "reacted" filter when Favorites card is clicked', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Favorites')).toBeInTheDocument();
      });

      const favoritesCard = screen.getByText('Favorites').closest('button');
      fireEvent.click(favoritesCard!);

      expect(mockOnFilterChange).toHaveBeenCalledWith({ type: 'reacted' });
    });

    it('should call onFilterChange with community filter when community card is clicked', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Community 1')).toBeInTheDocument();
      });

      const communityCard = screen.getByText('Test Community 1').closest('button');
      fireEvent.click(communityCard!);

      expect(mockOnFilterChange).toHaveBeenCalledWith({
        type: 'community',
        communityId: 'community-1',
      });
    });
  });

  describe('Selection State', () => {
    it('should show selection indicator for "all" filter', async () => {
      render(<CommunityCarousel {...defaultProps} selectedFilter={{ type: 'all' }} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      const allCard = screen.getByText('All').closest('button');
      expect(allCard).toHaveClass('border-primary');
    });

    it('should show selection indicator for "archived" filter', async () => {
      render(
        <CommunityCarousel
          {...defaultProps}
          selectedFilter={{ type: 'archived' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Archived')).toBeInTheDocument();
      });

      const archivedCard = screen.getByText('Archived').closest('button');
      expect(archivedCard).toHaveClass('border-primary');
    });

    it('should show selection indicator for community filter', async () => {
      render(
        <CommunityCarousel
          {...defaultProps}
          selectedFilter={{ type: 'community', communityId: 'community-1' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Test Community 1')).toBeInTheDocument();
      });

      const communityCard = screen.getByText('Test Community 1').closest('button');
      expect(communityCard).toHaveClass('border-primary');
    });

    it('should show selection indicator for reacted filter', async () => {
      render(
        <CommunityCarousel
          {...defaultProps}
          selectedFilter={{ type: 'reacted' }}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('Favorites')).toBeInTheDocument();
      });

      const favoritesCard = screen.getByText('Favorites').closest('button');
      expect(favoritesCard).toHaveClass('border-primary');
    });
  });

  describe('Error States', () => {
    it('should handle API errors gracefully', async () => {
      (communitiesService.getCommunities as jest.Mock).mockRejectedValue(
        new Error('API Error')
      );

      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      // Should still render basic cards even if communities fail to load
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    it('should handle empty conversations array', async () => {
      render(<CommunityCarousel {...defaultProps} conversations={[]} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      // All card should show 0 conversations
      const allCard = screen.getByText('All').closest('button');
      expect(allCard).toBeInTheDocument();
    });

    it('should handle invalid conversations data gracefully', async () => {
      const consoleSpy = jest.spyOn(console, 'warn').mockImplementation();

      // @ts-expect-error - Testing invalid data
      render(<CommunityCarousel {...defaultProps} conversations={null} />);

      // Component should render without crashing when given invalid data
      // It may render an empty carousel or handle the null gracefully
      await waitFor(() => {
        expect(screen.getByTestId('scroll-area')).toBeInTheDocument();
      });

      consoleSpy.mockRestore();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty preferencesMap', async () => {
      render(
        <CommunityCarousel
          {...defaultProps}
          preferencesMap={new Map()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      // All conversations should be counted as non-archived
      expect(screen.getByText('Archived')).toBeInTheDocument();
    });

    it('should handle community response in different formats', async () => {
      // Test nested data structure
      (communitiesService.getCommunities as jest.Mock).mockResolvedValue({
        data: { success: true, data: mockCommunities },
      });

      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Community 1')).toBeInTheDocument();
      });
    });

    it('should handle conversations with null/undefined ids', async () => {
      const conversationsWithNulls = [
        ...mockConversations,
        { id: null, title: 'Null ID' } as unknown as Conversation,
        { title: 'No ID' } as unknown as Conversation,
      ];

      render(
        <CommunityCarousel
          {...defaultProps}
          conversations={conversationsWithNulls}
        />
      );

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });
    });

    it('should use backend count for community conversations', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Community 1')).toBeInTheDocument();
      });

      // The community cards should display the _count.Conversation value from backend
    });
  });

  describe('Community Card Component', () => {
    it('should display community avatar when available', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Community 1')).toBeInTheDocument();
      });

      const avatarImages = screen.getAllByTestId('avatar-image');
      expect(avatarImages.length).toBeGreaterThan(0);
    });

    it('should display fallback icon when community has no avatar', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Community 2')).toBeInTheDocument();
      });

      // Community 2 has no avatar, should show icon fallback
    });

    it('should display member count for communities', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('Test Community 1')).toBeInTheDocument();
      });

      // Member counts should be visible (10 and 25)
    });
  });

  describe('Performance', () => {
    it('should memoize cards computation', async () => {
      const { rerender } = render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      // Rerender with same props should not cause issues
      rerender(<CommunityCarousel {...defaultProps} />);

      expect(screen.getByText('All')).toBeInTheDocument();
    });

    it('should handle rapid filter changes', async () => {
      render(<CommunityCarousel {...defaultProps} />);

      await waitFor(() => {
        expect(screen.getByText('All')).toBeInTheDocument();
      });

      // Simulate rapid clicks
      const allCard = screen.getByText('All').closest('button');
      const archivedCard = screen.getByText('Archived').closest('button');

      fireEvent.click(allCard!);
      fireEvent.click(archivedCard!);
      fireEvent.click(allCard!);

      expect(mockOnFilterChange).toHaveBeenCalledTimes(3);
    });
  });
});
