/**
 * conversation-update-fanout.test.ts
 *
 * `PUT /conversations/:id` (renommage, avatar, bannière, mode lent, canal
 * d'annonce, traduction auto) n'adressait `conversation:updated` qu'à
 * `ROOMS.conversation(id)`. Or un participant posé sur l'écran de LISTE a
 * quitté cette room et n'est joignable que par sa room personnelle — c'est
 * exactement le raisonnement qui a fait naître `emitConversationPreviewUpdate`
 * pour l'aperçu du dernier message, sur l'autre moitié du même payload.
 * Conséquence : un groupe renommé gardait son ancien titre dans la liste de
 * tous ceux qui n'avaient pas le fil ouvert, jusqu'à un rechargement complet.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { ROOMS, SERVER_EVENTS } from '@meeshy/shared/types/socketio-events';

const ADMIN_ID = '507f1f77bcf86cd799439001';
const MEMBER_ID = '507f1f77bcf86cd799439002';
const LEFT_MEMBER_ID = '507f1f77bcf86cd799439003';
const ANON_PARTICIPANT_ID = '507f1f77bcf86cd7994390cc';
const CONV_ID = '507f1f77bcf86cd7994390bb';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    })),
  },
}));

type EmittedEvent = { rooms: string[]; event: string; payload: unknown };

/**
 * Double du `BroadcastOperator` de Socket.IO. Il enregistre la CHAÎNE de rooms
 * qui a porté chaque emit, et non un ensemble plat : la propriété testée ici
 * est « au plus une copie par socket », que seul le chaînage garantit. Un
 * double qui n'enregistrerait que les rooms ne saurait pas distinguer un
 * `io.to(a).to(b).emit()` de deux `emit` séparés — soit précisément le défaut
 * que le chaînage évite.
 */
function makeIo(emitted: EmittedEvent[]) {
  const chain = (rooms: string[]) => ({
    to(room: string) {
      return chain([...rooms, room]);
    },
    emit(event: string, payload: unknown) {
      emitted.push({ rooms, event, payload });
    },
  });
  return { to: (room: string) => chain([room]) };
}

function makeParticipants() {
  return [
    { id: 'p-admin', userId: ADMIN_ID, isActive: true, user: { id: ADMIN_ID, username: 'admin', displayName: 'Admin', avatar: null, banner: null } },
    { id: 'p-member', userId: MEMBER_ID, isActive: true, user: { id: MEMBER_ID, username: 'member', displayName: 'Member', avatar: null, banner: null } },
    // Participant sans compte (invité par lien) : sa room personnelle est
    // nommée d'après son `Participant.id`, cf. `emitToConversationParticipants`.
    { id: ANON_PARTICIPANT_ID, userId: null, isActive: true, user: null },
    { id: 'p-left', userId: LEFT_MEMBER_ID, isActive: false, user: { id: LEFT_MEMBER_ID, username: 'left', displayName: 'Left', avatar: null, banner: null } },
  ];
}

function createMockPrisma() {
  const conversationUpdate = jest.fn(async (args: any) => ({
    id: CONV_ID,
    identifier: 'mshy_group',
    type: 'group',
    title: args?.data?.title ?? 'Ancien nom',
    participants: makeParticipants(),
  }));

  const prisma = {
    participant: {
      findFirst: jest.fn(async () => ({ id: 'p-admin', userId: ADMIN_ID, role: 'admin', isActive: true })),
    },
    conversation: {
      update: conversationUpdate,
    },
    // #3740 — `DELETE /conversations/:id` désactive aussi les liens de
    // partage encore actifs du fil, dans la MÊME transaction que la clôture.
    conversationShareLink: { updateMany: jest.fn().mockResolvedValue({ count: 0 }) },
    $transaction: jest.fn((ops: any) => Promise.all(ops)),
  } as unknown as PrismaClient;

  return { prisma, conversationUpdate };
}

async function buildApp(prisma: PrismaClient, emitted: EmittedEvent[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  const requiredAuth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ADMIN_ID,
      registeredUser: { id: ADMIN_ID },
      hasFullAccess: true,
    };
  };
  (app as unknown as Record<string, unknown>).socketIOHandler = {
    getManager: () => ({ getIO: () => makeIo(emitted) }),
  };
  const { registerCoreRoutes } = await import('../../../routes/conversations/core');
  registerCoreRoutes(app, prisma, requiredAuth, requiredAuth);
  await app.ready();
  return app;
}

async function renameTo(app: FastifyInstance, title: string) {
  return app.inject({
    method: 'PUT',
    url: `/conversations/${CONV_ID}`,
    headers: { authorization: 'Bearer x' },
    payload: { title },
  });
}

describe('PUT /conversations/:id — audience de conversation:updated', () => {
  let emitted: EmittedEvent[];

  beforeEach(() => {
    emitted = [];
  });

  it('atteint la room personnelle de chaque participant ACTIF, pas seulement la room de conversation', async () => {
    const { prisma } = createMockPrisma();
    const app = await buildApp(prisma, emitted);

    const res = await renameTo(app, 'Nouveau nom');
    expect(res.statusCode).toBe(200);

    const update = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(update).toBeDefined();
    expect(update!.rooms).toEqual(expect.arrayContaining([
      ROOMS.conversation(CONV_ID),
      ROOMS.user(ADMIN_ID),
      ROOMS.user(MEMBER_ID),
    ]));

    await app.close();
  });

  it('adresse un participant SANS compte par son Participant.id', async () => {
    const { prisma } = createMockPrisma();
    const app = await buildApp(prisma, emitted);

    await renameTo(app, 'Nouveau nom');

    const update = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(update!.rooms).toContain(ROOMS.user(ANON_PARTICIPANT_ID));

    await app.close();
  });

  it("n'adresse PAS un participant qui a quitté la conversation", async () => {
    const { prisma } = createMockPrisma();
    const app = await buildApp(prisma, emitted);

    await renameTo(app, 'Nouveau nom');

    const update = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(update!.rooms).not.toContain(ROOMS.user(LEFT_MEMBER_ID));

    await app.close();
  });

  it('émet UNE seule fois, en chaînant les rooms (au plus une copie par socket)', async () => {
    const { prisma } = createMockPrisma();
    const app = await buildApp(prisma, emitted);

    await renameTo(app, 'Nouveau nom');

    const updates = emitted.filter((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);
    expect(updates).toHaveLength(1);
    expect(new Set(updates[0].rooms).size).toBe(updates[0].rooms.length);

    await app.close();
  });

  it('ne parle pas du dernier message : aucune clé lastMessage* dans le payload', async () => {
    // Le tri-état client (`LastMessagePreviewTranslations`) distingue « clé
    // absente » de « clé nulle ». Une mise à jour de métadonnées ne sait RIEN
    // du dernier message : y poser `lastMessageTranslations: null` dirait au
    // client que la carte du Prisme est périmée, et effacerait une traduction
    // parfaitement valide sur toutes les lignes de liste.
    const { prisma } = createMockPrisma();
    const app = await buildApp(prisma, emitted);

    await renameTo(app, 'Nouveau nom');

    const update = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_UPDATED);
    const payload = update!.payload as Record<string, unknown>;
    expect(payload.title).toBe('Nouveau nom');
    expect(payload.conversationId).toBe(CONV_ID);
    expect(Object.keys(payload).some((k) => k.startsWith('lastMessage'))).toBe(false);

    await app.close();
  });
});

describe('DELETE /conversations/:id — audience de conversation:closed', () => {
  let emitted: EmittedEvent[];

  beforeEach(() => {
    emitted = [];
  });

  it('annonce la clôture à TOUS les membres, y compris ceux posés sur la liste', async () => {
    // Le commentaire du code disait « Broadcast closure to all members » alors
    // que l'emit n'adressait que la room de conversation : un membre qui n'avait
    // pas le fil ouvert gardait la ligne dans sa liste et n'apprenait la
    // fermeture qu'en tapant dessus. Les deux clients écoutent l'événement
    // (`use-socket-cache-sync.ts` côté web, `MessageSocketManager` côté iOS) —
    // il ne leur parvenait simplement jamais.
    const { prisma } = createMockPrisma();
    const app = await buildApp(prisma, emitted);

    const res = await app.inject({
      method: 'DELETE',
      url: `/conversations/${CONV_ID}`,
      headers: { authorization: 'Bearer x' },
    });
    expect(res.statusCode).toBe(200);

    const closed = emitted.find((e) => e.event === SERVER_EVENTS.CONVERSATION_CLOSED);
    expect(closed).toBeDefined();
    expect(closed!.rooms).toEqual(expect.arrayContaining([
      ROOMS.conversation(CONV_ID),
      ROOMS.user(ADMIN_ID),
      ROOMS.user(MEMBER_ID),
      ROOMS.user(ANON_PARTICIPANT_ID),
    ]));
    expect(closed!.rooms).not.toContain(ROOMS.user(LEFT_MEMBER_ID));

    await app.close();
  });

  it('lit les participants DANS l\'écriture de clôture, sans seconde requête', async () => {
    const { prisma, conversationUpdate } = createMockPrisma();
    const app = await buildApp(prisma, emitted);

    await app.inject({
      method: 'DELETE',
      url: `/conversations/${CONV_ID}`,
      headers: { authorization: 'Bearer x' },
    });

    const closeCall = conversationUpdate.mock.calls.find((c: any[]) => c[0]?.data?.isActive === false);
    expect(closeCall).toBeDefined();
    expect((closeCall as any[])[0].include?.participants?.select).toEqual(
      expect.objectContaining({ id: true, userId: true, isActive: true })
    );

    await app.close();
  });
});
