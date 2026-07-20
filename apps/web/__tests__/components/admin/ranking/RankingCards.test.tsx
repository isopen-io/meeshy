import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { UserRankCard } from '@/components/admin/ranking/UserRankCard';
import { MessageRankCard } from '@/components/admin/ranking/MessageRankCard';
import { ConversationRankCard } from '@/components/admin/ranking/ConversationRankCard';
import { LinkRankCard } from '@/components/admin/ranking/LinkRankCard';
import type { RankingItem } from '@/hooks/use-ranking-data';

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
}));

jest.mock('@/stores/language-store', () => ({
  useCurrentInterfaceLanguage: () => 'en-US',
  getCurrentInterfaceLocale: () => 'en-US',
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className }: { children: React.ReactNode; className?: string }) => (
    <div data-testid="avatar" className={className}>{children}</div>
  ),
  AvatarImage: ({ src, alt }: { src?: string; alt?: string }) => (
    <img src={src} alt={alt} data-testid="avatar-image" />
  ),
  AvatarFallback: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="avatar-fallback">{children}</div>
  ),
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

function makeItem(overrides: Partial<RankingItem> = {}): RankingItem {
  return {
    id: 'item-1',
    name: 'Test User',
    rank: 1,
    value: 42,
    ...overrides,
  };
}

// =============================================================================
// UserRankCard
// =============================================================================

describe('UserRankCard', () => {
  it('renders item name', () => {
    render(<UserRankCard item={makeItem({ name: 'Alice' })} criterion="messages_sent" />);
    expect(screen.getByText('Alice')).toBeInTheDocument();
  });

  it('renders username from metadata', () => {
    render(
      <UserRankCard
        item={makeItem({ metadata: { username: 'alice42' } })}
        criterion="messages_sent"
      />
    );
    expect(screen.getByText('@alice42')).toBeInTheDocument();
  });

  it('applies top-3 gradient class for rank <= 3', () => {
    const { container } = render(
      <UserRankCard item={makeItem({ rank: 2 })} criterion="messages_sent" />
    );
    expect(container.firstChild).toHaveClass('from-yellow-50');
  });

  it('applies default class for rank > 3', () => {
    const { container } = render(
      <UserRankCard item={makeItem({ rank: 5 })} criterion="messages_sent" />
    );
    expect(container.firstChild).toHaveClass('bg-gray-50');
  });

  it('applies default class when rank is undefined', () => {
    const { container } = render(
      <UserRankCard item={makeItem({ rank: undefined })} criterion="messages_sent" />
    );
    expect(container.firstChild).toHaveClass('bg-gray-50');
  });

  describe('recent_activity criterion', () => {
    it('shows the Clock icon and formatted date when lastActivity is provided', () => {
      render(
        <UserRankCard
          item={makeItem({ lastActivity: '2024-01-15T10:30:00Z' })}
          criterion="recent_activity"
        />
      );
      expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    });

    it('does not show Clock when recent_activity but no lastActivity', () => {
      render(<UserRankCard item={makeItem({ lastActivity: undefined })} criterion="recent_activity" />);
      expect(screen.queryByTestId('clock-icon')).not.toBeInTheDocument();
    });
  });

  describe('non-recent_activity criterion', () => {
    it('shows formatted value', () => {
      render(<UserRankCard item={makeItem({ value: 1000 })} criterion="messages_sent" />);
      expect(screen.getByText('1,000')).toBeInTheDocument();
    });

    it('shows criterion label key', () => {
      render(<UserRankCard item={makeItem()} criterion="messages_sent" />);
      expect(screen.getByText('ranking.criteria.messages_sent')).toBeInTheDocument();
    });

    it('renders criterion icon when criterion is found', () => {
      render(<UserRankCard item={makeItem()} criterion="messages_sent" />);
      expect(screen.getByTestId('messagesquare-icon')).toBeInTheDocument();
    });

    it('does not render criterion icon for unknown criterion', () => {
      render(<UserRankCard item={makeItem()} criterion="unknown_criterion" />);
      expect(screen.queryByTestId('messagesquare-icon')).not.toBeInTheDocument();
    });
  });

  it('shows avatar fallback initial from item name', () => {
    render(<UserRankCard item={makeItem({ name: 'Bob' })} criterion="messages_sent" />);
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('B');
  });

  it('uses "U" fallback when name is empty', () => {
    render(<UserRankCard item={makeItem({ name: undefined })} criterion="messages_sent" />);
    expect(screen.getByTestId('avatar-fallback')).toHaveTextContent('U');
  });
});

// =============================================================================
// MessageRankCard
// =============================================================================

describe('MessageRankCard', () => {
  it('renders item name (message content preview)', () => {
    render(<MessageRankCard item={makeItem({ name: 'Hello world' })} criterion="most_reactions" />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('applies top-3 gradient for rank <= 3', () => {
    const { container } = render(
      <MessageRankCard item={makeItem({ rank: 1 })} criterion="most_reactions" />
    );
    expect(container.firstChild).toHaveClass('from-yellow-50');
  });

  it('applies default class for rank > 3', () => {
    const { container } = render(
      <MessageRankCard item={makeItem({ rank: 4 })} criterion="most_reactions" />
    );
    expect(container.firstChild).toHaveClass('bg-gray-50');
  });

  it('shows sender displayName when available', () => {
    render(
      <MessageRankCard
        item={makeItem({
          metadata: { sender: { id: '1', username: 'alice', displayName: 'Alice Smith' } },
        })}
        criterion="most_reactions"
      />
    );
    expect(screen.getByText('Alice Smith')).toBeInTheDocument();
  });

  it('falls back to sender username when no displayName', () => {
    render(
      <MessageRankCard
        item={makeItem({
          metadata: { sender: { id: '1', username: 'alice', displayName: undefined } },
        })}
        criterion="most_reactions"
      />
    );
    expect(screen.getByText('alice')).toBeInTheDocument();
  });

  it('shows conversation title when available', () => {
    render(
      <MessageRankCard
        item={makeItem({
          metadata: { conversation: { id: '1', identifier: '#general', title: 'General Chat' } },
        })}
        criterion="most_reactions"
      />
    );
    expect(screen.getByText('General Chat')).toBeInTheDocument();
  });

  it('falls back to conversation identifier', () => {
    render(
      <MessageRankCard
        item={makeItem({
          metadata: { conversation: { id: '1', identifier: '#general', title: undefined } },
        })}
        criterion="most_reactions"
      />
    );
    expect(screen.getByText('#general')).toBeInTheDocument();
  });

  it('shows N/A when createdAt is absent', () => {
    render(
      <MessageRankCard
        item={makeItem({ metadata: { createdAt: undefined } })}
        criterion="most_reactions"
      />
    );
    expect(screen.getByText('N/A')).toBeInTheDocument();
  });

  it('shows formatted date when createdAt is a valid ISO string', () => {
    render(
      <MessageRankCard
        item={makeItem({ metadata: { createdAt: '2024-06-15T12:00:00Z' } })}
        criterion="most_reactions"
      />
    );
    // Not N/A — a real date string is displayed (exact format depends on locale)
    expect(screen.queryByText('N/A')).not.toBeInTheDocument();
  });

  it('renders criterion icon for a known criterion', () => {
    render(<MessageRankCard item={makeItem()} criterion="most_reactions" />);
    expect(screen.getByTestId('smile-icon')).toBeInTheDocument();
  });

  it('shows formatted value', () => {
    render(<MessageRankCard item={makeItem({ value: 2500 })} criterion="most_reactions" />);
    expect(screen.getByText('2,500')).toBeInTheDocument();
  });
});

// =============================================================================
// ConversationRankCard
// =============================================================================

describe('ConversationRankCard', () => {
  it('renders conversation name', () => {
    render(
      <ConversationRankCard item={makeItem({ name: 'Dev Team' })} criterion="message_count" />
    );
    expect(screen.getByText('Dev Team')).toBeInTheDocument();
  });

  it('applies top-3 gradient for rank <= 3', () => {
    const { container } = render(
      <ConversationRankCard item={makeItem({ rank: 3 })} criterion="message_count" />
    );
    expect(container.firstChild).toHaveClass('from-yellow-50');
  });

  it('applies default class for rank > 3', () => {
    const { container } = render(
      <ConversationRankCard item={makeItem({ rank: 10 })} criterion="message_count" />
    );
    expect(container.firstChild).toHaveClass('bg-gray-50');
  });

  it('renders an img tag when avatar is provided', () => {
    render(
      <ConversationRankCard
        item={makeItem({ avatar: 'https://example.com/img.png', name: 'Group' })}
        criterion="message_count"
      />
    );
    const img = screen.getByRole('img', { name: 'Group' });
    expect(img).toHaveAttribute('src', 'https://example.com/img.png');
  });

  it('renders a type icon div (not an img) when no avatar', () => {
    const { container } = render(
      <ConversationRankCard
        item={makeItem({ avatar: undefined, metadata: { type: 'group' } })}
        criterion="message_count"
      />
    );
    expect(container.querySelector('img[alt]')).toBeNull();
  });

  it('shows identifier when metadata.identifier is set', () => {
    render(
      <ConversationRankCard
        item={makeItem({ metadata: { identifier: '#dev' } })}
        criterion="message_count"
      />
    );
    expect(screen.getByText('#dev')).toBeInTheDocument();
  });

  describe('recent_activity criterion', () => {
    it('shows Clock icon when lastActivity provided', () => {
      render(
        <ConversationRankCard
          item={makeItem({ lastActivity: '2024-03-01T09:00:00Z' })}
          criterion="recent_activity"
        />
      );
      expect(screen.getByTestId('clock-icon')).toBeInTheDocument();
    });

    it('does not show Clock when recent_activity but no lastActivity', () => {
      render(
        <ConversationRankCard item={makeItem({ lastActivity: undefined })} criterion="recent_activity" />
      );
      expect(screen.queryByTestId('clock-icon')).not.toBeInTheDocument();
    });
  });

  it('shows formatted value for non-recent_activity criterion', () => {
    render(
      <ConversationRankCard item={makeItem({ value: 500 })} criterion="message_count" />
    );
    expect(screen.getByText('500')).toBeInTheDocument();
  });
});

// =============================================================================
// LinkRankCard
// =============================================================================

describe('LinkRankCard', () => {
  it('renders link name', () => {
    render(<LinkRankCard item={makeItem({ name: 'Promo Link' })} criterion="tracking_links_most_visited" />);
    expect(screen.getByText('Promo Link')).toBeInTheDocument();
  });

  it('applies top-3 gradient for rank <= 3', () => {
    const { container } = render(
      <LinkRankCard item={makeItem({ rank: 1 })} criterion="tracking_links_most_visited" />
    );
    expect(container.firstChild).toHaveClass('from-yellow-50');
  });

  it('applies default class for rank > 3', () => {
    const { container } = render(
      <LinkRankCard item={makeItem({ rank: 6 })} criterion="tracking_links_most_visited" />
    );
    expect(container.firstChild).toHaveClass('bg-gray-50');
  });

  describe('tracked vs share badge', () => {
    it('shows linkTrackedBadge when shortCode is present', () => {
      render(
        <LinkRankCard
          item={makeItem({ metadata: { shortCode: 'ABC123' } })}
          criterion="tracking_links_most_visited"
        />
      );
      expect(screen.getByTestId('badge')).toHaveTextContent('ranking.linkTrackedBadge');
    });

    it('shows linkShareBadge when shortCode is absent', () => {
      render(
        <LinkRankCard
          item={makeItem({ metadata: { shortCode: undefined } })}
          criterion="tracking_links_most_visited"
        />
      );
      expect(screen.getByTestId('badge')).toHaveTextContent('ranking.linkShareBadge');
    });
  });

  it('shows creator displayName when available', () => {
    render(
      <LinkRankCard
        item={makeItem({ metadata: { creator: { id: '1', username: 'bob', displayName: 'Bob' } } })}
        criterion="tracking_links_most_visited"
      />
    );
    expect(screen.getByText('Bob')).toBeInTheDocument();
  });

  it('falls back to creator username', () => {
    render(
      <LinkRankCard
        item={makeItem({ metadata: { creator: { id: '1', username: 'bob', displayName: undefined } } })}
        criterion="tracking_links_most_visited"
      />
    );
    expect(screen.getByText('bob')).toBeInTheDocument();
  });

  it('shows originalUrl when present', () => {
    render(
      <LinkRankCard
        item={makeItem({ metadata: { originalUrl: 'https://example.com' } })}
        criterion="tracking_links_most_visited"
      />
    );
    expect(screen.getByText('https://example.com')).toBeInTheDocument();
  });

  it('hides originalUrl when absent', () => {
    render(
      <LinkRankCard
        item={makeItem({ metadata: { originalUrl: undefined } })}
        criterion="tracking_links_most_visited"
      />
    );
    expect(screen.queryByText('https://example.com')).not.toBeInTheDocument();
  });

  it('shows conversation title when set', () => {
    render(
      <LinkRankCard
        item={makeItem({
          metadata: {
            conversation: { id: '1', identifier: '#gen', title: 'General Chat' },
          },
        })}
        criterion="tracking_links_most_visited"
      />
    );
    expect(screen.getByText(/General Chat/)).toBeInTheDocument();
  });

  it('falls back to conversation identifier when no title', () => {
    render(
      <LinkRankCard
        item={makeItem({
          metadata: {
            conversation: { id: '1', identifier: '#general', title: undefined },
          },
        })}
        criterion="tracking_links_most_visited"
      />
    );
    expect(screen.getByText(/#general/)).toBeInTheDocument();
  });

  it('shows totalClicks when defined', () => {
    render(
      <LinkRankCard
        item={makeItem({ metadata: { totalClicks: 150 } })}
        criterion="tracking_links_most_visited"
      />
    );
    expect(screen.getByText(/150/)).toBeInTheDocument();
  });

  it('shows uniqueClicks when defined', () => {
    render(
      <LinkRankCard
        item={makeItem({ metadata: { uniqueClicks: 80 } })}
        criterion="tracking_links_most_unique"
      />
    );
    expect(screen.getByText(/80/)).toBeInTheDocument();
  });

  it('shows currentUses and maxUses when maxUses > 0', () => {
    render(
      <LinkRankCard
        item={makeItem({ currentUses: 5, maxUses: 20 })}
        criterion="share_links_most_used"
      />
    );
    expect(screen.getByText(/5/)).toBeInTheDocument();
    expect(screen.getByText(/20/)).toBeInTheDocument();
  });

  it('hides maxUses when maxUses is 0', () => {
    const { container } = render(
      <LinkRankCard
        item={makeItem({ currentUses: 3, maxUses: 0 })}
        criterion="share_links_most_used"
      />
    );
    expect(container.textContent).not.toMatch(/\/ 0/);
  });
});
