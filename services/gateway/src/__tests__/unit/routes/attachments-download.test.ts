/**
 * Unit tests for GET /attachments/:attachmentId
 *                GET /attachments/:attachmentId/thumbnail
 *                GET /attachments/file/*
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';

// ─── Top-level mock variables (must be declared before jest.mock) ─────────────

const mockGetAttachment = jest.fn<any>();
const mockGetFilePath = jest.fn<any>();
const mockGetThumbnailPath = jest.fn<any>();
const mockStat = jest.fn<any>();

// ─── jest.mock calls ──────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }),
  },
}));

jest.mock('@meeshy/shared/types/api-schemas', () => ({
  errorResponseSchema: { type: 'object', properties: { success: { type: 'boolean' } } },
}));

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    getAttachment: (...a: any[]) => mockGetAttachment(...a),
    getFilePath: (...a: any[]) => mockGetFilePath(...a),
    getThumbnailPath: (...a: any[]) => mockGetThumbnailPath(...a),
  })),
}));

jest.mock('../../../services/attachments/thumbnail', () => ({
  thumbnailContentType: jest.fn<any>().mockReturnValue('image/webp'),
}));

jest.mock('fs/promises', () => ({
  stat: (...a: any[]) => mockStat(...a),
}));

jest.mock('fs', () => ({
  createReadStream: jest.fn<any>().mockReturnValue(
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('stream').Readable.from(['file content'])
  ),
}));

// ─── Import after mocks ───────────────────────────────────────────────────────

import { registerDownloadRoutes } from '../../../routes/attachments/download';

// ─── Constants ────────────────────────────────────────────────────────────────

const ATTACHMENT_ID = 'aabbccddeeff001122334455';
const FILE_PATH = '/some/uploads/attachments/file.jpg';
const THUMBNAIL_PATH = '/some/uploads/attachments/thumb.webp';

// ─── Stub data ────────────────────────────────────────────────────────────────

const DEFAULT_ATTACHMENT = {
  id: ATTACHMENT_ID,
  mimeType: 'image/jpeg',
  originalName: 'photo.jpg',
};

const DEFAULT_STAT = {
  size: 1024,
  mtimeMs: 1700000000000,
};

// ─── App factory ─────────────────────────────────────────────────────────────

async function buildApp(): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  registerDownloadRoutes(app, {} as any);
  await app.ready();
  return app;
}

// ─── beforeEach reset ─────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /attachments/:attachmentId
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /attachments/:attachmentId', () => {
  describe('when attachment is not found', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetAttachment.mockResolvedValue(null);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('when file path is not found', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
      mockGetFilePath.mockResolvedValue(null);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('when file is not on disk (stat throws)', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
      mockGetFilePath.mockResolvedValue(FILE_PATH);
      mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('on success', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
      mockGetFilePath.mockResolvedValue(FILE_PATH);
      mockStat.mockResolvedValue(DEFAULT_STAT);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.statusCode).toBe(200);
    });

    it('sets Content-Type header', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.headers['content-type']).toContain('image/jpeg');
    });

    it('sets Cache-Control immutable header', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.headers['cache-control']).toContain('immutable');
    });

    it('sets CORS header', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('sets X-Content-Type-Options nosniff', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.headers['x-content-type-options']).toBe('nosniff');
    });
  });

  describe('SVG attachment forces download disposition', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetAttachment.mockResolvedValue({ ...DEFAULT_ATTACHMENT, mimeType: 'image/svg+xml', originalName: 'image.svg' });
      mockGetFilePath.mockResolvedValue(FILE_PATH);
      mockStat.mockResolvedValue(DEFAULT_STAT);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.statusCode).toBe(200);
    });

    it('sets Content-Disposition to attachment for SVG', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.headers['content-disposition']).toContain('attachment');
    });

    it('sets Content-Security-Policy sandbox for SVG', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.headers['content-security-policy']).toContain('sandbox');
    });
  });

  describe('when service throws unexpectedly', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetAttachment.mockRejectedValue(new Error('DB connection lost'));
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 500', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /attachments/:attachmentId/thumbnail
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /attachments/:attachmentId/thumbnail', () => {
  describe('when thumbnail path is not found', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetThumbnailPath.mockResolvedValue(null);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('when thumbnail is not on disk (stat throws)', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetThumbnailPath.mockResolvedValue(THUMBNAIL_PATH);
      mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('on success', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetThumbnailPath.mockResolvedValue(THUMBNAIL_PATH);
      mockStat.mockResolvedValue(DEFAULT_STAT);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 200', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
      expect(res.statusCode).toBe(200);
    });

    it('sets image content-type from thumbnailContentType', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
      const ct = res.headers['content-type'] as string;
      expect(ct).toMatch(/image\/(webp|jpeg)/);
    });

    it('sets Cache-Control immutable', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
      expect(res.headers['cache-control']).toContain('immutable');
    });

    it('sets CORS header', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('when service throws unexpectedly', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockGetThumbnailPath.mockRejectedValue(new Error('DB connection lost'));
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 500', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
      expect(res.statusCode).toBe(500);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// GET /attachments/file/*
// ═════════════════════════════════════════════════════════════════════════════

describe('GET /attachments/file/*', () => {
  describe('path traversal attempt', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 403 for ../ traversal encoded in URL', async () => {
      // %2F..%2F..%2Fetc%2Fpasswd decodes to /../../../etc/passwd
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/%2F..%2F..%2Fetc%2Fpasswd',
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
    });

    it('returns 403 for double-encoded traversal (%252F)', async () => {
      // Fastify normalises plain `../..` segments in the URL before they reach
      // the handler, so they never arrive as a traversal.  The real risk is
      // %2F-encoded slashes that survive URL decoding inside the handler.
      // Test a second form: absolute-looking path prefix.
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/%2F..%2Fetc%2Fshadow',
      });
      expect(res.statusCode).toBe(403);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('when file is not on disk', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockStat.mockRejectedValue(Object.assign(new Error('ENOENT'), { code: 'ENOENT' }));
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 404', async () => {
      const res = await app.inject({ method: 'GET', url: '/attachments/file/uploads/file.jpg' });
      expect(res.statusCode).toBe(404);
      const body = res.json();
      expect(body.success).toBe(false);
    });
  });

  describe('ETag / conditional GET', () => {
    let app: FastifyInstance;
    const fileStats = { size: 2048, mtimeMs: 1700000000000 };
    // precompute the etag the route will generate
    const expectedEtag = `W/"${fileStats.size}-${Math.floor(fileStats.mtimeMs)}"`;

    beforeAll(async () => {
      mockStat.mockResolvedValue(fileStats);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 304 when If-None-Match matches ETag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/image.jpg',
        headers: { 'if-none-match': expectedEtag },
      });
      expect(res.statusCode).toBe(304);
    });

    it('returns 200 when If-None-Match does not match ETag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/image.jpg',
        headers: { 'if-none-match': 'W/"stale-etag"' },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe('Range requests on media files', () => {
    let app: FastifyInstance;
    const fileStats = { size: 10000, mtimeMs: 1700000001000 };

    beforeAll(async () => {
      mockStat.mockResolvedValue(fileStats);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 416 for malformed Range header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/audio.mp3',
        headers: { range: 'invalid-range-header' },
      });
      expect(res.statusCode).toBe(416);
    });

    it('returns 416 when range start > end', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/audio.mp3',
        headers: { range: 'bytes=500-100' },
      });
      expect(res.statusCode).toBe(416);
    });

    it('returns 416 when range end >= fileSize', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/audio.mp3',
        headers: { range: `bytes=0-${fileStats.size}` },
      });
      expect(res.statusCode).toBe(416);
    });

    it('returns 206 for valid range request on audio file', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/audio.mp3',
        headers: { range: 'bytes=0-999' },
      });
      expect(res.statusCode).toBe(206);
      expect(res.headers['content-range']).toBe(`bytes 0-999/${fileStats.size}`);
      expect(res.headers['content-length']).toBe('1000');
    });

    it('returns 206 for valid range on video file', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/video.mp4',
        headers: { range: 'bytes=100-199' },
      });
      expect(res.statusCode).toBe(206);
      expect(res.headers['content-type']).toContain('video/mp4');
    });

    it('sets Accept-Ranges: bytes header on media files', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/audio.mp3',
      });
      expect(res.headers['accept-ranges']).toBe('bytes');
    });
  });

  describe('regular file (non-media)', () => {
    let app: FastifyInstance;
    const fileStats = { size: 512, mtimeMs: 1700000002000 };

    beforeAll(async () => {
      mockStat.mockResolvedValue(fileStats);
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('returns 200 for a regular image file', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/photo.jpg',
      });
      expect(res.statusCode).toBe(200);
    });

    it('sets Content-Type based on extension', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/photo.jpg',
      });
      expect(res.headers['content-type']).toContain('image/jpeg');
    });

    it('sets Content-Length', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/photo.jpg',
      });
      expect(res.headers['content-length']).toBe(String(fileStats.size));
    });

    it('sets ETag header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/photo.jpg',
      });
      const expectedEtag = `W/"${fileStats.size}-${Math.floor(fileStats.mtimeMs)}"`;
      expect(res.headers['etag']).toBe(expectedEtag);
    });

    it('sets Cache-Control header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/photo.jpg',
      });
      expect(res.headers['cache-control']).toContain('max-age=31536000');
    });

    it('sets CORS header', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/photo.jpg',
      });
      expect(res.headers['access-control-allow-origin']).toBe('*');
    });

    it('returns 200 for a PDF file', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/doc.pdf',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/pdf');
    });

    it('returns application/octet-stream for unknown extension', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/data.bin',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['content-type']).toContain('application/octet-stream');
    });
  });

  describe('onSend hook removes X-Frame-Options', () => {
    let app: FastifyInstance;
    beforeAll(async () => {
      mockStat.mockResolvedValue({ size: 256, mtimeMs: 1700000003000 });
      app = await buildApp();
    });
    afterAll(async () => { await app.close(); });

    it('removes X-Frame-Options and sets frame-ancestors CSP', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/doc.pdf',
      });
      expect(res.headers['x-frame-options']).toBeUndefined();
      expect(res.headers['content-security-policy']).toContain('frame-ancestors');
    });
  });
});
