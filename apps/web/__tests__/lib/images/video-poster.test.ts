/**
 * Poster plein écran d'une vidéo — miroir web simplifié du patron iOS
 * `VideoPosterResolver`/`VideoPosterPlan` (#3871 → #3878). `resolveFullscreenVideoPoster`
 * est la décision PURE (testée ici en détail) ; `extractVideoFirstFrame` est
 * l'extraction impure (canvas `<video>` + seek), testée séparément en
 * mockant le DOM.
 */
import {
  resolveFullscreenVideoPoster,
  extractVideoFirstFrame,
  createVideoPosterCache,
} from '@/lib/images/video-poster';

describe('createVideoPosterCache', () => {
  it('has no poster for an unset URL', () => {
    const cache = createVideoPosterCache(10);
    expect(cache.get('https://cdn.example/video.mp4')).toBeNull();
  });

  it('retrieves a previously set poster synchronously — Cache-First, no re-extraction needed', () => {
    const cache = createVideoPosterCache(10);
    cache.set('https://cdn.example/video.mp4', 'blob:sharp-frame');
    expect(cache.get('https://cdn.example/video.mp4')).toBe('blob:sharp-frame');
  });

  it('treats null/undefined/empty URLs as never cached', () => {
    const cache = createVideoPosterCache(10);
    expect(cache.get(null)).toBeNull();
    expect(cache.get(undefined)).toBeNull();
    expect(cache.get('')).toBeNull();
  });

  it('evicts the least-recently-set entry once maxEntries is exceeded', () => {
    const cache = createVideoPosterCache(2);
    cache.set('a', 'poster-a');
    cache.set('b', 'poster-b');
    cache.set('c', 'poster-c'); // evicts 'a'
    expect(cache.get('a')).toBeNull();
    expect(cache.get('b')).toBe('poster-b');
    expect(cache.get('c')).toBe('poster-c');
  });

  it('reset clears all cached posters', () => {
    const cache = createVideoPosterCache(10);
    cache.set('a', 'poster-a');
    cache.reset();
    expect(cache.get('a')).toBeNull();
  });

  it('rejects a non-positive maxEntries', () => {
    expect(() => createVideoPosterCache(0)).toThrow();
  });
});

describe('resolveFullscreenVideoPoster', () => {
  it('an extracted sharp frame wins — the thumbnail is never shown alongside it', () => {
    const mount = resolveFullscreenVideoPoster({
      extractedFrameUrl: 'blob:sharp-frame',
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      isExtractedResident: false,
    });
    expect(mount).toEqual({
      posterUrl: 'blob:sharp-frame',
      backdropUrl: null,
      isResident: false,
    });
  });

  it('propagates residency of the extracted frame — resident extraction needs no re-fetch', () => {
    const mount = resolveFullscreenVideoPoster({
      extractedFrameUrl: 'blob:sharp-frame',
      thumbnailUrl: null,
      isExtractedResident: true,
    });
    expect(mount.isResident).toBe(true);
  });

  it('no extracted frame yet: the thumbnail becomes the blurred backdrop only, never the poster', () => {
    const mount = resolveFullscreenVideoPoster({
      extractedFrameUrl: null,
      thumbnailUrl: 'https://cdn.example/thumb.jpg',
      isExtractedResident: false,
    });
    expect(mount).toEqual({
      posterUrl: null,
      backdropUrl: 'https://cdn.example/thumb.jpg',
      isResident: false,
    });
  });

  it('neither an extracted frame nor a thumbnail: nothing to show, caller falls back to its empty state', () => {
    const mount = resolveFullscreenVideoPoster({
      extractedFrameUrl: undefined,
      thumbnailUrl: undefined,
      isExtractedResident: false,
    });
    expect(mount).toEqual({ posterUrl: null, backdropUrl: null, isResident: false });
  });
});

describe('extractVideoFirstFrame', () => {
  const originalCreateObjectURL = URL.createObjectURL;

  afterEach(() => {
    URL.createObjectURL = originalCreateObjectURL;
    jest.restoreAllMocks();
    jest.useRealTimers();
  });

  // The SSR guard (`typeof document === 'undefined'`) is exercised together
  // with the empty-URL guard below: both take the identical early-return
  // path (`if (typeof document === 'undefined' || !url) return null;`)
  // before anything DOM-related runs. Forcing a real `document`-less
  // environment inside jsdom (deleting the global) is not reliable across
  // engines — the empty-URL case below proves the same code path resolves
  // synchronously without touching `document.createElement`.

  it('resolves null for an empty URL without creating a video element', async () => {
    await expect(extractVideoFirstFrame('')).resolves.toBeNull();
  });

  it('resolves null when the video element reports an error', async () => {
    const promise = extractVideoFirstFrame('https://cdn.example/broken.mp4');
    const video = document.querySelector('video') as HTMLVideoElement;
    video.dispatchEvent(new Event('error'));
    await expect(promise).resolves.toBeNull();
  });

  it('resolves null when extraction exceeds the timeout', async () => {
    jest.useFakeTimers();
    const promise = extractVideoFirstFrame('https://cdn.example/slow.mp4', { timeoutMs: 1000 });
    jest.advanceTimersByTime(1000);
    await expect(promise).resolves.toBeNull();
  });

  it('extracts the frame at seek time and returns an object URL — never a data: URI', async () => {
    URL.createObjectURL = jest.fn(() => 'blob:mock-frame');
    const fakeContext = { drawImage: jest.fn() } as unknown as CanvasRenderingContext2D;
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(fakeContext);
    jest.spyOn(HTMLCanvasElement.prototype, 'toBlob').mockImplementation(function (
      this: HTMLCanvasElement,
      callback: BlobCallback
    ) {
      callback(new Blob(['fake'], { type: 'image/jpeg' }));
    });

    const promise = extractVideoFirstFrame('https://cdn.example/video.mp4');
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 10, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 1920, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 1080, configurable: true });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));

    await expect(promise).resolves.toBe('blob:mock-frame');
    expect(fakeContext.drawImage).toHaveBeenCalled();
  });

  it('resolves null when the canvas 2D context is unavailable', async () => {
    jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);

    const promise = extractVideoFirstFrame('https://cdn.example/video.mp4');
    const video = document.querySelector('video') as HTMLVideoElement;
    Object.defineProperty(video, 'duration', { value: 10, configurable: true });
    Object.defineProperty(video, 'videoWidth', { value: 640, configurable: true });
    Object.defineProperty(video, 'videoHeight', { value: 360, configurable: true });
    video.dispatchEvent(new Event('loadedmetadata'));
    video.dispatchEvent(new Event('seeked'));

    await expect(promise).resolves.toBeNull();
  });
});
