/**
 * Unit tests for zmq-helpers.ts
 *
 * Coverage targets: ≥92% lines + branches
 *
 * Mocks:
 * - fs (promises.readFile) and fs sync APIs (existsSync, statSync)
 * - path (extname)
 * - logger-enhanced (no-op)
 * - AUDIO_BASE64_SIZE_THRESHOLD from types (10 * 1024 * 1024 = 10MB)
 *
 * Pure functions audioFormatToMimeType + mimeTypeToAudioFormat need no mocks.
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mock logger ────────────────────────────────────────────────────────────────
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    }),
  },
}));

// ─── fs mock ───────────────────────────────────────────────────────────────────
const mockReadFile = jest.fn<() => Promise<Buffer>>();
const mockExistsSync = jest.fn<(path: string) => boolean>();
const mockStatSync = jest.fn<(path: string) => { size: number }>();

jest.mock('fs', () => ({
  promises: { readFile: mockReadFile },
  existsSync: mockExistsSync,
  statSync: mockStatSync,
}));

// ─── path mock ─────────────────────────────────────────────────────────────────
// We let path.extname behave normally for most tests by providing a thin wrapper
// that delegates to the real implementation, except where we override it.
const realPath = jest.requireActual<typeof import('path')>('path');
jest.mock('path', () => {
  const actual = jest.requireActual<typeof import('path')>('path');
  return { ...actual };
});

// ─── types mock — expose AUDIO_BASE64_SIZE_THRESHOLD constant ──────────────────
// The source file imports this constant. Provide the real value so tests stay
// consistent with the actual threshold used in production.
const AUDIO_BASE64_SIZE_THRESHOLD = 10 * 1024 * 1024; // 10MB

jest.mock('../types', () => ({
  AUDIO_BASE64_SIZE_THRESHOLD: 10 * 1024 * 1024,
}));

// Import AFTER all mocks are set up
import { loadAudioAsBinary, audioFormatToMimeType, mimeTypeToAudioFormat } from '../utils/zmq-helpers';

// ─── Helpers ───────────────────────────────────────────────────────────────────

const SMALL_SIZE = 1024; // 1KB — well under threshold
const OVER_THRESHOLD_SIZE = AUDIO_BASE64_SIZE_THRESHOLD + 1; // just above 10MB

function setupHappyPath(path: string, size = SMALL_SIZE) {
  mockExistsSync.mockImplementation((p: string) => p === path);
  mockStatSync.mockReturnValue({ size });
  mockReadFile.mockResolvedValue(Buffer.alloc(size, 0xab));
}

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('zmq-helpers', () => {
  beforeEach(() => {
    mockReadFile.mockReset();
    mockExistsSync.mockReset();
    mockStatSync.mockReset();
  });

  // ── loadAudioAsBinary ──────────────────────────────────────────────────────────

  describe('loadAudioAsBinary', () => {
    it('returns null when audioPath is undefined', async () => {
      expect(await loadAudioAsBinary(undefined)).toBeNull();
    });

    it('returns null when audioPath is an empty string', async () => {
      expect(await loadAudioAsBinary('')).toBeNull();
    });

    it('returns null when the file does not exist', async () => {
      mockExistsSync.mockReturnValue(false);
      expect(await loadAudioAsBinary('/nonexistent/audio.wav')).toBeNull();
    });

    it('returns null when file size exceeds AUDIO_BASE64_SIZE_THRESHOLD', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: OVER_THRESHOLD_SIZE });
      expect(await loadAudioAsBinary('/tmp/huge.wav')).toBeNull();
      expect(mockReadFile).not.toHaveBeenCalled();
    });

    it('returns exactly null at threshold boundary (size === threshold is still too big)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: AUDIO_BASE64_SIZE_THRESHOLD });
      // size > threshold → false at exactly threshold (condition is strictly >)
      // So threshold-sized file should NOT return null — it is at the boundary.
      // The production code uses `> AUDIO_BASE64_SIZE_THRESHOLD` so at exactly 10MB it passes.
      mockReadFile.mockResolvedValue(Buffer.alloc(1));
      const result = await loadAudioAsBinary('/tmp/exact.wav');
      // size === threshold → condition (size > threshold) is false → proceed
      expect(result).not.toBeNull();
    });

    it('returns null when file is just over threshold (size = threshold + 1)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: AUDIO_BASE64_SIZE_THRESHOLD + 1 });
      const result = await loadAudioAsBinary('/tmp/toolarge.wav');
      expect(result).toBeNull();
    });

    it('returns { buffer, mimeType, size } on success with .wav extension', async () => {
      setupHappyPath('/tmp/test.wav');
      const result = await loadAudioAsBinary('/tmp/test.wav');
      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe('audio/wav');
      expect(result!.size).toBe(SMALL_SIZE);
      expect(Buffer.isBuffer(result!.buffer)).toBe(true);
    });

    it('maps .mp3 to audio/mpeg', async () => {
      setupHappyPath('/tmp/test.mp3');
      const result = await loadAudioAsBinary('/tmp/test.mp3');
      expect(result!.mimeType).toBe('audio/mpeg');
    });

    it('maps .m4a to audio/mp4', async () => {
      setupHappyPath('/tmp/test.m4a');
      const result = await loadAudioAsBinary('/tmp/test.m4a');
      expect(result!.mimeType).toBe('audio/mp4');
    });

    it('maps .ogg to audio/ogg', async () => {
      setupHappyPath('/tmp/test.ogg');
      const result = await loadAudioAsBinary('/tmp/test.ogg');
      expect(result!.mimeType).toBe('audio/ogg');
    });

    it('maps .webm to audio/webm', async () => {
      setupHappyPath('/tmp/test.webm');
      const result = await loadAudioAsBinary('/tmp/test.webm');
      expect(result!.mimeType).toBe('audio/webm');
    });

    it('maps .aac to audio/aac', async () => {
      setupHappyPath('/tmp/test.aac');
      const result = await loadAudioAsBinary('/tmp/test.aac');
      expect(result!.mimeType).toBe('audio/aac');
    });

    it('maps .flac to audio/flac', async () => {
      setupHappyPath('/tmp/test.flac');
      const result = await loadAudioAsBinary('/tmp/test.flac');
      expect(result!.mimeType).toBe('audio/flac');
    });

    it('falls back to audio/wav for unknown extensions', async () => {
      setupHappyPath('/tmp/test.xyz');
      const result = await loadAudioAsBinary('/tmp/test.xyz');
      expect(result!.mimeType).toBe('audio/wav');
    });

    it('falls back to audio/wav when there is no extension', async () => {
      setupHappyPath('/tmp/audiofile');
      const result = await loadAudioAsBinary('/tmp/audiofile');
      expect(result!.mimeType).toBe('audio/wav');
    });

    it('returns null when readFile throws (caught error branch)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: SMALL_SIZE });
      mockReadFile.mockRejectedValue(new Error('disk error'));
      const result = await loadAudioAsBinary('/tmp/bad.wav');
      expect(result).toBeNull();
    });

    it('returns null when existsSync throws (caught error branch)', async () => {
      mockExistsSync.mockImplementation(() => {
        throw new Error('permission denied');
      });
      const result = await loadAudioAsBinary('/tmp/noperm.wav');
      expect(result).toBeNull();
    });

    it('returns null when statSync throws (caught error branch)', async () => {
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockImplementation(() => {
        throw new Error('stat error');
      });
      const result = await loadAudioAsBinary('/tmp/statfail.wav');
      expect(result).toBeNull();
    });

    it('returns buffer with correct content from readFile', async () => {
      const fakeContent = Buffer.from('FAKE_AUDIO_BYTES_FOR_TEST');
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: fakeContent.length });
      mockReadFile.mockResolvedValue(fakeContent);
      const result = await loadAudioAsBinary('/tmp/content.wav');
      expect(result!.buffer).toEqual(fakeContent);
    });

    it('reports size from statSync (not buffer.length)', async () => {
      // statSync reports 512; readFile returns a buffer of different length
      const statSize = 512;
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: statSize });
      mockReadFile.mockResolvedValue(Buffer.alloc(100)); // mismatch is irrelevant
      const result = await loadAudioAsBinary('/tmp/size-check.wav');
      expect(result!.size).toBe(statSize);
    });
  });

  // ── audioFormatToMimeType ──────────────────────────────────────────────────────

  describe('audioFormatToMimeType', () => {
    it.each([
      ['wav', 'audio/wav'],
      ['mp3', 'audio/mpeg'],
      ['m4a', 'audio/mp4'],
      ['ogg', 'audio/ogg'],
      ['webm', 'audio/webm'],
      ['aac', 'audio/aac'],
      ['flac', 'audio/flac'],
    ])('maps %s → %s', (format, expected) => {
      expect(audioFormatToMimeType(format)).toBe(expected);
    });

    it('falls back to audio/wav for an unknown format', () => {
      expect(audioFormatToMimeType('unknown-fmt')).toBe('audio/wav');
    });

    it('falls back to audio/wav for an empty string', () => {
      expect(audioFormatToMimeType('')).toBe('audio/wav');
    });
  });

  // ── mimeTypeToAudioFormat ──────────────────────────────────────────────────────

  describe('mimeTypeToAudioFormat', () => {
    it.each([
      ['audio/wav', 'wav'],
      ['audio/mpeg', 'mpeg'],
      ['audio/mp4', 'mp4'],
      ['audio/ogg', 'ogg'],
      ['audio/webm', 'webm'],
      ['audio/aac', 'aac'],
      ['audio/flac', 'flac'],
    ])('strips audio/ prefix from %s → %s', (mimeType, expected) => {
      expect(mimeTypeToAudioFormat(mimeType)).toBe(expected);
    });

    it('returns the part after audio/ for an arbitrary mime type', () => {
      expect(mimeTypeToAudioFormat('audio/x-custom')).toBe('x-custom');
    });

    it('returns the full string when there is no audio/ prefix', () => {
      // replace('audio/', '') on a string without the prefix just returns the original
      expect(mimeTypeToAudioFormat('video/mp4')).toBe('video/mp4');
    });
  });
});
