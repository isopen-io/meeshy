/**
 * OnlineIndicator — derivation du statut de presence.
 * Sans prop `status`, le dot derive via getUserStatus({ isOnline, lastActiveAt }).
 * Regle produit 1/3/5 : online (isOnline backend <=5min OU activité <=60s) → VERT
 * pulse ; away (1-3min) → ORANGE ; idle (3-5min) → GRIS AFFICHÉ ;
 * offline (>5min) → AUCUN dot.
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
      expect(dot?.className).not.toContain('bg-amber-400');
    });

    it('renders a green pulsing dot when the backend flags the user online within the 5min guard', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={minutesAgo(4)} />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-emerald-400');
      expect(dot?.className).toContain('animate-pulse');
    });

    it('renders an orange dot (away) when disconnected between 1 and 3 minutes ago', () => {
      const { container } = render(
        <OnlineIndicator isOnline={false} lastActiveAt={minutesAgo(2)} />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-amber-400');
      expect(dot?.className).not.toContain('bg-emerald-400');
    });

    it('renders a grey dot (idle) when disconnected between 3 and 5 minutes ago', () => {
      const { container } = render(
        <OnlineIndicator isOnline={false} lastActiveAt={minutesAgo(4)} />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-gray-400');
      expect(dot?.className).not.toContain('bg-emerald-400');
      expect(dot?.className).not.toContain('animate-pulse');
    });

    it('renders no dot (offline) when long-disconnected (over 5 min)', () => {
      const { container } = render(
        <OnlineIndicator isOnline={false} lastActiveAt={minutesAgo(6)} />
      );

      expect(getDot(container)).toBeNull();
    });

    it('renders no dot (offline) when the backend online flag is stale (beyond 5 min)', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={minutesAgo(10)} />
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
        <OnlineIndicator isOnline={true} lastActiveAt={secondsAgo(30)} status="away" />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-amber-400');
      expect(dot?.className).not.toContain('bg-emerald-400');
    });

    it('renders the grey idle dot when the explicit status is idle', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={secondsAgo(30)} status="idle" />
      );

      const dot = getDot(container);
      expect(dot?.className).toContain('bg-gray-400');
    });

    it('renders nothing when the explicit status is offline', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={secondsAgo(30)} status="offline" />
      );

      expect(getDot(container)).toBeNull();
    });
  });
});
