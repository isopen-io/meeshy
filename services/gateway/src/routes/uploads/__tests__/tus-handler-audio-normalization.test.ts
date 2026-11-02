/**
 * `routes/uploads/tus-handler.ts` — un vocal téléversé par la porte résumable
 * est normalisé comme par la porte multipart (#11259) : un Opus/WebM devient
 * un M4A AAC amené à −16 LUFS, un AAC mono est remuxé sans réencodage, et la
 * sonie mesurée est persistée et rendue.
 *
 * ffmpeg, ffprobe et le `MetadataManager` sont RÉELS, sur un répertoire réel.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import { spawnSync } from 'child_process';
import { readFileSync } from 'fs';
import { LIVE_SID, liveSession } from '../../../services/auth/__tests__/live-session-double';

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

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const JWT_SECRET = 'test-secret-tus-audio';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;
const USER_ID = '507f1f77bcf86cd799439011';

function buildFakePrisma() {
  return {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
    messageAttachment: { create: jest.fn<any>().mockResolvedValue({ id: 'created-attachment' }) },
    postMedia: { create: jest.fn<any>().mockResolvedValue({ id: 'created-post-media' }) },
    userSession: {
      findFirst: jest.fn<any>().mockResolvedValue(liveSession()),
      update: jest.fn<any>().mockReturnValue({ catch: jest.fn() }),
    },
  };
}

function headersFrom(map: Record<string, string>) {
  return { get: (key: string) => map[key.toLowerCase()] };
}

function voice(params: { codec: 'aac' | 'opus'; gainDb: number }): Buffer {
  const output = path.join(os.tmpdir(), `tus-voice-${process.pid}-${params.codec}${params.gainDb}.${params.codec === 'aac' ? 'm4a' : 'webm'}`);
  const result = spawnSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'sine=frequency=220:duration=3:sample_rate=48000',
    '-af', `volume=${params.gainDb}dB`, '-ac', '1',
    ...(params.codec === 'aac' ? ['-c:a', 'aac', '-b:a', '64k', '-f', 'ipod'] : ['-c:a', 'libopus', '-b:a', '32k', '-f', 'webm']),
    '-y', output,
  ]);
  if (result.status !== 0) throw new Error(result.stderr.toString());
  return readFileSync(output);
}

describe('tus-handler — un vocal est normalisé comme par le multipart (#11259)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-audio-test-'));
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  });

  async function runFullUpload(params: { prisma: ReturnType<typeof buildFakePrisma>; filename: string; filetype: string; bytes: Buffer }) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes({ prisma: params.prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any);
    if (!captured) throw new Error('options TUS non capturées');
    const uploadId = 'upload-audio';
    const created = await captured.onUploadCreate(
      { headers: headersFrom({ authorization: `Bearer ${jwt.sign({ userId: USER_ID, sid: LIVE_SID }, JWT_SECRET)}` }) },
      { metadata: { filename: params.filename, filetype: params.filetype }, size: params.bytes.length },
    );
    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, uploadId), params.bytes);
    return captured.onUploadFinish({}, { id: uploadId, metadata: created.metadata, size: params.bytes.length, storage: undefined });
  }

  it('un Opus/WebM est stocké en M4A, sa sonie persistée et rendue', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload({ prisma, filename: 'vocal.webm', filetype: 'audio/webm', bytes: voice({ codec: 'opus', gainDb: -30 }) });

    expect(result.status_code).toBe(200);
    const data = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;
    expect(data.mimeType).toBe('audio/mp4');
    expect(String(data.filePath)).toMatch(/\.m4a$/);
    expect(Math.abs(data.loudnessLufs + 16)).toBeLessThan(1.5);
    await expect(fs.stat(path.join(uploadDir, data.filePath))).resolves.toBeDefined();
    const served = JSON.parse(result.body ?? '{}').data.attachment;
    expect(served.mimeType).toBe('audio/mp4');
    expect(served.loudnessLufs).toBe(data.loudnessLufs);
  }, 60_000);

  it('un AAC mono garde son niveau : remuxé, sa sonie MESURÉE (pas ramenée à −16)', async () => {
    const prisma = buildFakePrisma();

    await runFullUpload({ prisma, filename: 'vocal.m4a', filetype: 'audio/mp4', bytes: voice({ codec: 'aac', gainDb: -30 }) });

    const data = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;
    expect(data.mimeType).toBe('audio/mp4');
    expect(data.loudnessLufs).toBeLessThan(-25);
  }, 60_000);
});
