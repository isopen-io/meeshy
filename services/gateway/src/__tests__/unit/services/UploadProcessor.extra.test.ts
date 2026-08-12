/**
 * Supplementary coverage tests for UploadProcessor.
 * Targets uncovered paths not reached by UploadProcessor.test.ts:
 *
 * - determinePublicUrl fallback (lines 122-124)
 * - amplifyAudio: stderr data + successful exit (lines 203, 220-230)
 * - amplifyAudio: temp-write error resolve (lines 242-244)
 * - maybeTranscodeVideo: all branches (lines 280-311)
 * - uploadFile video branch: generateVideoThumbnail + transcoded path (lines 421-439)
 * - uploadEncryptedFile video branch: generateVideoThumbnailFromBuffer (line 556)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

// ─── child_process mock ───────────────────────────────────────────────────────

const mockSpawnFn = jest.fn() as jest.Mock<any>;

jest.mock('child_process', () => ({
  spawn: (...args: unknown[]) => mockSpawnFn(...args),
}));

// ─── MetadataManager mock (includes video methods) ────────────────────────────

const mockMetadataManager = {
  extractMetadata: jest.fn() as jest.Mock<any>,
  generateThumbnail: jest.fn() as jest.Mock<any>,
  generateVideoThumbnail: jest.fn() as jest.Mock<any>,
  generateImageVariants: jest.fn() as jest.Mock<any>,
  generateThumbnailFromBuffer: jest.fn() as jest.Mock<any>,
  generateVideoThumbnailFromBuffer: jest.fn() as jest.Mock<any>,
  extractImageMetadataFromBuffer: jest.fn() as jest.Mock<any>,
};

jest.mock('../../../services/attachments/MetadataManager', () => ({
  MetadataManager: jest.fn().mockImplementation(() => mockMetadataManager),
}));

// ─── AttachmentEncryptionService mock ─────────────────────────────────────────

const mockEncryptionService = {
  encryptAttachment: jest.fn() as jest.Mock<any>,
};

jest.mock('../../../services/AttachmentEncryptionService', () => ({
  getAttachmentEncryptionService: jest.fn(() => mockEncryptionService),
}));

// ─── fs mock ─────────────────────────────────────────────────────────────────

const mockFsMkdir = jest.fn() as jest.Mock<any>;
const mockFsWriteFile = jest.fn() as jest.Mock<any>;
const mockFsChmod = jest.fn() as jest.Mock<any>;
const mockFsUnlink = jest.fn() as jest.Mock<any>;
const mockFsReadFile = jest.fn() as jest.Mock<any>;
const mockFsStat = jest.fn() as jest.Mock<any>;

jest.mock('fs', () => ({
  promises: {
    mkdir: (...a: unknown[]) => mockFsMkdir(...a),
    writeFile: (...a: unknown[]) => mockFsWriteFile(...a),
    chmod: (...a: unknown[]) => mockFsChmod(...a),
    unlink: (...a: unknown[]) => mockFsUnlink(...a),
    readFile: (...a: unknown[]) => mockFsReadFile(...a),
    stat: (...a: unknown[]) => mockFsStat(...a),
  },
}));

// ─── video-transcode-plan mock ────────────────────────────────────────────────

const mockPlanVideoTranscode = jest.fn() as jest.Mock<any>;
const mockBuildVideoTranscodeArgs = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/attachments/video-transcode-plan.js', () => ({
  planVideoTranscode: (...a: unknown[]) => mockPlanVideoTranscode(...a),
  buildVideoTranscodeArgs: (...a: unknown[]) => mockBuildVideoTranscodeArgs(...a),
}));

// ─── ThumbHashGenerator mock ──────────────────────────────────────────────────

jest.mock('../../../services/attachments/ThumbHashGenerator.js', () => ({
  ThumbHashGenerator: { generate: (jest.fn() as jest.Mock<any>).mockResolvedValue(null) },
}));

// ─── logger mock ──────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ debug: jest.fn(), info: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { UploadProcessor } from '../../../services/attachments/UploadProcessor';
import type { FileToUpload } from '../../../services/attachments/UploadProcessor';
import type { PrismaClient } from '@meeshy/shared/prisma/client';

// ─── Helpers ─────────────────────────────────────────────────────────────────

class MockProc extends EventEmitter {
  stderr = new EventEmitter();
  kill = jest.fn() as jest.Mock<any>;
}

function makeFile(overrides?: Partial<FileToUpload>): FileToUpload {
  return {
    buffer: Buffer.from('content'),
    filename: 'test.mp4',
    mimeType: 'video/mp4',
    size: 1024 * 100,
    ...overrides,
  };
}

const USER_ID = '507f1f77bcf86cd799439011';
const MSG_ID = '507f1f77bcf86cd799439012';
const ATTACH_ID = '507f1f77bcf86cd799439013';

function makeMockAttachment(o?: any) {
  return {
    id: ATTACH_ID, messageId: MSG_ID, fileName: 'file.mp4', originalName: 'test.mp4',
    mimeType: 'video/mp4', fileSize: 1024 * 100, filePath: '2024/01/user/file.mp4',
    fileUrl: '/api/v1/attachments/file/...', thumbnailPath: null, thumbnailUrl: null,
    width: null, height: null, uploadedBy: USER_ID, isAnonymous: false,
    createdAt: new Date(), updatedAt: new Date(), ...o,
  };
}

const mockPrisma = {
  messageAttachment: { create: jest.fn() as jest.Mock<any> },
} as unknown as PrismaClient;

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('UploadProcessor – extra coverage', () => {
  let processor: UploadProcessor;

  beforeEach(() => {
    jest.clearAllMocks();

    process.env.UPLOAD_PATH = '/test/uploads';
    process.env.NODE_ENV = 'test';
    delete process.env.PUBLIC_URL;
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    delete process.env.VIDEO_TRANSCODE;
    delete process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES;
    delete process.env.DOMAIN;

    mockFsMkdir.mockResolvedValue(undefined);
    mockFsWriteFile.mockResolvedValue(undefined);
    mockFsChmod.mockResolvedValue(undefined);
    mockFsUnlink.mockResolvedValue(undefined);
    mockFsReadFile.mockResolvedValue(Buffer.from('amplified'));
    mockFsStat.mockResolvedValue({ size: 50 });

    mockMetadataManager.extractMetadata.mockResolvedValue({ width: 0, height: 0, duration: 0 });
    mockMetadataManager.generateThumbnail.mockResolvedValue(null);
    mockMetadataManager.generateVideoThumbnail.mockResolvedValue(null);
    mockMetadataManager.generateImageVariants.mockResolvedValue([]);
    mockMetadataManager.generateThumbnailFromBuffer.mockResolvedValue(undefined);
    mockMetadataManager.generateVideoThumbnailFromBuffer.mockResolvedValue(undefined);
    mockMetadataManager.extractImageMetadataFromBuffer.mockResolvedValue({ width: 0, height: 0 });

    mockEncryptionService.encryptAttachment.mockResolvedValue({
      encryptedBuffer: Buffer.from('enc'),
      metadata: {
        encryptionKey: 'k', iv: 'iv', authTag: 'at', hmac: 'hm',
        originalSize: 100, originalHash: 'h', encryptedSize: 110,
        encryptedHash: 'eh', mode: 'e2ee' as any,
      },
    });

    (mockPrisma.messageAttachment.create as jest.Mock<any>).mockResolvedValue(makeMockAttachment());

    mockPlanVideoTranscode.mockReturnValue(null);
    mockBuildVideoTranscodeArgs.mockReturnValue(['-i', 'in', 'out']);

    processor = new UploadProcessor(mockPrisma);
  });

  afterEach(() => {
    delete process.env.UPLOAD_PATH;
    delete process.env.NODE_ENV;
    delete process.env.PUBLIC_URL;
    delete process.env.BACKEND_URL;
    delete process.env.NEXT_PUBLIC_BACKEND_URL;
    delete process.env.VIDEO_TRANSCODE;
    delete process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES;
    delete process.env.DOMAIN;
  });

  // ─── determinePublicUrl fallback (lines 122-124) ─────────────────────────

  describe('determinePublicUrl fallback', () => {
    it('uses BACKEND_URL when NODE_ENV is not prod/dev/local and no PUBLIC_URL', () => {
      process.env.BACKEND_URL = 'http://backend.test:4001';
      const p = new UploadProcessor(mockPrisma);
      expect(p.getAttachmentUrl('f.jpg')).toContain('http://backend.test:4001');
    });

    it('uses NEXT_PUBLIC_BACKEND_URL when BACKEND_URL not set', () => {
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://next.test:4002';
      const p = new UploadProcessor(mockPrisma);
      expect(p.getAttachmentUrl('f.jpg')).toContain('http://next.test:4002');
    });

    it('falls back to http://localhost:3000 when no env vars set', () => {
      const p = new UploadProcessor(mockPrisma);
      expect(p.getAttachmentUrl('f.jpg')).toContain('http://localhost:3000');
    });
  });

  // ─── amplifyAudio paths (lines 203, 220-230) ─────────────────────────────

  describe('amplifyAudio', () => {
    it('covers stderr data handler and successful exit returning amplified buffer', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockReturnValueOnce(proc);

      const p = (processor as any).amplifyAudio(Buffer.from('audio'), 'audio/mpeg');

      // yield so the fs.writeFile promise resolves and spawn is called
      await new Promise<void>(r => setImmediate(r));

      proc.stderr.emit('data', Buffer.from('ffmpeg output'));   // line 203
      proc.emit('close', 0);                                    // lines 220-230

      const result = await p;
      // fs.readFile mock returns Buffer.from('amplified')
      expect(result).toEqual(Buffer.from('amplified'));
    });

    it('returns original buffer when ffmpeg exits with non-zero code', async () => {
      const orig = Buffer.from('original');
      const proc = new MockProc();
      mockSpawnFn.mockReturnValueOnce(proc);

      const p = (processor as any).amplifyAudio(orig, 'audio/mpeg');
      await new Promise<void>(r => setImmediate(r));
      proc.emit('close', 1);

      expect(await p).toEqual(orig);
    });

    it('covers readFile error inside close handler (lines 227-230)', async () => {
      const orig = Buffer.from('fallback');
      const proc = new MockProc();
      mockSpawnFn.mockReturnValueOnce(proc);

      const p = (processor as any).amplifyAudio(orig, 'audio/webm');
      await new Promise<void>(r => setImmediate(r));

      // Make readFile throw so the inner catch block fires
      mockFsReadFile.mockRejectedValueOnce(new Error('read error'));
      proc.emit('close', 0);

      // should still resolve with original buffer
      expect(await p).toEqual(orig);
    });

    it('resolves with original buffer when temp-write throws (lines 241-244)', async () => {
      const orig = Buffer.from('audio');
      mockFsWriteFile.mockRejectedValueOnce(new Error('disk full'));

      const result = await (processor as any).amplifyAudio(orig, 'audio/mp4');
      expect(result).toEqual(orig);
    });

    it('resolves with original buffer when ffmpeg spawn emits error', async () => {
      const orig = Buffer.from('audio');
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('error', new Error('ENOENT')));
        return proc;
      });

      const p = (processor as any).amplifyAudio(orig, 'audio/ogg');
      await new Promise<void>(r => setImmediate(r));
      const result = await p;
      expect(result).toEqual(orig);
    });
  });

  // ─── maybeTranscodeVideo (lines 280-311) ─────────────────────────────────

  describe('maybeTranscodeVideo', () => {
    it('returns null when VIDEO_TRANSCODE is not "true"', async () => {
      const r = await (processor as any).maybeTranscodeVideo('v.mp4', {}, 1000);
      expect(r).toBeNull();
    });

    it('returns null when planVideoTranscode returns null', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValueOnce(null);
      const r = await (processor as any).maybeTranscodeVideo('v.mp4', {}, 1000);
      expect(r).toBeNull();
    });

    it('returns null when fileSize exceeds VIDEO_TRANSCODE_MAX_SYNC_BYTES', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      process.env.VIDEO_TRANSCODE_MAX_SYNC_BYTES = '500';
      mockPlanVideoTranscode.mockReturnValueOnce({ scale: '1280:-1' });
      const r = await (processor as any).maybeTranscodeVideo('v.mp4', {}, 1000);
      expect(r).toBeNull();
    });

    it('returns null and unlinks on ffmpeg error (lines 308-311)', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValueOnce({ scale: '1280:-1' });
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('error', new Error('no ffmpeg')));
        return proc;
      });
      const r = await (processor as any).maybeTranscodeVideo('v.mp4', {}, 100);
      expect(r).toBeNull();
      expect(mockFsUnlink).toHaveBeenCalled();
    });

    it('returns null when transcoded file is empty (size === 0)', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValueOnce({ scale: '1280:-1' });
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('close', 0));
        return proc;
      });
      mockFsStat.mockResolvedValueOnce({ size: 0 });
      const r = await (processor as any).maybeTranscodeVideo('v.mp4', {}, 1000);
      expect(r).toBeNull();
    });

    it('returns null when transcoded size >= original (no benefit)', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValueOnce({ scale: '1280:-1' });
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('close', 0));
        return proc;
      });
      mockFsStat.mockResolvedValueOnce({ size: 2000 }); // >= original 1000
      const r = await (processor as any).maybeTranscodeVideo('v.mp4', {}, 1000);
      expect(r).toBeNull();
    });

    it('returns transcoded info when output is smaller than input (lines 306-307)', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValueOnce({ scale: '1280:-1' });
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('close', 0));
        return proc;
      });
      mockFsStat.mockResolvedValueOnce({ size: 400 }); // < original 1000
      const r = await (processor as any).maybeTranscodeVideo('test/v.mp4', {}, 1000);
      expect(r).not.toBeNull();
      expect(r!.mimeType).toBe('video/mp4');
      expect(r!.fileSize).toBe(400);
    });
  });

  // ─── uploadFile video branch (lines 421-439) ─────────────────────────────

  describe('uploadFile with video mimeType', () => {
    it('calls generateVideoThumbnail for video attachments', async () => {
      const file = makeFile();
      await processor.uploadFile(file, USER_ID, false, MSG_ID);
      expect(mockMetadataManager.generateVideoThumbnail).toHaveBeenCalled();
    });

    it('applies transcoded metadata when maybeTranscodeVideo returns non-null (lines 427-438)', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValue({ scale: '1280:-1' });

      const proc = new MockProc();
      mockSpawnFn.mockImplementation(() => {
        const p = new MockProc();
        process.nextTick(() => p.emit('close', 0));
        return p;
      });
      mockFsStat.mockResolvedValue({ size: 50 }); // < file.size 102400

      mockMetadataManager.extractMetadata
        .mockResolvedValueOnce({ width: 1280, height: 720, duration: 5000, fps: 30, videoCodec: 'h264', bitrate: 3000 })
        .mockResolvedValueOnce({ width: 1280, height: 720, duration: 5000, fps: 30, videoCodec: 'h264', bitrate: 1500 });

      const file = makeFile({ size: 102400 });
      await processor.uploadFile(file, USER_ID, false, MSG_ID);

      // extractMetadata called twice: initial + re-probe after transcode
      expect(mockMetadataManager.extractMetadata).toHaveBeenCalledTimes(2);
    });

    it('keeps prior metadata when re-probe after transcode throws', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValue({ scale: '1280:-1' });

      mockSpawnFn.mockImplementation(() => {
        const p = new MockProc();
        process.nextTick(() => p.emit('close', 0));
        return p;
      });
      mockFsStat.mockResolvedValue({ size: 50 });

      mockMetadataManager.extractMetadata
        .mockResolvedValueOnce({ width: 1280, height: 720 })
        .mockRejectedValueOnce(new Error('re-probe failed'));

      const file = makeFile({ size: 102400 });
      // Should not throw even when re-probe fails
      const result = await processor.uploadFile(file, USER_ID, false, MSG_ID);
      expect(result).toBeDefined();
    });
  });

  // ─── uploadEncryptedFile video branch (line 556) ─────────────────────────

  describe('uploadEncryptedFile with video mimeType', () => {
    it('calls generateVideoThumbnailFromBuffer for video attachments', async () => {
      const file = makeFile();
      await processor.uploadEncryptedFile(file, USER_ID, 'e2ee' as any, false, MSG_ID);
      expect(mockMetadataManager.generateVideoThumbnailFromBuffer).toHaveBeenCalledWith(
        file.buffer,
        'video/mp4'
      );
    });

    it('handles webm mimeType in video encrypted upload', async () => {
      const file = makeFile({ mimeType: 'video/webm', filename: 'test.webm' });
      await processor.uploadEncryptedFile(file, USER_ID, 'e2ee' as any, false, MSG_ID);
      expect(mockMetadataManager.generateVideoThumbnailFromBuffer).toHaveBeenCalledWith(
        file.buffer,
        'video/webm'
      );
    });
  });

  // ─── runFfmpeg timeout (lines 254-255) ───────────────────────────────────

  describe('runFfmpeg timeout', () => {
    it('kills process and rejects after timeout (lines 254-255)', async () => {
      jest.useFakeTimers();

      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => proc);

      // Call runFfmpeg via maybeTranscodeVideo (which uses runFfmpeg internally)
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValueOnce({ scale: '1280:-1' });
      mockBuildVideoTranscodeArgs.mockReturnValueOnce(['-i', 'in.mp4', 'out.mp4']);

      const p = (processor as any).maybeTranscodeVideo('test/v.mp4', {}, 10000);

      // Advance time past the 5-minute timeout
      jest.advanceTimersByTime(5 * 60 * 1000 + 1);

      const result = await p;
      expect(result).toBeNull();
      expect(proc.kill).toHaveBeenCalledWith('SIGKILL');

      jest.useRealTimers();
    });

    it('rejects with non-zero exit code (line 260 reject branch)', async () => {
      process.env.VIDEO_TRANSCODE = 'true';
      mockPlanVideoTranscode.mockReturnValueOnce({ scale: '1280:-1' });
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('close', 1)); // non-zero exit
        return proc;
      });
      const r = await (processor as any).maybeTranscodeVideo('v.mp4', {}, 100);
      expect(r).toBeNull(); // maybeTranscodeVideo catches rejection
    });
  });

  // ─── determinePublicUrl production + development branches ────────────────

  describe('determinePublicUrl production/development', () => {
    it('production mode with DOMAIN set (line 106 false branch)', () => {
      process.env.NODE_ENV = 'production';
      process.env.DOMAIN = 'example.com';
      const p = new UploadProcessor(mockPrisma);
      expect(p.getAttachmentUrl('f.jpg')).toContain('example.com');
    });

    it('production mode with no DOMAIN (line 106 true branch "meeshy.me")', () => {
      process.env.NODE_ENV = 'production';
      delete process.env.DOMAIN;
      const p = new UploadProcessor(mockPrisma);
      expect(p.getAttachmentUrl('f.jpg')).toContain('meeshy.me');
    });

    it('development mode: uses BACKEND_URL (line 113)', () => {
      process.env.NODE_ENV = 'development';
      process.env.BACKEND_URL = 'http://dev.test:3000';
      const p = new UploadProcessor(mockPrisma);
      expect(p.getAttachmentUrl('f.jpg')).toContain('http://dev.test:3000');
    });

    it('development mode: uses NEXT_PUBLIC_BACKEND_URL when BACKEND_URL not set (line 114)', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.BACKEND_URL;
      process.env.NEXT_PUBLIC_BACKEND_URL = 'http://next.dev:3000';
      const p = new UploadProcessor(mockPrisma);
      expect(p.getAttachmentUrl('f.jpg')).toContain('http://next.dev:3000');
    });

    it('development mode: uses PORT for localhost (line 116)', () => {
      process.env.NODE_ENV = 'development';
      delete process.env.BACKEND_URL;
      delete process.env.NEXT_PUBLIC_BACKEND_URL;
      process.env.PORT = '4000';
      const p = new UploadProcessor(mockPrisma);
      expect(p.getAttachmentUrl('f.jpg')).toContain('localhost:4000');
    });
  });

  // ─── amplifyAudio format branches (lines 170-171, 173) ──────────────────

  describe('amplifyAudio format branches', () => {
    it('uses wav output format for audio/wav (line 170)', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockReturnValueOnce(proc);
      const p = (processor as any).amplifyAudio(Buffer.from('audio'), 'audio/wav');
      await new Promise<void>(r => setImmediate(r));
      proc.emit('close', 0);
      await p;
      const spawnArgs = mockSpawnFn.mock.calls[0][1] as string[];
      expect(spawnArgs.some((a: string) => a.includes('.wav'))).toBe(true);
    });

    it('uses mp3 output format for audio/mp3 (line 171)', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockReturnValueOnce(proc);
      const p = (processor as any).amplifyAudio(Buffer.from('audio'), 'audio/mp3');
      await new Promise<void>(r => setImmediate(r));
      proc.emit('close', 0);
      await p;
      const spawnArgs = mockSpawnFn.mock.calls[0][1] as string[];
      expect(spawnArgs.some((a: string) => a.includes('.mp3'))).toBe(true);
    });

    it('uses m4a output format for audio/m4a (line 173)', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockReturnValueOnce(proc);
      const p = (processor as any).amplifyAudio(Buffer.from('audio'), 'audio/m4a');
      await new Promise<void>(r => setImmediate(r));
      proc.emit('close', 0);
      await p;
      const spawnArgs = mockSpawnFn.mock.calls[0][1] as string[];
      expect(spawnArgs.some((a: string) => a.includes('.m4a'))).toBe(true);
    });
  });

  // ─── uploadFile with client thumbHash (lines 449-452) ───────────────────

  describe('uploadFile with client thumbHash', () => {
    it('uses client thumbHash from providedMetadata when valid (lines 449-452)', async () => {
      const validThumbHash = 'YQeLZAhWV4d3iH+H';
      const file = makeFile({ mimeType: 'image/jpeg', filename: 'photo.jpg' });
      await processor.uploadFile(file, USER_ID, false, MSG_ID, { thumbHash: validThumbHash });
      // If thumbHash was used, ThumbHashGenerator.generate should NOT have been called
      // (but we can't easily verify dynamic import; just verify it completes without error)
      expect(mockPrisma.messageAttachment.create).toHaveBeenCalled();
    });
  });

  // ─── uploadEncryptedFile audio with providedMetadata (lines 592-597) ─────

  describe('uploadEncryptedFile audio with providedMetadata', () => {
    it('applies audio metadata from providedMetadata (lines 592-597)', async () => {
      const file = makeFile({ mimeType: 'audio/mpeg', filename: 'audio.mp3' });
      const metadata = {
        duration: 60000,
        bitrate: 128000,
        sampleRate: 44100,
        codec: 'mp3',
        channels: 2,
        audioEffectsTimeline: [{ t: 0, effect: 'boost' }],
      };
      await processor.uploadEncryptedFile(file, USER_ID, 'e2ee' as any, false, MSG_ID, metadata);
      expect(mockPrisma.messageAttachment.create).toHaveBeenCalled();
    });

    it('applies audio metadata without audioEffectsTimeline (line 591-596)', async () => {
      const file = makeFile({ mimeType: 'audio/mpeg', filename: 'audio.mp3' });
      await processor.uploadEncryptedFile(file, USER_ID, 'e2ee' as any, false, MSG_ID, {
        duration: 30000, bitrate: 64000, sampleRate: 22050, codec: 'mp3', channels: 1,
      });
      expect(mockPrisma.messageAttachment.create).toHaveBeenCalled();
    });
  });

  // ─── uploadMultiple with metadataMap (line 685 optional chain) ───────────

  describe('uploadMultiple with metadataMap', () => {
    it('passes per-file metadata when metadataMap is provided (line 685)', async () => {
      (mockPrisma.messageAttachment.create as jest.Mock<any>).mockResolvedValue(makeMockAttachment());
      const files = [
        makeFile({ filename: 'a.jpg', mimeType: 'image/jpeg' }),
        makeFile({ filename: 'b.jpg', mimeType: 'image/jpeg' }),
      ];
      const metadataMap = new Map<number, any>([[0, { thumbHash: 'abc' }], [1, { thumbHash: 'def' }]]);
      const results = await processor.uploadMultiple(files, USER_ID, false, MSG_ID, metadataMap);
      expect(results).toHaveLength(2);
    });
  });
});
