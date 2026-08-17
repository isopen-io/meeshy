/**
 * Fidélité Lentille — l'avatar du rang est une AFFORDANCE PROPRE, pas une
 * partie de la cible « ouvrir la conversation ».
 *
 * behaviour-matrix:L12 — « … et exclusion avatar 70 pt … conservée » : la
 * matrice normative (vol.5 §5.3, `packages/shared/fixtures/conformance/
 * behaviour-matrix.json`) réserve la zone d'avatar au geste d'avatar. Cette
 * zone d'exclusion n'a de sens que parce que l'avatar PORTE un geste à lui :
 *
 *   - maquette normative `docs/design/2026-08-15-conversation-list-lentille.html`
 *     §5.1, ligne « Stories & header » : « … routage tap story/mood »
 *     CONSERVÉ tel quel — l'avatar route, il n'ouvre pas la conversation ;
 *   - jumeau iOS déjà bâti à cette maquette :
 *     `apps/ios/Meeshy/Features/Main/Lentille/Row/LentilleConversationRow.swift`
 *     → `LentilleRowAvatar(… onViewProfile: …)` →
 *     `ThemedConversationRow.swift:778` (« DM : tap → story (si non lue)
 *     sinon profil »), branché sur
 *     `ConversationListView.swift:734 → handleProfileView` (feuille de profil).
 *     Groupe : `onTap: onViewConversationInfo` — les infos de conversation,
 *     jamais un profil unique (`ConversationAvatarMenu.groupRoles`).
 *
 * Le WEB était la seule surface où l'avatar tombait dans la cible d'ouverture
 * de la conversation. RE-PREUVE (2026-08-17, avant ce lot) :
 * `LentilleRow.tsx` rendait `<Avatar>` nu dans un `<div className="relative
 * flex-shrink-0">`, sans lien, sans bouton, sans `stopPropagation` — un clic
 * dessus remontait au `role="button"` racine et ouvrait le fil.
 *
 * MISE À JOUR — DIRECTIVE PRODUIT DU 2026-08-17 (« le profil s'ouvre en
 * modale ») : `UserProfileModal` existe désormais
 * (`components/profile/UserProfileModal.tsx`). L'affordance de CE fichier
 * reste un VRAI `<Link href="/u/{username}">` (nom accessible, clic droit
 * "nouvel onglet" natif, atteignable au clavier) — mais son clic gauche
 * SIMPLE est intercepté par `onOpenProfile` (fourni par
 * `LentilleConversationListMount`, l'état d'ouverture unique de la liste)
 * pour ouvrir la modale plutôt que de naviguer. Les témoins « la route reste
 * `/u/{username}` » ci-dessous restent VRAIS (le `href` ne change pas) ; ceux
 * qui suivent, dans le describe « profil en modale », prouvent
 * l'interception. Sans `onOpenProfile` (repli), le lien navigue toujours
 * directement — comportement inchangé pour tout appelant qui ne monte pas la
 * modale.
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

jest.mock('@/hooks/use-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key, isLoading: false }),
}));

import { LentilleRow } from '../LentilleRow';

const t = (key: string, params?: Record<string, unknown> | string) => {
  if (key === 'lentille.a11y.openProfile' && typeof params === 'object' && params) {
    return `Voir le profil de ${(params as { name?: string }).name}`;
  }
  if (key === 'lentille.a11y.openConversationInfo' && typeof params === 'object' && params) {
    return `Infos de ${(params as { name?: string }).name}`;
  }
  return key;
};

const makeUser = (overrides: Partial<User> = {}): User =>
  ({
    id: 'user-1',
    username: 'alice',
    displayName: 'Alice',
    systemLanguage: 'fr',
    isOnline: true,
    isActive: true,
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  }) as unknown as User;

const makeDirectConversation = (): Conversation =>
  ({
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
  }) as unknown as Conversation;

const makeGroupConversation = (): Conversation =>
  ({
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
  }) as unknown as Conversation;

describe("LentilleRow — l'avatar ouvre le profil, jamais la conversation (behaviour-matrix:L12)", () => {
  it('conversation directe : l’avatar est un lien vers /u/{username} de L’AUTRE participant, avec un nom accessible', () => {
    render(
      <LentilleRow
        conversation={makeDirectConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );

    const affordance = screen.getByTestId('lentille-row-avatar-affordance');
    // La MÊME route que partout ailleurs dans le web (`/u/{username}`).
    expect(affordance).toHaveAttribute('href', '/u/bob');
    // Nom accessible — jamais un lien muet.
    expect(affordance).toHaveAccessibleName('Voir le profil de Bob');
  });

  it('un clic sur l’avatar N’OUVRE PAS la conversation (propagation arrêtée)', () => {
    const onSelect = jest.fn();
    render(
      <LentilleRow
        conversation={makeDirectConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={onSelect}
        t={t}
      />
    );

    fireEvent.click(screen.getByTestId('lentille-row-avatar-affordance'));
    expect(onSelect).not.toHaveBeenCalled();

    // Contre-épreuve : le rang, lui, s'ouvre toujours au clic — l'exclusion
    // est LOCALE à l'avatar, elle ne neutralise pas la rangée.
    fireEvent.click(screen.getByTestId('lentille-row'));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it('atteignable au clavier : Entrée sur l’avatar n’ouvre pas non plus la conversation', () => {
    const onSelect = jest.fn();
    render(
      <LentilleRow
        conversation={makeDirectConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={onSelect}
        t={t}
      />
    );

    const affordance = screen.getByTestId('lentille-row-avatar-affordance');
    affordance.focus();
    expect(affordance).toHaveFocus();

    // Sans arrêt de propagation, le `onKeyDown` du rang (`role="button"`,
    // Enter/Espace) ouvrirait la conversation EN PLUS du profil.
    fireEvent.keyDown(affordance, { key: 'Enter' });
    fireEvent.keyDown(affordance, { key: ' ' });
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('groupe : l’avatar ouvre les INFOS de conversation (parité iOS `onViewConversationInfo`), jamais un profil', () => {
    const onSelect = jest.fn();
    const onShowDetails = jest.fn();
    const conversation = makeGroupConversation();
    render(
      <LentilleRow
        conversation={conversation}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={onSelect}
        onShowDetails={onShowDetails}
        t={t}
      />
    );

    const affordance = screen.getByTestId('lentille-row-avatar-affordance');
    expect(affordance).not.toHaveAttribute('href');
    expect(affordance).toHaveAccessibleName('Infos de Équipe produit');

    fireEvent.click(affordance);
    expect(onShowDetails).toHaveBeenCalledWith(conversation);
    expect(onSelect).not.toHaveBeenCalled();
  });

  it('groupe sans `onShowDetails` : aucune affordance inerte n’est rendue (le rang reste une seule cible)', () => {
    render(
      <LentilleRow
        conversation={makeGroupConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );

    expect(screen.queryByTestId('lentille-row-avatar-affordance')).not.toBeInTheDocument();
  });

  it('porte le marqueur d’exclusion d’appui long — la « zone d’exclusion avatar » de L12', () => {
    render(
      <LentilleRow
        conversation={makeDirectConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );

    expect(screen.getByTestId('lentille-row-avatar-affordance')).toHaveAttribute(
      'data-lentille-press-exempt',
      'true'
    );
  });
});

describe('LentilleRow — l’avatar ouvre le PROFIL EN MODALE (directive produit 2026-08-17)', () => {
  it('clic gauche simple avec `onOpenProfile` fourni : la modale s’ouvre (username de l’AUTRE participant), la navigation est empêchée', () => {
    const onOpenProfile = jest.fn();
    render(
      <LentilleRow
        conversation={makeDirectConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        onOpenProfile={onOpenProfile}
        t={t}
      />
    );

    const affordance = screen.getByTestId('lentille-row-avatar-affordance');
    // Le `href` reste réel (repli honnête, clic droit "nouvel onglet") —
    // c'est SEULEMENT la navigation par défaut du clic simple qui cède la
    // place à la modale.
    expect(affordance).toHaveAttribute('href', '/u/bob');

    const notPrevented = fireEvent.click(affordance);
    // `dispatchEvent` rend `false` quand `preventDefault()` a été appelé —
    // la preuve que la navigation native n'a PAS eu lieu.
    expect(notPrevented).toBe(false);
    expect(onOpenProfile).toHaveBeenCalledTimes(1);
    expect(onOpenProfile).toHaveBeenCalledWith('bob');
  });

  it('sans `onOpenProfile` (appelant qui ne monte pas la modale) : le lien navigue, comportement inchangé', () => {
    render(
      <LentilleRow
        conversation={makeDirectConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        t={t}
      />
    );

    const affordance = screen.getByTestId('lentille-row-avatar-affordance');
    const notPrevented = fireEvent.click(affordance);
    expect(notPrevented).toBe(true);
  });

  it('clic MODIFIÉ (Ctrl) : jamais intercepté — le navigateur garde la main (nouvel onglet natif)', () => {
    const onOpenProfile = jest.fn();
    render(
      <LentilleRow
        conversation={makeDirectConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={() => {}}
        onOpenProfile={onOpenProfile}
        t={t}
      />
    );

    const affordance = screen.getByTestId('lentille-row-avatar-affordance');
    const notPrevented = fireEvent.click(affordance, { ctrlKey: true });
    expect(notPrevented).toBe(true);
    expect(onOpenProfile).not.toHaveBeenCalled();
  });

  it('l’ouverture de la modale N’OUVRE PAS non plus la conversation (propagation toujours arrêtée)', () => {
    const onSelect = jest.fn();
    const onOpenProfile = jest.fn();
    render(
      <LentilleRow
        conversation={makeDirectConversation()}
        currentUser={makeUser()}
        isSelected={false}
        onSelect={onSelect}
        onOpenProfile={onOpenProfile}
        t={t}
      />
    );

    fireEvent.click(screen.getByTestId('lentille-row-avatar-affordance'));
    expect(onOpenProfile).toHaveBeenCalledWith('bob');
    expect(onSelect).not.toHaveBeenCalled();
  });
});
