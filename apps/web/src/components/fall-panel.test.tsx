import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import type { FallState } from '@meeshy/shared/types/fall-detection';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { receiveFallState } from '@/lib/fall/fall-live';
import { loadFallCatalog } from '@/lib/i18n-fall-catalog';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationFallSection, MeFallRow, ProfileFallRow } from './fall-panel';

/**
 * LA CHUTE DÉTECTÉE DANS LA FICHE, LE PROFIL ET « MOI » (#18748) — « Chute détectée à 16:42 » n'existe que pendant un
 * épisode servi, avec la dernière batterie et la dernière position SEULEMENT si elles sont servies ; « Prévenir si ma
 * montre détecte une chute » vit chez un Sang et bascule au geste, revenant si le serveur refuse ; « Moi » dit que la
 * détection vient d'une Apple Watch, sans rien demander au serveur ni recueillir d'accord.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadFallCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const AWA = 'b'.repeat(24);
const AWA_PERSON = { id: AWA, username: 'awa', displayName: 'Awa' } as const;

type Route = (request: HttpRequest) => ApiResult<unknown> | undefined;

function gateway({ level, shared = true, extra }: { readonly level: string; readonly shared?: boolean; readonly extra?: Route }) {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(request);
      const custom = extra?.(request);
      if (custom !== undefined) return custom as ApiResult<T>;
      if (request.path.endsWith('/fall/settings')) return { ok: true, data: { userId: AWA, shared } } as ApiResult<T>;
      if (request.method === 'GET' && /\/relations$/.test(request.path)) return { ok: true, data: [{ userId: AWA, effectiveLevel: level, grantedByMe: level }] } as ApiResult<T>;
      return { ok: false, status: 500, error: 'inattendu' };
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport }, calls };
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 5)));

const fallen = (client: QueryClient, overrides: Partial<FallState> = {}) =>
  receiveFallState(client, { userId: AWA, detectedAt: new Date(Date.now() - 120_000).toISOString(), expiresAt: new Date(Date.now() + 3_600_000).toISOString(), ...overrides }, Date.now());

describe('la fiche d’un direct avec un Sang', () => {
  test('une chute servie : « Chute détectée à … », la batterie et l’accès à la carte', async () => {
    const client = new QueryClient();
    fallen(client, { lastBattery: { level: 41, measuredAt: new Date().toISOString() }, lastPosition: { latitude: 48.8566, longitude: 2.3522, recordedAt: new Date().toISOString() } });
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationFallSection userId={AWA} name="Awa" language="fr" deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-fall-detail]')?.textContent).toContain('Chute détectée à ');
    expect(host.querySelector('[data-fall-battery]')?.textContent?.replace(/\s/g, ' ')).toBe('Dernière batterie : 41 %');
    expect(host.querySelector<HTMLAnchorElement>('[data-fall-map]')?.getAttribute('href')).toBe('https://maps.apple.com/?ll=48.85660,2.35220');
    expect(host.querySelector('[data-fall-share]')?.getAttribute('aria-checked')).toBe('true');
  });

  test('sans batterie ni position servies : l’heure seule, aucun lien vers une carte', async () => {
    const client = new QueryClient();
    fallen(client);
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationFallSection userId={AWA} name="Awa" language="fr" deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-fall-detail]')).not.toBeNull();
    expect(host.querySelector('[data-fall-battery]')).toBeNull();
    expect(host.querySelector('[data-fall-map]')).toBeNull();
  });

  test('un Sang sans chute : seul l’interrupteur', async () => {
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationFallSection userId={AWA} name="Awa" language="fr" deps={deps} client={new QueryClient()} />);
    await settle();
    expect(host.querySelector('[data-fall-detail]')).toBeNull();
    expect(host.textContent).toContain('Prévenir si ma montre détecte une chute');
  });

  test('sous Sang, sans chute : rien', async () => {
    const { deps } = gateway({ level: 'CLOSE' });
    const host = await mount(<ConversationFallSection userId={AWA} name="Awa" language="fr" deps={deps} client={new QueryClient()} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });
});

describe('le profil d’un Sang', () => {
  test('retirer « Prévenir si ma montre détecte une chute » part en `{ shared: false }`', async () => {
    const { deps, calls } = gateway({ level: 'BLOOD', extra: (request) => (request.method === 'PUT' ? { ok: true, data: { userId: AWA, shared: false } } : undefined) });
    const host = await mount(<ProfileFallRow language="fr" person={AWA_PERSON} deps={deps} client={new QueryClient()} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-fall-share]')?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ shared: false });
    expect(host.querySelector('[data-fall-share]')?.getAttribute('aria-checked')).toBe('false');
  });

  test('un refus du serveur ramène l’interrupteur, et le dit', async () => {
    const { deps } = gateway({ level: 'BLOOD', extra: (request) => (request.method === 'PUT' ? { ok: false, status: 0, error: 'hors ligne' } : undefined) });
    const host = await mount(<ProfileFallRow language="fr" person={AWA_PERSON} deps={deps} client={new QueryClient()} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-fall-share]')?.click());
    await settle();
    expect(host.querySelector('[data-fall-share]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Hors ligne : le réglage n’a pas été enregistré.');
  });

  test('une chute servie se lit aussi sur le profil', async () => {
    const client = new QueryClient();
    fallen(client);
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ProfileFallRow language="fr" person={AWA_PERSON} deps={deps} client={client} />);
    await settle();
    expect(host.querySelector('[data-fall-detail]')?.textContent).toContain('Chute détectée à ');
  });
});

describe('mon profil', () => {
  test('« Détection de chute » dit qu’elle vient d’une Apple Watch, sans rien demander au serveur', async () => {
    const host = await mount(<MeFallRow language="fr" />);
    await settle();
    expect(host.querySelector('[data-me-fall-title]')?.textContent).toBe('Détection de chute');
    expect(host.querySelector('[data-me-fall-source]')?.textContent).toBe('Apple Watch');
    expect(host.textContent).toContain('l’accord se donne dans l’app iPhone, jamais ici');
    expect(host.querySelector('input, select, [role="switch"]')).toBeNull();
  });
});
