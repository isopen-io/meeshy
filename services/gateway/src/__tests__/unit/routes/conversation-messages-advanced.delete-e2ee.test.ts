/**
 * DELETE /conversations/:id/messages/:messageId dans une conversation chiffrée de
 * bout en bout (#13142, #13060) : la suppression pour tous d'un message scellé
 * part en signal chiffré, la route en clair la refuse en 409 APRÈS le contrôle
 * du droit ; un message que le serveur lit (écrit avant l'activation, ou ligne
 * scellée d'une conversation qui n'est plus en bout en bout) s'y supprime encore.
 * Même montage de doubles que `conversation-messages-advanced.delete.test.ts`.
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

      it("supprime en clair une ligne scellée d'une conversation qui n'est plus en bout en bout : aucun signal ne la supprimerait", async () => {
        prisma.conversation.findUnique.mockResolvedValue({ type: 'direct', title: null, encryptionMode: 'server' });
        prisma.message.findFirst.mockResolvedValue({ ...makeExistingMessage(), ...sealedRow });
        prisma.message.update.mockResolvedValue({});
        const reply = makeReply();

        await getDeleteMsgHandler(fastify)(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }), reply);

        expect(mockSendSuccess).toHaveBeenCalled();
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
  });
});
