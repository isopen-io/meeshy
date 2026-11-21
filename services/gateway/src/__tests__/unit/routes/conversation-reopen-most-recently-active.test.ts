/**
 * ON ROUVRE LE TÊTE-À-TÊTE LE PLUS RÉCEMMENT ACTIF, PAS LE PLUS RÉCEMMENT
 * PARLÉ (#19835).
 *
 * `POST /conversations` sur une paire qui porte des doublons historiques en
 * ROUVRE un plutôt que d'en créer un troisième, et son commentaire dit depuis
 * toujours lequel : « rouvrir la plus RÉCEMMENT ACTIVE, pas une arbitraire —
 * sinon l'utilisateur retombe sur une DM morte ». Depuis #9026, « active » est
 * le RANG — max(`lastMessageAt`, `lastActivityAt`) : une réaction, un appel,
 * une épingle remontent la conversation pour tout le monde.
 *
 * Le témoin ne pouvait pas tomber avant #19800 : `lastActivityAt` n'était
 * écrite par aucun chemin, donc le rang se réduisait au dernier message et les
 * deux critères rendaient toujours le même tête-à-tête.
 *
 * Le double évalue le `where`, l'ORDRE (plusieurs clés comprises) et la borne
 * contre des documents en mémoire : c'est la conversation RENDUE qui parle.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { PrismaClient } from '@meeshy/shared/prisma/client';
import { findConversationsIn, type DirectDoc } from '../../helpers/direct-pair-world';

const ME = '507f1f77bcf86cd799439001';
const PEER = '507f1f77bcf86cd799439002';
const LIFTED_DM = '507f1f77bcf86cd7994390a1';
const SPOKEN_DM = '507f1f77bcf86cd7994390b2';
const CREATED_DM = '507f1f77bcf86cd7994390aa';

jest.mock('../../../services/messaging/messageRequests', () => ({
  ...jest.requireActual<typeof import('../../../services/messaging/messageRequests')>('../../../services/messaging/messageRequests'),
  decideDirectOpening: jest.fn(async () => ({ kind: 'direct' })),
  decideOpenings: jest.fn(async () => new Map()),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })) },
}));

jest.mock('../../../services/EncryptionService', () => ({
  getEncryptionService: jest.fn(async () => ({ activationKeyId: async () => 'server-key' })),
}));

const member = (userId: string, role = 'member', isActive = true) => ({
  userId,
  role,
  isActive,
  user: { id: userId, username: userId.slice(-4), displayName: userId.slice(-4), avatar: null, banner: null },
});

const direct = (id: string, fields: Record<string, unknown>): DirectDoc => ({
  id,
  identifier: `mshy_${id.slice(-4)}`,
  type: 'direct',
  title: null,
  createdAt: new Date('2026-10-01T10:00:00Z'),
  firstMessageSentAt: new Date('2026-10-01T10:05:00Z'),
  participants: [member(ME, 'creator'), member(PEER)],
  ...fields,
});

function world(docs: DirectDoc[]) {
  const directs = findConversationsIn(docs);
  const findFirst = jest.fn(async (args: any) => (args?.where?.identifier !== undefined ? null : directs.findFirst(args)));
  const conversationCreate = jest.fn(async (args: { data: Record<string, unknown> }) => ({
    ...args.data,
    id: CREATED_DM,
    identifier: 'mshy_new',
    type: args.data.type,
    title: null,
    createdAt: new Date(),
    participants: [],
  }));
  const prisma = {
    conversation: {
      findFirst,
      findMany: jest.fn(async (args: any) => directs.findMany(args)),
      findUnique: jest.fn(async (args: any) => directs.findFirst({ where: { id: args?.where?.id } })),
      create: conversationCreate,
      updateMany: jest.fn(async () => ({ count: 0 })),
    },
    user: {
      findMany: jest.fn(async () => [
        { id: ME, displayName: 'Me', username: 'me' },
        { id: PEER, displayName: 'Peer', username: 'peer' },
      ]),
      findFirst: jest.fn(async () => null),
    },
    participant: { findFirst: jest.fn(async () => null) },
    userBlock: { findFirst: jest.fn(async () => null) },
    notification: { create: jest.fn(async () => ({})) },
  } as unknown as PrismaClient;
  return { prisma, conversationCreate, findFirst };
}

async function openDirect(docs: DirectDoc[]) {
  const { prisma, conversationCreate, findFirst } = world(docs);
  const app: FastifyInstance = Fastify({ logger: false });
  const auth = async (request: FastifyRequest, _reply: FastifyReply): Promise<void> => {
    (request as unknown as Record<string, unknown>).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: ME,
      registeredUser: { id: ME },
      hasFullAccess: true,
    };
  };
  const { registerCoreRoutes } = await import('../../../routes/conversations/core');
  registerCoreRoutes(app, prisma, auth, auth);
  await app.ready();
  const res = await app.inject({
    method: 'POST',
    url: '/conversations',
    headers: { authorization: 'Bearer x' },
    payload: { type: 'direct', participantIds: [PEER] },
  });
  await app.close();
  return { status: res.statusCode, id: res.json()?.data?.id as string | undefined, conversationCreate, findFirst };
}

const EARLY = new Date('2026-11-01T10:00:00Z');
const MIDDLE = new Date('2026-11-10T10:00:00Z');
const LATE = new Date('2026-11-18T10:00:00Z');

describe('« la plus récemment active » est le RANG, pas le dernier message (#19835)', () => {
  it('le doublon REMONTÉ par une réaction gagne contre celui dont le dernier message est plus récent', async () => {
    const opened = await openDirect([
      direct(LIFTED_DM, { lastMessageAt: EARLY, lastActivityAt: LATE }),
      direct(SPOKEN_DM, { lastMessageAt: MIDDLE }),
    ]);
    expect(opened).toMatchObject({ status: 200, id: LIFTED_DM });
    expect(opened.conversationCreate).not.toHaveBeenCalled();
  });

  it('sans aucune activité, le plus récemment parlé gagne — le comportement d’avant #19800 est intact', async () => {
    const opened = await openDirect([direct(LIFTED_DM, { lastMessageAt: EARLY }), direct(SPOKEN_DM, { lastMessageAt: MIDDLE })]);
    expect(opened).toMatchObject({ status: 200, id: SPOKEN_DM });
  });

  it('une activité ANTÉRIEURE au dernier message ne rétrograde pas son porteur : le rang est un max', async () => {
    const opened = await openDirect([
      direct(LIFTED_DM, { lastMessageAt: MIDDLE, lastActivityAt: EARLY }),
      direct(SPOKEN_DM, { lastMessageAt: EARLY, lastActivityAt: EARLY }),
    ]);
    expect(opened).toMatchObject({ status: 200, id: LIFTED_DM });
  });

  it('deux doublons de rang IDENTIQUE — l’un parlé, l’autre remonté — se départagent, et toujours pareil (#19881)', async () => {
    const parle = direct(SPOKEN_DM, { lastMessageAt: MIDDLE, lastActivityAt: EARLY });
    const remonte = direct(LIFTED_DM, { lastMessageAt: EARLY, lastActivityAt: MIDDLE });
    expect(await openDirect([parle, remonte])).toMatchObject({ status: 200, id: SPOKEN_DM });
    expect(await openDirect([remonte, parle])).toMatchObject({ status: 200, id: SPOKEN_DM });
  });

  it('la préférence de régime passe AVANT le rang : un chiffré moins actif se rouvre quand même (#12966)', async () => {
    const opened = await openDirect([
      direct(LIFTED_DM, { lastMessageAt: EARLY, lastActivityAt: LATE }),
      direct(SPOKEN_DM, { encryptionMode: 'e2ee', lastMessageAt: EARLY }),
    ]);
    expect(opened).toMatchObject({ status: 200, id: SPOKEN_DM });
  });

  it('les DEUX colonnes du rang sont demandées à la base, et l’ordre départage sur `id`', async () => {
    const opened = await openDirect([direct(SPOKEN_DM, { lastMessageAt: MIDDLE })]);
    const orders = opened.findFirst.mock.calls
      .map((call) => (call[0] as { orderBy?: unknown })?.orderBy)
      .filter((order) => order !== undefined);
    expect(orders).toEqual(
      expect.arrayContaining([
        [{ lastMessageAt: 'desc' }, { id: 'desc' }],
        [{ lastActivityAt: 'desc' }, { id: 'desc' }],
      ]),
    );
  });
});
