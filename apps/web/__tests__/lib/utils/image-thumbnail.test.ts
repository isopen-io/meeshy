/**
 * Tests for lib/utils/image-thumbnail.ts
 */

import { createImageThumbnail, createThumbnailsBatch, isLowEndDevice } from '@/lib/utils/image-thumbnail';

// ─── Canvas / FileReader / Image mocks ───────────────────────────────────────

const mockDrawImage = jest.fn();
const mockToBlob = jest.fn();
const mockGetContext = jest.fn();

const mockCanvas = {
  width: 0,
  height: 0,
  getContext: mockGetContext,
  toBlob: mockToBlob,
};

const mockCreateObjectURL = jest.fn(() => 'blob:mock-url');

beforeEach(() => {
  jest.clearAllMocks();

  // Canvas mock
  mockGetContext.mockReturnValue({
    drawImage: mockDrawImage,
    imageSmoothingEnabled: false,
    imageSmoothingQuality: 'high',
  });
  jest.spyOn(document, 'createElement').mockImplementation((tag) => {
    if (tag === 'canvas') return mockCanvas as unknown as HTMLCanvasElement;
    return document.createElement(tag);
  });

  // URL.createObjectURL mock
  global.URL.createObjectURL = mockCreateObjectURL;

  // Default: toBlob succeeds with a Blob
  mockToBlob.mockImplementation((cb: (b: Blob | null) => void) => {
    cb(new Blob(['data'], { type: 'image/jpeg' }));
  });
});

afterEach(() => {
  jest.restoreAllMocks();
});

function makeFile(name = 'test.jpg', type = 'image/jpeg', size = 1024): File {
  return new File(['x'.repeat(size)], name, { type });
}

// Helper that creates a FileReader mock calling onload with a given result
function mockFileReader(result: string, { fail = false } = {}) {
  const mockReader: Partial<FileReader> = {
    readAsDataURL: jest.fn(function (this: typeof mockReader) {
      if (fail) {
        const errorEvent = { target: this } as ProgressEvent<FileReader>;
        (this.onerror as ((e: ProgressEvent<FileReader>) => void))?.(errorEvent);
      } else {
        const loadEvent = { target: { result } } as ProgressEvent<FileReader>;
        (this.onload as ((e: ProgressEvent<FileReader>) => void))?.(loadEvent);
      }
    }),
  };
  jest.spyOn(global, 'FileReader').mockImplementation(() => mockReader as FileReader);
  return mockReader;
}

// Helper that creates an Image mock that calls onload
function mockImage(width: number, height: number, { fail = false } = {}) {
  const imgMock: Partial<HTMLImageElement> & { onload?: () => void; onerror?: () => void; src?: string } = {
    width,
    height,
  };
  const ImageMock = jest.fn().mockImplementation(() => {
    return new Proxy(imgMock, {
      set(target, prop, value) {
        (target as Record<string, unknown>)[prop as string] = value;
        if (prop === 'src') {
          if (fail) {
            setTimeout(() => target.onerror?.(), 0);
          } else {
            setTimeout(() => target.onload?.(), 0);
          }
        }
        return true;
      },
    });
  });
  global.Image = ImageMock as unknown as typeof Image;
}

// ─── createImageThumbnail ─────────────────────────────────────────────────────

describe('createImageThumbnail', () => {
  it('rejects when FileReader fails', async () => {
    mockFileReader('', { fail: true });
    const file = makeFile();
    await expect(createImageThumbnail(file)).rejects.toThrow('Échec de lecture');
  });

  it('rejects when Image fails to load', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(100, 100, { fail: true });
    const file = makeFile();
    await expect(createImageThumbnail(file)).rejects.toThrow('Échec de chargement');
  });

  it('rejects when canvas context is null', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(50, 50);
    mockGetContext.mockReturnValue(null);
    const file = makeFile();
    await expect(createImageThumbnail(file)).rejects.toThrow('contexte canvas');
  });

  it('rejects when toBlob returns null', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(50, 50);
    mockToBlob.mockImplementation((cb: (b: Blob | null) => void) => cb(null));
    const file = makeFile();
    await expect(createImageThumbnail(file)).rejects.toThrow('blob');
  });

  it('resolves with a blob URL for a square image within bounds', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(80, 80);
    const file = makeFile();
    const result = await createImageThumbnail(file);
    expect(result).toBe('blob:mock-url');
    expect(mockDrawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 80, 80);
  });

  it('scales down a wide image to maxWidth', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(240, 120); // 2:1 aspect ratio, wider than 120 default
    const file = makeFile();
    await createImageThumbnail(file, { maxWidth: 120, maxHeight: 120 });
    // width capped at 120, height = round(120 * 120 / 240) = 60
    expect(mockDrawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 120, 60);
  });

  it('scales down a tall image to maxHeight', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(60, 240); // taller than wide
    const file = makeFile();
    await createImageThumbnail(file, { maxWidth: 120, maxHeight: 120 });
    // height capped at 120, width = round(60 * 120 / 240) = 30
    expect(mockDrawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 30, 120);
  });

  it('does not scale when image is within bounds', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(100, 80);
    const file = makeFile();
    await createImageThumbnail(file, { maxWidth: 120, maxHeight: 120 });
    expect(mockDrawImage).toHaveBeenCalledWith(expect.anything(), 0, 0, 100, 80);
  });

  it('accepts custom quality option', async () => {
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(50, 50);
    let capturedQuality: number | undefined;
    mockToBlob.mockImplementation((cb: (b: Blob | null) => void, _type: string, q: number) => {
      capturedQuality = q;
      cb(new Blob(['data']));
    });
    const file = makeFile();
    await createImageThumbnail(file, { quality: 0.9 });
    expect(capturedQuality).toBe(0.9);
  });
});

// ─── createThumbnailsBatch ────────────────────────────────────────────────────

describe('createThumbnailsBatch', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    mockFileReader('data:image/jpeg;base64,/9j/');
    mockImage(50, 50);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns empty map for empty file list', async () => {
    const result = await createThumbnailsBatch([]);
    expect(result.size).toBe(0);
  });

  it('skips non-image files', async () => {
    const file = makeFile('doc.pdf', 'application/pdf');
    const result = await createThumbnailsBatch([file]);
    expect(result.size).toBe(0);
  });

  it('processes image files and returns thumbnails', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg');
    const resultPromise = createThumbnailsBatch([file]);
    // Advance timers to allow Image onload to fire
    jest.runAllTimers();
    const result = await resultPromise;
    expect(result.size).toBe(1);
    expect([...result.values()][0]).toBe('blob:mock-url');
  });

  it('maps file key correctly (name-size-lastModified)', async () => {
    const file = makeFile('photo.jpg', 'image/jpeg', 512);
    const expectedKey = `photo.jpg-512-${file.lastModified}`;
    const resultPromise = createThumbnailsBatch([file]);
    jest.runAllTimers();
    const result = await resultPromise;
    expect(result.has(expectedKey)).toBe(true);
  });
});

// ─── isLowEndDevice ───────────────────────────────────────────────────────────

describe('isLowEndDevice', () => {
  const savedNavigator = { ...navigator };

  afterEach(() => {
    // Restore navigator properties
    Object.defineProperty(navigator, 'hardwareConcurrency', {
      value: savedNavigator.hardwareConcurrency,
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'userAgent', {
      value: savedNavigator.userAgent,
      configurable: true,
      writable: true,
    });
  });

  it('returns true when deviceMemory < 4', () => {
    Object.defineProperty(navigator, 'deviceMemory', { value: 2, configurable: true, writable: true });
    expect(isLowEndDevice()).toBe(true);
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true, writable: true });
  });

  it('returns true when hardwareConcurrency < 4', () => {
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 2, configurable: true, writable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true, writable: true });
    expect(isLowEndDevice()).toBe(true);
  });

  it('returns true for Android user agent', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (Linux; Android 10; SM-G975U) AppleWebKit/537.36',
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 8, configurable: true, writable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true, writable: true });
    expect(isLowEndDevice()).toBe(true);
  });

  it('returns false on a high-end desktop', () => {
    Object.defineProperty(navigator, 'userAgent', {
      value: 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36',
      configurable: true,
      writable: true,
    });
    Object.defineProperty(navigator, 'hardwareConcurrency', { value: 16, configurable: true, writable: true });
    Object.defineProperty(navigator, 'deviceMemory', { value: undefined, configurable: true, writable: true });
    expect(isLowEndDevice()).toBe(false);
  });
});
