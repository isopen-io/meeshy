/**
 * Unit tests for attachments/upload.ts
 * Tests POST /attachments/upload, POST /attachments/upload-text
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeAll, afterAll } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Mocks ────────────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  messageAttachmentSchema: { type: 'object', properties: { id: { type: 'string' } } },
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

const mockUploadMultiple = jest.fn<any>();
const mockCreateTextAttachment = jest.fn<any>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: any[]) => mockUploadMultiple(...a),
    createTextAttachment: (...a: any[]) => mockCreateTextAttachment(...a),
  })),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';

// ─── Constants ────────────────────────────────────────────────────────────────

const USER_ID = '507f1f77bcf86cd799439011';

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma() {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue({ allowAnonymousFiles: true, allowAnonymousImages: true }),
    },
  };
}

async function buildApp({
  authenticated = true,
  isAnonymous = false,
  participantId = null as string | null,
}: { authenticated?: boolean; isAnonymous?: boolean; participantId?: string | null } = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const authOptional = async (req: any) => {
    if (!authenticated && !isAnonymous) return; // no authContext for unauthenticated guest
    if (authenticated) {
      (req as any).authContext = {
        isAuthenticated: true,
        isAnonymous: false,
        userId: USER_ID,
        registeredUser: { id: USER_ID, role: 'USER' },
        participantId: null,
      };
    } else if (isAnonymous) {
      (req as any).authContext = {
        isAuthenticated: false,
        isAnonymous: true,
        userId: 'anon-session',
        participantId,
        anonymousUser: { shareLinkId: 'sl-001', username: 'AnonUser' },
      };
    }
  };

  await app.register(multipart);
  registerUploadRoutes(app, authOptional, makePrisma() as any);
  await app.ready();
  return app;
}

// ─── POST /attachments/upload ─────────────────────────────────────────────────

describe('POST /attachments/upload — not authenticated (no authContext)', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ authenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({ method: 'POST', url: '/attachments/upload' });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /attachments/upload — no files', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 400 when no files are provided', async () => {
    // POST without multipart content → parts() yields nothing
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: '-----boundary--\r\n',
    });
    expect(res.statusCode).toBe(400);
  });
});


// ─── POST /attachments/upload-text ────────────────────────────────────────────

describe('POST /attachments/upload-text — not authenticated', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({ authenticated: false, isAnonymous: false });
  });
  afterAll(async () => { await app.close(); });

  it('returns 401 when not authenticated', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'hello' },
    });
    expect(res.statusCode).toBe(401);
  });
});

describe('POST /attachments/upload-text — success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockResolvedValue({ id: 'att-1', fileUrl: 'https://example.com/file.txt' });
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 on successful text attachment creation', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'Hello World', messageId: 'msg-123' },
    });
    expect(res.statusCode).toBe(200);
    expect(res.json().success).toBe(true);
  });

  it('calls createTextAttachment with content and userId', async () => {
    await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'Test content' },
    });
    expect(mockCreateTextAttachment).toHaveBeenCalledWith(
      'Test content',
      USER_ID,
      false,
      undefined,
    );
  });
});

describe('POST /attachments/upload-text — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockCreateTextAttachment.mockRejectedValue(new Error('storage error'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 on service error', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'test' },
    });
    expect(res.statusCode).toBe(500);
  });
});
