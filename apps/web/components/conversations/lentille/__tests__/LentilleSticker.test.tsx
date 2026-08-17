/**
 * WL-105 (LWS-10) — `LentilleSticker`.
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { LentilleSticker } from '../LentilleSticker';

describe('LentilleSticker', () => {
  it('rend le libellé et reste aria-hidden (information portée par l’ordre du DOM)', () => {
    render(<LentilleSticker label="ÉPINGLÉES" />);
    const sticker = screen.getByTestId('lentille-sticker');
    expect(sticker).toHaveAttribute('aria-hidden', 'true');
    expect(sticker.textContent).toBe('ÉPINGLÉES');
  });

  it('est positionné en sticky (CSS pur, pas de mesure JS)', () => {
    render(<LentilleSticker label="AUJOURD'HUI" />);
    expect(screen.getByTestId('lentille-sticker')).toHaveClass('sticky');
  });
});
