import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import type { SharedLocation } from '@/lib/api/shared-locations';
import { appQueryClient } from '@/lib/api/query-client';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { loadInterfaceCatalog } from '@/lib/i18n-catalog';
import { createSharedLocationSharingCenter, type SharedLocationSharingCenter } from '@/lib/shared-locations/shared-location-sharing';
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

type CircleVerdict = 'open' | 'locked' | 'unserved';

/** Le rattrapage sert ce que le serveur a : un rattrapage vide effacerait, à juste titre, ce que le magasin tenait déjà. La fiche par cercle sert le verdict de la paire. */
const depsServing = (items: readonly SharedLocation[], verdict: CircleVerdict = 'unserved') => {
  const circle =
    verdict === 'unserved'
      ? undefined
      : { isSelf: false, level: 'FRIEND', sharesCommunity: false, capabilities: { locationTemporary: { state: verdict, circle: 'FRIEND', consentRequired: false } } };
  const answer = (request: HttpRequest) =>
    request.path.includes('expand=circle') ? { ok: true, data: { id: 'u-leo', username: 'leo', ...(circle === undefined ? {} : { circle }) } } : { ok: true, data: { items } };
  const transport = (async (request: HttpRequest) => answer(request)) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest) => answer(request)) as HttpTransport['request'];
  return { source: 'gateway' as const, transport };
};

const VIEWER = 'c'.repeat(24);

/** Mon partage, sans rien de partagé : la ligne « Partager la mienne » ne paraît que si l'hôte l'OFFRE. */
const idleCenter = (): SharedLocationSharingCenter => {
  const memory = new Map<string, string>();
  return createSharedLocationSharingCenter({
    emitter: {
      start: async () => ({ kind: 'started', expiresAt: Date.now() + 3_600_000 }),
      update: async () => ({ kind: 'started', expiresAt: Date.now() + 3_600_000 }),
      stop: async () => true,
    },
    fixes: { isGranted: async () => true, currentFix: async () => ({ kind: 'fix', fix: { latitude: 48.85, longitude: 2.35 } }), follow: () => () => undefined },
    storage: { getItem: (k) => memory.get(k) ?? null, setItem: (k, v) => void memory.set(k, v), removeItem: (k) => void memory.delete(k) },
    storageKey: 'roster',
    schedule: () => () => undefined,
    owner: VIEWER,
    currentAccount: () => VIEWER,
  });
};

const named = () =>
  appQueryClient.setQueryData(['conversations'], {
    pages: [{ conversations: [{ participants: [{ user: { id: 'u-leo', username: 'leo', displayName: 'Léo Marchetti' } }, { user: { id: 'u-ana', username: 'ana', displayName: 'Ana Neves' } }] }] }],
  });

const open = async (props: { readonly focusUserId?: string; readonly locations: readonly SharedLocation[]; readonly verdict?: CircleVerdict; readonly sharing?: SharedLocationSharingCenter }) => {
  named();
  const store = createSharedLocationsStore();
  props.locations.forEach((location) => store.getState().receive(location));
  return mount(
    <SharedLocationsMap
      language="fr"
      store={store}
      deps={depsServing(props.locations, props.verdict)}
      watch={() => () => undefined}
      viewerId={VIEWER}
      sharing={props.sharing ?? null}
      {...(props.focusUserId === undefined ? {} : { focusUserId: props.focusUserId })}
    />,
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
    act(() => node.querySelector<HTMLButtonElement>('[data-shared-location-card="u-leo"] button[aria-label="Fermer"]')?.click());
    await settle();
    expect(node.querySelector('[data-shared-location-card="u-leo"]')).toBeNull();
    expect(node.querySelector('[data-shared-location-pin="u-leo"]')).not.toBeNull();
  });

  test('la feuille ouverte laisse la carte manipulable : aucune modale ne rend la carte et les autres épingles inertes', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served(), served({ userId: 'u-ana', latitude: 38.72, longitude: -9.14 })] });
    await settle();
    expect(node.querySelector('[data-shared-location-card="u-leo"]')).not.toBeNull();
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(node.querySelector('[role="application"]')?.closest('[inert]')).toBeNull();
  });

  test('Échap ferme la feuille de la personne, la carte reste', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served()] });
    await settle();
    act(() => node.querySelector('[data-shared-location-card="u-leo"]')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })));
    await settle();
    expect(node.querySelector('[data-shared-location-card]')).toBeNull();
    expect(node.querySelector('[data-shared-location-pin="u-leo"]')).not.toBeNull();
  });

  test('appuyer sur une épingle ne capture pas le pointeur de la carte : le toucher reste à l’épingle', async () => {
    const node = await open({ locations: [served()] });
    await settle();
    const application = node.querySelector<HTMLElement>('[role="application"]');
    const captured: number[] = [];
    if (application !== null) application.setPointerCapture = (id: number) => void captured.push(id);
    act(() => node.querySelector('[data-shared-location-pin="u-leo"] button')?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 7 })));
    expect(captured).toEqual([]);
    act(() => application?.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 8 })));
    expect(captured).toEqual([8]);
  });
});

describe('« Partager la mienne » sur la carte suit le cercle servi', () => {
  test('le cercle de la paire ferme le partage de position : la ligne n’est pas offerte', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served()], verdict: 'locked', sharing: idleCenter() });
    await settle();
    await settle();
    expect(node.querySelector('[data-shared-location-card="u-leo"]')).not.toBeNull();
    expect(node.querySelector('[data-share-location]')).toBeNull();
  });

  test('sans verdict servi (passerelle plus ancienne), rien n’est offert : fail-closed', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served()], verdict: 'unserved', sharing: idleCenter() });
    await settle();
    await settle();
    expect(node.querySelector('[data-share-location]')).toBeNull();
  });

  test('le cercle l’ouvre : « Partager ma position » est offert dans la feuille', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served()], verdict: 'open', sharing: idleCenter() });
    await settle();
    await settle();
    expect(node.querySelector('[data-shared-location-card="u-leo"] [data-share-location]')).not.toBeNull();
  });
});
