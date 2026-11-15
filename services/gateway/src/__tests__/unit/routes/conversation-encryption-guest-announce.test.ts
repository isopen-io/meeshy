/**
 * Une bascule de régime s'annonce à CHAQUE membre actif — les invités de lien
 * partagé compris (#16830).
 *
 * `announceSwitch` promettait, dans son propre doc-comment, « l'événement
 * `conversation:encryption-changed` vers la room personnelle de chaque membre
 * actif ». Son code posait :
 *
 *     conversation.participants
 *       .flatMap((p) => (p.userId ? [p.userId] : []))
 *       .forEach((userId) => io?.to(ROOMS.user(userId)).emit(…))
 *
 * — un `flatMap` qui JETTE tout participant sans compte. La loi du dépôt est
 * `userId ?? id` : un participant sans ligne `User` rejoint `ROOMS.user(id)`,
 * donc l'adresser par `userId` seul saute une room qui EXISTE. Le web n'applique
 * le régime QUE depuis cet événement (`applyEncryptionAnnounced`) : l'invité
 * gardait son `encryptionMode` périmé — et voyait l'avis système « X a activé le
 * chiffrement » dans le fil, puisque celui-là part bien à la room de
 * conversation. Annoncé à tous, appliqué chez les seuls inscrits.
 *
 * Le témoin est en DEUX moitiés, et la seconde n'est pas une redondance :
 * le double Prisma rend `participants: world.members` quel que soit le `select`,
 * donc un témoin de COMPORTEMENT passe au vert sur une requête qui ne ramène pas
 * la colonne `id` — et la room de l'invité est alors inadressable en production
 * sans qu'aucun témoin ne rougisse. D'où un témoin de PROJECTION, qui assert sur
 * la REQUÊTE.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { matchesMongoWhere, type MongoDocument } from '../../helpers/mongo-where';

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn().mockResolvedValue({
    getOrCreateConversationKey: jest.fn().mockResolvedValue('server-key-id'),
    activationKeyId: jest.fn(async (_conversationId: string, designated: string | null) => designated ?? 'server-key-id'),
  }),
}));

let testAuthContext: Record<string, unknown> = {};

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: jest.fn(() => async (request: any) => {
    request.authContext = testAuthContext;
  }),
  UnifiedAuthRequest: {},
}));

jest.mock('../../../validation/helpers.js', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
}));

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }) },
}));

import encryptionRoutes from '../../../routes/conversation-encryption';

const ALICE = '507f1f77bcf86cd799439011';
const BOB = '507f1f77bcf86cd799439012';
const CONV_ID = '507f1f77bcf86cd799439013';
const ALICE_PARTICIPANT = '507f1f77bcf86cd799439014';
const BOB_PARTICIPANT = '507f1f77bcf86cd799439015';
/** Un invité de lien partagé : aucune ligne `User`, donc aucun `userId`. */
const GUEST_PARTICIPANT = '507f1f77bcf86cd799439016';

type Member = { id: string; userId: string | null; role: string; user: { role: string } | null };

const MODERATOR_ALICE: Member = { id: ALICE_PARTICIPANT, userId: ALICE, role: 'creator', user: { role: 'ANALYST' } };
const MEMBER_BOB: Member = { id: BOB_PARTICIPANT, userId: BOB, role: 'member', user: { role: 'USER' } };
const LINK_GUEST: Member = { id: GUEST_PARTICIPANT, userId: null, role: 'member', user: null };

type World = {
  readonly conversation: MongoDocument;
  readonly emitted: Array<{ room: string; event: string; payload: unknown }>;
  readonly selects: MongoDocument[];
  readonly prisma: Record<string, unknown>;
};

function makeWorld(members: Member[]): World {
  const world: World = {
    conversation: { id: CONV_ID, type: 'group', encryptionMode: null, encryptionEnabledAt: null, encryptionEnabledBy: null },
    emitted: [],
    selects: [],
    prisma: {},
  };
  Object.assign(world.prisma, {
    conversation: {
      findUnique: jest.fn(async ({ where, select }: { where: { id: string }; select: MongoDocument }) => {
        world.selects.push(select);
        if (where.id !== CONV_ID) return null;
        return {
          id: world.conversation.id,
          type: world.conversation.type,
          encryptionMode: world.conversation.encryptionMode ?? null,
          encryptionEnabledAt: world.conversation.encryptionEnabledAt ?? null,
          encryptionEnabledBy: world.conversation.encryptionEnabledBy ?? null,
          encryptionEpoch: world.conversation.encryptionEpoch,
          serverEncryptionKeyId: world.conversation.serverEncryptionKeyId ?? null,
          participants: members,
        };
      }),
      updateMany: jest.fn(async ({ where, data }: { where: MongoDocument; data: MongoDocument }) => {
        if (!matchesMongoWhere(world.conversation, where)) return { count: 0 };
        Object.assign(world.conversation, data);
        return { count: 1 };
      }),
      update: jest.fn(async () => ({ id: CONV_ID })),
      findMany: jest.fn(async () => []),
    },
    participant: {
      findFirst: jest.fn(async ({ where }: { where: { userId: string } }) =>
        where.userId === ALICE ? { id: ALICE_PARTICIPANT, displayName: 'Alice' } : null),
    },
    message: {
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => ({
        id: 'notice', createdAt: new Date('2026-11-08T10:00:00Z'), ...data,
      })),
    },
  });
  return world;
}

async function buildApp(world: World): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', world.prisma as unknown);
  const broadcast = (room: string) => ({
    to: (next: string) => broadcast(next),
    except: (_room: string) => broadcast(room),
    emit: (event: string, payload: unknown) => world.emitted.push({ room, event, payload }),
  });
  const io = { to: (room: string) => broadcast(room) };
  app.decorate('socketIOHandler', { getManager: () => ({ broadcastMessage: jest.fn(async () => undefined), getIO: () => io }) } as unknown);
  await app.register(encryptionRoutes);
  await app.ready();
  return app;
}

const roomsAnnouncedTo = (world: World) =>
  world.emitted.filter((e) => e.event === 'conversation:encryption-changed').map((e) => e.room);

describe('une bascule de régime atteint les invités de lien partagé (#16830)', () => {
  beforeEach(() => {
    testAuthContext = { isAuthenticated: true, isAnonymous: false, userId: ALICE };
  });

  it('annonce la bascule à la room personnelle de CHAQUE membre actif, compte ou non', async () => {
    const world = makeWorld([MODERATOR_ALICE, MEMBER_BOB, LINK_GUEST]);
    const app = await buildApp(world);

    const res = await app.inject({
      method: 'POST',
      url: `/conversations/${CONV_ID}/encryption`,
      payload: { mode: 'server' },
    });
    await new Promise((resolve) => setImmediate(resolve));

    expect(res.statusCode).toBe(200);
    expect(roomsAnnouncedTo(world).sort()).toEqual(
      [`user:${ALICE}`, `user:${BOB}`, `user:${GUEST_PARTICIPANT}`].sort(),
    );
  });

  it('la room d\'un invité porte son `Participant.id`, jamais un identifiant fabriqué', async () => {
    const world = makeWorld([MODERATOR_ALICE, LINK_GUEST]);
    const app = await buildApp(world);

    await app.inject({ method: 'POST', url: `/conversations/${CONV_ID}/encryption`, payload: { mode: 'server' } });
    await new Promise((resolve) => setImmediate(resolve));

    expect(roomsAnnouncedTo(world)).toContain(`user:${GUEST_PARTICIPANT}`);
    expect(roomsAnnouncedTo(world)).not.toContain('user:null');
    expect(roomsAnnouncedTo(world)).not.toContain('user:undefined');
  });

  /**
   * Le témoin que le comportement ne peut PAS porter. Le double rend
   * `participants: members` quel que soit le `select` — un `select` qui
   * oublierait `id` laisserait donc les deux témoins ci-dessus VERTS pendant
   * que la room de l'invité est inadressable en production. C'est la forme
   * exacte des dix-sept sites du cycle 124 : « c'est la projection trop
   * étroite, pas l'appel manquant, qui rend une descente impossible en aval
   * sans qu'aucun témoin ne rougisse ».
   */
  it('la lecture du régime RAMÈNE le `Participant.id`, sans quoi aucune room d\'invité n\'est adressable', async () => {
    const world = makeWorld([MODERATOR_ALICE, LINK_GUEST]);
    const app = await buildApp(world);

    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/encryption-status` });

    expect(world.selects.length).toBeGreaterThan(0);
    for (const select of world.selects) {
      const participants = select.participants as { select?: Record<string, unknown> } | undefined;
      expect(participants?.select).toMatchObject({ id: true, userId: true });
    }
  });
});
