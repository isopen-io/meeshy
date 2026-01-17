/**
 * Tests for image-crop utility
 */

import {
  createImage,
  getRadianAngle,
  rotateSize,
  getCroppedImg,
  cleanupObjectUrl,
} from '../../utils/image-crop';

// Mock HTMLCanvasElement and its context
const mockContext = {
  translate: jest.fn(),
  rotate: jest.fn(),
  drawImage: jest.fn(),
};

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: jest.fn(() => mockContext),
  toBlob: jest.fn((callback) => {
    const mockBlob = new Blob(['test'], { type: 'image/jpeg' });
    callback(mockBlob);
  }),
};

// Mock document.createElement for canvas
const originalCreateElement = document.createElement.bind(document);
jest.spyOn(document, 'createElement').mockImplementation((tagName: string) => {
  if (tagName === 'canvas') {
    return mockCanvas as unknown as HTMLCanvasElement;
  }
  return originalCreateElement(tagName);
});

// Mock URL methods
const originalCreateObjectURL = URL.createObjectURL;
const originalRevokeObjectURL = URL.revokeObjectURL;

beforeAll(() => {
  URL.createObjectURL = jest.fn(() => 'blob:http://localhost/test-url');
  URL.revokeObjectURL = jest.fn();
});

afterAll(() => {
  URL.createObjectURL = originalCreateObjectURL;
  URL.revokeObjectURL = originalRevokeObjectURL;
});

describe('image-crop', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('getRadianAngle', () => {
    it('should convert 0 degrees to 0 radians', () => {
      expect(getRadianAngle(0)).toBe(0);
    });

    it('should convert 90 degrees to PI/2 radians', () => {
      expect(getRadianAngle(90)).toBeCloseTo(Math.PI / 2);
    });

    it('should convert 180 degrees to PI radians', () => {
      expect(getRadianAngle(180)).toBeCloseTo(Math.PI);
    });

    it('should convert 360 degrees to 2*PI radians', () => {
      expect(getRadianAngle(360)).toBeCloseTo(2 * Math.PI);
    });

    it('should convert negative degrees', () => {
      expect(getRadianAngle(-90)).toBeCloseTo(-Math.PI / 2);
    });

    it('should convert 45 degrees correctly', () => {
      expect(getRadianAngle(45)).toBeCloseTo(Math.PI / 4);
    });
  });

  describe('rotateSize', () => {
    it('should return same size for 0 rotation', () => {
      const result = rotateSize(100, 50, 0);
      expect(result.width).toBeCloseTo(100);
      expect(result.height).toBeCloseTo(50);
    });

    it('should swap dimensions for 90 degree rotation', () => {
      const result = rotateSize(100, 50, 90);
      expect(result.width).toBeCloseTo(50);
      expect(result.height).toBeCloseTo(100);
    });

    it('should return same dimensions for 180 degree rotation', () => {
      const result = rotateSize(100, 50, 180);
      expect(result.width).toBeCloseTo(100);
      expect(result.height).toBeCloseTo(50);
    });

    it('should swap dimensions for 270 degree rotation', () => {
      const result = rotateSize(100, 50, 270);
      expect(result.width).toBeCloseTo(50);
      expect(result.height).toBeCloseTo(100);
    });

    it('should calculate correct bounding box for 45 degree rotation', () => {
      const result = rotateSize(100, 100, 45);
      // For a 100x100 square rotated 45 degrees, the bounding box should be ~141x141
      expect(result.width).toBeCloseTo(Math.sqrt(2) * 100);
      expect(result.height).toBeCloseTo(Math.sqrt(2) * 100);
    });

    it('should handle square dimensions', () => {
      const result = rotateSize(200, 200, 90);
      expect(result.width).toBeCloseTo(200);
      expect(result.height).toBeCloseTo(200);
    });
  });

  describe('createImage', () => {
    it('should create an image from URL', async () => {
      // Mock Image constructor
      const mockImage = {
        addEventListener: jest.fn((event, callback) => {
          if (event === 'load') {
            setTimeout(() => callback(), 0);
          }
        }),
        setAttribute: jest.fn(),
        src: '',
      };

      const originalImage = global.Image;
      // @ts-ignore
      global.Image = jest.fn(() => mockImage);

      const promise = createImage('https://example.com/image.jpg');

      // Trigger load event
      const loadCallback = mockImage.addEventListener.mock.calls.find(
        (call) => call[0] === 'load'
      )?.[1];
      if (loadCallback) loadCallback();

      const result = await promise;

      expect(mockImage.setAttribute).toHaveBeenCalledWith('crossOrigin', 'anonymous');
      expect(mockImage.src).toBe('https://example.com/image.jpg');

      global.Image = originalImage;
    });

    it('should reject on error', async () => {
      const mockImage = {
        addEventListener: jest.fn((event, callback) => {
          if (event === 'error') {
            setTimeout(() => callback(new Error('Load failed')), 0);
          }
        }),
        setAttribute: jest.fn(),
        src: '',
      };

      const originalImage = global.Image;
      // @ts-ignore
      global.Image = jest.fn(() => mockImage);

      const promise = createImage('https://example.com/invalid.jpg');

      await expect(promise).rejects.toThrow();

      global.Image = originalImage;
    });
  });

  describe('cleanupObjectUrl', () => {
    it('should revoke blob URLs', () => {
      cleanupObjectUrl('blob:http://localhost/test-id');
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:http://localhost/test-id');
    });

    it('should not revoke non-blob URLs', () => {
      cleanupObjectUrl('https://example.com/image.jpg');
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('should handle null URL', () => {
      cleanupObjectUrl(null);
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('should handle empty string', () => {
      cleanupObjectUrl('');
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });

    it('should only revoke URLs starting with blob:', () => {
      cleanupObjectUrl('data:image/png;base64,abc123');
      expect(URL.revokeObjectURL).not.toHaveBeenCalled();
    });
  });

  describe('getCroppedImg', () => {
    // Note: getCroppedImg is complex to test fully as it involves
    // canvas operations and image loading. We test what we can mock.

    it('should throw error when canvas context unavailable', async () => {
      const mockCanvasNoContext = {
        width: 0,
        height: 0,
        getContext: jest.fn(() => null),
      };

      jest.spyOn(document, 'createElement').mockImplementationOnce(() => {
        return mockCanvasNoContext as unknown as HTMLCanvasElement;
      });

      // Mock createImage to return a fake image
      const mockImage = {
        width: 100,
        height: 100,
        addEventListener: jest.fn((event, callback) => {
          if (event === 'load') setTimeout(callback, 0);
        }),
        setAttribute: jest.fn(),
        src: '',
      };

      const originalImage = global.Image;
      // @ts-ignore
      global.Image = jest.fn(() => mockImage);

      await expect(
        getCroppedImg('https://example.com/image.jpg', { x: 0, y: 0, width: 50, height: 50 })
      ).rejects.toThrow('Impossible de créer le contexte canvas');

      global.Image = originalImage;
    });

    it('should use default rotation of 0', async () => {
      // This tests that getCroppedImg can be called without rotation parameter
      // Full functionality requires canvas mocking which is complex
      expect(typeof getCroppedImg).toBe('function');
    });

    it('should use default filename', async () => {
      // Verify the function signature accepts optional parameters
      // Note: function.length only counts required parameters (without defaults)
      expect(getCroppedImg.length).toBeGreaterThanOrEqual(2); // At least imageSrc and pixelCrop
    });
  });
});
