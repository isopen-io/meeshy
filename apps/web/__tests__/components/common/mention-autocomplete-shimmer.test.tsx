/**
 * Tests for MentionAutocomplete shimmer skeleton (D4).
 * Verifies that 3 shimmer rows are rendered when isLoading is true and suggestions are empty.
 */
import { render, screen, act } from '@testing-library/react';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('react-dom', () => ({
  ...jest.requireActual('react-dom'),
  createPortal: (children: React.ReactNode) => children,
}));

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children }: { children: React.ReactNode }) => <div data-testid="avatar">{children}</div>,
  AvatarFallback: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
  AvatarImage: () => null,
}));

jest.mock('@/components/ui/badge', () => ({
  Badge: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

jest.mock('@/lib/avatar-utils', () => ({
  getUserInitials: () => 'AB',
}));

// Control what mentionsService returns
const mockGetSuggestions = jest.fn();
jest.mock('@/services/mentions.service', () => ({
  mentionsService: {
    getSuggestions: (...args: unknown[]) => mockGetSuggestions(...args),
  },
}));

// framer-motion: render children as-is
jest.mock('framer-motion', () => ({
  motion: {
    div: ({ children, ...rest }: React.HTMLAttributes<HTMLDivElement>) =>
      React.createElement('div', rest, children),
    span: ({ children, ...rest }: React.HTMLAttributes<HTMLSpanElement>) =>
      React.createElement('span', rest, children),
    button: ({ children, ...rest }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
      React.createElement('button', rest, children),
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

import { MentionAutocomplete } from '@/components/common/MentionAutocomplete';

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('MentionAutocomplete — shimmer skeleton', () => {
  const baseProps = {
    conversationId: '507f1f77bcf86cd799439011',
    query: 'al',
    onSelect: jest.fn(),
    onClose: jest.fn(),
    position: { left: 100, top: 200 },
  };

  beforeEach(() => {
    jest.clearAllMocks();
    // Make getSuggestions return a never-resolving promise so isLoading stays true
    mockGetSuggestions.mockReturnValue(new Promise(() => {}));
  });

  it('renders 3 shimmer rows when loading and no suggestions', async () => {
    render(<MentionAutocomplete {...baseProps} />);

    // Wait for the debounce (300ms) to fire and the fetch to start
    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    const shimmer = screen.getByTestId('mention-shimmer');
    expect(shimmer).toBeInTheDocument();
    // 3 rows of 2 divs each = 6 inner divs (we count just the pulse wrappers)
    const rows = shimmer.querySelectorAll('.animate-pulse');
    expect(rows).toHaveLength(3);
  });

  it('does NOT render shimmer when suggestions are available', async () => {
    mockGetSuggestions.mockResolvedValue([
      { id: 'u1', username: 'alice', displayName: 'Alice', badge: 'friend' as const },
    ]);

    render(<MentionAutocomplete {...baseProps} />);

    await act(async () => {
      await new Promise((r) => setTimeout(r, 350));
    });

    expect(screen.queryByTestId('mention-shimmer')).not.toBeInTheDocument();
    expect(screen.getByText('@alice')).toBeInTheDocument();
  });
});
