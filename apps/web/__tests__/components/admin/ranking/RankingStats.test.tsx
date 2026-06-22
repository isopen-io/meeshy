import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { RankingItem } from '@/hooks/use-ranking-data';

// Stub the heavy Recharts implementation so the dynamic loader resolves fast
jest.mock('@/components/admin/ranking/RankingStatsImpl', () => ({
  RankingStats: ({ criterion }: { criterion: string }) => (
    <div data-testid="stats-impl">{criterion}</div>
  ),
}));

// Mock next/dynamic: invoke the loader synchronously to cover loader lines,
// and render the loading skeleton via opts.loading()
jest.mock('next/dynamic', () => {
  return function dynamic(
    loader: () => Promise<{ default?: React.ComponentType } | React.ComponentType>,
    opts?: { loading?: () => React.ReactNode }
  ) {
    loader().catch(() => {});
    return function DynamicComponent(props: Record<string, unknown>) {
      if (opts?.loading) return <>{opts.loading()}</>;
      return null;
    };
  };
});

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="card" className={className}>{children}</div>
  ),
  CardHeader: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  CardContent: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
}));

import { RankingStats } from '@/components/admin/ranking/RankingStats';

function makeItem(rank: number): RankingItem {
  return { id: `${rank}`, name: `Item ${rank}`, rank, value: rank * 10 };
}

const ITEMS = [makeItem(1), makeItem(2), makeItem(3)];

describe('RankingStats — null conditions', () => {
  it('returns null for recent_activity criterion', () => {
    const { container } = render(
      <RankingStats rankings={ITEMS} criterion="recent_activity" entityType="users" />
    );
    expect(container.firstChild).toBeNull();
  });

  it('returns null when rankings is empty', () => {
    const { container } = render(
      <RankingStats rankings={[]} criterion="messages_sent" entityType="users" />
    );
    expect(container.firstChild).toBeNull();
  });
});

describe('RankingStats — loading skeleton', () => {
  it('renders skeleton cards while loading', () => {
    render(<RankingStats rankings={ITEMS} criterion="messages_sent" entityType="users" />);
    // The skeleton renders 2 Card elements (for heights 400 and 350)
    expect(screen.getAllByTestId('card')).toHaveLength(2);
  });

  it('renders two animated pulse divs', () => {
    const { container } = render(
      <RankingStats rankings={ITEMS} criterion="messages_sent" entityType="users" />
    );
    const pulses = container.querySelectorAll('.animate-pulse');
    expect(pulses.length).toBeGreaterThanOrEqual(2);
  });
});
