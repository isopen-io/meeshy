/**
 * Avatar v2 — pastille de présence tri-state.
 * `presence` prime sur le binaire `isOnline` : online → jade, away → warning
 * (token design-system --gp-warning), offline → aucun dot (esthétique v2).
 */

import { render } from '@testing-library/react';
import React from 'react';
import { Avatar } from '@/components/v2/Avatar';

const getDot = (container: HTMLElement): Element | null =>
  container.querySelector('.absolute.rounded-full');

describe('Avatar v2 presence dot', () => {
  it('renders the jade dot for presence="online"', () => {
    const { container } = render(<Avatar name="John" presence="online" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-[var(--gp-jade-green)]');
  });

  it('renders the warning-colored dot for presence="away"', () => {
    const { container } = render(<Avatar name="John" presence="away" />);

    const dot = getDot(container);
    expect(dot).not.toBeNull();
    expect(dot?.className).toContain('bg-[var(--gp-warning)]');
    expect(dot?.className).not.toContain('bg-[var(--gp-jade-green)]');
  });

  it('renders no dot for presence="offline"', () => {
    const { container } = render(<Avatar name="John" presence="offline" />);

    expect(getDot(container)).toBeNull();
  });

  describe('isOnline back-compat', () => {
    it('renders the jade dot when isOnline is true and presence is omitted', () => {
      const { container } = render(<Avatar name="John" isOnline={true} />);

      expect(getDot(container)?.className).toContain('bg-[var(--gp-jade-green)]');
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
