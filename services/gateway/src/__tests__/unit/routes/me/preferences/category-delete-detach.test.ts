/**
 * `DELETE /me/preferences/categories/:categoryId` — le détachement écrit-il sur
 * la table qui porte `categoryId` ?
 *
 * La route détachait les conversations en écrivant sur `ConversationPreference`,
 * un magasin CLÉ/VALEUR (`key` / `value` / `valueType`) qui ne déclare NI
 * `categoryId` ni de relation vers une catégorie. Le client Prisma généré refuse
 * cet appel avant tout aller-retour réseau (mesuré :
 * `PrismaClientValidationError`, « Unknown argument `categoryId` »), donc le
 * `$transaction` levait et la route rendait 500 : **aucune catégorie de
 * conversation n'a jamais pu être supprimée.**
 *
 * Les deux suites existantes étaient vertes parce que leurs doubles acceptent ce
 * que le vrai client refuse — `conversationPreference: { updateMany: jest.fn() }`.
 * Le double de CE fichier REFUSE comme le vrai client : c'est la seule forme qui
 * puisse tomber.
 *
 * La colonne `categoryId` vit sur `UserConversationPreferences`, dont
 * `conversationPreferencesSync.ts` est l'ÉCRIVAIN UNIQUE — d'où les trois
 * obligations qu'il énonce (persister, incrémenter `version`, diffuser sur
 * `user:{id}`) et que ces témoins vérifient une par une.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

jest.mock('../../../../../utils/logger', () => ({
  logError: jest.fn(),
}));

jest.mock('../../../../../utils/socket-broadcast', () => ({
  broadcastToUser: jest.fn(),
}));

import { broadcastToUser } from '../../../../../utils/socket-broadcast';
import { categoriesRoutes } from '../../../../../routes/me/preferences/categories';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const mockBroadcast = broadcastToUser as jest.MockedFunction<any>;

const USER_ID = '68a000000000000000000001';
const CATEGORY_ID = '68a000000000000000000009';

const now = new Date('2026-08-28T10:00:00Z');

const categoryRow = {
  id: CATEGORY_ID,
  userId: USER_ID,
  name: 'Travail',
  color: '#3B82F6',
  icon: 'briefcase',
  order: 0,
  isExpanded: true,
  createdAt: now,
  updatedAt: now,
};

const prefRow = (conversationId: string, version: number) => ({
  conversationId,
  isPinned: false,
  isMuted: false,
  mentionsOnly: false,
  isArchived: false,
  tags: [],
  categoryId: null,
  orderInCategory: null,
  customName: null,
  reaction: null,
  readingMode: 'auto',
  deletedForUserAt: null,
  clearHistoryBefore: null,
  version,
  category: null,
});

/**
 * Le double qui REFUSE ce que le vrai client refuse. Sans lui, la suite
 * atteste un détachement dont la requête lèverait en production — c'est
 * exactement ce qui a laissé le défaut vivre (« un double de test ment aussi
 * par ce qu'il ACCEPTE »).
 */
const keyValueStoreDouble = () => ({
  updateMany: jest.fn<any>().mockImplementation((args: any) => {
    const named = [...Object.keys(args?.where ?? {}), ...Object.keys(args?.data ?? {})];
    const unknown = named.filter((key) => !['id', 'conversationId', 'userId', 'key', 'value', 'valueType', 'description'].includes(key));
    if (unknown.length > 0) {
      throw new Error(`Unknown argument \`${unknown[0]}\` on prisma.conversationPreference.updateMany()`);
    }
    return Promise.resolve({ count: 0 });
  }),
});

function makePrisma(attached: string[]) {
  let bumped = false;
  return {
    userConversationCategory: {
      findFirst: jest.fn<any>().mockResolvedValue(categoryRow),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      delete: jest.fn<any>().mockResolvedValue(categoryRow),
    },
    userConversationPreferences: {
      findMany: jest.fn<any>().mockImplementation(() =>
        Promise.resolve(attached.map((id) => prefRow(id, bumped ? 8 : 7)))
      ),
      updateMany: jest.fn<any>().mockImplementation(() => {
        bumped = true;
        return Promise.resolve({ count: attached.length });
      }),
    },
    conversationPreference: keyValueStoreDouble(),
    $transaction: jest.fn<any>().mockResolvedValue([]),
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  // Le hook d'auth vit chez le PARENT en production
  // (routes/me/preferences/index.ts) — categoriesRoutes n'en pose plus le
  // sien depuis #4182 critère 4. On le reproduit ici, avant le plugin.
  app.addHook('preHandler', async (req: FastifyRequest) => {
    (req as any).auth = { userId: USER_ID, isAuthenticated: true };
  });

  await app.register(categoriesRoutes);
  await app.ready();
  return app;
}

const deleteCategory = (app: FastifyInstance) =>
  app.inject({ method: 'DELETE', url: `/${CATEGORY_ID}` });

describe('DELETE /me/preferences/categories/:categoryId — le détachement', () => {
  beforeEach(() => {
    mockBroadcast.mockClear();
  });

  it('supprime la catégorie au lieu de rendre 500', async () => {
    const prisma = makePrisma(['68a00000000000000000000a']);
    const app = await buildApp(prisma);

    const res = await deleteCategory(app);

    expect(res.statusCode).toBe(200);
    expect(prisma.userConversationCategory.delete).toHaveBeenCalledWith({ where: { id: CATEGORY_ID } });
    await app.close();
  });

  it("détache sur `userConversationPreferences` — jamais sur le magasin clé/valeur", async () => {
    const prisma = makePrisma(['68a00000000000000000000a', '68a00000000000000000000b']);
    const app = await buildApp(prisma);

    await deleteCategory(app);

    expect(prisma.conversationPreference.updateMany).not.toHaveBeenCalled();
    expect(prisma.userConversationPreferences.updateMany).toHaveBeenCalledWith({
      where: { userId: USER_ID, categoryId: CATEGORY_ID },
      data: { categoryId: null, version: { increment: 1 } },
    });
    await app.close();
  });

  it('détache AVANT de supprimer la catégorie — jamais après', async () => {
    const order: string[] = [];
    const prisma = makePrisma(['68a00000000000000000000a']);
    prisma.userConversationPreferences.updateMany.mockImplementation(() => {
      order.push('detach');
      return Promise.resolve({ count: 1 });
    });
    prisma.userConversationCategory.delete.mockImplementation(() => {
      order.push('delete');
      return Promise.resolve(categoryRow);
    });
    const app = await buildApp(prisma);

    await deleteCategory(app);

    expect(order).toEqual(['detach', 'delete']);
    await app.close();
  });

  it('annonce chaque conversation détachée aux autres appareils, avec sa version incrémentée', async () => {
    const prisma = makePrisma(['68a00000000000000000000a', '68a00000000000000000000b']);
    const app = await buildApp(prisma);

    await deleteCategory(app);

    const updates = mockBroadcast.mock.calls.filter(
      (call: any[]) => call[2] === SERVER_EVENTS.USER_PREFERENCES_UPDATED
    );
    expect(updates).toHaveLength(2);
    expect(updates.map((call: any[]) => call[3].conversationId)).toEqual([
      '68a00000000000000000000a',
      '68a00000000000000000000b',
    ]);
    expect(updates[0][3]).toMatchObject({
      userId: USER_ID,
      version: 8,
      reset: false,
      preferences: expect.objectContaining({ categoryId: null }),
    });
    await app.close();
  });

  it("n'écrit ni ne diffuse rien quand la catégorie ne porte aucune conversation", async () => {
    const prisma = makePrisma([]);
    const app = await buildApp(prisma);

    const res = await deleteCategory(app);

    expect(res.statusCode).toBe(200);
    expect(prisma.userConversationPreferences.updateMany).not.toHaveBeenCalled();
    expect(
      mockBroadcast.mock.calls.filter((call: any[]) => call[2] === SERVER_EVENTS.USER_PREFERENCES_UPDATED)
    ).toHaveLength(0);
    expect(prisma.userConversationCategory.delete).toHaveBeenCalled();
    await app.close();
  });

  it('annonce la suppression de la catégorie elle-même', async () => {
    const prisma = makePrisma([]);
    const app = await buildApp(prisma);

    await deleteCategory(app);

    expect(mockBroadcast).toHaveBeenCalledWith(
      expect.anything(),
      USER_ID,
      SERVER_EVENTS.CATEGORY_DELETED,
      { userId: USER_ID, categoryId: CATEGORY_ID }
    );
    await app.close();
  });
});

describe('POST /me/preferences/categories/reorder — la charge nomme ce qui a été ÉCRIT', () => {
  beforeEach(() => {
    mockBroadcast.mockClear();
  });

  const reorder = (app: FastifyInstance, updates: Array<{ categoryId: string; order: number }>) =>
    app.inject({ method: 'POST', url: '/reorder', payload: { updates } });

  it("n'annonce pas l'ordre d'une catégorie que le filtre d'appartenance a écartée", async () => {
    const prisma = makePrisma([]);
    prisma.userConversationCategory.updateMany
      .mockResolvedValueOnce({ count: 1 })
      .mockResolvedValueOnce({ count: 0 });
    const app = await buildApp(prisma);

    await reorder(app, [
      { categoryId: CATEGORY_ID, order: 0 },
      { categoryId: '68a0000000000000000000ff', order: 1 },
    ]);

    const reordered = mockBroadcast.mock.calls.filter(
      (call: any[]) => call[2] === SERVER_EVENTS.CATEGORIES_REORDERED
    );
    expect(reordered).toHaveLength(1);
    expect(reordered[0][3].updates).toEqual([{ categoryId: CATEGORY_ID, order: 0 }]);
    await app.close();
  });

  it('ne diffuse rien quand aucune ligne n’a été écrite', async () => {
    const prisma = makePrisma([]);
    prisma.userConversationCategory.updateMany.mockResolvedValue({ count: 0 });
    const app = await buildApp(prisma);

    const res = await reorder(app, [{ categoryId: '68a0000000000000000000ff', order: 3 }]);

    expect(res.statusCode).toBe(200);
    expect(
      mockBroadcast.mock.calls.filter((call: any[]) => call[2] === SERVER_EVENTS.CATEGORIES_REORDERED)
    ).toHaveLength(0);
    await app.close();
  });
});
