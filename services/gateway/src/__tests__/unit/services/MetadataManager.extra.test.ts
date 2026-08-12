/**
 * Supplementary coverage tests for MetadataManager.
 * Targets uncovered paths not reached by MetadataManager.test.ts:
 *
 * - generateImageVariants (lines 93-111)
 * - generateVideoThumbnail (lines 131-170)
 * - generateVideoThumbnailFromBuffer (lines 175-210)
 * - extractAudioWithFfprobe via extractAudioMetadata (lines 252-299)
 * - calculateWavDuration (lines 304-355)
 * - validateAudioCoherence: bitrate-too-low + bitrate-too-high (lines 374, 422-432)
 * - extractAudioMetadata: stat call, WAV fallback, M4A fallback (lines 490-493, 501-509)
 * - extractMetadata: audio comparison logic (lines 683, 718-777)
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { EventEmitter } from 'events';

// ─── child_process mock ───────────────────────────────────────────────────────

const mockSpawnFn = jest.fn() as jest.Mock<any>;
jest.mock('child_process', () => ({
  spawn: (...a: unknown[]) => mockSpawnFn(...a),
}));

// ─── fs mock ─────────────────────────────────────────────────────────────────

const mockFsMkdir = jest.fn() as jest.Mock<any>;
const mockFsWriteFile = jest.fn() as jest.Mock<any>;
const mockFsReadFile = jest.fn() as jest.Mock<any>;
const mockFsStat = jest.fn() as jest.Mock<any>;
const mockFsOpen = jest.fn() as jest.Mock<any>;
const mockFsUnlink = jest.fn() as jest.Mock<any>;

jest.mock('fs', () => ({
  promises: {
    mkdir: (...a: unknown[]) => mockFsMkdir(...a),
    writeFile: (...a: unknown[]) => mockFsWriteFile(...a),
    readFile: (...a: unknown[]) => mockFsReadFile(...a),
    stat: (...a: unknown[]) => mockFsStat(...a),
    open: (...a: unknown[]) => mockFsOpen(...a),
    unlink: (...a: unknown[]) => mockFsUnlink(...a),
  },
}));

// ─── thumbnail module mock ────────────────────────────────────────────────────

const mockCreateImageThumbnail = jest.fn() as jest.Mock<any>;
const mockCreateResponsiveVariants = jest.fn() as jest.Mock<any>;

jest.mock('../../../services/attachments/thumbnail', () => ({
  createImageThumbnail: (...a: unknown[]) => mockCreateImageThumbnail(...a),
  createResponsiveVariants: (...a: unknown[]) => mockCreateResponsiveVariants(...a),
  thumbnailPathFor: (p: string) => {
    const i = p.lastIndexOf('.');
    return (i >= 0 ? p.slice(0, i) : p) + '_thumb.webp';
  },
  variantPathFor: (p: string, w: number) => {
    const i = p.lastIndexOf('.');
    return (i >= 0 ? p.slice(0, i) : p) + `_${w}w.webp`;
  },
}));

// ─── fluent-ffmpeg mock ───────────────────────────────────────────────────────

const mockFfprobe = jest.fn() as jest.Mock<any>;
jest.mock('fluent-ffmpeg', () => ({ ffprobe: (...a: unknown[]) => mockFfprobe(...a) }));

// ─── music-metadata mock ──────────────────────────────────────────────────────

const mockParseFile = jest.fn() as jest.Mock<any>;
// music-metadata est ESM-only : injecté via le seam `musicMetadataLoader` (cf. beforeEach), pas via jest.mock.

// ─── sharp mock ───────────────────────────────────────────────────────────────

const mockSharp = jest.fn() as jest.Mock<any>;
jest.mock('sharp', () => mockSharp);

// ─── pdf-parse mock ───────────────────────────────────────────────────────────

class MockPDFParse {
  constructor(_opts: any) {}
  async getInfo() { return { total: 3 }; }
  async destroy() {}
}
jest.mock('pdf-parse', () => ({ PDFParse: MockPDFParse }));

// ─── logger mock ──────────────────────────────────────────────────────────────

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({ info: jest.fn(), warn: jest.fn(), error: jest.fn(), debug: jest.fn() })),
  },
}));

// ─── Imports after mocks ──────────────────────────────────────────────────────

import { MetadataManager, musicMetadataLoader } from '../../../services/attachments/MetadataManager';

// ─── Helpers ─────────────────────────────────────────────────────────────────

class MockProc extends EventEmitter {
  stderr = new EventEmitter();
  kill = jest.fn() as jest.Mock<any>;
}

function makeSharpChain(metaOverride?: object) {
  const chain: any = {
    metadata: (jest.fn() as jest.Mock<any>).mockResolvedValue({ width: 1920, height: 1080, ...metaOverride }),
    resize: jest.fn(),
    webp: jest.fn(),
    toBuffer: (jest.fn() as jest.Mock<any>).mockResolvedValue(Buffer.from('thumbnail')),
  };
  chain.resize.mockReturnValue(chain);
  chain.webp.mockReturnValue(chain);
  return chain;
}

const BASE = '/test/uploads';

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('MetadataManager – extra coverage', () => {
  let mgr: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    musicMetadataLoader.parseFile = mockParseFile;
    mgr = new MetadataManager(BASE);

    mockFsMkdir.mockResolvedValue(undefined);
    mockFsWriteFile.mockResolvedValue(undefined);
    mockFsReadFile.mockResolvedValue(Buffer.from('file'));
    mockFsStat.mockResolvedValue({ size: 5000 });
    mockFsUnlink.mockResolvedValue(undefined);

    mockCreateImageThumbnail.mockResolvedValue(Buffer.from('thumb'));
    mockCreateResponsiveVariants.mockResolvedValue([]);
    mockSharp.mockReturnValue(makeSharpChain());
  });

  // ─── generateImageVariants (lines 93-111) ─────────────────────────────────

  describe('generateImageVariants', () => {
    it('returns empty array when createResponsiveVariants returns none', async () => {
      mockCreateResponsiveVariants.mockResolvedValueOnce([]);
      const r = await mgr.generateImageVariants('test/img.jpg');
      expect(r).toEqual([]);
      expect(mockCreateResponsiveVariants).toHaveBeenCalledWith(`${BASE}/test/img.jpg`);
    });

    it('writes variants and returns their metadata', async () => {
      mockCreateResponsiveVariants.mockResolvedValueOnce([
        { width: 640, height: 360, buffer: Buffer.alloc(4000) },
        { width: 1080, height: 607, buffer: Buffer.alloc(9000) },
      ]);
      const r = await mgr.generateImageVariants('test/photo.jpg');
      expect(r).toHaveLength(2);
      expect(r[0].width).toBe(640);
      expect(r[1].width).toBe(1080);
      expect(mockFsWriteFile).toHaveBeenCalledTimes(2);
    });

    it('returns empty array on createResponsiveVariants error', async () => {
      mockCreateResponsiveVariants.mockRejectedValueOnce(new Error('sharp crash'));
      const r = await mgr.generateImageVariants('test/img.jpg');
      expect(r).toEqual([]);
    });
  });

  // ─── generateVideoThumbnail (lines 131-170) ───────────────────────────────

  describe('generateVideoThumbnail', () => {
    it('returns thumbnail path on successful ffmpeg exit (size > 100)', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => { process.nextTick(() => proc.emit('close', 0)); return proc; });
      mockFsStat.mockResolvedValueOnce({ size: 5000 });

      const r = await mgr.generateVideoThumbnail('test/video.mp4');
      expect(r).toBe('test/video_thumb.jpg');
    });

    it('returns null when ffmpeg exits non-zero', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => { process.nextTick(() => proc.emit('close', 1)); return proc; });

      expect(await mgr.generateVideoThumbnail('test/video.mp4')).toBeNull();
    });

    it('returns null when ffmpeg emits error', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('error', new Error('spawn error')));
        return proc;
      });

      expect(await mgr.generateVideoThumbnail('test/video.mp4')).toBeNull();
    });

    it('returns null when thumbnail is too small (< 100 bytes)', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => { process.nextTick(() => proc.emit('close', 0)); return proc; });
      mockFsStat.mockResolvedValueOnce({ size: 50 });

      expect(await mgr.generateVideoThumbnail('test/video.mp4')).toBeNull();
    });

    it('handles webm video extension correctly', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => { process.nextTick(() => proc.emit('close', 0)); return proc; });
      mockFsStat.mockResolvedValueOnce({ size: 5000 });

      const r = await mgr.generateVideoThumbnail('test/clip.webm');
      expect(r).toBe('test/clip_thumb.jpg');
    });
  });

  // ─── generateVideoThumbnailFromBuffer (lines 175-210) ────────────────────

  describe('generateVideoThumbnailFromBuffer', () => {
    it('returns buffer when ffmpeg succeeds and output > 100 bytes', async () => {
      const thumbData = Buffer.alloc(200, 0x42);
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => { process.nextTick(() => proc.emit('close', 0)); return proc; });
      mockFsReadFile.mockResolvedValueOnce(thumbData);

      const r = await mgr.generateVideoThumbnailFromBuffer(Buffer.from('v'), 'video/mp4');
      expect(r).toEqual(thumbData);
    });

    it('returns undefined when output <= 100 bytes', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => { process.nextTick(() => proc.emit('close', 0)); return proc; });
      mockFsReadFile.mockResolvedValueOnce(Buffer.alloc(50));

      expect(await mgr.generateVideoThumbnailFromBuffer(Buffer.from('v'), 'video/mp4')).toBeUndefined();
    });

    it('returns undefined on ffmpeg error', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('error', new Error('ffmpeg missing')));
        return proc;
      });

      expect(await mgr.generateVideoThumbnailFromBuffer(Buffer.from('v'), 'video/webm')).toBeUndefined();
    });

    it('uses .webm temp extension for webm mimeType', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => { process.nextTick(() => proc.emit('close', 0)); return proc; });
      mockFsReadFile.mockResolvedValueOnce(Buffer.alloc(200));

      await mgr.generateVideoThumbnailFromBuffer(Buffer.from('v'), 'video/webm');

      const ffmpegArgs = mockSpawnFn.mock.calls[0][1] as string[];
      const inputFile = ffmpegArgs[ffmpegArgs.indexOf('-i') + 1];
      expect(inputFile).toMatch(/\.webm$/);
    });

    it('uses .mp4 temp extension for non-webm mp4 mimeType', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => { process.nextTick(() => proc.emit('close', 0)); return proc; });
      mockFsReadFile.mockResolvedValueOnce(Buffer.alloc(200));

      await mgr.generateVideoThumbnailFromBuffer(Buffer.from('v'), 'video/mp4');

      const ffmpegArgs = mockSpawnFn.mock.calls[0][1] as string[];
      const inputFile = ffmpegArgs[ffmpegArgs.indexOf('-i') + 1];
      expect(inputFile).toMatch(/\.mp4$/);
    });

    it('cleans up temp files in finally block', async () => {
      const proc = new MockProc();
      mockSpawnFn.mockImplementationOnce(() => {
        process.nextTick(() => proc.emit('error', new Error('err')));
        return proc;
      });

      await mgr.generateVideoThumbnailFromBuffer(Buffer.from('v'), 'video/mp4');
      expect(mockFsUnlink).toHaveBeenCalledTimes(2);
    });
  });

  // ─── extractAudioWithFfprobe via extractAudioMetadata ────────────────────
  // (lines 252-299) reached via extractAudioMetadata when music-metadata fails
  // for m4a/aac/mp4 mimeTypes

  describe('extractAudioWithFfprobe (via extractAudioMetadata fallback)', () => {
    it('uses ffprobe when music-metadata fails for m4a (lines 501-509)', async () => {
      mockParseFile.mockRejectedValue(new Error('unsupported'));
      mockFfprobe.mockImplementationOnce((_p: string, cb: Function) => {
        cb(null, {
          streams: [{ codec_type: 'audio', codec_name: 'aac', sample_rate: 44100, channels: 2, bit_rate: '128000' }],
          format: { duration: 60, bit_rate: '128000' },
        });
      });
      mockFsStat.mockResolvedValueOnce({ size: 960000 });

      const r = await mgr.extractAudioMetadata('audio.m4a', undefined, 'audio/m4a');
      expect(r.codec).toBe('aac');
      expect(r.duration).toBeGreaterThan(0);
    });

    it('falls back to audioStream.bit_rate when format.bit_rate is absent', async () => {
      mockParseFile.mockRejectedValue(new Error('fail'));
      mockFfprobe.mockImplementationOnce((_p: string, cb: Function) => {
        cb(null, {
          streams: [{ codec_type: 'audio', codec_name: 'aac', sample_rate: 44100, channels: 2, bit_rate: '96000' }],
          format: { duration: 30 }, // no bit_rate in format
        });
      });
      mockFsStat.mockResolvedValueOnce({ size: 360000 });

      const r = await mgr.extractAudioMetadata('audio.m4a', undefined, 'audio/m4a');
      expect(r.bitrate).toBe(96000);
    });

    it('uses 0 when both format.bit_rate and audioStream.bit_rate are absent', async () => {
      mockParseFile.mockRejectedValue(new Error('fail'));
      mockFfprobe.mockImplementationOnce((_p: string, cb: Function) => {
        cb(null, {
          streams: [{ codec_type: 'audio', codec_name: 'aac', sample_rate: 44100, channels: 2 }], // no bit_rate
          format: { duration: 30 }, // no bit_rate either
        });
      });
      mockFsStat.mockResolvedValueOnce({ size: 360000 });

      const r = await mgr.extractAudioMetadata('audio.m4a', undefined, 'audio/m4a');
      expect(r.bitrate).toBe(0);
    });

    it('uses "unknown" codec when audioStream.codec_name is absent', async () => {
      mockParseFile.mockRejectedValue(new Error('fail'));
      mockFfprobe.mockImplementationOnce((_p: string, cb: Function) => {
        cb(null, {
          streams: [{ codec_type: 'audio', sample_rate: 44100, channels: 2, bit_rate: '128000' }], // no codec_name
          format: { duration: 30, bit_rate: '128000' },
        });
      });
      mockFsStat.mockResolvedValueOnce({ size: 360000 });

      const r = await mgr.extractAudioMetadata('audio.m4a', undefined, 'audio/m4a');
      expect(r.codec).toBe('unknown');
    });

    it('uses 0 for sampleRate and 1 for channels when absent', async () => {
      mockParseFile.mockRejectedValue(new Error('fail'));
      mockFfprobe.mockImplementationOnce((_p: string, cb: Function) => {
        cb(null, {
          streams: [{ codec_type: 'audio', codec_name: 'aac', bit_rate: '128000' }], // no sample_rate, no channels
          format: { duration: 30, bit_rate: '128000' },
        });
      });
      mockFsStat.mockResolvedValueOnce({ size: 360000 });

      const r = await mgr.extractAudioMetadata('audio.m4a', undefined, 'audio/m4a');
      expect(r.sampleRate).toBe(0);
      expect(r.channels).toBe(1);
    });

    it('uses ffprobe when music-metadata returns duration=0 for aac', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 0 } });
      mockFfprobe.mockImplementationOnce((_p: string, cb: Function) => {
        cb(null, {
          streams: [{ codec_type: 'audio', codec_name: 'aac', sample_rate: 22050, channels: 1 }],
          format: { duration: 30, bit_rate: '64000' },
        });
      });
      mockFsStat.mockResolvedValueOnce({ size: 240000 });

      const r = await mgr.extractAudioMetadata('audio.aac', undefined, 'audio/aac');
      expect(r.duration).toBeGreaterThan(0);
    });

    it('returns defaults when ffprobe also fails (inner ffprobe catch)', async () => {
      mockParseFile.mockRejectedValue(new Error('fail'));
      mockFfprobe.mockImplementationOnce((_p: string, cb: Function) => {
        cb(new Error('ffprobe error'));
      });
      mockFsStat.mockResolvedValueOnce({ size: 1000 });

      const r = await mgr.extractAudioMetadata('audio.mp4', undefined, 'audio/mp4');
      expect(r.duration).toBe(0);
    });

    it('covers ffprobe no-audio-stream path (resolve null)', async () => {
      mockParseFile.mockRejectedValue(new Error('fail'));
      mockFfprobe.mockImplementationOnce((_p: string, cb: Function) => {
        cb(null, { streams: [{ codec_type: 'video' }], format: {} });
      });
      mockFsStat.mockResolvedValueOnce({ size: 1000 });

      const r = await mgr.extractAudioMetadata('audio.m4a', undefined, 'audio/m4a');
      expect(r.duration).toBe(0);
    });
  });

  // ─── calculateWavDuration (lines 304-355) ────────────────────────────────

  describe('calculateWavDuration', () => {
    function makeWavHeader(): Buffer {
      const buf = Buffer.alloc(44);
      buf.write('RIFF', 0, 'ascii');
      buf.write('WAVE', 8, 'ascii');
      buf.writeUInt16LE(1, 20);     // PCM
      buf.writeUInt16LE(1, 22);     // 1 channel
      buf.writeUInt32LE(8000, 24);  // 8000 Hz
      buf.writeUInt32LE(16000, 28); // byteRate = 8000 * 1 * 2
      buf.writeUInt16LE(16, 34);    // 16 bits/sample
      return buf;
    }

    it('parses WAV header and returns duration', async () => {
      const header = makeWavHeader();
      const mockFd = {
        read: (jest.fn() as jest.Mock<any>).mockImplementation((buf: Buffer) => {
          header.copy(buf);
          return Promise.resolve({ bytesRead: 44, buffer: buf });
        }),
        close: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
      };
      mockFsOpen.mockResolvedValueOnce(mockFd);

      const r = await (mgr as any).calculateWavDuration(`${BASE}/audio.wav`, 160044);
      expect(r).not.toBeNull();
      expect(r.sampleRate).toBe(8000);
      expect(r.codec).toBe('pcm');
    });

    it('returns null for invalid RIFF signature', async () => {
      const badHeader = Buffer.alloc(44);
      badHeader.write('BAD_', 0, 'ascii');
      const mockFd = {
        read: (jest.fn() as jest.Mock<any>).mockImplementation((buf: Buffer) => {
          badHeader.copy(buf);
          return Promise.resolve({ bytesRead: 44, buffer: buf });
        }),
        close: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
      };
      mockFsOpen.mockResolvedValueOnce(mockFd);

      const r = await (mgr as any).calculateWavDuration(`${BASE}/audio.wav`, 1000);
      expect(r).toBeNull();
    });

    it('returns null on fs.open error', async () => {
      mockFsOpen.mockRejectedValueOnce(new Error('ENOENT'));
      const r = await (mgr as any).calculateWavDuration(`${BASE}/missing.wav`, 1000);
      expect(r).toBeNull();
    });

    it('uses WAV fallback when music-metadata returns 0 duration for wav mimeType (lines 490-493)', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 0, bitrate: 0 } });
      mockFsStat.mockResolvedValue({ size: 160044 });

      const header = makeWavHeader();
      const mockFd = {
        read: (jest.fn() as jest.Mock<any>).mockImplementation((buf: Buffer) => {
          header.copy(buf);
          return Promise.resolve({ bytesRead: 44, buffer: buf });
        }),
        close: (jest.fn() as jest.Mock<any>).mockResolvedValue(undefined),
      };
      mockFsOpen.mockResolvedValueOnce(mockFd);

      const r = await mgr.extractAudioMetadata('audio.wav', undefined, 'audio/wav');
      expect(r.sampleRate).toBe(8000);
    });
  });

  // ─── validateAudioCoherence (lines 374, 422-432) ─────────────────────────

  describe('validateAudioCoherence', () => {
    it('detects bitrate too low (line 374: estimatedDuration returned)', () => {
      // duration=1000s, fileSize=100bytes → actualBitrate = (100*8)/1000 = 0.8 bps << min 32000
      const r = mgr.validateAudioCoherence(1000000, 100, 0, 'audio/mpeg');
      expect(r.isValid).toBe(false);
      expect(r.reason).toBe('Bitrate trop faible');
      expect(r.estimatedDuration).toBeGreaterThan(0);
    });

    it('detects bitrate too high (lines 422-432: estimatedDuration returned)', () => {
      // duration=1ms, fileSize=1MB → actualBitrate = (1000000*8)/0.001 = insane >> 320000*2
      const r = mgr.validateAudioCoherence(1, 1000000, 0, 'audio/mpeg');
      expect(r.isValid).toBe(false);
      expect(r.reason).toBe('Bitrate trop élevé');
      expect(r.estimatedDuration).toBeGreaterThan(0);
    });

    it('uses generic range for unknown mimeType', () => {
      const r = mgr.validateAudioCoherence(60000, 1000, 0, 'audio/x-unknown');
      // actualBitrate = (1000*8)/60 ≈ 133 bps, expected min generic 8000
      // 133 < 8000*0.5=4000 → invalid
      expect(r.isValid).toBe(false);
    });

    it('returns isValid:false with no reason for zero duration or fileSize', () => {
      expect(mgr.validateAudioCoherence(0, 1000, 0, 'audio/mpeg').isValid).toBe(false);
      expect(mgr.validateAudioCoherence(1000, 0, 0, 'audio/mpeg').isValid).toBe(false);
    });
  });

  // ─── extractAudioMetadata: stat call (lines 490-493) ─────────────────────

  describe('extractAudioMetadata stat fallback', () => {
    it('calls fs.stat to get fileSize when not provided', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 } });
      mockFsStat.mockResolvedValueOnce({ size: 960000 });

      await mgr.extractAudioMetadata('audio.mp3'); // no fileSize
      expect(mockFsStat).toHaveBeenCalled();
    });
  });

  // ─── extractMetadata audio logic (lines 683, 718-777) ───────────────────

  describe('extractMetadata audio comparison logic', () => {
    it('gets fileSize from stat when audio type and fileSize absent (line 683)', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'opus', numberOfChannels: 2 } });
      mockFsStat.mockResolvedValue({ size: 960000 });

      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg');
      expect(mockFsStat).toHaveBeenCalled();
      expect(r.duration).toBeGreaterThan(0);
    });

    it('uses backend duration when both valid and difference < 10% (lines 763-767)', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 } });
      mockFsStat.mockResolvedValue({ size: 960000 });

      // Frontend: 61s (1.6% diff from backend 60s) → within 10% → use backend
      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 61000, bitrate: 128000 }, 960000);
      expect(r.duration).toBe(60000);
    });

    it('uses frontend duration when backend fails (backendDuration=0) (lines 768-771)', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 0, bitrate: 0 } });
      mockFsStat.mockResolvedValue({ size: 960000 });

      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 60000, bitrate: 128000 }, 960000);
      expect(r.duration).toBe(60000);
    });

    it('uses backend when frontend invalid, backend valid (>10% diff path)', async () => {
      // Backend = 60s (valid bitrate ~128kbps), Frontend = 2s (too short → bitrate ~3840kbps >> max)
      mockParseFile.mockResolvedValue({ format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 } });
      mockFsStat.mockResolvedValue({ size: 960000 });

      // 2000ms frontend vs 60000ms backend → big diff
      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 2000, bitrate: 128000 }, 960000);
      // Backend is coherent, frontend is not → backend wins
      expect(r.duration).toBe(60000);
    });

    it('uses frontend when backend extraction completely fails (backendDuration=0, line 768-771)', async () => {
      // music-metadata fails + no wav/m4a fallback for mp3 → extractAudioMetadata returns duration=0
      mockParseFile.mockRejectedValue(new Error('unsupported format'));
      mockFsStat.mockResolvedValue({ size: 1920000 });

      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 120000, bitrate: 128000 }, 1920000);
      // backendDuration=0, frontendDuration=120000 → line 768-771 → frontend wins
      expect(r.duration).toBe(120000);
    });

    it('uses estimated duration when both frontend and backend invalid (lines 750-757)', async () => {
      // Both durations too short for 1MB → both invalid → estimatedDuration used
      mockParseFile.mockResolvedValue({ format: { duration: 0.001, bitrate: 0, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 } });
      mockFsStat.mockResolvedValue({ size: 1000000 });

      // Both frontend and backend say 1ms → both will produce bitrate too high
      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 1, bitrate: 0 }, 1000000);
      // estimatedDuration kicks in
      expect(r.duration).toBeGreaterThan(0);
    });

    it('uses backend as default when no file-size validation possible (line 754-757)', async () => {
      // >10% diff, no fileSize so no coherence validation
      mockParseFile.mockResolvedValue({ format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 } });

      // Without fileSize, the stat call happens but let it succeed
      mockFsStat.mockResolvedValue({ size: 0 });

      // 5000ms frontend vs 60000ms backend → >10% diff but fileSize=0 → fallback to backend
      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 5000, bitrate: 128000 });
      expect(r.duration).toBe(60000);
    });

    it('handles audio with no providedMetadata — backend only (lines 789-796)', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 120, bitrate: 192000, sampleRate: 48000, codec: 'opus', numberOfChannels: 2 } });
      mockFsStat.mockResolvedValue({ size: 2880000 });

      const r = await mgr.extractMetadata('audio.webm', 'audio', 'audio/webm', undefined, 2880000);
      expect(r.duration).toBe(120000);
      expect(r.codec).toBe('opus');
    });

    it('handles backendDuration>0 but frontendDuration=0 (lines 772-774)', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 } });
      mockFsStat.mockResolvedValue({ size: 960000 });

      // providedMetadata with duration=0 → frontendDuration=0, backendDuration>0
      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 0, bitrate: 128000 }, 960000);
      expect(r.duration).toBe(60000);
    });

    it('handles both frontend and backend duration=0 (lines 775-778)', async () => {
      mockParseFile.mockResolvedValue({ format: { duration: 0, bitrate: 0 } });
      mockFsStat.mockResolvedValue({ size: 960000 });

      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 0, bitrate: 0 }, 960000);
      expect(r.duration).toBe(0);
    });

    it('stat catch in extractMetadata logs warn and continues (line 683)', async () => {
      mockFsStat.mockRejectedValueOnce(new Error('EACCES'));
      // extractAudioMetadata will get undefined fileSize and call stat again — provide success there
      mockFsStat.mockRejectedValue(new Error('ENOENT')); // all stat calls fail → extractAudioMetadata outer catch
      mockParseFile.mockResolvedValue({ format: { duration: 0 } });

      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 60000, bitrate: 128000 });
      // backendDuration = 0 (outer catch) → frontendDuration wins
      expect(r.duration).toBe(60000);
    });
  });

  // ─── extractAudioMetadata outer catch (lines 546-551) ────────────────────

  describe('extractAudioMetadata outer catch', () => {
    it('returns default metadata when fs.stat throws (no fileSize provided)', async () => {
      mockFsStat.mockRejectedValueOnce(new Error('ENOENT'));

      const r = await mgr.extractAudioMetadata('missing.mp3', undefined, 'audio/mpeg');
      expect(r.duration).toBe(0);
      expect(r.codec).toBe('unknown');
    });
  });

  // ─── extractAudioWithFfprobe timeout (lines 254-255) ─────────────────────

  describe('extractAudioWithFfprobe timeout', () => {
    it('resolves null after 10s timeout (lines 254-255)', async () => {
      jest.useFakeTimers();
      try {
        // ffprobe never calls callback → setTimeout(10000) fires
        mockFfprobe.mockImplementationOnce(() => { /* never calls callback */ });

        // Call private method directly so setTimeout registers synchronously
        const p = (mgr as any).extractAudioWithFfprobe(`${BASE}/a.m4a`);

        jest.advanceTimersByTime(10001);

        const r = await p;
        expect(r).toBeNull();
      } finally {
        jest.useRealTimers();
      }
    });
  });

  // ─── validateAudioCoherence spyOn branches (lines 745-746, 750-756) ──────

  describe('extractMetadata coherence branches via validateAudioCoherence spy', () => {
    it('uses frontend duration when frontend valid but backend invalid (lines 744-746)', async () => {
      mockParseFile.mockResolvedValue({
        format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 },
      });
      mockFsStat.mockResolvedValue({ size: 960000 });

      const spy = jest.spyOn(mgr, 'validateAudioCoherence')
        .mockReturnValueOnce({ isValid: true })                      // extractAudioMetadata internal
        .mockReturnValueOnce({ isValid: true })                      // frontendValidation
        .mockReturnValueOnce({ isValid: false, reason: 'too low' }); // backendValidation → false

      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 120000, bitrate: 128000 }, 960000);
      expect(r.duration).toBe(120000);
      spy.mockRestore();
    });

    it('uses estimatedDuration when both frontend and backend invalid with estimate (lines 750-752)', async () => {
      mockParseFile.mockResolvedValue({
        format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 },
      });
      mockFsStat.mockResolvedValue({ size: 960000 });

      const spy = jest.spyOn(mgr, 'validateAudioCoherence')
        .mockReturnValueOnce({ isValid: true })                                       // internal
        .mockReturnValueOnce({ isValid: false, reason: 'too high' })                 // frontendValidation
        .mockReturnValueOnce({ isValid: false, reason: 'too high', estimatedDuration: 50000 }); // backendValidation

      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 5000, bitrate: 128000 }, 960000);
      expect(r.duration).toBe(50000);
      spy.mockRestore();
    });

    it('uses backend duration by default when both invalid and no estimate (lines 753-756)', async () => {
      mockParseFile.mockResolvedValue({
        format: { duration: 60, bitrate: 128000, sampleRate: 44100, codec: 'mp3', numberOfChannels: 2 },
      });
      mockFsStat.mockResolvedValue({ size: 960000 });

      const spy = jest.spyOn(mgr, 'validateAudioCoherence')
        .mockReturnValueOnce({ isValid: true })    // internal
        .mockReturnValueOnce({ isValid: false })   // frontendValidation
        .mockReturnValueOnce({ isValid: false });  // backendValidation (no estimatedDuration)

      const r = await mgr.extractMetadata('audio.mp3', 'audio', 'audio/mpeg', { duration: 5000, bitrate: 128000 }, 960000);
      expect(r.duration).toBe(60000); // backend duration (60s → 60000ms)
      spy.mockRestore();
    });
  });
});
