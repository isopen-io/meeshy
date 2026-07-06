/**
 * Unit tests for the GET /conversations/:id/messages `meta.userLanguage`
 * resolution — specifically that it honours the Prisme Linguistique
 * 4th-priority device locale (2026-05-26 extension).
 *
 * The list endpoint returns `meta.userLanguage` to clients (iOS SDK + web
 * parse it). The gateway must resolve it via `resolveUserLanguage(prefs,
 * { deviceLocale })` so the value agrees with the socket-connection path
 * (`resolveUserLanguagesOrdered`) and NotificationService, both of which
 * already propagate `deviceLocale`.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks (before importing the route module) ─────────────────────────────────

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

// ─── Import after mocks ────────────────────────────────────────────────────────

import { registerMessagesRoutes } from '../../../routes/conversations/messages';

// ─── Constants ─────────────────────────────────────────────────────────────────

const CONV_ID = '507f1f77bcf86cd799439011';
const USER_ID = '507f1f77bcf86cd799439022';

// ─── App factory ───────────────────────────────────────────────────────────────

type Prefs = {
  systemLanguage: string | null;
  regionalLanguage: string | null;
  customDestinationLanguage: string | null;
  deviceLocale: string | null;
};

async function buildApp(prefs: Prefs | null): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  (app as any).socketIOHandler = { getManager: () => null };
  (app as any).notificationService = null;

  const prisma: any = {
    participant: { findFirst: jest.fn().mockResolvedValue(null) },
    message: {
      count: jest.fn().mockResolvedValue(0),
      findMany: jest.fn().mockResolvedValue([]),
    },
    user: { findFirst: jest.fn().mockResolvedValue(prefs) },
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

  registerMessagesRoutes(app, prisma, {} as any, optionalAuth, optionalAuth);
  await app.ready();
  return app;
}

async function fetchUserLanguage(prefs: Prefs | null): Promise<string> {
  const app = await buildApp(prefs);
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/messages` });
    expect(res.statusCode).toBe(200);
    return res.json().meta.userLanguage;
  } finally {
    await app.close();
  }
}

// ─── Tests ───────────────────────────────────────────────────────────────────

describe('GET /conversations/:id/messages — meta.userLanguage', () => {
  beforeEach(() => {
    mockResolveConversationId.mockResolvedValue(CONV_ID);
    mockCanAccessConversation.mockResolvedValue(true);
  });

  it('uses deviceLocale (Prisme 4th priority) when all in-app prefs are absent', async () => {
    const lang = await fetchUserLanguage({
      systemLanguage: null,
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: 'en-US',
    });
    expect(lang).toBe('en');
  });

  it('does not let deviceLocale supplant an in-app systemLanguage', async () => {
    const lang = await fetchUserLanguage({
      systemLanguage: 'fr',
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: 'en',
    });
    expect(lang).toBe('fr');
  });

  it('falls back to fr when in-app prefs and deviceLocale are all absent', async () => {
    const lang = await fetchUserLanguage({
      systemLanguage: null,
      regionalLanguage: null,
      customDestinationLanguage: null,
      deviceLocale: null,
    });
    expect(lang).toBe('fr');
  });
});
