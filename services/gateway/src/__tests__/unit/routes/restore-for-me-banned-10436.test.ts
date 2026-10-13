/**
 * #10436 — restaurer une conversation supprimée « pour moi » ne rallume jamais
 * la participation d'un banni.
 *
 * Scénario de l'audit de #7389 : U supprime le groupe pour lui (`isActive:
 * false`, `deletedForMe` posé), un modérateur le bannit (`resolveBanWrite`
 * n'écrit alors que `bannedAt`, la ligne étant déjà inactive), puis U restaure.
 * La route posait `isActive: true` sans lire `bannedAt` : la ligne redevenait
 * active ET bannie, lue comme vivante par toutes les lectures
 * `userId + isActive: true` (liste, envoi, push, aperçu socket).
 *
 * Le mock de Prisma JUGE chaque `where` contre des documents Mongo (colonne
 * `bannedAt` absente chez un jamais-banni, `OR`, `isSet`) : le témoin ne dit
 * rien de la forme de la requête, seulement de ce qu'elle apparie.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const AUTH = { authorization: 'Bearer token' };

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(
    () =>
      async (request: FastifyRequest, reply: FastifyReply): Promise<void> => {
        if (!request.headers['authorization']) {
          await reply.code(401).send({ success: false, error: 'Unauthorized' });
          return;
        }
        (request as unknown as Record<string, unknown>).authContext = {
          type: 'registered',
          userId: USER_ID,
          isAuthenticated: true,
          isAnonymous: false,
          hasFullAccess: true,
        };
      }
  ),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

import userDeletionsRoutes from '../../../routes/user-deletions';

type Doc = Record<string, unknown>;

function matchesField(value: unknown, condition: unknown): boolean {
  if (condition !== null && typeof condition === 'object' && !(condition instanceof Date)) {
    const c = condition as Record<string, unknown>;
    if ('isSet' in c) return c.isSet ? value !== undefined : value === undefined;
    if ('in' in c) return (c.in as unknown[]).includes(value);
  }
  if (condition === null) return value === null;
  return value === condition;
}

function matches(doc: Doc, where: Doc): boolean {
  return Object.entries(where).every(([key, condition]) => {
    if (key === 'OR') return (condition as Doc[]).some((w) => matches(doc, w));
    if (key === 'AND') return (condition as Doc[]).every((w) => matches(doc, w));
    if (key === 'NOT') return !matches(doc, condition as Doc);
    return matchesField(doc[key], condition);
  });
}

type Store = { participants: Doc[] };

/**
 * `banAfterRead` rejoue la course : le bannissement tombe ENTRE la lecture de
 * la route et son écriture.
 */
async function buildApp(store: Store, options: { banAfterRead?: boolean; deleteAfterRead?: boolean } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const findRow = (where: Doc) => store.participants.find((row) => matches(row, where));

  app.decorate('prisma', {
    participant: {
      findFirst: jest.fn(async ({ where }: { where: Doc }) => {
        const row = findRow(where);
        const snapshot = row ? { ...row, conversation: { isActive: true } } : null;
        if (row && options.banAfterRead) row.bannedAt = new Date('2026-10-13T09:00:00Z');
        if (row && options.deleteAfterRead) store.participants.splice(store.participants.indexOf(row), 1);
        return snapshot;
      }),
      update: jest.fn(async ({ where, data }: { where: Doc; data: Doc }) => {
        const row = findRow(where);
        if (!row) {
          throw Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
        }
        Object.assign(row, data);
        return row;
      }),
      updateMany: jest.fn(async ({ where, data }: { where: Doc; data: Doc }) => {
        const rows = store.participants.filter((row) => matches(row, where));
        rows.forEach((row) => Object.assign(row, data));
        return { count: rows.length };
      }),
    },
  } as unknown);

  app.decorate('socketIOHandler', { io: { to: () => ({ emit: () => undefined }) } } as unknown);

  await app.register(userDeletionsRoutes);
  await app.ready();
  return app;
}

const deletedForMe = (extra: Doc = {}): Doc => ({
  id: 'part-1',
  conversationId: CONV_ID,
  userId: USER_ID,
  isActive: false,
  deletedForMe: new Date('2026-10-12T10:00:00Z'),
  language: 'fr',
  ...extra,
});

const restore = (app: FastifyInstance) =>
  app.inject({ method: 'POST', url: `/api/conversations/${CONV_ID}/restore-for-me`, headers: AUTH });

describe('POST /conversations/:id/restore-for-me ne rallume jamais un banni (#10436)', () => {
  it('refuse en 403 BANNED la restauration d’une participation bannie, et la laisse INACTIVE', async () => {
    const row = deletedForMe({ bannedAt: new Date('2026-10-12T11:00:00Z') });
    const app = await buildApp({ participants: [row] });

    const res = await restore(app);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ success: false, code: 'BANNED' });
    expect(row.isActive).toBe(false);
    await app.close();
  });

  it('ne rallume pas la ligne quand le bannissement tombe entre la lecture et l’écriture', async () => {
    const row = deletedForMe();
    const app = await buildApp({ participants: [row] }, { banAfterRead: true });

    const res = await restore(app);

    expect(res.statusCode).not.toBe(200);
    expect(row.isActive).toBe(false);
    await app.close();
  });

  it('restaure toujours un membre jamais banni (colonne bannedAt ABSENTE)', async () => {
    const row = deletedForMe();
    const app = await buildApp({ participants: [row] });

    const res = await restore(app);

    expect(res.statusCode).toBe(200);
    expect(row.isActive).toBe(true);
    expect(row.deletedForMe).toBeNull();
    await app.close();
  });

  it('restaure un membre débanni (bannedAt remis à null)', async () => {
    const row = deletedForMe({ bannedAt: null });
    const app = await buildApp({ participants: [row] });

    const res = await restore(app);

    expect(res.statusCode).toBe(200);
    expect(row.isActive).toBe(true);
    await app.close();
  });
});

/**
 * #10443 — l'audit adversarial de #10440 : un `P2025` à l'écriture était
 * toujours rendu en 403 `BANNED`. Il dit seulement que la ligne ne s'apparie
 * plus : bannie entre la lecture et l'écriture, OU disparue. La route relit la
 * ligne : bannie ⇒ `BANNED`, introuvable ⇒ 404 `NOT_FOUND`.
 */
describe('POST /conversations/:id/restore-for-me ne dit « banni » que d’un banni (#10443)', () => {
  it('une ligne DISPARUE entre la lecture et l’écriture rend 404 NOT_FOUND, pas BANNED', async () => {
    const app = await buildApp({ participants: [deletedForMe()] }, { deleteAfterRead: true });

    const res = await restore(app);

    expect(res.statusCode).toBe(404);
    expect(JSON.parse(res.body)).toMatchObject({ success: false, code: 'NOT_FOUND' });
    await app.close();
  });

  it('un bannissement tombé entre la lecture et l’écriture rend toujours 403 BANNED', async () => {
    const row = deletedForMe();
    const app = await buildApp({ participants: [row] }, { banAfterRead: true });

    const res = await restore(app);

    expect(res.statusCode).toBe(403);
    expect(JSON.parse(res.body)).toMatchObject({ success: false, code: 'BANNED' });
    expect(row.isActive).toBe(false);
    await app.close();
  });
});
