/**
 * #9646 — le détail d'une pièce et la galerie d'une conversation servent les
 * pièces protégées sous les adresses SIGNÉES pour leur lecteur ; une pièce
 * ordinaire garde son adresse et son cache.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { MESSAGE_EFFECT_FLAGS } from '@meeshy/shared/types/message-effect-flags';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), info: jest.fn(), warn: jest.fn() }) },
}));

const mockGetAttachmentWithMetadata = jest.fn<any>();
const mockGetConversationAttachments = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: (...a: unknown[]) => mockGetAttachmentWithMetadata(...a),
    getConversationAttachments: (...a: unknown[]) => mockGetConversationAttachments(...a),
  })),
}));

import { registerMetadataRoutes } from '../../../routes/attachments/metadata';

const USER_ID = '507f1f77bcf86cd799439011';
const READER = 'cccccccccccccccccccccc01';
const CONVERSATION = 'dddddddddddddddddddddd01';
const MESSAGE = 'bbbbbbbbbbbbbbbbbbbbbbb1';
const PIECE = 'aaaaaaaaaaaaaaaaaaaaaaa1';
const KEY = '2026/10/68f2a81417a557e8ce4ddfc1/photo.jpg';

const FLAME = { isViewOnce: false, isBlurred: false, effectFlags: MESSAGE_EFFECT_FLAGS.EPHEMERAL, ephemeralDuration: 30, expiresAt: new Date(Date.now() + 3600_000) };
const ORDINARY = { isViewOnce: false, isBlurred: false, effectFlags: 0, ephemeralDuration: null, expiresAt: null };

function makePrisma(carrier: Record<string, unknown>) {
  const row = { id: MESSAGE, conversationId: CONVERSATION, deletedAt: null, viewOnceBurnAt: null, senderId: 'cccccccccccccccccccccc02', createdAt: new Date(), ...carrier };
  return {
    message: {
      findUnique: jest.fn(async () => row),
      findFirst: jest.fn(async () => ({ id: MESSAGE })),
      findMany: jest.fn(async () => [row]),
    },
    messageAttachment: { findMany: jest.fn(async () => [{ id: PIECE, isViewOnce: false, isBlurred: false, effectFlags: 0 }]) },
    participant: {
      findFirst: jest.fn(async () => ({ id: READER, conversationId: CONVERSATION, joinedAt: new Date(0), shareLinkId: null, permissions: null })),
      findUnique: jest.fn(async () => null),
    },
    messageStatusEntry: { findFirst: jest.fn(async () => ({ ephemeralExpiresAt: new Date(Date.now() + 60_000), viewedOnceAt: null })) },
    conversationShareLink: { findUnique: jest.fn(async () => null) },
    userConversationPreferences: { findFirst: jest.fn(async () => null) },
    userMessageDeletion: { findMany: jest.fn(async () => []) },
  };
}

async function buildApp(prisma: unknown): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const authOptional = async (req: any) => {
    req.authContext = { isAuthenticated: true, isAnonymous: false, type: 'registered', userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' } };
  };
  await registerMetadataRoutes(app, authOptional, prisma as never);
  await app.ready();
  return app;
}

const stored = () => ({ id: PIECE, messageId: MESSAGE, fileName: 'photo.jpg', originalName: 'photo.jpg', mimeType: 'image/jpeg', fileSize: 10, fileUrl: KEY, uploadedBy: USER_ID, createdAt: new Date(), translations: null, transcription: null });

beforeEach(() => {
  process.env.ATTACHMENT_URL_SIGNING_KEY = Buffer.alloc(32, 4).toString('base64');
  mockGetAttachmentWithMetadata.mockReset();
  mockGetConversationAttachments.mockReset();
});
afterEach(() => {
  delete process.env.ATTACHMENT_URL_SIGNING_KEY;
});

describe('GET /attachments/:id/metadata', () => {
  it('sert la pièce d’une flamme sous l’adresse signée de son lecteur, en revalidation', async () => {
    mockGetAttachmentWithMetadata.mockResolvedValue(stored());
    const app = await buildApp(makePrisma(FLAME));
    const res = await app.inject({ method: 'GET', url: `/attachments/${PIECE}/metadata` });
    expect(res.statusCode).toBe(200);
    expect(res.json().data.attachment.fileUrl).toMatch(new RegExp(`^/api/v1/attachments/signed/${PIECE}\\.${READER}\\.`));
    expect(res.headers['cache-control']).toBe('private, no-cache');
    await app.close();
  });

  it('sert la pièce d’un message ordinaire telle quelle, sous son cache', async () => {
    mockGetAttachmentWithMetadata.mockResolvedValue(stored());
    const app = await buildApp(makePrisma(ORDINARY));
    const res = await app.inject({ method: 'GET', url: `/attachments/${PIECE}/metadata` });
    expect(res.json().data.attachment.fileUrl).toBe(KEY);
    expect(res.headers['cache-control']).toContain('max-age=3600');
    await app.close();
  });
});

describe('GET /conversations/:id/attachments', () => {
  it('signe pour CE lecteur la pièce protégée de la galerie, laisse l’ordinaire', async () => {
    mockGetConversationAttachments.mockResolvedValue([{ ...stored(), type: 'image' }]);
    const flame = await buildApp(makePrisma(FLAME));
    const signed = await flame.inject({ method: 'GET', url: `/conversations/${CONVERSATION}/attachments` });
    expect(signed.json().data.attachments[0].fileUrl).toMatch(new RegExp(`^/api/v1/attachments/signed/${PIECE}\\.${READER}\\.`));
    await flame.close();

    const plain = await buildApp(makePrisma(ORDINARY));
    const kept = await plain.inject({ method: 'GET', url: `/conversations/${CONVERSATION}/attachments` });
    expect(kept.json().data.attachments[0].fileUrl).toBe(KEY);
    await plain.close();
  });
});
