/**
 * Directive produit du 2026-08-17 — « l'auteur d'un message doit être
 * clickable pour afficher son profil EN MODALE ». Pour la Lentille, c'est
 * l'AVATAR d'un rang DM (behaviour-matrix:L12) qui porte cette affordance.
 *
 * `UserProfileModal` est MOCKÉ (espion des props) : ce fichier prouve le
 * BRANCHEMENT — `LentilleConversationListMount` porte l'état d'ouverture
 * UNIQUE de la liste (jamais une modale par rang, même patron que
 * `LentillePeek`/`ReadingModeMenu`) et le pousse au bon username. `LentilleRow`
 * N'EST PAS mocké : c'est la VRAIE affordance d'avatar (`AvatarAffordance`)
 * qui est exercée, avec les mêmes mocks de feuilles connus-fonctionnels que
 * `LentilleRow.avatar-affordance.test.tsx`.
 */
import React from 'react';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import type { Conversation, SocketIOUser as User } from '@meeshy/shared/types';

jest.mock('@/components/ui/avatar', () => ({
  Avatar: ({ children, className, style }: any) => (
    <div data-testid="avatar" className={className} style={style}>{children}</div>
  ),
  AvatarFallback: ({ children }: any) => <div data-testid="avatar-fallback">{children}</div>,
  AvatarImage: ({ src }: any) => (src ? <img data-testid="avatar-image" src={src} alt="" /> : null),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: () => null,
}));

jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => null),
  useUserStatusTick: jest.fn(),
}));

jest.mock('@/hooks/use-resolved-theme', () => ({
  useResolvedTheme: () => 'light',
}));

jest.mock('@/hooks/lentille/use-lentille-list-typing', () => ({
  useLentilleListTyping: () => new Map(),
}));

jest.mock('@/hooks/lentille/use-lentille-bridges', () => ({
  useLentilleBridges: () => new Map(),
}));

jest.mock('@/stores/conversation-ui-store', () => ({
  useConversationUIStore: (selector: any) => selector({ draftMessages: {} }),
}));

const mockUserProfileModal = jest.fn((_props: unknown) => null);
jest.mock('@/components/profile/UserProfileModal', () => ({
  UserProfileModal: (props: unknown) => {
    mockUserProfileModal(props);
    return null;
  },
}));

const t = (key: string, params?: Record<string, unknown> | string) => {
  if (key === 'lentille.a11y.openProfile' && typeof params === 'object' && params) {
    return `Voir le profil de ${(params as { name?: string }).name}`;
  }
  if (key === 'lentille.a11y.openConversationInfo' && typeof params === 'object' && params) {
    return `Infos de ${(params as { name?: string }).name}`;
  }
  return key;
};
jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t, isLoading: false }),
}));

import { LentilleConversationListMount } from '../LentilleConversationListMount';

const makeUser = (): User =>
  ({ id: 'user-1', username: 'alice', displayName: 'Alice', email: 'a@a.com', role: 'USER' } as unknown as User);

const directConversation: Conversation = {
  id: 'conv-dm',
  type: 'direct',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 2,
  participants: [
    { userId: 'user-1', user: { id: 'user-1', username: 'alice', displayName: 'Alice' } },
    { userId: 'user-2', user: { id: 'user-2', username: 'bob', displayName: 'Bob' } },
  ],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-06-01'),
  unreadCount: 0,
} as unknown as Conversation;

const groupConversation: Conversation = {
  id: 'conv-group',
  type: 'group',
  title: 'Équipe produit',
  status: 'active',
  visibility: 'private',
  isActive: true,
  memberCount: 3,
  participants: [],
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-06-01'),
  unreadCount: 0,
} as unknown as Conversation;

const baseProps = {
  currentUser: makeUser(),
  currentUserId: 'user-1',
  selectedConversationId: null as string | null,
  preferencesMap: new Map(),
  categories: [],
  isLoading: false,
  t,
};

describe('LentilleConversationListMount — le clic sur l’avatar DM ouvre la modale de profil', () => {
  beforeEach(() => {
    mockUserProfileModal.mockClear();
  });

  it('monte `UserProfileModal` fermée par défaut (`userId=null`) — une seule instance JSX, quel que soit le nombre de passes de rendu', () => {
    render(
      <LentilleConversationListMount
        {...baseProps}
        conversations={[directConversation]}
        onSelectConversation={() => {}}
      />
    );

    // Le nombre d'APPELS n'est pas la preuve pertinente — le point de
    // montage republie sa ref de conteneur en état dès le montage (REV-4/B1,
    // `rootRef`), ce qui ajoute une passe de rendu sans rapport avec la
    // modale. La preuve, c'est que CHAQUE passe montre le même état fermé.
    for (const call of mockUserProfileModal.mock.calls) {
      expect(call[0]).toEqual(expect.objectContaining({ open: false, userId: null }));
    }
    expect(mockUserProfileModal).toHaveBeenCalled();
  });

  it('clic sur l’avatar DM : la modale s’ouvre avec le username de L’AUTRE participant, le rang ne s’ouvre PAS', () => {
    const onSelectConversation = jest.fn();
    render(
      <LentilleConversationListMount
        {...baseProps}
        conversations={[directConversation]}
        onSelectConversation={onSelectConversation}
      />
    );

    const affordance = screen.getByTestId('lentille-row-avatar-affordance');
    const notPrevented = fireEvent.click(affordance);

    expect(notPrevented).toBe(false); // preventDefault → jamais de navigation `/u/bob`
    expect(mockUserProfileModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: true, userId: 'bob' })
    );
    expect(onSelectConversation).not.toHaveBeenCalled();
  });

  it('groupe : l’avatar ouvre TOUJOURS les infos de conversation — la modale de profil ne s’ouvre jamais', () => {
    const onShowDetails = jest.fn();
    render(
      <LentilleConversationListMount
        {...baseProps}
        conversations={[groupConversation]}
        onSelectConversation={() => {}}
        onShowDetails={onShowDetails}
      />
    );

    const affordance = screen.getByTestId('lentille-row-avatar-affordance');
    fireEvent.click(affordance);

    expect(onShowDetails).toHaveBeenCalledWith(groupConversation);
    // La modale reste fermée — dernier appel toujours `open: false`.
    expect(mockUserProfileModal).toHaveBeenLastCalledWith(
      expect.objectContaining({ open: false, userId: null })
    );
  });
});
