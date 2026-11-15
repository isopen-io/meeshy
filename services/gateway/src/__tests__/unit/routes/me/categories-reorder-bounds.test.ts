/**
 * #4182 critère 2, sur l'adresse CANONIQUE `POST /me/categories/reorder`
 * (#4359) — le lot reste borné à 200 éléments, AVANT tout accès Prisma.
 *
 * `category-reorder-bounds.test.ts` (`routes/me/preferences/`) couvre déjà
 * l'ALIAS. Le schéma (`reorderCategoriesRouteSharedOptions`, `maxItems:
 * 200`) est le MÊME objet réutilisé par les deux montages — ce fichier
 * mesure que le partage TIENT à travers `meCategoriesRoutes`, pas seulement
 * qu'il est plausible en le lisant. Le témoin envoie 201 éléments et exige
 * le refus, donc il rougit si `maxItems` disparaît un jour du schéma
 * partagé (cf. consigne #4182 critère 2).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { meCategoriesRoutes } from '../../../../routes/me/categories';

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
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });
  await app.register(meCategoriesRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return app;
}

const makeUpdates = (count: number) =>
  Array.from({ length: count }, (_, i) => ({
    categoryId: `68a0000000000000000000${(i % 90).toString().padStart(2, '0')}`,
    order: i,
  }));

describe('POST /me/categories/reorder — le lot est borné à 200 éléments (#4359, #4182 critère 2)', () => {
  it('201 éléments sont REFUSÉS (400), avant tout accès à Prisma', async () => {
    const prisma = makePrisma();
    const app = await buildApp(prisma);

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/me/categories/reorder',
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
      url: '/api/v1/me/categories/reorder',
      payload: { updates: makeUpdates(200) },
    });

    expect(res.statusCode).toBe(200);
    expect(prisma.userConversationCategory.updateMany).toHaveBeenCalledTimes(200);
    await app.close();
  });
});
