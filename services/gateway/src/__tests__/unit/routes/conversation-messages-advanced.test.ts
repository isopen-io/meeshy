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

jest.mock('../../../routes/conversations/utils/access-control', () => ({
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

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

// #4188/#4190 — le double de `ReactionService` a été RETIRÉ avec les deux
// portes imbriquées : `messages-advanced.ts` n'importe plus ce service (seule
// une mention en prose subsiste, au-dessus du GET). Un double PARTIEL d'un
// module que le sujet n'importe pas n'est pas neutre — c'est un piège armé : le
// jour où quelqu'un réintroduit l'import, ce triplet de méthodes le servirait à
// la place du vrai, sans qu'aucun témoin ne rougisse. La couverture des
// réactions vit dans `reactions-routes.test.ts`, `reactions-flat-door-policy.test.ts`
// et `unit/services/ReactionService.test.ts`.

jest.mock('@meeshy/shared/utils/errors', () => ({
  createError: jest.fn((code: string, msg?: string) => {
    const e = new Error(msg || code) as any;
    e.code = code;
    return e;
  }),
  sendErrorResponse: jest.fn(),
}));

// `api-schemas` n'est plus REMPLACÉ, il est PROLONGÉ.
//
// Ce double listait deux schémas à la main. Un double PARTIEL d'un module perd
// en silence tout ce que le module GAGNE : quand `routes/conversations/
// messages-advanced.ts` s'est mis à composer `messageResponseSchema` au
// chargement (cycle 93), celui-ci est revenu `undefined` et la suite entière —
// 152 témoins — a cessé de se CHARGER (`Cannot read properties of undefined`).
//
// C'est la deuxième fois en deux cycles (voir `voice-translation.test.ts`,
// cycle 91). Le remède est le même : `requireActual`. Les vrais schémas ne
// coûtent rien ici — ce fichier mocke `sendSuccess`, donc rien n'y traverse le
// sérialiseur de toute façon (dette nommée au journal du cycle 93 §6).
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
import { MessageReadStatusService } from '../../../services/MessageReadStatusService';
import { clearPrivacyPreferencesCache } from '../../../services/preferences/privacy-cache';
import { ConflictError } from '../../../errors/custom-errors';
import { REACTION_LIMIT_REACHED_MESSAGE } from '@meeshy/shared/utils/reaction-limit';

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
  // Lues par `MessageReadStatusService`, à qui `GET /conversations/:id/status`
  // délègue désormais son résumé d'accusés et son filtre d'opt-out.
  conversationReadCursor: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  messageStatusEntry: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  userPreferences: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  userPreference: {
    findMany: jest.fn().mockResolvedValue([]),
  },
  mention: {
    findMany: jest.fn().mockResolvedValue([]),
    deleteMany: jest.fn().mockResolvedValue({}),
  },
  reaction: {
    findMany: jest.fn().mockResolvedValue([]),
    // #4165 : `GET /conversations/:id/reactions` compte le VRAI total à part
    // de la page (`.count()`), en plus du `.findMany` déjà mocké — sans ce
    // double, un test Prisma réel appellerait une méthode inexistante.
    count: jest.fn().mockResolvedValue(0),
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

const makeTranslationService = (): any => ({
  retranslateMessageAsync: jest.fn().mockResolvedValue(undefined),
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('registerMessagesAdvancedRoutes', () => {
  let prisma: ReturnType<typeof makePrisma>;
  let fastify: ReturnType<typeof createMockFastify>;
  let translationService: any;
  const optionalAuth = jest.fn();
  const requiredAuth = jest.fn();

  beforeEach(() => {
    jest.clearAllMocks();
    prisma = makePrisma();
    fastify = createMockFastify();
    translationService = makeTranslationService();

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

    registerMessagesAdvancedRoutes(fastify, prisma, translationService, optionalAuth, requiredAuth);
  });

  // ─── PUT /conversations/:id/messages/:messageId ────────────────────────────

  describe('PUT /conversations/:id/messages/:messageId', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('returns 404 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns 404 when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Message not found');
    });

    /**
     * Le conteneur terminé, traduit par CE transport.
     *
     * L'unité rend `conversation-closed` ; sans branche propre, le refus
     * retombait dans le `else` et sortait en **403 « vous n'êtes pas autorisé »**
     * — un motif d'autorisation pour un état qui n'en est pas un. 410 dit ce
     * qu'il en est : plus personne, plus jamais.
     */
    it.each([
      ['closedAt posé', { isActive: true, closedAt: new Date() }],
      ['isActive: false seul', { isActive: false, closedAt: null }],
    ])('returns 410 when the conversation is closed (%s)', async (_label, conversation) => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({ conversation }));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendError).toHaveBeenCalledWith(reply, 410, 'Cette conversation est terminée');
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('returns 403 when author exceeds 24h limit without special role', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000); // 25 hours ago
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        createdAt: oldDate,
        // Realistic Participant.role (never a global-role constant).
        sender: { id: PART_ID, userId: USER_ID, role: 'member' },
      }));
      // Bypass keys on the author's GLOBAL role (User.role), not the participant role.
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('24-hour limit')
      );
    });

    it('allows edit when author is a global MODERATOR and 24h limit exceeded', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        createdAt: oldDate,
        // Realistic: merely a "member" of this conversation; privilege is global.
        sender: { id: PART_ID, userId: USER_ID, role: 'member' },
      }));
      prisma.user.findUnique.mockResolvedValue({ role: 'MODERATOR' });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'New content',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('allows edit when author is a global ADMIN and 24h limit exceeded', async () => {
      const oldDate = new Date(Date.now() - 25 * 60 * 60 * 1000);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        createdAt: oldDate,
        sender: { id: PART_ID, userId: USER_ID, role: 'member' },
      }));
      prisma.user.findUnique.mockResolvedValue({ role: 'ADMIN' });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'New content',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('returns 403 when non-author has no elevated membership', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        sender: { id: PART_ID, userId: OTHER_USER_ID, role: 'USER' },
      }));
      prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('allows edit by ADMIN membership (non-author)', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        sender: { id: PART_ID, userId: OTHER_USER_ID, role: 'USER' },
      }));
      prisma.participant.findFirst.mockResolvedValue({
        user: { role: 'ADMIN' },
      });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'New content',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
    });

    it('keys onMessageEdited by the message sender, not the editing moderator', async () => {
      // An ADMIN/MODERATOR may edit another user's message. The per-participant
      // stats delta must land on the original sender's key, not the editor's.
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        senderId: PART_ID,
        sender: { id: PART_ID, userId: OTHER_USER_ID, role: 'USER' },
      }));
      prisma.participant.findFirst.mockResolvedValue({ user: { role: 'ADMIN' } });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'New content',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockOnMessageEdited).toHaveBeenCalled();
      expect(mockOnMessageEdited.mock.calls[0][2]).toBe(OTHER_USER_ID);
    });

    it('returns 400 when content is whitespace only', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: '   ' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('empty')
      );
    });

    it('continues when trackingLinkService throws', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      mockProcessExplicitLinksInContent.mockRejectedValue(new Error('link error'));
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // Le mapping des URLs BRUTES (`metadata.trackingLinks`, lu par le client
    // pour router le clic vers `/l/<token>`) n'était écrit qu'à la CRÉATION.
    // Ajouter une URL par édition la laissait intraçable pour toujours.
    it('mints and persists the raw-URL mapping for a URL added by the edit', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      mockCollectContentTrackingLinks.mockResolvedValue([{ url: 'https://b.com', token: 'tokB' }]);
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'processed content', validatedMentions: [], translations: null });

      // La syntaxe explicite est ce qui déclenche la RÉÉCRITURE : sans elle, la
      // réécriture court-circuite (aucune requête) et le contenu ressort
      // identique. Ce test-ci porte sur l'ordre des deux moitiés, il lui faut
      // donc un texte réellement réécrit ; le cas de l'URL brute seule est
      // couvert par le test suivant.
      await getEditHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'voir [[https://b.com]]' } }),
        makeReply()
      );

      // Collecté sur le contenu RÉÉCRIT, jamais sur l'entrée : une URL qui vient
      // de devenir `m+<token>` recevrait sinon un second token.
      expect(mockCollectContentTrackingLinks).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'processed content' })
      );
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: { trackingLinks: [{ url: 'https://b.com', token: 'tokB' }] } }),
        })
      );
    });

    // Le cas NOMINAL de ce correctif, et celui que la réécriture ne voit pas :
    // une URL BRUTE ne porte aucune syntaxe explicite, donc `processExplicitLinks`
    // court-circuite. La collecte, elle, ne doit PAS court-circuiter — sinon
    // l'URL ajoutée par édition reste intraçable, ce qui était tout le défaut.
    it('mints the mapping for a raw URL even though nothing gets rewritten', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      mockCollectContentTrackingLinks.mockResolvedValue([{ url: 'https://b.com', token: 'tokB' }]);
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'voir https://b.com', validatedMentions: [], translations: null });

      await getEditHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'voir https://b.com' } }),
        makeReply()
      );

      expect(mockProcessExplicitLinksInContent).not.toHaveBeenCalled();
      expect(mockCollectContentTrackingLinks).toHaveBeenCalledWith(
        expect.objectContaining({ content: 'voir https://b.com' })
      );
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ metadata: { trackingLinks: [{ url: 'https://b.com', token: 'tokB' }] } }),
        })
      );
    });

    // `metadata` est un blob PARTAGÉ : `postReplyTo` y range un snapshot GELÉ,
    // irrécupérable une fois la story expirée. L'écraser perdrait la citation.
    it('preserves the neighbours of the metadata blob while rewriting the mapping', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        metadata: { postReplyTo: { id: 'post-1' }, trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] },
      }));
      mockCollectContentTrackingLinks.mockResolvedValue([{ url: 'https://b.com', token: 'tokB' }]);
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'processed content', validatedMentions: [], translations: null });

      await getEditHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'voir https://b.com' } }),
        makeReply()
      );

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            metadata: { postReplyTo: { id: 'post-1' }, trackingLinks: [{ url: 'https://b.com', token: 'tokB' }] },
          }),
        })
      );
    });

    // Vide ÉTABLI : le texte ne porte plus d'URL, le token de celle qui a
    // disparu ne doit pas lui survivre.
    it('clears the mapping when the edited text no longer carries a URL', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        metadata: { trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] },
      }));
      mockCollectContentTrackingLinks.mockResolvedValue([]);
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'processed content', validatedMentions: [], translations: null });

      await getEditHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'plus rien' } }),
        makeReply()
      );

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ metadata: null }) })
      );
    });

    // Vide parce que RIEN n'a pu être établi : la base garde ce qu'elle a. Un
    // lien de tracking effacé ne revient jamais — personne ne relit le texte
    // après coup — et le clic part alors sans jamais être compté.
    it('leaves the stored mapping untouched when link processing fails', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        metadata: { trackingLinks: [{ url: 'https://a.com', token: 'tokA' }] },
      }));
      mockProcessExplicitLinksInContent.mockRejectedValue(new Error('link error'));
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'voir [[https://a.com]]', validatedMentions: [], translations: null });

      // Syntaxe explicite : c'est elle qui fait appeler le service, donc la
      // seule façon d'atteindre la panne qu'on veut éprouver.
      await getEditHandler(fastify)(
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'voir [[https://a.com]]' } }),
        makeReply()
      );

      const updateArg = (prisma.message.update as any).mock.calls[0][0];
      expect(updateArg.data).not.toHaveProperty('metadata');
      // Le texte de l'utilisateur, lui, est persisté : son édition n'est pas
      // annulée par une panne de tracking.
      expect(updateArg.data.content).toBe('voir [[https://a.com]]');
    });

    it('processes mentions when mentionService is available', async () => {
      const extractMock = jest.fn().mockReturnValue(['alice']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice', username: 'alice' }]]));
      const validateMentionPermissions = jest.fn().mockResolvedValue({
        isValid: true,
        validUserIds: ['user-alice'],
      });
      const createMentions = jest.fn().mockResolvedValue(undefined);
      fastify.mentionService = {
        extractMentionsWithParticipants: extractMock,
        resolveUsernames,
        validateMentionPermissions,
        createMentions,
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Hello @alice',
        validatedMentions: ['alice'],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello @alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(extractMock).toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // Le chemin d'édition extrayait les handles BRUTS (`extractMentions`) là où
    // la création extrait avec la liste des participants
    // (`extractMentionsWithParticipants`, qui résout aussi `@Display Name`).
    // Éditer un message contenant `@John Doe` DÉTRUISAIT donc la mention que la
    // création avait validée : ligne `Mention` supprimée, champ remis à `[]`,
    // alors que rien n'avait changé pour elle.
    it('keeps a display-name mention alive across an edit', async () => {
      const extractWithParticipants = jest.fn().mockReturnValue(['john']);
      fastify.mentionService = {
        extractMentionsWithParticipants: extractWithParticipants,
        resolveUsernames: jest.fn().mockResolvedValue(new Map([['john', { id: 'user-john', username: 'john' }]])),
        validateMentionPermissions: jest.fn().mockResolvedValue({ validUserIds: ['user-john'] }),
        createMentions: jest.fn().mockResolvedValue(undefined),
      };
      prisma.participant.findMany.mockResolvedValue([
        { userId: 'user-john', displayName: 'John Doe', user: { id: 'user-john', username: 'john', displayName: 'John Doe' } },
      ]);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());

      // Le texte porte une syntaxe tra\u00e7able : sans elle, le traitement des
      // liens court-circuite (il ne peut rien r\u00e9\u00e9crire) et le contenu extrait
      // serait trivialement le contenu d'entr\u00e9e \u2014 l'assertion ne prouverait
      // plus le couplage qu'elle vise.
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Salut @John Doe, corrig\u00e9 <https://example.com>' },
      });

      await getEditHandler(fastify)(req, makeReply());

      // La r\u00e9solution porte sur le contenu APR\u00c8S traitement des liens de
      // suivi, comme sur le chemin de cr\u00e9ation : c'est ce texte-l\u00e0 qui est
      // persist\u00e9 et affich\u00e9.
      expect(extractWithParticipants).toHaveBeenCalledWith(
        'processed content',
        [{ userId: 'user-john', username: 'john', displayName: 'John Doe' }]
      );
      // Réconciliation : John n'avait pas de ligne, il en gagne une ; personne
      // ne part, donc aucune suppression. Purger en bloc lui aurait donné un
      // `mentionedAt` neuf à chaque édition — l'axe de tri de l'inbox.
      expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
      expect(fastify.mentionService.createMentions).toHaveBeenCalledWith(MSG_ID, ['user-john']);
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ validatedMentions: ['john'] }),
        })
      );
    });

    // `message:edited` ne fan qu'au salon de la conversation : quelqu'un que
    // l'\u00e9dition vient de nommer n'y est pas forc\u00e9ment. C'est `mention:created`
    // qui porte la nouvelle \u2014 et cette route, transport d'\u00e9dition PRIMAIRE du
    // client iOS (`PUT /messages/:id`), n'en \u00e9mettait aucun.
    it('emits mention:created to the personal room of a newly mentioned user', async () => {
      fastify.mentionService = {
        extractMentionsWithParticipants: jest.fn().mockReturnValue(['bob']),
        resolveUsernames: jest.fn().mockResolvedValue(new Map([['bob', { id: 'user-bob', username: 'bob' }]])),
        validateMentionPermissions: jest.fn().mockResolvedValue({ validUserIds: ['user-bob'] }),
        createMentions: jest.fn().mockResolvedValue(undefined),
      };
      prisma.mention.findMany.mockResolvedValue([]);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Salut @bob' },
      });

      await getEditHandler(fastify)(req, makeReply());

      expect(fastify._mockTo).toHaveBeenCalledWith('user:user-bob');
      const mention = fastify._mockEmit.mock.calls.find((call: any[]) => call[0] === 'mention:created');
      expect(mention?.[1]).toEqual(expect.objectContaining({
        messageId: MSG_ID,
        conversationId: CONV_ID,
        mentionedUserId: 'user-bob',
        senderId: USER_ID,
        content: 'Salut @bob',
      }));
    });

    // L'inverse : une mention retir\u00e9e du texte doit sortir du champ ET de
    // l'inbox `/mentions` de celui qu'elle nommait.
    it('clears the mention set when the edited content drops every mention', async () => {
      fastify.mentionService = {
        extractMentionsWithParticipants: jest.fn().mockReturnValue([]),
        resolveUsernames: jest.fn(),
        validateMentionPermissions: jest.fn(),
        createMentions: jest.fn(),
      };
      // Alice était mentionnée avant l'édition : c'est elle qui part.
      prisma.mention.findMany.mockResolvedValue([{ mentionedUserId: 'user-alice' }]);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'plus de mention' },
      });

      await getEditHandler(fastify)(req, makeReply());

      expect(prisma.mention.deleteMany).toHaveBeenCalledWith({
        where: { messageId: MSG_ID, mentionedUserId: { in: ['user-alice'] } },
      });
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ validatedMentions: [] }),
        })
      );
      // Lot d'entrants vide : aucune ligne créée. La garde du lot vide
      // appartient à `createMentions`, qui la porte déjà.
      expect(fastify.mentionService.createMentions).toHaveBeenCalledWith(MSG_ID, []);
    });

    // Le bloc remplacé notifiait TOUS les mentionnés à chaque édition : corriger
    // une faute de frappe dans « salut @alice » repoussait un push à Alice,
    // déjà nommée au premier envoi — dix corrections, dix pushes.
    it('does not re-notify a mention that was already there', async () => {
      fastify.mentionService = {
        extractMentionsWithParticipants: jest.fn().mockReturnValue(['alice']),
        resolveUsernames: jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice', username: 'alice' }]])),
        validateMentionPermissions: jest.fn().mockResolvedValue({ validUserIds: ['user-alice'] }),
        createMentions: jest.fn().mockResolvedValue(undefined),
      };
      const createBatchMock = jest.fn().mockResolvedValue(1);
      fastify.notificationService = { createMentionNotificationsBatch: createBatchMock };

      // Alice était DÉJÀ mentionnée avant l'édition.
      prisma.mention.findMany.mockResolvedValue([{ mentionedUserId: 'user-alice' }]);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Salut @alice, typo corrigee' },
      });

      await getEditHandler(fastify)(req, makeReply());

      expect(createBatchMock).not.toHaveBeenCalled();
      // Sa ligne `Mention` n'est ni supprimée ni recréée : `mentionedAt` tient
      // l'ordre de l'inbox, une correction de frappe ne doit pas l'y remonter.
      expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
      expect(fastify.mentionService.createMentions).toHaveBeenCalledWith(MSG_ID, []);
    });

    // Ce test verrouillait le défaut : sans service de mentions câblé, CHAQUE
    // édition vidait `validatedMentions` et supprimait les lignes `Mention`
    // d'un message dont le texte nommait toujours quelqu'un. Rien ne relit le
    // texte après coup — la mention ne revenait jamais.
    it('preserves mentions when mentionService unavailable', async () => {
      fastify.mentionService = null;
      prisma.mention.findMany.mockResolvedValue([{ mentionedUserId: 'user-alice' }]);
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Hello @alice',
        validatedMentions: ['alice'],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello @alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(prisma.mention.deleteMany).not.toHaveBeenCalled();
      expect(prisma.message.update).not.toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ validatedMentions: [] }),
        })
      );
      // Préserver en base ne suffit pas : recopier le résultat vide de l'unité
      // dans la réponse et la diffusion socket rejouerait l'effacement au
      // niveau du PAYLOAD, et le web le cacherait (`staleTime: Infinity`).
      expect(mockSendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ validatedMentions: ['alice'] })
      );
    });

    it('canonicalizes a region-tagged originalLanguage (fr-FR) to its base code (fr) before persisting', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello', originalLanguage: 'fr-FR' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originalLanguage: 'fr' }),
        })
      );
    });

    it('keeps an irreducible originalLanguage claim verbatim on edit', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello', originalLanguage: 'bas' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({ originalLanguage: 'bas' }),
        })
      );
    });

    // `originalLanguage` est OPTIONNEL dans le corps — la vue d'édition web
    // n'en envoie un que parce qu'elle porte un sélecteur de langue. Le défaut
    // `= 'fr'` faisait qu'une omission RÉÉTIQUETAIT le message en français :
    // un message anglais devenait français en base, et la retraduction repartait
    // de « fr » comme langue source. Les trois autres transports d'édition ne
    // touchent jamais cette colonne. Omettre = ne rien affirmer sur la langue.
    it('leaves originalLanguage untouched when the body omits it', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({ originalLanguage: 'en' }));
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });

      await getEditHandler(fastify)(req, makeReply());

      const editWrite = prisma.message.update.mock.calls
        .map((c: any[]) => c[0])
        .find((arg: any) => arg?.data?.isEdited === true);
      expect(editWrite).toBeDefined();
      expect(editWrite.data).not.toHaveProperty('originalLanguage');
    });

    // Et la retraduction doit repartir de la langue STOCKÉE, pas du défaut :
    // « fr » comme langue source d'un texte anglais produit du charabia dans
    // toutes les langues cibles de la conversation.
    it('retranslates from the stored language when the body omits it', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({ originalLanguage: 'en' }));
      const retranslate = jest.fn<any>().mockResolvedValue(undefined);
      fastify.translationService = { retranslateMessageAsync: retranslate };
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });

      await getEditHandler(fastify)(req, makeReply());

      expect(retranslate).toHaveBeenCalledWith(
        MSG_ID,
        expect.objectContaining({ originalLanguage: 'en' })
      );
    });

    // Garde de concurrence optimiste, jumelle de celle que portent déjà les
    // trois autres transports d'édition : une suppression concurrente entre la
    // lecture et l'écriture ferait sinon RESSUSCITER la ligne avec un contenu
    // neuf, et `message:edited` partirait vers des clients qui l'ont retirée.
    it('only writes while the message is still undeleted', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });

      await getEditHandler(fastify)(req, makeReply());

      const editWrite = prisma.message.update.mock.calls
        .map((c: any[]) => c[0])
        .find((arg: any) => arg?.data?.isEdited === true);
      expect(editWrite.where).toEqual({ id: MSG_ID, deletedAt: null });
    });

    it('answers 404 — not 500 — when the concurrency guard bites', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      const p2025 = Object.assign(new Error('Record to update not found.'), { code: 'P2025' });
      prisma.message.update.mockRejectedValue(p2025);

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });

      await getEditHandler(fastify)(req, makeReply());

      expect(mockSendNotFound).toHaveBeenCalled();
      expect(mockSendInternalError).not.toHaveBeenCalled();
    });

    it('continues when retranslation fails', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      fastify.translationService = {
        retranslateMessageAsync: jest.fn().mockRejectedValue(new Error('translation error')),
      };
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('broadcasts MESSAGE_EDITED via Socket.IO on happy path', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(fastify._mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith('message:edited', expect.any(Object));
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // The live room emit above only reaches participants currently connected.
    // The socket transport (`MessageHandler.handleMessageEdit`) additionally
    // queues the edit for OFFLINE participants so it replays on reconnect;
    // without the same call here, an edit made over REST is lost forever for
    // anyone offline at that moment.
    it('enqueues the edit for offline participants', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(fastify._mockEnqueueOfflineMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONV_ID,
          actorUserId: USER_ID,
          eventType: 'edited',
          messageId: MSG_ID,
          payload: expect.objectContaining({ id: MSG_ID, conversationId: CONV_ID }),
        })
      );
    });

    it('continues when socket broadcast throws', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });
      fastify.socketIOHandler.getManager.mockReturnValue({
        getIO: jest.fn().mockReturnValue({
          to: jest.fn().mockImplementation(() => { throw new Error('socket error'); }),
        }),
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('calls sendInternalError on outer DB error', async () => {
      prisma.message.findFirst.mockRejectedValue(new Error('DB down'));

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    it('processes mentions with no valid usernames (empty mentions)', async () => {
      const extractMock = jest.fn().mockReturnValue([]);
      fastify.mentionService = {
        extractMentions: extractMock,
        resolveUsernames: jest.fn(),
        validateMentionPermissions: jest.fn(),
        createMentions: jest.fn(),
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('sends mention notifications when notificationService available', async () => {
      const extractMock = jest.fn().mockReturnValue(['alice']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice', username: 'alice' }]]));
      const validateMentionPermissions = jest.fn().mockResolvedValue({
        isValid: true,
        validUserIds: ['user-alice'],
      });
      const createMentions = jest.fn().mockResolvedValue(undefined);
      fastify.mentionService = { extractMentionsWithParticipants: extractMock, resolveUsernames, validateMentionPermissions, createMentions };

      const createBatchMock = jest.fn().mockResolvedValue(1);
      fastify.notificationService = { createMentionNotificationsBatch: createBatchMock };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'Hello alice', validatedMentions: ['alice'], translations: null });
      prisma.user.findUnique.mockResolvedValue({ username: 'creator', avatar: null });
      prisma.conversation.findUnique.mockResolvedValue({
        title: 'Test',
        type: 'group',
        participants: [{ userId: USER_ID }],
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(createBatchMock).toHaveBeenCalled();
    });

    it('handles mention processing error gracefully', async () => {
      fastify.mentionService = {
        extractMentionsWithParticipants: jest.fn().mockImplementation(() => { throw new Error('mention error'); }),
        resolveUsernames: jest.fn(),
        validateMentionPermissions: jest.fn(),
        createMentions: jest.fn(),
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({ id: MSG_ID, content: 'hello', validatedMentions: [], translations: null });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      // Should not fail — mention error is caught
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // ─── Ce que l'édition PUBLIE ────────────────────────────────────────────
    //
    // L'invalidation de `translations` vivait dans un SECOND `update`, placé
    // dans le bloc de retraduction — donc APRÈS que `updatedMessage` (le
    // produit du premier `update`, qui compose la réponse ET la charge
    // `message:edited`) a été capturé. La ligne relue portait le texte d'APRÈS
    // et les traductions d'AVANT, et c'est cette paire qui partait vers toute
    // la conversation. Le commentaire du code affirmait l'inverse.
    describe('une édition ne publie jamais la traduction du texte d\'avant', () => {
      // `update` rend ce qu'il vient d'écrire, comme le ferait la base : sans
      // cela, aucun mock ne peut distinguer « invalidé dans l'écriture » de
      // « invalidé après la lecture ».
      const writeReflectsWhatItWrote = (storedTranslations: unknown) => {
        prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
          translations: storedTranslations,
        }));
        prisma.message.update.mockImplementation(async ({ data }: any) => ({
          id: MSG_ID,
          conversationId: CONV_ID,
          content: 'New content',
          validatedMentions: [],
          translations: storedTranslations,
          ...data,
        }));
      };

      const stale = {
        fr: { text: 'le texte AVANT édition', translationModel: 'basic', createdAt: new Date() },
      };

      it('invalide les traductions dans l\'écriture du contenu elle-même', async () => {
        writeReflectsWhatItWrote(stale);
        const req = makeRequest({
          params: { id: CONV_ID, messageId: MSG_ID },
          body: { content: 'New content' },
        });

        await getEditHandler(fastify)(req, makeReply());

        expect(prisma.message.update).toHaveBeenCalledWith(expect.objectContaining({
          where: { id: MSG_ID, deletedAt: null },
          data: expect.objectContaining({ translations: null }),
        }));
      });

      it('n\'écrit pas une seconde fois pour périmer ce que la première écriture a déjà vidé', async () => {
        writeReflectsWhatItWrote(stale);
        const req = makeRequest({
          params: { id: CONV_ID, messageId: MSG_ID },
          body: { content: 'New content' },
        });

        await getEditHandler(fastify)(req, makeReply());

        expect(prisma.message.update).toHaveBeenCalledTimes(1);
      });

      it('ne fait pas dériver la charge diffusée d\'une ligne portant encore les traductions périmées', async () => {
        writeReflectsWhatItWrote(stale);
        const req = makeRequest({
          params: { id: CONV_ID, messageId: MSG_ID },
          body: { content: 'New content' },
        });

        await getEditHandler(fastify)(req, makeReply());

        expect(mockTransformTranslationsToArray).toHaveBeenCalledWith(MSG_ID, null);
      });
    });
  });

  // ─── DELETE /conversations/:id/messages/:messageId ────────────────────────

  describe('DELETE /conversations/:id/messages/:messageId', () => {
    const getDeleteMsgHandler = (f: any) =>
      getHandler(f, 'DELETE', '/conversations/:id/messages/:messageId');

    it('returns 404 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalledWith(reply, 'Conversation not found');
    });

    it('returns 404 when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }),
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
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }),
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
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }),
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
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }),
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }),
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
        makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }),
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockOnMessageDeleted).toHaveBeenCalled();
      expect(mockOnMessageDeleted.mock.calls[0][2]).toBe(PART_ID);
    });

    it('calls sendInternalError on outer error', async () => {
      prisma.message.findFirst.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });
  });

  // ─── PATCH /messages/:messageId ───────────────────────────────────────────

  describe('PATCH /messages/:messageId', () => {
    const getPatchHandler = (f: any) => getHandler(f, 'PATCH', '/messages/:messageId');

    it('returns 404 when message not found', async () => {
      prisma.message.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendNotFound).toHaveBeenCalled();
    });

    it('returns 403 when user is not author', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        sender: { userId: OTHER_USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [],
        },
      });
      // Membre bel et bien actif : ce qui manque, c'est le message, pas la porte.
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, user: { role: 'USER' } });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('propres messages')
      );
    });

    it('refuse un modérateur GLOBAL qui n\'est pas membre actif — le privilège ne franchit pas la porte', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        createdAt: new Date(),
        sender: { userId: OTHER_USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [],
        },
      });
      prisma.participant.findFirst.mockResolvedValue(null);

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('Unauthorized')
      );
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('allows edit for meeshy conversation without membership check', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'meeshy',
          participants: [],
        },
      });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('updates message content on happy path', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [{ userId: USER_ID, isActive: true }],
        },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // Ce transport — celui qu'emploie Android — n'ajustait pas les compteurs :
    // `totalWords`/`totalCharacters` restaient sur les longueurs du texte
    // d'origine, définitivement.
    it('ajuste les compteurs sur l\'écart de longueur', async () => {
      mockOnMessageEdited.mockClear();
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'trois petits mots',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [{ userId: USER_ID, isActive: true }],
        },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockOnMessageEdited).toHaveBeenCalledTimes(1);
      const [, conversationId, authorKey, previous, next] = mockOnMessageEdited.mock.calls[0];
      expect(conversationId).toBe(CONV_ID);
      expect(authorKey).toBe(USER_ID);
      expect(previous).toBe('trois petits mots');
      expect(next).toBe('Updated');
    });

    it('calls sendInternalError on error', async () => {
      prisma.message.findFirst.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    it('broadcasts MESSAGE_EDITED via Socket.IO on happy path (parity with PUT sibling)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [{ userId: USER_ID, isActive: true }],
        },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(fastify._mockGetManager).toHaveBeenCalled();
      expect(fastify._mockTo).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(fastify._mockEmit).toHaveBeenCalledWith(
        'message:edited',
        expect.objectContaining({ id: MSG_ID, conversationId: CONV_ID })
      );
    });

    it('enqueues the edit for offline participants (parity with PUT sibling)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [{ userId: USER_ID, isActive: true }],
        },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(fastify._mockEnqueueOfflineMutation).toHaveBeenCalledWith(
        expect.objectContaining({
          conversationId: CONV_ID,
          actorUserId: USER_ID,
          eventType: 'edited',
          messageId: MSG_ID,
          payload: expect.objectContaining({ id: MSG_ID, conversationId: CONV_ID }),
        })
      );
    });

    it('invalidates cached translations and triggers retranslation on happy path (parity with PUT sibling)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: {
          identifier: 'some-conv',
          participants: [{ userId: USER_ID, isActive: true }],
        },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(fastify.translationService.retranslateMessageAsync).toHaveBeenCalledWith(
        MSG_ID,
        expect.objectContaining({ id: MSG_ID, content: 'Updated', conversationId: CONV_ID })
      );
    });

    it('continues successfully when retranslation fails (parity with PUT sibling)', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: { identifier: 'meeshy', participants: [] },
      });
      fastify.translationService = {
        retranslateMessageAsync: jest.fn().mockRejectedValue(new Error('translation error')),
      };
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('socketIOManager null in patch edit - no broadcast but success', async () => {
      fastify.socketIOHandler.getManager.mockReturnValue(null);
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        originalLanguage: 'fr',
        senderId: PART_ID,
        sender: { userId: USER_ID },
        conversation: { identifier: 'meeshy', participants: [] },
      });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'Updated',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      const req = makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Updated' } });
      const reply = makeReply();

      await getPatchHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
      expect(fastify._mockEmit).not.toHaveBeenCalled();
    });

    // Ce PATCH est le transport d'édition du client ANDROID :
    // `OutboxFlushWorker` (lane `EDIT_MESSAGE`) → `MessageApi.edit` →
    // `@PATCH("messages/{id}")`. Le web possède bien un
    // `messagesService.updateMessage` qui pointe ici, mais AUCUN écran ne
    // l'appelle — d'où la croyance, portée par plusieurs cycles, que cette
    // route était morte et pouvait être retirée. La retirer aurait cassé la
    // remise différée des éditions faites hors ligne sur Android. Il vivait
    // à côté de son jumeau `PUT /conversations/:id/messages/:messageId` sans
    // rien partager avec lui : ni traitement des liens, ni réconciliation des
    // mentions. Deux routes, même verbe métier, deux comportements.
    const makePatchTarget = (overrides: any = {}) => ({
      id: MSG_ID,
      conversationId: CONV_ID,
      content: 'Salut @alice',
      originalLanguage: 'fr',
      senderId: PART_ID,
      sender: { userId: USER_ID },
      conversation: { identifier: 'meeshy', participants: [] },
      ...overrides,
    });

    const makeMentionService = (username: string, userId: string) => ({
      extractMentionsWithParticipants: jest.fn().mockReturnValue([username]),
      resolveUsernames: jest.fn<any>().mockResolvedValue(new Map([[username, { id: userId, username }]])),
      validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: [userId] }),
      createMentions: jest.fn<any>().mockResolvedValue(undefined),
    });

    it('réconcilie les mentions du texte édité, comme son jumeau PUT', async () => {
      fastify.mentionService = makeMentionService('bob', 'user-bob');
      prisma.mention.findMany.mockResolvedValue([{ mentionedUserId: 'user-alice' }]);
      prisma.message.findFirst.mockResolvedValue(makePatchTarget());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'processed content',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Salut @bob' } }),
        makeReply()
      );

      // Alice sort, Bob entre — un lot RECOMPOSÉ, pas complété.
      expect(prisma.mention.deleteMany).toHaveBeenCalledWith(
        expect.objectContaining({ where: { messageId: MSG_ID, mentionedUserId: { in: ['user-alice'] } } })
      );
      expect(fastify.mentionService.createMentions).toHaveBeenCalledWith(MSG_ID, ['user-bob']);
    });

    it('émet `mention:created` dans le salon PERSONNEL de l\'entrant', async () => {
      fastify.mentionService = makeMentionService('bob', 'user-bob');
      prisma.mention.findMany.mockResolvedValue([]);
      prisma.message.findFirst.mockResolvedValue(makePatchTarget());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'processed content',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Salut @bob' } }),
        makeReply()
      );

      expect(fastify._mockTo).toHaveBeenCalledWith('user:user-bob');
      expect(fastify._mockEmit).toHaveBeenCalledWith('mention:created', expect.objectContaining({
        messageId: MSG_ID,
        mentionedUserId: 'user-bob',
      }));
    });

    it('transforme les liens traçables AVANT l\'écriture, et ne fait circuler que le contenu traité', async () => {
      prisma.message.findFirst.mockResolvedValue(makePatchTarget());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'processed content',
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Regarde <https://example.com>' } }),
        makeReply()
      );

      expect(mockProcessExplicitLinksInContent).toHaveBeenCalledWith(expect.objectContaining({
        content: 'Regarde <https://example.com>',
        conversationId: CONV_ID,
        messageId: MSG_ID,
        createdBy: USER_ID,
      }));
      expect(prisma.message.update).toHaveBeenCalledWith(expect.objectContaining({
        data: expect.objectContaining({ content: 'processed content' }),
      }));
      expect(fastify.translationService.retranslateMessageAsync).toHaveBeenCalledWith(
        MSG_ID,
        expect.objectContaining({ content: 'processed content' })
      );
    });

    it('n\'écrase pas `validatedMentions` quand la réconciliation n\'a rien pu établir', async () => {
      fastify.mentionService = null;
      prisma.message.findFirst.mockResolvedValue(makePatchTarget());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'processed content',
        validatedMentions: ['alice'],
        translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'Salut @alice' } }),
        makeReply()
      );

      const payload = mockSendSuccess.mock.calls[0][1] as any;
      expect(payload.validatedMentions).toEqual(['alice']);
    });

    // ── Admission : la même règle que les trois autres entrées ──────────────

    it('refuse l\'auteur au-delà de 24h — ce transport n\'imposait AUCUNE fenêtre', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        sender: { userId: USER_ID },
        conversation: { identifier: 'some-conv', participants: [{ userId: USER_ID, isActive: true }] },
      });
      prisma.user.findUnique.mockResolvedValue({ role: 'USER' });

      const reply = makeReply();
      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'trop tard' } }),
        reply
      );

      expect(mockSendForbidden).toHaveBeenCalledWith(reply, expect.stringContaining('24-hour'));
      expect(prisma.message.update).not.toHaveBeenCalled();
    });

    it('rouvre la fenêtre à un auteur au rôle GLOBAL privilégié', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000),
        sender: { userId: USER_ID },
        conversation: { identifier: 'some-conv', participants: [{ userId: USER_ID, isActive: true }] },
      });
      prisma.user.findUnique.mockResolvedValue({ role: 'BIGBOSS' });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'correction', validatedMentions: [], translations: null,
        sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
      });

      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'correction' } }),
        makeReply()
      );

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('admet un modérateur GLOBAL membre actif sur le message de quelqu\'un d\'autre — comme la route conversation-scopée', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        createdAt: new Date(),
        sender: { userId: OTHER_USER_ID },
        conversation: { identifier: 'some-conv', participants: [] },
      });
      prisma.participant.findFirst.mockResolvedValue({ id: PART_ID, user: { role: 'MODERATOR' } });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'modéré', validatedMentions: [], translations: null,
        sender: { id: PART_ID, userId: OTHER_USER_ID, displayName: 'Bob', avatar: null, role: 'USER', user: { username: 'bob' } },
      });

      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'modéré' } }),
        makeReply()
      );

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    // ── Un message supprimé ne se ré-écrit pas ─────────────────────────────

    it('ne lit jamais un message supprimé — la garde `deletedAt` manquait des DEUX côtés', async () => {
      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'zombie' } }),
        makeReply()
      );

      expect(prisma.message.findFirst).toHaveBeenCalledWith(
        expect.objectContaining({ where: expect.objectContaining({ deletedAt: null }) })
      );
    });

    it('l\'écriture est gardée : une suppression concurrente rend 404 au lieu de ressusciter la ligne', async () => {
      prisma.message.findFirst.mockResolvedValue({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Original',
        createdAt: new Date(),
        sender: { userId: USER_ID },
        conversation: { identifier: 'some-conv', participants: [{ userId: USER_ID, isActive: true }] },
      });
      prisma.message.update.mockRejectedValue(Object.assign(new Error('not found'), { code: 'P2025' }));

      const reply = makeReply();
      await getPatchHandler(fastify)(
        makeRequest({ params: { messageId: MSG_ID }, body: { content: 'course' } }),
        reply
      );

      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({ where: { id: MSG_ID, deletedAt: null } })
      );
      expect(mockSendNotFound).toHaveBeenCalled();
      expect(mockSendInternalError).not.toHaveBeenCalled();
    });

    // ─── Ce qu'une édition a le droit d'ÉCRIRE ──────────────────────────────
    //
    // Les trois autres transports refusent une édition qui viderait un message
    // sans pièce jointe (`MessageHandler.handleMessageEdit`,
    // `PUT /conversations/:id/messages/:messageId`, `PUT /messages/:messageId`).
    // Celui-ci ne portait AUCUNE garde : sa seule protection était le
    // `minLength: 1` du schéma JSON, que trois espaces satisfont — et que le
    // `.trim()` de la ligne suivante réduit à la chaîne vide.
    describe('contenu vide — la garde qui manquait au quatrième transport', () => {
      it('refuse une édition faite d\'espaces seuls sur un message SANS pièce jointe', async () => {
        prisma.message.findFirst.mockResolvedValue(makePatchTarget({ attachments: [] }));

        const reply = makeReply();
        await getPatchHandler(fastify)(
          makeRequest({ params: { messageId: MSG_ID }, body: { content: '   ' } }),
          reply
        );

        expect(mockSendBadRequest).toHaveBeenCalledWith(
          reply,
          expect.stringContaining('empty')
        );
        // Ce qui compte n'est pas le code de retour mais le message ÉPARGNÉ :
        // sans cette garde, la ligne partait en base avec un contenu vide et un
        // `message:edited` vide s'en allait vers tous les clients.
        expect(prisma.message.update).not.toHaveBeenCalled();
      });

      it('refuse tabulations et sauts de ligne au même titre que les espaces', async () => {
        prisma.message.findFirst.mockResolvedValue(makePatchTarget({ attachments: [] }));

        await getPatchHandler(fastify)(
          makeRequest({ params: { messageId: MSG_ID }, body: { content: '\t\n ' } }),
          makeReply()
        );

        expect(prisma.message.update).not.toHaveBeenCalled();
      });

      it('ADMET une édition vide quand le message porte des pièces jointes (retrait de légende)', async () => {
        // Le défaut jouait dans les DEUX sens : `minLength: 1` interdisait
        // aussi de retirer la légende d'un message à pièce jointe, que les
        // trois autres transports autorisent.
        prisma.message.findFirst.mockResolvedValue(
          makePatchTarget({ attachments: [{ id: 'att-1' }] })
        );
        prisma.message.update.mockResolvedValue({
          id: MSG_ID,
          content: '',
          translations: null,
          sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
        });

        await getPatchHandler(fastify)(
          makeRequest({ params: { messageId: MSG_ID }, body: { content: '' } }),
          makeReply()
        );

        expect(mockSendBadRequest).not.toHaveBeenCalled();
        expect(mockSendSuccess).toHaveBeenCalled();
      });

      it('écrit le contenu débarrassé de ses bords, comme les trois autres', async () => {
        prisma.message.findFirst.mockResolvedValue(makePatchTarget({ attachments: [] }));
        prisma.message.update.mockResolvedValue({
          id: MSG_ID,
          content: 'bonjour',
          translations: null,
          sender: { id: PART_ID, userId: USER_ID, displayName: 'Alice', avatar: null, role: 'USER', user: { username: 'alice' } },
        });

        await getPatchHandler(fastify)(
          makeRequest({ params: { messageId: MSG_ID }, body: { content: '  bonjour  ' } }),
          makeReply()
        );

        expect(prisma.message.update).toHaveBeenCalledWith(
          expect.objectContaining({ data: expect.objectContaining({ content: 'bonjour' }) })
        );
      });

      it('lit les pièces jointes du message — sans elles, la garde ne peut pas trancher', async () => {
        prisma.message.findFirst.mockResolvedValue(makePatchTarget({ attachments: [] }));

        await getPatchHandler(fastify)(
          makeRequest({ params: { messageId: MSG_ID }, body: { content: 'texte' } }),
          makeReply()
        );

        expect(prisma.message.findFirst).toHaveBeenCalledWith(
          expect.objectContaining({
            include: expect.objectContaining({ attachments: { select: { id: true } } }),
          })
        );
      });
    });
  });

  // ─── GET /conversations/:id/reactions ────────────────────────────────────

  describe('GET /conversations/:id/reactions', () => {
    const getReactionsHandler = (f: any) => getHandler(f, 'GET', '/conversations/:id/reactions');

    it('returns 403 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns 403 when access denied', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns empty reactions array when no reactions', async () => {
      prisma.reaction.findMany.mockResolvedValue([]);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      // #4165 — `hasMore` est un champ NEUF (critère 2 : de quoi demander la
      // suite maintenant que la route rend une PAGE). `total` reste le vrai
      // compte de la conversation, servi par `.count()` — mocké à 0 ci-dessus
      // dans le double global (`prisma.reaction.count`), cohérent avec la
      // page vide.
      expect(mockSendSuccess).toHaveBeenCalledWith(reply, {
        reactions: [],
        total: 0,
        hasMore: false,
      });
    });

    it('groups reactions by messageId and emoji', async () => {
      // #4165 — `total` est désormais le VRAI compte de la conversation
      // (`.count()`), plus le `.findMany` borné : les trois lignes ci-dessous
      // sont une PAGE, le total peut différer de sa longueur. Ici les deux
      // coïncident (3 lignes, 3 au total) pour garder ce test simple.
      prisma.reaction.count.mockResolvedValue(3);
      prisma.reaction.findMany.mockResolvedValue([
        {
          messageId: MSG_ID,
          emoji: '👍',
          participantId: PART_ID,
          createdAt: new Date(),
          participant: {
            id: PART_ID,
            displayName: 'Alice',
            avatar: null,
            type: 'user',
            user: { username: 'alice' },
          },
        },
        {
          messageId: MSG_ID,
          emoji: '👍',
          participantId: 'other-part',
          createdAt: new Date(),
          participant: {
            id: 'other-part',
            displayName: 'Bob',
            avatar: null,
            type: 'user',
            user: { username: 'bob' },
          },
        },
        {
          messageId: MSG_ID,
          emoji: '❤️',
          participantId: PART_ID,
          createdAt: new Date(),
          participant: {
            id: PART_ID,
            displayName: 'Alice',
            avatar: null,
            type: 'user',
            user: { username: 'alice' },
          },
        },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      const result = mockSendSuccess.mock.calls[0][1];
      expect(result.total).toBe(3);
      const msgReactions = result.reactions.find((r: any) => r.messageId === MSG_ID);
      expect(msgReactions).toBeDefined();
      const thumbsUp = msgReactions.reactions.find((r: any) => r.emoji === '👍');
      expect(thumbsUp.count).toBe(2);
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.reaction.findMany.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getReactionsHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    /**
     * Une réaction NOMME un message et l'identité de celui qui l'a posée. Sur un
     * message d'AVANT l'arrivée du lecteur, elle révèle donc l'existence du
     * message, son id, et qui était là — trois métadonnées que le plancher
     * d'historique doit borner au même titre que le contenu (§ Sécurité :
     * « qu'est-ce qui part À CÔTÉ ? »).
     */
    describe('plancher d’historique', () => {
      const FLOOR = new Date('2026-06-15T00:00:00.000Z');

      it('borne le prédicat de sélection au plancher du lecteur', async () => {
        prisma.participant.findFirst.mockResolvedValue({
          role: 'member', joinedAt: FLOOR, shareLinkId: null, permissions: { canViewHistory: false },
        });
        prisma.reaction.findMany.mockResolvedValue([]);

        await getReactionsHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), makeReply());

        expect(prisma.reaction.findMany.mock.calls[0][0].where.message).toMatchObject({
          conversationId: CONV_ID,
          deletedAt: null,
          createdAt: { gte: FLOOR },
        });
      });

      it('ne borne rien pour un lecteur sans plancher — la requête reste identique', async () => {
        prisma.participant.findFirst.mockResolvedValue(null);
        prisma.reaction.findMany.mockResolvedValue([]);

        await getReactionsHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), makeReply());

        expect(prisma.reaction.findMany.mock.calls[0][0].where.message).toEqual({
          conversationId: CONV_ID,
          deletedAt: null,
        });
      });
    });
  });

  // ─── Réactions IMBRIQUÉES : REPOINTÉES sur la porte PLATE (#4188/#4190) ──
  //
  // `POST` et `DELETE /conversations/:id/messages/:messageId/reactions` ont été
  // RETIRÉES : aucun client ne les appelait, et elles portaient une politique
  // strictement PLUS PAUVRE que leur jumelle plate (`POST /reactions`,
  // `DELETE /reactions/:messageId/:emoji`, dans `routes/reactions.ts`) — garde
  // montée `allowAnonymous: false`, donc un invité de lien de partage ne pouvait
  // pas réagir, et un fil CLOS y retombait sur un 500 au lieu d'un 410.
  //
  // Les vingt-neuf témoins qui vivaient ici ne sont PAS perdus : la CAPACITÉ
  // qu'ils gardaient est toujours servie, par la porte plate, et sa couverture
  // vit désormais en trois endroits —
  //
  //   `__tests__/unit/routes/reactions-routes.test.ts`
  //       les branches de refus et le chemin nominal des deux verbes : emoji
  //       manquant, participant introuvable (403), `addReaction` qui rend null
  //       (500), plafond de cinq réactions (409), emoji invalide (400), message
  //       introuvable (404), non-membre (403), message SYSTÈME (400 — celui-là
  //       a été repointé DEPUIS ce fichier, il n'existait nulle part ailleurs),
  //       erreur générique (500), diffusion et son absence quand
  //       `socketIOHandler` manque, re-réaction idempotente sans diffusion.
  //
  //   `__tests__/unit/routes/reactions-flat-door-policy.test.ts`
  //       les DEUX propriétés que la forme imbriquée n'avait pas — l'invité
  //       anonyme admis avec son seul `Participant.id`, et le 410 du fil clos.
  //
  //   `__tests__/unit/routes/dead-doors-are-not-mounted.test.ts`
  //       la garde NÉGATIVE : les deux portes imbriquées ne sont plus déclarées,
  //       et la plate l'est toujours. C'est elle qui empêche une « refusion »
  //       silencieuse de les réintroduire.
  //
  // TROIS témoins n'ont pas été repointés, et c'est délibéré : leur capacité est
  // structurellement absente de la porte plate, pas seulement non testée.
  //   - « 404 quand la conversation est introuvable » et « 403 accès refusé » :
  //     la porte plate n'a PAS de `:id` dans son URL — elle dérive la
  //     conversation DU MESSAGE, et le refus s'exprime alors par le 403 de
  //     résolution du participant, déjà couvert.
  //   - « DELETE 400 quand l'emoji manque » : sur la porte plate l'emoji est un
  //     paramètre de CHEMIN, donc une requête sans emoji ne matche aucune route.
  //     Il n'y a plus de branche à garder.
  //
  // Ce qui subsiste ici est `GET /conversations/:id/reactions` ci-dessus, la
  // LECTURE conversation-scopée — elle n'a pas de jumelle plate et reste vivante.

  // ─── GET /conversations/:id/status ───────────────────────────────────────

  describe('GET /conversations/:id/status', () => {
    const getStatusHandler = (f: any) => getHandler(f, 'GET', '/conversations/:id/status');

    it('returns 403 when conversation not found', async () => {
      mockResolveConversationId.mockResolvedValue(null);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns 403 when access denied', async () => {
      mockCanAccessConversation.mockResolvedValue(false);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      expect(mockSendForbidden).toHaveBeenCalled();
    });

    it('returns empty statuses when no messages', async () => {
      prisma.message.findMany.mockResolvedValue([]);
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalledWith(reply, {
        statuses: [],
        total: 0,
      });
    });

    it('formats message statuses correctly', async () => {
      // Ce test figeait autrefois les colonnes dénormalisées (`deliveredCount:
      // 3`), c'est-à-dire une valeur que la production ne produit JAMAIS —
      // personne ne les écrit. Il porte désormais sur la mise en forme : une
      // ligne par message, son identité, et ses entrées nominatives.
      prisma.message.findMany.mockResolvedValue([
        {
          id: MSG_ID,
          senderId: PART_ID,
          createdAt: new Date(),
          statusEntries: [
            {
              participantId: PART_ID,
              deliveredAt: new Date(),
              readAt: new Date(),
              participant: {
                id: PART_ID,
                userId: USER_ID,
                displayName: 'Alice',
                avatar: null,
                type: 'user',
                user: { username: 'alice' },
              },
            },
          ],
        },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      const result = mockSendSuccess.mock.calls[0][1];
      expect(result.total).toBe(1);
      expect(result.statuses[0].messageId).toBe(MSG_ID);
      expect(result.statuses[0].senderId).toBe(PART_ID);
      expect(result.statuses[0].entries[0].user.username).toBe('alice');
    });

    it('calls sendInternalError on DB error', async () => {
      prisma.message.findMany.mockRejectedValue(new Error('DB fail'));
      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      expect(mockSendInternalError).toHaveBeenCalled();
    });

    /**
     * `id`, `senderId`, `createdAt` et les accusés NOMINATIFS d'un message
     * d'avant l'arrivée sont l'historique lui-même, moins le texte. Cette route
     * les servait sans aucun plancher.
     */
    describe('plancher d’historique', () => {
      const FLOOR = new Date('2026-06-15T00:00:00.000Z');

      it('borne la page de messages au plancher du lecteur', async () => {
        prisma.participant.findFirst.mockResolvedValue({
          role: 'member', joinedAt: FLOOR, shareLinkId: null, permissions: { canViewHistory: false },
        });
        prisma.message.findMany.mockResolvedValue([]);

        await getStatusHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), makeReply());

        expect(prisma.message.findMany.mock.calls[0][0].where).toMatchObject({
          conversationId: CONV_ID,
          deletedAt: null,
          createdAt: { gte: FLOOR },
        });
      });

      it('ne borne rien pour un lecteur sans plancher', async () => {
        prisma.participant.findFirst.mockResolvedValue(null);
        prisma.message.findMany.mockResolvedValue([]);

        await getStatusHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), makeReply());

        expect(prisma.message.findMany.mock.calls[0][0].where).toEqual({
          conversationId: CONV_ID,
          deletedAt: null,
        });
      });
    });

    it('deliveredCount=0 and readCount=0 use fallback 0', async () => {
      prisma.message.findMany.mockResolvedValue([
        {
          id: MSG_ID,
          senderId: PART_ID,
          deliveredCount: 0,
          readCount: 0,
          deliveredToAllAt: null,
          readByAllAt: null,
          statusEntries: [],
        },
      ]);

      const req = makeRequest({ params: { id: CONV_ID } });
      const reply = makeReply();

      await getStatusHandler(fastify)(req, reply);

      const result = mockSendSuccess.mock.calls[0][1];
      expect(result.statuses[0].summary.deliveredCount).toBe(0);
      expect(result.statuses[0].summary.readCount).toBe(0);
    });

    /**
     * Les trois défauts que le cycle 101 avait relevés sans les traiter, dans
     * un unique handler : un résumé lu de colonnes MORTES, des horodatages de
     * lecture NOMINATIFS servis sans le gate d'opt-out que les cinq autres
     * lecteurs respectent, et une requête SANS BORNE sur toute la conversation.
     */
    describe("le résumé se CALCULE, les accusés se TAISENT sur demande, et la page a une borne", () => {
      const MSG_CREATED_AT = new Date('2026-08-01T10:00:00.000Z');
      const READ_AT = new Date('2026-08-01T10:05:00.000Z');

      /** Destinataire qui laisse ses accusés visibles. */
      const OPEN_PART_ID = '507f1f77bcf86cd799439061';
      const OPEN_USER_ID = '507f1f77bcf86cd799439062';
      /** Destinataire qui a désactivé `showReadReceipts`. */
      const SILENT_PART_ID = '507f1f77bcf86cd799439071';
      const SILENT_USER_ID = '507f1f77bcf86cd799439072';

      beforeEach(() => {
        // Le cache d'opt-out a la portée du PROCESSUS : sans ce nettoyage, le
        // premier test (personne de retiré) le remplit et les suivants lisent
        // sa réponse périmée au lieu du double.
        clearPrivacyPreferencesCache();
      });

      const entryFor = (participantId: string, userId: string, displayName: string, username: string) => ({
        participantId,
        deliveredAt: READ_AT,
        receivedAt: READ_AT,
        readAt: READ_AT,
        messageId: MSG_ID,
        participant: {
          id: participantId,
          // `userId` porte la préférence : un participant sans lui est réputé
          // visible (anonyme/bot). L'omettre du double rendait le gate inerte.
          userId,
          displayName,
          avatar: null,
          type: 'user',
          user: { username },
        },
      });

      const seedConversation = (optedOutUserIds: string[] = []) => {
        prisma.message.findMany.mockResolvedValue([
          {
            id: MSG_ID,
            senderId: PART_ID,
            createdAt: MSG_CREATED_AT,
            // Les colonnes dénormalisées n'ont AUCUN écrivain : elles valent
            // zéro sur toute la collection. On les stubbe ici à des valeurs
            // IMPOSSIBLES — si elles ressortent, c'est qu'elles sont lues.
            deliveredCount: 99,
            readCount: 99,
            deliveredToAllAt: null,
            readByAllAt: null,
            statusEntries: [
              entryFor(OPEN_PART_ID, OPEN_USER_ID, 'Ouverte', 'ouverte'),
              entryFor(SILENT_PART_ID, SILENT_USER_ID, 'Discrete', 'discrete'),
            ],
          },
        ]);
        prisma.participant.findMany.mockResolvedValue([
          { id: PART_ID, userId: USER_ID, isActive: true },
          { id: OPEN_PART_ID, userId: OPEN_USER_ID, isActive: true },
          { id: SILENT_PART_ID, userId: SILENT_USER_ID, isActive: true },
        ]);
        prisma.messageStatusEntry.findMany.mockResolvedValue([
          { messageId: MSG_ID, participantId: OPEN_PART_ID, deliveredAt: READ_AT, receivedAt: READ_AT, readAt: READ_AT },
          { messageId: MSG_ID, participantId: SILENT_PART_ID, deliveredAt: READ_AT, receivedAt: READ_AT, readAt: READ_AT },
        ]);
        // L'opt-out passe par le document JSON, seul rangement que
        // `PATCH /me/preferences/privacy` écrive.
        prisma.userPreferences.findMany.mockResolvedValue(
          optedOutUserIds.map((userId) => ({ userId, privacy: { showReadReceipts: false } }))
        );
        prisma.userPreference.findMany.mockResolvedValue([]);
      };

      it('ne sert plus les colonnes mortes : le résumé vient du comptage réel', async () => {
        seedConversation();
        const reply = makeReply();
        await getStatusHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), reply);

        const summary = mockSendSuccess.mock.calls[0][1].statuses[0].summary;
        expect(summary.deliveredCount).toBe(2);
        expect(summary.readCount).toBe(2);
        expect(summary.deliveredCount).not.toBe(99);
      });

      it("ne révèle pas l'horodatage de lecture d'un participant qui a coupé ses accusés", async () => {
        seedConversation([SILENT_USER_ID]);
        const reply = makeReply();
        await getStatusHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), reply);

        const entries = mockSendSuccess.mock.calls[0][1].statuses[0].entries;
        const participantIds = entries.map((e: any) => e.participantId);
        expect(participantIds).toContain(OPEN_PART_ID);
        // La fuite fermée : ni la ligne, ni le nom, ni la date.
        expect(participantIds).not.toContain(SILENT_PART_ID);
        expect(JSON.stringify(entries)).not.toContain('discrete');
      });

      it("retire aussi l'opt-out du résumé, comme partout ailleurs", async () => {
        seedConversation([SILENT_USER_ID]);
        const reply = makeReply();
        await getStatusHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), reply);

        const summary = mockSendSuccess.mock.calls[0][1].statuses[0].summary;
        expect(summary.deliveredCount).toBe(1);
        expect(summary.readCount).toBe(1);
      });

      it('borne la page : une conversation de 100 000 messages ne se charge pas entière', async () => {
        // Sans `take`, ce handler chargeait CHAQUE message de la conversation
        // avec ses entrées de statut ET le participant joint sur chacune —
        // un déni de service que n'importe quel participant pouvait déclencher.
        seedConversation();
        const reply = makeReply();
        await getStatusHandler(fastify)(makeRequest({ params: { id: CONV_ID } }), reply);

        const findManyArgs = prisma.message.findMany.mock.calls[0][0];
        expect(typeof findManyArgs.take).toBe('number');
        expect(findManyArgs.take).toBeGreaterThan(0);
      });
    });
  });

  // ─── Additional branch coverage ───────────────────────────────────────────

  describe('PUT edit message - additional branch coverage', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('allows edit by BIGBOSS membership (non-author)', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({
        sender: { id: PART_ID, userId: OTHER_USER_ID, role: 'USER' },
      }));
      prisma.participant.findFirst.mockResolvedValue({
        user: { role: 'BIGBOSS' },
      });
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'New', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'New' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendForbidden).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('tracking links non-empty logs info', async () => {
      mockProcessExplicitLinksInContent.mockResolvedValue({
        processedContent: 'content with [[link]]',
        trackingLinks: [{ id: 'tl-1', url: 'https://example.com' }],
      });
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'content with [[link]]', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'content with [[link]]' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('updatedMessage.validatedMentions null uses fallback []', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: 'hello',
        validatedMentions: null, // null → should fallback to []
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      // mockSendSuccess captures the second arg (data) directly
      expect(mockSendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ validatedMentions: [] })
      );
    });

    it('socketIOManager null in edit - no broadcast but success', async () => {
      // socketIOHandler is captured at registration time → must re-register with null handler
      const fastifyNullSocket: any = {
        ...fastify,
        socketIOHandler: { getManager: jest.fn().mockReturnValue(null) },
        get: jest.fn(),
        post: jest.fn(),
        put: jest.fn((path: string, _opts: any, handler: Function) => {
          if (path.includes(':messageId')) {
            fastifyNullSocket._editHandler = handler;
          }
        }),
        delete: jest.fn(),
        patch: jest.fn(),
      };
      const localPrisma = makePrisma();
      localPrisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      localPrisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'hello', validatedMentions: [], translations: null,
      });
      registerMessagesAdvancedRoutes(fastifyNullSocket, localPrisma, makeTranslationService(), jest.fn(), jest.fn());

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await fastifyNullSocket._editHandler(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('resolveUsernames returns empty userMap - clears mentions', async () => {
      // L'effacement n'est observable que s'il y avait quelqu'un à retirer.
      prisma.mention.findMany.mockResolvedValue([{ mentionedUserId: 'user-alice' }]);
      const extractMock = jest.fn().mockReturnValue(['unknown']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map()); // empty map
      fastify.mentionService = {
        extractMentionsWithParticipants: extractMock,
        resolveUsernames,
        validateMentionPermissions: jest.fn(),
        createMentions: jest.fn(),
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'hello @unknown', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello @unknown' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      // Empty map → mentionedUserIds is [] → updates validatedMentions to []
      expect(prisma.message.update).toHaveBeenCalledWith(
        expect.objectContaining({ data: expect.objectContaining({ validatedMentions: [] }) })
      );
    });

    it('validationResult.validUserIds empty - clears mentions without createMentions', async () => {
      const extractMock = jest.fn().mockReturnValue(['@alice']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice' }]]));
      const validateMentionPermissions = jest.fn().mockResolvedValue({
        isValid: false,
        validUserIds: [], // empty valid ids
      });
      const createMentions = jest.fn();
      fastify.mentionService = {
        extractMentions: extractMock,
        resolveUsernames,
        validateMentionPermissions,
        createMentions,
      };

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'hello @alice', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello @alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(createMentions).not.toHaveBeenCalled();
    });

    it('existingMessage.content null uses ?? empty string for stats', async () => {
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage({ content: null }));
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'new content', validatedMentions: [], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'new content' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockOnMessageEdited).toHaveBeenCalledWith(
        expect.anything(), // prisma
        CONV_ID,
        USER_ID,
        '', // null ?? '' = ''
        expect.any(String)
      );
    });
  });

  describe('DELETE message - additional branch coverage', () => {
    const getDeleteMsgHandler = (f: any) =>
      getHandler(f, 'DELETE', '/conversations/:id/messages/:messageId');

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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
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

      const req = makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } });
      const reply = makeReply();

      await getDeleteMsgHandler(fastify)(req, reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('socket null branches - re-registered with null socketIOHandler', () => {
    // socketIOHandler is captured at registration time in registerMessagesAdvancedRoutes
    // We must create a fresh fastify with socketIOHandler=null and re-register

    const createNullSocketFastify = () => {
      const routes: Record<string, Record<string, Function>> = {};
      const f: any = {
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
        socketIOHandler: null, // null at registration time
        notificationService: null,
        mentionService: null,
        translationService: { retranslateMessageAsync: jest.fn().mockResolvedValue(undefined) },
        _routes: routes,
      };
      return f;
    };

    it('edit: socketIOHandler null at registration - no broadcast but success', async () => {
      const f = createNullSocketFastify();
      const p = makePrisma();
      p.message.findFirst.mockResolvedValue(makeExistingMessage());
      p.message.update.mockResolvedValue({ id: MSG_ID, content: 'hello', validatedMentions: [], translations: null });
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'PUT', ':messageId');
      const reply = makeReply();
      await handler(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'hello' } }), reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('delete message: socketIOHandler.getManager returns null - no broadcast but success', async () => {
      const f = createNullSocketFastify();
      f.socketIOHandler = { getManager: jest.fn().mockReturnValue(null) };
      const p = makePrisma();
      p.message.findFirst.mockResolvedValue({
        ...makeExistingMessage(),
        sender: { id: PART_ID, userId: USER_ID },
        attachments: [],
      });
      p.message.update.mockResolvedValue({});
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'DELETE', ':messageId');
      const reply = makeReply();
      await handler(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID } }), reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('edit: socketIOManager getIO returns null - no broadcast but success', async () => {
      const f = createNullSocketFastify();
      f.socketIOHandler = { getManager: jest.fn().mockReturnValue({ getIO: jest.fn().mockReturnValue(null) }) };
      const p = makePrisma();
      p.message.findFirst.mockResolvedValue(makeExistingMessage());
      p.message.update.mockResolvedValue({ id: MSG_ID, content: 'hello', validatedMentions: [], translations: null });
      registerMessagesAdvancedRoutes(f, p, makeTranslationService(), jest.fn(), jest.fn());

      const handler = getHandler(f, 'PUT', ':messageId');
      const reply = makeReply();
      await handler(makeRequest({ params: { id: CONV_ID, messageId: MSG_ID }, body: { content: 'hello' } }), reply);

      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  describe('Edit message - remaining notification branches', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('sender or conversationInfo null - skips notification', async () => {
      // Covers branch 20: if (sender && conversationInfo) → false
      const extractMock = jest.fn().mockReturnValue(['alice']);
      const resolveUsernames = jest.fn().mockResolvedValue(new Map([['alice', { id: 'user-alice', username: 'alice' }]]));
      const validateMentionPermissions = jest.fn().mockResolvedValue({
        isValid: true,
        validUserIds: ['user-alice'],
      });
      const createMentions = jest.fn().mockResolvedValue(undefined);
      fastify.mentionService = { extractMentionsWithParticipants: extractMock, resolveUsernames, validateMentionPermissions, createMentions };

      const createBatchMock = jest.fn().mockResolvedValue(1);
      fastify.notificationService = { createMentionNotificationsBatch: createBatchMock };

      // user.findUnique returns null → sender is null → if (sender && conversationInfo) = false
      prisma.user.findUnique.mockResolvedValue(null);
      prisma.conversation.findUnique.mockResolvedValue({
        title: 'Test', type: 'group', participants: [{ userId: USER_ID }],
      });

      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());
      prisma.message.update.mockResolvedValue({
        id: MSG_ID, content: 'Hello alice', validatedMentions: ['alice'], translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'Hello alice' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(createBatchMock).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });
  });

  // ─── Branch 0: safeParse failure ─────────────────────────────────────────────

  describe('PUT edit message - safeParse validation failure', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('returns 400 when body content exceeds the max length (safeParse fails)', async () => {
      // EditMessageBodySchema allows empty content (attachment caption removal)
      // but still caps length at 10 000. An over-long content triggers a
      // safeParse failure → the 'Validation error' branch is covered.
      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'x'.repeat(10_001) },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(
        reply,
        'Validation error',
        expect.objectContaining({ message: expect.any(String) })
      );
    });

    it('accepts empty content when the message has attachments (caption removal)', async () => {
      // Parity with the socket edit path: clearing a caption on an attachment
      // message is allowed. The attachment-aware check is the source of truth.
      prisma.message.findFirst.mockResolvedValue(
        makeExistingMessage({ attachments: [{ id: 'att-1' }] })
      );
      prisma.message.update.mockResolvedValue({
        id: MSG_ID,
        content: '',
        validatedMentions: [],
        translations: null,
      });

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: '' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendBadRequest).not.toHaveBeenCalled();
      expect(mockSendSuccess).toHaveBeenCalled();
    });

    it('still rejects empty content when the message has no attachments', async () => {
      prisma.message.findFirst.mockResolvedValue(
        makeExistingMessage({ attachments: [] })
      );

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: '' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      expect(mockSendBadRequest).toHaveBeenCalledWith(
        reply,
        expect.stringContaining('empty')
      );
    });
  });

  // ─── Branches 24/25: updatedMessage.validatedMentions stays null ──────────────

  describe('PUT edit message - validatedMentions remains null after double update failure', () => {
    const getEditHandler = (f: any) => getHandler(f, 'PUT', '/conversations/:id/messages/:messageId');

    it('covers || [] fallback when both mention-clear updates throw', async () => {
      // When mentionService is null, code tries to clear validatedMentions via prisma.message.update
      // at line 390. If that throws, the catch block at line 401 tries again.
      // If that also throws, updatedMessage.validatedMentions remains null from the initial update.
      // Line 464: updatedMessage.validatedMentions || [] → null || [] covers branch 24[1]
      // Line 468: same expression covers branch 25[1]
      prisma.message.findFirst.mockResolvedValue(makeExistingMessage());

      // Call 1 (line 206 main update): succeeds, returns validatedMentions: null
      prisma.message.update
        .mockResolvedValueOnce({
          id: MSG_ID,
          content: 'hello',
          validatedMentions: null,
          translations: null,
          createdAt: new Date(),
        })
        // Call 2 (line 390 clear mentions, mentionService=null branch): throws
        .mockRejectedValueOnce(new Error('DB mention clear error'))
        // Call 3 (line 401 catch-block clear): throws
        .mockRejectedValueOnce(new Error('DB catch clear error'))
        // Call 4 (line 418 reset translations): succeeds
        .mockResolvedValue({});

      const req = makeRequest({
        params: { id: CONV_ID, messageId: MSG_ID },
        body: { content: 'hello' },
      });
      const reply = makeReply();

      await getEditHandler(fastify)(req, reply);

      // validatedMentions was null, || [] used → response contains []
      expect(mockSendSuccess).toHaveBeenCalledWith(
        expect.anything(),
        expect.objectContaining({ validatedMentions: [] })
      );
    });
  });
});
