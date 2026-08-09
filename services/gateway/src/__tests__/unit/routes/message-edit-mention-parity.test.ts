/**
 * Ce qu'une édition doit aux gens qu'elle NOMME et aux liens qu'elle PORTE, sur
 * le transport que le client iOS emploie réellement : `PUT /messages/:messageId`
 * (`routes/messages.ts`), et non `PUT /conversations/:id/messages/:messageId`.
 *
 * Les deux unités partagées — `processExplicitLinks` et `reconcileEditedMentions`
 * — ont été câblées sur le chemin socket et sur la route CONVERSATION-scopée, en
 * désignant chaque fois « le transport primaire d'iOS » dans leur commentaire.
 * Elles désignaient la mauvaise route : celle-ci n'appelait ni l'une ni l'autre.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
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
  AttachmentService: jest.fn().mockImplementation(() => ({
    deleteAttachment: jest.fn(),
  })),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../utils/translation-transformer', () => ({
  transformTranslationsToArray: jest.fn().mockReturnValue([]),
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

const mockProcessExplicitLinks = jest.fn<any>(async (params: any) => params.content);
jest.mock('../../../services/messaging/messageLinks', () => ({
  processExplicitLinks: (...args: any[]) => mockProcessExplicitLinks(...args),
}));

const mockReconcileEditedMentions = jest.fn<any>().mockResolvedValue({
  validatedUsernames: [],
  validatedUserIds: [],
  newlyMentionedUserIds: [],
  reconciled: true,
});
jest.mock('../../../services/messaging/messageMentions', () => ({
  reconcileEditedMentions: (...args: any[]) => mockReconcileEditedMentions(...args),
}));

const mockEmitMentionCreated = jest.fn();
jest.mock('../../../socketio/emitMentionCreated', () => ({
  emitMentionCreated: (...args: any[]) => mockEmitMentionCreated(...args),
}));

const mockBroadcastMessageMutation = jest.fn<any>().mockResolvedValue(undefined);
jest.mock('../../../socketio/broadcastMessageMutation', () => ({
  broadcastMessageMutation: (...args: any[]) => mockBroadcastMessageMutation(...args),
}));

const mockTrackingLinkServiceCtor = jest.fn();
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation((...args: any[]) => {
    mockTrackingLinkServiceCtor(...args);
    return { processExplicitLinksInContent: jest.fn() };
  }),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

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

const existingMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: PART_ID,
  content: 'salut @alice',
  originalLanguage: 'fr',
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  translations: null,
  validatedMentions: ['alice'],
  sender: { id: PART_ID, userId: USER_ID, displayName: 'alice', avatar: null, user: { username: 'alice' } },
  conversation: { id: CONV_ID, participants: [{ userId: USER_ID }] },
  attachments: [],
};

// ─── App factory ──────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = authContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    message: {
      findFirst: jest.fn<any>().mockResolvedValue(existingMessage),
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn<any>().mockResolvedValue({
        ...existingMessage,
        content: 'salut @bob',
        isEdited: true,
        validatedMentions: ['bob'],
      }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID }),
      findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({ role: 'USER' }),
    },
    messageAttachment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversation: {
      update: jest.fn<any>().mockResolvedValue({}),
      updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
    },
  });

  app.decorate('translationService', {
    retranslateMessageAsync: jest.fn<any>().mockResolvedValue(undefined),
  });

  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) });
  app.decorate('mentionService', { createMentions: jest.fn() });
  app.decorate('notificationService', { createMentionNotificationsBatch: jest.fn() });

  await messageRoutes(app);
  await app.ready();
  return app;
}

const editRequest = (app: FastifyInstance, content: unknown) =>
  app.inject({ method: 'PUT', url: '/messages/' + MSG_ID, payload: { content } });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PUT /messages/:messageId — les obligations d\'une édition ne dépendent pas du transport', () => {
  let app: FastifyInstance;

  beforeEach(async () => {
    jest.clearAllMocks();
    mockProcessExplicitLinks.mockImplementation(async (params: any) => params.content);
    mockReconcileEditedMentions.mockResolvedValue({
      validatedUsernames: [],
      validatedUserIds: [],
      newlyMentionedUserIds: [],
      reconciled: true,
    });
    app = await buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('réconcilie les mentions du texte édité — sans quoi éditer « @alice » en « @bob » laisse Alice mentionnée', async () => {
    const res = await editRequest(app, 'salut @bob');

    expect(res.statusCode).toBe(200);
    expect(mockReconcileEditedMentions).toHaveBeenCalledWith(expect.objectContaining({
      message: { id: MSG_ID, conversationId: CONV_ID, senderId: PART_ID },
      content: 'salut @bob',
      editorUserId: USER_ID,
    }));
  });

  it('réconcilie APRÈS l\'écriture, jamais sur un message que la course de suppression a fait disparaître', async () => {
    (app as any).prisma.message.updateMany.mockResolvedValueOnce({ count: 0 });

    const res = await editRequest(app, 'salut @bob');

    expect(res.statusCode).toBe(404);
    expect(mockReconcileEditedMentions).not.toHaveBeenCalled();
  });

  it('émet `mention:created` aux seuls ENTRANTS, qui ne sont pas forcément dans le salon de conversation', async () => {
    mockReconcileEditedMentions.mockResolvedValue({
      validatedUsernames: ['bob'],
      validatedUserIds: ['user-bob'],
      newlyMentionedUserIds: ['user-bob'],
      reconciled: true,
    });

    await editRequest(app, 'salut @bob');

    expect(mockEmitMentionCreated).toHaveBeenCalledWith(expect.objectContaining({
      newlyMentionedUserIds: ['user-bob'],
      messageId: MSG_ID,
      conversationId: CONV_ID,
      editorUserId: USER_ID,
      content: 'salut @bob',
    }));
  });

  it('transforme les liens `[[url]]` en liens traçables AVANT l\'écriture, comme à l\'envoi', async () => {
    mockProcessExplicitLinks.mockResolvedValue('regarde m+tok3n');

    const res = await editRequest(app, 'regarde [[https://example.com]]');

    expect(res.statusCode).toBe(200);
    expect(mockProcessExplicitLinks).toHaveBeenCalledWith(expect.objectContaining({
      content: 'regarde [[https://example.com]]',
      conversationId: CONV_ID,
      messageId: MSG_ID,
      createdBy: USER_ID,
    }));
    expect((app as any).prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: 'regarde m+tok3n' }),
    }));
  });

  it('fait circuler le contenu TRAITÉ, et lui seul — base, mentions, retraduction', async () => {
    mockProcessExplicitLinks.mockResolvedValue('regarde m+tok3n @bob');

    await editRequest(app, 'regarde [[https://example.com]] @bob');

    expect(mockReconcileEditedMentions).toHaveBeenCalledWith(expect.objectContaining({
      content: 'regarde m+tok3n @bob',
    }));
    expect((app as any).translationService.retranslateMessageAsync).toHaveBeenCalledWith(
      MSG_ID,
      expect.objectContaining({ content: 'regarde m+tok3n @bob' })
    );
  });

  it('retire la légende d\'un message à pièce jointe sans planter sur un `content` absent', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce({
      ...existingMessage,
      attachments: [{ id: 'att-1' }],
    });

    const res = await app.inject({ method: 'PUT', url: '/messages/' + MSG_ID, payload: {} });

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.message.updateMany).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({ content: '' }),
    }));
  });
});

/**
 * Le droit d'éditer ne dépend pas non plus du transport. Ce `PUT` — celui
 * qu'emploie iOS — n'imposait AUCUNE fenêtre de 24h là où le socket et la route
 * conversation-scopée la refusaient, et n'admettait aucun modérateur là où l'UI
 * web en propose un. Un iPhone éditait un message de trois ans ; le même geste
 * depuis le web échouait.
 */
describe('PUT /messages/:messageId — l\'admission à l\'édition est celle des autres transports', () => {
  let app: FastifyInstance;

  const stale = { ...existingMessage, createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) };

  beforeEach(async () => {
    jest.clearAllMocks();
    mockProcessExplicitLinks.mockImplementation(async (params: any) => params.content);
    mockReconcileEditedMentions.mockResolvedValue({
      validatedUsernames: [], validatedUserIds: [], newlyMentionedUserIds: [], reconciled: true,
    });
    app = await buildApp();
  });

  afterEach(async () => { await app.close(); });

  it('refuse l\'auteur au-delà de 24h, et n\'écrit rien', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValue(stale);

    const res = await editRequest(app, 'trop tard');

    expect(res.statusCode).toBe(403);
    expect((app as any).prisma.message.updateMany).not.toHaveBeenCalled();
  });

  it('rouvre la fenêtre à un auteur au rôle GLOBAL privilégié', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValue(stale);
    (app as any).prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });

    const res = await editRequest(app, 'correction tardive');

    expect(res.statusCode).toBe(200);
    expect((app as any).prisma.message.updateMany).toHaveBeenCalled();
  });

  it('admet un modérateur GLOBAL membre actif sur le message de quelqu\'un d\'autre', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValue({
      ...existingMessage,
      sender: { ...existingMessage.sender, userId: 'user-someone-else' },
    });
    (app as any).prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, user: { role: 'MODERATOR' } });

    const res = await editRequest(app, 'contenu modéré');

    expect(res.statusCode).toBe(200);
    // La lecture ne doit plus ENCODER la règle : tant qu'elle filtre
    // `sender: { userId }`, aucun modérateur ne peut être admis — la ligne
    // n'arrive jamais jusqu'à la décision. La politique se décide, elle ne se
    // cache pas dans un `where`.
    const where = (app as any).prisma.message.findFirst.mock.calls[0][0].where;
    expect(where).toEqual({ id: MSG_ID, deletedAt: null });
  });

  it('refuse un simple membre sur le message de quelqu\'un d\'autre — 404, comme avant, sans révéler que le message existe', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValue({
      ...existingMessage,
      sender: { ...existingMessage.sender, userId: 'user-someone-else' },
    });

    const res = await editRequest(app, 'pas le mien');

    expect(res.statusCode).toBe(404);
    expect((app as any).prisma.message.updateMany).not.toHaveBeenCalled();
  });
});
