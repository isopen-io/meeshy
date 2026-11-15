/**
 * Unit tests for MetadataManager.extractVideoMetadata — dimensions (display
 * size under a rotation matrix), duration, fps, codec, read through ffprobe.
 *
 * @jest-environment node
 */

import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import type { FfprobeData, FfprobeStream } from 'fluent-ffmpeg';

const mockFfprobe = jest.fn() as jest.MockedFunction<any>;

jest.mock('sharp', () => jest.fn());
jest.mock('fluent-ffmpeg', () => ({
  ffprobe: mockFfprobe,
}));
jest.mock('pdf-parse', () => ({
  PDFParse: jest.fn(),
}));
jest.mock('../../../utils/logger-enhanced', () => ({
  enhancedLogger: {
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn()
    }))
  }
}));

import { MetadataManager } from '../../../services/attachments/MetadataManager';
import type { VideoMetadata } from '../../../services/attachments/MetadataManager';

describe('MetadataManager', () => {
  let metadataManager: MetadataManager;

  beforeEach(() => {
    jest.clearAllMocks();
    metadataManager = new MetadataManager('/test/uploads');
  });

  describe('extractVideoMetadata', () => {
    it('should extract video metadata with ffprobe', async () => {
      const mockFfprobeData: Partial<FfprobeData> = {
        streams: [
          {
            codec_type: 'video',
            codec_name: 'h264',
            width: 1920,
            height: 1080,
            r_frame_rate: '30/1',
          } as FfprobeStream,
        ],
        format: {
          duration: 120.5, // In seconds from frontend
          bit_rate: '5000000',
        } as any,
      };

      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, mockFfprobeData);
      });

      const result = await metadataManager.extractVideoMetadata('test/video.mp4');

      expect(mockFfprobe).toHaveBeenCalledWith(
        '/test/uploads/test/video.mp4',
        expect.any(Function)
      );
      expect(result).toEqual({
        duration: 120500, // Milliseconds (Math.round(120.5 * 1000)) (120.5 * 1000)
        width: 1920,
        height: 1080,
        fps: 30,
        videoCodec: 'h264',
        bitrate: 5000000,
      });
    });

    it('records a video filmed upright on a phone with its portrait display size', async () => {
      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, {
          streams: [{ index: 0, codec_type: 'video', width: 1920, height: 1080, side_data_list: [{ rotation: -90 }] } as FfprobeStream],
          format: {} as any,
        });
      });

      const result = await metadataManager.extractVideoMetadata('test/portrait.mp4');

      expect({ width: result.width, height: result.height }).toEqual({ width: 1080, height: 1920 });
    });

    it('should calculate fps from frame rate fraction', async () => {
      const mockFfprobeData: Partial<FfprobeData> = {
        streams: [
          {
            codec_type: 'video',
            r_frame_rate: '24000/1001', // 23.976 fps
          } as FfprobeStream,
        ],
        format: {} as any,
      };

      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, mockFfprobeData);
      });

      const result = await metadataManager.extractVideoMetadata('test/video.mp4');

      expect(result.fps).toBeCloseTo(23.98, 1);
    });

    it('should handle video without video stream', async () => {
      const mockFfprobeData: Partial<FfprobeData> = {
        streams: [
          {
            codec_type: 'audio', // No video stream
          } as FfprobeStream,
        ],
        format: {} as any,
      };

      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(null, mockFfprobeData);
      });

      const result = await metadataManager.extractVideoMetadata('test/audio-only.mp4');

      expect(result).toEqual({
        duration: 0,
        width: 0,
        height: 0,
        fps: 0,
        videoCodec: 'unknown',
        bitrate: 0,
      });
    });

    it('should handle ffprobe errors', async () => {
      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        callback(new Error('ffprobe error'));
      });

      await expect(
        metadataManager.extractVideoMetadata('test/corrupted.mp4')
      ).rejects.toThrow('ffprobe error');
    });

    it('should timeout after 30 seconds', async () => {
      jest.useFakeTimers();

      mockFfprobe.mockImplementation((path: string, callback: Function) => {
        // Never call callback - simulate hang
      });

      const promise = metadataManager.extractVideoMetadata('test/hanging.mp4');

      // Fast-forward time
      jest.advanceTimersByTime(30000);

      await expect(promise).rejects.toThrow('ffprobe timeout after 30 seconds');
      jest.useRealTimers();
    });

    it('should extract metadata from different video codecs', async () => {
      const codecs = ['h264', 'vp8', 'vp9', 'av1'];

      for (const codec of codecs) {
        const mockFfprobeData: Partial<FfprobeData> = {
          streams: [
            {
              codec_type: 'video',
              codec_name: codec,
              width: 1280,
              height: 720,
            } as FfprobeStream,
          ],
          format: {} as any,
        };

        mockFfprobe.mockImplementation((path: string, callback: Function) => {
          callback(null, mockFfprobeData);
        });

        const result = await metadataManager.extractVideoMetadata(`test/video.${codec}`);

        expect(result.videoCodec).toBe(codec);
      }
    });
  });
});
