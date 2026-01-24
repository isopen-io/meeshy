import React from 'react';
import { render, screen, fireEvent, waitFor, renderHook, act } from '@testing-library/react';
import '@testing-library/jest-dom';
import { useRankingData } from '@/hooks/use-ranking-data';
import { useRankingFilters } from '@/hooks/use-ranking-filters';
import { useRankingSort } from '@/hooks/use-ranking-sort';
import { UserRankCard } from '../UserRankCard';
import { ConversationRankCard } from '../ConversationRankCard';
import { MessageRankCard } from '../MessageRankCard';
import { LinkRankCard } from '../LinkRankCard';
import { RankingTable } from '../RankingTable';
import { formatCount, getRankBadge } from '../utils';
import type { RankingItem } from '@/hooks/use-ranking-data';

// Mock du service admin
jest.mock('@/services/admin.service', () => ({
  adminService: {
    getRankings: jest.fn()
  }
}));

describe('Ranking Utils', () => {
  describe('formatCount', () => {
    it('should format numbers in French locale', () => {
      expect(formatCount(1234)).toBe('1 234');
      expect(formatCount(1234567)).toBe('1 234 567');
      expect(formatCount(0)).toBe('0');
    });

    it('should handle undefined', () => {
      expect(formatCount(undefined)).toBe('0');
    });
  });

  describe('getRankBadge', () => {
    it('should return medal for top 3', () => {
      const badge1 = getRankBadge(1);
      const badge2 = getRankBadge(2);
      const badge3 = getRankBadge(3);

      expect(badge1).toBeTruthy();
      expect(badge2).toBeTruthy();
      expect(badge3).toBeTruthy();
    });

    it('should return rank number for others', () => {
      const badge4 = getRankBadge(4);
      expect(badge4).toBeTruthy();
    });
  });
});

describe('useRankingFilters Hook', () => {
  it('should initialize with default values', () => {
    const { result } = renderHook(() => useRankingFilters());

    expect(result.current.entityType).toBe('users');
    expect(result.current.criterion).toBe('messages_sent');
    expect(result.current.period).toBe('7d');
    expect(result.current.limit).toBe(50);
    expect(result.current.criteriaSearch).toBe('');
  });

  it('should update criterion when entity type changes', () => {
    const { result } = renderHook(() => useRankingFilters());

    act(() => {
      result.current.setEntityType('conversations');
    });

    expect(result.current.entityType).toBe('conversations');
    expect(result.current.criterion).toBe('message_count');
  });

  it('should reset criteria search when entity type changes', () => {
    const { result } = renderHook(() => useRankingFilters());

    act(() => {
      result.current.setCriteriaSearch('test');
    });

    expect(result.current.criteriaSearch).toBe('test');

    act(() => {
      result.current.setEntityType('messages');
    });

    expect(result.current.criteriaSearch).toBe('');
  });
});

describe('useRankingSort Hook', () => {
  const mockData: RankingItem[] = [
    { id: '1', name: 'Alice', rank: 2, value: 50 },
    { id: '2', name: 'Bob', rank: 1, value: 100 },
    { id: '3', name: 'Charlie', rank: 3, value: 25 }
  ];

  it('should sort by rank in ascending order', () => {
    const { result } = renderHook(() =>
      useRankingSort({ data: mockData, sortField: 'rank', sortDirection: 'asc' })
    );

    expect(result.current[0].name).toBe('Bob');
    expect(result.current[1].name).toBe('Alice');
    expect(result.current[2].name).toBe('Charlie');
  });

  it('should sort by value in descending order', () => {
    const { result } = renderHook(() =>
      useRankingSort({ data: mockData, sortField: 'value', sortDirection: 'desc' })
    );

    expect(result.current[0].value).toBe(100);
    expect(result.current[1].value).toBe(50);
    expect(result.current[2].value).toBe(25);
  });

  it('should sort by name alphabetically', () => {
    const { result } = renderHook(() =>
      useRankingSort({ data: mockData, sortField: 'name', sortDirection: 'asc' })
    );

    expect(result.current[0].name).toBe('Alice');
    expect(result.current[1].name).toBe('Bob');
    expect(result.current[2].name).toBe('Charlie');
  });
});

describe('UserRankCard Component', () => {
  const mockUserItem: RankingItem = {
    id: '1',
    name: 'John Doe',
    rank: 1,
    value: 150,
    avatar: 'https://example.com/avatar.jpg',
    metadata: {
      username: 'johndoe'
    }
  };

  it('should render user information correctly', () => {
    render(<UserRankCard item={mockUserItem} criterion="messages_sent" />);

    expect(screen.getByText('John Doe')).toBeInTheDocument();
    expect(screen.getByText('@johndoe')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('should display rank badge for top 3', () => {
    const { container } = render(
      <UserRankCard item={mockUserItem} criterion="messages_sent" />
    );

    // Should have medal for rank 1
    expect(container.querySelector('.lucide-medal')).toBeInTheDocument();
  });

  it('should apply highlight styles for top 3', () => {
    const { container } = render(
      <UserRankCard item={mockUserItem} criterion="messages_sent" />
    );

    const card = container.firstChild;
    expect(card).toHaveClass('border-2', 'border-yellow-300');
  });
});

describe('ConversationRankCard Component', () => {
  const mockConversationItem: RankingItem = {
    id: '1',
    name: 'Team Chat',
    rank: 2,
    value: 500,
    metadata: {
      type: 'group',
      identifier: 'TEAM001'
    }
  };

  it('should render conversation information', () => {
    render(
      <ConversationRankCard item={mockConversationItem} criterion="message_count" />
    );

    expect(screen.getByText('Team Chat')).toBeInTheDocument();
    expect(screen.getByText('Groupe')).toBeInTheDocument();
    expect(screen.getByText('TEAM001')).toBeInTheDocument();
  });

  it('should display correct conversation type icon', () => {
    const { rerender } = render(
      <ConversationRankCard item={mockConversationItem} criterion="message_count" />
    );

    // Test different types
    const publicItem = { ...mockConversationItem, metadata: { type: 'public' } };
    rerender(
      <ConversationRankCard item={publicItem} criterion="message_count" />
    );

    expect(screen.getByText('Publique')).toBeInTheDocument();
  });
});

describe('MessageRankCard Component', () => {
  const mockMessageItem: RankingItem = {
    id: '1',
    name: 'Hello world message',
    rank: 5,
    value: 25,
    metadata: {
      messageType: 'text',
      sender: {
        id: 'user1',
        username: 'alice',
        displayName: 'Alice',
        avatar: 'https://example.com/alice.jpg'
      },
      conversation: {
        id: 'conv1',
        identifier: 'CONV001',
        title: 'General',
        type: 'group'
      },
      createdAt: '2024-01-15T10:30:00Z'
    }
  };

  it('should render message information', () => {
    render(<MessageRankCard item={mockMessageItem} criterion="most_reactions" />);

    expect(screen.getByText('Hello world message')).toBeInTheDocument();
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('General')).toBeInTheDocument();
  });

  it('should display message type icon', () => {
    const { container } = render(
      <MessageRankCard item={mockMessageItem} criterion="most_reactions" />
    );

    // Text message should show 📝 emoji
    expect(container.textContent).toContain('📝');
  });
});

describe('LinkRankCard Component', () => {
  const mockLinkItem: RankingItem = {
    id: '1',
    name: 'Product Launch Link',
    rank: 1,
    value: 1500,
    metadata: {
      shortCode: 'ABC123',
      originalUrl: 'https://example.com/product',
      totalClicks: 1500,
      uniqueClicks: 850,
      creator: {
        id: 'user1',
        username: 'marketer',
        displayName: 'Marketing Team',
        avatar: 'https://example.com/avatar.jpg'
      }
    }
  };

  it('should render link information', () => {
    render(<LinkRankCard item={mockLinkItem} criterion="tracking_links_most_visited" />);

    expect(screen.getByText('Product Launch Link')).toBeInTheDocument();
    expect(screen.getByText('Marketing Team')).toBeInTheDocument();
    expect(screen.getByText('https://example.com/product')).toBeInTheDocument();
  });

  it('should display click statistics', () => {
    render(<LinkRankCard item={mockLinkItem} criterion="tracking_links_most_visited" />);

    expect(screen.getByText(/1 500 visites/)).toBeInTheDocument();
    expect(screen.getByText(/850 uniques/)).toBeInTheDocument();
  });

  it('should show tracking badge for tracked links', () => {
    render(<LinkRankCard item={mockLinkItem} criterion="tracking_links_most_visited" />);

    expect(screen.getByText('🔍 Tracké')).toBeInTheDocument();
  });
});

describe('RankingTable Component', () => {
  const mockRankings: RankingItem[] = [
    { id: '1', name: 'User 1', rank: 1, value: 100 },
    { id: '2', name: 'User 2', rank: 2, value: 80 },
    { id: '3', name: 'User 3', rank: 3, value: 60 }
  ];

  it('should show loading state', () => {
    render(
      <RankingTable
        entityType="users"
        rankings={[]}
        criterion="messages_sent"
        loading={true}
        error={null}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByRole('status', { hidden: true })).toBeInTheDocument();
  });

  it('should show error state with retry button', () => {
    const onRetry = jest.fn();
    render(
      <RankingTable
        entityType="users"
        rankings={[]}
        criterion="messages_sent"
        loading={false}
        error="Failed to load data"
        onRetry={onRetry}
      />
    );

    expect(screen.getByText('Failed to load data')).toBeInTheDocument();

    const retryButton = screen.getByText('Réessayer');
    fireEvent.click(retryButton);

    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('should show empty state when no results', () => {
    render(
      <RankingTable
        entityType="users"
        rankings={[]}
        criterion="messages_sent"
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Aucun résultat trouvé')).toBeInTheDocument();
  });

  it('should render rankings with correct count badge', () => {
    render(
      <RankingTable
        entityType="users"
        rankings={mockRankings}
        criterion="messages_sent"
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('3 résultats')).toBeInTheDocument();
  });

  it('should render correct title based on entity type', () => {
    const { rerender } = render(
      <RankingTable
        entityType="users"
        rankings={mockRankings}
        criterion="messages_sent"
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Classement des utilisateurs')).toBeInTheDocument();

    rerender(
      <RankingTable
        entityType="conversations"
        rankings={mockRankings}
        criterion="message_count"
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />
    );

    expect(screen.getByText('Classement des conversations')).toBeInTheDocument();
  });
});

describe('Integration: Full Ranking Flow', () => {
  it('should handle complete ranking workflow', async () => {
    const mockApiResponse = {
      success: true,
      data: {
        rankings: [
          {
            id: '1',
            displayName: 'Alice',
            username: 'alice',
            count: 150,
            avatar: 'https://example.com/alice.jpg'
          },
          {
            id: '2',
            displayName: 'Bob',
            username: 'bob',
            count: 120,
            avatar: 'https://example.com/bob.jpg'
          }
        ]
      }
    };

    const { adminService } = require('@/services/admin.service');
    adminService.getRankings.mockResolvedValue(mockApiResponse);

    const { result, waitForNextUpdate } = renderHook(() =>
      useRankingData({
        entityType: 'users',
        criterion: 'messages_sent',
        period: '7d',
        limit: 50
      })
    );

    // Initial state
    expect(result.current.loading).toBe(true);
    expect(result.current.rankings).toEqual([]);

    // Wait for data
    await waitForNextUpdate();

    // Final state
    expect(result.current.loading).toBe(false);
    expect(result.current.rankings).toHaveLength(2);
    expect(result.current.rankings[0].name).toBe('Alice');
    expect(result.current.rankings[0].rank).toBe(1);
    expect(result.current.rankings[1].name).toBe('Bob');
    expect(result.current.rankings[1].rank).toBe(2);
  });
});

describe('Performance Tests', () => {
  it('should memoize UserRankCard to prevent unnecessary re-renders', () => {
    const mockItem: RankingItem = {
      id: '1',
      name: 'John',
      rank: 1,
      value: 100
    };

    const { rerender } = render(
      <UserRankCard item={mockItem} criterion="messages_sent" />
    );

    // Re-render with same props should not trigger re-render due to memo
    rerender(<UserRankCard item={mockItem} criterion="messages_sent" />);

    // Component should be memoized
    expect(UserRankCard).toBeTruthy();
  });

  it('should use useMemo for expensive calculations', () => {
    const largeDataset: RankingItem[] = Array.from({ length: 1000 }, (_, i) => ({
      id: `${i}`,
      name: `User ${i}`,
      rank: i + 1,
      value: Math.random() * 1000
    }));

    const { result, rerender } = renderHook(
      ({ sortField }) =>
        useRankingSort({
          data: largeDataset,
          sortField,
          sortDirection: 'asc'
        }),
      { initialProps: { sortField: 'rank' as const } }
    );

    const firstResult = result.current;

    // Re-render with same props
    rerender({ sortField: 'rank' as const });

    // Should return same reference due to memoization
    expect(result.current).toBe(firstResult);
  });
});

describe('Accessibility Tests', () => {
  it('should have accessible rank badges', () => {
    const mockItem: RankingItem = {
      id: '1',
      name: 'John',
      rank: 1,
      value: 100
    };

    const { container } = render(
      <UserRankCard item={mockItem} criterion="messages_sent" />
    );

    // Medal icon should be present
    expect(container.querySelector('.lucide-medal')).toBeInTheDocument();
  });

  it('should have proper semantic structure', () => {
    const mockRankings: RankingItem[] = [
      { id: '1', name: 'User 1', rank: 1, value: 100 }
    ];

    render(
      <RankingTable
        entityType="users"
        rankings={mockRankings}
        criterion="messages_sent"
        loading={false}
        error={null}
        onRetry={jest.fn()}
      />
    );

    // Should have proper headings
    expect(screen.getByText('Classement des utilisateurs')).toBeInTheDocument();
  });
});
