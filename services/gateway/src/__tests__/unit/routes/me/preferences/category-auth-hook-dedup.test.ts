/**
 * #4182 critère 4 — le contexte d'authentification ne se construit plus DEUX
 * fois par requête sur le sous-arbre `/me/preferences/categories`.
 *
 * `userPreferencesRoutes` (routes/me/preferences/index.ts) pose déjà
 * `createUnifiedAuthMiddleware(prisma, {...})` comme `preHandler` AVANT
 * d'enregistrer `categoriesRoutes` — et Fastify propage les hooks d'un
 * contexte parent à ses enfants par encapsulation, donc ce hook tourne déjà
 * pour les six routes de ce fichier. `categoriesRoutes` posait EN PLUS sa
 * propre copie du même hook (même factory, mêmes options), qui tournait donc
 * une seconde fois pour chaque requête de ce sous-arbre : deux vérifications
 * JWT et deux lectures Prisma de l'utilisateur par appel.
 *
 * Ce fichier reproduit la topologie réelle (hook posé au niveau PARENT, PUIS
 * `categoriesRoutes` enregistré comme enfant) sans dépendre de
 * `routes/me/preferences/index.ts` lui-même — hors territoire de #4182, et de
 * toute façon `index.ts` fait bien plus qu'exercer ce hook. `middleware/auth`
 * est mocké pour que sa factory rende TOUJOURS la MÊME fonction middleware,
 * quel que soit le nombre de fois où elle est invoquée : c'est ce qui permet
 * de compter, sur UNE requête, combien de hooks preHandler d'authentification
 * tournent réellement dans la chaîne — la factory elle-même n'est appelée
 * qu'à l'ENREGISTREMENT (une fois par montage), jamais par requête, donc
 * compter ses appels ne mesurerait pas le bon événement.
 *
 * Si `categoriesRoutes` réintroduit un jour son propre
 * `fastify.addHook('preHandler', createUnifiedAuthMiddleware(...))`, ce
 * fichier étant le seul à mocker `middleware/auth` sur SA propre factory
 * partagée, la régression referait tourner `mockSharedAuthMiddleware` une
 * seconde fois et ce témoin rougirait.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// Préfixe `mock` : seule forme que Jest autorise à référencer une variable
// extérieure depuis l'intérieur d'un `jest.mock(...)` hissé.
const mockAuthCalls: number[] = [];
const mockSharedAuthMiddleware = jest.fn(async (req: any) => {
  mockAuthCalls.push(1);
  req.auth = { userId: USER_ID, isAuthenticated: true };
});

jest.mock('../../../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => mockSharedAuthMiddleware),
}));

import { createUnifiedAuthMiddleware } from '../../../../../middleware/auth';
import { categoriesRoutes } from '../../../../../routes/me/preferences/categories';

const USER_ID = '68a000000000000000000001';

function makePrisma() {
  return {
    userConversationCategory: {
      findMany: jest.fn<any>().mockResolvedValue([]),
      count: jest.fn<any>().mockResolvedValue(0),
      findFirst: jest.fn<any>().mockResolvedValue(null),
    },
  } as any;
}

async function buildParentChildApp(): Promise<FastifyInstance> {
  const prisma = makePrisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  // Topologie RÉELLE de routes/me/preferences/index.ts : le hook est posé au
  // niveau PARENT, AVANT d'enregistrer categoriesRoutes comme enfant.
  const authMiddleware = createUnifiedAuthMiddleware(prisma, {
    requireAuth: true,
    allowAnonymous: false,
  });
  app.addHook('preHandler', authMiddleware);

  await app.register(categoriesRoutes);
  await app.ready();
  return app;
}

describe("categoriesRoutes — le hook d'authentification ne se pose plus deux fois (#4182 critère 4)", () => {
  beforeEach(() => {
    mockAuthCalls.length = 0;
    mockSharedAuthMiddleware.mockClear();
  });

  it('GET / ne déclenche le middleware d\'auth qu\'UNE seule fois', async () => {
    const app = await buildParentChildApp();

    const res = await app.inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    expect(mockAuthCalls).toHaveLength(1);
    expect(mockSharedAuthMiddleware).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('DELETE /:categoryId ne déclenche le middleware d\'auth qu\'UNE seule fois', async () => {
    const app = await buildParentChildApp();

    await app.inject({ method: 'DELETE', url: '/some-id' });

    expect(mockSharedAuthMiddleware).toHaveBeenCalledTimes(1);
    await app.close();
  });

  it('POST /reorder ne déclenche le middleware d\'auth qu\'UNE seule fois', async () => {
    const app = await buildParentChildApp();

    await app.inject({ method: 'POST', url: '/reorder', payload: { updates: [] } });

    expect(mockSharedAuthMiddleware).toHaveBeenCalledTimes(1);
    await app.close();
  });
});
