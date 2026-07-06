import { processAvatar, processBanner } from '../../../services/image/ImageProcessingService';

// Mock sharp to avoid native binary dependency
jest.mock('sharp', () => {
  const mockInstance = {
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('processed-image-data')),
  };
  return jest.fn(() => mockInstance);
});

import sharp from 'sharp';

describe('ImageProcessingService', () => {
  const mockSharpInstance = (sharp as jest.MockedFunction<any>)();

  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('processAvatar', () => {
    it('processes buffer into a square JPEG avatar', async () => {
      const input = Buffer.from('fake-image-data');
      const result = await processAvatar(input);

      expect(sharp).toHaveBeenCalledWith(input);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(512, 512, { fit: 'cover' });
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80, progressive: true });
      expect(result).toEqual(Buffer.from('processed-image-data'));
    });

    it('returns the buffer from sharp.toBuffer()', async () => {
      const expected = Buffer.from('avatar-output');
      mockSharpInstance.toBuffer.mockResolvedValueOnce(expected);

      const result = await processAvatar(Buffer.from('input'));
      expect(result).toEqual(expected);
    });
  });

  describe('processBanner', () => {
    it('processes buffer into a banner-sized JPEG', async () => {
      const input = Buffer.from('fake-banner-data');
      const result = await processBanner(input);

      expect(sharp).toHaveBeenCalledWith(input);
      expect(mockSharpInstance.resize).toHaveBeenCalledWith(1200, 400, { fit: 'cover' });
      expect(mockSharpInstance.jpeg).toHaveBeenCalledWith({ quality: 80, progressive: true });
      expect(result).toEqual(Buffer.from('processed-image-data'));
    });

    it('returns the buffer from sharp.toBuffer()', async () => {
      const expected = Buffer.from('banner-output');
      mockSharpInstance.toBuffer.mockResolvedValueOnce(expected);

      const result = await processBanner(Buffer.from('input'));
      expect(result).toEqual(expected);
    });
  });
});
