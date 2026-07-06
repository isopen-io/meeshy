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
const BOUNDARY = 'teststuff123';
const CT = `multipart/form-data; boundary=${BOUNDARY}`;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function multipartFile(filename: string, mimeType: string, content = 'FAKEDATA'): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `\r\n` +
    `${content}\r\n` +
    `--${BOUNDARY}--\r\n`
  );
}

function multipartFileWithMetadata(filename: string, mimeType: string, metadataJson: string): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `\r\n` +
    `FAKEDATA\r\n` +
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="metadata_0"\r\n` +
    `\r\n` +
    `${metadataJson}\r\n` +
    `--${BOUNDARY}--\r\n`
  );
}

function multipartFileWithExtraField(filename: string, mimeType: string): string {
  return (
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="files"; filename="${filename}"\r\n` +
    `Content-Type: ${mimeType}\r\n` +
    `\r\n` +
    `FAKEDATA\r\n` +
    `--${BOUNDARY}\r\n` +
    `Content-Disposition: form-data; name="other_field"\r\n` +
    `\r\n` +
    `some_value\r\n` +
    `--${BOUNDARY}--\r\n`
  );
}

// ─── Factories ────────────────────────────────────────────────────────────────

function makePrisma(shareLink: any = { allowAnonymousFiles: true, allowAnonymousImages: true }) {
  return {
    conversationShareLink: {
      findUnique: jest.fn<any>().mockResolvedValue(shareLink),
    },
  };
}

async function buildApp({
  authenticated = true,
  isAnonymous = false,
  participantId = null as string | null,
  prisma = makePrisma() as any,
}: {
  authenticated?: boolean;
  isAnonymous?: boolean;
  participantId?: string | null;
  prisma?: any;
} = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  const authOptional = async (req: any) => {
    if (!authenticated && !isAnonymous) return;
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
  registerUploadRoutes(app, authOptional, prisma);
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
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': 'multipart/form-data; boundary=---boundary' },
      payload: '-----boundary--\r\n',
    });
    expect(res.statusCode).toBe(400);
  });
});

describe('POST /attachments/upload — authenticated success', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-1', fileUrl: 'http://example.com/f.jpg' }]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 with attachments on successful upload', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    expect(body.data.attachments).toHaveLength(1);
  });

  it('calls uploadMultiple with the file, userId, isAnonymous=false, and no metadataMap', async () => {
    mockUploadMultiple.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('doc.pdf', 'application/pdf'),
    });
    expect(res.statusCode).toBe(200);
    expect(mockUploadMultiple).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ filename: 'doc.pdf', mimeType: 'application/pdf' })]),
      USER_ID,
      false,
      undefined,
      undefined,
    );
  });
});

describe('POST /attachments/upload — with metadata field', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-2' }]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('passes metadataMap when valid metadata_0 field is included', async () => {
    mockUploadMultiple.mockClear();
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileWithMetadata('video.mp4', 'video/mp4', JSON.stringify({ duration: 42 })),
    });
    expect(res.statusCode).toBe(200);
    expect(mockUploadMultiple).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ filename: 'video.mp4' })]),
      USER_ID,
      false,
      undefined,
      expect.any(Map),
    );
  });
});

describe('POST /attachments/upload — invalid metadata JSON', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-3' }]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('ignores unparseable metadata and still returns 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileWithMetadata('photo.jpg', 'image/jpeg', '{not valid json}'),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /attachments/upload — non-metadata field ignored', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-extra' }]);
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('ignores fields whose name does not start with metadata_ and returns 200', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFileWithExtraField('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /attachments/upload — service error', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockRejectedValue(new Error('storage failure'));
    app = await buildApp();
  });
  afterAll(async () => { await app.close(); });

  it('returns 500 when uploadMultiple throws', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(500);
  });

  it('returns 500 with fallback message when error has no message property', async () => {
    const errWithoutMessage = new Error();
    (errWithoutMessage as any).message = '';
    mockUploadMultiple.mockRejectedValue(errWithoutMessage);
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(500);
  });
});

describe('POST /attachments/upload — anonymous, non-image file allowed', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-anon-pdf' }]);
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: true, allowAnonymousImages: true }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 200 when anonymous user uploads allowed non-image file', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('document.pdf', 'application/pdf'),
    });
    expect(res.statusCode).toBe(200);
  });
});

describe('POST /attachments/upload — anonymous, shareLink not found', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma(null),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when share link does not exist', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /attachments/upload — anonymous, image upload blocked', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: true, allowAnonymousImages: false }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous image upload is not allowed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /attachments/upload — anonymous, non-image file upload blocked', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    app = await buildApp({
      authenticated: false,
      isAnonymous: true,
      participantId: 'part-001',
      prisma: makePrisma({ allowAnonymousFiles: false, allowAnonymousImages: true }),
    });
  });
  afterAll(async () => { await app.close(); });

  it('returns 403 when anonymous file upload is not allowed', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('document.pdf', 'application/pdf'),
    });
    expect(res.statusCode).toBe(403);
  });
});

describe('POST /attachments/upload — anonymous without participantId', () => {
  let app: FastifyInstance;
  beforeAll(async () => {
    mockUploadMultiple.mockResolvedValue([{ id: 'att-anon' }]);
    app = await buildApp({ authenticated: false, isAnonymous: true, participantId: null });
  });
  afterAll(async () => { await app.close(); });

  it('skips permission check and returns 200 when participantId is null', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload',
      headers: { 'content-type': CT },
      payload: multipartFile('photo.jpg', 'image/jpeg'),
    });
    expect(res.statusCode).toBe(200);
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

  it('returns 500 with fallback message when error has no message', async () => {
    const errNoMsg = new Error();
    (errNoMsg as any).message = '';
    mockCreateTextAttachment.mockRejectedValue(errNoMsg);
    const res = await app.inject({
      method: 'POST',
      url: '/attachments/upload-text',
      payload: { content: 'test' },
    });
    expect(res.statusCode).toBe(500);
  });
});
