/**
 * #11266 — sur le chemin RÉSUMABLE (tus), la limite d'envoi dépend du rôle
 * (anonyme = plafonds ÷10) dès `onUploadCreate`, avant le premier octet ; un
 * téléversement à longueur différée est jugé à la fin ; le quota journalier
 * refuse en 429 typé et compte les octets d'un envoi réussi. Une vidéo dont
 * les octets ne sont pas une vidéo est refusée. Même harnais que
 * `tus-handler-guest-kinds.test.ts`.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { UPLOAD_REFUSAL_CODES } from '@meeshy/shared/types/upload-limits';
import { LIVE_SID, liveSession } from '../../../services/auth/__tests__/live-session-double';
import type { UploadQuota, UploadQuotaVerdict } from '../../../services/attachments/upload-quota';

type CapturedTusOptions = {
  maxSize: number;
  onUploadCreate: (req: unknown, upload: unknown) => Promise<{ metadata?: Record<string, string> }>;
  onUploadFinish: (req: unknown, upload: unknown) => Promise<{ status_code?: number; body?: string }>;
};

let captured: CapturedTusOptions | null = null;

jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    constructor(opts: CapturedTusOptions) {
      captured = opts;
    }
    handle() {}
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    async getUpload() {
      throw { status_code: 404, body: 'Not found\n' };
    }
  },
}));

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({
    extractMetadata: jest.fn<() => Promise<Record<string, unknown>>>().mockResolvedValue({}),
    generateThumbnail: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    generateVideoThumbnail: jest.fn<() => Promise<null>>().mockResolvedValue(null),
    probeMediaStreams: jest.fn<() => Promise<null>>().mockResolvedValue(null),
  })),
}));

jest.mock('../../../services/attachments/ThumbHashGenerator', () => ({
  ThumbHashGenerator: { generate: jest.fn<() => Promise<null>>().mockResolvedValue(null) },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const MIB = 1024 * 1024;
const GIB = 1024 * MIB;
const JWT_SECRET = 'test-secret-tus-role-limits';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;

const PDF_BYTES = Buffer.from('%PDF-1.7\n%\xe2\xe3\xcf\xd3\nreste du document\n', 'binary');
const MP4_VIDEO = Buffer.concat([
  Buffer.from([0x00, 0x00, 0x00, 0x20]),
  Buffer.from('ftypisom', 'latin1'),
  Buffer.from([0x00, 0x00, 0x02, 0x00]),
  Buffer.from('isomiso2avc1mp41', 'latin1'),
  Buffer.alloc(64, 0),
]);

function buildFakePrisma() {
  return {
    participant: {
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        id: 'participant-guest',
        anonymousSession: { shareLinkId: 'sharelink-1' },
      }),
    },
    conversationShareLink: {
      findUnique: jest.fn<() => Promise<unknown>>().mockResolvedValue({
        allowAnonymousFiles: true,
        allowAnonymousImages: true,
        allowedAttachmentKinds: [],
        conversation: { identifier: 'conv' },
      }),
    },
    messageAttachment: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'created-attachment' }) },
    postMedia: { create: jest.fn<() => Promise<unknown>>().mockResolvedValue({ id: 'created-post-media' }) },
    userSession: {
      findFirst: jest.fn<() => Promise<unknown>>().mockResolvedValue(liveSession()),
      update: jest.fn().mockReturnValue({ catch: jest.fn() }),
    },
  };
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

function headersFrom(map: Record<string, string>) {
  return { get: (key: string) => map[key.toLowerCase()] };
}

const registeredHeaders = () => ({
  authorization: `Bearer ${jwt.sign({ userId: '5f00000000000000000000a1', sid: LIVE_SID }, JWT_SECRET)}`,
});
const guestHeaders = { 'x-session-token': 'anon-token' };

describe('tus-handler — la limite d’envoi dépend du rôle, un quota journalier existe (#11266)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-role-limits-test-'));
    process.env.JWT_SECRET = JWT_SECRET;
    process.env.UPLOAD_PATH = uploadDir;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  });

  async function register(quota: UploadQuota) {
    jest.resetModules();
    const prisma = buildFakePrisma();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes({ prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as never, {
      mediaQueue: null,
      localMediaRenderer: () => null,
      uploadQuota: quota,
    });
    if (!captured) throw new Error('TUS options not captured');
    return { prisma, tus: captured };
  }

  async function createRefusal(tus: CapturedTusOptions, headers: Record<string, string>, upload: Record<string, unknown>) {
    return tus.onUploadCreate({ headers: headersFrom(headers) }, upload).then(
      () => null,
      (thrown: { status_code?: number; body?: string; headers?: Record<string, string> }) => thrown,
    );
  }

  it('le protocole annonce le plus grand plafond, celui de la vidéo : un ancien client à 4 Go n’est pas coupé', async () => {
    const { tus } = await register(fakeQuota());
    expect(tus.maxSize).toBe(4 * GIB);
  });

  it('refuse AVANT le premier octet une image d’anonyme au-delà de 10 Mo, en 413 typé', async () => {
    const { tus } = await register(fakeQuota());

    const refusal = await createRefusal(tus, guestHeaders, {
      metadata: { filename: 'photo.jpg', filetype: 'image/jpeg' },
      size: 10 * MIB + 1,
    });

    expect(refusal?.status_code).toBe(413);
    expect(JSON.parse(refusal?.body ?? '{}')).toMatchObject({ success: false, code: UPLOAD_REFUSAL_CODES.FILE_TOO_LARGE });
  });

  it('admet la même image pour un inscrit, dont le plafond est 100 Mo', async () => {
    const { tus } = await register(fakeQuota());
    const refusal = await createRefusal(tus, registeredHeaders(), {
      metadata: { filename: 'photo.jpg', filetype: 'image/jpeg' },
      size: 10 * MIB + 1,
    });
    expect(refusal).toBeNull();
  });

  it('refuse à un inscrit une image au-delà de 100 Mo', async () => {
    const { tus } = await register(fakeQuota());
    const refusal = await createRefusal(tus, registeredHeaders(), {
      metadata: { filename: 'photo.jpg', filetype: 'image/jpeg' },
      size: 100 * MIB + 1,
    });
    expect(refusal?.status_code).toBe(413);
  });

  it('refuse AVANT le premier octet un envoi qui dépasserait le quota du jour, en 429 typé avec Retry-After', async () => {
    const quota = fakeQuota({ allowed: false, usedBytes: 20 * GIB, quotaBytes: 20 * GIB, retryAfterSeconds: 600 });
    const { tus } = await register(quota);

    const refusal = await createRefusal(tus, registeredHeaders(), {
      metadata: { filename: 'clip.mp4', filetype: 'video/mp4' },
      size: 5 * MIB,
    });

    expect(refusal?.status_code).toBe(429);
    expect(refusal?.headers).toEqual({ 'Retry-After': '600' });
    expect(JSON.parse(refusal?.body ?? '{}')).toMatchObject({ code: UPLOAD_REFUSAL_CODES.DAILY_QUOTA_EXCEEDED });
    expect(quota.checks).toEqual([{ userId: '5f00000000000000000000a1', role: 'registered', incomingBytes: 5 * MIB }]);
  });

  it('l’anonyme est jugé sur son propre quota', async () => {
    const quota = fakeQuota();
    const { tus } = await register(quota);
    await createRefusal(tus, guestHeaders, { metadata: { filename: 'a.mp3', filetype: 'audio/mpeg' }, size: 1000 });
    expect(quota.checks).toEqual([{ userId: 'participant-guest', role: 'anonymous', incomingBytes: 1000 }]);
  });

  async function runFullUpload(params: {
    tus: CapturedTusOptions;
    headers: Record<string, string>;
    filename: string;
    filetype: string;
    bytes: Buffer;
    announceSize: boolean;
  }) {
    const created = await params.tus.onUploadCreate(
      { headers: headersFrom(params.headers) },
      { metadata: { filename: params.filename, filetype: params.filetype }, size: params.announceSize ? params.bytes.length : undefined },
    );
    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, 'upload-1'), params.bytes);
    return params.tus
      .onUploadFinish({}, { id: 'upload-1', metadata: created.metadata, size: params.bytes.length, storage: undefined })
      .catch((thrown: { status_code?: number; body?: string }) => thrown);
  }

  it('compte les octets d’un envoi réussi dans le quota de son auteur', async () => {
    const quota = fakeQuota();
    const { tus, prisma } = await register(quota);

    const result = await runFullUpload({
      tus,
      headers: registeredHeaders(),
      filename: 'clip.mp4',
      filetype: 'video/mp4',
      bytes: MP4_VIDEO,
      announceSize: true,
    });

    expect(result.status_code).toBe(200);
    expect(prisma.messageAttachment.create).toHaveBeenCalledTimes(1);
    expect(quota.records).toEqual([{ userId: '5f00000000000000000000a1', bytes: MP4_VIDEO.length }]);
  });

  it('refuse une « vidéo » dont les octets sont un PDF, sans rien compter ni persister', async () => {
    const quota = fakeQuota();
    const { tus, prisma } = await register(quota);

    const result = await runFullUpload({
      tus,
      headers: registeredHeaders(),
      filename: 'clip.mp4',
      filetype: 'video/mp4',
      bytes: PDF_BYTES,
      announceSize: true,
    });

    expect(result.status_code).toBe(400);
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    expect(quota.records).toEqual([]);
  });

  it('juge à la fin un envoi à longueur différée qui dépasse le plafond de son rôle', async () => {
    jest.resetModules();
    process.env.UPLOAD_CEILING_VIDEO_BYTES = String(10 * 64);
    try {
      const quota = fakeQuota();
      const { tus, prisma } = await register(quota);
      const oversized = Buffer.concat([MP4_VIDEO, Buffer.alloc(64 * 2, 0)]);

      const result = await runFullUpload({
        tus,
        headers: guestHeaders,
        filename: 'clip.mp4',
        filetype: 'video/mp4',
        bytes: oversized,
        announceSize: false,
      });

      expect(result.status_code).toBe(413);
      expect(JSON.parse(result.body ?? '{}')).toMatchObject({ code: UPLOAD_REFUSAL_CODES.FILE_TOO_LARGE });
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
      expect(quota.records).toEqual([]);
    } finally {
      delete process.env.UPLOAD_CEILING_VIDEO_BYTES;
    }
  });
});
