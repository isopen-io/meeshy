/**
 * `GET /sync` ne sert le `clientMessageId` d'un message qu'à SON AUTEUR
 * (#19960) — comme le chemin socket le retire des pairs
 * (`stripClientMessageId`, #16689 : « a non-sender participant never learns
 * the sender's optimistic-id space »).
 *
 * Le delta étalait la ligne (`...message`) : la clé partait brute à tout
 * abonné. La raison écrite à côté — réconcilier une bulle optimiste — ne vaut
 * que pour SES propres bulles.
 *
 * Mesuré sur le corps SÉRIALISÉ par le schéma réel, jamais sur l'objet du
 * sérialiseur : c'est le fil qui décide.
 *
 * Même harnais que `sync-sender-identity.test.ts`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';
const CONV_MINE = '507f1f77bcf86cd799439a01';
/** La ligne du LECTEUR dans cette conversation — ce que le delta lui connaît. */
const READER_PARTICIPANT = 'p-mine';
const PEER_PARTICIPANT = 'p-peer';
const CID = 'cid_550e8400-e29b-41d4-a716-446655440000';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: (_prisma: unknown, _options: unknown) =>
    async (req: FastifyRequest) => {
      (req as unknown as { authContext: { userId: string; type: 'user' } }).authContext = {
        userId: USER_ID,
        type: 'user',
      };
    },
}));

jest.mock('../../../utils/rate-limiter.js', () => ({
  createCustomRateLimiter: () => ({ middleware: () => async () => undefined }),
}));

import { syncRoutes } from '../../../routes/sync';

function makePrisma() {
  return {
    participant: {
      findMany: jest.fn<any>().mockImplementation((args: any) =>
        args?.where?.OR ? Promise.resolve([]) : Promise.resolve([{ id: READER_PARTICIPANT, conversationId: CONV_MINE }])),
      count: jest.fn<any>().mockResolvedValue(4),
    },
    messageStatusEntry: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
  } as any;
}

const SINCE = '2026-07-01T00:00:00.000Z';

const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  conversationId: CONV_MINE,
  senderId: READER_PARTICIPANT,
  content: 'Salut',
  clientMessageId: CID,
  originalLanguage: 'fr',
  translations: null,
  messageType: 'text',
  messageSource: 'user',
  metadata: null,
  isEdited: false,
  editedAt: null,
  replyToId: null,
  reactionSummary: null,
  reactionCount: 0,
  validatedMentions: [],
  attachments: [],
  sender: null,
  createdAt: new Date('2026-07-02T10:00:00Z'),
  updatedAt: new Date('2026-07-02T10:00:00Z'),
  isViewOnce: false,
  maxViewOnceCount: null,
  viewOnceCount: 0,
  isBlurred: false,
  effectFlags: 0,
  expiresAt: null,
  ...extra,
});

async function addedMessage(row: Record<string, unknown>) {
  const prisma = makePrisma();
  prisma.message.findMany.mockResolvedValueOnce([row]).mockResolvedValueOnce([]);
  const app: FastifyInstance = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages` });
  await app.close();
  return res;
}

describe('GET /sync — la clé d’idempotence est servie à son auteur seulement', () => {
  it('l’AUTEUR la reçoit : sa bulle optimiste se réconcilie au chargement à froid', async () => {
    const res = await addedMessage(base('m1', { senderId: READER_PARTICIPANT }));

    expect(res.json().data.collections.messages.added[0].clientMessageId).toBe(CID);
  });

  it('un PAIR ne la reçoit pas, et elle n’apparaît nulle part dans la réponse', async () => {
    const res = await addedMessage(base('m2', { senderId: PEER_PARTICIPANT }));

    expect(res.json().data.collections.messages.added[0].clientMessageId).toBeNull();
    expect(res.body).not.toContain(CID);
  });
});
