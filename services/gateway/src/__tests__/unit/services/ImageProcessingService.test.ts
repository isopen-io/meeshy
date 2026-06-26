/**
 * Unit tests for services/image/ImageProcessingService.ts
 * Covers: processAvatar, processBanner
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

jest.mock('sharp', () => jest.fn());

import _sharp from 'sharp';
import { processAvatar, processBanner } from '../../../services/image/ImageProcessingService';

const sharp = _sharp as unknown as jest.Mock;

function makeSharpBuilder(outputBuffer = Buffer.from('result')) {
  const builder: any = {
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn<any>().mockResolvedValue(outputBuffer),
  };
  return builder;
}

describe('ImageProcessingService', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processAvatar()', () => {
    it('resizes to 512x512 cover and returns JPEG buffer', async () => {
      const builder = makeSharpBuilder();
      sharp.mockReturnValue(builder);

      const input = Buffer.from('fake-image');
      const result = await processAvatar(input);

      expect(sharp).toHaveBeenCalledWith(input);
      expect(builder.resize).toHaveBeenCalledWith(512, 512, { fit: 'cover' });
      expect(builder.jpeg).toHaveBeenCalledWith({ quality: 80, progressive: true });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('passes through the buffer from sharp.toBuffer()', async () => {
      const expected = Buffer.from('avatar-output');
      const builder = makeSharpBuilder(expected);
      sharp.mockReturnValue(builder);

      const result = await processAvatar(Buffer.from('input'));
      expect(result).toBe(expected);
    });
  });

  describe('processBanner()', () => {
    it('resizes to 1200x400 cover and returns JPEG buffer', async () => {
      const builder = makeSharpBuilder();
      sharp.mockReturnValue(builder);

      const input = Buffer.from('banner-image');
      const result = await processBanner(input);

      expect(sharp).toHaveBeenCalledWith(input);
      expect(builder.resize).toHaveBeenCalledWith(1200, 400, { fit: 'cover' });
      expect(builder.jpeg).toHaveBeenCalledWith({ quality: 80, progressive: true });
      expect(result).toBeInstanceOf(Buffer);
    });

    it('passes through the buffer from sharp.toBuffer()', async () => {
      const expected = Buffer.from('banner-output');
      const builder = makeSharpBuilder(expected);
      sharp.mockReturnValue(builder);

      const result = await processBanner(Buffer.from('input'));
      expect(result).toBe(expected);
    });
  });
});
