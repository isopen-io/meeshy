/**
 * #8630 — décision porteur 2026-09-29 : quand une flamme-œil se détruit pour un
 * lecteur, elle entraîne, POUR CE LECTEUR, la destruction des réponses qui la
 * citent. Témoins au niveau de la ROUTE : `GET …/messages` et
 * `GET …/messages/search` ne servent plus une réponse dont le message cité est
 * mort pour l'appelant (au-delà de la grâce d'une heure), et servent, dans la
 * grâce, l'échéance du message cité sur la réponse.
 *
 * La réponse est NON éphémère : sans la cascade, rien ne la retirerait.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: (...args: any[]) => mockCanAccessConversation(...args),
}));

jest.mock('../../../services/MentionService', () => ({
  resolveMentionedUsers: jest.fn().mockResolvedValue([]),
}));
jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/messaging/MessagingService', () => ({
  MessagingService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({})),
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({
    resolveForTargets: jest.fn().mockResolvedValue(new Map()),
  }),
}));

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
const READER = '507f1f77bcf86cd799439133';
const AUTHOR = '507f1f77bcf86cd799439144';
const FLAMME = '507f1f77bcf86cd799439201';
const REPONSE = '507f1f77bcf86cd799439202';
const AUTRE = '507f1f77bcf86cd799439203';
const AFTER_READ = MESSAGE_EFFECT_FLAGS.EPHEMERAL | MESSAGE_EFFECT_FLAGS.EPHEMERAL_AFTER_READ;

const sender = { id: AUTHOR, userId: 'u-author', displayName: 'Ada', user: null };

const flammeRow = {
  id: FLAMME,
  conversationId: CONV_ID,
  replyToId: null,
  senderId: AUTHOR,
  ephemeralDuration: null,
  effectFlags: AFTER_READ,
  expiresAt: new Date(Date.now() + 7 * 24 * 3600_000),
};

const pageRow = (id: string, over: Record<string, unknown> = {}) => ({
  id,
  conversationId: CONV_ID,
  senderId: AUTHOR,
  content: `contenu ${id} bonjour`,
  originalLanguage: 'fr',
  messageType: 'text',
  messageSource: 'user',
  isEdited: false,
  isBlurred: false,
  isViewOnce: false,
  effectFlags: 0,
  ephemeralDuration: null,
  expiresAt: null,
  deletedAt: null,
  createdAt: new Date(),
  updatedAt: new Date(),
  translations: null,
  attachments: [],
  sender,
  replyToId: null,
  replyTo: null,
  ...over,
});

const page = () => [pageRow(REPONSE, { replyToId: FLAMME, replyTo: { ...flammeRow, content: 'secret', sender } }), pageRow(AUTRE)];

function buildApp(consumedAt: Date): { app: FastifyInstance } {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: {
      findFirst: jest.fn().mockResolvedValue({ id: READER, userId: USER_ID, isActive: true }),
      findMany: jest.fn().mockResolvedValue([]),
    },
    message: {
      findFirst: jest.fn().mockResolvedValue(null),
      count: jest.fn().mockResolvedValue(2),
      findMany: jest.fn(async ({ where }: { where: Record<string, any> }) => {
        if (where?.id?.in) return [flammeRow].filter((row) => where.id.in.includes(row.id));
        if (where?.NOT) return [];
        return page();
      }),
    },
    messageStatusEntry: {
      findMany: jest.fn(async ({ where }: { where: Record<string, any> }) =>
        where?.messageId?.in?.includes(FLAMME)
          ? [{ messageId: FLAMME, participantId: READER, ephemeralExpiresAt: consumedAt }]
          : [],
      ),
    },
    user: {
      findFirst: jest.fn().mockResolvedValue({
        systemLanguage: 'fr', regionalLanguage: null, customDestinationLanguage: null, deviceLocale: null,
      }),
    },
    reaction: { findMany: jest.fn().mockResolvedValue([]) },
    attachmentStatusEntry: { findMany: jest.fn().mockResolvedValue([]) },
  };

  const authMiddleware = async (req: any) => {
    req.authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, authMiddleware, authMiddleware);
  return { app };
}

const served = async (consumedAt: Date, url: string): Promise<Array<Record<string, unknown>>> => {
  const { app } = buildApp(consumedAt);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url });
    expect(res.statusCode).toBe(200);
    return res.json().data as Array<Record<string, unknown>>;
  } finally {
    await app.close();
  }
};

describe('une réponse meurt, pour ce lecteur, avec la flamme-œil qu’elle cite (#8630)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('GET …/messages ne sert plus la réponse une fois la grâce passée', async () => {
    const ids = (await served(new Date(Date.now() - 2 * 3600_000), `/conversations/${CONV_ID}/messages`)).map((m) => m.id);
    expect(ids).toEqual([AUTRE]);
  });

  it('GET …/messages sert, dans la grâce, l’échéance du cité sur la réponse', async () => {
    const consumedAt = new Date(Date.now() - 10 * 60_000);
    const data = await served(consumedAt, `/conversations/${CONV_ID}/messages`);
    const reponse = data.find((m) => m.id === REPONSE);
    expect(reponse?.expiresAt).toBe(consumedAt.toISOString());
    expect(data.find((m) => m.id === AUTRE)?.expiresAt ?? null).toBeNull();
  });

  it('GET …/messages/search ne rend plus la réponse morte pour ce lecteur', async () => {
    const ids = (await served(new Date(Date.now() - 2 * 3600_000), `/conversations/${CONV_ID}/messages/search?q=bonjour`)).map((m) => m.id);
    expect(ids).toEqual([AUTRE]);
  });
});
