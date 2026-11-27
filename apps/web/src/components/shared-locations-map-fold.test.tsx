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
 * **LES FEUILLES DE LA CARTE SE RANGENT ET SE RAPPELLENT** (#19888, iso iOS #19885) — la liste des positions se
 * range pour libérer la carte et revient par le même bouton ; la fiche d'une personne fermée se rappelle par un
 * bouton qui la nomme, tant que la personne partage. Ranger ne retire aucune épingle.
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

const named = () =>
  appQueryClient.setQueryData(['conversations'], {
    pages: [{ conversations: [{ participants: [{ user: { id: 'u-leo', username: 'leo', displayName: 'Léo Marchetti' } }, { user: { id: 'u-ana', username: 'ana', displayName: 'Ana Neves' } }] }] }],
  });

const open = async (props: { readonly focusUserId?: string; readonly locations: readonly SharedLocation[]; readonly verdict?: CircleVerdict }) => {
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
      sharing={null}
      {...(props.focusUserId === undefined ? {} : { focusUserId: props.focusUserId })}
    />,
  );
};

const ana = () => served({ userId: 'u-ana', latitude: 38.72, longitude: -9.14, precision: 'exact', radiusMeters: 0 });
const fold = (node: HTMLElement) => node.querySelector<HTMLButtonElement>('button[data-shared-locations-fold]');
const click = (button: HTMLButtonElement | null | undefined) => act(() => button?.click());

describe('la liste des positions se range', () => {
  test('ouverte, son bouton dit « Ranger la liste » et commande la liste', async () => {
    const node = await open({ locations: [served(), ana()] });
    await settle();
    const button = fold(node);
    expect(button?.textContent).toBe('Ranger la liste');
    expect(button?.getAttribute('aria-expanded')).toBe('true');
    const list = node.querySelector('[data-shared-locations-list]');
    expect(list?.id).not.toBe('');
    expect(button?.getAttribute('aria-controls')).toBe(list?.id ?? null);
    expect(node.querySelectorAll('[data-shared-location-row]')).toHaveLength(2);
  });

  test('rangée, la liste part, les épingles restent, et le même bouton la rappelle', async () => {
    const node = await open({ locations: [served(), ana()] });
    await settle();
    click(fold(node));
    await settle();
    expect(node.querySelectorAll('[data-shared-location-row]')).toHaveLength(0);
    expect(node.querySelector('[data-shared-location-pin="u-leo"]')).not.toBeNull();
    expect(node.querySelector('[data-shared-location-pin="u-ana"]')).not.toBeNull();
    expect(fold(node)?.textContent).toBe('Voir qui est autour');
    expect(fold(node)?.getAttribute('aria-expanded')).toBe('false');
    click(fold(node));
    await settle();
    expect(node.querySelectorAll('[data-shared-location-row]')).toHaveLength(2);
    expect(fold(node)?.getAttribute('aria-expanded')).toBe('true');
  });

  test('sans personne, rien à ranger : aucun bouton', async () => {
    const node = await open({ locations: [] });
    await settle();
    expect(fold(node)).toBeNull();
  });
});

describe('la fiche fermée se rappelle', () => {
  const recall = (node: HTMLElement) => node.querySelector<HTMLButtonElement>('button[data-shared-location-recall]');
  const close = (node: HTMLElement) => click(node.querySelector<HTMLButtonElement>('[data-shared-location-card="u-leo"] button[aria-label="Fermer"]'));

  test('fiche ouverte : aucun rappel', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served()] });
    await settle();
    expect(recall(node)).toBeNull();
  });

  test('fermée, un bouton qui nomme la personne la rouvre', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [served()] });
    await settle();
    close(node);
    await settle();
    expect(node.querySelector('[data-shared-location-card]')).toBeNull();
    expect(recall(node)?.textContent).toBe('Afficher Léo Marchetti');
    click(recall(node));
    await settle();
    expect(node.querySelector('[data-shared-location-card="u-leo"]')).not.toBeNull();
    expect(recall(node)).toBeNull();
  });

  test('sans personne choisie, aucun rappel', async () => {
    const node = await open({ locations: [served()] });
    await settle();
    expect(recall(node)).toBeNull();
  });

  test('une personne qui ne partage plus ne se rappelle pas : rien ne promet une position absente', async () => {
    const node = await open({ focusUserId: 'u-leo', locations: [] });
    await settle();
    act(() => node.querySelector<HTMLButtonElement>('[data-shared-location-ended="u-leo"] button[aria-label="Fermer"]')?.click());
    await settle();
    expect(recall(node)).toBeNull();
  });
});
