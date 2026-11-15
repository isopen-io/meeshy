/**
 * Parité des deux chemins d'entrée (#11260) : la MÊME photo téléversée par le
 * multipart (`UploadProcessor.uploadFile`) et par le résumable
 * (`onUploadFinish`) laisse la MÊME trace en base — mêmes variantes WebP, même
 * vignette, même thumbhash — et le chemin chiffré (`uploadEncryptedFile`) ne
 * laisse AUCUN rendu en clair.
 *
 * Tout est réel (sharp, disque, MetadataManager) ; seuls la base, la plomberie
 * `@tus/*` et le service de chiffrement sont doublés.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { LIVE_SID, liveSession } from '../../auth/__tests__/live-session-double';

type CapturedTusOptions = {
  onUploadCreate: (req: any, upload: any) => Promise<{ metadata?: Record<string, string> }>;
  onUploadFinish: (req: any, upload: any) => Promise<{ status_code?: number; body?: string }>;
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
jest.mock('../../AttachmentEncryptionService', () => ({
  AttachmentEncryptionService: class {},
  getAttachmentEncryptionService: () => ({
    encryptAttachment: jest.fn<any>().mockImplementation(async (input: any) => ({
      encryptedBuffer: Buffer.from('enc'),
      encryptedThumbnail: input.thumbnailBuffer
        ? { buffer: Buffer.from('enc-thumb'), iv: 'tiv', authTag: 'tat' }
        : undefined,
      metadata: {
        encryptionKey: 'k', iv: 'iv', authTag: 'at', hmac: 'hm', originalSize: 100, originalHash: 'h',
        encryptedSize: 110, encryptedHash: 'eh', mode: 'e2ee',
      },
    })),
  }),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const JWT_SECRET = 'test-secret-renditions-parity';
const USER_ID = '507f1f77bcf86cd799439011';
const saved = {
  JWT_SECRET: process.env.JWT_SECRET,
  UPLOAD_PATH: process.env.UPLOAD_PATH,
};

async function photo(): Promise<Buffer> {
  return sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 200, g: 60, b: 90 } } })
    .jpeg()
    .toBuffer();
}

function stem(key: string): string {
  return path.basename(key, path.extname(key)).replace(/^.*?_[0-9a-f-]{36}/, 'F');
}

describe('media-renditions — parité multipart / TUS / chiffré (#11260)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'renditions-parity-'));
    process.env.UPLOAD_PATH = uploadDir;
    process.env.JWT_SECRET = JWT_SECRET;
    jest.resetModules();
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(uploadDir, { recursive: true, force: true });
    for (const [key, value] of Object.entries(saved)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  });

  function fakePrisma() {
    return {
      participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
      conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
      messageAttachment: {
        create: jest.fn<any>().mockImplementation(async ({ data }: any) => ({
          id: 'att', createdAt: new Date(), uploadedBy: USER_ID, isAnonymous: false, ...data,
        })),
      },
      postMedia: { create: jest.fn<any>().mockResolvedValue({ id: 'pm' }) },
      userSession: {
        findFirst: jest.fn<any>().mockResolvedValue(liveSession()),
        update: jest.fn<any>().mockReturnValue({ catch: jest.fn() }),
      },
    };
  }

  async function viaMultipart(bytes: Buffer) {
    const { UploadProcessor } = await import('../UploadProcessor');
    const prisma = fakePrisma();
    const processor = new UploadProcessor(prisma as any);
    await processor.uploadFile({ buffer: bytes, filename: 'photo.jpg', mimeType: 'image/jpeg', size: bytes.length }, USER_ID);
    return (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;
  }

  async function viaTus(bytes: Buffer) {
    const { registerTusRoutes } = await import('../../../routes/uploads/tus-handler');
    const prisma = fakePrisma();
    await registerTusRoutes({ prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any);
    if (!captured) throw new Error('options TUS non capturées');
    const created = await captured.onUploadCreate(
      { headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${jwt.sign({ userId: USER_ID, sid: LIVE_SID }, JWT_SECRET)}` : undefined) } },
      { metadata: { filename: 'photo.jpg', filetype: 'image/jpeg' }, size: bytes.length },
    );
    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, 'up-parity'), bytes);
    await captured.onUploadFinish({}, { id: 'up-parity', metadata: created.metadata, size: bytes.length, storage: undefined });
    return (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;
  }

  it('la même photo laisse les mêmes variantes, la même vignette et le même thumbhash par les deux chemins', async () => {
    const bytes = await photo();

    const multipart = await viaMultipart(bytes);
    const tus = await viaTus(bytes);

    expect(multipart.imageVariants.length).toBeGreaterThan(0);
    const shape = (variants: Array<{ width: number; height: number; format: string; url: string; size: number }>) =>
      variants.map(({ width, height, format, url, size }) => ({ width, height, format, size, stem: stem(url) }));
    expect(shape(tus.imageVariants)).toEqual(shape(multipart.imageVariants));
    expect(typeof tus.thumbHash).toBe('string');
    expect(tus.thumbHash).toBe(multipart.thumbHash);
    expect(stem(tus.thumbnailPath)).toBe(stem(multipart.thumbnailPath));
    expect(path.extname(tus.thumbnailPath)).toBe(path.extname(multipart.thumbnailPath));
  });

  it('chemin chiffré : le serveur reçoit le CLAIR, mais ne persiste ni variante ni thumbhash en clair', async () => {
    const { UploadProcessor } = await import('../UploadProcessor');
    const { MetadataManager } = await import('../MetadataManager');
    const variants = jest.spyOn(MetadataManager.prototype, 'generateImageVariants');
    const prisma = fakePrisma();
    const bytes = await photo();

    await new UploadProcessor(prisma as any).uploadEncryptedFile(
      { buffer: bytes, filename: 'photo.jpg', mimeType: 'image/jpeg', size: bytes.length },
      USER_ID,
      'e2ee' as any,
    );

    const data = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;
    expect(variants).not.toHaveBeenCalled();
    expect(data.imageVariants).toBeUndefined();
    expect(data.thumbHash).toBeUndefined();
    expect(data.isEncrypted).toBe(true);
    const written: string[] = [];
    const walk = async (dir: string): Promise<void> => {
      for (const entry of await fs.readdir(dir, { withFileTypes: true })) {
        if (entry.isDirectory()) await walk(path.join(dir, entry.name));
        else written.push(entry.name);
      }
    };
    await walk(uploadDir);
    expect(written.filter((name) => /\.webp$/.test(name))).toEqual([]);
  });
});
