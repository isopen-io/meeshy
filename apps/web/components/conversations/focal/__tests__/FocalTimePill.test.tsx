/**
 * WF-111 — `FocalTimePill`.
 */
import { render, screen } from '@testing-library/react';
import { FocalTimePill } from '../FocalTimePill';

describe('FocalTimePill — pilule jour·heure', () => {
  it('affiche le libellé donné', () => {
    render(<FocalTimePill label="Mercredi · 17:42" visible />);
    expect(screen.getByTestId('focal-time-pill')).toHaveTextContent('Mercredi · 17:42');
  });

  it('aria-hidden — décorative (même règle que SectionScrollPill)', () => {
    render(<FocalTimePill label="Mercredi · 17:42" visible={false} />);
    expect(screen.getByTestId('focal-time-pill')).toHaveAttribute('aria-hidden', 'true');
  });

  it('bascule opacity-0/opacity-100 selon `visible`', () => {
    const { rerender } = render(<FocalTimePill label="Mercredi · 17:42" visible={false} />);
    expect(screen.getByTestId('focal-time-pill')).toHaveClass('opacity-0');

    rerender(<FocalTimePill label="Mercredi · 17:42" visible />);
    expect(screen.getByTestId('focal-time-pill')).toHaveClass('opacity-100');
  });

  it('cotes par les tokens thread.pill.* (top 72, fondu 280ms) — garde R15', () => {
    render(<FocalTimePill label="Mercredi · 17:42" visible />);
    expect(screen.getByTestId('focal-time-pill')).toHaveStyle({
      top: 'var(--lentille-thread-pill-top)',
      transitionDuration: 'var(--lentille-thread-pill-fade-duration)',
    });
  });
});
