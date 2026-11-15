/**
 * `media-renditions.ts` — la fabrique UNIQUE des rendus d'un média téléversé
 * (#11260) : vignette, variantes WebP, plan de transcodage vidéo, thumbhash.
 *
 * Appelée par `UploadProcessor.uploadFile` (multipart) ET par `onUploadFinish`
 * (TUS) : même entrée, même sortie. Ces témoins parlent à la fabrique seule,
 * sur un répertoire réel et un `MetadataManager` réel — sharp n'est jamais
 * doublé, c'est lui qui prouve que les variantes existent.
 */
import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { promises as fs } from 'fs';
import os from 'os';
import path from 'path';
import sharp from 'sharp';
import { MetadataManager } from '../MetadataManager';
import {
  produceMediaRenditions,
  produceEncryptedThumbnail,
  MAX_THUMBHASH_LENGTH,
} from '../media-renditions';

const ORIGINAL_VIDEO_TRANSCODE = process.env.VIDEO_TRANSCODE;
const ORIGINAL_MAX_SYNC = process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES;

async function jpeg(width: number, height: number): Promise<Buffer> {
  return sharp({ create: { width, height, channels: 3, background: { r: 90, g: 140, b: 200 } } })
    .jpeg()
    .toBuffer();
}

function noFfmpeg() {
  return jest.fn<(args: string[]) => Promise<void>>().mockResolvedValue(undefined);
}

describe('media-renditions — la fabrique commune des rendus (#11260)', () => {
  let root: string;
  let metadataManager: MetadataManager;

  beforeEach(async () => {
    root = await fs.mkdtemp(path.join(os.tmpdir(), 'media-renditions-'));
    metadataManager = new MetadataManager(root);
    delete process.env.VIDEO_TRANSCODE;
    delete process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES;
  });

  afterEach(async () => {
    await fs.rm(root, { recursive: true, force: true });
    if (ORIGINAL_VIDEO_TRANSCODE === undefined) delete process.env.VIDEO_TRANSCODE;
    else process.env.VIDEO_TRANSCODE = ORIGINAL_VIDEO_TRANSCODE;
    if (ORIGINAL_MAX_SYNC === undefined) delete process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES;
    else process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES = ORIGINAL_MAX_SYNC;
  });

  async function placeImage(relPath: string, width: number, height: number): Promise<number> {
    const bytes = await jpeg(width, height);
    await fs.mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
    await fs.writeFile(path.join(root, relPath), bytes);
    return bytes.length;
  }

  describe('image', () => {
    it('rend la vignette, les variantes WebP (clés de stockage, fichiers écrits) et un thumbhash serveur', async () => {
      const relPath = '2026/10/u1/photo.jpg';
      const fileSize = await placeImage(relPath, 2400, 1600);

      const out = await produceMediaRenditions(
        { uploadBasePath: root, metadataManager, runFfmpeg: noFfmpeg() },
        { relPath, mimeType: 'image/jpeg', attachmentType: 'image', fileSize, metadata: { width: 2400, height: 1600 } },
      );

      expect(out.thumbnailPath).toBe('2026/10/u1/photo_thumb.webp');
      expect(out.imageVariants?.length).toBeGreaterThan(0);
      for (const variant of out.imageVariants ?? []) {
        expect(variant.format).toBe('webp');
        expect(variant.url).toBe(`2026/10/u1/photo_${variant.width}w.webp`);
        expect(variant.url.startsWith('/')).toBe(false);
        expect(variant.url).not.toMatch(/^https?:/);
        const onDisk = await fs.stat(path.join(root, variant.url));
        expect(onDisk.size).toBe(variant.size);
      }
      expect(typeof out.thumbHash).toBe('string');
      expect(out.storedPath).toBe(relPath);
      expect(out.storedMimeType).toBe('image/jpeg');
      expect(out.storedSize).toBe(fileSize);
    });

    it('ne rend AUCUNE variante pour une image déjà petite, et la clé reste absente (champ optionnel)', async () => {
      const relPath = '2026/10/u1/small.jpg';
      const fileSize = await placeImage(relPath, 200, 100);

      const out = await produceMediaRenditions(
        { uploadBasePath: root, metadataManager, runFfmpeg: noFfmpeg() },
        { relPath, mimeType: 'image/jpeg', attachmentType: 'image', fileSize, metadata: {} },
      );

      expect(out.imageVariants).toBeUndefined();
    });

    it('garde un thumbhash client raisonnable et en refuse un trop long (défense en profondeur)', async () => {
      const relPath = '2026/10/u1/hash.jpg';
      const fileSize = await placeImage(relPath, 800, 600);
      const deps = { uploadBasePath: root, metadataManager, runFfmpeg: noFfmpeg() };
      const base = { relPath, mimeType: 'image/jpeg', attachmentType: 'image', fileSize, metadata: {} };

      const kept = await produceMediaRenditions(deps, { ...base, clientThumbHash: 'client-hash' });
      expect(kept.thumbHash).toBe('client-hash');

      const oversized = 'x'.repeat(MAX_THUMBHASH_LENGTH + 1);
      const replaced = await produceMediaRenditions(deps, { ...base, clientThumbHash: oversized });
      expect(replaced.thumbHash).not.toBe(oversized);
      expect(replaced.thumbHash?.length ?? 0).toBeLessThanOrEqual(MAX_THUMBHASH_LENGTH);
    });
  });

  describe('vidéo', () => {
    const relPath = '2026/10/u1/clip.mov';
    const bigClip = { width: 3840, height: 2160, bitrate: 20_000_000, videoCodec: 'vp9' };

    async function placeClip(bytes: number): Promise<void> {
      await fs.mkdir(path.dirname(path.join(root, relPath)), { recursive: true });
      await fs.writeFile(path.join(root, relPath), Buffer.alloc(bytes, 1));
    }

    function videoDeps(runFfmpeg: ReturnType<typeof noFfmpeg>) {
      const stub = {
        generateVideoThumbnail: jest.fn<(p: string) => Promise<string | null>>().mockResolvedValue('2026/10/u1/clip_thumb.jpg'),
        generateThumbnail: jest.fn<(p: string) => Promise<string | null>>().mockResolvedValue(null),
        generateImageVariants: jest.fn<(p: string) => Promise<never[]>>().mockResolvedValue([]),
        extractMetadata: jest
          .fn<(...a: unknown[]) => Promise<Record<string, unknown>>>()
          .mockResolvedValue({ width: 1280, height: 720, videoCodec: 'h264', bitrate: 2_000_000 }),
      };
      return { stub, deps: { uploadBasePath: root, metadataManager: stub, runFfmpeg } };
    }

    it('transcode un gros clip quand le drapeau est levé : chemin, taille, type et sonde suivent le fichier rendu', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      const size = 5 * 1024 * 1024;
      await placeClip(size);
      const runFfmpeg = jest.fn<(args: string[]) => Promise<void>>().mockImplementation(async (args) => {
        await fs.writeFile(args[args.length - 1], Buffer.alloc(1024 * 1024, 2));
      });
      const { stub, deps } = videoDeps(runFfmpeg);

      const out = await produceMediaRenditions(deps, {
        relPath, mimeType: 'video/quicktime', attachmentType: 'video', fileSize: size, metadata: bigClip, clientThumbHash: 'client-hash',
      });

      expect(runFfmpeg).toHaveBeenCalledTimes(1);
      expect(out.storedPath).toBe('2026/10/u1/clip_t.mp4');
      expect(out.storedMimeType).toBe('video/mp4');
      expect(out.storedSize).toBe(1024 * 1024);
      expect(out.metadata.videoCodec).toBe('h264');
      expect(stub.extractMetadata).toHaveBeenCalledWith('2026/10/u1/clip_t.mp4', 'video', 'video/mp4', undefined, 1024 * 1024);
      expect(out.thumbnailPath).toBe('2026/10/u1/clip_thumb.jpg');
      await expect(fs.stat(path.join(root, relPath))).rejects.toThrow();
    });

    it('laisse le clip intact quand le drapeau est baissé (défaut) : pas de ffmpeg, mêmes octets, codec client conservé', async () => {
      const size = 5 * 1024 * 1024;
      await placeClip(size);
      const { deps } = videoDeps(noFfmpeg());

      const out = await produceMediaRenditions(deps, {
        relPath, mimeType: 'video/quicktime', attachmentType: 'video', fileSize: size, metadata: bigClip, clientThumbHash: 'client-hash',
      });

      expect(deps.runFfmpeg).not.toHaveBeenCalled();
      expect(out.storedPath).toBe(relPath);
      expect(out.storedMimeType).toBe('video/quicktime');
      expect(out.metadata.videoCodec).toBe('vp9');
    });

    it('ne transcode pas au-delà du plafond synchrone et garde l original', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES = String(1024);
      const size = 5 * 1024 * 1024;
      await placeClip(size);
      const { deps } = videoDeps(noFfmpeg());

      const out = await produceMediaRenditions(deps, {
        relPath, mimeType: 'video/quicktime', attachmentType: 'video', fileSize: size, metadata: bigClip, clientThumbHash: 'client-hash',
      });

      expect(deps.runFfmpeg).not.toHaveBeenCalled();
      expect(out.storedPath).toBe(relPath);
    });

    it('garde l original si le transcodage échoue', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      const size = 5 * 1024 * 1024;
      await placeClip(size);
      const failing = jest.fn<(args: string[]) => Promise<void>>().mockRejectedValue(new Error('ffmpeg exit 1'));
      const { deps } = videoDeps(failing);

      const out = await produceMediaRenditions(deps, {
        relPath, mimeType: 'video/quicktime', attachmentType: 'video', fileSize: size, metadata: bigClip, clientThumbHash: 'client-hash',
      });

      expect(out.storedPath).toBe(relPath);
      expect(out.storedSize).toBe(size);
      await expect(fs.stat(path.join(root, relPath))).resolves.toBeDefined();
    });
  });

  describe('chemin chiffré — le serveur reçoit le CLAIR (ce n est pas du E2EE au sens de #9224)', () => {
    it('ne fabrique que la vignette en tampon (qui sera chiffrée) : ni fichier, ni variante, ni thumbhash', async () => {
      const mm = {
        generateThumbnailFromBuffer: jest.fn<(b: Buffer) => Promise<Buffer | undefined>>().mockResolvedValue(Buffer.from('thumb')),
        generateVideoThumbnailFromBuffer: jest.fn<(b: Buffer, m: string) => Promise<Buffer | undefined>>().mockResolvedValue(Buffer.from('vthumb')),
      };
      const buffer = await jpeg(900, 600);

      const image = await produceEncryptedThumbnail({ metadataManager: mm, attachmentType: 'image', buffer, mimeType: 'image/jpeg' });
      const video = await produceEncryptedThumbnail({ metadataManager: mm, attachmentType: 'video', buffer, mimeType: 'video/mp4' });
      const pdf = await produceEncryptedThumbnail({ metadataManager: mm, attachmentType: 'document', buffer, mimeType: 'application/pdf' });

      expect(image?.toString()).toBe('thumb');
      expect(video?.toString()).toBe('vthumb');
      expect(pdf).toBeUndefined();
      expect(mm.generateVideoThumbnailFromBuffer).toHaveBeenCalledWith(buffer, 'video/mp4');
      expect(await fs.readdir(root)).toEqual([]);
    });
  });
});
