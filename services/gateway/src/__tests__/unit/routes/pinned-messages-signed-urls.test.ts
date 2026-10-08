/**
 * #9646 — la liste des messages épinglés sert la pièce d'un message protégé
 * sous l'adresse signée de son lecteur ; celle d'un message ordinaire, telle
 * quelle.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify from 'fastify';

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
  performanceLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));
jest.mock('../../../utils/conversation-id-cache', () => ({ resolveConversationId: jest.fn(async (_p: unknown, id: string) => id) }));
jest.mock('../../../routes/conversations/utils/access-control', () => ({
  ...(jest.requireActual('../../../routes/conversations/utils/access-control') as Record<string, unknown>),
  canAccessConversation: jest.fn(async () => true),
}));
jest.mock('../../../services/PresenceVisibilityService', () => ({
  getPresenceVisibilityService: () => ({ resolveForTargets: jest.fn(async () => new Map()) }),
}));

import { registerMessagePinRoutes } from '../../../routes/conversations/messages-pin';

const CONV_ID = '507f1f77bcf86cd799439101';
const USER_ID = '507f1f77bcf86cd799439122';
const READER = '507f1f77bcf86cd799439155';
const MSG_ID = '507f1f77bcf86cd799439133';
const ATT_ID = '507f1f77bcf86cd799439144';
const KEY = '2026/09/507f1f77bcf86cd799439122/photo.jpg';

async function pinnedFileUrl(protection: Record<string, unknown>): Promise<string> {
  const row = {
    id: MSG_ID, conversationId: CONV_ID, senderId: READER, content: 'x', originalLanguage: 'fr', messageType: 'image',
    editedAt: null, deletedAt: null, replyToId: null, forwardedFromId: null, forwardedFromConversationId: null,
    pinnedAt: new Date(), pinnedBy: USER_ID, isViewOnce: false, isBlurred: false, expiresAt: null, effectFlags: 0, ephemeralDuration: null,
    translations: null, createdAt: new Date(), updatedAt: new Date(), metadata: null, sender: null, _count: { reactions: 0, replies: 0 },
    ...protection,
    attachments: [{ id: ATT_ID, mimeType: 'image/jpeg', thumbnailUrl: null, fileUrl: KEY }],
  };
  const prisma = {
    participant: { findFirst: jest.fn(async () => ({ id: READER, userId: USER_ID, isActive: true, joinedAt: new Date(0), shareLinkId: null, permissions: null })) },
    userConversationPreferences: { findFirst: jest.fn(async () => null) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
    messageAttachment: { findMany: jest.fn(async () => [{ id: ATT_ID, isViewOnce: false, isBlurred: false, effectFlags: 0 }]) },
    message: { findMany: jest.fn(async () => [row]), count: jest.fn(async () => 1) },
  };
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const auth = async (req: any) => {
    req.authContext = { type: 'registered', isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  };
  registerMessagePinRoutes(app, prisma as never, auth, { getManager: () => null } as never);
  await app.ready();
  try {
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONV_ID}/pinned-messages` });
    return JSON.parse(res.payload).data[0].attachments[0].fileUrl;
  } finally {
    await app.close();
  }
}

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 3).toString('base64');
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

describe('GET /conversations/:id/pinned-messages — #9646', () => {
  it('signe pour son lecteur la pièce d’un message à vue unique épinglé', async () => {
    expect(await pinnedFileUrl({ isViewOnce: true })).toMatch(new RegExp(`^/api/v1/attachments/signed/${ATT_ID}\\.${READER}\\.`));
  });

  it('sert la pièce d’un message ordinaire telle quelle', async () => {
    expect(await pinnedFileUrl({})).toBe(KEY);
  });
});
