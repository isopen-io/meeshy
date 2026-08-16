/**
 * WF-112 — `FocalDateCapsule`.
 */
import { render, screen } from '@testing-library/react';
import { FocalDateCapsule } from '../FocalDateCapsule';

describe('FocalDateCapsule — capsule date sticky', () => {
  it('affiche le libellé donné', () => {
    render(<FocalDateCapsule label="Mercredi 12 août" />);
    expect(screen.getByTestId('focal-date-capsule')).toHaveTextContent('Mercredi 12 août');
  });

  it('aria-hidden — décorative, l\'information vit dans l\'ordre du DOM (même règle que LentilleSticker)', () => {
    render(<FocalDateCapsule label="Mercredi 12 août" />);
    expect(screen.getByTestId('focal-date-capsule')).toHaveAttribute('aria-hidden', 'true');
  });

  it('sticky (classe CSS), positionnée top 4', () => {
    render(<FocalDateCapsule label="Mercredi 12 août" />);
    const el = screen.getByTestId('focal-date-capsule');
    expect(el).toHaveClass('sticky');
    expect(el).toHaveStyle({ top: '4px' });
  });
});
