/**
 * `GET /sync` sert l'identité UTILISATEUR de l'auteur de chaque message
 * (#7978) — `sender.userId`, à côté de `senderId` qui est un `Participant.id`.
 * C'est sur elle que la liste décide « Vous : » quand elle recompose l'aperçu
 * depuis le delta. Mesuré sur le corps SÉRIALISÉ par le schéma réel.
 *
 * Même harnais que `sync-location.test.ts` (`sync.test.ts` est hors budget).
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { type FastifyInstance, type FastifyRequest } from 'fastify';

const USER_ID = '507f1f77bcf86cd799439000';
const CONV_MINE = '507f1f77bcf86cd799439a01';

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

function defaultParticipantFindMany() {
  return jest.fn<any>().mockImplementation((args: any) => {
    if (args?.where?.OR) return Promise.resolve([]); // aucun départ
    return Promise.resolve([{ id: 'p-mine', conversationId: CONV_MINE }]);
  });
}

function makePrisma(over: Record<string, unknown> = {}) {
  return {
    // `count` : les membres ACTIFS de la conversation — le dénominateur de
    // l'audience d'une vue unique (#7578). Quatre : l'auteur et trois
    // destinataires.
    participant: { findMany: defaultParticipantFindMany(), count: jest.fn<any>().mockResolvedValue(4) },
    // Les ouvertures relues par l'audience (#7578) : personne n'a ouvert.
    messageStatusEntry: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversation: { findMany: jest.fn<any>().mockResolvedValue([]) },
    reaction: { findMany: jest.fn<any>().mockResolvedValue([]) },
    message: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userMessageDeletion: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userEventSeq: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    user: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...over,
  } as any;
}

async function buildApp(prisma: any): Promise<FastifyInstance> {
  const app = Fastify({ logger: false });
  app.decorate('prisma', prisma as never);
  app.decorate('redis', null as never);
  await app.register(syncRoutes);
  await app.ready();
  return app;
}

const SINCE = '2026-07-01T00:00:00.000Z';

/** Une ligne `changed` minimale — les relations sélectionnées reviennent en
 *  tableau vide, jamais `undefined` (voir `CHANGED_ROW_RELATIONS` de
 *  `sync.test.ts`, même raison ici). */
const base = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  conversationId: CONV_MINE,
  senderId: 's1',
  content: 'Salut',
  clientMessageId: null,
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

async function injectMessages(prisma: any, qs = '') {
  const app = await buildApp(prisma);
  const res = await app.inject({
    method: 'GET',
    url: `/sync?since=${SINCE}&collections=messages${qs}`,
  });
  await app.close();
  return res;
}

describe("GET /sync — l'auteur d'un message est nommé par son User.id", () => {
  it('sert sender.userId et le demande à Prisma', async () => {
    const prisma = makePrisma();
    prisma.message.findMany
      .mockResolvedValueOnce([base('m1', { senderId: 'p1', sender: { id: 'p1', userId: 'u1', displayName: 'Demo', type: 'user' } })])
      .mockResolvedValueOnce([]);

    const res = await injectMessages(prisma);
    const added = res.json().data.collections.messages.added[0];
    const select = prisma.message.findMany.mock.calls[0][0].select as { sender: { select: Record<string, unknown> } };

    expect(added.senderId).toBe('p1');
    expect(added.sender.userId).toBe('u1');
    expect(select.sender.select.userId).toBe(true);
  });
});
