import { describe, expect, test } from 'bun:test';
import { QueryClient } from '@tanstack/react-query';

import type { PublicContactAccount } from '@meeshy/shared/types/contact-card';

import { scriptedGateway } from '@/test-support/scripted-transport';

import {
  contactResolveQueryKey,
  decodeContactAccounts,
  patchContactRelation,
  resolveContactAccounts,
} from './resolve';

/**
 * LE PORT DE LA CARTE DE VISITE (#8101) — ce qui PART (la route, le corps),
 * ce qui ENTRE dans le cache persisté (les sept champs du contrat, rien
 * d'autre), et le geste optimiste qui réécrit la relation partout.
 */

const account = (overrides: Partial<PublicContactAccount> = {}): PublicContactAccount => ({
  userId: '507f1f77bcf86cd799439022',
  displayName: 'Awa D.',
  username: 'awa',
  avatarUrl: null,
  bannerUrl: null,
  bio: null,
  relation: 'none',
  ...overrides,
});

describe('decodeContactAccounts', () => {
  test('ne laisse entrer que les champs du contrat', () => {
    const [decoded] = decodeContactAccounts({
      accounts: [{ ...account(), email: 'awa@example.com', isOnline: true, matchedBy: 'phone' }],
    });
    expect(Object.keys(decoded ?? {}).sort()).toEqual(['avatarUrl', 'bannerUrl', 'bio', 'displayName', 'relation', 'userId', 'username']);
  });

  test('écarte un compte à la relation inconnue ou au champ manquant', () => {
    expect(decodeContactAccounts({ accounts: [{ ...account(), relation: 'blocked' }, { userId: 'x' }, account()] })).toEqual([account()]);
    expect(decodeContactAccounts(null)).toEqual([]);
  });
});

describe('resolveContactAccounts', () => {
  test('poste les numéros et e-mails de la carte, et rien d’autre', async () => {
    const gateway = scriptedGateway({ 'POST /api/v1/contacts/resolve': { ok: true, data: { accounts: [account()] } } });
    const result = await resolveContactAccounts({ ...gateway.deps, request: { phones: ['+33612345678'], emails: ['awa@example.com'] } });
    expect(result).toEqual({ ok: true, data: [account()] });
    expect(gateway.calls().map(({ method, path, body }) => ({ method, path, body }))).toEqual([
      { method: 'POST', path: '/api/v1/contacts/resolve', body: { phones: ['+33612345678'], emails: ['awa@example.com'] } },
    ]);
  });

  test('rend l’échec de la passerelle tel quel', async () => {
    const gateway = scriptedGateway({ 'POST /api/v1/contacts/resolve': { ok: false, status: 429, error: 'Trop de recherches' } });
    const result = await resolveContactAccounts({ ...gateway.deps, request: { phones: ['+33612345678'], emails: [] } });
    expect(result.ok).toBe(false);
  });
});

describe('patchContactRelation', () => {
  test('réécrit la relation dans TOUTES les résolutions, puis restaure', () => {
    const client = new QueryClient();
    const first = contactResolveQueryKey({ phones: ['+33612345678'], emails: [] });
    const second = contactResolveQueryKey({ phones: [], emails: ['awa@example.com'] });
    client.setQueryData(first, [account()]);
    client.setQueryData(second, [account(), account({ userId: 'other', relation: 'friend' })]);

    const restore = patchContactRelation(client, '507f1f77bcf86cd799439022', 'request-sent');
    expect(client.getQueryData<PublicContactAccount[]>(first)?.[0]?.relation).toBe('request-sent');
    expect(client.getQueryData<PublicContactAccount[]>(second)?.map((row) => row.relation)).toEqual(['request-sent', 'friend']);

    restore();
    expect(client.getQueryData<PublicContactAccount[]>(first)?.[0]?.relation).toBe('none');
  });
});
