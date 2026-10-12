import fs from 'node:fs';
import path from 'node:path';
import Fastify, { type FastifyInstance } from 'fastify';
import { configRoutes } from '../../routes/config';
import { deliveryRoutes } from '../../routes/delivery';
import { readingRoutes } from '../../routes/reading';
import { INTERNAL_TOKEN_HEADER, INTERNAL_TOKEN_MIN_LENGTH } from '../../routes/internal-auth';
import { installInternalGuard } from '../../routes/internal-guard';

// #10242 — le service agent était publié par Traefik sur staging, sans authentification.
// Défense en profondeur : TOUTE route de l'agent, sauf la sonde `/health`, exige le secret
// interne partagé passerelle → agent (`AGENT_INTERNAL_TOKEN`, en-tête `x-meeshy-internal-token`),
// comparé à temps constant. Sans secret configuré, l'agent refuse tout (503) : jamais ouvert
// faute de configuration.

const TOKEN = 'k'.repeat(INTERNAL_TOKEN_MIN_LENGTH) + '-staging';
const OBJECT_ID = '0123456789abcdef01234567';

type Route = { method: string; url: string };

/** Les VRAIES routes de l'agent, montées sur des dépendances inertes : la garde doit répondre avant elles. */
async function app(internalToken: string | undefined): Promise<{ instance: FastifyInstance; routes: Route[] }> {
  const instance = Fastify();
  const routes: Route[] = [];
  instance.addHook('onRoute', (r) => {
    for (const method of [r.method].flat()) if (method !== 'HEAD') routes.push({ method, url: r.url });
  });
  installInternalGuard(instance, { internalToken });
  instance.get('/health', async () => ({ status: 'ok' }));
  instance.get('/debug/zmq-status', async () => ({ zmqListenerAlive: true }));
  const inert = {} as never;
  instance.register((i) => configRoutes(i, inert, inert, inert));
  instance.register((i) => deliveryRoutes(i, inert));
  instance.register((i) => readingRoutes(i, inert));
  await instance.ready();
  return { instance, routes };
}

const concrete = (url: string) =>
  url.replace(':conversationId', OBJECT_ID).replace(':id', 'item-1') + (url.includes('range-summary') ? '?fromMessageId=a&toMessageId=b' : '');

const call = (instance: FastifyInstance, route: Route, token?: string) =>
  instance.inject({
    method: route.method as 'GET',
    url: concrete(route.url),
    payload: route.method === 'GET' || route.method === 'DELETE' ? undefined : { global: true, content: 'x' },
    headers: token === undefined ? {} : { [INTERNAL_TOKEN_HEADER]: token },
  });

describe("toute route de l'agent, sauf /health, n'est ouverte qu'à la passerelle (#10242)", () => {
  let guarded: Route[];
  let open: FastifyInstance;
  let closed: FastifyInstance;

  beforeAll(async () => {
    const configured = await app(TOKEN);
    open = configured.instance;
    guarded = configured.routes.filter((r) => r.url !== '/health');
    closed = (await app(undefined)).instance;
  });

  afterAll(async () => {
    await open.close();
    await closed.close();
  });

  it('couvre réellement les routes de l’agent (le témoin ne peut pas être vide)', () => {
    expect(guarded.map((r) => `${r.method} ${r.url}`).sort()).toEqual(
      [
        'DELETE /api/agent/delivery-queue/:id',
        'GET /api/agent/conversations/:conversationId/range-summary',
        'GET /api/agent/delivery-queue',
        'GET /debug/zmq-status',
        'PATCH /api/agent/delivery-queue/:id',
        'POST /api/agent/cache/invalidate',
        'POST /api/agent/config/:conversationId/stop',
      ].sort(),
    );
  });

  it('sans en-tête : 401 sur chaque route', async () => {
    for (const route of guarded) {
      const res = await call(open, route);
      expect({ route: `${route.method} ${route.url}`, status: res.statusCode }).toEqual({ route: `${route.method} ${route.url}`, status: 401 });
      expect(res.json()).toEqual({ success: false, message: 'unauthorized' });
    }
  });

  it('avec un mauvais secret (même longueur, préfixe, vide) : 401 sur chaque route', async () => {
    for (const route of guarded) {
      for (const wrong of ['', TOKEN.slice(0, -1) + 'X', TOKEN.slice(0, -1), TOKEN + 'x', TOKEN.toUpperCase()]) {
        expect((await call(open, route, wrong)).statusCode).toBe(401);
      }
    }
  });

  it('avec le bon secret : la garde laisse passer jusqu’au gestionnaire de la route', async () => {
    for (const route of guarded) {
      expect([401, 503]).not.toContain((await call(open, route, TOKEN)).statusCode);
    }
  });

  it('secret absent côté agent : 503 sur chaque route, même avec un en-tête (fermé, jamais ouvert)', async () => {
    for (const route of guarded) {
      for (const presented of [undefined, TOKEN, '']) {
        const res = await call(closed, route, presented);
        expect(res.statusCode).toBe(503);
        expect(res.json()).toEqual({ success: false, message: 'internal-auth-not-configured' });
      }
    }
  });

  it.each([['vide', ''], ['blanc', '    '], ['trop court', 'x'.repeat(INTERNAL_TOKEN_MIN_LENGTH - 1)]])(
    'secret %s côté agent : fermé (503)',
    async (_label, configured) => {
      const { instance } = await app(configured);
      const res = await call(instance, { method: 'GET', url: '/api/agent/delivery-queue' }, configured);
      expect(res.statusCode).toBe(503);
      await instance.close();
    },
  );

  it('une route inconnue est refusée avant le 404 : la garde ne révèle pas la carte des routes', async () => {
    expect((await open.inject({ method: 'GET', url: '/api/agent/nope' })).statusCode).toBe(401);
    expect((await closed.inject({ method: 'GET', url: '/api/agent/nope' })).statusCode).toBe(503);
  });

  it('/health reste ouverte (sonde Docker), avec ou sans secret configuré', async () => {
    expect((await open.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await closed.inject({ method: 'GET', url: '/health' })).statusCode).toBe(200);
    expect((await open.inject({ method: 'GET', url: '/health?x=1' })).statusCode).toBe(200);
  });

  it('seule la sonde exacte est exemptée : un chemin qui la contient reste gardé', async () => {
    for (const url of ['/health/', '/healthz', '/health/../api/agent/delivery-queue', '/api/agent/delivery-queue?/health', '//health']) {
      expect([401, 404]).toContain((await open.inject({ method: 'GET', url })).statusCode);
      expect((await open.inject({ method: 'GET', url })).statusCode).not.toBe(200);
    }
  });

  it('une valeur en tableau (en-tête dupliqué) est refusée', async () => {
    const res = await open.inject({
      method: 'GET',
      url: '/api/agent/delivery-queue',
      headers: { [INTERNAL_TOKEN_HEADER]: [TOKEN, TOKEN] as unknown as string },
    });
    expect(res.statusCode).toBe(401);
  });

  it('le refus ne renvoie jamais le secret', async () => {
    const res = await call(open, { method: 'GET', url: '/api/agent/delivery-queue' }, 'wrong');
    expect(res.body).not.toContain(TOKEN);
  });
});

describe('server.ts installe la garde avant toute route', () => {
  const source = fs.readFileSync(path.resolve(__dirname, '..', '..', 'server.ts'), 'utf8');

  it('appelle installInternalGuard avec env.AGENT_INTERNAL_TOKEN, avant la première route déclarée', () => {
    const guard = source.indexOf('installInternalGuard(server, { internalToken: env.AGENT_INTERNAL_TOKEN })');
    const firstRoute = Math.min(
      ...['server.get(', 'server.post(', 'server.register('].map((s) => source.indexOf(s)).filter((i) => i >= 0),
    );
    expect(guard).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(firstRoute);
  });
});
