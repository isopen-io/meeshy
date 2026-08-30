/**
 * Bloquer quelqu'un est un ÉTAT, et la liste des blocages est BORNÉE (#4164).
 *
 * `POST /users/:userId/block` modélisait une ACTION : bloquer deux fois rendait
 * `409`. Or l'état visé est atteint dans les deux cas, et un 409 oblige chaque
 * appelant à traiter comme une erreur ce qui est un succès — la file d'attente
 * hors ligne la première, qui rejoue des mutations enregistrées avant une mise
 * à jour et verrait échouer un blocage DÉJÀ appliqué.
 *
 * `GET /users/me/blocked-users` n'était borné par rien : ni page, ni curseur,
 * ni plafond.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

jest.mock('../../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

jest.mock('../../../../services/CacheStore', () => ({
  getCacheStore: () => ({ del: jest.fn(async () => undefined) }),
}));

jest.mock('../../../../utils/withMutationLog', () => ({
  withMutationLog: jest.fn(async (args: any) => args.op()),
}));

import { directoryBlocksRoutes } from '../../../../routes/directory/blocks';

const PREFIXE = '/api/v1/directory';
const MOI = '507f1f77bcf86cd799439099';
const CIBLE = '507f1f77bcf86cd799439011';

function prismaDouble(bloques: string[]) {
  const etat = { bloques: [...bloques] };
  return {
    etat,
    client: {
      user: {
        findUnique: jest.fn<any>(async (args: any) =>
          args?.where?.id === MOI ? { blockedUserIds: etat.bloques } : { id: args?.where?.id }
        ),
        findMany: jest.fn<any>(async (args: any) => {
          const ids: string[] = args?.where?.id?.in ?? [];
          return ids.map((id) => ({ id, username: `u${id.slice(-2)}`, displayName: null, avatar: null }));
        }),
        update: jest.fn<any>(async (args: any) => {
          const data = args?.data?.blockedUserIds;
          if (data?.push) etat.bloques = [...etat.bloques, data.push];
          if (data?.set) etat.bloques = [...data.set];
          return {};
        }),
      },
    },
  };
}

async function monter(bloques: string[] = []) {
  const double = prismaDouble(bloques);
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', double.client as never);
  app.decorate('authenticate', async (req: any) => {
    req.authContext = {
      isAuthenticated: true,
      type: 'user',
      userId: MOI,
      registeredUser: { id: MOI, role: 'USER' },
    };
  });
  await app.register(directoryBlocksRoutes, { prefix: PREFIXE });
  await app.ready();
  return { app, double };
}

describe('PUT /directory/blocks/:userId est IDEMPOTENT', () => {
  it('deux appels rendent le même statut, le même corps et le même état', async () => {
    const { app, double } = await monter();

    const premier = await app.inject({ method: 'PUT', url: `${PREFIXE}/blocks/${CIBLE}` });
    const second = await app.inject({ method: 'PUT', url: `${PREFIXE}/blocks/${CIBLE}` });

    expect(premier.statusCode).toBe(200);
    expect(second.statusCode).toBe(second.statusCode === 200 ? 200 : premier.statusCode);
    expect(second.statusCode).toBe(premier.statusCode);
    expect(second.json().data).toEqual(premier.json().data);
    // L'ensemble ne contient la cible QU'UNE fois : le second appel n'écrit
    // pas, sans quoi `push` la dupliquerait.
    expect(double.etat.bloques).toEqual([CIBLE]);
    await app.close();
  });

  it("n'écrit rien au second appel", async () => {
    const { app, double } = await monter([CIBLE]);

    await app.inject({ method: 'PUT', url: `${PREFIXE}/blocks/${CIBLE}` });

    expect(double.client.user.update).not.toHaveBeenCalled();
    await app.close();
  });

  it('refuse de se bloquer soi-même', async () => {
    const { app } = await monter();

    expect((await app.inject({ method: 'PUT', url: `${PREFIXE}/blocks/${MOI}` })).statusCode).toBe(400);
    await app.close();
  });
});

describe('GET /directory/blocks est BORNÉE', () => {
  it('refuse une page au-delà du plafond', async () => {
    const { app } = await monter();

    const res = await app.inject({ method: 'GET', url: `${PREFIXE}/blocks?limit=101` });

    expect(res.statusCode).toBe(400);
    await app.close();
  });

  it('accepte le plafond exact', async () => {
    const { app } = await monter();

    expect((await app.inject({ method: 'GET', url: `${PREFIXE}/blocks?limit=100` })).statusCode).toBe(200);
    await app.close();
  });

  it('pagine par curseur, et le curseur nomme la dernière ligne DEMANDÉE', async () => {
    const ids = ['507f1f77bcf86cd799439001', '507f1f77bcf86cd799439002', '507f1f77bcf86cd799439003'];
    const { app } = await monter(ids);

    const p1 = await app.inject({ method: 'GET', url: `${PREFIXE}/blocks?limit=2` });
    const corps1 = p1.json();

    expect(corps1.data).toHaveLength(2);
    expect(corps1.pagination.hasMore).toBe(true);
    expect(corps1.pagination.nextCursor).toBe(ids[1]);

    const p2 = await app.inject({ method: 'GET', url: `${PREFIXE}/blocks?limit=2&cursor=${ids[1]}` });
    const corps2 = p2.json();

    expect(corps2.data.map((u: { id: string }) => u.id)).toEqual([ids[2]]);
    expect(corps2.pagination.hasMore).toBe(false);
    expect(corps2.pagination.nextCursor).toBeNull();
    await app.close();
  });

  it('rend 304 sur un `If-None-Match` valide', async () => {
    const { app } = await monter([CIBLE]);

    const premier = await app.inject({ method: 'GET', url: `${PREFIXE}/blocks` });
    const etag = premier.headers.etag as string;
    expect(etag).toBeTruthy();

    const second = await app.inject({
      method: 'GET',
      url: `${PREFIXE}/blocks`,
      headers: { 'if-none-match': etag },
    });

    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    await app.close();
  });
});

describe('DELETE /directory/blocks/:userId', () => {
  it("retire l'appartenance", async () => {
    const { app, double } = await monter([CIBLE]);

    const res = await app.inject({ method: 'DELETE', url: `${PREFIXE}/blocks/${CIBLE}` });

    expect(res.statusCode).toBe(200);
    expect(double.etat.bloques).toEqual([]);
    await app.close();
  });

  it("rend 404 quand la personne n'est pas bloquée — comportement INCHANGÉ", async () => {
    const { app } = await monter();

    expect((await app.inject({ method: 'DELETE', url: `${PREFIXE}/blocks/${CIBLE}` })).statusCode).toBe(404);
    await app.close();
  });
});
