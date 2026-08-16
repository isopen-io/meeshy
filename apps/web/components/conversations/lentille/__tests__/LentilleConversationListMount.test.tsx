/**
 * `LentilleConversationListMount` — placeholder de WL-101.
 *
 * Ce composant n'est jamais montré à un utilisateur réel (voir son en-tête).
 * Ces tests verrouillent son CONTRAT minimal pour WL-102/103 : un point de
 * montage réel (pas une coquille vide non testable), `aria-hidden` (aucune
 * sémantique accessible à annoncer tant qu'il n'y a rien à annoncer), et
 * l'abonnement typing bien câblé DEPUIS ce composant (pas depuis
 * `ConversationList.tsx` — décision WL-101 : abonné uniquement quand ce
 * composant est monté, donc uniquement drapeau ON).
 */
import React from 'react';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockUseLentilleListTyping = jest.fn(() => new Map());

jest.mock('@/hooks/lentille/use-lentille-list-typing', () => ({
  useLentilleListTyping: (currentUserId: string | null | undefined) =>
    mockUseLentilleListTyping(currentUserId),
}));

import { LentilleConversationListMount } from '../LentilleConversationListMount';

describe('LentilleConversationListMount', () => {
  beforeEach(() => {
    mockUseLentilleListTyping.mockClear();
  });

  it('rend un point de montage identifiable, aria-hidden', () => {
    render(<LentilleConversationListMount currentUserId="user-1" />);

    const mount = screen.getByTestId('lentille-list-mount');
    expect(mount).toHaveAttribute('aria-hidden', 'true');
  });

  it("s'abonne au typing DÈS son montage, avec le currentUserId reçu", () => {
    render(<LentilleConversationListMount currentUserId="user-1" />);

    expect(mockUseLentilleListTyping).toHaveBeenCalledWith('user-1');
  });

  it('fonctionne sans currentUserId (garde défensive)', () => {
    render(<LentilleConversationListMount currentUserId={null} />);

    expect(mockUseLentilleListTyping).toHaveBeenCalledWith(null);
    expect(screen.getByTestId('lentille-list-mount')).toBeInTheDocument();
  });
});
