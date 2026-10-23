/**
 * `routes/uploads/tus-handler.ts` — par la porte résumable aussi, une grande
 * photo laisse sa vignette et ses variantes au worker de médias (#11264) : la
 * ligne naît `pending`, une tâche part en file (doublée : Redis est absent du
 * job de CI), la réponse le dit.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
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

const JWT_SECRET = 'test-secret-tus-media-queue';
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

async function bigPhoto(): Promise<Buffer> {
  const width = 1800;
  const height = 1200;
  const noise = Buffer.from(Array.from({ length: width * height * 3 }, (_, i) => (i * 2654435761) % 251));
  return sharp(noise, { raw: { width, height, channels: 3 } }).jpeg({ quality: 98 }).toBuffer();
}

describe('tus-handler — la file de médias (#11264)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockRunFfmpeg.mockReset();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-media-queue-'));
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

  it('PostMedia : vignette différée, ligne `pending`, une tâche « thumb » en file, réponse `pending`', async () => {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const jobs: unknown[] = [];
    const prisma = buildFakePrisma();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes({ prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any, { mediaQueue: { enqueue: async (job) => { jobs.push(job); } } });
    if (!captured) throw new Error('options TUS non capturées');
    const bytes = await bigPhoto();
    const created = await captured.onUploadCreate(
      { headers: headersFrom({ authorization: `Bearer ${jwt.sign({ userId: USER_ID, sid: LIVE_SID }, JWT_SECRET)}` }) },
      { metadata: { filename: 'photo.jpg', filetype: 'image/jpeg', uploadcontext: 'post' }, size: bytes.length },
    );
    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, 'upload-queue'), bytes);

    const result = await captured.onUploadFinish({}, { id: 'upload-queue', metadata: created.metadata, size: bytes.length, storage: undefined });

    const data = (prisma.postMedia.create as jest.Mock<any>).mock.calls[0][0].data;
    expect(data.processingState).toBe('pending');
    expect(data.thumbnailPath).toBeNull();
    expect(data.imageVariants).toBeUndefined();
    expect(jobs).toEqual([{ kind: 'thumb', target: 'postMedia', recordId: 'created-post-media', final: true }]);
    expect(JSON.parse(result.body ?? '{}').data.attachment.processingState).toBe('pending');
  }, 120_000);
});
