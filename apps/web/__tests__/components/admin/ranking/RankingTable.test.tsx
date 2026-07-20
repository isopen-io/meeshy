import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import { RankingTable } from '@/components/admin/ranking/RankingTable';
import type { RankingItem } from '@/hooks/use-ranking-data';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/components/ui/card', () => ({
  Card: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardHeader: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div className={className}>{children}</div>
  ),
  CardTitle: ({ children }: { children: React.ReactNode }) => <h3>{children}</h3>,
  CardContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({
    children,
    variant,
    className,
  }: {
    children: React.ReactNode;
    variant?: string;
    className?: string;
  }) => (
    <span data-testid="badge" data-variant={variant} className={className}>
      {children}
    </span>
  ),
}));

jest.mock('@/components/ui/button', () => ({
  Button: ({
    children,
    onClick,
    className,
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    className?: string;
  }) => (
    <button onClick={onClick} className={className}>
      {children}
    </button>
  ),
}));

jest.mock('@/components/admin/ranking/UserRankCard', () => ({
  UserRankCard: ({ item }: { item: RankingItem }) => (
    <div data-testid={`user-card-${item.id}`}>{item.name}</div>
  ),
}));

jest.mock('@/components/admin/ranking/ConversationRankCard', () => ({
  ConversationRankCard: ({ item }: { item: RankingItem }) => (
    <div data-testid={`conv-card-${item.id}`}>{item.name}</div>
  ),
}));

jest.mock('@/components/admin/ranking/MessageRankCard', () => ({
  MessageRankCard: ({ item }: { item: RankingItem }) => (
    <div data-testid={`msg-card-${item.id}`}>{item.name}</div>
  ),
}));

jest.mock('@/components/admin/ranking/LinkRankCard', () => ({
  LinkRankCard: ({ item }: { item: RankingItem }) => (
    <div data-testid={`link-card-${item.id}`}>{item.name}</div>
  ),
}));

function makeItem(id: string, name: string): RankingItem {
  return { id, name, rank: 1, value: 10 };
}

const ITEMS = [makeItem('a', 'Alpha'), makeItem('b', 'Beta')];

const baseProps = {
  entityType: 'users' as const,
  rankings: ITEMS,
  criterion: 'messages_sent',
  loading: false,
  error: null,
  onRetry: jest.fn(),
};

describe('RankingTable — loading state', () => {
  it('shows a spinner when loading', () => {
    const { container } = render(<RankingTable {...baseProps} loading={true} />);
    expect(container.querySelector('.animate-spin')).toBeInTheDocument();
  });

  it('does not render rank cards while loading', () => {
    render(<RankingTable {...baseProps} loading={true} />);
    expect(screen.queryByTestId('user-card-a')).not.toBeInTheDocument();
  });
});

describe('RankingTable — error state', () => {
  it('shows error message', () => {
    render(<RankingTable {...baseProps} error="Something went wrong" />);
    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
  });

  it('shows retry button', () => {
    render(<RankingTable {...baseProps} error="oops" />);
    expect(screen.getByText('ranking.retry')).toBeInTheDocument();
  });

  it('calls onRetry when retry button clicked', () => {
    const onRetry = jest.fn();
    render(<RankingTable {...baseProps} error="oops" onRetry={onRetry} />);
    fireEvent.click(screen.getByText('ranking.retry'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});

describe('RankingTable — empty state', () => {
  it('shows empty message when no rankings', () => {
    render(<RankingTable {...baseProps} rankings={[]} />);
    expect(screen.getByText('ranking.empty')).toBeInTheDocument();
  });
});

describe('RankingTable — populated state', () => {
  it('renders UserRankCard for users entityType', () => {
    render(<RankingTable {...baseProps} entityType="users" />);
    expect(screen.getByTestId('user-card-a')).toBeInTheDocument();
    expect(screen.getByTestId('user-card-b')).toBeInTheDocument();
  });

  it('renders ConversationRankCard for conversations entityType', () => {
    render(<RankingTable {...baseProps} entityType="conversations" />);
    expect(screen.getByTestId('conv-card-a')).toBeInTheDocument();
  });

  it('renders MessageRankCard for messages entityType', () => {
    render(<RankingTable {...baseProps} entityType="messages" />);
    expect(screen.getByTestId('msg-card-a')).toBeInTheDocument();
  });

  it('renders LinkRankCard for links entityType', () => {
    render(<RankingTable {...baseProps} entityType="links" />);
    expect(screen.getByTestId('link-card-a')).toBeInTheDocument();
  });

  it('shows the count badge', () => {
    render(<RankingTable {...baseProps} />);
    expect(screen.getByTestId('badge')).toHaveTextContent('2');
  });
});

describe('RankingTable — titles', () => {
  it('shows users title', () => {
    render(<RankingTable {...baseProps} entityType="users" />);
    expect(screen.getByText('ranking.users')).toBeInTheDocument();
  });

  it('shows conversations title', () => {
    render(<RankingTable {...baseProps} entityType="conversations" />);
    expect(screen.getByText('ranking.conversations')).toBeInTheDocument();
  });

  it('shows messages title', () => {
    render(<RankingTable {...baseProps} entityType="messages" />);
    expect(screen.getByText('ranking.messages')).toBeInTheDocument();
  });

  it('shows links title', () => {
    render(<RankingTable {...baseProps} entityType="links" />);
    expect(screen.getByText('ranking.links')).toBeInTheDocument();
  });
});
