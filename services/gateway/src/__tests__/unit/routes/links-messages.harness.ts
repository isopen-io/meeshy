/**
 * Échafaudage PARTAGÉ des suites de `POST /links/:identifier/messages`.
 *
 * `links-messages.test.ts` portait 1288 lignes (dette héritée gelée à 1253) :
 * #9105 y avait ajouté ses témoins de liens suivis. Il est découpé par
 * RESPONSABILITÉ, jamais par tranche :
 *
 *   links-messages.test.ts           gardes, liens suivis, temps réel, contrat du 201
 *   links-messages-mentions.test.ts  mentions — `validatedMentions`, lignes `Mention`, notification
 *
 * Même forme que `posts/interactions.harness.ts`, dont la doc-comment explique
 * pourquoi les `jest.mock` restent chez les appelants (ils sont HISSÉS au
 * sommet du module qui les écrit) et pourquoi l'import de la route peut être au
 * sommet ici : ce module exporte les FABRIQUES et les doubles, chaque suite
 * écrit son `jest.mock(chemin, fabrique)`.
 */

import { jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

import { registerMessageRoutes } from '../../../routes/links/messages';

// ─── Doubles des modules ──────────────────────────────────────────────────────
//
// Des DÉCLARATIONS de fonction, jamais des `const` fléchées : la fabrique d'un
// `jest.mock` requiert ce module pendant qu'il charge encore la route, et seule
// une déclaration de fonction est déjà exportée à cet instant.

export function loggerModule() {
  return { logError: jest.fn() };
}

export function sessionTokenModule() {
  return { hashSessionToken: jest.fn((token: string) => 'hashed-' + token) };
}

export const mockProcessExplicitLinksInContent = jest.fn<any>().mockImplementation(
  async ({ content }: { content: string }) => ({ processedContent: content, trackingLinks: [] })
);
export const mockCollectContentTrackingLinks = jest.fn<any>().mockResolvedValue([]);
export const mockUpdateTrackingLinksMessageId = jest.fn<any>().mockResolvedValue(undefined);
export function trackingLinkServiceModule() {
  return {
    TrackingLinkService: jest.fn().mockImplementation(() => ({
      processExplicitLinksInContent: (...a: any[]) => mockProcessExplicitLinksInContent(...a),
      collectContentTrackingLinks: (...a: any[]) => mockCollectContentTrackingLinks(...a),
      updateTrackingLinksMessageId: (...a: any[]) => mockUpdateTrackingLinksMessageId(...a),
    })),
  };
}

export const mockAuthMiddleware = jest.fn<any>();
export function authModule() {
  return {
    createUnifiedAuthMiddleware: () => mockAuthMiddleware,
    isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
    UnifiedAuthRequest: {},
  };
}

export function apiSchemasModule() {
  return {
    errorResponseSchema: {
      type: 'object',
      properties: {
        success: { type: 'boolean' },
        error: { type: 'string' },
        message: { type: 'string' },
        code: { type: 'string' },
      },
    },
  };
}

export function socketioEventsModule() {
  return {
    SERVER_EVENTS: { LINK_MESSAGE_NEW: 'link:message-new' },
    ROOMS: { conversation: (id: string) => `conversation:${id}` },
  };
}

// Post-save language stats: a real singleton driven by a mock prisma would only
// exercise its own error path here. The route's obligation is that it FIRES,
// which is what the double records.
export const mockUpdateOnNewMessage = jest.fn<any>().mockResolvedValue(undefined);
export function conversationStatsModule() {
  return {
    conversationStatsService: {
      updateOnNewMessage: (...a: any[]) => mockUpdateOnNewMessage(...a),
    },
  };
}

// Controllable parse mock
export const mockParse = jest.fn<any>((body: any) => ({
  content: body?.content ?? 'Hello!',
  originalLanguage: body?.originalLanguage ?? 'fr',
  messageType: body?.messageType ?? 'text',
  clientMessageId: body?.clientMessageId ?? 'cid_test',
}));

// Only `sendMessageSchema.parse` is stubbed (to drive Zod failures); every
// response-shaping constant is the REAL one. A permissive stand-in
// (`additionalProperties: true`) would make fast-json-stringify echo whatever
// the route hands it, so a truncating schema would still look correct here —
// exactly the coincidence the cycle-7 review flagged (D4).
export function linkTypesModule(actual: Record<string, unknown>) {
  return {
    ...actual,
    sendMessageSchema: { parse: (...a: any[]) => mockParse(...a) },
  };
}

// ─── Constants ────────────────────────────────────────────────────────────────

export const USER_ID = 'user-abc123';
export const MSHY_ID = 'mshy_link_abc123';
export const DB_ID = '507f1f77bcf86cd799439055';
export const CONV_ID = '507f1f77bcf86cd799439022';
export const PART_ID = '507f1f77bcf86cd799439033';
export const LINK_DB_ID = '507f1f77bcf86cd799439011';
export const MSG_ID = '507f1f77bcf86cd799439044';
export const PEER_USER_ID = '507f1f77bcf86cd799439055';
export const SESSION_TOKEN = 'anon_session_token';

export const mockShareLink = {
  id: LINK_DB_ID, linkId: MSHY_ID, conversationId: CONV_ID,
  isActive: true, expiresAt: null, allowAnonymousMessages: true,
  conversation: { id: CONV_ID, identifier: 'some-conv', title: 'Test', type: 'group' },
};

export const mockParticipantShareLink = {
  id: LINK_DB_ID, conversationId: CONV_ID,
  isActive: true, allowAnonymousMessages: true, expiresAt: null,
};

export const mockAnonParticipant = {
  id: PART_ID, conversationId: CONV_ID, type: 'anonymous',
  displayName: 'anon', language: 'fr',
  sessionTokenHash: 'hashed-' + SESSION_TOKEN,
  isActive: true,
  permissions: { canSendMessages: true, canSendFiles: false },
  anonymousSession: { shareLinkId: LINK_DB_ID },
};

export const CID = 'cid_550e8400-e29b-41d4-a716-446655440000';

export const mockMessage = {
  id: MSG_ID, content: 'Hello!', originalLanguage: 'fr', messageType: 'text',
  clientMessageId: CID,
  isEdited: false, editedAt: null, deletedAt: null, replyToId: null,
  createdAt: new Date(), updatedAt: new Date(),
  sender: { id: PART_ID, userId: null, displayName: 'anon', avatar: null, type: 'anonymous', language: 'fr', user: null },
};

export const mockAuthContext = {
  type: 'registered' as const,
  userId: USER_ID,
  hasFullAccess: true,
  registeredUser: { id: USER_ID, username: 'alice', role: 'USER' },
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

export function makePrisma(overrides: Record<string, any> = {}) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockImplementation(async (opts: any) => {
        if (opts?.where?.id === LINK_DB_ID) return mockParticipantShareLink;
        return mockShareLink;
      }),
    },
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue(mockAnonParticipant),
      // Éventail de notifications : résolution de l'identité de l'expéditeur.
      findUnique: jest.fn<any>().mockResolvedValue({
        userId: null, displayName: 'anon', avatar: null,
      }),
    },
    user: {
      findUnique: jest.fn<any>().mockResolvedValue({
        username: 'alice', displayName: 'Alice', avatar: null,
      }),
    },
    message: {
      create: jest.fn<any>().mockResolvedValue(mockMessage),
      findUnique: jest.fn<any>().mockResolvedValue(null),
      // Écriture de `validatedMentions` : la seule trace durable qu'un `@`
      // envoyé par lien a été reconnu.
      update: jest.fn<any>().mockResolvedValue(undefined),
    },
    conversation: {
      update: jest.fn<any>().mockResolvedValue(undefined),
      findUnique: jest.fn<any>().mockResolvedValue({
        title: 'Test', type: 'group', participants: [{ userId: PEER_USER_ID }],
      }),
    },
    messageAttachment: { findMany: jest.fn<any>().mockResolvedValue([]) },
    userConversationPreferences: { findMany: jest.fn<any>().mockResolvedValue([]) },
    ...overrides,
  } as any;
}

/**
 * Le résolveur de mentions, sous la seule forme structurale que
 * `resolveMessageMentions` consomme. Par défaut il reconnaît `@bob` et le
 * résout vers le pair inscrit de la conversation.
 */
export function makeMentionResolver(overrides: Record<string, any> = {}) {
  return {
    extractMentionsWithParticipants: jest.fn<any>().mockReturnValue(['bob']),
    resolveUsernames: jest.fn<any>().mockResolvedValue(
      new Map([['bob', { id: PEER_USER_ID, username: 'bob' }]])
    ),
    validateMentionPermissions: jest.fn<any>().mockResolvedValue({ validUserIds: [PEER_USER_ID] }),
    createMentions: jest.fn<any>().mockResolvedValue(undefined),
    ...overrides,
  };
}

export function makeNotificationService() {
  return {
    createReplyNotification: jest.fn<any>().mockResolvedValue(null),
    createMentionNotificationsBatch: jest.fn<any>().mockResolvedValue(0),
    createMessageNotification: jest.fn<any>().mockResolvedValue(null),
  };
}

export function makeTranslationService() {
  return { handleNewMessage: jest.fn<any>().mockResolvedValue({ status: 'queued' }) };
}

export function makeSocketIOHandler(hasManager = false) {
  if (!hasManager) {
    return {
      getManager: () => null,
      to: jest.fn(),
      emit: jest.fn(),
      enqueueOfflineLinkMessage: jest.fn(),
      emitUnreadCountsToRecipients: jest.fn(),
      autoDeliverToOnlineRecipients: jest.fn(),
    };
  }
  const emit = jest.fn();
  const to = jest.fn(() => ({ emit }));
  // The manager's offline-queue surface is part of what a link message send
  // must exercise: the room emit only reaches CONNECTED sockets, so without
  // this second call an offline participant never learns the message exists.
  const enqueueOfflineLinkMessage = jest.fn<any>().mockResolvedValue(undefined);
  // Third audience: every recipient's unread badge. The room emit announces the
  // message, the queue replays it — neither moves the counter.
  const emitUnreadCountsToRecipients = jest.fn<any>().mockResolvedValue(undefined);
  // Quatrième obligation, et la seule tournée vers l'EXPÉDITEUR : l'accusé de
  // livraison. Sans elle, l'indicateur de l'auteur d'un message par lien reste
  // sur « envoyé » à vie, même quand tous ses destinataires sont connectés.
  const autoDeliverToOnlineRecipients = jest.fn<any>().mockResolvedValue(undefined);
  return {
    getManager: () => ({
      getIO: () => ({ to }),
      enqueueOfflineLinkMessage,
      emitUnreadCountsToRecipients,
      autoDeliverToOnlineRecipients,
    }),
    to,
    emit,
    enqueueOfflineLinkMessage,
    emitUnreadCountsToRecipients,
    autoDeliverToOnlineRecipients,
  };
}

export async function buildApp(opts: {
  prisma?: any;
  socketIOHandler?: any;
  authContext?: any;
  translationService?: any;
  notificationService?: any;
  mentionService?: any;
} = {}): Promise<FastifyInstance> {
  const ctx = opts.authContext ?? mockAuthContext;
  mockAuthMiddleware.mockImplementation(async (req: any) => {
    req.authContext = ctx;
  });

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', opts.prisma ?? makePrisma());
  app.decorate('socketIOHandler', opts.socketIOHandler ?? makeSocketIOHandler(false));
  app.decorate(
    'translationService',
    opts.translationService === null ? undefined : opts.translationService ?? makeTranslationService()
  );
  app.decorate(
    'notificationService',
    opts.notificationService === null ? undefined : opts.notificationService ?? makeNotificationService()
  );
  app.decorate(
    'mentionService',
    opts.mentionService === null ? undefined : opts.mentionService ?? makeMentionResolver()
  );
  await registerMessageRoutes(app);
  await app.ready();
  return app;
}

/** Les effets post-commit sont fire-and-forget : ils se règlent après le 201. */
export const flushPostSaveEffects = () => new Promise((resolve) => setImmediate(resolve));

export const VALID_BODY = { content: 'Hello!', clientMessageId: CID };
export const ANON_HEADERS = { 'x-session-token': SESSION_TOKEN };

