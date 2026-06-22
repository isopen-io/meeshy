import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RankingPodium } from '@/components/admin/ranking/RankingPodium';
import type { RankingItem } from '@/hooks/use-ranking-data';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <h3 className={className}>{children}</h3>
  ),
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} data-testid="avatar-image" />
  ),
  AvatarFallback: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar-fallback" className={className}>{children}</div>
  ),
}));

function makeRankingItem(rank: number, overrides: Partial<RankingItem> = {}): RankingItem {
  return {
    id: `item-${rank}`,
    name: `Player ${rank}`,
    rank,
    value: 100 - rank * 10,
    ...overrides,
  };
}

const THREE_USERS = [makeRankingItem(1), makeRankingItem(2), makeRankingItem(3)];

describe('RankingPodium — null conditions', () => {
  it('returns null for recent_activity criterion', () => {
    const { container } = render(
      <RankingPodium rankings={THREE_USERS} entityType="users" criterion="recent_activity" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null for messages entityType', () => {
    const { container } = render(
      <RankingPodium rankings={THREE_USERS} entityType="messages" criterion="most_reactions" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null for links entityType', () => {
    const { container } = render(
      <RankingPodium
        rankings={THREE_USERS}
        entityType="links"
        criterion="tracking_links_most_visited"
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when fewer than 3 rankings', () => {
    const { container } = render(
      <RankingPodium
        rankings={[makeRankingItem(1), makeRankingItem(2)]}
        entityType="users"
        criterion="messages_sent"
      />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('RankingPodium — renders', () => {
  it('renders a card with podium title', () => {
    render(
      <RankingPodium rankings={THREE_USERS} entityType="users" criterion="messages_sent" />
    );
    expect(screen.getByTestId('card')).toBeInTheDocument();
    expect(screen.getByText('rankingPage.podium')).toBeInTheDocument();
  });

  it('shows all three player names', () => {
    render(
      <RankingPodium rankings={THREE_USERS} entityType="users" criterion="messages_sent" />
    );
    expect(screen.getByText('Player 1')).toBeInTheDocument();
    expect(screen.getByText('Player 2')).toBeInTheDocument();
    expect(screen.getByText('Player 3')).toBeInTheDocument();
  });

  it('renders Avatar components for users entity', () => {
    render(
      <RankingPodium rankings={THREE_USERS} entityType="users" criterion="messages_sent" />
    );
    // 3 avatars, one per podium slot
    expect(screen.getAllByTestId('avatar')).toHaveLength(3);
  });

  it('renders type icon divs for conversations entity (no Avatar)', () => {
    const conversations = [
      makeRankingItem(1, { type: 'group' }),
      makeRankingItem(2, { type: 'group' }),
      makeRankingItem(3, { type: 'group' }),
    ];
    render(
      <RankingPodium rankings={conversations} entityType="conversations" criterion="message_count" />
    );
    // No Avatar component for conversations — renderAvatar uses div+getTypeIcon
    expect(screen.queryAllByTestId('avatar')).toHaveLength(0);
  });

  it('shows the Trophy icon', () => {
    render(
      <RankingPodium rankings={THREE_USERS} entityType="users" criterion="messages_sent" />
    );
    // Trophy appears in header and under rank-1 player
    expect(screen.getAllByTestId('trophy-icon').length).toBeGreaterThanOrEqual(1);
  });

  it('shows Medal icons for all three ranks', () => {
    render(
      <RankingPodium rankings={THREE_USERS} entityType="users" criterion="messages_sent" />
    );
    expect(screen.getAllByTestId('medal-icon')).toHaveLength(3);
  });

  it('handles a podium item with no rank (uses fallback index 0)', () => {
    const withNoRank = [
      makeRankingItem(1),
      makeRankingItem(2),
      { ...makeRankingItem(3), rank: undefined },
    ];
    // Should render without throwing even with undefined rank
    expect(() =>
      render(<RankingPodium rankings={withNoRank} entityType="users" criterion="messages_sent" />)
    ).not.toThrow();
  });

  it('shows avatar fallback initials', () => {
    render(
      <RankingPodium
        rankings={[
          makeRankingItem(1, { displayName: 'Alice' }),
          makeRankingItem(2, { displayName: 'Bob' }),
          makeRankingItem(3, { displayName: 'Carol' }),
        ]}
        entityType="users"
        criterion="messages_sent"
      />
    );
    expect(screen.getByText('A')).toBeInTheDocument();
    expect(screen.getByText('B')).toBeInTheDocument();
    expect(screen.getByText('C')).toBeInTheDocument();
  });
});
