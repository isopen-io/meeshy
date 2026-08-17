/**
 * `UserProfileModal` — directive produit du 2026-08-17 (« le profil s'ouvre
 * en modale »). Patron `Dialog` Radix du dépôt (`JoinConversationModal.tsx`) :
 * Échap/clic-fond ferment TOUJOURS (aucune surcharge de
 * `onEscapeKeyDown`/`onInteractOutside`, contrairement à `JoinConversationModal`
 * qui les bloque conditionnellement — ce profil n'a aucune raison de retenir
 * l'utilisateur), focus-trap Radix gratuit, `DialogTitle` toujours présent
 * (a11y). `UserProfileContent` N'EST PAS mocké : ces témoins exercent le VRAI
 * chargement (mocks aux frontières services/stores, même recette que
 * `UserProfileContent.test.tsx`) pour prouver que la modale montre le BON
 * utilisateur, pas un placeholder.
 */
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockGetUserProfile = jest.fn();
const mockGetUserStats = jest.fn();

jest.mock('@/services', () => ({
  usersService: {
    getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
    getUserStats: (...args: unknown[]) => mockGetUserStats(...args),
  },
  conversationsService: { createConversation: jest.fn() },
}));

// `t` DOIT rester une référence STABLE — voir `UserProfileContent.test.tsx`
// (le vrai `useI18n` mémoïse `t`, un mock qui en recrée une fermeture à
// chaque appel casse le tableau de dépendances de `UserProfileContent`).
const mockT = (key: string, paramsOrFallback?: Record<string, unknown> | string) =>
  typeof paramsOrFallback === 'string' ? paramsOrFallback : key;

jest.mock('@/hooks/useI18n', () => ({
  useI18n: () => ({
    t: mockT,
    locale: 'fr',
    isLoading: false,
  }),
}));

const mockCurrentUser = { id: 'me', username: 'me', displayName: 'Moi' };
jest.mock('@/stores', () => ({
  useUser: () => mockCurrentUser,
}));

jest.mock('@/stores/user-store', () => ({
  useUserStatusTick: () => {},
}));

jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: () => ({}),
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: () => null,
}));

jest.mock('@/components/contacts/ConversationDropdown', () => ({
  ConversationDropdown: () => <div data-testid="conversation-dropdown-stub" />,
}));

jest.mock('@/services/auth-manager.service', () => ({
  authManager: { getAuthToken: () => null },
}));

jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn() }),
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import { UserProfileModal } from '../UserProfileModal';

const alice = {
  id: 'u-alice',
  username: 'alice',
  displayName: 'Alice Dupont',
  isOnline: null,
  createdAt: '2026-01-01T00:00:00.000Z',
};

describe('UserProfileModal — fermée', () => {
  it('ne rend AUCUN contenu de profil quand `open=false` (pas de fetch déclenché)', () => {
    render(<UserProfileModal open={false} onOpenChange={() => {}} userId="alice" />);
    expect(mockGetUserProfile).not.toHaveBeenCalled();
    expect(screen.queryByTestId('user-profile-modal')).not.toBeInTheDocument();
  });
});

describe('UserProfileModal — ouverte, profil chargé', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({ success: true, data: alice });
    mockGetUserStats.mockResolvedValue({ success: true, data: {} });
  });

  it('affiche le BON utilisateur — le `DialogTitle` porte son nom une fois chargé', async () => {
    render(<UserProfileModal open onOpenChange={() => {}} userId="alice" />);
    await waitFor(() =>
      expect(screen.getByTestId('user-profile-modal-title')).toHaveTextContent('Alice Dupont')
    );
    expect(mockGetUserProfile).toHaveBeenCalledWith('alice');
  });

  it('Échap ferme la modale (`onOpenChange(false)`) — aucune surcharge ne la retient', async () => {
    const onOpenChange = jest.fn();
    render(<UserProfileModal open onOpenChange={onOpenChange} userId="alice" />);
    await screen.findByTestId('user-profile-modal-title');

    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('le lien « profil complet » est présent avec le bon `href`, dès l’ouverture (avant même que le chargement résolve)', () => {
    mockGetUserProfile.mockReturnValue(new Promise(() => {})); // reste en chargement
    render(<UserProfileModal open onOpenChange={() => {}} userId="alice" />);
    const link = screen.getByTestId('user-profile-modal-full-link');
    expect(link).toHaveAttribute('href', '/u/alice');
  });

  it('le clic sur « profil complet » referme la modale (accès page complète préservé, jamais un second écran par-dessus)', async () => {
    const onOpenChange = jest.fn();
    render(<UserProfileModal open onOpenChange={onOpenChange} userId="alice" />);
    const link = await screen.findByTestId('user-profile-modal-full-link');
    fireEvent.click(link);
    expect(onOpenChange).toHaveBeenCalledWith(false);
  });
});

describe('UserProfileModal — utilisateur introuvable', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({ success: true, data: null });
    mockGetUserStats.mockResolvedValue({ success: true, data: null });
  });

  it('affiche une erreur honnête — jamais un placeholder muet', async () => {
    render(<UserProfileModal open onOpenChange={() => {}} userId="ghost" />);
    const notFound = await screen.findByTestId('user-profile-content-not-found');
    expect(notFound).toHaveTextContent('userNotFound');
  });

  it('le lien « profil complet » reste présent (calculé depuis le `userId` demandé, pas depuis l’utilisateur introuvable)', async () => {
    render(<UserProfileModal open onOpenChange={() => {}} userId="ghost" />);
    await screen.findByTestId('user-profile-content-not-found');
    expect(screen.getByTestId('user-profile-modal-full-link')).toHaveAttribute('href', '/u/ghost');
  });
});
