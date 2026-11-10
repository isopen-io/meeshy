import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { appQueryClient } from '@/lib/api/query-client';
import { bringAvailabilityQueryKey, type BringAvailabilityView } from '@/lib/bring/bring-api';
import { createBringStore } from '@/lib/bring/bring-live';
import { loadCirclesCatalog } from '@/lib/i18n-circles-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ThreadHeaderBring } from './thread-header-bring';

/**
 * LE BRING DANS L'EN-TÊTE D'UN DIRECT (#17442) — on le trouve depuis la
 * conversation : un toucher, la MÊME confirmation que la fiche, et ça sonne.
 * Tant que ça sonne, le même bouton annule.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll, click, settle } = createActMounter();

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

const PEER = 'u-ada';
const BUTTON = '[data-testid="conversation-header-bring"]';
const CONFIRM = '[data-confirm-dialog="bring-send"] [data-confirm="confirm"]';

const availability = (overrides: Partial<BringAvailabilityView> = {}): BringAvailabilityView => ({
  available: true,
  perDay: 1,
  remainingToday: 1,
  resetsAt: '2026-11-11T00:00:00.000Z',
  ...overrides,
});

const sent = { bringId: 'b9', toUserId: PEER, sentAt: '2026-11-10T10:00:00.000Z', expiresAt: new Date(Date.now() + 120_000).toISOString(), perDay: 1, remainingToday: 0 };

function scripted(responses: Readonly<Record<string, ApiResult<unknown>>>) {
  const requests: HttpRequest[] = [];
  const transport = (async () => ({ ok: true, data: null })) as unknown as HttpTransport;
  transport.request = (async (req: HttpRequest) => {
    requests.push(req);
    return responses[`${req.method} ${req.path}`] ?? { ok: false, status: 500, error: 'x' };
  }) as HttpTransport['request'];
  return { deps: { source: 'gateway' as const, transport }, requests };
}

const slot = (props: { readonly deps: ReturnType<typeof scripted>['deps']; readonly store?: ReturnType<typeof createBringStore> }) => (
  <ThreadHeaderBring language="fr" peerId={PEER} peerName="Ada" store={props.store ?? createBringStore()} deps={props.deps} />
);

describe('le Bring dans l’en-tête', () => {
  test('ABSENT tant que la passerelle ne l’ouvre pas', async () => {
    const { deps, requests } = scripted({ 'GET /api/v1/bring/u-ada': { ok: true, data: { userId: PEER, ...availability({ available: false }) } } });
    const node = await mount(slot({ deps }));
    await settle();
    await settle();
    expect(requests.map((req) => `${req.method} ${req.path}`)).toContain('GET /api/v1/bring/u-ada');
    expect(node.querySelector(BUTTON)).toBeNull();
  });

  test('ouvert : un bouton de 44 px qui se nomme « Faire sonner le téléphone de Ada »', async () => {
    const { deps } = scripted({ 'GET /api/v1/bring/u-ada': { ok: true, data: { userId: PEER, ...availability() } } });
    const node = await mount(slot({ deps }));
    await settle();
    await settle();
    const button = node.querySelector<HTMLButtonElement>(BUTTON);
    expect(button).not.toBeNull();
    expect(button?.getAttribute('aria-label')).toBe('Faire sonner le téléphone de Ada');
    expect(button?.className).toContain('size-11');
  });

  test('deux gestes : toucher ouvre la confirmation de la fiche, « Faire sonner » envoie', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey(PEER), availability());
    const store = createBringStore();
    const { deps, requests } = scripted({ 'POST /api/v1/bring/u-ada': { ok: true, data: sent } });
    const node = await mount(slot({ deps, store }));
    await click(node.querySelector<HTMLButtonElement>(BUTTON));
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(0);
    expect(document.querySelector('[data-confirm-dialog="bring-send"]')?.textContent).toContain('Faire sonner le téléphone de Ada ?');
    await click(document.querySelector<HTMLButtonElement>(CONFIRM));
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(1);
    expect(store.getState().outgoing[PEER]?.bringId).toBe('b9');
    expect(node.querySelector(BUTTON)?.getAttribute('aria-label')).toBe('Annuler le Bring · Ça sonne chez Ada');
  });

  test('tant que ça sonne, toucher annule chez le destinataire, sans confirmation', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey(PEER), availability({ remainingToday: 0 }));
    const store = createBringStore();
    store.getState().sent(sent);
    const { deps, requests } = scripted({ 'DELETE /api/v1/bring/b9': { ok: true, data: { bringId: 'b9', stopped: true } } });
    const node = await mount(slot({ deps, store }));
    await click(node.querySelector<HTMLButtonElement>(BUTTON));
    expect(store.getState().outgoing).toEqual({});
    expect(requests.map((req) => `${req.method} ${req.path}`)).toContain('DELETE /api/v1/bring/b9');
    expect(document.querySelector('[data-confirm-dialog="bring-send"]')).toBeNull();
  });

  test('quota épuisé : le bouton reste, dit le quota, et ne propose pas d’envoyer', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey(PEER), availability({ remainingToday: 0 }));
    const { deps, requests } = scripted({});
    const node = await mount(slot({ deps }));
    const button = node.querySelector<HTMLButtonElement>(BUTTON);
    expect(button?.getAttribute('aria-label')).toBe('Plus de Bring aujourd’hui vers Ada');
    await click(button);
    expect(document.querySelector('[data-confirm-dialog="bring-send"]')).toBeNull();
    expect(document.querySelector('[data-thread-bring-notice]')?.textContent).toBe('Plus de Bring aujourd’hui vers Ada');
    expect(requests.filter((req) => req.method === 'POST')).toHaveLength(0);
  });

  test('un refus « bloqué » retire le bouton, sans rien dire', async () => {
    appQueryClient.setQueryData(bringAvailabilityQueryKey(PEER), availability());
    const { deps } = scripted({ 'POST /api/v1/bring/u-ada': { ok: false, status: 403, error: 'x', code: 'BRING_BLOCKED' } });
    const node = await mount(slot({ deps }));
    await click(node.querySelector<HTMLButtonElement>(BUTTON));
    await click(document.querySelector<HTMLButtonElement>(CONFIRM));
    expect(node.querySelector(BUTTON)).toBeNull();
    expect(document.querySelector('[data-thread-bring-notice]')).toBeNull();
  });
});
