/**
 * #19049 — REVALIDER UN FIL ACTIF COÛTE UN 304 QUAND SEULS LES ACCUSÉS DE
 * LECTURE ONT BOUGÉ.
 *
 * L'ETag de `GET /conversations/:id/messages` est le SHA-256 du corps : la
 * fenêtre porte `readCount`, `deliveredCount`, `recipientCount`,
 * `deliveredToAllAt` et `readByAllAt` par message, donc tout accusé de lecture
 * le change. Dans un groupe actif, chaque revalidation renvoyait la fenêtre
 * entière, traductions comprises — alors que ces compteurs voyagent déjà par la
 * socket.
 *
 * Le témoin passe par la VRAIE route et son vrai schéma : un client qui annonce
 * `live-receipts` revalide en 304 sur un accusé seul et en 200 sur un contenu
 * changé ; un client qui ne l'annonce pas garde exactement l'ETag d'avant.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { type FastifyInstance } from 'fastify';
import { LIVE_RECEIPTS_CAPABILITY } from '@meeshy/shared/types/live-receipts';

const mockLogInfo = jest.fn();
jest.mock('../../../../services/messaging/captureNoticeVisibility', () => ({
  ...(jest.requireActual('../../../../services/messaging/captureNoticeVisibility') as object),
  hidingServedTo: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
  hidingServedToReader: async (_prisma: unknown, params: { hiding: unknown }) => params.hiding,
}));
jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: (...args: unknown[]) => mockLogInfo(...args), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: unknown[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../../helpers/acces-conversation-double') as { doubleAccesConversation: (actual: unknown, can: unknown) => unknown }).doubleAccesConversation(
    jest.requireActual('../../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    (...args: unknown[]) => mockCanAccessConversation(...args)));

type ReadStatus = { totalMembers: number; receivedCount: number; readCount: number; deliveredToAllAt: Date | null; readByAllAt: Date | null };
const mockReadStatuses = jest.fn<() => Map<string, ReadStatus>>();
jest.mock('../../../../services/MessageReadStatusService', () => ({
  ...(jest.requireActual('../../../../services/MessageReadStatusService') as object),
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getConversationReadStatuses: async () => mockReadStatuses(),
    markMessagesAsReceived: async () => 0,
  })),
}));

jest.mock('../../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn(async () => []),
}));
jest.mock('../../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));

import { registerMessagesRoutes } from '../../../../routes/conversations/messages';
import { computeETag } from '../../../../utils/etag';
import { messageWindowETag } from '../../../../routes/conversations/messages-window-validator';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439033';
const CAPABILITY = { 'x-meeshy-capabilities': LIVE_RECEIPTS_CAPABILITY };

const textMessage = (content = 'Rendez-vous à 18 h') => ({
  id: MESSAGE_ID,
  conversationId: CONV_ID,
  senderId: '507f1f77bcf86cd7994390a1',
  content,
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  createdAt: new Date('2026-11-17T08:00:00Z'),
  updatedAt: new Date('2026-11-17T08:00:00Z'),
  attachments: [],
  validatedMentions: null,
  reactionSummary: null,
  reactionCount: 0,
  _count: { attachments: 0 },
  sender: {
    id: '507f1f77bcf86cd7994390a1',
    userId: '507f1f77bcf86cd7994390b1',
    displayName: 'Aïcha',
    avatar: null,
    type: 'user',
    role: 'member',
    language: 'fr',
    user: { id: '507f1f77bcf86cd7994390b1', username: 'aicha', displayName: 'Aïcha' },
  },
});

const readBy = (readCount: number): Map<string, ReadStatus> =>
  new Map([[MESSAGE_ID, { totalMembers: 4, receivedCount: 4, readCount, deliveredToAllAt: new Date('2026-11-17T08:01:00Z'), readByAllAt: null }]]);

async function serveWindow(messages: () => unknown[]): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as unknown as { socketIOHandler: unknown }).socketIOHandler = { getManager: () => null };
  (app as unknown as { notificationService: unknown }).notificationService = null;
  const prisma = {
    participant: {
      findFirst: jest.fn(async () => null),
      findMany: jest.fn(async () => []),
    },
    message: {
      count: jest.fn(async () => messages().length),
      findFirst: jest.fn(async () => ({ createdAt: new Date('2026-11-17T08:00:00Z') })),
      findMany: jest.fn(async () => messages()),
    },
    user: { findFirst: jest.fn(async () => null) },
  };
  const auth = async (req: unknown) => {
    (req as { authContext: unknown }).authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };
  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockCanAccessConversation.mockResolvedValue(true);
  registerMessagesRoutes(app, prisma as never, {} as never, auth as never, auth as never);
  await app.ready();
  return app;
}

const WINDOW_URL = `/conversations/${CONV_ID}/messages`;

const windowLogs = (): readonly Record<string, unknown>[] =>
  mockLogInfo.mock.calls
    .filter(([message]) => typeof message === 'string' && message.includes('GET /conversations/'))
    .map(([, fields]) => fields as Record<string, unknown>);

beforeEach(() => {
  mockLogInfo.mockClear();
  mockReadStatuses.mockReturnValue(readBy(2));
});

describe('#19049 — le validateur de la fenêtre', () => {
  const page = (readCount: number, content = 'Rendez-vous à 18 h') => ({
    success: true,
    data: [{ id: MESSAGE_ID, content, readCount, deliveredCount: 4, recipientCount: 4, deliveredToAllAt: '2026-11-17T08:01:00.000Z', readByAllAt: null, reactionCount: 0 }],
    meta: { userLanguage: 'fr', mentionedUsers: [] },
  });

  it('sans la capacité, c’est l’ETag FORT d’avant, sur le corps entier : un ancien client garde un validateur valide', () => {
    expect(messageWindowETag(page(2), { liveReceipts: false })).toBe(computeETag(page(2)));
  });

  it('sous la capacité, un accusé seul ne change pas le validateur ; il change le validateur fort', () => {
    expect(messageWindowETag(page(3), { liveReceipts: true })).toBe(messageWindowETag(page(2), { liveReceipts: true }));
    expect(computeETag(page(3))).not.toBe(computeETag(page(2)));
  });

  it('sous la capacité, un contenu changé change le validateur', () => {
    expect(messageWindowETag(page(2, 'Rendez-vous à 19 h'), { liveReceipts: true })).not.toBe(
      messageWindowETag(page(2), { liveReceipts: true }),
    );
  });

  it('le validateur sous la capacité est FAIBLE, et ne se confond jamais avec le fort — même sur une fenêtre vide', () => {
    const empty = { success: true, data: [], meta: { userLanguage: 'fr', mentionedUsers: [] } };

    expect(messageWindowETag(page(2), { liveReceipts: true })).toMatch(/^W\/"[0-9a-f]{64}"$/);
    expect(messageWindowETag(empty, { liveReceipts: true }).replace(/^W\//, '')).not.toBe(computeETag(empty));
  });
});

describe('#19049 — GET /conversations/:id/messages revalidé par un client `live-receipts`', () => {
  it('un accusé de lecture seul : 304, et le journal le mesure', async () => {
    const app = await serveWindow(() => [textMessage()]);
    const first = await app.inject({ method: 'GET', url: WINDOW_URL, headers: CAPABILITY });
    expect(first.statusCode).toBe(200);
    expect(first.headers.etag).toMatch(/^W\//);

    mockReadStatuses.mockReturnValue(readBy(3));
    const second = await app.inject({ method: 'GET', url: WINDOW_URL, headers: { ...CAPABILITY, 'if-none-match': String(first.headers.etag) } });

    expect(second.statusCode).toBe(304);
    expect(second.body).toBe('');
    expect(windowLogs().at(-1)).toMatchObject({ conditional: 'not-modified', validator: LIVE_RECEIPTS_CAPABILITY });
    await app.close();
  });

  it('le corps d’un 200 porte toujours les compteurs à jour', async () => {
    mockReadStatuses.mockReturnValue(readBy(3));
    const app = await serveWindow(() => [textMessage()]);

    const res = await app.inject({ method: 'GET', url: WINDOW_URL, headers: CAPABILITY });

    expect(res.json().data[0]).toMatchObject({ readCount: 3, deliveredCount: 4, recipientCount: 4 });
    await app.close();
  });

  it('un contenu changé : 200, même sous la capacité', async () => {
    const contents = ['Rendez-vous à 18 h'];
    const app = await serveWindow(() => [textMessage(contents[contents.length - 1])]);
    const first = await app.inject({ method: 'GET', url: WINDOW_URL, headers: CAPABILITY });

    contents.push('Rendez-vous à 19 h');
    const second = await app.inject({ method: 'GET', url: WINDOW_URL, headers: { ...CAPABILITY, 'if-none-match': String(first.headers.etag) } });

    expect(second.statusCode).toBe(200);
    expect(windowLogs().at(-1)).toMatchObject({ conditional: 'modified', validator: LIVE_RECEIPTS_CAPABILITY });
    await app.close();
  });

  it('la capacité se lit parmi les autres jetons de l’en-tête', async () => {
    const app = await serveWindow(() => [textMessage()]);
    const headers = { 'x-meeshy-capabilities': `onboarding-profile, ${LIVE_RECEIPTS_CAPABILITY}` };
    const first = await app.inject({ method: 'GET', url: WINDOW_URL, headers });

    mockReadStatuses.mockReturnValue(readBy(3));
    const second = await app.inject({ method: 'GET', url: WINDOW_URL, headers: { ...headers, 'if-none-match': String(first.headers.etag) } });

    expect(second.statusCode).toBe(304);
    await app.close();
  });
});

describe('#19049 — un client qui n’annonce rien garde exactement le comportement d’avant', () => {
  it('ETag fort, et un accusé de lecture fait un 200 : il relit ses compteurs par le corps', async () => {
    const app = await serveWindow(() => [textMessage()]);
    const first = await app.inject({ method: 'GET', url: WINDOW_URL });
    expect(first.headers.etag).toMatch(/^"[0-9a-f]{64}"$/);

    mockReadStatuses.mockReturnValue(readBy(3));
    const second = await app.inject({ method: 'GET', url: WINDOW_URL, headers: { 'if-none-match': String(first.headers.etag) } });

    expect(second.statusCode).toBe(200);
    expect(second.json().data[0].readCount).toBe(3);
    expect(windowLogs().at(-1)).toMatchObject({ conditional: 'modified', validator: 'strict' });
    await app.close();
  });

  it('rien n’a bougé : 304, comme avant', async () => {
    const app = await serveWindow(() => [textMessage()]);
    const first = await app.inject({ method: 'GET', url: WINDOW_URL });
    const second = await app.inject({ method: 'GET', url: WINDOW_URL, headers: { 'if-none-match': String(first.headers.etag) } });

    expect(second.statusCode).toBe(304);
    await app.close();
  });

  it('un validateur obtenu sous la capacité ne vaut pas sans elle : pas de 304 croisé', async () => {
    const app = await serveWindow(() => [textMessage()]);
    const live = await app.inject({ method: 'GET', url: WINDOW_URL, headers: CAPABILITY });
    const strict = await app.inject({ method: 'GET', url: WINDOW_URL, headers: { 'if-none-match': String(live.headers.etag) } });

    expect(strict.statusCode).toBe(200);
    expect(windowLogs().at(-1)).toMatchObject({ conditional: 'modified', validator: 'strict' });
    await app.close();
  });
});
