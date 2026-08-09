/**
 * Quitter une conversation doit en fermer la porte — y compris celle des
 * accusés de lecture.
 *
 * Le départ d'une conversation ne supprime pas la ligne `Participant` : il la
 * passe à `isActive: false`. Tout ce qui décide « cette personne a-t-elle accès
 * à cette conversation » doit donc filtrer sur `isActive`. `canAccessConversation`
 * le fait, `admitMessageEdit` le fait, et le cycle 38b l'a rétabli sur la
 * suppression.
 *
 * Quatre gardes ne le faisaient pas — et trois d'entre elles vivent dans un
 * fichier où les gardes voisines, elles, filtrent :
 *
 *   - `GET  /messages/:messageId/status-details`
 *   - `GET  /attachments/:attachmentId/status-details`
 *   - `POST /attachments/:attachmentId/status`          ← une ÉCRITURE
 *   - `GET  /messages/:messageId/read-status`           (4 gardes sur 5 filtrent
 *                                                        dans ce fichier)
 *
 * La dernière est la plus visible côté produit : un ancien membre continuait à
 * écrire des reçus d'écoute et de lecture dans une conversation qu'il a quittée
 * — son nom réapparaissait donc dans la liste « qui a écouté » que les membres
 * restants consultent.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Constantes ───────────────────────────────────────────────────────────────

const USER_ID = 'user-departed-1';
const MSG_ID = '507f1f77bcf86cd799439011';
const CONV_ID = '507f1f77bcf86cd799439022';
const ATTACHMENT_ID = '507f1f77bcf86cd799439044';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('../../../middleware/auth', () => ({
  createUnifiedAuthMiddleware: () => async (request: any) => {
    request.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'user-departed-1',
      hasFullAccess: true,
      registeredUser: { id: 'user-departed-1', role: 'USER' },
    };
  },
  isRegisteredUser: (ctx: any) => ctx?.type === 'registered',
}));

jest.mock('../../../services/attachments/index', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/attachments/attachmentIncludes', () => ({
  attachmentMediaSelect: {},
  attachmentFullSelect: {},
  attachmentForwardPreviewSelect: {},
}));

jest.mock('../../../services/message-translation/MessageTranslationService', () => ({
  MessageTranslationService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/TrackingLinkService', () => ({
  TrackingLinkService: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../services/PrivacyPreferencesService', () => ({
  PrivacyPreferencesService: jest.fn().mockImplementation(() => ({
    shouldShowReadReceipts: jest.fn().mockResolvedValue(true),
  })),
}));

jest.mock('../../../validation/helpers', () => ({
  validateParams: jest.fn(() => async () => {}),
  validateBody: jest.fn(() => async () => {}),
  validateQuery: jest.fn(() => async () => {}),
}));

jest.mock('../../../utils/rate-limiter', () => ({
  createCustomRateLimiter: () => ({
    middleware: () => async (_req: unknown, _reply: unknown) => {},
  }),
}));

const mockMarkImageAsViewed = jest.fn().mockResolvedValue(undefined);
const mockGetMessageStatusDetails = jest.fn().mockResolvedValue({
  statuses: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
});
const mockGetAttachmentStatusDetails = jest.fn().mockResolvedValue({
  statuses: [], pagination: { total: 0, limit: 20, offset: 0, hasMore: false },
});
const mockGetMessageReadStatus = jest.fn().mockResolvedValue({ readCount: 0 });

jest.mock('../../../services/MessageReadStatusService', () => ({
  MessageReadStatusService: jest.fn().mockImplementation(() => ({
    getMessageStatusDetails: (...args: any[]) => mockGetMessageStatusDetails(...args),
    getAttachmentStatusDetails: (...args: any[]) => mockGetAttachmentStatusDetails(...args),
    markImageAsViewed: (...args: any[]) => mockMarkImageAsViewed(...args),
    getMessageReadStatus: (...args: any[]) => mockGetMessageReadStatus(...args),
  })),
}));

// ─── Import après les mocks ───────────────────────────────────────────────────

import messageRoutes from '../../../routes/messages';
import messageReadStatusRoutes from '../../../routes/message-read-status';

// ─── Prisma factice qui HONORE le filtre d'appartenance ───────────────────────

/**
 * Le double n'est utile que s'il discrimine ce que la vraie base discrimine :
 * une ligne `isActive: false` ne doit sortir d'un `where` qui exige
 * `isActive: true`. Un mock qui rend la même liste quel que soit le `where`
 * laisserait passer précisément le défaut mesuré ici.
 */
function participantsMatching(where: any, isActive: boolean) {
  const row = { userId: USER_ID, isActive, role: 'member' };
  const matches =
    (where?.userId === undefined || where.userId === row.userId) &&
    (where?.isActive === undefined || where.isActive === row.isActive);
  return matches ? [{ userId: row.userId, role: row.role }] : [];
}

function buildPrisma(isActive: boolean) {
  return {
    message: {
      findFirst: jest.fn(async (args: any) => ({
        id: MSG_ID,
        conversationId: CONV_ID,
        content: 'Hello',
        deletedAt: null,
        conversation: {
          id: CONV_ID,
          participants: participantsMatching(args?.include?.conversation?.include?.participants?.where, isActive),
        },
      })),
      findUnique: jest.fn(async (args: any) => ({
        id: MSG_ID,
        conversationId: CONV_ID,
        conversation: {
          id: CONV_ID,
          participants: participantsMatching(args?.select?.conversation?.include?.participants?.where, isActive),
        },
      })),
    },
    messageAttachment: {
      findFirst: jest.fn(async (args: any) => ({
        id: ATTACHMENT_ID,
        messageId: MSG_ID,
        message: {
          id: MSG_ID,
          conversationId: CONV_ID,
          conversation: {
            id: CONV_ID,
            participants: participantsMatching(
              args?.include?.message?.include?.conversation?.include?.participants?.where,
              isActive
            ),
          },
        },
      })),
    },
    participant: { findFirst: jest.fn().mockResolvedValue(null) },
  } as any;
}

async function buildMessagesApp(isActive: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildPrisma(isActive));
  app.decorate('translationService', {} as any);
  app.decorate('socketIOHandler', { getManager: () => null } as any);
  await app.register(messageRoutes);
  await app.ready();
  return app;
}

async function buildReadStatusApp(isActive: boolean): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', buildPrisma(isActive));
  app.decorate('socketIOHandler', { getManager: () => null } as any);
  await app.register(messageReadStatusRoutes);
  await app.ready();
  return app;
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('Gardes d\'appartenance : un membre qui a quitté la conversation', () => {
  beforeEach(() => {
    mockMarkImageAsViewed.mockClear();
  });

  it('ne lit plus les détails de statut d\'un message', async () => {
    const app = await buildMessagesApp(false);
    try {
      const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/status-details` });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('ne lit plus les détails de statut d\'une pièce jointe', async () => {
    const app = await buildMessagesApp(false);
    try {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/status-details` });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('n\'écrit plus de reçu de consultation sur une pièce jointe', async () => {
    const app = await buildMessagesApp(false);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/status`,
        payload: { action: 'viewed' },
      });
      expect(res.statusCode).toBe(404);
      expect(mockMarkImageAsViewed).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('ne lit plus le statut de lecture d\'un message', async () => {
    const app = await buildReadStatusApp(false);
    try {
      const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/read-status` });
      expect(res.statusCode).toBe(403);
    } finally {
      await app.close();
    }
  });
});

describe('Gardes d\'appartenance : un membre actif garde tous ses accès', () => {
  beforeEach(() => {
    mockMarkImageAsViewed.mockClear();
  });

  it('lit les détails de statut d\'un message', async () => {
    const app = await buildMessagesApp(true);
    try {
      const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/status-details` });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('lit les détails de statut d\'une pièce jointe', async () => {
    const app = await buildMessagesApp(true);
    try {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/status-details` });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });

  it('écrit son reçu de consultation sur une pièce jointe', async () => {
    const app = await buildMessagesApp(true);
    try {
      const res = await app.inject({
        method: 'POST',
        url: `/attachments/${ATTACHMENT_ID}/status`,
        payload: { action: 'viewed' },
      });
      expect(res.statusCode).toBe(200);
      expect(mockMarkImageAsViewed).toHaveBeenCalledTimes(1);
    } finally {
      await app.close();
    }
  });

  it('lit le statut de lecture d\'un message', async () => {
    const app = await buildReadStatusApp(true);
    try {
      const res = await app.inject({ method: 'GET', url: `/messages/${MSG_ID}/read-status` });
      expect(res.statusCode).toBe(200);
    } finally {
      await app.close();
    }
  });
});
