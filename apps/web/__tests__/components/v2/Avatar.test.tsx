/**
 * Avatar v2 — pastille de presence.
 * Regle produit : online (isOnline backend OU <=60s) et recent (<=5min) → VERT
 * (--gp-success), online pulse en plus ; away (5-30min) → ORANGE (--gp-warning) ;
 * offline (>30min) → GRIS. Aucun dot quand le caller ne fournit AUCUNE donnée
 * de présence (ni presence ni isOnline). `presence` prime sur le binaire `isOnline`.
 */

import { render } from '@testing-library/react';
import React from 'react';
import { Avatar, presenceDotClassV2 } from '@/components/v2/Avatar';

const getDot = (container: HTMLElement): Element | null =>
  container.querySelector('.absolute.rounded-full');

describe('Avatar v2 presence dot', () => {
  it('renders a green pulsing dot for presence="online"', () => {
    const { container } = render(<Avatar name="John" presence="online" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-[var(--gp-success)]');
    expect(dot?.className).toContain('animate-pulse');
    expect(dot?.className).not.toContain('bg-[var(--gp-warning)]');
  });

  it('renders a green (non-pulsing) dot for presence="recent"', () => {
    const { container } = render(<Avatar name="John" presence="recent" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-[var(--gp-success)]');
    expect(dot?.className).not.toContain('animate-pulse');
  });

  it('renders an orange dot for presence="away"', () => {
    const { container } = render(<Avatar name="John" presence="away" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-[var(--gp-warning)]');
    expect(dot?.className).not.toContain('bg-[var(--gp-success)]');
  });

  it('renders a gray dot for presence="offline"', () => {
    const { container } = render(<Avatar name="John" presence="offline" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-[#9CA3AF]');
  });

  it('exports the central v2 presence map (consumed by ConversationItem)', () => {
    expect(presenceDotClassV2.online).toContain('bg-[var(--gp-success)]');
    expect(presenceDotClassV2.online).toContain('animate-pulse');
    expect(presenceDotClassV2.recent).toBe('bg-[var(--gp-success)]');
    expect(presenceDotClassV2.away).toBe('bg-[var(--gp-warning)]');
    expect(presenceDotClassV2.offline).toBe('bg-[#9CA3AF]');
  });

  describe('isOnline back-compat', () => {
    it('renders the green pulsing dot when isOnline is true and presence is omitted', () => {
      const { container } = render(<Avatar name="John" isOnline={true} />);

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-[var(--gp-success)]');
      expect(dot?.className).toContain('animate-pulse');
    });

    it('renders the gray offline dot when isOnline is false and presence is omitted', () => {
      const { container } = render(<Avatar name="John" isOnline={false} />);

      expect(getDot(container)?.className).toContain('bg-[#9CA3AF]');
    });

    it('renders NO dot when neither presence nor isOnline is provided (no data)', () => {
      const { container } = render(<Avatar name="John" />);

      expect(getDot(container)).toBeNull();
    });

    it('lets presence take precedence over isOnline', () => {
      const { container } = render(<Avatar name="John" isOnline={true} presence="offline" />);

      expect(getDot(container)?.className).toContain('bg-[#9CA3AF]');
    });
  });
});
