/**
 * `UserProfileContent` — extraction de `/u/[id]/page.tsx` (directive produit
 * 2026-08-17, « le profil s'ouvre en modale »). Ce composant est désormais le
 * SEUL endroit qui porte la logique de chargement/actions du profil : la
 * page ET `UserProfileModal` le montent tel quel. Ces témoins couvrent le
 * squelette de chargement, l'erreur honnête « introuvable », le rendu chargé,
 * et le canal `onStateChange` par lequel un appelant apprend le nom
 * d'affichage sans recalculer sa propre résolution.
 */
import { act, render, screen, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';

const mockGetUserProfile = jest.fn();
const mockGetUserStats = jest.fn();
const mockCreateConversation = jest.fn();

jest.mock('@/services', () => ({
  usersService: {
    getUserProfile: (...args: unknown[]) => mockGetUserProfile(...args),
    getUserStats: (...args: unknown[]) => mockGetUserStats(...args),
  },
  conversationsService: {
    createConversation: (...args: unknown[]) => mockCreateConversation(...args),
  },
}));

// `t` DOIT être une référence STABLE entre les rendus — le vrai `useI18n`
// (`hooks/use-i18n.ts:142`) mémoïse `t` par `useCallback` ; un mock qui en
// recrée une fermeture à chaque appel casserait le tableau de dépendances de
// `loadUserProfile`/`useEffect` de `UserProfileContent` (identité de `t`
// dans les deps) et redéclencherait le chargement en boucle.
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

// Capture du handler `onUserStatus` que le composant confie au hook socket —
// les témoins de présence rejouent un `user:status` DIRECTEMENT dessus, avec la
// forme exacte du fil (`isOnline: boolean`, `lastActiveAt?: Date | null`).
type OnUserStatus = (userId: string, username: string, isOnline: boolean, lastActiveAt?: Date | null) => void;
const mockSocketHandlers: { onUserStatus?: OnUserStatus } = {};
jest.mock('@/hooks/use-socketio-messaging', () => ({
  useSocketIOMessaging: (options: { onUserStatus?: OnUserStatus }) => {
    mockSocketHandlers.onUserStatus = options.onUserStatus;
    return {};
  },
}));

jest.mock('@/components/ui/online-indicator', () => ({
  OnlineIndicator: ({ status }: { status: string }) =>
    status === 'offline' ? null : <div data-testid="online-indicator" />,
}));

jest.mock('@/components/contacts/ConversationDropdown', () => ({
  ConversationDropdown: () => <div data-testid="conversation-dropdown-stub" />,
}));

const mockGetAuthToken = jest.fn(() => null);
jest.mock('@/services/auth-manager.service', () => ({
  authManager: { getAuthToken: () => mockGetAuthToken() },
}));

const mockRouterPush = jest.fn();
jest.mock('next/navigation', () => ({
  useRouter: () => ({ push: mockRouterPush, back: jest.fn() }),
}));

jest.mock('sonner', () => ({
  toast: { error: jest.fn(), success: jest.fn() },
}));

import { UserProfileContent } from '../UserProfileContent';

describe('UserProfileContent — squelette de chargement', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockReturnValue(new Promise(() => {})); // ne résout jamais
    mockGetUserStats.mockReturnValue(new Promise(() => {}));
  });

  it('rend un squelette annoncé (`role="status"`, `aria-busy`) tant que le chargement n’a pas résolu', () => {
    render(<UserProfileContent userId="alice" />);
    const status = screen.getByTestId('user-profile-content-loading');
    expect(status).toHaveAttribute('role', 'status');
    expect(status).toHaveAttribute('aria-busy', 'true');
  });
});

describe('UserProfileContent — erreur honnête « utilisateur introuvable »', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({ success: true, data: null });
    mockGetUserStats.mockResolvedValue({ success: true, data: null });
  });

  it('affiche une carte « introuvable », jamais une page vide ou une exception', async () => {
    render(<UserProfileContent userId="ghost" />);
    const notFound = await screen.findByTestId('user-profile-content-not-found');
    expect(notFound).toHaveTextContent('userNotFound');
  });

  it('remonte `{ loading:false, user:null }` via onStateChange', async () => {
    const onStateChange = jest.fn();
    render(<UserProfileContent userId="ghost" onStateChange={onStateChange} />);
    await waitFor(() =>
      expect(onStateChange).toHaveBeenCalledWith({ loading: false, user: null })
    );
  });
});

describe('UserProfileContent — profil chargé', () => {
  const alice = {
    id: 'u-alice',
    username: 'alice',
    displayName: 'Alice Dupont',
    isOnline: null,
    createdAt: '2026-01-01T00:00:00.000Z',
  };

  beforeEach(() => {
    jest.clearAllMocks();
    mockGetUserProfile.mockResolvedValue({ success: true, data: alice });
    mockGetUserStats.mockResolvedValue({
      success: true,
      data: { messagesSent: 3, messagesReceived: 5, conversationsCount: 1, groupsCount: 0 },
    });
  });

  it('affiche le nom d’affichage résolu de l’utilisateur chargé', async () => {
    render(<UserProfileContent userId="alice" />);
    const name = await screen.findByTestId('user-profile-display-name');
    expect(name).toHaveTextContent('Alice Dupont');
  });

  it('remonte `{ loading:false, user }` via onStateChange — canal UNIQUE pour le titre de l’appelant', async () => {
    const onStateChange = jest.fn();
    render(<UserProfileContent userId="alice" onStateChange={onStateChange} />);
    await waitFor(() =>
      expect(onStateChange).toHaveBeenCalledWith({ loading: false, user: alice })
    );
  });

  it('layout="modal" empile une seule colonne (jamais la grille `lg:grid-cols-3` de la page)', async () => {
    render(<UserProfileContent userId="alice" layout="modal" />);
    const loaded = await screen.findByTestId('user-profile-content-loaded');
    expect(loaded.className).not.toContain('lg:grid-cols-3');
    expect(loaded.className).toContain('flex-col');
  });

  it('layout="page" (par défaut) garde la grille historique deux colonnes ≥ lg', async () => {
    render(<UserProfileContent userId="alice" />);
    const loaded = await screen.findByTestId('user-profile-content-loaded');
    expect(loaded.className).toContain('lg:grid-cols-3');
  });
});

/**
 * Chantier « Confidentialité de la présence » (2026-08-26), F12 — miniature
 * hors store du défaut F8 : un `user:status` MASQUÉ arrive `isOnline:false`,
 * `lastActiveAt:null`. La règle 1/3/5 dérive `away`/`idle` du seul horodatage,
 * MÊME quand `isOnline` est faux : garder l'ancien instant laissait une
 * pastille orange/grise (et un « Vu il y a N min ») jusqu'à 5 min APRÈS le
 * masquage. La valeur REÇUE gouverne — `null` efface ; et le client ne
 * fabrique jamais un horodatage que le serveur n'a pas servi.
 */
describe('UserProfileContent — `user:status` : la valeur reçue gouverne (F12)', () => {
  const twoMinutesAgo = () => new Date(Date.now() - 2 * 60_000).toISOString();

  const loadAlice = async (profile: Record<string, unknown>) => {
    const onStateChange = jest.fn();
    mockGetUserProfile.mockResolvedValue({ success: true, data: profile });
    mockGetUserStats.mockResolvedValue({ success: true, data: null });
    render(<UserProfileContent userId="u-alice" onStateChange={onStateChange} />);
    await screen.findByTestId('user-profile-content-loaded');
    return onStateChange;
  };

  const lastReportedUser = (onStateChange: jest.Mock) =>
    onStateChange.mock.calls[onStateChange.mock.calls.length - 1][0].user;

  beforeEach(() => {
    jest.clearAllMocks();
    delete mockSocketHandlers.onUserStatus;
  });

  it('statut masqué (`false`, `null`) après un statut en ligne daté ⇒ `lastActiveAt` effacé, aucune pastille', async () => {
    const onStateChange = await loadAlice({
      id: 'u-alice',
      username: 'alice',
      displayName: 'Alice Dupont',
      isOnline: true,
      lastActiveAt: twoMinutesAgo(),
    });
    expect(screen.getByTestId('online-indicator')).toBeInTheDocument();

    act(() => {
      mockSocketHandlers.onUserStatus?.('u-alice', 'alice', false, null);
    });

    const user = lastReportedUser(onStateChange);
    expect(user.isOnline).toBe(false);
    expect(user.lastActiveAt).toBeUndefined();
    expect(screen.queryByTestId('online-indicator')).toBeNull();
    expect(screen.queryByText('status.lastSeenMinutes')).toBeNull();
    expect(screen.queryByText('status.online')).toBeNull();
  });

  it('statut en ligne SANS horodatage ⇒ pastille verte, mais aucun horodatage inventé', async () => {
    const onStateChange = await loadAlice({
      id: 'u-alice',
      username: 'alice',
      displayName: 'Alice Dupont',
      isOnline: null,
    });
    expect(screen.queryByTestId('online-indicator')).toBeNull();

    act(() => {
      mockSocketHandlers.onUserStatus?.('u-alice', 'alice', true, null);
    });

    const user = lastReportedUser(onStateChange);
    expect(user.isOnline).toBe(true);
    expect(user.lastActiveAt).toBeUndefined();
    expect(screen.getByTestId('online-indicator')).toBeInTheDocument();
  });

  it('statut daté ⇒ l’horodatage SERVI est posé tel quel (ni conservé, ni remplacé)', async () => {
    const onStateChange = await loadAlice({
      id: 'u-alice',
      username: 'alice',
      displayName: 'Alice Dupont',
      isOnline: false,
      lastActiveAt: '2026-01-01T00:00:00.000Z',
    });
    const served = new Date(Date.now() - 30_000);

    act(() => {
      mockSocketHandlers.onUserStatus?.('u-alice', 'alice', true, served);
    });

    const user = lastReportedUser(onStateChange);
    expect(user.isOnline).toBe(true);
    expect(user.lastActiveAt).toBe(served);
    expect(screen.getByTestId('online-indicator')).toBeInTheDocument();
  });
});
