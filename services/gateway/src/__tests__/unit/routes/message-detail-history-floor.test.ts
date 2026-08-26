/**
 * `GET /messages/:messageId` — le plancher d'historique du lecteur.
 *
 * La route servait n'importe quel message de la conversation à tout membre
 * actif, par son seul id — le plus court chemin vers l'historique qu'un lien
 * sans historique, un ajout après coup ou l'inscription dans le salon global
 * interdisent. Un message d'AVANT l'arrivée du lecteur n'existe pas pour lui :
 * même réponse qu'un id inconnu (404), jamais un 403 qui confirmerait
 * l'existence.
 *
 * La ligne du lecteur est déjà lue par la route (les `participants` de la
 * conversation, filtrés sur lui) ; elle porte désormais ce que le module de
 * plancher (`services/historyFloor`) lit — aucune requête de plus.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

jest.mock('../../../validation/messages-schemas', () => ({
  MessageParamsSchema: {},
  AttachmentParamsSchema: {},
  UpdateMessageBodySchema: {},
  MessageStatusBodySchema: {},
  MessageStatusDetailsQuerySchema: {},
  AttachmentStatusBodySchema: {},
}));

jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn<any>().mockResolvedValue(new Map()),
  }),
}));

import messageRoutes from '../../../routes/messages';

const READER_USER_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439024';
const JOINED_AT = new Date('2026-06-15T00:00:00Z');
const BEFORE_JOIN = new Date('2026-06-01T00:00:00Z');
const AFTER_JOIN = new Date('2026-07-01T00:00:00Z');

const messageRow = (createdAt: Date, reader: Record<string, unknown>) => ({
  id: MESSAGE_ID,
  conversationId: '507f1f77bcf86cd799439011',
  senderId: 'part-sender',
  content: 'bonjour',
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  createdAt,
  updatedAt: createdAt,
  translations: null,
  metadata: null,
  sender: { id: 'part-sender', userId: 'u-sender', displayName: 'S', avatar: null, isOnline: false, type: 'user', user: null },
  conversation: { participants: [reader] },
  attachments: [],
});

const readerRow = (over: Record<string, unknown> = {}) => ({
  userId: READER_USER_ID,
  role: 'member',
  joinedAt: JOINED_AT,
  shareLinkId: null,
  historyVisibleFrom: null,
  permissions: { canViewHistory: false },
  anonymousSession: null,
  ...over,
});

async function fetchDetail(row: unknown, shareLink: { allowViewHistory: boolean } | null = null) {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      type: 'user',
      isAuthenticated: true,
      isAnonymous: false,
      userId: READER_USER_ID,
      registeredUser: { id: READER_USER_ID, role: 'USER' },
    };
  });

  const linkLookup = jest.fn<any>().mockResolvedValue(shareLink);
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', {
    message: { findFirst: jest.fn<any>().mockResolvedValue(row), findMany: jest.fn<any>().mockResolvedValue([]) },
    participant: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationReadCursor: { findMany: jest.fn<any>().mockResolvedValue([]) },
    conversationShareLink: { findUnique: linkLookup },
  } as any);

  await app.register(messageRoutes);
  await app.ready();
  const res = await app.inject({ method: 'GET', url: `/messages/${MESSAGE_ID}` });
  await app.close();
  return { status: res.statusCode, body: JSON.parse(res.body), linkLookup };
}

describe('GET /messages/:messageId — plancher d’historique du lecteur', () => {
  it('rend 404 pour un message d’AVANT l’arrivée d’un membre au droit figé fermé', async () => {
    const { status } = await fetchDetail(messageRow(BEFORE_JOIN, readerRow()));
    expect(status).toBe(404);
  });

  it('sert un message écrit APRÈS son arrivée', async () => {
    const { status, body } = await fetchDetail(messageRow(AFTER_JOIN, readerRow()));
    expect(status).toBe(200);
    expect(body.data.id).toBe(MESSAGE_ID);
  });

  it('sert tout à un administrateur de la conversation', async () => {
    const { status } = await fetchDetail(messageRow(BEFORE_JOIN, readerRow({ role: 'admin' })));
    expect(status).toBe(200);
  });

  it('sert depuis la DATE octroyée par un administrateur', async () => {
    const granted = new Date('2026-05-01T00:00:00Z');
    const { status } = await fetchDetail(messageRow(BEFORE_JOIN, readerRow({ historyVisibleFrom: granted })));
    expect(status).toBe(200);
    const { status: earlier } = await fetchDetail(
      messageRow(new Date('2026-04-01T00:00:00Z'), readerRow({ historyVisibleFrom: granted }))
    );
    expect(earlier).toBe(404);
  });

  it('borne un membre entré par un lien qui ferme l’historique — le lien est lu', async () => {
    const { status, linkLookup } = await fetchDetail(
      messageRow(BEFORE_JOIN, readerRow({ shareLinkId: 'sl-1', permissions: {} })),
      { allowViewHistory: false }
    );
    expect(status).toBe(404);
    expect(linkLookup).toHaveBeenCalledWith({ where: { id: 'sl-1' }, select: { allowViewHistory: true } });
  });

  it('sert tout à une participation legacy — droit ABSENT, aucun lien', async () => {
    const { status } = await fetchDetail(messageRow(BEFORE_JOIN, readerRow({ permissions: {} })));
    expect(status).toBe(200);
  });

  it('garde le 403 pour qui n’est pas participant', async () => {
    const { status } = await fetchDetail({ ...messageRow(AFTER_JOIN, readerRow()), conversation: { participants: [] } });
    expect(status).toBe(403);
  });
});
