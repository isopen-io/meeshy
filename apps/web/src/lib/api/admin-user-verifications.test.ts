import { describe, expect, test } from 'bun:test';

import { requestAdminUserVerification, setAdminUserTwoFactor, setAdminUserVerification } from './admin-user-verifications';
import type { HttpTransport } from './http';

/**
 * LES PREUVES DE CONTACT ET LE SECOND FACTEUR D'UN MEMBRE (#8289) — trois
 * gestes de la fiche d'administration, chacun sur SON adresse :
 *
 * - marquer vérifié / non vérifié : `PATCH …/verifications` ;
 * - activer / désactiver le second facteur : `PATCH …/security` ;
 * - renvoyer la vérification : `POST …/verification-requests`.
 *
 * Les deux premiers rendent le membre À JOUR, décodé par la loi du détail.
 */
const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string; method: string; body: unknown }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string; body?: unknown }) => {
      appels.push({ path: requete.path, method: requete.method, body: requete.body });
      return ok ? { ok: true as const, data: reponse } : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

const MEMBRE = { id: 'u-1', username: 'alice', emailVerifiedAt: '2026-09-27T10:00:00.000Z', twoFactorEnabledAt: null };

describe('setAdminUserVerification — marquer un contact vérifié', () => {
  test('pose emailVerified sur PATCH …/verifications et rend le membre décodé', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    const resultat = await setAdminUserVerification({ ...deps(transport), userId: 'u 1', channel: 'email', verified: true });

    expect(appels[0]).toEqual({ path: `/api/v1/admin/users/${encodeURIComponent('u 1')}/verifications`, method: 'PATCH', body: { emailVerified: true } });
    expect(resultat.ok && resultat.data.emailVerifiedAt).toBe('2026-09-27T10:00:00.000Z');
  });

  test('pose phoneVerified pour le téléphone, jamais emailVerified', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    await setAdminUserVerification({ ...deps(transport), userId: 'u-1', channel: 'phone', verified: false });

    expect(appels[0]?.body).toEqual({ phoneVerified: false });
  });

  test('un refus passe tel quel à l’appelant', async () => {
    const { transport } = transportEspion({ ok: false, status: 403, error: 'Hiérarchie insuffisante' }, false);

    const resultat = await setAdminUserVerification({ ...deps(transport), userId: 'u-1', channel: 'email', verified: true });

    expect(resultat).toMatchObject({ ok: false, status: 403 });
  });
});

describe('setAdminUserTwoFactor — le second facteur', () => {
  test('pose twoFactorEnabled sur PATCH …/security', async () => {
    const { transport, appels } = transportEspion({ ...MEMBRE, twoFactorEnabledAt: '2026-09-27T10:00:00.000Z' });

    const resultat = await setAdminUserTwoFactor({ ...deps(transport), userId: 'u-1', enabled: true });

    expect(appels[0]).toEqual({ path: '/api/v1/admin/users/u-1/security', method: 'PATCH', body: { twoFactorEnabled: true } });
    expect(resultat.ok && resultat.data.twoFactorEnabled).toBe(true);
  });
});

describe('requestAdminUserVerification — renvoyer la vérification', () => {
  test('poste le canal sur …/verification-requests', async () => {
    const { transport, appels } = transportEspion({ channel: 'phone', sentAt: '2026-09-27T10:00:00.000Z' });

    const resultat = await requestAdminUserVerification({ ...deps(transport), userId: 'u-1', channel: 'phone' });

    expect(appels[0]).toEqual({ path: '/api/v1/admin/users/u-1/verification-requests', method: 'POST', body: { channel: 'phone' } });
    expect(resultat).toEqual({ ok: true, data: { channel: 'phone' } });
  });

  test('un contact déjà vérifié rend le refus typé de la passerelle', async () => {
    const { transport } = transportEspion({ ok: false, status: 409, error: 'déjà vérifié', code: 'ALREADY_VERIFIED' }, false);

    const resultat = await requestAdminUserVerification({ ...deps(transport), userId: 'u-1', channel: 'email' });

    expect(resultat).toMatchObject({ ok: false, code: 'ALREADY_VERIFIED' });
  });
});
