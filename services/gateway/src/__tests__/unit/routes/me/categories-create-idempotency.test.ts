/**
 * #4182 critère 3, sur l'adresse CANONIQUE `POST /me/categories` (#4359) —
 * idempotence par `X-Client-Mutation-Id`. `category-create-idempotency.test.ts`
 * (`routes/me/preferences/`) couvre déjà l'ALIAS ; `handleCreateCategory` est
 * le MÊME handler exporté — ce fichier prouve que le REJEU se comporte
 * identiquement quand on l'atteint par le montage AUTONOME de
 * `meCategoriesRoutes` (auth en `onRequest`, pas un `preHandler` de parent).
 *
 * **Le témoin se pose sur le REJEU, pas le premier envoi** — au premier
 * envoi, une route idempotente et une route qui ne l'est pas rendent le même
 * verdict (précaution répétée par #4359 et #4182 critère 3).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { MutationLogDuplicate } from '../../../../services/MutationLogService';
import { registerClientMutationIdHook } from '../../../../middleware/clientMutationId';
import { meCategoriesRoutes } from '../../../../routes/me/categories';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';
const CMID_A = 'cmid_550e8400-e29b-41d4-a716-446655440001';
const CMID_B = 'cmid_550e8400-e29b-41d4-a716-446655440002';

function makeFakeMutationLogService() {
  const store = new Map<string, { resultId: string | null; kind: string }>();
  const recordOrReturn = jest.fn(async ({ userId, clientMutationId, kind, op }: any) => {
    const key = `${userId}|${clientMutationId}`;
    const existing = store.get(key);
    if (existing) {
      throw new MutationLogDuplicate(existing.resultId, existing.kind);
    }
    const result = await op();
    store.set(key, { resultId: result.id, kind });
    return result;
  });
  return { recordOrReturn, store };
}

let categoryCounter = 0;
function makePrisma() {
  categoryCounter = 0;
  const rows = new Map<string, any>();
  return {
    userConversationCategory: {
      findFirst: jest.fn<any>().mockImplementation(({ where }: any) => {
        if (where?.id) return Promise.resolve(rows.get(where.id) ?? null);
        return Promise.resolve(null);
      }),
      create: jest.fn<any>().mockImplementation(({ data }: any) => {
        categoryCounter += 1;
        const row = {
          id: `cat-${categoryCounter}`,
          userId: data.userId,
          name: data.name,
          color: data.color,
          icon: data.icon,
          order: data.order,
          isExpanded: data.isExpanded,
          createdAt: new Date('2026-08-30T00:00:00Z'),
          updatedAt: new Date('2026-08-30T00:00:00Z'),
        };
        rows.set(row.id, row);
        return Promise.resolve(row);
      }),
    },
  } as any;
}

async function buildApp(): Promise<{
  app: FastifyInstance;
  prisma: ReturnType<typeof makePrisma>;
  mutationLogService: ReturnType<typeof makeFakeMutationLogService>;
  broadcastToUser: jest.Mock<any>;
}> {
  const prisma = makePrisma();
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  // Montage AUTONOME : l'auth est posée en `onRequest`, comme
  // `mePermissionsRoutes` — pas un `preHandler` hérité d'un parent.
  app.decorate('authenticate', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });

  // Topologie réelle : le hook cmid est enregistré AVANT les routes, comme
  // dans server.ts.
  registerClientMutationIdHook(app);

  const mutationLogService = makeFakeMutationLogService();
  app.decorate('mutationLogService', mutationLogService as any);

  const broadcastToUser = jest.fn();
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        broadcastToUser(room, event, payload);
      },
    }),
  };
  app.decorate('socketIOHandler', { getManager: () => ({ io }) } as any);

  await app.register(meCategoriesRoutes, { prefix: '/api/v1/me' });
  await app.ready();
  return { app, prisma, mutationLogService, broadcastToUser };
}

function createCategory(app: FastifyInstance, cmid?: string, payload: Record<string, unknown> = { name: 'Travail' }) {
  return app.inject({
    method: 'POST',
    url: '/api/v1/me/categories',
    headers: cmid ? { 'x-client-mutation-id': cmid } : {},
    payload,
  });
}

describe('POST /me/categories — idempotence via X-Client-Mutation-Id sur le montage CANONIQUE (#4359)', () => {
  it('le même cmid REJOUÉ ne crée pas une seconde catégorie — create appelé UNE fois, MÊME id, MÊME réponse', async () => {
    const { app, prisma } = await buildApp();

    const res1 = await createCategory(app, CMID_A);
    const res2 = await createCategory(app, CMID_A);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(prisma.userConversationCategory.create).toHaveBeenCalledTimes(1);
    expect(res1.json().data.id).toBe(res2.json().data.id);
    expect(res1.json().data).toEqual(res2.json().data);
    await app.close();
  });

  it('deux cmid différents créent deux catégories distinctes (le premier envoi seul ne prouve rien)', async () => {
    const { app, prisma } = await buildApp();

    const res1 = await createCategory(app, CMID_A);
    const res2 = await createCategory(app, CMID_B);

    expect(prisma.userConversationCategory.create).toHaveBeenCalledTimes(2);
    expect(res1.json().data.id).not.toBe(res2.json().data.id);
    await app.close();
  });

  it('le REJEU du même cmid ne rediffuse PAS CATEGORY_CREATED une seconde fois', async () => {
    const { app, broadcastToUser } = await buildApp();

    await createCategory(app, CMID_A);
    await createCategory(app, CMID_A);

    const creations = broadcastToUser.mock.calls.filter((c: any[]) => c[1] === SERVER_EVENTS.CATEGORY_CREATED);
    expect(creations).toHaveLength(1);
    await app.close();
  });

  it("sans en-tête X-Client-Mutation-Id, le comportement legacy est inchangé : aucune dédup", async () => {
    const { app, prisma } = await buildApp();

    const res1 = await createCategory(app, undefined);
    const res2 = await createCategory(app, undefined);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(prisma.userConversationCategory.create).toHaveBeenCalledTimes(2);
    await app.close();
  });
});
