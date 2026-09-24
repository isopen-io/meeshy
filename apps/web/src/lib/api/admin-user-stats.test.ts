import { describe, expect, test } from 'bun:test';

import {
  ADMIN_STAT_KEYS,
  adminUserStatsQueryKey,
  adminUserStatsQueryOptions,
  decodeAdminUserStats,
  loadAdminUserStats,
} from './admin-user-stats';
import type { HttpTransport } from './http';
import { persistableQuery } from './query-client';

/**
 * LES STATISTIQUES D'UN MEMBRE (#7845 C) — `GET /api/v1/admin/users/:userId/stats`,
 * sous `canViewUserDetails`. Des AGRÉGATS seuls : aucun identifiant, aucun
 * contenu — d'où une clé persistée, contrairement aux préférences.
 */

const COUNTS = Object.fromEntries(ADMIN_STAT_KEYS.map((cle, rang) => [cle, rang + 1]));

const CHARGE = {
  userId: 'u-1',
  computedAt: '2026-09-24T10:00:00.000Z',
  counts: COUNTS,
  languages: ['fr', 'en', 42],
  achievements: [{ id: 'a', name: 'x' }],
};

const transportEspion = (reponse: unknown, ok = true) => {
  const appels: { path: string; method: string }[] = [];
  const transport = {
    request: async (requete: { path: string; method: string }) => {
      appels.push({ path: requete.path, method: requete.method });
      return ok ? { ok: true as const, data: reponse } : reponse;
    },
  } as unknown as HttpTransport;
  return { transport, appels };
};

const deps = (transport: HttpTransport) => ({ source: 'gateway' as const, transport });

describe('decodeAdminUserStats', () => {
  test('décode chaque compteur servi, les langues et l’horodatage', () => {
    const stats = decodeAdminUserStats(CHARGE);

    expect(stats?.counts).toEqual(COUNTS as Record<string, number>);
    expect(stats?.languages).toEqual(['fr', 'en']);
    expect(stats?.computedAt).toBe('2026-09-24T10:00:00.000Z');
  });

  test('un compteur absent ou illisible vaut ZÉRO, un compteur inconnu n’entre pas', () => {
    const stats = decodeAdminUserStats({ ...CHARGE, counts: { messagesSent: 'beaucoup', secret: 9 } });

    expect(stats?.counts.messagesSent).toBe(0);
    expect(stats?.counts.bansActive).toBe(0);
    expect(Object.keys(stats?.counts ?? {})).toEqual([...ADMIN_STAT_KEYS]);
  });

  test('rend null sur une charge illisible', () => {
    for (const charge of [null, 'x', [], { counts: 'x' }]) {
      expect(decodeAdminUserStats(charge)).toBeNull();
    }
  });
});

describe('loadAdminUserStats', () => {
  test('vise GET /api/v1/admin/users/:id/stats, identifiant ENCODÉ', async () => {
    const { transport, appels } = transportEspion(CHARGE);

    const resultat = await loadAdminUserStats({ ...deps(transport), userId: 'u 1' });

    expect(appels[0]?.method).toBe('GET');
    expect(appels[0]?.path).toBe(`/api/v1/admin/users/${encodeURIComponent('u 1')}/stats`);
    expect(resultat.ok && resultat.data.counts.friends).toBe(COUNTS.friends);
  });

  test('une charge illisible devient un échec à status 0', async () => {
    const { transport } = transportEspion('pas un objet');

    const resultat = await loadAdminUserStats({ ...deps(transport), userId: 'u-1' });

    expect(!resultat.ok && resultat.status).toBe(0);
  });

  test('propage un refus tel quel', async () => {
    const refus = { ok: false as const, status: 404, error: 'Not found' };
    const { transport } = transportEspion(refus, false);

    expect(await loadAdminUserStats({ ...deps(transport), userId: 'u-1' })).toEqual(refus);
  });
});

describe('la clé des statistiques', () => {
  test('est rangée sous le membre et PERSISTÉE — des agrégats, rien de privé', () => {
    const clef = adminUserStatsQueryKey('u-1');

    expect(clef).toEqual(['admin', 'user', 'u-1', 'stats']);
    expect(persistableQuery({ state: { status: 'success' }, queryKey: clef })).toBe(true);
  });

  test('soixante secondes de fraîcheur, aucun nouvel essai', () => {
    const { transport } = transportEspion(CHARGE);
    const options = adminUserStatsQueryOptions(deps(transport), 'u-1');

    expect(options.staleTime).toBe(60 * 1000);
    expect(options.retry).toBe(false);
  });
});
