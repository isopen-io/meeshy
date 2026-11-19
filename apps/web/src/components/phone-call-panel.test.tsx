import { afterAll, afterEach, beforeAll, describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';
import { act } from 'react';

import type { ApiResult, HttpRequest, HttpTransport } from '@/lib/api/http';
import { loadPhoneCallCatalog } from '@/lib/i18n-phone-call-catalog';
import { receivePhoneCallState } from '@/lib/phone-call/phone-call-live';
import { createActMounter } from '@/test-support/act-mount';
import { ensureHappyDomRegistered, releaseHappyDomIfRegistered } from '@/test-support/happy-dom-environment';

import { ConversationPhoneCallSection, MePhoneCallRow, ProfilePhoneCallRow } from './phone-call-panel';

/**
 * « EN APPEL » DANS LA FICHE, LE PROFIL ET « MOI » (#18753) — « En appel depuis … » n'existe que pendant un état servi,
 * jamais avec qui ; « Montrer que je suis en appel » vit chez un Sang ou entre deux comptes de l'équipe ; « Montrer à
 * mes Sangs que je suis en appel » se coupe pour tous sur « Moi ». Chaque réglage bascule au geste et revient si le
 * serveur refuse.
 */

const globals = globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean };
const { mount, unmountAll } = createActMounter();

beforeAll(async () => {
  ensureHappyDomRegistered();
  globals.IS_REACT_ACT_ENVIRONMENT = true;
  await loadPhoneCallCatalog('fr');
});

afterAll(async () => {
  delete globals.IS_REACT_ACT_ENVIRONMENT;
  await releaseHappyDomIfRegistered();
});

afterEach(() => unmountAll());

const JACQUES = 'b'.repeat(24);
const JACQUES_PERSON = { id: JACQUES, username: 'jacques', displayName: 'Jacques' } as const;

type Route = (request: HttpRequest) => ApiResult<unknown> | undefined;

function gateway({
  level,
  accessLevel = level,
  shared = true,
  sharingEnabled = true,
  extra,
}: {
  readonly level: string;
  readonly accessLevel?: string;
  readonly shared?: boolean;
  readonly sharingEnabled?: boolean;
  readonly extra?: Route;
}) {
  const calls: HttpRequest[] = [];
  const transport = {
    request: async <T,>(request: HttpRequest): Promise<ApiResult<T>> => {
      calls.push(request);
      const custom = extra?.(request);
      if (custom !== undefined) return custom as ApiResult<T>;
      if (request.path.endsWith('/phone-call/settings')) return { ok: true, data: { userId: JACQUES, shared } } as ApiResult<T>;
      if (request.path.endsWith('/device/call/settings')) return { ok: true, data: { sharingEnabled } } as ApiResult<T>;
      if (request.method === 'GET' && /\/relations$/.test(request.path)) return { ok: true, data: [{ userId: JACQUES, effectiveLevel: level, grantedByMe: level }] } as ApiResult<T>;
      if (request.method === 'GET' && request.path.endsWith(`/relations/${JACQUES}`)) return { ok: true, data: { userId: JACQUES, effectiveLevel: level, accessLevel } } as ApiResult<T>;
      return { ok: false, status: 500, error: 'inattendu' };
    },
  } as unknown as HttpTransport;
  return { deps: { source: 'gateway' as const, transport }, calls };
}

const settle = () => act(async () => new Promise((resolve) => setTimeout(resolve, 5)));

/** Attend une CONDITION, pas une durée : deux allers-retours (liens, puis niveau d'accès) sous la charge de la suite complète. */
const until = async (ready: () => boolean, timeoutMs = 2_000): Promise<void> => {
  const deadline = Date.now() + timeoutMs;
  while (!ready() && Date.now() < deadline) await settle();
};

const inCall = (client: QueryClient, { expiresInMs = 3_600_000 }: { readonly expiresInMs?: number } = {}) =>
  receivePhoneCallState(client, { userId: JACQUES, since: new Date(Date.now() - 12 * 60_000 - 5_000).toISOString(), expiresAt: new Date(Date.now() + expiresInMs).toISOString() }, Date.now());

describe('la fiche d’un direct', () => {
  test('un Sang en appel : « En appel depuis 12 min », et l’interrupteur par personne', async () => {
    const client = new QueryClient();
    inCall(client);
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationPhoneCallSection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={client} />);
    await settle();
    const detail = host.querySelector('[data-phone-call-detail]');
    expect(detail?.textContent).toBe('En appel depuis 12 min');
    expect(detail?.getAttribute('aria-label')).toBe('En appel depuis 12 min');
    expect(host.querySelector('[data-phone-call-share]')?.getAttribute('aria-checked')).toBe('true');
  });

  test('un Sang qui n’est pas en appel : seul l’interrupteur', async () => {
    const { deps } = gateway({ level: 'BLOOD' });
    const host = await mount(<ConversationPhoneCallSection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={new QueryClient()} />);
    await settle();
    expect(host.querySelector('[data-phone-call-detail]')).toBeNull();
    expect(host.textContent).toContain('Montrer que je suis en appel');
  });

  test('deux comptes de l’équipe : l’interrupteur est offert, au niveau d’accès servi', async () => {
    const { deps } = gateway({ level: 'FRIEND', accessLevel: 'BLOOD' });
    const host = await mount(<ConversationPhoneCallSection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={new QueryClient()} />);
    await until(() => host.querySelector('[data-phone-call-share]') !== null);
    expect(host.querySelector('[data-phone-call-share]')).not.toBeNull();
  });

  test('sous Sang, hors équipe, sans appel : rien', async () => {
    const { deps } = gateway({ level: 'CLOSE' });
    const host = await mount(<ConversationPhoneCallSection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={new QueryClient()} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });

  test('un état expiré ne se dit pas', async () => {
    const client = new QueryClient();
    inCall(client, { expiresInMs: 50 });
    await act(async () => new Promise((resolve) => setTimeout(resolve, 80)));
    const { deps } = gateway({ level: 'CLOSE' });
    const host = await mount(<ConversationPhoneCallSection userId={JACQUES} name="Jacques" language="fr" deps={deps} client={client} />);
    await settle();
    expect(host.innerHTML).toBe('');
  });
});

describe('le profil d’un Sang', () => {
  test('retirer « Montrer que je suis en appel » bascule au geste et part en `{ shared: false }`', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'BLOOD', extra: (request) => (request.method === 'PUT' ? { ok: true, data: { userId: JACQUES, shared: false } } : undefined) });
    const host = await mount(<ProfilePhoneCallRow language="fr" person={JACQUES_PERSON} deps={deps} client={client} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-phone-call-share]')?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ shared: false });
    expect(host.querySelector('[data-phone-call-share]')?.getAttribute('aria-checked')).toBe('false');
  });

  test('un refus du serveur ramène l’interrupteur, et le dit', async () => {
    const { deps } = gateway({ level: 'BLOOD', extra: (request) => (request.method === 'PUT' ? { ok: false, status: 0, error: 'hors ligne' } : undefined) });
    const host = await mount(<ProfilePhoneCallRow language="fr" person={JACQUES_PERSON} deps={deps} client={new QueryClient()} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-phone-call-share]')?.click());
    await settle();
    expect(host.querySelector('[data-phone-call-share]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Hors ligne : le réglage n’a pas été enregistré.');
  });

  test('mon partage coupé pour tous se dit sous l’interrupteur', async () => {
    const { deps } = gateway({ level: 'BLOOD', sharingEnabled: false });
    const host = await mount(<ProfilePhoneCallRow language="fr" person={JACQUES_PERSON} deps={deps} client={new QueryClient()} />);
    await settle();
    expect(host.querySelector('[data-phone-call-global-off]')?.textContent).toBe('Coupé pour tous dans votre profil.');
  });
});

describe('mon profil', () => {
  test('« Montrer à mes Sangs que je suis en appel » : actif par défaut, et le couper part au serveur', async () => {
    const client = new QueryClient();
    const { deps, calls } = gateway({ level: 'NONE', extra: (request) => (request.method === 'PUT' ? { ok: true, data: request.body } : undefined) });
    const host = await mount(<MePhoneCallRow language="fr" deps={deps} client={client} />);
    await settle();
    const toggle = host.querySelector<HTMLButtonElement>('[data-phone-call-global]');
    expect(toggle?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Montrer à mes Sangs que je suis en appel');
    await act(async () => toggle?.click());
    await settle();
    expect(calls.find((call) => call.method === 'PUT')?.body).toEqual({ sharingEnabled: false });
    expect(host.querySelector('[data-phone-call-global]')?.getAttribute('aria-checked')).toBe('false');
  });

  test('un refus du serveur ramène l’interrupteur, et le dit', async () => {
    const { deps } = gateway({ level: 'NONE', extra: (request) => (request.method === 'PUT' ? { ok: false, status: 500, error: 'x' } : undefined) });
    const host = await mount(<MePhoneCallRow language="fr" deps={deps} client={new QueryClient()} />);
    await settle();
    await act(async () => host.querySelector<HTMLButtonElement>('[data-phone-call-global]')?.click());
    await settle();
    expect(host.querySelector('[data-phone-call-global]')?.getAttribute('aria-checked')).toBe('true');
    expect(host.textContent).toContain('Le réglage n’a pas pu être enregistré.');
  });
});
