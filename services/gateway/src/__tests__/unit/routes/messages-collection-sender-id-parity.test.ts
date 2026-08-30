/**
 * #4177 — `senderId` doit avoir UNE seule signification (`User.id`) sur
 * TOUTES les portes qui lisent la collection de messages d'une conversation.
 *
 * En base, `Message.senderId` est une FK vers `Participant.id` — jamais vers
 * `User.id`. `GET /conversations/:id/messages` le résout depuis toujours
 * (`message.sender?.userId ?? message.sender?.user?.id ?? message.senderId`),
 * parce que les clients (iOS/web) comparent `senderId` à LEUR `userId` pour
 * décider « est-ce moi qui ai envoyé ce message ? ». `GET
 * /conversations/:id/messages/search` et `GET /conversations/:id/pinned-messages`
 * — deux AUTRES portes du même fichier sur la MÊME collection — servaient le
 * `Participant.id` BRUT, non résolu : le même message change de `senderId`
 * selon la porte par laquelle on le lit, et « est-ce moi ? » répond FAUX sur
 * deux portes sur trois.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (avant l'import du module de route) ────────────────────────────────

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

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
/** Le `Participant.id` de l'expéditeur — c'est CE qui fuyait, brut, en `senderId`. */
const SENDER_PARTICIPANT_ID = '507f1f77bcf86cd799439133';
/** Le `User.id` du même expéditeur — c'est ce que `senderId` DOIT porter. */
const SENDER_USER_ID = '507f1f77bcf86cd799439144';
const MESSAGE_ID = '507f1f77bcf86cd799439255';

function buildApp(): { app: FastifyInstance; prisma: any } {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const senderParticipant = {
    id: SENDER_PARTICIPANT_ID,
    userId: SENDER_USER_ID,
    displayName: 'Alice',
    avatar: null,
    type: 'member',
    user: { id: SENDER_USER_ID, username: 'alice', displayName: 'Alice', avatar: null, isOnline: false, firstName: null, lastName: null },
  };

  const prisma: any = {
    participant: {
      // Le LECTEUR — distinct de l'expéditeur — pour `loadReaderHistoryFloor`.
      findFirst: jest.fn().mockResolvedValue({ id: 'reader-part-id', userId: USER_ID, isActive: true }),
    },
    message: {
      count: jest.fn().mockResolvedValue(1),
      findMany: jest.fn().mockResolvedValue([
        {
          id: MESSAGE_ID,
          conversationId: CONV_ID,
          // La FK brute, telle que stockée : c'est un `Participant.id`.
          senderId: SENDER_PARTICIPANT_ID,
          content: 'bonjour',
          originalLanguage: 'fr',
          messageType: 'text',
          editedAt: null,
          deletedAt: null,
          replyToId: null,
          forwardedFromId: null,
          forwardedFromConversationId: null,
          pinnedAt: new Date('2026-08-20T10:00:00.000Z'),
          pinnedBy: SENDER_PARTICIPANT_ID,
          isViewOnce: false,
          isBlurred: false,
          expiresAt: null,
          effectFlags: 0,
          translations: null,
          metadata: null,
          createdAt: new Date('2026-08-20T10:00:00.000Z'),
          updatedAt: new Date('2026-08-20T10:00:00.000Z'),
          sender: senderParticipant,
          attachments: [],
          _count: { reactions: 0, replies: 0 },
        },
      ]),
    },
  };

  const authMiddleware = async (req: any) => {
    req.authContext = {
      type: 'registered', isAuthenticated: true, isAnonymous: false,
      userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, authMiddleware, authMiddleware);
  return { app, prisma };
}

describe('senderId résout au User.id sur les quatre vues (#4177 critère 6)', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('GET .../pinned-messages sert senderId = User.id, pas le Participant.id brut', async () => {
    const { app } = buildApp();
    await app.ready();
    try {
      const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/pinned-messages` });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data[0].senderId).toBe(SENDER_USER_ID);
      expect(body.data[0].senderId).not.toBe(SENDER_PARTICIPANT_ID);
    } finally {
      await app.close();
    }
  });

  it('GET .../messages/search sert senderId = User.id, pas le Participant.id brut', async () => {
    const { app } = buildApp();
    await app.ready();
    try {
      const res = await app.inject({
        method: 'GET',
        url: `/conversations/${CONV_ID}/messages/search?q=bonjour`,
      });
      expect(res.statusCode).toBe(200);
      const body = JSON.parse(res.payload);
      expect(body.data[0].senderId).toBe(SENDER_USER_ID);
      expect(body.data[0].senderId).not.toBe(SENDER_PARTICIPANT_ID);
    } finally {
      await app.close();
    }
  });
});
