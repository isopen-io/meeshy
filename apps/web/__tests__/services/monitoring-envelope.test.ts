/**
 * Les DEUX enveloppes, mesurées et non supposées (#4219).
 *
 * Pourquoi ce fichier existe séparément de `monitoring.service.test.ts` : ce
 * dernier moque `apiService`, et une fabrique de mock verrouille la MAUVAISE
 * forme aussi bien que la bonne. La première version de ces sondes lisait
 * `response.data` — l'enveloppe de la passerelle — au lieu de
 * `response.data.data`, la charge ; les témoins moqués étaient VERTS, parce
 * que leur fabrique rendait la forme que le code attendait. C'est le défaut
 * exact qui a vidé quatre pages de la console d'administration
 * (`services/paginated-list.ts`), et il ne se voit pas depuis un mock.
 *
 * Ici, la seule frontière est `fetch`. Tout ce qui est en dessous est le VRAI
 * chemin : `apiService.request` (qui enveloppe le corps entier dans `.data`)
 * puis la lecture de la sonde. La forme des deux enveloppes est donc
 * MESURÉE — si l'une des deux change un jour, ce témoin tombe.
 */
jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

import { monitoringService } from '@/services/monitoring.service';

type ReponseStub = { ok: boolean; status: number; corps: unknown };

function armerFetch(reponse: ReponseStub) {
  global.fetch = jest.fn().mockResolvedValue({
    ok: reponse.ok,
    status: reponse.status,
    json: async () => reponse.corps,
    text: async () => JSON.stringify(reponse.corps),
  }) as unknown as typeof fetch;
}

/** Le corps que la passerelle sert réellement — `sendSuccess(reply, charge)`. */
const corpsPasserelle = (charge: unknown) => ({ success: true, data: charge });

beforeEach(() => jest.clearAllMocks());

describe('Les sondes traversent les deux enveloppes', () => {
  it('lit le verdict de disponibilité, pas l\'enveloppe qui le porte', async () => {
    armerFetch({ ok: true, status: 200, corps: corpsPasserelle({ status: 'ready' }) });
    await expect(monitoringService.getReadiness()).resolves.toEqual({
      etat: 'ok',
      valeur: { status: 'ready' },
    });
  });

  it('lit les métriques de processus servies par `sendSuccess`', async () => {
    armerFetch({
      ok: true,
      status: 200,
      corps: corpsPasserelle({
        uptimeSeconds: 4211,
        memory: { heapUsed: 40, heapTotal: 100, rss: 200 },
        database: { status: 'up', latencyMs: 12 },
        redis: { status: 'up', latencyMs: 3 },
        socketConnections: 7,
      }),
    });
    const res = await monitoringService.getProcessMetrics();
    expect(res.etat).toBe('ok');
    // Si une seule enveloppe était dépouillée, ces trois valeurs seraient les
    // valeurs de repli (0 / 'down' / null) — indiscernables d'un service au
    // repos, ce qui est exactement la panne muette qu'on corrige.
    expect(res.etat === 'ok' && res.valeur.socketConnections).toBe(7);
    expect(res.etat === 'ok' && res.valeur.database.latencyMs).toBe(12);
    expect(res.etat === 'ok' && res.valeur.redis.status).toBe('up');
  });

  it('lit le TABLEAU des disjoncteurs, pas l\'objet qui l\'enveloppe', async () => {
    armerFetch({
      ok: true,
      status: 200,
      corps: corpsPasserelle([
        { name: 'cacheStore', state: 'CLOSED', failures: 0, successes: 2, totalRequests: 12, lastFailure: null },
      ]),
    });
    const res = await monitoringService.getCircuitBreakers();
    // Une enveloppe de trop et `Array.isArray` échoue : la sonde rendrait une
    // liste VIDE, c'est-à-dire « tous les circuits sont opérationnels ».
    expect(res).toEqual({
      etat: 'ok',
      valeur: [{ name: 'cacheStore', state: 'CLOSED', failures: 0, successes: 2, totalRequests: 12, lastFailure: null }],
    });
  });

  it('rend l\'échec — jamais une charge vide — quand la passerelle refuse (403)', async () => {
    armerFetch({ ok: false, status: 403, corps: { success: false, error: 'Permission insuffisante : canAccessAdmin requise' } });
    const res = await monitoringService.getProcessMetrics();
    expect(res.etat).toBe('echec');
    expect(res.etat === 'echec' && res.raison).toContain('canAccessAdmin');
  });

  it('rend l\'échec quand l\'adresse n\'existe pas (404) — le défaut d\'origine', async () => {
    // C'est LE cas qui a vécu des mois : trois adresses absentes, trois 404,
    // et un écran qui se rendait vide au lieu de se rendre cassé.
    armerFetch({ ok: false, status: 404, corps: { message: 'Route GET:/api/v1/health/ready not found' } });
    const res = await monitoringService.getCircuitBreakers();
    expect(res.etat).toBe('echec');
    expect(res).not.toEqual({ etat: 'ok', valeur: [] });
  });
});
