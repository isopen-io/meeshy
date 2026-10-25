/**
 * #12881 — un message envoyé sous e2ee ne s'édite jamais en clair, même après
 * la désactivation du chiffrement de sa conversation (spec § 5.2).
 *
 * `PUT /messages/:messageId` est le transport du client iOS : sur un message
 * scellé d'hier, dans une conversation repassée en clair, il écrivait `content`
 * puis l'envoyait à la retraduction. Le refus se lit sur l'effet : rien n'est
 * écrit, rien n'est retraduit, et le code stable part au client.
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
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';

const authContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  isAuthenticated: true,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

const sealedRow = (row: { readonly isEncrypted: boolean; readonly encryptionMode: string | null }) => ({
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: PART_ID,
  content: '[Encrypted]',
  originalLanguage: 'fr',
  messageType: 'text',
  metadata: null,
  createdAt: new Date(Date.now() - 60_000),
  deletedAt: null,
  translations: null,
  validatedMentions: [],
  ...row,
  sender: { userId: USER_ID },
  attachments: [],
  conversation: { isActive: true, closedAt: null, type: 'direct', encryptionMode: null },
});

async function buildApp(row: { readonly isEncrypted: boolean; readonly encryptionMode: string | null }) {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = authContext;
  });
  const prisma = {
    message: {
      findFirst: jest.fn<any>(async () => sealedRow(row)),
      updateMany: jest.fn<any>(async () => ({ count: 1 })),
      update: jest.fn<any>(async () => sealedRow(row)),
      findUniqueOrThrow: jest.fn<any>(async () => sealedRow(row)),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID }),
      findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ role: 'USER' }) },
    messageAttachment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  };
  const translationService = { retranslateMessageAsync: jest.fn<any>().mockResolvedValue(undefined) };
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);
  app.decorate('translationService', translationService);
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) });
  app.decorate('mentionService', { createMentions: jest.fn() });
  app.decorate('notificationService', { createMentionNotificationsBatch: jest.fn() });
  await messageRoutes(app);
  await app.ready();
  return { app, prisma, translationService };
}

const edit = (app: FastifyInstance) =>
  app.inject({ method: 'PUT', url: '/messages/' + MSG_ID, payload: { content: 'Le texte corrigé, en clair' } });

describe('PUT /messages/:messageId — un message scellé sous e2ee ne s’édite pas en clair après la désactivation (#12881)', () => {
  it('refuse avec le code stable, sans rien écrire ni retraduire', async () => {
    const { app, prisma, translationService } = await buildApp({ isEncrypted: true, encryptionMode: 'e2ee' });

    const res = await edit(app);

    expect(res.statusCode).toBe(400);
    expect(res.json().code).toBe('E2EE_PLAINTEXT_REFUSED');
    expect(prisma.message.updateMany).not.toHaveBeenCalled();
    expect(translationService.retranslateMessageAsync).not.toHaveBeenCalled();
    expect(mockBroadcastMessageMutation).not.toHaveBeenCalled();
    await app.close();
  });

  it('un message en clair écrit après la désactivation s’édite toujours', async () => {
    const { app, prisma } = await buildApp({ isEncrypted: false, encryptionMode: null });

    const res = await edit(app);

    expect(res.statusCode).toBe(200);
    expect(prisma.message.updateMany).toHaveBeenCalled();
    await app.close();
  });
});
