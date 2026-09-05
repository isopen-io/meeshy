/**
 * Unit tests for GET /attachments/:attachmentId
 *                GET /attachments/:attachmentId/thumbnail
 *                GET /attachments/file/*
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, jest } from '@jest/globals';
import Fastify, { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';

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
  // Rattachement au message : c'est par lui que passe le contrôle d'accès.
  // Une pièce jointe sans `messageId` n'est lisible que par son déposant.
  messageId: 'msg-1',
  uploadedBy: 'user-1',
};

const DEFAULT_STAT = {
  size: 1024,
  mtimeMs: 1700000000000,
};

// ─── App factory ─────────────────────────────────────────────────────────────

/** Prisma minimal : le contrôle d'accès remonte du message à la participation. */
function makeAccessPrisma(granted: boolean, message: unknown = { conversationId: 'conv-1' }) {
  return {
    message: { findUnique: jest.fn<any>().mockResolvedValue(message) },
    participant: { findFirst: jest.fn<any>().mockResolvedValue(granted ? { id: 'part-1' } : null) },
  } as any;
}

async function buildApp(
  opts: { authenticated?: boolean; granted?: boolean; message?: unknown } = {}
): Promise<FastifyInstance> {
  const { authenticated = true, granted = true, message = { conversationId: 'conv-1' } } = opts;
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });

  // Ces routes servaient le fichier à qui connaissait l'identifiant. Elles
  // exigent désormais une identité, puis l'accès à la conversation du message
  // auquel la pièce jointe est rattachée.
  app.decorate('authenticate', async (req: FastifyRequest, reply: FastifyReply) => {
    if (!authenticated) {
      await reply.code(401).send({ success: false, error: 'Unauthorized' });
      return;
    }
    (req as unknown as Record<string, unknown>).authContext = {
      isAuthenticated: true,
      isAnonymous: false,
      userId: 'user-1',
    };
  });

  registerDownloadRoutes(app, makeAccessPrisma(granted, message));
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

    it('keeps CORP header on 404 so the error response is not CORP-blocked by the browser', async () => {
      const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
      expect(res.statusCode).toBe(404);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
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
      mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
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
      mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
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
      mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
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
      mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
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

    it('keeps CORP header on 404 so the error response is not CORP-blocked by the browser', async () => {
      const res = await app.inject({ method: 'GET', url: '/attachments/file/uploads/file.jpg' });
      expect(res.statusCode).toBe(404);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
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

    it('keeps CORP/CORS headers on 304 so revalidated images stay embeddable cross-origin', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/uploads/image.jpg',
        headers: { 'if-none-match': expectedEtag },
      });
      expect(res.statusCode).toBe(304);
      expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
      expect(res.headers['access-control-allow-origin']).toBe('*');
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

    it('serves stable avatar paths with no-cache so a changed file is picked up via ETag', async () => {
      const res = await app.inject({
        method: 'GET',
        url: '/attachments/file/avatars%2Fuser%2F68f2a81417a557e8ce4ddfc1.jpg',
      });
      expect(res.statusCode).toBe(200);
      expect(res.headers['cache-control']).toBe('public, no-cache');
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

// ═════════════════════════════════════════════════════════════════════════════
// Contrôle d'accès
//
// Ces deux routes servaient le fichier — et sa miniature, qui en révèle le
// contenu — à quiconque connaissait l'identifiant, sans aucune identité. Un
// ObjectId MongoDB n'est pas un secret : son entropie est faible et une part
// en est dérivable d'un horodatage.
// ═════════════════════════════════════════════════════════════════════════════

describe('contrôle d\'accès aux pièces jointes', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
    mockGetFilePath.mockResolvedValue(FILE_PATH);
    mockGetThumbnailPath.mockResolvedValue(THUMBNAIL_PATH);
    mockStat.mockResolvedValue(DEFAULT_STAT);
  });

  it('refuse le fichier à un appelant sans identité', async () => {
    const app = await buildApp({ authenticated: false });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(401);
    await app.close();
  });

  it('refuse le fichier à un compte étranger à la conversation', async () => {
    const app = await buildApp({ granted: false });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('refuse la miniature à un compte étranger à la conversation', async () => {
    const app = await buildApp({ granted: false });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('garde le header CORP cross-origin sur un refus 403', async () => {
    const app = await buildApp({ granted: false });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
    expect(res.statusCode).toBe(403);
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    await app.close();
  });

  it('refuse une pièce jointe non rattachée déposée par quelqu\'un d\'autre', async () => {
    mockGetAttachment.mockResolvedValue({
      ...DEFAULT_ATTACHMENT,
      messageId: null,
      uploadedBy: 'quelqu-un-dautre',
    });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  it('sert une pièce jointe non rattachée à son propre déposant', async () => {
    mockGetAttachment.mockResolvedValue({
      ...DEFAULT_ATTACHMENT,
      messageId: null,
      uploadedBy: 'user-1',
    });
    const app = await buildApp();
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});

// ═════════════════════════════════════════════════════════════════════════════
// Les octets suivent la vie du message porteur
//
// Les cycles 92 à 94 ont bâti toute la chaîne de destruction du contenu de
// message ; les routes qui rendent les OCTETS n'en tenaient aucun compte. Elles
// ne vérifiaient que l'appartenance à la conversation — un membre légitime
// retéléchargeait donc indéfiniment la photo d'un message rappelé, expiré ou
// brûlé, tant que le balayage n'avait pas `unlink` le fichier.
// ═════════════════════════════════════════════════════════════════════════════

describe('cycle de vie du message porteur', () => {
  const PAST = new Date(Date.now() - 60_000);
  const FUTURE = new Date(Date.now() + 60_000);

  beforeEach(() => {
    mockGetAttachment.mockResolvedValue(DEFAULT_ATTACHMENT);
    mockGetFilePath.mockResolvedValue(FILE_PATH);
    mockGetThumbnailPath.mockResolvedValue(THUMBNAIL_PATH);
    mockStat.mockResolvedValue(DEFAULT_STAT);
  });

  it('sert le fichier tant que le message porteur est vivant', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', deletedAt: null, expiresAt: null } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('sert le fichier quand l\'échéance est encore devant', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', expiresAt: FUTURE } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });

  it('refuse le fichier d\'un message rappelé, même à un membre de la conversation', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', deletedAt: PAST } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('refuse le fichier d\'un message éphémère expiré', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', expiresAt: PAST } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  /**
   * `scheduleViewOnceBurn` écrit le budget de vue unique épuisé sous forme
   * d'`expiresAt`. La garde couvre donc la brûlure sans rien connaître de la
   * vue unique — l'échéance EST la brûlure.
   */
  it('refuse le fichier d\'un message à vue unique dont le sursis de brûlure est écoulé', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', expiresAt: PAST } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('refuse la miniature d\'un message rappelé — elle révèle la même image', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', deletedAt: PAST } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  it('refuse la miniature d\'un message expiré', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', expiresAt: PAST } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}/thumbnail` });
    expect(res.statusCode).toBe(404);
    await app.close();
  });

  /**
   * Le refus doit être INDISCERNABLE du 404 que rendra le balayage une minute
   * plus tard, une fois le fichier `unlink`. Un 403 confirmerait en prime
   * l'existence d'un contenu que l'émetteur a voulu disparu.
   */
  it('refuse en 404, comme le fera le balayage après unlink — et non en 403', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', deletedAt: PAST } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(404);
    expect(res.json().success).toBe(false);
    await app.close();
  });

  it('garde le header CORP cross-origin sur le refus de cycle de vie', async () => {
    const app = await buildApp({ message: { conversationId: 'conv-1', expiresAt: PAST } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.headers['cross-origin-resource-policy']).toBe('cross-origin');
    await app.close();
  });

  /**
   * L'étranger à la conversation garde son 403 : il ne doit rien apprendre du
   * cycle de vie d'un contenu auquel il n'a de toute façon pas accès.
   */
  it('rend 403, et non 404, à un étranger — l\'appartenance se juge avant le cycle de vie', async () => {
    const app = await buildApp({ granted: false, message: { conversationId: 'conv-1', deletedAt: PAST } });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(403);
    await app.close();
  });

  /**
   * Une pièce jointe pas encore rattachée à un message n'a pas de porteur dont
   * hériter : son déposant continue d'y accéder pendant l'envoi.
   */
  it('sert une pièce jointe non rattachée à son déposant — aucun porteur, aucune échéance', async () => {
    mockGetAttachment.mockResolvedValue({ ...DEFAULT_ATTACHMENT, messageId: null, uploadedBy: 'user-1' });
    const app = await buildApp({ message: null });
    const res = await app.inject({ method: 'GET', url: `/attachments/${ATTACHMENT_ID}` });
    expect(res.statusCode).toBe(200);
    await app.close();
  });
});
