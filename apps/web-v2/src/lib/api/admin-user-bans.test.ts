import { describe, expect, test } from 'bun:test';

import { banAdminUser, decodeAdminBans, liftAdminUserBan } from './admin-user-bans';
import type { HttpTransport } from './http';

/**
 * BANNIR, LEVER, LISTER (#6819) — `POST …/ban`, `POST …/bans/:banId/lift`,
 * `GET …/bans`.
 *
 * Trois traits du contrat sont gardés ici, parce qu'aucun ne se devine :
 *
 * 1. **Le motif est OBLIGATOIRE** (min 3 caractères) là où le `PATCH`
 *    d'édition le laisse facultatif. Un bannissement sans motif ne se
 *    justifierait devant personne — la passerelle le refuse, on le refuse
 *    avant elle.
 * 2. **`expiresAt` absent ou `null` = PERMANENT**, et une échéance PASSÉE est
 *    refusée : « un ban déjà expiré à la création n'est jamais l'intention
 *    d'un admin ».
 * 3. **`expiresAt` n'est pas `liftedAt`.** Le schéma le dit : un ban expiré
 *    mais non levé reste en base tel quel ; `liftedAt` ne s'écrit que sur un
 *    geste explicite. Trois états existent donc — en vigueur, expiré, levé —
 *    et les confondre ferait disparaître de l'écran un bannissement qu'aucun
 *    administrateur n'a levé.
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
const DEMAIN = new Date(Date.now() + 86_400_000).toISOString();
const HIER = new Date(Date.now() - 86_400_000).toISOString();

describe('banAdminUser — le motif est obligatoire, l’échéance regarde devant', () => {
  test('vise POST /api/v1/admin/users/:userId/ban, identifiant ENCODÉ', async () => {
    const { transport, appels } = transportEspion({ id: 'b-1', reason: 'spam' });

    await banAdminUser({ ...deps(transport), userId: 'u 1/x', reason: 'spam répété' });

    expect(appels[0]?.method).toBe('POST');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1/x')}/ban`);
  });

  test('REFUSE avant l’aller-retour un motif de moins de trois caractères', async () => {
    const { transport, appels } = transportEspion({ id: 'b-1' });

    const resultat = await banAdminUser({ ...deps(transport), userId: 'u-1', reason: 'ab' });

    expect(resultat.ok).toBe(false);
    expect(appels).toHaveLength(0);
  });

  test('REFUSE avant l’aller-retour une échéance déjà passée', async () => {
    const { transport, appels } = transportEspion({ id: 'b-1' });

    const resultat = await banAdminUser({ ...deps(transport), userId: 'u-1', reason: 'spam répété', expiresAt: HIER });

    expect(resultat.ok).toBe(false);
    expect(appels).toHaveLength(0);
  });

  test('un bannissement PERMANENT n’envoie pas d’échéance', async () => {
    const { transport, appels } = transportEspion({ id: 'b-1' });

    await banAdminUser({ ...deps(transport), userId: 'u-1', reason: 'spam répété' });

    expect(appels[0]?.body).toEqual({ reason: 'spam répété' });
  });

  test('un bannissement DATÉ porte son échéance', async () => {
    const { transport, appels } = transportEspion({ id: 'b-1' });

    await banAdminUser({ ...deps(transport), userId: 'u-1', reason: 'spam répété', expiresAt: DEMAIN });

    expect((appels[0]?.body as Record<string, unknown>).expiresAt).toBe(DEMAIN);
  });
});

describe('liftAdminUserBan — lever n’exige aucun motif', () => {
  test('vise POST /api/v1/admin/users/:userId/bans/:banId/lift, les DEUX identifiants encodés', async () => {
    const { transport, appels } = transportEspion({ id: 'b-1' });

    await liftAdminUserBan({ ...deps(transport), userId: 'u/1', banId: 'b/2' });

    expect(appels[0]?.path).toBe(
      `/api/v1/admin/users/${encodeURIComponent('u/1')}/bans/${encodeURIComponent('b/2')}/lift`,
    );
  });

  test('omet `reason` quand il est absent ou blanc, le porte sinon', async () => {
    const { transport, appels } = transportEspion({ id: 'b-1' });

    await liftAdminUserBan({ ...deps(transport), userId: 'u-1', banId: 'b-1' });
    await liftAdminUserBan({ ...deps(transport), userId: 'u-1', banId: 'b-1', reason: '  ' });
    await liftAdminUserBan({ ...deps(transport), userId: 'u-1', banId: 'b-1', reason: 'erreur de ma part' });

    expect(appels[0]?.body).toEqual({});
    expect(appels[1]?.body).toEqual({});
    expect((appels[2]?.body as Record<string, unknown>).reason).toBe('erreur de ma part');
  });
});

describe('decodeAdminBans — trois états, et `active` vient du SERVEUR', () => {
  test('garde `active` tel que servi — jamais recalculé côté client', () => {
    const bans = decodeAdminBans([
      { id: 'b-1', reason: 'spam', createdAt: '2026-09-01T00:00:00.000Z', expiresAt: null, liftedAt: null, active: true },
      { id: 'b-2', reason: 'test', createdAt: '2026-08-01T00:00:00.000Z', expiresAt: HIER, liftedAt: null, active: false },
    ]);

    expect(bans.map((b) => b.active)).toEqual([true, false]);
  });

  test('un ban EXPIRÉ non levé garde `liftedAt` à null — il ne disparaît pas', () => {
    const [ban] = decodeAdminBans([
      { id: 'b-2', reason: 'test', createdAt: '2026-08-01T00:00:00.000Z', expiresAt: HIER, liftedAt: null, active: false },
    ]);

    expect(ban?.expiresAt).toBe(HIER);
    expect(ban?.liftedAt).toBeNull();
  });

  test('un ban LEVÉ porte sa date et son motif de levée', () => {
    const [ban] = decodeAdminBans([
      {
        id: 'b-3',
        reason: 'spam',
        createdAt: '2026-08-01T00:00:00.000Z',
        expiresAt: null,
        liftedAt: '2026-09-01T00:00:00.000Z',
        liftReason: 'erreur',
        active: false,
      },
    ]);

    expect(ban?.liftedAt).toBe('2026-09-01T00:00:00.000Z');
    expect(ban?.liftReason).toBe('erreur');
  });

  test('écarte les entrées sans identifiant, garde les autres', () => {
    expect(decodeAdminBans([{ reason: 'sans id' }, { id: 'b-1', reason: 'spam', active: true }])).toHaveLength(1);
    expect(decodeAdminBans(null)).toEqual([]);
  });
});
