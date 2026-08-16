/**
 * Témoin de CÂBLAGE : les trois routes qui écrivent `UserMessageDeletion`
 * diffusent-elles vraiment sur le fil ?
 *
 * `personalMessageVisibilitySync.test.ts` prouve que le module diffuse. Il ne
 * prouve pas que les routes l'appellent — et c'est précisément la moitié qui
 * manquait pendant toute la vie de ces routes : elles persistaient, elles
 * rétractaient la notification, et elles s'arrêtaient là. Un test de service
 * seul serait resté vert sur la version défaillante.
 *
 * Le harnais décore donc l'app d'un `socketIOHandler` espion et lit ce qui sort
 * de `io.to(room).emit(...)`, pas ce que la route croit avoir fait.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const USER_ID = '507f1f77bcf86cd799439011';
const CONV_ID = 'aaaaaaaaaaaaaaaaaaaaaaaa';
const OTHER_CONV_ID = 'dddddddddddddddddddddddd';
const MSG_ID = 'bbbbbbbbbbbbbbbbbbbbbbbb';
const MSG_ID_2 = 'cccccccccccccccccccccccc';
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

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: {
    type: 'object',
    properties: { success: { type: 'boolean' }, error: { type: 'string' } },
  },
}));

import userDeletionsRoutes from '../../../routes/user-deletions';

type Emission = { room: string; event: string; payload: unknown };

type PrismaOverrides = {
  msgFindMany?: Array<{ id: string; conversationId: string }>;
  msgDeletionFindUnique?: { message: { conversationId: string } } | null;
};

async function buildApp(
  emissions: Emission[],
  over: PrismaOverrides = {}
): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    participant: {
      findFirst: jest.fn(async () => ({
        id: 'part-1',
        userId: USER_ID,
        conversationId: CONV_ID,
        isActive: true,
      })),
      // Lu par le rafraîchissement de la ligne de liste
      // (`personalPreviewRefresh` → `emitConversationPreviewUpdate`). Sans ce
      // double, l'émetteur d'aperçu — canal best-effort qui avale ses propres
      // pannes — resterait MUET, et le témoin de câblage ci-dessous serait vert
      // sur une route qui n'appelle rien.
      findMany: jest.fn(async () => [
        { id: 'part-1', userId: USER_ID },
        { id: 'part-2', userId: 'peer-user' },
      ]),
    },
    userConversationPreferences: {
      findUnique: jest.fn(async () => null),
      upsert: jest.fn(async () => ({})),
      findMany: jest.fn(async () => []),
    },
    message: {
      findFirst: jest.fn(async () => ({
        id: 'msg-previous',
        content: 'the one before',
        senderId: 'part-2',
        createdAt: new Date('2026-08-15T09:00:00Z'),
      })),
      findUnique: jest.fn(async () => ({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        conversation: {
          participants: [{ id: 'part-1', userId: USER_ID, conversationId: CONV_ID, isActive: true }],
        },
      })),
      findMany: jest.fn(async () => over.msgFindMany ?? [{ id: MSG_ID, conversationId: CONV_ID }]),
    },
    userMessageDeletion: {
      findMany: jest.fn(async () => [{ userId: USER_ID, messageId: MSG_ID }]),
      findUnique: jest.fn(async () =>
        over.msgDeletionFindUnique === undefined
          ? { message: { conversationId: CONV_ID } }
          : over.msgDeletionFindUnique
      ),
      upsert: jest.fn(async () => ({})),
      delete: jest.fn(async () => ({})),
    },
    notification: {
      findMany: jest.fn(async () => []),
      deleteMany: jest.fn(async () => ({ count: 0 })),
    },
    $transaction: jest.fn(async () => undefined),
  } as unknown);

  app.decorate('socketIOHandler', {
    io: {
      to: (room: string) => ({
        emit: (event: string, payload: unknown) => {
          emissions.push({ room, event, payload });
        },
      }),
    },
  } as unknown);

  await app.register(userDeletionsRoutes);
  await app.ready();
  return app;
}

const hidingEmissions = (emissions: Emission[]) =>
  emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_HIDDEN_FOR_ME);

describe('les routes de masquage personnel diffusent aux AUTRES appareils', () => {
  let emissions: Emission[];

  beforeEach(() => {
    emissions = [];
  });

  it('DELETE /api/messages/:id/delete-for-me émet vers la room de l’utilisateur', async () => {
    const app = await buildApp(emissions);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);

    const hidden = hidingEmissions(emissions);
    expect(hidden).toHaveLength(1);
    expect(hidden[0]?.room).toBe(`user:${USER_ID}`);
    expect((hidden[0]?.payload as { messages: unknown[] }).messages).toEqual([
      { messageId: MSG_ID, conversationId: CONV_ID },
    ]);

    await app.close();
  });

  it('le lot émet UN seul événement portant chaque message avec SA conversation', async () => {
    const app = await buildApp(emissions, {
      msgFindMany: [
        { id: MSG_ID, conversationId: CONV_ID },
        { id: MSG_ID_2, conversationId: OTHER_CONV_ID },
      ],
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: AUTH,
      payload: { messageIds: [MSG_ID, MSG_ID_2] },
    });
    expect(res.statusCode).toBe(200);

    const hidden = hidingEmissions(emissions);
    expect(hidden).toHaveLength(1);
    // Un lot peut traverser plusieurs conversations : recopier la conversation
    // du PREMIER message sur tous serait un cache invalidé au mauvais endroit.
    expect((hidden[0]?.payload as { messages: unknown[] }).messages).toEqual([
      { messageId: MSG_ID, conversationId: CONV_ID },
      { messageId: MSG_ID_2, conversationId: OTHER_CONV_ID },
    ]);

    await app.close();
  });

  it('un lot dont AUCUN message n’est accessible ne diffuse rien', async () => {
    const app = await buildApp(emissions, { msgFindMany: [] });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: AUTH,
      payload: { messageIds: [MSG_ID] },
    });
    expect(res.statusCode).toBe(403);
    expect(hidingEmissions(emissions)).toHaveLength(0);

    await app.close();
  });

  it('POST /api/messages/:id/restore-for-me émet l’événement INVERSE', async () => {
    const app = await buildApp(emissions);

    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);

    const restored = emissions.filter((e) => e.event === SERVER_EVENTS.MESSAGE_RESTORED_FOR_ME);
    expect(restored).toHaveLength(1);
    expect(restored[0]?.room).toBe(`user:${USER_ID}`);
    expect((restored[0]?.payload as { messages: unknown[] }).messages).toEqual([
      { messageId: MSG_ID, conversationId: CONV_ID },
    ]);

    await app.close();
  });

  it('un restore refusé (rien n’était masqué) ne diffuse rien', async () => {
    const app = await buildApp(emissions, { msgDeletionFindUnique: null });

    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(400);
    expect(emissions).toHaveLength(0);

    await app.close();
  });
});

/**
 * Second témoin de CÂBLAGE, une couche plus loin : les routes rafraîchissent-elles
 * la LIGNE DE LISTE de leur auteur ?
 *
 * `personalPreviewRefresh` + `emitConversationPreviewUpdate` savent la recalculer
 * depuis longtemps — au masquage personnel de chaque lecteur, et à lui seul. Il
 * leur manquait un appelant AU MOMENT où le masquage naît : la ligne se corrigeait
 * à la mutation suivante d'un tiers, jamais au geste lui-même.
 *
 * Les quatre routes de masquage personnel sont couvertes ici, `clear-history`
 * comprise : elle écrit l'autre des deux tables que la règle lit.
 */
describe('les routes de masquage personnel rafraîchissent la ligne de liste', () => {
  let emissions: Emission[];

  const previews = (all: Emission[]) =>
    all.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);

  beforeEach(() => {
    emissions = [];
  });

  it('DELETE /delete-for-me pousse le remplaçant dans la seule room de l’auteur', async () => {
    const app = await buildApp(emissions);

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/messages/${MSG_ID}/delete-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);

    const refreshed = previews(emissions);
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]?.room).toBe(`user:${USER_ID}`);
    expect((refreshed[0]?.payload as { lastMessageId: string | null }).lastMessageId).toBe(
      'msg-previous'
    );

    await app.close();
  });

  it('le lot rafraîchit UNE ligne par conversation traversée', async () => {
    const app = await buildApp(emissions, {
      msgFindMany: [
        { id: MSG_ID, conversationId: CONV_ID },
        { id: MSG_ID_2, conversationId: OTHER_CONV_ID },
      ],
    });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: AUTH,
      payload: { messageIds: [MSG_ID, MSG_ID_2] },
    });
    expect(res.statusCode).toBe(200);

    expect(
      previews(emissions)
        .map((e) => (e.payload as { conversationId: string }).conversationId)
        .sort()
    ).toEqual([CONV_ID, OTHER_CONV_ID].sort());

    await app.close();
  });

  it('POST /restore-for-me rafraîchit au même titre', async () => {
    const app = await buildApp(emissions);

    const res = await app.inject({
      method: 'POST',
      url: `/api/messages/${MSG_ID}/restore-for-me`,
      headers: AUTH,
    });
    expect(res.statusCode).toBe(200);

    expect(previews(emissions).map((e) => e.room)).toEqual([`user:${USER_ID}`]);

    await app.close();
  });

  it('POST /clear-history rafraîchit la ligne que la coupure vient de vider', async () => {
    const app = await buildApp(emissions);

    const res = await app.inject({
      method: 'POST',
      url: `/api/conversations/${CONV_ID}/clear-history`,
      headers: AUTH,
      payload: { beforeDate: '2026-08-15T12:00:00.000Z' },
    });
    expect(res.statusCode).toBe(200);

    const refreshed = previews(emissions);
    expect(refreshed).toHaveLength(1);
    expect(refreshed[0]?.room).toBe(`user:${USER_ID}`);

    await app.close();
  });

  it('un lot sans aucun message accessible ne rafraîchit rien', async () => {
    const app = await buildApp(emissions, { msgFindMany: [] });

    const res = await app.inject({
      method: 'DELETE',
      url: '/api/messages/bulk/delete-for-me',
      headers: AUTH,
      payload: { messageIds: [MSG_ID] },
    });
    expect(res.statusCode).toBe(403);
    expect(previews(emissions)).toHaveLength(0);

    await app.close();
  });
});
