import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { QueryClientProvider } from '@tanstack/react-query';
import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import { resetFixtureFriendsForTests } from '@/lib/api/fixtures-friends';
import { appQueryClient } from '@/lib/api/query-client';
import { sessionStore } from '@/lib/api/session';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { sharedLocationsStore } from '@/lib/shared-locations/shared-locations-live';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { UserProfileView } from './user-profile';

/**
 * **« VOIR SUR LA CARTE », ACTION DE LA FACE ACTIONS** (#18881) — la rangée n'existe que si la personne
 * me partage SA position (rien n'est fabriqué hors de la charge servie), elle dit la précision et le temps
 * qui reste, et son geste ouvre la carte posée sur elle (`/positions?person=<id>`).
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const VIEWER = 'u-lecteur';

beforeAll(async () => {
  ensureHappyDomRegistered({ url: 'http://localhost/u/kwame-mensah' });
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

let mounted: { readonly container: HTMLDivElement; readonly root: Root } | null = null;

afterEach(() => {
  act(() => mounted?.root.unmount());
  mounted?.container.remove();
  mounted = null;
  appQueryClient.clear();
  resetFixtureFriendsForTests();
  sharedLocationsStore.getState().clear();
  sessionStore.getState().clearSession();
});

const settle = () =>
  act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });

const sharing = (userId: string, expiresInMs = 42 * 60_000) => ({
  userId,
  latitude: 38.711,
  longitude: -9.131,
  precision: 'neighborhood' as const,
  radiusMeters: 800,
  updatedAt: new Date().toISOString(),
  expiresAt: new Date(Date.now() + expiresInMs).toISOString(),
});

/** Les positions arrivent APRÈS l'ouverture de session : le magasin appartient au compte ouvert et se vide à chaque changement d'identité. */
async function mountActions(received: readonly ReturnType<typeof sharing>[] = []): Promise<HTMLDivElement> {
  sessionStore.getState().establish({ user: { id: VIEWER, username: 'lecteur', displayName: 'Lecteur' }, token: 't', sessionToken: 's', expiresIn: 3600 });
  await settle();
  received.forEach((location) => sharedLocationsStore.getState().receive(location));
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  mounted = { container, root };
  await act(async () => {
    root.render(
      <QueryClientProvider client={appQueryClient}>
        <UserProfileView username="kwame-mensah" />
      </QueryClientProvider>,
    );
  });
  await settle();
  await settle();
  act(() => container.querySelector<HTMLButtonElement>('[data-profile-faces] [data-kit-chip="actions"]')?.click());
  await settle();
  return container;
}

describe('« Voir sur la carte » suit ce que la personne partage', () => {
  test('personne ne partage : aucune rangée, aucun bouton qui mène à une carte vide', async () => {
    const el = await mountActions();
    expect(el.querySelector('[data-see-on-map]')).toBeNull();
  });

  test('elle partage : la rangée dit la précision et le temps qui reste', async () => {
    const el = await mountActions([sharing('u-rich-kwame')]);
    const row = el.querySelector('[data-see-on-map]');
    expect(row).not.toBeNull();
    expect(row?.textContent).toContain('Voir sur la carte');
    expect(row?.textContent).toContain('À un quartier près');
    expect(row?.textContent).toMatch(/4[12]\s?min/);
  });

  test('le geste ouvre la carte posée sur la personne', async () => {
    const el = await mountActions([sharing('u-rich-kwame')]);
    act(() => el.querySelector<HTMLButtonElement>('[data-see-on-map] button')?.click());
    expect(window.location.pathname).toBe('/positions');
    expect(new URLSearchParams(window.location.search).get('person')).toBe('u-rich-kwame');
  });

  test('le partage d’une AUTRE personne ne se montre pas ici', async () => {
    const el = await mountActions([sharing('u-ada')]);
    expect(el.querySelector('[data-see-on-map]')).toBeNull();
  });
});
