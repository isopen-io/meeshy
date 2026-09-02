/**
 * GET /conversations/:id/messages — identité d'un auteur SANS COMPTE.
 *
 * Le nom DONNÉ au formulaire d'entrée prime en `displayName`, le pseudo
 * `ano_…` descend en `username` (handle) — chacun à sa place, comme pour un
 * inscrit. Avant : `displayName` = pseudo et `username` = null, la bulle
 * montrait le pseudo en nom et un « @ » vide.
 *
 * Le profil (`anonymousSession.profile`) porte email/birthday : il ne doit
 * JAMAIS fuiter dans la réponse — seule l'identité résolue en sort.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockResolveConversationId = jest.fn();
jest.mock('../../../utils/conversation-id-cache', () => ({
  resolveConversationId: (...args: any[]) => mockResolveConversationId(...args),
}));

const mockCanAccessConversation = jest.fn();
jest.mock('../../../routes/conversations/utils/access-control', () =>
  (jest.requireActual('../../helpers/acces-conversation-double') as any).doubleAccesConversation(
    jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>,
    (...args: any[]) => mockCanAccessConversation(...args)));

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

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';

function makeAnonymousMessage(profile: Record<string, unknown> | null) {
  return {
    id: '507f1f77bcf86cd799439099',
    conversationId: CONV_ID,
    senderId: 'p_anon_1',
    content: 'Bonjour',
    originalLanguage: 'fr',
    messageType: 'text',
    createdAt: new Date('2026-08-20T08:00:00Z'),
    updatedAt: new Date('2026-08-20T08:00:00Z'),
    attachments: [],
    validatedMentions: null,
    _count: { attachments: 0 },
    sender: {
      id: 'p_anon_1',
      userId: null,
      displayName: 'ano_Jc_n045',
      avatar: null,
      type: 'anonymous',
      role: 'member',
      language: 'fr',
      user: null,
      anonymousSession: profile ? { profile } : null,
    },
  };
}

async function serveMessages(messages: unknown[]): Promise<{ app: FastifyInstance; prisma: any }> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: { findFirst: jest.fn().mockResolvedValue(null) },
    message: {
      count: jest.fn().mockResolvedValue(messages.length),
      findMany: jest.fn().mockResolvedValue(messages),
    },
    user: { findFirst: jest.fn().mockResolvedValue(null) },
  };

  const optionalAuth = async (req: any) => {
    req.authContext = {
      type: 'registered',
      isAuthenticated: true,
      isAnonymous: false,
      userId: USER_ID,
      registeredUser: { id: USER_ID, role: 'USER' },
    };
  };

  mockResolveConversationId.mockResolvedValue(CONV_ID);
  mockCanAccessConversation.mockResolvedValue(true);

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return { app, prisma };
}

describe('GET /conversations/:id/messages — identité d’un auteur anonyme', () => {
  it('met le nom donné en displayName et le pseudo en username', async () => {
    const { app } = await serveMessages([
      makeAnonymousMessage({ firstName: 'Jc', lastName: 'Nm', username: 'ano_Jc_n045', email: 'jc@example.com' }),
    ]);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    const sender = res.json().data[0].sender;

    expect(sender.displayName).toBe('Jc Nm');
    expect(sender.username).toBe('ano_Jc_n045');
    await app.close();
  });

  it('retombe sur le pseudo sans profil — le handle reste le pseudo, jamais vide', async () => {
    const { app } = await serveMessages([makeAnonymousMessage(null)]);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    const sender = res.json().data[0].sender;

    expect(sender.displayName).toBe('ano_Jc_n045');
    expect(sender.username).toBe('ano_Jc_n045');
    await app.close();
  });

  it('ne fuite JAMAIS le profil anonyme (email/birthday) dans la réponse', async () => {
    const { app } = await serveMessages([
      makeAnonymousMessage({ firstName: 'Jc', lastName: 'Nm', email: 'jc@example.com', birthday: '1990-01-01' }),
    ]);
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    const body = JSON.stringify(res.json());

    expect(body).not.toContain('jc@example.com');
    expect(body).not.toContain('1990-01-01');
    expect(body).not.toContain('anonymousSession');
    await app.close();
  });

  it('charge le profil anonyme dans le select — un champ non demandé à Prisma n’existe pas', async () => {
    const { app, prisma } = await serveMessages([]);
    await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });

    const select = prisma.message.findMany.mock.calls[0][0].select;
    expect(select.sender.select.anonymousSession).toEqual({ select: { profile: true } });
    await app.close();
  });
});
