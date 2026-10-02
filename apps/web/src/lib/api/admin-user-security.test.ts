import { describe, expect, test } from 'bun:test';

import { ADMIN_WRITABLE_CONSENTS, CONSENT_MOTIVE_MIN, setAdminUserConsent, unlockAdminUser } from './admin-user-security';
import type { HttpTransport } from './http';

/**
 * DÉVERROUILLER ET CONSENTIR (#8004) — chaque geste sur l'adresse de SA loi
 * (`PATCH …/security`, `PATCH …/consents`), jamais sur un alias déprécié, avec
 * le corps EXACT que la passerelle lit.
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

const MEMBRE = { id: 'u-1', username: 'alice', lockedUntil: null, adminMetadata: { voiceProfileConsentAt: '2026-09-30T10:00:00.000Z' } };

describe('unlockAdminUser — { unlock: true, reason? } sur …/security', () => {
  test('le corps est EXACT, sans motif quand il est vide', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    const resultat = await unlockAdminUser({ ...deps(transport), userId: 'u 1', reason: '   ' });

    expect(appels[0]).toEqual({ path: `/api/v1/admin/users/${encodeURIComponent('u 1')}/security`, method: 'PATCH', body: { unlock: true } });
    expect(resultat.ok && resultat.data.lockedUntil).toBeNull();
  });

  test('un motif écrit est rogné et part dans la trace', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    await unlockAdminUser({ ...deps(transport), userId: 'u-1', reason: ' Demande du membre par téléphone ' });

    expect(appels[0]?.body).toEqual({ unlock: true, reason: 'Demande du membre par téléphone' });
  });

  test('un refus de hiérarchie passe tel quel', async () => {
    const { transport } = transportEspion({ ok: false, status: 403, error: 'Rang insuffisant' }, false);

    expect(await unlockAdminUser({ ...deps(transport), userId: 'u-1' })).toMatchObject({ ok: false, status: 403 });
  });
});

describe('setAdminUserConsent — un consentement, un motif d’au moins dix caractères', () => {
  test('pose UN consentement et son motif sur …/consents, et rend le membre décodé (bloc adminMetadata compris)', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    const resultat = await setAdminUserConsent({
      ...deps(transport),
      userId: 'u-1',
      consent: 'voiceProfile',
      granted: true,
      reason: 'Consentement recueilli par écrit le 30 septembre',
    });

    expect(appels[0]).toEqual({
      path: '/api/v1/admin/users/u-1/consents',
      method: 'PATCH',
      body: { voiceProfile: true, reason: 'Consentement recueilli par écrit le 30 septembre' },
    });
    expect(resultat.ok && resultat.data.adminMetadata?.voiceProfileConsentAt).toBe('2026-09-30T10:00:00.000Z');
  });

  test('retirer un consentement envoie `false`', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    await setAdminUserConsent({ ...deps(transport), userId: 'u-1', consent: 'voiceCloning', granted: false, reason: 'Retrait demandé par le membre' });

    expect(appels[0]?.body).toEqual({ voiceCloning: false, reason: 'Retrait demandé par le membre' });
  });

  test('un motif trop court est refusé AVANT tout aller-retour', async () => {
    const { transport, appels } = transportEspion(MEMBRE);

    const resultat = await setAdminUserConsent({ ...deps(transport), userId: 'u-1', consent: 'voiceData', granted: true, reason: '  court  ' });

    expect(resultat).toMatchObject({ ok: false, status: 0 });
    expect(appels).toHaveLength(0);
    expect(CONSENT_MOTIVE_MIN).toBe(10);
  });

  test('l’analytique n’a AUCUNE écriture administrative : elle ne figure pas parmi les consentements posables', () => {
    expect([...ADMIN_WRITABLE_CONSENTS]).toEqual(['voiceProfile', 'voiceData', 'dataProcessing', 'voiceCloning']);
  });

  test('le rang souverain manquant revient en 403, typé', async () => {
    const { transport } = transportEspion({ ok: false, status: 403, error: 'Rang souverain requis' }, false);

    const resultat = await setAdminUserConsent({ ...deps(transport), userId: 'u-1', consent: 'voiceProfile', granted: true, reason: 'Motif suffisamment long' });

    expect(resultat).toMatchObject({ ok: false, status: 403 });
  });
});
