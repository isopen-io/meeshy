/**
 * Ce qu'une édition PUBLIE — et non plus ce qu'elle écrit ou ce qu'elle périme.
 *
 * Le cycle 35 a fermé la fuite de traduction périmée côté CACHE mémoire
 * (`invalidateCacheForMessage`, désormais en tête de la retraduction). Il restait
 * la même fuite sur le chemin le plus visible : la RÉPONSE HTTP et la charge
 * `message:edited` diffusée à toute la conversation.
 *
 * Sur `PUT /messages/:messageId` — le transport du client iOS — l'écriture du
 * contenu ne vidait PAS `translations` ; un second `update`, plus bas, s'en
 * chargeait, mais APRÈS la relecture qui compose la réponse. La ligne relue
 * portait donc le texte d'APRÈS et les traductions d'AVANT, et c'est cette paire
 * qui partait vers tous les clients. Le Prisme Linguistique fait que la plupart
 * des lecteurs ne voient QUE la traduction : ils lisaient l'ancien message,
 * présenté comme la traduction du nouveau.
 *
 * Le fake Prisma de ce fichier est STATEFUL — il modélise la ligne — parce que
 * le défaut est un problème d'ORDRE entre écritures et lecture, qu'un mock à
 * valeur fixe ne peut pas exprimer.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
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
  processExplicitLinks: jest.fn<any>(async (params: any) => params.content),
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

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';

const STALE_TRANSLATION = {
  fr: {
    text: 'le texte AVANT édition',
    translationModel: 'basic' as const,
    createdAt: new Date('2026-01-01T00:00:00Z'),
  },
};

const authContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  isAuthenticated: true,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

// ─── Fake Prisma stateful ─────────────────────────────────────────────────────
//
// Une seule ligne, mutée par les écritures et relue par les lectures : la seule
// façon d'observer qu'une relecture placée AVANT l'invalidation rapporte les
// traductions d'avant.

type Row = Record<string, unknown>;

function buildStatefulPrisma() {
  const row: Row = {
    id: MSG_ID,
    conversationId: CONV_ID,
    senderId: PART_ID,
    content: 'the text BEFORE the edit',
    originalLanguage: 'en',
    isEdited: false,
    editedAt: null,
    deletedAt: null,
    translations: { ...STALE_TRANSLATION },
    validatedMentions: [],
  };

  const sender = {
    id: PART_ID,
    userId: USER_ID,
    displayName: 'alice',
    avatar: null,
    user: { username: 'alice' },
  };

  const apply = (data: Row) => Object.assign(row, data);

  return {
    row,
    client: {
      message: {
        findFirst: jest.fn<any>(async () => ({
          ...row,
          sender: { userId: USER_ID },
          attachments: [],
          conversation: { id: CONV_ID, participants: [{ userId: USER_ID }] },
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
        findFirst: jest.fn<any>().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID }),
        findMany: jest.fn<any>().mockResolvedValue([{ userId: USER_ID }]),
      },
      user: { findUnique: jest.fn<any>().mockResolvedValue({ role: 'USER' }) },
      messageAttachment: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      conversation: {
        update: jest.fn<any>().mockResolvedValue({}),
        updateMany: jest.fn<any>().mockResolvedValue({ count: 1 }),
      },
    },
  };
}

async function buildApp() {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = authContext;
  });

  const prisma = buildStatefulPrisma();
  const app: FastifyInstance = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', prisma.client);
  app.decorate('translationService', {
    retranslateMessageAsync: jest.fn<any>().mockResolvedValue(undefined),
  });
  const io = { to: jest.fn().mockReturnValue({ emit: jest.fn() }) };
  app.decorate('socketIOHandler', { getManager: () => ({ getIO: () => io }) });
  app.decorate('mentionService', { createMentions: jest.fn() });
  app.decorate('notificationService', { createMentionNotificationsBatch: jest.fn() });

  await messageRoutes(app);
  await app.ready();
  return { app, prisma };
}

const edit = (app: FastifyInstance) =>
  app.inject({
    method: 'PUT',
    url: '/messages/' + MSG_ID,
    payload: { content: 'the text AFTER the edit' },
  });

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('PUT /messages/:messageId — une édition ne publie jamais la traduction du texte d\'avant', () => {
  beforeEach(() => {
    mockBroadcastMessageMutation.mockClear();
  });

  it('ne rend pas, dans la réponse HTTP, la traduction attachée au contenu périmé', async () => {
    const { app } = await buildApp();

    const res = await edit(app);

    expect(res.statusCode).toBe(200);
    expect(res.json().data.translations).toEqual([]);
    await app.close();
  });

  it('ne diffuse pas, dans `message:edited`, la traduction attachée au contenu périmé', async () => {
    const { app } = await buildApp();

    await edit(app);

    const broadcast = mockBroadcastMessageMutation.mock.calls[0][0] as any;
    expect(broadcast.eventType).toBe('edited');
    expect(broadcast.payload.translations).toEqual([]);
    await app.close();
  });

  it('invalide les traductions dans l\'écriture du contenu elle-même, sous la garde `deletedAt`', async () => {
    const { app, prisma } = await buildApp();

    await edit(app);

    expect(prisma.client.message.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { id: MSG_ID, deletedAt: null },
        data: expect.objectContaining({ translations: null }),
      })
    );
    await app.close();
  });

  it('n\'ouvre aucune fenêtre où la ligne porte le texte d\'après et les traductions d\'avant', async () => {
    const { app, prisma } = await buildApp();

    await edit(app);

    // À l'instant de la relecture qui compose la charge utile, la ligne ne doit
    // plus porter aucune traduction : sinon la fenêtre existe, et tout lecteur
    // concurrent (`GET /messages/:id`) la traverse aussi.
    const readResult = await prisma.client.message.findUniqueOrThrow.mock.results[0].value;
    expect((readResult as Row).translations).toBeNull();
    await app.close();
  });

  it('ne réécrit pas la ligne une seconde fois pour invalider ce que la première a déjà vidé', async () => {
    const { app, prisma } = await buildApp();

    await edit(app);

    expect(prisma.client.message.update).not.toHaveBeenCalled();
    await app.close();
  });
});

describe('PUT /messages/:messageId — la retraduction passe par l\'entrée publique du service', () => {
  it('appelle `retranslateMessageAsync`, sans percer l\'encapsulation du service', async () => {
    const { app } = await buildApp();

    await edit(app);

    const service = (app as unknown as { translationService: Record<string, jest.Mock> }).translationService;
    expect(service.retranslateMessageAsync).toHaveBeenCalledWith(
      MSG_ID,
      expect.objectContaining({
        id: MSG_ID,
        content: 'the text AFTER the edit',
        conversationId: CONV_ID,
      })
    );
    await app.close();
  });
});
