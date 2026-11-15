import { describe, expect, test } from 'bun:test';

import { setAdminUserTwoFactor, setAdminUserVerification } from './admin-user-verifications';
import type { HttpTransport } from './http';

/**
 * #8004 — l'ÂGE comme troisième preuve, et le MOTIF écrit qui voyage dans la trace
 * d'audit. Chaque geste garde SON adresse (`…/verifications`, `…/security`) ; le
 * motif vide ne part jamais.
 */
const transportEspion = (reponse: unknown) => {
  const appels: { path: string; method: string; body: unknown }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string; body?: unknown }) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return { ok: true as const, data: reponse };
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

const MEMBRE = { id: 'u-1', username: 'alice', emailVerifiedAt: null, twoFactorEnabledAt: null };

describe('setAdminUserVerification — l’âge, le motif', () => {
  test('pose ageVerified sur PATCH …/verifications, avec le motif rogné quand il est écrit', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    await setAdminUserVerification({ ...deps(transport), userId: 'u-1', channel: 'age', verified: true, reason: '  Pièce d’identité vue  ' });

    expect(appels[0]).toEqual({
      path: '/api/v1/admin/users/u-1/verifications',
      method: 'PATCH',
      body: { ageVerified: true, reason: 'Pièce d’identité vue' },
    });
  });

  test('un motif VIDE n’est pas un motif : il ne part pas', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    await setAdminUserVerification({ ...deps(transport), userId: 'u-1', channel: 'email', verified: false, reason: '   ' });

    expect(appels[0]?.body).toEqual({ emailVerified: false });
  });
});

describe('setAdminUserTwoFactor — retirer porte son motif', () => {
  test('PATCH …/security { twoFactorEnabled: false, reason }', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    await setAdminUserTwoFactor({ ...deps(transport), userId: 'u-1', enabled: false, reason: 'Appareil perdu, vérifié par téléphone' });

    expect(appels[0]).toEqual({
      path: '/api/v1/admin/users/u-1/security',
      method: 'PATCH',
      body: { twoFactorEnabled: false, reason: 'Appareil perdu, vérifié par téléphone' },
    });
  });
});
