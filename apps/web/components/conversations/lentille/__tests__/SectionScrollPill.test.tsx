/**
 * WL-105 (LWS-10) — `SectionScrollPill`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { SectionScrollPill } from '../SectionScrollPill';

describe('SectionScrollPill', () => {
  it('reste aria-hidden (décorative, information dans l’ordre du DOM)', () => {
    render(<SectionScrollPill label="Aujourd'hui" visible={true} />);
    expect(screen.getByTestId('lentille-scroll-pill')).toHaveAttribute('aria-hidden', 'true');
  });

  it('bascule opacity-0/opacity-100 selon `visible`', () => {
    const { rerender } = render(<SectionScrollPill label="Aujourd'hui" visible={false} />);
    expect(screen.getByTestId('lentille-scroll-pill')).toHaveClass('opacity-0');

    rerender(<SectionScrollPill label="Aujourd'hui" visible={true} />);
    expect(screen.getByTestId('lentille-scroll-pill')).toHaveClass('opacity-100');
  });
});
