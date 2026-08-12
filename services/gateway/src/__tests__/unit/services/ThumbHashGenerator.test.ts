/**
 * Unit tests for ThumbHashGenerator.
 * Covers: generate() with image, video, non-visual mime types,
 * correct sharp pipeline options, and error → null fallback.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

// ─── Module mocks ─────────────────────────────────────────────────────────────

jest.mock('thumbhash', () => ({
  rgbaToThumbHash: jest.fn<any>().mockReturnValue(new Uint8Array([1, 2, 3, 4])),
}));

// We declare the chain outside so we can inspect calls per test.
let sharpChain: {
  resize: jest.Mock<any>;
  ensureAlpha: jest.Mock<any>;
  raw: jest.Mock<any>;
  toBuffer: jest.Mock<any>;
};

jest.mock('sharp', () => {
  sharpChain = {
    resize: jest.fn<any>().mockReturnThis(),
    ensureAlpha: jest.fn<any>().mockReturnThis(),
    raw: jest.fn<any>().mockReturnThis(),
    toBuffer: jest.fn<any>().mockResolvedValue({
      data: Buffer.from([0, 0, 0, 255]),
      info: { width: 1, height: 1, channels: 4 },
    }),
  };
  return jest.fn<any>().mockReturnValue(sharpChain);
});

// ffmpeg mock: when .pipe(stream) is called it synchronously writes fake
// PNG data and ends the stream so extractVideoFrame resolves.
let ffmpegChain: {
  seekInput: jest.Mock<any>;
  frames: jest.Mock<any>;
  outputFormat: jest.Mock<any>;
  outputOptions: jest.Mock<any>;
  on: jest.Mock<any>;
  pipe: jest.Mock<any>;
};
let capturedErrorHandler: (() => void) | undefined;

jest.mock('fluent-ffmpeg', () => {
  ffmpegChain = {
    seekInput: jest.fn<any>().mockReturnThis(),
    frames: jest.fn<any>().mockReturnThis(),
    outputFormat: jest.fn<any>().mockReturnThis(),
    outputOptions: jest.fn<any>().mockReturnThis(),
    on: jest.fn<any>().mockImplementation(function (event: string, fn: () => void) {
      if (event === 'error') capturedErrorHandler = fn;
      return ffmpegChain;
    }),
    pipe: jest.fn<any>().mockImplementation((stream: any) => {
      process.nextTick(() => {
        stream.write(Buffer.from('FAKEPNGFRAME'));
        stream.end();
      });
      return stream;
    }),
  };
  return jest.fn<any>().mockReturnValue(ffmpegChain);
});

import { ThumbHashGenerator } from '../../../services/attachments/ThumbHashGenerator';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function resetSharpChain() {
  sharpChain.resize.mockClear();
  sharpChain.ensureAlpha.mockClear();
  sharpChain.raw.mockClear();
  sharpChain.toBuffer.mockClear().mockResolvedValue({
    data: Buffer.from([0, 0, 0, 255]),
    info: { width: 1, height: 1, channels: 4 },
  });
}

beforeEach(() => {
  resetSharpChain();
  capturedErrorHandler = undefined;
  ffmpegChain.seekInput.mockClear();
  ffmpegChain.frames.mockClear();
  ffmpegChain.outputFormat.mockClear();
  ffmpegChain.outputOptions.mockClear();
  ffmpegChain.on.mockClear();
  ffmpegChain.pipe.mockClear();
});

// ─── generate() ───────────────────────────────────────────────────────────────

describe('ThumbHashGenerator.generate', () => {
  it('returns a base64 string for an image mime type', async () => {
    const result = await ThumbHashGenerator.generate('/tmp/photo.jpg', 'image/jpeg');

    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
    // base64 of [1,2,3,4] is "AQIDBA=="
    expect(result).toBe(Buffer.from([1, 2, 3, 4]).toString('base64'));
  });

  it('returns a base64 string for a video mime type', async () => {
    const result = await ThumbHashGenerator.generate('/tmp/clip.mp4', 'video/mp4');

    expect(typeof result).toBe('string');
    expect(result!.length).toBeGreaterThan(0);
  });

  it('returns null for a non-visual mime type (audio)', async () => {
    const result = await ThumbHashGenerator.generate('/tmp/audio.mp3', 'audio/mpeg');

    expect(result).toBeNull();
  });

  it('returns null for a non-visual mime type (PDF)', async () => {
    const result = await ThumbHashGenerator.generate('/tmp/doc.pdf', 'application/pdf');

    expect(result).toBeNull();
  });

  it('returns null when sharp throws (error caught gracefully)', async () => {
    sharpChain.toBuffer.mockRejectedValue(new Error('sharp failure'));

    const result = await ThumbHashGenerator.generate('/tmp/bad.jpg', 'image/png');

    expect(result).toBeNull();
  });
});

// ─── Image pipeline options ───────────────────────────────────────────────────

describe('image pipeline', () => {
  it('resizes to 100×100 with fit:inside', async () => {
    await ThumbHashGenerator.generate('/tmp/photo.png', 'image/png');

    expect(sharpChain.resize).toHaveBeenCalledWith(100, 100, { fit: 'inside' });
  });

  it('calls ensureAlpha() to guarantee RGBA output', async () => {
    await ThumbHashGenerator.generate('/tmp/photo.webp', 'image/webp');

    expect(sharpChain.ensureAlpha).toHaveBeenCalledTimes(1);
  });

  it('calls raw() to get raw pixel data', async () => {
    await ThumbHashGenerator.generate('/tmp/photo.gif', 'image/gif');

    expect(sharpChain.raw).toHaveBeenCalledTimes(1);
  });
});

// ─── Video pipeline options ───────────────────────────────────────────────────

describe('video pipeline', () => {
  it('seeks to 0.5s to skip black intro frames', async () => {
    await ThumbHashGenerator.generate('/tmp/video.mp4', 'video/mp4');

    expect(ffmpegChain.seekInput).toHaveBeenCalledWith(0.5);
  });

  it('extracts exactly 1 frame', async () => {
    await ThumbHashGenerator.generate('/tmp/video.webm', 'video/webm');

    expect(ffmpegChain.frames).toHaveBeenCalledWith(1);
  });

  it('outputs in image2pipe format with PNG codec', async () => {
    await ThumbHashGenerator.generate('/tmp/video.mov', 'video/quicktime');

    expect(ffmpegChain.outputFormat).toHaveBeenCalledWith('image2pipe');
    expect(ffmpegChain.outputOptions).toHaveBeenCalledWith('-vcodec', 'png');
  });

  it('passes the extracted frame buffer through the sharp pipeline', async () => {
    const sharp = require('sharp');
    await ThumbHashGenerator.generate('/tmp/video.mp4', 'video/mp4');

    // The second sharp() call receives a Buffer (the extracted frame),
    // not a file path.
    const calls: any[] = sharp.mock.calls;
    const videoCall = calls.find((c: any[]) => Buffer.isBuffer(c[0]));
    expect(videoCall).toBeDefined();
  });

  it('falls back to seekInput(0) when the primary seek fails', async () => {
    // Arrange: first .pipe() triggers the error handler instead of writing data.
    let pipeCallCount = 0;
    ffmpegChain.pipe.mockImplementation((stream: any) => {
      pipeCallCount += 1;
      if (pipeCallCount === 1) {
        // Simulate ffmpeg error on the first attempt.
        process.nextTick(() => {
          if (capturedErrorHandler) capturedErrorHandler();
        });
      } else {
        // Fallback attempt writes the data normally.
        process.nextTick(() => {
          stream.write(Buffer.from('FALLBACKFRAME'));
          stream.end();
        });
      }
      return stream;
    });

    const result = await ThumbHashGenerator.generate('/tmp/bad-seek.mp4', 'video/mp4');

    // The fallback seek-0 call should have been made.
    const seekCalls = ffmpegChain.seekInput.mock.calls.map((c: any[]) => c[0]);
    expect(seekCalls).toContain(0);
    // Should still resolve to a base64 hash.
    expect(typeof result).toBe('string');
  });
});
