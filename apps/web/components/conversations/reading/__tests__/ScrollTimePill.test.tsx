import { render, screen } from '@testing-library/react';
import { ScrollTimePill } from '../ScrollTimePill';

/**
 * `ScrollTimePill` — composant PUR depuis V4ter/B3 : le linger vient de
 * `useScrollActivity` (loi partagée `scrollActivityLaw`) côté appelant
 * (`ConversationMessages`), plus d'un second minuteur local ici. Même patron
 * de test que `FocalTimePill.test.tsx` : on ne pilote plus que `visible`.
 * La preuve « efface après SCROLL_ACTIVITY_LINGER_MS » vit désormais dans
 * `hooks/lentille/__tests__/use-scroll-activity.test.ts` — c'est la loi,
 * pas la peau, qui possède ce timing (garde R15 : une seule source de
 * vérité pour le linger).
 */
describe('ScrollTimePill — n’existe que pendant le défilement', () => {
  it('is hidden when not visible', () => {
    render(<ScrollTimePill label="Mercredi · 17:42" visible={false} />);

    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'true');
  });

  it('is shown when visible', () => {
    render(<ScrollTimePill label="Mercredi · 17:42" visible />);

    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'false');
  });

  it('bascule opacity-0/opacity-100 selon `visible`', () => {
    const { rerender } = render(<ScrollTimePill label="Mercredi · 17:42" visible={false} />);
    expect(screen.getByText('Mercredi · 17:42')).toHaveClass('opacity-0');

    rerender(<ScrollTimePill label="Mercredi · 17:42" visible />);
    expect(screen.getByText('Mercredi · 17:42')).toHaveClass('opacity-100');
  });

  it('follows `visible` across rerenders without owning any timer of its own', () => {
    const { rerender } = render(<ScrollTimePill label="Mercredi · 17:42" visible={false} />);
    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'true');

    rerender(<ScrollTimePill label="Mercredi · 17:42" visible />);
    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'false');

    rerender(<ScrollTimePill label="Mercredi · 17:42" visible={false} />);
    expect(screen.getByText('Mercredi · 17:42')).toHaveAttribute('aria-hidden', 'true');
  });

  it('renders nothing without a label', () => {
    const { container } = render(<ScrollTimePill label="" visible />);

    expect(container).toBeEmptyDOMElement();
  });
});
