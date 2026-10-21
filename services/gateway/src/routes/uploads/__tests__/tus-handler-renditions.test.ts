/**
 * `routes/uploads/tus-handler.ts` — le chemin résumable produit les MÊMES
 * rendus que le chemin multipart (#11260) : variantes WebP, plan de
 * transcodage vidéo, codec persisté, sur les DEUX branches (PostMedia et
 * MessageAttachment).
 *
 * Le `MetadataManager` et `sharp` sont RÉELS, sur un répertoire réel : ce sont
 * eux qui prouvent que les variantes existent sur disque. Seuls les
 * sous-processus ffmpeg et la sonde de métadonnées VIDÉO sont doublés (aucun
 * flux vidéo réel à fabriquer ici).
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
jest.mock('../../../services/attachments/ffmpeg-run', () => ({
  runFfmpeg: (args: string[]) => mockRunFfmpeg(args),
}));

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: { child: () => ({ error: jest.fn(), warn: jest.fn(), info: jest.fn(), debug: jest.fn() }) },
}));

const JWT_SECRET = 'test-secret-tus-renditions';
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

async function bigJpeg(): Promise<Buffer> {
  return sharp({ create: { width: 2400, height: 1600, channels: 3, background: { r: 10, g: 120, b: 220 } } })
    .jpeg()
    .toBuffer();
}

describe('tus-handler — mêmes rendus que le chemin multipart (#11260)', () => {
  let uploadDir: string;

  beforeEach(async () => {
    captured = null;
    mockRunFfmpeg.mockReset();
    uploadDir = await fs.mkdtemp(path.join(os.tmpdir(), 'tus-renditions-test-'));
    process.env.JWT_SECRET = JWT_SECRET;
    delete process.env.VIDEO_TRANSCODE;
  });

  afterEach(async () => {
    jest.restoreAllMocks();
    await fs.rm(uploadDir, { recursive: true, force: true });
    if (ORIGINAL_JWT_SECRET === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = ORIGINAL_JWT_SECRET;
    if (ORIGINAL_UPLOAD_PATH === undefined) delete process.env.UPLOAD_PATH;
    else process.env.UPLOAD_PATH = ORIGINAL_UPLOAD_PATH;
    if (ORIGINAL_VIDEO_TRANSCODE === undefined) delete process.env.VIDEO_TRANSCODE;
    else process.env.VIDEO_TRANSCODE = ORIGINAL_VIDEO_TRANSCODE;
  });

  async function runFullUpload(params: {
    prisma: ReturnType<typeof buildFakePrisma>;
    filename: string;
    filetype: string;
    bytes: Buffer;
    uploadContext?: string;
    stubVideoProbe?: Array<Record<string, unknown>>;
  }) {
    process.env.UPLOAD_PATH = uploadDir;
    jest.resetModules();
    const { MetadataManager } = await import('../../../services/attachments/MetadataManager');
    if (params.stubVideoProbe) {
      jest.spyOn(MetadataManager.prototype, 'probeMediaStreams').mockResolvedValue({ video: true, audio: true });
      jest.spyOn(MetadataManager.prototype, 'generateVideoThumbnail').mockResolvedValue(null);
      const probe = jest.spyOn(MetadataManager.prototype, 'extractMetadata');
      params.stubVideoProbe.forEach((result) => probe.mockResolvedValueOnce(result as any));
    }
    const { registerTusRoutes } = await import('../tus-handler');
    await registerTusRoutes({ prisma: params.prisma, addContentTypeParser: jest.fn(), route: jest.fn() } as any);
    if (!captured) throw new Error('options TUS non capturées');

    const uploadId = 'upload-renditions';
    const metadata: Record<string, string> = {
      filename: params.filename,
      filetype: params.filetype,
      thumbhash: 'client-hash',
      ...(params.uploadContext ? { uploadcontext: params.uploadContext } : {}),
    };
    const created = await captured.onUploadCreate(
      { headers: headersFrom({ authorization: `Bearer ${jwt.sign({ userId: USER_ID, sid: LIVE_SID }, JWT_SECRET)}` }) },
      { metadata, size: params.bytes.length },
    );
    const tusTempPath = path.join(uploadDir, '.tus-resumable');
    await fs.mkdir(tusTempPath, { recursive: true });
    await fs.writeFile(path.join(tusTempPath, uploadId), params.bytes);
    return captured.onUploadFinish({}, { id: uploadId, metadata: created.metadata, size: params.bytes.length, storage: undefined });
  }

  async function storedFiles(): Promise<string[]> {
    const now = new Date();
    const dir = path.join(
      uploadDir,
      now.getFullYear().toString(),
      (now.getMonth() + 1).toString().padStart(2, '0'),
      USER_ID,
    );
    return fs.readdir(dir).catch(() => []);
  }

  describe('image', () => {
    it('PostMedia : persiste les variantes WebP (clés de stockage, fichiers sur disque) à côté de la vignette', async () => {
      const prisma = buildFakePrisma();
      const result = await runFullUpload({ prisma, filename: 'photo.jpg', filetype: 'image/jpeg', bytes: await bigJpeg(), uploadContext: 'post' });

      expect(result.status_code).toBe(200);
      const data = (prisma.postMedia.create as jest.Mock<any>).mock.calls[0][0].data;
      expect(Array.isArray(data.imageVariants)).toBe(true);
      expect(data.imageVariants.length).toBeGreaterThan(0);
      const files = await storedFiles();
      for (const variant of data.imageVariants) {
        expect(variant.format).toBe('webp');
        expect(variant.url).toBe(path.join(data.filePath.replace(/[^/]+$/, ''), `${path.basename(data.filePath, path.extname(data.filePath))}_${variant.width}w.webp`));
        expect(files).toContain(path.basename(variant.url));
      }
      expect(data.thumbnailUrl).toMatch(/_thumb\.webp$/);
    });

    it('MessageAttachment : persiste les mêmes variantes', async () => {
      const prisma = buildFakePrisma();
      const result = await runFullUpload({ prisma, filename: 'photo.jpg', filetype: 'image/jpeg', bytes: await bigJpeg() });

      expect(result.status_code).toBe(200);
      const data = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;
      expect(data.imageVariants.length).toBeGreaterThan(0);
      expect(data.imageVariants.every((v: { format: string }) => v.format === 'webp')).toBe(true);
    });

    it('serialisation ancien client : la réponse garde tous les champs historiques, aux mêmes formes, même quand des variantes existent', async () => {
      const prisma = buildFakePrisma();
      const result = await runFullUpload({ prisma, filename: 'photo.jpg', filetype: 'image/jpeg', bytes: await bigJpeg(), uploadContext: 'post' });

      const attachment = JSON.parse(result.body ?? '{}').data.attachment;
      for (const legacyKey of [
        'id', 'fileName', 'originalName', 'mimeType', 'fileSize', 'fileUrl', 'thumbnailUrl', 'thumbHash',
        'width', 'height', 'uploadedBy', 'isAnonymous', 'createdAt',
      ]) {
        expect(attachment).toHaveProperty(legacyKey);
      }
      expect(attachment.thumbHash).toBe('client-hash');
      expect(attachment.fileUrl).not.toMatch(/^\/|^https?:/);
    });

    it('un petit PDF ne reçoit AUCUNE variante : le champ reste absent, jamais null (Json? Prisma)', async () => {
      const prisma = buildFakePrisma();
      const pdf = Buffer.from('%PDF-1.4\n%\xe2\xe3\xcf\xd3\nreste du document...\n', 'binary');
      await runFullUpload({ prisma, filename: 'doc.pdf', filetype: 'application/pdf', bytes: pdf, uploadContext: 'post' });

      const data = (prisma.postMedia.create as jest.Mock<any>).mock.calls[0][0].data;
      expect(data.imageVariants).toBeUndefined();
      expect(data.imageVariants).not.toBeNull();
    });
  });

  describe('vidéo', () => {
    const clip = Buffer.alloc(5 * 1024 * 1024, 7);
    const heavy = { width: 3840, height: 2160, bitrate: 20_000_000, videoCodec: 'hevc', duration: 4000 };
    const light = { width: 1280, height: 720, bitrate: 2_000_000, videoCodec: 'h264', duration: 4000 };

    it('PostMedia : persiste le codec vidéo (la ligne ne le portait pas)', async () => {
      const prisma = buildFakePrisma();
      await runFullUpload({ prisma, filename: 'clip.mp4', filetype: 'video/mp4', bytes: clip, uploadContext: 'post', stubVideoProbe: [heavy] });

      const data = (prisma.postMedia.create as jest.Mock<any>).mock.calls[0][0].data;
      expect(data.videoCodec).toBe('hevc');
      expect(mockRunFfmpeg).not.toHaveBeenCalled();
    });

    it('drapeau levé : le clip lourd est transcodé et c est le fichier RENDU que la ligne, le disque et la réponse désignent', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockRunFfmpeg.mockImplementation(async (args) => {
        await fs.writeFile(args[args.length - 1], Buffer.alloc(1024 * 1024, 9));
      });
      const prisma = buildFakePrisma();
      const result = await runFullUpload({
        prisma, filename: 'clip.mp4', filetype: 'video/mp4', bytes: clip, uploadContext: 'post', stubVideoProbe: [heavy, light],
      });

      expect(mockRunFfmpeg).toHaveBeenCalledTimes(1);
      const data = (prisma.postMedia.create as jest.Mock<any>).mock.calls[0][0].data;
      expect(data.fileName).toMatch(/_t\.mp4$/);
      expect(data.filePath).toMatch(/_t\.mp4$/);
      expect(data.fileUrl).toBe(data.filePath);
      expect(data.mimeType).toBe('video/mp4');
      expect(data.fileSize).toBe(1024 * 1024);
      expect(data.videoCodec).toBe('h264');
      expect(await storedFiles()).toEqual([data.fileName]);
      const body = JSON.parse(result.body ?? '{}').data.attachment;
      expect(body.fileUrl).toBe(data.fileUrl);
      expect(body.fileSize).toBe(1024 * 1024);
    });

    it('drapeau baissé (défaut) : aucun ffmpeg, l original est servi tel quel', async () => {
      const prisma = buildFakePrisma();
      await runFullUpload({ prisma, filename: 'clip.mp4', filetype: 'video/mp4', bytes: clip, stubVideoProbe: [heavy] });

      expect(mockRunFfmpeg).not.toHaveBeenCalled();
      const data = (prisma.messageAttachment.create as jest.Mock<any>).mock.calls[0][0].data;
      expect(data.fileSize).toBe(clip.length);
      expect(data.videoCodec).toBe('hevc');
    });
  });
});
