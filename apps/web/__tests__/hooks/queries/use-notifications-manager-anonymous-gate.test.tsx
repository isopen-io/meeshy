/**
 * La boîte de notifications appartient à un COMPTE, jamais à une session invitée.
 *
 * Le manager est monté au layout racine, et son garde s'écrit `enabled:
 * isAuthenticated`. Or `isAuthenticated` ne dit pas « a un compte », il dit « a
 * une identité » : `joinAnonymously` (`hooks/use-auth.ts`) appelle
 * `setUser(participant)`, et `setUser` pose `isAuthenticated: !!user`. Un
 * visiteur qui vient d'entrer par lien franchit donc le garde.
 *
 * Ce qu'il déclenche n'a aucune issue : le gateway réserve `/notifications` aux
 * porteurs de compte — mesuré en production le 2026-08-18, `X-Session-Token`
 * répond 403, aucun en-tête répond 401. Ni l'un ni l'autre ne devient vrai en
 * réessayant. Ce n'est pas un défaut de transport à réparer plus bas : c'est un
 * appel qui n'aurait jamais dû partir.
 *
 * @jest-environment jsdom
 */

import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useNotificationsManagerRQ } from '@/hooks/queries/use-notifications-manager-rq';

const mockFetchNotifications = jest.fn();

jest.mock('@/services/notification.service', () => ({
  NotificationService: {
    fetchNotifications: (...args: unknown[]) => mockFetchNotifications(...args),
    getUnreadCount: jest.fn(),
    getCounts: jest.fn(),
    markAsRead: jest.fn(),
    markAllAsRead: jest.fn(),
    deleteNotification: jest.fn(),
    deleteAllRead: jest.fn(),
    markConversationRead: jest.fn(),
    markPostRead: jest.fn(),
  },
}));

jest.mock('@/services/notification-socketio.singleton', () => ({
  notificationSocketIO: {
    connect: jest.fn(),
    onNotification: jest.fn(() => () => {}),
    onNotificationRead: jest.fn(() => () => {}),
    onNotificationDeleted: jest.fn(() => () => {}),
    onNotificationReadBulk: jest.fn(() => () => {}),
    onNotificationDeletedBulk: jest.fn(() => () => {}),
    onCounts: jest.fn(() => () => {}),
    onSyncDesync: jest.fn(() => () => {}),
  },
}));

jest.mock('@/hooks/useI18n', () => ({ useI18n: () => ({ t: (k: string) => k }) }));
jest.mock('next/navigation', () => ({ useRouter: () => ({ push: jest.fn() }) }));
// `jest.requireActual` d'abord, surcharge ENSUITE : un double PARTIEL perd en
// silence tout ce que le module GAGNE, et ne se signale qu'au moment où le
// module grandit. Ce doublon-ci listait quatre fonctions à la main ; le jour où
// la bannière a lu `getActorDisplayName` et `getNotificationIcon`, elles sont
// sorties `undefined` et quatre témoins sont tombés sur un `TypeError` qui ne
// disait rien du comportement testé. Seules les deux valeurs que ce fichier
// veut RENDRE CONSTANTES restent surchargées.
jest.mock('@/utils/notification-helpers', () => ({
  ...jest.requireActual('@/utils/notification-helpers'),
  getNotificationLink: () => '/link',
  getNotificationBorderColor: () => 'border',
}));
jest.mock('sonner', () => ({ toast: { custom: jest.fn(), dismiss: jest.fn() } }));
jest.mock('@/stores/notification-store', () => {
  const useNotificationStore = () => ({});
  useNotificationStore.getState = () => ({ activeConversationId: null });
  return { useNotificationStore };
});

/**
 * Exactement l'état que produit `joinAnonymously` : une identité, pas un
 * compte. C'est le point du test — le store dit « oui » et il a raison ; c'est
 * la question posée qui était la mauvaise.
 */
jest.mock('@/stores/auth-store', () => {
  const useAuthStore = () => ({ isAuthenticated: true });
  useAuthStore.getState = () => ({ authToken: null });
  return { useAuthStore };
});

const KEYS = { auth: 'meeshy_auth_token', anonymous: 'meeshy_anonymous_session' };

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false, gcTime: 0, staleTime: 0 } },
  });
  return function Wrapper({ children }: { children: React.ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

beforeEach(() => {
  localStorage.clear();
  mockFetchNotifications.mockReset();
  mockFetchNotifications.mockResolvedValue({
    data: { notifications: [], pagination: { limit: 20, offset: 0, total: 0, hasMore: false }, unreadCount: 0 },
  });
});

describe('un visiteur SANS COMPTE ne demande pas de notifications', () => {
  it('ne tire aucune requête quand seule une session anonyme existe', async () => {
    localStorage.setItem(
      KEYS.anonymous,
      JSON.stringify({ token: 'anon_x', participantId: 'p1', expiresAt: Date.now() + 3_600_000 })
    );

    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchNotifications).not.toHaveBeenCalled();
  });

  /**
   * Aucune identité du tout : même conclusion, et c'est le cas qui protège les
   * pages publiques où le manager est monté malgré tout.
   */
  it('ne tire rien non plus sans aucune session', async () => {
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(mockFetchNotifications).not.toHaveBeenCalled();
  });

  /** Le compteur reste lisible : zéro, pas `undefined`. */
  it('rend un compteur à zéro plutôt qu’un état indéterminé', () => {
    const { result } = renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });
    expect(result.current.unreadCount).toBe(0);
  });
});

describe('un titulaire de COMPTE demande bien ses notifications', () => {
  it('tire la première page quand un jeton de compte existe', async () => {
    localStorage.setItem(KEYS.auth, 'jwt.abc.def');

    renderHook(() => useNotificationsManagerRQ(), { wrapper: createWrapper() });

    await waitFor(() => expect(mockFetchNotifications).toHaveBeenCalled());
  });
});
