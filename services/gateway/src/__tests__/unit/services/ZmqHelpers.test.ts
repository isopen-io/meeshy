/**
 * Unit tests for zmq-helpers utilities
 *
 * Covers:
 * - loadAudioAsBinary: all branches (undefined, not found, too large, extensions, error)
 * - audioFormatToMimeType: all known formats + fallback
 * - mimeTypeToAudioFormat
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

// Mock fs before importing subject
jest.mock('fs', () => ({
  promises: { readFile: jest.fn() },
  existsSync: jest.fn(),
  statSync: jest.fn(),
}));

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

import { promises as fsPromises, existsSync, statSync } from 'fs';
import {
  loadAudioAsBinary,
  audioFormatToMimeType,
  mimeTypeToAudioFormat,
} from '../../../services/zmq-translation/utils/zmq-helpers';

const mockExistsSync = existsSync as jest.MockedFunction<typeof existsSync>;
const mockStatSync = statSync as jest.MockedFunction<typeof statSync>;
const mockReadFile = fsPromises.readFile as jest.MockedFunction<typeof fsPromises.readFile>;

const THRESHOLD_BYTES = 10 * 1024 * 1024; // 10 MB

function makeFakeBuffer(content = 'audio-data'): Buffer {
  return Buffer.from(content);
}

describe('loadAudioAsBinary', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when audioPath is undefined', async () => {
    const result = await loadAudioAsBinary(undefined);
    expect(result).toBeNull();
    expect(mockExistsSync).not.toHaveBeenCalled();
  });

  it('returns null when audioPath is empty string', async () => {
    const result = await loadAudioAsBinary('');
    expect(result).toBeNull();
  });

  it('returns null when file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);

    const result = await loadAudioAsBinary('/tmp/missing.wav');

    expect(result).toBeNull();
    expect(mockExistsSync).toHaveBeenCalledWith('/tmp/missing.wav');
    expect(mockStatSync).not.toHaveBeenCalled();
  });

  it('returns null when file size exceeds threshold', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: THRESHOLD_BYTES + 1 } as ReturnType<typeof statSync>);

    const result = await loadAudioAsBinary('/tmp/large.wav');

    expect(result).toBeNull();
    expect(mockReadFile).not.toHaveBeenCalled();
  });

  it('returns null when file size equals threshold + 1 (strictly over)', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: THRESHOLD_BYTES + 100 } as ReturnType<typeof statSync>);

    const result = await loadAudioAsBinary('/tmp/oversized.mp3');
    expect(result).toBeNull();
  });

  it('returns AudioBinaryData for a file exactly at threshold (not over)', async () => {
    const buf = makeFakeBuffer();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: THRESHOLD_BYTES } as ReturnType<typeof statSync>);
    mockReadFile.mockResolvedValue(buf as any);

    const result = await loadAudioAsBinary('/tmp/exact.wav');
    expect(result).not.toBeNull();
    expect(result!.size).toBe(THRESHOLD_BYTES);
  });

  it('returns null when readFile throws', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 1024 } as ReturnType<typeof statSync>);
    mockReadFile.mockRejectedValue(new Error('EACCES: permission denied'));

    const result = await loadAudioAsBinary('/tmp/unreadable.wav');
    expect(result).toBeNull();
  });

  const extensionCases: Array<[string, string]> = [
    ['/tmp/audio.wav', 'audio/wav'],
    ['/tmp/audio.mp3', 'audio/mpeg'],
    ['/tmp/audio.m4a', 'audio/mp4'],
    ['/tmp/audio.ogg', 'audio/ogg'],
    ['/tmp/audio.webm', 'audio/webm'],
    ['/tmp/audio.aac', 'audio/aac'],
    ['/tmp/audio.flac', 'audio/flac'],
  ];

  extensionCases.forEach(([audioPath, expectedMimeType]) => {
    it(`returns mimeType ${expectedMimeType} for extension of ${audioPath}`, async () => {
      const buf = makeFakeBuffer();
      mockExistsSync.mockReturnValue(true);
      mockStatSync.mockReturnValue({ size: 2048 } as ReturnType<typeof statSync>);
      mockReadFile.mockResolvedValue(buf as any);

      const result = await loadAudioAsBinary(audioPath);

      expect(result).not.toBeNull();
      expect(result!.mimeType).toBe(expectedMimeType);
      expect(result!.buffer).toBe(buf);
      expect(result!.size).toBe(2048);
    });
  });

  it('falls back to audio/wav for unknown extension', async () => {
    const buf = makeFakeBuffer();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 512 } as ReturnType<typeof statSync>);
    mockReadFile.mockResolvedValue(buf as any);

    const result = await loadAudioAsBinary('/tmp/audio.xyz');

    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe('audio/wav');
  });

  it('handles uppercase extensions by lowercasing', async () => {
    const buf = makeFakeBuffer();
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 512 } as ReturnType<typeof statSync>);
    mockReadFile.mockResolvedValue(buf as any);

    const result = await loadAudioAsBinary('/tmp/audio.MP3');

    expect(result).not.toBeNull();
    expect(result!.mimeType).toBe('audio/mpeg');
  });
});

describe('audioFormatToMimeType', () => {
  const formatCases: Array<[string, string]> = [
    ['wav', 'audio/wav'],
    ['mp3', 'audio/mpeg'],
    ['m4a', 'audio/mp4'],
    ['ogg', 'audio/ogg'],
    ['webm', 'audio/webm'],
    ['aac', 'audio/aac'],
    ['flac', 'audio/flac'],
  ];

  formatCases.forEach(([format, expectedMimeType]) => {
    it(`maps ${format} → ${expectedMimeType}`, () => {
      expect(audioFormatToMimeType(format)).toBe(expectedMimeType);
    });
  });

  it('falls back to audio/wav for unknown format', () => {
    expect(audioFormatToMimeType('unknown')).toBe('audio/wav');
    expect(audioFormatToMimeType('')).toBe('audio/wav');
    expect(audioFormatToMimeType('xyz')).toBe('audio/wav');
  });
});

describe('mimeTypeToAudioFormat', () => {
  it('strips audio/ prefix from mime type', () => {
    expect(mimeTypeToAudioFormat('audio/wav')).toBe('wav');
    expect(mimeTypeToAudioFormat('audio/mpeg')).toBe('mpeg');
    expect(mimeTypeToAudioFormat('audio/mp4')).toBe('mp4');
    expect(mimeTypeToAudioFormat('audio/ogg')).toBe('ogg');
    expect(mimeTypeToAudioFormat('audio/webm')).toBe('webm');
    expect(mimeTypeToAudioFormat('audio/aac')).toBe('aac');
    expect(mimeTypeToAudioFormat('audio/flac')).toBe('flac');
  });

  it('returns string unchanged when no audio/ prefix present', () => {
    expect(mimeTypeToAudioFormat('video/mp4')).toBe('video/mp4');
    expect(mimeTypeToAudioFormat('wav')).toBe('wav');
  });
});
