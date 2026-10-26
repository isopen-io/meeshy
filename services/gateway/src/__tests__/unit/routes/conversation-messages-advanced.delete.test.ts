/**
 * DELETE /conversations/:id/messages/:messageId — les témoins du retrait,
 * séparés de `conversation-messages-advanced.test.ts` (budget de taille des
 * suites, #4531) : l'auteur, le créateur, le modérateur et le tiers avec motif
 * (#11149). Même montage de doubles que la suite d'origine.
 */
import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks (hoisted before imports) ────────────────────────────────────

const mockResolveConversationId = jest.fn<any>();
const mockCanAccessConversation = jest.fn<any>();
const mockTransformTranslationsToArray = jest.fn<any>().mockReturnValue([]);
const mockMessageValidationHook = jest.fn<any>();

const mockSendSuccess = jest.fn<any>((reply: any, data: any) => {
  reply._body = { success: true, data };
  return reply;
});
const mockSendBadRequest = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendForbidden = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendNotFound = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendInternalError = jest.fn<any>((reply: any, msg: any) => {
  reply._body = { success: false, error: msg };
  return reply;
});
const mockSendError = jest.fn<any>((reply: any, status: any, msg: any) => {
  reply._body = { success: false, status, error: msg };
  return reply;
});
const mockSendConflict = jest.fn<any>((reply: any, msg: any, opts?: any) => {
  reply._body = { success: false, status: 409, error: msg, code: opts?.code };
  return reply;
});

const mockProcessExplicitLinksInContent = jest.fn<any>().mockResolvedValue({
  processedContent: 'processed content',
  trackingLinks: [],
});
const mockDeleteAttachment = jest.fn<any>().mockResolvedValue(undefined);
const mockGetOrCompute = jest.fn<any>().mockResolvedValue([]);
const mockOnMessageEdited = jest.fn<any>().mockResolvedValue(undefined);
const mockOnMessageDeleted = jest.fn<any>().mockResolvedValue(undefined);

const mockCollectContentTrackingLinks = jest.fn<any>().mockResolvedValue([]);
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({
    processExplicitLinksInContent: (...args: any[]) => mockProcessExplicitLinksInContent(...args),
    collectContentTrackingLinks: (...args: any[]) => mockCollectContentTrackingLinks(...args),
  })),
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    deleteAttachment: (...args: any[]) => mockDeleteAttachment(...args),
  })),
}));

jest.mock('../../../services/ConversationStatsService', () => ({
  conversationStatsService: {
    getOrCompute: (...args: any[]) => mockGetOrCompute(...args),
  },
}));

// Seul le singleton est doublé. `resolveAttachmentType` et `statsAuthorKey`
// restent les VRAIS : depuis que le décompte vit dans `applyMessageRemovalEffects`,
// ces tests traversent l'unité partagée pour de bon, et c'est ce qui en fait
// des témoins de la ROUTE — « supprimer par ici débite bien les compteurs » —
// et non du double.
jest.mock('../../../services/ConversationMessageStatsService', () => ({
  ...(jest.requireActual('../../../services/ConversationMessageStatsService') as object),
  conversationMessageStatsService: {
    onMessageEdited: (...args: any[]) => mockOnMessageEdited(...args),
    onMessageDeleted: (...args: any[]) => mockOnMessageDeleted(...args),
  },
}));

jest.mock('../../../utils/translation-transformer', () => ({
  transformTranslationsToArray: (...args: any[]) => mockTransformTranslationsToArray(...args),
}));

jest.mock('../../../middleware/rate-limiter', () => ({
  messageValidationHook: (...args: any[]) => mockMessageValidationHook(...args),
}));

jest.mock('../../../routes/conversations/utils/access-control', () => (jest.requireActual('../../helpers/acces-conversation-double') as any)
  .doubleAccesConversation(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    (...args: any[]) => mockCanAccessConversation(...args)));

jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

jest.mock('../../../utils/response', () => ({
  sendSuccess: (...args: any[]) => mockSendSuccess(...args),
  sendBadRequest: (...args: any[]) => mockSendBadRequest(...args),
  sendForbidden: (...args: any[]) => mockSendForbidden(...args),
  sendNotFound: (...args: any[]) => mockSendNotFound(...args),
  sendInternalError: (...args: any[]) => mockSendInternalError(...args),
  sendError: (...args: any[]) => mockSendError(...args),
  sendConflict: (...args: any[]) => mockSendConflict(...args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn().mockReturnValue({
      error: jest.fn(),
      info: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
    }),
  },
}));

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: jest.fn((code: string, msg?: string) => {
    const e = new Error(msg || code) as any;
    e.code = code;
    return e;
  }),
  sendErrorResponse: jest.fn(),
}));

// `api-schemas` est PROLONGÉ (requireActual), jamais remplacé : un double partiel perd ce que le module gagne.
jest.mock('@meeshy/shared/types/api-schemas', () =>
  jest.requireActual('@meeshy/shared/types/api-schemas')
);

jest.mock('@meeshy/shared/types/socketio-events', () => ({
  SERVER_EVENTS: {
    MESSAGE_EDITED: 'message:edited',
    MESSAGE_DELETED: 'message:deleted',
    REACTION_ADDED: 'reaction:added',
    REACTION_REMOVED: 'reaction:removed',
    MENTION_CREATED: 'mention:created',
  },
  ROOMS: {
    conversation: (id: string) => `conversation:${id}`,
    user: (id: string) => `user:${id}`,
  },
}));

jest.mock('@meeshy/shared/utils/validation', () => {
  const { z } = require('zod');
  return {
    CommonSchemas: {
      messageContent: z.string().min(1),
      language: z.string().optional(),
    },
    ConversationSchemas: { create: {} },
    validateSchema: jest.fn((schema: any, data: any) => data),
  };
});

// ─── Imports ──────────────────────────────────────────────────────────────────

import { registerMessagesAdvancedRoutes } from '../../../routes/conversations/messages-advanced';

// ─── Constants ────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';
const OTHER_USER_ID = '507f1f77bcf86cd799439033';
const MSG_ID = '507f1f77bcf86cd799439044';
const PART_ID = '507f1f77bcf86cd799439055';

// ─── Factories ────────────────────────────────────────────────────────────────

const makePrisma = (): any => ({
  message: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
    update: jest.fn().mockResolvedValue({
      id: MSG_ID,
      content: 'hello',
      validatedMentions: [],
      translations: null,
      createdAt: new Date(),
    }),
    delete: jest.fn(),
  },
  participant: {
    findFirst: jest.fn().mockResolvedValue(null),
    findMany: jest.fn().mockResolvedValue([]),
  },
  mention: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
  user: {
    findUnique: jest.fn().mockResolvedValue(null),
  },
  conversation: {
    findUnique: jest.fn().mockResolvedValue(null),
    updateMany: jest.fn().mockResolvedValue({ count: 1 }),
  },
  trackingLink: {
    updateMany: jest.fn().mockResolvedValue({ count: 0 }),
  },
});

const createMockFastify = () => {
  const routes: Record<string, Record<string, Function>> = {};
  const mockEmit = jest.fn();
  const mockTo = jest.fn().mockReturnValue({ emit: mockEmit });
  const mockGetIO = jest.fn().mockReturnValue({ to: mockTo });
  const mockEnqueueOfflineMutation = jest.fn().mockResolvedValue(undefined);
  const mockGetManager = jest.fn().mockReturnValue({
    getIO: mockGetIO,
    enqueueOfflineMessageMutation: mockEnqueueOfflineMutation,
  });

  const fastify: any = {
    get: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['GET'] = routes['GET'] || {})[path] = handler;
    }),
    post: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['POST'] = routes['POST'] || {})[path] = handler;
    }),
    put: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['PUT'] = routes['PUT'] || {})[path] = handler;
    }),
    delete: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['DELETE'] = routes['DELETE'] || {})[path] = handler;
    }),
    patch: jest.fn((path: string, _opts: any, handler: Function) => {
      (routes['PATCH'] = routes['PATCH'] || {})[path] = handler;
    }),
    socketIOHandler: {
      getManager: mockGetManager,
    },
    notificationService: null,
    mentionService: null,
    translationService: {
      retranslateMessageAsync: jest.fn().mockResolvedValue(undefined),
    },
    _routes: routes,
    _mockTo: mockTo,
    _mockEmit: mockEmit,
    _mockGetManager: mockGetManager,
    _mockEnqueueOfflineMutation: mockEnqueueOfflineMutation,
  };
  return fastify;
};

const getHandler = (fastify: any, method: string, pathFragment: string): Function => {
  const methodRoutes = fastify._routes[method] || {};
  const key = Object.keys(methodRoutes).find(k => k.includes(pathFragment));
  if (!key) throw new Error(`No ${method} route matching '${pathFragment}'. Available: ${Object.keys(methodRoutes).join(', ')}`);
  return methodRoutes[key];
};

const makeRequest = (overrides: any = {}): any => ({
  authContext: {
    isAuthenticated: true,
    userId: USER_ID,
    registeredUser: { id: USER_ID, role: 'USER' },
    isAnonymous: false,
    sessionToken: null,
    participantId: PART_ID,
  },
  params: {},
  query: {},
  body: {},
  headers: {},
  ...overrides,
});

const makeReply = () => {
  const reply: any = {
    _body: null,
    status: jest.fn().mockReturnThis(),
    send: jest.fn((body?: any) => { if (body !== undefined) reply._body = body; return reply; }),
    code: jest.fn().mockReturnThis(),
    header: jest.fn().mockReturnThis(),
  };
  return reply;
};

const makeExistingMessage = (overrides: any = {}) => ({
  id: MSG_ID,
  conversationId: CONV_ID,
  content: 'Original content',
  createdAt: new Date(), // recent = within 24h
  senderId: PART_ID,
  deletedAt: null,
  isEdited: false,
  sender: {
    id: PART_ID,
    userId: USER_ID,
    role: 'USER',
  },
  attachments: [],
  ...overrides,
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerMessagesAdvancedRoutes', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let fastify: ReturnType<typeof createMockFastify>;
  const optionalAuth = jest.fn();
  const requiredAuth = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    fastify = createMockFastify();

    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
    mockGetOrCompute.mockResolvedValue([]);
    mockOnMessageEdited.mockResolvedValue(undefined);
    mockOnMessageDeleted.mockResolvedValue(undefined);
    mockTransformTranslationsToArray.mockReturnValue([]);
    mockProcessExplicitLinksInContent.mockResolvedValue({
      processedContent: 'processed content',
      trackingLinks: [],
    });
    mockCollectContentTrackingLinks.mockResolvedValue([]);

    registerMessagesAdvancedRoutes(fastify, prisma, requiredAuth);
  });

  describe('DELETE /conversations/:id/messages/:messageId', () => {
    const getDeleteMsgHandler = (f: any) =>
      getHandler(f, 'DELETE', '/conversations/:id/messages/:messageId');

    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue({ type: 'group', title: 'Les Amis' });
    });

    it('#11149 — un tiers sans motif reçoit 400 MODERATION_REASON_REQUIRED', async () => {
      prisma.message.findFirst.mockResolvedValue({ ...makeExistingMessage(), sender: { id: PART_ID, userId: OTHER_USER_ID }, attachments: [] });
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-mod', role: 'moderator', user: { role: 'USER' } });
      prisma.message.update.mockClear();
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'ok' } }), reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(reply, expect.any(String), { code: 'MODERATION_REASON_REQUIRED' });
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('#11149 — un tiers est refusé en conversation directe', async () => {
      prisma.conversation.findUnique.mockResolvedValue({ type: 'direct', title: null });
      prisma.message.findFirst.mockResolvedValue({ ...makeExistingMessage(), sender: { id: PART_ID, userId: OTHER_USER_ID }, attachments: [] });
      prisma.participant.findFirst.mockResolvedValue({ id: 'part-adm', role: 'admin', user: { role: 'ADMIN' } });
      prisma.message.update.mockClear();
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Hors charte' } }), reply);

      expect(mockSendForbidden).toHaveBeenCalled();
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    describe('#13142 — une conversation chiffrée de bout en bout', () => {
      const sealedRow = { isEncrypted: true, encryptionMode: 'e2ee' };

      beforeEach(() => {
        prisma.conversation.findUnique.mockResolvedValue({ type: 'direct', title: null, encryptionMode: 'e2ee' });
      });

      it("refuse 409 E2EE_SIGNAL_CHANNEL_REQUIRED la suppression en clair d'un message scellé de l'auteur, sans rien écrire", async () => {
        prisma.message.findFirst.mockResolvedValue({ ...makeExistingMessage(), ...sealedRow });
        prisma.message.update.mockClear();
        const reply = makeReply();

        await getDeleteMsgHandler(fastify)(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }), reply);

        expect(mockSendError).toHaveBeenCalledWith(reply, 409, expect.any(String), { code: 'E2EE_SIGNAL_CHANNEL_REQUIRED' });
        expect(prisma.message.update).not.toHaveBeenCalled();
      });

      it("supprime en clair un message écrit AVANT l'activation : le serveur le lisait déjà", async () => {
        prisma.message.findFirst.mockResolvedValue({ ...makeExistingMessage(), isEncrypted: false, encryptionMode: null });
        prisma.message.update.mockResolvedValue({});
        const reply = makeReply();

        await getDeleteMsgHandler(fastify)(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }), reply);

        expect(mockSendSuccess).toHaveBeenCalled();
        expect(mockSendError).not.toHaveBeenCalledWith(reply, 409, expect.anything(), expect.anything());
      });

      it("rend 403 et non 409 à qui n'a pas le droit de supprimer : le refus ne dit pas le régime", async () => {
        prisma.message.findFirst.mockResolvedValue({ ...makeExistingMessage(), ...sealedRow, sender: { id: PART_ID, userId: OTHER_USER_ID } });
        prisma.participant.findFirst.mockResolvedValue(null);
        const reply = makeReply();

        await getDeleteMsgHandler(fastify)(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }), reply);

        expect(mockSendForbidden).toHaveBeenCalled();
        expect(mockSendError).not.toHaveBeenCalled();
      });
    });

    it('returns 404 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns 404 when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found');
    });

    it('returns 403 when non-author has no elevated role', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('allows delete when non-author has ADMIN role', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue({
        user: { role: 'ADMIN' },
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // La QUATRIÈME audience d'une suppression. Le cycle 89 l'a câblée sur le
    // transport WS ; les deux transports REST — dont celui-ci, celui du SDK iOS
    // — laissaient la pastille compter un message que le lecteur voyait
    // pourtant disparaître, indéfiniment (`staleTime: Infinity` côté web).
    //
    // L'exclusion porte sur l'AUTEUR (`senderId`, ici `PART_ID`) et jamais sur
    // l'acteur (`USER_ID`) : un modérateur qui retire le message d'un autre est
    // lui-même un destinataire dont la pastille doit bouger. Le type de
    // `broadcastMessageMutation` impose de passer UNE identité ; seul ce test
    // dit LAQUELLE.
    it('repousse la pastille de non-lus, en excluant l\'auteur et non l\'acteur', async () => {
      const emitUnread = jest.fn().mockResolvedValue(undefined);
      fastify.socketIOHandler.getManager.mockReturnValue({
        getIO: jest.fn().mockReturnValue({ to: jest.fn().mockReturnValue({ emit: jest.fn() }) }),
        enqueueOfflineMessageMutation: jest.fn().mockResolvedValue(undefined),
        emitUnreadCountsToRecipients: emitUnread,
      });
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({});

      await getDeleteMsgHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } }),
        makeReply()
      );

      expect(emitUnread).toHaveBeenCalledWith({
        conversationId: CONV_ID,
        senderId: PART_ID,
      });
    });

    // Cette route ne recalculait PAS `lastMessageAt`, alors que les deux autres
    // chemins de suppression le faisaient mot pour mot. C'est justement la
    // route d'iOS et de la vue web : supprimer le dernier message y laissait la
    // liste des conversations triée sur un message devenu invisible.
    it('recalcule lastMessageAt sur le dernier message vivant, sous garde CAS', async () => {
      const convLastMessageAt = new Date('2026-08-01T00:00:00Z');
      const survivorCreatedAt = new Date('2026-07-30T00:00:00Z');
      prisma.message.findFirst
        .mockResolvedValueOnce(makeExistingMessage())
        .mockResolvedValueOnce({ createdAt: survivorCreatedAt });
      prisma.conversation.findUnique.mockResolvedValue({
        lastMessageAt: convLastMessageAt,
        createdAt: new Date('2026-01-01T00:00:00Z'),
      });
      prisma.message.update.mockResolvedValue({});

      await getDeleteMsgHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } }),
        makeReply()
      );

      expect(prisma.conversation.updateMany).toHaveBeenCalledWith({
        where: { id: CONV_ID, lastMessageAt: convLastMessageAt },
        data: { lastMessageAt: survivorCreatedAt },
      });
    });

    it('désactive le /l/<token> que plus aucun message vivant ne porte', async () => {
      prisma.message.findRaw = jest.fn().mockResolvedValue([]);
      prisma.message.findFirst.mockResolvedValueOnce(
        makeExistingMessage({ content: 'regarde ça m+aB3xY9', metadata: null })
      );
      prisma.message.update.mockResolvedValue({});

      await getDeleteMsgHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } }),
        makeReply()
      );

      expect(prisma.trackingLink.updateMany).toHaveBeenCalledWith({
        where: {
          token: { in: ['aB3xY9'] },
          targetType: 'EXTERNAL',
          conversationId: CONV_ID,
          isActive: true,
        },
        data: { isActive: false },
      });
    });

    it("ne coupe PAS le lien qu'un autre message de la conversation affiche encore", async () => {
      // Une ligne `TrackingLink` est PARTAGÉE entre messages d'une même
      // conversation (`findExistingTrackingLink` la réutilise) : couper sur la
      // seule foi de `messageId` casserait un message vivant.
      prisma.message.findRaw = jest.fn().mockResolvedValue([
        { content: 'je remets le lien m+aB3xY9', metadata: null },
      ]);
      prisma.message.findFirst.mockResolvedValueOnce(
        makeExistingMessage({ content: 'regarde ça m+aB3xY9', metadata: null })
      );
      prisma.message.update.mockResolvedValue({});

      await getDeleteMsgHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } }),
        makeReply()
      );

      expect(prisma.trackingLink.updateMany).not.toHaveBeenCalled();
    });

    // C'est la route qu'iOS (`MeeshySDK/Services/MessageService.swift:138`) et
    // le web (`services/message.service.ts:75`) emploient pour supprimer. Sa
    // copie de la règle lisait `membership.user.role` — le rôle GLOBAL — alors
    // que son commentaire annonçait « modérateurs/admins de CETTE
    // conversation ». Un admin de conversation qui n'est qu'un `USER` global
    // supprimait donc depuis Android et depuis le composer web, et recevait 403
    // depuis son iPhone : même personne, même message, trois réponses.
    it('admet l\'admin de CONVERSATION qui n\'est qu\'un USER global', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue({ role: 'admin', user: { role: 'USER' } });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      expect(mockSendForbidden).not.toHaveBeenCalled();
    });

    it('admet le modérateur de CONVERSATION qui n\'est qu\'un USER global', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue({ role: 'moderator', user: { role: 'USER' } });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('admet le BIGBOSS global qui n\'est PAS participant — parité avec le socket et Android', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue(null);
      prisma.user.findUnique.mockResolvedValue({ role: 'BIGBOSS' });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('refuse le simple membre', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue({ role: 'member', user: { role: 'USER' } });

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('allows delete when user is author', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('deletes attachments before soft-deleting message', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [
          { id: 'attach-1', mimeType: 'image/jpeg' },
          { id: 'attach-2', mimeType: 'audio/mp3' },
        ],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockDeleteAttachment).toHaveBeenCalledTimes(2);
      expect(mockDeleteAttachment).toHaveBeenCalledWith('attach-1');
      expect(mockDeleteAttachment).toHaveBeenCalledWith('attach-2');
    });

    // Jumelle exacte de la garde de `DELETE /messages/:messageId`
    // (`messages.test.ts`), et c'est le point : les deux routes REST portaient
    // la MÊME suppression en deux écritures, quand le handler socket la porte
    // en une seule et l'annonce (« atomically clear translations and set
    // deletedAt in one write »).
    //
    // Séparées, elles laissaient la ligne VIVANTE et sans traductions entre les
    // deux. Le prix n'est pas la fenêtre mais son échec : la seconde écriture
    // ratée fige cet état DÉFINITIVEMENT — « aucun chemin ne retente une
    // traduction absente » (`MessageTranslationService`).
    it('committe la suppression en UNE écriture, traductions comprises', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.update.mockClear();

      await getDeleteMsgHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } }),
        makeReply()
      );

      const writes = prisma.message.update.mock.calls;
      expect(writes).toHaveLength(1);
      expect(writes[0][0].data).toEqual(
        expect.objectContaining({ translations: null, deletedAt: expect.any(Date) })
      );
    });

    // Le même fait énoncé comme une INTERDICTION d'état plutôt qu'un compte
    // d'écritures : aucun état committé ne porte « vivante ET sans traductions ».
    // Un refactor qui repasserait à deux écritures dans l'ordre inverse
    // satisferait encore la garde ci-dessus sur sa première écriture.
    it('ne committe jamais un état « vivante et sans traductions »', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});
      prisma.message.update.mockClear();

      await getDeleteMsgHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } }),
        makeReply()
      );

      const row: Record<string, unknown> = { ...makeExistingMessage() };
      const forbidden = prisma.message.update.mock.calls.filter((call: any[]) => {
        Object.assign(row, call[0].data);
        return row.translations === null && row.deletedAt == null;
      });
      expect(forbidden).toHaveLength(0);
    });

    it('continues deleting other attachments when one fails', async () => {
      mockDeleteAttachment
        .mockRejectedValueOnce(new Error('delete error'))
        .mockResolvedValueOnce(undefined);

      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [
          { id: 'attach-1', mimeType: 'image/jpeg' },
          { id: 'attach-2', mimeType: 'audio/mp3' },
        ],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockDeleteAttachment).toHaveBeenCalledTimes(2);
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('broadcasts MESSAGE_DELETED via Socket.IO', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(fastify._mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith('message:deleted', expect.objectContaining({ messageId: MSG_ID }));
    });

    // This is the route the iOS SDK deletes through (`MessageService.swift`).
    // Same offline-replay guarantee the socket delete path gives: without it a
    // deleted message stays visible forever on any participant offline at the
    // moment of deletion.
    it('enqueues the deletion for offline participants', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(fastify._mockEnqueueOfflineMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONV_ID,
          actorUserId: USER_ID,
          eventType: 'deleted',
          messageId: MSG_ID,
          payload: { messageId: MSG_ID, conversationId: CONV_ID },
        })
      );
    });

    it('keys onMessageDeleted by the message sender (registered author)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalled();
      expect(mockOnMessageDeleted.mock.calls[0][2]).toBe(USER_ID);
    });

    it('keys onMessageDeleted by the Participant.id when an admin deletes an anonymous message', async () => {
      // Anonymous senders have sender.userId === null; the participantStats map is
      // keyed by Participant.id for them (matching the create/recompute contract).
      // A moderator/admin can delete such a message, so the sender key must fall
      // back to senderId, not '' (which would leave the participant breakdown stale).
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        senderId: PART_ID,
        sender: { id: PART_ID, userId: null },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue({ user: { role: 'ADMIN' } });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalled();
      expect(mockOnMessageDeleted.mock.calls[0][2]).toBe(PART_ID);
    });

    it('calls sendInternalError on outer error', async () => {
      prisma.message.findFirst.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  describe('DELETE message - additional branch coverage', () => {
    const getDeleteMsgHandler = (f: any) =>
      getHandler(f, 'DELETE', '/conversations/:id/messages/:messageId');

    beforeEach(() => {
      prisma.conversation.findUnique.mockResolvedValue({ type: 'group', title: 'Les Amis' });
    });

    it('allows delete by BIGBOSS role', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: OTHER_USER_ID },
        attachments: [],
      });
      prisma.participant.findFirst.mockResolvedValue({
        user: { role: 'BIGBOSS' },
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('falls back to senderId (participant key) when sender.userId is absent', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: null, // null sender → isAuthor = false → check participant
        attachments: [],
      });
      // Let the participant lookup succeed so canDelete=true
      prisma.participant.findFirst.mockResolvedValue({ user: { role: 'BIGBOSS' } });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(),
        CONV_ID,
        PART_ID, // sender?.userId undefined → ?? senderId (the participantStats key)
        expect.any(String),
        [],
        expect.anything()
      );
    });

    it('handles null content using ?? empty string', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: null,
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(),
        CONV_ID,
        USER_ID,
        '', // null ?? '' = ''
        [],
        expect.anything()
      );
    });

    it('handles null attachments using ?? []', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: { id: PART_ID, userId: USER_ID },
        attachments: null, // null attachments
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(),
        CONV_ID,
        USER_ID,
        'hello',
        [], // null ?? [] = []
        expect.anything()
      );
    });

    it('handles null mimeType in attachment using ?? empty string', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [{ id: 'a1', mimeType: null }], // null mimeType → ''
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(), CONV_ID, USER_ID, 'hello',
        ['file'], // '' doesn't start with any prefix → 'file'
        expect.anything()
      );
    });

    it('video mimeType categorized as video', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'hello',
        createdAt: new Date(),
        senderId: PART_ID,
        deletedAt: null,
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [
          { id: 'a1', mimeType: 'video/mp4' },
          { id: 'a2', mimeType: 'application/pdf' }, // → 'file'
        ],
      });
      prisma.message.update.mockResolvedValue({});

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalledWith(
        expect.anything(), CONV_ID, USER_ID, 'hello',
        ['video', 'file'],
        expect.anything()
      );
    });

    it('socketIOManager null in delete - no broadcast but success', async () => {
      prisma.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      prisma.message.update.mockResolvedValue({});
      fastify.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { reason: 'Propos hors charte' } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });
});
