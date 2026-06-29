/**
 * Unit tests for attachment metadata routes (metadata.ts)
 * Tests GET /attachments/:attachmentId/metadata, DELETE /attachments/:attachmentId,
 * GET /conversations/:conversationId/attachments.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn(),
    })),
  },
}));

const mockGetAttachmentWithMetadata = jest.fn<any>().mockResolvedValue(null);
const mockGetAttachment = jest.fn<any>().mockResolvedValue(null);
const mockDeleteAttachment = jest.fn<any>().mockResolvedValue(undefined);
const mockGetConversationAttachments = jest.fn<any>().mockResolvedValue([]);

jest.mock('../../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachmentWithMetadata: (...args: any[]) => mockGetAttachmentWithMetadata(...args),
    getAttachment: (...args: any[]) => mockGetAttachment(...args),
    deleteAttachment: (...args: any[]) => mockDeleteAttachment(...args),
    getConversationAttachments: (...args: any[]) => mockGetConversationAttachments(...args),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerMetadataRoutes } from '../../../../routes/attachments/metadata';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';
const ATTACHMENT_ID = 'att-001';
const CONVERSATION_ID = '507f1f77bcf86cd799439022';

const mockAttachment = {
  id: ATTACHMENT_ID,
  uploadedBy: USER_ID,
  isAnonymous: false,
  updatedAt: new Date('2024-01-01'),
  fileUrl: 'https://cdn.example.com/file.mp3',
  fileName: 'file.mp3',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────

function makePrisma(overrides: Record<string, any> = {}) {
  return {
    participant: {
      findFirst: jest.fn<any>().mockResolvedValue({ id: 'part-1' }),
      findUnique: jest.fn<any>().mockResolvedValue(null),
    },
    ...overrides,
  } as any;
}

async function buildApp(opts: {
  auth?: 'authenticated' | 'unauthenticated' | 'anonymous';
  userId?: string;
  role?: string;
  prisma?: any;
} = {}): Promise<{ app: FastifyInstance }> {
  const { auth = 'authenticated', userId = USER_ID, role = 'USER', prisma = makePrisma() } = opts;

  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  app.decorate('prisma', prisma);

  const authContext = auth === 'authenticated'
    ? { isAuthenticated: true, isAnonymous: false, userId, registeredUser: { id: userId, role } }
    : auth === 'anonymous'
    ? { isAuthenticated: false, isAnonymous: true, userId: 'anon-1', registeredUser: null }
    : null;

  const authRequired = async (req: FastifyRequest) => {
    if (auth !== 'authenticated') {
      // auth required hook — set no authContext; handler won't be reached
      (req as any).authContext = null;
    } else {
      (req as any).authContext = authContext;
    }
  };

  const authOptional = async (req: FastifyRequest) => {
    (req as any).authContext = authContext;
  };

  await registerMetadataRoutes(app, authRequired, authOptional, prisma);
  await app.ready();
  return { app };
}

// ─── GET /attachments/:attachmentId/metadata ──────────────────────────────────

describe('GET /attachments/:id/metadata — not found', () => {
  it('returns 404 when attachment does not exist', async () => {
    mockGetAttachmentWithMetadata.mockResolvedValueOnce(null);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('GET /attachments/:id/metadata — success', () => {
  it('returns 200 with attachment data', async () => {
    mockGetAttachmentWithMetadata.mockResolvedValueOnce(mockAttachment);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /attachments/:id/metadata — ETag 304', () => {
  it('returns 304 when ETag matches', async () => {
    const att = { ...mockAttachment, updatedAt: new Date('2024-01-01') };
    mockGetAttachmentWithMetadata.mockResolvedValueOnce(att);
    const { app } = await buildApp();
    const etag = `"${att.id}-${att.updatedAt.getTime()}"`;
    const res = await app.inject({
      method: 'GET',
      url: `/attachments/${ATTACHMENT_ID}/metadata`,
      headers: { 'if-none-match': etag },
    });
    expect(res.statusCode).toBe(304);
    await app.close();
  });
});

describe('GET /attachments/:id/metadata — service error', () => {
  it('returns 500 when service throws', async () => {
    mockGetAttachmentWithMetadata.mockRejectedValueOnce(new Error('DB error'));
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/metadata` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── DELETE /attachments/:attachmentId ───────────────────────────────────────

describe('DELETE /attachments/:id — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('DELETE /attachments/:id — attachment not found', () => {
  it('returns 404 when attachment does not exist', async () => {
    mockGetAttachment.mockResolvedValueOnce(null);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });
});

describe('DELETE /attachments/:id — forbidden (not owner)', () => {
  it('returns 403 when user is not the attachment owner', async () => {
    mockGetAttachment.mockResolvedValueOnce({ ...mockAttachment, uploadedBy: 'other-user' });
    const { app } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });
});

describe('DELETE /attachments/:id — success (owner)', () => {
  it('returns 200 when user is the attachment owner', async () => {
    mockGetAttachment.mockResolvedValueOnce(mockAttachment);
    mockDeleteAttachment.mockResolvedValueOnce(undefined);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('DELETE /attachments/:id — success (admin)', () => {
  it('returns 200 when admin deletes other user attachment', async () => {
    mockGetAttachment.mockResolvedValueOnce({ ...mockAttachment, uploadedBy: 'other-user' });
    mockDeleteAttachment.mockResolvedValueOnce(undefined);
    const { app } = await buildApp({ role: 'ADMIN' });
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /attachments/:id — anonymous owner', () => {
  it('returns 200 when anonymous user deletes own anonymous attachment', async () => {
    mockGetAttachment.mockResolvedValueOnce({ uploadedBy: 'anon-1', isAnonymous: true });
    mockDeleteAttachment.mockResolvedValueOnce(undefined);
    const { app } = await buildApp({ auth: 'anonymous' });
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

describe('DELETE /attachments/:id — service error', () => {
  it('returns 500 when delete throws', async () => {
    mockGetAttachment.mockResolvedValueOnce(mockAttachment);
    mockDeleteAttachment.mockRejectedValueOnce(new Error('storage error'));
    const { app } = await buildApp();
    const res = await app.inject({ method: 'DELETE', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(500);
    await app.close();
  });
});

// ─── GET /conversations/:conversationId/attachments ───────────────────────────

describe('GET /conversations/:id/attachments — unauthenticated', () => {
  it('returns 401 when no auth', async () => {
    const { app } = await buildApp({ auth: 'unauthenticated' });
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONVERSATION_ID}/attachments` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });
});

describe('GET /conversations/:id/attachments — success (empty)', () => {
  it('returns 200 with empty attachments array', async () => {
    mockGetConversationAttachments.mockResolvedValueOnce([]);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONVERSATION_ID}/attachments` });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
    await app.close();
  });
});

describe('GET /conversations/:id/attachments — success with results', () => {
  it('returns 200 with attachment list', async () => {
    mockGetConversationAttachments.mockResolvedValueOnce([mockAttachment]);
    const { app } = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/conversations/${CONVERSATION_ID}/attachments?type=audio&limit=20&offset=0` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
