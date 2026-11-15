/**
 * Les TROIS portes d'entrée retirent GPS et métadonnées, photo ET vidéo
 * (#11258, #9746) : le multipart (`uploadFile`), le résumable (`onUploadFinish`)
 * et le chiffrement côté serveur (`uploadEncryptedFile`), qui reçoit le CLAIR —
 * ce chemin n'est pas du E2EE au sens de #9224, il doit donc retirer avant de
 * chiffrer, sans quoi le GPS voyage dans le chiffré vers chaque destinataire.
 *
 * Tout est réel (sharp, ffmpeg, disque) ; seuls la base, la plomberie `@tus/*`
 * et le service de chiffrement sont doublés.
 *
 * @jest-environment node
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { execFileSync } from 'child_process';
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
const encryptedInputs: Buffer[] = [];

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
    encryptAttachment: jest.fn<any>().mockImplementation(async (input: any) => {
      encryptedInputs.push(input.fileBuffer);
      return {
        encryptedBuffer: Buffer.from('enc'),
        metadata: {
          encryptionKey: 'k', iv: 'iv', authTag: 'at', hmac: 'hm', originalSize: 100, originalHash: 'h',
          encryptedSize: 110, encryptedHash: 'eh', mode: 'server',
        },
      };
    }),
  }),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const JWT_SECRET = 'test-secret-metadata-strip-doors';
const USER_ID = '507f1f77bcf86cd799439011';
const SECRET = 'gps-holder-secret';
const saved = { JWT_SECRET: process.env.JWT_SECRET, UPLOAD_PATH: process.env.UPLOAD_PATH };

type Upload = { readonly bytes: Buffer; readonly filename: string; readonly mimeType: string };

async function photo(): Promise<Upload> {
  const bytes = await sharp({ create: { width: 64, height: 32, channels: 3, background: { r: 200, g: 60, b: 90 } } })
    .withIccProfile('p3')
    .withExif({ IFD0: { Copyright: SECRET } })
    .jpeg({ quality: 95 })
    .toBuffer();
  return { bytes, filename: 'photo.jpg', mimeType: 'image/jpeg' };
}

async function clip(workDir: string): Promise<Upload> {
  const output = path.join(workDir, 'source.mp4');
  execFileSync('ffmpeg', [
    '-v', 'error', '-f', 'lavfi', '-i', 'testsrc=duration=1:size=64x64:rate=10',
    '-c:v', 'mpeg4', '-movflags', 'use_metadata_tags',
    '-metadata', 'com.apple.quicktime.location.ISO6709=+48.8566+002.3522/', '-metadata', `title=${SECRET}`, '-f', 'mp4', '-y', output,
  ]);
  return { bytes: await fs.readFile(output), filename: 'clip.mp4', mimeType: 'video/mp4' };
}

const carriesSecret = (bytes: Buffer) => bytes.toString('latin1').includes(SECRET) || bytes.toString('latin1').includes('48.8566');

describe('retrait des métadonnées aux trois portes (#11258)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    encryptedInputs.length = 0;
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'metadata-strip-doors-'));
    process.env.UPLOAD_PATH = uploadDir;
    process.env.JWT_SECRET = JWT_SECRET;
    jest.resetModules();
  });

  afterEach(async () => {
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

  async function stored(data: { filePath: string; fileSize: number }): Promise<Buffer> {
    const bytes = await fs.readFile(path.join(uploadDir, data.filePath));
    expect(bytes.length).toBe(data.fileSize);
    return bytes;
  }

  async function viaMultipart(upload: Upload): Promise<Buffer> {
    const { UploadProcessor } = await import('../UploadProcessor');
    const prisma = fakePrisma();
    await new UploadProcessor(prisma as any).uploadFile(
      { buffer: upload.bytes, filename: upload.filename, mimeType: upload.mimeType, size: upload.bytes.length },
      USER_ID,
    );
    return stored((prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data);
  }

  async function viaTus(upload: Upload): Promise<Buffer> {
    const { registerTusRoutes } = await import('../../../routes/uploads/tus-handler');
    const prisma = fakePrisma();
    await registerTusRoutes({ prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any);
    if (!captured) throw new Error('options TUS non capturées');
    const created = await captured.onUploadCreate(
      { headers: { get: (k: string) => (k.toLowerCase() === 'authorization' ? `Bearer ${jwt.sign({ userId: USER_ID, sid: LIVE_SID }, JWT_SECRET)}` : undefined) } },
      { metadata: { filename: upload.filename, filetype: upload.mimeType }, size: upload.bytes.length },
    );
    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, 'up-strip'), upload.bytes);
    await captured.onUploadFinish({}, { id: 'up-strip', metadata: created.metadata, size: upload.bytes.length, storage: undefined });
    return stored((prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data);
  }

  async function viaServerEncryption(upload: Upload): Promise<Buffer> {
    const { UploadProcessor } = await import('../UploadProcessor');
    await new UploadProcessor(fakePrisma() as any).uploadEncryptedFile(
      { buffer: upload.bytes, filename: upload.filename, mimeType: upload.mimeType, size: upload.bytes.length },
      USER_ID,
      'server' as any,
    );
    expect(encryptedInputs).toHaveLength(1);
    return encryptedInputs[0];
  }

  it.each([
    ['multipart', viaMultipart],
    ['TUS', viaTus],
    ['chiffrement serveur', viaServerEncryption],
  ] as const)('%s : la photo perd son EXIF et garde son profil ICC', async (_, door) => {
    const upload = await photo();
    expect(carriesSecret(upload.bytes)).toBe(true);

    const bytes = await door(upload);

    expect(carriesSecret(bytes)).toBe(false);
    expect((await sharp(bytes).metadata()).icc).toBeDefined();
  });

  it.each([
    ['multipart', viaMultipart],
    ['TUS', viaTus],
    ['chiffrement serveur', viaServerEncryption],
  ] as const)('%s : la vidéo perd son GPS et son titre', async (_, door) => {
    const upload = await clip(uploadDir);
    expect(carriesSecret(upload.bytes)).toBe(true);

    const bytes = await door(upload);

    expect(carriesSecret(bytes)).toBe(false);
    expect(bytes.length).toBeGreaterThan(0);
  });
});
