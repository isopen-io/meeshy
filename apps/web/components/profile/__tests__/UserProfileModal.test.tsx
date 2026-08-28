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

jest.mock('@/hooks/v2/use-friend-requests-v2', () => ({
  // Le composant lit désormais les demandes d'ami par ce hook (#4189) — il
  // interrogeait auparavant `/friend-requests`, une adresse qui n'existe pas.
  // Ces témoins portent sur le squelette, l'erreur et la présence : le hook y
  // est un décor, mais il tire React Query, qui exigerait un QueryClient.
  useFriendRequestsV2: () => ({
    allRequests: [],
    received: [],
    sent: [],
    connected: [],
    pending: [],
    refused: [],
    stats: { connected: 0, pending: 0, refused: 0 },
    isLoading: false,
    error: null,
    sendRequest: jest.fn(),
    acceptRequest: jest.fn(),
    rejectRequest: jest.fn(),
    cancelRequest: jest.fn(),
    getPendingRequestWithUser: () => undefined,
    refresh: jest.fn(),
  }),
}));

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

/**
 * Q-143 — Layout Shift 0, surface neuve du jour (directive produit
 * 2026-08-17). Cette modale est montée UNE FOIS par
 * `LentilleConversationListMount` (voir `.profile-modal.test.tsx`, où elle
 * est mockée pour prouver le BRANCHEMENT) — ici, `UserProfileModal` est le
 * VRAI composant, et la preuve porte sur la GÉOMÉTRIE, pas le câblage :
 * s'ouvrir ne doit JAMAIS déplacer la liste sous elle.
 *
 * jsdom ne calcule aucun layout réel (`getBoundingClientRect` rend des zéros
 * partout sans stub) — la preuve retenue est donc STRUCTURELLE, pas
 * pixel-perfect : (1) le contenu vit dans un `Portal` Radix, hors du
 * sous-arbre DOM de la liste — un nœud hors-arbre ne peut pas invalider son
 * flux ; (2) sa classe pose `fixed` (jamais `static`/`relative`/`sticky`) —
 * la seule famille de position qui ne participe PAS au flux normal des
 * frères ; (3) le sous-arbre voisin (la « liste ») est BYTE-IDENTIQUE avant/
 * après ouverture — aucun re-render de la liste n'est déclenché par
 * l'ouverture de la modale.
 */
describe('UserProfileModal — Layout Shift 0 (Q-143, surface neuve du 2026-08-17)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({ success: true, data: alice });
    mockGetUserStats.mockResolvedValue({ success: true, data: {} });
  });

  it('le contenu de la modale n’est PAS un descendant de la liste — Portal Radix, hors du flux', async () => {
    const { container } = render(
      <div data-testid="fake-list-root">
        <div data-testid="fake-row">rang 1</div>
        <UserProfileModal open onOpenChange={() => {}} userId="alice" />
      </div>
    );
    await screen.findByTestId('user-profile-modal');

    const listRoot = container.querySelector('[data-testid="fake-list-root"]')!;
    const modal = screen.getByTestId('user-profile-modal');

    expect(listRoot.contains(modal)).toBe(false);
  });

  it('le contenu de la modale est positionné `fixed` — jamais dans le flux qui pourrait pousser un voisin', async () => {
    render(<UserProfileModal open onOpenChange={() => {}} userId="alice" />);
    const modal = await screen.findByTestId('user-profile-modal');

    expect(modal.className).toMatch(/\bfixed\b/);
    expect(modal.className).not.toMatch(/\b(static|relative|sticky)\b/);
  });

  it('la liste voisine est BYTE-IDENTIQUE avant/après ouverture — la modale ne re-rend jamais ses frères', async () => {
    function Host({ open }: { open: boolean }) {
      return (
        <div>
          <ul data-testid="fake-list">
            <li>rang 1</li>
            <li>rang 2</li>
            <li>rang 3</li>
          </ul>
          <UserProfileModal open={open} onOpenChange={() => {}} userId="alice" />
        </div>
      );
    }

    const { rerender } = render(<Host open={false} />);
    const before = screen.getByTestId('fake-list').outerHTML;

    rerender(<Host open />);
    await screen.findByTestId('user-profile-modal');
    const after = screen.getByTestId('fake-list').outerHTML;

    expect(after).toBe(before);
  });
});
