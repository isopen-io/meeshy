/**
 * #7345 — « Marquer lu fige `readAt` sur les messages d'autrui ».
 *
 * `conversation-receipts.test.ts` mesure la porte avec `MessageReadStatusService`
 * MOQUÉ (`FROZEN_COUNT` constant) : il prouve que la route relaie ce que le
 * service rend, jamais que le CALCUL est juste — la note du cadrage de #7345 le
 * dit explicitement, et `grep -rl 'read.*receipt' __tests__/integration/` ne
 * rend aucun fichier. Ce témoin monte la VRAIE route ET le VRAI
 * `MessageReadStatusService` (aucun des deux n'est moqué) au-dessus d'un Prisma
 * fidèle en mémoire (`fakePrismaStore.ts`) — bout en bout route → service →
 * résumé, sans process Mongo (indisponible dans ce bac à sable : ni `docker`,
 * ni `mongod`, ni `mongodb-memory-server` au dépôt). C'est le témoin que le
 * critère de fin exige AVANT tout correctif ; la preuve définitive reste la
 * recette sur staging (Mongo réel) prescrite par la spec du chantier.
 *
 * Scénario rejoué : B (lecteur) marque lus 5 messages envoyés par A dans une
 * conversation à deux, sans lecture préalable — exactement la manip décrite
 * dans #7345 (`POST /conversations/:id/receipts {type:'read', messageIds:[...]}`).
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { conversationReceiptsRoutes } from '../../../routes/conversations/receipts';
import { FakePrismaStore, nextFakeObjectId } from '../../support/fakePrismaStore';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const READER_USER_ID = 'user-b-recette-lecture';
const SENDER_USER_ID = 'user-a-atabeth';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any, reply: any) => {
    if (!request.headers['authorization']) {
      return reply.code(401).send({ success: false, error: 'Unauthorized' });
    }
    request.authContext = {
      userId: (request.headers['x-test-user-id'] as string) ?? READER_USER_ID,
      type: 'registered',
      isAnonymous: false,
      hasFullAccess: true,
    };
  },
}));

const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const AUTH = { authorization: 'Bearer test-token' };

/** Un participant SANS restriction d'historique — `shareLinkId: null` règle son plancher à `null`. */
function seedParticipant(store: FakePrismaStore, args: { id: string; userId: string }) {
  store.seed('participant', {
    id: args.id,
    conversationId: CONVERSATION_ID,
    userId: args.userId,
    isActive: true,
    role: 'member',
    joinedAt: new Date('2020-01-01T00:00:00Z'),
    shareLinkId: null,
    historyVisibleFrom: null,
    permissions: null,
    anonymousSession: null,
    user: null,
  });
}

function seedMessageFromSender(store: FakePrismaStore, senderId: string, createdAt: Date): string {
  const id = nextFakeObjectId();
  store.seed('message', { id, conversationId: CONVERSATION_ID, senderId, deletedAt: null, createdAt });
  return id;
}

async function buildApp(store: FakePrismaStore): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', store.asPrismaClient() as any);
  await app.register(conversationReceiptsRoutes);
  await app.ready();
  return app;
}

describe('#7345 — POST /conversations/:id/receipts {type:"read"} sur des messages d’autrui (bout en bout, service réel)', () => {
  let store: FakePrismaStore;
  let participantA: string;
  let participantB: string;
  let messageIds: string[];

  beforeEach(() => {
    store = new FakePrismaStore();
    participantA = nextFakeObjectId();
    participantB = nextFakeObjectId();
    seedParticipant(store, { id: participantA, userId: SENDER_USER_ID });
    seedParticipant(store, { id: participantB, userId: READER_USER_ID });

    const base = new Date('2026-09-20T10:00:00Z').getTime();
    messageIds = Array.from({ length: 5 }, (_, i) =>
      seedMessageFromSender(store, participantA, new Date(base + i * 1000))
    );
  });

  it('fige `readAt` sur les 5 messages d’A : markedCount = 5, unreadCount retombe à 0', async () => {
    const app = await buildApp(store);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/receipts`,
      headers: AUTH,
      payload: { type: 'read', messageIds },
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual({ type: 'read', markedCount: 5, unreadCount: 0 });
  });

  it('pose `lastReadMessageId` sur le curseur de B, au dernier message rapporté', async () => {
    const app = await buildApp(store);

    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/receipts`,
      headers: AUTH,
      payload: { type: 'read', messageIds },
    });

    const [cursor] = store.rows('conversationReadCursor').filter(
      (row) => row.participantId === participantB && row.conversationId === CONVERSATION_ID
    );
    expect(cursor?.lastReadMessageId).toBe(messageIds[4]);
    expect(cursor?.lastReadAt).toBeInstanceOf(Date);
  });

  it('rend readCount = 1 et readByAllAt posé pour chacun des 5 messages, via `GET …/receipts?detail=summary`', async () => {
    const app = await buildApp(store);

    await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/receipts`,
      headers: AUTH,
      payload: { type: 'read', messageIds },
    });

    const summaryResponse = await app.inject({
      method: 'GET',
      url: `/conversations/${CONVERSATION_ID}/receipts?detail=summary&messageIds=${messageIds.join(',')}`,
      headers: AUTH,
    });

    expect(summaryResponse.statusCode).toBe(200);
    const { summary } = summaryResponse.json().data as {
      summary: Record<string, { readCount: number; readByAllAt: string | null }>;
    };
    for (const id of messageIds) {
      expect(summary[id].readCount).toBe(1);
      expect(summary[id].readByAllAt).not.toBeNull();
    }
  });
});
