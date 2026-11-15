/**
 * #4182 critère 3 — `POST /me/preferences/categories` est idempotent par
 * `X-Client-Mutation-Id` : deux envois du même identifiant créent UNE seule
 * catégorie et rendent la MÊME réponse, au lieu d'en fabriquer une seconde à
 * chaque rejeu réseau (retry client, flush d'outbox après un timeout de
 * réponse).
 *
 * `create` DIVERGE (chaque `prisma.userConversationCategory.create` fabrique
 * une ligne neuve, contrairement à un toggle qui converge) — même patron que
 * `POST /posts/:postId/repost`, dont `repostIdempotency.test.ts` est le
 * gabarit direct de ce fichier.
 *
 * `fastify.mutationLogService` est un FAUX en mémoire qui reproduit le
 * contrat réel de `MutationLogService.recordOrReturn` (Map keyée par
 * `userId|clientMutationId`, ligne écrite SEULEMENT après le succès de
 * `op()`) — suffisant pour prouver le câblage de la route sans dépendre de
 * Prisma. Le hook `clientMutationId` RÉEL (pas un double) est enregistré,
 * comme dans `server.ts`, pour que ce fichier exerce la vraie couche de
 * décodage de l'en-tête.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { MutationLogDuplicate, MutationInFlight } from '../../../../../services/MutationLogService';
import { registerClientMutationIdHook } from '../../../../../middleware/clientMutationId';
import { categoriesRoutes } from '../../../../../routes/me/preferences/categories';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

jest.mock('../../../../../utils/logger', () => ({ logError: jest.fn() }));

const USER_ID = '68a000000000000000000001';
const CMID_A = 'cmid_550e8400-e29b-41d4-a716-446655440001';
const CMID_B = 'cmid_550e8400-e29b-41d4-a716-446655440002';

// ─── Fausse MutationLogService (reproduit le contrat réel de recordOrReturn) ──

function makeFakeMutationLogService() {
  const store = new Map<string, { resultId: string | null; kind: string }>();
  const recordOrReturn = jest.fn(async ({ userId, clientMutationId, kind, op }: any) => {
    const key = `${userId}|${clientMutationId}`;
    const existing = store.get(key);
    if (existing) {
      throw new MutationLogDuplicate(existing.resultId, existing.kind);
    }
    // Comme la vraie classe : la ligne n'est écrite qu'APRÈS le succès de
    // op() — un op() qui rejette ne doit RIEN persister, pour que le même
    // cmid puisse être rejoué.
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
        // Utilisé pour deux choses : calculer finalOrder (where: {userId},
        // orderBy desc) et le refetch de rejeu (where: {id, userId}).
        if (where?.id) return Promise.resolve(rows.get(where.id) ?? null);
        return Promise.resolve(null); // pas de catégories existantes -> order 0
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
          createdAt: new Date('2026-08-29T00:00:00Z'),
          updatedAt: new Date('2026-08-29T00:00:00Z'),
        };
        rows.set(row.id, row);
        return Promise.resolve(row);
      }),
      delete: jest.fn<any>().mockImplementation(({ where }: any) => {
        rows.delete(where.id);
        return Promise.resolve({});
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
  app.addHook('preHandler', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });

  // Topologie réelle : le hook cmid est enregistré AVANT les routes, comme
  // dans server.ts.
  registerClientMutationIdHook(app);

  const mutationLogService = makeFakeMutationLogService();
  app.decorate('mutationLogService', mutationLogService as any);

  // On observe le broadcast RÉEL sans mocker `utils/socket-broadcast.ts` :
  // `broadcastToUser(fastify, ...)` lit `fastify.socketIOHandler.getManager().io`
  // et appelle `io.to(room).emit(event, payload)` — décorer ce faux `io`
  // suffit à COMPTER les diffusions sans dépendre de sa forme interne.
  const broadcastToUser = jest.fn();
  const io = {
    to: (room: string) => ({
      emit: (event: string, payload: unknown) => {
        broadcastToUser(room, event, payload);
      },
    }),
  };
  app.decorate('socketIOHandler', { getManager: () => ({ io }) } as any);

  await app.register(categoriesRoutes);
  await app.ready();
  return { app, prisma, mutationLogService, broadcastToUser };
}

function createCategory(app: FastifyInstance, cmid?: string, payload: Record<string, unknown> = { name: 'Travail' }) {
  return app.inject({
    method: 'POST',
    url: '/',
    headers: cmid ? { 'x-client-mutation-id': cmid } : {},
    payload,
  });
}

describe('POST /me/preferences/categories — idempotence via X-Client-Mutation-Id (#4182 critère 3)', () => {
  it('le même cmid rejoué ne crée pas une seconde catégorie — create appelé UNE fois, même id, même réponse', async () => {
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

  it('deux cmid différents créent deux catégories distinctes', async () => {
    const { app, prisma } = await buildApp();

    const res1 = await createCategory(app, CMID_A);
    const res2 = await createCategory(app, CMID_B);

    expect(prisma.userConversationCategory.create).toHaveBeenCalledTimes(2);
    expect(res1.json().data.id).not.toBe(res2.json().data.id);
    await app.close();
  });

  it("sans en-tête X-Client-Mutation-Id, le comportement legacy est inchangé : aucune dédup", async () => {
    const { app, prisma, mutationLogService } = await buildApp();

    const res1 = await createCategory(app, undefined);
    const res2 = await createCategory(app, undefined);

    expect(res1.statusCode).toBe(200);
    expect(res2.statusCode).toBe(200);
    expect(prisma.userConversationCategory.create).toHaveBeenCalledTimes(2);
    expect(mutationLogService.recordOrReturn).not.toHaveBeenCalled();
    await app.close();
  });

  it('le REJEU du même cmid ne rediffuse PAS CATEGORY_CREATED', async () => {
    const { app, broadcastToUser } = await buildApp();

    await createCategory(app, CMID_A);
    await createCategory(app, CMID_A);

    const creations = broadcastToUser.mock.calls.filter((c: any[]) => c[1] === SERVER_EVENTS.CATEGORY_CREATED);
    expect(creations).toHaveLength(1);
    await app.close();
  });

  it('une création FRAÎCHE diffuse CATEGORY_CREATED une fois (non-régression)', async () => {
    const { app, broadcastToUser } = await buildApp();

    await createCategory(app, CMID_A);

    const creations = broadcastToUser.mock.calls.filter((c: any[]) => c[1] === SERVER_EVENTS.CATEGORY_CREATED);
    expect(creations).toHaveLength(1);
    await app.close();
  });

  it('une requête jumelle EN VOL rend 409, jamais 500 ni une seconde catégorie', async () => {
    const { app, mutationLogService, prisma } = await buildApp();
    mutationLogService.recordOrReturn.mockImplementationOnce(async () => {
      throw new MutationInFlight('createCategory');
    });

    const res = await createCategory(app, CMID_A);

    expect(res.statusCode).toBe(409);
    expect(res.json().code).toBe('MUTATION_IN_FLIGHT');
    expect(prisma.userConversationCategory.create).not.toHaveBeenCalled();
    await app.close();
  });

  it('un rejeu dont la catégorie a été supprimée entre-temps rend 410, il n\'en fabrique pas une seconde', async () => {
    const { app, prisma } = await buildApp();

    const res1 = await createCategory(app, CMID_A);
    expect(res1.statusCode).toBe(200);
    const createdId = res1.json().data.id;

    // L'utilisateur supprime sa catégorie entre les deux envois.
    await prisma.userConversationCategory.delete({ where: { id: createdId } });

    const res2 = await createCategory(app, CMID_A);

    expect(prisma.userConversationCategory.create).toHaveBeenCalledTimes(1);
    expect(res2.statusCode).toBe(410);
    expect(res2.json().code).toBe('MUTATION_RESULT_GONE');
    await app.close();
  });

  it('un create qui échoue (500) ne persiste AUCUNE ligne — le même cmid peut être rejoué', async () => {
    const { app, prisma } = await buildApp();
    prisma.userConversationCategory.create.mockRejectedValueOnce(new Error('db error'));

    const res1 = await createCategory(app, CMID_A);
    expect(res1.statusCode).toBe(500);

    const res2 = await createCategory(app, CMID_A);
    expect(res2.statusCode).toBe(200);
    expect(prisma.userConversationCategory.create).toHaveBeenCalledTimes(2);
    await app.close();
  });

  it("le `kind` enregistré vaut exactement 'createCategory'", async () => {
    const { app, mutationLogService } = await buildApp();

    await createCategory(app, CMID_A);

    expect(mutationLogService.recordOrReturn).toHaveBeenCalledWith(
      expect.objectContaining({ kind: 'createCategory' }),
    );
    await app.close();
  });

  it('un corps invalide (nom vide) reste un 400, avant même de consulter le journal de mutation', async () => {
    const { app, mutationLogService } = await buildApp();

    const res = await createCategory(app, CMID_A, { name: '   ' });

    expect(res.statusCode).toBe(400);
    expect(mutationLogService.recordOrReturn).not.toHaveBeenCalled();
    await app.close();
  });
});
