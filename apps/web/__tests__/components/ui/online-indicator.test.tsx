/**
 * OnlineIndicator — derivation du statut de presence.
 * Sans prop `status`, le dot derive via getUserStatus({ isOnline, lastActiveAt }).
 * Regle produit : online (isOnline backend OU <=60s) & recent (<=5min) → VERT
 * (pulse sur online) ; away (5-30min) → ORANGE ; offline (>30min) → GRIS.
 */

import { render } from '@testing-library/react';
import { OnlineIndicator } from '@/components/ui/online-indicator';

const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60 * 1000);
const secondsAgo = (seconds: number): Date => new Date(Date.now() - seconds * 1000);

const getDot = (container: HTMLElement): HTMLElement | null => container.querySelector('div');

describe('OnlineIndicator', () => {
  describe('derived status when the status prop is omitted', () => {
    it('renders a green pulsing dot when active within the last 60 seconds', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={secondsAgo(20)} />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-emerald-400');
      expect(dot?.className).toContain('animate-pulse');
      expect(dot?.className).not.toContain('bg-orange-400');
    });

    it('renders a green pulsing dot when the backend flags the user online, even with stale lastActiveAt', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={minutesAgo(10)} />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-emerald-400');
      expect(dot?.className).toContain('animate-pulse');
    });

    it('renders a green (non-pulsing) dot when disconnected but active within the last 5 minutes', () => {
      const { container } = render(
        <OnlineIndicator isOnline={false} lastActiveAt={minutesAgo(3)} />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-emerald-400');
      expect(dot?.className).not.toContain('animate-pulse');
    });

    it('renders an orange dot (away) when disconnected between 5 and 30 minutes ago', () => {
      const { container } = render(
        <OnlineIndicator isOnline={false} lastActiveAt={minutesAgo(10)} />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-amber-400');
      expect(dot?.className).not.toContain('bg-emerald-400');
    });

    it('renders no dot (offline) when long-disconnected (over 30 min)', () => {
      const { container } = render(
        <OnlineIndicator isOnline={false} lastActiveAt={minutesAgo(45)} />
      );

      expect(getDot(container)).toBeNull();
    });

    it('renders no dot (offline) when isOnline is false without any lastActiveAt', () => {
      const { container } = render(<OnlineIndicator isOnline={false} />);

      expect(getDot(container)).toBeNull();
    });
  });

  describe('explicit status prop precedence', () => {
    it('keeps the provided away status (orange) even when the derived one would differ', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={minutesAgo(1)} status="away" />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-amber-400');
      expect(dot?.className).not.toContain('bg-emerald-400');
    });

    it('renders nothing when the explicit status is offline', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={minutesAgo(1)} status="offline" />
      );

      expect(getDot(container)).toBeNull();
    });
  });
});
