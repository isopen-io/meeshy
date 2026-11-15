/**
 * Tests — issue #4171, critère 3 et témoin 5(b).
 *
 * `/sync` était compté par `global:${request.ip}` — le seau plateforme
 * (300/min), partagé par TOUS les appelants derrière la même sortie NAT.
 * `/sync` est justement le canal de RATTRAPAGE au réveil : tous les appareils
 * d'un même foyer/bureau y arrivent ensemble, et un seau par IP punissait
 * l'usage NOMINAL. Le débit est désormais compté par COMPTE — `callerRateKey`
 * (`utils/client-rate-key.ts`), 60/min — QUE le compte soit inscrit
 * (`User.id`) ou une session anonyme (`Participant.id` : c'est CE que porte
 * `authContext.userId` pour ce cas, `middleware/auth.ts`).
 *
 * Le rate-limiter n'est PAS mocké ici (à l'inverse des deux autres suites de
 * ce lot) : c'est lui qu'on prouve. `createCustomRateLimiter` retombe sur un
 * `MemoryStore` en l'absence de Redis (`fastify.redis: null` ci-dessous), et
 * cette instance est créée UNE fois par `syncRoutes()` — donc partagée par
 * tous les `app.inject()` d'un même `app`, ce qui permet d'accumuler un
 * compteur réel sur plusieurs appels sans horloge simulée.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_A = '507f1f77bcf86cd799439a01';
const USER_B = '507f1f77bcf86cd799439b02';
/** Un `Participant.id` — c'est CE que porte `authContext.userId` d'un anonyme. */
const ANON_PARTICIPANT = '507f1f77bcf86cd799439c03';

type TestAuthContext = { userId: string; type: 'user' | 'anonymous'; participantId?: string };

let mockAuthContext: TestAuthContext = { userId: USER_A, type: 'user' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, _options: unknown) =>
    async (req: FastifyRequest) => {
      (req as unknown as { authContext: TestAuthContext }).authContext = mockAuthContext;
    },
}));

import { syncRoutes } from '../../../routes/sync';

function makePrisma() {
  return {
    // Fixture volontairement VIDE : le débit se prouve sur le STATUT des
    // réponses, pas sur leur contenu — une page vide est le chemin le plus
    // court à travers le handler, donc le plus rapide à répéter 60+ fois.
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
  } as any;
}

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', makePrisma() as never);
  app.decorate('redis', null as never); // pas de Redis en test ⇒ MemoryStore, isolé par app/test
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';
const URL = `/sync?since=${SINCE}&collections=conversations`;

/** Injecte `n` requêtes SOUS L'IDENTITÉ donnée sur le MÊME `app` (donc le même
 *  `MemoryStore`), et rend les codes de statut dans l'ordre. */
async function injectAs(app: FastifyInstance, authContext: TestAuthContext, n: number): Promise<number[]> {
  const statuses: number[] = [];
  for (let i = 0; i < n; i++) {
    mockAuthContext = authContext;
    const res = await app.inject({ method: 'GET', url: URL });
    statuses.push(res.statusCode);
  }
  return statuses;
}

describe('GET /sync — critère 3 : débit par COMPTE, 60/min', () => {
  it('60 appels d’un même compte passent tous, le 61e est refusé (429)', async () => {
    const app = await buildApp();
    const statuses = await injectAs(app, { userId: USER_A, type: 'user' }, 61);

    expect(statuses.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(statuses[60]).toBe(429);
    await app.close();
  }, 20_000);

  it('le 429 porte le contrat d’erreur — `Retry-After` et un code exploitable', async () => {
    const app = await buildApp();
    await injectAs(app, { userId: USER_B, type: 'user' }, 60);
    mockAuthContext = { userId: USER_B, type: 'user' };
    const res = await app.inject({ method: 'GET', url: URL });

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBeTruthy();
    const body = res.json();
    expect(body.success).toBe(false);
    expect(body.error).toBe('RATE_LIMIT_EXCEEDED');
    await app.close();
  }, 20_000);

  /**
   * TÉMOIN 5(b) — deux comptes derrière la MÊME IP (ici : la même app.inject,
   * donc littéralement la même « sortie réseau » simulée) ne doivent PAS se
   * gêner. Le compte A épuise ses 60 crédits ; le compte B doit encore
   * disposer des SIENS, intégralement — la preuve directe que la clé n'est
   * plus `global:${request.ip}`.
   */
  it('deux comptes derrière la MÊME IP ne se gênent pas — chacun garde ses 60 propres crédits', async () => {
    const app = await buildApp();

    const forA = await injectAs(app, { userId: USER_A, type: 'user' }, 61);
    expect(forA.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(forA[60]).toBe(429); // A a épuisé SON seau

    // B n'a encore RIEN consommé : ses 60 premiers appels doivent tous passer,
    // malgré les 61 appels que A vient de faire sur ce même `app` (= même IP
    // simulée, même processus).
    const forB = await injectAs(app, { userId: USER_B, type: 'user' }, 60);
    expect(forB.every((s) => s === 200)).toBe(true);
    await app.close();
  }, 30_000);

  /**
   * Le cas ANONYME nommé par l'issue : `authContext.userId` porte un
   * `Participant.id`, jamais un `User.id`, pour une session sans ligne
   * `User`. `callerRateKey` ne distingue pas les deux — elle lit `userId` tel
   * quel — et c'est CE qui couvre le cas : un `Participant.id` est un
   * ObjectId Mongo, jamais numériquement égal à un `User.id`, donc jamais le
   * même compartiment. La session anonyme a SON PROPRE seau (pas illimité,
   * pas partagé avec un compte inscrit).
   */
  it('une session ANONYME (Participant.id) est débitée comme un compte à part — ni illimitée, ni partagée', async () => {
    const app = await buildApp();

    const forUser = await injectAs(app, { userId: USER_A, type: 'user' }, 60);
    expect(forUser.every((s) => s === 200)).toBe(true);

    // L'anonyme n'a RIEN consommé du seau de USER_A : ses 60 premiers appels
    // passent aussi, et son 61e tombe — la même règle, un compartiment séparé.
    const forAnon = await injectAs(
      app,
      { userId: ANON_PARTICIPANT, type: 'anonymous', participantId: ANON_PARTICIPANT },
      61,
    );
    expect(forAnon.slice(0, 60).every((s) => s === 200)).toBe(true);
    expect(forAnon[60]).toBe(429);
    await app.close();
  }, 30_000);
});
