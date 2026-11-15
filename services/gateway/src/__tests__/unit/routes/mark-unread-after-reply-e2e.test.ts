/**
 * #7346 — parité liste ↔ détail ↔ badge poussé du `unreadCount`, et
 * « marquer non lu » qui reste effectif après une réponse.
 *
 * Patron de `conversation-receipts-read-e2e.test.ts` (#7345) : la VRAIE route
 * `POST /conversations/:id/mark-unread` (`registerMarkUnreadRoute`) ET le VRAI
 * `MessageReadStatusService` (aucun des deux n'est moqué) au-dessus d'un
 * Prisma fidèle en mémoire (`fakePrismaStore.ts`).
 *
 * `GET /conversations` (liste) et `GET /conversations/:id` (détail) vivent
 * dans deux AUTRES fichiers (`core-list.ts`, `core-detail.ts`), hors du
 * périmètre de fichiers de ce lot (cadrage V1) et lourds à monter en entier
 * (projection de champs, résolution de titre, pagination…) pour une question
 * qui ne porte que sur LEUR dépendance commune. Ce témoin appelle donc
 * directement les DEUX méthodes de service que ces deux routes délèguent —
 * `MessageReadStatusService.getUnreadCount` (ce que le DÉTAIL calcule) et
 * `.getUnreadCountsForUser` (ce que la LISTE calcule, batché) — sur le MÊME
 * état de curseur que la route `mark-unread` vient d'écrire : c'est la
 * dépendance partagée, prouvée réelle (aucun mock de service), qui fait la
 * parité, pas une HTTP de façade.
 *
 * Scénario rejoué (relevé #7346, G-3) : B reçoit un message d'A, le lit,
 * RÉPOND (ce qui avance son propre curseur sur SON message —
 * `MessagingService.runPostSaveSideEffects` appelle exactement
 * `MessageReadStatusService.markMessagesAsRead(senderParticipantId, …,
 * message.id)`, reproduit ici à l'identique sans construire tout
 * `MessagingService`, non nécessaire à ce défaut), puis appelle
 * `mark-unread`. Rouge avant le correctif : la garde de #7346 lit le curseur
 * de B — désormais sur SON PROPRE message, plus récent que le message d'A —
 * et refuse le rewind, rendant `{unreadCount:0}` alors que B vient de
 * demander explicitement l'inverse ; les trois lectures (réponse de la route,
 * `getUnreadCount`, `getUnreadCountsForUser`) s'accordent alors, mais sur la
 * valeur FAUSSE. Vert après : les trois s'accordent sur `1`, et le badge
 * poussé (`conversation:unread-updated`, room `user:<B>`) porte la même valeur.
 *
 * @jest-environment node
 */

import Fastify, { FastifyInstance } from 'fastify';
import { registerMarkUnreadRoute } from '../../../routes/conversations/messages-read-status';
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { FakePrismaStore, nextFakeObjectId } from '../../support/fakePrismaStore';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() }),
  },
}));

const READER_USER_ID = 'user-b-recette-lecture';
const SENDER_USER_ID = 'user-a-atabeth';
const CONVERSATION_ID = '507f1f77bcf86cd799439012';
const AUTH = { authorization: 'Bearer test-token' };

async function participantAuth(request: any, reply: any): Promise<void> {
  if (!request.headers['authorization']) {
    reply.code(401).send({ success: false, error: 'Unauthorized' });
    return;
  }
  request.authContext = {
    userId: READER_USER_ID,
    type: 'registered',
    isAuthenticated: true,
    isAnonymous: false,
    hasFullAccess: true,
  };
}

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

function seedMessage(store: FakePrismaStore, args: { senderId: string; createdAt: Date }): string {
  const id = nextFakeObjectId();
  store.seed('message', { id, conversationId: CONVERSATION_ID, senderId: args.senderId, deletedAt: null, createdAt: args.createdAt });
  return id;
}

/** Le mock Socket.IO minimal que la route interroge pour pousser le badge. */
function makeSocketIOHandler() {
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  const getIO = jest.fn(() => ({ to }));
  const getManager = jest.fn(() => ({ getIO }));
  return { socketIOHandler: { getManager }, to, emit };
}

async function buildApp(store: FakePrismaStore, socketIOHandler: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', store.asPrismaClient() as any);
  registerMarkUnreadRoute(app, store.asPrismaClient() as any, participantAuth, socketIOHandler);
  await app.ready();
  return app;
}

describe('#7346 — parité liste ↔ détail ↔ badge poussé après mark-unread, une réponse entre-temps', () => {
  it('la route, le calcul du DÉTAIL et le calcul de la LISTE rendent tous les trois 1 — et le badge poussé le porte', async () => {
    const store = new FakePrismaStore();
    const participantA = nextFakeObjectId();
    const participantB = nextFakeObjectId();
    seedParticipant(store, { id: participantA, userId: SENDER_USER_ID });
    seedParticipant(store, { id: participantB, userId: READER_USER_ID });

    const t0 = new Date('2026-09-21T10:00:00Z').getTime();
    const messageFromA = seedMessage(store, { senderId: participantA, createdAt: new Date(t0) });

    const readStatusService = new MessageReadStatusService(store.asPrismaClient() as any);

    // 1. B lit le message d'A.
    await readStatusService.markMessagesAsRead(participantB, CONVERSATION_ID, messageFromA);

    // 2. B répond — MessagingService.runPostSaveSideEffects (MessagingService.ts:539)
    //    avance le curseur du LECTEUR sur SON PROPRE message, exactement cet appel.
    const messageFromB = seedMessage(store, { senderId: participantB, createdAt: new Date(t0 + 1000) });
    await readStatusService.markMessagesAsRead(participantB, CONVERSATION_ID, messageFromB);

    // Sanity : tout est lu avant l'appel à mark-unread — les deux calculs
    // partagés s'accordent déjà à 0 (pas encore le défaut visé).
    expect(await readStatusService.getUnreadCount(participantB, CONVERSATION_ID)).toBe(0);
    expect(
      (await readStatusService.getUnreadCountsForUser(READER_USER_ID, [CONVERSATION_ID])).get(CONVERSATION_ID)
    ).toBe(0);

    // 3. B (ou un autre de ses appareils) marque la conversation non lue.
    const { socketIOHandler, to, emit } = makeSocketIOHandler();
    const app = await buildApp(store, socketIOHandler);

    const response = await app.inject({
      method: 'POST',
      url: `/conversations/${CONVERSATION_ID}/mark-unread`,
      headers: AUTH,
    });

    expect(response.statusCode).toBe(200);
    // La réponse de la route — ce que l'UI applique en optimiste.
    expect(response.json().data).toEqual({ unreadCount: 1 });

    // Le DÉTAIL (`GET /conversations/:id` → `getUnreadCount`) et la LISTE
    // (`GET /conversations` → `getUnreadCountsForUser`) partagent le MÊME
    // curseur que la route vient d'écrire : les trois doivent s'accorder.
    expect(await readStatusService.getUnreadCount(participantB, CONVERSATION_ID)).toBe(1);
    expect(
      (await readStatusService.getUnreadCountsForUser(READER_USER_ID, [CONVERSATION_ID])).get(CONVERSATION_ID)
    ).toBe(1);

    // Le badge poussé aux autres appareils du lecteur porte la même valeur.
    expect(to).toHaveBeenCalledWith(`user:${READER_USER_ID}`);
    expect(emit).toHaveBeenCalledWith('conversation:unread-updated', {
      conversationId: CONVERSATION_ID,
      unreadCount: 1,
    });
  });
});
