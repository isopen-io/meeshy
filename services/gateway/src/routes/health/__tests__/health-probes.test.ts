/**
 * Garde des trois sondes de santé (#4219).
 *
 * Ce que ces témoins protègent, dans l'ordre de ce qui coûtait le plus cher :
 *
 * 1. **Les adresses EXISTENT.** Le web les appelait depuis toujours ; aucune
 *    n'était servie. Un test côté web ne pouvait pas le voir — un `apiService`
 *    moqué verrouille l'URL fausse aussi bien que la juste.
 * 2. **`/ready` est S0 et ne divulgue rien.** L'assertion est une égalité de
 *    corps ENTIER : une liste de clés interdites ne voit jamais le champ que
 *    personne n'a pensé à y écrire, et c'est exactement ainsi qu'un `build`,
 *    un `environment` ou un `userCount` finit sur une route anonyme.
 * 3. **`/metrics` et `/circuit-breakers` sont S5**, et la porte se mesure sur
 *    les SIX rôles, pas sur « un admin passe ». Les deux permissions exigées
 *    ne se distinguent qu'en ANALYST et MODERATOR : un témoin qui n'essaie que
 *    BIGBOSS et USER passerait au vert avec une seule des deux.
 */

// `getCacheStore()` construit un vrai `RedisCacheStore` — timers de nettoyage,
// tentative de connexion, enregistrement d'un disjoncteur dans le registre
// GLOBAL. Le mocker garde la suite déterministe : la table des disjoncteurs
// ne contient alors QUE ce que ce fichier y met.
jest.mock('../../../services/CacheStore', () => ({
  getCacheStore: jest.fn(),
}));

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyReply, type FastifyRequest } from 'fastify';

import { healthProbeRoutes } from '../index';
import { getCacheStore } from '../../../services/CacheStore';
import { createUnifiedAuthMiddleware } from '../../../middleware/auth';
import { CircuitBreaker, circuitBreakerManager } from '../../../utils/circuitBreaker';

const PREFIXE = '/api/v1/health';

const cacheStoreMock = getCacheStore as jest.MockedFunction<typeof getCacheStore>;

type PingBase = () => Promise<unknown>;

/** Prisma réduit à ce que les sondes lui demandent : une commande d'admin. */
function prismaAvecPing(ping: PingBase) {
  return { $runCommandRaw: jest.fn(ping) } as unknown as FastifyInstance['prisma'];
}

function storeQuiRepond(options: { disponible: boolean; leve?: boolean }) {
  return {
    isAvailable: () => options.disponible,
    get: async () => {
      if (options.leve) throw new Error('redis: connexion perdue vers cache.interne:6379');
      return null;
    },
  } as unknown as ReturnType<typeof getCacheStore>;
}

/**
 * Le harnais ANONYME monte le VRAI middleware d'authentification, celui de la
 * production (`server.ts` → `createAuthMiddleware()`). Un stub y répondrait à
 * la question qu'on pose : « un appelant sans jeton est-il rejeté ? ».
 */
async function monterAnonyme(options: {
  ping?: PingBase;
  socketIOHandler?: unknown;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const prisma = prismaAvecPing(options.ping ?? (async () => ({ ok: 1 })));
  app.decorate('prisma', prisma);
  app.decorate('authenticate', createUnifiedAuthMiddleware(prisma as never, {
    requireAuth: true,
    allowAnonymous: false,
  }));
  if (options.socketIOHandler !== undefined) app.decorate('socketIOHandler', options.socketIOHandler as never);
  await app.register(healthProbeRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

/**
 * Le harnais PAR RÔLE court-circuite l'authentification pour poser un
 * `authContext` choisi — c'est l'AUTORISATION qu'il mesure, et elle lit la
 * VRAIE matrice de permissions (`permissionsService`), jamais une copie.
 */
async function monterAvecRole(role: string, options: { ping?: PingBase; socketIOHandler?: unknown } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prismaAvecPing(options.ping ?? (async () => ({ ok: 1 }))));
  app.decorate('authenticate', async (request: FastifyRequest, _reply: FastifyReply) => {
    (request as unknown as { authContext: unknown }).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'aaaaaaaaaaaaaaaaaaaaaaaa',
      registeredUser: { id: 'aaaaaaaaaaaaaaaaaaaaaaaa', role },
    };
  });
  if (options.socketIOHandler !== undefined) app.decorate('socketIOHandler', options.socketIOHandler as never);
  await app.register(healthProbeRoutes, { prefix: PREFIXE });
  await app.ready();
  return app;
}

let ouverts: FastifyInstance[] = [];

async function ouvrirAnonyme(...args: Parameters<typeof monterAnonyme>): Promise<FastifyInstance> {
  const app = await monterAnonyme(...args);
  ouverts.push(app);
  return app;
}

async function ouvrirAvecRole(...args: Parameters<typeof monterAvecRole>): Promise<FastifyInstance> {
  const app = await monterAvecRole(...args);
  ouverts.push(app);
  return app;
}

beforeEach(() => {
  jest.clearAllMocks();
  cacheStoreMock.mockReturnValue(storeQuiRepond({ disponible: true }));
});

afterEach(async () => {
  await Promise.all(ouverts.map((app) => app.close()));
  ouverts = [];
});

// ───────────────────────────────────────────────────────────────────────────
// S0 — la sonde de disponibilité
// ───────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/health/ready — S0', () => {
  it('répond 200 à un appelant SANS aucune identité', async () => {
    const app = await ouvrirAnonyme();
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/ready` });
    expect(res.statusCode).toBe(200);
  });

  it('ne sert QUE le verdict — corps entier, aucun champ d\'infrastructure', async () => {
    const app = await ouvrirAnonyme();
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/ready` });
    // Égalité de corps ENTIER : c'est ce qui rougit le jour où quelqu'un
    // ajoute `build`, `environment`, `uptime`, `hostname` ou `userCount` —
    // une liste de clés interdites ne l'aurait pas vu.
    expect(res.json()).toEqual({ success: true, data: { status: 'ready' } });
  });

  it('répond 503 quand la base ne répond pas, sans dire pourquoi', async () => {
    const app = await ouvrirAnonyme({
      ping: async () => {
        throw new Error('P1001: cannot reach mongodb://mongo.interne:27017/meeshy');
      },
    });
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/ready` });
    expect(res.statusCode).toBe(503);
    // Le texte du pilote porte l'hôte, le port et le nom de la base. Il ne doit
    // apparaître NULLE PART dans la charge servie à un anonyme.
    expect(res.body).not.toContain('mongo.interne');
    expect(res.body).not.toContain('27017');
    expect(res.json()).toEqual({
      success: false,
      error: 'not-ready',
      message: 'not-ready',
      code: 'NOT_READY',
    });
  });

  it('mémoïse son verdict : dix appels ne font pas dix pings', async () => {
    // La sonde doit être exemptée du limiteur de débit (un 429 fait conclure
    // « instance morte » à un orchestrateur), donc elle ne peut pas toucher la
    // base une fois par paquet reçu — ce serait un amplificateur anonyme.
    const ping = jest.fn(async () => ({ ok: 1 }));
    const app = await ouvrirAnonyme({ ping });
    for (let i = 0; i < 10; i++) {
      await app.inject({ method: 'GET', url: `${PREFIXE}/ready` });
    }
    expect(ping).toHaveBeenCalledTimes(1);
  });

  it('ne partage pas son verdict entre deux enregistrements du plugin', async () => {
    // Le mémo vit dans la clôture du plugin, pas au niveau module : une
    // instance en panne ne peut pas hériter du « ready » d'une autre.
    const saine = await ouvrirAnonyme();
    await saine.inject({ method: 'GET', url: `${PREFIXE}/ready` });

    const malade = await ouvrirAnonyme({ ping: async () => { throw new Error('down'); } });
    const res = await malade.inject({ method: 'GET', url: `${PREFIXE}/ready` });
    expect(res.statusCode).toBe(503);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// S5 — la porte des deux sondes d'administration
// ───────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/health/metrics et /circuit-breakers — S5', () => {
  it.each(['/metrics', '/circuit-breakers'])('rejette un appelant anonyme sur %s', async (chemin) => {
    const app = await ouvrirAnonyme();
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}${chemin}` });
    expect([401, 403]).toContain(res.statusCode);
  });

  // Les deux permissions exigées — `canAccessAdmin` ET `canViewAnalytics` — ne
  // se distinguent qu'ici : ANALYST porte la seconde sans la première,
  // MODERATOR la première sans la seconde. Un témoin qui n'essaierait que
  // BIGBOSS et USER passerait au vert avec UNE SEULE des deux.
  const ADMIS = ['BIGBOSS', 'ADMIN', 'AUDIT'];
  const REFUSES = ['MODERATOR', 'ANALYST', 'USER'];

  it.each(ADMIS)('admet %s', async (role) => {
    const app = await ouvrirAvecRole(role);
    const metrics = await app.inject({ method: 'GET', url: `${PREFIXE}/metrics` });
    const breakers = await app.inject({ method: 'GET', url: `${PREFIXE}/circuit-breakers` });
    expect(metrics.statusCode).toBe(200);
    expect(breakers.statusCode).toBe(200);
  });

  it.each(REFUSES)('refuse %s', async (role) => {
    const app = await ouvrirAvecRole(role);
    const metrics = await app.inject({ method: 'GET', url: `${PREFIXE}/metrics` });
    const breakers = await app.inject({ method: 'GET', url: `${PREFIXE}/circuit-breakers` });
    expect(metrics.statusCode).toBe(403);
    expect(breakers.statusCode).toBe(403);
  });
});

// ───────────────────────────────────────────────────────────────────────────
// Ce que les deux sondes S5 servent réellement
// ───────────────────────────────────────────────────────────────────────────

describe('GET /api/v1/health/metrics — la charge', () => {
  it('sert la latence de base, l\'état de Redis, le tas et les connexions', async () => {
    const app = await ouvrirAvecRole('ADMIN', {
      socketIOHandler: { getConnectedUsers: () => ['a', 'b', 'c'] },
    });
    const { data } = (await app.inject({ method: 'GET', url: `${PREFIXE}/metrics` })).json();

    expect(data.database.status).toBe('up');
    expect(typeof data.database.latencyMs).toBe('number');
    expect(data.redis.status).toBe('up');
    expect(data.socketConnections).toBe(3);
    expect(data.memory.heapUsed).toBeGreaterThan(0);
    expect(data.memory.heapTotal).toBeGreaterThan(0);
    expect(typeof data.uptimeSeconds).toBe('number');
  });

  it('dit « down » sans transporter le message du pilote', async () => {
    cacheStoreMock.mockReturnValue(storeQuiRepond({ disponible: true, leve: true }));
    const app = await ouvrirAvecRole('ADMIN', {
      ping: async () => { throw new Error('P1001: mongodb://mongo.interne:27017'); },
    });
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/metrics` });
    const { data } = res.json();

    expect(data.database).toEqual({ status: 'down', latencyMs: null });
    expect(data.redis).toEqual({ status: 'down', latencyMs: null });
    // S5 n'est pas une raison de recopier l'adresse de l'infrastructure dans un
    // navigateur : les journaux du service la tiennent déjà.
    expect(res.body).not.toContain('mongo.interne');
    expect(res.body).not.toContain('cache.interne');
  });

  it('rend 0 connexion plutôt que de lever quand la couche Socket.IO n\'est pas montée', async () => {
    // Le décorateur `socketIOHandler` n'existe qu'après `setupSocketIO()`, et
    // le harnais de la garde de routes le décore avec un objet NU. Une route
    // REST ne doit pas dépendre de l'ordre d'amorçage du serveur.
    const app = await ouvrirAvecRole('ADMIN', { socketIOHandler: {} });
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/metrics` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.socketConnections).toBe(0);
  });
});

describe('GET /api/v1/health/circuit-breakers — la charge', () => {
  it('sert ce que le registre tient, avec la date du dernier échec en ISO', async () => {
    const disjoncteur = new CircuitBreaker({
      name: 'témoin',
      failureThreshold: 1,
      failureWindowMs: 1_000,
      resetTimeoutMs: 1_000,
      successThreshold: 1,
      fallback: () => null,
    });
    circuitBreakerManager.register('témoin', disjoncteur);
    await disjoncteur.execute(async () => { throw new Error('panne'); }).catch(() => undefined);

    const app = await ouvrirAvecRole('BIGBOSS');
    const { data } = (await app.inject({ method: 'GET', url: `${PREFIXE}/circuit-breakers` })).json();

    const ligne = data.find((d: { name: string }) => d.name === 'témoin');
    expect(ligne.state).toBe('OPEN');
    expect(ligne.failures).toBe(1);
    // L'écran fait `new Date(lastFailure)` : le registre tient un epoch, la
    // conversion appartient au côté qui connaît l'unité.
    expect(typeof ligne.lastFailure).toBe('string');
    expect(Number.isNaN(Date.parse(ligne.lastFailure))).toBe(false);
  });

  it('rend une liste VIDE, pas une erreur, quand aucun disjoncteur n\'est enregistré', async () => {
    const app = await ouvrirAvecRole('BIGBOSS');
    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/circuit-breakers` });
    expect(res.statusCode).toBe(200);
    expect(Array.isArray(res.json().data)).toBe(true);
  });
});
