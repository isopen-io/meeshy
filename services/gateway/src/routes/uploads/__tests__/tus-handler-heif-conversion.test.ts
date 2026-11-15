/**
 * `routes/uploads/tus-handler.ts` — un HEIC téléversé par la porte résumable
 * est servi en JPEG, l'original conservé dans `renditions` ; un HEIC illisible
 * est refusé en 415 et sa copie retirée (#11263). heif-convert RÉEL.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
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

const mockRunFfmpeg = jest.fn<(args: string[]) => Promise<void>>();
const transcodeCalls = () => mockRunFfmpeg.mock.calls.filter(([args]) => !args.includes('-map_metadata'));
jest.mock('../../../services/attachments/ffmpeg-run', () => ({
  runFfmpeg: (args: string[]) => mockRunFfmpeg(args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const JWT_SECRET = 'test-secret-tus-heif';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;
const ORIGINAL_VIDEO_TRANSCODE = process.env.VIDEO_TRANSCODE;
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

const HEIC = readFileSync(path.join(__dirname, '..', '..', '..', 'services', 'attachments', '__tests__', 'fixtures', 'heif', 'photo-p3.heic'));

describe('tus-handler — HEIC servi en JPEG, original conservé (#11263)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockRunFfmpeg.mockReset();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-heif-test-'));
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

  async function runFullUpload(prisma: ReturnType<typeof buildFakePrisma>, bytes: Buffer) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes({ prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any);
    if (!captured) throw new Error('options TUS non capturées');
    const created = await captured.onUploadCreate(
      { headers: headersFrom({ authorization: `Bearer ${jwt.sign({ userId: USER_ID, sid: LIVE_SID }, JWT_SECRET)}` }) },
      { metadata: { filename: 'IMG_0001.HEIC', filetype: 'image/heic' }, size: bytes.length },
    );
    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, 'upload-heif'), bytes);
    return captured.onUploadFinish({}, { id: 'upload-heif', metadata: created.metadata, size: bytes.length, storage: undefined });
  }

  it('la ligne et la réponse désignent un JPEG ; l’original HEIC est gardé dans `renditions`', async () => {
    const prisma = buildFakePrisma();

    const result = await runFullUpload(prisma, HEIC);

    expect(result.status_code).toBe(200);
    const data = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;
    expect(data.mimeType).toBe('image/jpeg');
    expect(String(data.filePath)).toMatch(/\.jpg$/);
    expect(data.renditions).toEqual([expect.objectContaining({ codec: 'heic', mimeType: 'image/heic', url: expect.stringMatching(/_original\.heic$/) })]);
    expect((await fs.readFile(path.join(uploadDir, data.renditions[0].url))).length).toBe(HEIC.length);
    expect(JSON.parse(result.body ?? '{}').data.attachment.mimeType).toBe('image/jpeg');
  });

  it('un HEIC illisible est refusé en 415, et rien ne reste sur disque', async () => {
    const prisma = buildFakePrisma();

    await expect(runFullUpload(prisma, Buffer.concat([HEIC.subarray(0, 40), Buffer.alloc(300)]))).rejects.toMatchObject({ status_code: 415 });
    expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    const now = new Date();
    const dir = path.join(uploadDir, now.getFullYear().toString(), (now.getMonth() + 1).toString().padStart(2, '0'), USER_ID);
    expect(await fs.readdir(dir).catch(() => [])).toEqual([]);
  });
});
