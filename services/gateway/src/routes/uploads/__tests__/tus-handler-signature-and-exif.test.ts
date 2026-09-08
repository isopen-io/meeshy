/**
 * `routes/uploads/tus-handler.ts` — vérification universelle de signature et
 * retrait EXIF pour un appelant REGISTERED (#3627).
 *
 * Fichier SÉPARÉ de `tus-handler.test.ts` (déjà au-delà du budget de taille,
 * `gateway-test-file-size-budget.test.ts` § `DETTE_HERITEE`) — on n'y ajoute
 * pas, on extrait dans un fichier neuf dédié à ce comportement.
 *
 * Trois lois :
 *  - un fichier déclaré `image/*`/`audio/*` dont les octets ne correspondent
 *    pas est détruit et refusé (400), sur les DEUX branches (PostMedia et
 *    MessageAttachment) pour un appelant REGISTERED ;
 *  - un appelant ANONYME n'est PAS concerné par cette porte — sa branche
 *    passe par `classifyAnonymousAttachment`, qui reclasse plutôt que de
 *    rejeter (déjà couvert par `tus-handler.test.ts`) ;
 *  - une image RÉELLE qui porte de l'EXIF/GPS en est dépouillée avant
 *    persistance, et la taille enregistrée reflète les octets réellement
 *    écrits sur disque après ce retrait.
 *
 * Méthode de mock identique à `tus-handler.test.ts` : la plomberie `@tus/*`
 * est doublée, les vraies options (`onUploadCreate`/`onUploadFinish`) sont
 * capturées et invoquées avec un `prisma` factice sur un répertoire réel.
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import fs from 'fs/promises';
import os from 'os';
import path from 'path';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';

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
jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => ({
    extractMetadata: (...a: any[]) => mockExtractMetadata(...a),
    generateThumbnail: jest.fn().mockResolvedValue(null),
    generateVideoThumbnail: jest.fn().mockResolvedValue(null),
  })),
}));

jest.mock('../../../services/attachments/ThumbHashGenerator', () => ({
  ThumbHashGenerator: { generate: jest.fn().mockResolvedValue(null) },
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const JWT_SECRET = 'test-secret-tus-signature-exif';
const ORIGINAL_JWT_SECRET = process.env.JWT_SECRET;
const ORIGINAL_UPLOAD_PATH = process.env.UPLOAD_PATH;
const REGISTERED_USER_ID = '507f1f77bcf86cd799439011';

const PDF_BYTES = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\nreste du document...\n', 'binary');

function buildFakeFastify(prisma: any) {
  return { prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any;
}

function buildFakePrisma() {
  return {
    participant: { findFirst: jest.fn<any>().mockResolvedValue(null) },
    conversationShareLink: { findUnique: jest.fn<any>().mockResolvedValue(null) },
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

function registeredHeaders(userId = REGISTERED_USER_ID) {
  return { authorization: `Bearer ${jwt.sign({ userId }, JWT_SECRET)}` };
}

async function jpegWithExif(): Promise<Buffer> {
  return sharp({ create: { width: 40, height: 20, channels: 3, background: { r: 5, g: 6, b: 7 } } })
    .jpeg()
    .withExif({ IFD0: { Copyright: 'gps-holder-secret' } })
    .toBuffer();
}

describe('tus-handler — #3627 vérification de signature et EXIF (registered)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockExtractMetadata.mockClear();
    mockExtractMetadata.mockResolvedValue({});
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-signature-exif-test-'));
    process.env.JWT_SECRET = JWT_SECRET;
  });

  afterEach(async () => {
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
  });

  async function runFullUpload(params: {
    prisma: ReturnType<typeof buildFakePrisma>;
    filename: string;
    filetype: string;
    bytes: Buffer;
    uploadContext?: string;
  }) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes(buildFakeFastify(params.prisma));
    if (!captured) throw new Error('options TUS non capturées');

    const uploadId = 'upload-sig-exif';
    const metadata: Record<string, string> = {
      filename: params.filename,
      filetype: params.filetype,
      ...(params.uploadContext ? { uploadcontext: params.uploadContext } : {}),
    };

    const created = await captured.onUploadCreate(
      { headers: headersFrom(registeredHeaders()) },
      { metadata, size: params.bytes.length }
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

  async function destFiles(): Promise<string[]> {
    const now = new Date();
    const year = now.getFullYear().toString();
    const month = (now.getMonth() + 1).toString().padStart(2, '0');
    const dir = path.join(uploadDir, year, month, REGISTERED_USER_ID);
    try {
      return await fs.readdir(dir);
    } catch {
      return [];
    }
  }

  describe('branche MESSAGE — signature mérite le déclaré', () => {
    it('refuse un PDF déclaré audio/webm et détruit le fichier sur disque', async () => {
      const prisma = buildFakePrisma();
      const result = await runFullUpload({ prisma, filename: 'document.pdf', filetype: 'audio/webm', bytes: PDF_BYTES });

      expect(result.status_code).toBe(400);
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
      expect(await destFiles()).toEqual([]);
    });

    it('refuse un PDF déclaré image/png', async () => {
      const prisma = buildFakePrisma();
      const result = await runFullUpload({ prisma, filename: 'document.pdf', filetype: 'image/png', bytes: PDF_BYTES });

      expect(result.status_code).toBe(400);
      expect(prisma.messageAttachment.create).not.toHaveBeenCalled();
    });
  });

  describe('branche POSTMEDIA — signature mérite le déclaré', () => {
    it('refuse un PDF déclaré image/png (uploadcontext=post) et détruit le fichier', async () => {
      const prisma = buildFakePrisma();
      const result = await runFullUpload({
        prisma,
        filename: 'document.pdf',
        filetype: 'image/png',
        bytes: PDF_BYTES,
        uploadContext: 'post',
      });

      expect(result.status_code).toBe(400);
      expect(prisma.postMedia.create).not.toHaveBeenCalled();
      expect(await destFiles()).toEqual([]);
    });
  });

  describe('EXIF/GPS retiré avant persistance', () => {
    it('dépouille une image RÉELLE de son EXIF et enregistre la taille post-retrait', async () => {
      const prisma = buildFakePrisma();
      const original = await jpegWithExif();
      const beforeMeta = await sharp(original).metadata();
      expect(beforeMeta.exif).toBeDefined();

      const result = await runFullUpload({ prisma, filename: 'photo.jpg', filetype: 'image/jpeg', bytes: original });

      expect(result.status_code).toBe(200);
      expect(prisma.messageAttachment.create).toHaveBeenCalledTimes(1);
      const created = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;

      // La taille persistée reflète les octets APRÈS retrait, pas la taille
      // originale déclarée par le client à la création TUS.
      expect(created.fileSize).toBeLessThan(original.length);
      expect(created.fileSize).toBeGreaterThan(0);

      const files = await destFiles();
      expect(files).toHaveLength(1);
      const writtenBytes = await fs.readFile(
        path.join(uploadDir, new Date().getFullYear().toString(), (new Date().getMonth() + 1).toString().padStart(2, '0'), REGISTERED_USER_ID, files[0]),
      );
      expect(writtenBytes.length).toBe(created.fileSize);
      const afterMeta = await sharp(writtenBytes).metadata();
      expect(afterMeta.exif).toBeUndefined();
    });
  });
});
