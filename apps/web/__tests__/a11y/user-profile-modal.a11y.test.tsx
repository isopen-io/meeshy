/**
 * Audit axe-core — `UserProfileModal` (directive produit du 2026-08-17,
 * « le profil s'ouvre en modale »). Patron des quatre autres suites de ce
 * dossier (`lentille-list`, `focal-thread`, `reading-mode-menu`,
 * `river-thread`) : le VRAI composant audité (`UserProfileModal`,
 * `UserProfileContent` NON mockés), mocks aux frontières
 * services/stores/socket — même recette que `UserProfileModal.test.tsx`.
 */
import { render, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { axe, toHaveNoViolations } from 'jest-axe';

expect.extend(toHaveNoViolations);

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

jest.mock('@/stores', () => ({
  useUser: () => ({ id: 'me', username: 'me', displayName: 'Moi' }),
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
  ConversationDropdown: () => <button type="button">stub</button>,
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

import { UserProfileModal } from '@/components/profile/UserProfileModal';

describe('Audit axe — UserProfileModal (ouverte)', () => {
  it('aucune violation, profil chargé (avatar, nom, stats, actions)', async () => {
    mockGetUserProfile.mockResolvedValue({
      success: true,
      data: {
        id: 'u-alice',
        username: 'alice',
        displayName: 'Alice Dupont',
        isOnline: null,
        createdAt: '2026-01-01T00:00:00.000Z',
      },
    });
    mockGetUserStats.mockResolvedValue({
      success: true,
      data: { messagesSent: 3, messagesReceived: 5, conversationsCount: 1, groupsCount: 0 },
    });

    const { container, findByTestId } = render(
      <UserProfileModal open onOpenChange={() => {}} userId="alice" />
    );
    await findByTestId('user-profile-content-loaded');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('aucune violation, squelette de chargement', async () => {
    mockGetUserProfile.mockReturnValue(new Promise(() => {}));
    mockGetUserStats.mockReturnValue(new Promise(() => {}));

    const { container, findByTestId } = render(
      <UserProfileModal open onOpenChange={() => {}} userId="alice" />
    );
    await findByTestId('user-profile-content-loading');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });

  it('aucune violation, utilisateur introuvable', async () => {
    mockGetUserProfile.mockResolvedValue({ success: true, data: null });
    mockGetUserStats.mockResolvedValue({ success: true, data: null });

    const { container, findByTestId } = render(
      <UserProfileModal open onOpenChange={() => {}} userId="ghost" />
    );
    await findByTestId('user-profile-content-not-found');

    const results = await axe(container);
    expect(results).toHaveNoViolations();
  });
});
