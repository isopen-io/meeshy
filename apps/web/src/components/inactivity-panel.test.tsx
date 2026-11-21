import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import type { InactivityAlertState } from '@meeshy/shared/types/inactivity-check';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { loadInactivityCatalog } from '@/lib/i18n-inactivity-catalog';
import { receiveInactivityState } from '@/lib/inactivity/inactivity-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationInactivitySection, MeInactivityRow, ProfileInactivityRow } from './inactivity-panel';

/**
 * LA VÉRIFICATION D'INACTIVITÉ DANS LA FICHE, LE PROFIL ET « MOI » (#18738) — « Aucune activité depuis 8:00 » n'existe
 * que pendant une alerte servie, avec la dernière batterie et la dernière position SEULEMENT si elles sont servies ;
 * « Prévenir si je ne réponds pas » vit chez un Sang ; le délai se choisit parmi 6 h, 12 h, 24 h ou « Désactivée ».
 * Chaque réglage bascule au geste et revient si le serveur refuse.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadInactivityCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const JACQUES = 'b'.repeat(24);
const JACQUES_PERSON = { id: JACQUES, username: 'jacques', displayName: 'Jacques' } as const;

type Route = (request: HttpRequest) => ApiResult<unknown> | undefined;

function gateway({ level, shared = true, delayHours = 12, extra }: { readonly level: string; readonly shared?: boolean; readonly delayHours?: number | null; readonly extra?: Route }) {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(request);
      const custom = extra?.(request);
      if (custom !== undefined) return custom as ApiResult<T>;
      if (request.path.endsWith('/inactivity/settings')) return { ok: true, data: { userId: JACQUES, shared } } as ApiResult<T>;
      if (request.path.endsWith('/wellness/settings')) return { ok: true, data: { delayHours } } as ApiResult<T>;
      if (request.method === 'GET' && /\/relations$/.test(request.path)) return { ok: true, data: [{ userId: JACQUES, effectiveLevel: level, grantedByMe: level }] } as ApiResult<T>;
      return { ok: false, status: 500, error: 'inattendu' };
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport }, calls };
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 5)));

const alerted = (client: QueryClient, overrides: Partial<InactivityAlertState> = {}) =>
  receiveInactivityState(client, { userId: JACQUES, inactiveSince: new Date(Date.now() - 3_600_000).toISOString(), alertedAt: new Date().toISOString(), ...overrides }, Date.now());

describe('la fiche d’un direct avec un Sang', () => {
  test('une alerte servie : « Aucune activité depuis … », la batterie et l’accès à la carte', async () => {
    const client = new QueryClient();
    alerted(client, { lastBattery: { level: 9, measuredAt: new Date().toISOString() }, lastPosition: { latitude: 48.8566, longitude: 2.3522, recordedAt: new Date().toISOString() } });
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationInactivitySection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-inactivity-detail]')?.textContent).toContain('Aucune activité depuis ');
    expect(host.querySelector('[data-inactivity-battery]')?.textContent?.replace(/\s/g, ' ')).toBe('Dernière batterie : 9 %');
    const map = host.querySelector<HTMLAnchorElement>('[data-inactivity-map]');
    expect(map?.getAttribute('href')).toBe('https://maps.apple.com/?ll=48.85660,2.35220');
    expect(map?.getAttribute('target')).toBe('_blank');
    expect(host.querySelector('[data-inactivity-share]')?.getAttribute('aria-checked')).toBe('true');
  });

  test('sans batterie ni position servies : l’heure seule, aucun lien vers une carte', async () => {
    const client = new QueryClient();
    alerted(client);
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationInactivitySection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-inactivity-detail]')).not.toBeNull();
    expect(host.querySelector('[data-inactivity-battery]')).toBeNull();
    expect(host.querySelector('[data-inactivity-map]')).toBeNull();
  });

  test('un Sang sans alerte : seul l’interrupteur « Prévenir si je ne réponds pas »', async () => {
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationInactivitySection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={new QueryClient()} />);
    await settle();
    expect(host.querySelector('[data-inactivity-detail]')).toBeNull();
    expect(host.textContent).toContain('Prévenir si je ne réponds pas');
  });

  test('sous Sang, sans alerte : rien', async () => {
    const { deps } = gateway({ level: 'CLOSE' });
    const host = await mount(<ConversationInactivitySection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={new QueryClient()} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });
});

describe('le profil d’un Sang', () => {
  test('retirer « Prévenir si je ne réponds pas » part en `{ shared: false }`', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'BLOOD', extra: (request) => (request.method === 'PUT' ? { ok: true, data: { userId: JACQUES, shared: false } } : undefined) });
    const host = await mount(<ProfileInactivityRow language="fr" person={JACQUES_PERSON} deps={deps} client={client} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-inactivity-share]')?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ shared: false });
    expect(host.querySelector('[data-inactivity-share]')?.getAttribute('aria-checked')).toBe('false');
  });

  test('un refus du serveur ramène l’interrupteur, et le dit', async () => {
    const { deps } = gateway({ level: 'BLOOD', extra: (request) => (request.method === 'PUT' ? { ok: false, status: 0, error: 'hors ligne' } : undefined) });
    const host = await mount(<ProfileInactivityRow language="fr" person={JACQUES_PERSON} deps={deps} client={new QueryClient()} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-inactivity-share]')?.click());
    await settle();
    expect(host.querySelector('[data-inactivity-share]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Hors ligne : le réglage n’a pas été enregistré.');
  });

  test('une alerte servie se lit aussi sur le profil', async () => {
    const client = new QueryClient();
    alerted(client);
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ProfileInactivityRow language="fr" person={JACQUES_PERSON} deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-inactivity-detail]')?.textContent).toContain('Aucune activité depuis ');
  });
});

describe('mon profil', () => {
  test('« Vérification d’inactivité » : 12 h par défaut, et chaque choix part au serveur', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'NONE', extra: (request) => (request.method === 'PUT' ? { ok: true, data: request.body } : undefined) });
    const host = await mount(<MeInactivityRow language="fr" deps={deps} client={client} />);
    await settle();
    const select = host.querySelector<HTMLSelectElement>('[data-inactivity-delay]');
    expect(select?.value).toBe('12');
    expect([...(select?.options ?? [])].map((option) => option.textContent)).toEqual(['6 h', '12 h', '24 h', 'Désactivée']);
    expect(host.querySelector('label')?.textContent).toBe('Vérification d’inactivité');
    await act(async () => {
      if (select === null) return;
      select.value = 'off';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ delayHours: null });
    expect(host.querySelector<HTMLSelectElement>('[data-inactivity-delay]')?.value).toBe('off');
  });

  test('un refus du serveur ramène le délai d’avant, et le dit', async () => {
    const { deps } = gateway({ level: 'NONE', delayHours: 24, extra: (request) => (request.method === 'PUT' ? { ok: false, status: 500, error: 'x' } : undefined) });
    const host = await mount(<MeInactivityRow language="fr" deps={deps} client={new QueryClient()} />);
    await settle();
    await act(async () => {
      const select = host.querySelector<HTMLSelectElement>('[data-inactivity-delay]');
      if (select === null) return;
      select.value = '6';
      select.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await settle();
    expect(host.querySelector<HTMLSelectElement>('[data-inactivity-delay]')?.value).toBe('24');
    expect(host.textContent).toContain('Le réglage n’a pas pu être enregistré.');
  });
});
