import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import * as lensEndpoints from '@meeshy/shared/api/endpoints/lens';

import type { ApiResult, HttpRequest, HttpTransport } from './http';
import {
  PARTNER_PROFILE_QUERY_KEY,
  decodePartnerProfile,
  loadPartnerProfile,
  performShowOwnerProfileEdit,
  type PartnerOwnerProfile,
} from './partner-profile';

/**
 * LE PROFIL MEESHY SUR LA PAGE ÉDITEUR (#16440) — `GET /lens/partners/me` dit
 * si l'appelant a un profil d'éditeur et s'il y nomme son compte ;
 * `PUT /lens/partners/me` écrit le choix `showOwnerProfile`, masqué par défaut.
 */

function scripted(responses: ReadonlyArray<ApiResult<unknown>>) {
  const calls: HttpRequest[] = [];
  const queue = [...responses];
  const request = async (req: HttpRequest) => {
    calls.push(req);
    const next = queue.shift();
    if (next === undefined) throw new Error('aucune réponse prévue');
    return next;
  };
  const transport = Object.assign(((req: HttpRequest) => request(req)) as unknown as HttpTransport, { request });
  return { transport, calls };
}

const served = (overrides: Record<string, unknown> = {}) => ({
  id: 'p1',
  userId: 'u1',
  displayName: 'Studio Lumière',
  website: 'https://lumiere.example',
  logo: '/api/v1/lens/partners/p1/logo',
  verified: true,
  verifiedAt: '2026-11-01T00:00:00.000Z',
  showOwnerProfile: false,
  version: 'v1',
  ...overrides,
});

const profile = (overrides: Partial<PartnerOwnerProfile> = {}): PartnerOwnerProfile => ({
  displayName: 'Studio Lumière',
  website: 'https://lumiere.example',
  showOwnerProfile: false,
  ...overrides,
});

const deps = (transport: HttpTransport, queryClient: QueryClient, online = true) => ({
  source: 'gateway' as const,
  transport,
  queryClient,
  isOnline: () => online,
});

describe('decodePartnerProfile', () => {
  test('un compte sans profil d’éditeur lit `null`', () => {
    expect(decodePartnerProfile(null)).toEqual({ ok: true, profile: null });
  });

  test('un profil servi rend son nom, son site et le choix d’afficher le compte', () => {
    expect(decodePartnerProfile(served({ showOwnerProfile: true }))).toEqual({ ok: true, profile: profile({ showOwnerProfile: true }) });
  });

  test('une passerelle antérieure à #16440 ne sert pas le choix : il vaut masqué', () => {
    const { showOwnerProfile: _omitted, ...older } = served();
    expect(decodePartnerProfile(older)).toEqual({ ok: true, profile: profile() });
  });

  test('un profil sans nom ou un choix non booléen est illisible', () => {
    expect(decodePartnerProfile({ website: null })).toEqual({ ok: false });
    expect(decodePartnerProfile(served({ showOwnerProfile: 'yes' }))).toEqual({ ok: false });
  });
});

describe('loadPartnerProfile', () => {
  test('lit GET /lens/partners/me', async () => {
    const { transport, calls } = scripted([{ ok: true, data: served({ website: null }) }]);
    const result = await loadPartnerProfile({ source: 'gateway', transport });
    expect(calls[0]).toMatchObject({ method: 'GET', path: lensEndpoints.partnersMe });
    expect(result).toEqual({ ok: true, data: profile({ website: null }) });
  });
});

describe('performShowOwnerProfileEdit', () => {
  test('écrit le choix en renvoyant le nom et le site LUS, sans toucher au logo', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(PARTNER_PROFILE_QUERY_KEY, profile());
    const { transport, calls } = scripted([{ ok: true, data: served({ showOwnerProfile: true }) }]);
    const outcome = await performShowOwnerProfileEdit({ show: true, deps: deps(transport, queryClient) });
    expect(outcome).toEqual({ status: 'saved' });
    expect(calls[0]).toMatchObject({
      method: 'PUT',
      path: lensEndpoints.partnersMe,
      body: { displayName: 'Studio Lumière', website: 'https://lumiere.example', showOwnerProfile: true },
    });
    expect(Object.keys(calls[0]?.body as object)).not.toContain('logo');
    expect(queryClient.getQueryData(PARTNER_PROFILE_QUERY_KEY)).toEqual(profile({ showOwnerProfile: true }));
  });

  test('optimiste : le cache montre le choix avant la réponse', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(PARTNER_PROFILE_QUERY_KEY, profile());
    let release: (value: ApiResult<unknown>) => void = () => undefined;
    const request = (_req: HttpRequest) => new Promise<ApiResult<unknown>>((resolve) => (release = resolve));
    const transport = Object.assign(((req: HttpRequest) => request(req)) as unknown as HttpTransport, { request });
    const pending = performShowOwnerProfileEdit({ show: true, deps: deps(transport, queryClient) });
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(queryClient.getQueryData<PartnerOwnerProfile>(PARTNER_PROFILE_QUERY_KEY)?.showOwnerProfile).toBe(true);
    release({ ok: true, data: served({ showOwnerProfile: true }) });
    expect(await pending).toEqual({ status: 'saved' });
  });

  test('un refus remet le choix d’avant', async () => {
    const queryClient = new QueryClient();
    queryClient.setQueryData(PARTNER_PROFILE_QUERY_KEY, profile({ showOwnerProfile: true }));
    const { transport } = scripted([{ ok: false, status: 409, error: 'changed' }]);
    const outcome = await performShowOwnerProfileEdit({ show: false, deps: deps(transport, queryClient) });
    expect(outcome).toEqual({ status: 'refused', error: 'changed' });
    expect(queryClient.getQueryData<PartnerOwnerProfile>(PARTNER_PROFILE_QUERY_KEY)?.showOwnerProfile).toBe(true);
  });

  test('hors ligne ou sans profil d’éditeur, rien ne part', async () => {
    const { transport, calls } = scripted([]);
    const withProfile = new QueryClient();
    withProfile.setQueryData(PARTNER_PROFILE_QUERY_KEY, profile());
    expect(await performShowOwnerProfileEdit({ show: true, deps: deps(transport, withProfile, false) })).toEqual({ status: 'offline' });
    const withoutProfile = new QueryClient();
    withoutProfile.setQueryData(PARTNER_PROFILE_QUERY_KEY, null);
    expect(await performShowOwnerProfileEdit({ show: true, deps: deps(transport, withoutProfile) })).toEqual({ status: 'refused', error: 'no-profile' });
    expect(calls).toHaveLength(0);
  });
});
