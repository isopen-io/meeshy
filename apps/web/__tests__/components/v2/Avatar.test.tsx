/**
 * Avatar v2 — pastille de presence.
 * Regle produit : online (<=60s) et recent (<=5min) → orange (--gp-warning),
 * online pulse en plus ; away (5-30min) → gris ; offline (>30min) → aucun dot.
 * `presence` prime sur le binaire `isOnline`.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { Avatar } from '@/components/v2/Avatar';

const getDot = (container: HTMLElement): Element | null =>
  container.querySelector('.absolute.rounded-full');

describe('Avatar v2 presence dot', () => {
  it('renders an orange pulsing dot for presence="online"', () => {
    const { container } = render(<Avatar name="John" presence="online" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-[var(--gp-warning)]');
    expect(dot?.className).toContain('animate-pulse');
    expect(dot?.className).not.toContain('bg-[var(--gp-jade-green)]');
  });

  it('renders an orange (non-pulsing) dot for presence="recent"', () => {
    const { container } = render(<Avatar name="John" presence="recent" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-[var(--gp-warning)]');
    expect(dot?.className).not.toContain('animate-pulse');
  });

  it('renders a gray dot for presence="away"', () => {
    const { container } = render(<Avatar name="John" presence="away" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-gray-400');
    expect(dot?.className).not.toContain('bg-[var(--gp-warning)]');
  });

  it('renders no dot for presence="offline"', () => {
    const { container } = render(<Avatar name="John" presence="offline" />);

    expect(getDot(container)).toBeNull();
  });

  describe('isOnline back-compat', () => {
    it('renders the orange pulsing dot when isOnline is true and presence is omitted', () => {
      const { container } = render(<Avatar name="John" isOnline={true} />);

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-[var(--gp-warning)]');
      expect(dot?.className).toContain('animate-pulse');
    });

    it('renders no dot when isOnline is false and presence is omitted', () => {
      const { container } = render(<Avatar name="John" isOnline={false} />);

      expect(getDot(container)).toBeNull();
    });

    it('lets presence take precedence over isOnline', () => {
      const { container } = render(<Avatar name="John" isOnline={true} presence="offline" />);

      expect(getDot(container)).toBeNull();
    });
  });
});
