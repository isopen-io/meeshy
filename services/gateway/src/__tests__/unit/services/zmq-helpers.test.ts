/**
 * zmq-helpers unit tests
 *
 * @jest-environment node
 */

jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: () => ({ info: jest.fn(), debug: jest.fn(), warn: jest.fn(), error: jest.fn() }),
  },
}));

const mockExistsSync = jest.fn();
const mockStatSync = jest.fn();
const mockReadFile = jest.fn();

jest.mock('fs', () => ({
  promises: {
    readFile: (...args: unknown[]) => mockReadFile(...args),
  },
  existsSync: (...args: unknown[]) => mockExistsSync(...args),
  statSync: (...args: unknown[]) => mockStatSync(...args),
}));

import { loadAudioAsBinary, audioFormatToMimeType, mimeTypeToAudioFormat } from '../../../services/zmq-translation/utils/zmq-helpers';

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

  it('returns audio/wav for unknown format', () => {
    expect(audioFormatToMimeType('unknown')).toBe('audio/wav');
  });
});

describe('mimeTypeToAudioFormat', () => {
  it.each([
    ['audio/wav', 'wav'],
    ['audio/mpeg', 'mpeg'],
    ['audio/mp4', 'mp4'],
    ['audio/ogg', 'ogg'],
    ['audio/webm', 'webm'],
    ['audio/aac', 'aac'],
    ['audio/flac', 'flac'],
  ])('strips audio/ prefix: %s → %s', (mime, expected) => {
    expect(mimeTypeToAudioFormat(mime)).toBe(expected);
  });
});

describe('loadAudioAsBinary', () => {
  afterEach(() => {
    jest.clearAllMocks();
  });

  it('returns null when audioPath is undefined', async () => {
    const result = await loadAudioAsBinary(undefined);
    expect(result).toBeNull();
  });

  it('returns null when audioPath is empty string', async () => {
    const result = await loadAudioAsBinary('');
    expect(result).toBeNull();
  });

  it('returns null when file does not exist', async () => {
    mockExistsSync.mockReturnValue(false);
    const result = await loadAudioAsBinary('/audio/nonexistent.wav');
    expect(result).toBeNull();
  });

  it('returns null when file exceeds size threshold', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 10 * 1024 * 1024 + 1 }); // exceeds 10 MB threshold
    const result = await loadAudioAsBinary('/audio/large.wav');
    expect(result).toBeNull();
  });

  it('returns buffer, mimeType, and size for a valid .wav file', async () => {
    const fakeBuffer = Buffer.from('fake audio');
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 1024 });
    mockReadFile.mockResolvedValue(fakeBuffer);

    const result = await loadAudioAsBinary('/audio/clip.wav');
    expect(result).not.toBeNull();
    expect(result!.buffer).toBe(fakeBuffer);
    expect(result!.mimeType).toBe('audio/wav');
    expect(result!.size).toBe(1024);
  });

  it('returns correct mimeType for .mp3', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 500 });
    mockReadFile.mockResolvedValue(Buffer.from(''));

    const result = await loadAudioAsBinary('/audio/clip.mp3');
    expect(result!.mimeType).toBe('audio/mpeg');
  });

  it('returns correct mimeType for .m4a', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 500 });
    mockReadFile.mockResolvedValue(Buffer.from(''));

    const result = await loadAudioAsBinary('/audio/clip.m4a');
    expect(result!.mimeType).toBe('audio/mp4');
  });

  it('falls back to audio/wav for unknown extension', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 500 });
    mockReadFile.mockResolvedValue(Buffer.from(''));

    const result = await loadAudioAsBinary('/audio/clip.xyz');
    expect(result!.mimeType).toBe('audio/wav');
  });

  it('returns null on unexpected error', async () => {
    mockExistsSync.mockReturnValue(true);
    mockStatSync.mockReturnValue({ size: 500 });
    mockReadFile.mockRejectedValue(new Error('EACCES: permission denied'));

    const result = await loadAudioAsBinary('/audio/clip.wav');
    expect(result).toBeNull();
  });
});
