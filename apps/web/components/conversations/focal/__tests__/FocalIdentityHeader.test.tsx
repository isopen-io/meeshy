/**
 * WF-110 — `FocalIdentityHeader`.
 *
 * behaviour-matrix:F03 — dot de présence sur la pastille 22 de l'identité,
 * "offline = pas de dot" inchangé (RÉUTILISE `ParticipantPresenceIndicator`
 * verbatim, MÊME composant que la Lentille liste — WL-102).
 *
 * MISE À JOUR — DIRECTIVE PRODUIT DU 2026-08-17 (« le profil s'ouvre en
 * modale ») : le describe « profil en modale » ci-dessous couvre
 * `onOpenProfile`, ajouté par ce même lot — le lien `/u/{username}` reste
 * réel (témoins existants inchangés), mais son clic gauche simple est
 * désormais intercepté quand un appelant (`FocalThread`) fournit ce rappel.
 */
import { render, screen, fireEvent } from '@testing-library/react';
import { FocalIdentityHeader } from '../FocalIdentityHeader';
import type { Participant } from '@meeshy/shared/types/participant';

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ status, className }: { status: string; className?: string }) =>
    status === 'offline' ? null : (
      <div data-testid="focal-identity-presence-dot" data-status={status} className={className} />
    ),
}));

let mockStoredUser: unknown = null;
jest.mock('@/stores/user-store', () => ({
  useUserById: jest.fn(() => mockStoredUser),
  useUserStatusTick: jest.fn(),
}));

const sender = { id: 'u1', conversationId: 'c1', type: 'user', displayName: 'Alice' } as Participant;

describe('FocalIdentityHeader', () => {
  beforeEach(() => {
    mockStoredUser = null;
  });

  it('affiche le nom de l\'expéditeur et l\'heure', () => {
    render(<FocalIdentityHeader sender={sender} isMe={false} time="10:00" youLabel="Toi" />);
    expect(screen.getByTestId('focal-identity-name')).toHaveTextContent('Alice');
    expect(screen.getByTestId('focal-identity-time')).toHaveTextContent('10:00');
  });

  it('"Toi" en indigo #6366F1 quand isMe', () => {
    render(<FocalIdentityHeader sender={sender} isMe time="10:00" youLabel="Toi" />);
    const name = screen.getByTestId('focal-identity-name');
    expect(name).toHaveTextContent('Toi');
    expect(name).toHaveStyle({ color: '#6366F1' });
  });

  it('cotes pastille/nom/heure par les tokens thread.* (garde R15 — jamais en dur)', () => {
    render(<FocalIdentityHeader sender={sender} isMe={false} time="10:00" youLabel="Toi" />);
    expect(screen.getByTestId('focal-identity-name')).toHaveStyle({
      fontSize: 'var(--lentille-thread-name-size)',
      fontWeight: 'var(--lentille-thread-name-weight)',
    });
    expect(screen.getByTestId('focal-identity-time')).toHaveStyle({
      fontSize: 'var(--lentille-thread-time-size)',
      fontWeight: 'var(--lentille-thread-time-weight)',
    });
  });
});

describe('FocalIdentityHeader — présence (behaviour-matrix:F03)', () => {
  beforeEach(() => {
    mockStoredUser = null;
  });

  it('rend un dot de présence pour un expéditeur EN LIGNE (non "moi")', () => {
    mockStoredUser = { id: 'u1', isOnline: true, lastActiveAt: new Date() };
    render(<FocalIdentityHeader sender={sender} isMe={false} time="10:00" youLabel="Toi" />);
    expect(screen.getByTestId('focal-identity-presence-dot')).toBeInTheDocument();
  });

  it('n\'affiche AUCUN dot pour un expéditeur hors ligne (« offline = pas de dot », règle inchangée)', () => {
    mockStoredUser = { id: 'u1', isOnline: false, lastActiveAt: new Date(0) };
    render(<FocalIdentityHeader sender={sender} isMe={false} time="10:00" youLabel="Toi" />);
    expect(screen.queryByTestId('focal-identity-presence-dot')).not.toBeInTheDocument();
  });

  it('n\'affiche JAMAIS de dot de présence pour "Toi" (isMe) — on ne s\'affiche pas sa propre présence dans son propre fil', () => {
    mockStoredUser = { id: 'u1', isOnline: true, lastActiveAt: new Date() };
    render(<FocalIdentityHeader sender={sender} isMe time="10:00" youLabel="Toi" />);
    expect(screen.queryByTestId('focal-identity-presence-dot')).not.toBeInTheDocument();
  });
});

const senderWithUsername = {
  id: 'u1',
  conversationId: 'c1',
  type: 'user',
  displayName: 'Alice',
  user: { username: 'alice' },
} as unknown as Participant;

describe('FocalIdentityHeader — le profil s’ouvre EN MODALE (directive produit 2026-08-17)', () => {
  beforeEach(() => {
    mockStoredUser = null;
  });

  it('clic gauche simple avec `onOpenProfile` fourni : la navigation est empêchée, le rappel reçoit le username', () => {
    const onOpenProfile = jest.fn();
    render(
      <FocalIdentityHeader
        sender={senderWithUsername}
        isMe={false}
        time="10:00"
        youLabel="Toi"
        onOpenProfile={onOpenProfile}
      />
    );

    const link = screen.getByTestId('focal-identity-profile-link');
    expect(link).toHaveAttribute('href', '/u/alice');

    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(false);
    expect(onOpenProfile).toHaveBeenCalledWith('alice');
  });

  it('sans `onOpenProfile` : le lien navigue toujours directement (repli, comportement inchangé)', () => {
    render(
      <FocalIdentityHeader sender={senderWithUsername} isMe={false} time="10:00" youLabel="Toi" />
    );

    const link = screen.getByTestId('focal-identity-profile-link');
    const notPrevented = fireEvent.click(link);
    expect(notPrevented).toBe(true);
  });

  it('clic MODIFIÉ (⌘/Ctrl) : jamais intercepté — nouvel onglet natif préservé', () => {
    const onOpenProfile = jest.fn();
    render(
      <FocalIdentityHeader
        sender={senderWithUsername}
        isMe={false}
        time="10:00"
        youLabel="Toi"
        onOpenProfile={onOpenProfile}
      />
    );

    const link = screen.getByTestId('focal-identity-profile-link');
    const notPrevented = fireEvent.click(link, { metaKey: true });
    expect(notPrevented).toBe(true);
    expect(onOpenProfile).not.toHaveBeenCalled();
  });
});
