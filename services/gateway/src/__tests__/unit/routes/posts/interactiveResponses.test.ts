import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';
import { registerInteractiveResponseRoutes } from '../../../../routes/posts/interactiveResponses';

/**
 * Route-level: exerce la vraie sérialisation (`app.inject`), jamais un double
 * du handler — cf. gateway CLAUDE.md « Tests — un témoin qui ne peut pas
 * tomber n'est pas un témoin ». `PostInteractiveResponseService` n'est PAS
 * mocké : ces routes l'instancient directement depuis le prisma injecté, donc
 * le double suffisant est celui de Prisma lui-même (mêmes formes que
 * `interactions.harness.ts`).
 */

const USER_ID = '507f1f77bcf86cd799439011';
const OTHER_USER_ID = '507f1f77bcf86cd799439099';
const POST_ID = '507f1f77bcf86cd799439022';
const OBJECT_ID = 'sticker-poll-1';

function makePreValidationAuth(authenticated: boolean) {
  return async (req: FastifyRequest) => {
    (req as any).authContext = authenticated
      ? { isAuthenticated: true, registeredUser: { id: USER_ID, role: 'USER', username: 'alice' } }
      : null;
  };
}

const publicAcl = (id: string) => ({
  id, authorId: OTHER_USER_ID, visibility: 'PUBLIC', visibilityUserIds: [] as string[], expiresAt: null,
});

function makePrisma() {
  return {
    post: {
      // `mayConsumePost` → `loadPostAcl` lit par `findFirst`.
      findFirst: jest.fn<any>().mockImplementation(({ where }: any) => Promise.resolve(publicAcl(where.id))),
      // `PostInteractiveResponseService` relit l'existence/deletedAt par `findUnique`.
      findUnique: jest.fn<any>().mockImplementation(({ where }: any) => Promise.resolve({ id: where.id, deletedAt: null })),
    },
    postInteractiveResponse: {
      upsert: jest.fn<any>().mockImplementation(({ create }: any) =>
        Promise.resolve({
          id: 'response-1',
          postId: create.postId,
          objectId: create.objectId,
          userId: create.userId,
          choice: create.choice,
          numericValue: create.numericValue,
          text: create.text,
          createdAt: new Date('2026-09-10T00:00:00Z'),
          updatedAt: new Date('2026-09-10T00:00:00Z'),
        }),
      ),
      deleteMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      groupBy: jest.fn<any>().mockResolvedValue([{ choice: 'option-a', _count: { choice: 2 } }]),
      count: jest.fn<any>().mockResolvedValue(2),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
  };
}

async function buildApp(opts: { authenticated?: boolean; prisma?: any } = {}): Promise<FastifyInstance> {
  const { authenticated = true, prisma: prismaOverride } = opts;
  const prisma = prismaOverride ?? makePrisma();

  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma);

  registerInteractiveResponseRoutes(app, prisma as any, makePreValidationAuth(authenticated));
  await app.ready();
  return app;
}

describe('POST /posts/:postId/objects/:objectId/responses', () => {
  it('pose une réponse à choix et sert la ligne écrite', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
      payload: { choice: 'option-a' },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.response.choice).toBe('option-a');
    expect(body.data.response.postId).toBe(POST_ID);
    expect(body.data.response.objectId).toBe(OBJECT_ID);
    await app.close();
  });

  it('refuse sans authentification', async () => {
    const app = await buildApp({ authenticated: false });

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
      payload: { choice: 'a' },
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('refuse un corps sans AUCUNE des trois valeurs — 400 VALIDATION_ERROR', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
      payload: {},
    });

    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.code).toBe('VALIDATION_ERROR');
    await app.close();
  });

  it('refuse un post hors audience (introuvable/supprimé/hors droit — indistinctement) — 404 POST_NOT_FOUND', async () => {
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(null);
    const app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'POST',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
      payload: { choice: 'a' },
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    await app.close();
  });
});

describe('DELETE /posts/:postId/objects/:objectId/responses', () => {
  it('retire la réponse propre à l\'appelant, SANS garde d\'audience', async () => {
    const prisma = makePrisma();
    // Un post hors audience (findFirst → null) ne doit PAS bloquer le retrait :
    // DELETE n'appelle jamais mayConsumePost, contrairement à POST/GET.
    prisma.post.findFirst.mockResolvedValue(null);
    const app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.removed).toBe(true);
    expect(prisma.postInteractiveResponse.deleteMany).toHaveBeenCalledWith({
      where: { postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID },
    });
    await app.close();
  });

  it('refuse sans authentification', async () => {
    const app = await buildApp({ authenticated: false });

    const res = await app.inject({
      method: 'DELETE',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
    });

    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /posts/:postId/objects/:objectId/responses', () => {
  it('sert l\'agrégat ET la réponse propre à l\'appelant', async () => {
    const prisma = makePrisma();
    prisma.postInteractiveResponse.findUnique.mockResolvedValue({
      id: 'r1', postId: POST_ID, objectId: OBJECT_ID, userId: USER_ID,
      choice: 'option-a', numericValue: null, text: null,
      createdAt: new Date(), updatedAt: new Date(),
    });
    const app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'GET',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
    });

    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.data.totalResponses).toBe(2);
    expect(body.data.choiceCounts).toEqual([{ choice: 'option-a', count: 2 }]);
    expect(body.data.myResponse.choice).toBe('option-a');
    await app.close();
  });

  it('rend myResponse null quand cette personne n\'a pas répondu', async () => {
    const app = await buildApp();

    const res = await app.inject({
      method: 'GET',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
    });

    expect(res.statusCode).toBe(200);
    expect(res.json().data.myResponse).toBeNull();
    await app.close();
  });

  it('refuse un post hors audience — 404 POST_NOT_FOUND', async () => {
    const prisma = makePrisma();
    prisma.post.findFirst.mockResolvedValue(null);
    const app = await buildApp({ prisma });

    const res = await app.inject({
      method: 'GET',
      url: `/posts/${POST_ID}/objects/${OBJECT_ID}/responses`,
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('POST_NOT_FOUND');
    await app.close();
  });
});
