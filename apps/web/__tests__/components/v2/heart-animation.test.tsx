/**
 * Tests for heart animation polish (D3).
 * Verifies:
 * - PostCard renders motion.svg for heart (not plain svg)
 * - PostCard heart button has min 44×44 px touch target
 * - Animation is disabled when prefers-reduced-motion is set
 */
import { render, screen } from '@testing-library/react';
import React from 'react';

// ── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('@/components/v2/Avatar', () => ({
  Avatar: ({ name }: { name: string }) => <div data-testid="avatar">{name}</div>,
}));

jest.mock('@/components/v2/LanguageOrb', () => ({
  LanguageOrb: () => <span />,
}));

jest.mock('@/components/v2/TranslationToggle', () => ({
  TranslationToggle: () => null,
}));

jest.mock('@/components/v2/flags', () => ({
  getLanguageName: (code: string) => code,
}));

// Capture reduced-motion mock value so we can change it per test
let mockReduceMotion = false;

jest.mock('framer-motion', () => {
  const actual = jest.requireActual('framer-motion');
  return {
    ...actual,
    useReducedMotion: () => mockReduceMotion,
    motion: {
      svg: ({
        children,
        initial,
        animate,
        transition,
        ...rest
      }: React.SVGProps<SVGSVGElement> & {
        initial?: unknown;
        animate?: unknown;
        transition?: unknown;
      }) =>
        React.createElement(
          'svg',
          { 'data-testid': 'heart-svg', 'data-initial': JSON.stringify(initial), ...rest },
          children,
        ),
      span: ({ children, ...rest }: React.HTMLAttributes<HTMLSpanElement>) =>
        React.createElement('span', rest, children),
    },
    AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  };
});

import { PostCard } from '@/components/v2/PostCard';

const baseProps = {
  author: { name: 'Alice' },
  lang: 'en',
  content: 'Hello world',
  time: '2h',
  likes: 5,
  comments: 3,
};

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('PostCard — heart animation (D3)', () => {
  beforeEach(() => {
    mockReduceMotion = false;
  });

  it('renders heart as motion.svg element', () => {
    render(<PostCard {...baseProps} onLike={jest.fn()} />);
    expect(screen.getByTestId('heart-svg')).toBeInTheDocument();
  });

  it('heart button has min-w-[44px] and min-h-[44px] classes', () => {
    render(<PostCard {...baseProps} onLike={jest.fn()} />);
    const btn = screen.getByRole('button', { name: /like post/i });
    expect(btn.className).toMatch(/min-w-\[44px\]/);
    expect(btn.className).toMatch(/min-h-\[44px\]/);
  });

  it('has aria-label for accessibility', () => {
    render(<PostCard {...baseProps} onLike={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Like post' })).toBeInTheDocument();
  });

  it('shows "Unlike post" aria-label when already liked', () => {
    render(<PostCard {...baseProps} isLiked onLike={jest.fn()} />);
    expect(screen.getByRole('button', { name: 'Unlike post' })).toBeInTheDocument();
  });

  it('passes initial=false when prefers-reduced-motion is true', () => {
    mockReduceMotion = true;
    render(<PostCard {...baseProps} onLike={jest.fn()} />);
    const heartSvg = screen.getByTestId('heart-svg');
    // When reduceMotion, initial is passed as `false`
    expect(heartSvg.getAttribute('data-initial')).toBe('false');
  });

  it('passes spring initial scale when prefers-reduced-motion is false', () => {
    mockReduceMotion = false;
    render(<PostCard {...baseProps} onLike={jest.fn()} />);
    const heartSvg = screen.getByTestId('heart-svg');
    const initial = JSON.parse(heartSvg.getAttribute('data-initial') ?? '{}');
    expect(initial).toEqual({ scale: 0.7 });
  });
});
