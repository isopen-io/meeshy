/**
 * Unit tests for services/attachments/ThumbHashGenerator.ts
 * Covers: generate, fromImage, fromVideo, extractVideoFrame (including fallback)
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('../../../utils/logger', () => ({
  __esModule: true,
  default: { warn: jest.fn(), info: jest.fn(), error: jest.fn(), debug: jest.fn() },
}));

jest.mock('thumbhash', () => ({
  rgbaToThumbHash: jest.fn<any>().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
}));

jest.mock('sharp', () => jest.fn());
jest.mock('fluent-ffmpeg', () => jest.fn());

import { ThumbHashGenerator } from '../../../services/attachments/ThumbHashGenerator';
import _sharp from 'sharp';
import _ffmpeg from 'fluent-ffmpeg';
import { rgbaToThumbHash } from 'thumbhash';
import logger from '../../../utils/logger';

const sharp = _sharp as unknown as jest.Mock;
const ffmpeg = _ffmpeg as unknown as jest.Mock;

// ── helpers ────────────────────────────────────────────────────────────────

function makeSharpBuilder(width = 10, height = 10) {
  const data = Buffer.alloc(width * height * 4, 128);
  const builder: any = {
    resize: jest.fn().mockReturnThis(),
    ensureAlpha: jest.fn().mockReturnThis(),
    raw: jest.fn().mockReturnThis(),
    toBuffer: jest.fn<any>().mockResolvedValue({ data, info: { width, height } }),
  };
  return builder;
}

function makeFfmpegBuilder(options: { triggerError?: boolean } = {}) {
  const handlers: Record<string, Function> = {};
  const builder: any = {
    seekInput: jest.fn().mockReturnThis(),
    frames: jest.fn().mockReturnThis(),
    outputFormat: jest.fn().mockReturnThis(),
    outputOptions: jest.fn().mockReturnThis(),
    on: jest.fn().mockImplementation((event: string, handler: Function) => {
      handlers[event] = handler;
      return builder;
    }),
    pipe: jest.fn().mockImplementation((stream: any) => {
      if (options.triggerError && handlers['error']) {
        setImmediate(() => handlers['error'](new Error('ffmpeg seek failed')));
      } else {
        setImmediate(() => {
          stream.write(Buffer.from('fake-frame-data'));
          stream.end();
        });
      }
    }),
  };
  return builder;
}

// ── generate ───────────────────────────────────────────────────────────────

describe('ThumbHashGenerator.generate', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('returns a base64 string for image/ mimeType', async () => {
    sharp.mockReturnValue(makeSharpBuilder());
    const result = await ThumbHashGenerator.generate('/path/image.jpg', 'image/jpeg');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
    expect(Buffer.from(result!, 'base64').length).toBeGreaterThan(0);
  });

  it('returns a base64 string for video/ mimeType', async () => {
    ffmpeg.mockReturnValue(makeFfmpegBuilder());
    sharp.mockReturnValue(makeSharpBuilder());
    const result = await ThumbHashGenerator.generate('/path/video.mp4', 'video/mp4');
    expect(result).not.toBeNull();
    expect(typeof result).toBe('string');
  });

  it('returns null for non-image/non-video mimeType (e.g. PDF)', async () => {
    const result = await ThumbHashGenerator.generate('/path/doc.pdf', 'application/pdf');
    expect(result).toBeNull();
  });

  it('returns null and logs warning when fromImage throws', async () => {
    sharp.mockImplementation(() => {
      throw new Error('sharp unavailable');
    });
    const result = await ThumbHashGenerator.generate('/path/image.jpg', 'image/jpeg');
    expect(result).toBeNull();
    expect((logger as any).warn).toHaveBeenCalledWith(
      expect.stringContaining('ThumbHash generation failed')
    );
  });

  it('returns null and logs warning when ffmpeg constructor throws', async () => {
    ffmpeg.mockImplementation(() => {
      throw new Error('ffmpeg not installed');
    });
    const result = await ThumbHashGenerator.generate('/path/video.mp4', 'video/mp4');
    expect(result).toBeNull();
    expect((logger as any).warn).toHaveBeenCalledWith(
      expect.stringContaining('ThumbHash generation failed')
    );
  });
});

// ── fromImage ─────────────────────────────────────────────────────────────

describe('ThumbHashGenerator.generate (image path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('calls sharp with { animated: false } and the correct resize/alpha/raw chain', async () => {
    const builder = makeSharpBuilder(50, 40);
    sharp.mockReturnValue(builder);

    await ThumbHashGenerator.generate('/img.png', 'image/png');

    expect(sharp).toHaveBeenCalledWith('/img.png', { animated: false });
    expect(builder.resize).toHaveBeenCalledWith(100, 100, { fit: 'inside' });
    expect(builder.ensureAlpha).toHaveBeenCalled();
    expect(builder.raw).toHaveBeenCalled();
    expect(builder.toBuffer).toHaveBeenCalledWith({ resolveWithObject: true });
  });

  it('passes width, height, and Uint8Array to rgbaToThumbHash and encodes result as base64', async () => {
    const fakeData = Buffer.alloc(50 * 30 * 4, 200);
    const builder = makeSharpBuilder(50, 30);
    builder.toBuffer.mockResolvedValue({ data: fakeData, info: { width: 50, height: 30 } });
    sharp.mockReturnValue(builder);

    const result = await ThumbHashGenerator.generate('/img.jpeg', 'image/jpeg');

    expect(rgbaToThumbHash).toHaveBeenCalledWith(50, 30, expect.any(Uint8Array));
    expect(result).toBe(Buffer.from(new Uint8Array([1, 2, 3, 4])).toString('base64'));
  });
});

// ── fromVideo / extractVideoFrame ─────────────────────────────────────────

describe('ThumbHashGenerator.generate (video path)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  it('seeks to 0.5s on first ffmpeg call and passes frame buffer to sharp', async () => {
    const ffmpegBuilder = makeFfmpegBuilder();
    ffmpeg.mockReturnValue(ffmpegBuilder);
    sharp.mockReturnValue(makeSharpBuilder());

    await ThumbHashGenerator.generate('/video.mp4', 'video/mp4');

    expect(ffmpegBuilder.seekInput).toHaveBeenCalledWith(0.5);
    expect(ffmpegBuilder.frames).toHaveBeenCalledWith(1);
    expect(ffmpegBuilder.outputFormat).toHaveBeenCalledWith('image2pipe');
    expect(sharp).toHaveBeenCalled();
  });

  it('falls back to seekInput(0) when first ffmpeg call fires an error', async () => {
    const fallbackBuilder = makeFfmpegBuilder();
    const firstBuilder = makeFfmpegBuilder({ triggerError: true });

    ffmpeg
      .mockReturnValueOnce(firstBuilder)
      .mockReturnValueOnce(fallbackBuilder);
    sharp.mockReturnValue(makeSharpBuilder());

    const result = await ThumbHashGenerator.generate('/video.mp4', 'video/mp4');

    expect(result).not.toBeNull();
    expect(ffmpeg).toHaveBeenCalledTimes(2);
    expect(fallbackBuilder.seekInput).toHaveBeenCalledWith(0);
  });

  it('returns null when the fallback ffmpeg call also fails (stream error)', async () => {
    const fallbackBuilder: any = {
      seekInput: jest.fn().mockReturnThis(),
      frames: jest.fn().mockReturnThis(),
      outputFormat: jest.fn().mockReturnThis(),
      outputOptions: jest.fn().mockReturnThis(),
      on: jest.fn().mockReturnThis(),
      pipe: jest.fn().mockImplementation((stream: any) => {
        setImmediate(() => stream.emit('error', new Error('fallback pipe error')));
      }),
    };
    const firstBuilder = makeFfmpegBuilder({ triggerError: true });

    ffmpeg
      .mockReturnValueOnce(firstBuilder)
      .mockReturnValueOnce(fallbackBuilder);
    sharp.mockReturnValue(makeSharpBuilder());

    const result = await ThumbHashGenerator.generate('/video.mp4', 'video/mp4');

    expect(result).toBeNull();
    expect((logger as any).warn).toHaveBeenCalled();
  });
});
