/**
 * ThumbHashGenerator — unit tests
 *
 * Covers: generate() routing by mimeType, image/video hash generation,
 * error handling (returns null), and the PDF/unknown passthrough.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';

// ─── Mocks (hoisted) ─────────────────────────────────────────────────────────

const mockRaw = jest.fn<any>();
const mockToBuffer = jest.fn<any>();
const mockEnsureAlpha = jest.fn<any>().mockReturnThis();
const mockResize = jest.fn<any>().mockReturnThis();

const sharpInstance = {
  resize: mockResize,
  ensureAlpha: mockEnsureAlpha,
  raw: jest.fn<any>().mockReturnThis(),
  toBuffer: mockToBuffer,
};
mockResize.mockReturnValue(sharpInstance);
mockEnsureAlpha.mockReturnValue(sharpInstance);
sharpInstance.raw.mockReturnValue(sharpInstance);

const mockSharp = jest.fn<any>().mockReturnValue(sharpInstance);

jest.mock('sharp', () => mockSharp);

const mockRgbaToThumbHash = jest.fn<any>().mockReturnValue(new Uint8Array([1, 2, 3, 4]));
jest.mock('thumbhash', () => ({
  rgbaToThumbHash: mockRgbaToThumbHash,
}));

// ffmpeg mock — fluent-ffmpeg builder pattern
const mockPipe = jest.fn<any>();
const mockOutputOptions = jest.fn<any>().mockReturnThis();
const mockOutputFormat = jest.fn<any>().mockReturnThis();
const mockFrames = jest.fn<any>().mockReturnThis();
const mockSeekInput = jest.fn<any>().mockReturnThis();
const mockOn = jest.fn<any>().mockReturnThis();

const ffmpegInstance = {
  seekInput: mockSeekInput,
  frames: mockFrames,
  outputFormat: mockOutputFormat,
  outputOptions: mockOutputOptions,
  on: mockOn,
  pipe: mockPipe,
};

const mockFfmpeg = jest.fn<any>().mockReturnValue(ffmpegInstance);
jest.mock('fluent-ffmpeg', () => mockFfmpeg);

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { info: jest.fn(), warn: jest.fn(), error: jest.fn() },
}));

import { ThumbHashGenerator } from '../../../services/attachments/ThumbHashGenerator';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function makeImageBuffer() {
  return {
    data: Buffer.alloc(100 * 100 * 4, 128),
    info: { width: 100, height: 100 },
  };
}

// ─── Tests ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  jest.clearAllMocks();
  mockSharp.mockReturnValue(sharpInstance);
  mockResize.mockReturnValue(sharpInstance);
  mockEnsureAlpha.mockReturnValue(sharpInstance);
  sharpInstance.raw.mockReturnValue(sharpInstance);
  mockToBuffer.mockResolvedValue(makeImageBuffer());
  mockRgbaToThumbHash.mockReturnValue(new Uint8Array([1, 2, 3, 4]));
});

describe('ThumbHashGenerator.generate — routing', () => {
  it('returns null for non-visual mime types (PDF)', async () => {
    const result = await ThumbHashGenerator.generate('/tmp/doc.pdf', 'application/pdf');
    expect(result).toBeNull();
  });

  it('returns null for text mime types', async () => {
    const result = await ThumbHashGenerator.generate('/tmp/file.txt', 'text/plain');
    expect(result).toBeNull();
  });

  it('returns null when sharp throws (image)', async () => {
    mockSharp.mockImplementationOnce(() => { throw new Error('unsupported format'); });

    const result = await ThumbHashGenerator.generate('/tmp/bad.jpg', 'image/jpeg');
    expect(result).toBeNull();
  });
});

describe('ThumbHashGenerator.generate — image', () => {
  it('calls sharp with the file path for image/* mime types', async () => {
    await ThumbHashGenerator.generate('/tmp/photo.jpg', 'image/jpeg');

    expect(mockSharp).toHaveBeenCalledWith('/tmp/photo.jpg', expect.objectContaining({ animated: false }));
  });

  it('resizes to max 100×100', async () => {
    await ThumbHashGenerator.generate('/tmp/photo.jpg', 'image/jpeg');

    expect(mockResize).toHaveBeenCalledWith(100, 100, expect.objectContaining({ fit: 'inside' }));
  });

  it('returns base64-encoded thumbhash string', async () => {
    const hashBytes = new Uint8Array([0xde, 0xad, 0xbe, 0xef]);
    mockRgbaToThumbHash.mockReturnValueOnce(hashBytes);

    const result = await ThumbHashGenerator.generate('/tmp/photo.png', 'image/png');

    expect(typeof result).toBe('string');
    expect(result).toBe(Buffer.from(hashBytes).toString('base64'));
  });

  it('handles WebP mime type the same as JPEG', async () => {
    const result = await ThumbHashGenerator.generate('/tmp/image.webp', 'image/webp');
    expect(result).not.toBeNull();
    expect(mockSharp).toHaveBeenCalledTimes(1);
  });
});

describe('ThumbHashGenerator.generate — video (mocked ffmpeg)', () => {
  it('returns null and does not throw when ffmpeg pipe triggers error handler', async () => {
    // Simulate ffmpeg calling the 'error' handler, which tries a fallback
    // that itself errors — the outer try/catch in generate() returns null
    mockPipe.mockImplementationOnce(() => {
      throw new Error('ffmpeg not available');
    });

    const result = await ThumbHashGenerator.generate('/tmp/video.mp4', 'video/mp4');
    expect(result).toBeNull();
  });

  it('successfully generates thumbhash from video (happy path)', async () => {
    // When pipe is called, emit data + end on the stream so extractVideoFrame resolves
    mockPipe.mockImplementationOnce((stream: any) => {
      process.nextTick(() => {
        stream.emit('data', Buffer.from([0xde, 0xad, 0xbe, 0xef]));
        stream.emit('end');
      });
      return stream;
    });

    const result = await ThumbHashGenerator.generate('/tmp/clip.mp4', 'video/mp4');

    expect(typeof result).toBe('string');
    expect(result).not.toBeNull();
  });

  it('falls back to frame 0 when seekInput(0.5) fails', async () => {
    // First pipe invocation: trigger the registered 'error' handler
    mockPipe.mockImplementationOnce((_stream: any) => {
      // The error handler was registered via .on('error', ...) before .pipe()
      const errorCall = (mockOn as jest.Mock<any>).mock.calls.find(
        ([event]: [string]) => event === 'error',
      );
      if (errorCall) {
        const handler = errorCall[1] as () => void;
        // Before calling the handler, set up the SECOND pipe mock (fallback)
        mockPipe.mockImplementationOnce((fallbackStream: any) => {
          process.nextTick(() => {
            fallbackStream.emit('data', Buffer.from([1, 2, 3, 4]));
            fallbackStream.emit('end');
          });
          return fallbackStream;
        });
        handler();
      }
    });

    const result = await ThumbHashGenerator.generate('/tmp/clip.mp4', 'video/mp4');

    expect(typeof result).toBe('string');
    expect(result).not.toBeNull();
    // Two ffmpeg instances created: once for 0.5s, once for 0s fallback
    expect(mockFfmpeg).toHaveBeenCalledTimes(2);
  });
});
