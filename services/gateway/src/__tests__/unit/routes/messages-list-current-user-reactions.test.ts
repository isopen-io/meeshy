/**
 * #7936 — la liste des messages sert à nouveau MES réactions, par message.
 *
 * `currentUserReactions` (niveau message) avait été retiré par #4177 : il
 * était calculé PUIS retiré à la sérialisation, faute d'être déclaré au
 * `messageSchema` — un `reaction.findMany` par page payé pour un champ
 * qu'aucun client ne recevait. Le web (#7933) compensait par un
 * `GET /reactions/:id` PAR message réagi ; iOS le décodait et ne recevait rien.
 *
 * Ce qui le ramène n'est pas l'inverse de ce retrait : c'est la DÉCLARATION,
 * la PROJECTION en une requête par page, et la charge SÉRIALISÉE vue du client
 * — seule la dernière prouve que le champ survit à `fast-json-stringify`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { messageSchema } from '@meeshy/shared/types/api-schemas';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn().mockResolvedValue(new Map()),
  }),
}));

import { registerMessagesRoutes } from '../../../routes/conversations/messages';
import { loadReaderReactionsByMessage } from '../../../routes/conversations/messages-reader-reactions';

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
const MOI = '507f1f77bcf86cd799439133';
const AUTRE = '507f1f77bcf86cd799439144';
const M0 = '507f1f77bcf86cd799439200';
const M1 = '507f1f77bcf86cd799439201';
const M2 = '507f1f77bcf86cd799439202';

type ReactionRow = { messageId: string; participantId: string; emoji: string };

const REACTIONS: readonly ReactionRow[] = [
  { messageId: M0, participantId: MOI, emoji: '❤️' },
  { messageId: M0, participantId: AUTRE, emoji: '😂' },
  { messageId: M0, participantId: MOI, emoji: '🔥' },
  { messageId: M1, participantId: AUTRE, emoji: '👍' },
];

/** Un faux `reaction.findMany` qui HONORE le `where` — sans quoi il ne prouve rien du filtre. */
function fakeReactionFindMany(rows: readonly ReactionRow[]) {
  return jest.fn(async (args: any) => {
    const ids: string[] = args?.where?.messageId?.in ?? [];
    const participants: string[] = args?.where?.participantId?.in ?? [];
    return rows
      .filter((r) => ids.includes(r.messageId) && participants.includes(r.participantId))
      .map((r) => ({ messageId: r.messageId, emoji: r.emoji }));
  });
}

const messageRow = (id: string, index: number) => ({
  id,
  conversationId: CONV_ID,
  senderId: USER_ID,
  content: `m${index}`,
  originalLanguage: 'fr',
  messageType: 'text',
  createdAt: new Date(`2026-09-1${index}T00:00:00.000Z`),
  updatedAt: new Date(`2026-09-1${index}T00:00:00.000Z`),
  translations: [],
  attachments: [],
  reactionSummary: {},
  reactionCount: 0,
});

type Lecteur =
  | { readonly kind: 'registered' }
  | { readonly kind: 'anonymous'; readonly participantId: string };

function buildApp(lecteur: Lecteur): { app: FastifyInstance; prisma: any } {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(
        lecteur.kind === 'registered'
          ? { id: MOI, userId: USER_ID, isActive: true }
          : { id: lecteur.participantId, joinedAt: new Date('2026-01-01T00:00:00.000Z') },
      ),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(3),
      findMany: jest.fn().mockResolvedValue([messageRow(M0, 0), messageRow(M1, 1), messageRow(M2, 2)]),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      }),
    },
    reaction: { findMany: fakeReactionFindMany(REACTIONS) },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const authMiddleware = async (req: any) => {
    req.authContext = lecteur.kind === 'registered'
      ? {
          type: 'registered', isAuthenticated: true, isAnonymous: false,
          userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
        }
      : {
          type: 'session', isAuthenticated: true, isAnonymous: true,
          userId: lecteur.participantId, participantId: lecteur.participantId,
        };
  };

  registerMessagesRoutes(app, prisma, {} as any, authMiddleware, authMiddleware);
  return { app, prisma };
}

type Page = { data: ReadonlyArray<{ id: string; currentUserReactions?: string[] }> };

async function page(lecteur: Lecteur) {
  const { app, prisma } = buildApp(lecteur);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages?limit=10` });
    return { body: JSON.parse(res.body) as Page, prisma, statusCode: res.statusCode };
  } finally {
    await app.close();
  }
}

const mesReactions = (body: Page, id: string) =>
  body.data.find((m) => m.id === id)?.currentUserReactions;

describe('#7936 · `currentUserReactions` est DÉCLARÉ au `messageSchema`', () => {
  it('un tableau de chaînes — sans quoi fast-json-stringify le retire en silence', () => {
    const champ = (messageSchema as any).properties.currentUserReactions;
    expect(champ).toEqual(expect.objectContaining({ type: 'array', items: { type: 'string' } }));
  });
});

describe('#7936 · la liste sert MES réactions, par message', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('chaque message porte MES emojis, et pas ceux des autres', async () => {
    const { body, statusCode } = await page({ kind: 'registered' });

    expect(statusCode).toBe(200);
    expect(mesReactions(body, M0)).toEqual(['❤️', '🔥']);
    expect(mesReactions(body, M1)).toEqual([]);
    expect(mesReactions(body, M2)).toEqual([]);
  });

  it('UNE seule requête de réactions pour toute la page, scopée à mon participant', async () => {
    const { prisma } = await page({ kind: 'registered' });

    expect(prisma.reaction.findMany).toHaveBeenCalledTimes(1);
    const args = prisma.reaction.findMany.mock.calls[0][0];
    expect(args.where.messageId.in).toEqual(expect.arrayContaining([M0, M1, M2]));
    expect(args.where.participantId).toEqual({ in: [MOI] });
  });

  it('un lecteur ANONYME reçoit ce que son identité de participant a posé', async () => {
    const { body } = await page({ kind: 'anonymous', participantId: AUTRE });

    expect(mesReactions(body, M0)).toEqual(['😂']);
    expect(mesReactions(body, M1)).toEqual(['👍']);
  });
});

describe('#7936 · le chargeur', () => {
  it('ne demande RIEN sans lecteur ni sans message', async () => {
    const findMany = fakeReactionFindMany(REACTIONS);
    const prisma = { reaction: { findMany } } as any;

    expect((await loadReaderReactionsByMessage(prisma, { messageIds: [M0], readerParticipantIds: [] })).size).toBe(0);
    expect((await loadReaderReactionsByMessage(prisma, { messageIds: [], readerParticipantIds: [MOI] })).size).toBe(0);
    expect(findMany).not.toHaveBeenCalled();
  });

  it('un même emoji n’apparaît qu’une fois', async () => {
    const prisma = {
      reaction: {
        findMany: jest.fn(async () => [
          { messageId: M0, emoji: '❤️' },
          { messageId: M0, emoji: '❤️' },
        ]),
      },
    } as any;

    const carte = await loadReaderReactionsByMessage(prisma, { messageIds: [M0], readerParticipantIds: [MOI] });
    expect(carte.get(M0)).toEqual(['❤️']);
  });

  it('une lecture en échec rend une carte vide, jamais la conversation', async () => {
    const prisma = { reaction: { findMany: jest.fn(async () => { throw new Error('base indisponible'); }) } } as any;

    await expect(
      loadReaderReactionsByMessage(prisma, { messageIds: [M0], readerParticipantIds: [MOI] }),
    ).resolves.toEqual(new Map());
  });
});
