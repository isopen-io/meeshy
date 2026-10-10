/**
 * `GET /admin/monitoring` — la supervision de la plateforme en UNE lecture
 * (#8876, § 6.3).
 *
 * Ce que ces témoins gardent :
 *  - la PORTE : `canAccessAdmin` + `canViewAnalytics` + rang d'administration —
 *    AUDIT passe les deux permissions mais pas le rang, MODERATOR aucune ;
 *  - la COMPOSITION : les chiffres viennent des MÊMES sondes que
 *    `/health/metrics` et `/health/circuit-breakers` (aucun appel HTTP interne),
 *    de `socketio/stats` et des métriques de présence ;
 *  - la PRUDENCE : une dépendance qui tombe est annoncée « down » SANS le texte
 *    d'erreur du pilote (hôte, port, nom de base) ; un compte qu'on ne sait pas
 *    lire est `null`, jamais un faux zéro.
 *
 * @jest-environment node
 */

import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn<any>().mockReturnValue({
      info: jest.fn<any>(),
      warn: jest.fn<any>(),
      error: jest.fn<any>(),
      debug: jest.fn<any>(),
    }),
  },
}));

const cacheStore = {
  isAvailable: jest.fn<any>().mockReturnValue(true),
  get: jest.fn<any>().mockResolvedValue(null),
};
jest.mock('../../../../services/CacheStore', () => ({ getCacheStore: () => cacheStore }));

const breakerStats = jest.fn<any>();
jest.mock('../../../../utils/circuitBreaker', () => ({
  circuitBreakerManager: { getAllStats: () => breakerStats() },
}));

import { registerMonitoringRoutes } from '../../../../routes/admin/monitoring';

const ACTOR_ID = '507f1f77bcf86cd799439011';

const TRANSLATION_STATS = {
  messages_saved: 10,
  translation_requests_sent: 120,
  translations_received: 118,
  errors: 2,
  pool_full_rejections: 1,
  avg_processing_time: 84.5,
  uptime_seconds: 3600,
  memory_usage_mb: 512,
  cache_hits: 90,
  cache_misses: 30,
  cache_hit_rate: 0.75,
};

const SOCKET_STATS = {
  total_connections: 900,
  active_connections: 41,
  messages_processed: 12000,
  translations_sent: 8000,
  errors: 3,
  connected_users: 37,
  translation_service_stats: TRANSLATION_STATS,
};

type Options = {
  role?: string | null;
  dbError?: Error;
  cacheUp?: boolean;
  socket?: boolean;
  status?: boolean;
  statusMetrics?: Record<string, number>;
  /** `translationService.healthCheck()` : sa réponse, ou `'pend'` pour une sonde qui ne répond jamais. */
  health?: boolean | 'pend' | 'throw';
};

const STATUS_METRICS = {
  totalRequests: 200,
  throttledRequests: 50,
  successfulUpdates: 140,
  failedUpdates: 10,
  cacheSize: 7,
  activityUpdates: 100,
  connectionUpdates: 50,
};

async function buildApp({
  role = 'BIGBOSS',
  dbError,
  cacheUp = true,
  socket = true,
  status = false,
  statusMetrics = STATUS_METRICS,
  health = true,
}: Options = {}) {
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', {
    $runCommandRaw: jest.fn<any>(async () => {
      if (dbError) throw dbError;
      return { ok: 1 };
    }),
  } as any);
  app.decorate('authenticate', async (request: any) => {
    if (role === null) return;
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ACTOR_ID,
      registeredUser: { id: ACTOR_ID, role, username: 'acteur' },
    };
  });
  cacheStore.isAvailable.mockReturnValue(cacheUp);
  if (socket) {
    app.decorate('socketIOHandler', {
      getConnectedUsers: () => ['u1', 'u2', 'u3'],
      getManager: () => ({ getStats: () => SOCKET_STATS }),
    } as any);
  }
  if (status) {
    app.decorate('statusService', { getMetrics: () => statusMetrics } as any);
  }
  app.decorate('translationService', {
    healthCheck: async () => {
      if (health === 'pend') return new Promise<boolean>(() => undefined);
      if (health === 'throw') throw new Error('zmq down');
      return health;
    },
  } as any);
  registerMonitoringRoutes(app);
  await app.ready();
  return app;
}

const read = (app: FastifyInstance) => app.inject({ method: 'GET', url: '/monitoring' });

describe('GET /admin/monitoring — qui a le droit', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    breakerStats.mockReturnValue({});
  });

  it.each(['BIGBOSS', 'ADMIN'])('sert un %s', async (role) => {
    const app = await buildApp({ role });
    expect((await read(app)).statusCode).toBe(200);
    await app.close();
  });

  it.each(['AUDIT', 'MODERATOR', 'ANALYST', 'USER'])(
    'refuse un %s — il faut les deux permissions ET le rang d’administration',
    async (role) => {
      const app = await buildApp({ role });
      expect((await read(app)).statusCode).toBe(403);
      await app.close();
    }
  );

  it('refuse 401 sans contexte d’authentification', async () => {
    const app = await buildApp({ role: null });
    expect((await read(app)).statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /admin/monitoring — ce qu’il sert', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    breakerStats.mockReturnValue({
      translator: { state: 'CLOSED', failures: 0, successes: 12, totalRequests: 12 },
      push: { state: 'OPEN', failures: 5, successes: 1, totalRequests: 6, lastFailureTime: Date.parse('2026-09-30T09:00:00.000Z') },
    });
  });

  it('compose la passerelle, les dépendances, le temps réel, la traduction, les disjoncteurs et la présence', async () => {
    const app = await buildApp({ status: true });
    const body = JSON.parse((await read(app)).body);
    const data = body.data;

    expect(body.success).toBe(true);
    expect(Object.keys(data).sort()).toEqual(
      ['backups', 'circuitBreakers', 'database', 'gateway', 'generatedAt', 'presenceUpdates', 'realtime', 'redis', 'translator'].sort()
    );
    expect(Number.isNaN(Date.parse(data.generatedAt))).toBe(false);

    expect(Object.keys(data.gateway).sort()).toEqual(['memory', 'uptimeSeconds']);
    expect(Object.keys(data.gateway.memory).sort()).toEqual(['heapTotal', 'heapUsed', 'rss']);
    expect(data.gateway.uptimeSeconds).toBeGreaterThanOrEqual(0);

    expect(data.database).toMatchObject({ status: 'up' });
    expect(typeof data.database.latencyMs).toBe('number');
    expect(data.redis).toMatchObject({ status: 'up' });

    expect(data.realtime).toEqual({
      connections: 41,
      connectedUsers: 37,
      messagesProcessed: 12000,
      translationsSent: 8000,
      errors: 3,
    });

    expect(data.translator).toEqual({
      requestsSent: 120,
      received: 118,
      errors: 2,
      poolFullRejections: 1,
      avgProcessingTimeMs: 84.5,
      cacheHitRate: 0.75,
      memoryUsageMb: 512,
      uptimeSeconds: 3600,
      reachable: true,
    });

    expect(data.circuitBreakers).toEqual([
      { name: 'translator', state: 'CLOSED', failures: 0, successes: 12, totalRequests: 12, lastFailureAt: null },
      { name: 'push', state: 'OPEN', failures: 5, successes: 1, totalRequests: 6, lastFailureAt: '2026-09-30T09:00:00.000Z' },
    ]);

    expect(data.presenceUpdates).toEqual({
      totalRequests: 200,
      throttledRequests: 50,
      throttleRate: 25,
      successfulUpdates: 140,
      failedUpdates: 10,
    });
    await app.close();
  });

  it('annonce une dépendance tombée « down » sans jamais servir le texte d’erreur du pilote', async () => {
    const app = await buildApp({
      dbError: new Error('connect ECONNREFUSED mongodb://admin:secret@db.interne:27017/meeshy'),
      cacheUp: false,
    });
    const res = await read(app);
    const data = JSON.parse(res.body).data;

    expect(data.database).toEqual({ status: 'down', latencyMs: null });
    expect(data.redis).toEqual({ status: 'down', latencyMs: null });
    expect(res.body).not.toMatch(/ECONNREFUSED|db\.interne|secret|27017/);
    await app.close();
  });

  it('sans gestionnaire Socket.IO, le temps réel retombe aux connexions comptées et la traduction est inconnue (null)', async () => {
    const app = await buildApp({ socket: false });
    const data = JSON.parse((await read(app)).body).data;

    expect(data.realtime).toEqual({ connections: 0, connectedUsers: 0, messagesProcessed: 0, translationsSent: 0, errors: 0 });
    expect(data.translator).toBeNull();
    await app.close();
  });

  it('les métriques de présence sont null tant qu’aucun service de statut vivant n’est exposé — jamais un faux zéro', async () => {
    const app = await buildApp({ status: false });
    expect(JSON.parse((await read(app)).body).data.presenceUpdates).toBeNull();
    await app.close();
  });

  it('un taux d’écrêtage sans aucune demande vaut 0, pas NaN', async () => {
    const app = await buildApp({
      status: true,
      statusMetrics: { ...STATUS_METRICS, totalRequests: 0, throttledRequests: 0 },
    });
    const { presenceUpdates } = JSON.parse((await read(app)).body).data;
    expect(presenceUpdates.throttleRate).toBe(0);
    await app.close();
  });

  // Un vrai signal de santé (audit 2026-10-04) : les compteurs disent ce que
  // le traducteur A FAIT, pas s'il RÉPOND maintenant.
  it.each([
    ['répond', true, true],
    ['répond non', false, false],
    ['lève', 'throw' as const, false],
    ['ne répond jamais — le délai court tranche', 'pend' as const, false],
  ])('translator.reachable quand la sonde %s', async (_nom, health, attendu) => {
    const app = await buildApp({ health });
    const debut = Date.now();
    const data = JSON.parse((await read(app)).body).data;
    expect(data.translator.reachable).toBe(attendu);
    expect(Date.now() - debut).toBeLessThan(5000);
    await app.close();
  });

  it('une liste de disjoncteurs vide est servie comme un tableau vide', async () => {
    breakerStats.mockReturnValue({});
    const app = await buildApp();
    expect(JSON.parse((await read(app)).body).data.circuitBreakers).toEqual([]);
    await app.close();
  });
});

/**
 * La carte des SAUVEGARDES (#9668) — lue d'`etat.json`, monté en lecture seule.
 * Elle traverse le VRAI sérialiseur : un champ que le schéma de réponse ne
 * déclare pas serait supprimé en silence, et ces témoins le verraient.
 */
describe('GET /admin/monitoring — la carte des sauvegardes', () => {
  const VERDICT = {
    generatedAt: '2026-10-08T22:14:03Z',
    status: 'failed',
    reason: 'mongodump (voir base/mongodump.log)',
    lastSuccessAt: '2026-10-07T22:12:40Z',
    lastSuccess: {
      documents: 922_366,
      collections: 61,
      mismatches: 0,
      indexes: 519,
      archiveBytes: 1_234_567_890,
      durationSeconds: 412,
      volumes: [{ name: 'meeshy_gateway_uploads', bytes: 19_000_000_000 }],
    },
  };
  let dir: string;
  const previous = process.env.BACKUP_STATUS_FILE;

  beforeEach(() => {
    jest.clearAllMocks();
    breakerStats.mockReturnValue({});
    dir = mkdtempSync(path.join(tmpdir(), 'monitoring-backups-'));
    process.env.BACKUP_STATUS_FILE = path.join(dir, 'etat.json');
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
    if (previous === undefined) delete process.env.BACKUP_STATUS_FILE;
    else process.env.BACKUP_STATUS_FILE = previous;
  });

  it('sert le dernier verdict, la dernière réussite, son âge et la prochaine échéance', async () => {
    writeFileSync(process.env.BACKUP_STATUS_FILE as string, JSON.stringify(VERDICT));
    const app = await buildApp();
    const { backups } = JSON.parse((await read(app)).body).data;

    expect(Object.keys(backups).sort()).toEqual(
      ['ageSeconds', 'checkedAt', 'lastSuccess', 'lastSuccessAt', 'nextRunAt', 'reason', 'stale', 'status'].sort()
    );
    expect(backups).toMatchObject({
      status: 'failed',
      checkedAt: '2026-10-08T22:14:03Z',
      reason: 'mongodump (voir base/mongodump.log)',
      lastSuccessAt: '2026-10-07T22:12:40Z',
      lastSuccess: VERDICT.lastSuccess,
    });
    expect(typeof backups.ageSeconds).toBe('number');
    expect(typeof backups.stale).toBe('boolean');
    expect(Number.isNaN(Date.parse(backups.nextRunAt))).toBe(false);
    await app.close();
  });

  it('vaut null quand le fichier est absent — « inconnu », la carte ne se dessine pas', async () => {
    const app = await buildApp();
    expect(JSON.parse((await read(app)).body).data.backups).toBeNull();
    await app.close();
  });

  it('vaut null quand le fichier est hors schéma, et n’en sert rien', async () => {
    writeFileSync(process.env.BACKUP_STATUS_FILE as string, JSON.stringify({ ...VERDICT, status: 'peut-etre', host: '/opt/meeshy' }));
    const app = await buildApp();
    const res = await read(app);
    expect(JSON.parse(res.body).data.backups).toBeNull();
    expect(res.body).not.toContain('/opt/meeshy');
    await app.close();
  });
});
