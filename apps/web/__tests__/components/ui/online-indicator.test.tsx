/**
 * OnlineIndicator — normalisation du fallback de statut.
 * Sans prop `status`, le dot doit dériver le tri-state via la règle canonique
 * getUserStatus({ isOnline, lastActiveAt }) au lieu du binaire isOnline.
 */

import { render } from '@testing-library/react';
import { OnlineIndicator } from '@/components/ui/online-indicator';

const minutesAgo = (minutes: number): Date => new Date(Date.now() - minutes * 60 * 1000);

const getDot = (container: HTMLElement): HTMLElement | null => container.querySelector('div');

describe('OnlineIndicator', () => {
  describe('derived status when the status prop is omitted', () => {
    it('renders green when isOnline is true and activity is recent', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={minutesAgo(1)} />
      );

      expect(getDot(container)?.className).toContain('bg-green-500');
    });

    it('renders orange (away) when isOnline is true but inactive for 10 minutes', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={minutesAgo(10)} />
      );

      expect(getDot(container)?.className).toContain('bg-orange-400');
    });

    it('renders orange (away) when isOnline is false but disconnected less than 30 minutes ago', () => {
      const { container } = render(
        <OnlineIndicator isOnline={false} lastActiveAt={minutesAgo(10)} />
      );

      expect(getDot(container)?.className).toContain('bg-orange-400');
    });

    it('renders gray when isOnline is false and long-disconnected', () => {
      const { container } = render(
        <OnlineIndicator isOnline={false} lastActiveAt={minutesAgo(45)} />
      );

      expect(getDot(container)?.className).toContain('bg-gray-400');
    });

    it('renders gray when isOnline is false without any lastActiveAt', () => {
      const { container } = render(<OnlineIndicator isOnline={false} />);

      expect(getDot(container)?.className).toContain('bg-gray-400');
    });
  });

  describe('explicit status prop precedence', () => {
    it('keeps the provided status even when the derived one would differ', () => {
      const { container } = render(
        <OnlineIndicator isOnline={true} lastActiveAt={minutesAgo(1)} status="away" />
      );

      expect(getDot(container)?.className).toContain('bg-orange-400');
      expect(getDot(container)?.className).not.toContain('bg-green-500');
    });
  });
});
