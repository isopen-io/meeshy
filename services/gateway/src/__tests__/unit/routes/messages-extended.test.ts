/**
 * Extended unit tests for messages.ts routes.
 * Covers branches missing from messages.test.ts:
 * - DELETE with non-empty attachments (attachment deletion loop)
 * - DELETE with socketIO manager (socket emit)
 * - PUT with socketIO manager (socket emit)
 * - PUT without translationService (warn branch)
 * - POST /status with invalid status (400)
 * - POST /status with socketIO manager (socket emit)
 * - POST /attachments/status with 'watched' action
 * - POST /attachments/status with socketIO manager (socket emit)
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
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

const mockDeleteAttachment = jest.fn().mockResolvedValue(undefined);
jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    deleteAttachment: (...args: any[]) => mockDeleteAttachment(...args),
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

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    READ_STATUS_UPDATED: 'read-status:updated',
    ATTACHMENT_STATUS_UPDATED: 'attachment-status:updated',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
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

const mockMarkMessagesAsRead = jest.fn().mockResolvedValue(undefined);
const mockGetLatestMessageSummary = jest.fn().mockResolvedValue({ readCount: 1 });
const mockMarkAudioAsListened = jest.fn().mockResolvedValue(undefined);
const mockMarkVideoAsWatched = jest.fn().mockResolvedValue(undefined);
const mockMarkImageAsViewed = jest.fn().mockResolvedValue(undefined);
const mockMarkAttachmentAsDownloaded = jest.fn().mockResolvedValue(undefined);

const mockRecordMessageLanguageView = jest.fn().mockResolvedValue(undefined);
const mockGetUnreadCount = jest.fn().mockResolvedValue(3);

const mockShouldShowReadReceipts = jest.fn().mockResolvedValue(true);
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: (...args: any[]) => mockShouldShowReadReceipts(...args),
  })),
}));

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getUnreadCount: (...args: any[]) => mockGetUnreadCount(...args),
    markMessagesAsRead: (...args: any[]) => mockMarkMessagesAsRead(...args),
    recordMessageLanguageView: (...args: any[]) => mockRecordMessageLanguageView(...args),
    getLatestMessageSummary: (...args: any[]) => mockGetLatestMessageSummary(...args),
    getMessageStatusDetails: jest.fn().mockResolvedValue({ statuses: [], pagination: {} }),
    getAttachmentStatusDetails: jest.fn().mockResolvedValue({ statuses: [], pagination: {} }),
    markAudioAsListened: (...args: any[]) => mockMarkAudioAsListened(...args),
    markVideoAsWatched: (...args: any[]) => mockMarkVideoAsWatched(...args),
    markImageAsViewed: (...args: any[]) => mockMarkImageAsViewed(...args),
    markAttachmentAsDownloaded: (...args: any[]) => mockMarkAttachmentAsDownloaded(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = 'user-abc123';
const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const PART_ID = '507f1f77bcf86cd799439033';
const ATTACHMENT_ID = '507f1f77bcf86cd799439044';

const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  isAuthenticated: true,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

const mockMessage = {
  id: MSG_ID,
  conversationId: CONV_ID,
  senderId: PART_ID,
  content: 'Hello!',
  originalLanguage: 'fr',
  messageType: 'text',
  isEdited: false,
  editedAt: null,
  deletedAt: null,
  replyToId: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  translations: null,
  sender: { id: PART_ID, userId: USER_ID, displayName: 'alice', avatar: null, type: 'registered', user: { username: 'alice' } },
  conversation: {
    id: CONV_ID,
    createdAt: new Date(),
    lastMessageAt: new Date('2026-07-01T00:00:00Z'),
    participants: [{ userId: USER_ID, role: 'member' }],
  },
  attachments: [],
};

const mockAttachment = {
  id: ATTACHMENT_ID,
  messageId: MSG_ID,
  message: {
    id: MSG_ID,
    conversationId: CONV_ID,
    conversation: {
      // `id` présent : la route écrit les statuts par PARTICIPANT
      // (AttachmentStatusEntry.participantId), jamais par User.id.
      participants: [{ id: PART_ID, userId: USER_ID }],
    },
  },
};

// ─── Socket mock ──────────────────────────────────────────────────────────────

function makeMockSocketIO() {
  const mockEmit = jest.fn();
  // `rooms` collecte AUSSI les `.to()` chaînés : le fan-out des accusés de
  // lecture n'appelle `io.to()` qu'une fois (la room conversation) puis chaîne
  // les rooms personnelles sur l'objet rendu. Sans cela, aucune assertion ne
  // peut voir la room d'un participant.
  const rooms: string[] = [];
  const excepts: string[] = [];
  const chained: { emit: jest.Mock; to: jest.Mock; except: jest.Mock } = {
    emit: mockEmit,
    to: jest.fn((room: string) => { rooms.push(room); return chained; }),
    // `except` manquait à ce double, et le fan-out des accusés de lecture
    // l'appelle depuis que l'acteur est retiré de l'éventail : sans lui, la
    // chaîne jetait un TypeError avalé par le try/catch de la route, et aucune
    // émission n'était observable. C'est le double qui était incomplet.
    except: jest.fn((room: string) => { excepts.push(room); return chained; }),
  };
  const mockTo = jest.fn((room: string) => { rooms.push(room); return chained; });
  const mockEnqueueOfflineMutation = jest.fn().mockResolvedValue(undefined);
  return {
    mockEmit,
    mockTo,
    rooms,
    excepts,
    mockEnqueueOfflineMutation,
    manager: {
      getIO: () => ({ to: mockTo }),
      enqueueOfflineMessageMutation: mockEnqueueOfflineMutation,
    },
  };
}

// ─── App factories ────────────────────────────────────────────────────────────

async function buildApp(opts: {
  socketIOManager?: any;
  translationService?: any;
  messageOverride?: any;
  attachmentOverride?: any;
} = {}): Promise<FastifyInstance> {
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = mockAuthContext;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  app.decorate('prisma', {
    message: {
      findFirst: jest.fn().mockResolvedValue(opts.messageOverride ?? mockMessage),
      update: jest.fn().mockResolvedValue({ ...mockMessage, isEdited: true }),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
      findUniqueOrThrow: jest.fn().mockResolvedValue({ ...mockMessage, isEdited: true }),
    },
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: PART_ID, conversationId: CONV_ID }),
      findMany: jest.fn().mockResolvedValue([{ userId: USER_ID }]),
    },
    user: {
      findUnique: jest.fn().mockResolvedValue({ role: 'USER' }),
    },
    messageAttachment: {
      findFirst: jest.fn().mockResolvedValue(opts.attachmentOverride ?? mockAttachment),
    },
    conversation: {
      // Voir messages.test.ts : `applyMessageRemovalEffects` relit
      // `lastMessageAt` lui-même au lieu de le recevoir joint au message.
      findUnique: jest.fn().mockResolvedValue({
        lastMessageAt: mockMessage.conversation.lastMessageAt,
        createdAt: mockMessage.conversation.createdAt,
      }),
      update: jest.fn().mockResolvedValue({}),
      updateMany: jest.fn().mockResolvedValue({ count: 1 }),
    },
    trackingLink: {
      updateMany: jest.fn().mockResolvedValue({ count: 0 }),
    },
    conversationReadCursor: {
      findUnique: jest.fn().mockResolvedValue({ lastReadAt: new Date('2026-08-16T09:00:00Z') }),
    },
  });

  if (opts.translationService !== undefined) {
    if (opts.translationService !== null) {
      app.decorate('translationService', opts.translationService);
    }
  } else {
    app.decorate('translationService', {
      retranslateMessageAsync: jest.fn().mockResolvedValue(undefined),
    });
  }

  const socketHandlerArg = opts.socketIOManager
    ? { getManager: () => opts.socketIOManager }
    : { getManager: () => null };
  app.decorate('socketIOHandler', socketHandlerArg);

  await messageRoutes(app);
  await app.ready();
  return app;
}

// ─── DELETE /messages/:messageId — with attachments ───────────────────────────

describe('DELETE /messages/:messageId — with attachments', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    const msgWithAttachments = {
      ...mockMessage,
      attachments: [{ id: ATTACHMENT_ID }, { id: 'attach-2' }],
    };
    app = await buildApp({ messageOverride: msgWithAttachments });
  });
  afterAll(async () => { await app.close(); });

  it('calls deleteAttachment for each attachment', async () => {
    mockDeleteAttachment.mockClear();
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce({ ...mockMessage, attachments: [{ id: ATTACHMENT_ID }, { id: 'attach-2' }] })
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
    expect(mockDeleteAttachment).toHaveBeenCalledTimes(2);
    expect(mockDeleteAttachment).toHaveBeenCalledWith(ATTACHMENT_ID);
    expect(mockDeleteAttachment).toHaveBeenCalledWith('attach-2');
  });

  it('continues deletion even if one attachment deleteAttachment fails', async () => {
    mockDeleteAttachment.mockClear();
    mockDeleteAttachment.mockRejectedValueOnce(new Error('S3 fail'));
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce({ ...mockMessage, attachments: [{ id: ATTACHMENT_ID }, { id: 'attach-2' }] })
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
  });
});

// ─── DELETE /messages/:messageId — qui a le droit de supprimer ────────────────
//
// C'est la route qu'ANDROID emploie (`core/network/.../api/MessageApi.kt:40`,
// `@DELETE("messages/{id}")`). Elle portait sa propre copie de la règle, et
// cette copie avait dérivé sur deux points que rien ne mesurait : elle joignait
// les participants SANS `isActive: true`, et elle testait un rôle `CREATOR` que
// l'enum `UserRole` ne contient pas.

describe('DELETE /messages/:messageId — admission', () => {
  const OTHER_USER = 'user-other';
  const foreignMessage = {
    ...mockMessage,
    sender: { ...mockMessage.sender, userId: OTHER_USER },
  };

  async function deleteAs(opts: { membership?: any; globalRole?: string | null }) {
    const app = await buildApp({ messageOverride: foreignMessage });
    (app as any).prisma.participant.findFirst.mockResolvedValue(opts.membership ?? null);
    (app as any).prisma.user.findUnique.mockResolvedValue(
      opts.globalRole === undefined ? { role: 'USER' } : { role: opts.globalRole }
    );
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(foreignMessage)
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    const participantQuery = (app as any).prisma.participant.findFirst.mock.calls[0]?.[0];
    await app.close();
    return { res, participantQuery };
  }

  it("admet l'admin de CONVERSATION qui n'est qu'un USER global", async () => {
    const { res } = await deleteAs({ membership: { role: 'admin', user: { role: 'USER' } } });

    expect(res.statusCode).toBe(200);
  });

  it("n'interroge l'appartenance QU'active — un admin qui a quitté ne supprime plus", async () => {
    // Sans `isActive: true`, une ligne participant laissée derrière par un
    // départ conservait indéfiniment le droit de supprimer.
    const { participantQuery } = await deleteAs({ membership: { role: 'admin', user: { role: 'USER' } } });

    expect(participantQuery.where).toEqual({ conversationId: CONV_ID, userId: USER_ID, isActive: true });
  });

  it('refuse le simple membre', async () => {
    const { res } = await deleteAs({ membership: { role: 'member', user: { role: 'USER' } } });

    expect(res.statusCode).toBe(403);
  });

  it("refuse le rôle `CREATOR`, absent de l'enum `UserRole`", async () => {
    const { res } = await deleteAs({ globalRole: 'CREATOR' });

    expect(res.statusCode).toBe(403);
  });

  it("admet le BIGBOSS global qui n'est pas participant", async () => {
    const { res } = await deleteAs({ globalRole: 'BIGBOSS' });

    expect(res.statusCode).toBe(200);
  });
});

// ─── DELETE /messages/:messageId — with socketIO ──────────────────────────────

describe('DELETE /messages/:messageId — with socketIO manager', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  beforeAll(async () => {
    const { mockEmit: emit, manager } = makeMockSocketIO();
    mockEmit = emit;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('emits MESSAGE_DELETED to conversation room', async () => {
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('message:deleted', expect.objectContaining({ messageId: MSG_ID }));
  });
});

// ─── PUT /messages/:messageId — with socketIO ─────────────────────────────────

describe('PUT /messages/:messageId — with socketIO manager', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  beforeAll(async () => {
    const { mockEmit: emit, manager } = makeMockSocketIO();
    mockEmit = emit;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('emits MESSAGE_EDITED to conversation room', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('message:edited', expect.any(Object));
  });
});

// ─── PUT /messages/:messageId — no translationService ────────────────────────

describe('PUT /messages/:messageId — without translationService', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ translationService: null });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 even when translationService is absent', async () => {
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'Updated content' },
    });
    expect(res.statusCode).toBe(200);
  });
});

// ─── POST /messages/:messageId/status — invalid status ───────────────────────

describe('POST /messages/:messageId/status — invalid status', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid status value', async () => {
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: { status: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });

  it('returns 400 when status is missing', async () => {
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: {},
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /messages/:messageId/status — with socketIO ────────────────────────

describe('POST /messages/:messageId/status — with socketIO manager', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  let rooms: string[];
  beforeAll(async () => {
    const { mockEmit: emit, rooms: r, manager } = makeMockSocketIO();
    mockEmit = emit;
    rooms = r;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  function readMessage() {
    return {
      ...mockMessage,
      senderId: 'other-part-id',
      conversation: {
        id: CONV_ID,
        createdAt: new Date(),
        participants: [{ id: PART_ID, userId: USER_ID }],
      },
    };
  }

  it('emits READ_STATUS_UPDATED via socketIO', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(readMessage());
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: { status: 'read' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('read-status:updated', expect.any(Object));
  });

  // Cette route portait la QUATRIÈME copie verbatim du fan-out d'accusés, et la
  // dernière encore adressée par `userId` seul : l'expéditeur sans compte du
  // message qu'on vient de lire n'apprenait jamais qu'il avait été lu, sa bulle
  // restant sur un tic « envoyé » indéfiniment.
  //
  // L'éventail ne nomme plus la room de l'ACTEUR : elle en est retirée, et il
  // reçoit à la place une copie ciblée portant sa frontière de lecture et son
  // arriéré — deux champs qui décrivent une personne, pas la conversation. Sa
  // room reste donc nommée, mais par une autre chaîne, plus bas.
  it('adresse un participant sans compte par son participant id', async () => {
    (app as any).prisma.message.findFirst.mockResolvedValueOnce(readMessage());

    // Le double distingue les DEUX lectures de participants que cette route
    // fait maintenant : l'éventail des accusés (`{conversationId, isActive}`)
    // et la résolution du lecteur par la passe de pont ✦ (`OR: [{id},
    // {userId}]`, cycle 63). Un `mockResolvedValueOnce` servait la première
    // lecture ARRIVÉE — la passe de pont partant en parallèle, l'éventail
    // retombait sur le défaut et le témoin accusait un défaut d'adressage qui
    // n'existait pas. Un double qui ne regarde pas sa clause décrit un autre
    // programme dès qu'un second appelant apparaît.
    const findMany = (app as any).prisma.participant.findMany;
    const previous = findMany.getMockImplementation();
    findMany.mockImplementation(async (args: any) =>
      args?.where?.OR
        ? [] // la passe de pont ne résout aucun participant ⇒ aucun pont, hors sujet ici
        : [
            { id: PART_ID, userId: USER_ID },
            { id: 'part-anonyme', userId: null },
          ]
    );
    rooms.length = 0;

    try {
      const res = await app.inject({
        method: 'POST', url: '/messages/' + MSG_ID + '/status',
        payload: { status: 'read' },
      });

      expect(res.statusCode).toBe(200);
      expect(rooms).toContain(`conversation:${CONV_ID}`);
      expect(rooms).toContain('user:part-anonyme');
    } finally {
      findMany.mockImplementation(previous ?? (async () => [{ userId: USER_ID }]));
    }
  });
});

// ─── POST /attachments/:id/status — watched action ───────────────────────────

describe('POST /attachments/:attachmentId/status — watched action', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 200 for watched action and calls markVideoAsWatched', async () => {
    mockMarkVideoAsWatched.mockClear();
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'watched', complete: true, playPositionMs: 1000, durationMs: 5000 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockMarkVideoAsWatched).toHaveBeenCalledWith(
      PART_ID, ATTACHMENT_ID,
      expect.objectContaining({ watchPositionMs: 1000, watchDurationMs: 5000, complete: true })
    );
  });
});

// ─── POST /attachments/:id/status — invalid action ───────────────────────────

describe('POST /attachments/:attachmentId/status — invalid action', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 400 for invalid action value', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'invalid' },
    });
    expect(res.statusCode).toBe(400);
  });
});

// ─── POST /attachments/:id/status — with socketIO ────────────────────────────

describe('POST /attachments/:attachmentId/status — with socketIO manager', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  beforeAll(async () => {
    const { mockEmit: emit, manager } = makeMockSocketIO();
    mockEmit = emit;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('emits ATTACHMENT_STATUS_UPDATED via socketIO', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', complete: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('attachment-status:updated', expect.objectContaining({
      attachmentId: ATTACHMENT_ID,
      action: 'listened',
    }));
  });

  it('emits playPositionMs/durationMs/percentage when both are reported', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', playPositionMs: 2500, durationMs: 10000 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('attachment-status:updated', expect.objectContaining({
      attachmentId: ATTACHMENT_ID,
      action: 'listened',
      playPositionMs: 2500,
      durationMs: 10000,
      percentage: 25,
    }));
  });

  it('omits percentage when durationMs is not reported', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', playPositionMs: 2500 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('attachment-status:updated', expect.objectContaining({
      attachmentId: ATTACHMENT_ID,
      action: 'listened',
      playPositionMs: 2500,
    }));
    const lastCall = mockEmit.mock.calls[mockEmit.mock.calls.length - 1];
    expect(lastCall[1]).not.toHaveProperty('percentage');
  });

  it('clamps percentage to 100 when playPositionMs exceeds durationMs', async () => {
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'watched', playPositionMs: 12000, durationMs: 10000 },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('attachment-status:updated', expect.objectContaining({
      attachmentId: ATTACHMENT_ID,
      action: 'watched',
      percentage: 100,
    }));
  });
});

// ─── POST /attachments/:id/status — read-receipt opt-out gate ─────────────────

describe('POST /attachments/:attachmentId/status — read-receipt opt-out', () => {
  let app: FastifyInstance;
  let mockEmit: jest.Mock;
  beforeAll(async () => {
    const { mockEmit: emit, manager } = makeMockSocketIO();
    mockEmit = emit;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });
  beforeEach(() => {
    mockEmit.mockClear();
    mockShouldShowReadReceipts.mockResolvedValue(true);
  });

  it('does not broadcast attachment consumption when the actor opted out of read receipts', async () => {
    // Jumelle de `broadcastReadStatus` (qui tait un `read` sur la même
    // préférence, même SSOT `PrivacyPreferencesService`) : un utilisateur
    // `showReadReceipts = false` ne doit pas voir sa consommation média poussée
    // aux autres membres de la room.
    mockShouldShowReadReceipts.mockResolvedValue(false);
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', complete: true },
    });
    expect(res.statusCode).toBe(200);
    const broadcast = mockEmit.mock.calls.find(c => c[0] === 'attachment-status:updated');
    expect(broadcast).toBeUndefined();
  });

  it('still broadcasts when the actor allows read receipts', async () => {
    mockShouldShowReadReceipts.mockResolvedValue(true);
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened', complete: true },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEmit).toHaveBeenCalledWith('attachment-status:updated', expect.objectContaining({
      attachmentId: ATTACHMENT_ID,
    }));
  });
});

// ─── Error paths not covered in messages.test.ts ─────────────────────────────

describe('POST /messages/:messageId/status — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on unexpected DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({
      method: 'POST', url: '/messages/' + MSG_ID + '/status',
      payload: { status: 'read' },
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /messages/:messageId/translations — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/translations' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /messages/:messageId/status-details — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.message.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'GET', url: '/messages/' + MSG_ID + '/status-details' });
    expect(res.statusCode).toBe(500);
  });
});

describe('GET /attachments/:attachmentId/status-details — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.messageAttachment.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({ method: 'GET', url: '/attachments/' + ATTACHMENT_ID + '/status-details' });
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /attachments/:attachmentId/status — DB error', () => {
  let app: FastifyInstance;
  beforeAll(async () => { app = await buildApp(); });
  afterAll(async () => { await app.close(); });

  it('returns 500 on DB error', async () => {
    (app as any).prisma.messageAttachment.findFirst.mockRejectedValueOnce(new Error('DB crash'));
    const res = await app.inject({
      method: 'POST', url: '/attachments/' + ATTACHMENT_ID + '/status',
      payload: { action: 'listened' },
    });
    expect(res.statusCode).toBe(500);
  });
});

// ─── Offline replay parity: REST edit/delete must feed the delivery queue ─────
//
// `MessageHandler.handleMessageEdit`/`handleMessageDelete` (socket transport)
// enqueue the mutation for every OFFLINE participant so their cached copy
// converges on reconnect. These REST routes are the transport the iOS SDK
// actually uses (`MessageService.swift`: PUT /messages/:id to edit,
// DELETE /conversations/:id/messages/:id to delete), so without the same
// enqueue an edit or delete made from iOS is lost FOREVER for anyone offline
// at that moment — the live room emit is the only notification they'd ever get.

describe('PUT /messages/:messageId — offline delivery replay', () => {
  let app: FastifyInstance;
  let mockEnqueueOfflineMutation: jest.Mock;
  beforeAll(async () => {
    const { manager, mockEnqueueOfflineMutation: enqueue } = makeMockSocketIO();
    mockEnqueueOfflineMutation = enqueue;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('enqueues the edit for offline participants', async () => {
    mockEnqueueOfflineMutation.mockClear();
    const res = await app.inject({
      method: 'PUT', url: '/messages/' + MSG_ID,
      payload: { content: 'edited via REST' },
    });
    expect(res.statusCode).toBe(200);
    expect(mockEnqueueOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        actorUserId: USER_ID,
        eventType: 'edited',
        messageId: MSG_ID,
        payload: expect.objectContaining({ id: MSG_ID, conversationId: CONV_ID }),
      })
    );
  });
});

describe('DELETE /messages/:messageId — offline delivery replay', () => {
  let app: FastifyInstance;
  let mockEnqueueOfflineMutation: jest.Mock;
  beforeAll(async () => {
    const { manager, mockEnqueueOfflineMutation: enqueue } = makeMockSocketIO();
    mockEnqueueOfflineMutation = enqueue;
    app = await buildApp({ socketIOManager: manager });
  });
  afterAll(async () => { await app.close(); });

  it('enqueues the deletion for offline participants', async () => {
    mockEnqueueOfflineMutation.mockClear();
    (app as any).prisma.message.findFirst
      .mockResolvedValueOnce(mockMessage)
      .mockResolvedValueOnce(null);
    const res = await app.inject({ method: 'DELETE', url: '/messages/' + MSG_ID });
    expect(res.statusCode).toBe(200);
    expect(mockEnqueueOfflineMutation).toHaveBeenCalledWith(
      expect.objectContaining({
        conversationId: CONV_ID,
        actorUserId: USER_ID,
        eventType: 'deleted',
        messageId: MSG_ID,
        payload: { messageId: MSG_ID, conversationId: CONV_ID },
      })
    );
  });
});
