/**
 * Unit tests for ImageProcessingService.
 * Verifies processAvatar and processBanner call sharp with the correct
 * resize / jpeg options and return the buffer produced by sharp.
 *
 * @jest-environment node
 */

import { describe, it, expect, jest, beforeEach } from '@jest/globals';

const MOCKED_BUFFER = Buffer.from('mocked-image-bytes');

const sharpChain = {
  resize: jest.fn<any>().mockReturnThis(),
  jpeg: jest.fn<any>().mockReturnThis(),
  toBuffer: jest.fn<any>().mockResolvedValue(MOCKED_BUFFER),
};

jest.mock('sharp', () => jest.fn<any>().mockReturnValue(sharpChain));

import sharp from 'sharp';
import { processAvatar, processBanner } from '../../../services/image/ImageProcessingService';

beforeEach(() => {
  jest.clearAllMocks();
  sharpChain.resize.mockReturnValue(sharpChain);
  sharpChain.jpeg.mockReturnValue(sharpChain);
  sharpChain.toBuffer.mockResolvedValue(MOCKED_BUFFER);
});

// ─── processAvatar ────────────────────────────────────────────────────────────

describe('processAvatar', () => {
  it('creates a sharp instance from the supplied buffer', async () => {
    const input = Buffer.from('avatar-input');
    await processAvatar(input);

    expect(sharp).toHaveBeenCalledWith(input);
  });

  it('resizes to 512×512 with cover fit', async () => {
    await processAvatar(Buffer.from('x'));

    expect(sharpChain.resize).toHaveBeenCalledWith(512, 512, { fit: 'cover' });
  });

  it('encodes as JPEG quality 80 progressive', async () => {
    await processAvatar(Buffer.from('x'));

    expect(sharpChain.jpeg).toHaveBeenCalledWith({ quality: 80, progressive: true });
  });

  it('returns the buffer produced by sharp', async () => {
    const result = await processAvatar(Buffer.from('x'));

    expect(result).toBe(MOCKED_BUFFER);
  });
});

// ─── processBanner ────────────────────────────────────────────────────────────

describe('processBanner', () => {
  it('creates a sharp instance from the supplied buffer', async () => {
    const input = Buffer.from('banner-input');
    await processBanner(input);

    expect(sharp).toHaveBeenCalledWith(input);
  });

  it('resizes to 1200×400 with cover fit', async () => {
    await processBanner(Buffer.from('x'));

    expect(sharpChain.resize).toHaveBeenCalledWith(1200, 400, { fit: 'cover' });
  });

  it('encodes as JPEG quality 80 progressive', async () => {
    await processBanner(Buffer.from('x'));

    expect(sharpChain.jpeg).toHaveBeenCalledWith({ quality: 80, progressive: true });
  });

  it('returns the buffer produced by sharp', async () => {
    const result = await processBanner(Buffer.from('x'));

    expect(result).toBe(MOCKED_BUFFER);
  });
});
