import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { act } from 'react';

import type { HttpRequest, HttpTransport } from '@/lib/api/http';
import type { SharedLocation } from '@/lib/api/shared-locations';
import { appQueryClient } from '@/lib/api/query-client';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createSharedLocationsStore } from '@/lib/shared-locations/shared-locations-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ProfileSeeOnMapRow } from './profile-see-on-map';

/**
 * **LA FICHE SAIT SEULE CE QUE LA PERSONNE PARTAGE** (revue #18881) — le magasin des positions n'était
 * nourri que par l'écran de la carte : ouvrir la fiche sans être passé par la carte ne montrait jamais
 * « Voir sur la carte », et un partage arrêté ou échu pendant que la carte était fermée y restait offert.
 * La rangée rattrape donc les positions servies, écoute le direct et retire ce qui arrive à son terme.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, settle } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadCirclesCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => {
  unmountAll();
  appQueryClient.clear();
});

const served = (overrides: Partial<SharedLocation> = {}): SharedLocation => ({
  userId: 'u-leo',
  latitude: 38.711,
  longitude: -9.131,
  precision: 'neighborhood',
  radiusMeters: 800,
  updatedAt: new Date(Date.now() - 20_000).toISOString(),
  expiresAt: new Date(Date.now() + 42 * 60_000).toISOString(),
  ...overrides,
});

const depsServing = (items: readonly SharedLocation[]) => {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: true, data: { items } })) as unknown as HttpTransport;
  transport.request = (async (request: HttpRequest) => {
    requests.push(request);
    return { ok: true, data: { items } };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
};

const row = (props: { readonly items: readonly SharedLocation[]; readonly store?: ReturnType<typeof createSharedLocationsStore> }) => {
  const store = props.store ?? createSharedLocationsStore();
  const { deps } = depsServing(props.items);
  return mount(<ProfileSeeOnMapRow language="fr" personId="u-leo" name="Léo Marchetti" avatar={null} accent="#6366F1" store={store} deps={deps} watch={() => () => undefined} />);
};

describe('« Voir sur la carte » ne dépend pas d’un passage par la carte', () => {
  test('la fiche ouverte à froid rattrape le partage servi et montre la rangée', async () => {
    const node = await row({ items: [served()] });
    await settle();
    await settle();
    expect(node.querySelector('[data-see-on-map="u-leo"] [data-profile-where-hero]')).not.toBeNull();
  });

  test('un partage arrêté pendant que la carte était fermée n’est plus offert', async () => {
    const store = createSharedLocationsStore();
    store.getState().receive(served());
    const node = await row({ items: [], store });
    await settle();
    await settle();
    expect(node.querySelector('[data-see-on-map]')).toBeNull();
  });

  test('le partage qui arrive à son terme retire la rangée, sans attendre un autre rendu', async () => {
    const soon = served({ expiresAt: new Date(Date.now() + 1_500).toISOString() });
    const node = await row({ items: [soon] });
    await settle();
    await settle();
    expect(node.querySelector('[data-see-on-map]')).not.toBeNull();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 1_700));
    });
    expect(node.querySelector('[data-see-on-map]')).toBeNull();
  });
});

/**
 * **LE BLOC HÉROS DE CARTE** (#20242, iso `ProfileWhereHero.swift`) — dès qu'une position m'est SERVIE : la carte pleine
 * largeur centrée sur la DERNIÈRE position connue, le nom et « Dernière position · <heure> » sur un voile en bas ; un
 * toucher ouvre la carte. Pas de position servie : rien, jamais une carte vide.
 */
describe('le bloc héros de la dernière position connue', () => {
  test('une carte pleine largeur, centrée sur la position servie, qui dit le nom et l’heure de la position', async () => {
    const node = await row({ items: [served({ updatedAt: new Date(Date.now() - 7 * 60_000 - 5_000).toISOString() })] });
    await settle();
    await settle();
    const hero = node.querySelector<HTMLButtonElement>('[data-profile-where-hero]');
    expect(hero?.tagName).toBe('BUTTON');
    expect(hero?.style.height).toBe('200px');
    expect(hero?.querySelectorAll('img[src^="https://tile.openstreetmap.org/"]').length).toBeGreaterThan(0);
    expect(hero?.textContent).toContain('Léo Marchetti');
    expect(hero?.textContent).toContain('Dernière position · il y a 7 min');
    expect(hero?.textContent).toContain('À un quartier près');
    expect(hero?.getAttribute('aria-label')).toBe('Voir Léo Marchetti sur la carte, Dernière position · il y a 7 min');
  });

  test('une position toute fraîche : « à l’instant »', async () => {
    const node = await row({ items: [served()] });
    await settle();
    await settle();
    expect(node.querySelector('[data-profile-where-hero]')?.textContent).toContain('Dernière position · à l’instant');
  });

  test('une position arrivée en direct APRÈS l’ouverture de la fiche fait paraître le bloc', async () => {
    const store = createSharedLocationsStore();
    const node = await row({ items: [], store });
    await settle();
    await settle();
    expect(node.querySelector('[data-profile-where-hero]')).toBeNull();
    await act(async () => store.getState().receive(served()));
    expect(node.querySelector('[data-profile-where-hero]')).not.toBeNull();
  });
});

