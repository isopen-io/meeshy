/**
 * La carte « Présence » de la supervision lit les métriques du service de statut VIVANT
 * (#8876, § 6.3) — et ce service doit être DÉCORÉ sur l'instance Fastify, sans quoi la
 * route répond `presenceUpdates: null` pour toujours et l'écran ne dessine jamais la carte.
 *
 * Deux moitiés, et la panne vivait dans l'espace entre elles : la route lisait
 * `fastify.statusService`, et `server.ts` ne le posait nulle part. Les témoins de
 * `admin-monitoring.test.ts` décorent leur propre double — ils attestaient donc la route
 * seule. Ici la route lit un VRAI `StatusService` (son vrai `getMetrics`), et un témoin de
 * source lit `server.ts` pour y trouver la décoration.
 *
 * @jest-environment node
 */

import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { describe, it, expect, jest, afterEach } from '@jest/globals';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn(), logger: { info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() } }));
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
  set: jest.fn<any>().mockResolvedValue(undefined),
  del: jest.fn<any>().mockResolvedValue(undefined),
};
jest.mock('../../../../services/CacheStore', () => ({ getCacheStore: () => cacheStore }));
jest.mock('../../../../utils/circuitBreaker', () => ({ circuitBreakerManager: { getAllStats: () => ({}) } }));

import { registerMonitoringRoutes } from '../../../../routes/admin/monitoring';
import { StatusService } from '../../../../services/StatusService';

const ACTOR_ID = '507f1f77bcf86cd799439011';
const SERVER_SOURCE = join(__dirname, '../../../../server.ts');

const services: StatusService[] = [];
afterEach(() => {
  for (const service of services.splice(0)) service.shutdown();
});

async function buildApp(decorateStatus: boolean): Promise<{ app: FastifyInstance; status: StatusService }> {
  const prisma = {
    $runCommandRaw: jest.fn<any>().mockResolvedValue({ ok: 1 }),
    user: { update: jest.fn<any>().mockResolvedValue({}) },
  };
  const status = new StatusService(prisma as never);
  services.push(status);

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('authenticate', async (request: any) => {
    request.authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: ACTOR_ID,
      registeredUser: { id: ACTOR_ID, role: 'BIGBOSS', username: 'acteur' },
    };
  });
  if (decorateStatus) app.decorate('statusService', status as never);
  registerMonitoringRoutes(app);
  await app.ready();
  return { app, status };
}

describe('GET /admin/monitoring — la présence vient du service de statut vivant', () => {
  it('sert presenceUpdates quand l’instance décore son StatusService, et la valeur suit les mises à jour réelles', async () => {
    const { app, status } = await buildApp(true);

    const before = (await app.inject({ method: 'GET', url: '/monitoring' })).json().data.presenceUpdates;
    expect(before).toEqual({ totalRequests: 0, throttledRequests: 0, throttleRate: 0, successfulUpdates: 0, failedUpdates: 0 });

    await status.updateUserLastActive('507f1f77bcf86cd799439021');
    await status.updateUserLastActive('507f1f77bcf86cd799439021');

    const after = (await app.inject({ method: 'GET', url: '/monitoring' })).json().data.presenceUpdates;
    expect(after).not.toBeNull();
    expect(after.totalRequests).toBe(2);
    expect(after.throttledRequests).toBe(1);
    expect(after.throttleRate).toBe(50);
    await app.close();
  });

  it('reste null — jamais un faux zéro — quand rien ne décore le service', async () => {
    const { app } = await buildApp(false);
    expect((await app.inject({ method: 'GET', url: '/monitoring' })).json().data.presenceUpdates).toBeNull();
    await app.close();
  });
});

describe('server.ts — il pose la décoration que la supervision lit', () => {
  const source = readFileSync(SERVER_SOURCE, 'utf8');

  it('décore `statusService` avec l’instance construite par le serveur', () => {
    expect(source).toMatch(/this\.server\.decorate\(\s*'statusService'\s*,\s*this\.statusService\s*\)/);
  });

  it('la décore une seule fois, avant que les routes soient enregistrées', () => {
    expect(source.match(/decorate\(\s*'statusService'/g)).toHaveLength(1);
    expect(source.indexOf("decorate('statusService'")).toBeLessThan(source.indexOf('await registerAllRoutes('));
  });
});
