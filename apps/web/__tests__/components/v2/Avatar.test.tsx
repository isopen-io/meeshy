/**
 * Avatar v2 — pastille de presence.
 * Regle produit 1/3/5 : online (isOnline backend OU <=60s) → VERT emerald-400
 * fixe + pulse ; away (1-3min) → ORANGE amber-400 fixe ; idle (3-5min) → GRIS
 * gray-400 AFFICHÉ ; offline (>5min) → AUCUN dot. Couleurs fixes (pas les
 * tokens thème --gp-success/--gp-warning) pour un hex identique light/dark et
 * cross-platform. Aucun dot quand le caller ne fournit AUCUNE donnée de
 * présence (ni presence ni isOnline). `presence` prime sur le binaire `isOnline`.
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
    expect(dot?.className).toContain('bg-emerald-400');
    expect(dot?.className).toContain('animate-pulse');
    expect(dot?.className).not.toContain('bg-amber-400');
  });

  it('renders an orange dot for presence="away"', () => {
    const { container } = render(<Avatar name="John" presence="away" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-amber-400');
    expect(dot?.className).not.toContain('bg-emerald-400');
  });

  it('renders a grey dot for presence="idle" (gris AFFICHÉ 3-5min)', () => {
    const { container } = render(<Avatar name="John" presence="idle" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-gray-400');
    expect(dot?.className).not.toContain('animate-pulse');
    expect(dot?.className).not.toContain('bg-emerald-400');
  });

  it('renders NO dot for presence="offline" (offline = no dot)', () => {
    const { container } = render(<Avatar name="John" presence="offline" />);

    expect(getDot(container)).toBeNull();
  });

  it('exports the central v2 presence map (consumed by ConversationItem)', () => {
    expect(presenceDotClassV2.online).toContain('bg-emerald-400');
    expect(presenceDotClassV2.online).toContain('animate-pulse');
    expect(presenceDotClassV2.away).toBe('bg-amber-400');
    expect(presenceDotClassV2.idle).toBe('bg-gray-400');
    expect(presenceDotClassV2.offline).toBe('bg-gray-400');
  });

  describe('isOnline back-compat', () => {
    it('renders the green pulsing dot when isOnline is true and presence is omitted', () => {
      const { container } = render(<Avatar name="John" isOnline={true} />);

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-emerald-400');
      expect(dot?.className).toContain('animate-pulse');
    });

    it('renders no dot when isOnline is false and presence is omitted (offline = no dot)', () => {
      const { container } = render(<Avatar name="John" isOnline={false} />);

      expect(getDot(container)).toBeNull();
    });

    it('renders NO dot when neither presence nor isOnline is provided (no data)', () => {
      const { container } = render(<Avatar name="John" />);

      expect(getDot(container)).toBeNull();
    });

    it('lets presence take precedence over isOnline (offline wins → no dot)', () => {
      const { container } = render(<Avatar name="John" isOnline={true} presence="offline" />);

      expect(getDot(container)).toBeNull();
    });
  });
});
