/**
 * Audit #19352 (A6) — un geste sur un message que la passerelle ne trouve pas
 * rend un 404 qui le DIT : `code: 'MESSAGE_NOT_FOUND'`. Sans code, le client
 * Android lisait le 404 comme celui d'un mandataire (Traefik qui redémarre),
 * réessayait cinq fois, puis faisait revenir un message que le serveur dit
 * parti. Rétrocompatible : le statut et la phrase ne changent pas.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({ deleteAttachment: jest.fn() })),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
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

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/messaging/messageLinks', () => ({
  reconcileEditedLinks: jest.fn<any>(async (params: any) => ({
    processedContent: params.content,
    trackingLinks: [],
    reconciled: true,
  })),
  mergeTrackingLinksIntoMetadata: (_existing: unknown, links: any[]) =>
    (links.length > 0 ? { trackingLinks: links } : null),
}));

jest.mock('../../../services/messaging/messageMentions', () => ({
  reconcileEditedMentions: jest.fn<any>().mockResolvedValue({
    validatedUsernames: [],
    validatedUserIds: [],
    newlyMentionedUserIds: [],
    reconciled: true,
  }),
}));

jest.mock('../../../socketio/emitMentionCreated', () => ({ emitMentionCreated: jest.fn() }));

const mockBroadcastMessageMutation = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../socketio/broadcastMessageMutation', () => ({
  broadcastMessageMutation: (...args: any[]) => mockBroadcastMessageMutation(...args),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: jest.fn(),
  })),
}));

// `transformTranslationsToArray` n'est PAS mocké ici : c'est lui qui rend la
// traduction observable dans la charge utile. Un mock rendant `[]` masquerait
// exactement le défaut mesuré.

// ─── Import after mocks ───────────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';

const USER_ID = 'user-abc123';
const MSG_ID = '507f1f77bcf86cd799439011';

async function buildApp() {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = {
      type: 'registered' as const,
      userId: USER_ID,
      hasFullAccess: true,
      isAuthenticated: true,
      registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
    };
  });
  const prisma = {
    message: {
      findFirst: jest.fn<any>(async () => null),
      findMany: jest.fn<any>(async () => []),
      updateMany: jest.fn<any>(async () => ({ count: 0 })),
    },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null), findMany: jest.fn<any>().mockResolvedValue([]) },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ role: 'USER' }) },
  };
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('translationService', { retranslateMessageAsync: jest.fn<any>() });
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) });
  app.decorate('mentionService', { createMentions: jest.fn() });
  app.decorate('notificationService', { createMentionNotificationsBatch: jest.fn() });
  await messageRoutes(app);
  await app.ready();
  return app;
}

describe('un geste sur un message introuvable rend un 404 qui le dit (audit #19352, A6)', () => {
  it('DELETE /messages/:messageId', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toMatchObject({ success: false, error: 'Message non trouvé', code: 'MESSAGE_NOT_FOUND' });
    await app.close();
  });

  it('PUT /messages/:messageId', async () => {
    const app = await buildApp();

    const res = await app.inject({ method: 'PUT', url: '/messages/' + MSG_ID, payload: { content: 'corrigé' } });

    expect(res.statusCode).toBe(404);
    expect(res.json().code).toBe('MESSAGE_NOT_FOUND');
    await app.close();
  });
});
