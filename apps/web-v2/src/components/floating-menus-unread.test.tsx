import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { NOTIFICATIONS_QUERY_KEY, NOTIFICATION_COUNTS_QUERY_KEY, type NotificationCounts } from '@/lib/api/notifications';
import { resetFixtureNotificationsForTests } from '@/lib/api/fixtures-notifications';
import { resetFixtureFriendsForTests } from '@/lib/api/fixtures-friends';
import { performRespondToRequest } from '@/lib/api/friend-actions';
import {
  FRIENDS_QUERY_PREFIX,
  flattenFriendRequests,
  friendRequestsQueryKey,
  type FriendRequestRecord,
  type FriendRequestsData,
} from '@/lib/api/friend-requests';
import type { HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';

import { FloatingMenus } from './floating-menus';

/**
 * LE BOUTON FLOTTANT PORTE ENFIN LE VRAI COMPTE (#6219, #6288) — ce que la
 * capture ne prouve pas : que le nombre vient du PORT (ici les fixtures, trois
 * non-lues), qu'il suit le cache que les gestes et le socket écrivent, et que
 * le bouton l'ANNONCE — la pastille, elle, est décorative.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };

beforeAll(() => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let container: HTMLDivElement;
let root: Root;

afterEach(() => {
  act(() => {
    root.unmount();
  });
  container.remove();
  appQueryClient.removeQueries({ queryKey: NOTIFICATIONS_QUERY_KEY });
  appQueryClient.removeQueries({ queryKey: FRIENDS_QUERY_PREFIX });
  resetFixtureNotificationsForTests();
  resetFixtureFriendsForTests();
});

function monter(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<FloatingMenus routeKey="list" />);
  });
}

const pastille = () => container.querySelector('[data-unread]');
const pastilleDuDisque = () => container.querySelector('[data-badge-pose="corner"]');
const boutonMenu = () => container.querySelector('[data-floating-menu]') as HTMLButtonElement;
const barreau = (adresse: string) => container.querySelector(`[role="menuitem"][href="${adresse}"]`);
const barreauxBadges = () => [...container.querySelectorAll('[role="menuitem"] [data-unread]')];

function ouvrir(): void {
  act(() => {
    boutonMenu().click();
  });
}

function servir(unread: number): void {
  act(() => {
    appQueryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 12, unread, byType: {} });
  });
}

async function attendre(condition: () => boolean): Promise<void> {
  for (let i = 0; i < 100 && !condition(); i += 1) {
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 10));
    });
  }
}

describe('la pastille du bouton de droite', () => {
  test('trois non-lues servies : « 3 », et le bouton l’annonce', async () => {
    monter();
    await attendre(() => pastille() !== null);

    expect(pastille()?.getAttribute('data-unread')).toBe('3');
    expect(pastille()?.textContent).toBe('3');
    expect(boutonMenu().getAttribute('aria-label')).toBe('Menu, 3 notifications non lues');
  });

  test('le compte tombe à zéro dans le cache : la pastille disparaît et le nom redevient « Menu »', async () => {
    monter();
    await attendre(() => pastille() !== null);

    act(() => {
      appQueryClient.setQueryData<NotificationCounts>(NOTIFICATION_COUNTS_QUERY_KEY, { total: 12, unread: 0, byType: {} });
    });
    /* TanStack notifie ses observateurs par lot, hors du tour courant : le
       rendu suit l'écriture, il ne la précède jamais. */
    await attendre(() => pastille() === null);

    expect(pastille()).toBeNull();
    expect(boutonMenu().getAttribute('aria-label')).toBe('Menu');
  });

  test('ouvert, le bouton reste la porte du profil, compte ou non', async () => {
    monter();
    await attendre(() => pastille() !== null);

    act(() => {
      boutonMenu().click();
    });

    expect(boutonMenu().getAttribute('aria-label')).toBe('Profil');
  });
});

/**
 * **MENU OUVERT, LE COMPTE CHANGE DE PORTEUR** (#6219) — `RootView.swift:1666`
 * retire la pastille du disque (`!showMenu && unreadCount > 0`) et
 * `menuBadgeCount(.unreadNotifications)` la pose sur le barreau « Notifications ».
 * Laisser les deux peindrait deux fois le même nombre ; n'en garder aucune
 * ferait disparaître le compte au moment précis où l'on choisit où aller.
 */
describe('l’échelle ouverte porte le compte sur son barreau', () => {
  test('la pastille quitte le disque et le barreau « Notifications » la porte, et l’annonce', async () => {
    monter();
    await attendre(() => pastille() !== null);

    ouvrir();

    expect(pastilleDuDisque()).toBeNull();
    const cloche = barreau('/notifications');
    expect(cloche?.querySelector('[data-unread]')?.getAttribute('data-unread')).toBe('3');
    expect(cloche?.querySelector('[data-unread]')?.textContent).toBe('3');
    expect(cloche?.getAttribute('aria-label')).toBe('Notifications, 3 non lues');
  });

  test('seuls « Notifications » et « Découvrir » portent un nombre, chacun le SIEN — aucun autre barreau n’en invente', async () => {
    monter();
    await attendre(() => pastille() !== null);

    ouvrir();
    await attendre(() => barreauxBadges().length === 2);

    expect(barreauxBadges().map((badge) => badge.closest('[role="menuitem"]')?.getAttribute('href'))).toEqual(['/notifications', '/discover']);
    expect(barreau('/calls')?.getAttribute('aria-label')).toBe('Appels');
  });

  test('le compte baisse dans le cache : le barreau suit à l’instant, jusqu’à se taire à zéro', async () => {
    monter();
    await attendre(() => pastille() !== null);
    ouvrir();

    servir(1);
    await attendre(() => barreau('/notifications')?.querySelector('[data-unread]')?.getAttribute('data-unread') === '1');
    expect(barreau('/notifications')?.getAttribute('aria-label')).toBe('Notifications, 1 non lue');

    servir(0);
    await attendre(() => barreau('/notifications')?.querySelector('[data-unread]') === null);
    expect(barreau('/notifications')?.querySelector('[data-unread]')).toBeNull();
    expect(barreau('/notifications')?.getAttribute('aria-label')).toBe('Notifications');
  });

  test('refermée, la pastille revient sur le disque', async () => {
    monter();
    await attendre(() => pastille() !== null);
    ouvrir();
    expect(pastilleDuDisque()).toBeNull();

    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });

    expect(pastilleDuDisque()?.getAttribute('data-unread')).toBe('3');
  });
});

/**
 * **LE BARREAU « DÉCOUVRIR » PORTE LES DEMANDES REÇUES** (#6321) — miroir de
 * `RootMenuLadderEntry.discover.badge = .pendingFriendRequests`, résolu par
 * `RootView.menuBadgeCount` depuis `FriendshipCache.pendingReceivedCount`.
 *
 * Le nombre vient du panier `received` de `friend-requests.ts` — la MÊME
 * entrée que l'onglet « Demandes » et le profil (D-62). Le témoin qui compte
 * ne pose pas le cache à la main : il REFUSE une demande par le geste de
 * l'écran (`performRespondToRequest`), et c'est la pastille qui doit baisser
 * avant la réponse. Un barreau qui lirait une seconde requête resterait à 3.
 */
const pastilleDecouvrir = () => barreau('/discover')?.querySelector('[data-unread]') ?? null;

const gesteDeps = {
  source: 'fixtures' as const,
  transport: { request: async () => ({ ok: false, status: 0, error: 'jamais appelé' }) } as unknown as HttpTransport,
  queryClient: appQueryClient,
  isOnline: () => true,
  viewerId: () => 'u-viewer',
};

const recues = (): readonly FriendRequestRecord[] =>
  flattenFriendRequests(appQueryClient.getQueryData<FriendRequestsData>(friendRequestsQueryKey('received')));

describe('le barreau « Découvrir » porte le compte des demandes reçues (#6321)', () => {
  test('trois demandes reçues servies : « 3 » sur le barreau, qui l’annonce', async () => {
    monter();
    ouvrir();
    await attendre(() => pastilleDecouvrir() !== null);

    expect(pastilleDecouvrir()?.getAttribute('data-unread')).toBe('3');
    expect(pastilleDecouvrir()?.textContent).toBe('3');
    expect(pastilleDecouvrir()?.getAttribute('data-badge-pose')).toBe('rung');
    expect(barreau('/discover')?.getAttribute('aria-label')).toBe('Découvrir, 3 demandes reçues');
  });

  test('refuser une demande par le geste de l’écran : le barreau baisse AU GESTE, et se tait à zéro', async () => {
    monter();
    ouvrir();
    await attendre(() => pastilleDecouvrir() !== null);

    const [premiere] = recues();
    let issue: Promise<unknown> = Promise.resolve();
    act(() => {
      issue = performRespondToRequest({ request: premiere as FriendRequestRecord, action: 'reject', deps: gesteDeps });
    });
    await attendre(() => pastilleDecouvrir()?.getAttribute('data-unread') === '2');
    expect(pastilleDecouvrir()?.getAttribute('data-unread')).toBe('2');
    expect(barreau('/discover')?.getAttribute('aria-label')).toBe('Découvrir, 2 demandes reçues');
    await act(async () => {
      await issue;
    });

    for (const demande of recues()) {
      await act(async () => {
        await performRespondToRequest({ request: demande, action: 'accept', deps: gesteDeps });
      });
    }
    await attendre(() => pastilleDecouvrir() === null);
    expect(pastilleDecouvrir()).toBeNull();
    expect(barreau('/discover')?.getAttribute('aria-label')).toBe('Découvrir');
  });

  test('une page pleine et un curseur restant : « 99+ », jamais un nombre exact qu’on n’a pas lu', async () => {
    monter();
    ouvrir();
    await attendre(() => pastilleDecouvrir() !== null);

    const [modele] = recues();
    const cent = Array.from({ length: 100 }, (_, i) => ({ ...(modele as FriendRequestRecord), id: `f-${i}` }));
    act(() => {
      appQueryClient.setQueryData<FriendRequestsData>(friendRequestsQueryKey('received'), { pages: [{ requests: cent, nextCursor: 'suite' }], pageParams: [null] });
    });
    await attendre(() => pastilleDecouvrir()?.textContent === '99+');

    expect(pastilleDecouvrir()?.textContent).toBe('99+');
    expect(barreau('/discover')?.getAttribute('aria-label')).toBe('Découvrir, 99+ demandes reçues');
  });
});
