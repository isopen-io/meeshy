jest.mock('@/utils/logger', () => ({
  logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('@/services/api.service', () => ({
  apiService: { get: jest.fn() },
}));

import { monitoringService } from '@/services/monitoring.service';
import { apiService } from '@/services/api.service';

const mockApi = apiService as jest.Mocked<typeof apiService>;

const SUCCESS = { data: { success: true, data: {} } };

/**
 * La forme RÉELLE d'une réponse, DEUX enveloppes empilées : la passerelle sert
 * `{ success, data: charge }` (`sendSuccess`), et `apiService.request` enveloppe
 * le corps ENTIER dans `.data`. La charge se lit donc à `response.data.data`.
 *
 * Ce fabricateur existe parce qu'une fabrique de mock verrouille la MAUVAISE
 * forme aussi bien que la bonne : la première version de ces témoins rendait
 * `{ data: charge }` — une enveloppe de moins — et validait un service qui
 * lisait l'enveloppe au lieu de la charge. Le même piège a fait tomber quatre
 * pages de la console (`services/paginated-list.ts`).
 */
const servi = (charge: unknown) => ({ success: true, data: { success: true, data: charge } }) as never;

beforeEach(() => jest.clearAllMocks());

// ─── getRealtime ──────────────────────────────────────────────────────────────

describe('monitoringService.getRealtime', () => {
  it('calls /admin/analytics/realtime and returns response', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    const result = await monitoringService.getRealtime();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/realtime');
    expect(result).toEqual(SUCCESS);
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('offline'));
    await expect(monitoringService.getRealtime()).rejects.toThrow('offline');
  });
});

// ─── getReadiness / getProcessMetrics / getCircuitBreakers ───────────────────
//
// AVERTISSEMENT, écrit à voix haute (#4219) : ces trois adresses ont vécu des
// mois sans exister côté serveur, et cette suite était VERTE tout du long —
// un `apiService` moqué verrouille l'URL fausse aussi bien que la juste. La
// seule garde qui pouvait trancher est celle du gateway, qui compare les
// appels littéraux du web à la table de routes du serveur ASSEMBLÉ
// (`services/gateway/src/__tests__/security/route-auth-coverage.test.ts`).
// Ce qui se prouve ICI est le CONTRAT client : une sonde ne lève pas, elle
// rend son échec — c'est ce qui empêche l'écran de confondre « rien à
// montrer » et « l'appel a échoué ».

describe('monitoringService.getReadiness', () => {
  it('appelle /health/ready et lit le verdict', async () => {
    mockApi.get.mockResolvedValue(servi({ status: 'ready' }));
    const res = await monitoringService.getReadiness();
    expect(mockApi.get).toHaveBeenCalledWith('/health/ready');
    expect(res).toEqual({ etat: 'ok', valeur: { status: 'ready' } });
  });

  it('rend « not-ready » pour tout ce qui n\'est pas explicitement prêt', async () => {
    mockApi.get.mockResolvedValue(servi({ status: 'dégradé' }));
    const res = await monitoringService.getReadiness();
    expect(res).toEqual({ etat: 'ok', valeur: { status: 'not-ready' } });
  });

  it('ne LÈVE pas quand la sonde échoue — elle rend son échec', async () => {
    mockApi.get.mockRejectedValue(new Error('Erreur serveur (404)'));
    const res = await monitoringService.getReadiness();
    expect(res).toEqual({ etat: 'echec', raison: 'Erreur serveur (404)' });
  });
});

describe('monitoringService.getProcessMetrics', () => {
  it('appelle /health/metrics et projette la charge du gateway', async () => {
    mockApi.get.mockResolvedValue(servi({
      uptimeSeconds: 4211,
      memory: { heapUsed: 40, heapTotal: 100, rss: 200 },
      database: { status: 'up', latencyMs: 12 },
      redis: { status: 'down', latencyMs: null },
      socketConnections: 7,
    }));
    const res = await monitoringService.getProcessMetrics();
    expect(mockApi.get).toHaveBeenCalledWith('/health/metrics');
    expect(res).toEqual({
      etat: 'ok',
      valeur: {
        uptimeSeconds: 4211,
        memory: { heapUsed: 40, heapTotal: 100, rss: 200 },
        database: { status: 'up', latencyMs: 12 },
        redis: { status: 'down', latencyMs: null },
        socketConnections: 7,
      },
    });
  });

  it('dégrade une charge malformée en chiffres neutres, sans lever', async () => {
    // Un client qui LIT ne se protège pas avec le contrat de l'émetteur : une
    // charge cassée doit dégrader un chiffre, jamais casser l'onglet entier.
    mockApi.get.mockResolvedValue(servi({ memory: null, database: 'oui' }));
    const res = await monitoringService.getProcessMetrics();
    expect(res).toEqual({
      etat: 'ok',
      valeur: {
        uptimeSeconds: 0,
        memory: { heapUsed: 0, heapTotal: 0, rss: 0 },
        database: { status: 'down', latencyMs: null },
        redis: { status: 'down', latencyMs: null },
        socketConnections: 0,
      },
    });
  });

  it('ne LÈVE pas quand la sonde échoue', async () => {
    mockApi.get.mockRejectedValue(new Error('Erreur serveur (403)'));
    await expect(monitoringService.getProcessMetrics()).resolves.toEqual({
      etat: 'echec',
      raison: 'Erreur serveur (403)',
    });
  });
});

describe('monitoringService.getCircuitBreakers', () => {
  it('appelle /health/circuit-breakers et normalise chaque ligne', async () => {
    mockApi.get.mockResolvedValue(servi([
      { name: 'cacheStore', state: 'OPEN', failures: 3, successes: 1, totalRequests: 9, lastFailure: '2026-08-29T10:00:00.000Z' },
    ]));
    const res = await monitoringService.getCircuitBreakers();
    expect(mockApi.get).toHaveBeenCalledWith('/health/circuit-breakers');
    expect(res).toEqual({
      etat: 'ok',
      valeur: [{ name: 'cacheStore', state: 'OPEN', failures: 3, successes: 1, totalRequests: 9, lastFailure: '2026-08-29T10:00:00.000Z' }],
    });
  });

  it('rend une liste VIDE quand la charge n\'est pas un tableau', async () => {
    mockApi.get.mockResolvedValue(servi({ oups: true }));
    await expect(monitoringService.getCircuitBreakers()).resolves.toEqual({ etat: 'ok', valeur: [] });
  });

  it('ne LÈVE pas quand la sonde échoue — et « échec » n\'est PAS « liste vide »', async () => {
    // Le cœur du défaut : l'écran affichait « tous les circuits sont
    // opérationnels » sur un appel qui n'avait jamais abouti. Les deux cas
    // doivent être des VALEURS différentes, pas la même absence.
    mockApi.get.mockRejectedValue(new Error('Erreur serveur (401)'));
    const res = await monitoringService.getCircuitBreakers();
    expect(res).toEqual({ etat: 'echec', raison: 'Erreur serveur (401)' });
    expect(res).not.toEqual({ etat: 'ok', valeur: [] });
  });
});

// ─── getKpis ──────────────────────────────────────────────────────────────────

describe('monitoringService.getKpis', () => {
  it('calls /admin/analytics/kpis with default period 7d', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getKpis();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/kpis', { period: '7d' });
  });

  it('accepts custom period', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getKpis('30d');
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/kpis', { period: '30d' });
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('error'));
    await expect(monitoringService.getKpis()).rejects.toThrow('error');
  });
});

// ─── getVolumeTimeline ────────────────────────────────────────────────────────

describe('monitoringService.getVolumeTimeline', () => {
  it('calls /admin/analytics/volume-timeline', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getVolumeTimeline();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/volume-timeline');
  });
});

// ─── getLanguageDistribution ──────────────────────────────────────────────────

describe('monitoringService.getLanguageDistribution', () => {
  it('calls /admin/analytics/language-distribution', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getLanguageDistribution();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/language-distribution');
  });
});

// ─── getUserDistribution ──────────────────────────────────────────────────────

describe('monitoringService.getUserDistribution', () => {
  it('calls /admin/analytics/user-distribution', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getUserDistribution();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/user-distribution');
  });
});

// ─── getHourlyActivity ────────────────────────────────────────────────────────

describe('monitoringService.getHourlyActivity', () => {
  it('calls /admin/analytics/hourly-activity', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getHourlyActivity();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/hourly-activity');
  });
});

// ─── getMessageTypes ──────────────────────────────────────────────────────────

describe('monitoringService.getMessageTypes', () => {
  it('calls /admin/analytics/message-types with default period 7d', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getMessageTypes();
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/message-types', { period: '7d' });
  });

  it('accepts custom period', async () => {
    mockApi.get.mockResolvedValue(SUCCESS as any);
    await monitoringService.getMessageTypes('24h');
    expect(mockApi.get).toHaveBeenCalledWith('/admin/analytics/message-types', { period: '24h' });
  });

  it('throws on API failure', async () => {
    mockApi.get.mockRejectedValue(new Error('error'));
    await expect(monitoringService.getMessageTypes()).rejects.toThrow('error');
  });
});
