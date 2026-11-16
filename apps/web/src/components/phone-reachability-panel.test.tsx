import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { loadPhoneReachabilityCatalog } from '@/lib/i18n-phone-reachability-catalog';
import { receivePhoneReachabilityState } from '@/lib/phone-reachability/phone-reachability-live';
import type { SafeStorage } from '@/lib/storage';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationPhoneReachabilitySection, MePhoneReachabilityRow, ProfilePhoneReachabilityRow } from './phone-reachability-panel';

/**
 * LE TÉLÉPHONE INJOIGNABLE D'UN PROCHE DANS LA FICHE ET LE PROFIL (#18737) — le web reçoit et affiche : le détail
 * n'existe que pendant un état servi, « Prévenir {name} » est proposé à un Proche sans être coché, actif chez un
 * Sang, et chaque réglage bascule au geste puis revient si le serveur refuse.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadPhoneReachabilityCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const ADA = 'b'.repeat(24);
const ADA_PERSON = { id: ADA, username: 'ada', displayName: 'Ada' } as const;

type Route = (request: HttpRequest) => ApiResult<unknown> | undefined;

function gateway({ level, shared = false, sharingEnabled = true, extra }: { readonly level: string; readonly shared?: boolean; readonly sharingEnabled?: boolean; readonly extra?: Route }) {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(request);
      const custom = extra?.(request);
      if (custom !== undefined) return custom as ApiResult<T>;
      if (request.path.endsWith('/phone-reachability/settings')) return { ok: true, data: { userId: ADA, shared } } as ApiResult<T>;
      if (request.path.endsWith('/device/reachability/settings')) return { ok: true, data: { sharingEnabled } } as ApiResult<T>;
      if (request.method === 'GET' && /\/relations$/.test(request.path)) return { ok: true, data: [{ userId: ADA, effectiveLevel: level, grantedByMe: level }] } as ApiResult<T>;
      return { ok: false, status: 500, error: 'inattendu' };
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport }, calls };
}

function memoryStorage(): SafeStorage {
  const memory = new Map<string, string>();
  return { getItem: (key) => memory.get(key) ?? null, setItem: (key, value) => void memory.set(key, value), removeItem: (key) => void memory.delete(key) };
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 5)));

const unreachable = (client: QueryClient, cause: 'battery' | 'network' | 'unknown' = 'battery') =>
  receivePhoneReachabilityState(client, { userId: ADA, unreachableSince: new Date().toISOString(), cause }, Date.now());

describe('la fiche d’un direct', () => {
  test('un téléphone injoignable : l’heure et la cause probable', async () => {
    const client = new QueryClient();
    unreachable(client);
    const host = await mount(<ConversationPhoneReachabilitySection userId={ADA} language="fr" client={client} />);
    await settle();
    expect(host.querySelector('[data-phone-reachability-detail]')?.textContent).toContain('Téléphone injoignable depuis ');
    expect(host.textContent).toContain('Batterie vide, probablement');
    expect(host.textContent).toContain('Téléphone');
  });

  test('sans réseau : la cause le dit', async () => {
    const client = new QueryClient();
    unreachable(client, 'network');
    const host = await mount(<ConversationPhoneReachabilitySection userId={ADA} language="fr" client={client} />);
    await settle();
    expect(host.textContent).toContain('Sans réseau ou en mode avion, probablement');
  });

  test('une cause inconnue ne se dit pas, l’heure reste', async () => {
    const client = new QueryClient();
    unreachable(client, 'unknown');
    const host = await mount(<ConversationPhoneReachabilitySection userId={ADA} language="fr" client={client} />);
    await settle();
    expect(host.querySelector('[data-phone-reachability-detail]')).not.toBeNull();
    expect(host.querySelector('[data-phone-reachability-cause]')).toBeNull();
  });

  test('un téléphone qui répond : rien', async () => {
    const host = await mount(<ConversationPhoneReachabilitySection userId={ADA} language="fr" client={new QueryClient()} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });
});

describe('le profil d’une personne', () => {
  test('un Proche : « Prévenir Ada » non coché, le détail pendant un état servi, et le web dit qu’il ne compte pas', async () => {
    const client = new QueryClient();
    unreachable(client);
    const { deps } = gateway({ level: 'CLOSE' });
    const host = await mount(<ProfilePhoneReachabilityRow language="fr" person={ADA_PERSON} deps={deps} client={client} />);
    await settle();
    const share = host.querySelector('[data-phone-reachability-share]');
    expect(share?.getAttribute('aria-checked')).toBe('false');
    expect(host.textContent).toContain('Prévenir Ada si mon téléphone est injoignable');
    expect(host.textContent).toContain('Rien n’est partagé tant que vous ne l’activez pas.');
    expect(host.querySelector('[data-phone-reachability-detail]')).not.toBeNull();
    expect(host.querySelector('[data-phone-reachability-web-note]')).not.toBeNull();
  });

  test('un Sang : actif par défaut (servi), retirable, et le réglage global coupé se dit', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'BLOOD', shared: true, sharingEnabled: false, extra: (request) => (request.method === 'PUT' ? { ok: true, data: { userId: ADA, shared: false } } : undefined) });
    const host = await mount(<ProfilePhoneReachabilityRow language="fr" person={ADA_PERSON} deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-phone-reachability-share]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.querySelector('[data-phone-reachability-global-off]')).not.toBeNull();
    expect(host.querySelector('[data-phone-reachability-detail]')).toBeNull();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-phone-reachability-share]')?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ shared: false });
    expect(host.querySelector('[data-phone-reachability-share]')?.getAttribute('aria-checked')).toBe('false');
  });

  test('un refus du serveur ramène l’interrupteur, et le dit', async () => {
    const client = new QueryClient();
    const { deps } = gateway({ level: 'BLOOD', shared: true, extra: (request) => (request.method === 'PUT' ? { ok: false, status: 0, error: 'hors ligne' } : undefined) });
    const host = await mount(<ProfilePhoneReachabilityRow language="fr" person={ADA_PERSON} deps={deps} client={client} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-phone-reachability-share]')?.click());
    await settle();
    expect(host.querySelector('[data-phone-reachability-share]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Hors ligne : le réglage n’a pas été enregistré.');
  });

  test('un Proche non partagé : la proposition arrive UNE fois, case non cochée, à la place de l’interrupteur', async () => {
    const storage = memoryStorage();
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'CLOSE', extra: (request) => (request.method === 'PUT' ? { ok: true, data: { userId: ADA, shared: true } } : undefined) });
    const host = await mount(<ProfilePhoneReachabilityRow language="fr" viewerId="me" storage={storage} person={ADA_PERSON} deps={deps} client={client} />);
    await settle();
    expect(host.textContent).toContain('Prévenir Ada si votre téléphone ne répond plus ?');
    expect(host.querySelector('[data-phone-reachability-share]')).toBeNull();
    const box = host.querySelector<HTMLInputElement>('[data-phone-reachability-consent-checkbox]');
    expect(box?.checked).toBe(false);
    await act(async () => box?.click());
    await act(async () => host.querySelector<HTMLButtonElement>('[data-phone-reachability-consent-confirm]')?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ shared: true });
    expect(host.querySelector('[data-phone-reachability-consent]')).toBeNull();
    expect(host.querySelector('[data-phone-reachability-share]')?.getAttribute('aria-checked')).toBe('true');
  });

  test('la proposition laissée sans case ne partage rien, et ne revient plus', async () => {
    const storage = memoryStorage();
    const { deps, calls } = gateway({ level: 'CLOSE' });
    const first = await mount(<ProfilePhoneReachabilityRow language="fr" viewerId="me" storage={storage} person={ADA_PERSON} deps={deps} client={new QueryClient()} />);
    await settle();
    await act(async () => first.querySelector<HTMLButtonElement>('[data-phone-reachability-consent-confirm]')?.click());
    await settle();
    expect(calls.some((call) => call.method === 'PUT')).toBe(false);
    unmountAll();
    const again = await mount(<ProfilePhoneReachabilityRow language="fr" viewerId="me" storage={storage} person={ADA_PERSON} deps={deps} client={new QueryClient()} />);
    await settle();
    expect(again.querySelector('[data-phone-reachability-consent]')).toBeNull();
    expect(again.querySelector('[data-phone-reachability-share]')).not.toBeNull();
  });

  test('sous Proche : rien', async () => {
    const client = new QueryClient();
    unreachable(client);
    const { deps } = gateway({ level: 'FRIEND' });
    const host = await mount(<ProfilePhoneReachabilityRow language="fr" person={ADA_PERSON} deps={deps} client={client} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });
});

describe('mon profil', () => {
  test('« Téléphone injoignable » se bascule, en deux mots : la section « Mon téléphone » de /me le porte (budget de verbosité)', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'NONE', extra: (request) => (request.method === 'PUT' ? { ok: true, data: { sharingEnabled: false } } : undefined) });
    const host = await mount(<MePhoneReachabilityRow language="fr" deps={deps} client={client} />);
    await settle();
    const global = host.querySelector<HTMLButtonElement>('[data-phone-reachability-global]');
    expect(global?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toBe('Téléphone injoignable');
    await act(async () => global?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ sharingEnabled: false });
    expect(host.querySelector('[data-phone-reachability-global]')?.getAttribute('aria-checked')).toBe('false');
  });
});
