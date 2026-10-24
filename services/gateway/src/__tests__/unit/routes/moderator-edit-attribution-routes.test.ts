/**
 * @jest-environment node
 *
 * #11375 — décision porteur du 2026-10-24 : un modérateur de plateforme qui
 * modifie le message d'un autre le fait À VISAGE DÉCOUVERT. Les trois entrées
 * REST d'édition (iOS `PUT /messages/:id`, web `PUT /conversations/:id/messages/:id`,
 * Android `PATCH /messages/:id`) ENREGISTRENT l'auteur de la modification et son
 * rôle, le SERVENT dans leur réponse et le DIFFUSENT dans `message:edited`.
 * L'auteur qui réécrit son message remet les deux colonnes à null.
 *
 * L'admission est RÉELLE ici (`admitMessageEdit`) : c'est elle qui sait au titre
 * de quoi l'éditeur écrit, et c'est elle que la décision gouverne.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockAuthMiddleware = jest.fn();
jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => mockAuthMiddleware,
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  messageValidationHook: jest.fn<any>(async () => {}),
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({ deleteAttachment: jest.fn() })),
}));

jest.mock('../../../services/attachments', () => ({
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
    reconciled: false,
  })),
  mergeTrackingLinksIntoMetadata: () => null,
}));

jest.mock('../../../services/messaging/messageMentions', () => ({
  reconcileEditedMentions: jest.fn<any>().mockResolvedValue({
    validatedUsernames: [],
    validatedUserIds: [],
    newlyMentionedUserIds: [],
    reconciled: false,
  }),
}));

jest.mock('../../../services/messaging/messageEditEffects', () => ({
  applyMessageEditEffects: jest.fn<any>().mockResolvedValue(undefined),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: { getOrCompute: jest.fn<any>().mockResolvedValue([]) },
}));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: jest.fn<any>(async () => '507f1f77bcf86cd799439022'),
}));

jest.mock('../../../socketio/emitMentionCreated', () => ({ emitMentionCreated: jest.fn() }));

const mockBroadcastMessageMutation = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../socketio/broadcastMessageMutation', () => ({
  broadcastMessageMutation: (...args: any[]) => mockBroadcastMessageMutation(...args),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: jest.fn(),
    collectContentTrackingLinks: jest.fn<any>().mockResolvedValue([]),
  })),
}));

import { MASKED_MODERATOR_EDITOR } from '@meeshy/shared/utils/message-edit-attribution';
import messageRoutes from '../../../routes/messages';
import { registerMessagesAdvancedRoutes } from '../../../routes/conversations/messages-advanced';

const AUTHOR_ID = '507f1f77bcf86cd799439011';
const MODERATOR_ID = '507f1f77bcf86cd799439055';
const PART_ID = '507f1f77bcf86cd799439033';
const MSG_ID = '507f1f77bcf86cd799439044';
const CONV_ID = '507f1f77bcf86cd799439022';

type Editor = { readonly userId: string; readonly globalRole: string };

const AUTHOR: Editor = { userId: AUTHOR_ID, globalRole: 'USER' };
const PLATFORM_MODERATOR: Editor = { userId: MODERATOR_ID, globalRole: 'MODERATOR' };
const ORDINARY_MEMBER: Editor = { userId: MODERATOR_ID, globalRole: 'USER' };
const PLATFORM_ADMIN: Editor = { userId: MODERATOR_ID, globalRole: 'ADMIN' };

function buildPrisma(editor: Editor, previously: Record<string, unknown>) {
  const row: Record<string, unknown> = {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    content: 'le texte AVANT',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date(Date.now() - 60_000),
    isEdited: true,
    editedAt: new Date(Date.now() - 30_000),
    deletedAt: null,
    translations: null,
    metadata: null,
    validatedMentions: [],
    ...previously,
  };
  const sender = { id: PART_ID, userId: AUTHOR_ID, displayName: 'alice', avatar: null, role: 'member', user: { username: 'alice' } };
  const apply = (data: Record<string, unknown>) => Object.assign(row, data);

  return {
    message: {
      findFirst: jest.fn<any>(async () => ({
        ...row,
        sender,
        attachments: [],
        conversation: { id: CONV_ID, isActive: true, closedAt: null, type: 'group', encryptionMode: null },
      })),
      updateMany: jest.fn<any>(async ({ data }: any) => {
        apply(data);
        return { count: 1 };
      }),
      update: jest.fn<any>(async ({ data }: any) => {
        apply(data);
        return { ...row, sender };
      }),
      findUniqueOrThrow: jest.fn<any>(async () => ({ ...row, sender })),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-editor', conversationId: CONV_ID, user: { role: editor.globalRole } }),
      findMany: jest.fn<any>().mockResolvedValue([{ id: PART_ID, userId: AUTHOR_ID }]),
    },
    user: { findUnique: jest.fn<any>().mockResolvedValue({ role: editor.globalRole }) },
    messageAttachment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    trackingLink: { updateMany: jest.fn<any>().mockResolvedValue({ count: 0 }) },
  } as any;
}

async function buildApp(editor: Editor, previously: Record<string, unknown> = {}) {
  const authContext = {
    type: 'registered' as const,
    userId: editor.userId,
    hasFullAccess: true,
    isAuthenticated: true,
    isAnonymous: false,
    registeredUser: { id: editor.userId, username: 'editor', role: editor.globalRole },
  };
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = authContext;
  });

  const prisma = buildPrisma(editor, previously);
  const app: FastifyInstance = Fastify({
    logger: false,
    ajv: { customOptions: { strict: 'log' as const, keywords: ['example'] } },
  });
  app.decorate('prisma', prisma);
  app.decorate('translationService', { retranslateMessageAsync: jest.fn<any>().mockResolvedValue(undefined) } as any);
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  app.decorate('socketIOHandler', {
    getManager: () => ({ getIO: () => io, enqueueOfflineMessageMutation: jest.fn<any>() }),
  });
  app.decorate('mentionService', { createMentions: jest.fn() });
  app.decorate('notificationService', { createMentionNotificationsBatch: jest.fn() });

  await messageRoutes(app);
  registerMessagesAdvancedRoutes(app, prisma, async (req: any) => {
    req.authContext = authContext;
  });
  await app.ready();
  return { app, prisma };
}

const writtenData = (prisma: any): Record<string, unknown> => {
  const call = (prisma.message.update.mock.calls[0] ?? prisma.message.updateMany.mock.calls[0])?.[0];
  if (!call) throw new Error('aucune écriture capturée');
  return call.data as Record<string, unknown>;
};

const editedPayload = (): Record<string, unknown> => {
  const call = mockBroadcastMessageMutation.mock.calls.map((c) => c[0] as any).find((p) => p.eventType === 'edited');
  if (!call) throw new Error('aucune diffusion `edited` capturée');
  return call.payload as Record<string, unknown>;
};

const TRANSPORTS = [
  {
    name: 'PUT /messages/:messageId (iOS)',
    refusal: 404,
    inject: (app: FastifyInstance) => app.inject({ method: 'PUT', url: `/messages/${MSG_ID}`, payload: { content: 'le texte APRÈS' } }),
  },
  {
    name: 'PUT /conversations/:id/messages/:messageId (web)',
    refusal: 403,
    inject: (app: FastifyInstance) =>
      app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MSG_ID}`, payload: { content: 'le texte APRÈS' } }),
  },
  {
    name: 'PATCH /messages/:messageId (Android)',
    refusal: 403,
    inject: (app: FastifyInstance) => app.inject({ method: 'PATCH', url: `/messages/${MSG_ID}`, payload: { content: 'le texte APRÈS' } }),
  },
] as const;

describe('#11375 — la modification par un modérateur est enregistrée, servie et diffusée', () => {
  beforeEach(() => mockBroadcastMessageMutation.mockClear());

  for (const transport of TRANSPORTS) {
    describe(transport.name, () => {
      it('un MODERATOR de plateforme sur le message d’autrui : écrit, rendu à lui-même, diffusé SANS son identité', async () => {
        const { app, prisma } = await buildApp(PLATFORM_MODERATOR);

        const res = await transport.inject(app);

        expect(res.statusCode).toBe(200);
        expect(writtenData(prisma)).toMatchObject({ thirdPartyEditorId: MODERATOR_ID, thirdPartyEditorRole: 'MODERATOR' });
        expect(editedPayload()).toMatchObject({ editedById: MASKED_MODERATOR_EDITOR, editedByRole: null });
        expect(JSON.stringify(editedPayload())).not.toContain(MODERATOR_ID);
        expect(editedPayload()).not.toHaveProperty('thirdPartyEditorId');
        expect(editedPayload()).not.toHaveProperty('thirdPartyEditorRole');
        expect(res.json().data).toMatchObject({ editedById: MODERATOR_ID, editedByRole: 'MODERATOR' });
        expect(res.json().data).not.toHaveProperty('thirdPartyEditorId');
        await app.close();
      });

      it('un ADMIN de plateforme : son rang est enregistré, la room ne lit que la mention', async () => {
        const { app, prisma } = await buildApp(PLATFORM_ADMIN);

        const res = await transport.inject(app);

        expect(res.statusCode).toBe(200);
        expect(writtenData(prisma)).toMatchObject({ thirdPartyEditorId: MODERATOR_ID, thirdPartyEditorRole: 'ADMIN' });
        expect(editedPayload()).toMatchObject({ editedById: MASKED_MODERATOR_EDITOR, editedByRole: null });
        await app.close();
      });

      it('l’auteur qui réécrit après un modérateur efface la mention : null écrit et diffusé', async () => {
        const { app, prisma } = await buildApp(AUTHOR, { thirdPartyEditorId: MODERATOR_ID, thirdPartyEditorRole: 'MODERATOR' });

        const res = await transport.inject(app);

        expect(res.statusCode).toBe(200);
        expect(writtenData(prisma)).toMatchObject({ thirdPartyEditorId: null, thirdPartyEditorRole: null });
        expect(editedPayload()).toMatchObject({ editedById: null, editedByRole: null });
        expect(res.json().data).toMatchObject({ editedById: null, editedByRole: null });
        await app.close();
      });

      it(`un utilisateur ordinaire est refusé (${transport.refusal}) et rien n’est écrit`, async () => {
        const { app, prisma } = await buildApp(ORDINARY_MEMBER);

        const res = await transport.inject(app);

        expect(res.statusCode).toBe(transport.refusal);
        expect(prisma.message.update).not.toHaveBeenCalled();
        expect(prisma.message.updateMany).not.toHaveBeenCalled();
        await app.close();
      });
    });
  }
});
