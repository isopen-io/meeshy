/**
 * #7936 — le rattrapage `/sync` sert MES réactions, par message, comme la liste.
 *
 * Une réaction touche `reactionSummary`, donc le message revient par le delta :
 * sans `currentUserReactions` à côté, le client reçoit « combien » sans « qui »,
 * et « ma réaction » redevient une devinette au rattrapage. Une requête pour
 * TOUTE la page, sur les lignes `Participant` du lecteur dans chaque
 * conversation couverte.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';
const MOI_C1 = '507f1f77bcf86cd799439bb1';
const MOI_C2 = '507f1f77bcf86cd799439bb2';
const AUTRE = '507f1f77bcf86cd799439ccc';
const SINCE = '2026-07-01T00:00:00.000Z';

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (req: FastifyRequest) => {
    (req as unknown as { authContext: unknown }).authContext = { userId: USER_ID, type: 'user' };
  },
}));

import { syncRoutes } from '../../../routes/sync';

type ReactionRow = { messageId: string; participantId: string; emoji: string };

const REACTIONS: readonly ReactionRow[] = [
  { messageId: 'm-1', participantId: MOI_C1, emoji: '❤️' },
  { messageId: 'm-1', participantId: AUTRE, emoji: '😂' },
  { messageId: 'm-2', participantId: MOI_C2, emoji: '👍' },
];

const row = (id: string, conversationId: string) => ({
  id,
  conversationId,
  senderId: AUTRE,
  content: id,
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  reactionSummary: { '❤️': 1 },
  reactionCount: 1,
  createdAt: new Date('2026-07-02T10:00:00.000Z'),
  updatedAt: new Date('2026-07-02T10:30:00.000Z'),
  attachments: [],
});

const membership = (id: string, conversationId: string) => ({
  id,
  conversationId,
  joinedAt: new Date('2026-06-15T00:00:00Z'),
  shareLinkId: null,
  permissions: null,
  anonymousSession: null,
});

function makePrisma() {
  return {
    participant: {
      findMany: jest.fn<any>().mockResolvedValue([membership(MOI_C1, 'c1'), membership(MOI_C2, 'c2')]),
    },
    message: {
      findMany: jest.fn<any>()
        .mockResolvedValueOnce([row('m-1', 'c1'), row('m-2', 'c2'), row('m-3', 'c1')])
        .mockResolvedValue([]),
    },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: {
      findMany: jest.fn(async (args: any) => {
        const ids: string[] = args?.where?.messageId?.in ?? [];
        const participants: string[] = args?.where?.participantId?.in ?? [];
        return REACTIONS
          .filter((r) => ids.includes(r.messageId) && participants.includes(r.participantId))
          .map((r) => ({ messageId: r.messageId, emoji: r.emoji }));
      }),
    },
  };
}

async function syncPage(query = '') {
  const prisma = makePrisma();
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  await app.register(syncRoutes);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/sync?since=${SINCE}&collections=messages${query}` });
    const added = res.json().data.collections.messages.added as ReadonlyArray<Record<string, unknown>>;
    return { added, prisma };
  } finally {
    await app.close();
  }
}

const mine = (added: ReadonlyArray<Record<string, unknown>>, id: string) =>
  added.find((m) => m.id === id)?.currentUserReactions;

describe('#7936 · `/sync` sert MES réactions, par message', () => {
  it('chaque message porte les emojis de MA ligne dans SA conversation, jamais ceux des autres', async () => {
    const { added } = await syncPage();

    expect(mine(added, 'm-1')).toEqual(['❤️']);
    expect(mine(added, 'm-2')).toEqual(['👍']);
    expect(mine(added, 'm-3')).toEqual([]);
  });

  it('UNE requête de réactions pour toute la page, sur mes lignes de participant', async () => {
    const { prisma } = await syncPage();

    expect(prisma.reaction.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.reaction.findMany.mock.calls[0]![0] as any;
    expect(args.where.participantId.in).toEqual(expect.arrayContaining([MOI_C1, MOI_C2]));
    expect(args.where.messageId.in).toEqual(expect.arrayContaining(['m-1', 'm-2', 'm-3']));
  });

  it('un `?fields=` qui ne demande pas les réactions ne les sert pas, et ne paie pas la requête', async () => {
    const { added, prisma } = await syncPage('&fields=messages.content');

    expect(added[0]).not.toHaveProperty('currentUserReactions');
    expect(prisma.reaction.findMany).not.toHaveBeenCalled();
  });
});
