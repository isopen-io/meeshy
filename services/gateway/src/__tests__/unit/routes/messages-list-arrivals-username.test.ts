/**
 * #16421 — GET /conversations/:id/messages sert le pseudo des arrivants d'une
 * ligne `members-arrived` écrite AVANT qu'il y voyage, mesuré sur le corps
 * SÉRIALISÉ par la vraie route et son vrai schéma de réponse : un champ que
 * fast-json-stringify retirerait n'atteindrait aucun client.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// #9629 — la loi d'audience des avis de capture a ses témoins de câblage
// (`capture-notice-served-surfaces.test.ts`) ; ces témoins-ci ne servent aucun avis.
jest.mock('../../../services/messaging/captureNoticeVisibility', () => ({
  ...(jest.requireActual('../../../services/messaging/captureNoticeVisibility') as object),
  hidingServedTo: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
  hidingServedToReader: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    (...args: any[]) => mockCanAccessConversation(...args)));

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

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const AICHA = '507f1f77bcf86cd7994390a1';
const GUEST = '507f1f77bcf86cd7994390a3';
const LINE_ID = '507f1f77bcf86cd799439099';

const ACCOUNTS = [
  { id: AICHA, type: 'user', user: { username: 'aicha' } },
  { id: GUEST, type: 'anonymous', user: null },
];

function arrivalsLine(id: string = LINE_ID) {
  return {
    id,
    conversationId: CONV_ID,
    senderId: AICHA,
    content: 'Aïcha et 1 autre viennent d’arriver',
    originalLanguage: 'fr',
    messageType: 'system',
    messageSource: 'system',
    metadata: {
      kind: 'members-arrived',
      arrivals: [
        { participantId: AICHA, displayName: 'Aïcha' },
        { participantId: GUEST, displayName: 'Visiteur' },
      ],
      count: 2,
      windowStartedAt: '2026-11-04T10:00:00.000Z',
    },
    createdAt: new Date('2026-11-04T10:00:00Z'),
    updatedAt: new Date('2026-11-04T10:00:00Z'),
    attachments: [],
    validatedMentions: null,
    _count: { attachments: 0 },
    sender: {
      id: AICHA,
      userId: '507f1f77bcf86cd7994390b1',
      displayName: 'Aïcha',
      avatar: null,
      type: 'user',
      role: 'member',
      language: 'fr',
      user: { id: '507f1f77bcf86cd7994390b1', username: 'aicha', displayName: 'Aïcha' },
    },
  };
}

async function serveMessages(messages: unknown[]): Promise<{ app: FastifyInstance; prisma: any }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue(null),
      findMany: jest.fn(async (args: any) => {
        const ids: string[] | undefined = args?.where?.id?.in;
        return ids ? ACCOUNTS.filter((row) => ids.includes(row.id)) : [];
      }),
    },
    message: {
      count: jest.fn().mockResolvedValue(messages.length),
      findFirst: jest.fn().mockResolvedValue({ createdAt: new Date('2026-11-04T10:00:00Z') }),
      findMany: jest.fn().mockResolvedValue(messages),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const optionalAuth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockCanAccessConversation.mockResolvedValue(true);

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return { app, prisma };
}

const usernameLookups = (prisma: any) =>
  prisma.participant.findMany.mock.calls.filter((call: any[]) => call[0]?.select?.user?.select?.username === true);

describe('GET /conversations/:id/messages — pseudo des anciennes arrivées (#16421)', () => {
  it('sert le pseudo du compte à un arrivant enregistré, rien à un anonyme', async () => {
    const { app } = await serveMessages([arrivalsLine()]);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].metadata.arrivals).toEqual([
      { participantId: AICHA, displayName: 'Aïcha', username: 'aicha' },
      { participantId: GUEST, displayName: 'Visiteur' },
    ]);
    await app.close();
  });

  it('lit les pseudos de la page en UNE requête', async () => {
    const { app, prisma } = await serveMessages([arrivalsLine(), arrivalsLine('507f1f77bcf86cd799439098')]);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });

    expect(usernameLookups(prisma)).toHaveLength(1);
    await app.close();
  });

  it('sert la même ligne complétée dans la fenêtre autour d’un message (contexte)', async () => {
    const { app } = await serveMessages([arrivalsLine()]);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages?around=${LINE_ID}` });

    expect(res.statusCode).toBe(200);
    expect(res.json().data[0].metadata.arrivals[0].username).toBe('aicha');
    await app.close();
  });
});
