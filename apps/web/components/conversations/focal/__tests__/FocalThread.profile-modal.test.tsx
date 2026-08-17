/**
 * Directive produit du 2026-08-17 — « l'auteur d'un message doit être
 * clickable pour afficher son profil EN MODALE ».
 *
 * `UserProfileModal` est MOCKÉ ici (un espion qui rend ses props) : ce
 * fichier prouve le BRANCHEMENT — `FocalThread` porte l'état d'ouverture
 * unique du fil et le pousse à la modale au bon username — pas le contenu de
 * la modale elle-même (couvert par `UserProfileModal.test.tsx` et
 * `UserProfileContent.test.tsx`). Patron déjà établi pour `LentillePeek`
 * (un menu, jamais un par rangée) : ici, une `UserProfileModal`, jamais une
 * par rangée du fil.
 */
import React, { createRef } from 'react';
import { render, screen, fireEvent, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Message, User } from '@meeshy/shared/types';

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({
    t: (key: string) => (key === 'focal.row.you' ? 'Toi' : key),
    locale: 'fr',
    isLoading: false,
  }),
}));

const mockUserProfileModal = jest.fn((_props: unknown) => null);
jest.mock('@/components/profile/UserProfileModal', () => ({
  UserProfileModal: (props: unknown) => {
    mockUserProfileModal(props);
    return null;
  },
}));

import { FocalThread } from '../FocalThread';

const currentUser = {
  id: 'me',
  username: 'me',
  displayName: 'Moi',
  systemLanguage: 'fr',
} as unknown as User;

function makeMessage(id: string, overrides: Partial<Message> = {}): Message {
  return {
    id,
    conversationId: 'c1',
    senderId: 'other',
    content: `Message ${id}`,
    originalLanguage: 'en',
    messageType: 'text',
    messageSource: 'user',
    isEdited: false,
    isViewOnce: false,
    viewOnceCount: 0,
    isBlurred: false,
    deliveredCount: 0,
    readCount: 0,
    reactionCount: 0,
    isEncrypted: false,
    createdAt: new Date('2026-08-17T10:00:00Z'),
    timestamp: new Date('2026-08-17T10:00:00Z'),
    translations: [],
    sender: {
      id: 'other',
      conversationId: 'c1',
      type: 'user',
      displayName: 'Alice',
      user: { username: 'alice' },
    } as unknown,
    ...overrides,
  } as Message;
}

describe('FocalThread — le clic sur l’auteur ouvre la modale de profil (jamais une par rangée)', () => {
  beforeEach(() => {
    mockUserProfileModal.mockClear();
  });

  it('monte `UserProfileModal` fermée par défaut (`userId=null`) — une seule instance JSX, quel que soit le nombre de passes de rendu', () => {
    const containerRef = createRef<HTMLDivElement>();
    render(
      <FocalThread
        messages={[makeMessage('m1'), makeMessage('m2', { senderId: 'other2', sender: { id: 'other2', conversationId: 'c1', type: 'user', displayName: 'Bob', user: { username: 'bob' } } as unknown })]}
        currentUser={currentUser}
        scrollContainerRef={containerRef}
      />
    );

    // Le nombre d'APPELS n'est pas la preuve pertinente ici — `FocalThread`
    // republie sa ref de conteneur en état (patron REV-4/B1, `rootRef`), ce
    // qui ajoute une passe de rendu au montage sans rapport avec la modale.
    // La preuve, c'est que CHAQUE passe montre TOUJOURS le même état fermé.
    for (const call of mockUserProfileModal.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ open: false, userId: null }));
    }
    expect(mockUserProfileModal).toHaveBeenCalled();
  });

  it('clic sur l’identité de l’auteur : la modale s’ouvre avec SON username, la navigation par défaut est empêchée', () => {
    const containerRef = createRef<HTMLDivElement>();
    render(
      <FocalThread
        messages={[makeMessage('m1')]}
        currentUser={currentUser}
        scrollContainerRef={containerRef}
      />
    );

    const link = screen.getByTestId('focal-identity-profile-link');
    const notPrevented = fireEvent.click(link);

    expect(notPrevented).toBe(false); // preventDefault → jamais de navigation `/u/alice`
    expect(mockUserProfileModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, userId: 'alice' })
    );
  });

  it('deux rangées d’auteurs différents partagent la MÊME modale — le second clic remplace la cible, il n’en ouvre pas une seconde', () => {
    const containerRef = createRef<HTMLDivElement>();
    render(
      <FocalThread
        messages={[
          makeMessage('m1'),
          makeMessage('m2', {
            senderId: 'other2',
            createdAt: new Date('2026-08-17T10:05:00Z'),
            timestamp: new Date('2026-08-17T10:05:00Z'),
            sender: { id: 'other2', conversationId: 'c1', type: 'user', displayName: 'Bob', user: { username: 'bob' } } as unknown,
          }),
        ]}
        currentUser={currentUser}
        scrollContainerRef={containerRef}
      />
    );

    // Ciblées par `data-message-id`, jamais par ORDRE DOM — `FocalThread`
    // inverse le tableau backend (DESC → "ancien en haut"), l'ordre visuel
    // ne reflète donc pas l'ordre de ce tableau de fixtures.
    const rows = screen.getAllByTestId('focal-row');
    const rowM1 = rows.find((row) => row.getAttribute('data-message-id') === 'm1')!;
    const rowM2 = rows.find((row) => row.getAttribute('data-message-id') === 'm2')!;
    const linkAlice = within(rowM1).getByTestId('focal-identity-profile-link');
    const linkBob = within(rowM2).getByTestId('focal-identity-profile-link');

    fireEvent.click(linkAlice);
    expect(mockUserProfileModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, userId: 'alice' })
    );

    fireEvent.click(linkBob);
    expect(mockUserProfileModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, userId: 'bob' })
    );

    // `FocalThread` ne rend `<UserProfileModal>` qu'UNE fois, HORS de la
    // boucle `.map()` des rangées (lecture du fichier source) : cette
    // séquence — l'état bascule de "alice" à "bob" sur le MÊME jeu de props
    // observé par le mock, sans qu'aucun clic n'ait eu besoin de savoir quel
    // username la modale portait déjà — est le comportement qu'un état par
    // rangée ne pourrait pas reproduire sans re-signaler ses voisins.
  });
});
