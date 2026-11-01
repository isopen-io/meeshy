/**
 * `POST /attachments/upload` (multipart) — #11266 : la limite d'envoi est
 * jugée pour le RÔLE de l'appelant, le quota journalier refuse en 429 typé
 * (`UPLOAD_DAILY_QUOTA_EXCEEDED`, `Retry-After`) avant tout octet écrit, et
 * un envoi réussi compte ses octets.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import Fastify, { FastifyInstance } from 'fastify';
import { UPLOAD_REFUSAL_CODES } from '@meeshy/shared/types/upload-limits';
import type { UploadQuota, UploadQuotaVerdict } from '../../../services/attachments/upload-quota';

jest.mock('../../../utils/logger-enhanced.js', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const mockUploadMultiple = jest.fn<(...a: unknown[]) => Promise<unknown>>();
const mockValidateFile = jest.fn<(...a: unknown[]) => unknown>();

jest.mock('../../../services/attachments', () => ({
  AttachmentService: jest.fn().mockImplementation(() => ({
    uploadMultiple: (...a: unknown[]) => mockUploadMultiple(...a),
    createTextAttachment: jest.fn(),
    validateFile: (...a: unknown[]) => mockValidateFile(...a),
  })),
}));

import multipart from '@fastify/multipart';
import { registerUploadRoutes } from '../../../routes/attachments/upload';

const USER_ID = '507f1f77bcf86cd799439011';
const PARTICIPANT_ID = '507f1f77bcf86cd799439022';
const BOUNDARY = 'rolelimits11266';
const PNG = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0x00, 0x00, 0x00, 0x0d, 0x49, 0x48, 0x44, 0x52, 0, 0, 0, 1]);

function multipartFile(filename: string, mimeType: string, content: Buffer): Buffer {
  const head = Buffer.from(
    `--${BOUNDARY}\r\nContent-Disposition: form-data; name="files"; filename="${filename}"\r\nContent-Type: ${mimeType}\r\n\r\n`,
    'utf8',
  );
  return Buffer.concat([head, content, Buffer.from(`\r\n--${BOUNDARY}--\r\n`, 'utf8')]);
}

type FakeQuota = UploadQuota & {
  readonly checks: Array<{ userId: string; role: string; incomingBytes: number }>;
  readonly records: Array<{ userId: string; bytes: number }>;
};

function fakeQuota(verdict: UploadQuotaVerdict = { allowed: true }): FakeQuota {
  const checks: FakeQuota['checks'] = [];
  const records: FakeQuota['records'] = [];
  return {
    checks,
    records,
    async check(params) {
      checks.push({ userId: params.userId, role: params.role, incomingBytes: params.incomingBytes });
      return verdict;
    },
    async record(params) {
      records.push({ userId: params.userId, bytes: params.bytes });
    },
  };
}

const registered = { isAuthenticated: true, isAnonymous: false, userId: USER_ID, registeredUser: { id: USER_ID, role: 'USER' }, participantId: null };
const guest = {
  isAuthenticated: true,
  isAnonymous: true,
  userId: PARTICIPANT_ID,
  participantId: PARTICIPANT_ID,
  anonymousUser: { shareLinkId: 'link-1' },
};

async function buildApp(authContext: Record<string, unknown>, quota: UploadQuota): Promise<FastifyInstance> {
  const app = Fastify({ logger: false, ajv: { customOptions: { strict: false } } });
  const prisma = {
    conversationShareLink: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        allowAnonymousFiles: true,
        allowAnonymousImages: true,
        allowedAttachmentKinds: [],
        conversation: { identifier: 'conv' },
      }),
    },
  };
  await app.register(multipart);
  await registerUploadRoutes(app, async (req: { authContext?: unknown }) => {
    req.authContext = authContext;
  }, prisma as never, { uploadQuota: quota });
  await app.ready();
  return app;
}

describe('POST /attachments/upload — limite par rôle et quota journalier (#11266)', () => {
  let app: FastifyInstance | null = null;

  beforeEach(() => {
    mockUploadMultiple.mockReset().mockResolvedValue([{ id: 'att-1' }]);
    mockValidateFile.mockReset().mockReturnValue({ valid: true });
  });

  afterEach(async () => {
    await app?.close();
    app = null;
  });

  const send = (instance: FastifyInstance) => instance.inject({
    method: 'POST',
    url: '/attachments/upload',
    headers: { 'content-type': `multipart/form-data; boundary=${BOUNDARY}` },
    payload: multipartFile('photo.png', 'image/png', PNG),
  });

  it('juge la taille d’un fichier d’anonyme avec la limite de l’anonyme', async () => {
    app = await buildApp(guest, fakeQuota());
    await send(app);
    expect(mockValidateFile).toHaveBeenCalledWith(expect.objectContaining({ filename: 'photo.png' }), 'anonymous');
  });

  it('juge la taille d’un fichier d’inscrit avec la limite de l’inscrit', async () => {
    app = await buildApp(registered, fakeQuota());
    await send(app);
    expect(mockValidateFile).toHaveBeenCalledWith(expect.objectContaining({ filename: 'photo.png' }), 'registered');
  });

  it('refuse en 429 typé un envoi au-delà du quota du jour, sans rien écrire', async () => {
    const quota = fakeQuota({ allowed: false, usedBytes: 2, quotaBytes: 2, retryAfterSeconds: 120 });
    app = await buildApp(registered, quota);

    const res = await send(app);

    expect(res.statusCode).toBe(429);
    expect(res.headers['retry-after']).toBe('120');
    expect(res.json()).toMatchObject({ success: false, code: UPLOAD_REFUSAL_CODES.DAILY_QUOTA_EXCEEDED });
    expect(mockUploadMultiple).not.toHaveBeenCalled();
    expect(quota.checks).toEqual([{ userId: USER_ID, role: 'registered', incomingBytes: PNG.length }]);
  });

  it('juge un anonyme sur son propre quota', async () => {
    const quota = fakeQuota();
    app = await buildApp(guest, quota);
    await send(app);
    expect(quota.checks).toEqual([{ userId: PARTICIPANT_ID, role: 'anonymous', incomingBytes: PNG.length }]);
  });

  it('compte les octets d’un envoi réussi', async () => {
    const quota = fakeQuota();
    app = await buildApp(registered, quota);

    const res = await send(app);

    expect(res.statusCode).toBe(200);
    expect(quota.records).toEqual([{ userId: USER_ID, bytes: PNG.length }]);
  });

  it('ne compte rien quand l’envoi est refusé pour sa taille', async () => {
    mockValidateFile.mockReturnValue({ valid: false, code: 'FILE_TOO_LARGE', error: 'File too large. Max size for image: 10 MB' });
    const quota = fakeQuota();
    app = await buildApp(guest, quota);

    const res = await send(app);

    expect(res.statusCode).toBe(413);
    expect(res.json()).toMatchObject({ code: UPLOAD_REFUSAL_CODES.FILE_TOO_LARGE });
    expect(quota.records).toEqual([]);
  });
});
