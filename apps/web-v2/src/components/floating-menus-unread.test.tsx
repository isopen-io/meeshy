import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';
import { NOTIFICATIONS_QUERY_KEY, NOTIFICATION_COUNTS_QUERY_KEY, type NotificationCounts } from '@/lib/api/notifications';
import { resetFixtureNotificationsForTests } from '@/lib/api/fixtures-notifications';
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
  resetFixtureNotificationsForTests();
});

function monter(): void {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  act(() => {
    root.render(<FloatingMenus />);
  });
}

const pastille = () => container.querySelector('[data-unread]');
const boutonMenu = () => container.querySelector('[data-floating-menu]') as HTMLButtonElement;

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
