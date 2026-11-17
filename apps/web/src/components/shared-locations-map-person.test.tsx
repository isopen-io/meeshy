import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import type { SharedLocation } from '@/lib/api/shared-locations';
import { appQueryClient } from '@/lib/api/query-client';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createSharedLocationsStore } from '@/lib/shared-locations/shared-locations-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { SharedLocationsMap } from './shared-locations-map';

/**
 * **LA CARTE POSÉE SUR UNE PERSONNE** (#18881) — depuis « Voir sur la carte » de la fiche, la carte s'ouvre
 * centrée sur l'épingle de la personne, choisie, et sa feuille basse dit : la précision servie, le temps qui
 * reste en jauge, l'itinéraire. Une épingle qu'on touche devient la personne choisie. Une personne qui ne
 * partage plus le dit au lieu de laisser une feuille vide.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
  await loadInterfaceCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

const inFuture = (ms: number) => new Date(Date.now() + ms).toISOString();

const served = (overrides: Partial<SharedLocation> = {}): SharedLocation => ({
  userId: 'u-leo',
  latitude: 38.711,
  longitude: -9.131,
  precision: 'neighborhood',
  radiusMeters: 800,
  updatedAt: new Date(Date.now() - 20_000).toISOString(),
  expiresAt: inFuture(42 * 60_000),
  ...overrides,
});

/** Le rattrapage sert ce que le serveur a : un rattrapage vide effacerait, à juste titre, ce que le magasin tenait déjà. */
const depsServing = (items: readonly SharedLocation[]) => {
  const transport = (async () => ({ ok: true, data: { items } })) as unknown as HttpTransport;
  transport.request = (async (_: HttpRequest) => ({ ok: true, data: { items } })) as HttpTransport['request'];
  return { source: 'gateway' as const, transport };
};

const named = () =>
  appQueryClient.setQueryData(['conversations'], {
    pages: [{ conversations: [{ participants: [{ user: { id: 'u-leo', username: 'leo', displayName: 'Léo Marchetti' } }, { user: { id: 'u-ana', username: 'ana', displayName: 'Ana Neves' } }] }] }],
  });

const open = async (props: { readonly focusUserId?: string; readonly locations: readonly SharedLocation[] }) => {
  named();
  const store = createSharedLocationsStore();
  props.locations.forEach((location) => store.getState().receive(location));
  return mount(
    <SharedLocationsMap language="fr" store={store} deps={depsServing(props.locations)} watch={() => () => undefined} {...(props.focusUserId === undefined ? {} : { focusUserId: props.focusUserId })} />,
  );
};

describe('la carte posée sur la personne de la fiche', () => {
  test('son épingle est choisie et sa feuille dit précision, temps restant et itinéraire', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served()] });
    await settle();
    expect(node.querySelector('[data-shared-location-pin="u-leo"] [aria-pressed="true"]')).not.toBeNull();
    const card = node.querySelector('[data-shared-location-card="u-leo"]');
    expect(card).not.toBeNull();
    expect(card?.textContent).toContain('Léo Marchetti');
    expect(card?.textContent).toContain('À un quartier près');
    expect(card?.textContent).toMatch(/Partage pour 1\s?h/);
    expect(card?.textContent).toMatch(/encore 4[12]\s?min/);
    expect(card?.querySelector('[role="progressbar"]')).not.toBeNull();
    const directions = card?.querySelector<HTMLAnchorElement>('a[data-shared-location-directions]');
    expect(directions?.getAttribute('href')).toBe('https://www.google.com/maps/dir/?api=1&destination=38.711%2C-9.131');
    expect(directions?.getAttribute('rel')).toContain('noopener');
  });

  test('toucher une autre épingle choisit cette personne', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served(), served({ userId: 'u-ana', latitude: 38.72, longitude: -9.14, precision: 'exact', radiusMeters: 0 })] });
    await settle();
    act(() => node.querySelector<HTMLButtonElement>('[data-shared-location-pin="u-ana"] button')?.click());
    await settle();
    expect(node.querySelector('[data-shared-location-card="u-ana"]')?.textContent).toContain('Position exacte');
    expect(node.querySelector('[data-shared-location-card="u-leo"]')).toBeNull();
  });

  test('sans personne choisie, aucune feuille : la carte de tous mes proches reste libre', async () => {
    const node = await open({ locations: [served()] });
    await settle();
    expect(node.querySelector('[data-shared-location-card]')).toBeNull();
    expect(node.querySelector('[data-shared-location-pin="u-leo"] button')).not.toBeNull();
  });

  test('une personne qui ne partage plus le dit, et la carte reste', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [] });
    await settle();
    expect(node.querySelector('[data-shared-location-ended="u-leo"]')?.textContent).toContain('Léo Marchetti ne partage plus sa position.');
    expect(node.querySelector('[role="application"]')).not.toBeNull();
  });

  test('fermer la feuille laisse l’épingle choisie et la carte libre', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served()] });
    await settle();
    act(() => node.querySelector<HTMLButtonElement>('[data-shared-location-card="u-leo"] [data-sheet-close], dialog button[aria-label="Fermer"]')?.click());
    await settle();
    expect(node.querySelector('[data-shared-location-card="u-leo"]')).toBeNull();
    expect(node.querySelector('[data-shared-location-pin="u-leo"]')).not.toBeNull();
  });
});
