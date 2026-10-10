/**
 * `routes/uploads/tus-handler.ts` — le chemin des posts, stories et
 * commentaires admet un .wav, un .mp3 ou un .mp4 sonore sous le type de ce
 * qu'il EST (#9693) : `audio/x-wav` devient `audio/wav`, un MP3 sans type
 * devient `audio/mpeg`, un MP4 sans piste vidéo devient `audio/mp4`.
 * Harnais repris de `tus-handler-mime-verification.test.ts`.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';

type CapturedTusOptions = {
  onUploadCreate: (req: any, upload: any) => Promise<{ metadata?: Record<string, string> }>;
  onUploadFinish: (req: any, upload: any) => Promise<{ status_code?: number; headers?: any; body?: string }>;
};

let captured: CapturedTusOptions | null = null;

jest.mock('@tus/server', () => ({
  Server: class MockTusServer {
    constructor(opts: any) {
      captured = opts;
    }
    handle() {}
  },
}));

jest.mock('@tus/file-store', () => ({
  FileStore: class MockFileStore {
    constructor(_opts: any) {}
    async getUpload() {
      throw { status_code: 404, body: 'Not found\n' };
    }
  },
}));

const mockExtractMetadata = jest.fn<any>().mockResolvedValue({});
const mockProbeMediaStreams = jest.fn<any>().mockResolvedValue(null);
const mockGenerateVideoThumbnail = jest.fn<any>().mockResolvedValue(null);
jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({
    extractMetadata: (...a: any[]) => mockExtractMetadata(...a),
    probeMediaStreams: (...a: any[]) => mockProbeMediaStreams(...a),
    generateThumbnail: jest.fn().mockResolvedValue(null),
    generateVideoThumbnail: (...a: any[]) => mockGenerateVideoThumbnail(...a),
  })),
}));

jest.mock('../../../services/attachments/ThumbHashGenerator', () => ({
  ThumbHashGenerator: { generate: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

// ─── Fixtures : octets réels ────────────────────────────────────────────────

const WAV_BYTES = Buffer.concat([Buffer.from('RIFF\x24\x00\x00\x00WAVEfmt ', 'latin1'), Buffer.alloc(32)]);
const MP3_BYTES = Buffer.concat([Buffer.from('ID3\x03\x00\x00\x00\x00\x00\x00', 'binary'), Buffer.alloc(32)]);
const MP4_BYTES = Buffer.concat([Buffer.from([0x00, 0x00, 0x00, 0x20]), Buffer.from('ftypisom\x00\x00\x02\x00isomiso2', 'latin1'), Buffer.alloc(32)]);

const JWT_SECRET = 'test-secret-tus-admitted-media-type';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;

function buildFakeFastify(prisma: any) {
  return { prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any;
}

function buildFakePrisma(overrides: { participant?: unknown; shareLink?: unknown } = {}) {
  return {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(overrides.participant ?? null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(overrides.shareLink ?? null) },
    messageAttachment: { create: jest.fn<any>().mockResolvedValue({ id: 'created-attachment' }) },
    postMedia: { create: jest.fn<any>().mockResolvedValue({ id: 'created-post-media' }) },
    userSession: {
      findFirst: jest.fn<any>().mockResolvedValue(null),
      update: jest.fn<any>().mockReturnValue({ catch: jest.fn() }),
    },
  };
}

function headersFrom(map: Record<string, string>) {
  return { get: (key: string) => map[key.toLowerCase()] };
}

function registeredHeaders() {
  return { authorization: `Bearer ${jwt.sign({ userId: 'user-registered-1' }, JWT_SECRET)}` };
}

describe('tus-handler — le type admis est celui du média (#9693)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockExtractMetadata.mockClear();
    mockExtractMetadata.mockResolvedValue({});
    mockProbeMediaStreams.mockReset();
    mockProbeMediaStreams.mockResolvedValue(null);
    mockGenerateVideoThumbnail.mockClear();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-admitted-media-type-test-'));
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  });

  /** Simule une upload TUS complète : create, écrit les octets, finish. */
  async function runFullUpload(params: {
    prisma: ReturnType<typeof buildFakePrisma>;
    headers: Record<string, string>;
    filename: string;
    filetype: string;
    bytes: Buffer;
  }) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes(buildFakeFastify(params.prisma));
    if (!captured) throw new Error('onUploadCreate/onUploadFinish not captured');

    const uploadId = 'upload-1';
    const created = await captured.onUploadCreate(
      { headers: headersFrom(params.headers) },
      { metadata: { filename: params.filename, filetype: params.filetype }, size: params.bytes.length }
    );

    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, uploadId), params.bytes);

    try {
      return await captured.onUploadFinish(
        {},
        { id: uploadId, metadata: created.metadata, size: params.bytes.length, storage: undefined }
      );
    } catch (thrown) {
      return thrown as { status_code?: number; body?: string };
    }
  }

  const persistedMimeType = (prisma: ReturnType<typeof buildFakePrisma>): string =>
    (prisma.messageAttachment.create.mock.calls[0][0] as { data: { mimeType: string } }).data.mimeType;

  it('admet un WAV nommé audio/x-wav sous audio/wav, et en extrait les métadonnées AUDIO', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({ prisma, headers: registeredHeaders(), filename: 'note.wav', filetype: 'audio/x-wav', bytes: WAV_BYTES });

    expect(result.status_code).toBe(200);
    expect(persistedMimeType(prisma)).toBe('audio/wav');
    expect(mockExtractMetadata.mock.calls[0][1]).toBe('audio');
  });

  it('admet un MP3 envoyé sans type sous audio/mpeg', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({ prisma, headers: registeredHeaders(), filename: 'chanson.mp3', filetype: '', bytes: MP3_BYTES });

    expect(result.status_code).toBe(200);
    expect(persistedMimeType(prisma)).toBe('audio/mpeg');
  });

  it('admet un MP4 sans piste vidéo sous audio/mp4, sans vignette vidéo', async () => {
    mockProbeMediaStreams.mockResolvedValue({ video: false, audio: true });
    const prisma = buildFakePrisma();

    const result = await runFullUpload({ prisma, headers: registeredHeaders(), filename: 'podcast.mp4', filetype: 'video/mp4', bytes: MP4_BYTES });

    expect(result.status_code).toBe(200);
    expect(persistedMimeType(prisma)).toBe('audio/mp4');
    expect(mockGenerateVideoThumbnail).not.toHaveBeenCalled();
  });

  it('garde une vraie vidéo MP4 en video/mp4', async () => {
    mockProbeMediaStreams.mockResolvedValue({ video: true, audio: true });
    const prisma = buildFakePrisma();

    await runFullUpload({ prisma, headers: registeredHeaders(), filename: 'clip.mp4', filetype: 'video/mp4', bytes: MP4_BYTES });

    expect(persistedMimeType(prisma)).toBe('video/mp4');
  });
});
