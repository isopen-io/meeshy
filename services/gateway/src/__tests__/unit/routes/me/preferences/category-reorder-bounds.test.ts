/**
 * #4182 critère 2 — `POST /me/preferences/categories/reorder` est borné à
 * 200 éléments par lot.
 *
 * Avant ce lot, chaque entrée de `updates` devenait un `updateMany` lancé en
 * `Promise.all` SANS AUCUNE limite de taille : 100 000 entrées ouvraient
 * 100 000 requêtes Prisma concurrentes (amplification 1 requête → N, non
 * bornée). Le témoin ci-dessous s'écrit contre la ROUTE, pas contre une
 * constante importée — il envoie 201 éléments et exige le refus, donc il
 * rougit si `maxItems` disparaît un jour du schéma (cf. consigne #4182).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { categoriesRoutes } from '../../../../../routes/me/preferences/categories';

const USER_ID = '68a000000000000000000001';

function makePrisma() {
  return {
    userConversationCategory: {
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.addHook('preHandler', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });
  await app.register(categoriesRoutes);
  await app.ready();
  return app;
}

const makeUpdates = (count: number) =>
  Array.from({ length: count }, (_, i) => ({ categoryId: `68a0000000000000000000${(i % 90).toString().padStart(2, '0')}`, order: i }));

describe('POST /reorder — le lot est borné à 200 éléments (#4182 critère 2)', () => {
  it('201 éléments sont REFUSÉS (400), avant tout accès à Prisma', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/reorder',
      payload: { updates: makeUpdates(201) },
    });

    expect(res.statusCode).toBe(400);
    expect(prisma.userConversationCategory.updateMany).not.toHaveBeenCalled();
    await app.close();
  });

  it('200 éléments — exactement la borne — sont ACCEPTÉS', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/reorder',
      payload: { updates: makeUpdates(200) },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.userConversationCategory.updateMany).toHaveBeenCalledTimes(200);
    await app.close();
  });
});
