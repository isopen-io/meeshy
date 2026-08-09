/**
 * `PUT` / `DELETE /conversations/:id/messages/:messageId/pin`.
 *
 * Épingler et dépingler sont le même geste, sur le même objet, depuis la même
 * route. Seul l'un des deux localisait le message DANS la conversation : le
 * dépinglage écrivait `where: { id: messageId }`, sans jamais vérifier que le
 * message appartient à la conversation dont l'appelant est membre.
 *
 * Ce que ça donne : un membre actif de n'importe quelle conversation peut
 * dépingler un message de N'IMPORTE QUELLE autre, s'il en connaît l'id — ce que
 * tout ancien membre a en cache. La diffusion `message:unpinned` part alors vers
 * la conversation de la ROUTE, jamais vers celle du message : les clients de la
 * conversation touchée gardent l'épingle affichée jusqu'au prochain chargement
 * complet.
 *
 * Tous les siblings de ce fichier (pin, consume, edit, delete) localisent
 * d'abord le message par `{ id, conversationId }`. Le dépinglage était le seul
 * à ne pas le faire.
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

// ─── Import après les mocks ───────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

// ─── Constantes ───────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const OTHER_CONV_ID = '507f1f77bcf86cd7994390ff';
const USER_ID = '507f1f77bcf86cd799439022';
const MESSAGE_ID = '507f1f77bcf86cd799439033';

// ─── Fabrique d'application ───────────────────────────────────────────────────

/**
 * `findFirst` répond comme le ferait Prisma : la ligne n'est rendue que si le
 * `conversationId` demandé est bien celui du message. C'est exactement la
 * discrimination que la route de dépinglage ne faisait pas.
 */
function buildPrisma(message: { id: string; conversationId: string } | null) {
  const update = jest.fn(async (args: any) => {
    const matches =
      message !== null &&
      args.where.id === message.id &&
      (args.where.conversationId === undefined || args.where.conversationId === message.conversationId);
    if (!matches) {
      const notFound: any = new Error('An operation failed because it depends on one or more records that were required but not found.');
      notFound.code = 'P2025';
      throw notFound;
    }
    return { ...message, ...args.data };
  });

  return {
    update,
    prisma: {
      message: {
        findFirst: jest.fn(async (args: any) => {
          if (!message) return null;
          if (args.where.id !== message.id) return null;
          if (args.where.conversationId !== undefined && args.where.conversationId !== message.conversationId) return null;
          return message;
        }),
        update,
      },
      participant: { findFirst: jest.fn().mockResolvedValue(null) },
      user: { findFirst: jest.fn().mockResolvedValue(null) },
    } as any,
  };
}

function buildSocket() {
  const emit = jest.fn((_event: string, _payload: unknown) => undefined);
  const to = jest.fn((_room: string) => ({ emit }));
  const enqueueOfflineMessageMutation = jest.fn().mockResolvedValue(undefined);
  return {
    emit,
    to,
    enqueueOfflineMessageMutation,
    handler: {
      getManager: () => ({
        getIO: () => ({ to }),
        enqueueOfflineMessageMutation,
      }),
    },
  };
}

async function buildApp(message: { id: string; conversationId: string } | null) {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const socket = buildSocket();
  (app as any).socketIOHandler = socket.handler;
  (app as any).notificationService = null;

  const { prisma, update } = buildPrisma(message);

  const auth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  registerMessagesRoutes(app, prisma, {} as any, auth, auth);
  await app.ready();
  return { app, prisma, update, socket };
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('DELETE /conversations/:id/messages/:messageId/pin', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('dépingle un message qui appartient bien à la conversation', async () => {
    const { app, update, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(200);
      expect(update).toHaveBeenCalledTimes(1);
      expect(update.mock.calls[0][0]).toMatchObject({ data: { pinnedAt: null, pinnedBy: null } });
      expect(socket.to).toHaveBeenCalledWith(`conversation:${CONV_ID}`);
      expect(socket.emit).toHaveBeenCalledWith('message:unpinned', expect.objectContaining({ messageId: MESSAGE_ID }));
    } finally {
      await app.close();
    }
  });

  it("n'écrit rien quand le message appartient à une AUTRE conversation", async () => {
    const { app, update, socket } = await buildApp({ id: MESSAGE_ID, conversationId: OTHER_CONV_ID });
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(404);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it("ne diffuse rien vers la conversation de la route quand le message est ailleurs", async () => {
    const { app, socket } = await buildApp({ id: MESSAGE_ID, conversationId: OTHER_CONV_ID });
    try {
      await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(socket.emit).not.toHaveBeenCalled();
      expect(socket.enqueueOfflineMessageMutation).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });

  it('rend 404, et non 500, pour un identifiant de message inconnu', async () => {
    const { app } = await buildApp(null);
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(404);
    } finally {
      await app.close();
    }
  });

  it('refuse un non-membre avant toute écriture', async () => {
    mockCanAccessConversation.mockResolvedValue(false);
    const { app, update } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      const res = await app.inject({ method: 'DELETE', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(403);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});

describe('PUT /conversations/:id/messages/:messageId/pin', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('épingle un message de la conversation et le diffuse', async () => {
    const { app, update, socket } = await buildApp({ id: MESSAGE_ID, conversationId: CONV_ID });
    try {
      const res = await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(200);
      expect(res.json().data.pinnedBy).toBe(USER_ID);
      expect(update).toHaveBeenCalledTimes(1);
      expect(socket.emit).toHaveBeenCalledWith('message:pinned', expect.objectContaining({ messageId: MESSAGE_ID }));
    } finally {
      await app.close();
    }
  });

  it("n'épingle pas un message d'une AUTRE conversation", async () => {
    const { app, update } = await buildApp({ id: MESSAGE_ID, conversationId: OTHER_CONV_ID });
    try {
      const res = await app.inject({ method: 'PUT', url: `/conversations/${CONV_ID}/messages/${MESSAGE_ID}/pin` });
      expect(res.statusCode).toBe(404);
      expect(update).not.toHaveBeenCalled();
    } finally {
      await app.close();
    }
  });
});
